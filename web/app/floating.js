(function (scope) {
  'use strict';

  function dismissOutside(surface, dismiss, isOutside) {
    isOutside = isOutside || function (event) { return event.target === surface; };
    var startedOutside = false;
    surface.addEventListener('pointerdown', function (event) {
      startedOutside = isOutside(event);
    });
    surface.addEventListener('click', function (event) {
      if (startedOutside && isOutside(event)) dismiss();
      startedOutside = false;
    });
  }

  var windows = [];

  function activeWindow() {
    return windows.find(function (panel) { return panel.open; });
  }

  function createWindow(title, url) {
    var panel = document.createElement('dialog');
    panel.className = 'floating-panel dialog floating-window';
    panel.id = url + '-window';
    panel.setAttribute('aria-labelledby', panel.id + '-title');
    var heading = document.createElement('div');
    heading.className = 'dialog-heading';
    var label = document.createElement('h2');
    label.id = panel.id + '-title';
    label.textContent = title;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'dialog-close';
    close.setAttribute('aria-label', 'סגירה');
    close.autofocus = true;
    scope.RibitIcons.render(close.appendChild(document.createElement('span')), 'x');
    heading.append(label, close);
    var frame = document.createElement('iframe');
    frame.title = title;
    frame.src = '/' + url + '.html?embedded=1';
    panel.append(heading, frame);
    document.body.appendChild(panel);
    close.addEventListener('click', function () { panel.close(); });
    panel.addEventListener('close', function () {
      var previous = activeWindow();
      if (previous && previous !== panel && !previous.contains(document.activeElement)) {
        previous.querySelector('.dialog-close').focus();
      }
    });
    // The dialog itself includes padding. Only a pointer outside its bounds dismisses it.
    dismissOutside(panel, function () { panel.close(); }, function (event) {
      var bounds = panel.getBoundingClientRect();
      return event.target === panel && (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom);
    });
    return panel;
  }

  function openWindow(title, url) {
    var panel = document.getElementById(url + '-window') || createWindow(title, url);
    if (panel.open) return;
    windows = windows.filter(function (item) { return item !== panel; });
    windows.unshift(panel);
    panel.showModal();
    panel.querySelector('iframe').contentWindow.postMessage('ribit:floating-open', location.origin);
  }

  function connectFrame(onOpen) {
    var panel = scope.frameElement && scope.frameElement.closest('.floating-window');
    if (!panel || new URLSearchParams(location.search).get('embedded') !== '1') return null;
    document.body.classList.add('embedded-service');
    var frameLifetime = new AbortController();
    function applyTheme() {
      document.documentElement.dataset.theme = scope.parent.document.documentElement.dataset.theme;
    }
    applyTheme();
    scope.parent.addEventListener('ribit:themechange', applyTheme, { signal: frameLifetime.signal });
    scope.addEventListener('pagehide', function () { frameLifetime.abort(); }, { once: true });
    scope.addEventListener('message', function (event) {
      if (event.source === scope.parent && event.origin === location.origin && event.data === 'ribit:floating-open') onOpen();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        panel.close();
      }
    });
    return panel;
  }

  scope.RibitFloating = { dismissOutside: dismissOutside, activeWindow: activeWindow, openWindow: openWindow, connectFrame: connectFrame };
}(window));
