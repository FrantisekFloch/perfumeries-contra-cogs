// Tiny dependency-free SVG charts. Return markup strings.

function scaleMax(vals) {
  const m = Math.max(1, ...vals.map((v) => Number(v) || 0));
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}
const short = (lab) => String(lab).slice(2); // '2026-01' -> '26-01'

/** Grouped bar chart of two monthly series. */
export function groupedBars(labels, a, b, opts = {}) {
  const { width = 680, height = 220, colorA = '#2d6cdf', colorB = '#1c9c6b', labelA = 'A', labelB = 'B' } = opts;
  const pad = { l: 44, r: 10, t: 18, b: 28 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const max = scaleMax([...a, ...b]);
  const n = labels.length || 1, groupW = iw / n, barW = Math.min(16, groupW / 3);
  const y = (v) => pad.t + ih - ((Number(v) || 0) / max) * ih;
  let bars = '';
  labels.forEach((lab, i) => {
    const gx = pad.l + i * groupW + groupW / 2;
    bars += `<rect x="${(gx - barW - 1).toFixed(1)}" y="${y(a[i]).toFixed(1)}" width="${barW}" height="${(pad.t + ih - y(a[i])).toFixed(1)}" fill="${colorA}"/>`;
    bars += `<rect x="${(gx + 1).toFixed(1)}" y="${y(b[i]).toFixed(1)}" width="${barW}" height="${(pad.t + ih - y(b[i])).toFixed(1)}" fill="${colorB}"/>`;
    bars += `<text x="${gx.toFixed(1)}" y="${height - 10}" font-size="9" text-anchor="middle" fill="#6b6b6b">${short(lab)}</text>`;
  });
  const axis = `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${width - pad.r}" y2="${pad.t + ih}" stroke="#e5e5e5"/><text x="2" y="${pad.t + 8}" font-size="9" fill="#6b6b6b">${max.toLocaleString()}</text>`;
  const legend = `<rect x="${pad.l}" y="2" width="10" height="10" fill="${colorA}"/><text x="${pad.l + 14}" y="11" font-size="10" fill="#1a1a1a">${labelA}</text><rect x="${pad.l + 120}" y="2" width="10" height="10" fill="${colorB}"/><text x="${pad.l + 134}" y="11" font-size="10" fill="#1a1a1a">${labelB}</text>`;
  const desc = opts.ariaLabel || `Grouped bar chart: ${labelA} vs ${labelB} across ${labels.length} months.`;
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${desc}">${axis}${bars}${legend}</svg>`;
}

/** Line chart with a dashed forecast tail. */
export function lineForecast(labels, actual, fLabels, fValues, opts = {}) {
  const { width = 680, height = 220, color = '#2d6cdf', fcolor = '#e0a400' } = opts;
  const pad = { l: 44, r: 10, t: 18, b: 28 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const allLabels = [...labels, ...fLabels];
  const max = scaleMax([...actual, ...fValues]);
  const n = allLabels.length || 1, stepX = iw / Math.max(1, n - 1);
  const x = (i) => pad.l + i * stepX;
  const y = (v) => pad.t + ih - ((Number(v) || 0) / max) * ih;
  // Shade + separator to clearly mark where real data ends and the projection begins.
  const bIdx = Math.max(0, actual.length - 1);
  const shade = fValues.length ? `<rect x="${x(bIdx).toFixed(1)}" y="${pad.t}" width="${(width - pad.r - x(bIdx)).toFixed(1)}" height="${ih}" fill="${fcolor}" opacity="0.08"/>` : '';
  const sep = fValues.length ? `<line x1="${x(bIdx).toFixed(1)}" y1="${pad.t}" x2="${x(bIdx).toFixed(1)}" y2="${pad.t + ih}" stroke="${fcolor}" stroke-dasharray="3 3" opacity="0.7"/>` : '';
  const actualLine = `<polyline points="${actual.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
  const fSeq = [];
  if (actual.length) fSeq.push(`${x(actual.length - 1).toFixed(1)},${y(actual[actual.length - 1]).toFixed(1)}`);
  fValues.forEach((v, i) => fSeq.push(`${x(actual.length + i).toFixed(1)},${y(v).toFixed(1)}`));
  const fLine = `<polyline points="${fSeq.join(' ')}" fill="none" stroke="${fcolor}" stroke-width="2" stroke-dasharray="5 4"/>`;
  const dots = actual.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="${color}"/>`).join('')
    + fValues.map((v, i) => `<circle cx="${x(actual.length + i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="${fcolor}"/>`).join('');
  const xlabels = allLabels.map((lab, i) => `<text x="${x(i).toFixed(1)}" y="${height - 10}" font-size="9" text-anchor="middle" fill="#6b6b6b">${short(lab)}</text>`).join('');
  const axis = `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${width - pad.r}" y2="${pad.t + ih}" stroke="#e5e5e5"/><text x="2" y="${pad.t + 8}" font-size="9" fill="#6b6b6b">${max.toLocaleString()}</text>`;
  const desc = opts.ariaLabel || `Line chart with a dashed forecast tail over ${allLabels.length} months.`;
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${desc}">${axis}${shade}${sep}${actualLine}${fLine}${dots}${xlabels}</svg>`;
}
