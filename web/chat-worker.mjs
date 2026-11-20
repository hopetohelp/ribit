const chatCookie = '__Host-ribit-chat-admin';
const chatSessionSeconds = 12 * 60 * 60;
const textEncoder = new TextEncoder();
const randomHex = count => hex(crypto.getRandomValues(new Uint8Array(count)));

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

function sameSecret(first, second) {
  if (first.length !== second.length) return false;
  let diff = 0;
  for (let index = 0; index < first.length; index++) diff |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return diff === 0;
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: textEncoder.encode(salt), iterations: 100000
  }, key, 256));
}

function chatResponse(data, status = 200, cookie) {
  const headers = { 'Cache-Control': 'no-store' };
  if (cookie !== undefined) {
    headers['Set-Cookie'] = chatCookie + '=' + cookie + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' +
      (cookie ? chatSessionSeconds : 0);
  }
  return Response.json(data, { status, headers });
}

async function readChatBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new Error('Invalid body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 12288) {
      await reader.cancel();
      throw new Error('Body too large');
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

class ChatStore {
  constructor(storage) {
    this.sql = storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_threads (id TEXT PRIMARY KEY, updated INTEGER NOT NULL, waiting INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_names (thread TEXT PRIMARY KEY, name TEXT NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS chat_threads_updated ON chat_threads(updated DESC)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, thread TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(thread, id)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_admin (id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL, password TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chat_limits (key TEXT PRIMARY KEY, period INTEGER NOT NULL, attempts INTEGER NOT NULL)");
  }

  permit(key, period, limit) {
    const now = Math.floor(Date.now() / period);
    return this.sql.exec(
      'INSERT INTO chat_limits VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN period = excluded.period THEN attempts + 1 ELSE 1 END, period = excluded.period RETURNING attempts',
      key, now
    ).one().attempts <= limit;
  }

  async authenticate(password, setup) {
    const admin = this.sql.exec('SELECT salt, password FROM chat_admin WHERE id = 1').toArray()[0];
    if (setup && admin) return null;
    if (!setup && !admin) return null;
    const salt = admin?.salt ?? randomHex(16);
    const hash = await passwordHash(password, salt);
    if (setup) {
      if (!this.sql.exec('INSERT OR IGNORE INTO chat_admin VALUES (1, ?, ?)', salt, hash).rowsWritten) return null;
    } else if (!sameSecret(hash, admin.password)) return null;
    const token = randomHex(32);
    const tokenHash = await digest(token);
    this.sql.exec('DELETE FROM chat_sessions WHERE expires <= ?', Date.now());
    this.sql.exec('INSERT INTO chat_sessions VALUES (?, ?)', tokenHash, Date.now() + chatSessionSeconds * 1000);
    return token;
  }

  async adminSession(token, revoke) {
    const hash = await digest(token);
    if (!this.sql.exec('SELECT token FROM chat_sessions WHERE token = ? AND expires > ?', hash, Date.now()).toArray().length) return false;
    if (revoke) this.sql.exec('DELETE FROM chat_sessions WHERE token = ?', hash);
    return true;
  }

  inbox() {
    return this.sql.exec('SELECT chat_threads.id, updated, waiting, chat_names.name FROM chat_threads LEFT JOIN chat_names ON chat_names.thread = chat_threads.id ORDER BY waiting DESC, updated DESC LIMIT 100').toArray();
  }

  messages(thread) {
    return this.sql.exec('SELECT * FROM (SELECT id, sender, body, created FROM chat_messages WHERE thread = ? ORDER BY id DESC LIMIT 200) ORDER BY id', thread).toArray();
  }

  visitorName(thread) {
    return this.sql.exec('SELECT name FROM chat_names WHERE thread = ?', thread).toArray()[0]?.name ?? null;
  }

  send(thread, sender, message, name, storage) {
    return storage.transactionSync(() => {
      if (sender === 'admin' && !this.sql.exec('SELECT id FROM chat_threads WHERE id = ?', thread).toArray().length) return null;
      if (sender === 'visitor') {
        const prior = this.visitorName(thread);
        if (prior && prior.toLowerCase() !== name.toLowerCase()) return null;
        this.sql.exec('INSERT OR IGNORE INTO chat_names VALUES (?, ?)', thread, name);
      }
      const now = Date.now();
      this.sql.exec('INSERT INTO chat_threads VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated = excluded.updated, waiting = excluded.waiting', thread, now, sender === 'visitor' ? 1 : 0);
      this.sql.exec('INSERT INTO chat_messages (thread, sender, body, created) VALUES (?, ?, ?, ?)', thread, sender, message, now);
      return this.messages(thread);
    });
  }
}

async function chatApi(request, url, env) {
  const admin = url.pathname.startsWith('/api/chat/admin/');
  const action = url.pathname.split('/').pop();
  const isPost = request.method === 'POST';
  if (!['GET', 'POST'].includes(request.method)) return chatResponse({}, 405);
  if (isPost && request.headers.get('Origin') !== url.origin) return chatResponse({}, 403);
  const store = env.COUNTS.getByName('site-chat');
  let body;
  if (isPost) {
    try { body = await readChatBody(request); } catch { return chatResponse({}, 400); }
  }

  if (admin && isPost && ['login', 'setup'].includes(action)) {
    if (typeof body?.password !== 'string' || body.password.length < 12 || body.password.length > 128) return chatResponse({}, 400);
    const bucket = (await digest(request.headers.get('CF-Connecting-IP') || 'unknown')).slice(0, 5);
    if (!(await store.chatOperation('permit', 'auth:' + bucket, 15 * 60 * 1000, 8))) return chatResponse({}, 429);
    const setup = action === 'setup';
    if (setup && (typeof body.code !== 'string' || body.code.length !== 48 || !env.CHAT_SETUP_HASH ||
                  !sameSecret(await digest(body.code), env.CHAT_SETUP_HASH))) return chatResponse({}, 403);
    const token = await store.chatOperation('authenticate', body.password, setup);
    return token ? chatResponse({ ok: true }, 200, token) : chatResponse({}, 401);
  }

  if (admin) {
    const cookie = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(chatCookie + '='));
    const token = cookie?.slice(chatCookie.length + 1) || '';
    if (!/^[0-9a-f]{64}$/.test(token) ||
        !(await store.chatOperation('adminSession', token, isPost && action === 'logout'))) return chatResponse({}, 401);
    if (action === 'logout' && isPost) return chatResponse({ ok: true }, 200, '');
    if (action === 'inbox' && !isPost) return chatResponse({ threads: await store.chatOperation('inbox') });
  }
  if (action !== 'messages' && (admin || !isPost || action !== 'resume')) return chatResponse({}, 404);
  const token = admin ? (isPost ? body?.thread : url.searchParams.get('thread')) : request.headers.get('X-Ribit-Chat');
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return chatResponse({}, 400);
  const thread = admin ? token : await digest(token);
  if (!isPost) return chatResponse({ messages: await store.chatOperation('messages', thread) });

  const name = typeof body?.name === 'string' ? body.name.trim().normalize('NFC') : '';
  if (!admin && (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name))) return chatResponse({}, 400);
  if (action === 'resume') {
    const stored = await store.chatOperation('visitorName', thread);
    return stored && stored.toLowerCase() === name.toLowerCase()
      ? chatResponse({ name: stored, messages: await store.chatOperation('messages', thread) })
      : chatResponse({}, 404);
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 2000) return chatResponse({}, 400);
  const rateKey = admin ? 'admin:send' : 'send:' + (await digest(request.headers.get('CF-Connecting-IP') || token)).slice(0, 5);
  if (!(await store.chatOperation('permit', rateKey, 60 * 1000, admin ? 40 : 8))) return chatResponse({}, 429);
  const messages = await store.chatOperation('send', thread, admin ? 'admin' : 'visitor', message, name);
  return messages ? chatResponse({ messages }) : chatResponse({}, 404);
}
