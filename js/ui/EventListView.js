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
      const totalMinText = activeIt?.totalDuration != null ? `約 ${activeIt.totalDuration} 分鐘` : '—';
      const routeText = e.origin?.name
        ? `${this._esc(e.origin.name)} → ${this._esc(e.destination.name)}`
        : `目的地：${this._esc(e.destination.name)}`;

      return `
        <div class="card event-summary-card" data-event-id="${e.id}">
          <div class="card-title">
            <span>${this._esc(e.title)}</span>
            ${activeIt ? `<span class="card-badge info">${this._esc(activeIt.summary)}</span>` : ''}
          </div>
          <div class="card-sub">${routeText}${activeIt ? ` · ${this._esc(activeIt.label)}` : ''}</div>
          <div class="divider"></div>
          <div class="row">
            <div class="metric-box">
              <div class="metric-label">總需時間</div>
              <div class="metric-value metric-value--ok">${totalMinText}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">目標到達</div>
              <div class="metric-value">${target}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">最遲出發</div>
              <div class="metric-value metric-value--accent">${lateStr}</div>
            </div>
          </div>
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

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
}
