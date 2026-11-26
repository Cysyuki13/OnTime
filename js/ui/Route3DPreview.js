/**
 * Route3DPreview
 * 全螢幕 3D 沿路動畫：地政總署「可視化三維地圖」(Cesium 3D Tiles) + 執行中的路線折線。
 *
 * 設計取向
 *  - 只在使用者按下「3D 沿路預覽」時才載入 Cesium（約 2–10 MB，不影響日常使用）
 *  - 路線以「離地光帶」方式呈現，避免攝影測量網格（樹冠／樓頂）造成的貼地穿模
 *  - 相機以阻尼跟隨，不逐格 flyTo，避免手機上的抖動
 *  - 任何一步失敗都會回到 2D 地圖，不阻塞主要流程
 */
import { CONFIG } from '../config.js';
import { buildRouteGeometry } from '../services/RouteGeometryService.js';

const MODE_LABEL = {
  mtr: '港鐵',
  bus: '巴士',
  minibus: '小巴',
  lrt: '輕鐵',
  walk: '步行',
  taxi: '的士',
};

// 模型以模組位置解析，避免頁面路徑不同時 404
const BUNDLED_AVATAR_URL = new URL('../../assets/models/avatar-stick.glb', import.meta.url).href;

const CAM_MODES = ['overview', 'aerial', 'third', 'first'];
const CAM_LABEL = { overview: '總覽', aerial: '航拍', third: '三人稱', first: '一人稱' };

