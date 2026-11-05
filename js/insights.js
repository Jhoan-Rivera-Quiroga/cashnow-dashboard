/* Insights page: the products, vendors and categories the cash went to, mirroring the Power BI page
   of the same name. Clicking a product, a vendor or a category filters the other charts to it, and
   Details lists the pick-ups behind the view in the Pick Up Detail table. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const KINDS = { product: 'Product', vendor: 'Vendor', category: 'Category' }; // address parameter: name
  const PRESETS = CN.ranges.PRESETS;
  const CLICK = 'Click to filter the other charts';

  let P = null; // pick-up columns from CN.data
  let keys = null; // lowercased labels of each field, to match the selection on
  let charts = null;
  const S = { preset: 'last4', from: 0, to: 0, sel: null }; // sel: { kind, key, label }

  const lower = s => s.toLowerCase();
  const presetRange = id => CN.ranges.range(id, P.minDay, P.maxDay);
  const inRange = d => d >= S.from && d <= S.to;
  const picked = (kind, code) => !S.sel || S.sel.kind !== kind || (code >= 0 ? keys[kind][code] : '(blank)') === S.sel.key;

  // Each chart is filtered by what's selected in the others and shows its own selection highlighted,
  // as in Power BI. The two product charts share the product selection.
  function compute() {
    const L = P.labels;
    const cash = new Float64Array(L.product.length), units = new Float64Array(L.product.length);
    const vendors = new Float64Array(L.vendor.length);
    const categories = new Float64Array(L.category.length + 1); // the last slot: no category
    let lines = 0;
    for (let i = 0; i < P.n; i++) {
      if (!inRange(P.day[i])) continue;
      const pr = P.product[i], ve = P.vendor[i], ca = P.category[i], a = P.amount[i];
      const okProduct = picked('product', pr), okVendor = picked('vendor', ve), okCategory = picked('category', ca);
      if (okVendor && okCategory && pr >= 0) {
        cash[pr] += a;
        units[pr] += P.units[i];
      }
      if (okProduct && okCategory && ve >= 0) vendors[ve] += a;
      if (okProduct && okVendor) categories[ca >= 0 ? ca : L.category.length] += a;
      if (okProduct && okVendor && okCategory) lines++;
    }
    const top = CN.charts.ranked;
    return {
      cash: top(cash, L.product, 15),
      units: top(units, L.product, 15),
      vendors: top(vendors, L.vendor, 10),
      categories: top(categories, [...L.category, '(Blank)']),
      lines,
    };
  }

  /* ---------- page ---------- */

  function render() {
    const r = compute();
    syncControls();
    const sel = kind => (S.sel && S.sel.kind === kind ? S.sel.key : null);
    const none = emptyPhrase();
    CN.charts.bars(charts.cash, r.cash, { selKey: sel('product'), empty: none, hint: CLICK });
    CN.charts.bars(charts.units, r.units, { selKey: sel('product'), empty: none, hint: CLICK, format: F.num, unit: ' units' });
    CN.charts.bars(charts.vendors, r.vendors, { selKey: sel('vendor'), empty: none, hint: CLICK });
    CN.charts.bars(charts.category, P.hasCategory ? r.categories : [], {
      selKey: sel('category'), hint: CLICK,
      empty: P.hasCategory ? none : `The "${P.sheet}" sheet has no Category column.`,
    });
    const btn = $('ins-details-btn');
    btn.disabled = !r.lines;
    btn.title = r.lines ? `List the pick-ups for ${S.sel ? selectionPhrase() + ', ' : ''}${rangePhrase()}` : 'No pick-ups to list';
    $('ins-selection').hidden = !S.sel;
    if (S.sel) $('ins-selection-label').textContent = selectionPhrase();
    saveHash();
  }

  const selectionPhrase = () => `${KINDS[S.sel.kind]}: ${S.sel.label}`;
  const rangePhrase = () => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);
  const emptyPhrase = () => (S.sel ? `Nothing to show for ${S.sel.label} in this date range` : 'No pick-ups in this date range');

  function syncControls() {
    $('ins-from').value = F.iso(S.from);
    $('ins-to').value = F.iso(S.to);
    $('ins-preset').value = S.preset;
  }

  // Clicking a selected bar again clears the selection.
  function toggle(kind, label) {
    const key = lower(label);
    S.sel = S.sel && S.sel.kind === kind && S.sel.key === key ? null : { kind, key, label };
    render();
  }

  function ensureCharts() {
    if (charts) return;
    charts = {
      cash: echarts.init($('chart-ins-cash')),
      units: echarts.init($('chart-ins-units')),
      vendors: echarts.init($('chart-ins-vendors')),
      category: echarts.init($('chart-ins-category')),
    };
    charts.cash.on('click', p => toggle('product', p.name));
    charts.units.on('click', p => toggle('product', p.name));
    charts.vendors.on('click', p => toggle('vendor', p.name));
    charts.category.on('click', p => toggle('category', p.name));
    const ro = new ResizeObserver(() => Object.values(charts).forEach(c => c.resize()));
    Object.values(charts).forEach(c => ro.observe(c.getDom().parentElement));
  }

  // The pick-ups behind the view, in the Pick Up Detail table.
  function details() {
    CN.pickups.detail({
      match: i => inRange(P.day[i]) && picked('product', P.product[i]) && picked('vendor', P.vendor[i]) &&
        picked('category', P.category[i]),
      phrase: `${rangePhrase()} · ${S.sel ? selectionPhrase() : 'All products'}`,
      hash: `#/insights/details?${toParams()}`,
      back: `#/insights?${toParams()}`,
      backLabel: 'Back to Insights',
      file: `pick-up-detail_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`,
    });
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const p = new URLSearchParams();
    p.set('range', S.preset);
    if (S.preset === 'custom') {
      p.set('from', F.iso(S.from));
      p.set('to', F.iso(S.to));
    }
    if (S.sel) p.set(S.sel.kind, S.sel.label);
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
    S.sel = null;
    for (const kind of Object.keys(KINDS)) {
      const label = p.get(kind);
      if (label && (kind !== 'category' || P.hasCategory)) S.sel = { kind, key: lower(label), label };
    }
  }

  function saveHash() {
    const url = `#/insights?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('ins-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('ins-from').value), b = F.fromIso($('ins-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('ins-from').addEventListener('change', onDate);
    $('ins-to').addEventListener('change', onDate);
    $('ins-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'insights') { S.sel = null; render(); }
    });
    $('ins-details-btn').addEventListener('click', () => { location.hash = '#/insights/details?' + toParams(); });
  }

  function load(book) {
    P = book.pickups;
    keys = { product: P.labels.product.map(lower), vendor: P.labels.vendor.map(lower), category: P.labels.category.map(lower) };
    Object.assign(S, { preset: 'last4', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['ins-from', 'ins-to']) {
      $(id).min = F.iso(P.minDay);
      $(id).max = F.iso(P.maxDay);
    }
  }

  // v: 'insights' for the charts, 'details' for the pick-ups behind them.
  function show(params, v) {
    applyParams(params);
    if (v === 'details') {
      details();
    } else {
      ensureCharts();
      render();
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const plain = items => items.map(it => [it.label, Math.round(it.value * 100) / 100]);
    return { cash: plain(r.cash), units: plain(r.units), vendors: plain(r.vendors), categories: plain(r.categories), lines: r.lines };
  }

  CN.insights = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
