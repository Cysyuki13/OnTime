import { Itinerary } from '../models/Itinerary.js';
import { RouteSegment } from '../models/RouteSegment.js';
import { Location } from '../models/Location.js';
import { TransportMode } from '../models/TransportMode.js';
import { CONFIG } from '../config.js';
import { HK_MTR_STATIONS, HK_MTR_LINE_EDGES, HK_KMB_ROUTES_DATA, HK_LRT_STOPS, HK_LRT_EDGES } from '../data/hkStations.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

/**
 * 動態多模式最短時間規劃引擎（結合真實香港地理與人類出行合理性約束）
 * - 提供多種組合（如港鐵 + 專線小巴、港鐵 + 九巴、巴士／小巴接駁、港鐵 + 步行）
 * - 步行距離過遠或跨山路（例如坑口站至科大南閘）的「港鐵 + 步行」會標記為不建議（拒絕推薦）但仍會顯示
 * - 始終按最快合理時間排序並推薦最快方案
 */
export class RoutePlanningService {
  constructor({ etaService, storage = null, proxyBaseUrl = '/api', settingsService = null }) {
    this.etaService = etaService;
    this.storage = storage;
    this.proxyBaseUrl = proxyBaseUrl;
    this.settingsService = settingsService;

    this._stopsMap = null;
    this._routeInfoMap = null;
    this._groupedRoutes = null;
    this._kmbFromApi = false;
    this._mtrGraph = this._buildMtrGraph();
    this._lrtGraph = this._buildLrtGraph();
  }

  _modeEnabled(mode) {
    if (!this.settingsService) return true;
    return this.settingsService.isModeEnabled(mode);
  }

