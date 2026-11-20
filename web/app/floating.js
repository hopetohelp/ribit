(function (scope) {
  'use strict';

  function dismissOutside(surface, dismiss) {
    var startedOutside = false;
    surface.addEventListener('pointerdown', function (event) {
      startedOutside = event.target === surface;
    });
    surface.addEventListener('click', function (event) {
      if (startedOutside && event.target === surface) dismiss();
      startedOutside = false;
    });
  }

  var support;
  function openSupport() {
    if (!support) {
      support = document.createElement('dialog');
      support.className = 'floating-native support-window';
      support.setAttribute('aria-labelledby', 'support-title');
      var panel = document.createElement('div');
      panel.className = 'floating-panel support-panel';
      var header = document.createElement('header');
      header.className = 'dialog-heading';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'back-button';
      close.setAttribute('aria-label', 'סגירה');
      close.textContent = '→';
      close.addEventListener('click', function () { support.close(); });
      var title = document.createElement('h2');
      title.id = 'support-title';
      title.textContent = 'נשמח לשמוע אתכם';
      header.append(close, title);
      var frame = document.createElement('iframe');
      frame.className = 'support-frame';
      frame.title = 'צ׳אט עם מנהל האתר';
      frame.src = '/chat.html?embedded=1';
      panel.append(header, frame);
      support.appendChild(panel);
      document.body.appendChild(support);
      dismissOutside(support, function () { support.close(); });
      support.addEventListener('close', function () {
        frame.contentWindow.postMessage('ribit:support-hidden', location.origin);
      });
      scope.addEventListener('message', function (event) {
        if (event.source === frame.contentWindow && event.origin === location.origin &&
            event.data === 'ribit:support-close' && support.open) support.close();
      });
    }
    if (support.open) return;
    support.showModal();
    support.querySelector('iframe').contentWindow.postMessage('ribit:support-visible', location.origin);
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-open-support]');
    if (!trigger || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openSupport();
  });
  scope.RibitFloating = { dismissOutside: dismissOutside, openSupport: openSupport };
}(window));
