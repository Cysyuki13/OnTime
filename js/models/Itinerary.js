export class Itinerary {
  constructor({ segments = [], label = '方案', isImpracticalWalk = false, impracticalReason = '' } = {}) {
    this.id = crypto?.randomUUID?.() ?? `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.segments = segments;
    this.label = label;
    this.isImpracticalWalk = isImpracticalWalk;
    this.impracticalReason = impracticalReason;
    this.latestDeparture = null;
    this.estimatedArrival = null;
    this.totalDuration = null;

    this.remarks = '';
    this.notificationsEnabled = true;
    this.isCustomized = false;
    /** 使用者透過「編輯路徑」另存的路徑 */
    this.isUserSaved = false;
  }

  get transitSegments() {
    return this.segments.filter((s) => s.isTransit());
  }

  get walkMinutes() {
    return this.segments.filter((s) => !s.isTransit()).reduce((a, s) => a + s.duration, 0);
  }

  get summary() {
    const modes = [...new Set(this.segments.filter((s) => s.isTransit()).map((s) => s.mode))];
    if (!modes.length) {
      return this.isImpracticalWalk ? '步行（不建議·距離過遠）' : '步行';
    }
    return modes.map((m) => ({ mtr: '港鐵', bus: '巴士', minibus: '小巴', lrt: '輕鐵' }[m] ?? m)).join(' + ');
  }

  clone() {
    const it = new Itinerary({
      label: this.label,
      segments: this.segments.map((s) => s.clone()),
      isImpracticalWalk: this.isImpracticalWalk,
      impracticalReason: this.impracticalReason,
    });
    it.latestDeparture = this.latestDeparture ? new Date(this.latestDeparture) : null;
    it.estimatedArrival = this.estimatedArrival ? new Date(this.estimatedArrival) : null;
    it.totalDuration = this.totalDuration;
    it.remarks = this.remarks;
    it.notificationsEnabled = this.notificationsEnabled;
    it.isCustomized = this.isCustomized;
    it.isUserSaved = this.isUserSaved;
    return it;
  }

  toJSON() {
    return {
      id: this.id,
      label: this.label,
      isImpracticalWalk: this.isImpracticalWalk,
      impracticalReason: this.impracticalReason,
      segments: this.segments.map((s) => ({
        mode: s.mode, from: s.from.toJSON(), to: s.to.toJSON(),
        duration: s.duration, waitTime: s.waitTime,
        eta: s.eta ? s.eta.toISOString() : null,
        route: s.route, direction: s.direction,
        boardStop: s.boardStop, alightStop: s.alightStop,
        exit: s.exit, stopName: s.stopName,
        stopId: s.stopId, lineCode: s.lineCode,
        stationCode: s.stationCode, serviceType: s.serviceType,
        isRealEta: s.isRealEta,
        departAt: s.departAt ? s.departAt.toISOString() : null,
        arriveAt: s.arriveAt ? s.arriveAt.toISOString() : null,
      })),
      latestDeparture: this.latestDeparture?.toISOString() ?? null,
      estimatedArrival: this.estimatedArrival?.toISOString() ?? null,
      totalDuration: this.totalDuration,
      remarks: this.remarks,
      notificationsEnabled: this.notificationsEnabled,
      isCustomized: this.isCustomized,
      isUserSaved: this.isUserSaved,
    };
  }

  static fromJSON(obj) {
    const it = new Itinerary({
      label: obj.label,
      segments: [],
      isImpracticalWalk: obj.isImpracticalWalk ?? false,
      impracticalReason: obj.impracticalReason ?? '',
    });
    it.id = obj.id;
    it.latestDeparture = obj.latestDeparture ? new Date(obj.latestDeparture) : null;
    it.estimatedArrival = obj.estimatedArrival ? new Date(obj.estimatedArrival) : null;
    it.totalDuration = obj.totalDuration;
    it.remarks = obj.remarks ?? '';
    it.notificationsEnabled = obj.notificationsEnabled ?? true;
    it.isCustomized = obj.isCustomized ?? false;
    it.isUserSaved = obj.isUserSaved ?? false;
    return it;
  }
}
