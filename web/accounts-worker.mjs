const memberCookie = '__Host-ribit-member';
const memberSessionSeconds = 30 * 24 * 60 * 60;
const recordLimit = 1000;
const recordBodyLimit = 8 * 1024 * 1024 + 1024;
const importRetryWindow = 24 * 60 * 60 * 1000;

async function memberKey(secret, kind, value) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(kind + ':' + value)));
}

function memberResponse(value, status = 200, session) {
  const headers = { 'Cache-Control': 'no-store' };
  if (session !== undefined) headers['Set-Cookie'] = memberCookieValue(session);
  return Response.json(value, { status, headers });
}

function memberCookieValue(session) {
  return memberCookie + '=' + session + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' +
    (session ? memberSessionSeconds : 0);
}

class MemberStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS member (slot INTEGER PRIMARY KEY CHECK(slot = 1), name TEXT NOT NULL, email TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_records (id TEXT PRIMARY KEY, title TEXT NOT NULL, updatedAt INTEGER NOT NULL, planCount INTEGER NOT NULL, calculation TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_imports (id TEXT PRIMARY KEY, importedAt INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_recent (id TEXT PRIMARY KEY REFERENCES member_records(id) ON DELETE CASCADE, openedAt INTEGER NOT NULL)');
  }

  async authenticate(name, email, secret, register) {
    const existing = this.sql.exec('SELECT * FROM member WHERE slot = 1').toArray()[0];
    const salt = existing?.salt ?? randomHex(16);
    const hash = await passwordHash(secret, salt);
    if (register) {
      const saved = this.sql.exec('INSERT OR IGNORE INTO member VALUES (1, ?, ?, ?, ?)', name, email, salt, hash);
      if (!saved.rowsWritten) return { status: 409 };
    } else if (!existing || !sameSecret(existing.password, hash)) return { status: 401 };
    return { status: 200, token: await this.newSession() };
  }

  async changePassword(token, currentSecret, newSecret) {
    if (!(await this.session(token))) return 401;
    const existing = this.sql.exec('SELECT salt, password FROM member WHERE slot = 1').one();
    if (!existing.password) return 409;
    if (!sameSecret(existing.password, await passwordHash(currentSecret, existing.salt))) return 403;
    const salt = randomHex(16);
    const updated = await passwordHash(newSecret, salt);
    const sessionHash = await digest(token);
    return this.storage.transactionSync(() => {
      if (!this.sql.exec('SELECT 1 FROM member_sessions WHERE token = ? AND expires > ?', sessionHash, Date.now()).toArray().length) return 401;
      const result = this.sql.exec('UPDATE member SET salt = ?, password = ? WHERE slot = 1 AND salt = ?', salt, updated, existing.salt);
      return result.rowsWritten ? 200 : 403;
    });
  }

  googleSignup(email, subject, register) {
    return this.storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS member_google_signup (slot INTEGER PRIMARY KEY CHECK(slot = 1), subject TEXT NOT NULL)');
      const existing = this.sql.exec('SELECT slot FROM member WHERE slot = 1').toArray()[0];
      if (existing) {
        const signup = this.sql.exec('SELECT subject FROM member_google_signup WHERE slot = 1').toArray()[0];
        return !signup ? 'password' : signup.subject === subject ? 'google' : 'conflict';
      }
      if (!register) return 'missing';
      this.sql.exec('INSERT INTO member VALUES (1, ?, ?, ?, ?)', email.split('@')[0].normalize('NFC').slice(0, 60), email, randomHex(16), '');
      this.sql.exec('INSERT INTO member_google_signup VALUES (1, ?)', subject);
      return 'google';
    });
  }

  async newSession() {
    if (!this.sql.exec('SELECT slot FROM member WHERE slot = 1').toArray().length) return null;
    const token = randomHex(32);
    const tokenHash = await digest(token);
    this.sql.exec('DELETE FROM member_sessions WHERE expires <= ?', Date.now());
    this.sql.exec('INSERT INTO member_sessions VALUES (?, ?)', tokenHash, Date.now() + memberSessionSeconds * 1000);
    return token;
  }

  async session(token, revoke = false) {
    const hash = await digest(token);
    const session = this.sql.exec('SELECT token FROM member_sessions WHERE token = ? AND expires > ?', hash, Date.now()).toArray()[0];
    if (!session) return null;
    if (revoke) this.sql.exec('DELETE FROM member_sessions WHERE token = ?', hash);
    return this.sql.exec("SELECT name, email, password <> '' AS hasPassword FROM member WHERE slot = 1").toArray()[0] ?? null;
  }

  async records(token, action, data) {
    if (!(await this.session(token))) return { status: 401 };
    if (action === 'list') {
      return { status: 200, value: this.sql.exec('SELECT id, title, updatedAt, planCount FROM member_records ORDER BY updatedAt DESC, id').toArray() };
    }
    if (action === 'recent') {
      const value = this.sql.exec('SELECT r.id, r.title FROM member_recent o JOIN member_records r ON r.id = o.id ORDER BY o.openedAt DESC, o.id LIMIT 3').toArray();
      return { status: 200, value };
    }
    if (action === 'load' || action === 'open') {
      const row = this.sql.exec('SELECT * FROM member_records WHERE id = ?', data.id).toArray()[0];
      if (row && action === 'open') {
        this.sql.exec('INSERT INTO member_recent VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET openedAt = excluded.openedAt', data.id, Date.now());
      }
      return row ? { status: 200, value: { ...row, calculation: JSON.parse(row.calculation) } } : { status: 404 };
    }
    if (action === 'rename') {
      const changed = this.sql.exec('UPDATE member_records SET title = ?, updatedAt = ? WHERE id = ?', data.title, Date.now(), data.id);
      return { status: changed.rowsWritten ? 200 : 404, value: null };
    }
    if (action === 'remove') {
      this.sql.exec('DELETE FROM member_records WHERE id = ?', data.id);
      return { status: 200, value: null };
    }
    return this.storage.transactionSync(() => {
      if (action === 'save' && data.id) {
        const saved = this.sql.exec('UPDATE member_records SET title = ?, updatedAt = ?, planCount = ?, calculation = ? WHERE id = ?',
          data.title, Date.now(), data.planCount, data.calculation, data.id);
        return saved.rowsWritten ? { status: 200, value: data.id } : { status: 404 };
      }
      if (action === 'import' && data.requestId) {
        this.sql.exec('DELETE FROM member_imports WHERE importedAt < ?', Date.now() - importRetryWindow);
        if (this.sql.exec('SELECT 1 FROM member_imports WHERE id = ?', data.requestId).toArray().length) {
          return { status: 200, value: null };
        }
      }
      const rows = action === 'import' ? data.entries : [data];
      const count = this.sql.exec('SELECT count(*) AS count FROM member_records').one().count;
      if (count + rows.length > recordLimit) return { status: 409 };
      const ids = rows.map(row => {
        const id = crypto.randomUUID();
        this.sql.exec('INSERT INTO member_records VALUES (?, ?, ?, ?, ?)', id, row.title, row.updatedAt, row.planCount, row.calculation);
        return id;
      });
      if (action === 'import' && data.requestId) {
        this.sql.exec('INSERT INTO member_imports VALUES (?, ?)', data.requestId, Date.now());
      }
      return { status: 200, value: action === 'save' ? ids[0] : null };
    });
  }
}

