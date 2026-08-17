// Monthly aggregation + a simple forecast for the Finance view. Pure functions.

/** Aggregate a portfolio into monthly series: value at risk, debits, recognized contra. */
export function monthlySeries(portfolio) {
  const months = new Set();
  const risk = {};
  const debits = {};
  const contra = {};

  for (const v of portfolio) {
    if (v.month) {
      months.add(v.month);
      risk[v.month] = (risk[v.month] || 0) + v.valueAtRisk;
      contra[v.month] = (contra[v.month] || 0) + (v.contra?.recognizedContra || 0);
    }
    for (const d of v.timing?.splitDebits || []) {
      months.add(d.period);
      debits[d.period] = (debits[d.period] || 0) + d.amount;
    }
  }

  const sorted = [...months].sort();
  return {
    months: sorted,
    risk: sorted.map((m) => Number((risk[m] || 0).toFixed(2))),
    debits: sorted.map((m) => Number((debits[m] || 0).toFixed(2))),
    contra: sorted.map((m) => Number((contra[m] || 0).toFixed(2))),
  };
}

/** Add n months to a 'YYYY-MM' string. */
export function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const idx = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Least-squares linear forecast of `values` projected `n` steps ahead.
 * Returns { months, values } for the projected points (clamped at >= 0).
 */
export function forecast(months, values, n = 3) {
  const k = values.length;
  if (k === 0) return { months: [], values: [] };
  if (k === 1) {
    const out = { months: [], values: [] };
    for (let i = 1; i <= n; i++) { out.months.push(addMonths(months[0], i)); out.values.push(Number(values[0].toFixed(2))); }
    return out;
  }
  // linear regression y = a + b*x, x = 0..k-1
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / k;
  const meanY = values.reduce((s, y) => s + y, 0) / k;
  let num = 0, den = 0;
  for (let i = 0; i < k; i++) { num += (xs[i] - meanX) * (values[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const b = den === 0 ? 0 : num / den;
  const a = meanY - b * meanX;
  const out = { months: [], values: [] };
  const last = months[months.length - 1];
  for (let i = 1; i <= n; i++) {
    const y = a + b * (k - 1 + i);
    out.months.push(addMonths(last, i));
    out.values.push(Number(Math.max(0, y).toFixed(2)));
  }
  return out;
}
