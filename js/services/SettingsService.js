import { StorageService } from './StorageService.js';

/** Walk speed level → meters per minute. Level 5 = 100 m/min ≈ 1000 m in 10 min. */
export const WALK_SPEED_LEVELS = Object.freeze({
  1: 40,
  2: 55,
  3: 70,
  4: 85,
  5: 100,
  6: 115,
  7: 130,
  8: 145,
  9: 160,
  10: 180,
});

export const COLOR_THEMES = Object.freeze({
  amber: {
    id: 'amber',
    label: '琥珀金',
    accent: '#d8a24a',
    accentDim: 'rgba(216, 162, 74, 0.13)',
  },
  blue: {
    id: 'blue',
    label: '海洋藍',
    accent: '#5b9fd4',
    accentDim: 'rgba(91, 159, 212, 0.13)',
  },
  green: {
    id: 'green',
    label: '松綠',
    accent: '#6faf7a',
    accentDim: 'rgba(111, 175, 122, 0.13)',
  },
  rose: {
    id: 'rose',
    label: '玫瑰',
    accent: '#d47a8a',
    accentDim: 'rgba(212, 122, 138, 0.13)',
  },
  violet: {
    id: 'violet',
    label: '紫藤',
    accent: '#9b7fd4',
    accentDim: 'rgba(155, 127, 212, 0.13)',
  },
});

const DEFAULTS = Object.freeze({
  walkSpeedLevel: 5,
  bufferMinutes: 5,
  arriveBeforeMinutes: 15,
  themeMode: 'dark', // 'dark' | 'light' | 'system'
  colorTheme: 'amber',
  notificationsEnabled: true,
  preferredModes: {
    walk: true,
    mtr: true,
    bus: true,
    minibus: true,
    ferry: true,
    taxi: false,
  },
});

/**
 * Central app settings — persisted in localStorage and applied to DOM / planners.
 */
export class SettingsService {
  constructor(storage = new StorageService()) {
    this.storage = storage;
    this._settings = this._load();
    this._listeners = new Set();
  }

