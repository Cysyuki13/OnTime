/**
 * Local dev server for VS Code / browser:
 * - Serves static app files
 * - Proxies /api/kmb/* → https://data.etabus.gov.hk/v1/transport/kmb/*
 *   so the browser never hits KMB CORS
 *
 * Usage:
 *   node server.js
 *   open http://127.0.0.1:3000
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const KMB_UPSTREAM = 'https://data.etabus.gov.hk/v1/transport/kmb';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(body);
}

function proxyKmb(req, res, subPath) {
  const upstreamUrl = `${KMB_UPSTREAM}${subPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  // subPath already includes path; rebuild cleanly
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  // /api/kmb/stop/ → /stop/
  const kmbPath = u.pathname.replace(/^\/api\/kmb/, '') || '/';
  const target = `${KMB_UPSTREAM}${kmbPath}${u.search}`;

  console.log(`[kmb-proxy] ${req.method} ${target}`);

  https
    .get(target, { headers: { Accept: 'application/json', 'User-Agent': 'hk-transit-timer-dev/1.0' } }, (up) => {
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const buf = Buffer.concat(chunks);
        send(res, up.statusCode || 502, buf, {
          'Content-Type': up.headers['content-type'] || 'application/json; charset=utf-8',
          'Cache-Control': kmbPath.includes('eta') ? 'no-store' : 'public, max-age=300',
        });
      });
    })
    .on('error', (err) => {
      console.error('[kmb-proxy] error', err.message);
      send(res, 502, JSON.stringify({ error: 'kmb upstream failed', message: err.message }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1`).pathname);
  if (urlPath === '/') urlPath = '/index.html';
  // block path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  const pathname = new URL(req.url, `http://127.0.0.1`).pathname;
  if (pathname.startsWith('/api/kmb')) {
    proxyKmb(req, res);
    return;
  }
  if (pathname.startsWith('/api/lrt')) {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const target = `https://rt.data.gov.hk/v1/transport/mtr/lrt${u.pathname.replace(/^\/api\/lrt/, '')}${u.search}`;
    console.log('[lrt-proxy]', target);
    https
      .get(target, { headers: { Accept: 'application/json', 'User-Agent': 'hk-transit-timer-dev/1.0' } }, (up) => {
        const chunks = [];
        up.on('data', (c) => chunks.push(c));
        up.on('end', () => {
          send(res, up.statusCode || 502, Buffer.concat(chunks), {
            'Content-Type': up.headers['content-type'] || 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
        });
      })
      .on('error', (err) => {
        send(res, 502, JSON.stringify({ error: 'lrt upstream failed', message: err.message }), {
          'Content-Type': 'application/json; charset=utf-8',
        });
      });
    return;
  }
  if (pathname.startsWith('/api/plan-trip')) {
    send(
      res,
      501,
      JSON.stringify({ error: 'plan-trip proxy not enabled in local server; app uses client-side planner' }),
      { 'Content-Type': 'application/json' }
    );
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed');
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Teiji HK (天時-香港) dev server`);
  console.log(`  App:  http://127.0.0.1:${PORT}/`);
  console.log(`  KMB:  http://127.0.0.1:${PORT}/api/kmb/stop/`);
  console.log(`  Proxy → ${KMB_UPSTREAM}`);
});
