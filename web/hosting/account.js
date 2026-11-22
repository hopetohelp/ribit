(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const googleResult = params.get('google');
  const target = next === 'chat' ? '/chat?member=1' : next === 'calculator' ? '/app.html?installed=1&account=1' : null;
  let hasPassword = true;
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

  function setPasswordVisibility(visible) {
    $('password').type = visible ? 'text' : 'password';
    $('password-visibility').textContent = visible ? 'הסתרה' : 'הצגה';
    $('password-visibility').setAttribute('aria-label', visible ? 'הסתרת סיסמה' : 'הצגת סיסמה');
  }

  function showForm() {
    setPasswordVisibility(false);
    $('member-panel').hidden = true;
    $('member-form').hidden = false;
    $('account-status').textContent = '';
  }

  function showMember(member) {
    $('member-form').hidden = true;
    $('member-panel').hidden = false;
    $('member-email').textContent = member.email;
    hasPassword = member.hasPassword !== false;
    $('account-status').textContent = '';
    $('password-change-form').hidden = true;
    $('change-password').setAttribute('aria-expanded', 'false');
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
        $('member-logout').focus();
      }
    } catch (error) { notify(error); }
    finally { $('submit-account').disabled = false; }
  });
  $('change-password').onclick = () => {
    const form = $('password-change-form');
    $('account-status').textContent = '';
    if (!hasPassword) {
      $('account-status').textContent = 'החשבון נוצר עם Google בלבד. את סיסמת Google מנהלים בחשבון Google.';
      return;
    }
    if (!form.hidden) form.reset();
    form.hidden = !form.hidden;
    $('change-password').setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) $('current-password').focus();
  };

  $('password-change-form').onsubmit = async event => {
    event.preventDefault();
    $('save-password').disabled = true;
    $('change-password').disabled = true;
    $('member-logout').disabled = true;
    try {
      await request('password', { currentPassword: $('current-password').value, newPassword: $('new-password').value });
      $('change-password').onclick();
      $('change-password').focus();
      $('account-status').textContent = 'הסיסמה הוחלפה.';
    } catch (error) {
      $('account-status').textContent = ({
        400: 'בחרו סיסמה חדשה באורך 10 תווים לפחות, שונה מהסיסמה הנוכחית.',
        401: 'תוקף הכניסה פג. התחברו מחדש.',
        403: 'הסיסמה הנוכחית שגויה.',
        409: 'לחשבון שנוצר עם Google בלבד אין סיסמת אתר להחלפה. את סיסמת Google מנהלים בחשבון Google.',
        429: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
      })[error.status] || 'לא ניתן היה להחליף את הסיסמה כרגע.';
    } finally {
      $('save-password').disabled = $('change-password').disabled = $('member-logout').disabled = false;
    }
  };
  $('member-logout').onclick = async () => {
    $('member-logout').disabled = true;
    try {
      try { await request('logout', {}); }
      catch (error) { if (error.status !== 401) throw error; }
      remember(false);
      $('member-email').textContent = '';
      $('password-change-form').reset();
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
  start();
}());
