import { CalendarEvent } from '../models/CalendarEvent.js';
import { Location } from '../models/Location.js';
import { RoutePlanningService } from './RoutePlanningService.js';
import { DepartureCalculator } from './DepartureCalculator.js';
import { CONFIG } from '../config.js';

export class EventService {
  constructor({ storage, etaService, notificationService }) {
    this.storage = storage;
    this.notificationService = notificationService;
    this.planner = new RoutePlanningService({ etaService, storage });
    this.calculator = new DepartureCalculator();
  }

  list() {
    const raw = this.storage.get('events', []);
    return raw.map((o) => CalendarEvent.fromJSON(o));
  }

  save(events) {
    this.storage.set('events', events.map((e) => e.toJSON()));
  }

  async createEvent({ title, origin, destination, targetArrival }) {
    const startLoc = origin?.hasCoords ? origin : new Location(CONFIG.defaultOrigin);

    const itineraries = await this.planner.plan(startLoc, destination, {
      arriveBy: targetArrival,
    });
    const computed = this.calculator.computeAll(itineraries, new Date(), targetArrival);

    const event = new CalendarEvent({
      title,
      origin: startLoc,
      destination,
      targetArrival,
      itineraries: computed,
    });
    event.chosenItineraryId = event.bestItinerary?.id ?? null;

    event.notificationIds = await this.notificationService.scheduleForEvent(event);

    const list = this.list();
    list.push(event);
    this.save(list);
    return event;
  }

  getById(id) {
    return this.list().find((e) => e.id === id) ?? null;
  }

  async selectItinerary(eventId, itineraryId) {
    const event = this.getById(eventId);
    if (!event) return null;
    event.chosenItineraryId = itineraryId;

    await this.notificationService.cancel(event.notificationIds ?? []);
    const chosen = event.chosenItinerary;
    event.notificationIds = chosen?.notificationsEnabled
      ? await this.notificationService.scheduleForEvent(event)
      : [];

    this._persist(event);
    return event;
  }

  updateRemarks(eventId, itineraryId, remarks) {
    const event = this.getById(eventId);
    const it = event?.itineraries.find((i) => i.id === itineraryId);
    if (!it) return null;
    it.remarks = remarks;
    it.isCustomized = true;
    this._persist(event);
    return event;
  }

  async toggleItineraryNotification(eventId, itineraryId, enabled) {
    const event = this.getById(eventId);
    const it = event?.itineraries.find((i) => i.id === itineraryId);
    if (!it) return null;
    it.notificationsEnabled = enabled;
    it.isCustomized = true;

    await this.notificationService.cancel(event.notificationIds ?? []);
    const target = event.chosenItinerary ?? event.bestItinerary;
    event.notificationIds = target?.notificationsEnabled
      ? await this.notificationService.scheduleForEvent(event)
      : [];

    this._persist(event);
    return event;
  }

  async updateEventDetails(eventId, { title, originName, destName, targetArrival }) {
    const event = this.getById(eventId);
    if (!event) return null;

    let needReplan = false;
    if (typeof title === 'string' && title.trim()) {
      event.title = title.trim();
    }
    if (typeof originName === 'string' && originName.trim() && originName.trim() !== (event.origin?.name || '')) {
      event.origin = new Location({
        name: originName.trim(),
        lat: event.origin?.lat ?? CONFIG.defaultOrigin.lat,
        lng: event.origin?.lng ?? CONFIG.defaultOrigin.lng,
        address: originName.trim(),
        source: event.origin?.source || 'manual',
      });
      needReplan = true;
    }
    if (typeof destName === 'string' && destName.trim() && destName.trim() !== (event.destination?.name || '')) {
      event.destination = new Location({
        name: destName.trim(),
        lat: event.destination?.lat ?? event.origin?.lat ?? CONFIG.defaultOrigin.lat,
        lng: event.destination?.lng ?? event.origin?.lng ?? CONFIG.defaultOrigin.lng,
        address: destName.trim(),
        source: event.destination?.source || 'manual',
      });
      needReplan = true;
    }
    if (targetArrival instanceof Date && !Number.isNaN(targetArrival.getTime())) {
      if (event.targetArrival?.getTime() !== targetArrival.getTime()) {
        event.targetArrival = targetArrival;
        needReplan = true;
      }
    }

    if (needReplan) {
      const startLoc = event.origin?.hasCoords ? event.origin : new Location(CONFIG.defaultOrigin);
      const fresh = await this.planner.plan(startLoc, event.destination, {
        arriveBy: event.targetArrival,
      });
      const chosenLabel = event.chosenItinerary?.label ?? null;
      const customizationMap = new Map(
        event.itineraries.map((i) => [
          i.label,
          { remarks: i.remarks, notificationsEnabled: i.notificationsEnabled, isCustomized: i.isCustomized },
        ])
      );
      for (const it of fresh) {
        const custom = customizationMap.get(it.label);
        if (custom) {
          it.remarks = custom.remarks;
          it.notificationsEnabled = custom.notificationsEnabled;
          it.isCustomized = custom.isCustomized;
        }
      }
      event.itineraries = this.calculator.computeAll(fresh, new Date(), event.targetArrival);
      const matchedChosen = chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null;
      event.chosenItineraryId = matchedChosen?.id ?? event.bestItinerary?.id ?? null;
    } else {
      event.itineraries = this.calculator.computeAll(event.itineraries, new Date(), event.targetArrival);
    }

    await this.notificationService.cancel(event.notificationIds ?? []);
    const chosen = event.chosenItinerary ?? event.bestItinerary;
    event.notificationIds = chosen?.notificationsEnabled
      ? await this.notificationService.scheduleForEvent(event)
      : [];

    this._persist(event);
    return event;
  }

