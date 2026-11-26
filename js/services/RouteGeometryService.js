/**
 * RouteGeometryService
 * 將 Itinerary（只含站點與時長）還原成可供 3D 沿路動畫使用的連續折線。
 *
 * 幾何來源優先次序：
 *  1. 港鐵／輕鐵：用 hkStations.js 的路段圖（BFS）重建逐站折線
 *  2. 步行：OSRM foot（已在本專案使用，支援 CORS）
 *  3. 巴士／小巴：OSRM driving，途經「上車站 → 下車站」作約束，避免直線切過海港
 *  4. 全部失敗：以帶弧度的二次曲線作視覺替代（不會中斷預覽）
 *
 * 幾何只用作視覺呈現，班次與時間仍以 Itinerary 的 segment 為準。
 */
import {
  HK_MTR_STATIONS,
  HK_MTR_LINE_EDGES,
  HK_LRT_STOPS,
  HK_LRT_EDGES,
} from '../data/hkStations.js';
import { HK_PLACES_DB } from '../data/hkPlacesDb.js';

export const ROUTE_MODE_COLORS = {
  walk: '#c8c9cb',
  mtr: '#d8a24a',
  bus: '#d0834f',
  minibus: '#86a06f',
  lrt: '#c45c26',
  taxi: '#8b8d90',
};

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';
const CACHE = new Map(); // key -> Promise<coords>
const MAX_POINTS_PER_LEG = 380;

const norm = (name) =>
  String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/站$/, '')
    .trim();

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

let _lookup = null;

function lookup() {
  if (_lookup) return _lookup;

  const mtrByCode = new Map();
  const mtrByName = new Map();
  for (const s of HK_MTR_STATIONS) {
    mtrByCode.set(s.code, s);
    if (!mtrByName.has(norm(s.name))) mtrByName.set(norm(s.name), s);
  }

  const lrtByCode = new Map();
  const lrtByName = new Map();
  for (const s of HK_LRT_STOPS) {
    lrtByCode.set(s.code, s);
    if (!lrtByName.has(norm(s.name))) lrtByName.set(norm(s.name), s);
  }

  const placeByName = new Map();
  for (const p of HK_PLACES_DB) {
    const key = norm(p.name);
    if (key && !placeByName.has(key)) placeByName.set(key, p);
  }

  _lookup = { mtrByCode, mtrByName, lrtByCode, lrtByName, placeByName };
  return _lookup;
}

/** 以名稱或代碼解析一個座標點（港鐵站／輕鐵站／地點庫） */
export function resolvePoint(name, { isLrt = false } = {}) {
  if (!name) return null;
  const L = lookup();
  const key = norm(name);

  if (isLrt) {
    const hit = L.lrtByName.get(key);
    if (hit) return { lat: hit.lat, lng: hit.lng, name: hit.name };
  }
  const mtr = L.mtrByName.get(key);
  if (mtr) return { lat: mtr.lat, lng: mtr.lng, name: mtr.name };

  const place = L.placeByName.get(key);
  if (place) return { lat: place.lat, lng: place.lng, name: place.name };

  // 後備：包含式比對（例如「旺角（朗豪坊）」→「旺角」）
  for (const [k, v] of L.mtrByName) {
    if (key.includes(k) || k.includes(key)) return { lat: v.lat, lng: v.lng, name: v.name };
  }
  return null;
}

function codeOf(name, isLrt) {
  if (!name) return null;
  const L = lookup();
  const key = norm(name);
  const hit = isLrt ? L.lrtByName.get(key) : L.mtrByName.get(key);
  return hit?.code ?? null;
}

function coordOfCode(code, isLrt) {
  const L = lookup();
  const s = isLrt ? L.lrtByCode.get(code) : L.mtrByCode.get(code);
  return s ? { lat: s.lat, lng: s.lng } : null;
}

/* ------------------------------------------------------------------ */
/* Rail chain (BFS on the segment graph)                               */
/* ------------------------------------------------------------------ */

const GRAPH_CACHE = new Map();

function railAdjacency(lineCode) {
  const cacheKey = lineCode || '__all__';
  if (GRAPH_CACHE.has(cacheKey)) return GRAPH_CACHE.get(cacheKey);

  const edges = lineCode
    ? HK_MTR_LINE_EDGES.filter((e) => e.lineCode === lineCode)
    : HK_MTR_LINE_EDGES;

  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  GRAPH_CACHE.set(cacheKey, adj);
  return adj;
}

