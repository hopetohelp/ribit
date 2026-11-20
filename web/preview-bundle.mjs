import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(webDir, 'app');
const hostingDir = path.join(webDir, 'hosting');
const previewDir = path.join(webDir, 'preview');

async function inlineNavigation(html, href) {
  const css = await readFile(path.join(appDir, 'navigation.css'), 'utf8');
  return replaceRequired(html, `<link rel="stylesheet" href="${href}">`,
    `<style>
${escapeInlineStyle(css)}
</style>`, 'navigation.css link');
}

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
      if (method === 'import') {
        var records = data.entries.map(function (entry) {
          return {
            id: 'preview-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
            title: entry.title, updatedAt: entry.updatedAt,
            planCount: entry.calculation.plans.length, calculation: entry.calculation
          };
        });
        memory = memory.concat(records);
        return callback(null);
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
  let css = await readFile(path.join(appDir, 'floating.css'), 'utf8') + '\n' +
    await readFile(path.join(appDir, 'app.css'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="floating.css">', '');
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

  html = await inlineNavigation(html, 'navigation.css');
  const logo = await dataUri(path.join(appDir, 'icon-192.png'), 'image/png');
  html = replaceRequired(html, 'src="icon-192.png"', `src="${logo}"`, 'app logo');

  const scripts = [
    { tag: '<script src="vendor/decimal.js" defer></script>', file: 'vendor/decimal.js' },
    { tag: '<script src="finance.js" defer></script>', file: 'finance.js' },
    { tag: '<script src="storage.js" defer></script>', file: 'storage.js', suffix: '\n' + STORAGE_FALLBACK_SHIM },
    { tag: '<script src="chart.js" defer></script>', file: 'chart.js' },
    { tag: '<script src="floating.js" defer></script>', file: 'floating.js' },
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
  const iconUri = await dataUri(path.join(appDir, 'icon-192.png'), 'image/png');

  html = html.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest">\n?/, '\n');
  html = html.replace('href="/chat"', 'href="https://ribit.hopetohelp.net/chat"')
    .replace('href="/account"', 'href="https://ribit.hopetohelp.net/account"')
    .replace('href="/download"', 'href="https://ribit.hopetohelp.net/download"')
    .replace('href="/download/windows"', 'href="https://ribit.hopetohelp.net/download/windows"');
  html = html.replace('class="brand-logo" href="/"', 'class="brand-logo" href="#landing"');
  html = html.replaceAll('href="/icon-192.png"', `href="${iconUri}"`);
  const logoUri = await dataUri(path.join(hostingDir, 'icon-512.png'), 'image/png');
  html = html.replaceAll('src="/icon-512.png"', `src="${logoUri}"`);
  html = html.replace(
    '<script src="/android-store.js" defer></script>',
    '',
  );
  html = html.replace('<p id="android-release-status" role="status">בודקים איזו גרסה זמינה…</p>', '');
  html = html.replace('href="https://ribit.hopetohelp.net/download" hidden', 'href="https://ribit.hopetohelp.net/download"');
  html = replaceRequired(
    html,
    '<link rel="stylesheet" href="/preview.css">',
    `<style>\n${escapeInlineStyle(css)}\n</style>`,
    'preview.css link',
  );

  html = await inlineNavigation(html, '/navigation.css');

  js = replaceRequired(
    js,
    "if (!frame.hasAttribute('src')) frame.src = '/app.html';",
    "if (!frame.hasAttribute('srcdoc')) frame.srcdoc = window.__RIBIT_APP_HTML__;",
    'frame src assignment',
  );
  js = replaceRequired(
    js,
    "if (event.source !== frame.contentWindow || event.origin !== location.origin) return;",
    "if (event.source !== frame.contentWindow || (event.origin !== location.origin && event.origin !== 'null')) return;",
    'device message origin check',
  ).replace("    if (event.data === 'ribit:account-page') location.assign('/account');", '')
    .replace("    if (event.data === 'ribit:support-page') location.assign('/chat');", '');
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
