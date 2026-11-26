export const CONFIG = {
  // true = 啟用多模式動態最短時間規劃；false = 透過後端代理調用 Wheels Router
  useRealTransitApi: true,

  // 步行速度（米/分鐘）
  walkingSpeed: 80,

  // 合理步行上限（米）：超過此距離不建議純步行或步行接駁，改搭巴士／小巴／港鐵
  maxReasonableWalkMeters: 950,

  // 生成最遲出發前的提醒（分鐘）
  notificationLeads: [10, 5, 0],

  // 預設起點（當無法獲取 GPS 時使用）
  defaultOrigin: { name: '油塘', lat: 22.2977, lng: 114.2372 },

  // 九巴靜態路網快取有效期（毫秒，預設 24 小時）
  kmbStaticCacheTtlMs: 24 * 60 * 60 * 1000,

  // 香港官方 API 與開源地圖端點
  hkGeoDataSearchApi: 'https://geodata.gov.hk/gs/api/v1.0.0/locationSearch',
  hkGeoDataRevApi: 'https://geodata.gov.hk/gs/api/v1.0.0/locationReverse',
  mtrApi: 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php',
  kmbApi: 'https://data.etabus.gov.hk/v1/transport/kmb',
  // Local dev proxy (server.js). Browser calls this to avoid KMB CORS.
  kmbProxyBase: '/api/kmb',
  lrtScheduleApi: 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule',
  lrtProxyBase: '/api/lrt',
  lrtRoutesCsv: 'data/lrt/light_rail_routes_and_stops.csv',
  lrtGraphJson: 'data/lrt/graph.json',
  nominatimApi: 'https://nominatim.openstreetmap.org/search',
  osrmWalkApi: 'https://router.project-osrm.org/route/v1/foot',
  corsProxies: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
  ],

  // ── 3D 沿路預覽（地政總署「可視化三維地圖」+ Cesium 3D Tiles）────────────
  // 圖磚服務由 Lands Department 提供，僅在按下「3D 沿路預覽」時才載入。
  // 公開示範 key 有 100 併發使用者上限，正式上線前請以電郵向 3dmap@landsd.gov.hk
  // 申請專用 key，並填入 apiKey。
  hk3d: {
    cesiumBaseUrl: 'https://cdn.jsdelivr.net/npm/cesium@1.119.0/Build/Cesium/',
    tilesetUrl: 'https://data.map.gov.hk/api/3d-data/3dtiles/f2/tileset.json',
    // 地政總署 API 文件中的示範 key（僅供開發測試）
    demoTilesetKey: '3967f8f365694e0798af3e7678509421',
    // 你的專用 key；設定後會覆蓋 demoTilesetKey
    apiKey: null,
    attribution: '© 地政總署 Lands Department, HKSARG',
    // 3D 人物模型：null = 使用內建 assets/models/avatar-stick.glb
    avatarUrl: null,
    avatarHeightMeters: 1.75,
    // 內建模型以米建模，原始高度 1.75 m
    avatarNativeHeight: 1.75,
    // 播放速度滑桿：0–100 以指數映射 speedMin → speedMax
    speedMin: 0.02,
    speedMax: 1,
    speedDefault: 0.35,
  },
};
