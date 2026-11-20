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
  nominatimApi: 'https://nominatim.openstreetmap.org/search',
  osrmWalkApi: 'https://router.project-osrm.org/route/v1/foot',
  corsProxies: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
  ],
};
