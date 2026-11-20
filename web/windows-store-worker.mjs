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
  if (isDownload(request)) await env.COUNTS.getByName('windows-downloads').total(true).catch(() => {});
  return new Response(null, {
    status: 302, headers: { ...windowsHeaders, Location: windowsReleaseBase + version + '/' + filename }
  });
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
