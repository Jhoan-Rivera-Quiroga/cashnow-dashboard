/* The detail tables of the drill-through pages: sortable columns, a total row, "Show more", and
   CSV download. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const { esc } = CN.charts;
  const PAGE = 500; // rows added per "Show more"
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const NUMBERS = new Set(['num', 'money']); // right-aligned and summed in the total row
  const html = { day: F.iso, text: esc, num: F.num, money: F.money };
  const csv = { day: F.iso, text: F.csv, num: String, money: v => v.toFixed(2) };

  // ids: { table, more } (the <table> and its "Show more" button). cols: [{ key, label, type:
  // 'day' | 'text' | 'num' | 'money' }]. Rows are sorted by the first column until a header is clicked,
  // and ties go by the text and date columns in order.
  function create(ids, cols) {
    const table = document.getElementById(ids.table), more = document.getElementById(ids.more);
    const T = { rows: [], sort: cols[0].key, dir: 1, shown: 0 };
    const type = Object.fromEntries(cols.map(c => [c.key, c.type]));
    const tie = cols.filter(c => !NUMBERS.has(c.type)).map(c => c.key);
    const firstNumber = cols.findIndex(c => NUMBERS.has(c.type));
    const cls = c => (NUMBERS.has(c.type) ? ' class="num"' : '');

    table.innerHTML = '<thead><tr>' +
      cols.map(c => `<th data-sort="${c.key}" aria-sort="none"${cls(c)}><button type="button">${esc(c.label)}</button></th>`).join('') +
      '</tr></thead><tbody></tbody><tfoot></tfoot>';
    table.querySelectorAll('th button').forEach(b => b.addEventListener('click', () => {
      const k = b.parentElement.dataset.sort;
      T.dir = T.sort === k ? -T.dir : 1;
      T.sort = k;
      sort();
      redraw();
    }));
    more.addEventListener('click', showMore);

    function sort() {
      const keys = [T.sort, ...tie.filter(k => k !== T.sort)];
      T.rows.sort((a, b) => {
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          const c = type[k] === 'text' ? collator.compare(a[k], b[k]) : a[k] - b[k];
          if (c) return j === 0 ? c * T.dir : c;
        }
        return 0;
      });
      table.querySelectorAll('th[data-sort]').forEach(th => {
        th.setAttribute('aria-sort', th.dataset.sort !== T.sort ? 'none' : T.dir > 0 ? 'ascending' : 'descending');
      });
    }

    function redraw() {
      table.tBodies[0].textContent = '';
      T.shown = 0;
      showMore();
    }

    function showMore() {
      const end = Math.min(T.rows.length, T.shown + PAGE);
      let rows = '';
      for (let i = T.shown; i < end; i++) {
        const r = T.rows[i];
        rows += '<tr>' + cols.map(c => `<td${cls(c)}>${html[c.type](r[c.key])}</td>`).join('') + '</tr>';
      }
      table.tBodies[0].insertAdjacentHTML('beforeend', rows);
      T.shown = end;
      const left = T.rows.length - end;
      more.hidden = left <= 0;
      more.textContent = `Show ${F.int(Math.min(PAGE, left))} more (${F.int(left)} not shown)`;
    }

    // "Total" across the columns before the first number column, then each number column's sum.
    function totals() {
      if (firstNumber < 0) {
        table.tFoot.textContent = '';
        return;
      }
      const cells = [`<td colspan="${firstNumber}">Total</td>`];
      for (const c of cols.slice(firstNumber)) {
        cells.push(NUMBERS.has(c.type)
          ? `<td class="num" data-total="${c.key}">${html[c.type](T.rows.reduce((s, r) => s + r[c.key], 0))}</td>` : '<td></td>');
      }
      table.tFoot.innerHTML = `<tr>${cells.join('')}</tr>`;
    }

    return {
      set(rows) {
        T.rows = rows;
        sort();
        totals();
        redraw();
      },
      get length() { return T.rows.length; },
      // Every row, not just those shown.
      download(fileName) {
        const lines = [cols.map(c => F.csv(c.label)).join(',')];
        for (const r of T.rows) lines.push(cols.map(c => csv[c.type](r[c.key])).join(','));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = fileName;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    };
  }

  CN.table = { create };
})(window.CashNow = window.CashNow || {});
