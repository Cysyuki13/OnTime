export class DepartureCalculator {
  compute(itinerary, now, targetArrival) {
    const it = itinerary.clone();
    const norm = (s) => String(s || '').replace(/站.*$/, '').replace(/（.*）/, '').trim();
    it.segments = it.segments.filter((seg, idx) => {
      if (seg.isTransit()) return true;
      const samePlace = norm(seg.from?.name) && norm(seg.from?.name) === norm(seg.to?.name);
      const isEdgeWalk = (idx === 0 || idx === it.segments.length - 1) && samePlace && (seg.duration ?? 0) <= 2;
      return !isEdgeWalk;
    });
    let cursor = new Date(now);

    for (const seg of it.segments) {
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
    }

    it.estimatedArrival = cursor;
    it.totalDuration = Math.max(1, Math.round((cursor - now) / 60_000));
    it.latestDeparture = new Date(targetArrival.getTime() - it.totalDuration * 60_000);
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
