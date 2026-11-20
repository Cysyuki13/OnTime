import { Location } from './Location.js';
import { Itinerary } from './Itinerary.js';
import { RouteSegment } from './RouteSegment.js';

export class CalendarEvent {
  constructor({
    id, title, origin = null, destination, targetArrival,
    itineraries = [], chosenItineraryId = null,
    createdAt = new Date(), notificationIds = [],
  } = {}) {
    this.id = id ?? crypto?.randomUUID?.() ?? `ev-${Date.now()}`;
    this.title = title;
    this.origin = origin;
    this.destination = destination;
    this.targetArrival = targetArrival;
    this.itineraries = itineraries;
    this.chosenItineraryId = chosenItineraryId;
    this.createdAt = createdAt;
    this.notificationIds = notificationIds;
  }

  get chosenItinerary() {
    return this.itineraries.find((i) => i.id === this.chosenItineraryId) ?? null;
  }

  get bestItinerary() {
    const valid = this.itineraries.filter((i) => Number.isFinite(i.totalDuration));
    const practical = valid.filter((i) => !i.isImpracticalWalk);
    const pool = practical.length ? practical : valid;
    if (!pool.length) return this.itineraries[0] ?? null;
    return pool.reduce((best, it) =>
      it.totalDuration < best.totalDuration ? it : best
    );
  }

  toJSON() {
    return {
      id: this.id, title: this.title,
      origin: this.origin ? this.origin.toJSON() : null,
      destination: this.destination.toJSON(),
      targetArrival: this.targetArrival.toISOString(),
      itineraries: this.itineraries.map((i) => i.toJSON()),
      chosenItineraryId: this.chosenItineraryId,
      createdAt: this.createdAt.toISOString(),
      notificationIds: this.notificationIds,
    };
  }

  static fromJSON(obj) {
    return new CalendarEvent({
      id: obj.id, title: obj.title,
      origin: obj.origin ? Location.fromJSON(obj.origin) : null,
      destination: Location.fromJSON(obj.destination),
      targetArrival: new Date(obj.targetArrival),
      itineraries: (obj.itineraries || []).map((i) => {
        const it = Itinerary.fromJSON(i);
        it.segments = (i.segments || []).map((s) => {
          const seg = new RouteSegment({
            mode: s.mode, from: Location.fromJSON(s.from), to: Location.fromJSON(s.to),
            duration: s.duration, waitTime: s.waitTime,
            eta: s.eta ? new Date(s.eta) : null,
            route: s.route, direction: s.direction,
            boardStop: s.boardStop, alightStop: s.alightStop,
            exit: s.exit, stopName: s.stopName,
            stopId: s.stopId, lineCode: s.lineCode,
            stationCode: s.stationCode, serviceType: s.serviceType,
            isRealEta: s.isRealEta ?? false,
          });
          seg.departAt = s.departAt ? new Date(s.departAt) : null;
          seg.arriveAt = s.arriveAt ? new Date(s.arriveAt) : null;
          return seg;
        });
        return it;
      }),
      chosenItineraryId: obj.chosenItineraryId,
      createdAt: new Date(obj.createdAt),
      notificationIds: obj.notificationIds || [],
    });
  }
}
