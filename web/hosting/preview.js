(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('app');
  const device = document.querySelector('.device');
  const glass = document.querySelector('.glass');
  const footprint = document.querySelector('.footprint');
  const stage = document.querySelector('.stage');
  // Representative screen sizes in millimetres and their CSS layout viewports.
  const models = { smartphone: [65, 140, 390, 840], touch: [69, 153, 360, 798], keys: [43, 57, 320, 424] };
  let model;
  let calibration = 100;
  let size = 'fit';
  try { calibration = Number(localStorage.getItem('ribit-scale')) || 100; } catch (_) {}
  $('scale').value = calibration;

  function resize() {
    if (!model) return;
    const [mmWidth, mmHeight, width, height] = models[model];
    const pxPerMm = 96 / 25.4 * calibration / 100;
    const screenWidth = mmWidth * pxPerMm;
    const screenHeight = mmHeight * pxPerMm;
    glass.style.width = screenWidth + 'px';
    glass.style.height = screenHeight + 'px';
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = 'scale(' + screenWidth / width + ',' + screenHeight / height + ')';
    const w = device.offsetWidth + 44;
    const h = device.offsetHeight;
    const availableWidth = stage.clientWidth - 24;
    const availableHeight = window.innerHeight - document.querySelector('.toolbar').offsetHeight - 24;
    const scale = size === 'real' ? 1 : Math.max(.15, Math.min(availableWidth / w, availableHeight / h));
    device.style.transform = 'scale(' + scale + ')';
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
    if (!$('screen-off').hidden || !frame.contentDocument) return;
    const content = frame.contentDocument.getElementById('main');
    if (content) content.scrollTop += direction * Math.max(35, Math.round(content.clientHeight * .65));
  }

  function keyboard(event) {
    const result = frame.contentDocument && frame.contentDocument.getElementById('result');
    const arrow = model === 'keys' && result && !result.hidden && (event.key === 'ArrowUp' || event.key === 'ArrowDown');
    if (arrow || event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      event.stopPropagation();
      scroll(event.key === 'PageUp' || event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  function open(value, button) {
    model = value;
    $('landing').hidden = true;
    $('preview').hidden = false;
    $('keypad').hidden = value !== 'keys';
    $('screen-off').hidden = true;
    frame.style.visibility = 'visible';
    $('power').setAttribute('aria-pressed', 'false');
    $('exit').onclick = () => {
      $('preview').hidden = true;
      $('landing').hidden = false;
      model = null;
      button.focus();
    };
    if (!frame.hasAttribute('src')) frame.src = '/app.html';
    resize();
    $('exit').focus();
  }

  document.querySelectorAll('[data-model]').forEach(button => button.onclick = () => open(button.dataset.model, button));
  document.querySelectorAll('[data-size]').forEach(button => button.onclick = () => selectSize(button.dataset.size));
  document.querySelectorAll('[data-scroll]').forEach(button => button.onclick = () => scroll(Number(button.dataset.scroll)));
  $('scale').oninput = () => {
    calibration = Number($('scale').value);
    try { localStorage.setItem('ribit-scale', String(calibration)); } catch (_) {}
    selectSize('real');
  };
  $('power').onclick = () => {
    $('screen-off').hidden = !$('screen-off').hidden;
    frame.style.visibility = $('screen-off').hidden ? 'visible' : 'hidden';
    $('power').setAttribute('aria-pressed', String(!$('screen-off').hidden));
  };
  frame.addEventListener('load', () => {
    if (frame.contentDocument) frame.contentDocument.addEventListener('keydown', keyboard, true);
  });
  document.addEventListener('keydown', event => { if (model) keyboard(event); });
  document.querySelectorAll('[data-key]').forEach(button => button.onclick = () => {
    if (!$('screen-off').hidden) return;
    const key = button.dataset.key;
    const result = frame.contentDocument && frame.contentDocument.getElementById('result');
    if (result && !result.hidden && (key === 'ArrowUp' || key === 'ArrowDown')) {
      scroll(key === 'ArrowUp' ? -1 : 1);
    } else frame.contentWindow.postMessage({ ribitKey: key }, window.location.origin);
  });
  window.addEventListener('resize', resize);
  fetch('/api/view', { method: 'POST' }).then(response => {
    if (response.ok) return response.json();
  }).then(stats => {
    if (!stats) return;
    $('views').textContent = stats.views.toLocaleString('he-IL');
    $('downloads').textContent = stats.downloads.toLocaleString('he-IL');
  }).catch(() => {});
  if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {});
}());
