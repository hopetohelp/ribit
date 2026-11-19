(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('app');
  const device = document.querySelector('.device');
  const glass = document.querySelector('.glass');
  const footprint = document.querySelector('.footprint');
  const stage = document.querySelector('.stage');
  // Body dimensions, display diagonal and native panel proportions.
  const models = {
    smartphone: [71.6, 147.6, 6.1, 1179, 2556, 390, 846],
    touch: [75.55, 162.24, 6.67, 1080, 2400, 360, 800],
    keys: [54, 132, 2.8, 240, 320, 240, 320]
  };
  let model = 'smartphone';
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
    const screenWidth = panelWidth * pixelsToMm * pxPerMm;
    const screenHeight = panelHeight * pixelsToMm * pxPerMm;
    device.className = 'device ' + model;
    device.style.width = bodyWidth * pxPerMm + 'px';
    device.style.height = bodyHeight * pxPerMm + 'px';
    device.style.setProperty('--button-span', (bodyWidth * pxPerMm + 2) + 'px');
    glass.style.width = screenWidth + 'px';
    glass.style.height = screenHeight + 'px';
    device.style.setProperty('--depth', 8.5 * pxPerMm + 'px');
    glass.style.top = (model === 'keys' ? 94 / 1060 * bodyHeight * pxPerMm : (bodyHeight * pxPerMm - screenHeight) / 2) + 'px';
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
    return frame.hidden || !$('screen-off').hidden ? null : frame.contentWindow.Ribit;
  }

  function scroll(direction) {
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

  function press(key) {
    if (key === 'Back') back();
    else activeApp()?.keypad(key);
  }

  function deviceKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (!frame.hidden && (key === 'Escape' || key === 'BrowserBack')) back();
    else if (key === 'PageUp' || key === 'PageDown') scroll(key === 'PageUp' ? -1 : 1);
    else if (model === 'keys' && /^(?:Arrow(?:Left|Right|Up|Down)|Enter|Backspace|[0-9.−-])$/.test(key)) {
      if (key === 'Enter' && event.target.closest('[data-key]')) return;
      press(key === '−' ? '-' : key);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function configureKeypad() {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('#calculator input[type="text"]').forEach(input => {
      if (model === 'keys') {
        if (!input.hasAttribute('data-touch-input')) input.dataset.touchInput = input.inputMode;
        input.inputMode = 'none';
      } else if (input.hasAttribute('data-touch-input')) {
        input.inputMode = input.dataset.touchInput;
        delete input.dataset.touchInput;
      }
    });
  }

  function home() {
    model = 'smartphone';
    $('screen-off').hidden = true;
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
    $('keypad').hidden = value !== 'keys';
    $('screen-off').hidden = true;
    frame.style.visibility = 'visible';
    $('power').setAttribute('aria-pressed', 'false');
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
  $('power').onclick = () => {
    $('screen-off').hidden = !$('screen-off').hidden;
    frame.style.visibility = $('screen-off').hidden ? 'visible' : 'hidden';
    $('power').setAttribute('aria-pressed', String(!$('screen-off').hidden));
  };
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('keydown', deviceKeyboard, true);
    configureKeypad();
  });
  window.addEventListener('message', event => {
    if (event.source === frame.contentWindow && event.origin === location.origin && event.data === 'ribit:exit') home();
  });
  document.addEventListener('keydown', deviceKeyboard);
  let touchKey;
  document.querySelectorAll('[data-key]').forEach(button => {
    // Keep the active editor control focused when a simulated key is pressed.
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (event.pointerType === 'touch') touchKey = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    button.addEventListener('pointerup', event => {
      if (!touchKey || touchKey.id !== event.pointerId) return;
      const { x, y } = touchKey;
      touchKey = null;
      if (Math.hypot(event.clientX - x, event.clientY - y) < 12 &&
          document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-key]') === button) {
        press(button.dataset.key);
      }
    });
    button.addEventListener('pointercancel', () => { touchKey = null; });
    button.addEventListener('click', event => {
      if (!window.PointerEvent || (event.pointerType !== 'touch' && !event.sourceCapabilities?.firesTouchEvents)) {
        press(button.dataset.key);
      }
    });
  });
  glass.addEventListener('wheel', event => {
    if (model === 'keys') event.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', resize);
  selectSize('fit');
  fetch('/api/view', { method: 'POST' }).then(response => {
    if (response.ok) return response.json();
  }).then(stats => {
    if (!stats) return;
    $('views').textContent = stats.views.toLocaleString('he-IL');
    $('downloads').textContent = stats.downloads.toLocaleString('he-IL');
  }).catch(() => {});
  if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {});
}());
