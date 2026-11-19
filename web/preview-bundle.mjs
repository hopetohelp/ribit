import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(webDir, 'app');
const hostingDir = path.join(webDir, 'hosting');
const previewDir = path.join(webDir, 'preview');

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(source) {
  return source.replace(/<\/style/gi, '<\\/style');
}

async function dataUri(filePath, mimeType) {
  const bytes = await readFile(filePath);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

function replaceRequired(source, target, replacement, label) {
  if (!source.includes(target)) {
    throw new Error(`Expected ${label} marker was not found`);
  }
  return source.replace(target, () => replacement);
}

// In sandboxed iframes or opaque file:// origins, IndexedDB may throw.
// Keep storage usable in the preview and show when it is limited to the current session.
const STORAGE_FALLBACK_SHIM = `(function (scope) {
  'use strict';
  var storage = scope.RibitStorage;
  if (!storage || scope.RibitDevice) return;
  var original = storage.request;
  var memory = [];
  var useMemory = false;

  function memoryRequest(method, data, callback) {
    try {
      if (method === 'list') {
        var list = memory.map(function (entry) {
          return { id: entry.id, title: entry.title, updatedAt: entry.updatedAt, planCount: entry.planCount };
        }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
        return callback(null, list);
      }
      if (method === 'load') {
        var found = memory.find(function (entry) { return entry.id === data.id; }) || null;
        return callback(null, found ? JSON.parse(JSON.stringify(found)) : null);
      }
      if (method === 'save') {
        var id = data.id || ('preview-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8));
        var record = {
          id: id,
          title: data.title,
          updatedAt: Date.now(),
          planCount: data.calculation.plans.length,
          calculation: JSON.parse(JSON.stringify(data.calculation))
        };
        memory = memory.filter(function (entry) { return entry.id !== id; });
        memory.push(record);
        return callback(null, id);
      }
      if (method === 'remove') {
        memory = memory.filter(function (entry) { return entry.id !== data.id; });
        return callback(null);
      }
      callback(new Error('Unknown storage action'));
    } catch (error) {
      callback(error);
    }
  }

  storage.request = function (method, data, callback) {
    if (useMemory) return memoryRequest(method, data, callback);
    original(method, data, function (error, result) {
      if (error) {
        useMemory = true;
        var warning = scope.document.getElementById('preview-storage-notice');
        warning.hidden = false;
        warning.textContent = 'השמירה זמנית. חישובים שנשמרו כאן יימחקו בסגירת התצוגה.';
        return memoryRequest(method, data, callback);
      }
      callback(null, result);
    });
  };
}(this));`;

export async function buildAppHtml() {
  let html = await readFile(path.join(appDir, 'app.html'), 'utf8');
  let css = await readFile(path.join(appDir, 'app.css'), 'utf8');
  css += '\n#preview-storage-notice { margin: 0; padding: 6px 12px; border-top: 1px solid; font-size: .875rem; }';
  html = replaceRequired(
    html,
    '</main>',
    '</main>\n  <p id="preview-storage-notice" role="status" hidden></p>',
    'app main closing tag',
  );

  const fontFiles = [
    'fonts/arimo-latin-400.woff2',
    'fonts/arimo-hebrew-400.woff2',
    'fonts/arimo-latin-700.woff2',
    'fonts/arimo-hebrew-700.woff2',
  ];
  for (const rel of fontFiles) {
    const uri = await dataUri(path.join(appDir, rel), 'font/woff2');
    css = css.replaceAll(`url("${rel}")`, `url("${uri}")`);
  }

  html = replaceRequired(
    html,
    '<link rel="stylesheet" href="app.css">',
    `<style>\n${escapeInlineStyle(css)}\n</style>`,
    'app.css link',
  );

  const scripts = [
    { tag: '<script src="vendor/decimal.js" defer></script>', file: 'vendor/decimal.js' },
    { tag: '<script src="finance.js" defer></script>', file: 'finance.js' },
    { tag: '<script src="storage.js" defer></script>', file: 'storage.js', suffix: '\n' + STORAGE_FALLBACK_SHIM },
    { tag: '<script src="chart.js" defer></script>', file: 'chart.js' },
    { tag: '<script src="app.js" defer></script>', file: 'app.js', patchPostMessage: true },
  ];

  for (const item of scripts) {
    let source = await readFile(path.join(appDir, item.file), 'utf8');
    if (item.patchPostMessage) {
      source = source.replaceAll(
        "window.parent.postMessage('ribit:exit', window.location.origin)",
        "window.parent.postMessage('ribit:exit', window.location.origin === 'null' ? '*' : window.location.origin)",
      );
    }
    if (item.suffix) source += item.suffix;
    html = replaceRequired(
      html,
      item.tag,
      `<script>\n${escapeInlineScript(source)}\n</script>`,
      `${item.file} script`,
    );
  }

  return html;
}

export async function buildFullPreviewHtml() {
  const appHtml = await buildAppHtml();
  let html = await readFile(path.join(hostingDir, 'index.html'), 'utf8');
  const css = await readFile(path.join(hostingDir, 'preview.css'), 'utf8');
  let js = await readFile(path.join(hostingDir, 'preview.js'), 'utf8');
  const iconUri = await dataUri(path.join(hostingDir, 'icon-192.png'), 'image/png');

  html = html.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest">\n?/, '\n');
  html = html.replaceAll('href="/icon-192.png"', `href="${iconUri}"`);
  html = html.replaceAll('src="/icon-192.png"', `src="${iconUri}"`);
  html = replaceRequired(
    html,
    '<link rel="stylesheet" href="/preview.css">',
    `<style>\n${escapeInlineStyle(css)}\n</style>`,
    'preview.css link',
  );

  js = replaceRequired(
    js,
    "if (!frame.hasAttribute('src')) frame.src = '/app.html';",
    "if (!frame.hasAttribute('srcdoc')) frame.srcdoc = window.__RIBIT_APP_HTML__;",
    'frame src assignment',
  );
  js = replaceRequired(
    js,
    "if (event.source === frame.contentWindow && event.origin === location.origin && event.data === 'ribit:exit') home();",
    "if (event.source === frame.contentWindow && (event.origin === location.origin || event.origin === 'null') && event.data === 'ribit:exit') home();",
    'ribit:exit message handler',
  );
  js = js.replace(
    "if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {});",
    "// Service worker registration skipped in standalone preview bundle.",
  );

  const inlineAppPayload = `window.__RIBIT_APP_HTML__ = ${JSON.stringify(appHtml)};`;
  html = replaceRequired(
    html,
    '<script src="/preview.js" defer></script>',
    `<script>\n${escapeInlineScript(inlineAppPayload)}\n${escapeInlineScript(js)}\n</script>`,
    'preview.js script',
  );

  return html;
}

async function main() {
  const args = process.argv.slice(2);
  let appOnly = false;
  let outputPath = null;

  for (const arg of args) {
    if (arg === '--app-only') {
      appOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node web/preview-bundle.mjs [--app-only] [output.html]');
      console.log('  Default: full device-frame preview written to web/preview/preview.html');
      console.log('  --app-only: direct single-file app preview (no iframe) written to web/preview/app-preview.html');
      return;
    } else if (!arg.startsWith('-') && !outputPath) {
      outputPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const target = outputPath
    ? path.resolve(outputPath)
    : path.join(previewDir, appOnly ? 'app-preview.html' : 'preview.html');
  const html = appOnly ? await buildAppHtml() : await buildFullPreviewHtml();

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  console.log(`Built ${appOnly ? 'app-only' : 'full'} self-contained preview (${Buffer.byteLength(html)} bytes) at ${target}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
