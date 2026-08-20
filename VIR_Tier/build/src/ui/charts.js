// Dependency-free SVG charts for the Finance Overview. Redesigned for a
// professional, light-theme finance dashboard: subtle horizontal gridlines with
// a value axis, thin rounded bars, on-bar value labels, and a restrained,
// accessible categorical palette (Wong-inspired). Sized to sit two-per-row.

// Accessible categorical palette (colour-blind safe, professional, light-theme).
const PALETTE = ['#0072B2', '#009E73', '#E69F00', '#7A4FBF', '#D55E00', '#4A6B7C', '#3B82F6', '#B79020'];

const fmt = (n) => Math.round(n).toLocaleString();
function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
// "nice" axis max so the top gridline is a round number
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Vertical bar chart.
 * opts: { valueKey, labelKey, palette (bool -> per-bar colours) | cls, unit ('' | '%' | 'EUR'),
 *         width, height, gridlines }
 */
export function barChart(data, opts = {}) {
  const {
    valueKey = 'value', labelKey = 'label', cls = 'bar', unit = '',
    width = 500, height = 240, gridlines = 4, palette = false,
  } = opts;
  if (!data || !data.length) return `<div class="chart-empty">No data.</div>`;

  const pad = { l: 46, r: 14, t: 14, b: 46 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const rawMax = Math.max(...data.map((d) => d[valueKey]), 0);
  const max = niceMax(rawMax);
  const n = data.length;
  const slot = w / n;
  const bw = Math.min(46, slot * 0.6);

  // horizontal gridlines + y-axis value labels
  let grid = '';
  for (let i = 0; i <= gridlines; i++) {
    const gv = (max / gridlines) * i;
    const gy = pad.t + h - (gv / max) * h;
    grid += `<line class="c-grid" x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${pad.l + w}" y2="${gy.toFixed(1)}"></line>`;
    grid += `<text class="c-yaxis" x="${pad.l - 8}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end">${unit === '%' ? Math.round(gv) + '%' : fmtShort(gv)}</text>`;
  }

  let bars = '';
  data.forEach((d, i) => {
    const val = d[valueKey];
    const bh = max > 0 ? (val / max) * h : 0;
    const x = pad.l + i * slot + (slot - bw) / 2;
    const y = pad.t + (h - bh);
    const fill = palette ? PALETTE[i % PALETTE.length] : null;
    const style = fill ? ` style="fill:${fill}"` : '';
    bars += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="4"${style}><title>${esc(d[labelKey])}: ${fmt(val)}${unit === '%' ? '%' : ''}</title></rect>`;
    // value label above the bar
    const lbl = unit === '%' ? Math.round(val) + '%' : fmtShort(val);
    bars += `<text class="c-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${lbl}</text>`;
    // category label under the axis
    bars += `<text class="c-xaxis" x="${(x + bw / 2).toFixed(1)}" y="${(height - pad.b + 16)}" text-anchor="middle">${esc(truncate(d[labelKey], 12))}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
    ${grid}
    <line class="c-axis" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"></line>
    ${bars}
  </svg>`;
}
