(function () {
  'use strict';
  const admin = location.pathname === '/admin-chat';
  const $ = id => document.getElementById(id);
  const memberMode = !admin && new URLSearchParams(location.search).get('member') === '1';
  const guestMode = !admin && !memberMode;
  const guestDraftPrefix = 'ribit-guest-draft:';
  const prefix = '/api/chat/' + (admin ? 'admin/' : '');
  let setup = admin ? new URLSearchParams(location.hash.slice(1)).get('setup') : null;
  if (setup) history.replaceState(null, '', location.pathname);
  let thread = '';
  let ready = false;
  let lastMessage = '';
  let lastInbox = '';
  let visit = 0;

  function readGuestDrafts() {
    return Object.keys(localStorage).filter(key => key.startsWith(guestDraftPrefix))
      .map(key => JSON.parse(localStorage.getItem(key)))
      .filter(Boolean).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  }

  function loadGuestDrafts() {
    try {
      paintMessages(readGuestDrafts());
      $('status').textContent = '';
    } catch (_) {
      $('status').textContent = 'לא ניתן לפתוח את הטיוטות בדפדפן הזה.';
    }
  }

  function saveGuestDraft(message) {
    try {
      const id = crypto.randomUUID();
      const draft = { id, body: message, created: Date.now() };
      localStorage.setItem(guestDraftPrefix + id, JSON.stringify(draft));
      paintMessages(readGuestDrafts());
      $('status').textContent = 'הטיוטה נשמרה בדפדפן הזה.';
      $('message').value = '';
      $('message').focus();
    } catch (_) {
      $('status').textContent = 'שמירת הטיוטה בדפדפן נכשלה.';
    }
  }

  async function api(action, payload) {
    const headers = {};
    if (memberMode) headers['X-Ribit-Chat-Member'] = '1';
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
    const signature = guestMode ? messages.map(message => message.id).join(',') :
      messages.length ? String(messages[messages.length - 1].id) : '';
    if (guestMode ? signature === lastMessage : Number(signature) <= Number(lastMessage)) return;
    lastMessage = signature;
    const view = $('messages');
    view.textContent = '';
    for (const message of messages) {
      const bubble = document.createElement('div');
      bubble.className = 'message' + (message.sender === 'admin' ? ' admin' : '');
      const name = document.createElement('strong');
      name.textContent = guestMode ? 'טיוטה' : message.sender === 'admin' ? 'מנהל האתר' : admin ? 'מבקר' : 'אתם';
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
    if (memberMode && error.status === 401) return location.replace('/account?next=chat');
    $('status').textContent = ({
      400: 'בדקו שהטקסט תקין.',
      401: 'הסיסמה או קוד ההגדרה אינם תקינים.',
      403: 'קוד ההגדרה אינו תקין.',
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
    if (guestMode) return saveGuestDraft(message);
    $('send-button').disabled = true;
    const current = visit;
    try {
      const reply = await api('messages', { message, thread });
      if (current === visit) {
        input.value = '';
        paintMessages(reply.messages);
        $('status').textContent = '';
        input.focus();
      }
    } catch (error) { if (current === visit) report(error); }
    finally { $('send-button').disabled = false; }
  });

  if (!admin) {
    $('chat-modes').hidden = false;
    $(memberMode ? 'member-mode' : 'guest-mode').setAttribute('aria-current', 'page');
    $('storage-help').addEventListener('click', () => $('storage-dialog').showModal());
  }

  if (admin) {
    $('title').textContent = 'ניהול הצ׳אט';
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
  } else if (memberMode) {
    fetch('/api/account/session', { cache: 'no-store' }).then(response => {
      if (!response.ok) { const error = new Error('Session unavailable'); error.status = response.status; throw error; }
      return response.json();
    }).then(member => {
      ready = true;
      $('chat').hidden = false;
      $('intro').textContent = 'שיחה עם מנהל האתר · ' + member.name;
      refresh();
    }).catch(report);
  } else {
    $('chat').hidden = false;
    $('intro').textContent = 'הטיוטות נשמרות בדפדפן הזה. לשליחה למנהל האתר, עברו למצב משתמש.';
    document.querySelector('label[for="message"]').textContent = 'טיוטה';
    $('messages').setAttribute('aria-label', 'טיוטות שמורות');
    $('send-button').textContent = 'שמירת טיוטה';
    loadGuestDrafts();
    window.addEventListener('storage', event => {
      if (event.key === null || event.key.startsWith(guestDraftPrefix)) loadGuestDrafts();
    });
    return;
  }

  async function poll() {
    await refresh();
    setTimeout(poll, 7000);
  }
  setTimeout(poll, 7000);
  window.addEventListener('online', refresh);
}());
