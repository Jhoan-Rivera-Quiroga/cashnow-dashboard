/* Mail Order page (KPI cards, two trend charts, click a point to filter) and its Mail Details
   drill-through, mirroring the Power BI pages of the same names. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const { PRESETS, GRAN } = CN.ranges;
  const DETAIL_COLUMNS = [
    { key: 'day', label: 'Date', type: 'day' },
    { key: 'order', label: 'Order Number', type: 'text' },
    { key: 'vendor', label: 'First Name', type: 'text' },
    { key: 'product', label: 'Product', type: 'text' },
    { key: 'units', label: 'Quantity', type: 'num' },
    { key: 'cash', label: 'Cash Spent', type: 'money' },
    { key: 'person', label: 'Sales Person', type: 'text' },
  ];

  let M = null, problem = null; // mail order rows from CN.data, or null and why there are none
  let charts = null, table = null;
  let last = null; // latest compute() result
  const S = { preset: 'last4', from: 0, to: 0, g: 'weekly', sel: null };

  const label = (field, code) => (code < 0 ? '' : M.labels[field][code]);
  const presetRange = id => CN.ranges.range(id, M.minDay, M.maxDay);
  const inRange = i => M.day[i] >= S.from && M.day[i] <= S.to;
  // An order's product line, as opposed to a day's orders-completed row.
  const isLine = i => M.order[i] >= 0 || M.vendor[i] >= 0 || M.product[i] >= 0 || M.amount[i] !== 0;

  // One pass over the rows: the trend series (date range only) and the KPIs, which also respect
  // the selected point. Cash is the lines' Total; orders completed is the sum of Order Qty.
  function compute() {
    const bucket = M.bucket[S.g];
    const series = new Map();
    const byVendor = new Float64Array(M.labels.vendor.length);
    let cash = 0, orders = 0, lines = 0;
    for (let i = 0; i < M.n; i++) {
      if (!inRange(i)) continue;
      const b = bucket[i], a = M.amount[i];
      let t = series.get(b);
      if (!t) series.set(b, t = { cash: 0, orders: 0 });
      t.cash += a;
      t.orders += M.orders[i];
      if (S.sel !== null && b !== S.sel) continue;
      cash += a;
      orders += M.orders[i];
      if (M.vendor[i] >= 0) byVendor[M.vendor[i]] += a;
      if (isLine(i)) lines++;
    }
    let best = -1;
    for (let c = 0; c < byVendor.length; c++) if (byVendor[c] > 0 && (best < 0 || byVendor[c] > byVendor[best])) best = c;
    const keys = [...series.keys()].sort((x, y) => x - y);
    return {
      keys,
      cashSeries: keys.map(k => series.get(k).cash),
      orderSeries: keys.map(k => series.get(k).orders),
      cash, orders, lines,
      top: best < 0 ? null : { label: M.labels.vendor[best], value: byVendor[best] },
    };
  }

  /* ---------- page ---------- */

  function render() {
    let r = compute();
    if (S.sel !== null && !r.keys.includes(S.sel)) {
      S.sel = null;
      r = compute();
    }
    last = r;
    syncControls();
    setKpi('mail-kpi-vendor', r.top ? r.top.label : '–', r.top ? `${r.top.label}: ${F.money(r.top.value)}` : '');
    $('mail-kpi-vendor-amt').textContent = r.top ? '$' + F.short(r.top.value) : '';
    setKpi('mail-kpi-orders', F.int(r.orders), `${F.num(r.orders)} orders completed`);
    setKpi('mail-kpi-cash', '$' + F.short(r.cash), F.money(r.cash));
    const btn = $('mail-details-btn');
    btn.disabled = !r.lines;
    btn.title = r.lines ? `List the mail orders for ${scopePhrase()}` : 'No mail orders to list';
    CN.charts.fitKpis($('view-mail'));
    const opts = { gran: GRAN[S.g], sel: S.sel };
    CN.charts.line(charts[0], r.keys, r.cashSeries, Object.assign({ money: true }, opts));
    CN.charts.line(charts[1], r.keys, r.orderSeries, Object.assign({ unit: 'orders' }, opts));
    $('mail-selection').hidden = S.sel === null;
    if (S.sel !== null) $('mail-selection-label').textContent = GRAN[S.g].phrase(S.sel);
    saveHash();
  }

  function setKpi(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.closest('.kpi').title = title || '';
  }

  function syncControls() {
    $('mail-from').value = F.iso(S.from);
    $('mail-to').value = F.iso(S.to);
    $('mail-preset').value = S.preset;
    $('mail-granularity').value = S.g;
  }

  function scopePhrase() {
    if (S.sel !== null) return GRAN[S.g].phrase(S.sel);
    return S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`;
  }

  function ensureCharts() {
    if (charts) return;
    charts = [echarts.init($('chart-mail-cash')), echarts.init($('chart-mail-orders'))];
    // Clicking a point selects it; clicking the same point again clears the selection.
    charts.forEach(c => c.getZr().on('click', ev => {
      const k = last ? CN.charts.pointAt(c, ev, last.keys) : null;
      if (k === null) return;
      S.sel = S.sel === k ? null : k;
      render();
    }));
    const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
    charts.forEach(c => ro.observe(c.getDom()));
  }

  /* ---------- Mail Details ---------- */

  // What the table lists, and where Back and the CSV name point: { match(i), phrase, hash, back,
  // backLabel, file, completed (count orders completed, as the Mail Order cards do, rather than
  // order numbers) }. The Vendors & Products page opens the same table for its own selection.
  let listed = null;

  // The Mail Order page's own drill-through: its date range and selected point.
  function mailDetail() {
    const bucket = M.bucket[S.g];
    const scope = S.sel !== null ? F.iso(S.sel) : `${F.iso(S.from)}_to_${F.iso(S.to)}`;
    return {
      match: i => inRange(i) && (S.sel === null || bucket[i] === S.sel),
      phrase: scopePhrase(),
      hash: `#/mail/details?${toParams()}`,
      back: `#/mail?${toParams()}`,
      backLabel: 'Back to Mail Order',
      file: `mail-details_${scope}.csv`,
      completed: true,
    };
  }

  // The mail order lines behind a view: one row per date, order, vendor, product and sales person,
  // with quantities and cash summed. Power BI's table adds up Payment Amount instead, which repeats
  // an order's whole total on each of its lines.
  function detail(opts) {
    listed = opts;
    if (!M) {
      table.set([]);
      $('mail-details-context').textContent = problem;
      $('mail-details-export').disabled = true;
      return;
    }
    const groups = new Map();
    const orders = new Set();
    let completed = 0;
    for (let i = 0; i < M.n; i++) {
      if (!opts.match(i)) continue;
      completed += M.orders[i];
      if (!isLine(i)) continue;
      if (M.order[i] >= 0) orders.add(M.order[i]);
      const k = `${M.day[i]}|${M.order[i]}|${M.vendor[i]}|${M.product[i]}|${M.person[i]}`;
      let r = groups.get(k);
      if (!r) {
        groups.set(k, r = {
          day: M.day[i], order: label('order', M.order[i]), vendor: label('vendor', M.vendor[i]),
          product: label('product', M.product[i]), person: label('person', M.person[i]), units: 0, cash: 0,
        });
      }
      r.units += M.units[i];
      r.cash += M.amount[i];
    }
    table.set([...groups.values()]);
    const count = opts.completed ? F.count(completed, 'order completed', 'orders completed') : F.count(orders.size, 'order', 'orders');
    $('mail-details-context').textContent = `${opts.phrase} · ${count} · ${F.count(table.length, 'row', 'rows')}`;
    $('mail-details-export').disabled = !table.length;
    $('mail-details-back').href = opts.back;
    $('mail-details-back').setAttribute('aria-label', opts.backLabel);
    if (location.hash === opts.hash) return;
    try { history.replaceState(null, '', opts.hash); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const p = new URLSearchParams();
    p.set('range', S.preset);
    if (S.preset === 'custom') {
      p.set('from', F.iso(S.from));
      p.set('to', F.iso(S.to));
    }
    p.set('g', S.g);
    if (S.sel !== null) p.set('sel', F.iso(S.sel));
    return p.toString();
  }

  function applyParams(p) {
    if (GRAN[p.get('g')]) S.g = p.get('g');
    const range = p.get('range');
    const from = F.fromIso(p.get('from')), to = F.fromIso(p.get('to'));
    if (PRESETS[range] && range !== 'custom') {
      S.preset = range;
      [S.from, S.to] = presetRange(range);
    } else if (from !== null && to !== null) {
      S.preset = 'custom';
      S.from = Math.min(from, to);
      S.to = Math.max(from, to);
    }
    S.sel = F.fromIso(p.get('sel'));
  }

  function saveHash() {
    const url = `#/mail?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('mail-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('mail-from').value), b = F.fromIso($('mail-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('mail-from').addEventListener('change', onDate);
    $('mail-to').addEventListener('change', onDate);
    $('mail-granularity').addEventListener('change', e => {
      S.g = e.target.value;
      S.sel = null;
      render();
    });
    $('mail-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel !== null && document.body.dataset.view === 'mail') { S.sel = null; render(); }
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-mail'))).observe($('mail-kpis'));
    $('mail-details-btn').addEventListener('click', () => { location.hash = '#/mail/details?' + toParams(); });
    table = CN.table.create({ table: 'mail-details-table', more: 'mail-details-more' }, DETAIL_COLUMNS);
    $('mail-details-export').addEventListener('click', () => table.download(listed.file));
  }

  function load(book) {
    M = book.mail;
    problem = book.mailProblem;
    if (M && M.minDay === null) {
      problem = `The "${M.sheet}" sheet has no readable dates in its Delivery Date column.`;
      M = null;
    }
    $('mail-content').hidden = !M;
    $('mail-problem').hidden = Boolean(M);
    $('mail-problem').textContent = M ? '' : `${problem} The Mail Order page needs that sheet, with the columns ` +
      'Delivery Date, Delivery Order (D.O.) No., First Name, Product Code / Name, Quantity, Total and Order Qty.';
    if (!M) return;
    Object.assign(S, { preset: 'last4', g: 'weekly', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['mail-from', 'mail-to']) {
      $(id).min = F.iso(M.minDay);
      $(id).max = F.iso(M.maxDay);
    }
  }

  // v: 'mail' for the charts, 'details' for the order lines behind them.
  function show(params, v) {
    if (M) applyParams(params);
    if (v === 'details') {
      detail(M ? mailDetail() : {});
    } else if (M) {
      ensureCharts();
      render();
      charts.forEach(c => c.resize());
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const round = v => Math.round(v * 100) / 100;
    return {
      keys: r.keys.map(F.iso), cash: r.cashSeries.map(round), orders: r.orderSeries.map(round),
      kpi: { cash: round(r.cash), orders: round(r.orders), vendor: r.top && [r.top.label, round(r.top.value)] },
    };
  }

  CN.mail = { init, load, show, detail, snapshot };
})(window.CashNow = window.CashNow || {});
