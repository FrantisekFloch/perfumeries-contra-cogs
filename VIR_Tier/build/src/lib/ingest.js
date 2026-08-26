// Ingestion glue (Req 1.4, 3.7). Routes files (category + text) to the right
// parser, collecting per-file errors without stopping the batch, then returns
// the structured record sets ready for consolidation.

import { PARSERS } from './parsers.js';

/**
 * @param {Array<{category, name, text}>} files
 * @returns {object} { agreements[], purchases[], receipts[], events[], claimed[], errors[] }
 */
export function ingestFiles(files) {
  const out = { agreements: [], invoices: [], delivery_notes: [], purchases: [], receipts: [], events: [], claimed: [], ccogs_engine: [], errors: [] };
  for (const f of files) {
    const spec = PARSERS[f.category];
    if (!spec) { out.errors.push({ file: f.name, reason: `unknown category "${f.category}"` }); continue; }
    try {
      // agreements support both formats: pick the CSV parser for .csv files.
      const isCsv = /\.csv$/i.test(f.name || '');
      const parseFn = (isCsv && spec.parseCsv) ? spec.parseCsv : spec.parse;
      const parsed = parseFn(f.text, f.name);
      if (Array.isArray(parsed)) out[f.category].push(...parsed);
      else out[f.category].push(parsed); // agreements: one per file
    } catch (e) {
      out.errors.push({ file: f.name, reason: e.message });
    }
  }
  return out;
}
