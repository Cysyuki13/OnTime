export class DepartureCalculator {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.getBufferMinutes]  transfer / delay margin folded into latest-departure only
   * @param {() => number} [opts.getArriveBeforeMinutes]  minutes to arrive early vs target
   */
  constructor({ getBufferMinutes = () => 0, getArriveBeforeMinutes = () => 0 } = {}) {
    this.getBufferMinutes = getBufferMinutes;
    this.getArriveBeforeMinutes = getArriveBeforeMinutes;
  }

  compute(itinerary, now, targetArrival) {
    const it = itinerary.clone();
    const norm = (s) =>
      String(s || '')
        .replace(/站.*$/, '')
        .replace(/（.*）/, '')
        .trim();

    // Drop trivial edge walks that are the same place
    it.segments = it.segments.filter((seg, idx) => {
      if (seg.isTransit()) return true;
      const samePlace = norm(seg.from?.name) && norm(seg.from?.name) === norm(seg.to?.name);
      const isEdgeWalk =
        (idx === 0 || idx === it.segments.length - 1) && samePlace && (seg.duration ?? 0) <= 2;
      return !isEdgeWalk;
    });

    const bufferMin = Math.max(0, Number(this.getBufferMinutes?.() ?? 0) || 0);
    const arriveBefore = Math.max(0, Number(this.getArriveBeforeMinutes?.() ?? 0) || 0);
    const segs = it.segments;

    // Effective deadline: be there `arriveBefore` minutes before targetArrival
    const effectiveTarget =
      targetArrival instanceof Date && !Number.isNaN(targetArrival.getTime())
        ? new Date(targetArrival.getTime() - arriveBefore * 60_000)
        : targetArrival instanceof Date
          ? new Date(targetArrival)
          : null;

    // Pure in-motion duration (no silent inter-segment gaps)
    let pureTravelMin = 0;
    for (const seg of segs) {
      pureTravelMin += Math.max(0, Number(seg.duration) || 0);
    }
    // Transfer buffer is a planning margin between segments (not shown as a time jump on the timeline)
    const transferCount = Math.max(0, segs.length - 1);
    const marginMin = bufferMin * transferCount;
    const totalWithMargin = Math.max(1, pureTravelMin + marginMin);

    it.totalDuration = Math.max(1, pureTravelMin);
    it.bufferMinutesApplied = bufferMin;
    it.arriveBeforeMinutesApplied = arriveBefore;
    it.effectiveTargetArrival = effectiveTarget ? new Date(effectiveTarget) : null;

    // Latest departure so arrival (with margin) meets effective target
    if (effectiveTarget instanceof Date && !Number.isNaN(effectiveTarget.getTime())) {
      it.latestDeparture = new Date(effectiveTarget.getTime() - totalWithMargin * 60_000);
    } else if (targetArrival instanceof Date && !Number.isNaN(targetArrival.getTime())) {
      it.latestDeparture = new Date(targetArrival.getTime() - totalWithMargin * 60_000);
    } else {
      it.latestDeparture = null;
    }

    // Build a continuous timeline for display.
    // Prefer anchoring to latestDeparture (plan-to-arrive-by-target).
    // If latestDeparture is in the past relative to now, fall back to "leave now"
    // so the user still sees a sensible forward schedule.
    const anchor =
      it.latestDeparture instanceof Date && !Number.isNaN(it.latestDeparture.getTime())
        ? it.latestDeparture
        : new Date(now);

    const useLeaveNow = !(it.latestDeparture instanceof Date) || it.latestDeparture.getTime() < now.getTime() - 30_000;

    let cursor = useLeaveNow ? new Date(now) : new Date(anchor);

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const dur = Math.max(0, Number(seg.duration) || 0);

      if (!seg.isTransit()) {
        // Walk: continuous from previous cursor — no artificial gap
        seg.waitTime = 0;
        seg.departAt = new Date(cursor);
        cursor = new Date(cursor.getTime() + dur * 60_000);
        seg.arriveAt = new Date(cursor);
      } else {
        // Transit: only honour live ETA when we are in "leave now" mode
        if (useLeaveNow && seg.eta instanceof Date && seg.eta.getTime() > cursor.getTime()) {
          seg.waitTime = (seg.eta.getTime() - cursor.getTime()) / 60_000;
          cursor = new Date(seg.eta);
        } else {
          seg.waitTime = 0;
        }
        seg.departAt = new Date(cursor);
        cursor = new Date(cursor.getTime() + dur * 60_000);
        seg.arriveAt = new Date(cursor);
      }
      // Intentionally do NOT advance cursor by bufferMin here —
      // that caused the visible jump (e.g. bus 09:38 → walk 09:43).
      // Buffer is already folded into latestDeparture via totalWithMargin.
    }

    it.estimatedArrival = new Date(cursor);

    // Safety: if somehow estimated arrival is before latest departure, fix total/arrival
    if (
      it.latestDeparture instanceof Date &&
      it.estimatedArrival instanceof Date &&
      it.estimatedArrival.getTime() < it.latestDeparture.getTime()
    ) {
      it.estimatedArrival = new Date(it.latestDeparture.getTime() + pureTravelMin * 60_000);
    }

    // When anchored to latest departure, estimated arrival should land near effective target
    // (pure travel only — margin is safety, not shown as hanging around)
    if (
      !useLeaveNow &&
      effectiveTarget instanceof Date &&
      it.estimatedArrival instanceof Date
    ) {
      // Keep continuous segment times; estimatedArrival is end of pure travel from latestDeparture
      // latestDeparture was set with margin, so estimatedArrival = latest + pure ≈ effective - margin
      // which is correct (arrive a bit early by the buffer margin)
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
