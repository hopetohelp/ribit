(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const next = new URLSearchParams(location.search).get('next');
  const target = next === 'chat' ? '/chat?member=1' : next === 'calculator' ? '/app.html?installed=1&account=1' : null;
  let registering = false;

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
    $('account-status').textContent = ({
      400: 'בדקו את הפרטים. הסיסמה צריכה להכיל לפחות 10 תווים.',
      401: 'כתובת המייל או הסיסמה אינן נכונות.',
      409: 'כתובת המייל כבר רשומה. אפשר להיכנס לחשבון.',
      429: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
    })[error.status] || 'הכניסה לחשבון דורשת חיבור לאינטרנט.';
  }

  $('toggle-register').onclick = () => {
    registering = !registering;
    $('name-field').hidden = !registering;
    $('name').required = registering;
    $('password').autocomplete = registering ? 'new-password' : 'current-password';
    $('submit-account').textContent = registering ? 'הרשמה' : 'כניסה';
    $('toggle-register').textContent = registering ? 'כבר יש חשבון' : 'יצירת חשבון';
    $('account-status').textContent = '';
  };
  $('member-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('submit-account').disabled = true;
    try {
      await request(registering ? 'register' : 'login', {
        name: $('name').value, email: $('email').value, password: $('password').value
      });
      $('password').value = '';
      remember(true);
      location.replace(target || '/app.html?installed=1&account=1');
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
  request('session').then(member => {
    remember(true);
    if (target) location.replace(target);
    else showMember(member);
  }).catch(error => {
    showForm();
    if (error.status === 401) remember(false);
    else notify(error);
  });
}());
