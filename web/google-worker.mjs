const googleFlowCookie = '__Host-ribit-google-flow';
const googleLinkCookie = '__Host-ribit-google-link';
const googleFlowSeconds = 10 * 60;
const googleCallbackPath = '/api/account/google/callback';
const googleOrigin = 'https://accounts.google.com';

function base64url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function googleCookie(name, value, age = googleFlowSeconds) {
  return name + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + age;
}

async function signGoogleState(secret, kind, data) {
  const value = base64url(textEncoder.encode(JSON.stringify({ ...data, expires: Date.now() + googleFlowSeconds * 1000 })));
  return value + '.' + await memberKey(secret, kind, value);
}

async function readGoogleState(request, secret, kind, name) {
  const raw = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='));
  const fields = raw?.slice(name.length + 1).match(/^([a-zA-Z0-9_-]{1,2048})\.([a-f0-9]{64})$/);
  if (!fields || !sameSecret(fields[2], await memberKey(secret, kind, fields[1]))) return null;
  try {
    const decoded = atob(fields[1].replace(/-/g, '+').replace(/_/g, '/'));
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, c => c.charCodeAt(0))));
    return value.expires > Date.now() ? value : null;
  } catch { return null; }
}

function googleNext(value) {
  return value === 'chat' ? 'chat' : 'calculator';
}

function googleDestination(value) {
  return value === 'chat' ? '/chat?member=1' : '/app.html?installed=1&account=1';
}

function googleRedirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

class GoogleLinkStore {
  constructor(storage) {
    this.sql = storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS google_links (subject TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE)');
  }

  get(subject) {
    return this.sql.exec('SELECT account FROM google_links WHERE subject = ?', subject).toArray()[0]?.account ?? null;
  }

  link(subject, account) {
    this.sql.exec('INSERT OR IGNORE INTO google_links VALUES (?, ?)', subject, account);
    return this.get(subject) === account;
  }
}

async function lookupGoogleUser(url, env, flow, code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code, code_verifier: flow.verifier, client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + googleCallbackPath,
      grant_type: 'authorization_code'
    })
  });
  if (!response.ok) return null;
  const token = (await response.json()).access_token;
  if (!token) return null;
  const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!profile.ok) return null;
  const user = await profile.json();
  return user.email_verified === true && typeof user.email === 'string' &&
    typeof user.sub === 'string' && user.sub.length > 0 && user.sub.length <= 255 ? user : null;
}

async function googleApi(request, url, env) {
  const action = url.pathname.split('/').pop();
  const enabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.RIBIT_ACCOUNT_KEY);
  if (action === 'status' && request.method === 'GET') {
    const pending = enabled ? await readGoogleState(request, env.RIBIT_ACCOUNT_KEY, 'google-link', googleLinkCookie) : null;
    return memberResponse({ enabled, pendingEmail: pending?.email ?? null });
  }
  if (!enabled) return memberResponse({}, 503);
  const key = env.RIBIT_ACCOUNT_KEY;
  if (action === 'start' && request.method === 'GET') {
    const flow = { state: randomHex(32), verifier: randomHex(32), next: googleNext(url.searchParams.get('next')), register: url.searchParams.get('mode') === 'register' };
    const challenge = base64url(await crypto.subtle.digest('SHA-256', textEncoder.encode(flow.verifier)));
    const redirect = new URL('/o/oauth2/v2/auth', googleOrigin);
    redirect.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + googleCallbackPath,
      response_type: 'code', scope: 'openid email', state: flow.state,
      code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
    });
    return googleRedirect(redirect.href, [googleCookie(googleFlowCookie, await signGoogleState(key, 'google-flow', flow)),
      googleCookie(googleLinkCookie, '', 0)]);
  }
  const links = env.COUNTS.getByName('member-google-links');
  if (action === 'callback' && request.method === 'GET') {
    const cleared = googleCookie(googleFlowCookie, '', 0);
    const fail = () => googleRedirect('/account?google=error', [cleared]);
    const flow = await readGoogleState(request, key, 'google-flow', googleFlowCookie);
    const code = url.searchParams.get('code');
    if (!flow || !code || code.length > 2048 || !sameSecret(url.searchParams.get('state') || '', flow.state)) return fail();
    let profile;
    try { profile = await lookupGoogleUser(url, env, flow, code); } catch { return fail(); }
    if (!profile) return fail();
    const subject = await memberKey(key, 'google-subject', profile.sub);
    const linked = await links.googleOperation('get', subject);
    if (linked) {
      const token = await env.COUNTS.getByName('member:' + linked).memberOperation('newSession');
      if (!token) return fail();
      return googleRedirect('/account?next=' + googleNext(flow.next) + '&google=done', [cleared, memberCookieValue(linked + '.' + token)]);
    }
    const email = profile.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email)) return fail();
    const account = await memberKey(key, 'email', email);
    const member = env.COUNTS.getByName('member:' + account);
    const state = await member.memberOperation('googleSignup', email, subject, flow.register === true);
    if (state === 'missing') return googleRedirect('/account?google=missing&mode=register&next=' + googleNext(flow.next), [cleared]);
    if (state === 'conflict') return fail();
    if (state === 'google') {
      if (!(await links.googleOperation('link', subject, account))) return fail();
      const token = await member.memberOperation('newSession');
      if (!token) return fail();
      return googleRedirect('/account?next=' + googleNext(flow.next) + '&google=done', [cleared, memberCookieValue(account + '.' + token)]);
    }
    const ticket = await signGoogleState(key, 'google-link', { subject, email, next: flow.next });
    return googleRedirect('/account?google=link&next=' + googleNext(flow.next), [cleared, googleCookie(googleLinkCookie, ticket)]);
  }
  if (action === 'link' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return memberResponse({}, 403);
    const pending = await readGoogleState(request, key, 'google-link', googleLinkCookie);
    if (!pending) return memberResponse({}, 401);
    const account = await memberKey(key, 'email', pending.email);
    const limit = await env.COUNTS.getByName('member-auth:' + account).chatOperation('permit', 'auth', 15 * 60 * 1000, 15);
    if (!limit) return memberResponse({}, 429);
    let body;
    try { body = await readChatBody(request); } catch { return memberResponse({}, 400); }
    if (typeof body?.password !== 'string' || body.password.length < 10 || body.password.length > 128) return memberResponse({}, 400);
    const member = env.COUNTS.getByName('member:' + account);
    const secret = await memberKey(key, 'password', body.password);
    const result = await member.memberOperation('authenticate', '', pending.email, secret, false);
    if (result.status !== 200) return memberResponse({}, result.status);
    if (!(await links.googleOperation('link', pending.subject, account))) return memberResponse({}, 409);
    const response = memberResponse({ target: googleDestination(pending.next) }, 200, account + '.' + result.token);
    response.headers.append('Set-Cookie', googleCookie(googleLinkCookie, '', 0));
    return response;
  }
  return memberResponse({}, 404);
}
