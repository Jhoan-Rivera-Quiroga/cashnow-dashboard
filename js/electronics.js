/* Electronics page: the phones and tablets bought. Power BI shows one table; this page adds the
   cards and the chart by model that the report's spec suggests. Clicking a model filters the cards
   and the table. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const PRESETS = CN.ranges.PRESETS;
  // Power BI's table shows only the year of the date, which merges a seller's sales of one model
  // within a year; here each day is its own row.
  const TABLE_COLUMNS = [
    { key: 'day', label: 'Collection Date', type: 'day' },
    { key: 'vendor', label: 'First Name', type: 'text' },
    { key: 'model', label: 'Marketing Name', type: 'text' },
    { key: 'units', label: 'Quantity', type: 'num' },
    { key: 'paid', label: 'Amount Paid', type: 'money' },
  ];

  let E = null, problem = null; // electronics rows from CN.data, or null and why there are none
  let chart = null, table = null;
  const S = { preset: 'last4', from: 0, to: 0, sel: null }; // sel: { key, label } of a Marketing Name

  const lower = s => s.toLowerCase();
  const modelLabel = code => (code < 0 ? '(Blank)' : E.labels.model[code]);
  const presetRange = id => CN.ranges.range(id, E.minDay, E.maxDay);
  const inRange = i => E.day[i] >= S.from && E.day[i] <= S.to;
  const picked = i => !S.sel || lower(modelLabel(E.model[i])) === S.sel.key;

  // One pass: what each model was paid (date range only) and the cards and table, which also
  // respect the selected model. Table rows are a day's devices of one model from one seller.
  function render() {
    syncControls();
    const L = E.labels;
    const byModel = new Float64Array(L.model.length + 1); // the last slot: no model
    const groups = new Map();
    let units = 0, paid = 0;
    for (let i = 0; i < E.n; i++) {
      if (!inRange(i)) continue;
      const m = E.model[i];
      byModel[m >= 0 ? m : L.model.length] += E.amount[i];
      if (!picked(i)) continue;
      units += E.units[i];
      paid += E.amount[i];
      const k = `${E.day[i]}|${E.vendor[i]}|${m}`;
      let r = groups.get(k);
      if (!r) {
        groups.set(k, r = { day: E.day[i], vendor: E.vendor[i] < 0 ? '' : L.vendor[E.vendor[i]], model: m < 0 ? '' : L.model[m], units: 0, paid: 0 });
      }
      r.units += E.units[i];
      r.paid += E.amount[i];
    }

    setKpi('elec-kpi-units', F.int(units), `${F.num(units)} devices bought`);
    setKpi('elec-kpi-paid', '$' + F.short(paid), F.money(paid));
    setKpi('elec-kpi-avg', units ? F.money(paid / units) : '–', units ? 'Amount paid ÷ devices bought' : '');
    CN.charts.fitKpis($('view-electronics'));

    const models = [];
    for (let c = 0; c < byModel.length; c++) {
      if (Math.abs(byModel[c]) >= 0.005) models.push({ label: modelLabel(c < L.model.length ? c : -1), value: byModel[c] });
    }
    models.forEach(it => { it.key = lower(it.label); });
    models.sort((a, b) => b.value - a.value);
    CN.charts.bars(chart, models, { selKey: S.sel ? S.sel.key : null, empty: 'No electronics bought in this date range', hint: 'Click to filter the table' });

    table.set([...groups.values()]);
    $('elec-context').textContent = [rangePhrase(), S.sel ? S.sel.label : '', F.count(table.length, 'row', 'rows')].filter(Boolean).join(' · ');
    $('elec-export').disabled = !table.length;
    $('elec-selection').hidden = !S.sel;
    if (S.sel) $('elec-selection-label').textContent = S.sel.label;
    saveHash();
  }

  function setKpi(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.closest('.kpi').title = title || '';
  }

  function syncControls() {
    $('elec-from').value = F.iso(S.from);
    $('elec-to').value = F.iso(S.to);
    $('elec-preset').value = S.preset;
  }

  const rangePhrase = () => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);

  function ensureChart() {
    if (chart) return;
    chart = echarts.init($('chart-elec-models'));
    // Clicking a selected model again clears the selection.
    chart.on('click', p => {
      const key = lower(p.name);
      S.sel = S.sel && S.sel.key === key ? null : { key, label: p.name };
      render();
    });
    new ResizeObserver(() => chart.resize()).observe(chart.getDom().parentElement);
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const p = new URLSearchParams();
    p.set('range', S.preset);
    if (S.preset === 'custom') {
      p.set('from', F.iso(S.from));
      p.set('to', F.iso(S.to));
    }
    if (S.sel) p.set('model', S.sel.label);
    return p.toString();
  }

  function applyParams(p) {
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
    const model = p.get('model');
    S.sel = model ? { key: lower(model), label: model } : null;
  }

  function saveHash() {
    const url = `#/electronics?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('elec-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('elec-from').value), b = F.fromIso($('elec-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('elec-from').addEventListener('change', onDate);
    $('elec-to').addEventListener('change', onDate);
    $('elec-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'electronics') { S.sel = null; render(); }
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-electronics'))).observe($('elec-kpis'));
    table = CN.table.create({ table: 'elec-table', more: 'elec-more' }, TABLE_COLUMNS);
    $('elec-export').addEventListener('click', () => table.download(`electronics_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`));
  }

  function load(book) {
    E = book.electronics;
    problem = book.electronicsProblem;
    if (E && E.minDay === null) {
      problem = `The "${E.sheet}" sheet has no readable dates in its Collection Date column.`;
      E = null;
    }
    $('elec-content').hidden = !E;
    $('elec-problem').hidden = Boolean(E);
    $('elec-problem').textContent = E ? '' : `${problem} The Electronics page needs that sheet, with the columns ` +
      'Collection Date, First Name, Marketing Name, Quantity and Comments (the amount paid).';
    if (!E) return;
    Object.assign(S, { preset: 'last4', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['elec-from', 'elec-to']) {
      $(id).min = F.iso(E.minDay);
      $(id).max = F.iso(E.maxDay);
    }
  }

  function show(params) {
    if (!E) return;
    applyParams(params);
    ensureChart();
    render();
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const opts = chart.getOption();
    const round = v => Math.round(v * 100) / 100;
    return {
      cards: ['elec-kpi-units', 'elec-kpi-paid', 'elec-kpi-avg'].map(id => $(id).textContent),
      models: opts.yAxis && opts.yAxis[0].data ? opts.yAxis[0].data.map((m, i) => [m, round(opts.series[0].data[i].value)]) : [],
      rows: table.length,
      total: $('elec-table').tFoot.querySelector('[data-total="paid"]').textContent,
    };
  }

  CN.electronics = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
