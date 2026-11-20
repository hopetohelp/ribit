const windowsReleaseBase = 'https://github.com/hopetohelp/ribit/releases/download/windows-v';
const legacyWindowsVersion = '0.2.2';
const windowsVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const windowsHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

async function windowsStore(request, url, env) {
  if (!downloadMethods.includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...windowsHeaders, Allow: 'GET, HEAD' } });
  }
  const latest = await env.DOWNLOADS?.get('windows-latest');
  const version = typeof latest === 'string' && windowsVersionPattern.test(latest) ? latest : legacyWindowsVersion;
  const isLegacy = version === legacyWindowsVersion;

  if (url.pathname === '/api/windows/latest') {
    if (request.method === 'HEAD') return new Response(null, { headers: windowsHeaders });
    return Response.json({ versionName: version }, { headers: windowsHeaders });
  }

  if (url.pathname === '/updates/windows/latest.yml') {
    if (isLegacy) return new Response(null, { status: 404, headers: windowsHeaders });
    return new Response(null, {
      status: 302, headers: { ...windowsHeaders, Location: windowsReleaseBase + version + '/latest.yml' }
    });
  }

  const filename = isLegacy ? 'Ribit-Setup.exe' : 'Ribit-Setup-' + version + '.exe';
  return downloadWindowsInstaller(request, env, windowsReleaseBase + version + '/' + filename, filename);
}

async function downloadWindowsInstaller(request, env, source, filename) {
  const upstreamHeaders = new Headers({ 'Accept-Encoding': 'identity' });
  for (const name of ['Range', 'If-Range']) {
    const value = request.headers.get(name);
    if (value !== null) upstreamHeaders.set(name, value);
  }

  let upstream;
  try {
    upstream = await fetch(source, { method: request.method, headers: upstreamHeaders, redirect: 'follow' });
  } catch (_) {
    return new Response(null, { status: 502, headers: windowsHeaders });
  }

  const headers = new Headers(windowsHeaders);
  for (const name of ['Accept-Ranges', 'Content-Range', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  if (![200, 206].includes(upstream.status)) {
    if (upstream.body) await upstream.body.cancel();
    return new Response(null, { status: upstream.status === 416 ? 416 : 502, headers });
  }

  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Content-Disposition', 'attachment; filename="' + filename + '"');
  const size = upstream.headers.get('Content-Length');
  if (size && !upstream.headers.has('Content-Encoding')) headers.set('Content-Length', size);

  if (isDownload(request) && !request.headers.has('Range')) {
    await env.COUNTS.getByName('windows-downloads').total(true).catch(() => {});
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

function windowsUpdateFile(request, pathname) {
  if (!downloadMethods.includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...windowsHeaders, Allow: 'GET, HEAD' } });
  }
  const filename = pathname.slice('/updates/windows/'.length);
  const match = /^Ribit-Setup-([0-9.]+)\.exe(?:\.blockmap)?$/.exec(filename);
  if (!match || !windowsVersionPattern.test(match[1]) || match[1] === legacyWindowsVersion) {
    return new Response(null, { status: 404, headers: windowsHeaders });
  }
  return new Response(null, {
    status: 302, headers: { ...windowsHeaders, Location: windowsReleaseBase + match[1] + '/' + filename }
  });
}
