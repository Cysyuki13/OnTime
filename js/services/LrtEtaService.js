import { EtaService } from './EtaService.js';
import { CONFIG } from '../config.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

/**
 * Light Rail Next Train API
 * https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id={id}
 */
export class LrtEtaService extends EtaService {
  constructor() {
    super();
    this.apiBase = CONFIG.lrtScheduleApi || 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule';
  }

  async getNextArrival(segment, now = new Date()) {
    const stationId = segment?.stopId || segment?.lrtStopId;
    if (!stationId) {
      throw new Error('缺少輕鐵 station_id');
    }

    const url = `${this.apiBase}?station_id=${encodeURIComponent(stationId)}&with_special=0`;
    let json = null;

    // Prefer local proxy if present
    if (CONFIG.lrtProxyBase) {
      try {
        const res = await fetch(
          `${CONFIG.lrtProxyBase}/getSchedule?station_id=${encodeURIComponent(stationId)}&with_special=0`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) json = await res.json();
      } catch {
        /* fall through */
      }
    }

    if (!json) {
      json = await fetchJsonWithCorsFallback(url, { timeoutMs: 4000 });
    }

    const candidates = [];
    for (const platform of json?.platform_list || []) {
      for (const row of platform.route_list || []) {
        const mins = this._parseMinutes(row.time_ch || row.time_en);
        if (mins == null) continue;
        const eta = new Date(now.getTime() + mins * 60_000);
        candidates.push({
          eta,
          destTc: row.dest_ch,
          route: row.route_no,
        });
      }
    }

    candidates.sort((a, b) => a.eta - b.eta);
    if (!candidates.length) {
      throw new Error(`輕鐵站 ${stationId} 目前無實時班次`);
    }

    const next = candidates[0];
    return {
      eta: next.eta,
      route: next.route || segment.route,
      stopName: segment?.boardStop || stationId,
      direction: next.destTc ? `往 ${next.destTc}` : segment?.direction,
      isRealEta: true,
    };
  }

  _parseMinutes(text) {
    if (text == null) return null;
    const s = String(text).trim();
    if (!s || s === '-') return 0; // arriving / departing
    const m = s.match(/(\d+)/);
    if (!m) return null;
    return Number(m[1]);
  }
}
