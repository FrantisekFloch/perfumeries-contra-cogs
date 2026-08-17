// Dependency-free CSV parser/serializer with quoted-field support (RFC-4180-ish).
// Handles quoted fields, escaped quotes (""), commas and newlines inside quotes.

export function parseCsv(input) {
  if (typeof input !== 'string') throw new Error('CSV parse error: input is not a string');
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  const s = input.replace(/\r\n?/g, '\n');
  const n = s.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < n) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\n') { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  // flush last field/row (ignore trailing empty line)
  if (field !== '' || row.length > 0) { pushField(); pushRow(); }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0];
  const dataRows = rows.slice(1)
    .filter((r) => !(r.length === 1 && r[0] === '')) // skip blank lines
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
      return obj;
    });
  return { headers, rows: dataRows };
}

function encodeField(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializeCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => encodeField(r[h])).join(','));
  return lines.join('\n') + '\n';
}
