// Immutable, append-only audit trail primitive. (Req 6)
// Every adjustment to volume, entitlement, or a charge must produce an entry.
// Entries are frozen on creation; a recompute APPENDS a new entry and never
// mutates prior ones.

let SEQ = 0;

/** Create a frozen audit entry. `now` is injectable for deterministic tests. */
export function auditEntry({ actor, action, details = {}, evidenceRefs = [] }, now = () => new Date().toISOString()) {
  if (!actor) throw new Error('audit: actor is required');
  if (!action) throw new Error('audit: action is required');
  return Object.freeze({
    seq: ++SEQ,
    timestamp: now(),
    actor,
    action,
    details: Object.freeze({ ...details }),
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });
}

/**
 * An append-only trace. Backed by an array; `append` returns a NEW frozen list
 * so callers cannot mutate history in place.
 */
export class AuditTrace {
  constructor(initial = []) {
    this._entries = [...initial];
  }
  append(entry) {
    this._entries = [...this._entries, entry];
    return entry;
  }
  get entries() { return Object.freeze([...this._entries]); }
  get last() { return this._entries[this._entries.length - 1] ?? null; }
  toJSON() { return [...this._entries]; }
}

/** Reset the module sequence — TEST ONLY, for deterministic ordering. */
export function __resetAuditSeqForTests() { SEQ = 0; }
