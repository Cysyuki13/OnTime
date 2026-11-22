import { EtaService } from './EtaService.js';
import { CONFIG } from '../config.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

/** Cache whether local /api/kmb proxy is usable (avoid spamming 404 in console). */
let _proxyOk = null; // null = unknown, true/false after probe
let _proxyProbePromise = null;

async function probeKmbProxy() {
  if (_proxyOk !== null) return _proxyOk;
  if (!CONFIG.kmbProxyBase) {
    _proxyOk = false;
    return false;
  }
  if (_proxyProbePromise) return _proxyProbePromise;
  _proxyProbePromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      // Lightweight known endpoint
      const res = await fetch(`${CONFIG.kmbProxyBase}/route/`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      _proxyOk = res.ok;
    } catch {
      _proxyOk = false;
    }
    return _proxyOk;
  })();
  return _proxyProbePromise;
}

export class KmbEtaService extends EtaService {
  constructor({ stopId = null, route = null, serviceType = '1' } = {}) {
    super();
    this.defaultStopId = stopId;
    this.defaultRoute = route;
    this.defaultServiceType = serviceType;
  }

  _normalizeRoute(route) {
    // "214 號巴士" / "KMB 214" → "214"
    const m = String(route || '').match(/([A-Za-z]*\d+[A-Za-z]*)/);
    return m ? m[1].toUpperCase() : String(route || '').trim().toUpperCase();
  }

  async _fetchEtaJson(path) {
    // 1) Local proxy when known-good
    const useProxy = await probeKmbProxy();
    if (useProxy && CONFIG.kmbProxyBase) {
      try {
        const res = await fetch(`${CONFIG.kmbProxyBase}${path}`, {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) return await res.json();
        // Proxy path exists but this stop/route failed — still try upstream
      } catch {
        _proxyOk = false;
      }
    }

    // 2) Direct / public CORS proxy
    return fetchJsonWithCorsFallback(`${CONFIG.kmbApi}${path}`, { timeoutMs: 4000 });
  }

  async getNextArrival(segment, now = new Date()) {
    const stopId = segment?.stopId || this.defaultStopId;
    const route = this._normalizeRoute(segment?.route || this.defaultRoute);
    let serviceType = String(segment?.serviceType || this.defaultServiceType || '1');

    if (!stopId || !route) {
      throw new Error('缺少九巴 stopId 或 route');
    }

    const serviceTypesToTry = [...new Set([serviceType, '1', '2', '3', '4', '5'])];
    let candidates = [];

    for (const st of serviceTypesToTry) {
      const path = `/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}/${encodeURIComponent(st)}`;
      let json = null;
      try {
        json = await this._fetchEtaJson(path);
      } catch {
        continue;
      }
      const rows = (json?.data ?? [])
        .filter((row) => row.eta)
        .map((row) => ({
          eta: new Date(row.eta),
          destTc: row.dest_tc,
          serviceType: st,
        }))
        .filter((item) => !isNaN(item.eta) && item.eta >= new Date(now.getTime() - 30_000));

      if (rows.length) {
        candidates = rows.sort((a, b) => a.eta - b.eta);
        serviceType = st;
        break;
      }
    }

    // Fallback: stop-level ETA then filter by route
    if (!candidates.length) {
      try {
        const json = await this._fetchEtaJson(`/stop-eta/${encodeURIComponent(stopId)}`);
        candidates = (json?.data ?? [])
          .filter((row) => row.eta && String(row.route || '').toUpperCase() === route)
          .map((row) => ({
            eta: new Date(row.eta),
            destTc: row.dest_tc,
            serviceType: String(row.service_type ?? serviceType),
          }))
          .filter((item) => !isNaN(item.eta) && item.eta >= new Date(now.getTime() - 30_000))
          .sort((a, b) => a.eta - b.eta);
      } catch {
        /* ignore */
      }
    }

    if (!candidates.length) {
      throw new Error(`KMB ${route} (${stopId}) 目前無實時班次`);
    }

    const next = candidates[0];
    return {
      eta: next.eta,
      route,
      stopName: segment?.boardStop || stopId,
      direction: next.destTc ? `往 ${next.destTc}` : segment?.direction,
      isRealEta: true,
    };
  }
}