function readMemberToken(request) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(memberCookie + '='));
  const fields = cookie?.slice(memberCookie.length + 1).match(/^([0-9a-f]{64})\.([0-9a-f]{64})$/);
  return fields ? { account: fields[1], token: fields[2] } : null;
}

async function getMember(request, env) {
  const session = readMemberToken(request);
  if (!session) return null;
  const user = await env.COUNTS.getByName('member:' + session.account).memberOperation('session', session.token);
  return user ? { ...user, account: session.account } : null;
}

function sanitizeRecord(data, imported) {
  const title = typeof data?.title === 'string' ? data.title.trim() : '';
  const calculation = data?.calculation;
  if (!title || title.length > 80 || !Array.isArray(calculation?.plans) ||
      calculation.plans.length < 1 || calculation.plans.length > 2 ||
      !['ILS', 'USD', 'EUR', 'GBP'].includes(calculation.currency) ||
      calculation.plans.some(plan => !Number.isInteger(plan?.months) || plan.months < 1 || plan.months > 1200)) {
    throw new Error('Invalid calculation');
  }
  const encoded = JSON.stringify(calculation);
  if (encoded.length > 8192) throw new Error('Invalid calculation');
  const updatedAt = imported && Number.isSafeInteger(data.updatedAt) && data.updatedAt > 0 &&
    data.updatedAt <= Date.now() ? data.updatedAt : Date.now();
  return { title, updatedAt, planCount: calculation.plans.length, calculation: encoded, id: data.id ?? null };
}

