/* Drivers page: the cash each driver handed out, and what the drivers were paid by driver, by
   category and by type of bonus, mirroring the Power BI page of the same name. Clicking a driver,
   a category or a type of bonus filters the payout charts to it. Its Details button lists the
   payout lines behind the total, like the Pick Up Detail drill-through. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  // A category keeps its color whatever is filtered; past seven categories the rest share "Other".
  const { PIE_COLORS: COLORS, GRAY } = CN.charts;
  const KINDS = ['driver', 'concept', 'bonus']; // what can be selected, and its address parameter
  const PRESETS = CN.ranges.PRESETS;

  let P = null, Q = null, problem = null; // pick-ups; payouts, or null and why there are none
  let K = null; // per-code lookups for the payouts
  let charts = null;
  let narrowPies = false; // pie labels are left to the legend on narrow cards
  let first = 0, last = 0; // first and last day across pick-ups and payouts
  let view = 'drivers'; // or 'details'
  const S = { preset: 'last4', from: 0, to: 0, sel: null }; // sel: { kind, key, label }
  let table = null; // the Driver Payout Detail table

  const lower = s => s.toLowerCase();
  const presetRange = id => CN.ranges.range(id, first, last);

  // Lowercased names to match the selection on, and each category's color slot.
  function lookups() {
    const L = Q.labels, blank = '(blank)';
    const isBonus = L.concept.map(c => lower(c) === 'bonus');
    // Types of bonus take color slots in the order they first appear on Bonus lines.
    const bonusSlot = new Map();
    for (let i = 0; i < Q.n; i++) {
      const c = Q.concept[i];
      if (c >= 0 && isBonus[c] && !bonusSlot.has(Q.note[i])) bonusSlot.set(Q.note[i], bonusSlot.size);
    }
    return {
      isBonus, bonusSlot,
      driver: L.driver.map(lower),
      concept: c => (c < 0 ? blank : lower(L.concept[c])),
      note: c => (c < 0 ? blank : lower(L.note[c])),
    };
  }

  const inRange = d => d >= S.from && d <= S.to;
  const picked = (kind, key) => !S.sel || S.sel.kind !== kind || S.sel.key === key;

  // Whether payout row i passes each part of the selection.
  function passes(i) {
    const drv = Q.driver[i], con = Q.concept[i];
    const bonus = con >= 0 && K.isBonus[con];
    return {
      bonus,
      driver: picked('driver', drv >= 0 ? K.driver[drv] : null),
      concept: picked('concept', K.concept(con)),
      type: picked('bonus', bonus ? K.note(Q.note[i]) : null),
    };
  }

  // Each payout chart is filtered by what's selected in the other charts, and shows its own
  // selection highlighted instead, as in Power BI.
  function compute() {
    const cash = new Float64Array(P.labels.driver.length);
    for (let i = 0; i < P.n; i++) if (P.driver[i] >= 0 && inRange(P.day[i])) cash[P.driver[i]] += P.amount[i];
    const r = { cash: CN.charts.ranked(cash, P.labels.driver), total: null };
    if (!Q) return r;

    const L = Q.labels;
    const byDriver = new Float64Array(L.driver.length);
    const byConcept = new Map(), byBonus = new Map(); // code (-1: blank) -> sum
    let total = 0, lines = 0;
    for (let i = 0; i < Q.n; i++) {
      if (!inRange(Q.day[i])) continue;
      const a = Q.amount[i], drv = Q.driver[i], con = Q.concept[i], note = Q.note[i];
      const ok = passes(i);
      if (ok.concept && ok.type && drv >= 0) byDriver[drv] += a;
      if (ok.driver && ok.type) byConcept.set(con, (byConcept.get(con) || 0) + a);
      if (ok.bonus && ok.driver && ok.concept) byBonus.set(note, (byBonus.get(note) || 0) + a);
      if (ok.driver && ok.concept && ok.type) {
        total += a;
        lines++;
      }
    }
    r.payouts = CN.charts.ranked(byDriver, L.driver);
    r.concepts = slices(byConcept, c => (c < 0 ? '(Blank)' : L.concept[c]), K.concept, c => c);
    r.bonuses = slices(byBonus, c => (c < 0 ? '(Blank)' : L.note[c]), K.note, c => K.bonusSlot.get(c));
    r.total = total;
    r.lines = lines;
    return r;
  }

  // Pie slices, largest first; categories past the seventh color slot are summed into "Other".
  function slices(sums, labelOf, keyOf, slotOf) {
    const out = [];
    let other = 0;
    for (const [c, v] of sums) {
      if (Math.abs(v) < 0.005) continue;
      const slot = c < 0 ? -1 : slotOf(c);
      if (slot >= COLORS.length) { other += v; continue; }
      out.push({ label: labelOf(c), key: keyOf(c), value: v, color: slot < 0 ? GRAY : COLORS[slot] });
    }
    if (other) out.push({ label: 'Other', key: null, value: other, color: GRAY });
    return out.sort((a, b) => b.value - a.value);
  }

  /* ---------- page ---------- */

  function render() {
    const r = compute();
    syncControls();
    const total = $('drv-total');
    total.textContent = r.total === null ? '–' : '$' + F.short(r.total);
    total.closest('.kpi').title = r.total === null ? '' : F.money(r.total);
    const btn = $('drv-details-btn');
    btn.disabled = !r.lines;
    btn.title = r.lines ? `List the payouts for ${scopePhrase()}` : 'No payouts to list';
    $('drv-selection').hidden = !S.sel;
    if (S.sel) $('drv-selection-label').textContent = selectionPhrase();
    const sel = kind => (S.sel && S.sel.kind === kind ? S.sel.key : null);
    CN.charts.bars(charts.cash, r.cash, { selKey: sel('driver'), empty: 'No pick-ups in this date range', hint: "Click to see this driver's payouts" });
    if (Q) {
      narrowPies = charts.concept.getWidth() < 420;
      CN.charts.bars(charts.payouts, r.payouts, { selKey: sel('driver'), empty: emptyPhrase('payouts'), hint: 'Click to filter the payout charts' });
      setPie(charts.concept, r.concepts, sel('concept'), false, emptyPhrase('payouts'));
      setPie(charts.bonus, r.bonuses, sel('bonus'), true, emptyPhrase('bonuses'));
    }
    saveHash();
  }

  function selectionPhrase() {
    const { kind, label } = S.sel;
    return kind === 'driver' ? label : kind === 'concept' ? `${label} payouts` : `${label} bonuses`;
  }

  const rangePhrase = () => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);
  const scopePhrase = () => (S.sel ? `${selectionPhrase()}, ${rangePhrase()}` : rangePhrase());

  function emptyPhrase(what) {
    return S.sel ? `Nothing to show for ${selectionPhrase()} in this date range` : `No ${what} in this date range`;
  }

  function syncControls() {
    $('drv-from').value = F.iso(S.from);
    $('drv-to').value = F.iso(S.to);
    $('drv-preset').value = S.preset;
  }

  function setPie(chart, items, selKey, donut, emptyText) {
    CN.charts.pie(chart, items, { selKey, donut, narrow: narrowPies, empty: emptyText, hint: 'Click to filter the other payout charts' });
  }

  // Clicking a selected bar or slice again clears the selection.
  function toggle(kind, key, label) {
    if (key === null) return;
    S.sel = S.sel && S.sel.kind === kind && S.sel.key === key ? null : { kind, key, label };
    render();
  }

  function ensureCharts() {
    if (charts) return;
    charts = {
      cash: echarts.init($('chart-drv-cash')),
      payouts: echarts.init($('chart-drv-payouts')),
      concept: echarts.init($('chart-drv-concept')),
      bonus: echarts.init($('chart-drv-bonus')),
    };
    charts.cash.on('click', p => toggle('driver', lower(p.name), p.name));
    charts.payouts.on('click', p => toggle('driver', lower(p.name), p.name));
    charts.concept.on('click', p => toggle('concept', p.data.key, p.name));
    charts.bonus.on('click', p => toggle('bonus', p.data.key, p.name));
    const ro = new ResizeObserver(() => {
      Object.values(charts).forEach(c => c.resize());
      const narrow = charts.concept.getWidth() < 420;
      if (Q && narrow !== narrowPies && document.body.dataset.view === 'drivers') render();
    });
    Object.values(charts).forEach(c => ro.observe(c.getDom().parentElement));
  }

  /* ---------- Driver Payout Detail ---------- */

  const DETAIL_COLUMNS = [
    { key: 'day', label: 'Date', type: 'day' },
    { key: 'driver', label: 'Driver name', type: 'text' },
    { key: 'concept', label: 'Concept', type: 'text' },
    { key: 'note', label: 'Notes', type: 'text' },
    { key: 'amount', label: 'Payment Amount', type: 'money' },
  ];
  const label = (list, code) => (code < 0 ? '' : list[code]);

  // The payout lines behind the total: one row per date, driver, concept and note, with the amounts
  // summed, as a Power BI table shows them.
  function renderDetails() {
    const groups = new Map();
    for (let i = 0; Q && i < Q.n; i++) {
      if (!inRange(Q.day[i])) continue;
      const ok = passes(i);
      if (!(ok.driver && ok.concept && ok.type)) continue;
      const k = `${Q.day[i]}|${Q.driver[i]}|${Q.concept[i]}|${Q.note[i]}`;
      let r = groups.get(k);
      if (!r) {
        const L = Q.labels;
        groups.set(k, r = {
          day: Q.day[i], driver: label(L.driver, Q.driver[i]), concept: label(L.concept, Q.concept[i]),
          note: label(L.note, Q.note[i]), amount: 0,
        });
      }
      r.amount += Q.amount[i];
    }
    table.set([...groups.values()]);
    $('drv-details-context').textContent = Q
      ? [rangePhrase(), S.sel ? selectionPhrase() : 'All payouts', F.count(table.length, 'row', 'rows')].join(' · ')
      : problem;
    $('drv-details-export').disabled = !table.length;
    saveHash();
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
    for (const kind of KINDS) {
      const label = p.get(kind);
      if (label && (kind === 'driver' || Q)) S.sel = { kind, key: lower(label), label };
    }
  }

  function saveHash() {
    const url = `#/${view === 'details' ? 'drivers/details' : 'drivers'}?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('drv-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('drv-from').value), b = F.fromIso($('drv-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('drv-from').addEventListener('change', onDate);
    $('drv-to').addEventListener('change', onDate);
    $('drv-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'drivers') { S.sel = null; render(); }
    });
    $('drv-details-btn').addEventListener('click', () => { location.hash = '#/drivers/details?' + toParams(); });
    $('drv-details-back').addEventListener('click', e => {
      e.preventDefault();
      location.hash = '#/drivers?' + toParams();
    });
    table = CN.table.create({ table: 'drv-details-table', more: 'drv-details-more' }, DETAIL_COLUMNS);
    $('drv-details-export').addEventListener('click', () => {
      table.download(`driver-payout-detail_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`);
    });
  }

  function load(book) {
    P = book.pickups;
    Q = book.payouts;
    problem = book.payoutsProblem;
    K = Q ? lookups() : null;
    first = P.minDay;
    last = P.maxDay;
    if (Q && Q.minDay !== null) {
      first = Math.min(first, Q.minDay);
      last = Math.max(last, Q.maxDay);
    }
    Object.assign(S, { preset: 'last4', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['drv-from', 'drv-to']) {
      $(id).min = F.iso(first);
      $(id).max = F.iso(last);
    }
    for (const id of ['drv-card-payouts', 'drv-card-concept', 'drv-card-bonus']) $(id).hidden = !Q;
    $('drv-problem').hidden = Boolean(Q);
    $('drv-problem').textContent = Q ? '' : `${problem} The payout charts need that sheet, with the columns ` +
      'Date, Driver name, Payment Amount, Concept and Notes.';
  }

  // v: 'drivers' for the charts, 'details' for the payout lines.
  function show(params, v) {
    view = v;
    applyParams(params);
    if (v === 'details') {
      renderDetails();
    } else {
      ensureCharts();
      render();
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const r = compute();
    const plain = items => items && items.map(it => [it.label, Math.round(it.value * 100) / 100]);
    return {
      total: r.total === null ? null : Math.round(r.total * 100) / 100,
      cash: plain(r.cash), payouts: plain(r.payouts), concepts: plain(r.concepts), bonuses: plain(r.bonuses),
    };
  }

  CN.drivers = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
