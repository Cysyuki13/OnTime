import { EtaService } from './EtaService.js';
import { CONFIG } from '../config.js';
import { MTR_STATION_NAMES } from '../data/hkStations.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

export class MtrEtaService extends EtaService {
  constructor({ lineCode = 'KTL', stationCode = 'YAT' } = {}) {
    super();
    this.defaultLineCode = lineCode;
    this.defaultStationCode = stationCode;
  }

  async getNextArrival(segment, now = new Date()) {
    const lineCode = segment?.lineCode || this.defaultLineCode;
    const stationCode = segment?.stationCode || this.defaultStationCode;

    const url = `${CONFIG.mtrApi}?line=${encodeURIComponent(lineCode)}&sta=${encodeURIComponent(stationCode)}`;
    const json = await fetchJsonWithCorsFallback(url, { timeoutMs: 3500 });
    const key = `${lineCode}-${stationCode}`;
    const block = json?.data?.[key];

    const trains = [...(block?.UP ?? []), ...(block?.DOWN ?? [])]
      .map((t) => ({
        time: new Date(String(t.time).replace(' ', 'T') + '+08:00'),
        dest: MTR_STATION_NAMES[t.dest] || t.dest,
        plat: t.plat,
      }))
      .filter((item) => !isNaN(item.time) && item.time >= new Date(now.getTime() - 30_000))
      .sort((a, b) => a.time - b.time);

    if (!trains.length) {
      throw new Error(`No live MTR trains for ${key}`);
    }

    const next = trains[0];
    return {
      eta: next.time,
      route: segment?.route || `港鐵 ${lineCode}`,
      stopName: segment?.boardStop || MTR_STATION_NAMES[stationCode] || stationCode,
      direction: next.dest ? `往 ${next.dest}（${next.plat}號月台）` : segment?.direction,
      isRealEta: true,
    };
  }
}
