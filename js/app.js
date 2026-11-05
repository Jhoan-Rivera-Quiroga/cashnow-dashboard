/* App shell: loading the data (Google Sheets or a workbook file), page routing, the status bar
   and data notes. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const SECTIONS = ['welcome', 'pickups', 'details', 'drivers', 'drv-details', 'insights', 'mail', 'mail-details',
    'electronics', 'vendors']; // #view-…
  const MENU = ['nav-pickups', 'nav-drivers', 'nav-insights', 'nav-mail', 'nav-electronics', 'nav-vendors'];
  // Each address path: the section it shows, its menu item, and the page module that fills it.
  const PATHS = {
    pickups: { section: 'pickups', menu: 'nav-pickups', show: p => CN.pickups.show('pickups', p) },
    'pickups/details': { section: 'details', menu: 'nav-pickups', show: p => CN.pickups.show('details', p) },
    drivers: { section: 'drivers', menu: 'nav-drivers', show: p => CN.drivers.show(p, 'drivers') },
    'drivers/details': { section: 'drv-details', menu: 'nav-drivers', show: p => CN.drivers.show(p, 'details') },
    insights: { section: 'insights', menu: 'nav-insights', show: p => CN.insights.show(p, 'insights') },
    // Insights lists its pick-ups in the Pick Up Detail table.
    'insights/details': { section: 'details', menu: 'nav-insights', show: p => CN.insights.show(p, 'details') },
    mail: { section: 'mail', menu: 'nav-mail', show: p => CN.mail.show(p, 'mail') },
    'mail/details': { section: 'mail-details', menu: 'nav-mail', show: p => CN.mail.show(p, 'details') },
    electronics: { section: 'electronics', menu: 'nav-electronics', show: p => CN.electronics.show(p) },
    vendors: { section: 'vendors', menu: 'nav-vendors', show: p => CN.vendors.show(p, 'vendors') },
    // Vendors & Products lists its order lines in the Mail Details table.
    'vendors/details': { section: 'mail-details', menu: 'nav-vendors', show: p => CN.vendors.show(p, 'details') },
  };
  // { name, source: 'google' | 'file', sheets, pickups, payouts, mail and electronics (each null when
  // its sheet is missing or unreadable), payoutsProblem, mailProblem and electronicsProblem (why), loadedAt }
  let book = null;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

  function showView(section, menu) {
    SECTIONS.forEach(s => { $('view-' + s).hidden = s !== section; });
    document.body.dataset.view = section;
    for (const id of MENU) {
      $(id).classList.toggle('active', id === menu);
      if (id === menu) $(id).setAttribute('aria-current', 'page');
      else $(id).removeAttribute('aria-current');
    }
  }

  // #/<page>?... or #/<page>/details?... (see PATHS); the query holds the page's filters.
  function route() {
    if (!book) {
      showView('welcome');
      return;
    }
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const target = PATHS[path] || PATHS.pickups;
    showView(target.section, target.menu);
    target.show(new URLSearchParams(query || ''));
  }

  function busy(text) {
    $('overlay').hidden = !text;
    if (text) $('overlay-text').textContent = text;
  }

  // what: the fallback message for errors that aren't about the data itself.
  function fail(err, what) {
    if (err instanceof CN.google.Cancelled) return;
    console.error(err);
    const msg = err instanceof CN.data.DataError ? err.message
      : `${what} (${err && err.message ? err.message : err}).`;
    if (book) {
      $('status-error').textContent = msg;
      $('status-error').hidden = false;
    } else {
      $('load-error').textContent = msg;
      $('load-error').hidden = false;
    }
  }

  function clearErrors() {
    $('load-error').hidden = true;
    $('status-error').hidden = true;
  }

  function useBook(loaded) {
    book = Object.assign(loaded, { loadedAt: new Date() });
    CN.pickups.load(book.pickups);
    CN.drivers.load(book);
    CN.insights.load(book);
    CN.mail.load(book);
    CN.electronics.load(book);
    CN.vendors.load(book);
    clearErrors();
    renderStatus();
    if (!PATHS[location.hash.replace(/^#\/?/, '').split('?')[0]]) history.replaceState(null, '', '#/pickups');
    route();
  }

  async function loadWorkbook(buffer, fileName) {
    busy(`Reading ${fileName}…`);
    await new Promise(r => setTimeout(r, 30)); // let the overlay paint before the heavy work
    try {
      const t0 = performance.now();
      const loaded = CN.data.readWorkbook(buffer, fileName);
      console.info(`Read ${fileName} in ${Math.round(performance.now() - t0)} ms`);
      useBook(loaded);
    } catch (err) {
      fail(err, "This file couldn't be read as an Excel workbook");
    } finally {
      busy(null);
    }
  }

  // Runs straight from a click, because signing in opens Google's popup window.
  async function loadFromGoogle(options) {
    clearErrors();
    try {
      const t0 = performance.now();
      const loaded = await CN.google.connect(busy, options);
      console.info(`Read ${loaded.name} from Google Sheets in ${Math.round(performance.now() - t0)} ms`);
      useBook(loaded);
    } catch (err) {
      fail(err, "The sheet couldn't be read");
    } finally {
      busy(null);
    }
  }

  async function openFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name)) {
      fail(new CN.data.DataError(`"${file.name}" isn't an Excel workbook. Open Historical Raw Data.xlsx.`));
      return;
    }
    if (!window.XLSX) {
      fail(new CN.data.DataError("The Excel library didn't load, so files can't be opened. Reload the page and try again."));
      return;
    }
    let buffer;
    try {
      busy(`Reading ${file.name}…`);
      buffer = await file.arrayBuffer();
    } catch (err) {
      busy(null);
      fail(err);
      return;
    }
    loadWorkbook(buffer, file.name);
  }

  function noteCount(n) {
    return n.commaDecimals.length + n.badDates.length + n.badAmounts.length + (n.noDate ? 1 : 0);
  }

  function renderStatus() {
    const p = book.pickups, q = book.payouts, m = book.mail, e = book.electronics, google = book.source === 'google';
    $('status-file').textContent = [
      google ? `${book.name} (Google Sheets)` : book.name,
      `${F.int(p.n)} pick-up lines`,
      q ? `${F.int(q.n)} payout lines` : '',
      m ? `${F.int(m.n)} mail order lines` : '',
      e ? `${F.int(e.n)} electronics lines` : '',
      `${F.dayLong(p.minDay)} – ${F.dayLong(p.maxDay)}`,
      google ? `loaded ${F.clock(book.loadedAt)}` : '',
    ].filter(Boolean).join(' · ');
    const count = noteCount(p.notes) + [q, m, e].reduce((s, x) => s + (x ? noteCount(x.notes) : 1), 0);
    $('status-notes').textContent = count ? `Data notes (${count})` : 'Data notes';
    for (const id of ['status-refresh', 'status-choose', 'status-signout']) $(id).hidden = !google;
    if (CN.google.fixedSheet) $('status-choose').hidden = true; // js/config.js names the sheet
    $('status-google').hidden = google || !CN.google.enabled;
    $('status-open').hidden = google;
    $('status').hidden = false;
  }

  // The start screen offers Google Sheets once js/config.js is filled in, and a workbook file otherwise.
  function setUpStart() {
    const google = CN.google.enabled;
    $('start-google').hidden = !google;
    $('start-file').hidden = google;
    $('privacy').textContent = google
      ? "The data goes straight from Google Sheets to this browser and isn't stored anywhere else."
      : 'The file is read inside this browser. Nothing is uploaded or saved.';
    if (!google) return;
    const saved = CN.google.remembered();
    if (saved) $('google-hint').textContent = `Sign in with Google to load ${saved.name}.`;
    CN.google.init().then(() => { $('google-signin').disabled = false; }, err => fail(err));
  }

  function renderNotes() {
    const n = book.pickups.notes;
    const items = [];
    if (n.commaDecimals.length) {
      const extra = n.commaDecimals.reduce((s, x) => s + x.powerBi - x.amount, 0);
      items.push(`<li><b>${n.commaDecimals.length} amount${n.commaDecimals.length > 1 ? 's were' : ' was'} typed with a comma as the decimal mark.</b> ` +
        `This dashboard reads them as written. Power BI reads every comma as a thousands separator, so its totals come out ` +
        `${F.money(extra)} higher.<ul>` + n.commaDecimals.map(x =>
        `<li>Row ${x.row}${x.day >= 0 ? ', ' + F.iso(x.day) : ''}: "${esc(x.value)}" = ${F.money(x.amount)} (Power BI: ${F.money(x.powerBi)})</li>`).join('') +
        '</ul></li>');
    }
    if (n.badDates.length) {
      items.push(`<li><b>${F.int(n.badDates.length)} rows have a date that can't be read</b> and are left out of every date range: ` +
        n.badDates.slice(0, 8).map(x => `row ${x.row} ("${esc(x.value)}")`).join(', ') + (n.badDates.length > 8 ? ', …' : '') + '</li>');
    }
    if (n.noDate) items.push(`<li><b>${F.int(n.noDate)} row${n.noDate > 1 ? 's have' : ' has'} no date</b> and ${n.noDate > 1 ? 'are' : 'is'} left out of every date range.</li>`);
    if (n.badAmounts.length) {
      items.push(`<li><b>${F.int(n.badAmounts.length)} amounts aren't numbers</b> and count as $0: ` +
        n.badAmounts.slice(0, 8).map(x => `row ${x.row} ("${esc(x.value)}")`).join(', ') + (n.badAmounts.length > 8 ? ', …' : '') + '</li>');
    }
    if (n.noAmount) items.push(`<li>${F.int(n.noAmount)} row${n.noAmount > 1 ? 's have' : ' has'} no amount and count${n.noAmount > 1 ? '' : 's'} as $0.</li>`);
    items.push(sheetNotes(book.payouts, book.payoutsProblem, 'Driver Payouts', 'The Drivers page shows no payouts.'));
    items.push(sheetNotes(book.mail, book.mailProblem, 'Mail_Order', 'The Mail Order page shows no mail orders.'));
    items.push(sheetNotes(book.electronics, book.electronicsProblem, 'Electronics', 'The Electronics page shows nothing.'));
    items.push('<li>Names that differ only in capital letters or extra spaces count as one, as in Power BI ' +
      '(for example "PAUL" and "Paul"). Each is shown with the spelling that appears first in the sheet.</li>');
    $('notes-list').innerHTML = items.join('');
  }

  // One optional sheet's notes in one item: q is its data, or null and `problem` says why.
  function sheetNotes(q, problem, name, without) {
    if (!q) return `<li><b>${name}:</b> ${esc(problem)} ${without}</li>`;
    const n = q.notes, parts = [];
    const rows = list => list.slice(0, 8).map(x => `row ${x.row} ("${esc(x.value)}")`).join(', ') + (list.length > 8 ? ', …' : '');
    const s = (k, one, many) => `${F.int(k)} ${k === 1 ? one : many}`;
    if (n.commaDecimals.length) {
      const extra = n.commaDecimals.reduce((t, x) => t + x.powerBi - x.amount, 0);
      parts.push(`${s(n.commaDecimals.length, 'amount was', 'amounts were')} typed with a comma as the decimal mark ` +
        `and ${n.commaDecimals.length === 1 ? 'is' : 'are'} read as written, which puts Power BI's total ${F.money(extra)} higher: ` +
        rows(n.commaDecimals.map(x => ({ row: x.row, value: x.value }))));
    }
    if (n.badAmounts.length) parts.push(`${s(n.badAmounts.length, "amount isn't a number", "amounts aren't numbers")} and count as $0: ${rows(n.badAmounts)}`);
    if (n.noAmount) parts.push(`${s(n.noAmount, 'row has', 'rows have')} no amount and count as $0`);
    if (n.badDates.length) parts.push(`${s(n.badDates.length, 'row has a date that', 'rows have a date that')} can't be read and ${n.badDates.length === 1 ? 'is' : 'are'} left out: ${rows(n.badDates)}`);
    if (n.noDate) parts.push(`${s(n.noDate, 'row has', 'rows have')} no date and ${n.noDate === 1 ? 'is' : 'are'} left out`);
    return parts.length ? `<li><b>${name}:</b> ${parts.join('; ')}.</li>` : '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    // The Excel library is needed only for workbook files.
    if (!window.echarts || (!window.XLSX && !CN.google.enabled)) {
      $('load-error').textContent = "The Excel and chart libraries didn't load, so the dashboard can't start. " +
        'Check the internet connection and reload the page.';
      $('load-error').hidden = false;
      $('open-file').disabled = true;
      return;
    }
    CN.pickups.init();
    CN.drivers.init();
    CN.insights.init();
    CN.mail.init();
    CN.electronics.init();
    CN.vendors.init();
    setUpStart();
    const pick = () => $('file-input').click();
    for (const id of ['open-file', 'open-file-alt', 'status-open']) $(id).addEventListener('click', pick);
    $('google-signin').addEventListener('click', () => loadFromGoogle());
    $('status-google').addEventListener('click', () => loadFromGoogle());
    $('status-refresh').addEventListener('click', () => loadFromGoogle());
    $('status-choose').addEventListener('click', () => loadFromGoogle({ choose: true }));
    // Reloading drops the sign-in and the data, which live only in this page's memory.
    $('status-signout').addEventListener('click', () => location.reload());
    $('file-input').addEventListener('change', e => {
      openFile(e.target.files[0]);
      e.target.value = '';
    });
    $('status-notes').addEventListener('click', () => {
      renderNotes();
      $('notes-dialog').showModal();
    });
    $('notes-close').addEventListener('click', () => $('notes-dialog').close());

    // Drop the workbook anywhere on the page.
    let depth = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); depth++; document.body.classList.add('dropping'); });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dropping'); } });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove('dropping');
      openFile(e.dataTransfer.files[0]);
    });

    window.addEventListener('hashchange', route);
    route();
  });

  CN.app = { loadWorkbook, useBook };
})(window.CashNow = window.CashNow || {});
