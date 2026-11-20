import { isTransit } from './TransportMode.js';

export class RouteSegment {
  constructor({
    mode, from, to, duration,
    waitTime = 0, eta = null,
    route = null,
    direction = null,
    boardStop = null,
    alightStop = null,
    exit = null,
    stopName = null,
    stopId = null,
    lineCode = null,
    stationCode = null,
    serviceType = '1',
    isRealEta = false,
  }) {
    this.mode = mode;
    this.from = from;
    this.to = to;
    this.duration = duration;
    this.waitTime = waitTime;
    this.eta = eta;
    this.route = route;
    this.direction = direction;
    this.boardStop = boardStop;
    this.alightStop = alightStop;
    this.exit = exit;
    this.stopName = stopName;
    this.stopId = stopId;
    this.lineCode = lineCode;
    this.stationCode = stationCode;
    this.serviceType = serviceType;
    this.isRealEta = isRealEta;
    this.departAt = null;
    this.arriveAt = null;
  }

  isTransit() { return isTransit(this.mode); }

  get displayDetail() {
    if (!this.isTransit()) {
      const parts = [];
      if (this.exit) parts.push(`經 ${this.exit} 出口`);
      if (this.from?.name && this.to?.name) {
        parts.push(`${this.from.name} → ${this.to.name}`);
      }
      parts.push(`步行 ${this.duration} 分鐘`);
      return parts.join(' · ');
    }
    const parts = [];
    if (this.route) parts.push(this.route);
    if (this.direction) parts.push(this.direction);
    if (this.boardStop && this.alightStop) {
      parts.push(`${this.boardStop} → ${this.alightStop}`);
    }
    if (this.exit) parts.push(`經 ${this.exit} 出口`);
    parts.push(`車程 ${this.duration} 分鐘`);
    if (this.eta) {
      const tag = this.isRealEta ? '實時 ETA' : '班次推算';
      parts.push(`${tag} ${this.eta.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}`);
    }
    return parts.join(' · ');
  }

  clone() {
    const s = new RouteSegment({
      mode: this.mode, from: this.from, to: this.to,
      duration: this.duration, waitTime: this.waitTime,
      eta: this.eta ? new Date(this.eta) : null,
      route: this.route, direction: this.direction,
      boardStop: this.boardStop, alightStop: this.alightStop,
      exit: this.exit, stopName: this.stopName,
      stopId: this.stopId, lineCode: this.lineCode,
      stationCode: this.stationCode, serviceType: this.serviceType,
      isRealEta: this.isRealEta,
    });
    s.departAt = this.departAt ? new Date(this.departAt) : null;
    s.arriveAt = this.arriveAt ? new Date(this.arriveAt) : null;
    return s;
  }
}
