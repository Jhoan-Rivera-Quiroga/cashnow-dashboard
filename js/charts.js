/* Chart pieces the report pages share: trend lines, ranked horizontal bars, pies and the empty-chart
   message. */
(function (CN) {
  'use strict';
  const F = CN.fmt;
  const INK = '#252423', MUTED = '#6e5a6b';
  const BAR = '#e044a7', LINE = '#6b007b';
  // Pie slice colors in a fixed order, checked for color-blind separation. Past seven slices the
  // rest share gray "Other".
  const PIE_COLORS = ['#8e3fa3', '#e044a7', '#c8a200', '#118dff', '#e66c37', '#744ec2', '#1aab40'];
  const GRAY = '#a59aa3';
  const ROW = 26; // px per bar; a long list scrolls inside its card
  // The page's font, for chart text too. Without a font on the labels, ECharts sizes the bar charts'
  // label column for one font but draws in another (Microsoft YaHei on Windows, which is wider), so
  // the longest labels lost their first letters.
  let font = null;
  const FONT = () => font || (font = getComputedStyle(document.body).fontFamily || 'sans-serif');

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const hint = text => `<br><span style="color:#8a7a88">${text}</span>`;

  // A message in place of a chart; a size above 13 also makes it bold.
  const empty = (text, size = 13) => ({
    graphic: {
      type: 'text', left: 'center', top: 'middle',
      style: { text, fill: MUTED, fontSize: size, fontWeight: size > 13 ? 600 : 'normal', fontFamily: FONT() },
    },
  });

  // Bar items for every code with an amount, largest first, at most n of them.
  function ranked(sums, labels, n = Infinity) {
    const out = [];
    for (let c = 0; c < sums.length; c++) {
      if (Math.abs(sums[c]) >= 0.005) out.push({ label: labels[c], key: labels[c].toLowerCase(), value: sums[c] });
    }
    return out.sort((a, b) => b.value - a.value).slice(0, n);
  }

  // One bar per item, in the order given, each with its value; the chart is as tall as the list needs.
  // items: [{ label, key, value }]; a null key can't be selected. opts: { selKey (highlighted, the rest
  // dimmed), empty (message for no items), hint (tooltip line), format (value text, money by default),
  // unit (tooltip suffix), label (bar-end text, format by default), labelRoom (px kept for it),
  // detail (item => another tooltip line), fill (keep the chart's own height, for a short list beside
  // a trend chart) }.
  function bars(chart, items, opts) {
    // The chart is replaced below, tooltip and all. Hiding the tooltip first stops ECharts from
    // re-showing the old one a moment later, which threw an error after a click on a bar.
    chart.dispatchAction({ type: 'hideTip' });
    chart.getDom().style.height = opts.fill ? '' : Math.max(160, items.length * ROW + 12) + 'px';
    chart.resize();
    if (!items.length) {
      chart.setOption(empty(opts.empty), true);
      return;
    }
    const format = opts.format || F.money, label = opts.label || format;
    const selKey = opts.selKey === undefined ? null : opts.selKey;
    chart.setOption({
      animationDuration: 300,
      textStyle: { fontFamily: FONT() },
      grid: { left: 6, right: opts.labelRoom || 92, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: p => {
          const it = items[p.dataIndex], key = it.key;
          const more = key === null ? '' : hint(key === selKey ? 'Click again to clear' : opts.hint);
          const detail = opts.detail ? '<br>' + esc(opts.detail(it)) : '';
          return `${esc(p.name)}<br><b>${format(p.value)}${opts.unit || ''}</b>` + detail + more;
        },
      },
      xAxis: { type: 'value', show: false, max: 'dataMax' },
      yAxis: {
        type: 'category', inverse: true, data: items.map(it => it.label),
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: INK, fontSize: 12, fontWeight: 600, fontFamily: FONT(), width: 150, overflow: 'truncate' },
      },
      series: [{
        type: 'bar', barMaxWidth: 18, cursor: 'pointer',
        data: items.map(it => ({ value: it.value, itemStyle: { opacity: selKey === null || it.key === selKey ? 1 : 0.3 } })),
        itemStyle: { color: BAR, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: INK, fontSize: 12, formatter: p => label(p.value) },
      }],
    }, true);
  }

  // A pie or donut with each slice's name and share beside it, and a legend that also gives each
  // slice's amount. items: [{ label, key, value, color }], in the order to draw; a null key can't be
  // selected. opts: { selKey (full color, the rest faded), donut, narrow (leave the names to the
  // legend), empty (message for no items), hint (tooltip line), amount (legend value text, money by
  // default) }.
  function pie(chart, items, opts) {
    chart.dispatchAction({ type: 'hideTip' }); // see bars()
    if (!items.length) {
      chart.setOption(empty(opts.empty), true);
      return;
    }
    const selKey = opts.selKey === undefined ? null : opts.selKey;
    const amount = opts.amount || F.money;
    const sum = items.reduce((s, it) => s + it.value, 0);
    const byName = new Map(items.map(it => [it.label, it]));
    chart.setOption({
      animationDuration: 300,
      textStyle: { fontFamily: FONT() },
      tooltip: {
        trigger: 'item',
        formatter: p => {
          const it = byName.get(p.name);
          const more = it.key === null ? '' : hint(it.key === selKey ? 'Click again to clear' : opts.hint);
          return `${esc(p.name)}<br><b>${F.money(p.value)}</b> · ${F.pct(p.value / sum)}` + more;
        },
      },
      legend: {
        bottom: 0, left: 'center', selectedMode: false,
        icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 14,
        textStyle: { color: INK, fontSize: 12 },
        formatter: name => `${name}  ${amount(byName.get(name).value)}`,
      },
      series: [{
        type: 'pie', radius: opts.donut ? ['40%', '64%'] : [0, '64%'], center: ['50%', '43%'], startAngle: 90,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: !opts.narrow, color: INK, fontSize: 12, formatter: p => `${p.name} ${F.pct(p.value / sum)}` },
        labelLine: { length: 8, length2: 10 },
        labelLayout: { hideOverlap: true },
        emphasis: { scaleSize: 4 },
        data: items.map(it => ({
          name: it.label, value: it.value, key: it.key, cursor: it.key === null ? 'default' : 'pointer',
          itemStyle: { color: it.color, opacity: selKey === null || it.key === selKey ? 1 : 0.3 },
        })),
      }],
    }, true);
  }

  // A trend line with every point labelled. The selected point gets a band behind it and the rest
  // are dimmed. opts: { gran (a CN.ranges.GRAN entry), sel (the selected key, or null), money
  // (dollars rather than a count), pct (shares from 0 to 1, on a 0–100% axis; a null value leaves a
  // gap), unit (what a count counts, or what a share is of, for the tooltip) }.
  function line(chart, keys, values, opts) {
    const g = opts.gran;
    const sel = opts.sel === null ? -1 : keys.indexOf(opts.sel);
    const dim = sel >= 0;
    const inK = opts.money && values.some(v => v >= 1000);
    const valueLabel = v => (opts.pct ? F.pct(v) : inK && Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : F.int(v));
    const isValue = v => typeof v === 'number' && !Number.isNaN(v);
    chart.setOption({
      animationDuration: 300,
      textStyle: { fontFamily: FONT() },
      grid: { left: 52, right: 30, top: 34, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#d7b8d3' } },
        formatter: ps => {
          const p = ps.find(q => q.seriesIndex === 0);
          if (!p || !isValue(p.value)) return '';
          const v = opts.money ? F.money(p.value) : `${opts.pct ? F.pct(p.value) : F.int(p.value)} ${opts.unit}`;
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
          type: 'value', min: 0, max: opts.pct ? 1 : null, splitNumber: opts.pct ? 2 : 3, splitLine: { show: false },
          axisLabel: { color: MUTED, formatter: v => (opts.pct ? Math.round(v * 100) + '%' : inK ? v / 1000 + 'K' : F.int(v)) },
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
          label: { show: true, position: 'top', distance: 7, fontSize: 12, fontWeight: 700, formatter: p => (isValue(p.value) ? valueLabel(p.value) : '') },
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

  CN.charts = { ranked, bars, pie, line, pointAt, fitKpis, empty, esc, hint, font: FONT, INK, MUTED, PIE_COLORS, GRAY };
})(window.CashNow = window.CashNow || {});
