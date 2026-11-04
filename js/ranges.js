/* The Range choices the report pages share. Ranges count back from the latest date in the data,
   so a new file opens on its recent months. */
(function (CN) {
  'use strict';
  const F = CN.fmt;

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

  CN.ranges = { PRESETS, range };
})(window.CashNow = window.CashNow || {});
