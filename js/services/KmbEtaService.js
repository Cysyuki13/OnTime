import { EtaService } from './EtaService.js';
import { CONFIG } from '../config.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

export class KmbEtaService extends EtaService {
  constructor({ stopId = null, route = null, serviceType = '1' } = {}) {
    super();
    this.defaultStopId = stopId;
    this.defaultRoute = route;
    this.defaultServiceType = serviceType;
  }

  _normalizeRoute(route) {
    // "214 號巴士" / "KMB 214" → "214"
    const m = String(route || '').match(/([A-Za-z]*\d+[A-Za-z]?)/);
    return m ? m[1] : String(route || '');
  }

  async getNextArrival(segment, now = new Date()) {
    const stopId = segment?.stopId || this.defaultStopId;
    const route = this._normalizeRoute(segment?.route || this.defaultRoute);
    const serviceType = segment?.serviceType || this.defaultServiceType || '1';

    if (!stopId || !route) {
      throw new Error('缺少九巴 stopId 或 route');
    }

    const path = `/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}/${encodeURIComponent(serviceType)}`;
    let json = null;

    // 1) Local proxy (server.js) — same origin, no CORS
    if (CONFIG.kmbProxyBase) {
      try {
        const res = await fetch(`${CONFIG.kmbProxyBase}${path}`, {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) json = await res.json();
      } catch {
        /* fall through */
      }
    }

    // 2) Direct / public CORS proxy
    if (!json) {
      json = await fetchJsonWithCorsFallback(`${CONFIG.kmbApi}${path}`, { timeoutMs: 3500 });
    }

    const candidates = (json?.data ?? [])
      .filter((row) => row.eta)
      .map((row) => ({
        eta: new Date(row.eta),
        destTc: row.dest_tc,
      }))
      .filter((item) => !isNaN(item.eta) && item.eta >= new Date(now.getTime() - 30_000))
      .sort((a, b) => a.eta - b.eta);

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
