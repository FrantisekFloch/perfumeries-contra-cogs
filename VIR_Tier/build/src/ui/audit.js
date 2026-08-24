// Audit section — a line/SKU-level dashboard of every additional-CCOGS line the
// tool would put on a supplier debit, with agreement + date-range filters, and a
// multi-sheet Excel export (pivoted summary / line detail / CCOGS requested).
// Pure string builder; app.js wires the controls + the export (SheetJS).

import { t } from '../lib/i18n.js';
import { buildAuditDataset } from '../lib/audit_export.js';

const nf = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// current audit filters. Sets are null => "all selected". supplier/validity/
// caseType are applied at the ROW level (post-dataset); date range is applied in
// buildAuditDataset (agreement validity overlap).
function filters(state) {
  if (!state.auditFilters) state.auditFilters = { suppliers: null, validities: null, caseTypes: null, from: '', to: '', sortKey: 'LineValue', sortDir: 'desc' };
  // migrate any older shape
  const f = state.auditFilters;
  if (!('suppliers' in f)) { f.suppliers = null; f.validities = null; f.caseTypes = null; }
  return f;
}

// apply the row-level filters (supplier / validity / case-type) to line rows
function applyRowFilters(lineRows, f) {
  return lineRows.filter((r) =>
    (!f.suppliers || f.suppliers.has(r.SupplierId)) &&
    (!f.validities || f.validities.has(r.Validity)) &&
    (!f.caseTypes || f.caseTypes.has(r.CaseType)));
}

export function auditDataset(state) {
  const f = filters(state);
  const ds = buildAuditDataset(state, { from: f.from || null, to: f.to || null });
  // apply row-level filters to lineRows; keep summary/ccogs from the date-scoped set
  const lineRows = applyRowFilters(ds.lineRows, f);
  return { ...ds, lineRows };
}

