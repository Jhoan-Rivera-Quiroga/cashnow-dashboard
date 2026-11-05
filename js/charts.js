/* Chart pieces the report pages share: trend lines, ranked horizontal bars and the empty-chart
   message. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const INK = '#252423', MUTED = '#6e5a6b';
  const BAR = '#e044a7', LINE = '#6b007b';
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

  // A trend line with every point labelled. The selected point gets a band behind it and the rest
  // are dimmed. opts: { gran (a CN.ranges.GRAN entry), sel (the selected key, or null), money
  // (dollars rather than a count), unit (what a count counts, for the tooltip) }.
  function line(chart, keys, values, opts) {
    const g = opts.gran;
    const sel = opts.sel === null ? -1 : keys.indexOf(opts.sel);
    const dim = sel >= 0;
    const inK = opts.money && values.some(v => v >= 1000);
    const valueLabel = v => (inK && Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : F.int(v));
    chart.setOption({
      animationDuration: 300,
      grid: { left: 52, right: 30, top: 34, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#d7b8d3' } },
        formatter: ps => {
          const p = ps.find(q => q.seriesIndex === 0);
          if (!p) return '';
          const v = opts.money ? F.money(p.value) : `${F.int(p.value)} ${opts.unit}`;
          return `${g.name} ${F.iso(keys[p.dataIndex])}<br><b>${v}</b>` + hint('Click to filter');
        },
      },
      xAxis: {
        type: 'category',
        data: keys.map(g.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#d9c3d6' } },
        axisLabel: { color: MUTED, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value', min: 0, splitNumber: 3, splitLine: { show: false },
          axisLabel: { color: MUTED, formatter: v => (inK ? v / 1000 + 'K' : F.int(v)) },
        },
        { type: 'value', min: 0, max: 1, show: false },
      ],
      series: [
        {
          type: 'line',
          data: values.map((v, i) => ({
            value: v,
            symbolSize: i === sel ? 12 : 7,
            itemStyle: { opacity: !dim || i === sel ? 1 : 0.3 },
            label: { color: !dim || i === sel ? '#000' : 'rgba(0, 0, 0, 0.3)' },
          })),
          symbol: 'circle',
          showAllSymbol: true,
          lineStyle: { color: LINE, width: 2.5, opacity: dim ? 0.45 : 1 },
          itemStyle: { color: LINE },
          label: { show: true, position: 'top', distance: 7, fontSize: 12, fontWeight: 700, formatter: p => valueLabel(p.value) },
          labelLayout: { hideOverlap: true },
          emphasis: { scale: 1.4 },
          z: 3,
        },
        { // band behind the selected point
          type: 'bar', yAxisIndex: 1, silent: true, z: 1, barWidth: '86%',
          data: keys.map((_, i) => (i === sel ? 1 : null)),
          itemStyle: { color: 'rgba(107, 0, 123, 0.13)', borderRadius: 6 },
        },
      ],
    });
  }

  // The key of the point whose column a click landed in, or null outside the plot. Clicking anywhere
  // in a point's column selects it, as clicking a point does in Power BI.
  function pointAt(chart, ev, keys) {
    const pt = [ev.offsetX, ev.offsetY];
    if (!keys.length || !chart.containPixel({ gridIndex: 0 }, pt)) return null;
    const x = chart.convertFromPixel({ gridIndex: 0 }, pt)[0];
    return keys[Math.max(0, Math.min(keys.length - 1, Math.round(x)))];
  }

  // Shrinks each KPI card value under root until it fits on one line, so long names like
  // "RAY ALVARADO" stay readable.
  function fitKpis(root) {
    root.querySelectorAll('.kpi-value').forEach(el => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 12) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  CN.charts = { bars, line, pointAt, fitKpis, empty, esc, hint, INK, MUTED };
})(window.CashNow = window.CashNow || {});
