if (window.top === window && navigator.serviceWorker) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

if (window.top === window && navigator.vendor === 'Apple Computer, Inc.' &&
    (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)) {
  function reportRibitInstall() {
    try {
      if (localStorage.getItem('ribit-safari-reported')) return;
      var id = localStorage.getItem('ribit-safari-install');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('ribit-safari-install', id);
      }
      fetch('/api/install/safari', { method: 'POST', headers: { 'X-Ribit-Visitor': id } }).then(function (response) {
        if (response.ok) localStorage.setItem('ribit-safari-reported', '1');
      }).catch(function () {});
    } catch (_) {}
  }
  reportRibitInstall();
  window.addEventListener('online', reportRibitInstall);
}
