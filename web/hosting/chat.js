(function () {
  'use strict';
  const admin = location.pathname === '/admin-chat';
  const $ = id => document.getElementById(id);
  const prefix = '/api/chat/' + (admin ? 'admin/' : '');
  let setup = admin ? new URLSearchParams(location.hash.slice(1)).get('setup') : null;
  if (setup) history.replaceState(null, '', location.pathname);
  let thread = '';
  let token = '';
  let visitorName = '';
  let ready = false;
  let lastMessage = '';
  let lastInbox = '';
  let visit = 0;

  function useConversation(name, privateToken, messages) {
    visitorName = name;
    token = privateToken;
    try { localStorage.setItem('ribit-named-chat', JSON.stringify({ name, token })); } catch (_) {}
    ready = true;
    $('visitor-login').hidden = true;
    $('chat').hidden = false;
    $('return-code').hidden = false;
    $('private-code').value = token;
    $('intro').textContent = 'שיחה עם מנהל האתר · ' + visitorName;
    if (messages) paintMessages(messages);
    else refresh();
  }

  function showVisitorLogin() {
    ready = false;
    visit++;
    lastMessage = '';
    $('messages').textContent = '';
    $('message').value = '';
    $('chat').hidden = true;
    $('visitor-login').hidden = false;
    $('return-code').open = false;
    $('visitor-name').focus();
  }

  function visitorStart() {
    $('resume').addEventListener('toggle', function () {
      $('resume-code').required = this.open;
      $('visitor-button').textContent = this.open ? 'חזרה לשיחה' : 'פתיחת שיחה';
    });
    $('visitor-login').addEventListener('submit', async function (event) {
      event.preventDefault();
      const name = $('visitor-name').value.trim().normalize('NFC');
      if (!name) return report({ status: 400 });
      if (!$('resume').open) {
        const privateToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
        useConversation(name, privateToken);
        $('message').focus();
        return;
      }
      token = $('resume-code').value.trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(token)) return report({ status: 404 });
      const button = $('visitor-button');
      button.disabled = true;
      try {
        const result = await api('resume', { name });
        useConversation(result.name, token, result.messages);
        $('status').textContent = '';
        $('message').focus();
      } catch (error) { report(error); }
      finally { button.disabled = false; }
    });
    $('switch-conversation').addEventListener('click', function () {
      if (!window.confirm('כדי לחזור לשיחה הנוכחית צריך לשמור את קוד החזרה. לעבור לשיחה אחרת?')) return;
      try { localStorage.removeItem('ribit-named-chat'); } catch (_) {}
      token = '';
      visitorName = '';
      showVisitorLogin();
    });
    let saved;
    try { saved = JSON.parse(localStorage.getItem('ribit-named-chat') || 'null'); } catch (_) {}
    if (typeof saved?.name === 'string' && /^[a-f0-9]{64}$/.test(saved.token)) {
      useConversation(saved.name, saved.token);
      return;
    }
    showVisitorLogin();
  }

  async function api(action, payload) {
    const headers = {};
    if (token) headers['X-Ribit-Chat'] = token;
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(prefix + action, {
      method: payload === undefined ? 'GET' : 'POST', headers,
      body: payload === undefined ? undefined : JSON.stringify(payload), cache: 'no-store'
    });
    if (!response.ok) {
      const error = new Error('Chat request failed');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function paintMessages(messages) {
    const signature = messages.length ? String(messages[messages.length - 1].id) : '';
    if (Number(signature) <= Number(lastMessage)) return;
    lastMessage = signature;
    const view = $('messages');
    view.textContent = '';
    for (const message of messages) {
      const bubble = document.createElement('div');
      bubble.className = 'message' + (message.sender === 'admin' ? ' admin' : '');
      const name = document.createElement('strong');
      name.textContent = message.sender === 'admin' ? 'מנהל האתר' : admin ? 'מבקר' : 'אתם';
      const body = document.createElement('div');
      body.dir = 'auto';
      body.textContent = message.body;
      const time = document.createElement('time');
      time.textContent = new Date(message.created).toLocaleString('he-IL');
      bubble.append(name, body, time);
      view.appendChild(bubble);
    }
    view.scrollTop = view.scrollHeight;
  }

  function paintInbox(threads) {
    const signature = JSON.stringify(threads) + thread;
    if (signature === lastInbox) return;
    lastInbox = signature;
    const list = $('threads');
    list.textContent = '';
    if (!threads.length) list.textContent = 'אין עדיין שיחות';
    threads.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = (item.waiting ? 'ממתינה · ' : '') + (item.name || item.id.slice(0, 6));
      button.setAttribute('aria-pressed', String(item.id === thread));
      button.addEventListener('click', () => {
        thread = item.id;
        visit++;
        lastMessage = '';
        $('messages').textContent = '';
        $('message').value = '';
        $('send').hidden = false;
        $('intro').hidden = true;
        paintInbox(threads);
        refresh();
        $('message').focus();
      });
      list.appendChild(button);
    });
  }

  function showLogin() {
    ready = false;
    visit++;
    thread = '';
    lastMessage = '';
    lastInbox = '';
    $('messages').textContent = '';
    $('threads').textContent = '';
    $('status').textContent = '';
    $('chat').hidden = true;
    $('logout').hidden = true;
    $('login').hidden = false;
    $('login-button').textContent = setup ? 'הגדרת סיסמה' : 'כניסה';
    $('password').autocomplete = setup ? 'new-password' : 'current-password';
  }

  function report(error) {
    if (admin && error.status === 401 && ready) return showLogin();
    $('status').textContent = ({
      400: 'בדקו שהטקסט תקין.',
      401: 'הסיסמה או קוד ההגדרה אינם תקינים.',
      403: 'קוד ההגדרה אינו תקין.',
      404: 'לא נמצאה שיחה עם השם והקוד האלה.',
      429: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד רגע.'
    })[error.status] || 'אין חיבור לצ׳אט כרגע. נסו שוב כשיש אינטרנט.';
  }

  async function refresh() {
    if (!ready || document.hidden) return;
    const current = visit;
    try {
      if (admin) {
        const inbox = await api('inbox');
        if (current !== visit) return;
        paintInbox(inbox.threads);
        if (!thread) return;
      }
      const response = await api('messages' + (admin ? '?thread=' + thread : ''));
      if (current === visit) {
        paintMessages(response.messages);
        $('status').textContent = '';
      }
    } catch (error) { if (current === visit) report(error); }
  }

  function showInbox(threads) {
    ready = true;
    $('chat').hidden = false;
    $('inbox').hidden = false;
    $('logout').hidden = false;
    $('login').hidden = true;
    $('send').hidden = true;
    $('intro').hidden = false;
    $('intro').textContent = 'בחרו שיחה כדי לקרוא ולענות.';
    paintInbox(threads);
  }

  $('send').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('message');
    const message = input.value.trim();
    if (!message || $('send-button').disabled) return;
    $('send-button').disabled = true;
    const current = visit;
    try {
      const reply = await api('messages', { message, thread, name: visitorName });
      if (current === visit) {
        input.value = '';
        paintMessages(reply.messages);
        $('status').textContent = '';
        input.focus();
      }
    } catch (error) { if (current === visit) report(error); }
    finally { $('send-button').disabled = false; }
  });

  if (admin) {
    $('title').textContent = 'ניהול הצ׳אט';
    $('chat').hidden = true;
    api('inbox').then(data => showInbox(data.threads)).catch(() => showLogin());
    $('login').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('login-button');
      button.disabled = true;
      try {
        await api(setup ? 'setup' : 'login', { password: $('password').value, code: setup });
        setup = null;
        $('password').value = '';
        $('status').textContent = '';
        showInbox((await api('inbox')).threads);
      } catch (error) { report(error); }
      finally { button.disabled = false; }
    });
    $('logout').addEventListener('click', async () => {
      try { await api('logout', {}); showLogin(); }
      catch (error) { report(error); }
    });
  } else visitorStart();

  async function poll() {
    await refresh();
    setTimeout(poll, 7000);
  }
  setTimeout(poll, 7000);
  $('copy-code').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(token);
      $('status').textContent = 'הקוד הועתק';
    } catch (_) {
      $('private-code').focus();
      $('private-code').select();
    }
  });
  window.addEventListener('online', refresh);
}());
