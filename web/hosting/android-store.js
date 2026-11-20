(function () {
  'use strict';
  const status = document.getElementById('android-release-status');
  const download = document.getElementById('android-download');
  const retry = document.getElementById('android-retry');

  async function loadRelease() {
    retry.hidden = true;
    status.textContent = 'בודקים איזו גרסה זמינה…';
    try {
      const response = await fetch('/api/android/latest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Release unavailable');
      const release = await response.json();
      const version = document.createElement('bdi');
      version.textContent = release.versionName;
      status.textContent = 'גרסה ';
      status.append(version, release.minSdk === 23 ? ' · Android 6.0 ומעלה' : ' · רמת API מינימלית ' + release.minSdk);
      download.href = '/download?version=' + encodeURIComponent(release.versionCode);
      download.hidden = false;
    } catch (_) {
      status.textContent = 'אי אפשר לבדוק את הגרסה כרגע. בדקו את החיבור ונסו שוב.';
      retry.hidden = false;
    }
  }

  retry.addEventListener('click', loadRelease);
  loadRelease();
}());
