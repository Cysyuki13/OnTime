export class StorageService {
  constructor(prefix = 'hktimer:') {
    this.prefix = prefix;
  }

  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.warn('[StorageService] set failed:', e.message);
    }
  }

  remove(key) {
    localStorage.removeItem(this.prefix + key);
  }
}
