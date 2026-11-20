import { Itinerary } from '../models/Itinerary.js';
import { RouteSegment } from '../models/RouteSegment.js';
import { Location } from '../models/Location.js';
import { TransportMode } from '../models/TransportMode.js';
import { CONFIG } from '../config.js';
import { HK_MTR_STATIONS, HK_MTR_LINE_EDGES, HK_KMB_ROUTES_DATA } from '../data/hkStations.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

/**
 * 動態多模式最短時間規劃引擎（結合真實香港地理與人類出行合理性約束）
 * - 提供多種組合（如港鐵 + 專線小巴、港鐵 + 九巴、巴士／小巴接駁、港鐵 + 步行）
 * - 步行距離過遠或跨山路（例如坑口站至科大南閘）的「港鐵 + 步行」會標記為不建議（拒絕推薦）但仍會顯示
 * - 始終按最快合理時間排序並推薦最快方案
 */
export class RoutePlanningService {
  constructor({ etaService, storage = null, proxyBaseUrl = '/api' }) {
    this.etaService = etaService;
    this.storage = storage;
    this.proxyBaseUrl = proxyBaseUrl;

    this._stopsMap = null;
    this._routeInfoMap = null;
    this._groupedRoutes = null;
    this._mtrGraph = this._buildMtrGraph();
  }

  async plan(origin, destination, { arriveBy = null } = {}) {
    if (!CONFIG.useRealTransitApi) {
      return this._realPlan(origin, destination, arriveBy);
    }
    return this._multimodalGraphPlan(origin, destination);
  }