const CSV = {
  walk: '#c8c9cb',
  mtr: '#d8a24a',
  bus: '#d0834f',
  minibus: '#86a06f',
  lrt: '#c45c26',
  taxi: '#8b8d90',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Route3DPreview {
  constructor() {
    this._open = false;
    this._el = null;
    this._viewer = null;
    this._cesium = null;
    this._cesiumPromise = null;
    this._tileset = null;
    this._geometry = null;
    this._legEntities = [];
    this._checkpoints = [];
    this._samples = [];
    this._heights = [];
    this._progress = 0;
    this._playing = false;
    this._durationSec = 12;
    // 速度：滑桿 0–100 映射到 speedMin–speedMax（指數刻度，慢速段更細）
    this._speedMin = CONFIG.hk3d?.speedMin ?? 0.02;
    this._speedMax = CONFIG.hk3d?.speedMax ?? 1;
    this._speed = clamp(CONFIG.hk3d?.speedDefault ?? 0.35, this._speedMin, this._speedMax);
    this._camMode = 'overview'; // overview | aerial | third | first
    this._avatarModel = null;
    this._avatarEntity = null;
    this._avatarPos = null;
    this._avatarHeading = 0;
    this._avatarLoading = false;
    // 手動環繞：以角色為旋轉中心（yaw/pitch 為相對行進方向的偏移）
    this._orbitYaw = 0;
    this._orbitPitch = 0;
    this._orbitDist = null;
    this._freeCam = false;
    this._raf = 0;
    this._lastTs = 0;
    this._progressTimer = 0;
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.close();
    };
  }

  static supportsWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mount / teardown                                                    */
  /* ------------------------------------------------------------------ */

  async open(itinerary, meta = {}) {
    if (this._open) return;
    if (!Route3DPreview.supportsWebGL()) {
      this._open = true;
      this._mountShell(meta);
      this._fail(new Error('此裝置或瀏覽器未支援 WebGL，無法顯示 3D 地圖。'));
      return;
    }

    this._open = true;
    this._itinerary = itinerary;
    this._meta = meta;
    this._totalMinutes = 0;
    this._mountShell(meta);
    this._playState(false);

    // 幾何與 3D 引擎並行處理，先取路線資料
    this._geomPromise = buildRouteGeometry(itinerary, {
      originName: meta.originName,
      destName: meta.destName,
    });

    try {
      this._status('載入 3D 引擎…', 6);
      this._cesium = await this._ensureCesium();

      this._status('初始化場景…', 16);
      this._initViewer();

      this._status('串流三維地圖…', 20);
      const geom = await this._geomPromise.catch((e) => {
        throw new Error(`路線幾何建立失敗：${e.message}`);
      });
      this._geometry = geom;
      this._applyMeta(geom);

      await this._loadTileset();
      await this._frameRoute();
      await this._buildRoute(geom);

      this._status('準備完成', 100);
      this._hideLoading();
      this._start();
    } catch (err) {
      console.error('[3D preview]', err);
      this._fail(err);
    }
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._playState(false);
    cancelAnimationFrame(this._raf);
    clearInterval(this._progressTimer);
    document.removeEventListener('keydown', this._onKeyDown);
    document.body.classList.remove('r3d-open');

    if (this._viewer) {
      try {
        this._viewer.destroy();
      } catch (e) {
        console.warn('[3D preview] destroy failed', e);
      }
    }
    this._viewer = null;
    this._tileset = null;
    this._avatarModel = null;
    this._avatarEntity = null;
    this._avatarPos = null;
    this._legEntities = [];
    this._checkpoints = [];
    this._samples = [];
    this._geometry = null;
    this._el?.remove();
    this._el = null;
  }

  _mountShell(meta) {
    const title = meta.title ? String(meta.title) : '3D 沿路預覽';
    const el = document.createElement('div');
    el.className = 'r3d-overlay';
    el.innerHTML = `
      <div class="r3d-stage" data-stage></div>
      <div class="r3d-credit-holder" data-credits></div>

      <header class="r3d-top">
        <div class="r3d-brand">
          <span class="r3d-kicker">TEIJI 3D</span>
          <span class="r3d-title">${title}</span>
          <span class="r3d-sub" data-sub></span>
        </div>
        <button type="button" class="r3d-close" data-close aria-label="關閉 3D 預覽">×</button>
      </header>

      <div class="r3d-loading" data-loading>
        <div class="r3d-loading-inner">
          <div class="r3d-kicker">可視化三維地圖 · Cesium 3D Tiles</div>
          <div class="r3d-loading-text" data-load-text>載入 3D 引擎…</div>
          <div class="r3d-bar"><span data-load-bar></span></div>
          <div class="r3d-loading-note">首次載入需下載約 2–8 MB 圖磚，之後會由瀏覽器快取</div>
        </div>
      </div>

      <div class="r3d-error" data-error hidden>
        <div class="r3d-error-inner">
          <div class="r3d-kicker">3D 預覽無法啟動</div>
          <p data-error-text></p>
          <div class="r3d-error-actions">
            <button type="button" class="r3d-btn" data-retry>重試</button>
            <button type="button" class="r3d-btn is-primary" data-close>回到 2D 地圖</button>
          </div>
        </div>
      </div>

      <footer class="r3d-hud" data-hud hidden>
        <div class="r3d-now">
          <span class="r3d-clock" data-clock>--:--</span>
          <span class="r3d-leg" data-leg></span>
        </div>

        <div class="r3d-legend" data-legend></div>

        <div class="r3d-scrub">
          <span class="r3d-scrub-time" data-start>--:--</span>
          <input type="range" min="0" max="1000" step="1" value="0" data-scrub aria-label="沿路進度" />
          <span class="r3d-scrub-time" data-end>--:--</span>
        </div>

        <div class="r3d-controls">
          <button type="button" class="r3d-btn" data-play aria-label="播放或暫停">❚❚</button>
          <div class="r3d-speed" data-speed-wrap>
            <input type="range" min="0" max="100" step="1" value="0" data-speed-bar aria-label="播放速度" />
            <span class="r3d-speed-val" data-speed>0.35×</span>
          </div>
          <button type="button" class="r3d-btn" data-cam aria-label="切換鏡頭">總覽</button>
          <button type="button" class="r3d-btn" data-replay aria-label="重播">↻</button>
          <span class="r3d-dist" data-dist></span>
        </div>

        <div class="r3d-fineprint">
          © 地政總署 Lands Department · 路線為視覺近似，非實際路徑
          <span data-keynote></span>
        </div>
      </footer>
    `;

    document.body.appendChild(el);
    document.body.classList.add('r3d-open');
    document.addEventListener('keydown', this._onKeyDown);

    this._el = el;
    this._stage = el.querySelector('[data-stage]');
    this._creditsEl = el.querySelector('[data-credits]');
    this._hud = el.querySelector('[data-hud]');
    this._loading = el.querySelector('[data-loading]');
    this._loadText = el.querySelector('[data-load-text]');
    this._loadBar = el.querySelector('[data-load-bar]');
    this._error = el.querySelector('[data-error]');
    this._errorText = el.querySelector('[data-error-text]');

    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    el.querySelector('[data-retry]')?.addEventListener('click', () => {
      const it = this._itinerary;
      const meta = this._meta;
      this.close();
      // 重新開啟（保留原本參數）
      setTimeout(() => this.open(it, meta), 0);
    });

    this._bindControls();

    if (CONFIG.hk3d?.apiKey) {
      el.querySelector('[data-keynote]').textContent = '';
    } else {
      el.querySelector('[data-keynote]').textContent = ' · 示範 API key，正式上線請向地政總署申請';
    }
  }

  _applyMeta(geom) {
    const sub = this._el?.querySelector('[data-sub]');
    if (sub) sub.textContent = `${geom.originName || '起點'} → ${geom.destName || '終點'}`;
  }

  _bindControls() {
    const el = this._el;
    const scrub = el.querySelector('[data-scrub]');
    const playBtn = el.querySelector('[data-play]');
    const camBtn = el.querySelector('[data-cam]');
    const replayBtn = el.querySelector('[data-replay]');

    playBtn.addEventListener('click', () => {
      if (!this._geometry) return;
      if (this._progress >= 1) this._progress = 0;
      this._playState(!this._playing);
    });

    const speedBar = el.querySelector('[data-speed-bar]');
    const speedVal = el.querySelector('[data-speed]');
    const applySpeed = (pct) => {
      const t = clamp(Number(pct) / 100, 0, 1);
      this._speed = this._speedMin * Math.pow(this._speedMax / this._speedMin, t);
      if (speedVal) speedVal.textContent = `${this._fmtSpeed(this._speed)}×`;
      speedBar?.style.setProperty('--r3d-fill', `${t * 100}%`);
    };
    speedBar?.addEventListener('input', (e) => applySpeed(e.target.value));
    this._syncSpeed = () => {
      const t = clamp(
        Math.log(this._speed / this._speedMin) / Math.log(this._speedMax / this._speedMin),
        0,
        1
      );
      if (speedBar) {
        speedBar.value = String(Math.round(t * 100));
        speedBar.style.setProperty('--r3d-fill', `${t * 100}%`);
      }
      if (speedVal) speedVal.textContent = `${this._fmtSpeed(this._speed)}×`;
    };
    this._syncSpeed();

    camBtn.addEventListener('click', () => {
      if (this._freeCam) {
        this._applyMode(this._camMode);
        return;
      }
      const idx = CAM_MODES.indexOf(this._camMode);
      this._applyMode(CAM_MODES[(idx + 1) % CAM_MODES.length]);
    });

    replayBtn.addEventListener('click', () => {
      this._progress = 0;
      this._freeCam = false;
      this._playState(true);
      this._jumpCamera();
    });

    scrub.addEventListener('input', () => {
      this._progress = Number(scrub.value) / 1000;
      this._playState(false);
      this._freeCam = false;
      this._camSmooth = null;
      this._tick(0, true);
    });
  }

  _fmtSpeed(v) {
    if (v >= 1) return String(Number(v.toFixed(1)));
    if (v >= 0.1) return v.toFixed(2).replace(/0$/, '');
    return v.toFixed(3).replace(/0$/, '');
  }

  _playState(playing) {
    this._playing = !!playing;
    if (!this._el) return;
    this._el.querySelector('[data-play]').textContent = playing ? '❚❚' : '▶';
    if (playing) {
      this._lastTs = 0;
      cancelAnimationFrame(this._raf);
      this._loop();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cesium bootstrap                                                    */
  /* ------------------------------------------------------------------ */

  async _ensureCesium() {
    if (window.Cesium) return window.Cesium;
    if (this._cesiumPromise) return this._cesiumPromise;

    const base = CONFIG.hk3d.cesiumBaseUrl;
    window.CESIUM_BASE_URL = base;

    if (!document.querySelector('link[data-cesium-widgets]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${base}Widgets/widgets.css`;
      link.dataset.cesiumWidgets = '1';
      document.head.appendChild(link);
    }

    // 手機網絡下 5 MB 的 Cesium.js 偶爾會超時：容許一次重試（第二次通常命中快取）
    const loadOnce = () =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${base}Cesium.js`;
        script.async = true;
        script.onload = () =>
          window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium 載入後未初始化'));
        script.onerror = () => reject(new Error('無法下載 Cesium（請檢查網絡或 CDN）'));
        document.head.appendChild(script);
        setTimeout(() => {
          if (!window.Cesium) reject(new Error('Cesium 載入逾時'));
        }, 45000);
      });

    this._cesiumPromise = loadOnce().catch(
      () => loadOnce() // 重試一次
    );

    this._cesiumPromise.catch(() => {
      this._cesiumPromise = null;
    });
    return this._cesiumPromise;
  }

  _initViewer() {
    const Cesium = this._cesium;
    const isMobile = matchMedia('(pointer: coarse)').matches;

    this._viewer = new Cesium.Viewer(this._stage, {
      baseLayer: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      creditContainer: this._creditsEl,
      requestRenderMode: false,
      contextOptions: {
        webgl: { alpha: false, antialias: true, powerPreference: 'high-performance' },
      },
    });

    const scene = this._viewer.scene;
    scene.globe.show = false;
    scene.skyAtmosphere.show = false;
    scene.skyBox.show = false;
    scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0c10');
    scene.fog.enabled = false;
    scene.postProcessStages.fxaa.enabled = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 6;
    scene.screenSpaceCameraController.maximumZoomDistance = 4000;

    // 固定主光，避免以真實時鐘（例如夜間）令場景全黑
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(-0.42, -0.5, -0.76),
      intensity: isMobile ? 2.1 : 2.3,
    });

    Cesium.RequestScheduler.maximumRequestsPerServer = isMobile ? 6 : 10;

    // 環繞控制器：拖曳／滾輪以「角色」為中心旋轉，而非地圖中心
    this._lockController();
    this._bindOrbit(scene);

    const rect = this._initialRect();
    this._viewer.camera.setView({
      destination: rect,
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-52), roll: 0 },
    });

    this._isMobile = isMobile;
    // 相機剖面：攝影測量網格在過低視角會穿入樓宇／樹冠，維持「航拍跟隨」高度
    this._cam = isMobile
      ? { back: 240, ahead: 400, alt: 300, pitch: -54 }
      : { back: 300, ahead: 460, alt: 360, pitch: -54 };
  }

  _lockController() {
    const ssc = this._viewer?.scene?.screenSpaceCameraController;
    if (!ssc) return;
    ssc.enableRotate = false;
    ssc.enableTilt = false;
    ssc.enableTranslate = false;
    ssc.enableZoom = false;
    ssc.enableLook = false;
    ssc.inertiaSpin = 0;
    ssc.inertiaTranslate = 0;
    ssc.inertiaZoom = 0;
  }

  _orbitDistRange(mode) {
    if (mode === 'overview') return [300, 16000];
    if (mode === 'aerial') return [120, 1400];
    if (mode === 'third') return [2.2, 18];
    return [0.3, 4];
  }

  _bindOrbit(scene) {
    const canvas = scene.canvas;
    const host = canvas.parentElement || canvas;
    const pointers = new Map();
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;

    // 攔截手勢，不讓 Cesium 原生控制器同時處理（否則會繞地圖中心轉）
    canvas.style.touchAction = 'none';
    if (host.style) host.style.touchAction = 'none';

    const clampDist = (mode, d) => {
      const [lo, hi] = this._orbitDistRange(mode);
      return Math.min(hi, Math.max(lo, d));
    };
    const baseDist = () => {
      const goal = this._cameraGoal(this._pointAt(this._dist ?? 0));
      return this._orbitDist ?? goal.dist;
    };
    const refresh = () => {
      // 暫停時沒有 rAF 迴圈，需即時套用新的環繞角度
      if (this._viewer && this._samples?.length) {
        this._tick(performance.now(), true);
      }
    };
    const markManual = () => {
      if (this._freeCam) return true;
      this._freeCam = true;
      const btn = this._el?.querySelector('[data-cam]');
      if (btn) btn.textContent = '回到鏡頭';
      return true;
    };
    const active = () => !!this._geometry;

    const onDown = (e) => {
      if (!active()) return;
      e.stopPropagation();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件／部分瀏覽器沒有對應的真實指標，忽略即可 */
      }
    };

    const onMove = (e) => {
      if (!active()) return;
      e.stopPropagation();
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && d > 0) {
          const ratio = pinchDist / d;
          this._orbitDist = clampDist(this._camMode, baseDist() * ratio);
          pinchDist = d;
          markManual();
          refresh();
        }
        return;
      }

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dx && !dy) return;

      this._orbitYaw -= dx * 0.0062;
      this._orbitPitch = Math.min(0.35, Math.max(-0.7, this._orbitPitch + dy * 0.0052));
      markManual();
      refresh();
    };

    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        lastX = p.x;
        lastY = p.y;
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e) => {
      if (!active()) return;
      e.stopPropagation();
      e.preventDefault();
      const step = Math.exp(Math.sign(e.deltaY) * 0.16);
      this._orbitDist = clampDist(this._camMode, baseDist() * step);
      markManual();
      refresh();
    };

    const opts = { capture: true, passive: false };
    host.addEventListener('pointerdown', onDown, opts);
    host.addEventListener('pointermove', onMove, opts);
    host.addEventListener('pointerup', onUp, opts);
    host.addEventListener('pointercancel', onUp, opts);
    host.addEventListener('wheel', onWheel, opts);
  }

  _initialRect() {
    const Cesium = this._cesium;
    const o = this._meta?.origin;
    const d = this._meta?.destination;
    const lat = [o?.lat, d?.lat].filter((v) => Number.isFinite(Number(v))).map(Number);
    const lng = [o?.lng, d?.lng].filter((v) => Number.isFinite(Number(v))).map(Number);

    if (!lat.length || !lng.length) {
      return Cesium.Rectangle.fromDegrees(113.86, 22.2, 114.42, 22.5);
    }
    const pad = 0.012;
    return Cesium.Rectangle.fromDegrees(
      Math.min(...lng) - pad,
      Math.min(...lat) - pad,
      Math.max(...lng) + pad,
      Math.max(...lat) + pad
    );
  }

  async _loadTileset() {
    const Cesium = this._cesium;
    const key = CONFIG.hk3d.apiKey || CONFIG.hk3d.demoTilesetKey;
    const url = `${CONFIG.hk3d.tilesetUrl}?key=${encodeURIComponent(key)}`;

    this._tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: this._isMobile ? 30 : 18,
      cacheBytes: 268435456,
      maximumCacheOverflowBytes: 67108864,
      skipLevelOfDetail: true,
      dynamicScreenSpaceError: true,
      foveatedScreenSpaceError: true,
      preloadWhenHidden: false,
      showOutline: false,
    });

    this._tileset.tileFailed.addEventListener((e) => {
      console.warn('[3D preview] tile failed', e?.url, e?.message);
    });

    this._viewer.scene.primitives.add(this._tileset);

    this._progressTimer = setInterval(() => {
      const raw = Number(this._tileset?.loadProgress);
      if (Number.isFinite(raw) && raw > 0) {
        this._status(`串流三維地圖 ${Math.round(raw)}%`, 20 + raw * 0.45);
      } else {
        this._status('串流三維地圖…', 42);
      }
    }, 280);

    await Promise.race([
      new Promise((resolve) => {
        const handler = () => {
          this._tileset?.initialTilesLoaded.removeEventListener(handler);
          resolve();
        };
        this._tileset.initialTilesLoaded.addEventListener(handler);
      }),
      delay(12000),
    ]);
    clearInterval(this._progressTimer);
    this._progressTimer = 0;

    // 全港圖磚不會一次載完，等目前視野穩定即可
    await Promise.race([delay(1500), new Promise((r) => this._tileset.allTilesLoaded.addEventListener(() => r()))]);
  }

  async _frameRoute() {
    const Cesium = this._cesium;
    const geom = this._geometry;
    const b = geom.bbox;
    const padLat = Math.max(0.004, (b.maxLat - b.minLat) * 0.18);
    const padLng = Math.max(0.004, (b.maxLng - b.minLng) * 0.18);
    const rect = Cesium.Rectangle.fromDegrees(
      b.minLng - padLng,
      b.minLat - padLat,
      b.maxLng + padLng,
      b.maxLat + padLat
    );

    this._status('對焦路線走廊…', 74);
    // 不以單一 flyTo 完成事件作唯一條件：低幀率裝置上可能延遲很久
    await Promise.race([
      new Promise((resolve) => {
        this._viewer.camera.flyTo({
          destination: rect,
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-58), roll: 0 },
          duration: 1.2,
          complete: resolve,
          cancel: resolve,
        });
      }),
      delay(2600),
    ]);

    await Promise.race([delay(900), new Promise((r) => this._tileset.allTilesLoaded.addEventListener(() => r()))]);
  }

  /* ------------------------------------------------------------------ */
  /* Ground sampling                                                     */
  /* ------------------------------------------------------------------ */

  _sampleHeight(lng, lat) {
    const Cesium = this._cesium;
    try {
      const h = this._viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(lng, lat));
      return Number.isFinite(h) ? h : null;
    } catch {
      return null;
    }
  }

  _probeGround(lng, lat) {
    // 7 m 十字探測：道路兩側若有樓宇／樹冠，取最低者代表實際路（地）面
    const d = 0.000065; // ≈7 m
    const cand = [
      this._sampleHeight(lng, lat),
      this._sampleHeight(lng + d, lat),
      this._sampleHeight(lng - d, lat),
      this._sampleHeight(lng, lat + d),
      this._sampleHeight(lng, lat - d),
    ].filter((h) => h != null);
    if (!cand.length) return null;
    cand.sort((a, b) => a - b);
    return cand[0];
  }

  async _warmUpCamera(geom) {
    const Cesium = this._cesium;
    if (!this._viewer || !geom?.legs?.length) return;
    const leg = geom.legs[0];
    const coords = leg.coordinates;
    const start = coords[0];
    const ahead = coords[Math.min(coords.length - 1, 30)];
    const heading = this._bearing(start, ahead);
    const alt = (this._cam?.alt ?? 135) + this._offset;

    this._viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(start.lng, start.lat, alt),
      orientation: { heading, pitch: Cesium.Math.toRadians(this._cam?.pitch ?? -42), roll: 0 },
    });

    // 等這個高度／視角的圖磚到位，之後取的貼地高度才與播放時一致
    await Promise.race([
      delay(1200),
      new Promise((r) => this._tileset?.allTilesLoaded.addEventListener(() => r())),
    ]);
  }

  async _sampleGround(geom) {
    if (!this._viewer.scene.pickPositionSupported) return null;

    await delay(120);

    const maxSamples = 200;
    const all = [];
    for (const leg of geom.legs) {
      for (let i = 0; i < leg.coordinates.length; i += 1) {
        all.push({ leg, i, ...leg.coordinates[i] });
      }
    }
    const stride = Math.max(1, Math.floor(all.length / maxSamples));

    const picked = [];
    for (let k = 0; k < all.length; k += stride) {
      const p = all[k];
      // 五點探測取最低值：避免路線被旁邊樓頂／樹冠的高度抬上半空
      picked.push({ ...p, h: this._probeGround(p.lng, p.lat) });
    }

    const valid = picked.filter((p) => p.h != null).length;
    if (valid / picked.length < 0.55) return null;

    // 窗口最小值 + 距離加權：把樓頂／樹冠尖峰壓回路邊高度，路線才會貼地
    for (let k = 0; k < picked.length; k += 1) {
      const win = picked.slice(Math.max(0, k - 3), k + 4).map((p) => p.h).filter((h) => h != null);
      if (!win.length) continue;
      const lo = Math.min(...win);
      const cur = picked[k].h;
      picked[k].h = cur == null ? lo : cur > lo ? Math.min(cur, lo + 1.2) : cur;
    }

    // 補齊缺值並平滑
    const filled = [];
    let lastValid = null;
    for (const p of picked) {
      if (p.h == null && lastValid != null) p.h = lastValid;
      if (p.h != null) lastValid = p.h;
      filled.push(p.h);
    }
    if (filled[0] == null) {
      const first = filled.find((h) => h != null);
      filled[0] = first ?? 0;
    }
    for (let k = 1; k < filled.length; k += 1) {
      if (filled[k] == null) filled[k] = filled[k - 1];
    }

    const smoothed = filled.map((h, k) => {
      const win = filled.slice(Math.max(0, k - 2), k + 3);
      return win.reduce((a, b) => a + b, 0) / win.length;
    });

    // 回填到每一段的每個點：用對應取樣點的高度線性內插
    for (const leg of geom.legs) leg.heights = new Array(leg.coordinates.length).fill(null);

    const groups = new Map();
    for (const p of picked) {
      if (!groups.has(p.leg)) groups.set(p.leg, []);
      groups.get(p.leg).push(p);
    }

    for (const [leg, list] of groups) {
      const sorted = list.slice().sort((a, b) => a.i - b.i);
      let si = 0;
      for (let i = 0; i < leg.coordinates.length; i += 1) {
        while (si < sorted.length - 1 && sorted[si + 1].i <= i) si += 1;
        const cur = sorted[si];
        const nxt = sorted[si + 1];
        if (!nxt) {
          leg.heights[i] = smoothed[si];
          continue;
        }
        const t = cur.i === nxt.i ? 0 : (i - cur.i) / (nxt.i - cur.i);
        const hCur = smoothed[picked.indexOf(cur)];
        const hNxt = smoothed[picked.indexOf(nxt)];
        leg.heights[i] = hCur + (hNxt - hCur) * clamp(t, 0, 1);
      }
    }

    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Build scene objects                                                 */
  /* ------------------------------------------------------------------ */

  async _buildRoute(geom) {
    const Cesium = this._cesium;
    this._viewer.entities.removeAll();

    this._status('貼合地面高度…', 84);
    await this._warmUpCamera(geom);
    const groundOk = await this._sampleGround(geom);
    this._floating = !groundOk;
    this._baseOffset = this._floating ? 26 : 2.2;
    this._offset = this._baseOffset;

    // 建立取樣表（供動畫逐格查詢）
    this._samples = [];
    let acc = 0;
    for (const leg of geom.legs) {
      const heights = leg.heights ?? [];
      let legAcc = 0;
      for (let i = 0; i < leg.coordinates.length; i += 1) {
        if (i > 0) {
          const prev = leg.coordinates[i - 1];
          const cur = leg.coordinates[i];
          legAcc += Cesium.Cartesian3.distance(
            Cesium.Cartesian3.fromDegrees(prev.lng, prev.lat),
            Cesium.Cartesian3.fromDegrees(cur.lng, cur.lat)
          );
        }
        this._samples.push({
          lat: leg.coordinates[i].lat,
          lng: leg.coordinates[i].lng,
          h: heights[i] ?? 0,
          d: acc + legAcc,
          leg,
          i,
        });
      }
      acc += legAcc;
    }
    this._totalDistance = Math.max(1, acc);

    this._dist = 0;
    this._pointAt = this._makePointAt();

    // 光帶
    for (const leg of geom.legs) {
      const heights = leg.heights ?? [];
      const positions = leg.coordinates.map((c, i) =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat, (heights[i] ?? 0) + this._offset)
      );
      const casingPositions = leg.coordinates.map((c, i) =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat, (heights[i] ?? 0) + this._offset - 1.6)
      );
      const color = Cesium.Color.fromCssColorString(leg.color ?? CSV[leg.mode] ?? '#d8a24a');

      // 單一條「金邊」折線：避免兩條共面折線互相 z-fighting
      const entity = this._viewer.entities.add({
        polyline: {
          positions,
          width: 7,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: color,
            outlineColor: Cesium.Color.fromCssColorString('#0a0c10').withAlpha(0.9),
            outlineWidth: 2,
          }),
        },
      });
      entity.__leg = leg;
      entity.__heights = heights;

      this._legEntities.push(entity);
    }

    // 站點／轉乘點標記
    for (const wp of geom.waypoints) {
      if (!wp?.name) continue;
      const h = this._heightNear(wp.lat, wp.lng);
      this._viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, h + this._offset),
        point: {
          pixelSize: wp.kind === 'start' || wp.kind === 'end' ? 9 : 6,
          color: Cesium.Color.fromCssColorString('#e6e7e8'),
          outlineColor: Cesium.Color.fromCssColorString('#0a0c10'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: wp.name,
          font: '11px ui-monospace, Menlo, monospace',
          fillColor: Cesium.Color.fromCssColorString('#dfe2e6'),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#0a0c10').withAlpha(0.72),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(60, 1, 3000, 0.7),
        },
      });
    }

    // 走廊刻度：總覽時即使光帶被粗層網格遮住，仍能讀出方向
    this._checkpoints = [];
    const tickCount = 8;
    for (let k = 1; k <= tickCount; k += 1) {
      const d = (this._totalDistance * k) / (tickCount + 1);
      const p = this._pointAt(d);
      this._checkpoints.push(
        this._viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.h + this._offset + 1),
          point: {
            pixelSize: 5,
            color: Cesium.Color.fromCssColorString('#d8a24a').withAlpha(0.85),
            outlineColor: Cesium.Color.fromCssColorString('#0a0c10'),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          show: false,
        })
      );
    }

    // 旅人
    this._travelerPos = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(geom.legs[0].coordinates[0].lng, geom.legs[0].coordinates[0].lat, this._offset)
    );
    this._traveler = this._viewer.entities.add({
      position: this._travelerPos,
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#f3d9a4'),
        outlineColor: Cesium.Color.fromCssColorString('#0a0c10'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // 尾跡
    const trail = new Cesium.CallbackProperty(() => {
      const d0 = Math.max(0, this._dist - 160);
      const pts = [];
      for (let k = 0; k <= 6; k += 1) {
        const p = this._pointAt(d0 + ((this._dist - d0) * k) / 6);
        pts.push(Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.h + this._offset + 0.4));
      }
      return pts;
    }, false);

    this._viewer.entities.add({
      polyline: {
        positions: trail,
        width: 7,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.24,
          color: Cesium.Color.fromCssColorString('#f3d9a4').withAlpha(0.9),
        }),
      },
    });

    this._updateHudChrome(geom);
    this._hud.hidden = false;

    this._jumpCamera();
    this._ensureAvatar();
  }

  _heightNear(lat, lng) {
    let best = null;
    let bestD = Infinity;
    for (const s of this._samples) {
      const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best?.h ?? 0;
  }

  _makePointAt() {
    const samples = this._samples;
    return (d) => {
      if (!samples.length) return { lat: 22.3, lng: 114.2, h: 0, leg: null };
      if (d <= 0) return samples[0];
      if (d >= this._totalDistance) return samples[samples.length - 1];

      let lo = 0;
      let hi = samples.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].d <= d) lo = mid;
        else hi = mid;
      }
      const a = samples[lo];
      const b = samples[hi];
      const t = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        h: a.h + (b.h - a.h) * t,
        leg: a.leg,
      };
    };
  }

  _updateHudChrome(geom) {
    const el = this._el;
    const start = this._startTime();
    const total = Math.max(1, Math.round(geom.totalMinutes));
    // 1× 的基準時長：20 分鐘的路約 32 秒播完（以往太快）
    this._durationSec = clamp(total * 1.6, 8, 45);

    el.querySelector('[data-start]').textContent = this._fmt(start);
    el.querySelector('[data-end]').textContent = this._fmt(new Date(start.getTime() + total * 60000));
    el.querySelector('[data-dist]').textContent = `${(geom.totalDistance / 1000).toFixed(1)} km`;

    const modes = [...new Set(geom.legs.map((l) => l.mode))];
    el.querySelector('[data-legend]').innerHTML = modes
      .map(
        (m) =>
          `<span class="r3d-chip"><i style="background:${CSV[m] ?? '#8b8d90'}"></i>${MODE_LABEL[m] ?? m}</span>`
      )
      .join('');
  }

  _startTime() {
    const d = this._itinerary?.latestDeparture;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  }

  _fmt(date) {
    return new Date(date).toLocaleTimeString('zh-HK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Animation                                                           */
  /* ------------------------------------------------------------------ */

  _start() {
    this._playState(true);
    this._jumpCamera();
  }

  _setOffset(offset) {
    if (!this._viewer || Math.abs(offset - this._offset) < 0.5) return;
    const Cesium = this._cesium;
    this._offset = offset;
    for (const entity of this._legEntities) {
      const leg = entity.__leg;
      if (!leg) continue;
      const heights = entity.__heights ?? [];
      entity.polyline.positions = leg.coordinates.map((c, i) =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat, (heights[i] ?? 0) + offset)
      );
    }
  }

  _cameraGoal(cur) {
    const total = this._totalDistance;
    const heading = this._bearing(
      this._pointAt(Math.max(0, this._dist - 2.5)),
      this._pointAt(Math.min(total, this._dist + 7))
    );

    // 所有鏡頭（含總覽）都以「角色」目前位置為旋轉中心
    if (this._camMode === 'overview') {
      return {
        lat: cur.lat,
        lng: cur.lng,
        height: cur.h + 1.5,
        heading,
        pitch: -52,
        dist: this._overviewDist ?? Math.max(1200, total * 0.55),
      };
    }

    if (this._camMode === 'first') {
      // 第一人稱：直接站在頭部位置，dist 0 = 不繞行，只原地轉頭
      return {
        lat: cur.lat,
        lng: cur.lng,
        height: cur.h + 1.62,
        heading,
        pitch: -4,
        dist: 0,
      };
    }

    if (this._camMode === 'third') {
      return {
        lat: cur.lat,
        lng: cur.lng,
        height: cur.h + 1.02, // 角色胸口
        heading,
        pitch: -16,
        dist: 7,
      };
    }

    // 航拍：離角色約 420 m、俯角 -52°，環繞中心仍是角色
    return {
      lat: cur.lat,
      lng: cur.lng,
      height: cur.h + 1.5,
      heading,
      pitch: -52,
      dist: 420,
    };
  }

  _frameOverview() {
    const Cesium = this._cesium;
    const viewer = this._viewer;
    if (!viewer || !this._samples?.length) return;
    const cam = viewer.camera;
    const cv = viewer.scene.canvas;
    const W = cv.clientWidth || 1;
    const H = cv.clientHeight || 1;
    const rad = Cesium.Math.toRadians;

    const b = this._geometry.bbox;
    const cLat = (b.minLat + b.maxLat) / 2;
    const cLng = (b.minLng + b.maxLng) / 2;
    const mid = this._pointAt(this._totalDistance / 2);
    const heading = this._bearing(this._pointAt(0), this._pointAt(this._totalDistance));
    const target = Cesium.Cartesian3.fromDegrees(cLng, cLat, mid.h + this._offset);

    let range = Math.max(900, this._totalDistance * 0.45);
    for (let i = 0; i < 5; i += 1) {
      try {
        cam.lookAt(
          target,
          new Cesium.HeadingPitchRange(heading, rad(-52), range)
        );
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (const p of this._samples) {
          const w = Cesium.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.h + this._offset)
          );
          if (!w) continue;
          const nx = w.x / W;
          const ny = w.y / H;
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        if (spanX <= 0 || spanY <= 0) break;
        const need = Math.max(spanX / 0.8, spanY / 0.7);
        if (need <= 1) break;
        range = Math.min(24000, range * Math.min(2.2, need));
      } catch {
        break;
      }
    }

    this._overviewDist = range;
  }

  _applyMode(mode = this._camMode) {
    this._camMode = CAM_MODES.includes(mode) ? mode : 'overview';
    const btn = this._el?.querySelector('[data-cam]');
    if (btn) btn.textContent = CAM_LABEL[this._camMode];

    const base = this._baseOffset ?? 28;
    const offset =
      this._camMode === 'overview' ? base + 8 : this._camMode === 'aerial' ? base : 0.9;
    this._setOffset(offset);

    this._checkpoints?.forEach((e) => {
      e.show = this._camMode === 'overview';
    });
    if (this._traveler) {
      this._traveler.show = this._camMode === 'overview' || this._camMode === 'aerial';
    }
    if (this._avatarEntity) {
      this._avatarEntity.show = this._camMode === 'third';
    }

    this._dist = (this._progress ?? 0) * (this._totalDistance ?? 0);
    this._camSmooth = null;
    this._freeCam = false;
    this._orbitYaw = 0;
    this._orbitPitch = 0;
    this._orbitDist = null;

    // 一律接管相機：所有模式的拖曳／縮放都以角色為中心，
    // 不再交回 Cesium 原生（否則會繞地圖／地球中心轉）
    this._lockController();

    if (this._camMode === 'overview') {
      this._overviewDist = null;
      this._frameOverview();
    }
    this._tick(performance.now(), true);
  }

  _jumpCamera() {
    if (!this._viewer || !this._samples.length) return;
    this._applyMode(this._camMode);
  }

  async _ensureAvatar() {
    if (this._avatarEntity || this._avatarLoading) return;
    this._avatarLoading = true;
    try {
      const Cesium = this._cesium;
      const custom = CONFIG.hk3d?.avatarUrl;
      const url = custom && /^(https?:|data:)/.test(custom) ? custom : BUNDLED_AVATAR_URL;
      const height = CONFIG.hk3d?.avatarHeightMeters ?? 1.75;
      // 模型以米為單位建模（原始高 1.75），必要時按 avatarHeightMeters 縮放
      const native = CONFIG.hk3d?.avatarNativeHeight ?? 1.75;
      const scale = height / native || 1;

      this._avatarPos = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(0, 0, 0)
      );
      this._avatarHeading = 0;
      const headQuat = new Cesium.CallbackProperty(
        () =>
          Cesium.Transforms.headingPitchRollQuaternion(
            this._avatarPos.getValue(Cesium.JulianDate.now()),
            new Cesium.HeadingPitchRoll(this._avatarHeading, 0, 0)
          ),
        false
      );

      this._avatarEntity = this._viewer.entities.add({
        position: this._avatarPos,
        orientation: headQuat,
        model: {
          uri: url,
          scale,
          minimumPixelSize: 0,
          // 人物走路循環由 Cesium 自動播放（runAnimations 預設 true）
          runAnimations: true,
        },
        show: this._camMode === 'third',
      });
      this._avatarModel = this._avatarEntity; // 狀態回報用
    } catch (e) {
      console.warn('[3D preview] avatar unavailable', e?.message ?? e);
    } finally {
      this._avatarLoading = false;
    }
  }

  _updateAvatar(cur) {
    const entity = this._avatarEntity;
    if (!entity) return;
    const visible = this._camMode === 'third';
    if (entity.show !== visible) entity.show = visible;
    if (!visible || !this._avatarPos) return;

    const Cesium = this._cesium;
    const total = this._totalDistance;
    // glTF 模型面向 -Z，加 π 讓人物背向鏡頭、向行進方向走
    this._avatarHeading =
      this._bearing(
        this._pointAt(Math.max(0, this._dist - 2.5)),
        this._pointAt(Math.min(total, this._dist + 7))
      ) + Math.PI / 2;
    // 人物雙腳站在貼地高度，與光帶高度脫鉤（光帶抬高只為避免與網格 z-fighting）
    this._avatarPos.setValue(Cesium.Cartesian3.fromDegrees(cur.lng, cur.lat, cur.h + 0.02));
  }

  _loop() {
    const step = (ts) => {
      if (!this._open) return;
      this._tick(ts, false);
      if (this._playing) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _tick(ts, force) {
    if (!this._viewer || !this._samples.length) return;
    const Cesium = this._cesium;
    if (force) this._camLastTs = 0;

    // 相機完全由本模組接管：每幀重申關閉 Cesium 原生操作，
    // 否則拖曳會退回「繞地球／地圖中心」旋轉
    this._lockController();

    if (this._playing && !force) {
      if (!this._lastTs) this._lastTs = ts;
      const dt = Math.min(0.06, (ts - this._lastTs) / 1000) * this._speed;
      this._lastTs = ts;
      this._progress = Math.min(1, this._progress + dt / this._durationSec);
      if (this._progress >= 1) {
        this._progress = 1;
        this._playState(false);
      }
    }

    this._dist = this._progress * this._totalDistance;
    const cur = this._pointAt(this._dist);

    this._travelerPos?.setValue(
      Cesium.Cartesian3.fromDegrees(cur.lng, cur.lat, cur.h + this._offset + 1.5)
    );

    this._updateAvatar(cur);

    // 鏡頭：阻尼平滑（不依賴 Cesium 的 tween/飛行動畫）
    if (this._geometry) {
      const goal = this._cameraGoal(cur);
      const targetHeading = goal.heading + this._orbitYaw;
      // 俯角下限避免鏡頭鑽到攝影測量網格下方（會看到黑面）
      const pitchLo = this._camMode === 'first' ? -40 : -78;
      const pitchHi = this._camMode === 'first' ? 12 : -3;
      const targetPitch = Math.min(pitchHi, Math.max(pitchLo, goal.pitch + this._orbitPitch * 57.3));
      const targetDist = this._orbitDist ?? goal.dist;

      if (!this._camSmooth) {
        this._camSmooth = {
          lat: goal.lat,
          lng: goal.lng,
          height: goal.height,
          heading: targetHeading,
          pitch: targetPitch,
          dist: targetDist,
        };
      }
      const sm = this._camSmooth;
      // 以時間常數做指數平滑：低幀率（例如手機 20–30fps）亦不會追不上路線
      const frameDt = Math.min(0.35, Math.max(0.008, (ts - (this._camLastTs ?? ts)) / 1000));
      const tau = this._camMode === 'first' ? 0.09 : this._camMode === 'third' ? 0.11 : 0.16;
      const f = force ? 1 : 1 - Math.exp(-frameDt / tau);
      sm.lat += (goal.lat - sm.lat) * f;
      sm.lng += (goal.lng - sm.lng) * f;
      sm.height += (goal.height - sm.height) * f;
      sm.pitch += (targetPitch - sm.pitch) * f;
      sm.dist += (targetDist - sm.dist) * f;
      sm.heading += this._angleDelta(sm.heading, targetHeading) * (force ? 1 : f * 1.4);

      this._camLastTs = ts;
      const anchor = Cesium.Cartesian3.fromDegrees(sm.lng, sm.lat, sm.height);
      const pitchRad = Cesium.Math.toRadians(sm.pitch);

      if (sm.dist > 0.15) {
        // 以角色為中心環繞：相機永遠在距角色 dist 的球面上
        this._viewer.camera.lookAt(
          anchor,
          new Cesium.HeadingPitchRange(sm.heading, pitchRad, sm.dist)
        );
      } else {
        this._viewer.camera.setView({
          destination: anchor,
          orientation: { heading: sm.heading, pitch: pitchRad, roll: 0 },
        });
      }
    }

    this._syncHud(cur);
  }

  _syncHud(cur) {
    if (!this._el) return;
    const scrub = this._el.querySelector('[data-scrub]');
    if (scrub && document.activeElement !== scrub) scrub.value = String(Math.round(this._progress * 1000));

    const minutes = this._progress * Math.max(1, this._geometry?.totalMinutes ?? 1);
    const clock = new Date(this._startTime().getTime() + minutes * 60000);
    this._el.querySelector('[data-clock]').textContent = this._fmt(clock);

    const legLabel = cur.leg ? this._legText(cur.leg) : '';
    const legEl = this._el.querySelector('[data-leg]');
    if (legEl && legEl.textContent !== legLabel) legEl.textContent = legLabel;
  }

  _legText(leg) {
    const mode = MODE_LABEL[leg.mode] ?? leg.mode;
    const name = leg.isTransit
      ? `${leg.route ? `${leg.route} ` : ''}${leg.fromName} → ${leg.toName}`
      : `${leg.fromName} → ${leg.toName}`;
    return `${mode} · ${name} · ${leg.minutes} 分鐘`;
  }

  _bearing(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x =
      Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
      Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return Math.atan2(y, x);
  }

  _angleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Loading / error UI                                                  */
  /* ------------------------------------------------------------------ */

  _status(text, pct) {
    if (!this._el) return;
    if (this._loadText) this._loadText.textContent = text;
    if (this._loadBar) this._loadBar.style.width = `${clamp(pct, 0, 100)}%`;
  }

  _hideLoading() {
    if (!this._el) return;
    this._loading.hidden = true;
  }

  _fail(err) {
    this._playState(false);
    cancelAnimationFrame(this._raf);
    clearInterval(this._progressTimer);
    if (!this._el) return;
    this._loading.hidden = true;
    this._hud.hidden = true;
    this._error.hidden = false;
    const msg = String(err?.message || err || '未知錯誤');
    this._errorText.textContent = /key|401|403|載入三維|tileset/i.test(msg)
      ? `${msg}｜三維地圖服務可能需要有效的 API key（3dmap@landsd.gov.hk）。`
      : `${msg}｜可先返回 2D 地圖繼續查看路線。`;
  }
}