  _load() {
    const raw = this.storage.get('settings', null);
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS, preferredModes: { ...DEFAULTS.preferredModes } };
    return {
      walkSpeedLevel: this._clampInt(raw.walkSpeedLevel, 1, 10, DEFAULTS.walkSpeedLevel),
      bufferMinutes: this._clampInt(raw.bufferMinutes, 0, 30, DEFAULTS.bufferMinutes),
      arriveBeforeMinutes: this._clampInt(raw.arriveBeforeMinutes, 0, 120, DEFAULTS.arriveBeforeMinutes),
      themeMode: ['dark', 'light', 'system'].includes(raw.themeMode) ? raw.themeMode : DEFAULTS.themeMode,
      colorTheme: COLOR_THEMES[raw.colorTheme] ? raw.colorTheme : DEFAULTS.colorTheme,
      notificationsEnabled: raw.notificationsEnabled !== false,
      preferredModes: {
        walk: raw.preferredModes?.walk !== false,
        mtr: raw.preferredModes?.mtr !== false,
        bus: raw.preferredModes?.bus !== false,
        minibus: raw.preferredModes?.minibus !== false,
        ferry: raw.preferredModes?.ferry !== false,
        taxi: raw.preferredModes?.taxi === true,
      },
    };
  }

  _clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  getAll() {
    return {
      ...this._settings,
      preferredModes: { ...this._settings.preferredModes },
    };
  }

  get(key) {
    if (key === 'preferredModes') return { ...this._settings.preferredModes };
    return this._settings[key];
  }

  /** Walking speed in meters per minute based on current level. */
  getWalkingSpeedMpm() {
    return WALK_SPEED_LEVELS[this._settings.walkSpeedLevel] ?? WALK_SPEED_LEVELS[5];
  }

  /**
   * Effective arrival deadline used by planners:
   * targetArrival − arriveBeforeMinutes.
   */
  getEffectiveArriveBy(targetArrival) {
    if (!(targetArrival instanceof Date) || Number.isNaN(targetArrival.getTime())) return targetArrival;
    const mins = this._settings.arriveBeforeMinutes || 0;
    if (mins <= 0) return new Date(targetArrival);
    return new Date(targetArrival.getTime() - mins * 60_000);
  }

  isModeEnabled(mode) {
    const m = String(mode || '').toLowerCase();
    if (m === 'walk') return this._settings.preferredModes.walk !== false;
    if (m === 'mtr') return !!this._settings.preferredModes.mtr;
    if (m === 'bus') return !!this._settings.preferredModes.bus;
    if (m === 'minibus') return !!this._settings.preferredModes.minibus;
    if (m === 'ferry') return !!this._settings.preferredModes.ferry;
    if (m === 'taxi') return !!this._settings.preferredModes.taxi;
    return true;
  }

  update(partial) {
    if (!partial || typeof partial !== 'object') return this.getAll();

    if (partial.walkSpeedLevel != null) {
      this._settings.walkSpeedLevel = this._clampInt(partial.walkSpeedLevel, 1, 10, this._settings.walkSpeedLevel);
    }
    if (partial.bufferMinutes != null) {
      this._settings.bufferMinutes = this._clampInt(partial.bufferMinutes, 0, 30, this._settings.bufferMinutes);
    }
    if (partial.arriveBeforeMinutes != null) {
      this._settings.arriveBeforeMinutes = this._clampInt(
        partial.arriveBeforeMinutes,
        0,
        120,
        this._settings.arriveBeforeMinutes
      );
    }
    if (partial.themeMode != null && ['dark', 'light', 'system'].includes(partial.themeMode)) {
      this._settings.themeMode = partial.themeMode;
    }
    if (partial.colorTheme != null && COLOR_THEMES[partial.colorTheme]) {
      this._settings.colorTheme = partial.colorTheme;
    }
    if (typeof partial.notificationsEnabled === 'boolean') {
      this._settings.notificationsEnabled = partial.notificationsEnabled;
    }
    if (partial.preferredModes && typeof partial.preferredModes === 'object') {
      for (const key of Object.keys(this._settings.preferredModes)) {
        if (typeof partial.preferredModes[key] === 'boolean') {
          this._settings.preferredModes[key] = partial.preferredModes[key];
        }
      }
    }

    this.storage.set('settings', this._settings);
    this.applyToDocument();
    for (const fn of this._listeners) {
      try {
        fn(this.getAll());
      } catch (e) {
        console.warn('[SettingsService] listener error', e);
      }
    }
    return this.getAll();
  }

  reset() {
    this._settings = { ...DEFAULTS, preferredModes: { ...DEFAULTS.preferredModes } };
    this.storage.set('settings', this._settings);
    this.applyToDocument();
    for (const fn of this._listeners) {
      try {
        fn(this.getAll());
      } catch (_) { /* ignore */ }
    }
    return this.getAll();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Apply theme mode + color theme CSS variables to <html>. */
  applyToDocument() {
    const root = document.documentElement;
    let mode = this._settings.themeMode;
    if (mode === 'system') {
      mode = window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
    }
    root.dataset.theme = mode;
    root.dataset.colorTheme = this._settings.colorTheme;

    const ct = COLOR_THEMES[this._settings.colorTheme] || COLOR_THEMES.amber;
    root.style.setProperty('--accent', ct.accent);
    root.style.setProperty('--accent-dim', ct.accentDim);
    root.style.setProperty('--accent-soft', ct.accentDim);
    root.style.setProperty('--warn', ct.accent);
    root.style.setProperty('--warning', ct.accent);
  }

  /** Human-readable hint for walk speed level. */
  static walkSpeedHint(level) {
    const mpm = WALK_SPEED_LEVELS[level] ?? WALK_SPEED_LEVELS[5];
    const minsFor1km = Math.round((1000 / mpm) * 10) / 10;
    return `約 ${mpm} 米/分 · 走 1000 米需約 ${minsFor1km} 分鐘`;
  }
}
