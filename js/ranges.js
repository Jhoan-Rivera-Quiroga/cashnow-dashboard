/* The Date, Range and Dynamic Date choices the report pages share. Every page opens with no dates
   and shows its data once one is picked. Ranges count back from the latest date in the data, so a new
   file opens on its recent months. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const NO_DATES = 'Select a date to see data';

  // Dynamic Date: how each kind of date bucket is shown on an axis and named in a sentence.
  const GRAN = {
    daily: { name: 'Daily', label: F.dayShort, phrase: F.dayLong },
    weekly: { name: 'Weekly', label: F.dayShort, phrase: s => 'Week of ' + F.dayLong(s) },
    monthly: { name: 'Monthly', label: F.month, phrase: F.monthLong },
  };

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

  // [from, to] as serial days, kept between the data's first and last day.
  function range(id, minDay, maxDay) {
    const t = F.toDate(maxDay), y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
    const p = PRESETS[id];
    let from = minDay;
    if (p.months) from = F.fromYmd(y, m - p.months + 1, 1);
    else if (id === 'ytd') from = F.fromYmd(y, 1, 1);
    return [Math.max(from, minDay), maxDay];
  }

  // A page's dates: { preset, from, to }, with from and to as serial days, or null for a blank date.
  // The page opens with both blank.
  const noDates = () => ({ preset: '', from: null, to: null });
  const picked = S => S.from !== null || S.to !== null;

  // [first, last] day of the dates, a blank one leaving that end open (the data's first or last day);
  // null before any date is picked.
  function span(S, minDay, maxDay) {
    if (!picked(S)) return null;
    return [S.from === null ? minDay : S.from, S.to === null ? maxDay : S.to];
  }

  // The dates in words, for table headers, Details buttons and file names.
  function phrase(S, minDay, maxDay) {
    const s = span(S, minDay, maxDay);
    if (!s) return 'No dates selected';
    return s[0] === s[1] ? F.dayLong(s[0]) : `${F.dayLong(s[0])} – ${F.dayLong(s[1])}`;
  }

  // The dates in a page's address: range=<preset>, and from and to for custom dates. prefix tells the
  // two halves of the Demographics page apart.
  function toParams(p, S, prefix = '') {
    if (!picked(S)) return;
    p.set(prefix + 'range', S.preset);
    if (S.preset !== 'custom') return;
    if (S.from !== null) p.set(prefix + 'from', F.iso(S.from));
    if (S.to !== null) p.set(prefix + 'to', F.iso(S.to));
  }

  // Reads the dates back from an address. Without any there, S stays as it is.
  function applyParams(q, S, minDay, maxDay, prefix = '') {
    const id = q.get(prefix + 'range');
    let from = F.fromIso(q.get(prefix + 'from')), to = F.fromIso(q.get(prefix + 'to'));
    if (PRESETS[id] && id !== 'custom') {
      S.preset = id;
      [S.from, S.to] = range(id, minDay, maxDay);
    } else if (from !== null || to !== null) {
      if (from !== null && to !== null && from > to) [from, to] = [to, from];
      Object.assign(S, { preset: 'custom', from, to });
    }
  }

  // Wires a page's Date inputs and Range list to S. ids: { from, to, preset }; bounds(): [first,
  // last] day in the page's data; onChange(): redraw the page. One date is enough, and clearing both
  // empties the page again. Returns { sync() (show S in the controls), limit(minDay, maxDay) }.
  function controls(ids, S, bounds, onChange) {
    const el = id => document.getElementById(id);
    const from = el(ids.from), to = el(ids.to), list = el(ids.preset);
    const none = new Option('Select a range', ''); // shown until a range is picked
    none.disabled = true;
    none.hidden = true;
    list.add(none);
    for (const [id, p] of Object.entries(PRESETS)) list.add(new Option(p.name, id));
    list.addEventListener('change', () => {
      if (list.value === 'custom') return;
      S.preset = list.value;
      [S.from, S.to] = range(list.value, ...bounds());
      onChange();
    });
    const onDate = () => {
      let a = F.fromIso(from.value), b = F.fromIso(to.value);
      if (a !== null && b !== null && a > b) [a, b] = [b, a];
      Object.assign(S, { preset: a === null && b === null ? '' : 'custom', from: a, to: b });
      onChange();
    };
    from.addEventListener('change', onDate);
    to.addEventListener('change', onDate);
    return {
      sync() {
        from.value = S.from === null ? '' : F.iso(S.from);
        to.value = S.to === null ? '' : F.iso(S.to);
        list.value = S.preset;
      },
      limit(minDay, maxDay) {
        for (const input of [from, to]) {
          input.min = F.iso(minDay);
          input.max = F.iso(maxDay);
        }
      },
    };
  }

  CN.ranges = { PRESETS, GRAN, NO_DATES, range, noDates, picked, span, phrase, toParams, applyParams, controls };
})(window.CashNow = window.CashNow || {});
