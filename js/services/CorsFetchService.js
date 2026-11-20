import { CONFIG } from '../config.js';

/**
 * 處理外部 API 請求：
 * 1) 先嘗試直連（如 MTR、OSM、OSRM 支援 CORS）
 * 2) 若遇到 CORS 阻擋或網路失敗，自動輪替公開 CORS 代理，避免瀏覽器報錯中斷規劃
 */
export async function fetchJsonWithCorsFallback(url, { timeoutMs = 4500 } = {}) {
  const tryFetch = async (targetUrl) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };

  try {
    return await tryFetch(url);
  } catch (directErr) {
    const proxies = CONFIG.corsProxies ?? [];
    for (const prefix of proxies) {
      try {
        return await tryFetch(`${prefix}${encodeURIComponent(url)}`);
      } catch {
        // 繼續嘗試下一個代理
      }
    }
    throw directErr;
  }
}
