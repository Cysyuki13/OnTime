import { SettingsService, WALK_SPEED_LEVELS, COLOR_THEMES, MAX_PATHS_OPTIONS } from '../services/SettingsService.js';

const MODE_ROWS = [
  { key: 'mtr', label: '港鐵 MTR', icon: '🚇', desc: '鐵路主幹線' },
  { key: 'bus', label: '巴士 Bus', icon: '🚌', desc: '九巴 / 城巴等' },
  { key: 'minibus', label: '專線小巴', icon: '🚐', desc: '綠色／紅色小巴' },
  { key: 'lrt', label: '輕鐵 Light Rail', icon: '🚊', desc: '屯門／天水圍／元朗' },
  { key: 'taxi', label: '的士 Taxi', icon: '🚕', desc: '實驗功能，預設關閉' },
  { key: 'walk', label: '步行 Walk', icon: '🚶', desc: '接駁與短途步行' },
];

export class SettingsView {
  /**
   * @param {{ onBack: Function, onSave: (settings: object) => void, settingsService: SettingsService }} opts
   */
  constructor({ onBack, onSave, settingsService }) {
    this.onBack = onBack;
    this.onSave = onSave;
    this.settingsService = settingsService;
    this._draft = settingsService.getAll();
  }

  render() {
    const s = this._draft;
    const walkHint = SettingsService.walkSpeedHint(s.walkSpeedLevel);
    const mpm = WALK_SPEED_LEVELS[s.walkSpeedLevel] ?? 100;

    const modeRows = MODE_ROWS.map((row) => {
      const on = !!s.preferredModes[row.key];
      return `
        <label class="settings-mode-row ${on ? 'is-on' : 'is-off'}" data-mode-key="${row.key}">
          <span class="settings-mode-icon">${row.icon}</span>
          <span class="settings-mode-text">
            <span class="settings-mode-label">${row.label}</span>
            <span class="settings-mode-desc">${row.desc}</span>
          </span>
          <span class="settings-toggle-wrap">
            <input type="checkbox" data-mode-toggle="${row.key}" ${on ? 'checked' : ''} />
            <span class="settings-toggle-ui" aria-hidden="true"></span>
          </span>
        </label>
      `;
    }).join('');

    const colorSwatches = Object.values(COLOR_THEMES)
      .map(
        (ct) => `
      <button type="button" class="settings-color-swatch ${s.colorTheme === ct.id ? 'is-active' : ''}"
        data-color-theme="${ct.id}" title="${ct.label}" style="--swatch:${ct.accent}">
        <span class="settings-color-dot"></span>
        <span class="settings-color-name">${ct.label}</span>
      </button>`
      )
      .join('');

    return `
      <div class="settings-page">
        <div class="settings-topbar">
          <button type="button" class="btn btn-ghost btn-sm" data-settings-back>← 返回</button>
          <h2 class="settings-title">設定</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-settings-reset title="還原預設">重設</button>
        </div>

        <!-- Walk speed -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">步行速度</span>
            <span class="settings-card-badge" data-walk-level-badge>Lv ${s.walkSpeedLevel}</span>
          </div>
          <p class="settings-help">
            用等級粗估自己的步行速度。等級 5 ≈ 每分鐘 100 米（1000 米約 10 分鐘）。
            路徑中的步行時段會依此重算。
          </p>
          <div class="settings-range-row">
            <span class="settings-range-label">慢</span>
            <input type="range" min="1" max="10" step="1" value="${s.walkSpeedLevel}"
              data-setting="walkSpeedLevel" class="settings-range" />
            <span class="settings-range-label">快</span>
          </div>
          <div class="settings-metric-line" data-walk-hint>
            <strong>${mpm} m/min</strong> · ${walkHint}
          </div>
          <div class="settings-example-box">
            <div class="settings-example-title">速查表（走 1000 米）</div>
            <div class="settings-example-grid">
              ${[1, 3, 5, 7, 10]
                .map((lv) => {
                  const m = WALK_SPEED_LEVELS[lv];
                  const mins = Math.round((1000 / m) * 10) / 10;
                  return `<span class="${lv === s.walkSpeedLevel ? 'is-current' : ''}">Lv${lv} → ${mins} 分</span>`;
                })
                .join('')}
            </div>
          </div>
        </section>

        <!-- Buffer time -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">每段緩衝時間</span>
            <span class="settings-card-badge" data-buffer-badge>${s.bufferMinutes} 分</span>
          </div>
          <p class="settings-help">
            在路徑每一段之間預留額外時間，應付轉乘延誤、排隊或突發狀況。
            設為 0 則不預留。
          </p>
          <div class="settings-range-row">
            <span class="settings-range-label">0</span>
            <input type="range" min="0" max="15" step="1" value="${s.bufferMinutes}"
              data-setting="bufferMinutes" class="settings-range" />
            <span class="settings-range-label">15</span>
          </div>
          <div class="settings-metric-line" data-buffer-hint>
            每段轉乘／接駁預留 <strong>${s.bufferMinutes}</strong> 分鐘
          </div>
        </section>

        <!-- Arrive before -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">提前到達目標</span>
            <span class="settings-card-badge" data-arrive-before-badge>${s.arriveBeforeMinutes} 分</span>
          </div>
          <p class="settings-help">
            若你設定「要在 15:30 到達」，並將此值設為 30 分鐘，系統會以約 <strong>15:00</strong> 為目標計算最遲出發與路線，讓你提早到場。
          </p>
          <div class="settings-range-row">
            <span class="settings-range-label">0</span>
            <input type="range" min="0" max="60" step="5" value="${s.arriveBeforeMinutes}"
              data-setting="arriveBeforeMinutes" class="settings-range" />
            <span class="settings-range-label">60</span>
          </div>
          <div class="settings-metric-line" data-arrive-before-hint>
            路徑預測會以目標時間 <strong>提前 ${s.arriveBeforeMinutes} 分鐘</strong> 到達
          </div>
        </section>

        <!-- Max paths -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">路徑結果上限</span>
            <span class="settings-card-badge" data-max-paths-badge>${s.maxPaths ?? 40} 條</span>
          </div>
          <p class="settings-help">
            每次規劃最多回傳的方案數量。系統會優先顯示<strong>單一交通工具</strong>（港鐵／巴士／小巴等），再顯示轉乘組合。
            數字愈大，可比較的接駁愈多，但搜尋與載入時間也會增加。
          </p>
          <div class="settings-segmented settings-max-paths-seg" role="group" aria-label="路徑結果上限">
            ${MAX_PATHS_OPTIONS.map((n) => {
              const active = (s.maxPaths ?? 40) === n;
              return `<button type="button" class="settings-seg-btn ${active ? 'is-active' : ''}" data-max-paths="${n}">${n}</button>`;
            }).join('')}
          </div>
          ${(() => {
            const hint = SettingsService.maxPathsLoadHint(s.maxPaths ?? 40);
            return `
              <div class="settings-metric-line settings-load-hint level-${hint.level}" data-max-paths-hint>
                <strong>載入影響：${hint.label}</strong> — ${hint.text}
              </div>`;
          })()}
        </section>

        <!-- Preferred transport -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">偏好交通工具</span>
          </div>
          <p class="settings-help">
            關閉後，路徑規劃不會採用該交通方式。至少保留一種大眾運輸或步行。
          </p>
          <div class="settings-mode-table" role="group" aria-label="偏好交通工具">
            ${modeRows}
          </div>
        </section>

        <!-- App basics -->
        <section class="settings-card">
          <div class="settings-card-head">
            <span class="settings-card-title">外觀與通知</span>
          </div>

          <div class="settings-field">
            <span class="settings-field-label">主題模式</span>
            <div class="settings-segmented" role="group" aria-label="主題模式">
              ${['dark', 'light', 'system']
                .map((m) => {
                  const labels = { dark: '深色', light: '淺色', system: '跟隨系統' };
                  return `<button type="button" class="settings-seg-btn ${s.themeMode === m ? 'is-active' : ''}" data-theme-mode="${m}">${labels[m]}</button>`;
                })
                .join('')}
            </div>
          </div>

          <div class="settings-field">
            <span class="settings-field-label">強調色</span>
            <div class="settings-color-row">
              ${colorSwatches}
            </div>
          </div>

          <label class="settings-mode-row ${s.notificationsEnabled ? 'is-on' : 'is-off'}">
            <span class="settings-mode-icon">🔔</span>
            <span class="settings-mode-text">
              <span class="settings-mode-label">出發提醒通知</span>
              <span class="settings-mode-desc">在最遲出發前推送提醒</span>
            </span>
            <span class="settings-toggle-wrap">
              <input type="checkbox" data-setting-bool="notificationsEnabled" ${s.notificationsEnabled ? 'checked' : ''} />
              <span class="settings-toggle-ui" aria-hidden="true"></span>
            </span>
          </label>
        </section>

        <div class="settings-actions">
          <button type="button" class="btn btn-primary btn-block" data-settings-save>儲存設定</button>
          <p class="settings-foot-note">儲存後會套用至新的路徑計算；既有行程可於詳情頁重新整理以套用新設定。</p>
        </div>
      </div>
    `;
  }

