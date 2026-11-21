export class EventListView {
  constructor({ onAdd, onSelect, onOpenSettings }) {
    this.onAdd = onAdd;
    this.onSelect = onSelect;
    this.onOpenSettings = onOpenSettings;
  }

  render(events) {
    const settingsBtn = `
      <button type="button" class="btn btn-ghost btn-sm settings-entry-btn" id="btn-settings" title="設定">
        ⚙ 設定
      </button>
    `;

    if (!events.length) {
      return `
        <div class="list-top-actions">
          ${settingsBtn}
        </div>
        <div class="empty">
          <span class="empty-icon">[ NO_EVENTS ]</span>
          還沒有行程<br/>點下面按鈕建立第一個
        </div>
        <button type="button" class="btn btn-primary btn-block" id="btn-add">＋ 新增行程</button>
      `;
    }

    const cards = events.map((e) => {
      const activeIt = e.chosenItinerary ?? e.bestItinerary;
      const lateStr = activeIt?.latestDeparture
        ? activeIt.latestDeparture.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })
        : '—';
      const target = e.targetArrival.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
      const predArrival = activeIt?.estimatedArrival
        ? activeIt.estimatedArrival.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })
        : lateStr !== '—' && activeIt?.totalDuration != null
          ? this._addMinutesToTimeStr(lateStr, activeIt.totalDuration)
          : '—';
      const totalMinText = activeIt?.totalDuration != null ? `約 ${activeIt.totalDuration} 分鐘` : '—';
      const originName = e.origin?.name || '（未設定起點）';
      const destName = e.destination?.name || '（未設定終點）';

      return `
        <div class="card event-summary-card" data-event-id="${e.id}">
          <div class="card-title">
            <span>${this._esc(e.title)}</span>
            ${activeIt ? `<span class="card-badge info">${this._esc(activeIt.summary)}</span>` : ''}
          </div>

          <div class="event-route-pair">
            <div class="event-route-endpoint event-route-origin">
              <span class="event-route-sign event-route-sign--start">起</span>
              <span class="event-route-name" title="${this._esc(originName)}">${this._esc(originName)}</span>
            </div>
            <div class="event-route-arrow" aria-hidden="true">→</div>
            <div class="event-route-endpoint event-route-dest">
              <span class="event-route-sign event-route-sign--end">終</span>
              <span class="event-route-name" title="${this._esc(destName)}">${this._esc(destName)}</span>
            </div>
          </div>

          <div class="divider"></div>
          <div class="row event-time-row">
            <div class="metric-box">
              <div class="metric-label">最遲出發</div>
              <div class="metric-value metric-value--accent event-time-lg">${lateStr}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">預計到達</div>
              <div class="metric-value event-time-lg">${predArrival}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">目標到達</div>
              <div class="metric-value event-time-lg">${target}</div>
            </div>
          </div>
          ${activeIt?.totalDuration != null ? `<div class="card-total-time">${totalMinText}${activeIt.label ? ` · ${this._esc(activeIt.label)}` : ''}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="list-top-actions">
        ${settingsBtn}
      </div>
      ${cards}
      <button type="button" class="btn btn-primary btn-block" id="btn-add">＋ 新增行程</button>
    `;
  }

  bind(root) {
    root.querySelector('#btn-add')?.addEventListener('click', () => this.onAdd());
    root.querySelector('#btn-settings')?.addEventListener('click', () => this.onOpenSettings?.());
    root.querySelectorAll('[data-event-id]').forEach((el) => {
      el.addEventListener('click', () => this.onSelect(el.dataset.eventId));
    });
  }

  _addMinutesToTimeStr(timeStr, minutes) {
    try {
      const [h, m] = timeStr.split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
      const total = h * 60 + m + (minutes || 0);
      const hh = Math.floor(total / 60) % 24;
      const mm = total % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    } catch {
      return '—';
    }
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
}
