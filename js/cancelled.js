/* Cancelled page: the pick-ups that were cancelled, why, and whether someone followed up. Power BI
   shows the count and one table; this page adds charts of the reasons and the follow-up status, and
   the share of follow-ups done, as the report's spec suggests. Clicking a reason or a status filters
   the rest of the page. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const PRESETS = CN.ranges.PRESETS;
  const KINDS = { reason: 'Reason', status: 'Status' }; // address parameter: name in the selection
  const TABLE_COLUMNS = [
    { key: 'day', label: 'Collection Date', type: 'day' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'reason', label: 'Reason and Follow Up Steps', type: 'text', wrap: true },
    { key: 'status', label: 'Follow Up Status', type: 'text' },
  ];

  // The reasons are typed freely (hundreds of spellings), so the chart groups them by their words.
  // Each reason goes in the first group it matches, and the table shows it as typed.
  const REASONS = [
    ['Duplicate', /dup/i],
    ['Test or training', /^test(ing)?$|\btest$|training/i], // not "test strips …"
    ['No show or no answer', /no.?show|now show|\bnot? (answer|respon|reply)|unrespon|did ?n.?t show|answering|responding|could ?n.?o?t (reach|contact)|can.?t (reach|contact)|not home|voice ?mail/i],
    ['Sold elsewhere', /\bsold\b|competit|another company|other company/i],
    ['Price not accepted', /pric|too low|low value/i],
    ['Item problems', /damag|broken|seal|opened|open box|expir|in[cv]alid|wrong (item|box)|short.dated|\bdent|\bstain|stripe|\bbad (box|item)|not good item|(do not|don.?t) take|\bding/i],
    ['No items yet', /no (items|supplies)|n.?t have (the |any )?(items|supplies)|(items|supplies) not (ready|available)|not ready|when ready|not available|(items|supplies) yet/i],
    ['Customer cancelled', /c[ae]nc[ae]l|\bcax\b|changed? (his |her |their )?mind/i],
    ['Rescheduled', /re.?schedul|later|another day|next (week|day)|postpon|ended up show/i], // or done later
    ['Not confirmed', /confirm/i], // after the others: "confirmed …, then he cancelled" is a cancellation
    ['Mail instead', /\bmail|\bship/i], // changed to mail, or mail offered
  ];
  const DUPLICATE = 'Duplicate', TEST = 'Test or training', SLOT = 'Time slot, no reason', OTHER = 'Other', BLANK = '(Blank)';
  // A reason that's only a time slot or the booking form's wording ("Scheduled time: 5:30 - 6:30 pm",
  // "Local pickup - same-day …"): nothing is left once the times, those words and punctuation go.
  const TIMES = /\d{1,2}(:\d{2})?\s*([ap]\.?\s?m\.?)?(\s*(-|–|to)\s*\d{1,2}(:\d{2})?\s*([ap]\.?\s?m\.?)?)?/gi;
  const SLOT_WORDS = /(scheduled|requested) time|local pick ?up\s*[-–—]\s*same.day.*?confirm\.?/gi;
  const slotOnly = t => t.replace(SLOT_WORDS, ' ').replace(TIMES, ' ').replace(/[\s\-–—:.,;]+/g, '') === '';

  function reasonGroup(text) {
    if (text === null) return BLANK;
    if (slotOnly(text)) return SLOT;
    const g = REASONS.find(([, rx]) => rx.test(text));
    return g ? g[0] : OTHER;
  }

  // The sheet spells each status several ways ("Follow up done", "Follow Up Completed"). Any other
  // status is shown as typed.
  const STATUSES = [
    ['No Need for Follow Up', /^no\b.*\bneed|not needed/i], // not "Pending - no answer, need to call"
    ['Follow Up Done', /done|complete/i],
    ['Follow Up Pending', /pending/i],
    ["Couldn't Contact", /contact|tried|unable/i],
  ];
  const NO_NEED = STATUSES[0][0], DONE = STATUSES[1][0];
  const statusGroup = text => (text === null ? BLANK : (STATUSES.find(([, rx]) => rx.test(text)) || [text])[0]);

  // Group names the page itself sets, the only ones that go in the address.
  const KNOWN = {
    reason: [...REASONS.map(g => g[0]), SLOT, OTHER, BLANK],
    status: [...STATUSES.map(g => g[0]), BLANK],
  };

  // Phone numbers as the sheet types them: (602) 555-0100, 602-555-0100, 6025550100, +16025550100.
  const PHONE = /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g;
  const phoneText = m => {
    const d = m.replace(/\D/g, '').slice(-10);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };
  const phonesIn = text => (text.match(PHONE) || []).map(phoneText).join(', ');
  // First Name holds the name and the phone: "Name (602) 555-0100", "Name - 602-555-0100" or
  // "First , Last , 16025550100".
  const nameIn = text => text.split(PHONE)
    .map(p => p.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—:;/|]+|[\s\-–—:;/|]+$/g, ''))
    .filter(Boolean).join(', ');

  let C = null, problem = null; // the Return sheet's rows from CN.data, or null and why there are none
  let groups = null; // per text code: each reason's and status's group, each First Name's name and phones
  let charts = null, table = null;
  const S = { preset: 'last4', from: 0, to: 0, sel: null }; // sel: { kind: 'reason' | 'status', key, label }

  const lower = s => s.toLowerCase();
  const presetRange = id => CN.ranges.range(id, C.minDay, C.maxDay);
  const reasonOf = i => (C.reason[i] < 0 ? BLANK : groups.reason[C.reason[i]]);
  const statusOf = i => (C.status[i] < 0 ? BLANK : groups.status[C.status[i]]);
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  // One pass over the date range: the count of each reason and status, and the cards and table,
  // which also respect the selection. Each chart is filtered by what's selected in the other and
  // shows its own selection highlighted, as in Power BI.
  function render() {
    syncControls();
    const byReason = new Map(), byStatus = new Map();
    const rows = [];
    let notCancelled = 0, noNeed = 0, done = 0;
    for (let i = 0; i < C.n; i++) {
      if (C.day[i] < S.from || C.day[i] > S.to) continue;
      const reason = reasonOf(i), status = statusOf(i);
      const okReason = !S.sel || S.sel.kind !== 'reason' || lower(reason) === S.sel.key;
      const okStatus = !S.sel || S.sel.kind !== 'status' || lower(status) === S.sel.key;
      if (okStatus) bump(byReason, reason);
      if (okReason) bump(byStatus, status);
      if (!okReason || !okStatus) continue;
      if (reason === DUPLICATE || reason === TEST) notCancelled++;
      if (status === NO_NEED) noNeed++;
      else if (status === DONE) done++;
      const n = C.name[i], p = C.phone[i];
      rows.push({
        day: C.day[i],
        name: n < 0 ? '' : groups.name[n],
        phone: p >= 0 ? groups.phone[p] : n >= 0 ? groups.namePhones[n] : '',
        reason: C.reason[i] < 0 ? '' : C.labels.reason[C.reason[i]],
        status: status === BLANK ? '' : status,
      });
    }

    const total = rows.length, needed = total - noNeed;
    setKpi('can-kpi-total', F.int(total), F.count(total, 'cancelled pick-up', 'cancelled pick-ups'));
    setKpi('can-kpi-real', F.int(total - notCancelled), notCancelled
      ? `${F.int(total)} minus ${F.count(notCancelled, 'duplicate or test', 'duplicates and tests')}` : 'No duplicates or tests here');
    setKpi('can-kpi-rate', needed ? F.pct(done / needed) : '–', needed
      ? `${F.int(done)} follow-ups done of the ${F.count(needed, 'cancellation', 'cancellations')} that needed one (all but "${NO_NEED}")`
      : 'None of these needed a follow-up');
    CN.charts.fitKpis($('view-cancelled'));

    const none = S.sel ? `Nothing to show for ${S.sel.label} in this date range` : 'No cancelled pick-ups in this date range';
    draw(charts.reason, byReason, 'reason', none);
    draw(charts.status, byStatus, 'status', none);

    table.set(rows);
    $('can-context').textContent = [rangePhrase(), S.sel ? selectionPhrase() : '', F.count(total, 'row', 'rows')].filter(Boolean).join(' · ');
    $('can-export').disabled = !total;
    $('can-selection').hidden = !S.sel;
    if (S.sel) $('can-selection-label').textContent = selectionPhrase();
    saveHash();
  }

  // Bars largest first, with Other and (Blank) at the end since they aren't reasons; each shows its share.
  function draw(chart, counts, kind, empty) {
    const sum = [...counts.values()].reduce((s, v) => s + v, 0);
    const last = it => (it.label === OTHER ? 1 : it.label === BLANK ? 2 : 0);
    const items = [...counts].map(([label, value]) => ({ label, key: lower(label), value }))
      .sort((a, b) => last(a) - last(b) || b.value - a.value);
    CN.charts.bars(chart, items, {
      selKey: S.sel && S.sel.kind === kind ? S.sel.key : null, empty, hint: 'Click to filter the page',
      format: v => F.count(v, 'cancellation', 'cancellations'), label: v => `${F.int(v)} · ${F.pct(v / sum)}`, labelRoom: 104,
    });
  }

  function setKpi(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.closest('.kpi').title = title || '';
  }

  function syncControls() {
    $('can-from').value = F.iso(S.from);
    $('can-to').value = F.iso(S.to);
    $('can-preset').value = S.preset;
  }

  const rangePhrase = () => (S.from === S.to ? F.dayLong(S.from) : `${F.dayLong(S.from)} – ${F.dayLong(S.to)}`);
  const selectionPhrase = () => `${KINDS[S.sel.kind]}: ${S.sel.label}`;

  function ensureCharts() {
    if (charts) return;
    charts = { reason: echarts.init($('chart-can-reasons')), status: echarts.init($('chart-can-status')) };
    for (const [kind, chart] of Object.entries(charts)) {
      // Clicking a selected bar again clears the selection.
      chart.on('click', p => {
        const key = lower(p.name);
        S.sel = S.sel && S.sel.kind === kind && S.sel.key === key ? null : { kind, key, label: p.name };
        render();
      });
      new ResizeObserver(() => chart.resize()).observe(chart.getDom().parentElement);
    }
  }

  /* ---------- filters in the address, so a view can be bookmarked or shared ---------- */

  const known = (kind, label) => KNOWN[kind].find(l => lower(l) === lower(label)) || null;

  function toParams() {
    const p = new URLSearchParams();
    p.set('range', S.preset);
    if (S.preset === 'custom') {
      p.set('from', F.iso(S.from));
      p.set('to', F.iso(S.to));
    }
    // A status typed some other way stays out of the address, which holds only the page's own names.
    if (S.sel && known(S.sel.kind, S.sel.label)) p.set(S.sel.kind, S.sel.label);
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
      const label = p.get(kind) && known(kind, p.get(kind));
      if (label) S.sel = { kind, key: lower(label), label };
    }
  }

  function saveHash() {
    const url = `#/cancelled?${toParams()}`;
    if (location.hash === url) return;
    try { history.replaceState(null, '', url); } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  /* ---------- wiring ---------- */

  function init() {
    const preset = $('can-preset');
    for (const [id, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, id));
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      S.preset = preset.value;
      [S.from, S.to] = presetRange(preset.value);
      render();
    });
    const onDate = () => {
      let a = F.fromIso($('can-from').value), b = F.fromIso($('can-to').value);
      if (a === null || b === null) return;
      if (a > b) [a, b] = [b, a];
      S.from = a;
      S.to = b;
      S.preset = 'custom';
      render();
    };
    $('can-from').addEventListener('change', onDate);
    $('can-to').addEventListener('change', onDate);
    $('can-clear').addEventListener('click', () => { S.sel = null; render(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.sel && document.body.dataset.view === 'cancelled') { S.sel = null; render(); }
    });
    new ResizeObserver(() => CN.charts.fitKpis($('view-cancelled'))).observe($('can-kpis'));
    table = CN.table.create({ table: 'can-table', more: 'can-more' }, TABLE_COLUMNS);
    $('can-export').addEventListener('click', () => table.download(`cancelled_${F.iso(S.from)}_to_${F.iso(S.to)}.csv`));
  }

  function load(book) {
    C = book.cancelled;
    problem = book.cancelledProblem;
    if (C && C.minDay === null) {
      problem = `The "${C.sheet}" sheet has no readable dates in its Collection Date column.`;
      C = null;
    }
    $('can-content').hidden = !C;
    $('can-problem').hidden = Boolean(C);
    $('can-problem').textContent = C ? '' : `${problem} The Cancelled page needs that sheet, with the columns ` +
      'Collection Date, First Name, Reason and Follow up Steps, and Follow Up Status.';
    if (!C) return;
    const L = C.labels;
    groups = {
      reason: L.reason.map(reasonGroup),
      status: L.status.map(statusGroup),
      name: L.name.map(nameIn),
      namePhones: L.name.map(phonesIn),
      phone: L.phone.map(t => phonesIn(t) || t), // as typed when it holds no phone number
    };
    Object.assign(S, { preset: 'last4', sel: null });
    [S.from, S.to] = presetRange('last4');
    for (const id of ['can-from', 'can-to']) {
      $(id).min = F.iso(C.minDay);
      $(id).max = F.iso(C.maxDay);
    }
  }

  function show(params) {
    if (!C) return;
    applyParams(params);
    ensureCharts();
    render();
  }

  // Current numbers in plain form, for checking against the workbook.
  function snapshot() {
    const bars = chart => {
      const o = chart.getOption();
      return o.yAxis && o.yAxis[0].data ? o.yAxis[0].data.map((m, i) => [m, o.series[0].data[i].value]) : [];
    };
    return {
      cards: ['can-kpi-total', 'can-kpi-real', 'can-kpi-rate'].map(id => $(id).textContent),
      reasons: bars(charts.reason), statuses: bars(charts.status), rows: table.length,
    };
  }

  CN.cancelled = { init, load, show, snapshot, reasonGroup, statusGroup, nameIn, phonesIn };
})(window.CashNow = window.CashNow || {});
