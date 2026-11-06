/* Call Report page: the phone calls of each day, from the Comunication_Table sheet (one row per day
   with that day's counts). Power BI shows five cards and a trend of total calls; this page adds the
   answer rate and its trend, the average calls on each weekday, and a table of the days, as the
   report's spec suggests. Clicking a point or a weekday filters the rest of the page. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const { PRESETS, GRAN } = CN.ranges;
  const COUNTS = ['total', 'inbound', 'outbound', 'answered', 'missed'];
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const rate = (answered, inbound) => (inbound > 0 ? answered / inbound : null); // share of inbound calls answered
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  const TABLE_COLUMNS = [
    { key: 'day', label: 'Date', type: 'day' },
    { key: 'total', label: 'Total Calls', type: 'num' },
    { key: 'inbound', label: 'Inbound', type: 'num' },
    { key: 'outbound', label: 'Outbound', type: 'num' },
    { key: 'answered', label: 'Answered', type: 'num' },
    { key: 'missed', label: 'Missed', type: 'num' },
    { key: 'rate', label: 'Answer Rate', type: 'pct', total: rows => rate(sum(rows, 'answered'), sum(rows, 'inbound')) },
  ];

  let K = null, problem = null; // the sheet's days from CN.data, or null and why there are none
  let charts = null, table = null;
  let last = null; // latest compute() result
  // sel: { kind: 'point', key (a day, week or month) } or { kind: 'weekday', key (0 = Monday) }
  const S = { preset: 'last4', from: 0, to: 0, g: 'weekly', sel: null };

  const presetRange = id => CN.ranges.range(id, K.minDay, K.maxDay);
  const weekdayOf = d => (((d - F.EPOCH + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  const plural = w => WEEKDAYS[w] + 's';
  const add = (t, i) => {
    t.total += K.total[i];
    t.inbound += K.inbound[i];
    t.answered += K.answered[i];
  };

  // One pass over the date range. The trends leave out the other weekdays when one is selected and the
  // weekday chart the other points when a point is selected, as in Power BI; the cards and the table
  // respect either.
  function compute() {
    const bucket = K.bucket[S.g];
    const point = S.sel && S.sel.kind === 'point' ? S.sel.key : null;
    const wday = S.sel && S.sel.kind === 'weekday' ? S.sel.key : null;
    const trend = new Map();
    const week = WEEKDAYS.map(() => ({ days: 0, total: 0, inbound: 0, answered: 0 }));
    const sums = { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0 };
    const rows = [];
    for (let i = 0; i < K.n; i++) {
      const d = K.day[i];
      if (d < S.from || d > S.to) continue;
      const b = bucket[i], w = weekdayOf(d);
      if (wday === null || w === wday) {
        let t = trend.get(b);
        if (!t) trend.set(b, t = { total: 0, inbound: 0, answered: 0 });
        add(t, i);
      }
      if (point === null || b === point) {
        week[w].days++;
        add(week[w], i);
      }
      if ((point !== null && b !== point) || (wday !== null && w !== wday)) continue;
      const r = { day: d };
      for (const f of COUNTS) {
        r[f] = K[f][i];
        sums[f] += r[f];
      }
      r.rate = rate(r.answered, r.inbound);
      rows.push(r);
    }
    const keys = [...trend.keys()].sort((a, b) => a - b);
    return {
      keys, rows, sums,
      totals: keys.map(k => trend.get(k).total),
      rates: keys.map(k => rate(trend.get(k).answered, trend.get(k).inbound)),
      weekdays: week.map((t, w) => ({
        label: WEEKDAYS[w], key: WEEKDAYS[w].toLowerCase(), w, days: t.days,
        value: t.days ? t.total / t.days : 0, rate: rate(t.answered, t.inbound),
      })).filter(t => t.days),
    };
  }

  /* ---------- page ---------- */

  function render() {
    let r = compute();
    // A point or weekday that the new dates or Dynamic Date don't have any more.
    if (S.sel && (S.sel.kind === 'point' ? !r.keys.includes(S.sel.key) : !r.weekdays.some(t => t.w === S.sel.key))) {
      S.sel = null;
      r = compute();
    }
    last = r;
    syncControls();
    const c = r.sums, days = r.rows.length, answered = rate(c.answered, c.inbound);
    const share = (part, whole, of) => (whole ? `${F.pct(part / whole)} of ${of}` : '');
    setKpi('calls-kpi-total', F.int(c.total), `${F.count(c.total, 'call', 'calls')} over ${F.count(days, 'day', 'days')}`);
    $('calls-kpi-daily').textContent = days > 1 ? `${F.int(c.total / days)} a day` : '';
    setKpi('calls-kpi-inbound', F.int(c.inbound), share(c.inbound, c.total, 'all calls'));
    setKpi('calls-kpi-outbound', F.int(c.outbound), share(c.outbound, c.total, 'all calls'));
    setKpi('calls-kpi-answered', F.int(c.answered), share(c.answered, c.inbound, 'inbound calls'));
    setKpi('calls-kpi-missed', F.int(c.missed), share(c.missed, c.inbound, 'inbound calls'));
    setKpi('calls-kpi-rate', answered === null ? '–' : F.pct(answered), answered === null ? 'No inbound calls'
      : `${F.int(c.answered)} of ${F.count(c.inbound, 'inbound call', 'inbound calls')} answered`);
    CN.charts.fitKpis($('view-calls'));

    const opts = { gran: GRAN[S.g], sel: S.sel && S.sel.kind === 'point' ? S.sel.key : null };
    CN.charts.line(charts.total, r.keys, r.totals, Object.assign({ unit: 'calls' }, opts));
    CN.charts.line(charts.rate, r.keys, r.rates, Object.assign({ pct: true, unit: 'of inbound calls answered' }, opts));
    CN.charts.bars(charts.weekday, r.weekdays, {
      selKey: S.sel && S.sel.kind === 'weekday' ? WEEKDAYS[S.sel.key].toLowerCase() : null,
      empty: 'No calls in this date range', hint: 'Click to filter the page', fill: true,
      format: v => `${F.int(v)} calls a day`, label: v => F.int(v), labelRoom: 44,
      detail: t => `Average of ${F.count(t.days, WEEKDAYS[t.w], plural(t.w))}` +
        (t.rate === null ? '' : ` · ${F.pct(t.rate)} of inbound calls answered`),
    });

    table.set(r.rows);
    $('calls-context').textContent = [rangePhrase(), S.sel ? selectionPhrase() : '', F.count(days, 'day', 'days')].filter(Boolean).join(' · ');
    $('calls-export').disabled = !days;
    $('calls-selection').hidden = !S.sel;
    if (S.sel) $('calls-selection-label').textContent = selectionPhrase();
    saveHash();
  }

  function setKpi(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.closest('.kpi').title = title || '';
  }

  function syncControls() {
    $('calls-from').value = F.iso(S.from);
    $('calls-to').value = F.iso(S.to);
    $('calls-preset').value = S.preset;
    $('calls-granularity').value = S.g;
  }

  const rangePhrase = () => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);
  const selectionPhrase = () => (S.sel.kind === 'point' ? GRAN[S.g].phrase(S.sel.key) : plural(S.sel.key));

  function ensureCharts() {
    if (charts) return;
    charts = { total: echarts.init($('chart-calls-total')), rate: echarts.init($('chart-calls-rate')), weekday: echarts.init($('chart-calls-weekday')) };
    // Clicking a point in either trend, or a weekday, selects it; clicking it again clears the selection.
    for (const c of [charts.total, charts.rate]) {
      c.getZr().on('click', ev => {
        const k = last ? CN.charts.pointAt(c, ev, last.keys) : null;
        if (k === null) return;
        S.sel = S.sel && S.sel.kind === 'point' && S.sel.key === k ? null : { kind: 'point', key: k };
        render();
      });
    }
    charts.weekday.on('click', p => {
      const w = WEEKDAYS.indexOf(p.name);
      if (w < 0) return;
      S.sel = S.sel && S.sel.kind === 'weekday' && S.sel.key === w ? null : { kind: 'weekday', key: w };
      render();
    });
    for (const c of Object.values(charts)) new ResizeObserver(() => c.resize()).observe(c.getDom());
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
    if (S.sel && S.sel.kind === 'point') p.set('sel', F.iso(S.sel.key));
    if (S.sel && S.sel.kind === 'weekday') p.set('weekday', WEEKDAYS[S.sel.key]);
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
    const point = F.fromIso(p.get('sel'));
    const w = WEEKDAYS.findIndex(n => n.toLowerCase() === String(p.get('weekday')).toLowerCase());
    S.sel = point !== null ? { kind: 'point', key: point } : w >= 0 ? { kind: 'weekday', key: w } : null;
  }

  function saveHash() {
    const url = `#/calls?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('calls-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('calls-from').value), b = F.fromIso($('calls-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('calls-from').addEventListener('change', onDate);
    $('calls-to').addEventListener('change', onDate);
    $('calls-granularity').addEventListener('change', e => {
      S.g = e.target.value;
      if (S.sel && S.sel.kind === 'point') S.sel = null; // a weekday stays selected
      render();
    });
    $('calls-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'calls') { S.sel = null; render(); }
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-calls'))).observe($('calls-kpis'));
    table = CN.table.create({ table: 'calls-table', more: 'calls-more' }, TABLE_COLUMNS);
    $('calls-export').addEventListener('click', () => table.download(`calls_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`));
  }

  function load(book) {
    K = book.calls;
    problem = book.callsProblem;
    if (K && K.minDay === null) {
      problem = `The "${K.sheet}" sheet has no readable dates in its Date column.`;
      K = null;
    }
    $('calls-content').hidden = !K;
    $('calls-problem').hidden = Boolean(K);
    $('calls-problem').textContent = K ? '' : `${problem} The Call Report page needs that sheet, with the columns ` +
      'Date, Total Calls, Total Inbound, Total Outbound, Answered and Missed.';
    if (!K) return;
    Object.assign(S, { preset: 'last4', g: 'weekly', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['calls-from', 'calls-to']) {
      $(id).min = F.iso(K.minDay);
      $(id).max = F.iso(K.maxDay);
    }
  }

  function show(params) {
    if (!K) return;
    applyParams(params);
    ensureCharts();
    render();
    Object.values(charts).forEach(c => c.resize());
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const round = v => (v === null ? null : Math.round(v * 1e4) / 1e4);
    return {
      keys: r.keys.map(F.iso), totals: r.totals, rates: r.rates.map(round),
      weekdays: r.weekdays.map(t => [t.label, t.days, round(t.value), round(t.rate)]),
      cards: Object.assign({}, r.sums, { rate: round(rate(r.sums.answered, r.sums.inbound)), days: r.rows.length }),
      shown: ['calls-kpi-total', 'calls-kpi-daily', 'calls-kpi-inbound', 'calls-kpi-outbound', 'calls-kpi-answered', 'calls-kpi-missed', 'calls-kpi-rate']
        .map(id => $(id).textContent),
    };
  }

  CN.calls = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
