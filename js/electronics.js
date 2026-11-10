/* Electronics page: the phones and tablets bought. Power BI shows one table; this page adds the
   cards and the chart by model that the report's spec suggests. Clicking a model filters the cards
   and the table. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const R = CN.ranges;
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
  let dates = null; // the Date and Range controls
  const S = Object.assign(R.noDates(), { sel: null }); // sel: { key, label } of a Marketing Name
  let lo = 1, hi = 0; // the days the dates cover; none before a date is picked

  const lower = s => s.toLowerCase();
  const modelLabel = code => (code < 0 ? '(Blank)' : E.labels.model[code]);
  const inRange = i => E.day[i] >= lo && E.day[i] <= hi;
  const picked = i => !S.sel || lower(modelLabel(E.model[i])) === S.sel.key;

  // One pass: what each model was paid (date range only) and the cards and table, which also
  // respect the selected model. Table rows are a day's devices of one model from one seller.
  function render() {
    const dated = R.picked(S);
    if (!dated) S.sel = null;
    [lo, hi] = R.span(S, E.minDay, E.maxDay) || [1, 0];
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

    if (dated) {
      setKpi('elec-kpi-units', F.int(units), `${F.num(units)} devices bought`);
      setKpi('elec-kpi-paid', '$' + F.short(paid), F.money(paid));
      setKpi('elec-kpi-avg', units ? F.money(paid / units) : '–', units ? 'Amount paid ÷ devices bought' : '');
    } else {
      for (const id of ['elec-kpi-units', 'elec-kpi-paid', 'elec-kpi-avg']) setKpi(id, '–', R.NO_DATES);
    }
    CN.charts.fitKpis($('view-electronics'));

    const models = [];
    for (let c = 0; c < byModel.length; c++) {
      if (Math.abs(byModel[c]) >= 0.005) models.push({ label: modelLabel(c < L.model.length ? c : -1), value: byModel[c] });
    }
    models.forEach(it => { it.key = lower(it.label); });
    models.sort((a, b) => b.value - a.value);
    CN.charts.bars(chart, models, {
      selKey: S.sel ? S.sel.key : null, hint: 'Click to filter the table',
      empty: dated ? 'No electronics bought in this date range' : R.NO_DATES,
    });

    table.set([...groups.values()]);
    $('elec-context').textContent = !dated ? R.NO_DATES
      : [rangePhrase(), S.sel ? S.sel.label : '', F.count(table.length, 'row', 'rows')].filter(Boolean).join(' · ');
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
    dates.sync();
  }

  const rangePhrase = () => R.phrase(S, E.minDay, E.maxDay);

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
    R.toParams(p, S);
    if (S.sel) p.set('model', S.sel.label);
    return p.toString();
  }

  function applyParams(p) {
    R.applyParams(p, S, E.minDay, E.maxDay);
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
    dates = R.controls({ from: 'elec-from', to: 'elec-to', preset: 'elec-preset' }, S, () => [E.minDay, E.maxDay], render);
    $('elec-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'electronics') { S.sel = null; render(); }
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-electronics'))).observe($('elec-kpis'));
    table = CN.table.create({ table: 'elec-table', more: 'elec-more' }, TABLE_COLUMNS);
    $('elec-export').addEventListener('click', () => table.download(`electronics_${F.iso(lo)}_to_${F.iso(hi)}.csv`));
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
    Object.assign(S, R.noDates(), { sel: null });
    dates.limit(E.minDay, E.maxDay);
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
      total: ($('elec-table').tFoot.querySelector('[data-total="paid"]') || {}).textContent || null,
    };
  }

  CN.electronics = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
