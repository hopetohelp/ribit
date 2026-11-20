(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const googleResult = params.get('google');
  if (next === 'chat' && $('page-back')) $('page-back').href = '/chat';
  const target = next === 'chat' ? '/chat?member=1' : next === 'calculator' ? '/app.html?installed=1&account=1' : null;
  const drawer = $('account-drawer');
  if (drawer) {
    try {
      if (localStorage.getItem('ribit-member-active') === '1') $('account-trigger').textContent = 'החשבון שלי';
    } catch (_) {}
  }
  let registering = false;
  let linkingGoogle = false;
  let recentLoad = 0;

  async function request(action, payload) {
    const response = await fetch('/api/account/' + action, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: 'no-store'
    });
    if (!response.ok) {
      const error = new Error('Account request failed');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function remember(active) {
    if (drawer) $('account-trigger').textContent = active ? 'החשבון שלי' : 'התחברות';
    try {
      if (active) localStorage.setItem('ribit-member-active', '1');
      else localStorage.removeItem('ribit-member-active');
    } catch (_) {}
  }

  function setPasswordVisibility(visible) {
    $('password').type = visible ? 'text' : 'password';
    $('password-visibility').textContent = visible ? 'הסתרה' : 'הצגה';
    $('password-visibility').setAttribute('aria-label', visible ? 'הסתרת סיסמה' : 'הצגת סיסמה');
  }

  function showForm() {
    recentLoad++;
    setPasswordVisibility(false);
    $('member-panel').hidden = true;
    $('member-form').hidden = false;
    $('account-status').textContent = '';
  }

  function showMember(member) {
    $('member-form').hidden = true;
    $('member-panel').hidden = false;
    $('member-email').textContent = member.email;
    $('account-status').textContent = '';
    if (!drawer) {
      $('member-google').textContent = member.googleLinked === true ? 'מחובר' :
        member.googleLinked === false ? 'טרם חובר' : 'לא זמין כרגע';
      $('member-google-link').hidden = member.googleLinked !== false;
      loadRecent();
    }
  }

  async function loadRecent() {
    const load = ++recentLoad;
    const list = $('member-recent-list');
    const status = $('member-recent-status');
    $('member-recent').hidden = true;
    list.replaceChildren();
    status.textContent = '';
    try {
      const { result } = await request('records', { method: 'recent', data: {} });
      if (load !== recentLoad) return;
      for (const entry of result) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'account-control';
        link.href = '/app.html?installed=1&account=1&view=saved&record=' + encodeURIComponent(entry.id);
        link.dir = 'auto';
        link.textContent = entry.title;
        item.appendChild(link);
        list.appendChild(item);
      }
      $('member-recent').hidden = !result.length;
    } catch (_) {
      if (load === recentLoad) status.textContent = 'טעינת הפריטים האחרונים נכשלה.';
    }
  }

  function notify(error) {
    if (linkingGoogle && error.status === 401) {
      $('account-status').textContent = 'לא נמצא חשבון תואם או שהסיסמה שגויה. לחשבון חדש, חזרו להרשמה הרגילה.';
      return;
    }
    $('account-status').textContent = ({
      400: 'בדקו את הפרטים. הסיסמה צריכה להכיל לפחות 10 תווים.',
      401: 'כתובת המייל או הסיסמה אינן נכונות.',
      409: 'כתובת המייל כבר רשומה. אפשר להיכנס לחשבון.',
      429: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
    })[error.status] || 'הכניסה לחשבון דורשת חיבור לאינטרנט.';
  }

  function chooseMode(register) {
    registering = register;
    const verb = register ? 'הרשמה' : 'התחברות';
    $('mode-login').setAttribute('aria-pressed', String(!register));
    $('mode-register').setAttribute('aria-pressed', String(register));
    setPasswordVisibility(false);
    $('password').autocomplete = register ? 'new-password' : 'current-password';
    $('submit-account').textContent = verb + ' במייל וסיסמה';
    $('google-action').textContent = verb + ' עם Google';
    $('google-sign-in').href = '/api/account/google/start?' + new URLSearchParams({
      next: next === 'chat' || next === 'calculator' ? next : 'account', mode: register ? 'register' : 'login'
    });
    $('account-status').textContent = '';
  }
  $('password-visibility').onclick = () => setPasswordVisibility($('password').type === 'password');
  $('mode-login').onclick = () => chooseMode(false);
  $('mode-register').onclick = () => chooseMode(true);
  $('member-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('submit-account').disabled = true;
    $('account-status').textContent = linkingGoogle ? 'מחברים את החשבון…' : registering ? 'יוצרים חשבון…' : 'מתחברים…';
    try {
      var result = await request(linkingGoogle ? 'google/link' : registering ? 'register' : 'login', {
        email: $('email').value, password: $('password').value
      });
      $('password').value = '';
      remember(true);
      if (result.target || target) location.replace(result.target || target);
      else {
        showMember(await request('session'));
        $('member-panel').querySelector('a').focus();
      }
    } catch (error) { notify(error); }
    finally { $('submit-account').disabled = false; }
  });
  $('member-logout').onclick = async () => {
    $('member-logout').disabled = true;
    try {
      try { await request('logout', {}); }
      catch (error) { if (error.status !== 401) throw error; }
      remember(false);
      $('member-email').textContent = '';
      $('member-recent-list').replaceChildren();
      showForm();
      $('email').focus();
    } catch (_) {
      $('account-status').textContent = 'היציאה נכשלה. בדקו את החיבור ונסו שוב.';
    } finally {
      $('member-logout').disabled = false;
    }
  };
  async function start() {
    let google;
    try { google = await request('google/status'); } catch (_) {}
    chooseMode(params.get('mode') === 'register');
    $('google-sign-in').hidden = $('account-divider').hidden = !google?.enabled;
    if (googleResult === 'link') {
      showForm();
      if (!google?.pendingEmail) {
        $('account-status').textContent = 'תוקף החיבור פג. התחילו שוב עם Google.';
        return;
      }
      linkingGoogle = true;
      $('email').value = google.pendingEmail;
      $('email').readOnly = true;
      $('account-mode').hidden = true;
      $('google-sign-in').hidden = $('account-divider').hidden = true;
      $('google-cancel').hidden = false;
      $('submit-account').textContent = 'חיבור וסנכרון';
      $('member-note').hidden = false;
      $('member-note').textContent = 'הקלידו פעם אחת את הסיסמה של הפלא השמיני. לאחר החיבור, כניסה עם Google תפתח את אותם חישובים ושיחות.';
      $('password').focus();
      return;
    }
    try {
      const member = await request('session');
      remember(true);
      if (target) location.replace(target);
      else {
        showMember(member);
        if (googleResult === 'error') $('account-status').textContent = 'החיבור ל־Google לא הושלם. ודאו שבחרתם את כתובת המייל של החשבון.';
      }
    } catch (error) {
      showForm();
      if (error.status === 401) remember(false);
      else notify(error);
      if (googleResult === 'missing') $('account-status').textContent = 'עדיין אין חשבון למייל הזה. בחרו הרשמה עם Google.';
      if (googleResult === 'error') $('account-status').textContent = 'הכניסה עם Google לא הושלמה. אפשר לנסות שוב.';
    }
  }
  if (drawer && !drawer.open) {
    drawer.addEventListener('toggle', function startOnOpen() {
      if (!drawer.open) return;
      drawer.removeEventListener('toggle', startOnOpen);
      start();
    });
  } else {
    start();
  }
}());
