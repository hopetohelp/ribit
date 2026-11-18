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
    keys: [53.5, 131, 2.8, 480, 640, 320, 427]
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
    glass.style.top = (model === 'keys' ? 6 * pxPerMm : (bodyHeight * pxPerMm - screenHeight) / 2) + 'px';
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

  function scroll(direction) {
    if (!$('screen-off').hidden) return;
    const doc = frame.contentDocument;
    const content = frame.hidden ? $('landing') :
      doc && (doc.querySelector('#dialog-backdrop:not([hidden]) #dialog') || doc.getElementById('main'));
    if (content) content.scrollTop += direction * Math.max(35, Math.round(content.clientHeight * .65));
  }

  function scrollDirection(key) {
    if (key === 'PageUp' || (model === 'keys' && key === 'ArrowUp')) return -1;
    if (key === 'PageDown' || (model === 'keys' && key === 'ArrowDown')) return 1;
    return 0;
  }

  function keyboard(event) {
    const direction = scrollDirection(event.key);
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      scroll(direction);
    }
  }

  let lastControl;
  function moveControl(direction) {
    const doc = frame.contentDocument;
    if (!doc) return;
    const scope = doc.querySelector('#dialog-backdrop:not([hidden]) #dialog') || doc;
    const controls = Array.from(scope.querySelectorAll('button, input, select, a[href]'))
      .filter(control => !control.disabled && control.getClientRects().length);
    if (!controls.length) return;
    const current = controls.indexOf(lastControl);
    controls[current < 0 ? 0 : (current + direction + controls.length) % controls.length].focus();
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
    $('keypad').hidden = value !== 'keys';
    $('screen-off').hidden = true;
    frame.style.visibility = 'visible';
    $('power').setAttribute('aria-pressed', 'false');
    if (!frame.hasAttribute('src')) frame.src = '/app.html';
    resize();
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
    doc.addEventListener('keydown', keyboard, true);
    doc.addEventListener('focusin', event => { lastControl = event.target; });
    const header = doc.querySelector('header.bar');
    if (!header) return;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'plain ribit-home';
    const icon = doc.createElement('span');
    icon.className = 'ribit-home-icon';
    icon.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    label.textContent = 'בית';
    button.append(icon, label);
    button.onclick = home;
    header.appendChild(button);
  });
  document.addEventListener('keydown', event => { if (model) keyboard(event); });
  document.querySelectorAll('[data-key]').forEach(button => button.onclick = () => {
    if (!$('screen-off').hidden || frame.hidden) return;
    const key = button.dataset.key;
    const direction = scrollDirection(key);
    if (direction) scroll(direction);
    else if (model === 'keys' && (key === 'ArrowRight' || key === 'ArrowLeft')) {
      moveControl(key === 'ArrowLeft' ? 1 : -1);
    } else {
      const select = key === 'Enter' && lastControl && lastControl.tagName === 'SELECT' && lastControl.getClientRects().length;
      frame.contentWindow.postMessage({ ribitKey: select ? 'ArrowDown' : key }, window.location.origin);
    }
  });
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