export function renderAudit(state) {
  const f = filters(state);
  const ds = auditDataset(state);   // already row-filtered

  // distinct filter values come from the DATE-SCOPED, unfiltered-by-row dataset,
  // so the option lists stay stable while you toggle supplier/validity/case.
  const baseRows = buildAuditDataset(state, { from: f.from || null, to: f.to || null }).lineRows;
  const supMap = new Map(); const valSet = new Set(); const caseSet = new Set();
  for (const r of baseRows) { supMap.set(r.SupplierId, r.Supplier); valSet.add(r.Validity); caseSet.add(r.CaseType); }
  const supers = [...supMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const validities = [...valSet].sort();
  const caseTypes = [...caseSet].sort();

  // sort the line rows for display
  const dir = f.sortDir === 'asc' ? 1 : -1;
  const sortKey = f.sortKey || 'LineValue';
  const lines = [...ds.lineRows].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  const totalLineValue = ds.lineRows.reduce((s, r) => s + (r.LineValue || 0), 0);
  const miLines = ds.lineRows.filter((r) => r.MissingInvoice === 'YES').length;

  const sortableTh = (key, label, num) => {
    const active = sortKey === key;
    const arrow = active ? (f.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="${num ? 'num ' : ''}au-sort${active ? ' active' : ''}" data-ausort="${key}">${label}${arrow}</th>`;
  };

  const rows = lines.slice(0, 400).map((r) => `<tr class="${r.MissingInvoice === 'YES' ? 'au-mi' : ''}">
    <td class="mono">${esc(r.LineRef)}</td>
    <td>${esc(r.Supplier)}</td>
    <td class="mono">${esc(r.Agreement)}</td>
    <td>${esc(r.CaseType)}</td>
    <td>${esc(r.Scope)}</td>
    <td>${esc(r.Period)}</td>
    <td>${esc(r.Validity)}</td>
    <td>${esc(r.SKU)}</td>
    <td>${esc(r.Cause)}${r.MissingInvoice === 'YES' ? ` <span class="au-flag">⚑</span>` : ''}</td>
    <td class="num">${nf(r.Qty)}</td>
    <td class="num">${r.RateToPct !== '' ? r.RateToPct + '%' : '—'}</td>
    <td class="num"><strong>${nf(r.LineValue)} ${esc(r.Currency)}</strong></td>
  </tr>`).join('');

  return `
    <p class="lead">${t('auditLead')}</p>

    <div class="au-kpis">
      <div class="au-kpi"><div class="v">${nf(ds.meta.lineCount)}</div><div class="l">${t('auditLines')}</div></div>
      <div class="au-kpi"><div class="v">${nf(ds.meta.ccogsCount)}</div><div class="l">${t('auditDebits')}</div></div>
      <div class="au-kpi"><div class="v gold">${nf(totalLineValue)} €</div><div class="l">${t('auditTotalValue')}</div></div>
      <div class="au-kpi"><div class="v">${nf(miLines)}</div><div class="l">${t('auditMiLines')}</div></div>
    </div>

    ${(() => {
      const menu = (kind, label, opts, sel, isSup) => {
        const count = sel ? sel.size : opts.length;
        const optHtml = opts.map((op) => {
          const id = isSup ? op.id : op;
          const lab = isSup ? op.name : op;
          const on = !sel || sel.has(id);
          return `<label class="flt-opt"><input type="checkbox" data-auopt="${kind}" value="${esc(String(id))}" ${on ? 'checked' : ''}/> ${esc(lab)}</label>`;
        }).join('');
        return `<div class="flt-group flt-menu">
          <button class="flt-toggle" data-aumenu="${kind}">${label} <span class="flt-count">${count}/${opts.length}</span> ▾</button>
          <div class="flt-pop" data-aupop="${kind}" hidden>
            <div class="flt-pop-actions"><button data-auall="${kind}">${t('fltAll')}</button><button data-aunone="${kind}">${t('fltNone')}</button></div>
            <div class="flt-opts">${optHtml}</div>
          </div>
        </div>`;
      };
      const sortBtn = (key, label) => {
        const active = sortKey === key;
        const arrow = active ? (f.sortDir === 'asc' ? '↑' : '↓') : '';
        return `<button class="flt-sort ${active ? 'active' : ''}" data-ausortbtn="${key}">${label} <span class="flt-arrow">${arrow}</span></button>`;
      };
      const anyFilter = f.suppliers || f.validities || f.caseTypes || f.from || f.to;
      return `<div class="fltbar au-fltbar">
        ${menu('sup', t('fltSupplier'), supers, f.suppliers, true)}
        ${menu('val', t('validity'), validities, f.validities, false)}
        ${menu('case', t('auditCase'), caseTypes, f.caseTypes, false)}
        <div class="flt-group au-dates">
          <span class="flt-lbl">${t('auditPeriodFrom')}</span><input type="date" class="au-date" data-audate="from" value="${esc(f.from)}"/>
          <span class="flt-lbl">${t('auditPeriodTo')}</span><input type="date" class="au-date" data-audate="to" value="${esc(f.to)}"/>
        </div>
        <div class="flt-group flt-sorts"><span class="flt-lbl">${t('fltSortBy')}</span>${sortBtn('LineValue', t('auditColValue'))}${sortBtn('Qty', t('qty'))}</div>
        ${anyFilter ? `<button class="flt-toggle" data-auclear>${t('auditClear')}</button>` : ''}
        <div class="flt-spacer"></div>
        <button class="btn dark" id="auExport">⤓ ${t('auditExportExcel')}</button>
      </div>`;
    })()}

    <div class="flt-result small">${t('fltShowing', { shown: Math.min(lines.length, 400), total: ds.lineRows.length })} · ${t('auditExportNote')}</div>

    <div class="table-wrap au-table"><table><thead><tr>
      ${sortableTh('LineRef', t('auditColRef'))}
      ${sortableTh('Supplier', t('supplier'))}
      ${sortableTh('Agreement', t('agreement'))}
      ${sortableTh('CaseType', t('auditCase'))}
      ${sortableTh('Scope', t('scope'))}
      ${sortableTh('Period', t('period'))}
      ${sortableTh('Validity', t('validity'))}
      ${sortableTh('SKU', t('auditColSku'))}
      ${sortableTh('Cause', t('auditColCause'))}
      ${sortableTh('Qty', t('qty'), true)}
      ${sortableTh('RateToPct', t('rateLabel'), true)}
      ${sortableTh('LineValue', t('auditColValue'), true)}
    </tr></thead><tbody>${rows || `<tr><td colspan="12" class="small">${t('fltNoneMatch')}</td></tr>`}</tbody></table></div>
  `;
}