  async _realPlan(origin, destination, arriveBy) {
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      modes: 'mtr,bus,minibus,ferry',
      max_results: '4',
    });
    if (arriveBy) params.set('arrive_by', arriveBy.toISOString());

    const res = await fetch(`${this.proxyBaseUrl}/plan-trip?${params}`);
    if (!res.ok) throw new Error(`Route planning failed: HTTP ${res.status}`);
    const json = await res.json();

    const itineraries = (json.itineraries ?? []).map((raw) => this._adaptWheelsItinerary(raw));
    await this._populateEtas(itineraries);
    return itineraries;
  }

  _adaptWheelsItinerary(raw) {
    const segments = (raw.legs ?? []).map((leg) => {
      const mode = this._mapMode(leg.mode);
      const isTransitLeg = mode !== TransportMode.WALK;

      return new RouteSegment({
        mode,
        from: new Location({
          name: leg.from?.name ?? (mode === TransportMode.WALK ? '起點' : '上車站'),
          lat: leg.from?.lat, lng: leg.from?.lng,
        }),
        to: new Location({
          name: leg.to?.name ?? (mode === TransportMode.WALK ? '終點' : '下車站'),
          lat: leg.to?.lat, lng: leg.to?.lng,
        }),
        duration: Math.round((leg.duration ?? 0) / 60) || 1,
        route: isTransitLeg ? (leg.route?.shortName ?? leg.route?.name ?? leg.route ?? null) : null,
        direction: isTransitLeg ? (leg.route?.headsign ?? leg.direction ?? null) : null,
        boardStop: isTransitLeg ? (leg.from?.name ?? null) : null,
        alightStop: isTransitLeg ? (leg.to?.name ?? null) : null,
        exit: leg.from?.exit ?? null,
      });
    });

    const it = new Itinerary({ segments, label: raw.label ?? '推薦方案' });
    if (raw.latestDeparture) it.latestDeparture = new Date(raw.latestDeparture);
    return it;
  }

  _mapMode(raw) {
    const m = String(raw).toLowerCase();
    if (m.includes('mtr') || m.includes('subway')) return TransportMode.MTR;
    if (m.includes('minibus')) return TransportMode.MINIBUS;
    if (m.includes('bus')) return TransportMode.BUS;
    if (m.includes('ferry')) return TransportMode.FERRY;
    return TransportMode.WALK;
  }

  /**
   * 評估兩點之間步行的合理性：
   * 回傳 { feasible: boolean, reason: string, meters: number }
   */
  _evaluateWalk(fromLoc, toLoc, maxMeters = CONFIG.maxReasonableWalkMeters) {
    const dist = fromLoc?.distanceTo?.(toLoc);
    if (dist == null) {
      return { feasible: false, reason: '缺少座標資訊，無法確認步行距離', meters: Infinity };
    }

    const pairText = `${fromLoc.name ?? ''} ${toLoc.name ?? ''}`;
    const hasHkust = /科技大學|科大|HKUST|清水灣/i.test(pairText);
    const hasHangHauOrTko = /坑口|將軍澳|調景嶺|寶琳|Hang Hau|Tseung Kwan O/i.test(pairText);

    if (hasHkust && hasHangHauOrTko) {
      return {
        feasible: false,
        reason: `已拒絕純步行：${fromLoc.name} 至 ${toLoc.name} 需沿清水灣道山路長距離步行（約 ${Math.round(dist)}m 直線），不建議步行`,
        meters: dist,
      };
    }

    if (dist > maxMeters) {
      return {
        feasible: false,
        reason: `已拒絕純步行：${fromLoc.name} 至 ${toLoc.name} 距離約 ${Math.round(dist)}m（超過合理步行上限 ${maxMeters}m），建議改搭巴士或小巴`,
        meters: dist,
      };
    }

    return { feasible: true, reason: '', meters: dist };
  }

  _isWalkingFeasible(fromLoc, toLoc, maxMeters = CONFIG.maxReasonableWalkMeters) {
    return this._evaluateWalk(fromLoc, toLoc, maxMeters).feasible;
  }

  async _multimodalGraphPlan(origin, destination) {
    const safeOrigin = origin?.hasCoords ? origin : new Location(CONFIG.defaultOrigin);
    const directDist = safeOrigin.distanceTo(destination) ?? 3000;
    const candidates = [];

    await this._ensureKmbNetworkLoaded();

    // 1. 短距離步行（若距離合理則為可行方案；若過遠則仍列出但標記為不建議）
    if (directDist <= 1200) {
      const walkCheck = this._evaluateWalk(safeOrigin, destination, 1200);
      const walkMin = await this._getWalkingMinutes(safeOrigin, destination);
      candidates.push(
        new Itinerary({
          label: walkCheck.feasible ? '純步行（地圖路網）' : '純步行（不建議·路程過遠）',
          isImpracticalWalk: !walkCheck.feasible,
          impracticalReason: walkCheck.reason,
          segments: [
            new RouteSegment({
              mode: TransportMode.WALK,
              from: safeOrigin,
              to: destination,
              duration: walkMin,
            }),
          ],
        })
      );
    }

    // 2. 港鐵 + 步行方案（包含合理步行與「步行距離過遠／不建議」方案，後者會被拒絕推薦但仍顯示）
    const originMtrList = this._findNearbyMtrStations(safeOrigin, 1800, 2);
    const destMtrNearList = this._findNearbyMtrStations(destination, 1200, 2);
    const destMtrBroadList = this._findNearbyMtrStations(destination, 4500, 2);

    const directMtrTargets = destMtrNearList.length ? destMtrNearList : destMtrBroadList;
    for (const oSt of originMtrList) {
      for (const dSt of directMtrTargets) {
        if (oSt.station.code === dSt.station.code) continue;
        const railPath = this._dijkstraMtr(oSt.station.code, dSt.station.code);
        if (!railPath) continue;

        const walkCheck = this._evaluateWalk(dSt.loc, destination, 950);
        const mtrSegments = await this._buildMtrSegments(safeOrigin, destination, oSt, dSt, railPath);
        const transferCount = Math.max(0, railPath.legs.length - 1);
        const baseLineLabel =
          transferCount > 0
            ? `港鐵（${railPath.legs.map((l) => l.lineName).join('→')}）`
            : `港鐵 ${railPath.legs[0].lineName}`;

        candidates.push(
          new Itinerary({
            label: walkCheck.feasible
              ? `${baseLineLabel} + 步行`
              : `${baseLineLabel} + 步行（已拒絕·步行過遠）`,
            isImpracticalWalk: !walkCheck.feasible,
            impracticalReason: walkCheck.reason,
            segments: mtrSegments,
          })
        );
      }
    }

    // 3. 巴士／專線小巴直達路線方案
    const directKmbRoutes = this._findKmbRoutesBetween(safeOrigin, destination, {
      maxOriginDist: 1200,
      maxDestDist: 1000,
      limit: 3,
    });

    for (const kmb of directKmbRoutes) {
      const segs = await this._buildKmbSegments(safeOrigin, destination, kmb);
      const modePrefix = kmb.mode === 'minibus' ? '專線小巴' : '九巴';
      candidates.push(
        new Itinerary({
          label: `${modePrefix} ${kmb.route}${kmb.destTc ? `（往${kmb.destTc}）` : ''}`,
          segments: segs,
        })
      );
    }

    // 4. 港鐵 + 專線小巴 / 港鐵 + 九巴 / 跨站多模式接駁（至少產生多條可比較方案，涵蓋 MTR+小巴、MTR+巴士等）
    const hubSearchList = this._findNearbyMtrStations(destination, 6500, 6);
    const feederByMode = new Map(); // key: `${mode}:${hubCode}:${route}` -> best candidate

    for (const oSt of originMtrList.slice(0, 2)) {
      for (const hubMtr of hubSearchList) {
        if (oSt.station.code === hubMtr.station.code) continue;
        const railPath = this._dijkstraMtr(oSt.station.code, hubMtr.station.code);
        if (!railPath) continue;

        const feederCandidates = this._findKmbRoutesBetween(hubMtr.loc, destination, {
          maxOriginDist: 1000,
          maxDestDist: 1000,
          limit: 4,
        });

        for (const feeder of feederCandidates) {
          if (!this._isWalkingFeasible(hubMtr.loc, feeder.boardStop.loc, 800)) continue;
          if (!this._isWalkingFeasible(feeder.alightStop.loc, destination, 1000)) continue;

          const walkToMtrMin = await this._getWalkingMinutes(safeOrigin, oSt.loc);
          const walkToFeederMin = await this._getWalkingMinutes(hubMtr.loc, feeder.boardStop.loc);
          const busRideMin = this._estimateBusLegMinutes(feeder);
          const walkFromFeederMin = await this._getWalkingMinutes(feeder.alightStop.loc, destination);
          const exit = this._pickExitForDestination(hubMtr.station, destination);

          const railMin = railPath.legs.reduce((a, l) => a + l.minutes, 0);
          const waitPenalty = feeder.mode === 'minibus' ? 5 : 6;
          const estTotalMin =
            walkToMtrMin + railMin + 4 + walkToFeederMin + waitPenalty + busRideMin + walkFromFeederMin;

          const feederPrefix = feeder.mode === 'minibus' ? '小巴' : '九巴';
          const bucketKey = `${feeder.mode}:${hubMtr.station.code}:${feeder.route}`;
          const existing = feederByMode.get(bucketKey);

          if (!existing || estTotalMin < existing.estTotalMin) {
            feederByMode.set(bucketKey, {
              estTotalMin,
              mode: feeder.mode,
              label: `港鐵 → ${hubMtr.station.name.replace('站', '')} 轉${feederPrefix} ${feeder.route}${feeder.destTc ? `（往${feeder.destTc}）` : ''}`,
              segments: [
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: safeOrigin,
                  to: oSt.loc,
                  duration: walkToMtrMin,
                }),
                ...this._railLegsToSegments(railPath.legs, oSt.station),
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: hubMtr.loc,
                  to: feeder.boardStop.loc,
                  duration: walkToFeederMin,
                  exit,
                }),
                new RouteSegment({
                  mode: feeder.mode === 'minibus' ? TransportMode.MINIBUS : TransportMode.BUS,
                  from: feeder.boardStop.loc,
                  to: feeder.alightStop.loc,
                  duration: busRideMin,
                  route: feeder.mode === 'minibus' ? feeder.route : `${feeder.route} 號巴士`,
                  serviceType: feeder.serviceType,
                  stopId: feeder.boardStop.stopId,
                  direction: feeder.destTc ? `往 ${feeder.destTc}` : `往 ${destination.name}`,
                  boardStop: feeder.boardStop.name,
                  alightStop: feeder.alightStop.name,
                }),
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: feeder.alightStop.loc,
                  to: destination,
                  duration: walkFromFeederMin,
                }),
              ],
            });
          }
        }
      }
    }

    // 確保同時保留最快「港鐵 + 小巴」與最快「港鐵 + 巴士」以及額外替代樞紐方案（至少 3 條）
    const allFeeders = [...feederByMode.values()].sort((a, b) => a.estTotalMin - b.estTotalMin);
    const chosenFeeders = [];
    const fastestMinibus = allFeeders.find((f) => f.mode === 'minibus');
    const fastestBus = allFeeders.find((f) => f.mode === 'bus');

    if (fastestMinibus) chosenFeeders.push(fastestMinibus);
    if (fastestBus && fastestBus !== fastestMinibus) chosenFeeders.push(fastestBus);
    for (const f of allFeeders) {
      if (chosenFeeders.length >= 4) break;
      if (!chosenFeeders.includes(f)) chosenFeeders.push(f);
    }

    for (const f of chosenFeeders) {
      candidates.push(
        new Itinerary({
          label: f.label,
          segments: f.segments,
        })
      );
    }

    // 5. 若可行方案仍少於 3 條，補充其他合理接駁／巴士方案（如 巴士 + 步行 或 小巴 + 步行）
    const practicalCount = candidates.filter((c) => !c.isImpracticalWalk).length;
    if (practicalCount < 3) {
      const altRoutes = this._findKmbRoutesBetween(safeOrigin, destination, {
        maxOriginDist: 2200,
        maxDestDist: 1500,
        limit: 4,
      });
      for (const alt of altRoutes) {
        if (candidates.filter((c) => !c.isImpracticalWalk).length >= 3) break;
        const segs = await this._buildKmbSegments(safeOrigin, destination, alt);
        const modePrefix = alt.mode === 'minibus' ? '專線小巴' : '九巴';
        candidates.push(
          new Itinerary({
            label: `${modePrefix} ${alt.route} 接駁${alt.destTc ? `（往${alt.destTc}）` : ''}`,
            segments: segs,
          })
        );
      }
    }

    // 6. 巴士／小巴轉乘方案（覆蓋無直達或需轉乘之任意起訖點）
    const busXfer = this._findBusToBusTransfer(safeOrigin, destination);
    if (busXfer) {
      const w1 = await this._getWalkingMinutes(safeOrigin, busXfer.first.boardStop.loc);
      const b1Min = this._estimateBusLegMinutes(busXfer.first);
      const wMid = await this._getWalkingMinutes(busXfer.first.alightStop.loc, busXfer.second.boardStop.loc);
      const b2Min = this._estimateBusLegMinutes(busXfer.second);
      const w2 = await this._getWalkingMinutes(busXfer.second.alightStop.loc, destination);

      candidates.push(
        new Itinerary({
          label: `巴士轉乘 ${busXfer.first.route} → ${busXfer.second.route}`,
          segments: [
            new RouteSegment({
              mode: TransportMode.WALK,
              from: safeOrigin,
              to: busXfer.first.boardStop.loc,
              duration: w1,
            }),
            new RouteSegment({
              mode: busXfer.first.mode === 'minibus' ? TransportMode.MINIBUS : TransportMode.BUS,
              from: busXfer.first.boardStop.loc,
              to: busXfer.first.alightStop.loc,
              duration: b1Min,
              route: busXfer.first.mode === 'minibus' ? busXfer.first.route : `${busXfer.first.route} 號巴士`,
              serviceType: busXfer.first.serviceType,
              stopId: busXfer.first.boardStop.stopId,
              direction: busXfer.first.destTc ? `往 ${busXfer.first.destTc}` : `往 ${busXfer.first.alightStop.name}`,
              boardStop: busXfer.first.boardStop.name,
              alightStop: busXfer.first.alightStop.name,
            }),
            new RouteSegment({
              mode: TransportMode.WALK,
              from: busXfer.first.alightStop.loc,
              to: busXfer.second.boardStop.loc,
              duration: wMid,
            }),
            new RouteSegment({
              mode: busXfer.second.mode === 'minibus' ? TransportMode.MINIBUS : TransportMode.BUS,
              from: busXfer.second.boardStop.loc,
              to: busXfer.second.alightStop.loc,
              duration: b2Min,
              route: busXfer.second.mode === 'minibus' ? busXfer.second.route : `${busXfer.second.route} 號巴士`,
              serviceType: busXfer.second.serviceType,
              stopId: busXfer.second.boardStop.stopId,
              direction: busXfer.second.destTc ? `往 ${busXfer.second.destTc}` : `往 ${destination.name}`,
              boardStop: busXfer.second.boardStop.name,
              alightStop: busXfer.second.alightStop.name,
            }),
            new RouteSegment({
              mode: TransportMode.WALK,
              from: busXfer.second.alightStop.loc,
              to: destination,
              duration: w2,
            }),
          ],
        })
      );
    }

    // 去重
    const unique = [];
    const seenKeys = new Set();
    for (const it of candidates) {
      const key = it.segments
        .map((s) => `${s.mode}:${s.route || ''}:${s.boardStop || s.from.name}->${s.alightStop || s.to.name}`)
        .join('|');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        unique.push(it);
      }
    }

    await this._populateEtas(unique);
    return unique;
  }

  _pruneTrivialWalkSegments(segments, origin, destination) {
    if (!Array.isArray(segments) || !segments.length) return [];

    const norm = (s) => String(s || '').replace(/站.*$/, '').replace(/（.*）/, '').trim();
    const isSamePlace = (a, b) => {
      if (!a || !b) return false;
      if (a.name && b.name && (a.name === b.name || norm(a.name) === norm(b.name))) return true;
      if (a.hasCoords && b.hasCoords) {
        const d = a.distanceTo(b);
        if (d != null && d <= 45) return true;
      }
      return false;
    };

    const filtered = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.isTransit()) {
        filtered.push(seg);
        continue;
      }

      const fromName = seg.from?.name || '';
      const toName = seg.to?.name || '';
      const dist = seg.from?.distanceTo?.(seg.to);
      const isAtOrigin = i === 0 && (isSamePlace(seg.from, origin) || norm(fromName) === norm(toName));
      const isAtDest = i === segments.length - 1 && (isSamePlace(seg.to, destination) || norm(fromName) === norm(toName));
      const isTrivialHop =
        norm(fromName) === norm(toName) ||
        (dist != null && dist <= 45 && !seg.exit);

      if ((isAtOrigin || isAtDest || isTrivialHop) && (seg.duration <= 2 || isSamePlace(seg.from, seg.to))) {
        // 若是出站往轉乘點且有出口資訊，保留至下一個轉乘段的提示
        if (seg.exit && filtered.length) {
          const prevTransit = [...filtered].reverse().find((s) => s.isTransit());
          if (prevTransit && !prevTransit.exit) {
            prevTransit.exit = seg.exit;
          }
        }
        continue;
      }

      filtered.push(seg);
    }

    return filtered;
  }

  _buildMtrGraph() {
    const stationByCode = new Map(HK_MTR_STATIONS.map((s) => [s.code, s]));
    const adj = new Map();

    const addEdge = (from, edge) => {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from).push(edge);
    };

    for (const e of HK_MTR_LINE_EDGES) {
      if (!stationByCode.has(e.from) || !stationByCode.has(e.to)) continue;
      addEdge(e.from, {
        to: e.to,
        lineCode: e.lineCode,
        lineName: e.lineName,
        minutes: e.min,
        terminus: e.terminusUp,
      });
      addEdge(e.to, {
        to: e.from,
        lineCode: e.lineCode,
        lineName: e.lineName,
        minutes: e.min,
        terminus: e.terminusDown,
      });
    }

    return { stationByCode, adj };
  }

  _dijkstraMtr(startCode, goalCode) {
    const { stationByCode, adj } = this._mtrGraph;
    if (!stationByCode.has(startCode) || !stationByCode.has(goalCode)) return null;

    const dist = new Map();
    const prev = new Map();
    const pq = [];

    const startEdges = adj.get(startCode) ?? [];
    const initLines = new Set(startEdges.map((e) => e.lineCode));
    for (const lineCode of initLines) {
      const state = `${startCode}:${lineCode}`;
      dist.set(state, 0);
      pq.push({ state, stationCode: startCode, lineCode, cost: 0 });
    }

    let bestGoalState = null;
    let bestGoalCost = Infinity;

    while (pq.length) {
      pq.sort((a, b) => a.cost - b.cost);
      const cur = pq.shift();
      if (cur.cost > (dist.get(cur.state) ?? Infinity)) continue;

      if (cur.stationCode === goalCode) {
        if (cur.cost < bestGoalCost) {
          bestGoalCost = cur.cost;
          bestGoalState = cur.state;
        }
        continue;
      }

      for (const edge of adj.get(cur.stationCode) ?? []) {
        const isTransfer = edge.lineCode !== cur.lineCode;
        const transferPenalty = isTransfer ? 5 : 0;
        const nextCost = cur.cost + edge.minutes + transferPenalty;
        const nextState = `${edge.to}:${edge.lineCode}`;

        if (nextCost < (dist.get(nextState) ?? Infinity)) {
          dist.set(nextState, nextCost);
          prev.set(nextState, {
            fromState: cur.state,
            fromStation: cur.stationCode,
            toStation: edge.to,
            lineCode: edge.lineCode,
            lineName: edge.lineName,
            minutes: edge.minutes,
            terminus: edge.terminus,
          });
          pq.push({
            state: nextState,
            stationCode: edge.to,
            lineCode: edge.lineCode,
            cost: nextCost,
          });
        }
      }
    }

    if (!bestGoalState) return null;

    const rawSteps = [];
    let cursor = bestGoalState;
    while (prev.has(cursor)) {
      const step = prev.get(cursor);
      rawSteps.unshift(step);
      cursor = step.fromState;
    }

    if (!rawSteps.length) return null;

    const legs = [];
    for (const step of rawSteps) {
      const last = legs[legs.length - 1];
      if (last && last.lineCode === step.lineCode) {
        last.toCode = step.toStation;
        last.minutes += step.minutes;
        last.stopCount += 1;
      } else {
        legs.push({
          lineCode: step.lineCode,
          lineName: step.lineName,
          fromCode: step.fromStation,
          toCode: step.toStation,
          minutes: step.minutes,
          terminus: step.terminus,
          stopCount: 1,
        });
      }
    }

    return { legs, totalCost: bestGoalCost };
  }

  _railLegsToSegments(legs, originStation) {
    const { stationByCode } = this._mtrGraph;
    const segs = [];
    legs.forEach((leg, idx) => {
      const fromSt = stationByCode.get(leg.fromCode);
      const toSt = stationByCode.get(leg.toCode);
      if (!fromSt || !toSt) return;
      segs.push(
        new RouteSegment({
          mode: TransportMode.MTR,
          from: new Location({ name: fromSt.name, lat: fromSt.lat, lng: fromSt.lng, source: 'mtr' }),
          to: new Location({ name: toSt.name, lat: toSt.lat, lng: toSt.lng, source: 'mtr' }),
          duration: leg.minutes,
          route: leg.lineName,
          direction: `往 ${leg.terminus}`,
          boardStop: fromSt.name,
          alightStop: toSt.name,
          lineCode: idx === 0 ? originStation.lineCode : leg.lineCode,
          stationCode: idx === 0 ? originStation.code : leg.fromCode,
        })
      );
    });
    return segs;
  }

  async _buildMtrSegments(origin, destination, oSt, dSt, railPath) {
    const walkToMtrMin = await this._getWalkingMinutes(origin, oSt.loc);
    const walkFromMtrMin = await this._getWalkingMinutes(dSt.loc, destination);
    const exit = this._pickExitForDestination(dSt.station, destination);

    const raw = [
      new RouteSegment({
        mode: TransportMode.WALK,
        from: origin,
        to: oSt.loc,
        duration: walkToMtrMin,
      }),
      ...this._railLegsToSegments(railPath.legs, oSt.station),
      new RouteSegment({
        mode: TransportMode.WALK,
        from: dSt.loc,
        to: destination,
        duration: walkFromMtrMin,
        exit,
      }),
    ];
    return this._pruneTrivialWalkSegments(raw, origin, destination);
  }

  async _ensureKmbNetworkLoaded() {
    if (this._stopsMap && this._groupedRoutes) return;

    const cacheKey = 'kmb_network_v4';
    const cached = this.storage?.get(cacheKey);
    if (cached && cached.savedAt && Date.now() - cached.savedAt < CONFIG.kmbStaticCacheTtlMs) {
      this._hydrateKmbCache(cached);
      return;
    }

    try {
      const [stopsJson, routeStopsJson, routesJson] = await Promise.all([
        fetchJsonWithCorsFallback(`${CONFIG.kmbApi}/stop`, { timeoutMs: 3500 }),
        fetchJsonWithCorsFallback(`${CONFIG.kmbApi}/route-stop`, { timeoutMs: 3500 }),
        fetchJsonWithCorsFallback(`${CONFIG.kmbApi}/route`, { timeoutMs: 3500 }),
      ]);

      if (stopsJson?.data?.length && routeStopsJson?.data?.length) {
        const payload = {
          savedAt: Date.now(),
          stops: stopsJson.data,
          routeStops: routeStopsJson.data,
          routes: routesJson?.data ?? [],
        };
        this.storage?.set(cacheKey, payload);
        this._hydrateKmbCache(payload);
        return;
      }
    } catch {
      // 外部 API 受限時自動使用內建常規路線拓撲
    }

    this._hydrateBuiltInKmbRoutes();
  }

  _hydrateBuiltInKmbRoutes() {
    const stopsMap = new Map();
    const grouped = new Map();

    for (const r of HK_KMB_ROUTES_DATA) {
      if (!r || !Array.isArray(r.stops)) continue;
      const key = `${r.route}|1|${r.serviceType}`;
      const seqStops = r.stops.map((st, i) => {
        stopsMap.set(
          st.id,
          new Location({
            name: st.name,
            lat: st.lat,
            lng: st.lng,
            stopId: st.id,
            source: 'kmb',
          })
        );
        return { seq: i + 1, stopId: st.id };
      });
      grouped.set(key, {
        route: r.route,
        mode: r.mode || 'bus',
        bound: '1',
        serviceType: r.serviceType,
        origTc: r.origTc,
        destTc: r.destTc,
        stops: seqStops,
      });
    }

    this._stopsMap = stopsMap;
    this._groupedRoutes = grouped;
  }

  _hydrateKmbCache(payload) {
    const stopsMap = new Map();
    for (const s of payload.stops ?? []) {
      stopsMap.set(
        s.stop,
        new Location({
          name: s.name_tc,
          lat: Number(s.lat),
          lng: Number(s.long ?? s.lng),
          stopId: s.stop,
          address: s.name_en,
          source: 'kmb',
        })
      );
    }

    const routeInfoMap = new Map();
    for (const r of payload.routes ?? []) {
      const key = `${r.route}|${r.bound}|${r.service_type}`;
      routeInfoMap.set(key, {
        origTc: r.orig_tc,
        destTc: r.dest_tc,
      });
    }

    const grouped = new Map();
    for (const row of payload.routeStops ?? []) {
      const key = `${row.route}|${row.bound}|${row.service_type}`;
      if (!grouped.has(key)) {
        const info = routeInfoMap.get(key) ?? {};
        grouped.set(key, {
          route: row.route,
          mode: 'bus',
          bound: row.bound,
          serviceType: row.service_type || '1',
          destTc: info.destTc || null,
          origTc: info.origTc || null,
          stops: [],
        });
      }
      grouped.get(key).stops.push({
        seq: Number(row.seq),
        stopId: row.stop,
      });
    }

    for (const grp of grouped.values()) {
      grp.stops.sort((a, b) => a.seq - b.seq);
    }

    // 補充內建專線小巴／科大接駁路線，確保包含小巴與各樞紐組合
    for (const r of HK_KMB_ROUTES_DATA) {
      if (!r || !Array.isArray(r.stops)) continue;
      const key = `${r.route}|1|${r.serviceType}`;
      if (grouped.has(key)) continue;
      const seqStops = r.stops.map((st, i) => {
        stopsMap.set(
          st.id,
          new Location({
            name: st.name,
            lat: st.lat,
            lng: st.lng,
            stopId: st.id,
            source: 'kmb',
          })
        );
        return { seq: i + 1, stopId: st.id };
      });
      grouped.set(key, {
        route: r.route,
        mode: r.mode || 'bus',
        bound: '1',
        serviceType: r.serviceType,
        origTc: r.origTc,
        destTc: r.destTc,
        stops: seqStops,
      });
    }

    this._stopsMap = stopsMap;
    this._routeInfoMap = routeInfoMap;
    this._groupedRoutes = grouped;
  }

  _findKmbRoutesBetween(originLoc, destLoc, { maxOriginDist = 1800, maxDestDist = 1600, limit = 5 } = {}) {
    if (!this._stopsMap || !this._groupedRoutes) return [];

    const nearOrigin = new Map();
    const nearDest = new Map();

    for (const [stopId, loc] of this._stopsMap.entries()) {
      const dO = originLoc.distanceTo(loc);
      if (dO != null && dO <= maxOriginDist) nearOrigin.set(stopId, dO);
      const dD = destLoc.distanceTo(loc);
      if (dD != null && dD <= maxDestDist) nearDest.set(stopId, dD);
    }

    if (!nearOrigin.size || !nearDest.size) return [];

    const matches = [];
    for (const grp of this._groupedRoutes.values()) {
      let bestBoard = null;
      let bestAlight = null;

      for (let i = 0; i < grp.stops.length; i++) {
        const sid = grp.stops[i].stopId;
        if (!bestBoard && nearOrigin.has(sid)) {
          bestBoard = { idx: i, stopId: sid, dist: nearOrigin.get(sid) };
          continue;
        }
        if (bestBoard && i > bestBoard.idx && nearDest.has(sid)) {
          const d = nearDest.get(sid);
          if (!bestAlight || d < bestAlight.dist) {
            bestAlight = { idx: i, stopId: sid, dist: d };
          }
        }
      }

      if (bestBoard && bestAlight) {
        const bLoc = this._stopsMap.get(bestBoard.stopId);
        const aLoc = this._stopsMap.get(bestAlight.stopId);
        if (!bLoc || !aLoc) continue;

        const stopSpan = bestAlight.idx - bestBoard.idx;
        const walkPenalty = bestBoard.dist + bestAlight.dist;
        const score = walkPenalty * 0.02 + stopSpan * 1.0;

        matches.push({
          score,
          route: grp.route,
          mode: grp.mode || 'bus',
          serviceType: grp.serviceType,
          destTc: grp.destTc,
          stopSpan,
          boardStop: { stopId: bestBoard.stopId, name: bLoc.name, loc: bLoc },
          alightStop: { stopId: bestAlight.stopId, name: aLoc.name, loc: aLoc },
        });
      }
    }

    matches.sort((a, b) => a.score - b.score);
    return matches.slice(0, limit);
  }

  _findBusToBusTransfer(originLoc, destLoc) {
    if (!this._stopsMap || !this._groupedRoutes) return null;

    const firstLegs = [];
    const secondLegs = [];

    for (const [stopId, loc] of this._stopsMap.entries()) {
      const dO = originLoc.distanceTo(loc);
      if (dO != null && dO <= 1800) {
        for (const grp of this._groupedRoutes.values()) {
          const idx = grp.stops.findIndex((s) => s.stopId === stopId);
          if (idx !== -1 && idx < grp.stops.length - 1) {
            firstLegs.push({ grp, boardIdx: idx, boardStopId: stopId, boardLoc: loc, walkDist: dO });
          }
        }
      }

      const dD = destLoc.distanceTo(loc);
      if (dD != null && dD <= 1600) {
        for (const grp of this._groupedRoutes.values()) {
          const idx = grp.stops.findIndex((s) => s.stopId === stopId);
          if (idx > 0) {
            secondLegs.push({ grp, alightIdx: idx, alightStopId: stopId, alightLoc: loc, walkDist: dD });
          }
        }
      }
    }

    let best = null;
    for (const f of firstLegs.slice(0, 40)) {
      for (let i = f.boardIdx + 1; i < f.grp.stops.length; i++) {
        const midId = f.grp.stops[i].stopId;
        const midLoc = this._stopsMap.get(midId);
        if (!midLoc) continue;

        for (const s of secondLegs.slice(0, 40)) {
          if (f.grp === s.grp) continue;
          for (let j = 0; j < s.alightIdx; j++) {
            const sMidId = s.grp.stops[j].stopId;
            const sMidLoc = this._stopsMap.get(sMidId);
            if (!sMidLoc) continue;
            const xferDist = midLoc.distanceTo(sMidLoc) ?? Infinity;
            if (xferDist <= 450) {
              const score = f.walkDist + s.walkDist + xferDist * 2 + (i - f.boardIdx) * 120 + (s.alightIdx - j) * 120;
              if (!best || score < best.score) {
                best = {
                  score,
                  first: {
                    route: f.grp.route,
                    mode: f.grp.mode || 'bus',
                    serviceType: f.grp.serviceType,
                    destTc: f.grp.destTc,
                    stopSpan: i - f.boardIdx,
                    boardStop: { stopId: f.boardStopId, name: f.boardLoc.name, loc: f.boardLoc },
                    alightStop: { stopId: midId, name: midLoc.name, loc: midLoc },
                  },
                  second: {
                    route: s.grp.route,
                    mode: s.grp.mode || 'bus',
                    serviceType: s.grp.serviceType,
                    destTc: s.grp.destTc,
                    stopSpan: s.alightIdx - j,
                    boardStop: { stopId: sMidId, name: sMidLoc.name, loc: sMidLoc },
                    alightStop: { stopId: s.alightStopId, name: s.alightLoc.name, loc: s.alightLoc },
                  },
                };
              }
            }
          }
        }
      }
    }

    return best;
  }

  _estimateBusLegMinutes(kmb) {
    const dist = kmb.boardStop.loc.distanceTo(kmb.alightStop.loc) ?? 2500;
    const byDist = (dist * 1.38) / 360;
    const byStops = kmb.stopSpan * 1.3;
    return Math.max(5, Math.round(Math.max(byDist, byStops)));
  }

  async _buildKmbSegments(origin, destination, kmb) {
    const walkToStopMin = await this._getWalkingMinutes(origin, kmb.boardStop.loc);
    const busRideMin = this._estimateBusLegMinutes(kmb);
    const walkFromStopMin = await this._getWalkingMinutes(kmb.alightStop.loc, destination);
    const labelPrefix = kmb.mode === 'minibus' ? '' : `${kmb.route} 號巴士`;

    return [
      new RouteSegment({
        mode: TransportMode.WALK,
        from: origin,
        to: kmb.boardStop.loc,
        duration: walkToStopMin,
      }),
      new RouteSegment({
        mode: kmb.mode === 'minibus' ? TransportMode.MINIBUS : TransportMode.BUS,
        from: kmb.boardStop.loc,
        to: kmb.alightStop.loc,
        duration: busRideMin,
        route: labelPrefix || kmb.route,
        serviceType: kmb.serviceType,
        stopId: kmb.boardStop.stopId,
        direction: kmb.destTc ? `往 ${kmb.destTc}` : `往 ${destination.name}`,
        boardStop: kmb.boardStop.name,
        alightStop: kmb.alightStop.name,
      }),
      new RouteSegment({
        mode: TransportMode.WALK,
        from: kmb.alightStop.loc,
        to: destination,
        duration: walkFromStopMin,
      }),
    ];
  }

  async _getWalkingMinutes(fromLoc, toLoc) {
    const dist = fromLoc.distanceTo(toLoc);
    if (dist == null) return 5;
    if (dist < 60) return 1;

    try {
      const url = `${CONFIG.osrmWalkApi}/${fromLoc.lng},${fromLoc.lat};${toLoc.lng},${toLoc.lat}?overview=false`;
      const json = await fetchJsonWithCorsFallback(url, { timeoutMs: 2000 });
      const sec = json?.routes?.[0]?.duration;
      if (Number.isFinite(sec)) {
        return Math.max(1, Math.round(sec / 60));
      }
    } catch {
      // 超時時回退
    }

    return Math.max(1, Math.ceil((dist * 1.25) / CONFIG.walkingSpeed));
  }

  _findNearbyMtrStations(loc, maxDist = 1600, limit = 2) {
    if (!loc?.hasCoords) return [];
    const all = HK_MTR_STATIONS.map((st) => {
      const stLoc = new Location({ name: st.name, lat: st.lat, lng: st.lng, source: 'mtr' });
      return { station: st, loc: stLoc, distance: loc.distanceTo(stLoc) ?? Infinity };
    }).sort((a, b) => a.distance - b.distance);

    const within = all.filter((x) => x.distance <= maxDist).slice(0, limit);
    return within.length ? within : [all[0]];
  }

  _pickExitForDestination(station, destination) {
    const destText = `${destination.name} ${destination.address ?? ''}`;
    if (station.name === '坑口站' && /科技大學|科大|HKUST|清水灣/i.test(destText)) return 'B2';
    if (station.name === '大學站' && /中文大學|中大|CUHK/i.test(destText)) return 'A';
    if (station.name === '九龍塘站' && /城市大學|城大|浸會|浸大/i.test(destText)) return 'C2';
    if (station.name === '紅磡站' && /理工大學|理大|PolyU/i.test(destText)) return 'A1';
    if (station.name === '香港站' && /IFC|國際金融中心/i.test(destText)) return 'F';
    if (station.name === '尖沙咀站' && /海港城/i.test(destText)) return 'A1';
    if (station.name === '觀塘站' && /APM/i.test(destText)) return 'A2';
    return station.exits?.[0] ?? 'A';
  }

  async _populateEtas(itineraries) {
    if (!this.etaService) return;
    const now = new Date();
    for (const it of itineraries) {
      for (const seg of it.segments) {
        if (seg.isTransit()) {
          const res = await this.etaService.getNextArrival(seg, now);
          seg.eta = res.eta;
          seg.isRealEta = !!res.isRealEta;
          if (res.direction) seg.direction = res.direction;
        }
      }
    }
  }
}
