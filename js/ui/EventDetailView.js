import { ModeMeta, modeIconHtml } from '../models/TransportMode.js';
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
    onSaveUserPath,
  }) {
    this.onBack = onBack;
    this.onDelete = onDelete;
    this.onRefresh = onRefresh;
    this.onSelectItinerary = onSelectItinerary;
    this.onUpdateRemarks = onUpdateRemarks;
    this.onToggleNotification = onToggleNotification;
    this.onUpdateTime = onUpdateTime;
    this.onUpdateEventDetails = onUpdateEventDetails;
    this.onSaveUserPath = onSaveUserPath;
    this._expandedIds = new Set();
    this._drawerOpen = false;
    this._editingDetails = false;
    this._filterRailOpen = false;
    /** @type {Set<string>|null} enabled transport modes for filter; null = all on */
    this._enabledModes = null;
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

    const renderItineraryCard = (it) => {
      const isChosen = event.chosenItineraryId === it.id;
      const isShortest = shortestId === it.id;
      const isOpen = this._expandedIds.has(it.id);
      const durationNum = it.totalDuration;
      const durationBig =
        durationNum != null
          ? `<span class="it-duration-num">${durationNum}</span><span class="it-duration-unit">分鐘</span>`
          : '<span class="it-duration-num">—</span>';
      const modesInvolved = this._modesInvolved(it);
      const originName = event.origin?.name || it.segments[0]?.from?.name || '起點';
      const destName =
        event.destination?.name ||
        it.segments[it.segments.length - 1]?.to?.name ||
        it.segments[it.segments.length - 1]?.alightStop ||
        '終點';
      const startTime = fmt(it.segments[0]?.departAt || it.latestDeparture);
      const endTime = fmt(it.estimatedArrival);

      // Timeline legs — no nested boxes; vertical rail + nodes
      const legsHtml = it.segments
        .map((s, idx) => {
          const meta = ModeMeta[s.mode] || { label: s.mode };
          const isWalk = s.mode === 'walk';
          const board = s.boardStop || s.from?.name || '';
          const alight = s.alightStop || s.to?.name || '';
          const routeChip = s.route ? `<span class="route-chip">${this._esc(s.route)}</span>` : '';
          const dir = s.direction ? `<span class="leg-dir">${this._esc(s.direction)}</span>` : '';
          const dur =
            s.duration != null
              ? isWalk
                ? `${s.duration} 分鐘`
                : `車程 ${s.duration} 分鐘`
              : '';
          const etaBit = s.eta
            ? `${s.isRealEta ? '實時' : '推算'} ${fmt(s.eta)}`
            : s.departAt
              ? fmt(s.departAt)
              : '';

          return `
            <div class="tl-leg ${isWalk ? 'is-walk' : 'is-transit'}" data-seg-idx="${idx}" data-it-id="${it.id}" title="點擊在地圖高亮此段">
              <div class="tl-rail">
                <span class="tl-dot ${isWalk ? 'dot-walk' : 'dot-transit'}"></span>
                <span class="tl-line ${isWalk ? 'line-dashed' : 'line-solid'}"></span>
              </div>
              <div class="tl-leg-body">
                <div class="tl-leg-head">
                  <span class="tl-leg-icon">${modeIconHtml(s.mode, { size: 18 })}</span>
                  <span class="tl-leg-mode">${meta.label}${routeChip ? ' ' + routeChip : ''}</span>
                  ${dir}
                  <span class="tl-leg-dur">${this._esc(dur)}</span>
                </div>
                <div class="tl-leg-stops">
                  <span class="tl-stop-from">${this._esc(board)}</span>
                  <span class="tl-stop-arrow">→</span>
                  <span class="tl-stop-to">${this._esc(alight)}</span>
                </div>
                ${etaBit ? `<div class="tl-leg-eta">${this._esc(etaBit)}</div>` : ''}
              </div>
              <div class="tl-leg-time">${fmt(s.departAt)}${s.arriveAt ? ` → ${fmt(s.arriveAt)}` : ''}</div>
            </div>
          `;
        })
        .join('');

      const badges = [
        it.isImpracticalWalk ? '<span class="card-badge danger">已拒絕·步行過遠</span>' : '',
        !it.isImpracticalWalk && isShortest ? '<span class="card-badge warning">最短時間 · 推薦</span>' : '',
                it.isUserSaved ? '<span class="card-badge info">自訂路徑</span>' : it.isCustomized ? '<span class="card-badge info">已自訂</span>' : '',
      ]
        .filter(Boolean)
        .join('');

      const modeIcons = this._renderModeIconStrip(modesInvolved);

      const routeSummaryHtml = this._buildRouteSummaryChain(it, originName, destName);

      return `
          <div class="card itinerary-card ${isChosen ? 'is-selected' : ''} ${isOpen ? 'is-expanded' : ''}" data-itinerary-id="${it.id}">
            <div class="itinerary-header" data-action="toggle-expand" data-id="${it.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
              <div class="itinerary-header-top">
                <div class="route-summary-scroll-container" title="${this._esc(it.label)}">
                  ${routeSummaryHtml}
                </div>
                <span class="itinerary-chevron" aria-hidden="true">▼</span>
              </div>
              <div class="itinerary-header-bottom">
                <div class="it-summary-row">
                  <div class="it-duration">${durationBig}</div>
                  <div class="it-summary-meta">
                    <span class="it-summary-arrive">預計到達 <strong>${endTime}</strong></span>
                    <span class="it-summary-depart">最遲出發 ${fmt(it.latestDeparture)}</span>
                  </div>
                </div>
                <div class="itinerary-header-meta">
                  <span class="it-badges">${badges}</span>
                  ${modeIcons}
                </div>
              </div>
            </div>

            <div class="itinerary-body" data-body-for="${it.id}" ${isOpen ? '' : 'hidden'}>
              <div class="tl-timeline">
                <div class="tl-node tl-start">
                  <div class="tl-rail">
                    <span class="tl-dot dot-start"></span>
                    <span class="tl-line line-solid"></span>
                  </div>
                  <div class="tl-node-body">
                    <span class="tl-node-tag">START</span>
                    <span class="tl-node-name">${this._esc(originName)}</span>
                  </div>
                  <div class="tl-node-time">${startTime}</div>
                </div>

                ${legsHtml}

                <div class="tl-node tl-end">
                  <div class="tl-rail">
                    <span class="tl-dot dot-end"></span>
                  </div>
                  <div class="tl-node-body">
                    <span class="tl-node-tag">END</span>
                    <span class="tl-node-name">${this._esc(destName)}</span>
                  </div>
                  <div class="tl-node-time">${endTime}</div>
                </div>
              </div>

              ${it.impracticalReason ? `<div class="itinerary-reject-note">${this._esc(it.impracticalReason)}</div>` : ''}
              ${it.remarks ? `<div class="itinerary-remarks">${this._esc(it.remarks)}</div>` : ''}

              <div class="itinerary-actions">
                <button type="button" class="btn ${isChosen ? 'btn-ghost is-chosen-btn' : 'btn-ghost'} btn-sm touch-target" data-action="select" data-id="${it.id}" ${isChosen ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
                  ${isChosen ? '目前方案' : '選擇此方案'}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="edit-path" data-id="${it.id}">編輯路徑</button>
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

              <div class="path-editor" data-path-edit-for="${it.id}" hidden>
                <div class="path-editor-title">編輯站點後另存為「自訂路徑」</div>
                <div class="path-editor-segs">
                  ${it.segments
                    .map((s, idx) => {
                      if (!s.isTransit()) {
                        return `
                          <div class="path-edit-seg walk" data-seg-idx="${idx}">
                            <span class="path-edit-mode">步行</span>
                            <span class="card-sub">${this._esc(s.from?.name || '')} → ${this._esc(s.to?.name || '')}</span>
                          </div>`;
                      }
                      const isRail = s.mode === 'mtr' || s.mode === 'lrt';
                      return `
                        <div class="path-edit-seg transit" data-seg-idx="${idx}">
                          <div class="path-edit-mode">${this._esc((ModeMeta[s.mode] || {}).label || s.mode)}${s.route ? ` · ${this._esc(s.route)}` : ''}</div>
                          <label>上車站
                            <input type="text" data-field="boardStop" data-seg-idx="${idx}" value="${this._esc(s.boardStop || s.from?.name || '')}" placeholder="上車站名稱" />
                          </label>
                          <label>下車站
                            <input type="text" data-field="alightStop" data-seg-idx="${idx}" value="${this._esc(s.alightStop || s.to?.name || '')}" placeholder="下車站名稱" />
                          </label>
                          ${isRail ? `<label>出口（可選）<input type="text" data-field="exit" data-seg-idx="${idx}" value="${this._esc(s.exit || '')}" placeholder="例如 B2" /></label>` : ''}
                        </div>`;
                    })
                    .join('')}
                </div>
                <div class="path-editor-actions">
                  <button type="button" class="btn btn-primary btn-sm" data-action="save-user-path" data-id="${it.id}">儲存為自訂路徑</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-action="cancel-edit-path" data-id="${it.id}">取消</button>
                </div>
              </div>
            </div>
          </div>
        `;
    };

    // Mode filter (MTR / BUS / MINIBUS / LRT / WALK) — show path if its modes ⊆ enabled
    const modeDefs = this._filterModeDefs();
    if (!this._enabledModes) {
      this._enabledModes = new Set(modeDefs.map((m) => m.key));
    }
    const filteredIts = (event.itineraries || []).filter((it) =>
      this._itineraryMatchesModeFilter(it, this._enabledModes)
    );
    // Still group filtered list by combo for readable sections
    const groups = this._groupItinerariesByCombo(filteredIts, event.chosenItineraryId);
    const itCards = groups
      .map((g) => {
        const cards = g.items.map(renderItineraryCard).join('');
        return `
          <section class="path-category" data-combo="${this._esc(g.key)}">
            <div class="path-category-header">
              <span class="path-category-title">${this._esc(g.title)}</span>
              <span class="path-category-count">${g.items.length}</span>
            </div>
            <div class="path-category-list">
              ${cards}
            </div>
          </section>
        `;
      })
      .join('');

    const modeCounts = this._countByMode(event.itineraries || []);
    const filterItems = modeDefs
      .map((m) => {
        const on = this._enabledModes.has(m.key);
        const count = modeCounts[m.key] ?? 0;
        return `
          <button type="button" class="combo-filter-item ${on ? 'is-on' : ''}" data-action="toggle-mode" data-mode="${m.key}" title="${this._esc(m.label)}">
            <span class="combo-filter-dot"></span>
            <span class="combo-filter-label">${m.iconHtml || ''} ${this._esc(m.label)}</span>
            <span class="combo-filter-count">${count}</span>
          </button>
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
      <div class="detail-layout ${this._filterRailOpen ? 'filter-rail-open' : ''}">
      <aside class="combo-filter-rail ${this._filterRailOpen ? 'is-open' : ''}" id="combo-filter-rail" aria-label="路徑組合篩選">
        <button type="button" class="combo-filter-peek" id="btn-toggle-filter-rail" title="篩選路徑組合">
          <span class="peek-icon">☰</span>
          <span class="peek-text">方式</span>
        </button>
        <div class="combo-filter-panel">
          <div class="combo-filter-head">
            <span class="combo-filter-title">交通方式</span>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-close-filter-rail">收合</button>
          </div>
          <div class="combo-filter-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="combo-all">全選</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="combo-none">全關</button>
          </div>
          <div class="combo-filter-list">
            ${filterItems}
          </div>
        </div>
      </aside>

      <div class="detail-main">
      <div class="detail-topbar">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-back">← 返回</button>
        <div class="detail-topbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-drawer" title="開啟/隱藏外部路徑資訊選單">路徑資訊</button>
        </div>
      </div>

      <div class="pinned-map-anchor" id="pinned-map-anchor">
        ${this._mapView.renderBriefPreviewPanel()}
        ${this._mapView.render()}
      </div>

      <div class="detail-section-label">路線方案（左側可篩選組合；已選方案預設展開）</div>
      <div id="path-list-root">${itCards || '<div class="card-sub" style="padding:12px">沒有符合篩選的方案，請在左側開啟組合。</div>'}</div>

      <button type="button" class="btn btn-ghost btn-block" id="btn-refresh">重新計算最短時間與班次</button>
      <button type="button" class="btn btn-danger btn-block" id="btn-delete">刪除行程</button>
      </div><!-- .detail-main -->
      </div><!-- .detail-layout -->

      <div class="side-drawer-backdrop ${this._drawerOpen ? 'is-open' : ''}" id="side-drawer-backdrop"></div>
      <div class="path-info-rail ${this._drawerOpen ? 'is-open' : ''}" id="path-info-rail">
        <button type="button" class="path-info-peek" id="btn-toggle-path-info-peek" title="路徑資訊">
          <span class="peek-icon">ℹ</span>
          <span class="peek-text">資訊</span>
        </button>
      <aside class="side-drawer side-drawer-75 ${this._drawerOpen ? 'is-open' : ''}" id="side-drawer" aria-label="外部路徑資訊選單">
        <div class="side-drawer-head">
          <div class="side-drawer-head-text">
            <div class="side-drawer-heading">路徑資訊與設定</div>
            <div class="card-sub">僅顯示與編輯目前路徑資訊</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm side-drawer-close" id="btn-close-drawer" title="隱藏側邊選單">收合</button>
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
              ${this._editingDetails ? '取消編輯' : '編輯資訊'}
            </button>
          </div>

          <div class="drawer-kv-list" id="drawer-read-view" ${this._editingDetails ? 'hidden' : ''}>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">ORIGIN · 出發起點（固定）</span>
              <span class="drawer-kv-v">${this._esc(event.origin?.name || '未設定起點')}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">DEST · 目的地（固定）</span>
              <span class="drawer-kv-v">${this._esc(event.destination.name)}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">ETA · 目標到達</span>
              <span class="drawer-kv-v">${dateFmt(event.targetArrival)}</span>
            </div>
            <div class="drawer-kv-item">
              <span class="drawer-kv-k">ROUTE · 路徑摘要</span>
              <span class="drawer-kv-v">${this._esc(activeIt?.summary || '—')}</span>
            </div>
          </div>

          <div class="drawer-edit-form" id="drawer-edit-form" ${this._editingDetails ? '' : 'hidden'}>
            <div class="drawer-form-field">
              <label for="edit-ev-title">行程名稱</label>
              <input id="edit-ev-title" type="text" value="${this._esc(event.title)}" />
            </div>
            <div class="drawer-kv-item drawer-kv-readonly">
              <span class="drawer-kv-k">ORIGIN · 出發起點（不可修改）</span>
              <span class="drawer-kv-v">${this._esc(event.origin?.name || '未設定起點')}</span>
            </div>
            <div class="drawer-kv-item drawer-kv-readonly">
              <span class="drawer-kv-k">DEST · 目的地（不可修改）</span>
              <span class="drawer-kv-v">${this._esc(event.destination.name)}</span>
            </div>
            <div class="drawer-form-field">
              <label for="edit-ev-time">目標到達時間</label>
              <input id="edit-ev-time" type="datetime-local" value="${localArrivalVal}" />
            </div>
            <button type="button" class="btn btn-primary btn-block" id="btn-save-details">儲存資訊</button>
          </div>
        </div>
      </aside>
      </div><!-- #path-info-rail -->
    `;
  }

  _setDrawerOpen(open) {
    this._drawerOpen = !!open;
    const drawer = this._pageRoot?.querySelector('#side-drawer');
    const rail = this._pageRoot?.querySelector('#path-info-rail');
    const backdrop = this._pageRoot?.querySelector('#side-drawer-backdrop');
    if (drawer) drawer.classList.toggle('is-open', this._drawerOpen);
    if (rail) rail.classList.toggle('is-open', this._drawerOpen);
    if (backdrop) {
      backdrop.hidden = false;
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
    this._bindComboFilter(root);

    // Horizontal swipe on route summary must not toggle card expand
    root.querySelectorAll('.route-summary-scroll-container').forEach((el) => {
      el.addEventListener('click', (e) => e.stopPropagation());
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
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
    root.querySelector('#btn-toggle-path-info-peek')?.addEventListener('click', (e) => {
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
      e.currentTarget.textContent = this._editingDetails ? '取消編輯' : '編輯資訊';
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

    root.querySelectorAll('[data-action="edit-path"]').forEach((btn) => {
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
          this._expandedIds.add(id);
        }
        const editor = root.querySelector(`[data-path-edit-for="${id}"]`);
        if (editor) editor.hidden = !editor.hidden;
      });
    });

    root.querySelectorAll('[data-action="cancel-edit-path"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const editor = root.querySelector(`[data-path-edit-for="${btn.dataset.id}"]`);
        if (editor) editor.hidden = true;
      });
    });

    root.querySelectorAll('[data-action="save-user-path"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const editor = root.querySelector(`[data-path-edit-for="${id}"]`);
        if (!editor || !this.onSaveUserPath) return;
        const edits = [];
        editor.querySelectorAll('.path-edit-seg.transit').forEach((segEl) => {
          const segIndex = Number(segEl.dataset.segIdx);
          const boardStop = segEl.querySelector('[data-field="boardStop"]')?.value;
          const alightStop = segEl.querySelector('[data-field="alightStop"]')?.value;
          const exit = segEl.querySelector('[data-field="exit"]')?.value;
          edits.push({ segIndex, boardStop, alightStop, exit });
        });
        this.onSaveUserPath(id, edits);
      });
    });
  }



  _bindComboFilter(root) {
    const rail = root.querySelector('#combo-filter-rail');
    const openRail = (open) => {
      this._filterRailOpen = open;
      rail?.classList.toggle('is-open', open);
      root.querySelector('.detail-layout')?.classList.toggle('filter-rail-open', open);
    };

    root.querySelector('#btn-toggle-filter-rail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openRail(!this._filterRailOpen);
    });
    root.querySelector('#btn-close-filter-rail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openRail(false);
    });

    root.querySelectorAll('[data-action="toggle-mode"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.getAttribute('data-mode');
        if (!key) return;
        if (!this._enabledModes) this._enabledModes = new Set();
        if (this._enabledModes.has(key)) this._enabledModes.delete(key);
        else this._enabledModes.add(key);
        this._applyComboFilter(root);
      });
    });

    root.querySelector('[data-action="combo-all"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._enabledModes = new Set(this._filterModeDefs().map((m) => m.key));
      this._applyComboFilter(root);
    });

    root.querySelector('[data-action="combo-none"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._enabledModes = new Set();
      this._applyComboFilter(root);
    });
  }

  _applyComboFilter(root) {
    // Re-render detail view in place to keep filter + expand state
    if (!this._event || !this._pageRoot) return;
    const parent = this._pageRoot;
    const html = this.render(this._event);
    parent.innerHTML = html;
    this.bind(parent);
  }


  _filterModeDefs() {
    return [
      { key: 'mtr', label: '港鐵', iconHtml: modeIconHtml('mtr', { size: 16 }) },
      { key: 'bus', label: '巴士', iconHtml: modeIconHtml('bus', { size: 16 }) },
      { key: 'minibus', label: '小巴', iconHtml: modeIconHtml('minibus', { size: 16 }) },
      { key: 'lrt', label: '輕鐵', iconHtml: modeIconHtml('lrt', { size: 16 }) },
      { key: 'walk', label: '步行', iconHtml: modeIconHtml('walk', { size: 16 }) },
      { key: 'taxi', label: '的士', iconHtml: modeIconHtml('taxi', { size: 16 }) },
    ];
  }

  /**
   * Show itinerary when every transit mode it uses is enabled.
   * Walk is always allowed as access for multi-mode trips; pure-walk needs walk ON.
   */
  _itineraryMatchesModeFilter(it, enabled) {
    if (!enabled) return true;
    const modes = this._modesInvolved(it);
    const transit = [...modes].filter((m) => m !== 'walk');
    if (!transit.length) {
      return enabled.has('walk');
    }
    return transit.every((m) => enabled.has(m));
  }

  /** Count itineraries that involve each mode (for badge numbers). */
  _countByMode(itineraries) {
    const counts = { mtr: 0, bus: 0, minibus: 0, lrt: 0, walk: 0 };
    for (const it of itineraries) {
      const modes = this._modesInvolved(it);
      for (const m of Object.keys(counts)) {
        if (modes.has(m)) counts[m] += 1;
      }
    }
    return counts;
  }

  _modesInvolved(it) {
    const set = new Set();
    for (const s of it?.segments || []) {
      if (s?.mode) set.add(s.mode);
    }
    return set;
  }

  /**
   * Multi-node route summary:
   * [origin] ➔ 🚇 mode ➔ [transfer] ➔ 🚌 mode ➔ [dest]
   * Walk between stations → small walk icon only (no label).
   */
  _buildRouteSummaryChain(it, originName, destName) {
    const segs = it?.segments || [];
    const parts = [];
    const arrow = '<span class="arrow">➔</span>';

    const stationHtml = (name, kind) => {
      const n = String(name || '').trim() || '—';
      const cls = kind === 'main' ? 'location main-station' : 'location transfer-station';
      return `<span class="${cls}" title="${this._esc(n)}">${this._esc(n)}</span>`;
    };

    const transitHtml = (mode, route) => {
      const meta = ModeMeta[mode] || { label: mode };
      let name = meta.label || mode;
      if (route) name = `${name} ${route}`.trim();
      return `<div class="transit-indicator">
        <span class="mode-icon">${modeIconHtml(mode, { size: 14, className: 'mode-icon-img' })}</span>
        <span class="mode-name">${this._esc(name)}</span>
      </div>`;
    };

    const walkMini = () =>
      `<div class="transit-indicator is-walk-mini" title="步行">
        <span class="mode-icon">${modeIconHtml('walk', { size: 12, className: 'mode-icon-img' })}</span>
      </div>`;

    if (!segs.length) {
      parts.push(stationHtml(originName, 'main'));
      parts.push(arrow);
      parts.push(transitHtml('walk'));
      parts.push(arrow);
      parts.push(stationHtml(destName, 'main'));
      return `<div class="route-summary">${parts.join('')}</div>`;
    }

    const firstFrom = segs[0].boardStop || segs[0].from?.name || originName || '起點';
    parts.push(stationHtml(firstFrom, 'main'));

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const isWalk = s.mode === 'walk';
      const isLast = i === segs.length - 1;
      const toName =
        s.alightStop || s.to?.name || (isLast ? destName : '') || '—';

      parts.push(arrow);
      if (isWalk) {
        parts.push(walkMini());
      } else {
        parts.push(transitHtml(s.mode, s.route));
      }
      parts.push(arrow);
      parts.push(stationHtml(toName, isLast ? 'main' : 'transfer'));
    }

    return `<div class="route-summary">${parts.join('')}</div>`;
  }

  _renderModeIconStrip(modesInvolved) {
    // Fixed order strip; lit when involved
    const order = [
      { mode: 'mtr', title: '港鐵' },
      { mode: 'bus', title: '巴士' },
      { mode: 'minibus', title: '小巴' },
      { mode: 'lrt', title: '輕鐵' },
      { mode: 'walk', title: '步行' },
      { mode: 'taxi', title: '的士' },
    ];
    const cells = order
      .map((o) => {
        const on = modesInvolved.has(o.mode);
        return `<span class="mode-type-icon ${on ? 'is-on' : 'is-off'}" title="${o.title}${on ? '（本方案使用）' : ''}" data-mode="${o.mode}">${modeIconHtml(o.mode, { size: 20 })}</span>`;
      })
      .join('');
    return `<div class="mode-type-strip" aria-label="交通方式">${cells}</div>`;
  }

  _comboKey(it) {
    const modes = [];
    const seen = new Set();
    for (const s of it?.segments || []) {
      const m = s?.mode;
      if (!m || m === 'walk') continue; // walk is access, not a combo pillar
      if (!seen.has(m)) {
        seen.add(m);
        modes.push(m);
      }
    }
    if (!modes.length) {
      // pure walk (or empty)
      return it?.isImpracticalWalk ? 'walk-reject' : 'walk';
    }
    // stable order
    const rank = { mtr: 1, lrt: 2, bus: 3, minibus: 4 };
    modes.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
    return modes.join('+');
  }

  _comboTitle(key) {
    const map = {
      'user-saved': '自訂路徑（已儲存）',
      walk: '純步行',
      'walk-reject': '步行（不建議）',
      mtr: '港鐵',
      bus: '巴士',
      minibus: '小巴',
      lrt: '輕鐵',
      'mtr+bus': '港鐵 + 巴士',
      'mtr+minibus': '港鐵 + 小巴',
      'mtr+lrt': '港鐵 + 輕鐵',
      'bus+minibus': '巴士 + 小巴',
      'mtr+bus+minibus': '港鐵 + 巴士 + 小巴',
      'mtr+lrt+bus': '港鐵 + 輕鐵 + 巴士',
    };
    if (map[key]) return map[key];
    return key
      .split('+')
      .map((m) => ({ mtr: '港鐵', bus: '巴士', minibus: '小巴', lrt: '輕鐵', walk: '步行' }[m] || m))
      .join(' + ');
  }

  _groupItinerariesByCombo(itineraries, chosenId) {
    // 單一交通工具分類在前，組合轉乘在後（仍按組合分類顯示）
    const order = [
      'user-saved',
      'mtr',
      'bus',
      'minibus',
      'lrt',
      'walk',
      'mtr+lrt',
      'mtr+bus',
      'mtr+minibus',
      'bus+minibus',
      'mtr+bus+minibus',
      'mtr+lrt+bus',
      'walk-reject',
    ];
    const buckets = new Map();
    for (const it of itineraries || []) {
      const key = it.isUserSaved ? 'user-saved' : this._comboKey(it);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        const aChosen = chosenId && a.id === chosenId ? 0 : 1;
        const bChosen = chosenId && b.id === chosenId ? 0 : 1;
        if (aChosen !== bChosen) return aChosen - bChosen;
        // 同類別內：步數少優先，再比總時長
        const aSteps = a.segments?.length ?? 99;
        const bSteps = b.segments?.length ?? 99;
        if (aSteps !== bSteps) return aSteps - bSteps;
        const aDur = Number.isFinite(a.totalDuration) ? a.totalDuration : Infinity;
        const bDur = Number.isFinite(b.totalDuration) ? b.totalDuration : Infinity;
        if (aDur !== bDur) return aDur - bDur;
        return String(a.label || '').localeCompare(String(b.label || ''), 'zh-HK');
      });
    }
    const keys = [...buckets.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      const ra = ia === -1 ? 500 : ia;
      const rb = ib === -1 ? 500 : ib;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    // 已選方案所在分類移到最前
    if (chosenId) {
      const chosen = (itineraries || []).find((x) => x.id === chosenId);
      if (chosen) {
        const ck = chosen.isUserSaved ? 'user-saved' : this._comboKey(chosen);
        const idx = keys.indexOf(ck);
        if (idx > 0) {
          keys.splice(idx, 1);
          keys.unshift(ck);
        }
      }
    }
    return keys.map((key) => ({
      key,
      title: this._comboTitle(key),
      items: buckets.get(key) || [],
    }));
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }
}
//(註：內容由 AI 生成)
