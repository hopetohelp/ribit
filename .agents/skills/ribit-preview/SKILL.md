---
name: ribit-preview
description: Builds and opens a live interactive preview of the Ribit app directly from the repository's web/app and web/hosting sources. Use when the user asks to preview, demo, or show the Ribit app or UI ("תצוגה מקדימה", "תראה את האפליקציה", "preview the app").
---
# Ribit App Preview

Ribit shares the same HTML/CSS/JS UI and calculation engine (`web/app/`) between the Android WebView and the web app, plus a device simulator (`web/hosting/` for iPhone 15, Qin F21 Pro, and Qin 1S+).

## Core rule

**Never hand-write, mock, or recreate the Ribit UI or calculation engine.** Always preview the real source files from `web/app/` and `web/hosting/` using either the live `web/dist` server or the `web/preview-bundle.mjs` bundler below.

## 1. Live local server preview (100% real `web/dist` site — recommended)

Build and serve the unmodified `web/dist` bundle (full device simulator for iPhone 15, Qin F21 Pro, Qin 1S+ + real `app.html`):

```sh
node web/build.mjs
python3 -m http.server 3265 --bind 127.0.0.1 --directory web/dist
```

In cloud/agent environments:
- Start the server with `IsDaemon: true` so it keeps running after the turn ends.
- Verify `http://localhost:3265/` and `http://localhost:3265/app.html` return `200`.
- Bookmark `http://localhost:3265` in a `UserFacing: true` `.url.json` artifact for the Preview pane, and do not tell the user to open `localhost` manually on their own machine.

## 2. Self-contained single-file preview (offline / zero server)

Generate a standalone HTML file directly from the real repo sources (no external dependencies, Node.js 22+):

```sh
# Full device-frame preview (iPhone 15, Qin F21 Pro, Qin 1S+ + keypad) -> web/preview/preview.html
node web/preview-bundle.mjs

# Direct single-file app preview (no nested iframe, works in strict sandboxed viewers) -> web/preview/app-preview.html
node web/preview-bundle.mjs --app-only

# Optional custom output path:
node web/preview-bundle.mjs --app-only /path/to/ribit_preview.html
```

The bundler (`web/preview-bundle.mjs`) inlines the real `app.css`, Arimo `.woff2` Hebrew/Latin fonts, `vendor/decimal.js`, `finance.js`, `storage.js` (with an automatic in-memory fallback if `IndexedDB` is blocked in an opaque/sandboxed origin), `chart.js`, and `app.js`. If storage falls back to memory, the preview shows a notice that saved calculations will disappear when it closes.

## 3. Verification

```sh
node --test web/finance.test.cjs web/preview-bundle.test.cjs
```
