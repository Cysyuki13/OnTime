export class DepartureCalculator {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.getBufferMinutes]  extra minutes added after each segment
   * @param {() => number} [opts.getArriveBeforeMinutes]  minutes to arrive early vs target
   */
  constructor({ getBufferMinutes = () => 0, getArriveBeforeMinutes = () => 0 } = {}) {
    this.getBufferMinutes = getBufferMinutes;
    this.getArriveBeforeMinutes = getArriveBeforeMinutes;
  }

  compute(itinerary, now, targetArrival) {
    const it = itinerary.clone();
    const norm = (s) => String(s || '').replace(/站.*$/, '').replace(/（.*）/, '').trim();
    it.segments = it.segments.filter((seg, idx) => {
      if (seg.isTransit()) return true;
      const samePlace = norm(seg.from?.name) && norm(seg.from?.name) === norm(seg.to?.name);
      const isEdgeWalk = (idx === 0 || idx === it.segments.length - 1) && samePlace && (seg.duration ?? 0) <= 2;
      return !isEdgeWalk;
    });

    const bufferMin = Math.max(0, Number(this.getBufferMinutes?.() ?? 0) || 0);
    const arriveBefore = Math.max(0, Number(this.getArriveBeforeMinutes?.() ?? 0) || 0);

    // Effective deadline: user wants to be there `arriveBefore` minutes before targetArrival
    const effectiveTarget =
      targetArrival instanceof Date && !Number.isNaN(targetArrival.getTime())
        ? new Date(targetArrival.getTime() - arriveBefore * 60_000)
        : targetArrival;

    let cursor = new Date(now);
    const segs = it.segments;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (!seg.isTransit()) {
        seg.departAt = new Date(cursor);
        cursor = new Date(cursor.getTime() + seg.duration * 60_000);
        seg.arriveAt = new Date(cursor);
      } else {
        if (seg.eta && seg.eta > cursor) {
          seg.waitTime = (seg.eta - cursor) / 60_000;
          cursor = new Date(seg.eta);
        } else {
          seg.waitTime = 0;
        }
        seg.departAt = new Date(cursor);
        cursor = new Date(cursor.getTime() + seg.duration * 60_000);
        seg.arriveAt = new Date(cursor);
      }

      // Buffer after every segment except the last (covers transfer / unexpected delay)
      if (bufferMin > 0 && i < segs.length - 1) {
        cursor = new Date(cursor.getTime() + bufferMin * 60_000);
      }
    }

    it.estimatedArrival = cursor;
    it.totalDuration = Math.max(1, Math.round((cursor - now) / 60_000));
    it.bufferMinutesApplied = bufferMin;
    it.arriveBeforeMinutesApplied = arriveBefore;
    it.effectiveTargetArrival = effectiveTarget ? new Date(effectiveTarget) : null;

    // Latest departure so that estimated arrival hits the *effective* target
    if (effectiveTarget instanceof Date && !Number.isNaN(effectiveTarget.getTime())) {
      it.latestDeparture = new Date(effectiveTarget.getTime() - it.totalDuration * 60_000);
    } else if (targetArrival instanceof Date) {
      it.latestDeparture = new Date(targetArrival.getTime() - it.totalDuration * 60_000);
    } else {
      it.latestDeparture = null;
    }

    return it;
  }

  computeAll(itineraries, now, targetArrival) {
    const results = itineraries.map((it) => this.compute(it, now, targetArrival));
    results.sort((a, b) => {
      const aWalkPenalty = a.isImpracticalWalk ? 1 : 0;
      const bWalkPenalty = b.isImpracticalWalk ? 1 : 0;
      if (aWalkPenalty !== bWalkPenalty) return aWalkPenalty - bWalkPenalty;
      return (a.totalDuration ?? Infinity) - (b.totalDuration ?? Infinity);
    });
    return results;
  }
}
