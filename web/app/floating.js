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

  scope.RibitFloating = { dismissOutside: dismissOutside };
}(window));
