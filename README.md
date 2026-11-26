# 天時-香港 · Teiji HK

**Hong Kong transit timer \& multi-modal route planner**  
港鐵 · 九巴 · 專線小巴 · 輕鐵 · 步行 — 最遲出發時間、實時／推算班次、PWA 可安裝

[!\[PWA](https://img.shields.io/badge/PWA-installable-blue)](#install-as-app)
[!\[License](https://img.shields.io/badge/license-MIT-green)](#license)

\---

## 簡介 / About

**天時-香港（Teiji HK）** is a lightweight, installable web app that helps you leave on time for events in Hong Kong.

You set an origin, destination, and arrival deadline. The app plans multi-modal routes (MTR, KMB bus, green/red minibus, Light Rail, walking), estimates travel time, and works **backwards** from your required arrival time to show:

* **最遲出發時間** — latest time you should leave
* **預計到達時間** — estimated arrival
* Optional **notifications** before you need to walk out the door

Designed for daily commuting and one-off appointments across the MTR network, Kowloon Motor Bus (KMB), minibuses, and NWNT Light Rail.

\---

## Features

|Feature|Description|
|-|-|
|**Multi-modal planning**|MTR + walk, MTR + bus/minibus feeders, pure bus/minibus, Light Rail, and combinations|
|**Station snap**|If origin/destination matches an MTR station (e.g. 油塘 → 旺角), a single pure MTR path is preferred — no duplicate “MTR + walk” variants|
|**Latest departure**|Given an arrive-by time, computes when you must leave|
|**ETAs**|Real-time or schedule-based ETAs for MTR, KMB, LRT where APIs allow|
|**Path cards**|Expandable itineraries with segment times, line direction, and mode icons|
|**Filters**|Toggle modes (MTR / bus / minibus / LRT / walk / taxi) to narrow results|
|**Settings**|Walking speed levels, preferred modes, path count limit, colour themes|
|**Map**|Hong Kong-oriented map view for endpoints and segments|
|**3D route preview**|Fly the selected path over the Lands Department 3D Visualisation Map (Cesium 3D Tiles) — 4 camera POVs (總覽 / 航拍 / 第三人稱 / 第一人稱), ground-hugging ribbons, 0.02×–1× speed slider, time-of-day clock|
|**PWA**|Add to Home Screen on iOS/Android; works offline for cached shell|
|**Local-first**|Events and preferences stored in the browser (`localStorage`)|

\---

## Screenshots

> Add your own screenshots here after cloning, e.g.:

```text
docs/screenshot-list.png
docs/screenshot-detail.png
docs/screenshot-settings.png
```

\---

## Quick start

### Requirements

* **Node.js** 18+ (only for the local dev server / API proxy)
* A modern browser (Chrome, Safari, Firefox, Edge)

### Run locally

```bash
# clone
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# start static server + KMB/LRT proxy (default port 3000)
node server.js

# open
# http://127.0.0.1:3000
```

The dev server:

1. Serves the static app (`index.html`, `js/`, `css/`, `icons/`, …)
2. Proxies `/api/kmb/\\\*` → [KMB open data](https://data.etabus.gov.hk/) (avoids browser CORS)
3. Proxies `/api/lrt/\\\*` → MTR Light Rail realtime API

No build step and no npm install are required for the basic app.

### Install as app (PWA)

1. Open the site in mobile Safari / Chrome
2. **Add to Home Screen**
3. Launch **天時** from the icon — runs in standalone mode

Icons include maskable assets for Android adaptive icons.

\---

## How to use

1. **Create an event** — title, origin, destination, arrive-by time
2. **Plan** — the app generates ranked itineraries
3. **Pick a path** — expand a card, review segments and times
4. **Enable notifications** (optional) — reminders at 10 / 5 / 0 minutes before latest departure
5. **Adjust settings** — walk speed, which modes to include, max number of paths

Tip: when both ends are MTR stations (name match or selected from MTR autocomplete), you should see **one** pure MTR itinerary such as `油塘（觀塘綫）→ 旺角`.

\---

## Tech stack

* **Frontend:** vanilla ES modules (no React/Vue build)
* **UI:** custom CSS (terminal / workbench dark theme)
* **Routing engine:** client-side multi-modal graph planner (`RoutePlanningService`)

  * MTR graph + Dijkstra
  * KMB route–stop network (API + cache)
  * LRT graph
  * Walking via OSRM foot routing (with haversine fallback)
* **Data sources (public):**

  * [MTR Next Train / schedule API](https://data.gov.hk/) (`rt.data.gov.hk`)
  * [KMB ETA \& static data](https://data.etabus.gov.hk/)
  * MTR Light Rail schedule API
  * [Hong Kong GeoData Store](https://geodata.gov.hk/) for place search
  * OpenStreetMap Nominatim (fallback geocoding)
* **PWA:** `manifest.json` + service worker (`sw.js`)

\---

## Project structure

```text
├── index.html              # App shell, title 天時-香港
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── server.js               # Dev server + KMB/LRT proxy
├── css/
│   ├── main.css
│   └── components.css
├── icons/
│   ├── icon-\\\*.png          # App icons (any + maskable)
│   └── modes/              # Transport mode icons (MTR, KMB, walk, taxi, …)
├── data/
│   ├── kmb/                # Optional local KMB snapshots
│   └── lrt/                # LRT graph / routes
└── js/
    ├── app.js
    ├── config.js           # API endpoints \\\& defaults
    ├── controllers/
    ├── models/             # Location, Itinerary, RouteSegment, TransportMode
    ├── services/           # Planning, ETA, places, settings, notifications
    └── ui/                 # Views (list, detail, settings, map, autocomplete)
```

\---

## 3D 沿路預覽 / 3D route preview

Tap **3D 沿路預覽** on any itinerary card. CesiumJS is lazy-loaded (≈5 MB) only at that
moment, then streams the Lands Department 3D Tiles.

**Camera POVs (cycle with the button, left of the replay icon)**

|Label|Meaning|
|-|-|
|總覽|Whole route fitted on the 3D map (markers + checkpoints)|
|航拍|Aerial chase ~300 m above the corridor|
|三人稱|Third-person: 1.75 m orange stick-figure avatar walking the route, camera 7 m behind|
|一人稱|First-person: head-height eye view straight down the route|

**Rotating around the character.** In 航拍 / 三人稱 / 一人稱 the orbit pivot is the
character itself, not the map centre: drag horizontally to swing the camera around it,
drag vertically to change pitch, and pinch / mouse-wheel to change the orbit radius
(2.2–18 m in third person, 120–1400 m in aerial). The character stays pinned at the same
point on screen while the world turns around them. Tap 回到鏡頭 to snap back to the
mode's default angle. 總覽 orbits around the same point at route-wide distance (300–16 000 m),
so the pivot is never the globe/terrain centre.

Cesium's own `screenSpaceCameraController` (rotate / tilt / translate / zoom, plus inertia)
is switched off and re-asserted every frame, and the preview intercepts pointer events in
the capture phase before they reach the Cesium canvas — otherwise a drag would fall back to
Cesium's default "spin around the 3D map centre" behaviour.

**Playback**

* Speed is a volume-style slider in the HUD, mapped exponentially
  `speed = speedMin × (speedMax/speedMin)^t` with `CONFIG.hk3d = {speedMin: 0.02, speedMax: 1,
  speedDefault: 0.35}` — so the slow end (0.02×–0.2×) gets most of the travel, because
  0.2× was still too fast.
* Total animation length is `clamp(totalMinutes * 1.6, 8s, 45s)` at 1×; the multiplier
  scales the wall-clock duration.
* Scrub bar seeks; the HUD clock follows `latestDeparture + progress × totalMinutes`.

**Route geometry & grounding**

* Rail legs: station-graph BFS (`HK_MTR_LINE_EDGES` / `HK_LRT_EDGES`).
* Walk / bus / minibus legs: OSRM `foot` / `driving`, passing through board/alight stops;
  falls back to a smooth arc when offline.
* Heights are sampled from the photogrammetry mesh: 200 probes along the path, and each
  probe takes the **lowest of a 5-point cross** (±7 m) so a neighbouring roof or tree crown
  cannot lift the line into mid-air. A ±3-sample window minimum plus 5-point smoothing then
  removes remaining spikes. Below 55 % success the ribbon switches to a floating profile.
* The ribbon now hugs the road: 2.2 m above the surface in aerial/overview and **0.9 m** in
  the avatar POVs (just enough to avoid z-fighting with the mesh).

**Avatar model**

`assets/models/avatar-stick.glb` (38 KB) — a plain orange stick figure generated procedurally
for this project: capsule torso/limbs, sphere head, one unlit-ish PBR material (base
#FB9230 + emissive lift so it reads as a flat colour whatever the scene light). Built in
metres (1.75 m tall) with a node-hierarchy walk cycle — arms ±24°, legs ±20° about X plus
a 3 cm pelvis bob, 1 s loop, played automatically by Cesium's `runAnimations`. Set
`CONFIG.hk3d.avatarUrl` to an absolute URL to swap in your own model, and
`avatarNativeHeight` to match its modelling height.

**API key & fair use**

The demo key `3967f8f365694e0798af3e7678509421` is public and rate-limited. Apply to
`3dmap@landsd.gov.hk` for your own free production key, then set `CONFIG.hk3d.apiKey`
(or pass `?key=...` in `tilesetUrl`). Documented fair-use caps: 100 concurrent users and
~5 GB/s aggregated bandwidth, so keep `maximumScreenSpaceError` ≈ 30 on mobile.

**Known limits**

* Photogrammetry, not a model: very low camera angles end up inside walls; that's why the
  aerial POV sits high and the avatar modes ride above the sampled surface.
* Tiles and Cesium are online-only — the PWA cache deliberately excludes them.
* If WebGL is unavailable or the tileset fails, the overlay falls back to the 2D map.

---

## Configuration

Edit `js/config.js`:

|Key|Meaning|
|-|-|
|`useRealTransitApi`|`true` = client multi-modal planner; `false` = backend `/api/plan-trip`|
|`walkingSpeed`|Default m/min (overridden by settings walk level)|
|`maxReasonableWalkMeters`|Walk legs beyond this are marked impractical|
|`notificationLeads`|Minutes before latest departure to notify|
|`defaultOrigin`|Fallback when GPS is unavailable|
|`kmbProxyBase` / `lrtProxyBase`|Local proxy paths used by the browser|

\---

## Data \& attribution

This project uses open data and public APIs from:

* **MTR Corporation / data.gov.hk** — train \& Light Rail schedules
* **Kowloon Motor Bus (KMB)** — routes, stops, ETA (`data.etabus.gov.hk`)
* **Lands Department GeoData Store** — place search
* **OpenStreetMap / OSRM** — geocoding \& walking routes

Not affiliated with MTR, KMB, or the HKSAR Government. Schedule and ETA accuracy depend on upstream feeds.

\---

## Browser support

* Chrome / Edge (desktop \& Android) — full PWA
* Safari (iOS 16.4+ recommended for better PWA behaviour)
* Firefox

Geolocation, notifications, and “Add to Home Screen” depend on the host browser and HTTPS in production.

\---

## Roadmap (ideas)

* \[ ] Stronger taxi / ride-hail estimates (experimental toggle exists)
* \[ ] Citybus / NWFB integration
* \[ ] Shareable event / path links
* \[ ] Better offline ETA caching
* \[ ] English UI toggle

\---

## Contributing

Issues and pull requests are welcome. For planning logic changes, please test at least:

1. **MTR–MTR** (e.g. 油塘 → 旺角) → single pure MTR path
2. **Landmark → station** → MTR + reasonable walk
3. **Bus / minibus-only** corridors

\---

## License

MIT — free to use, modify, and distribute.  
If you publish a fork, a link back to this repo is appreciated.

```text
Copyright (c) 2026 Teiji HK contributors
```

\---

## Name

|Language|Name|
|-|-|
|中文|**天時-香港**|
|English|**Teiji HK**|

*Teiji* echoes the idea of **timing** (天時) — leaving at the right moment to arrive on time across Hong Kong’s transit network.

