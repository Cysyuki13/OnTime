import { Location } from '../models/Location.js';
import { ModeMeta } from '../models/TransportMode.js';
import { CONFIG } from '../config.js';
import { HK_MTR_STATIONS, HK_MTR_LINE_EDGES, HK_LANDMARKS } from '../data/hkStations.js';
import { HK_PLACES_DB } from '../data/hkPlacesDb.js';
import {
  HK_MAP_BOUNDS,
  HK_MTR_LINE_COLORS,
  HK_LANDMASS_POLYGONS,
  HK_MAJOR_ROADS,
} from '../data/hkMapGeometry.js';
import { fetchJsonWithCorsFallback } from '../services/CorsFetchService.js';

const MODE_STROKE = {
  walk: '#c8c9cb',
  mtr: '#d8a24a',
  bus: '#d0834f',
  minibus: '#86a06f',
  ferry: '#7fa8b8',
};

export class HKMapView {
  /**
   * @param {'picker'|'route'} mode
   */
  constructor({ mode = 'picker', onPickLocation = null, height = 270, defaultOpen = false } = {}) {
    this.mode = mode;
    this.onPickLocation = onPickLocation;
    this.height = height;
    this._isOpen = !!defaultOpen;
    this._isFullscreen = false;

    this._center = { ...HK_MAP_BOUNDS.defaultCenter };
    this._zoom = HK_MAP_BOUNDS.defaultZoom;
    this._activeTarget = 'dest';

    this._origin = null;
    this._destination = null;
    this._itinerary = null;
    this._activeStepIndex = -1;
    this._resolvedLegPaths = new Map();

    this._hoveredLabel = null;
    this._labelHitBoxes = [];
    this._isDragging = false;
    this._dragStart = null;
    this._dragMoved = false;

    /** @type {Map<number, {x:number,y:number}>} */
    this._activePointers = new Map();
    this._pinchState = null; // { dist, zoom, centerLatLng, midX, midY }

    this._pageRoot = null;
    this._root = null;
    this._canvas = null;
    this._ctx = null;
    this._raf = null;
    this._pulsePhase = 0;

    this._stationByCode = new Map(HK_MTR_STATIONS.map((s) => [s.code, s]));
    this._interactiveLabels = this._buildInteractiveLabels();
  }

  _buildInteractiveLabels() {
    const items = [];
    const seen = new Set();

    for (const st of HK_MTR_STATIONS) {
      if (seen.has(st.name)) continue;
      seen.add(st.name);
      items.push({
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        kind: 'mtr',
        lineCode: st.lineCode,
        minZoom: 11.2,
        address: `${st.line} · 港鐵站`,
      });
    }

    for (const lm of HK_LANDMARKS) {
      if (seen.has(lm.name)) continue;
      seen.add(lm.name);
      items.push({
        name: lm.name,
        lat: lm.lat,
        lng: lm.lng,
        kind: 'landmark',
        minZoom: 11.0,
        address: lm.address || '香港地標',
      });
    }

    for (const p of HK_PLACES_DB) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      items.push({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        kind: 'place',
        minZoom: p.category === '屋邨' || p.category === '商場' ? 12.2 : 12.8,
        address: `${p.district} · ${p.address || p.category}`,
      });
    }

