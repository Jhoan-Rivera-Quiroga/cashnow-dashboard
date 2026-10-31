/* App shell: opening the workbook, page routing, the status bar and data notes. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const $ = id => document.getElementById(id);
  const VIEWS = ['welcome', 'pickups', 'details'];
  let book = null; // { fileName, sheets, pickups }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

  function showView(name) {
    VIEWS.forEach(v => { $('view-' + v).hidden = v !== name; });
    document.body.dataset.view = name;
    const nav = $('nav-pickups');
    nav.classList.toggle('active', name !== 'welcome');
    if (name === 'welcome') nav.removeAttribute('aria-current');
    else nav.setAttribute('aria-current', 'page');
  }

  // #/pickups?... or #/pickups/details?...; the query holds the page's filters.
  function route() {
    if (!book) {
      showView('welcome');
      return;
    }
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const view = path === 'pickups/details' ? 'details' : 'pickups';
    showView(view);
    CN.pickups.show(view, new URLSearchParams(query || ''));
  }

  function busy(text) {
    $('overlay').hidden = !text;
    if (text) $('overlay-text').textContent = text;
  }

  function fail(err) {
    console.error(err);
    const msg = err instanceof CN.data.DataError ? err.message
      : `This file couldn't be read as an Excel workbook (${err && err.message ? err.message : err}).`;
    if (book) {
      $('status-error').textContent = msg;
      $('status-error').hidden = false;
    } else {
      $('load-error').textContent = msg;
      $('load-error').hidden = false;
    }
  }

  async function loadWorkbook(buffer, fileName) {
    busy(`Reading ${fileName}…`);
    await new Promise(r => setTimeout(r, 30)); // let the overlay paint before the heavy work
    try {
      const t0 = performance.now();
      book = CN.data.readWorkbook(buffer, fileName);
      CN.pickups.load(book.pickups);
      console.info(`Read ${fileName} in ${Math.round(performance.now() - t0)} ms`);
      $('load-error').hidden = true;
      $('status-error').hidden = true;
      renderStatus();
      if (!/^#\/pickups/.test(location.hash)) history.replaceState(null, '', '#/pickups');
      route();
    } catch (err) {
      fail(err);
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
    const p = book.pickups;
    $('status-file').textContent =
      `${book.fileName} · ${F.int(p.n)} pick-up lines · ${F.dayLong(p.minDay)} – ${F.dayLong(p.maxDay)}`;
    const count = noteCount(p.notes);
    $('status-notes').textContent = count ? `Data notes (${count})` : 'Data notes';
    $('status').hidden = false;
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
    items.push('<li>Names that differ only in capital letters or extra spaces count as one, as in Power BI ' +
      '(for example "PAUL" and "Paul"). Each is shown with the spelling that appears first in the sheet.</li>');
    $('notes-list').innerHTML = items.join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.XLSX || !window.echarts) {
      $('load-error').textContent = "The Excel and chart libraries didn't load, so the dashboard can't start. " +
        'Check the internet connection and reload the page.';
      $('load-error').hidden = false;
      $('open-file').disabled = true;
      return;
    }
    CN.pickups.init();
    const pick = () => $('file-input').click();
    $('open-file').addEventListener('click', pick);
    $('status-open').addEventListener('click', pick);
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

  CN.app = { loadWorkbook };
})(window.CashNow = window.CashNow || {});
