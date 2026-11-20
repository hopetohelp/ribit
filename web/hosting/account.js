(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const googleResult = params.get('google');
  const target = next === 'chat' ? '/chat?member=1' : next === 'calculator' ? '/app.html?installed=1&account=1' : null;
  let registering = false;
  let linkingGoogle = false;

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
    try {
      if (active) localStorage.setItem('ribit-member-active', '1');
      else localStorage.removeItem('ribit-member-active');
    } catch (_) {}
  }

  function showForm() {
    $('member-panel').hidden = true;
    $('member-form').hidden = false;
    $('account-status').textContent = '';
  }

  function showMember(member) {
    $('member-form').hidden = true;
    $('member-panel').hidden = false;
    $('member-name').textContent = member.name + ' · ' + member.email;
    $('account-status').textContent = '';
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
    $('password').autocomplete = register ? 'new-password' : 'current-password';
    $('submit-account').textContent = verb + ' במייל וסיסמה';
    $('google-sign-in').textContent = verb + ' עם Google';
    $('google-sign-in').href = '/api/account/google/start?' + new URLSearchParams({
      next: next === 'chat' ? 'chat' : 'calculator', mode: register ? 'register' : 'login'
    });
    $('account-status').textContent = '';
  }
  $('mode-login').onclick = () => chooseMode(false);
  $('mode-register').onclick = () => chooseMode(true);
  $('member-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('submit-account').disabled = true;
    try {
      var result = await request(linkingGoogle ? 'google/link' : registering ? 'register' : 'login', {
        email: $('email').value, password: $('password').value
      });
      $('password').value = '';
      remember(true);
      location.replace(result.target || target || '/app.html?installed=1&account=1');
    } catch (error) { notify(error); }
    finally { $('submit-account').disabled = false; }
  });
  $('member-logout').onclick = async () => {
    try { await request('logout', {}); remember(false); showForm(); }
    catch (error) {
      if (error.status === 401) { remember(false); showForm(); }
      else notify(error);
    }
  };
  async function start() {
    let google;
    try { google = await request('google/status'); } catch (_) {}
    chooseMode(params.get('mode') === 'register');
    $('google-sign-in').hidden = !google?.enabled;
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
      $('google-sign-in').hidden = true;
      $('google-cancel').hidden = false;
      $('submit-account').textContent = 'חיבור וסנכרון';
      $('member-note').textContent = 'הקלידו פעם אחת את הסיסמה של הפלא השמיני. לאחר החיבור, כניסה עם Google תפתח את אותם חישובים ושיחות.';
      $('password').focus();
      return;
    }
    try {
      const member = await request('session');
      remember(true);
      if (target) location.replace(target);
      else showMember(member);
    } catch (error) {
      showForm();
      if (error.status === 401) remember(false);
      else notify(error);
      if (googleResult === 'missing') $('account-status').textContent = 'עדיין אין חשבון למייל הזה. בחרו הרשמה עם Google.';
      if (googleResult === 'error') $('account-status').textContent = 'הכניסה עם Google לא הושלמה. אפשר לנסות שוב.';
    }
  }
  start();
}());
