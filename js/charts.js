/* Chart pieces the report pages share: ranked horizontal bars and the empty-chart message. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const INK = '#252423', MUTED = '#6e5a6b';
  const BAR = '#e044a7';
  const ROW = 26; // px per bar; a long list scrolls inside its card

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const hint = text => `<br><span style="color:#8a7a88">${text}</span>`;

  const empty = text => ({
    graphic: { type: 'text', left: 'center', top: 'middle', style: { text, fill: MUTED, fontSize: 13 } },
  });

  // One bar per item, largest first, each with its value; the chart is as tall as the list needs.
  // items: [{ label, key, value }]. opts: { selKey (highlighted, the rest dimmed), empty (message for
  // no items), hint (tooltip line), format (value text, money by default), unit (tooltip suffix) }.
  function bars(chart, items, opts) {
    chart.getDom().style.height = Math.max(160, items.length * ROW + 12) + 'px';
    chart.resize();
    if (!items.length) {
      chart.setOption(empty(opts.empty), true);
      return;
    }
    const format = opts.format || F.money;
    const selKey = opts.selKey === undefined ? null : opts.selKey;
    chart.setOption({
      animationDuration: 300,
      grid: { left: 6, right: 92, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: p => `${esc(p.name)}<br><b>${format(p.value)}${opts.unit || ''}</b>` +
          hint(items[p.dataIndex].key === selKey ? 'Click again to clear' : opts.hint),
      },
      xAxis: { type: 'value', show: false, max: 'dataMax' },
      yAxis: {
        type: 'category', inverse: true, data: items.map(it => it.label),
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: INK, fontSize: 12, fontWeight: 600, width: 150, overflow: 'truncate' },
      },
      series: [{
        type: 'bar', barMaxWidth: 18, cursor: 'pointer',
        data: items.map(it => ({ value: it.value, itemStyle: { opacity: selKey === null || it.key === selKey ? 1 : 0.3 } })),
        itemStyle: { color: BAR, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: INK, fontSize: 12, formatter: p => format(p.value) },
      }],
    }, true);
  }

  CN.charts = { bars, empty, esc, hint, INK, MUTED };
})(window.CashNow = window.CashNow || {});