function lrtAdjacency() {
  if (GRAPH_CACHE.has('LRT')) return GRAPH_CACHE.get('LRT');
  const adj = new Map();
  for (const e of HK_LRT_EDGES) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  GRAPH_CACHE.set('LRT', adj);
  return adj;
}

function bfs(adj, start, goal) {
  if (!start || !goal) return null;
  if (start === goal) return [start];
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of adj.get(cur) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!prev.has(goal)) return null;
  const chain = [];
  let cur = goal;
  while (cur != null) {
    chain.push(cur);
    cur = prev.get(cur);
  }
  return chain.reverse();
}

function railChain(segment) {
  const isLrt = segment.mode === 'lrt';
  const fromCode = codeOf(segment.from?.name, isLrt);
  const toCode = codeOf(segment.to?.name, isLrt);
  if (!fromCode || !toCode) return null;

  const adj = isLrt ? lrtAdjacency() : railAdjacency(segment.lineCode);
  let chain = bfs(adj, fromCode, toCode);
  if (!chain && !isLrt && segment.lineCode) chain = bfs(railAdjacency(null), fromCode, toCode);
  if (!chain) return null;

  const coords = chain.map((c) => coordOfCode(c, isLrt)).filter(Boolean);
  return coords.length >= 2 ? coords : null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function haversine(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pathDistance(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i += 1) d += haversine(coords[i - 1], coords[i]);
  return d;
}

/** 帶垂度的一次性替代線（OSRM 不可用時仍可預覽） */
function arcBetween(a, b, bow = 0.16) {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const ctrl = {
    lat: (a.lat + b.lat) / 2 - dLng * bow,
    lng: (a.lng + b.lng) / 2 + dLat * bow,
  };
  const out = [];
  const N = 24;
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const u = 1 - t;
    out.push({
      lat: u * u * a.lat + 2 * u * t * ctrl.lat + t * t * b.lat,
      lng: u * u * a.lng + 2 * u * t * ctrl.lng + t * t * b.lng,
    });
  }
  return out;
}