  _walkingSpeedMpm() {
    if (this.settingsService?.getWalkingSpeedMpm) {
      return this.settingsService.getWalkingSpeedMpm();
    }
    return CONFIG.walkingSpeed;
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
      modes: 'mtr,bus,minibus,lrt',
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
    if (m.includes('lrt') || m.includes('light') || m.includes('輕鐵')) return TransportMode.LRT;
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

    try {
      await this._ensureKmbNetworkLoaded();
    } catch (err) {
      console.warn('[RoutePlanning] KMB API load failed, minibus-only fallback:', err?.message || err);
      this._hydrateMinibusOnlyFallback();
    }

    // 1. 短距離步行（若距離合理則為可行方案；若過遠則仍列出但標記為不建議）
    if (this._modeEnabled('walk') && directDist <= 1200) {
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
    const originMtrList = this._modeEnabled('mtr')
      ? this._findNearbyMtrStations(safeOrigin, 1800, 2)
      : [];
    const destMtrNearList = this._modeEnabled('mtr')
      ? this._findNearbyMtrStations(destination, 1200, 2)
      : [];
    const destMtrBroadList = this._modeEnabled('mtr')
      ? this._findNearbyMtrStations(destination, 4500, 2)
      : [];

    const directMtrTargets = destMtrNearList.length ? destMtrNearList : destMtrBroadList;
    if (this._modeEnabled('mtr')) {
      for (const oSt of originMtrList) {
        for (const dSt of directMtrTargets) {
          if (oSt.station.code === dSt.station.code) continue;
          const railPath = this._dijkstraMtr(oSt.station.code, dSt.station.code);
          if (!railPath) continue;

          const originAtSt = this._isAtMtrStation(safeOrigin, oSt.loc, oSt.station);
          const destAtSt = this._isAtMtrStation(destination, dSt.loc, dSt.station);
          const walkCheck = destAtSt
            ? { feasible: true, reason: '', meters: 0 }
            : this._evaluateWalk(dSt.loc, destination, 950);
          const mtrSegments = await this._buildMtrSegments(safeOrigin, destination, oSt, dSt, railPath);
          const transferCount = Math.max(0, railPath.legs.length - 1);
          const baseLineLabel =
            transferCount > 0
              ? `港鐵（${railPath.legs.map((l) => l.lineName).join('→')}）`
              : `港鐵 ${railPath.legs[0].lineName}`;

          // 起訖都在港鐵站 → 純港鐵，不標「+ 步行」
          const pureMtr = originAtSt && destAtSt;
          const label = pureMtr
            ? baseLineLabel
            : walkCheck.feasible
              ? `${baseLineLabel} + 步行`
              : `${baseLineLabel} + 步行（已拒絕·步行過遠）`;

          candidates.push(
            new Itinerary({
              label,
              isImpracticalWalk: !walkCheck.feasible,
              impracticalReason: walkCheck.reason,
              segments: mtrSegments,
            })
          );
        }
      }
    }


    // 2b. 輕鐵方案（西北新界）及 港鐵 + 輕鐵 轉乘
    if (this._modeEnabled('lrt')) {
      const originLrt = this._findNearbyLrtStops(safeOrigin, 900, 3);
      const destLrt = this._findNearbyLrtStops(destination, 900, 3);

      // 純輕鐵
      for (const oL of originLrt) {
        for (const dL of destLrt) {
          if (oL.stop.code === dL.stop.code) continue;
          const path = this._dijkstraLrt(oL.stop.code, dL.stop.code);
          if (!path) continue;
          const segs = await this._buildLrtSegments(safeOrigin, destination, oL, dL, path);
          candidates.push(
            new Itinerary({
              label: `輕鐵（${oL.stop.name} → ${dL.stop.name}）`,
              segments: segs,
            })
          );
        }
      }

      // 港鐵 → 轉輕鐵（到達端）
      if (this._modeEnabled('mtr') && destLrt.length) {
        for (const oSt of originMtrList.slice(0, 2)) {
          for (const dL of destLrt) {
            const mtrCode = dL.stop.mtrCode;
            if (!mtrCode) continue;
            const railPath = this._dijkstraMtr(oSt.station.code, mtrCode);
            if (!railPath) continue;
            const mtrSt = this._mtrGraph.stationByCode.get(mtrCode);
            if (!mtrSt) continue;
            const mtrLoc = new Location({ name: mtrSt.name, lat: mtrSt.lat, lng: mtrSt.lng, source: 'mtr' });
            const xferMin = await this._getWalkingMinutes(mtrLoc, dL.loc);
            if (xferMin > 8) continue; // 轉乘步行過長則略過

            const walkToMtr = this._isAtMtrStation(safeOrigin, oSt.loc, oSt.station)
              ? 0
              : await this._getWalkingMinutes(safeOrigin, oSt.loc);
            // 轉乘站對應的輕鐵站
            const hubLrt = HK_LRT_STOPS.find((s) => s.mtrCode === mtrCode);
            if (!hubLrt) continue;
            const lrtRide = this._dijkstraLrt(hubLrt.code, dL.stop.code);
            const segs = [];
            if (walkToMtr > 0) {
              segs.push(
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: safeOrigin,
                  to: oSt.loc,
                  duration: walkToMtr,
                })
              );
            }
            segs.push(...this._railLegsToSegments(railPath.legs, oSt.station));
            segs.push(
              new RouteSegment({
                mode: TransportMode.WALK,
                from: mtrLoc,
                to: new Location({ name: hubLrt.name + '（輕鐵）', lat: hubLrt.lat, lng: hubLrt.lng, source: 'lrt' }),
                duration: Math.max(1, xferMin),
              })
            );
            if (lrtRide && hubLrt.code !== dL.stop.code) {
              segs.push(...this._lrtLegsToSegments(lrtRide.legs));
            }
            const walkFrom = await this._getWalkingMinutes(dL.loc, destination);
            if (walkFrom > 0 && !this._isNearLrtStop(destination, dL.stop, 120)) {
              segs.push(
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: dL.loc,
                  to: destination,
                  duration: walkFrom,
                })
              );
            }
            candidates.push(
              new Itinerary({
                label: `港鐵 → ${hubLrt.name} 轉輕鐵（往${dL.stop.name}）`,
                segments: this._pruneTrivialWalkSegments(segs, safeOrigin, destination),
              })
            );
          }
        }
      }

      // 輕鐵 → 轉港鐵（出發端）
      if (this._modeEnabled('mtr') && originLrt.length) {
        const destMtrNear = this._findNearbyMtrStations(destination, 1500, 2);
        for (const oL of originLrt) {
          const mtrCode = oL.stop.mtrCode;
          if (!mtrCode) {
            // 先輕鐵到最近有轉乘的站
            for (const hub of HK_LRT_STOPS.filter((s) => s.mtrCode)) {
              const lrtRide = this._dijkstraLrt(oL.stop.code, hub.code);
              if (!lrtRide) continue;
              for (const dSt of destMtrNear) {
                if (hub.mtrCode === dSt.station.code) continue;
                const railPath = this._dijkstraMtr(hub.mtrCode, dSt.station.code);
                if (!railPath) continue;
                const hubLoc = new Location({ name: hub.name + '（輕鐵）', lat: hub.lat, lng: hub.lng, source: 'lrt' });
                const mtrHub = this._mtrGraph.stationByCode.get(hub.mtrCode);
                if (!mtrHub) continue;
                const mtrHubLoc = new Location({ name: mtrHub.name, lat: mtrHub.lat, lng: mtrHub.lng, source: 'mtr' });
                const segs = [];
                const w0 = await this._getWalkingMinutes(safeOrigin, oL.loc);
                if (w0 > 0 && !this._isNearLrtStop(safeOrigin, oL.stop, 120)) {
                  segs.push(new RouteSegment({ mode: TransportMode.WALK, from: safeOrigin, to: oL.loc, duration: w0 }));
                }
                if (oL.stop.code !== hub.code) {
                  segs.push(...this._lrtLegsToSegments(lrtRide.legs));
                }
                segs.push(
                  new RouteSegment({
                    mode: TransportMode.WALK,
                    from: hubLoc,
                    to: mtrHubLoc,
                    duration: Math.max(1, Math.ceil((hubLoc.distanceTo(mtrHubLoc) ?? 80) / this._walkingSpeedMpm())),
                  })
                );
                segs.push(...this._railLegsToSegments(railPath.legs, mtrHub));
                const wEnd = await this._getWalkingMinutes(dSt.loc, destination);
                if (wEnd > 0 && !this._isAtMtrStation(destination, dSt.loc, dSt.station)) {
                  segs.push(new RouteSegment({ mode: TransportMode.WALK, from: dSt.loc, to: destination, duration: wEnd }));
                }
                candidates.push(
                  new Itinerary({
                    label: `輕鐵 → ${hub.name} 轉港鐵（往${dSt.station.name.replace('站', '')}）`,
                    segments: this._pruneTrivialWalkSegments(segs, safeOrigin, destination),
                  })
                );
              }
            }
          } else {
            for (const dSt of destMtrNear) {
              if (mtrCode === dSt.station.code) continue;
              const railPath = this._dijkstraMtr(mtrCode, dSt.station.code);
              if (!railPath) continue;
              const mtrHub = this._mtrGraph.stationByCode.get(mtrCode);
              if (!mtrHub) continue;
              const mtrHubLoc = new Location({ name: mtrHub.name, lat: mtrHub.lat, lng: mtrHub.lng, source: 'mtr' });
              const segs = [];
              const w0 = await this._getWalkingMinutes(safeOrigin, oL.loc);
              if (w0 > 0 && !this._isNearLrtStop(safeOrigin, oL.stop, 120)) {
                segs.push(new RouteSegment({ mode: TransportMode.WALK, from: safeOrigin, to: oL.loc, duration: w0 }));
              }
              segs.push(
                new RouteSegment({
                  mode: TransportMode.WALK,
                  from: oL.loc,
                  to: mtrHubLoc,
                  duration: Math.max(1, Math.ceil((oL.loc.distanceTo(mtrHubLoc) ?? 80) / this._walkingSpeedMpm())),
                })
              );
              segs.push(...this._railLegsToSegments(railPath.legs, mtrHub));
              const wEnd = await this._getWalkingMinutes(dSt.loc, destination);
              if (wEnd > 0 && !this._isAtMtrStation(destination, dSt.loc, dSt.station)) {
                segs.push(new RouteSegment({ mode: TransportMode.WALK, from: dSt.loc, to: destination, duration: wEnd }));
              }
              candidates.push(
                new Itinerary({
                  label: `輕鐵／港鐵轉乘（${oL.stop.name} → ${dSt.station.name.replace('站', '')}）`,
                  segments: this._pruneTrivialWalkSegments(segs, safeOrigin, destination),
                })
              );
            }
          }
        }
      }
    }

    // 3. 巴士／專線小巴直達路線方案
    const allowBus = this._modeEnabled('bus');
    const allowMinibus = this._modeEnabled('minibus');
    if (allowBus || allowMinibus) {
      const directKmbRoutes = this._findKmbRoutesBetween(safeOrigin, destination, {
        maxOriginDist: 1200,
        maxDestDist: 1200,
        limit: 20,
      }).filter((kmb) => (kmb.mode === 'minibus' ? allowMinibus : allowBus));

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
    }

    // 4. 港鐵 + 專線小巴 / 港鐵 + 九巴 / 跨站多模式接駁（至少產生多條可比較方案，涵蓋 MTR+小巴、MTR+巴士等）
    const hubSearchList = this._modeEnabled('mtr')
      ? this._findNearbyMtrStations(destination, 6500, 6)
      : [];
    const feederByMode = new Map(); // key: `${mode}:${hubCode}:${route}` -> best candidate

    if (this._modeEnabled('mtr') && (allowBus || allowMinibus)) {
    for (const oSt of originMtrList.slice(0, 2)) {
      for (const hubMtr of hubSearchList) {
        if (oSt.station.code === hubMtr.station.code) continue;
        const railPath = this._dijkstraMtr(oSt.station.code, hubMtr.station.code);
        if (!railPath) continue;

        const feederCandidates = this._findKmbRoutesBetween(hubMtr.loc, destination, {
          maxOriginDist: 1200,
          maxDestDist: 1200,
          limit: 30,
        }).filter((f) => (f.mode === 'minibus' ? allowMinibus : allowBus));

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

    // 保留所有找到的接駁方案（去重後已在 feederByMode）
    const allFeeders = [...feederByMode.values()].sort((a, b) => a.estTotalMin - b.estTotalMin);
    for (const f of allFeeders) {
      candidates.push(
        new Itinerary({
          label: f.label,
          segments: f.segments,
        })
      );
    }
    } // end mtr + feeder modes

    // 5. 若可行方案仍少於 3 條，補充其他合理接駁／巴士方案（如 巴士 + 步行 或 小巴 + 步行）
    const practicalCount = candidates.filter((c) => !c.isImpracticalWalk).length;
    if (practicalCount < 3 && (allowBus || allowMinibus)) {
      const altRoutes = this._findKmbRoutesBetween(safeOrigin, destination, {
        maxOriginDist: 2200,
        maxDestDist: 1500,
        limit: 20,
      }).filter((alt) => (alt.mode === 'minibus' ? allowMinibus : allowBus));
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
    const busXfer = (allowBus || allowMinibus)
      ? this._findBusToBusTransfer(safeOrigin, destination)
      : null;
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

    const norm = (s) =>
      String(s || '')
        .replace(/站.*$/, '')
        .replace(/（.*）/, '')
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
    const isSamePlace = (a, b) => {
      if (!a || !b) return false;
      if (a.name && b.name && (a.name === b.name || norm(a.name) === norm(b.name))) return true;
      if (a.hasCoords && b.hasCoords) {
        const d = a.distanceTo(b);
        // 站體／出入口範圍內視為同一地點
        if (d != null && d <= 120) return true;
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
      const isAtDest =
        i === segments.length - 1 && (isSamePlace(seg.to, destination) || norm(fromName) === norm(toName));
      const isTrivialHop =
        norm(fromName) === norm(toName) ||
        (dist != null && dist <= 120 && !seg.exit) ||
        (seg.duration != null && seg.duration <= 1);

      // 起訖本質為港鐵站時，去掉多餘站外步行
      if ((isAtOrigin || isAtDest || isTrivialHop) && (seg.duration <= 3 || isSamePlace(seg.from, seg.to))) {
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

  /**
   * 判斷地點是否本質上就是該港鐵站（名稱匹配或極近距離），
   * 若是則不應插入「站外步行」段。
   */
  _isAtMtrStation(loc, stationLoc, station) {
    if (!loc || !stationLoc) return false;
    const norm = (s) =>
      String(s || '')
        .replace(/站.*$/, '')
        .replace(/（.*）/, '')
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
    const locName = norm(loc.name);
    const stName = norm(station?.name || stationLoc.name);
    if (locName && stName && (locName === stName || locName.includes(stName) || stName.includes(locName))) {
      return true;
    }
    // 來源標記為 mtr，或距離極近（站體範圍內）
    if (loc.source === 'mtr') return true;
    const d = loc.distanceTo?.(stationLoc);
    if (d != null && d <= 120) return true;
    return false;
  }

  async _buildMtrSegments(origin, destination, oSt, dSt, railPath) {
    const originAtStation = this._isAtMtrStation(origin, oSt.loc, oSt.station);
    const destAtStation = this._isAtMtrStation(destination, dSt.loc, dSt.station);

    const walkToMtrMin = originAtStation ? 0 : await this._getWalkingMinutes(origin, oSt.loc);
    const walkFromMtrMin = destAtStation ? 0 : await this._getWalkingMinutes(dSt.loc, destination);
    const exit = destAtStation ? null : this._pickExitForDestination(dSt.station, destination);

    const raw = [];

    // 起點若已在港鐵站，不插入步行段
    if (!originAtStation && walkToMtrMin > 0) {
      raw.push(
        new RouteSegment({
          mode: TransportMode.WALK,
          from: origin,
          to: oSt.loc,
          duration: walkToMtrMin,
        })
      );
    }

    raw.push(...this._railLegsToSegments(railPath.legs, oSt.station));

    // 終點若已在港鐵站，不插入步行段
    if (!destAtStation && walkFromMtrMin > 0) {
      raw.push(
        new RouteSegment({
          mode: TransportMode.WALK,
          from: dSt.loc,
          to: destination,
          duration: walkFromMtrMin,
          exit,
        })
      );
    }

    return this._pruneTrivialWalkSegments(raw, origin, destination);
  }

  /**
   * 九巴路網：一律以官方 data.etabus.gov.hk API 為準。
   * - /stop、/route-stop、/route 全量拉取後快取
   * - 內建 HK_KMB_ROUTES_DATA 僅補充「專線小巴」（KMB API 不含小巴）
   * - 不再用內建資料覆蓋任何九巴路線
   */
  async _fetchKmbJson(path) {
    // Prefer local dev proxy (/api/kmb) — no browser CORS
    const proxyBase = CONFIG.kmbProxyBase; // e.g. '/api/kmb'
    if (proxyBase) {
      try {
        const res = await fetch(`${proxyBase}${path}`, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const json = await res.json();
          return json?.data ?? json;
        }
      } catch (e) {
        console.warn('[RoutePlanning] kmb proxy failed for', path, e?.message || e);
      }
    }
    // Direct / public CORS proxy (often blocked)
    const json = await fetchJsonWithCorsFallback(`${CONFIG.kmbApi}${path}`, { timeoutMs: 25000 });
    return json?.data ?? json;
  }

  async _ensureKmbNetworkLoaded() {
    if (this._stopsMap && this._groupedRoutes && this._kmbFromApi) return;

    const cacheKey = 'kmb_network_v6_api';
    const cached = this.storage?.get(cacheKey);
    if (
      cached &&
      cached.savedAt &&
      Date.now() - cached.savedAt < CONFIG.kmbStaticCacheTtlMs &&
      cached.stops?.length &&
      cached.routeStops?.length
    ) {
      this._hydrateKmbCache(cached, { fromApi: true });
      return;
    }

    // 1) Live online via /api/kmb proxy (node server.js) or CORS fallback
    try {
      const [stops, routeStops, routes] = await Promise.all([
        this._fetchKmbJson('/stop/'),
        this._fetchKmbJson('/route-stop/'),
        this._fetchKmbJson('/route/'),
      ]);
      if (Array.isArray(stops) && stops.length && Array.isArray(routeStops) && routeStops.length) {
        const payload = {
          savedAt: Date.now(),
          stops,
          routeStops,
          routes: Array.isArray(routes) ? routes : [],
        };
        try {
          this.storage?.set(cacheKey, payload);
        } catch {
          /* quota — large payload may not fit localStorage */
        }
        this._hydrateKmbCache(payload, { fromApi: true });
        console.info('[RoutePlanning] KMB network loaded from online API');
        return;
      }
    } catch (e) {
      console.warn('[RoutePlanning] online KMB API failed:', e?.message || e);
    }

    // 2) Same-origin official snapshot data/kmb/*.json (offline / Live Preview without proxy)
    try {
      const base = new URL('data/kmb/', globalThis.location?.href || 'http://localhost/');
      const [stops, routeStops, routes] = await Promise.all([
        fetch(new URL('stop.json', base)).then((r) => {
          if (!r.ok) throw new Error(`stop.json HTTP ${r.status}`);
          return r.json();
        }),
        fetch(new URL('route-stop.json', base)).then((r) => {
          if (!r.ok) throw new Error(`route-stop.json HTTP ${r.status}`);
          return r.json();
        }),
        fetch(new URL('route.json', base)).then((r) => {
          if (!r.ok) throw new Error(`route.json HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      if (Array.isArray(stops) && stops.length && Array.isArray(routeStops) && routeStops.length) {
        const payload = {
          savedAt: Date.now(),
          stops,
          routeStops,
          routes: Array.isArray(routes) ? routes : [],
        };
        this._hydrateKmbCache(payload, { fromApi: true });
        console.info('[RoutePlanning] KMB network loaded from local snapshot');
        return;
      }
    } catch (e) {
      console.warn('[RoutePlanning] local KMB snapshot failed:', e?.message || e);
    }

    throw new Error('無法載入九巴路網（線上 API 與本地快照均失敗）');
  }

  /** 僅在 API 完全失敗時的最後手段：只載入內建專線小巴，不含九巴 */
  _hydrateMinibusOnlyFallback() {
    const stopsMap = new Map();
    const grouped = new Map();

    for (const r of HK_KMB_ROUTES_DATA) {
      if (!r || r.mode !== 'minibus' || !Array.isArray(r.stops)) continue;
      const key = `${r.route}|1|${r.serviceType}`;
      const seqStops = r.stops.map((st, i) => {
        stopsMap.set(
          st.id,
          new Location({
            name: st.name,
            lat: st.lat,
            lng: st.lng,
            stopId: st.id,
            source: 'minibus',
          })
        );
        return { seq: i + 1, stopId: st.id };
      });
      grouped.set(key, {
        route: r.route,
        mode: 'minibus',
        bound: '1',
        serviceType: r.serviceType,
        origTc: r.origTc,
        destTc: r.destTc,
        stops: seqStops,
      });
    }

    this._stopsMap = stopsMap;
    this._groupedRoutes = grouped;
    this._routeInfoMap = new Map();
    this._kmbFromApi = false;
  }

  _hydrateKmbCache(payload, { fromApi = false } = {}) {
    const stopsMap = new Map();
    for (const s of payload.stops ?? []) {
      const lat = Number(s.lat);
      const lng = Number(s.long ?? s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopsMap.set(
        s.stop,
        new Location({
          name: s.name_tc || s.name_en || s.stop,
          lat,
          lng,
          stopId: s.stop,
          address: s.name_en || '',
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
          serviceType: String(row.service_type || '1'),
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

    // 專線小巴不在九巴 API 內，僅補充 mode=minibus 的內建路線
    for (const r of HK_KMB_ROUTES_DATA) {
      if (!r || r.mode !== 'minibus' || !Array.isArray(r.stops)) continue;
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
            source: 'minibus',
          })
        );
        return { seq: i + 1, stopId: st.id };
      });
      grouped.set(key, {
        route: r.route,
        mode: 'minibus',
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
    this._kmbFromApi = !!fromApi;
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
      // Collect candidate board / alight indices on this route variant
      const boards = [];
      const alights = [];
      for (let i = 0; i < grp.stops.length; i++) {
        const sid = grp.stops[i].stopId;
        if (nearOrigin.has(sid)) boards.push({ idx: i, stopId: sid, dist: nearOrigin.get(sid) });
        if (nearDest.has(sid)) alights.push({ idx: i, stopId: sid, dist: nearDest.get(sid) });
      }
      if (!boards.length || !alights.length) continue;

      // Best pair: alight after board, minimise walk + mild stop-span cost
      let best = null;
      for (const b of boards) {
        for (const a of alights) {
          if (a.idx <= b.idx) continue;
          const stopSpan = a.idx - b.idx;
          const walkPenalty = b.dist + a.dist;
          // stopSpan weight kept low so medium routes (91M ~7 stops) are not crushed by 91B (1 stop)
          const score = walkPenalty * 0.03 + stopSpan * 0.35 + stopSpan * stopSpan * 0.02;
          if (!best || score < best.score) {
            best = { score, board: b, alight: a, stopSpan, walkPenalty };
          }
        }
      }
      if (!best) continue;

      const bLoc = this._stopsMap.get(best.board.stopId);
      const aLoc = this._stopsMap.get(best.alight.stopId);
      if (!bLoc || !aLoc) continue;

      let pathMeters = 0;
      for (let i = best.board.idx; i < best.alight.idx; i++) {
        const a = this._stopsMap.get(grp.stops[i].stopId);
        const b = this._stopsMap.get(grp.stops[i + 1]?.stopId);
        if (a && b) {
          const d = a.distanceTo(b);
          if (d != null) pathMeters += d;
        }
      }

      matches.push({
        score: best.score,
        route: grp.route,
        mode: grp.mode || 'bus',
        serviceType: grp.serviceType,
        destTc: grp.destTc,
        stopSpan: best.stopSpan,
        pathMeters,
        boardIdx: best.board.idx,
        alightIdx: best.alight.idx,
        boardStop: { stopId: best.board.stopId, name: bLoc.name, loc: bLoc },
        alightStop: { stopId: best.alight.stopId, name: aLoc.name, loc: aLoc },
      });
    }

    // Prefer better score; for same route keep best bound only then return top-N unique routes + extras
    matches.sort((a, b) => a.score - b.score);
    const byRoute = new Map();
    const ordered = [];
    for (const m of matches) {
      if (!byRoute.has(m.route)) {
        byRoute.set(m.route, m);
        ordered.push(m);
      }
    }
    // Primary: unique routes; if limit allows, also add alternate bounds of strong matches
    const out = ordered.slice(0, limit);
    if (out.length < limit) {
      for (const m of matches) {
        if (out.length >= limit) break;
        if (!out.includes(m)) out.push(m);
      }
    }
    return out;
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
                const pathMetersFirst = this._pathMetersAlong(f.grp, f.boardIdx, i);
              const pathMetersSecond = this._pathMetersAlong(s.grp, j, s.alightIdx);
              best = {
                  score,
                  first: {
                    route: f.grp.route,
                    mode: f.grp.mode || 'bus',
                    serviceType: f.grp.serviceType,
                    destTc: f.grp.destTc,
                    stopSpan: i - f.boardIdx,
                    pathMeters: pathMetersFirst,
                    boardStop: { stopId: f.boardStopId, name: f.boardLoc.name, loc: f.boardLoc },
                    alightStop: { stopId: midId, name: midLoc.name, loc: midLoc },
                  },
                  second: {
                    route: s.grp.route,
                    mode: s.grp.mode || 'bus',
                    serviceType: s.grp.serviceType,
                    destTc: s.grp.destTc,
                    stopSpan: s.alightIdx - j,
                    pathMeters: pathMetersSecond,
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

  _pathMetersAlong(grp, fromIdx, toIdx) {
    if (!grp?.stops || fromIdx == null || toIdx == null || toIdx <= fromIdx) return 0;
    let meters = 0;
    for (let i = fromIdx; i < toIdx; i++) {
      const a = this._stopsMap?.get(grp.stops[i].stopId);
      const b = this._stopsMap?.get(grp.stops[i + 1]?.stopId);
      if (a && b) {
        const d = a.distanceTo(b);
        if (d != null) meters += d;
      }
    }
    return meters;
  }

  /**
   * 巴士車程估計：優先使用九巴站序沿線路徑距離（API 站點座標累加），
   * 再輔以站數；官方 API 不提供站間行程時間表。
   * 假設市區平均約 18–22 km/h（含停站），約 300–360 m/min。
   */
  _estimateBusLegMinutes(kmb) {
    const stopSpan = Math.max(1, Number(kmb.stopSpan) || 1);
    let pathMeters = Number(kmb.pathMeters) || 0;
    if (!pathMeters || pathMeters <= 0) {
      pathMeters = kmb.boardStop?.loc?.distanceTo?.(kmb.alightStop?.loc) ?? 0;
      // 直線距離補正為路網距離
      pathMeters *= 1.35;
    }
    // ~20 km/h 平均（含停站）→ 約 333 m/min
    const byPath = pathMeters / 333;
    // 每站間隔約 1.2–1.5 分鐘（短程較密）
    const byStops = stopSpan * 1.35;
    return Math.max(3, Math.round(Math.max(byPath, byStops * 0.85)));
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

    return Math.max(1, Math.ceil((dist * 1.25) / this._walkingSpeedMpm()));
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


  _buildLrtGraph() {
    const stopByCode = new Map(HK_LRT_STOPS.map((s) => [s.code, s]));
    const adj = new Map();
    for (const s of HK_LRT_STOPS) adj.set(s.code, []);
    for (const e of HK_LRT_EDGES) {
      if (!stopByCode.has(e.from) || !stopByCode.has(e.to)) continue;
      const routes = e.routes || [];
      adj.get(e.from).push({ to: e.to, minutes: e.min, routes });
      adj.get(e.to).push({ to: e.from, minutes: e.min, routes });
    }
    return { stopByCode, adj };
  }

  _findNearbyLrtStops(loc, maxDist = 900, limit = 3) {
    if (!loc?.hasCoords) return [];
    const all = HK_LRT_STOPS.map((st) => {
      const stLoc = new Location({ name: st.name + '（輕鐵）', lat: st.lat, lng: st.lng, source: 'lrt' });
      return { stop: st, loc: stLoc, distance: loc.distanceTo(stLoc) ?? Infinity };
    }).sort((a, b) => a.distance - b.distance);
    return all.filter((x) => x.distance <= maxDist).slice(0, limit);
  }

  _isNearLrtStop(loc, stop, meters = 120) {
    if (!loc?.hasCoords || !stop) return false;
    const stLoc = new Location({ name: stop.name, lat: stop.lat, lng: stop.lng });
    const d = loc.distanceTo(stLoc);
    return d != null && d <= meters;
  }

  _dijkstraLrt(startCode, goalCode) {
    const { stopByCode, adj } = this._lrtGraph;
    if (!stopByCode.has(startCode) || !stopByCode.has(goalCode)) return null;
    if (startCode === goalCode) return { legs: [], totalCost: 0 };

    const dist = new Map([[startCode, 0]]);
    const prev = new Map();
    const pq = [{ code: startCode, cost: 0 }];
    const seen = new Set();

    while (pq.length) {
      pq.sort((a, b) => a.cost - b.cost);
      const cur = pq.shift();
      if (seen.has(cur.code)) continue;
      seen.add(cur.code);
      if (cur.code === goalCode) break;
      for (const edge of adj.get(cur.code) ?? []) {
        const nextCost = cur.cost + edge.minutes;
        if (!dist.has(edge.to) || nextCost < dist.get(edge.to)) {
          dist.set(edge.to, nextCost);
          prev.set(edge.to, { from: cur.code, minutes: edge.minutes, routes: edge.routes });
          pq.push({ code: edge.to, cost: nextCost });
        }
      }
    }

    if (!dist.has(goalCode)) return null;
    const steps = [];
    let code = goalCode;
    while (code !== startCode) {
      const p = prev.get(code);
      if (!p) return null;
      steps.push({ fromCode: p.from, toCode: code, minutes: p.minutes, routes: p.routes });
      code = p.from;
    }
    steps.reverse();

    const legs = [];
    for (const step of steps) {
      const last = legs[legs.length - 1];
      const routeHint = (step.routes && step.routes[0]) || '輕鐵';
      if (last && last.routes?.some((r) => step.routes?.includes(r))) {
        last.toCode = step.toCode;
        last.minutes += step.minutes;
      } else {
        legs.push({
          fromCode: step.fromCode,
          toCode: step.toCode,
          minutes: step.minutes,
          routes: step.routes || [],
          routeLabel: routeHint,
        });
      }
    }
    return { legs, totalCost: dist.get(goalCode) };
  }

  _lrtLegsToSegments(legs) {
    const { stopByCode } = this._lrtGraph;
    const segs = [];
    for (const leg of legs) {
      const fromSt = stopByCode.get(leg.fromCode);
      const toSt = stopByCode.get(leg.toCode);
      if (!fromSt || !toSt) continue;
      const routeNo = leg.routeLabel || leg.routes?.[0] || '';
      segs.push(
        new RouteSegment({
          mode: TransportMode.LRT,
          from: new Location({ name: fromSt.name + '（輕鐵）', lat: fromSt.lat, lng: fromSt.lng, source: 'lrt' }),
          to: new Location({ name: toSt.name + '（輕鐵）', lat: toSt.lat, lng: toSt.lng, source: 'lrt' }),
          duration: Math.max(1, leg.minutes),
          route: routeNo ? `輕鐵 ${routeNo}` : '輕鐵',
          direction: `往 ${toSt.name}`,
          boardStop: fromSt.name,
          alightStop: toSt.name,
          stopId: fromSt.stopId,
          lrtStopId: fromSt.stopId,
        })
      );
    }
    return segs;
  }

  async _buildLrtSegments(origin, destination, oL, dL, lrtPath) {
    const originAt = this._isNearLrtStop(origin, oL.stop, 120);
    const destAt = this._isNearLrtStop(destination, dL.stop, 120);
    const raw = [];
    if (!originAt) {
      const w = await this._getWalkingMinutes(origin, oL.loc);
      if (w > 0) {
        raw.push(new RouteSegment({ mode: TransportMode.WALK, from: origin, to: oL.loc, duration: w }));
      }
    }
    raw.push(...this._lrtLegsToSegments(lrtPath.legs));
    if (!destAt) {
      const w = await this._getWalkingMinutes(dL.loc, destination);
      if (w > 0) {
        raw.push(new RouteSegment({ mode: TransportMode.WALK, from: dL.loc, to: destination, duration: w }));
      }
    }
    return this._pruneTrivialWalkSegments(raw, origin, destination);
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
