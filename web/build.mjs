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
  const cached = () => caches.open(CACHE).then(cache => cache.match(url.pathname));
  event.respondWith(fetch(event.request).catch(cached));
});
`;
await writeFile(path.join(dist, 'sw.js'), serviceWorker);
assets['/sw.js'] = [mime['.js'], gzipSync(serviceWorker).toString('base64')];

if (process.argv[2]) {
  const worker = `import { DurableObject } from 'cloudflare:workers';
export class SiteCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS tally (id INTEGER PRIMARY KEY, total INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS browsers (id TEXT PRIMARY KEY) WITHOUT ROWID');
  }

  total(increment, minimum = 0) {
    const sql = this.ctx.storage.sql;
    if (increment) sql.exec('INSERT INTO tally VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET total = MAX(total + 1, excluded.total)', minimum + 1);
    return Math.max(minimum, sql.exec('SELECT total FROM tally WHERE id = 1').toArray()[0]?.total ?? 0);
  }

  seeBrowser(browserId, minimum) {
    const storage = this.ctx.storage;
    return storage.transactionSync(() => {
      const inserted = storage.sql.exec('INSERT OR IGNORE INTO browsers (id) VALUES (?)', browserId);
      return this.total(inserted.rowsWritten > 0, minimum);
    });
  }
}
const files = ${JSON.stringify(assets)};
const historicalDownloads = 15;
const windowsInstaller = 'https://github.com/hopetohelp/ribit/releases/download/windows-v0.2.1/Ribit-Setup.exe';
const downloadMethods = ['GET', 'HEAD'];
function isDownload(request) {
  return request.method === 'GET' && !['Sec-Purpose', 'Purpose'].some(
    name => request.headers.get(name)?.toLowerCase().includes('prefetch')
  );
}
const minimumViewers = 30;
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/app.html' && request.headers.get('Sec-Fetch-Dest') === 'document') {
      return Response.redirect(new URL('/', request.url), 302);
    }
    const apk = 'ribit-0.2.1.apk';
    if (path === '/download' && downloadMethods.includes(request.method)) {
      const file = await env.DOWNLOADS.getWithMetadata(apk, {type: 'stream'});
      if (!file.value) return new Response('Download unavailable', {status: 503});
      const headers = new Headers({
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="' + apk + '"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (file.metadata?.size) headers.set('Content-Length', String(file.metadata.size));
      if (request.method === 'HEAD') return new Response(null, {headers});
      if (isDownload(request)) await env.COUNTS.getByName('site-downloads').total(true).catch(() => {});
      return new Response(file.value, {headers});
    }
    if (path === '/download/windows' && downloadMethods.includes(request.method)) {
      if (isDownload(request)) {
        await env.COUNTS.getByName('windows-downloads').total(true).catch(() => {});
      }
      return new Response(null, {
        status: 302,
        headers: { Location: windowsInstaller, 'Cache-Control': 'no-store' }
      });
    }
    if (path === '/api/view' && request.method === 'POST') {
      const browserId = request.headers.get('X-Ribit-Visitor');
      const browsers = env.COUNTS.getByName('unique-browsers');
      const validVisitor = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(browserId);
      const [visitors, downloadRequests, windowsDownloads] = await Promise.all([
        validVisitor ? browsers.seeBrowser(browserId, minimumViewers) : browsers.total(false, minimumViewers),
        env.COUNTS.getByName('site-downloads').total(false),
        env.COUNTS.getByName('windows-downloads').total(false)
      ]);
      return Response.json({visitors, downloads: historicalDownloads + downloadRequests, windowsDownloads}, {headers: {'Cache-Control': 'no-store'}});
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
