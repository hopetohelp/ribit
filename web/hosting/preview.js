(function () {
  'use strict';
  // Safari on Mac may start a Dock app at the URL where it was added.
  if (window.top === window && location.pathname === '/' &&
      (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)) {
    location.replace('/app.html?installed=1');
    return;
  }
  const $ = id => document.getElementById(id);
  const frame = $('app');
  const device = document.querySelector('.device');
  const glass = document.querySelector('.glass');
  const footprint = document.querySelector('.footprint');
  const stage = document.querySelector('.stage');
  // Body dimensions, display diagonal and native panel proportions.
  const models = {
    smartphone: [71.6, 147.6, 6.1, 1179, 2556, 390, 846],
    touch: [53, 132, 2.8, 480, 640, 240, 320],
    keys: [54, 132, 2.8, 240, 320, 240, 320]
  };
  // The F21 panel bounds were measured on the front photograph (429 × 1053 body).
  const f21Screen = { width: 352 / 429, height: 469 / 1053, top: 63 / 1053 };
  let model = 'smartphone';
  let keypadMode;
  let launchButton;
  let calibration = 100;
  let size = 'fit';
  const scaleInput = $('scale');
  const minimumScale = Number(scaleInput.min);
  const maximumScale = Number(scaleInput.max);
  try {
    const savedScale = Number(localStorage.getItem('ribit-scale'));
    if (savedScale) calibration = Math.max(minimumScale, Math.min(maximumScale, savedScale));
  } catch (_) {}
  scaleInput.value = calibration;

  function resize() {
    if (!model) return;
    const [bodyWidth, bodyHeight, diagonal, panelWidth, panelHeight, width, height] = models[model];
    const pxPerMm = 96 / 25.4 * calibration / 100;
    const pixelsToMm = diagonal * 25.4 / Math.hypot(panelWidth, panelHeight);
    const screenWidth = (model === 'touch' ? bodyWidth * f21Screen.width : panelWidth * pixelsToMm) * pxPerMm;
    const screenHeight = (model === 'touch' ? bodyHeight * f21Screen.height : panelHeight * pixelsToMm) * pxPerMm;
    const screenTop = model === 'touch' ? bodyHeight * f21Screen.top :
      model === 'keys' ? bodyHeight * 94 / 1060 : (bodyHeight - screenHeight / pxPerMm) / 2;
    device.className = 'device ' + model;
    device.style.width = bodyWidth * pxPerMm + 'px';
    device.style.height = bodyHeight * pxPerMm + 'px';
    device.style.setProperty('--button-span', (bodyWidth * pxPerMm + 2) + 'px');
    glass.style.width = screenWidth + 'px';
    glass.style.height = screenHeight + 'px';
    device.style.setProperty('--depth', (model === 'touch' ? 9.5 : 8.5) * pxPerMm + 'px');
    glass.style.top = screenTop * pxPerMm + 'px';
    [frame, $('landing')].forEach(surface => {
      surface.style.width = width + 'px';
      surface.style.height = height + 'px';
      surface.style.transform = 'scale(' + screenWidth / width + ',' + screenHeight / height + ')';
    });
    const sideClearance = 6;
    const w = bodyWidth * pxPerMm + sideClearance * 2;
    const h = bodyHeight * pxPerMm;
    const availableWidth = stage.clientWidth - 24;
    const availableHeight = window.innerHeight - 24;
    const scale = size === 'real' ? 1 : Math.max(.15, Math.min(availableWidth / w, availableHeight / h));
    device.style.transform = 'scale(' + scale + ')';
    footprint.style.setProperty('--side-clearance', sideClearance * scale + 'px');
    footprint.style.width = w * scale + 'px';
    footprint.style.height = h * scale + 'px';
  }

  function selectSize(value) {
    size = value;
    document.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.size === size)));
    $('calibration').hidden = size !== 'real';
    $('ruler').style.width = 50 * calibration / 100 + 'mm';
    resize();
  }

  function activeApp() {
    return frame.hidden ? null : frame.contentWindow.Ribit;
  }

  function updateScreen() {
    frame.style.visibility = activeApp() ? 'visible' : 'hidden';
  }

  function scroll(direction) {
    if (model === 'keys') return;
    if (frame.hidden) {
      const landing = $('landing');
      landing.scrollTop += direction * Math.max(35, Math.round(landing.clientHeight * .65));
      return;
    }
    activeApp()?.scroll(direction);
  }

  function back() {
    const app = activeApp();
    if (app) {
      if (!app.back()) home();
    } else if (!frame.hidden) home();
  }

  function press(key, literal) {
    if (key === 'Back') back();
    else {
      if (model === 'touch') setKeypadMode(true);
      activeApp()?.keypad(key, literal);
    }
  }

  function deviceKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (!frame.hidden && (key === 'Escape' || key === 'BrowserBack')) {
      if (!event.repeat) back();
    } else if (key === 'PageUp' || key === 'PageDown') {
      scroll(key === 'PageUp' ? -1 : 1);
    } else if (model === 'keys' && (key === 'Home' || key === 'End')) {
      event.preventDefault();
      return;
    } else if ((model === 'keys' || (model === 'touch' && event.target.ownerDocument === document)) &&
        /^(?:Arrow(?:Left|Right|Up|Down)|Enter|Backspace|[0-9א-תa-zA-Z#. −-])$/.test(key)) {
      if (event.repeat && (key === 'Enter' || key === ' ')) {
        event.preventDefault();
        return;
      }
      if (key === 'Enter' && event.target.closest('[data-key]')) return;
      if (key === ' ' && event.target.closest('[data-key]')) return;
      if (key === '#') press('.');
      else press(key === '−' ? '-' : key, true);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function setKeypadMode(enabled) {
    const app = activeApp();
    if (!app || keypadMode === enabled) return;
    app.setKeypadMode(enabled);
    keypadMode = enabled;
  }

  function configureKeypad() {
    keypadMode = undefined;
    setKeypadMode(model !== 'smartphone');
    activeApp()?.setKeypadOnly?.(model === 'keys');
  }

  function home() {
    model = 'smartphone';
    frame.hidden = true;
    $('landing').hidden = false;
    $('keypad').hidden = true;
    resize();
    if (launchButton) launchButton.focus();
  }

  function open(value, button) {
    launchButton = button;
    model = value;
    $('landing').hidden = true;
    frame.hidden = false;
    $('keypad').hidden = value === 'smartphone';
    updateScreen();
    if (!frame.hasAttribute('src')) frame.src = '/app.html';
    else configureKeypad();
    resize();
    if (value === 'keys') document.querySelector('[data-key=Enter]').focus();
  }

  document.querySelectorAll('[data-model]').forEach(button => button.onclick = () => open(button.dataset.model, button));
  document.querySelectorAll('[data-size]').forEach(button => button.onclick = () => selectSize(button.dataset.size));
  document.querySelectorAll('[data-scroll]').forEach(button => button.onclick = () => scroll(Number(button.dataset.scroll)));
  function setCalibration(value) {
    calibration = value;
    scaleInput.value = value;
    try { localStorage.setItem('ribit-scale', String(calibration)); } catch (_) {}
    selectSize('real');
  }
  scaleInput.oninput = () => setCalibration(Number(scaleInput.value));
  $('reset-scale').onclick = () => setCalibration(Number(scaleInput.defaultValue));
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('keydown', deviceKeyboard, true);
    doc.addEventListener('pointerdown', event => {
      if (model !== 'touch') return;
      // Give direct taps on editable fields their normal browser keyboard.
      const editable = event.target.closest('input[type="text"], input:not([type])') ||
        event.target.closest('label')?.querySelector('input[type="text"], input:not([type])');
      setKeypadMode(!editable);
    }, true);
    configureKeypad();
    updateScreen();
  });
  window.addEventListener('message', event => {
    if (event.source === frame.contentWindow && event.origin === location.origin && event.data === 'ribit:exit') home();
  });
  document.addEventListener('keydown', deviceKeyboard);
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('[data-key], [data-scroll]')) activeApp()?.dismissChart?.();
  });
  let touchKey;
  document.querySelectorAll('[data-key]').forEach(button => {
    const tabStep = Number(button.dataset.tabStep);
    let pressedAt = null;
    function activate(pointerActivation) {
      const longPress = pointerActivation && pressedAt !== null && performance.now() - pressedAt >= 500;
      pressedAt = null;
      if (tabStep && !longPress) activeApp()?.shiftTab?.(tabStep);
      else press(button.dataset.key);
    }
    if (tabStep) button.addEventListener('contextmenu', event => event.preventDefault());
    // Keep the active editor control focused when a simulated key is pressed.
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (event.button !== 0) return;
      if (tabStep) pressedAt = performance.now();
      if (event.pointerType === 'touch') touchKey = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    button.addEventListener('pointerup', event => {
      if (!touchKey || touchKey.id !== event.pointerId) return;
      const { x, y } = touchKey;
      touchKey = null;
      if (Math.hypot(event.clientX - x, event.clientY - y) < 12 &&
          document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-key]') === button) {
        activate(true);
      }
    });
    button.addEventListener('pointercancel', () => { touchKey = null; pressedAt = null; });
    button.addEventListener('click', event => {
      if (!window.PointerEvent || (event.pointerType !== 'touch' && !event.sourceCapabilities?.firesTouchEvents)) {
        activate(event.detail > 0);
      }
    });
  });
  device.addEventListener('wheel', event => {
    if (model === 'keys') event.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', resize);
  selectSize('fit');
  function browserId() {
    try {
      const stored = localStorage.getItem('ribit-visitor');
      if (stored) return stored;
      const id = crypto.randomUUID();
      localStorage.setItem('ribit-visitor', id);
      return id;
    } catch (_) {
      return null;
    }
  }

  const visitor = navigator.locks ? navigator.locks.request('ribit-visitor', browserId) : Promise.resolve(browserId());
  visitor.catch(() => null).then(id => fetch('/api/view', {
    method: 'POST',
    headers: id ? { 'X-Ribit-Visitor': id } : {}
  })).then(response => {
    if (response.ok) return response.json();
  }).then(stats => {
    if (!stats) return;
    $('visitors').textContent = stats.visitors.toLocaleString('he-IL');
    $('downloads').textContent = stats.downloads.toLocaleString('he-IL');
    $('windows-downloads').textContent = stats.windowsDownloads.toLocaleString('he-IL');
  }).catch(() => {});
  if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {});
}());
