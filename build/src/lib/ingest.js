// Ingestion router: takes scanned FileRecords and routes each to the correct
// parser by category. Per-file try/catch so one bad file never stops the batch
// (Req 3.7). Returns parsed records plus incomplete-config flags and errors.

import {
  parseInvoiceXml, parseDeliveryNoteXml, parseCreditNoteXml, parseRecadvCsv,
} from './parsers.js';

export function ingestFiles(files) {
  const out = {
    invoices: [],
    deliveryNotes: [],
    goodsReceipts: [],
    creditNotes: [],
    incomplete: [], // { file, missing }
    errors: [],     // { file, category, error }
  };

  for (const f of files) {
    try {
      switch (f.category) {
        case 'invoices': {
          const res = parseInvoiceXml(f.content, f.name);
          if (res.invoice) out.invoices.push(res.invoice);
          if (res.incomplete) out.incomplete.push({ file: f.name, missing: res.missing });
          break;
        }
        case 'delivery_notes':
          out.deliveryNotes.push(parseDeliveryNoteXml(f.content, f.name));
          break;
        case 'credit_notes':
          out.creditNotes.push(parseCreditNoteXml(f.content, f.name));
          break;
        case 'storage_reports':
          out.goodsReceipts.push(...parseRecadvCsv(f.content, f.name));
          break;
        default:
          out.errors.push({ file: f.name, category: f.category, error: `Unknown category "${f.category}"` });
      }
    } catch (err) {
      out.errors.push({ file: f.name, category: f.category, error: err.message });
    }
  }

  return out;
}

/** Persist an ingest result into a StateStore. */
export function persistIngest(store, result) {
  store.putAll('invoices', result.invoices);
  store.putAll('deliveryNotes', result.deliveryNotes);
  store.putAll('creditNotes', result.creditNotes);
  for (const gr of result.goodsReceipts) store.put('goodsReceipts', gr);
  return result;
}