    return items;
  }

  renderBriefPreviewPanel() {
    const originName = this._origin?.name || '起點';
    const destName = this._destination?.name || '終點';
    const legCount = this._itinerary?.segments?.length || 0;
    const badgeText = this._isOpen ? '地圖已展開' : '點擊開啟完整地圖';

    return `
      <div class="map-brief-panel ${this._isOpen ? 'is-expanded' : ''}" data-map-brief-panel role="button" tabindex="0" aria-expanded="${this._isOpen}">
        <div class="map-brief-left">
          <div class="map-brief-badge-row">
            <span class="map-brief-pill">路線地圖可用</span>
            <span class="map-brief-cta">${badgeText}</span>
          </div>
          <div class="map-brief-route">${this._esc(originName)} → ${this._esc(destName)}${legCount ? ` · 共 ${legCount} 段` : ''}</div>
          <div class="map-brief-sub">點按此地圖預覽面板展開互動路線地圖，亦可放大至全螢幕檢視</div>
        </div>
        <div class="map-brief-mini-canvas-wrap" aria-hidden="true">
          <canvas class="map-brief-mini-canvas"></canvas>
          <span class="map-brief-expand-tag">${this._isOpen ? '收合' : '展開地圖'}</span>
        </div>
      </div>
    `;
  }

  _drawBriefMiniMap() {
    const mini = this._pageRoot?.querySelector('.map-brief-mini-canvas');
    if (!mini) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = mini.clientWidth || 128;
    const h = mini.clientHeight || 64;
    if (mini.width !== Math.round(w * dpr) || mini.height !== Math.round(h * dpr)) {
      mini.width = Math.round(w * dpr);
      mini.height = Math.round(h * dpr);
    }
    const ctx = mini.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#151618';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = '#232426';
    ctx.lineWidth = 1;
    for (let x = 16; x < w; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 14; y < h; y += 18) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Mini route curve
    ctx.beginPath();
    ctx.moveTo(16, h - 14);
    ctx.quadraticCurveTo(w * 0.48, 10, w - 18, 16);
    ctx.strokeStyle = '#d8a24a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.stroke();

    // Start & End squares
    ctx.fillStyle = '#d8a24a';
    ctx.fillRect(12, h - 18, 8, 8);

    ctx.fillStyle = '#c2564a';
    ctx.fillRect(w - 22, 12, 8, 8);
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  renderToggleButton(labelText = null) {
    const text =
      labelText ||
      (this.mode === 'picker'
        ? this._isOpen
          ? '收合香港地圖'
          : '開啟香港地圖選點'
        : this._isOpen
          ? '收合路線地圖'
          : '開啟路線地圖');
    return `
      <button type="button" class="btn btn-ghost btn-sm hk-map-trigger-btn ${this._isOpen ? 'is-open' : ''}" data-map-toggle aria-expanded="${this._isOpen}">
        <span>${text}</span>
      </button>
    `;
  }

  render() {
    const pickerToolbar =
      this.mode === 'picker'
        ? `
          <div class="hk-map-toolbar">
            <span class="hk-map-title">香港互動地圖點選</span>
            <div class="hk-map-target-switch" role="group" aria-label="地圖點選目標">
              <button type="button" class="hk-map-pill" data-map-target="origin">設為起點</button>
              <button type="button" class="hk-map-pill is-active" data-map-target="dest">設為目的地</button>
            </div>
          </div>
        `
        : `
          <div class="hk-map-toolbar">
            <span class="hk-map-title">香港路線全覽與逐步導航路徑</span>
            <div class="hk-map-legend">
              <span class="hk-leg-item"><i style="background:#c8c9cb"></i>步行</span>
              <span class="hk-leg-item"><i style="background:#d8a24a"></i>港鐵</span>
              <span class="hk-leg-item"><i style="background:#d0834f"></i>巴士</span>
              <span class="hk-leg-item"><i style="background:#86a06f"></i>小巴</span>
            </div>
          </div>
        `;

    const walkthroughBar =
      this.mode === 'route'
        ? `
          <div class="hk-map-walkthrough" data-map-walkthrough>
            <button type="button" class="btn btn-ghost btn-sm" data-walk-prev>◂ 上一段</button>
            <div class="hk-walkthrough-status" data-walk-status>全路線總覽（點選下方分段可逐段高亮）</div>
            <button type="button" class="btn btn-ghost btn-sm" data-walk-next>下一段 ▸</button>
          </div>
        `
        : '';

    return `
      <div class="hk-map-shell" data-hk-map-shell>
        <div class="hk-map-box ${this._isFullscreen ? 'is-fullscreen' : ''}" data-hk-map ${this._isOpen ? '' : 'hidden'}>
          ${pickerToolbar}
          <div class="hk-map-viewport" style="height:${this.height}px">
            <canvas class="hk-map-canvas"></canvas>
            <div class="hk-map-controls">
              <button type="button" class="hk-map-ctrl-btn" data-map-fullscreen title="${this._isFullscreen ? '退出全螢幕' : '全螢幕放大地圖'}">${this._isFullscreen ? 'X' : '□'}</button>
              <button type="button" class="hk-map-ctrl-btn" data-map-zoom="in" title="放大">+</button>
              <button type="button" class="hk-map-ctrl-btn" data-map-zoom="out" title="縮小">-</button>
              <button type="button" class="hk-map-ctrl-btn" data-map-reset title="重設視角">R</button>
            </div>
            <div class="hk-map-hint" data-map-hint>
              ${this.mode === 'picker' ? '點擊地圖標籤或任意位置選取座標 · 單指拖曳平移 · 雙指捏合縮放' : '單指拖曳平移 · 雙指捏合縮放 · 高亮顯示完整轉乘與步行路徑'}
            </div>
          </div>
          ${walkthroughBar}
        </div>
      </div>
    `;
  }

  bind(root) {
    this._pageRoot = root;
    this._root = root.querySelector('[data-hk-map]');
    if (!this._root) return;
    this._canvas = this._root.querySelector('.hk-map-canvas');
    this._ctx = this._canvas.getContext('2d');

    this._resizeCanvas();
    this._ro = new ResizeObserver(() => this._resizeCanvas());
    this._ro.observe(this._canvas.parentElement);

    root.querySelectorAll('[data-map-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleOpen();
      });
    });

    const briefPanel = root.querySelector('[data-map-brief-panel]');
    if (briefPanel) {
      this._drawBriefMiniMap();
      briefPanel.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleOpen();
      });
      briefPanel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          this.toggleOpen();
        }
      });
    }

    this._root.querySelector('[data-map-fullscreen]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFullscreen();
    });

    this._root.querySelectorAll('[data-map-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._activeTarget = btn.dataset.mapTarget;
        this._root.querySelectorAll('[data-map-target]').forEach((b) =>
          b.classList.toggle('is-active', b.dataset.mapTarget === this._activeTarget)
        );
      });
    });

    this._root.querySelector('[data-map-zoom="in"]')?.addEventListener('click', () => {
      this._setZoom(this._zoom + 0.85);
    });
    this._root.querySelector('[data-map-zoom="out"]')?.addEventListener('click', () => {
      this._setZoom(this._zoom - 0.85);
    });
    this._root.querySelector('[data-map-reset]')?.addEventListener('click', () => {
      if (this.mode === 'route' && this._itinerary) {
        this.setActiveStep(-1);
        this._fitRouteBounds();
      } else {
        this._center = { ...HK_MAP_BOUNDS.defaultCenter };
        this._zoom = HK_MAP_BOUNDS.defaultZoom;
      }
    });

    this._root.querySelector('[data-walk-prev]')?.addEventListener('click', () => {
      if (!this._itinerary?.segments?.length) return;
      const next = this._activeStepIndex <= 0 ? -1 : this._activeStepIndex - 1;
      this.setActiveStep(next);
    });
    this._root.querySelector('[data-walk-next]')?.addEventListener('click', () => {
      if (!this._itinerary?.segments?.length) return;
      const len = this._itinerary.segments.length;
      const next = this._activeStepIndex >= len - 1 ? -1 : this._activeStepIndex + 1;
      this.setActiveStep(next);
    });

    const onPointerDown = (e) => {
      // Ignore non-primary mouse buttons
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this._canvas.setPointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }

      if (this._activePointers.size === 1) {
        this._isDragging = true;
        this._dragMoved = false;
        this._dragStart = { x: e.clientX, y: e.clientY, center: { ...this._center } };
        this._pinchState = null;
      } else if (this._activePointers.size === 2) {
        // Switch from pan to pinch
        this._isDragging = false;
        this._dragStart = null;
        this._dragMoved = true; // prevent accidental click on lift
        this._initPinchState();
      }
    };

    const onPointerMove = (e) => {
      if (!this._activePointers.has(e.pointerId)) return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const rect = this._canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this._activePointers.size >= 2 && this._pinchState) {
        this._handlePinchMove();
        return;
      }

      if (this._isDragging && this._dragStart) {
        const dx = e.clientX - this._dragStart.x;
        const dy = e.clientY - this._dragStart.y;
        if (Math.hypot(dx, dy) > 4) this._dragMoved = true;

        const scale = this._pixelsPerDegree();
        const nextLat = this._dragStart.center.lat + dy / scale.lat;
        const nextLng = this._dragStart.center.lng - dx / scale.lng;
        this._center = this._clampHongKongCenter(nextLat, nextLng);
        return;
      }

      // Hover only for mouse / single pointer
      if (this._activePointers.size <= 1) {
        const hit = this._hitTestLabel(px, py);
        this._hoveredLabel = hit;
        this._canvas.style.cursor = hit ? 'pointer' : this.mode === 'picker' ? 'crosshair' : 'grab';
      }
    };

    const onPointerUp = (e) => {
      const wasPinching = this._activePointers.size >= 2;
      this._activePointers.delete(e.pointerId);
      try {
        this._canvas.releasePointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }

      if (this._activePointers.size === 0) {
        const didMove = this._dragMoved || wasPinching;
        this._isDragging = false;
        this._dragStart = null;
        this._pinchState = null;

        // Tap-to-pick when the gesture was a pure click/tap (no drag or pinch)
        if (!didMove && this.mode === 'picker') {
          const rect = this._canvas.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          this._handleMapClick(px, py);
        }
        this._dragMoved = false;
      } else if (this._activePointers.size === 1) {
        // Transition from pinch back to single-finger pan
        this._pinchState = null;
        const remaining = this._activePointers.values().next().value;
        this._isDragging = true;
        this._dragMoved = true;
        this._dragStart = {
          x: remaining.x,
          y: remaining.y,
          center: { ...this._center },
        };
      }
    };

    this._canvas.addEventListener('pointerdown', onPointerDown);
    this._canvas.addEventListener('pointermove', onPointerMove);
    this._canvas.addEventListener('pointerup', onPointerUp);
    this._canvas.addEventListener('pointercancel', onPointerUp);
    this._canvas.addEventListener('lostpointercapture', (e) => {
      if (this._activePointers.has(e.pointerId)) {
        onPointerUp(e);
      }
    });

    this._canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this._canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const delta = e.deltaY < 0 ? 0.55 : -0.55;
        this._zoomAroundPoint(px, py, this._zoom + delta);
      },
      { passive: false }
    );

    // Prevent browser page zoom / scroll interference while interacting with map
    this._canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length >= 2) e.preventDefault();
      },
      { passive: false }
    );
    this._canvas.addEventListener(
      'gesturestart',
      (e) => e.preventDefault(),
      { passive: false }
    );

    if (this._isOpen) {
      this._startLoop();
    }
  }

  open({ focus = null } = {}) {
    if (!this._isOpen) {
      this._isOpen = true;
      this._syncOpenState();
    }
    if (focus?.hasCoords) {
      this._center = this._clampHongKongCenter(focus.lat, focus.lng);
      this._zoom = Math.max(this._zoom, 13.5);
    } else if (this.mode === 'route' && this._itinerary) {
      this._fitRouteBounds();
    }
    this._resizeCanvas();
  }

  close() {
    if (this._isFullscreen) this.setFullscreen(false);
    this._isOpen = false;
    this._syncOpenState();
  }

  toggleOpen() {
    if (this._isOpen) this.close();
    else this.open();
  }

  setFullscreen(flag) {
    this._isFullscreen = !!flag;
    if (this._isFullscreen && !this._isOpen) {
      this._isOpen = true;
      this._syncOpenState();
    }
    if (this._root) {
      this._root.classList.toggle('is-fullscreen', this._isFullscreen);
    }
    document.body.classList.toggle('hk-map-fullscreen-lock', this._isFullscreen);
    const fsBtn = this._root?.querySelector('[data-map-fullscreen]');
    if (fsBtn) {
      fsBtn.textContent = this._isFullscreen ? 'X' : '□';
      fsBtn.title = this._isFullscreen ? '退出全螢幕' : '全螢幕放大地圖';
    }
    requestAnimationFrame(() => this._resizeCanvas());
  }

  toggleFullscreen() {
    this.setFullscreen(!this._isFullscreen);
  }

  _syncOpenState() {
    if (this._root) {
      this._root.hidden = !this._isOpen;
    }
    this._pageRoot?.querySelectorAll('[data-map-brief-panel]').forEach((panel) => {
      panel.classList.toggle('is-expanded', this._isOpen);
      panel.setAttribute('aria-expanded', String(this._isOpen));
      const cta = panel.querySelector('.map-brief-cta');
      if (cta) cta.textContent = this._isOpen ? '地圖已展開' : '點擊開啟完整地圖';
      const expTag = panel.querySelector('.map-brief-expand-tag');
      if (expTag) expTag.textContent = this._isOpen ? '已展開' : '展開地圖';
    });
    this._drawBriefMiniMap();
    this._pageRoot?.querySelectorAll('[data-map-toggle]').forEach((btn) => {
      btn.classList.toggle('is-open', this._isOpen);
      btn.setAttribute('aria-expanded', String(this._isOpen));
      const labelSpan = btn.querySelector('span:last-child');
      if (labelSpan) {
        labelSpan.textContent =
          this.mode === 'picker'
            ? this._isOpen
              ? '收合香港地圖'
              : '開啟香港地圖選點'
            : this._isOpen
              ? '收合路線地圖'
              : '開啟路線地圖';
      }
    });
    if (this._isOpen) {
      this._resizeCanvas();
      this._startLoop();
    } else if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  destroy() {
    if (this._isFullscreen) document.body.classList.remove('hk-map-fullscreen-lock');
    if (this._raf) cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
  }

  setEndpoints({ origin = null, destination = null, focus = null } = {}) {
    if (origin !== undefined) this._origin = origin;
    if (destination !== undefined) this._destination = destination;
    if (focus?.hasCoords) {
      this._center = this._clampHongKongCenter(focus.lat, focus.lng);
      this._zoom = Math.max(this._zoom, 13.2);
    }
  }

  async setItinerary(itinerary, { origin = null, destination = null, openMap = false } = {}) {
    this._itinerary = itinerary;
    this._origin = origin;
    this._destination = destination;
    this._activeStepIndex = -1;
    this._resolvedLegPaths.clear();

    if (!itinerary?.segments?.length) return;

    itinerary.segments.forEach((seg, idx) => {
      this._resolvedLegPaths.set(idx, this._buildFallbackLegPoints(seg));
    });
    this._fitRouteBounds();
    this._updateWalkthroughLabel();

    if (openMap) {
      this.open();
    }

    await Promise.all(
      itinerary.segments.map(async (seg, idx) => {
        if (seg.mode === 'mtr') return;
        const roadPts = await this._fetchOsrmRoadGeometry(seg);
        if (roadPts && roadPts.length >= 2) {
          this._resolvedLegPaths.set(idx, roadPts);
        }
      })
    );
  }

  setActiveStep(stepIndex) {
    this._activeStepIndex = stepIndex;
    this._updateWalkthroughLabel();

    if (!this._itinerary?.segments?.length) return;
    if (stepIndex < 0 || stepIndex >= this._itinerary.segments.length) {
      this._fitRouteBounds();
      return;
    }

    const pts = this._resolvedLegPaths.get(stepIndex) || this._buildFallbackLegPoints(this._itinerary.segments[stepIndex]);
    if (pts.length) {
      this._fitPoints(pts, 14.4);
    }
  }

  _updateWalkthroughLabel() {
    const statusEl = this._root?.querySelector('[data-walk-status]');
    if (!statusEl || !this._itinerary) return;
    const segs = this._itinerary.segments;
    if (this._activeStepIndex < 0 || this._activeStepIndex >= segs.length) {
      statusEl.textContent = `全路線總覽（共 ${segs.length} 段 · 點選分段可逐段高亮）`;
      return;
    }
    const seg = segs[this._activeStepIndex];
    const meta = ModeMeta[seg.mode] || { icon: '·', label: seg.mode };
    const title = seg.route ? `${meta.label} ${seg.route}` : meta.label;
    statusEl.textContent = `第 ${this._activeStepIndex + 1}/${segs.length} 段：${meta.icon} ${title}（${seg.duration} 分鐘）`;
  }

  _buildFallbackLegPoints(seg) {
    if (!seg?.from?.hasCoords || !seg?.to?.hasCoords) return [];
    if (seg.mode === 'mtr') {
      const fromSt = HK_MTR_STATIONS.find((s) => s.name === seg.from.name);
      const toSt = HK_MTR_STATIONS.find((s) => s.name === seg.to.name);
      if (fromSt && toSt && fromSt.lineCode === toSt.lineCode) {
        const lineStations = HK_MTR_STATIONS.filter((s) => s.lineCode === fromSt.lineCode);
        const i1 = lineStations.findIndex((s) => s.code === fromSt.code);
        const i2 = lineStations.findIndex((s) => s.code === toSt.code);
        if (i1 !== -1 && i2 !== -1) {
          const step = i1 <= i2 ? 1 : -1;
          const pts = [];
          for (let i = i1; ; i += step) {
            pts.push([lineStations[i].lng, lineStations[i].lat]);
            if (i === i2) break;
          }
          if (pts.length >= 2) return pts;
        }
      }
    }
    return [
      [seg.from.lng, seg.from.lat],
      [seg.to.lng, seg.to.lat],
    ];
  }

  async _fetchOsrmRoadGeometry(seg) {
    if (!seg?.from?.hasCoords || !seg?.to?.hasCoords) return null;
    const dist = seg.from.distanceTo(seg.to) ?? 0;
    if (dist < 45) return null;

    const base = seg.mode === 'walk' ? CONFIG.osrmWalkApi : 'https://router.project-osrm.org/route/v1/driving';
    const url = `${base}/${seg.from.lng},${seg.from.lat};${seg.to.lng},${seg.to.lat}?overview=full&geometries=geojson`;
    try {
      const json = await fetchJsonWithCorsFallback(url, { timeoutMs: 2400 });
      const coords = json?.routes?.[0]?.geometry?.coordinates;
      return Array.isArray(coords) && coords.length >= 2 ? coords : null;
    } catch {
      return null;
    }
  }

  _handleMapClick(px, py) {
    const hit = this._hitTestLabel(px, py);
    let loc;
    if (hit) {
      loc = new Location({
        name: hit.name,
        lat: hit.lat,
        lng: hit.lng,
        address: hit.address,
        source: hit.kind === 'mtr' ? 'mtr' : 'landmark',
      });
    } else {
      const { lat, lng } = this._screenToLatLng(px, py);
      if (!this._isWithinHongKong(lat, lng)) return;
      const nearest = this._findNearestKnownLabel(lat, lng, 320);
      loc = nearest
        ? new Location({
            name: nearest.name,
            lat: nearest.lat,
            lng: nearest.lng,
            address: nearest.address,
            source: nearest.kind === 'mtr' ? 'mtr' : 'landmark',
          })
        : new Location({
            name: `香港地圖座標 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            lat: Number(lat.toFixed(5)),
            lng: Number(lng.toFixed(5)),
            address: '香港地圖點選位置',
            source: 'map',
          });
    }

    if (this._activeTarget === 'origin') {
      this._origin = loc;
    } else {
      this._destination = loc;
    }

    this.onPickLocation?.(this._activeTarget, loc);
  }

  _findNearestKnownLabel(lat, lng, maxMeters = 320) {
    const probe = new Location({ name: 'probe', lat, lng });
    let best = null;
    let bestDist = maxMeters;
    for (const item of this._interactiveLabels) {
      const d = probe.distanceTo(new Location({ name: item.name, lat: item.lat, lng: item.lng }));
      if (d != null && d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  _isWithinHongKong(lat, lng) {
    return (
      lat >= HK_MAP_BOUNDS.minLat &&
      lat <= HK_MAP_BOUNDS.maxLat &&
      lng >= HK_MAP_BOUNDS.minLng &&
      lng <= HK_MAP_BOUNDS.maxLng
    );
  }

  _clampHongKongCenter(lat, lng) {
    return {
      lat: Math.min(HK_MAP_BOUNDS.maxLat, Math.max(HK_MAP_BOUNDS.minLat, lat)),
      lng: Math.min(HK_MAP_BOUNDS.maxLng, Math.max(HK_MAP_BOUNDS.minLng, lng)),
    };
  }

  _setZoom(z) {
    this._zoom = Math.min(HK_MAP_BOUNDS.maxZoom, Math.max(HK_MAP_BOUNDS.minZoom, z));
  }

  /**
   * Zoom while keeping the given screen point (px, py) fixed in geographic space.
   * Used by mouse-wheel and pinch gestures for natural feel on mobile.
   */
  _zoomAroundPoint(px, py, nextZoom) {
    const before = this._screenToLatLng(px, py);
    this._setZoom(nextZoom);
    const after = this._screenToLatLng(px, py);
    // Shift center so the geographic point under the cursor/pinch midpoint stays put
    const nextLat = this._center.lat + (before.lat - after.lat);
    const nextLng = this._center.lng + (before.lng - after.lng);
    this._center = this._clampHongKongCenter(nextLat, nextLng);
  }

  _getPinchMetrics() {
    const pts = [...this._activePointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    return { midX, midY, dist };
  }

  _initPinchState() {
    const m = this._getPinchMetrics();
    if (!m) {
      this._pinchState = null;
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const px = m.midX - rect.left;
    const py = m.midY - rect.top;
    this._pinchState = {
      dist: m.dist,
      zoom: this._zoom,
      // Geographic point under the initial midpoint – kept fixed during pinch
      anchorLatLng: this._screenToLatLng(px, py),
      midX: m.midX,
      midY: m.midY,
    };
  }

  _handlePinchMove() {
    if (!this._pinchState) return;
    const m = this._getPinchMetrics();
    if (!m) return;

    // Scale zoom by the ratio of current finger distance to start distance
    const ratio = m.dist / this._pinchState.dist;
    // log2(ratio) maps distance ratio to zoom levels (each zoom level ≈ 2× scale)
    const nextZoom = this._pinchState.zoom + Math.log2(Math.max(ratio, 0.01));

    const rect = this._canvas.getBoundingClientRect();
    const px = m.midX - rect.left;
    const py = m.midY - rect.top;

    // Set zoom first, then pan so the original geographic anchor stays under the current midpoint
    this._setZoom(nextZoom);
    const currentUnderMid = this._screenToLatLng(px, py);
    const dLat = this._pinchState.anchorLatLng.lat - currentUnderMid.lat;
    const dLng = this._pinchState.anchorLatLng.lng - currentUnderMid.lng;
    this._center = this._clampHongKongCenter(
      this._center.lat + dLat,
      this._center.lng + dLng
    );
  }

  _fitRouteBounds() {
    const pts = [];
    if (this._origin?.hasCoords) pts.push([this._origin.lng, this._origin.lat]);
    if (this._destination?.hasCoords) pts.push([this._destination.lng, this._destination.lat]);
    for (const segPts of this._resolvedLegPaths.values()) {
      pts.push(...segPts);
    }
    if (pts.length) this._fitPoints(pts, 14.2);
  }

  _fitPoints(pts, maxCapZoom = 14.5) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of pts) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    this._center = this._clampHongKongCenter((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    const span = Math.max(maxLng - minLng, (maxLat - minLat) * 1.15, 0.008);
    const computedZoom = 11.2 - Math.log2(span / 0.36);
    this._zoom = Math.min(maxCapZoom, Math.max(HK_MAP_BOUNDS.minZoom, computedZoom));
  }

  _pixelsPerDegree() {
    const w = this._canvas?.clientWidth || 600;
    const basePxPerLng = (w / 0.56) * Math.pow(2, this._zoom - 11.2);
    const cosLat = Math.cos((this._center.lat * Math.PI) / 180);
    return {
      lng: basePxPerLng,
      lat: basePxPerLng / cosLat,
    };
  }

  _latLngToScreen(lat, lng) {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    const scale = this._pixelsPerDegree();
    return {
      x: w / 2 + (lng - this._center.lng) * scale.lng,
      y: h / 2 - (lat - this._center.lat) * scale.lat,
    };
  }

  _screenToLatLng(x, y) {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    const scale = this._pixelsPerDegree();
    return {
      lng: this._center.lng + (x - w / 2) / scale.lng,
      lat: this._center.lat - (y - h / 2) / scale.lat,
    };
  }

  _resizeCanvas() {
    if (!this._canvas) return;
    const parent = this._canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth || 600;
    const h = parent.clientHeight || this.height;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _startLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    const tick = () => {
      if (!this._isOpen) return;
      this._pulsePhase = (this._pulsePhase + 0.035) % (Math.PI * 2);
      this._draw();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _draw() {
    if (!this._ctx || !this._canvas) return;
    const ctx = this._ctx;
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;

    ctx.fillStyle = '#151618';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#232426';
    ctx.lineWidth = 1;
    for (let lat = 22.15; lat <= 22.56; lat += 0.05) {
      const p1 = this._latLngToScreen(lat, HK_MAP_BOUNDS.minLng);
      const p2 = this._latLngToScreen(lat, HK_MAP_BOUNDS.maxLng);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let lng = 113.85; lng <= 114.44; lng += 0.05) {
      const p1 = this._latLngToScreen(HK_MAP_BOUNDS.minLat, lng);
      const p2 = this._latLngToScreen(HK_MAP_BOUNDS.maxLat, lng);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (const poly of HK_LANDMASS_POLYGONS) {
      ctx.beginPath();
      poly.points.forEach(([lng, lat], i) => {
        const pt = this._latLngToScreen(lat, lng);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fillStyle = '#1e1f21';
      ctx.fill();
      ctx.strokeStyle = '#343538';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    for (const road of HK_MAJOR_ROADS) {
      ctx.beginPath();
      road.points.forEach(([lng, lat], i) => {
        const pt = this._latLngToScreen(lat, lng);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.save();
      if (road.tier === 'tunnel') {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
        ctx.lineWidth = 1.5;
      } else if (road.tier === 'highway') {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
        ctx.lineWidth = this._zoom >= 12.5 ? 3 : 2;
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
        ctx.lineWidth = this._zoom >= 12.5 ? 2 : 1.3;
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const edge of HK_MTR_LINE_EDGES) {
      const s1 = this._stationByCode.get(edge.from);
      const s2 = this._stationByCode.get(edge.to);
      if (!s1 || !s2) continue;
      const p1 = this._latLngToScreen(s1.lat, s1.lng);
      const p2 = this._latLngToScreen(s2.lat, s2.lng);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = HK_MTR_LINE_COLORS[edge.lineCode] || '#64748b';
      ctx.globalAlpha = this.mode === 'route' ? 0.22 : 0.48;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.mode === 'route' && this._itinerary?.segments?.length) {
      this._drawHighlightedRoute(ctx);
    }

    this._drawInteractiveLabels(ctx, w, h);

    if (this._origin?.hasCoords) {
      this._drawPin(ctx, this._origin.lat, this._origin.lng, '#d8a24a', 'START');
    }
    if (this._destination?.hasCoords) {
      this._drawPin(ctx, this._destination.lat, this._destination.lng, '#c2564a', 'END');
    }
  }

  _drawHighlightedRoute(ctx) {
    const segs = this._itinerary.segments;
    const hasStepFocus = this._activeStepIndex >= 0 && this._activeStepIndex < segs.length;

    segs.forEach((seg, idx) => {
      const pts = this._resolvedLegPaths.get(idx) || this._buildFallbackLegPoints(seg);
      if (pts.length < 2) return;
      const isFocused = !hasStepFocus || this._activeStepIndex === idx;
      const color = MODE_STROKE[seg.mode] || '#8b8d90';

      ctx.save();
      ctx.beginPath();
      pts.forEach(([lng, lat], i) => {
        const p = this._latLngToScreen(lat, lng);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });

      ctx.strokeStyle = isFocused ? 'rgba(230, 231, 232, 0.85)' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = isFocused ? 7.5 : 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      if (seg.mode === 'walk') {
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -this._pulsePhase * 6;
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = isFocused ? 1 : 0.32;
      ctx.lineWidth = isFocused ? 4.5 : 2.5;
      ctx.stroke();
      ctx.restore();

      const startPt = this._latLngToScreen(pts[0][1], pts[0][0]);
      ctx.beginPath();
      ctx.arc(startPt.x, startPt.y, isFocused ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#131415';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
  }

  _drawInteractiveLabels(ctx, w, h) {
    this._labelHitBoxes = [];
    const occupied = [];
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Noto Sans HK", sans-serif';

    for (const item of this._interactiveLabels) {
      if (this._zoom < item.minZoom) continue;
      const pt = this._latLngToScreen(item.lat, item.lng);
      if (pt.x < -30 || pt.x > w + 30 || pt.y < -20 || pt.y > h + 20) continue;

      const isHovered = this._hoveredLabel?.name === item.name;
      const textW = ctx.measureText(item.name).width;
      const box = {
        x: pt.x + 7,
        y: pt.y - 9,
        w: textW + 10,
        h: 18,
        item,
      };

      if (!isHovered && occupied.some((o) => !(box.x + box.w < o.x || box.x > o.x + o.w || box.y + box.h < o.y || box.y > o.y + o.h))) {
        continue;
      }
      occupied.push(box);
      this._labelHitBoxes.push(box);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHovered ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = item.kind === 'mtr' ? (HK_MTR_LINE_COLORS[item.lineCode] || '#8b8d90') : '#5f6164';
      ctx.fill();

      ctx.fillStyle = isHovered ? 'rgba(216, 162, 74, 0.92)' : 'rgba(32, 33, 35, 0.9)';
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.fill();

      ctx.strokeStyle = isHovered ? '#d8a24a' : '#404144';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isHovered ? '#061324' : '#e6e7e8';
      ctx.fillText(item.name, box.x + 5, box.y + 13);
    }
  }

  _drawPin(ctx, lat, lng, color, badgeText) {
    const pt = this._latLngToScreen(lat, lng);
    const pulseR = 10 + Math.sin(this._pulsePhase) * 3;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = color === '#d8a24a' ? 'rgba(216, 162, 74, 0.16)' : 'rgba(194, 86, 74, 0.16)';
    ctx.fill();

    // Square marker head
    const s = 7;
    ctx.fillStyle = color;
    ctx.fillRect(pt.x - s, pt.y - s, s * 2, s * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#131415';
    ctx.strokeRect(pt.x - s, pt.y - s, s * 2, s * 2);

    ctx.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
    const tw = ctx.measureText(badgeText).width + 12;
    ctx.fillStyle = '#202123';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(pt.x - tw / 2, pt.y - 26, tw, 15);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(badgeText, pt.x - tw / 2 + 6, pt.y - 15);
  }

  _hitTestLabel(px, py) {
    for (let i = this._labelHitBoxes.length - 1; i >= 0; i--) {
      const b = this._labelHitBoxes[i];
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) {
        return b.item;
      }
    }
    return null;
  }
}
//(註：內容由 AI 生成)
