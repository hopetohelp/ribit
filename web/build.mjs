import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const web = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(web, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const source of ['app', 'hosting']) {
  await cp(path.join(web, source), dist, { recursive: true });
}

// Keep the standalone Android asset intact. The hosted copy opens only in the simulator.
const hostedApp = path.join(dist, 'app.html');
await writeFile(hostedApp, (await readFile(hostedApp, 'utf8')).replace('<head>', '<head><script src="/frame-only.js"></script><link rel="stylesheet" href="/frame-ui.css">'));

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(filename));
    else files.push(filename);
  }
  return files.sort();
}

const mime = {
  '.css': 'text/css; charset=UTF-8', '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8', '.md': 'text/plain; charset=UTF-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json; charset=UTF-8',
};
const assets = {};
const hash = createHash('sha256');
for (const file of await filesIn(dist)) {
  const url = '/' + path.relative(dist, file).split(path.sep).join('/');
  const bytes = await readFile(file);
  hash.update(url).update(bytes);
  assets[url] = [mime[path.extname(file)], gzipSync(bytes).toString('base64')];
}
assets['/'] = assets['/index.html'];

const cacheName = 'ribit-' + hash.digest('hex').slice(0, 16);
const serviceWorker = `
const CACHE = ${JSON.stringify(cacheName)};
const FILES = ${JSON.stringify(Object.keys(assets))};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('ribit-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)));
});
`;
await writeFile(path.join(dist, 'sw.js'), serviceWorker);
assets['/sw.js'] = [mime['.js'], gzipSync(serviceWorker).toString('base64')];

if (process.argv[2]) {
  const worker = `import { DurableObject } from 'cloudflare:workers';
export class SiteCounter extends DurableObject {
  total(increment) {
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS tally (id INTEGER PRIMARY KEY, total INTEGER NOT NULL)');
    if (increment) sql.exec('INSERT INTO tally VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET total = total + 1');
    return sql.exec('SELECT total FROM tally WHERE id = 1').toArray()[0]?.total ?? 0;
  }
}
const files = ${JSON.stringify(assets)};
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/app.html' && request.headers.get('Sec-Fetch-Dest') === 'document') {
      return Response.redirect(new URL('/', request.url), 302);
    }
    if (path === '/download' && request.method === 'GET') {
      if (request.headers.get('Sec-Purpose') !== 'prefetch') {
        await env.COUNTS.getByName('downloads').total(true).catch(() => {});
      }
      return new Response(null, {status: 302, headers: {
        Location: 'https://raw.githubusercontent.com/hopetohelp/ribit/apk-v2.0.0/ribit-2.0.0.apk',
        'Cache-Control': 'no-store'
      }});
    }
    if (path === '/api/view' && request.method === 'POST') {
      const [views, downloads] = await Promise.all([
        env.COUNTS.getByName('views').total(true),
        env.COUNTS.getByName('downloads').total(false)
      ]);
      return Response.json({views, downloads}, {headers: {'Cache-Control': 'no-store'}});
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
    }
    if (!Object.prototype.hasOwnProperty.call(files, path)) return new Response('Not found', {status: 404});
    const [type, zipped] = files[path];
    const headers = {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'"
    };
    if (request.method === 'HEAD') return new Response(null, {headers});
    const bytes = Uint8Array.from(atob(zipped), symbol => symbol.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream, {headers});
  }
};\n`;
  await writeFile(process.argv[2], worker);
}
console.log(`Built ${Object.keys(assets).length} routes in ${dist}`);
