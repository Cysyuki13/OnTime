import { ModeMeta } from '../models/TransportMode.js';
import { HKMapView } from './HKMapView.js';

export class EventDetailView {
  constructor({
    onBack,
    onDelete,
    onRefresh,
    onSelectItinerary,
    onUpdateRemarks,
    onToggleNotification,
    onUpdateTime,
    onUpdateEventDetails,
  }) {
    this.onBack = onBack;
    this.onDelete = onDelete;
    this.onRefresh = onRefresh;
    this.onSelectItinerary = onSelectItinerary;
    this.onUpdateRemarks = onUpdateRemarks;
    this.onToggleNotification = onToggleNotification;
    this.onUpdateTime = onUpdateTime;
    this.onUpdateEventDetails = onUpdateEventDetails;
    this._expandedIds = new Set();
    this._drawerOpen = false;
    this._editingDetails = false;
    this._mapView = new HKMapView({ mode: 'route', height: 280, defaultOpen: false });
  }

  render(event) {
    this._event = event;
    this._expandedIds.clear();

    // Chosen path stays open by default when opening the detail view
    if (event.chosenItineraryId) {
      this._expandedIds.add(event.chosenItineraryId);
    }

    const fmt = (d) => (d ? d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }) : '—');
    const dateFmt = (d) =>
      d.toLocaleString('zh-HK', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    const shortestId = event.bestItinerary?.id ?? null;
    const activeIt = event.chosenItinerary || event.bestItinerary || event.itineraries[0];
    this._mapView.setEndpoints({ origin: event.origin, destination: event.destination });

    const itCards = event.itineraries
      .map((it) => {
        const isChosen = event.chosenItineraryId === it.id;
        const isShortest = shortestId === it.id;
        const isOpen = this._expandedIds.has(it.id);
        const totalStr = it.totalDuration != null ? `約 ${it.totalDuration} 分鐘` : '—';

        const segmentsHtml = it.segments
          .map((s, idx) => {
            const meta = ModeMeta[s.mode];
            const detail = s.displayDetail;
            const timeRange = `${fmt(s.departAt)} → ${fmt(s.arriveAt)}`;
            return `
              <div class="segment" data-seg-idx="${idx}" data-it-id="${it.id}" title="點擊在地圖高亮此段路徑">
                <div class="segment-icon">${meta.icon}</div>
                <div class="segment-info">
                  <div class="segment-mode">${meta.label}${s.route ? ` · ${s.route}` : ''}</div>
                  <div class="segment-detail">${this._esc(detail)}</div>
                </div>
                <div class="segment-time">${timeRange}</div>
              </div>
            `;
          })
          .join('');

        const badges = [
          it.isImpracticalWalk ? '<span class="card-badge danger">已拒絕·步行過遠</span>' : '',
          !it.isImpracticalWalk && isShortest ? '<span class="card-badge warning">最短時間 · 推薦</span>' : '',
          isChosen ? '<span class="card-badge success">已選</span>' : '',
          it.isCustomized ? '<span class="card-badge info">已自訂</span>' : '',
        ]
          .filter(Boolean)
          .join('');

        return `
          <div class="card itinerary-card ${isChosen ? 'itinerary-chosen' : ''} ${isOpen ? 'is-expanded' : ''}" data-itinerary-id="${it.id}">
            <div class="itinerary-header" data-action="toggle-expand" data-id="${it.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
              <div class="itinerary-header-main">
                <div class="card-title">
                  <span>${this._esc(it.label)}</span>
                  ${badges}
                </div>
                <div class="itinerary-meta-row">
                  <span class="card-total-time">⏱️ ${totalStr}</span>
                  <span class="card-sub">
                    ${it.summary} · 最遲出發 ${fmt(it.latestDeparture)} · 到達 ${fmt(it.estimatedArrival)}
                  </span>
                </div>
              </div>
              <button type="button" class="itinerary-toggle-btn" data-action="toggle-expand" data-id="${it.id}">
                <span class="toggle-text">${isOpen ? '收合' : '展開詳情'}</span>
                <span class="itinerary-chevron">▼</span>
              </button>
            </div>

            <div class="itinerary-body" data-body-for="${it.id}" ${isOpen ? '' : 'hidden'}>
              <div class="endpoint-row">
                <span class="endpoint-badge endpoint-start">START · 起點</span>
                <span class="endpoint-label">${this._esc(event.origin?.name || it.segments[0]?.from?.name || '起點')}</span>
                <span class="endpoint-time">${fmt(it.segments[0]?.departAt)}</span>
              </div>
              ${segmentsHtml}
              <div class="endpoint-row">
                <span class="endpoint-badge endpoint-end">END · 終點</span>
                <span class="endpoint-label">${this._esc(event.destination?.name || it.segments[it.segments.length - 1]?.to?.name || '終點')}</span>
                <span class="endpoint-time">${fmt(it.estimatedArrival)}</span>
              </div>

              ${it.impracticalReason ? `<div class="itinerary-reject-note">🚫 ${this._esc(it.impracticalReason)}</div>` : ''}
              ${it.remarks ? `<div class="itinerary-remarks">📝 ${this._esc(it.remarks)}</div>` : ''}

              <div class="itinerary-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-action="select" data-id="${it.id}">
                  ${isChosen ? '✓ 已選此方案' : '選擇此方案'}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="remarks" data-id="${it.id}">備註</button>
                <label class="toggle-wrap">
                  <span class="toggle-label">通知</span>
                  <input type="checkbox" data-action="notify" data-id="${it.id}" ${it.notificationsEnabled ? 'checked' : ''} />
                </label>
              </div>

              <div class="remarks-editor" data-remarks-for="${it.id}" hidden>
                <textarea placeholder="輸入備註，例如：記得帶學生證、B2 出口直行…">${this._esc(it.remarks)}</textarea>
                <button type="button" class="btn btn-primary btn-sm" data-action="save-remarks" data-id="${it.id}">儲存備註</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const localArrivalVal =
      event.targetArrival instanceof Date && !Number.isNaN(event.targetArrival.getTime())
        ? new Date(event.targetArrival.getTime() - event.targetArrival.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : '';

    return `
      <div class="detail-topbar">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-back">← 返回</button>
        <div class="detail-topbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-drawer" title="開啟/隱藏外部路徑資訊選單">📋 路徑資訊</button>
        </div>
      </div>

      <div class="pinned-map-anchor" id="pinned-map-anchor">
        ${this._mapView.renderBriefPreviewPanel()}
        ${this._mapView.render()}
      </div>

      <div class="detail-section-label">路線方案（已選方案預設展開；其餘收合，點按可展開；點擊分段可於地圖高亮）</div>
      ${itCards}

      <button type="button" class="btn btn-ghost btn-block" id="btn-refresh">🔄 重新計算最短時間與班次</button>
      <button type="button" class="btn btn-danger btn-block" id="btn-delete">🗑️ 刪除行程</button>

      <div class="side-drawer-backdrop ${this._drawerOpen ? 'is-open' : ''}" id="side-drawer-backdrop" ${this._drawerOpen ? '' : 'hidden'}></div>
      <aside class="side-drawer side-drawer-75 ${this._drawerOpen ? 'is-open' : ''}" id="side-drawer" aria-label="外部路徑資訊選單">
        <div class="side-drawer-head">
          <div class="side-drawer-head-text">
            <div class="side-drawer-heading">路徑資訊與設定</div>
            <div class="card-sub">僅顯示與編輯目前路徑資訊</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm side-drawer-close" id="btn-close-drawer" title="隱藏側邊選單">✕ 隱藏</button>
        </div>

        <div class="drawer-highlight-banner">
          <div class="drawer-highlight-label">最遲出發時間</div>
          <div class="drawer-highlight-time">${activeIt?.latestDeparture ? fmt(activeIt.latestDeparture) : '—'}</div>
          <div class="drawer-highlight-sub">
            ${activeIt ? `${this._esc(activeIt.label)} · 約 ${activeIt.totalDuration ?? '—'} 分鐘` : '尚未選擇方案'}
          </div>
        </div>

        <div class="drawer-info-card">
          <div class="drawer-info-top">
            <div class="drawer-path-title">${this._esc(event.title)}</div>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-edit-details">
              ${this._editingDetails ? '取消編輯' : '✏️ 編輯資訊'}
            </button>
          </div>

          <div class="drawer-kv-list" id="drawer-read-view" ${this._editingDetails ? 'hidden' : ''}>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">🚩 出發起點（固定）</span>
              <span class="drawer-kv-v">${this._esc(event.origin?.name || '未設定起點')}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">📍 目的地（固定）</span>
              <span class="drawer-kv-v">${this._esc(event.destination.name)}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">🎯 目標到達</span>
              <span class="drawer-kv-v">${dateFmt(event.targetArrival)}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">🛣️ 路徑摘要</span>
              <span class="drawer-kv-v">${this._esc(activeIt?.summary || '—')}</span>
            </div>
          </div>

          <div class="drawer-edit-form" id="drawer-edit-form" ${this._editingDetails ? '' : 'hidden'}>
            <div class="drawer-form-field">
              <label for="edit-ev-title">行程名稱</label>
              <input id="edit-ev-title" type="text" value="${this._esc(event.title)}" />
            </div>
            <div class="drawer-kv-item drawer-kv-readonly">
              <span class="drawer-kv-k">🚩 出發起點（不可修改）</span>
              <span class="drawer-kv-v">${this._esc(event.origin?.name || '未設定起點')}</span>
            </div>
            <div class="drawer-kv-item drawer-kv-readonly">
              <span class="drawer-kv-k">📍 目的地（不可修改）</span>
              <span class="drawer-kv-v">${this._esc(event.destination.name)}</span>
            </div>
            <div class="drawer-form-field">
              <label for="edit-ev-time">目標到達時間</label>
              <input id="edit-ev-time" type="datetime-local" value="${localArrivalVal}" />
            </div>
            <button type="button" class="btn btn-primary btn-block" id="btn-save-details">💾 儲存資訊</button>
          </div>
        </div>
      </aside>
    `;
  }

  _setDrawerOpen(open) {
    this._drawerOpen = !!open;
    const drawer = this._pageRoot?.querySelector('#side-drawer');
    const backdrop = this._pageRoot?.querySelector('#side-drawer-backdrop');
    if (drawer) drawer.classList.toggle('is-open', this._drawerOpen);
    if (backdrop) {
      backdrop.hidden = !this._drawerOpen;
      backdrop.classList.toggle('is-open', this._drawerOpen);
    }
  }

  _toggleExpand(root, id) {
    const card = root.querySelector(`.itinerary-card[data-itinerary-id="${id}"]`);
    const body = root.querySelector(`[data-body-for="${id}"]`);
    if (!card || !body) return;

    const willExpand = body.hidden;
    body.hidden = !willExpand;
    card.classList.toggle('is-expanded', willExpand);

    const header = card.querySelector('.itinerary-header');
    if (header) header.setAttribute('aria-expanded', String(willExpand));

    const toggleText = card.querySelector('.toggle-text');
    if (toggleText) toggleText.textContent = willExpand ? '收合' : '展開詳情';

    if (willExpand) {
      this._expandedIds.add(id);
      const it = this._event?.itineraries?.find((x) => x.id === id);
      if (it) {
        this._mapView.setItinerary(it, {
          origin: this._event.origin,
          destination: this._event.destination,
        });
      }
    } else {
      this._expandedIds.delete(id);
    }
  }

  bind(root) {
    this._pageRoot = root;
    this._mapView.bind(root);
    const activeIt = this._event?.chosenItinerary || this._event?.bestItinerary || this._event?.itineraries?.[0];
    if (activeIt) {
      this._mapView.setItinerary(activeIt, {
        origin: this._event.origin,
        destination: this._event.destination,
        openMap: false,
      });
    }

    root.querySelector('#btn-back')?.addEventListener('click', () => {
      this._setDrawerOpen(false);
      this._mapView.destroy();
      this.onBack();
    });
    root.querySelector('#btn-delete')?.addEventListener('click', () => {
      this._setDrawerOpen(false);
      this._mapView.destroy();
      this.onDelete();
    });
    root.querySelector('#btn-refresh')?.addEventListener('click', () => this.onRefresh());

    root.querySelector('#btn-toggle-drawer')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setDrawerOpen(!this._drawerOpen);
    });
    root.querySelector('#btn-close-drawer')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setDrawerOpen(false);
    });
    root.querySelector('#side-drawer-backdrop')?.addEventListener('click', () => {
      this._setDrawerOpen(false);
    });

    root.querySelector('#btn-toggle-edit-details')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._editingDetails = !this._editingDetails;
      const readEl = root.querySelector('#drawer-read-view');
      const formEl = root.querySelector('#drawer-edit-form');
      if (readEl) readEl.hidden = this._editingDetails;
      if (formEl) formEl.hidden = !this._editingDetails;
      e.currentTarget.textContent = this._editingDetails ? '取消編輯' : '✏️ 編輯資訊';
    });

    root.querySelector('#btn-save-details')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const title = root.querySelector('#edit-ev-title')?.value?.trim() || '';
      const timeRaw = root.querySelector('#edit-ev-time')?.value || '';
      const targetArrival = timeRaw ? new Date(timeRaw) : this._event?.targetArrival;
      this._editingDetails = false;
      this._setDrawerOpen(false);
      await this.onUpdateEventDetails?.({ title, targetArrival });
    });

    root.querySelector('#btn-edit-time')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const editor = root.querySelector('#time-editor');
      if (editor) editor.hidden = !editor.hidden;
    });

    root.querySelector('#btn-save-time')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = root.querySelector('#f-new-time')?.value;
      if (val) {
        this._setDrawerOpen(false);
        await this.onUpdateTime(new Date(val));
      }
    });

    root.querySelectorAll('.segment[data-seg-idx]').forEach((segEl) => {
      segEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const itId = segEl.dataset.itId;
        const segIdx = Number(segEl.dataset.segIdx);
        const it = this._event?.itineraries?.find((x) => x.id === itId);
        this._mapView.open();
        if (it && this._mapView._itinerary?.id !== it.id) {
          this._mapView
            .setItinerary(it, {
              origin: this._event.origin,
              destination: this._event.destination,
              openMap: true,
            })
            .then(() => this._mapView.setActiveStep(segIdx));
        } else {
          this._mapView.setActiveStep(segIdx);
        }
        root.querySelector('#pinned-map-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    root.querySelectorAll('[data-action="toggle-expand"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="toggle-expand"]') !== el && e.target.closest('.itinerary-toggle-btn')) {
          return;
        }
        e.stopPropagation();
        this._toggleExpand(root, el.dataset.id);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          this._toggleExpand(root, el.dataset.id);
        }
      });
    });

    root.querySelectorAll('[data-action="select"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelectItinerary(btn.dataset.id);
      });
    });

    root.querySelectorAll('[data-action="remarks"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const card = root.querySelector(`.itinerary-card[data-itinerary-id="${id}"]`);
        const body = root.querySelector(`[data-body-for="${id}"]`);
        if (body && body.hidden) {
          body.hidden = false;
          card?.classList.add('is-expanded');
          const toggleText = card?.querySelector('.toggle-text');
          if (toggleText) toggleText.textContent = '收合';
        }
        const editor = root.querySelector(`[data-remarks-for="${id}"]`);
        if (editor) editor.hidden = !editor.hidden;
      });
    });

    root.querySelectorAll('[data-action="save-remarks"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const editor = root.querySelector(`[data-remarks-for="${btn.dataset.id}"]`);
        const textarea = editor?.querySelector('textarea');
        if (textarea) this.onUpdateRemarks(btn.dataset.id, textarea.value);
      });
    });

    root.querySelectorAll('[data-action="notify"]').forEach((input) => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        this.onToggleNotification(input.dataset.id, input.checked);
      });
    });
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }
}
