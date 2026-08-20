// Minimal dependency-free SVG bar chart for the Finance Overview.

export function barChart(data, { width = 520, height = 220, valueKey = 'value', labelKey = 'label', cls = 'bar' } = {}) {
  if (!data.length) return '<div class="small">No data.</div>';
  const pad = { l: 40, r: 10, t: 10, b: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const bw = w / data.length * 0.7;
  const gap = w / data.length * 0.3;
  let bars = '';
  data.forEach((d, i) => {
    const bh = (d[valueKey] / max) * h;
    const x = pad.l + i * (bw + gap) + gap / 2;
    const y = pad.t + (h - bh);
    bars += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3"></rect>`;
    bars += `<text class="axis-label" x="${(x + bw / 2).toFixed(1)}" y="${(height - pad.b + 14)}" text-anchor="middle">${esc(d[labelKey])}</text>`;
    bars += `<text class="axis-label" x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${fmt(d[valueKey])}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <line class="axis" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"></line>
    ${bars}
  </svg>`;
}

function fmt(n) { return Math.round(n).toLocaleString(); }
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
