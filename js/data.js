/* Turns the Collection and Driver Payouts tables into clean columns, from a workbook file (read
   with SheetJS) or from rows that js/google.js reads from Google Sheets. */
(function (CN) {
  'use strict';
  const F = CN.fmt;

  class DataError extends Error {
    constructor(message) { super(message); this.name = 'DataError'; }
  }

  // Columns the Pick Ups pages read, matched ignoring case, spaces and underscores.
  const PICKUP_COLUMNS = {
    date: 'Collection_Date',
    order: 'Collection_Order_No', // the order number Power BI's Pick Up Detail table shows
    vendor: 'First_Name',
    city: 'City',
    state: 'State',
    driver: 'Assign_to',
    product: 'Product_Code',
    units: 'Quantity',
    amount: 'Comments', // holds the dollars paid on the line
  };
  // Read when present; only the Insights page's category chart needs it.
  const PICKUP_OPTIONAL = { category: 'Category' };
  const TEXT_FIELDS = ['order', 'vendor', 'city', 'state', 'driver', 'product', 'category'];

  // Columns the Drivers page reads. The sheet repeats some of these names in a block beside the
  // table; the first column with each name is the one read.
  const PAYOUT_COLUMNS = {
    date: 'Date',
    driver: 'Driver name',
    amount: 'Payment Amount',
    concept: 'Concept', // Schedule, Commission, Bonus or Shipping
    note: 'Notes', // the kind of bonus, on Bonus lines
  };

  // Columns the Mail Order pages read. Each order has a row per product line, and each day has a
  // row of its own that only counts the orders completed (Order Qty).
  const MAIL_COLUMNS = {
    date: 'Delivery Date', // the date Power BI's mail pages filter on
    order: 'Delivery Order (D.O.) No.',
    vendor: 'First Name',
    product: 'Product Code / Name',
    units: 'Quantity',
    amount: 'Total', // the line's dollars; "Payment Amount" repeats the whole order's on every line
    orders: 'Order Qty',
  };

  // Columns the Electronics page reads: one row per device bought.
  const ELECTRONICS_COLUMNS = {
    date: 'Collection Date',
    vendor: 'First Name',
    model: 'Marketing Name',
    units: 'Quantity',
    amount: 'Comments', // holds the price paid, as on the Collection sheet
  };

  // An optional sheet and how to read it with readTable.
  const optional = (field, name, table) => ({
    field, name,
    columns: (header, sheet) => findColumns(table.columns, header, sheet, table.optional),
    read: (rows, firstRow, sheet, dateOffset) => readTable(rows, firstRow, sheet, dateOffset, table),
  });

  // Sheets that each feed one page. When one is missing or can't be read, the other pages keep
  // working and that page says why. The loaded data goes in `field`, the reason in `field`Problem.
  const OPTIONAL_SHEETS = [
    optional('payouts', 'Driver Payouts', { columns: PAYOUT_COLUMNS, text: ['driver', 'concept', 'note'] }),
    optional('mail', 'Mail_Order', {
      columns: MAIL_COLUMNS, optional: { person: 'Sales Person' }, text: ['order', 'vendor', 'product', 'person'],
      numbers: ['units', 'orders'], buckets: true,
      // A day's orders-completed row has no line amount, and that isn't worth a data note.
      countRow: (row, col) => cleanText(row[col.amount]) === null && cleanText(row[col.orders]) !== null,
    }),
    optional('electronics', 'Electronics', { columns: ELECTRONICS_COLUMNS, text: ['vendor', 'model'], numbers: ['units'] }),
  ];

  const key = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  function cleanText(v) {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
  }

  // Text amounts: "77,5" uses a comma decimal (77.5) and "1,234.50" a thousands comma.
  // Power BI treats every comma as a thousands separator, so it reads "77,5" as 775.
  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    let t = v.replace(/[$\s]/g, '');
    if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    return t === '' ? NaN : Number(t);
  }

  // Real Excel dates arrive as serial numbers; some cells hold text such as
  // "2026-03-11" or "3/11/2026". Returns a serial day number, or null.
  function toDay(v, offset) {
    if (typeof v === 'number') return v >= 1 ? Math.floor(v) + offset : null;
    const s = cleanText(v);
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s);
    if (m) return validDay(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return validDay(+m[3], +m[1], +m[2]);
    return null;
  }

  function validDay(y, m, d) {
    const s = F.fromYmd(y, m, d);
    const t = F.toDate(s);
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? s : null;
  }

  const newNotes = () => ({ commaDecimals: [], badDates: [], noDate: 0, badAmounts: [], noAmount: 0 });

  // A row's date as a serial day, or -1 when it's missing or can't be read (listed in Data notes).
  function readDate(raw, offset, notes, row) {
    const d = toDay(raw, offset);
    if (d !== null) return d;
    if (cleanText(raw) === null) notes.noDate++;
    else notes.badDates.push({ row, value: String(raw) });
    return -1;
  }

  // A row's amount, or 0 when it's missing or isn't a number. Data notes lists those, and the
  // comma decimals that Power BI reads differently.
  function readAmount(raw, day, notes, row) {
    const a = toNumber(raw);
    if (Number.isNaN(a)) {
      if (cleanText(raw) === null) notes.noAmount++;
      else notes.badAmounts.push({ row, value: String(raw) });
      return 0;
    }
    if (typeof raw === 'string' && /^\$?\s*-?\d+,\d{1,2}$/.test(raw.trim())) {
      notes.commaDecimals.push({ row, day, value: raw.trim(), amount: a, powerBi: Number(raw.replace(/[$\s,]/g, '')) });
    }
    return a;
  }

  // Groups text ignoring case and labels each group with the spelling that appears first
  // in the sheet, as Power BI does ("PAUL" and "Paul" are one vendor, shown as "PAUL").
  class Dict {
    constructor() { this.codes = new Map(); this.names = []; }

    code(text) {
      if (text === null) return -1;
      const k = text.toLowerCase();
      let c = this.codes.get(k);
      if (c === undefined) {
        c = this.names.length;
        this.codes.set(k, c);
        this.names.push(text);
      }
      return c;
    }

    labels() { return this.names; }
  }

  // The sheet the Pick Ups pages read; `what` names the file in the error message.
  function findSheet(names, what) {
    const sheet = names.find(n => key(n) === 'collection');
    if (!sheet) throw new DataError(`${what} has no "Collection" sheet. Its sheets are: ${names.join(', ')}.`);
    return sheet;
  }

  // An optional sheet's name in the file, or null when it has none.
  const findOptional = (names, o) => names.find(n => key(n) === key(o.name)) || null;

  // Position of each wanted column in the header row; -1 for an optional column that isn't there.
  function findColumns(wanted, header, sheet, optional = {}) {
    const col = {}, missing = [];
    const at = name => header.findIndex(v => key(v) === key(name));
    for (const [field, name] of Object.entries(wanted)) {
      col[field] = at(name);
      if (col[field] < 0) missing.push(name);
    }
    if (missing.length) {
      throw new DataError(`The "${sheet}" sheet is missing ${missing.length === 1 ? 'the column' : 'these columns'} ` +
        `${missing.join(', ')}. Its columns are: ${header.filter(v => v != null && v !== '').join(', ')}.`);
    }
    for (const [field, name] of Object.entries(optional)) col[field] = at(name);
    return col;
  }
  const pickupColumns = (header, sheet) => findColumns(PICKUP_COLUMNS, header, sheet, PICKUP_OPTIONAL);

  // o: one of OPTIONAL_SHEETS; sheet: its name in the file (or null); read(): its data, or a DataError.
  function optionalSheet(o, sheet, read, what) {
    let data = null, problem = null;
    if (!sheet) problem = `${what} has no "${o.name}" sheet.`;
    else {
      try {
        data = read();
      } catch (err) {
        if (!(err instanceof DataError)) throw err;
        problem = err.message;
      }
    }
    return { [o.field]: data, [o.field + 'Problem']: problem };
  }

  // A SheetJS sheet as one array of raw values per row, and the sheet row of the first one.
  function sheetRows(ws, sheet) {
    if (!ws || !ws['!ref']) throw new DataError(`The "${sheet}" sheet is empty.`);
    return {
      rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }),
      firstRow: XLSX.utils.decode_range(ws['!ref']).s.r,
    };
  }

  function readWorkbook(buffer, fileName) {
    const bytes = new Uint8Array(buffer);
    const names = XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames;
    const sheet = findSheet(names, 'This workbook');
    const optional = OPTIONAL_SHEETS.map(o => ({ o, sheet: findOptional(names, o) }));
    const wb = XLSX.read(bytes, {
      type: 'array', sheets: [sheet, ...optional.filter(x => x.sheet).map(x => x.sheet)],
      dense: true, cellText: false, cellHTML: false,
    });
    const props = wb.Workbook && wb.Workbook.WBProps;
    const offset = props && props.date1904 ? 1462 : 0;
    const c = sheetRows(wb.Sheets[sheet], sheet);
    const loaded = { name: fileName, source: 'file', sheets: names, pickups: readPickups(c.rows, c.firstRow, sheet, offset) };
    for (const { o, sheet: s } of optional) {
      Object.assign(loaded, optionalSheet(o, s, () => {
        const r = sheetRows(wb.Sheets[s], s);
        return o.read(r.rows, r.firstRow, s, offset);
      }, 'This workbook'));
    }
    return loaded;
  }

  // rows: one array of raw cell values per sheet row (numbers, dates as serial numbers, text,
  // true/false, or null when empty); rows[0] is the sheet's row firstRow + 1.
  function readPickups(rows, firstRow, sheet, dateOffset) {
    const h = rows.findIndex(r => r.some(v => v != null));
    if (h < 0) throw new DataError(`The "${sheet}" sheet is empty.`);
    const col = pickupColumns(rows[h], sheet);

    const cap = rows.length - h - 1;
    const day = new Int32Array(cap), amount = new Float64Array(cap), units = new Float64Array(cap);
    const dicts = {}, codes = {};
    TEXT_FIELDS.forEach(f => { dicts[f] = new Dict(); codes[f] = new Int32Array(cap); });
    const notes = newNotes();
    let n = 0, minDay = Infinity, maxDay = -Infinity;

    for (let j = h + 1; j < rows.length; j++) {
      const row = rows[j];
      if (!row.some(v => v != null)) continue;
      const excelRow = firstRow + j + 1;
      const d = readDate(row[col.date], dateOffset, notes, excelRow);
      if (d >= 0) {
        if (d < minDay) minDay = d;
        if (d > maxDay) maxDay = d;
      }
      day[n] = d;
      for (const f of TEXT_FIELDS) codes[f][n] = dicts[f].code(cleanText(row[col[f]]));
      amount[n] = readAmount(row[col.amount], d, notes, excelRow);
      const u = toNumber(row[col.units]);
      units[n] = Number.isNaN(u) ? 0 : u;
      n++;
    }
    if (!Number.isFinite(minDay)) throw new DataError(`No readable dates in the "${sheet}" sheet's ${PICKUP_COLUMNS.date} column.`);

    const out = {
      sheet, n, minDay, maxDay, notes, hasCategory: col.category >= 0,
      day: day.subarray(0, n), amount: amount.subarray(0, n), units: units.subarray(0, n),
      labels: {},
    };
    for (const f of TEXT_FIELDS) {
      out[f] = codes[f].subarray(0, n);
      out.labels[f] = dicts[f].labels();
    }
    out.bucket = buckets(out.day);
    return out;
  }

  // Each row's day, week (Monday start) and month, for the Daily/Weekly/Monthly switch; -1 for no date.
  function buckets(day) {
    const week = new Int32Array(day.length), month = new Int32Array(day.length);
    for (let i = 0; i < day.length; i++) {
      const d = day[i];
      if (d < 0) { week[i] = month[i] = -1; continue; }
      week[i] = d - ((((d - F.EPOCH + 3) % 7) + 7) % 7);
      const t = F.toDate(d);
      month[i] = F.fromYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
    }
    return { daily: day, weekly: week, monthly: month };
  }

  // An optional sheet's table (see OPTIONAL_SHEETS); rows as for readPickups. t: { columns, optional,
  // text (fields grouped by name, like the Pick Ups names), numbers (read as numbers, 0 when blank),
  // countRow(row, col) (rows that rightly have no amount), buckets (add each row's week and month) }.
  // The amount column's oddities go in Data notes.
  function readTable(rows, firstRow, sheet, dateOffset, t) {
    const h = rows.findIndex(r => r.some(v => v != null));
    if (h < 0) throw new DataError(`The "${sheet}" sheet is empty.`);
    const col = findColumns(t.columns, rows[h], sheet, t.optional);
    const used = Object.values(col).filter(c => c >= 0);
    const numbers = t.numbers || [];

    const cap = rows.length - h - 1;
    const day = new Int32Array(cap), amount = new Float64Array(cap);
    const nums = {}, dicts = {}, codes = {};
    numbers.forEach(f => { nums[f] = new Float64Array(cap); });
    t.text.forEach(f => { dicts[f] = new Dict(); codes[f] = new Int32Array(cap); });
    const notes = newNotes();
    let n = 0, minDay = Infinity, maxDay = -Infinity;

    for (let j = h + 1; j < rows.length; j++) {
      const row = rows[j];
      if (!used.some(c => row[c] != null)) continue; // only the table's own columns count
      const excelRow = firstRow + j + 1;
      const d = readDate(row[col.date], dateOffset, notes, excelRow);
      if (d >= 0) {
        if (d < minDay) minDay = d;
        if (d > maxDay) maxDay = d;
      }
      day[n] = d;
      for (const f of t.text) codes[f][n] = dicts[f].code(cleanText(row[col[f]]));
      amount[n] = t.countRow && t.countRow(row, col) ? 0 : readAmount(row[col.amount], d, notes, excelRow);
      for (const f of numbers) {
        const v = toNumber(row[col[f]]);
        nums[f][n] = Number.isNaN(v) ? 0 : v;
      }
      n++;
    }

    const dated = Number.isFinite(minDay);
    const out = {
      sheet, n, notes, minDay: dated ? minDay : null, maxDay: dated ? maxDay : null,
      day: day.subarray(0, n), amount: amount.subarray(0, n), labels: {}, has: {},
    };
    for (const f of numbers) out[f] = nums[f].subarray(0, n);
    for (const f of t.text) {
      out[f] = codes[f].subarray(0, n);
      out.labels[f] = dicts[f].labels();
    }
    for (const f of Object.keys(t.optional || {})) out.has[f] = col[f] >= 0;
    if (t.buckets) out.bucket = buckets(out.day);
    return out;
  }

  CN.data = {
    readWorkbook, readPickups, findSheet, pickupColumns, OPTIONAL_SHEETS, findOptional, optionalSheet,
    toNumber, toDay, DataError,
  };
})(window.CashNow = window.CashNow || {});