function chaikin(coords, iterations = 2) {
  let pts = coords;
  for (let k = 0; k < iterations; k += 1) {
    if (pts.length < 3) break;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p = pts[i];
      const q = pts[i + 1];
      out.push({ lat: 0.75 * p.lat + 0.25 * q.lat, lng: 0.75 * p.lng + 0.25 * q.lng });
      out.push({ lat: 0.25 * p.lat + 0.75 * q.lat, lng: 0.25 * p.lng + 0.75 * q.lng });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** 依距離重採樣，控制每一段的點數（3D 幾何與貼地取樣成本） */
function resample(coords, maxPoints = MAX_POINTS_PER_LEG) {
  if (coords.length < 2) return coords;
  const total = pathDistance(coords);
  const n = Math.max(2, Math.min(maxPoints, Math.ceil(total / 12) + 2));

  const out = [coords[0]];
  let segIdx = 1;
  let acc = 0;
  let target = total / (n - 1);
  let prev = coords[0];

  while (target < total - 1e-6 && segIdx < coords.length) {
    const a = coords[segIdx - 1];
    const b = coords[segIdx];
    const segLen = haversine(a, b);
    if (acc + segLen >= target) {
      const t = segLen > 0 ? (target - acc) / segLen : 0;
      const p = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      if (haversine(prev, p) > 1) out.push(p);
      prev = p;
      target += total / (n - 1);
    } else {
      acc += segLen;
      segIdx += 1;
    }
  }
  const last = coords[coords.length - 1];
  if (haversine(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

/* ------------------------------------------------------------------ */
/* OSRM                                                                */
/* ------------------------------------------------------------------ */

function uniqPoints(points) {
  const out = [];
  for (const p of points) {
    if (!p) continue;
    if (out.length && haversine(out[out.length - 1], p) < 35) continue;
    out.push(p);
  }
  return out;
}

async function osrmRoute(profile, points, timeoutMs = 7000) {
  const pts = uniqPoints(points);
  if (pts.length < 2) return null;

  const key = `${profile}|${pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const promise = (async () => {
    const path = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${OSRM_BASE}/${profile}/${path}?overview=full&geometries=geojson&continue_straight=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const json = await res.json();
      const coords = json?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) throw new Error('OSRM empty');
      return coords.map(([lng, lat]) => ({ lat, lng }));
    } finally {
      clearTimeout(timer);
    }
  })();

  CACHE.set(key, promise);
  try {
    return await promise;
  } catch (e) {
    CACHE.delete(key);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Leg building                                                        */
/* ------------------------------------------------------------------ */

function locationPoint(loc) {
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return resolvePoint(loc?.name);
}

async function legCoords(segment) {
  const isLrt = segment.mode === 'lrt';
  const a = locationPoint(segment.from);
  const b = locationPoint(segment.to);
  if (!a || !b) return null;

  if (segment.mode === 'mtr' || isLrt) {
    return railChain(segment) ?? arcBetween(a, b, 0.06);
  }

  if (!segment.isTransit()) {
    const walk = await osrmRoute('foot', [a, b]);
    return walk ?? arcBetween(a, b, 0.12);
  }

  const board = resolvePoint(segment.boardStop, { isLrt });
  const alight = resolvePoint(segment.alightStop, { isLrt });
  const drive = await osrmRoute('driving', [a, board, alight, b]);
  if (drive) return drive;

  // 巴士沒有公開 route shape，次選以站序中繼點拉直
  return arcBetween(a, b, 0.1);
}

/**
 * @param {object} itinerary
 * @param {{ originName?: string, destName?: string }} [meta]
 */
export async function buildRouteGeometry(itinerary, meta = {}) {
  const segments = itinerary?.segments ?? [];
  const jobs = segments.map((s) => legCoords(s).catch(() => null));
  const rawCoords = await Promise.all(jobs);

  const legs = [];
  let cursor = 0;
  let totalMinutes = 0;

  segments.forEach((seg, idx) => {
    const coords = rawCoords[idx];
    if (!coords || coords.length < 2) return;

    const smoothed = resample(chaikin(coords, 2), MAX_POINTS_PER_LEG);
    const distance = pathDistance(smoothed);
    if (distance < 20) return;

    const minutes = Math.max(0, Number(seg.duration) || 0);
    const wait = Math.max(0, Number(seg.waitTime) || 0);

    legs.push({
      mode: seg.mode,
      color: ROUTE_MODE_COLORS[seg.mode] ?? '#8b8d90',
      label: legLabel(seg),
      fromName: seg.from?.name ?? '',
      toName: seg.to?.name ?? '',
      route: seg.route ?? null,
      isTransit: !!seg.isTransit?.(),
      coordinates: smoothed,
      distance,
      minutes,
      waitMinutes: wait,
      startDistance: cursor,
      endDistance: cursor + distance,
      startMinute: totalMinutes,
    });

    cursor += distance;
    totalMinutes += minutes + wait;
  });

  if (!legs.length) {
    throw new Error('路線缺少可用的幾何資料');
  }

  const bbox = legs.reduce(
    (acc, leg) => {
      for (const c of leg.coordinates) {
        acc.minLat = Math.min(acc.minLat, c.lat);
        acc.maxLat = Math.max(acc.maxLat, c.lat);
        acc.minLng = Math.min(acc.minLng, c.lng);
        acc.maxLng = Math.max(acc.maxLng, c.lng);
      }
      return acc;
    },
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
  );

  const waypoints = [];
  for (const leg of legs) {
    waypoints.push({ ...leg.coordinates[0], name: leg.fromName, kind: 'via' });
  }
  const lastLeg = legs[legs.length - 1];
  waypoints.push({ ...lastLeg.coordinates[lastLeg.coordinates.length - 1], name: lastLeg.toName, kind: 'end' });
  if (waypoints.length > 1) waypoints[0].kind = 'start';

  return {
    legs,
    waypoints,
    bbox,
    totalDistance: cursor,
    totalMinutes,
    originName: meta.originName ?? legs[0].fromName,
    destName: meta.destName ?? lastLeg.toName,
  };
}

function legLabel(seg) {
  const modeLabel =
    { mtr: '港鐵', bus: '巴士', minibus: '小巴', lrt: '輕鐵', walk: '步行', taxi: '的士' }[seg.mode] ?? seg.mode;
  if (!seg.isTransit?.()) {
    return `${seg.from?.name ?? ''} → ${seg.to?.name ?? ''} · 步行 ${seg.duration ?? 0} 分鐘`.trim();
  }
  const route = seg.route ? `${seg.route} ` : '';
  const stops =
    seg.boardStop && seg.alightStop ? `${seg.boardStop} → ${seg.alightStop}` : `${seg.from?.name ?? ''} → ${seg.to?.name ?? ''}`;
  return `${modeLabel} ${route}${stops} · ${seg.duration ?? 0} 分鐘`.trim();
}
