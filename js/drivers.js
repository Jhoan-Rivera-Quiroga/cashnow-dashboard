/* Drivers page: the cash each driver handed out, and what the drivers were paid by driver, by
   category and by type of bonus, mirroring the Power BI page of the same name. Clicking a driver,
   a category or a type of bonus filters the payout charts to it. Its Details button lists the
   payout lines behind the total, like the Pick Up Detail drill-through. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const INK = '#252423', MUTED = '#6e5a6b';
  const BAR = '#e044a7';
  // Category colors in a fixed order, checked for color-blind separation. A category keeps its
  // color whatever is filtered; past seven categories the rest share "Other".
  const COLORS = ['#8e3fa3', '#e044a7', '#c8a200', '#118dff', '#e66c37', '#744ec2', '#1aab40'];
  const GRAY = '#a59aa3';
  const BAR_ROW = 26; // px per bar; long driver lists scroll inside their card
  const KINDS = ['driver', 'concept', 'bonus']; // what can be selected, and its address parameter
  const PRESETS = CN.ranges.PRESETS;
  const PAGE = 500; // detail rows added per "Show more"

  let P = null, Q = null, problem = null; // pick-ups; payouts, or null and why there are none
  let K = null; // per-code lookups for the payouts
  let charts = null;
  let narrowPies = false; // pie labels are left to the legend on narrow cards
  let first = 0, last = 0; // first and last day across pick-ups and payouts
  let view = 'drivers'; // or 'details'
  const S = { preset: 'last4', from: 0, to: 0, sel: null }; // sel: { kind, key, label }
  const D = { rows: [], sort: 'day', dir: 1, shown: 0 };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const lower = s => s.toLowerCase();
  const pct = x => (x * 100).toFixed(1) + '%';
  const hint = text => `<br><span style="color:#8a7a88">${text}</span>`;
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
    const r = { cash: bars(cash, P.labels.driver), total: null };
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
    r.payouts = bars(byDriver, L.driver);
    r.concepts = slices(byConcept, c => (c < 0 ? '(Blank)' : L.concept[c]), K.concept, c => c);
    r.bonuses = slices(byBonus, c => (c < 0 ? '(Blank)' : L.note[c]), K.note, c => K.bonusSlot.get(c));
    r.total = total;
    r.lines = lines;
    return r;
  }

  // Bars for every driver with an amount, largest first.
  function bars(sums, labels) {
    const out = [];
    for (let c = 0; c < sums.length; c++) {
      if (Math.abs(sums[c]) >= 0.005) out.push({ label: labels[c], key: lower(labels[c]), value: sums[c] });
    }
    return out.sort((a, b) => b.value - a.value);
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
    setBars(charts.cash, r.cash, sel('driver'), 'No pick-ups in this date range', "Click to see this driver's payouts");
    if (Q) {
      narrowPies = charts.concept.getWidth() < 420;
      setBars(charts.payouts, r.payouts, sel('driver'), emptyPhrase('payouts'), 'Click to filter the payout charts');
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

  const emptyOption = text => ({
    graphic: { type: 'text', left: 'center', top: 'middle', style: { text, fill: MUTED, fontSize: 13 } },
  });

  // Horizontal bars, one per driver, tall enough for every name; the card scrolls past its height.
  function setBars(chart, items, selKey, emptyText, clickHint) {
    chart.getDom().style.height = Math.max(160, items.length * BAR_ROW + 12) + 'px';
    chart.resize();
    if (!items.length) {
      chart.setOption(emptyOption(emptyText), true);
      return;
    }
    const dim = selKey !== null;
    chart.setOption({
      animationDuration: 300,
      grid: { left: 6, right: 92, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: p => `${esc(p.name)}<br><b>${F.money(p.value)}</b>` + hint(items[p.dataIndex].key === selKey ? 'Click again to clear' : clickHint),
      },
      xAxis: { type: 'value', show: false, max: 'dataMax' },
      yAxis: {
        type: 'category', inverse: true, data: items.map(it => it.label),
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: INK, fontSize: 12, fontWeight: 600, width: 130, overflow: 'truncate' },
      },
      series: [{
        type: 'bar', barMaxWidth: 18, cursor: 'pointer',
        data: items.map(it => ({ value: it.value, itemStyle: { opacity: !dim || it.key === selKey ? 1 : 0.3 } })),
        itemStyle: { color: BAR, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: INK, fontSize: 12, formatter: p => F.money(p.value) },
      }],
    }, true);
  }

  // Pie or donut with each slice's name and share beside it, and a legend that also gives the amounts.
  function setPie(chart, items, selKey, donut, emptyText) {
    if (!items.length) {
      chart.setOption(emptyOption(emptyText), true);
      return;
    }
    const sum = items.reduce((s, it) => s + it.value, 0);
    const byName = new Map(items.map(it => [it.label, it]));
    chart.setOption({
      animationDuration: 300,
      tooltip: {
        trigger: 'item',
        formatter: p => {
          const it = byName.get(p.name);
          const more = it.key === null ? '' : hint(it.key === selKey ? 'Click again to clear' : 'Click to filter the other payout charts');
          return `${esc(p.name)}<br><b>${F.money(p.value)}</b> · ${pct(p.value / sum)}` + more;
        },
      },
      legend: {
        bottom: 0, left: 'center', selectedMode: false,
        icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 14,
        textStyle: { color: INK, fontSize: 12 },
        formatter: name => `${name}  ${F.money(byName.get(name).value)}`,
      },
      series: [{
        type: 'pie', radius: donut ? ['40%', '64%'] : [0, '64%'], center: ['50%', '43%'], startAngle: 90,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: !narrowPies, color: INK, fontSize: 12, formatter: p => `${p.name} ${pct(p.value / sum)}` },
        labelLine: { length: 8, length2: 10 },
        labelLayout: { hideOverlap: true },
        emphasis: { scaleSize: 4 },
        data: items.map(it => ({
          name: it.label, value: it.value, key: it.key, cursor: it.key === null ? 'default' : 'pointer',
          itemStyle: { color: it.color, opacity: selKey === null || it.key === selKey ? 1 : 0.3 },
        })),
      }],
    }, true);
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

  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const TEXT_COLS = new Set(['driver', 'concept', 'note']);
  const TIE_ORDER = ['day', 'driver', 'concept', 'note'];
  const label = (list, code) => (code < 0 ? '' : list[code]);

  // The payout lines behind the total: one row per date, driver, concept and note, with the amounts
  // summed, as a Power BI table shows them.
  function renderDetails() {
    const groups = new Map();
    let total = 0;
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
      total += Q.amount[i];
    }
    D.rows = [...groups.values()];
    sortRows();
    $('drv-details-context').textContent = Q
      ? [rangePhrase(), S.sel ? selectionPhrase() : 'All payouts', `${F.int(D.rows.length)} rows`].join(' · ')
      : problem;
    $('drv-details-total').textContent = F.money(total);
    $('drv-details-export').disabled = !D.rows.length;
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
    document.querySelectorAll('#drv-details-table th[data-sort]').forEach(th => {
      th.setAttribute('aria-sort', th.dataset.sort !== D.sort ? 'none' : D.dir > 0 ? 'ascending' : 'descending');
    });
  }

  function redrawRows() {
    $('drv-details-body').textContent = '';
    D.shown = 0;
    showMoreRows();
  }

  function showMoreRows() {
    const end = Math.min(D.rows.length, D.shown + PAGE);
    let html = '';
    for (let i = D.shown; i < end; i++) {
      const r = D.rows[i];
      html += `<tr><td>${F.iso(r.day)}</td><td>${esc(r.driver)}</td><td>${esc(r.concept)}</td><td>${esc(r.note)}</td>` +
        `<td class="num">${F.money(r.amount)}</td></tr>`;
    }
    $('drv-details-body').insertAdjacentHTML('beforeend', html);
    D.shown = end;
    const left = D.rows.length - end;
    $('drv-details-more').hidden = left <= 0;
    $('drv-details-more').textContent = `Show ${F.int(Math.min(PAGE, left))} more (${F.int(left)} not shown)`;
  }

  // CSV of every detail row.
  function exportCsv() {
    const lines = ['Date,Driver name,Concept,Notes,Payment Amount'];
    for (const r of D.rows) {
      lines.push([F.iso(r.day), F.csv(r.driver), F.csv(r.concept), F.csv(r.note), r.amount.toFixed(2)].join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `driver-payout-detail_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    $('drv-details-more').addEventListener('click', showMoreRows);
    $('drv-details-export').addEventListener('click', exportCsv);
    document.querySelectorAll('#drv-details-table th[data-sort] button').forEach(b => b.addEventListener('click', () => {
      const k = b.parentElement.dataset.sort;
      D.dir = D.sort === k ? -D.dir : 1;
      D.sort = k;
      sortRows();
      redrawRows();
    }));
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
