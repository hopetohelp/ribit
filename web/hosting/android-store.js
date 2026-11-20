(function () {
  'use strict';
  const drawer = document.getElementById('android-drawer');
  let loading = false;
  const status = document.getElementById('android-release-status');
  const download = document.getElementById('android-download');
  const retry = document.getElementById('android-retry');

  async function loadRelease() {
    if (loading) return;
    loading = true;
    retry.hidden = true;
    download.hidden = true;
    status.textContent = 'בודקים איזו גרסה זמינה…';
    try {
      const response = await fetch('/api/android/latest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Release unavailable');
      const release = await response.json();
      status.textContent = release.minSdk === 23 ? 'נדרש Android 6.0 ומעלה.' :
        'רמת API מינימלית של Android ' + release.minSdk;
      download.href = '/download?version=' + encodeURIComponent(release.versionCode);
      download.hidden = false;
    } catch (_) {
      status.textContent = 'אי אפשר לבדוק את הגרסה כרגע. בדקו את החיבור ונסו שוב.';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  retry.addEventListener('click', loadRelease);
  drawer.addEventListener('toggle', () => { if (drawer.open) loadRelease(); });
  if (drawer.open) loadRelease();
}());
