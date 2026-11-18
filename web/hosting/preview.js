(function () {
  'use strict';

  var toggle = document.getElementById('display');
  var profiles = document.getElementById('profiles');
  var preview = document.getElementById('preview');
  var keypad = document.getElementById('keypad');
  var frame = document.getElementById('app');
  var model = 'smartphone';
  var active = false;

  function render() {
    toggle.setAttribute('aria-expanded', String(active));
    toggle.textContent = active ? 'תצוגה רגילה' : 'הצגה כאפליקציה';
    profiles.hidden = !active;
    preview.className = active ? 'page mode ' + model : 'page';
    keypad.hidden = !active || model !== 'keys';
    Array.prototype.forEach.call(profiles.children, function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-model') === model));
    });
  }

  toggle.addEventListener('click', function () { active = !active; render(); });
  Array.prototype.forEach.call(profiles.children, function (button) {
    button.addEventListener('click', function () { model = button.getAttribute('data-model'); render(); });
  });
  Array.prototype.forEach.call(keypad.querySelectorAll('button'), function (button) {
    button.addEventListener('click', function () {
      frame.contentWindow.postMessage({ ribitKey: button.getAttribute('data-key') }, window.location.origin);
    });
  });
  if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(function () {});
}());
