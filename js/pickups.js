/* Pick Ups page (KPI cards, two trend charts, click a point to filter) and its
   Pick Up Detail drill-through, mirroring the Power BI pages of the same names. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const LINE = '#6b007b';
  const PAGE = 500; // detail rows added per "Show more"

  const GRAN = {
    daily: { name: 'Daily', label: F.dayShort, phrase: F.dayLong },
    weekly: { name: 'Weekly', label: F.dayShort, phrase: s => 'Week of ' + F.dayLong(s) },
    monthly: { name: 'Monthly', label: F.month, phrase: F.monthLong },
  };

  // Ranges count back from the latest date in the file, so a new file opens on its recent months.
  const PRESETS = {
    month: { name: 'Latest month', months: 1 },
    last3: { name: 'Last 3 months', months: 3 },
    last4: { name: 'Last 4 months', months: 4 },
    last6: { name: 'Last 6 months', months: 6 },
    last12: { name: 'Last 12 months', months: 12 },
    ytd: { name: 'Year to date' },
    all: { name: 'All dates' },
    custom: { name: 'Custom' },
  };

  let P = null; // pick-up columns from CN.data
  let charts = null;
  let last = null; // latest compute() result
  let view = 'pickups';
  const S = { preset: 'last4', from: 0, to: 0, g: 'monthly', states: null, sel: null };
  const D = { rows: [], sort: 'day', dir: 1, shown: 0 };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const label = (field, code) => (code < 0 ? '' : P.labels[field][code]);
  const stateLabel = code => (code < 0 ? '(Blank)' : P.labels.state[code]);

  function presetRange(id) {
    const t = F.toDate(P.maxDay), y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
    const p = PRESETS[id];
    let from = P.minDay;
    if (p.months) from = F.fromYmd(y, m - p.months + 1, 1);
    else if (id === 'ytd') from = F.fromYmd(y, 1, 1);
    return [Math.max(from, P.minDay), P.maxDay];
  }

  function inScope(i) {
    const d = P.day[i];
    return d >= S.from && d <= S.to && (!S.states || S.states.has(P.state[i]));
  }

  // One pass over the rows: the trend series (date range + state only) and the KPIs,
  // which also respect the selected point.
  function compute() {
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
    let r = compute();
    if (S.sel !== null && !r.keys.includes(S.sel)) {
      S.sel = null;
      r = compute();
    }
    last = r;
    syncControls();
    renderKpis(r);
    renderCharts(r);
    $('selection-bar').hidden = S.sel === null;
    if (S.sel !== null) $('selection-label').textContent = GRAN[S.g].phrase(S.sel);
    saveHash();
  }

  function syncControls() {
    $('date-from').value = F.iso(S.from);
    $('date-to').value = F.iso(S.to);
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
    fitKpis();
  }

  // Shrink a card's value until it fits on one line, so long names like "RAY ALVARADO" stay readable.
  function fitKpis() {
    document.querySelectorAll('.kpi-value').forEach(el => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 12) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  function ensureCharts() {
    if (charts) return;
    charts = [echarts.init($('chart-cash')), echarts.init($('chart-pickups'))];
    charts.forEach(c => c.getZr().on('click', ev => onChartClick(c, ev)));
    const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
    ro.observe($('chart-cash'));
    ro.observe($('chart-pickups'));
  }

  // Clicking anywhere in a point's column selects it, like clicking a point in Power BI;
  // clicking the same point again clears the selection.
  function onChartClick(chart, ev) {
    if (!last || !last.keys.length) return;
    const pt = [ev.offsetX, ev.offsetY];
    if (!chart.containPixel({ gridIndex: 0 }, pt)) return;
    const x = chart.convertFromPixel({ gridIndex: 0 }, pt)[0];
    const k = last.keys[Math.max(0, Math.min(last.keys.length - 1, Math.round(x)))];
    S.sel = S.sel === k ? null : k;
    render();
  }

  function renderCharts(r) {
    charts[0].setOption(lineOption(r.keys, r.cashSeries, true));
    charts[1].setOption(lineOption(r.keys, r.pickSeries, false));
  }

  function lineOption(keys, values, isCash) {
    const g = GRAN[S.g];
    const sel = S.sel === null ? -1 : keys.indexOf(S.sel);
    const dim = sel >= 0;
    const inK = isCash && values.some(v => v >= 1000);
    const valueLabel = v => (inK ? (v / 1000).toFixed(1) + 'K' : F.int(v));
    return {
      animationDuration: 300,
      grid: { left: 52, right: 30, top: 34, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#d7b8d3' } },
        formatter: ps => {
          const p = ps.find(q => q.seriesIndex === 0);
          if (!p) return '';
          const v = isCash ? F.money(p.value) : `${F.int(p.value)} pick-ups`;
          return `${g.name} ${F.iso(keys[p.dataIndex])}<br><b>${v}</b><br><span style="color:#8a7a88">Click to filter</span>`;
        },
      },
      xAxis: {
        type: 'category',
        data: keys.map(g.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#d9c3d6' } },
        axisLabel: { color: '#6e5a6b', hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value', min: 0, splitNumber: 3, splitLine: { show: false },
          axisLabel: { color: '#6e5a6b', formatter: v => (inK ? v / 1000 + 'K' : F.int(v)) },
        },
        { type: 'value', min: 0, max: 1, show: false },
      ],
      series: [
        {
          type: 'line',
          data: values.map((v, i) => ({
            value: v,
            symbolSize: i === sel ? 12 : 7,
            itemStyle: { opacity: !dim || i === sel ? 1 : 0.3 },
            label: { color: !dim || i === sel ? '#000' : 'rgba(0, 0, 0, 0.3)' },
          })),
          symbol: 'circle',
          showAllSymbol: true,
          lineStyle: { color: LINE, width: 2.5, opacity: dim ? 0.45 : 1 },
          itemStyle: { color: LINE },
          label: { show: true, position: 'top', distance: 7, fontSize: 12, fontWeight: 700, formatter: p => valueLabel(p.value) },
          labelLayout: { hideOverlap: true },
          emphasis: { scale: 1.4 },
          z: 3,
        },
        { // band behind the selected point
          type: 'bar', yAxisIndex: 1, silent: true, z: 1, barWidth: '86%',
          data: keys.map((_, i) => (i === sel ? 1 : null)),
          itemStyle: { color: 'rgba(107, 0, 123, 0.13)', borderRadius: 6 },
        },
      ],
    };
  }

  function scopePhrase() {
    if (S.sel !== null) return GRAN[S.g].phrase(S.sel);
    return S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`;
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
    p.set('range', S.preset);
    if (S.preset === 'custom') {
      p.set('from', F.iso(S.from));
      p.set('to', F.iso(S.to));
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
    } else if (from !== null && to !== null) {
      S.preset = 'custom';
      S.from = Math.min(from, to);
      S.to = Math.max(from, to);
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
    const url = `#/${view === 'details' ? 'pickups/details' : 'pickups'}?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- Pick Up Detail ---------- */

  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const TEXT_COLS = new Set(['order', 'vendor', 'city', 'product']);
  const TIE_ORDER = ['day', 'order', 'vendor', 'city', 'product'];

  // One row per date, order, vendor, city and product, with units and cash summed,
  // like the Power BI table.
  function renderDetails() {
    const bucket = P.bucket[S.g];
    const groups = new Map();
    const orders = new Set();
    let units = 0, cash = 0;
    for (let i = 0; i < P.n; i++) {
      if (!inScope(i) || (S.sel !== null && bucket[i] !== S.sel)) continue;
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
      units += P.units[i];
      cash += P.amount[i];
      if (P.order[i] >= 0) orders.add(P.order[i]);
    }
    D.rows = [...groups.values()];
    sortRows();
    $('details-context').textContent =
      `${scopePhrase()} · State: ${stateSummary()} · ${F.int(orders.size)} pick-ups · ${F.int(D.rows.length)} rows`;
    $('details-units').textContent = F.num(units);
    $('details-cash').textContent = F.money(cash);
    $('details-export').disabled = !D.rows.length;
    redrawRows();
    saveHash();
  }

  function sortRows() {
    const keys = [D.sort, ...TIE_ORDER.filter(k => k !== D.sort)];
    D.rows.sort((a, b) => {
      for (let j = 0; j < keys.length; j++) {
        const k = keys[j];
        const c = TEXT_COLS.has(k) ? collator.compare(a[k], b[k]) : a[k] - b[k];
        if (c) return j === 0 ? c * D.dir : c;
      }
      return 0;
    });
    document.querySelectorAll('#details-table th[data-sort]').forEach(th => {
      th.setAttribute('aria-sort', th.dataset.sort !== D.sort ? 'none' : D.dir > 0 ? 'ascending' : 'descending');
    });
  }

  function redrawRows() {
    $('details-body').textContent = '';
    D.shown = 0;
    showMoreRows();
  }

  function showMoreRows() {
    const end = Math.min(D.rows.length, D.shown + PAGE);
    let html = '';
    for (let i = D.shown; i < end; i++) {
      const r = D.rows[i];
      html += `<tr><td>${F.iso(r.day)}</td><td>${esc(r.order)}</td><td>${esc(r.vendor)}</td><td>${esc(r.city)}</td>` +
        `<td>${esc(r.product)}</td><td class="num">${F.num(r.units)}</td><td class="num">${F.money(r.cash)}</td></tr>`;
    }
    $('details-body').insertAdjacentHTML('beforeend', html);
    D.shown = end;
    const left = D.rows.length - end;
    $('details-more').hidden = left <= 0;
    $('details-more').textContent = `Show ${F.int(Math.min(PAGE, left))} more (${F.int(left)} not shown)`;
  }

  // CSV of every detail row; a leading = + - @ gets a quote mark so Excel won't run it as a formula.
  function csvCell(v) {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  function exportCsv() {
    const lines = ['Date,Order Number,First_Name,City,Product_Code,Quantity,Cash Spent'];
    for (const r of D.rows) {
      lines.push([F.iso(r.day), csvCell(r.order), csvCell(r.vendor), csvCell(r.city), csvCell(r.product),
        r.units, r.cash.toFixed(2)].join(','));
    }
    const scope = S.sel !== null ? F.iso(S.sel) : `${F.iso(S.from)}_to_${F.iso(S.to)}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `pick-up-detail_${scope}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('date-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('date-from').value), b = F.fromIso($('date-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
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
    new ResizeObserver(fitKpis).observe(document.querySelector('.kpis'));
    $('clear-selection').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && view === 'pickups' && S.sel !== null && P) { S.sel = null; render(); }
    });
    $('details-btn').addEventListener('click', () => { location.hash = '#/pickups/details?' + toParams(); });
    $('details-back').addEventListener('click', e => {
      e.preventDefault();
      location.hash = '#/pickups?' + toParams();
    });
    $('details-more').addEventListener('click', showMoreRows);
    $('details-export').addEventListener('click', exportCsv);
    document.querySelectorAll('#details-table th[data-sort] button').forEach(b => b.addEventListener('click', () => {
      const k = b.parentElement.dataset.sort;
      D.dir = D.sort === k ? -D.dir : 1;
      D.sort = k;
      sortRows();
      redrawRows();
    }));
  }

  function load(data) {
    P = data;
    Object.assign(S, { preset: 'last4', g: 'monthly', states: null, sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['date-from', 'date-to']) {
      $(id).min = F.iso(P.minDay);
      $(id).max = F.iso(P.maxDay);
    }
    buildStateOptions();
  }

  function show(v, params) {
    view = v;
    applyParams(params);
    syncStateChecks();
    if (v === 'details') {
      renderDetails();
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

  CN.pickups = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
