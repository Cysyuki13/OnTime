import { CONFIG } from '../config.js';

export class NotificationService {
  constructor({ settingsService = null } = {}) {
    this.settingsService = settingsService;
    this._scheduled = new Map();
    this._capIds = [];
    this._isCapacitor = !!window.Capacitor?.isNativePlatform?.();
  }

  async ensurePermission() {
    if (this.settingsService && this.settingsService.get('notificationsEnabled') === false) {
      return false;
    }
    if (this._isCapacitor) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    }

    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  async scheduleForEvent(event) {
    if (this.settingsService && this.settingsService.get('notificationsEnabled') === false) {
      return [];
    }
    const target = event.chosenItinerary ?? event.bestItinerary;
    if (!target?.latestDeparture || !target.notificationsEnabled) return [];

    if (this._isCapacitor) {
      return this._scheduleCapacitor(event, target);
    }
    return this._scheduleWeb(event, target);
  }

  async cancel(ids = []) {
    if (this._isCapacitor && ids.length) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const numericIds = ids.map((id) => this._toNumericId(id));
      await LocalNotifications.cancel({ notifications: numericIds.map((id) => ({ id })) });
      this._capIds = this._capIds.filter((id) => !numericIds.includes(id));
      return;
    }
    for (const id of ids) {
      const t = this._scheduled.get(id);
      if (t) clearTimeout(t);
      this._scheduled.delete(id);
    }
  }

  async _scheduleCapacitor(event, target) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await this.cancel(event.notificationIds ?? []);

    const notifications = [];
    for (const lead of CONFIG.notificationLeads) {
      const fireAt = new Date(target.latestDeparture.getTime() - lead * 60_000);
      if (fireAt <= new Date()) continue;

      const id = this._toNumericId(`${event.id}:${lead}`);
      notifications.push({
        id,
        title: `⏰ ${event.title}`,
        body:
          lead === 0
            ? `現在出門才能準時到達「${event.title}」`
            : `還有 ${lead} 分鐘就要出門了（${event.title}）`,
        schedule: { at: fireAt, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#38bdf8',
      });
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }

    const ids = notifications.map((n) => `${event.id}:${n.id}`);
    this._capIds.push(...notifications.map((n) => n.id));
    return ids;
  }

  _scheduleWeb(event, target) {
    const ids = [];
    for (const lead of CONFIG.notificationLeads) {
      const fireAt = new Date(target.latestDeparture.getTime() - lead * 60_000);
      const delay = fireAt.getTime() - Date.now();
      if (delay < 0) continue;

      const id = `${event.id}:${lead}`;
      const existing = this._scheduled.get(id);
      if (existing) clearTimeout(existing);

      const t = setTimeout(() => {
        const body =
          lead === 0
            ? `現在出門才能準時到達「${event.title}」`
            : `還有 ${lead} 分鐘就要出門了（${event.title}）`;
        if (Notification.permission === 'granted') {
          new Notification(`⏰ ${event.title}`, { body });
        }
      }, delay);

      this._scheduled.set(id, t);
      ids.push(id);
    }
    return ids;
  }

  _toNumericId(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2_000_000_000;
  }
}
