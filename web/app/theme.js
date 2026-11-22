(function () {
  'use strict';
  var key = 'ribit-dark';
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  var root = document.documentElement;
  var themeColor = document.querySelector('meta[name="theme-color"]');
  var preference;

  function readPreference() {
    try { preference = window.localStorage.getItem(key); } catch (error) { /* Storage unavailable */ }
  }

  function apply() {
    var theme = (preference === '1' || (preference !== '0' && system.matches)) ? 'dark' : 'light';
    if (root.dataset.theme === theme) return;
    root.dataset.theme = theme;
    themeColor.content = theme === 'dark' ? themeColor.dataset.darkColor : themeColor.dataset.lightColor;
    window.dispatchEvent(new Event('ribit:themechange'));
  }

  window.RibitTheme = {
    get dark() { return root.dataset.theme === 'dark'; },
    toggle: function () {
      preference = this.dark ? '0' : '1';
      try { window.localStorage.setItem(key, preference); } catch (error) { /* Keep the session preference */ }
      apply();
    }
  };

  function syncPreference() {
    readPreference();
    apply();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) syncPreference();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) syncPreference();
  });
  if (system.addEventListener) system.addEventListener('change', apply);
  else system.addListener(apply);
  syncPreference();
}());
