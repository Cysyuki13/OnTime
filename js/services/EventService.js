import { CalendarEvent } from '../models/CalendarEvent.js';
import { Location } from '../models/Location.js';
import { RoutePlanningService } from './RoutePlanningService.js';
import { DepartureCalculator } from './DepartureCalculator.js';
import { CONFIG } from '../config.js';

export class EventService {
  constructor({ storage, etaService, notificationService, settingsService = null }) {
    this.storage = storage;
    this.notificationService = notificationService;
    this.settingsService = settingsService;
    this.planner = new RoutePlanningService({ etaService, storage, settingsService });
    this.calculator = new DepartureCalculator({
      getBufferMinutes: () => settingsService?.get('bufferMinutes') ?? 0,
      getArriveBeforeMinutes: () => settingsService?.get('arriveBeforeMinutes') ?? 0,
    });
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

  /**
   * 將使用者編輯後的路徑另存為「user-saved」自訂路徑。
   * edits: Array<{ segIndex, boardStop?, alightStop?, fromName?, toName?, exit?, route? }>
   * 會 clone 原路徑、套用站點修改、標記 isCustomized，並加入 event.itineraries。
   */
  saveUserPath(eventId, baseItineraryId, edits = [], { labelSuffix = '（自訂）', select = true } = {}) {
    const event = this.getById(eventId);
    if (!event) return null;
    const base = event.itineraries.find((i) => i.id === baseItineraryId);
    if (!base) return null;

    const cloned = base.clone();
    cloned.id = crypto?.randomUUID?.() ?? `it-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cloned.isCustomized = true;
    cloned.isUserSaved = true;
    cloned.label = (base.label || '方案').replace(/（自訂）$/, '') + labelSuffix;

    const byIndex = new Map((edits || []).map((e) => [Number(e.segIndex), e]));
    for (let i = 0; i < cloned.segments.length; i++) {
      const edit = byIndex.get(i);
      if (!edit) continue;
      const seg = cloned.segments[i];
      if (edit.boardStop != null && String(edit.boardStop).trim()) {
        seg.boardStop = String(edit.boardStop).trim();
        if (seg.from) seg.from = new Location({ ...seg.from.toJSON?.() ?? seg.from, name: seg.boardStop });
      }
      if (edit.alightStop != null && String(edit.alightStop).trim()) {
        seg.alightStop = String(edit.alightStop).trim();
        if (seg.to) seg.to = new Location({ ...seg.to.toJSON?.() ?? seg.to, name: seg.alightStop });
      }
      if (edit.fromName != null && String(edit.fromName).trim() && seg.from) {
        seg.from = new Location({ ...seg.from.toJSON?.() ?? seg.from, name: String(edit.fromName).trim() });
      }
      if (edit.toName != null && String(edit.toName).trim() && seg.to) {
        seg.to = new Location({ ...seg.to.toJSON?.() ?? seg.to, name: String(edit.toName).trim() });
      }
      if (edit.exit != null) seg.exit = String(edit.exit).trim() || null;
      if (edit.route != null && String(edit.route).trim()) seg.route = String(edit.route).trim();
    }

    // 重新計算時間（沿用既有 duration，只刷新 latestDeparture / arrival 顯示）
    const recomputed = this.calculator.computeAll([cloned], new Date(), event.targetArrival);
    const saved = recomputed[0] || cloned;
    saved.isCustomized = true;
    saved.isUserSaved = true;
    saved.label = cloned.label;

    event.itineraries = [...event.itineraries, saved];
    if (select) {
      event.chosenItineraryId = saved.id;
    }
    this._persist(event);
    return { event, saved };
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
      const chosenId = event.chosenItineraryId;
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
      const userSaved = event.itineraries.filter((i) => i.isUserSaved);
      const recomputed = this.calculator.computeAll(fresh, new Date(), event.targetArrival);
      event.itineraries = [...recomputed, ...userSaved];
      const matchedChosen =
        (chosenId && event.itineraries.find((i) => i.id === chosenId)) ||
        (chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null);
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
    const chosenId = event.chosenItineraryId;
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

    const userSaved = event.itineraries.filter((i) => i.isUserSaved);
    // 自訂路徑也依新目標到達時間重算顯示
    const userSavedRecomputed = this.calculator.computeAll(userSaved, new Date(), newTargetArrival);
    for (const it of userSavedRecomputed) {
      it.isUserSaved = true;
      it.isCustomized = true;
    }

    const recomputed = this.calculator.computeAll(fresh, new Date(), newTargetArrival);
    event.itineraries = [...recomputed, ...userSavedRecomputed];
    const matchedChosen =
      (chosenId && event.itineraries.find((i) => i.id === chosenId)) ||
      (chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null);
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
    const chosenId = event.chosenItineraryId;
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

    // 保留使用者另存的自訂路徑
    const userSaved = event.itineraries.filter((i) => i.isUserSaved);

    const recomputed = this.calculator.computeAll(fresh, new Date(), event.targetArrival);
    event.itineraries = [...recomputed, ...userSaved];
    const matchedChosen =
      (chosenId && event.itineraries.find((i) => i.id === chosenId)) ||
      (chosenLabel ? event.itineraries.find((i) => i.label === chosenLabel) : null);
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
