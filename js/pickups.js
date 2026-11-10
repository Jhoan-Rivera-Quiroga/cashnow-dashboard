/* Pick Ups page (KPI cards, two trend charts, click a point to filter) and its
   Pick Up Detail drill-through, mirroring the Power BI pages of the same names. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const { PRESETS, GRAN } = CN.ranges;

  let P = null; // pick-up columns from CN.data
  let charts = null;
  let last = null; // latest compute() result
  let table = null; // the Pick Up Detail table
  // The page opens with no dates and shows numbers once one is picked. A date left blank (null) leaves
  // that end open: the first or last day in the data.
  const S = { preset: '', from: null, to: null, g: 'monthly', states: null, sel: null };
  const NO_DATES = 'Select a date to see data';
  let blank = false; // the charts show NO_DATES

  const label = (field, code) => (code < 0 ? '' : P.labels[field][code]);
  const stateLabel = code => (code < 0 ? '(Blank)' : P.labels.state[code]);

  const presetRange = id => CN.ranges.range(id, P.minDay, P.maxDay);
  const noDates = () => S.from === null && S.to === null;
  const span = () => [S.from === null ? P.minDay : S.from, S.to === null ? P.maxDay : S.to];

  // A test for the rows in the current dates and states; nothing passes before a date is picked.
  function scope() {
    if (noDates()) return () => false;
    const [a, b] = span();
    return i => P.day[i] >= a && P.day[i] <= b && (!S.states || S.states.has(P.state[i]));
  }

  // One pass over the rows: the trend series (date range + state only) and the KPIs,
  // which also respect the selected point.
  function compute() {
    const inScope = scope();
    const bucket = P.bucket[S.g];
    const series = new Map();
    const orders = new Set();
    const byProduct = new Float64Array(P.labels.product.length);
    const byDriver = new Float64Array(P.labels.driver.length);
    const byVendor = new Float64Array(P.labels.vendor.length);
    let cash = 0;
    for (let i = 0; i < P.n; i++) {
      if (!inScope(i)) continue;
      const b = bucket[i], a = P.amount[i], o = P.order[i];
      let t = series.get(b);
      if (!t) series.set(b, t = { cash: 0, orders: new Set() });
      t.cash += a;
      if (o >= 0) t.orders.add(o);
      if (S.sel !== null && b !== S.sel) continue;
      cash += a;
      if (o >= 0) orders.add(o);
      if (P.product[i] >= 0) byProduct[P.product[i]] += a;
      if (P.driver[i] >= 0) byDriver[P.driver[i]] += a;
      if (P.vendor[i] >= 0) byVendor[P.vendor[i]] += a;
    }
    const keys = [...series.keys()].sort((x, y) => x - y);
    return {
      keys,
      cashSeries: keys.map(k => series.get(k).cash),
      pickSeries: keys.map(k => series.get(k).orders.size),
      cash,
      pickups: orders.size,
      top: { product: top(byProduct, 'product'), driver: top(byDriver, 'driver'), vendor: top(byVendor, 'vendor') },
    };
  }

  function top(sums, field) {
    let best = -1;
    for (let c = 0; c < sums.length; c++) if (sums[c] > 0 && (best < 0 || sums[c] > sums[best])) best = c;
    return best < 0 ? null : { label: P.labels[field][best], value: sums[best] };
  }

  /* ---------- page ---------- */

  function render() {
    syncControls();
    if (noDates()) {
      renderEmpty();
    } else {
      let r = compute();
      if (S.sel !== null && !r.keys.includes(S.sel)) {
        S.sel = null;
        r = compute();
      }
      last = r;
      renderKpis(r);
      renderCharts(r);
    }
    $('selection-bar').hidden = S.sel === null;
    if (S.sel !== null) $('selection-label').textContent = GRAN[S.g].phrase(S.sel);
    saveHash();
  }

  // Before a date is picked: no numbers, and the prompt in both charts.
  function renderEmpty() {
    last = null;
    S.sel = null;
    for (const id of ['kpi-cash', 'kpi-pickups', 'kpi-avg']) setKpi(id, '–', NO_DATES);
    for (const id of ['kpi-product', 'kpi-driver', 'kpi-vendor']) setTop(id, null);
    const btn = $('details-btn');
    btn.disabled = true;
    btn.title = NO_DATES;
    charts.forEach(c => c.setOption(CN.charts.empty(NO_DATES, 16), true));
    blank = true;
    CN.charts.fitKpis($('view-pickups'));
  }

  function syncControls() {
    $('date-from').value = S.from === null ? '' : F.iso(S.from);
    $('date-to').value = S.to === null ? '' : F.iso(S.to);
    $('date-preset').value = S.preset;
    $('granularity').value = S.g;
    $('state-summary').textContent = stateSummary();
  }

  function setKpi(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.closest('.kpi').title = title || '';
  }

  function setTop(id, t) {
    setKpi(id, t ? t.label : '–', t ? `${t.label}: ${F.money(t.value)}` : '');
    $(id + '-amt').textContent = t ? '$' + F.short(t.value) : '';
  }

  function renderKpis(r) {
    setKpi('kpi-cash', '$' + F.short(r.cash), F.money(r.cash));
    setTop('kpi-product', r.top.product);
    setTop('kpi-driver', r.top.driver);
    setTop('kpi-vendor', r.top.vendor);
    setKpi('kpi-pickups', F.int(r.pickups), `${F.int(r.pickups)} distinct order numbers`);
    const avg = r.pickups ? r.cash / r.pickups : null;
    setKpi('kpi-avg', avg === null ? '–' : '$' + avg.toFixed(1), avg === null ? '' : `${F.money(avg)} per pick-up`);
    const btn = $('details-btn');
    btn.disabled = r.pickups === 0 && r.cash === 0;
    btn.title = `List the pick-ups for ${scopePhrase()}`;
    CN.charts.fitKpis($('view-pickups'));
  }

  function ensureCharts() {
    if (charts) return;
    charts = [echarts.init($('chart-cash')), echarts.init($('chart-pickups'))];
    charts.forEach(c => c.getZr().on('click', ev => onChartClick(c, ev)));
    const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
    ro.observe($('chart-cash'));
    ro.observe($('chart-pickups'));
  }

  // Clicking a point selects it; clicking the same point again clears the selection.
  function onChartClick(chart, ev) {
    const k = last ? CN.charts.pointAt(chart, ev, last.keys) : null;
    if (k === null) return;
    S.sel = S.sel === k ? null : k;
    render();
  }

  function renderCharts(r) {
    if (blank) {
      charts.forEach(c => c.clear()); // drop the prompt, which a trend's update would otherwise keep
      blank = false;
    }
    const opts = { gran: GRAN[S.g], sel: S.sel };
    CN.charts.line(charts[0], r.keys, r.cashSeries, Object.assign({ money: true }, opts));
    CN.charts.line(charts[1], r.keys, r.pickSeries, Object.assign({ unit: 'pick-ups' }, opts));
  }

  function scopePhrase() {
    if (noDates()) return 'No dates selected';
    if (S.sel !== null) return GRAN[S.g].phrase(S.sel);
    const [a, b] = span();
    return a === b ? F.dayLong(a) : `${F.dayLong(a)} – ${F.dayLong(b)}`;
  }

  /* ---------- State slicer ---------- */

  function stateItems() {
    const items = P.labels.state.map((name, code) => ({ code, name }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    if (P.state.includes(-1)) items.push({ code: -1, name: '(Blank)' });
    return items;
  }

  function buildStateOptions() {
    const box = $('state-options');
    box.textContent = '';
    for (const it of stateItems()) {
      const row = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(it.code);
      row.append(cb, it.name);
      box.append(row);
    }
  }

  function syncStateChecks() {
    const boxes = $('state-options').querySelectorAll('input');
    boxes.forEach(cb => { cb.checked = !S.states || S.states.has(+cb.value); });
    $('state-all').checked = !S.states;
    $('state-all').indeterminate = false;
  }

  // As in Power BI, ticking nothing means no State filter.
  function onStateChange() {
    const boxes = [...$('state-options').querySelectorAll('input')];
    const on = boxes.filter(b => b.checked).map(b => +b.value);
    S.states = on.length === 0 || on.length === boxes.length ? null : new Set(on);
    $('state-all').checked = on.length === boxes.length;
    $('state-all').indeterminate = on.length > 0 && on.length < boxes.length;
    render();
  }

  function stateSummary() {
    if (!S.states) return 'All';
    return S.states.size === 1 ? stateLabel([...S.states][0]) : `${S.states.size} selected`;
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const p = new URLSearchParams();
    if (!noDates()) {
      p.set('range', S.preset);
      if (S.preset === 'custom') {
        if (S.from !== null) p.set('from', F.iso(S.from));
        if (S.to !== null) p.set('to', F.iso(S.to));
      }
    }
    p.set('g', S.g);
    if (S.states) p.set('state', [...S.states].map(stateLabel).join('|'));
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
    } else if (from !== null || to !== null) {
      S.preset = 'custom';
      S.from = from !== null && to !== null ? Math.min(from, to) : from;
      S.to = from !== null && to !== null ? Math.max(from, to) : to;
    }
    const st = p.get('state');
    if (st) {
      const want = new Set(st.toLowerCase().split('|'));
      const items = stateItems();
      const codes = items.filter(it => want.has(it.name.toLowerCase())).map(it => it.code);
      S.states = codes.length && codes.length < items.length ? new Set(codes) : null;
    } else {
      S.states = null;
    }
    S.sel = F.fromIso(p.get('sel'));
  }

  function saveHash() {
    const url = `#/pickups?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- Pick Up Detail ---------- */

  const DETAIL_COLUMNS = [
    { key: 'day', label: 'Date', type: 'day' },
    { key: 'order', label: 'Order Number', type: 'text' },
    { key: 'vendor', label: 'First_Name', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'product', label: 'Product_Code', type: 'text' },
    { key: 'units', label: 'Quantity', type: 'num' },
    { key: 'cash', label: 'Cash Spent', type: 'money' },
  ];
  // What the table lists, and where Back and the CSV name point: { match(i), phrase, hash, back,
  // backLabel, file }. The Insights page opens the same table for its own selection.
  let listed = null;

  // The Pick Ups page's own drill-through: its date range, states and selected point.
  function pickupsDetail() {
    const bucket = P.bucket[S.g];
    const inScope = scope();
    const [a, b] = span();
    return {
      match: i => inScope(i) && (S.sel === null || bucket[i] === S.sel),
      phrase: `${scopePhrase()} · State: ${stateSummary()}`,
      hash: `#/pickups/details?${toParams()}`,
      back: `#/pickups?${toParams()}`,
      backLabel: 'Back to Pick Ups',
      file: `pick-up-detail_${S.sel !== null ? F.iso(S.sel) : `${F.iso(a)}_to_${F.iso(b)}`}.csv`,
    };
  }

  // One row per date, order, vendor, city and product, with units and cash summed,
  // like the Power BI table.
  function detail(opts) {
    listed = opts;
    const groups = new Map();
    const orders = new Set();
    for (let i = 0; i < P.n; i++) {
      if (!opts.match(i)) continue;
      const k = `${P.day[i]}|${P.order[i]}|${P.vendor[i]}|${P.city[i]}|${P.product[i]}`;
      let r = groups.get(k);
      if (!r) {
        groups.set(k, r = {
          day: P.day[i], order: label('order', P.order[i]), vendor: label('vendor', P.vendor[i]),
          city: label('city', P.city[i]), product: label('product', P.product[i]), units: 0, cash: 0,
        });
      }
      r.units += P.units[i];
      r.cash += P.amount[i];
      if (P.order[i] >= 0) orders.add(P.order[i]);
    }
    table.set([...groups.values()]);
    $('details-context').textContent =
      `${opts.phrase} · ${F.count(orders.size, 'pick-up', 'pick-ups')} · ${F.count(table.length, 'row', 'rows')}`;
    $('details-export').disabled = !table.length;
    $('details-back').href = opts.back;
    $('details-back').setAttribute('aria-label', opts.backLabel);
    if (location.hash === opts.hash) return;
    try { history.replaceState(null, '', opts.hash); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('date-preset');
    const none = new Option('Select a range', ''); // shown until a range is picked
    none.disabled = true;
    none.hidden = true;
    preset.add(none);
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    // One date is enough: a blank one leaves that end open. Clearing both empties the page again.
    const onDate = () => {
      let a = F.fromIso($('date-from').value), b = F.fromIso($('date-to').value);
      if (a !== null && b !== null && a > b) [a, b] = [b, a];
      Object.assign(S, { preset: a === null && b === null ? '' : 'custom', from: a, to: b });
      render();
    };
    $('date-from').addEventListener('change', onDate);
    $('date-to').addEventListener('change', onDate);
    $('granularity').addEventListener('change', e => {
      S.g = e.target.value;
      S.sel = null;
      render();
    });
    $('state-options').addEventListener('change', onStateChange);
    $('state-all').addEventListener('change', e => {
      $('state-options').querySelectorAll('input').forEach(cb => { cb.checked = e.target.checked; });
      onStateChange();
    });
    document.addEventListener('click', e => {
      const box = $('state-filter');
      if (box.open && !box.contains(e.target)) box.open = false;
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-pickups'))).observe(document.querySelector('#view-pickups .kpis'));
    $('clear-selection').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.dataset.view === 'pickups' && S.sel !== null && P) { S.sel = null; render(); }
    });
    $('details-btn').addEventListener('click', () => { location.hash = '#/pickups/details?' + toParams(); });
    table = CN.table.create({ table: 'details-table', more: 'details-more' }, DETAIL_COLUMNS);
    $('details-export').addEventListener('click', () => table.download(listed.file));
  }

  function load(data) {
    P = data;
    Object.assign(S, { preset: '', from: null, to: null, g: 'monthly', states: null, sel: null });
    for (const id of ['date-from', 'date-to']) {
      $(id).min = F.iso(P.minDay);
      $(id).max = F.iso(P.maxDay);
    }
    buildStateOptions();
  }

  function show(v, params) {
    applyParams(params);
    syncStateChecks();
    if (v === 'details') {
      detail(pickupsDetail());
    } else {
      ensureCharts();
      render();
      charts.forEach(c => c.resize());
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const t = x => (x ? [x.label, Math.round(x.value * 100) / 100] : null);
    return {
      keys: r.keys.map(F.iso),
      cash: r.cashSeries.map(v => Math.round(v * 100) / 100),
      pickups: r.pickSeries,
      kpi: {
        cash: Math.round(r.cash * 100) / 100, pickups: r.pickups,
        avg: r.pickups ? Math.round((r.cash / r.pickups) * 10) / 10 : null,
        product: t(r.top.product), driver: t(r.top.driver), vendor: t(r.top.vendor),
      },
    };
  }

  CN.pickups = { init, load, show, detail, snapshot };
})(window.CashNow = window.CashNow || {});
