/* Vendors & Products page: the mail-order vendors and products the cash went to, mirroring the Power
   BI page of the same name (the mail-order counterpart of Insights). Clicking a vendor or a product
   filters the other chart, and Details lists the order lines behind the view in the Mail Details
   table. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const KINDS = { vendor: 'Vendor', product: 'Product' }; // address parameter: name
  const R = CN.ranges;
  const CLICK = 'Click to filter the other chart';

  let M = null, problem = null; // mail order rows from CN.data, or null and why there are none
  let keys = null; // lowercased labels of each field, to match the selection on
  let charts = null;
  let dates = null; // the Date and Range controls
  const S = Object.assign(R.noDates(), { sel: null }); // sel: { kind, key, label }
  let lo = 1, hi = 0; // the days the dates cover; none before a date is picked

  const lower = s => s.toLowerCase();
  // Sets lo and hi from the dates, before a pass over the rows.
  const bound = () => { [lo, hi] = R.span(S, M.minDay, M.maxDay) || [1, 0]; };
  const inRange = i => M.day[i] >= lo && M.day[i] <= hi;
  const picked = (kind, code) => !S.sel || S.sel.kind !== kind || (code >= 0 && keys[kind][code] === S.sel.key);

  // Cash is the lines' Total, as on the Mail Order page. Each chart is filtered by the other chart's
  // selection and shows its own selection highlighted, as in Power BI.
  function compute() {
    bound();
    const L = M.labels;
    const vendors = new Float64Array(L.vendor.length), products = new Float64Array(L.product.length);
    let lines = 0;
    for (let i = 0; i < M.n; i++) {
      if (!inRange(i)) continue;
      const v = M.vendor[i], p = M.product[i], a = M.amount[i];
      const okVendor = picked('vendor', v), okProduct = picked('product', p);
      if (okProduct && v >= 0) vendors[v] += a;
      if (okVendor && p >= 0) products[p] += a;
      if (okVendor && okProduct && (v >= 0 || p >= 0)) lines++;
    }
    return { vendors: CN.charts.ranked(vendors, L.vendor, 10), products: CN.charts.ranked(products, L.product, 10), lines };
  }

  /* ---------- page ---------- */

  function render() {
    const dated = R.picked(S);
    if (!dated) S.sel = null;
    const r = compute();
    syncControls();
    const sel = kind => (S.sel && S.sel.kind === kind ? S.sel.key : null);
    const none = !dated ? R.NO_DATES : S.sel ? `Nothing to show for ${S.sel.label} in this date range` : 'No mail orders in this date range';
    CN.charts.bars(charts.vendors, r.vendors, { selKey: sel('vendor'), empty: none, hint: CLICK });
    CN.charts.bars(charts.products, r.products, { selKey: sel('product'), empty: none, hint: CLICK });
    const btn = $('ven-details-btn');
    btn.disabled = !r.lines;
    btn.title = !dated ? R.NO_DATES
      : r.lines ? `List the mail orders for ${S.sel ? selectionPhrase() + ', ' : ''}${rangePhrase()}` : 'No mail orders to list';
    $('ven-selection').hidden = !S.sel;
    if (S.sel) $('ven-selection-label').textContent = selectionPhrase();
    saveHash();
  }

  const selectionPhrase = () => `${KINDS[S.sel.kind]}: ${S.sel.label}`;
  const rangePhrase = () => R.phrase(S, M.minDay, M.maxDay);

  function syncControls() {
    dates.sync();
  }

  // Clicking a selected bar again clears the selection.
  function toggle(kind, label) {
    const key = lower(label);
    S.sel = S.sel && S.sel.kind === kind && S.sel.key === key ? null : { kind, key, label };
    render();
  }

  function ensureCharts() {
    if (charts) return;
    charts = { vendors: echarts.init($('chart-ven-vendors')), products: echarts.init($('chart-ven-products')) };
    charts.vendors.on('click', p => toggle('vendor', p.name));
    charts.products.on('click', p => toggle('product', p.name));
    const ro = new ResizeObserver(() => Object.values(charts).forEach(c => c.resize()));
    Object.values(charts).forEach(c => ro.observe(c.getDom().parentElement));
  }

  // The order lines behind the view, in the Mail Details table.
  function details() {
    if (!M) {
      CN.mail.detail({});
      return;
    }
    bound();
    const [a, b] = R.span(S, M.minDay, M.maxDay) || [M.minDay, M.maxDay];
    CN.mail.detail({
      match: i => inRange(i) && picked('vendor', M.vendor[i]) && picked('product', M.product[i]),
      phrase: `${rangePhrase()} · ${S.sel ? selectionPhrase() : 'All vendors and products'}`,
      hash: `#/vendors/details?${toParams()}`,
      back: `#/vendors?${toParams()}`,
      backLabel: 'Back to Vendors & Products',
      file: `mail-details_${F.iso(a)}_to_${F.iso(b)}.csv`,
    });
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const p = new URLSearchParams();
    R.toParams(p, S);
    if (S.sel) p.set(S.sel.kind, S.sel.label);
    return p.toString();
  }

  function applyParams(p) {
    R.applyParams(p, S, M.minDay, M.maxDay);
    S.sel = null;
    for (const kind of Object.keys(KINDS)) {
      const label = p.get(kind);
      if (label) S.sel = { kind, key: lower(label), label };
    }
  }

  function saveHash() {
    const url = `#/vendors?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    dates = R.controls({ from: 'ven-from', to: 'ven-to', preset: 'ven-preset' }, S, () => [M.minDay, M.maxDay], render);
    $('ven-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'vendors') { S.sel = null; render(); }
    });
    $('ven-details-btn').addEventListener('click', () => { location.hash = '#/vendors/details?' + toParams(); });
  }

  function load(book) {
    M = book.mail && book.mail.minDay !== null ? book.mail : null;
    problem = book.mail && !M ? `The "${book.mail.sheet}" sheet has no readable dates in its Delivery Date column.` : book.mailProblem;
    $('ven-content').hidden = !M;
    $('ven-problem').hidden = Boolean(M);
    $('ven-problem').textContent = M ? '' : `${problem} This page needs the Mail_Order sheet, like the Mail Order page.`;
    if (!M) return;
    keys = { vendor: M.labels.vendor.map(lower), product: M.labels.product.map(lower) };
    Object.assign(S, R.noDates(), { sel: null });
    dates.limit(M.minDay, M.maxDay);
  }

  // v: 'vendors' for the charts, 'details' for the order lines behind them.
  function show(params, v) {
    if (M) applyParams(params);
    if (v === 'details') {
      details();
    } else if (M) {
      ensureCharts();
      render();
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const plain = items => items.map(it => [it.label, Math.round(it.value * 100) / 100]);
    return { vendors: plain(r.vendors), products: plain(r.products), lines: r.lines };
  }

  CN.vendors = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
