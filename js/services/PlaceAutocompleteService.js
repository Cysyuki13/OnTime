import { Location } from '../models/Location.js';
import { CONFIG } from '../config.js';
import { HK_MTR_STATIONS, HK_LANDMARKS, HK_KMB_ROUTES_DATA } from '../data/hkStations.js';
import { HK_PLACES_DB } from '../data/hkPlacesDb.js';
import { fetchJsonWithCorsFallback } from './CorsFetchService.js';

/**
 * 香港地點搜尋服務：
 * 1) 本地地標庫、港鐵車站、九巴／小巴站點（即時零延遲）
 * 2) 香港地政總署 GeoData Store API (geodata.gov.hk)
 * 3) OpenStreetMap Nominatim（香港範圍，支援 CORS 代理備援）
 */
export class PlaceAutocompleteService {
  async search(query, { limit = 10 } = {}) {
    const q = query.trim();
    if (q.length < 1) return [];

    const localResults = [
      ...this._searchLandmarks(q, 5),
      ...this._searchMtrStations(q, 4),
      ...this._searchBuiltInBusStops(q, 4),
    ];

    const [hkGeoResults, osmResults] = await Promise.all([
      this._searchHkGeoData(q, 5).catch(() => []),
      this._searchOpenStreetMap(q, 5).catch(() => []),
    ]);

    const rawAll = [...localResults, ...hkGeoResults, ...osmResults];

    const merged = [];
    for (const loc of rawAll) {
      if (!loc.name || !loc.hasCoords) continue;
      const dup = merged.some((existing) => {
        if (existing.name === loc.name) return true;
        const d = existing.distanceTo(loc);
        return d != null && d < 35;
      });
      if (!dup) merged.push(loc);
      if (merged.length >= limit) break;
    }

    return merged;
  }

  async getCurrentLocation() {
    if (!('geolocation' in navigator)) {
      throw new Error('瀏覽器不支援定位功能');
    }

    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let name = `目前位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    try {
      const geoUrl = `${CONFIG.hkGeoDataRevApi}?lat=${lat}&lon=${lng}`;
      const geoData = await fetchJsonWithCorsFallback(geoUrl, { timeoutMs: 2500 });
      const geoName = geoData?.nameTc || geoData?.nameEn || geoData?.districtTc;
      if (geoName) {
        name = geoName;
      } else {
        const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-HK`;
        const data = await fetchJsonWithCorsFallback(osmUrl, { timeoutMs: 2500 });
        const shortName =
          data.name ||
          data.address?.building ||
          data.address?.amenity ||
          data.address?.road ||
          data.address?.suburb;
        if (shortName) name = shortName;
      }
    } catch {
      // 忽略逆編碼失敗
    }

    return new Location({
      name,
      lat,
      lng,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      source: 'gps',
    });
  }

  async _searchHkGeoData(q, limit) {
    const params = new URLSearchParams({
      q,
      n: String(limit),
    });
    const data = await fetchJsonWithCorsFallback(`${CONFIG.hkGeoDataSearchApi}?${params}`, {
      timeoutMs: 3000,
    });

    const list = Array.isArray(data) ? data : (data?.results ?? data?.features ?? []);
    const out = [];

    for (const item of list) {
      const lat = Number(item?.lat ?? item?.y ?? item?.geometry?.coordinates?.[1]);
      const lng = Number(item?.lon ?? item?.lng ?? item?.x ?? item?.geometry?.coordinates?.[0]);
      const name = item?.nameTc || item?.nameEn || item?.name || item?.properties?.nameTc;
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const address =
        item?.addressTc ||
        item?.districtTc ||
        item?.addressEn ||
        item?.properties?.addressTc ||
        '香港地政總署 GeoData';

      out.push(
        new Location({
          name,
          lat,
          lng,
          address,
          source: 'hkgeo',
        })
      );
      if (out.length >= limit) break;
    }

    return out;
  }

  _searchLandmarks(q, limit) {
    const lower = q.toLowerCase();
    const combined = [
      ...HK_PLACES_DB.map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: `${p.district} · ${p.category} · ${p.address}`,
        searchText: `${p.name} ${p.en ?? ''} ${p.district} ${p.category} ${p.address}`.toLowerCase(),
        source: 'hkdb',
      })),
      ...HK_LANDMARKS.map((item) => ({
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        address: item.address,
        searchText: `${item.name} ${item.address}`.toLowerCase(),
        source: 'landmark',
      })),
    ];

    return combined
      .filter((item) => item.searchText.includes(lower))
      .slice(0, limit)
      .map(
        (item) =>
          new Location({
            name: item.name,
            lat: item.lat,
            lng: item.lng,
            address: item.address,
            source: item.source,
          })
      );
  }

  _searchMtrStations(q, limit) {
    const lower = q.toLowerCase();
    return HK_MTR_STATIONS
      .filter((s) => s.name.toLowerCase().includes(lower) || s.en.toLowerCase().includes(lower))
      .slice(0, limit)
      .map(
        (s) =>
          new Location({
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            address: s.line,
            source: 'mtr',
          })
      );
  }

  _searchBuiltInBusStops(q, limit) {
    const lower = q.toLowerCase();
    const seen = new Set();
    const out = [];
    for (const r of HK_KMB_ROUTES_DATA) {
      if (!r || !Array.isArray(r.stops)) continue;
      for (const st of r.stops) {
        if (seen.has(st.name)) continue;
        if (st.name.toLowerCase().includes(lower)) {
          seen.add(st.name);
          out.push(
            new Location({
              name: st.name,
              lat: st.lat,
              lng: st.lng,
              stopId: st.id,
              address: `${r.mode === 'minibus' ? '專線小巴' : '九巴'} ${r.route} 站點`,
              source: 'kmb',
            })
          );
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  async _searchOpenStreetMap(q, limit) {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      countrycodes: 'hk',
      limit: String(limit),
      addressdetails: '1',
      'accept-language': 'zh-HK,zh-TW,en',
    });
    const data = await fetchJsonWithCorsFallback(`${CONFIG.nominatimApi}?${params}`, { timeoutMs: 3000 });

    return (data ?? []).map((item) => {
      const displayParts = String(item.display_name || '').split(',').map((s) => s.trim());
      const name = item.name || displayParts[0] || q;
      const address = displayParts.slice(1, 4).join(' · ');
      return new Location({
        name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        address,
        source: 'osm',
      });
    });
  }
}
