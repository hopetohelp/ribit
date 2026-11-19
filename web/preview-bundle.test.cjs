const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bundler = path.join(__dirname, 'preview-bundle.mjs');

test('builds a self-contained app-only preview with inlined assets and fallback storage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ribit-preview-app-'));
  const out = path.join(dir, 'app-preview.html');
  try {
    execFileSync(process.execPath, [bundler, '--app-only', out], { encoding: 'utf8' });
    const html = fs.readFileSync(out, 'utf8');

    assert.match(html, /^<!doctype html>/i);
    assert.ok(!html.includes('href="app.css"'), 'app.css should be inlined');
    assert.ok(!html.includes('src="vendor/decimal.js"'), 'decimal.js should be inlined');
    assert.ok(!html.includes('src="app.js"'), 'app.js should be inlined');
    assert.ok(!html.includes('url("fonts/'), 'woff2 fonts should be inlined as data URIs');
    assert.ok(html.includes('data:font/woff2;base64,'), 'expected embedded woff2 font data URI');
    assert.ok(html.includes('RibitFinance'), 'expected finance engine in bundle');
    assert.ok(html.includes('RibitChart'), 'expected chart module in bundle');
    assert.ok(html.includes('memoryRequest'), 'expected in-memory storage fallback');
    assert.ok(html.includes('<p id="preview-storage-notice" role="status" hidden>'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('builds a self-contained full device-frame preview with embedded srcdoc app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ribit-preview-full-'));
  const out = path.join(dir, 'preview.html');
  try {
    execFileSync(process.execPath, [bundler, out], { encoding: 'utf8' });
    const html = fs.readFileSync(out, 'utf8');

    assert.match(html, /^<!doctype html>/i);
    assert.ok(!html.includes('href="/preview.css"'), 'preview.css should be inlined');
    assert.ok(!html.includes('src="/preview.js"'), 'preview.js should be inlined');
    assert.ok(!html.includes('src="/icon-192.png"'), 'icon should be inlined');
    assert.ok(html.includes('data:image/png;base64,'), 'expected embedded PNG icon');
    assert.ok(html.includes('window.__RIBIT_APP_HTML__'), 'expected embedded app HTML payload');
    assert.ok(html.includes('frame.srcdoc = window.__RIBIT_APP_HTML__'), 'expected srcdoc launcher');
    assert.ok(html.includes('data-model="smartphone"'), 'expected iPhone 15 profile');
    assert.ok(html.includes('data-model="touch"'), 'expected Qin F21 Pro profile');
    assert.ok(html.includes('data-model="keys"'), 'expected Qin 1S+ profile');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