async function accountsApi(request, url, env) {
  if (!env.RIBIT_ACCOUNT_KEY) return memberResponse({}, 503);
  const action = url.pathname.split('/').pop();
  if (action === 'session') {
    if (request.method !== 'GET') return memberResponse({}, 405);
    const user = await getMember(request, env);
    if (!user) return memberResponse({}, 401);
    let googleLinked = null;
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      try {
        googleLinked = await env.COUNTS.getByName('member-google-links').googleOperation('hasAccount', user.account);
      } catch { /* Keep password login available if the Google link store is unavailable. */ }
    }
    return memberResponse({ name: user.name, email: user.email, googleLinked, hasPassword: Boolean(user.hasPassword) });
  }
  if (!['register', 'login', 'logout', 'password', 'records'].includes(action)) return memberResponse({}, 404);
  if (request.method !== 'POST') return memberResponse({}, 405);
  if (request.headers.get('Origin') !== url.origin) return memberResponse({}, 403);

  if (action === 'register' || action === 'login') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucket = (await memberKey(env.RIBIT_ACCOUNT_KEY, 'rate', ip)).slice(0, 6);
    const allowed = await env.COUNTS.getByName('member-rate:' + bucket).chatOperation('permit', action, 15 * 60 * 1000, 10);
    if (!allowed) return memberResponse({}, 429);
    let body;
    try { body = await readChatBody(request); } catch { return memberResponse({}, 400); }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body?.password;
    if (email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email) ||
        typeof password !== 'string' || password.length < 10 || password.length > 128) return memberResponse({}, 400);
    const name = email.split('@')[0].normalize('NFC').slice(0, 60);
    const account = await memberKey(env.RIBIT_ACCOUNT_KEY, 'email', email);
    const attempt = await env.COUNTS.getByName('member-auth:' + account).chatOperation('permit', 'auth', 15 * 60 * 1000, 15);
    if (!attempt) return memberResponse({}, 429);
    const secret = await memberKey(env.RIBIT_ACCOUNT_KEY, 'password', password);
    const result = await env.COUNTS.getByName('member:' + account).memberOperation('authenticate', name, email, secret, action === 'register');
    return result.status === 200 ? memberResponse({ ok: true }, 200, account + '.' + result.token) : memberResponse({}, result.status);
  }

  const session = readMemberToken(request);
  if (!session) return memberResponse({}, 401, action === 'logout' ? '' : undefined);
  const member = env.COUNTS.getByName('member:' + session.account);
  if (action === 'logout') {
    await member.memberOperation('session', session.token, true);
    return memberResponse({}, 200, '');
  }

  if (action === 'password') {
    let body;
    try { body = await readChatBody(request); } catch { return memberResponse({}, 400); }
    const { currentPassword, newPassword } = body ?? {};
    if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128 ||
        typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128 ||
        newPassword === currentPassword) return memberResponse({}, 400);
    if (!(await member.memberOperation('session', session.token))) return memberResponse({}, 401);
    const allowed = await env.COUNTS.getByName('member-auth:' + session.account)
      .chatOperation('permit', 'auth', 15 * 60 * 1000, 15);
    if (!allowed) return memberResponse({}, 429);
    const [currentSecret, newSecret] = await Promise.all([currentPassword, newPassword].map(
      password => memberKey(env.RIBIT_ACCOUNT_KEY, 'password', password)));
    const status = await member.memberOperation('changePassword', session.token, currentSecret, newSecret);
    return memberResponse({}, status);
  }

  let body, values;
  try {
    body = await readChatBody(request, recordBodyLimit);
    const method = body?.method;
    if (!['list', 'recent', 'load', 'open', 'save', 'rename', 'remove', 'import'].includes(method)) throw new Error('Invalid operation');
    const id = body.data?.id;
    if ((['load', 'open', 'rename', 'remove'].includes(method) || id != null) &&
        (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) throw new Error('Invalid ID');
    if (method === 'save') values = sanitizeRecord(body.data, false);
    else if (method === 'rename') {
      const title = typeof body.data?.title === 'string' ? body.data.title.trim() : '';
      if (!title || title.length > 80) throw new Error('Invalid title');
      values = { id, title };
    } else if (method === 'import') {
      const entries = body.data?.entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > recordLimit) throw new Error('Invalid import');
      const requestId = body.data?.requestId;
      if (requestId != null && (typeof requestId !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))) throw new Error('Invalid request ID');
      values = { requestId, entries: entries.map(entry => sanitizeRecord(entry, true)) };
    } else values = { id };
  } catch { return memberResponse({}, 400); }
  const result = await member.memberOperation('records', session.token, body.method, values);
  return memberResponse({ result: result.value }, result.status);
}
