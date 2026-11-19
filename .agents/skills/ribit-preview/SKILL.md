---
name: ribit-preview
description: Builds and opens a live interactive preview of the Ribit app directly from the repository's web/app and web/hosting sources. Use when the user asks to preview, demo, or show the Ribit app or UI ("תצוגה מקדימה", "תראה את האפליקציה", "preview the app").
---
# Ribit App Preview

Ribit shares the same HTML/CSS/JS UI and calculation engine (`web/app/`) between the Android WebView and the web app, plus a device simulator (`web/hosting/` for iPhone 15, Qin F21 Pro, and Qin 1S+).

## 1. Self-contained single-file preview (offline / zero server)

Generate a standalone HTML file directly from the current repo sources (no external dependencies, Node.js 22+):

```sh
# Full device-frame preview (iPhone 15, Qin F21 Pro, Qin 1S+ + keypad) -> web/dist/preview.html
node web/preview-bundle.mjs

# Direct single-file app preview (no nested iframe, works in strict sandboxed viewers) -> web/dist/app-preview.html
node web/preview-bundle.mjs --app-only

# Optional custom output path:
node web/preview-bundle.mjs --app-only /path/to/ribit_preview.html
```

The bundler (`web/preview-bundle.mjs`) inlines `app.css`, Arimo `.woff2` Hebrew/Latin fonts, `vendor/decimal.js`, `finance.js`, `storage.js` (with an automatic in-memory fallback if `IndexedDB` is blocked in an opaque/sandboxed origin), `chart.js`, and `app.js`.

## 2. Live local server preview (full `web/dist` site)

When the user or environment explicitly needs a live HTTP server (for example, an IDE Preview pane pointing at `http://localhost:3265`):

```sh
node web/build.mjs
python3 -m http.server 3265 --directory web/dist
```

In cloud/agent environments:
- Start the server as a background daemon (`IsDaemon: true`) so it stays running after the turn ends.
- Bookmark `http://localhost:3265` in a `UserFacing: true` `.url.json` artifact for the Preview pane, and do not tell the user to open `localhost` manually on their own machine.

## 3. Presenting the preview in chat / artifact pane

- If the agent environment supports HTML artifacts (`generative_ui`) and no live `localhost` server was explicitly requested, prefer delivering an interactive standalone `.html` artifact in the conversation artifact directory (`UserFacing: true`, `RequestFeedback: false`), or run the daemon server + `.url.json` bookmark when presenting the unmodified `web/dist` build.
- Verify the bundler and finance engine with:

```sh
node --test web/finance.test.cjs web/preview-bundle.test.cjs
```
