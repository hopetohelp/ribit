const androidReleaseKey = 'android-latest.apk';
const legacyAndroidRelease = { versionCode: 9, versionName: '0.2.1', minSdk: 23 };
const androidResponseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

async function androidArtifact(downloads) {
  const release = await downloads.getWithMetadata(androidReleaseKey, { type: 'stream' });
  if (release.value) {
    const data = release.metadata;
    if (data && Number.isInteger(data.versionCode) && data.versionCode > legacyAndroidRelease.versionCode &&
        /^[0-9]+\.[0-9]+\.[0-9]+$/.test(data.versionName) &&
        Number.isInteger(data.minSdk) && data.minSdk > 0 &&
        Number.isInteger(data.size) && data.size > 0 && data.size <= 25 * 1024 * 1024) {
      return { ...release, filename: 'ribit-' + data.versionName + '.apk' };
    }
    await release.value.cancel();
    return null;
  }
  const filename = 'ribit-' + legacyAndroidRelease.versionName + '.apk';
  const legacy = await downloads.getWithMetadata(filename, { type: 'stream' });
  if (!legacy.value) return null;
  return { value: legacy.value, metadata: { ...legacyAndroidRelease, size: legacy.metadata?.size }, filename };
}

async function androidStore(request, url, env) {
  if (!downloadMethods.includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const artifact = env.DOWNLOADS && await androidArtifact(env.DOWNLOADS);
  if (!artifact) return new Response(null, { status: 503, headers: androidResponseHeaders });

  const { value, metadata, filename } = artifact;
  if (url.pathname === '/api/android/latest') {
    await value.cancel();
    if (request.method === 'HEAD') return new Response(null, { headers: androidResponseHeaders });
    const { versionCode, versionName, minSdk } = metadata;
    return Response.json({ versionCode, versionName, minSdk }, { headers: androidResponseHeaders });
  }

  const expectedVersion = url.searchParams.get('version');
  if (expectedVersion !== null && expectedVersion !== String(metadata.versionCode)) {
    await value.cancel();
    return new Response('Release changed. Reopen the Android store.', { status: 409, headers: androidResponseHeaders });
  }

  const headers = new Headers({
    ...androidResponseHeaders,
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="' + filename + '"',
  });
  if (metadata.size) headers.set('Content-Length', String(metadata.size));
  if (request.method === 'HEAD') {
    await value.cancel();
    return new Response(null, { headers });
  }
  if (isDownload(request)) await env.COUNTS.getByName('site-downloads').total(true).catch(() => {});
  return new Response(value, { headers });
}