  async updateTargetArrival(eventId, newTargetArrival) {
    const event = this.getById(eventId);
    if (!event) return null;
    event.targetArrival = newTargetArrival;

    const startLoc = event.origin?.hasCoords ? event.origin : new Location(CONFIG.defaultOrigin);
    const fresh = await this.planner.plan(startLoc, event.destination, {
      arriveBy: newTargetArrival,
    });

    const chosenLabel = event.chosenItinerary?.label ?? null;
    const customizationMap = new Map(
      event.itineraries.map((i) => [
        i.label,
        { remarks: i.remarks, notificationsEnabled: i.notificationsEnabled, isCustomized: i.isCustomized },
      ])
    );
    for (const it of fresh) {
      const custom = customizationMap.get(it.label);
      if (custom) {
        it.remarks = custom.remarks;
        it.notificationsEnabled = custom.notificationsEnabled;
        it.isCustomized = custom.isCustomized;
      }
    }

    event.itineraries = this.calculator.computeAll(fresh, new Date(), newTargetArrival);
    const matchedChosen = chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null;
    event.chosenItineraryId = matchedChosen?.id ?? event.bestItinerary?.id ?? null;

    await this.notificationService.cancel(event.notificationIds ?? []);
    const chosen = event.chosenItinerary;
    event.notificationIds = chosen?.notificationsEnabled
      ? await this.notificationService.scheduleForEvent(event)
      : [];

    this._persist(event);
    return event;
  }

  async refreshEvent(id) {
    const event = this.getById(id);
    if (!event) return null;

    const startLoc = event.origin?.hasCoords ? event.origin : new Location(CONFIG.defaultOrigin);
    const fresh = await this.planner.plan(startLoc, event.destination, {
      arriveBy: event.targetArrival,
    });

    const chosenLabel = event.chosenItinerary?.label ?? null;
    const customizationMap = new Map(
      event.itineraries.map((i) => [
        i.label,
        { remarks: i.remarks, notificationsEnabled: i.notificationsEnabled, isCustomized: i.isCustomized },
      ])
    );
    for (const it of fresh) {
      const custom = customizationMap.get(it.label);
      if (custom) {
        it.remarks = custom.remarks;
        it.notificationsEnabled = custom.notificationsEnabled;
        it.isCustomized = custom.isCustomized;
      }
    }

    event.itineraries = this.calculator.computeAll(fresh, new Date(), event.targetArrival);
    const matchedChosen = chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null;
    event.chosenItineraryId = matchedChosen?.id ?? event.bestItinerary?.id ?? null;

    await this.notificationService.cancel(event.notificationIds ?? []);
    const chosen = event.chosenItinerary;
    event.notificationIds = chosen?.notificationsEnabled
      ? await this.notificationService.scheduleForEvent(event)
      : [];

    this._persist(event);
    return event;
  }

  async deleteEvent(id) {
    const event = this.getById(id);
    if (event) await this.notificationService.cancel(event.notificationIds);
    this.save(this.list().filter((e) => e.id !== id));
  }

  _persist(event) {
    const all = this.list().map((e) => (e.id === event.id ? event : e));
    this.save(all);
  }
}