  bind(root) {
    this._root = root;

    root.querySelector('[data-settings-back]')?.addEventListener('click', () => this.onBack());

    root.querySelector('[data-settings-reset]')?.addEventListener('click', () => {
      if (!confirm('還原所有設定為預設值？')) return;
      this._draft = this.settingsService.reset();
      this._rerender();
    });

    root.querySelector('[data-settings-save]')?.addEventListener('click', () => {
      const saved = this.settingsService.update(this._draft);
      this.onSave?.(saved);
    });

    // Range inputs
    root.querySelectorAll('input[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting;
        const val = Number(input.value);
        this._draft[key] = val;
        this._syncLiveLabels();
      });
    });

    // Bool toggles
    root.querySelectorAll('input[data-setting-bool]').forEach((input) => {
      input.addEventListener('change', () => {
        this._draft[input.dataset.settingBool] = input.checked;
        input.closest('.settings-mode-row')?.classList.toggle('is-on', input.checked);
        input.closest('.settings-mode-row')?.classList.toggle('is-off', !input.checked);
      });
    });

    // Mode toggles
    root.querySelectorAll('input[data-mode-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.modeToggle;
        this._draft.preferredModes[key] = input.checked;
        input.closest('.settings-mode-row')?.classList.toggle('is-on', input.checked);
        input.closest('.settings-mode-row')?.classList.toggle('is-off', !input.checked);
      });
    });

    // Theme mode segmented
    root.querySelectorAll('[data-theme-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._draft.themeMode = btn.dataset.themeMode;
        root.querySelectorAll('[data-theme-mode]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.themeMode === this._draft.themeMode);
        });
        // Live preview
        this.settingsService.update({ themeMode: this._draft.themeMode });
        // keep other draft fields; re-sync storage already done for theme only — restore draft preferred etc.
        // SettingsService.update merges; draft stays source of truth until Save
      });
    });

    // Color theme
    root.querySelectorAll('[data-color-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._draft.colorTheme = btn.dataset.colorTheme;
        root.querySelectorAll('[data-color-theme]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.colorTheme === this._draft.colorTheme);
        });
        this.settingsService.update({ colorTheme: this._draft.colorTheme });
      });
    });

    // Max paths segmented
    root.querySelectorAll('[data-max-paths]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.maxPaths);
        if (!Number.isFinite(n)) return;
        this._draft.maxPaths = n;
        root.querySelectorAll('[data-max-paths]').forEach((b) => {
          b.classList.toggle('is-active', Number(b.dataset.maxPaths) === n);
        });
        this._syncLiveLabels();
      });
    });
  }

  _syncLiveLabels() {
    const root = this._root;
    if (!root) return;
    const s = this._draft;
    const mpm = WALK_SPEED_LEVELS[s.walkSpeedLevel] ?? 100;
    const walkHint = SettingsService.walkSpeedHint(s.walkSpeedLevel);

    const set = (sel, html) => {
      const el = root.querySelector(sel);
      if (el) el.innerHTML = html;
    };

    set('[data-walk-level-badge]', `Lv ${s.walkSpeedLevel}`);
    set('[data-walk-hint]', `<strong>${mpm} m/min</strong> · ${walkHint}`);
    set('[data-buffer-badge]', `${s.bufferMinutes} 分`);
    set('[data-buffer-hint]', `每段轉乘／接駁預留 <strong>${s.bufferMinutes}</strong> 分鐘`);
    set('[data-arrive-before-badge]', `${s.arriveBeforeMinutes} 分`);
    set(
      '[data-arrive-before-hint]',
      `路徑預測會以目標時間 <strong>提前 ${s.arriveBeforeMinutes} 分鐘</strong> 到達`
    );

    const maxPaths = s.maxPaths ?? 40;
    set('[data-max-paths-badge]', `${maxPaths} 條`);
    const loadHint = SettingsService.maxPathsLoadHint(maxPaths);
    const hintEl = root.querySelector('[data-max-paths-hint]');
    if (hintEl) {
      hintEl.className = `settings-metric-line settings-load-hint level-${loadHint.level}`;
      hintEl.innerHTML = `<strong>載入影響：${loadHint.label}</strong> — ${loadHint.text}`;
    }

    // Update example grid current highlight
    root.querySelectorAll('.settings-example-grid span').forEach((span) => {
      const m = span.textContent.match(/Lv(\d+)/);
      if (m) span.classList.toggle('is-current', Number(m[1]) === s.walkSpeedLevel);
    });
  }

  _rerender() {
    if (!this._root) return;
    // Replace page content
    const parent = this._root;
    // AppController replaces innerHTML of main; we re-render into same root
    // Assume root is #app / main
    const html = this.render();
    // If root is the main container that held settings-page
    if (parent.querySelector('.settings-page') || parent.classList?.contains('settings-page')) {
      parent.innerHTML = html;
    } else {
      parent.innerHTML = html;
    }
    this.bind(parent);
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }
}
