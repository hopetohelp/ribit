(function () {
  'use strict';

  var finance = window.RibitFinance;
  var Money = finance.Money;
  var control = document.getElementById('chart-control');
  var canvas = document.getElementById('growth');
  var tip = document.getElementById('chart-tip');
  var details = document.getElementById('chart-values');
  var close = document.getElementById('chart-dismiss');
  var dateFormat = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var graph;
  var selected = null;

  function twoDigits(number) { return ('0' + number).slice(-2); }

  function dateKey(date) {
    return date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) + '-' + twoDigits(date.getDate());
  }

  function dateAt(start, month) {
    var parts = start.split('-').map(Number);
    var lastDay = new Date(parts[0], parts[1] + month, 0).getDate();
    return new Date(parts[0], parts[1] - 1 + month, Math.min(parts[2], lastDay));
  }

  function node(tag, label, className) {
    var element = document.createElement(tag);
    if (label) element.textContent = label;
    if (className) element.className = className;
    return element;
  }

  function metric(parent, label, amount) {
    var row = node('div', null, 'chart-metric');
    var value = node('strong', finance.amount(amount, graph.calculation.currency, true));
    value.dir = 'ltr';
    row.appendChild(node('span', label));
    row.appendChild(value);
    parent.appendChild(row);
  }

  function renderTip() {
    control.setAttribute('aria-expanded', String(selected !== null));
    tip.hidden = selected === null;
    if (selected === null) return;
    var date = dateAt(graph.calculation.startedOn || dateKey(new Date()), selected);
    var time = node('time', dateFormat.format(date), 'chart-date');
    time.setAttribute('datetime', dateKey(date));
    time.dir = 'ltr';
    details.textContent = '';
    details.appendChild(time);
    var columns = node('div', null, 'track-columns');
    graph.series.forEach(function (points, index) {
      var column = node('div', null, 'chart-track');
      if (graph.series.length === 2) column.appendChild(node('strong', graph.names[index], 'chart-track-title'));
      var point = points[selected];
      if (point) {
        var principal = point.contributed;
        if (graph.mode === 'realNet') {
          if (!point.realContributed && !graph.realPaths[index]) {
            graph.realPaths[index] = finance.project(graph.calculation.plans[index]).points;
          }
          principal = point.realContributed || graph.realPaths[index][selected].realContributed;
        }
        metric(column, 'קרן מצטברת', principal);
        metric(column, 'תשואה נטו', new Money(finance.value(point, graph.mode)).minus(principal));
      } else {
        column.appendChild(node('span', 'המסלול הסתיים', 'dim'));
      }
      columns.appendChild(column);
    });
    details.appendChild(columns);
  }

  function paint() {
    var context = canvas.getContext('2d');
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height || !context) return;
    var dpi = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpi);
    canvas.height = Math.round(height * dpi);
    context.scale(dpi, dpi);
    context.strokeStyle = graph.dark ? '#384744' : '#dae2f0';
    context.lineWidth = 1;
    function x(month) { return 5 + (width - 10) * month / graph.months; }
    function y(value) { return height - 5 - (height - 10) * value; }
    for (var row = 0; row <= 4; row++) {
      context.beginPath();
      context.moveTo(5, y(row / 4));
      context.lineTo(width - 5, y(row / 4));
      context.stroke();
    }
    var colors = graph.dark ? ['#d7f875', '#a1adb7'] : ['#2549d4', '#63718b'];
    graph.values.forEach(function (values, index) {
      context.strokeStyle = colors[index];
      context.lineWidth = index ? 1.8 : 2.7;
      if (context.setLineDash) context.setLineDash(index ? [5, 4] : []);
      context.beginPath();
      context.moveTo(x(0), y(values[0]));
      var stride = Math.max(1, Math.floor(values.length / 160));
      for (var i = stride; i < values.length - 1; i += stride) context.lineTo(x(i), y(values[i]));
      context.lineTo(x(values.length - 1), y(values[values.length - 1]));
      context.stroke();
    });
    if (selected === null) return;
    if (context.setLineDash) context.setLineDash([]);
    context.strokeStyle = graph.dark ? '#a1adb7' : '#7185b7';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x(selected), 5);
    context.lineTo(x(selected), height - 5);
    context.stroke();
    graph.values.forEach(function (values, index) {
      if (selected >= values.length) return;
      context.fillStyle = colors[index];
      context.beginPath();
      context.arc(x(selected), y(values[selected]), index ? 2.7 : 4, 0, 2 * Math.PI);
      context.fill();
    });
  }

  function draw(calculation, mode, names, dark) {
    if (!graph || graph.calculation !== calculation || graph.mode !== mode) {
      if (!graph || graph.calculation !== calculation) selected = null;
      var maximum = new Money(1);
      var months = 1;
      var series = calculation.projections.map(function (projection) { return projection.points; });
      var values = series.map(function (points) {
        months = Math.max(months, points.length - 1);
        return points.map(function (point) {
          var amount = new Money(finance.value(point, mode));
          if (amount.gt(maximum)) maximum = amount;
          return amount;
        });
      });
      graph = {
        calculation: calculation, mode: mode, series: series, months: months, realPaths: [],
        values: values.map(function (track) { return track.map(function (amount) { return Number(amount.div(maximum)); }); })
      };
    }
    graph.names = names;
    graph.dark = dark;
    paint();
    renderTip();
  }

  function select(month) {
    selected = month;
    paint();
    renderTip();
  }

  function dismiss() {
    if (selected === null) return false;
    select(null);
    return true;
  }

  function step(key) {
    if (selected === null || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return false;
    select(Math.max(0, Math.min(graph.months, selected + (key === 'ArrowRight' ? 1 : -1))));
    return true;
  }

  control.addEventListener('click', function (event) {
    if (!graph || dismiss()) return;
    if (!event.detail) {
      select(0);
      return;
    }
    var box = canvas.getBoundingClientRect();
    var position = (event.clientX - box.left) / box.width * canvas.clientWidth;
    var month = Math.round((position - 5) / (canvas.clientWidth - 10) * graph.months);
    select(Math.max(0, Math.min(graph.months, month)));
  });

  close.addEventListener('click', function () {
    dismiss();
    control.focus();
  });

  document.addEventListener('click', function (event) {
    if (!tip.contains(event.target) && !control.contains(event.target)) dismiss();
  }, true);

  window.RibitChart = {
    draw: draw, dateKey: dateKey, dismiss: dismiss, step: step, control: control,
    clear: function () { selected = null; graph = null; renderTip(); }
  };
}());
