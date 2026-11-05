/* Demographics page: where the pick-ups and the mail orders come from, mirroring the Power BI page of
   the same name. Power BI's two maps don't draw and its city pie has about 150 slices, so this page
   uses ranked bars by state and by city, with the smaller cities summed into "Other". Each half has
   its own dates; clicking a state or a city filters its half, and Details lists the pick-ups or mail
   orders behind it. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const PRESETS = CN.ranges.PRESETS;
  const NAMES = { state: 'State', city: 'City' };
  const lower = s => s.toLowerCase();
  const pct = F.pct;

  // The two halves. p: address parameter prefix; charts: one per field, `top` bars at most and the
  // rest as "Other". data, keys, S and the ECharts instances are filled in by load() and show().
  const HALVES = {
    pickups: { p: 'p', title: 'pick-ups', charts: [{ field: 'state', el: 'chart-demo-pstate' }, { field: 'city', el: 'chart-demo-pcity', top: 15, other: 'cities' }] },
    mail: { p: 'm', title: 'mail orders', charts: [{ field: 'state', el: 'chart-demo-mstate' }] },
  };

  const keyOf = (h, field, code) => (code < 0 ? '(blank)' : h.keys[field][code]);
  const labelOf = (h, field, code) => (code < 0 ? '(Blank)' : h.data.labels[field][code]);
  const inRange = (h, i) => h.data.day[i] >= h.S.from && h.data.day[i] <= h.S.to;
  const picked = (h, field, i) => !h.S.sel || h.S.sel.field !== field || keyOf(h, field, h.data[field][i]) === h.S.sel.key;
  const rangePhrase = S => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);
  const selectionPhrase = S => `${NAMES[S.sel.field]}: ${S.sel.label}`;

  // A half's bar lists: each chart is filtered by its half's selection on the other field and shows
  // its own selection highlighted.
  function compute(h) {
    const D = h.data;
    const sums = h.charts.map(c => new Float64Array(D.labels[c.field].length + 1)); // the last slot: blank
    let lines = 0;
    for (let i = 0; i < D.n; i++) {
      if (!inRange(h, i)) continue;
      const a = D.amount[i];
      let all = true;
      h.charts.forEach((c, j) => {
        const others = h.charts.every(o => o === c || picked(h, o.field, i));
        if (others) {
          const code = D[c.field][i];
          sums[j][code >= 0 ? code : sums[j].length - 1] += a;
        }
        all = all && picked(h, c.field, i);
      });
      if (all && (a !== 0 || D[h.charts[0].field][i] >= 0)) lines++;
    }
    const lists = h.charts.map((c, j) => {
      const items = [];
      for (let code = -1; code < sums[j].length - 1; code++) {
        const v = sums[j][code >= 0 ? code : sums[j].length - 1];
        if (Math.abs(v) >= 0.005) items.push({ label: labelOf(h, c.field, code), key: keyOf(h, c.field, code), value: v });
      }
      items.sort((a, b) => b.value - a.value);
      const total = items.reduce((s, it) => s + it.value, 0);
      if (c.top && items.length > c.top + 1) {
        const rest = items.splice(c.top);
        items.push({ label: `Other (${F.int(rest.length)} ${c.other})`, key: null, value: rest.reduce((s, it) => s + it.value, 0) });
      }
      return { items, total };
    });
    return { lists, lines };
  }

  /* ---------- page ---------- */

  function render(h) {
    const S = h.S;
    const r = compute(h);
    $(`demo-${h.p}-from`).value = F.iso(S.from);
    $(`demo-${h.p}-to`).value = F.iso(S.to);
    $(`demo-${h.p}-preset`).value = S.preset;
    h.charts.forEach((c, j) => {
      const { items, total } = r.lists[j];
      c.items = items;
      CN.charts.bars(c.chart, items, {
        selKey: S.sel && S.sel.field === c.field ? S.sel.key : null,
        empty: S.sel ? `Nothing to show for ${S.sel.label} in this date range` : `No ${h.title} in this date range`,
        hint: h.charts.length > 1 ? 'Click to filter the other chart' : 'Click to pick it for Details',
        label: v => `$${F.short(v)} · ${pct(v / total)}`, labelRoom: 120,
      });
    });
    const btn = $(`demo-${h.p}-details`);
    btn.disabled = !r.lines;
    btn.title = r.lines ? `List the ${h.title} for ${S.sel ? selectionPhrase(S) + ', ' : ''}${rangePhrase(S)}` : `No ${h.title} to list`;
    $(`demo-${h.p}-selection`).hidden = !S.sel;
    if (S.sel) $(`demo-${h.p}-selection-label`).textContent = selectionPhrase(S);
    saveHash();
  }

  function renderAll() {
    for (const h of Object.values(HALVES)) if (h.data) render(h);
  }

  // Clicking a selected bar again clears the selection; "Other" can't be selected.
  function toggle(h, field, item) {
    if (!item || item.key === null) return;
    const S = h.S;
    S.sel = S.sel && S.sel.field === field && S.sel.key === item.key ? null : { field, key: item.key, label: item.label };
    render(h);
  }

  let resizer = null;
  function ensureCharts() {
    if (!resizer) resizer = new ResizeObserver(entries => entries.forEach(e => echarts.getInstanceByDom(e.target.firstElementChild).resize()));
    for (const h of Object.values(HALVES)) {
      if (!h.data) continue;
      for (const c of h.charts) {
        if (c.chart) continue;
        c.chart = echarts.init($(c.el));
        c.chart.on('click', p => toggle(h, c.field, c.items && c.items[p.dataIndex]));
        resizer.observe(c.chart.getDom().parentElement);
      }
    }
  }

  // The pick-ups or mail orders behind a half, in their detail table.
  function details(h) {
    if (!h.data) {
      location.hash = '#/demographics'; // a half without data has no rows to list
      return;
    }
    const S = h.S;
    const opts = {
      phrase: `${rangePhrase(S)} · ${S.sel ? selectionPhrase(S) : 'All ' + h.title}`,
      hash: `#/demographics/${h === HALVES.pickups ? 'pickups' : 'mail'}?${toParams()}`,
      back: `#/demographics?${toParams()}`,
      backLabel: 'Back to Demographics',
      file: `${h === HALVES.pickups ? 'pick-up-detail' : 'mail-details'}_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`,
    };
    if (h === HALVES.pickups) {
      CN.pickups.detail(Object.assign(opts, { match: i => inRange(h, i) && picked(h, 'state', i) && picked(h, 'city', i) }));
    } else {
      CN.mail.detail(Object.assign(opts, { match: i => inRange(h, i) && picked(h, 'state', i) }));
    }
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  function toParams() {
    const q = new URLSearchParams();
    for (const h of Object.values(HALVES)) {
      if (!h.data) continue;
      const S = h.S;
      q.set(`${h.p}range`, S.preset);
      if (S.preset === 'custom') {
        q.set(`${h.p}from`, F.iso(S.from));
        q.set(`${h.p}to`, F.iso(S.to));
      }
      if (S.sel) q.set(`${h.p}${S.sel.field}`, S.sel.label);
    }
    return q.toString();
  }

  function applyParams(q) {
    for (const h of Object.values(HALVES)) {
      if (!h.data) continue;
      const S = h.S;
      const range = q.get(`${h.p}range`);
      const from = F.fromIso(q.get(`${h.p}from`)), to = F.fromIso(q.get(`${h.p}to`));
      if (PRESETS[range] && range !== 'custom') {
        S.preset = range;
        [S.from, S.to] = CN.ranges.range(range, h.data.minDay, h.data.maxDay);
      } else if (from !== null && to !== null) {
        S.preset = 'custom';
        S.from = Math.min(from, to);
        S.to = Math.max(from, to);
      }
      S.sel = null;
      for (const c of h.charts) {
        const label = q.get(`${h.p}${c.field}`);
        if (label) S.sel = { field: c.field, key: lower(label), label };
      }
    }
  }

  function saveHash() {
    const url = `#/demographics?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    for (const [name, h] of Object.entries(HALVES)) {
      const preset = $(`demo-${h.p}-preset`);
      for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
      preset.addEventListener('change', () => {
        if (preset.value === 'custom') return;
        h.S.preset = preset.value;
        [h.S.from, h.S.to] = CN.ranges.range(preset.value, h.data.minDay, h.data.maxDay);
        render(h);
      });
      const onDate = () => {
        let a = F.fromIso($(`demo-${h.p}-from`).value), b = F.fromIso($(`demo-${h.p}-to`).value);
        if (a === null || b === null) return;
        if (a > b) [a, b] = [b, a];
        Object.assign(h.S, { from: a, to: b, preset: 'custom' });
        render(h);
      };
      $(`demo-${h.p}-from`).addEventListener('change', onDate);
      $(`demo-${h.p}-to`).addEventListener('change', onDate);
      $(`demo-${h.p}-clear`).addEventListener('click', () => { h.S.sel = null; render(h); });
      $(`demo-${h.p}-details`).addEventListener('click', () => { location.hash = `#/demographics/${name}?${toParams()}`; });
    }
    // Esc clears both halves' selections.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || document.body.dataset.view !== 'demographics') return;
      for (const h of Object.values(HALVES)) if (h.data && h.S.sel) { h.S.sel = null; render(h); }
    });
  }

  function load(book) {
    const mail = book.mail && book.mail.minDay !== null && book.mail.has.state ? book.mail : null;
    HALVES.pickups.data = book.pickups;
    HALVES.mail.data = mail;
    let problem = '';
    if (!mail) {
      problem = book.mail
        ? `The "${book.mail.sheet}" sheet has no ${book.mail.has.state ? 'readable dates' : 'State column'}, so there are no mail orders by state.`
        : `${book.mailProblem} The mail order half needs that sheet.`;
    }
    $('demo-m-content').hidden = !mail;
    $('demo-m-problem').hidden = Boolean(mail);
    $('demo-m-problem').textContent = problem;
    for (const h of Object.values(HALVES)) {
      if (!h.data) continue;
      h.keys = Object.fromEntries(h.charts.map(c => [c.field, h.data.labels[c.field].map(lower)]));
      h.S = { preset: 'last4', sel: null };
      [h.S.from, h.S.to] = CN.ranges.range('last4', h.data.minDay, h.data.maxDay);
      for (const end of ['from', 'to']) {
        $(`demo-${h.p}-${end}`).min = F.iso(h.data.minDay);
        $(`demo-${h.p}-${end}`).max = F.iso(h.data.maxDay);
      }
    }
  }

  // v: 'demographics' for the charts, 'pickups' or 'mail' for the rows behind a half.
  function show(params, v) {
    applyParams(params);
    if (v === 'pickups') details(HALVES.pickups);
    else if (v === 'mail') details(HALVES.mail);
    else {
      ensureCharts();
      renderAll();
    }
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const out = {};
    for (const [name, h] of Object.entries(HALVES)) {
      if (!h.data) continue;
      const r = compute(h);
      h.charts.forEach((c, j) => {
        out[`${name}By${NAMES[c.field]}`] = r.lists[j].items.map(it => [it.label, Math.round(it.value * 100) / 100]);
      });
    }
    return out;
  }

  CN.demographics = { init, load, show, snapshot };
})(window.CashNow = window.CashNow || {});
