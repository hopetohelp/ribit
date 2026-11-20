if (window.top === window && navigator.serviceWorker) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
