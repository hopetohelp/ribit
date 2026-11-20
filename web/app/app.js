(function () {
  'use strict';

  if (window === window.top && window.location.hostname === 'ribit.hopetohelp.net') {
    window.location.replace('/');
    return;
  }

  var finance = window.RibitFinance;
  var chart = window.RibitChart;
  var localStore = window.RibitStorage;
  var hosted = !!document.querySelector('script[src="/app-offline.js"]');
  var memberActive = false;
  if (hosted) {
    try { memberActive = localStorage.getItem('ribit-member-active') === '1'; } catch (_) {}
  }
  var query = hosted ? new URLSearchParams(location.search) : null;
  var cloud = hosted && query.get('local') !== '1' && (query.get('account') === '1' || memberActive);
  var store = cloud ? { request: cloudStorage } : localStore;
  var Money = finance.Money;
  var form = document.getElementById('calculator');
  var fields = form.elements;
  var main = document.getElementById('main');
  var bar = document.getElementById('bar');
  var trackNames = ['מסלול א׳', 'מסלול ב׳'];
  var state = {
    view: 'single',
    active: 0,
    comparing: false,
    sessions: { single: session(1), compare: session(2) },
    dialogFocus: null,
    busy: false,
    dark: false
  };
  var keys = ['initial', 'deposit', 'annualRate', 'years', 'months', 'frequency', 'timing',
    'depositFee', 'balanceFee', 'inflation', 'taxType', 'taxRate', 'includeDepositFeeInBasis'];
  var toastTimer;
  var previewFocus;
  var barScrollEdge = 0;
  var keypadEnabled = false;
  var titleNumbers = false;
  var lastTap;
  var hebrewKeys = {
    '0': ' 0', '1': '1.,-', '2': 'אבג2', '3': 'דהו3', '4': 'זחט4',
    '5': 'יכלך5', '6': 'מנסםן6', '7': 'עפצףץ7', '8': 'קרש8', '9': 'ת9'
  };

  function byId(id) { return document.getElementById(id); }
  function listen(id, action) { byId(id).addEventListener('click', action); }
  function text(id, content) { byId(id).textContent = content; }
  function make(tag, content, style) {
    var item = document.createElement(tag);
    if (content != null) item.textContent = content;
    if (style) item.className = style;
    return item;
  }

  function action(label, handler, style) {
    var button = make('button', label, style || 'plain text-action');
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function draft() {
    return {
      initial: '', deposit: '', annualRate: '', years: '', months: '', frequency: 'NONE',
      timing: 'END', depositFee: '', balanceFee: '', inflation: '', taxType: 'NONE', taxRate: '',
      includeDepositFeeInBasis: false
    };
  }

  function session(count) {
    return {
      drafts: count === 1 ? [draft()] : [draft(), draft()], followsA: count === 2,
      labels: [], currency: 'ILS', calculation: null, id: null, title: null,
      result: false, display: 'net'
    };
  }

  function current() { return state.sessions[state.comparing ? 'compare' : 'single']; }

  function visibility(target, visible) {
    target.hidden = !visible;
  }

  function disclosure(buttonId, containerId, opened) {
    byId(buttonId).setAttribute('aria-expanded', String(opened));
    visibility(byId(containerId), opened);
  }

  function setAdvanced(opened, reveal) {
    disclosure('advanced', 'advanced-fields', opened);
    if (opened && reveal) byId('advanced').scrollIntoView();
  }

  function setMenu(opened) {
    disclosure('menu', 'menu-items', opened);
  }

  function readDraft() {
    var value = {};
    keys.forEach(function (key) { value[key] = fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value; });
    return value;
  }

  function stash() {
    if (state.view === 'saved' || current().result) return;
    var currentSession = current();
    var edited = readDraft();
    if (state.active === 1 && !sameDraft(currentSession.drafts[1], edited)) currentSession.followsA = false;
    currentSession.drafts[state.active] = edited;
    if (currentSession.followsA) currentSession.drafts[1] = currentSession.drafts[0];
    currentSession.currency = fields.currency.value;
  }

  function sameDraft(first, second) {
    return keys.every(function (key) { return first[key] === second[key]; });
  }

  function trackLabel(index) {
    var label = current().labels[index];
    return trackNames[index] + (label ? ' · ' + label : '');
  }

  function updateConditionalFields() {
    var recurring = fields.frequency.value !== 'NONE';
    var taxed = fields.taxType.value !== 'NONE';
    visibility(byId('deposit-field'), recurring);
    visibility(byId('timing-field'), recurring);
    visibility(byId('tax-rate-field'), taxed);
    visibility(byId('basis-field'), taxed && Number(normalDigits(fields.depositFee.value).replace(',', '.')) > 0);
  }

  function fill() {
    var currentSession = current();
    var currentDraft = currentSession.drafts[state.active];
    keys.forEach(function (key) {
      if (fields[key].type === 'checkbox') fields[key].checked = currentDraft[key];
      else fields[key].value = currentDraft[key];
    });
    fields.currency.value = currentSession.currency;
    var source = currentSession.labels[state.active];
    text('picked-source', source || '');
    visibility(byId('picked-source'), state.comparing && !!source);
    updateConditionalFields();
    Array.prototype.forEach.call(byId('tracks').children, function (button, index) {
      button.setAttribute('aria-pressed', String(index === state.active));
    });
  }

  function clearError() {
    visibility(byId('form-error'), false);
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (field) {
      field.removeAttribute('aria-invalid');
    });
  }

  function pageTop() {
    main.scrollTop = 0;
    revealBar(0);
  }

  function view(name) {
    stash();
    setMenu(false);
    state.view = name;
    if (name !== 'saved') {
      state.comparing = name === 'compare';
      state.active = 0;
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-view') === name));
    });
    if (name === 'saved') {
      showSection('saved');
      loadSaved();
    } else if (current().result) {
      showResults();
    } else {
      showEditor();
    }
  }

  function shiftTab(direction) {
    if (state.busy || !byId('dialog-backdrop').hidden) return;
    var selected = document.querySelector('.tabs [aria-pressed="true"]');
    var tab = direction > 0 ? selected.nextElementSibling : selected.previousElementSibling;
    if (tab) {
      chart.dismiss();
      view(tab.getAttribute('data-view'));
    }
  }

  function showSection(id) {
    ['editor', 'result', 'saved'].forEach(function (section) { visibility(byId(section), section === id); });
    if (id !== 'result') chart.clear();
    pageTop();
  }

  function showEditor() {
    current().result = false;
    fill();
    clearError();
    visibility(byId('tracks'), state.comparing);
    visibility(byId('pick-saved'), state.comparing);
    text('editor-title', state.comparing ? 'השוואת מסלולים' : 'חישוב השקעה');
    text('compute', state.comparing ? 'השוואה' : 'חישוב');
    setAdvanced(false);
    showSection('editor');
  }

  function normalDigits(raw) {
    return raw.trim().replace(/[٠-٩۰-۹]/g, function (digit) { return String(digit.charCodeAt(0) & 15); })
      .replace(/−/g, '-').replace(/٫/g, '.').replace(/٬/g, ',');
  }

  function parse(raw, field, min, max, decimals, blank, group) {
    var value = normalDigits(raw);
    if (!value && blank) return blank;
    if (group && /^[+-]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(value)) value = value.replace(/,/g, '');
    else value = value.replace(',', '.');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value)) throw { field: field, message: 'הזינו מספר תקין' };
    var number = new Money(value);
    if (number.lt(min) || number.gt(max) || number.dp() > decimals) throw { field: field, message: 'הערך מחוץ לטווח' };
    return number.toString();
  }

  function planFrom(input) {
    var initial = parse(input.initial, 'initial', 0, '999999999999.99', 2, '0', true);
    var deposit = input.frequency === 'NONE' ? '0' : parse(input.deposit, 'deposit', 0, '999999999999.99', 2, '0', true);
    var annualRate = parse(input.annualRate, 'annualRate', '-99.9999', 1000, 4, null);
    var years = parse(input.years, 'years', 0, 100, 0, '0');
    var months = parse(input.months, 'months', 0, 11, 0, '0');
    var duration = Number(years) * 12 + Number(months);
    if (duration < 1 || duration > 1200) throw { field: 'years', message: 'מחודש אחד עד 100 שנים' };
    var depositFee = parse(input.depositFee, 'depositFee', 0, 100, 4, '0');
    var balanceFee = parse(input.balanceFee, 'balanceFee', 0, '99.9999', 4, '0');
    var inflation = parse(input.inflation, 'inflation', '-99.9999', 1000, 4, '0');
    var taxRate = input.taxType === 'NONE' ? '0' : parse(input.taxRate, 'taxRate', 0, 100, 4, null);
    return {
      initial: initial, deposit: deposit, annualRate: annualRate, months: duration,
      frequency: input.frequency, timing: input.timing, depositFee: depositFee,
      balanceFee: balanceFee, inflation: inflation, taxType: input.taxType,
      taxRate: taxRate, includeDepositFeeInBasis: input.includeDepositFeeInBasis
    };
  }

  function calculate(event) {
    event.preventDefault();
    stash();
    clearError();
    var currentSession = current();
    var index = state.active;
    try {
      var plans = currentSession.drafts.map(function (input, position) {
        index = position;
        return planFrom(input);
      });
      var calculation = finance.calculate(currentSession.currency, plans);
      calculation.startedOn = currentSession.calculation && currentSession.calculation.startedOn || chart.dateKey(new Date());
      if (state.comparing) calculation.trackLabels = currentSession.labels.slice();
      currentSession.calculation = calculation;
      currentSession.result = true;
      showResults();
    } catch (error) {
      if (!error.field) return notify('החישוב נכשל');
      state.active = index;
      fill();
      var field = fields[error.field];
      if (byId('advanced-fields').contains(field)) setAdvanced(true, false);
      field.setAttribute('aria-invalid', 'true');
      text('form-error', error.message);
      visibility(byId('form-error'), true);
      field.focus();
    }
  }

  function duration(months) {
    var years = Math.floor(months / 12);
    var remaining = months % 12;
    var y = years === 1 ? 'שנה' : years + ' שנים';
    var m = remaining === 1 ? 'חודש' : remaining + ' חודשים';
    return years && remaining ? y + ' ו־' + m : years ? y : m;
  }

  function money(value) { return finance.amount(value, current().currency, true); }
  function last(points) { return points[points.length - 1]; }

  function showResults() {
    var currentSession = current();
    var calculation = currentSession.calculation;
    var projections = calculation.projections;
    var compare = projections.length === 2;
    var mode = currentSession.display;
    var final = projections.map(function (projection) { return last(projection.points); });
    var common = compare ? Math.min(final[0].month, final[1].month) : final[0].month;
    var amount = finance.value(final[0], mode);
    var label = 'נטו במימוש';
    if (compare) {
      var a = new Money(finance.value(projections[0].points[common], mode));
      var b = new Money(finance.value(projections[1].points[common], mode));
      var gap = a.minus(b).toDecimalPlaces(2);
      amount = gap.abs();
      label = gap.eq(0) ? 'פער נטו · היתרות שוות' : 'פער נטו · ' + (gap.gt(0) ? trackNames[0] : trackNames[1]);
    }
    text('result-title', currentSession.title || (compare ? 'תוצאות ההשוואה' : 'תוצאה'));
    text('hero-label', label);
    text('hero-period', 'אחרי ' + duration(common));
    text('hero-amount', money(amount));
    visibility(byId('money-mode'), calculation.plans.some(function (plan) { return Number(plan.inflation) !== 0 && !!plan.inflation; }));
    Array.prototype.forEach.call(byId('money-mode').children, function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-value') === mode));
    });

    var list = byId('result-tracks');
    list.textContent = '';
    visibility(list, compare);
    if (compare) final.forEach(function (point, index) {
      var row = make('div', null, 'track-overview');
      var name = make('span', null, 'track-name');
      name.appendChild(make('span', null, 'swatch' + (index ? ' second' : '')));
      name.appendChild(document.createTextNode(trackLabel(index)));
      row.appendChild(name);
      var value = make('strong', money(finance.value(point, mode)));
      value.dir = 'ltr';
      row.appendChild(value);
      if (final[0].month !== final[1].month) row.appendChild(make('small', duration(point.month), 'dim'));
      list.appendChild(row);
    });
    disclosure('details', 'details-content', false);
    showSection('result');
    draw();
  }

  function draw() {
    if (state.view === 'saved' || !current().result || byId('result').hidden) return;
    var calculation = current().calculation;
    var months = Math.max.apply(null, calculation.plans.map(function (plan) { return plan.months; }));
    text('chart-period', duration(months));
    chart.draw(calculation, current().display, [trackLabel(0), trackLabel(1)], state.dark);
  }

  function metric(parent, label, amount) {
    var row = make('div', null, 'metric');
    row.appendChild(make('span', label));
    var value = make('strong', money(amount));
    value.dir = 'ltr';
    row.appendChild(value);
    parent.appendChild(row);
  }

  function fillDetails() {
    var panel = byId('details-content');
    panel.textContent = '';
    var projections = current().calculation.projections;
    if (projections.length === 2) {
      comparisonDetails(panel, current().calculation);
      return;
    }
    projections.forEach(function (projection, index) {
      var final = last(projection.points);
      var part = make('div', null, 'summary');
      metric(part, 'סך הפקדות', final.contributed);
      if (Number(final.depositFees)) metric(part, 'דמי הפקדה', final.depositFees);
      if (Number(final.balanceFees)) metric(part, 'דמי צבירה', final.balanceFees);
      metric(part, 'יתרה לפני מס', final.balance);
      if (current().calculation.plans[index].taxType && current().calculation.plans[index].taxType !== 'NONE') {
        metric(part, 'מס משוער', final.tax);
      }
      metric(part, 'נטו במימוש', finance.value(final, 'net'));
      if (Number(current().calculation.plans[index].inflation)) metric(part, 'נטו בכסף של היום', finance.value(final, 'realNet'));
      part.appendChild(make('h3', 'פירוט שנתי', 'year-title'));
      projection.points.forEach(function (point) {
        if (point.month > 0 && (point.month % 12 === 0 || point.month === final.month)) {
          metric(part, 'אחרי ' + duration(point.month), finance.value(point, current().display));
        }
      });
      panel.appendChild(part);
    });
  }

  function comparisonDetails(panel, calculation) {
    var table = make('table', null, 'comparison-table');
    table.setAttribute('aria-label', 'פירוט השוואת מסלולים');
    var header = table.createTHead().insertRow();
    trackNames.forEach(function (name, index) {
      var cell = make('th', name);
      cell.scope = 'col';
      if (current().labels[index]) cell.appendChild(make('small', current().labels[index]));
      header.appendChild(cell);
    });
    var body = table.createTBody();
    var plans = calculation.plans;
    var points = calculation.projections.map(function (track) { return track.points; });
    var options = plans.map(finance.financialOptions);
    var rowNumber = 0;
    function row(label, values) {
      var heading = make('th', label);
      heading.colSpan = 2;
      heading.id = 'comparison-field-' + (++rowNumber);
      var equal = values[0] === values[1];
      heading.appendChild(make('span', equal ? 'זהה' : 'שונה', equal ? 'comparison-badge same' : 'comparison-badge different'));
      body.insertRow().appendChild(heading);
      var cells = body.insertRow();
      (equal ? [values[0]] : values).forEach(function (value) {
        var cell = cells.insertCell();
        if (equal) cell.colSpan = 2;
        cell.setAttribute('headers', heading.id);
        cell.appendChild(make('bdi', value));
      });
    }

    var frequency = { NONE: 'ללא', MONTHLY: 'חודשית', YEARLY: 'שנתית' };
    var tax = { NONE: 'ללא מס', NOMINAL: 'נומינלי', REAL: 'ריאלי' };
    var dash = '—';
    function percent(value) { return new Money(value).toFixed() + '%'; }
    function enteredAmount(value) { return finance.amount(value, calculation.currency, false); }
    row('סכום התחלתי', plans.map(function (plan) { return enteredAmount(plan.initial); }));
    row('תדירות הפקדה', plans.map(function (plan) { return frequency[plan.frequency]; }));
    row('סכום להפקדה', plans.map(function (plan) { return plan.frequency === 'NONE' ? dash : enteredAmount(plan.deposit); }));
    row('מועד ההפקדה', plans.map(function (plan) {
      return plan.frequency === 'NONE' ? dash : plan.timing === 'START' ? 'בתחילת התקופה' : 'בסוף התקופה';
    }));
    row('תשואה שנתית', plans.map(function (plan) { return percent(plan.annualRate); }));
    row('תקופה', plans.map(function (plan) { return duration(plan.months); }));
    row('מטבע', plans.map(function () { return calculation.currency; }));
    row('דמי הפקדה', options.map(function (plan) { return percent(plan.depositFee); }));
    row('דמי צבירה לשנה', options.map(function (plan) { return percent(plan.balanceFee); }));
    row('אינפלציה לשנה', options.map(function (plan) { return percent(plan.inflation); }));
    row('מס במימוש', options.map(function (plan) { return tax[plan.taxType]; }));
    row('שיעור מס', options.map(function (plan) { return plan.taxType === 'NONE' ? dash : percent(plan.taxRate); }));
    if (options.some(function (plan) { return plan.taxType !== 'NONE' && Number(plan.depositFee); })) {
      row('דמי הפקדה בבסיס המס', options.map(function (plan) {
        return plan.taxType === 'NONE' || !Number(plan.depositFee) ? dash : plan.includeDepositFeeInBasis ? 'כלולים' : 'לא כלולים';
      }));
    }

    var final = points.map(last);
    row('סך הפקדות', final.map(function (point) { return money(point.contributed); }));
    if (final.some(function (point) { return Number(point.depositFees); })) {
      row('דמי הפקדה שנוכו', final.map(function (point) { return money(point.depositFees); }));
    }
    if (final.some(function (point) { return Number(point.balanceFees); })) {
      row('דמי צבירה שנוכו', final.map(function (point) { return money(point.balanceFees); }));
    }
    row('יתרה לפני מס', final.map(function (point) { return money(point.balance); }));
    if (options.some(function (plan) { return plan.taxType !== 'NONE'; })) {
      row('מס משוער', final.map(function (point) { return money(point.tax); }));
    }
    row('נטו במימוש', final.map(function (point) { return money(finance.value(point, 'net')); }));
    if (options.some(function (plan) { return Number(plan.inflation); })) {
      row('נטו בכסף של היום', final.map(function (point) { return money(finance.value(point, 'realNet')); }));
    }
    var months = Math.max(final[0].month, final[1].month);
    for (var month = 1; month <= months; month++) {
      if (month % 12 !== 0 && month !== final[0].month && month !== final[1].month) continue;
      row('אחרי ' + duration(month), points.map(function (track) {
        return track[month] ? money(finance.value(track[month], current().display)) : dash;
      }));
    }
    panel.appendChild(table);
  }

  function notify(message) {
    clearTimeout(toastTimer);
    text('status', message);
    visibility(byId('status'), true);
    toastTimer = setTimeout(function () { visibility(byId('status'), false); }, 3200);
  }

  function openDialog(title, render, centered) {
    var focused = document.activeElement;
    state.dialogFocus = byId('menu-items').contains(focused) ? byId('menu') : focused;
    setMenu(false);
    var dialog = byId('dialog');
    dialog.classList.toggle('about-dialog', Boolean(centered));
    text('dialog-title', title);
    var content = byId('dialog-content');
    content.textContent = '';
    render(content);
    visibility(byId('dialog-backdrop'), true);
    (centered ? dialog : byId('dialog-close')).focus();
  }

  function closeDialog() {
    if (state.busy) return;
    visibility(byId('dialog-backdrop'), false);
    if (state.dialogFocus && document.body.contains(state.dialogFocus)) state.dialogFocus.focus();
    state.dialogFocus = null;
  }

  function saveDialog() {
    var selected = current();
    openDialog('שמירת חישוב', function (content) {
      var form = make('form');
      var label = make('label', null, 'field');
      label.appendChild(make('span', 'שם'));
      var input = make('input');
      input.id = 'save-title';
      input.dir = 'auto';
      input.value = selected.title || '';
      input.required = true;
      input.maxLength = 80;
      if (keypadEnabled) input.setAttribute('inputmode', 'none');
      label.appendChild(input);
      form.appendChild(label);
      if (keypadEnabled) {
        titleNumbers = false;
        lastTap = null;
        var hint = make('p', '', 'keypad-hint');
        hint.id = 'keypad-hint';
        hint.setAttribute('aria-live', 'polite');
        input.setAttribute('aria-describedby', hint.id);
        form.appendChild(hint);
        renderKeypadHint(hint);
      }
      var actions = make('div', null, 'actions');
      var submit = make('button', 'שמירה', 'primary');
      submit.type = 'submit';
      actions.appendChild(submit);
      if (selected.id) actions.appendChild(action('שמירת עותק', function () { if (form.reportValidity ? form.reportValidity() : input.value.trim()) save(true); }, 'outline'));
      form.appendChild(actions);
      content.appendChild(form);

      function save(copy) {
        var title = input.value.trim();
        if (!title || state.busy) return;
        state.busy = true;
        Array.prototype.forEach.call(actions.children, function (button) { button.disabled = true; });
        store.request('save', { id: copy ? null : selected.id, title: title, calculation: selected.calculation }, function (error, id) {
          state.busy = false;
          Array.prototype.forEach.call(actions.children, function (button) { button.disabled = false; });
          if (error) return notify(cloud ? 'השמירה בענן נכשלה. בדקו את האינטרנט או עברו לשמורים במכשיר.' : 'השמירה נכשלה');
          selected.id = id;
          selected.title = title;
          text('result-title', title);
          closeDialog();
          notify('נשמר');
        });
      }

      form.addEventListener('submit', function (event) { event.preventDefault(); save(false); });
    });
  }

  function draftFrom(plan) {
    var options = finance.financialOptions(plan);
    return {
      initial: plan.initial, deposit: plan.deposit, annualRate: plan.annualRate,
      years: String(Math.floor(plan.months / 12)), months: String(plan.months % 12),
      frequency: plan.frequency, timing: plan.timing, depositFee: options.depositFee,
      balanceFee: options.balanceFee, inflation: options.inflation, taxType: options.taxType, taxRate: options.taxRate,
      includeDepositFeeInBasis: options.includeDepositFeeInBasis
    };
  }

  function storageRequest(method, data) {
    return new Promise(function (resolve, reject) {
      store.request(method, data, function (error, result) {
        if (error || (method === 'load' && !result)) reject(error || new Error('Missing calculation'));
        else resolve(result);
      });
    });
  }

  function cloudStorage(method, data, callback) {
    var payload = data;
    if (method === 'save') {
      payload = backupRecord(data);
      payload.id = data.id;
    } else if (method === 'import') payload = { entries: data.entries.map(backupRecord) };
    fetch('/api/account/records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: method, data: payload }), cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) {
        if (response.status === 401) {
          try { localStorage.removeItem('ribit-member-active'); } catch (_) {}
          if (window === window.top) location.replace('/account?next=calculator');
        }
        throw new Error('Cloud storage unavailable');
      }
      return response.json();
    }).then(function (data) {
      var result = data.result;
      if (method === 'load' && result) {
        result.calculation = decodeBackup(JSON.stringify({
          format: 'ribit-backup', version: 1, entries: [result]
        }))[0].calculation;
      }
      return result;
    }).then(function (result) { callback(null, result); }, callback);
  }

  function backupRecord(entry) {
    var calculation = entry.calculation;
    return {
      title: entry.title || (calculation.plans.length === 2 ? 'השוואת מסלולים' : 'חישוב השקעה'),
      updatedAt: entry.updatedAt || Date.now(),
      calculation: {
        currency: calculation.currency, plans: calculation.plans,
        startedOn: calculation.startedOn, trackLabels: calculation.trackLabels
      }
    };
  }

  function encodeBackup(entries) {
    return JSON.stringify({ format: 'ribit-backup', version: 1, entries: entries.map(backupRecord) });
  }

  function decodeBackup(source) {
    var backup = JSON.parse(source);
    if (!backup || backup.format !== 'ribit-backup' || backup.version !== 1 ||
        !Array.isArray(backup.entries) || !backup.entries.length) throw new Error('Invalid backup');
    return backup.entries.map(function (entry) {
      var saved = entry.calculation;
      if (!saved || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 80 ||
          !Array.isArray(saved.plans) || saved.plans.length < 1 || saved.plans.length > 2) throw new Error('Invalid entry');
      var plans = saved.plans.map(function (plan) {
        var input = draftFrom(plan);
        if (['NONE', 'MONTHLY', 'YEARLY'].indexOf(input.frequency) < 0 ||
            ['START', 'END'].indexOf(input.timing) < 0 ||
            ['NONE', 'NOMINAL', 'REAL'].indexOf(input.taxType) < 0 ||
            !Number.isInteger(plan.months)) throw new Error('Invalid plan');
        return planFrom(input);
      });
      var calculation = finance.calculate(saved.currency, plans);
      var timestamp = new Date(entry.updatedAt);
      var validTimestamp = isFinite(timestamp.getTime());
      if (typeof saved.startedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.startedOn) &&
          isFinite(new Date(saved.startedOn).getTime())) calculation.startedOn = saved.startedOn;
      else if (validTimestamp) calculation.startedOn = chart.dateKey(timestamp);
      if (Array.isArray(saved.trackLabels)) calculation.trackLabels = saved.trackLabels.slice(0, 2).map(function (label) {
        return typeof label === 'string' ? label.slice(0, 120) : null;
      });
      return { title: entry.title.trim(), updatedAt: validTimestamp ? timestamp.getTime() : Date.now(), calculation: calculation };
    });
  }

  function savedEntries() {
    return storageRequest('list', {}).then(function (entries) {
      return Promise.all(entries.map(loadForBackup));
    });
  }

  function loadForBackup(summary) {
    return storageRequest('load', { id: summary.id }).then(function (entry) {
      entry.updatedAt = summary.updatedAt;
      return entry;
    });
  }

  function downloadBackup(source) {
    if (new Blob([source]).size > 8 * 1024 * 1024) return notify('קובץ הגיבוי גדול מדי');
    if (window.RibitDevice && window.RibitDevice.exportBackup) {
      window.RibitDevice.exportBackup(source);
      return;
    }
    var url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
    var link = make('a');
    link.href = url;
    link.download = 'ribit-' + chart.dateKey(new Date()) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function restoreBackup(source) {
    var entries;
    try { entries = decodeBackup(source); }
    catch (error) { return notify('קובץ הגיבוי אינו תקין'); }
    return storageRequest('import', { entries: entries }).then(function () {
      if (state.view === 'saved') loadSaved();
      notify('יובאו פריטים: ' + entries.length);
    }).catch(function () { notify('הייבוא נכשל'); });
  }

  function importBackupFile(event) {
    var file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return notify('קובץ הגיבוי גדול מדי');
    var reader = new FileReader();
    reader.onload = function () { restoreBackup(reader.result); };
    reader.onerror = function () { notify('קריאת הקובץ נכשלה'); };
    reader.readAsText(file);
  }

  function openSaved(summary) {
    store.request('load', { id: summary.id }, function (error, entry) {
      if (state.view !== 'saved') return;
      if (error || !entry || !entry.calculation) return notify('הפתיחה נכשלה');
      var calculation = entry.calculation;
      if (!calculation.startedOn) calculation.startedOn = chart.dateKey(new Date(summary.updatedAt || Date.now()));
      var target = calculation.plans.length === 2 ? 'compare' : 'single';
      state.sessions[target] = {
        drafts: calculation.plans.map(draftFrom), currency: calculation.currency,
        followsA: false, labels: calculation.trackLabels || [],
        calculation: calculation, id: summary.id, title: entry.title, result: true, display: 'net'
      };
      view(target);
    });
  }

  function pickSaved() {
    stash();
    var target = current();
    var index = state.active;
    openDialog('בחירה ל' + trackNames[index], function (content) {
      var status = make('p', 'טוען חישובים…', 'dim');
      status.setAttribute('role', 'status');
      content.appendChild(status);
      var choices = make('div', null, 'saved-choices');
      content.appendChild(choices);
      function stillOpen() {
        return !byId('dialog-backdrop').hidden && choices.parentNode === content &&
          state.view === 'compare' && current() === target;
      }
      function choose(summary, position, label) {
        if (state.busy) return;
        state.busy = true;
        store.request('load', { id: summary.id }, function (error, entry) {
          state.busy = false;
          if (!stillOpen()) return;
          var calculation = entry && entry.calculation;
          var plan = calculation && calculation.plans[position];
          if (error || !plan) {
            status.textContent = 'פתיחת החישוב נכשלה';
            return;
          }
          var other = target.drafts[1 - index];
          if (calculation.currency !== target.currency && !(index === 0 && target.followsA) && !sameDraft(other, draft())) {
            status.textContent = 'בחרו חישוב במטבע ' + target.currency + ' כדי להשוות באותו מטבע.';
            return;
          }
          target.currency = calculation.currency;
          target.drafts[index] = draftFrom(plan);
          target.labels[index] = label;
          if (index === 1) target.followsA = false;
          if (target.followsA) target.drafts[1] = target.drafts[0];
          closeDialog();
          fill();
          clearError();
        });
      }
      store.request('list', {}, function (error, entries) {
        if (!stillOpen()) return;
        if (error) {
          status.textContent = 'טעינת שמורים נכשלה';
          return;
        }
        status.textContent = entries.length ? '' : 'אין חישובים שמורים';
        entries.forEach(function (summary) {
          for (var index = 0; index < summary.planCount; index++) addChoice(summary, index);
        });
      });
      function addChoice(summary, position) {
        var label = summary.title + (summary.planCount === 2 ? ' · ' + trackNames[position] : '');
        choices.appendChild(action(label, function () { choose(summary, position, label); }, 'outline'));
      }
    });
  }

  function removeSaved(entry) {
    openDialog('למחוק את החישוב?', function (content) {
      content.appendChild(make('p', entry.title));
      content.appendChild(action('מחיקה', function () {
        if (state.busy) return;
        state.busy = true;
        store.request('remove', { id: entry.id }, function (error) {
          state.busy = false;
          if (error) return notify('המחיקה נכשלה');
          Object.keys(state.sessions).forEach(function (key) {
            if (state.sessions[key].id === entry.id) {
              state.sessions[key].id = null;
              state.sessions[key].title = null;
            }
          });
          closeDialog();
          loadSaved();
          notify('נמחק');
        });
      }, 'primary'));
    });
  }

  function loadSaved() {
    var list = byId('saved-list');
    list.textContent = '';
    store.request('list', {}, function (error, entries) {
      if (state.view !== 'saved') return;
      if (error) return notify('טעינת שמורים נכשלה');
      list.textContent = '';
      if (!entries.length) list.appendChild(make('p', 'אין חישובים שמורים', 'dim'));
      entries.forEach(function (entry) {
        var record = make('article', null, 'record');
        record.appendChild(make('h2', entry.title));
        var date = new Date(entry.updatedAt).toLocaleDateString('he-IL');
        record.appendChild(make('p', (entry.planCount === 1 ? 'חישוב' : 'השוואה') + ' · ' + date, 'dim'));
        var actions = make('div', null, 'actions');
        var open = action('פתיחה', function () { openSaved(entry); });
        open.setAttribute('aria-label', 'פתיחה, ' + entry.title);
        var remove = action('מחיקה', function () { removeSaved(entry); });
        remove.setAttribute('aria-label', 'מחיקה, ' + entry.title);
        var exportRecord = action('ייצוא', function () {
          loadForBackup(entry).then(function (item) {
            downloadBackup(encodeBackup([item]));
          }).catch(function () { notify('הייצוא נכשל'); });
        });
        exportRecord.setAttribute('aria-label', 'ייצוא, ' + entry.title);
        actions.appendChild(open);
        actions.appendChild(exportRecord);
        actions.appendChild(remove);
        record.appendChild(actions);
        list.appendChild(record);
      });
    });
  }

  function explanations() {
    openDialog('הסברים', function (content) {
      var list = make('ul');
      [
        'התשואה השנתית אפקטיבית ולפני דמי ניהול.',
        'דמי הפקדה מנוכים מכל הפקדה. דמי צבירה מנוכים מדי חודש.',
        'אינפלציה קובעת כמה שווה הכסף במחירי היום.',
        'מס נומינלי מחושב על רווח מעל בסיס העלות. מס ריאלי מצמיד כל הפקדה למדד עד המימוש. ירידת מדד אינה מקטינה את בסיס המס.',
        'כל נקודה בגרף מראה שווי נטו אילו מומש המסלול באותו מועד.'
      ].forEach(function (line) {
        var item = make('li', line);
        if (document.body.classList.contains('keypad-only')) item.tabIndex = -1;
        list.appendChild(item);
      });
      content.appendChild(list);
    });
  }

  function about() {
    openDialog('אודות ריבית', function (content) {
      content.appendChild(make('p', 'ריבית הוא מחשבון ריבית דריבית חינמי לחלוטין להשקעות. אפשר להשוות מסלולים ולשמור חישובים גם ללא אינטרנט.', 'about-copy'));
      var mail = make('a', 'hopetohelp.il@gmail.com', 'about-email');
      mail.href = 'mailto:hopetohelp.il@gmail.com';
      mail.dir = 'ltr';
      var site;
      if (window !== window.parent) {
        site = action('למסך הפתיחה', function () {
          closeDialog();
          window.parent.postMessage('ribit:exit', window.location.origin);
        }, 'plain text-action');
      } else {
        site = make('a', 'ribit.hopetohelp.net');
        site.href = 'https://ribit.hopetohelp.net';
        site.target = '_blank';
        site.rel = 'noopener';
        site.dir = 'ltr';
      }
      var chatLink = make('a', 'נשמח לשמוע אתכם');
      chatLink.href = 'https://ribit.hopetohelp.net/chat';
      chatLink.target = '_blank';
      chatLink.rel = 'noopener';
      [chatLink, mail, site].forEach(function (link) {
        var row = make('p');
        row.appendChild(link);
        content.appendChild(row);
      });
    }, true);
  }

  function setTheme(dark, remember) {
    state.dark = dark;
    document.body.classList.toggle('dark', dark);
    text('theme', dark ? 'מראה בהיר' : 'מראה כהה');
    if (remember) {
      try { localStorage.setItem('ribit-dark', dark ? '1' : '0'); } catch (error) { /* preference unavailable */ }
    }
    if (window.RibitDevice && window.RibitDevice.theme) window.RibitDevice.theme(dark);
    draw();
  }

  function back() {
    if (!byId('dialog-backdrop').hidden) { closeDialog(); return true; }
    if (!byId('menu-items').hidden) { setMenu(false); return true; }
    if (chart.dismiss()) return true;
    if (state.view !== 'saved' && current().result) { showEditor(); return true; }
    if (!byId('advanced-fields').hidden) { setAdvanced(false, false); return true; }
    if (state.view !== 'single') { view('single'); return true; }
    return false;
  }

  function requestBack() {
    if (back()) return;
    if (window.RibitDevice && window.RibitDevice.exit) window.RibitDevice.exit();
    else if (window !== window.parent) window.parent.postMessage('ribit:exit', window.location.origin);
  }

  function focusable(scope) {
    return Array.prototype.filter.call(scope.querySelectorAll('button, input, select, a[href]'), function (element) {
      return !element.disabled && element.getClientRects().length > 0;
    });
  }

  function navigationScope() {
    if (!byId('dialog-backdrop').hidden) return byId('dialog');
    if (!byId('menu-items').hidden) return byId('menu-items');
    return document.body;
  }

  function navigationRows(items) {
    var rows = [];
    // Separate fixed controls from scrolling content so overlapping rectangles cannot share a row.
    var sections = [[], [], []];
    items.forEach(function (control) {
      var box = control.getBoundingClientRect();
      var section = bar.contains(control) ? 0 : control.closest('.tabs') ? 2 : 1;
      sections[section].push({ control: control, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, height: box.height });
    });
    sections.forEach(function (section) {
      var row;
      section.sort(function (a, b) { return a.y - b.y; }).forEach(function (item) {
        if (!row || item.y - row[0].y >= Math.min(item.height, row[0].height) / 2) {
          row = [];
          rows.push(row);
        }
        row.push(item);
      });
    });
    rows.forEach(function (row) { row.sort(function (a, b) { return a.x - b.x; }); });
    return rows;
  }

  function moveFocus(key, active, items) {
    var rows = navigationRows(items);
    if (!rows.length) return null;
    var rowIndex = 0;
    var column = -1;
    for (; rowIndex < rows.length; rowIndex++) {
      column = rows[rowIndex].map(function (item) { return item.control; }).indexOf(active);
      if (column >= 0) break;
    }
    if (rowIndex === rows.length) return rows[0][rows[0].length - 1].control;
    var row = rows[rowIndex];
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      var adjacent = rows[rowIndex + (key === 'ArrowUp' ? -1 : 1)];
      if (!adjacent) return null;
      return adjacent.reduce(function (closest, item) {
        return Math.abs(item.x - row[column].x) <= Math.abs(closest.x - row[column].x) + 0.5 ? item : closest;
      }).control;
    }
    var left = key !== 'ArrowRight';
    var neighbor = row[column + (left ? -1 : 1)];
    if (neighbor) return neighbor.control;
    var nextRow = rows[rowIndex + (left ? 1 : -1)];
    return nextRow ? nextRow[left ? nextRow.length - 1 : 0].control : null;
  }

  function keypadFocus(control) {
    if (!control) return;
    control.focus();
    control.classList.add('key-focus');
  }

  function setKeypadMode(enabled) {
    keypadEnabled = enabled;
    Array.prototype.forEach.call(document.querySelectorAll('#calculator input[inputmode]'), function (input) {
      if (enabled) {
        if (!input.hasAttribute('data-inputmode')) input.setAttribute('data-inputmode', input.getAttribute('inputmode'));
        input.setAttribute('inputmode', 'none');
      } else if (input.hasAttribute('data-inputmode')) {
        input.setAttribute('inputmode', input.getAttribute('data-inputmode'));
        input.removeAttribute('data-inputmode');
      }
    });
    var title = byId('save-title');
    if (title) {
      if (enabled) title.setAttribute('inputmode', 'none');
      else title.removeAttribute('inputmode');
      var hint = byId('keypad-hint');
      if (hint) visibility(hint, enabled);
    }
  }

  function setKeypadOnly(enabled) {
    document.body.classList.toggle('keypad-only', enabled);
  }

  function renderKeypadHint(hint) {
    if (!hint) return;
    hint.textContent = titleNumbers ? 'מספרים · # לעברית · * לרווח' :
      'עברית · # למספרים · * לרווח · 2 אבג · 3 דהו · 4 זחט · 5 יכל · 6 מנס · 7 עפצ · 8 קרש · 9 ת';
  }

  function keypad(key, literal) {
    if (key === 'Back') { requestBack(); return; }
    var dialog = !byId('dialog-backdrop').hidden;
    var scope = navigationScope();
    var items = focusable(scope).filter(function (control) {
      return !bar.contains(control) || byId('menu-items').contains(control);
    });
    if (dialog) items.push.apply(items, scope.querySelectorAll('li[tabindex="-1"]'));
    var active = items.indexOf(previewFocus) < 0 ? null : previewFocus;
    if (key === 'Menu') {
      if (!dialog) {
        keypadFocus(byId('menu'));
        byId('menu').click();
      }
      return;
    }
    if (key.indexOf('Arrow') === 0 || key === 'Next') {
      if (active === chart.control && chart.step(key)) return;
      keypadFocus(moveFocus(key, active, items));
      return;
    }
    if (!active) {
      active = dialog ? items[0] : (fields.initial.getClientRects().length ? fields.initial : items[0]);
      keypadFocus(active);
    }
    if (!active) return;
    if (key === 'Enter') {
      if (active.tagName === 'SELECT') {
        active.selectedIndex = (active.selectedIndex + 1) % active.options.length;
        active.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (active.tagName === 'INPUT' && active.type === 'text' && active.form) {
        var primary = active.form.querySelector('button[type="submit"]');
        if (primary) primary.click();
      } else active.click();
      return;
    }
    if (active.tagName !== 'INPUT' || active.type !== 'text') return;
    var title = active.id === 'save-title';
    if (!title && !/^(?:Backspace|[0-9.\-])$/.test(key)) return;
    var start = active.selectionStart;
    var end = active.selectionEnd;
    if (key === 'Backspace' && start === end) start = Math.max(0, start - 1);
    var insert = key === 'Backspace' ? '' : key;
    var previousTap = lastTap;
    lastTap = null;
    if (title && !literal) {
      if (key === '.') {
        titleNumbers = !titleNumbers;
        renderKeypadHint(byId('keypad-hint'));
        return;
      }
      if (key === '-') insert = ' ';
      var choices = !titleNumbers && hebrewKeys[key];
      if (choices) {
        var now = Date.now();
        var repeat = previousTap && previousTap.input === active && previousTap.key === key &&
          now - previousTap.time < 850 && start === end && end === previousTap.end &&
          active.value.charAt(start - 1) === choices.charAt(previousTap.index);
        var index = repeat ? (previousTap.index + 1) % choices.length : 0;
        if (repeat) start--;
        insert = choices.charAt(index);
        lastTap = { input: active, key: key, index: index, time: now, end: start + 1 };
      }
    }
    if (active.value.length - (end - start) + insert.length > active.maxLength) return;
    active.value = active.value.slice(0, start) + insert + active.value.slice(end);
    active.setSelectionRange(start + insert.length, start + insert.length);
    var input = document.createEvent('Event');
    input.initEvent('input', true, false);
    active.dispatchEvent(input);
  }

  function scroll(direction) {
    var content = byId('dialog-backdrop').hidden ? main : byId('dialog');
    content.scrollTop += direction * Math.max(35, Math.round(content.clientHeight * .65));
  }

  function scrollPosition() {
    return Math.max(0, Math.min(main.scrollTop, main.scrollHeight - main.clientHeight));
  }

  function revealBar(position) {
    bar.classList.remove('retracted');
    barScrollEdge = position;
  }

  main.addEventListener('scroll', function () {
    var top = scrollPosition();
    if (top === 0) {
      revealBar(0);
    } else if (bar.classList.contains('retracted')) {
      // Ignore the small reversal at the end of a touch scroll.
      barScrollEdge = Math.max(barScrollEdge, top);
      if (barScrollEdge - top >= 8) revealBar(top);
    } else {
      barScrollEdge = Math.min(barScrollEdge, top);
      if (top > barScrollEdge) {
        bar.classList.add('retracted');
        barScrollEdge = top;
      }
    }
  });
  bar.addEventListener('focus', function () { revealBar(scrollPosition()); }, true);
  document.addEventListener('focus', function (event) {
    var target = event.target;
    if (!/^(?:BUTTON|INPUT|SELECT|A|LI)$/.test(target.tagName)) return;
    if (previewFocus) previewFocus.classList.remove('key-focus');
    if (target !== previewFocus) lastTap = null;
    previewFocus = target;
  }, true);
  document.addEventListener('keydown', function (event) {
    var active = document.activeElement;
    var key = event.key || ({9: 'Tab', 27: 'Escape', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown'})[event.keyCode];
    if (key === 'Escape' && back()) event.preventDefault();
    if (active === chart.control && chart.step(key)) {
      event.preventDefault();
      return;
    }
    if (key === 'Tab' && !byId('dialog-backdrop').hidden) {
      var dialogItems = focusable(byId('dialog'));
      var index = dialogItems.indexOf(active);
      if (dialogItems.length && (index < 0 ||
          (!event.shiftKey && index === dialogItems.length - 1) || (event.shiftKey && index === 0))) {
        event.preventDefault();
        dialogItems[event.shiftKey ? dialogItems.length - 1 : 0].focus();
      }
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].indexOf(key) >= 0 &&
        (active.tagName !== 'INPUT' && active.tagName !== 'SELECT' || key === 'ArrowDown' || key === 'ArrowUp')) {
      event.preventDefault();
      keypadFocus(moveFocus(key, active, focusable(navigationScope())));
    }
  });
  window.addEventListener('resize', draw);
  window.Ribit = {
    back: back, keypad: keypad, setKeypadMode: setKeypadMode, setKeypadOnly: setKeypadOnly,
    scroll: scroll, shiftTab: shiftTab, dismissChart: chart.dismiss
  };
  form.addEventListener('submit', calculate);
  form.addEventListener('change', updateConditionalFields);
  fields.depositFee.addEventListener('input', updateConditionalFields);
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
    button.addEventListener('click', function () { view(button.getAttribute('data-view')); });
  });
  Array.prototype.forEach.call(byId('tracks').children, function (button, index) {
    button.addEventListener('click', function () { stash(); state.active = index; fill(); clearError(); });
  });
  Array.prototype.forEach.call(byId('money-mode').children, function (button) {
    button.addEventListener('click', function () { current().display = button.getAttribute('data-value'); showResults(); });
  });
  listen('menu', function () { setMenu(byId('menu-items').hidden); });
  listen('back', requestBack);
  listen('theme', function () { setTheme(!state.dark, true); setMenu(false); byId('menu').focus(); });
  listen('advanced', function () { setAdvanced(byId('advanced-fields').hidden, true); });
  listen('pick-saved', pickSaved);
  listen('help', explanations);
  listen('about', about);
  listen('dialog-close', closeDialog);
  listen('edit', showEditor);
  listen('new', function () {
    state.sessions[state.comparing ? 'compare' : 'single'] = session(state.comparing ? 2 : 1);
    state.active = 0;
    showEditor();
  });
  if (hosted) {
    var account = byId('web-account');
    var accountLink = make('a', cloud ? 'ניהול החשבון' : 'כניסה לשמירה בענן');
    accountLink.href = cloud ? '/account' : '/account?next=calculator';
    accountLink.target = window === window.top ? '_self' : '_blank';
    accountLink.rel = 'noopener';
    if (cloud) {
      account.appendChild(document.createTextNode('שמורים בענן · '));
      var localLink = make('a', 'שמורים במכשיר');
      localLink.href = '/app.html?installed=1&local=1';
      localLink.target = accountLink.target;
      localLink.rel = 'noopener';
      account.appendChild(localLink);
      account.appendChild(document.createTextNode(' · '));
    }
    account.appendChild(accountLink);
    visibility(account, true);
  }
  listen('save', saveDialog);
  listen('export-result', function () { downloadBackup(encodeBackup([current()])); });
  listen('export-all', function () {
    savedEntries().then(function (entries) {
      if (!entries.length) return notify('אין חישובים שמורים לייצוא');
      downloadBackup(encodeBackup(entries));
    }).catch(function () { notify('הייצוא נכשל'); });
  });
  listen('import-backup', function () {
    if (window.RibitDevice && window.RibitDevice.importBackup) window.RibitDevice.importBackup();
    else byId('backup-file').click();
  });
  window.RibitBackupFile = {
    restore: restoreBackup,
    status: function (saved) { notify(saved ? 'קובץ הגיבוי נשמר' : 'פעולת הקובץ נכשלה'); }
  };
  byId('backup-file').addEventListener('change', importBackupFile);
  listen('details', function () {
    var open = byId('details-content').hidden;
    if (open) fillDetails();
    disclosure('details', 'details-content', open);
  });
  try { setTheme(localStorage.getItem('ribit-dark') === '1', false); } catch (error) { setTheme(false, false); }
  showEditor();
}());
