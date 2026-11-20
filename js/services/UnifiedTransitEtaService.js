import { EtaService } from './EtaService.js';
import { TransportMode } from '../models/TransportMode.js';
import { MtrEtaService } from './MtrEtaService.js';
import { KmbEtaService } from './KmbEtaService.js';

export class UnifiedTransitEtaService extends EtaService {
  constructor() {
    super();
    this.mtrService = new MtrEtaService();
    this.kmbService = new KmbEtaService();
  }

  async getNextArrival(segment, now = new Date()) {
    try {
      if (segment.mode === TransportMode.MTR && segment.lineCode && segment.stationCode) {
        return await this.mtrService.getNextArrival(segment, now);
      }
      if (segment.mode === TransportMode.BUS && segment.stopId && segment.route) {
        return await this.kmbService.getNextArrival(segment, now);
      }
    } catch {
      // 外部 API 受限或離線時回退至班次推算
    }

    const headwayMin = segment.mode === TransportMode.MTR ? 4 : 9;
    return {
      eta: new Date(now.getTime() + headwayMin * 60_000),
      route: segment.route,
      stopName: segment.boardStop || segment.from?.name,
      isRealEta: false,
    };
  }
}
