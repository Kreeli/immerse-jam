function validateCharts(charts) {
  if (!Array.isArray(charts) || charts.length > 100) throw new Error('和弦谱数据无效');
  const chartIds = new Set();
  for (const chart of charts) {
    if (
      !chart.id ||
      chartIds.has(chart.id) ||
      !Array.isArray(chart.bars) ||
      chart.bars.length > 20000 ||
      ![2, 3, 4, 6].includes(chart.meter)
    )
      throw new Error('和弦谱的小节数据无效');
    chartIds.add(chart.id);
    const ids = new Set();
    let previous = 0;
    for (const bar of chart.bars) {
      if (
        !bar.id ||
        ids.has(bar.id) ||
        !Number.isFinite(bar.start) ||
        !Number.isFinite(bar.end) ||
        bar.start < previous - 0.001 ||
        bar.end <= bar.start ||
        (bar.splitAt !== undefined &&
          (!Number.isFinite(bar.splitAt) || bar.splitAt <= 0 || bar.splitAt >= 1)) ||
        !Array.isArray(bar.slots) ||
        bar.slots.length > 2
      )
        throw new Error('小节时间应连续递增，每小节最多放两个和弦');
      ids.add(bar.id);
      previous = bar.end;
      const slots = new Set();
      for (const slot of bar.slots) {
        if (
          !slot.id ||
          slots.has(slot.id) ||
          (slot.label !== null && (typeof slot.label !== 'string' || slot.label.length > 40))
        )
          throw new Error('和弦位置数据无效');
        slots.add(slot.id);
      }
    }
  }
  return charts;
}
module.exports = { validateCharts };
