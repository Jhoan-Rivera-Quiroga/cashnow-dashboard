/* Number and date formatting. Dates are Excel-style serial day numbers, read as UTC. */
(function (CN) {
  'use strict';

  const DAY_MS = 86400000;
  const EPOCH = 25569; // serial day of 1970-01-01

  const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const utc = opts => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'UTC' }, opts));
  const dayShortFmt = utc({ month: 'short', day: '2-digit' });
  const dayLongFmt = utc({ month: 'short', day: 'numeric', year: 'numeric' });
  const monthFmt = utc({ month: 'short', year: 'numeric' });
  const monthLongFmt = utc({ month: 'long', year: 'numeric' });
  const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }); // viewer's own time zone

  const toDate = s => new Date((s - EPOCH) * DAY_MS);
  const fromYmd = (y, m, d) => Date.UTC(y, m - 1, d) / DAY_MS + EPOCH;
  const iso = s => toDate(s).toISOString().slice(0, 10);

  function fromIso(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
    if (!m) return null;
    const s = fromYmd(+m[1], +m[2], +m[3]);
    return iso(s) === text ? s : null;
  }

  // toFixed that rounds halves up: 1.035 is stored as 1.03499…, which toFixed(2) makes "1.03".
  const fixed = (x, digits) => (Math.round((x + Math.sign(x) * Number.EPSILON) * 10 ** digits) / 10 ** digits).toFixed(digits);

  // Power BI's display units: 5922 -> "5.92K", 109966 -> "110.0K", 2919612 -> "2.92M".
  function short(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return fixed(n / 1e6, 2) + 'M';
    if (a >= 1e3) return fixed(n / 1e3, a < 1e4 ? 2 : 1) + 'K';
    return numFmt.format(n);
  }

  // A CSV cell; a leading = + - @ gets a quote mark so Excel won't run it as a formula.
  function csv(v) {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  CN.fmt = {
    EPOCH, toDate, fromYmd, fromIso, iso, short, csv,
    int: n => intFmt.format(n),
    num: n => numFmt.format(n),
    money: n => moneyFmt.format(n),
    dayShort: s => dayShortFmt.format(toDate(s)), // Mar 08
    dayLong: s => dayLongFmt.format(toDate(s)), // Mar 8, 2026
    month: s => monthFmt.format(toDate(s)), // Mar 2026
    monthLong: s => monthLongFmt.format(toDate(s)), // March 2026
    clock: date => clockFmt.format(date), // 10:42 AM
  };
})(window.CashNow = window.CashNow || {});
