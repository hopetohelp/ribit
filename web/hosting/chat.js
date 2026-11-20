(function () {
  'use strict';
  const admin = location.pathname === '/admin-chat';
  const $ = id => document.getElementById(id);
  const embedded = !admin && window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
  let mode = 'checking';
  let cloudMessages = [];
  let supportVisible = true;
  let visitorRequest = 0;
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
    return Object.keys(localStorage).filter(key => key.startsWith(guestDraftPrefix)).flatMap(key => {
      try {
        const draft = JSON.parse(localStorage.getItem(key));
        return draft && typeof draft.body === 'string' && Number.isFinite(new Date(draft.created).getTime()) ? [{ ...draft, draft: true, key }] : [];
      } catch (_) { return []; }
    }).sort((a, b) => a.created - b.created);
  }

  function updateVisitor(next) {
    mode = next;
    const member = mode === 'member';
    $('chat').hidden = false;
    const notice = member ? 'השיחה נשמרת בחשבון שלכם.' :
      mode === 'offline' ? 'אין חיבור לענן כרגע. הודעות חדשות נשמרות בדפדפן הזה כטיוטות.' :
      'הטיוטות נשמרות בדפדפן הזה. כדי לשלוח הודעה ולשמור את השיחה בחשבון, התחברו.';
    if ($('intro').textContent !== notice) $('intro').textContent = notice;
    $('chat-sign-in').hidden = mode !== 'guest';
    $('send-button').textContent = member ? 'שליחה' : 'שמירת טיוטה';
    let drafts = [];
    try { drafts = readGuestDrafts(); }
    catch (_) { $('status').textContent = 'לא ניתן לפתוח טיוטות בדפדפן הזה.'; }
    paintMessages((mode === 'guest' ? [] : cloudMessages).concat(drafts).sort((a, b) => a.created - b.created));
  }

  function saveGuestDraft(message, offline) {
    try {
      const input = $('message');
      const id = crypto.randomUUID();
      const draft = { id, body: message, created: Date.now() };
      localStorage.setItem(guestDraftPrefix + id, JSON.stringify(draft));
      updateVisitor(offline ? 'offline' : 'guest');
      $('status').textContent = 'הטיוטה נשמרה בדפדפן הזה.';
      if (input.value.trim() === message) input.value = '';
      input.focus();
    } catch (_) {
      $('status').textContent = 'שמירת הטיוטה נכשלה. הטקסט עדיין בשדה ההודעה.';
    }
  }

  async function refreshVisitor() {
    if (document.hidden || !supportVisible || $('send-button').disabled) return;
    const current = ++visitorRequest;
    if (!navigator.onLine) {
      updateVisitor('offline');
      return;
    }
    try {
      const result = await api('messages');
      if (current !== visitorRequest) return;
      cloudMessages = result.messages;
      updateVisitor('member');
    } catch (error) {
      if (current !== visitorRequest) return;
      if (error.status === 401) cloudMessages = [];
      updateVisitor(error.status === 401 ? 'guest' : 'offline');
    }
  }

  async function api(action, payload) {
    const headers = {};
    if (!admin) headers['X-Ribit-Chat-Member'] = '1';
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(prefix + action, {
      method: payload === undefined ? 'GET' : 'POST', headers,
      body: payload === undefined ? undefined : JSON.stringify(payload), cache: 'no-store',
      signal: !admin && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(7000) : undefined
    });
    if (!response.ok) {
      const error = new Error('Chat request failed');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function paintMessages(messages) {
    const signature = JSON.stringify(messages.map(message => [message.id, Boolean(message.draft)]));
    if (signature === lastMessage) return;
    lastMessage = signature;
    const view = $('messages');
    view.textContent = '';
    for (const message of messages) {
      const bubble = document.createElement('div');
      bubble.className = 'message' + (message.sender === 'admin' ? ' admin' : '') + (message.draft ? ' draft' : '');
      const name = document.createElement('strong');
      name.textContent = message.draft ? 'טיוטה מקומית' : message.sender === 'admin' ? 'מנהל האתר' : admin ? 'מבקר' : 'אתם';
      const body = document.createElement('div');
      body.dir = 'auto';
      body.textContent = message.body;
      const time = document.createElement('time');
      const date = new Date(message.created);
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
      bubble.append(name, body, time);
      if (message.draft) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'draft-edit';
        edit.textContent = 'העתקה לשדה ההודעה';
        edit.onclick = () => {
          const input = $('message');
          if (input.value.trim()) {
            $('status').textContent = 'שמרו או נקו את הטקסט שבשדה לפני העתקת הטיוטה.';
          } else input.value = message.body;
          input.focus();
        };
        bubble.appendChild(edit);
      }
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
      429: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד רגע.'
    })[error.status] || 'אין חיבור לצ׳אט כרגע. נסו שוב כשיש אינטרנט.';
  }

  async function refresh() {
    if (!admin) return refreshVisitor();
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
    if (!admin && mode !== 'member') return saveGuestDraft(message, mode !== 'guest');
    visitorRequest++;
    $('send-button').disabled = true;
    const current = visit;
    try {
      const reply = await api('messages', { message, thread });
      if (current === visit) {
        if (input.value.trim() === message) input.value = '';
        $('status').textContent = '';
        if (admin) paintMessages(reply.messages);
        else {
          cloudMessages = reply.messages;
          updateVisitor('member');
        }
        input.focus();
      }
    } catch (error) {
      if (current !== visit) return;
      if (!admin && (!error.status || error.status >= 500 || error.status === 401)) {
        if (error.status === 401) cloudMessages = [];
        saveGuestDraft(message, error.status !== 401);
      } else report(error);
    } finally { $('send-button').disabled = false; }
  });

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
  } else {
    if (embedded) {
      document.body.classList.add('embedded-chat');
      const signIn = $('chat-sign-in');
      signIn.href = '/account';
      signIn.target = '_blank';
      signIn.rel = 'noopener';
      window.addEventListener('message', event => {
        if (event.source !== window.parent || event.origin !== location.origin) return;
        if (event.data === 'ribit:support-hidden') {
          supportVisible = false;
          visitorRequest++;
        } else if (event.data === 'ribit:support-visible') {
          supportVisible = true;
          refreshVisitor();
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.parent.postMessage('ribit:support-close', location.origin);
      });
    }
    window.addEventListener('storage', event => {
      if (event.key === 'ribit-member-active') refreshVisitor();
      if (event.key === null || event.key?.startsWith(guestDraftPrefix)) {
        if (mode !== 'checking') updateVisitor(mode);
      }
    });
    window.addEventListener('offline', () => {
      visitorRequest++;
      updateVisitor('offline');
    });
    document.addEventListener('visibilitychange', refreshVisitor);
    refreshVisitor();
  }

  async function poll() {
    await refresh();
    setTimeout(poll, 7000);
  }
  setTimeout(poll, 7000);
  window.addEventListener('online', refresh);
}());
