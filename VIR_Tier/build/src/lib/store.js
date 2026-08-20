// Persistence layer. StateStore sits over a minimal key-value backend so the
// demo (localStorage) and a future cloud version share the same API and only
// swap the backend. Collections are either "keyed" (map by an id field) or
// "list" (append-only array).
// MECHANISM reused from the reconciliation tool; COLLECTIONS redefined for VIR_Tier.

// ---- backends -------------------------------------------------------------

/** In-memory backend for tests / non-browser use. */
export function createMemoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** Browser localStorage backend, or null if unavailable. */
export function getLocalStorageBackend() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* access can throw in sandboxed contexts */ }
  return null;
}

// ---- collection configuration (VIR_Tier entities) ------------------------

const COLLECTIONS = {
  agreements: { type: 'keyed', key: (o) => o.agreementId },
  invoices: { type: 'keyed', key: (o) => o.invoiceNumber },
  deliveryNotes: { type: 'keyed', key: (o) => o.deliveryNoteId },
  purchases: { type: 'keyed', key: (o) => o.purchaseId },
  receipts: { type: 'keyed', key: (o) => o.receiptId },
  events: { type: 'keyed', key: (o) => o.eventId },
  claimed: { type: 'keyed', key: (o) => o.claimId },
  ccogsEngine: { type: 'keyed', key: (o) => o.outputId },
  charges: { type: 'keyed', key: (o) => o.chargeId },
  reconstructions: { type: 'list' },
  audit: { type: 'list' },
};

// ---- store ----------------------------------------------------------------

export class StateStore {
  constructor(backend = createMemoryBackend(), namespace = 'vir_tier') {
    this.backend = backend;
    this.ns = namespace;
  }

  _key(collection) { return `${this.ns}:${collection}`; }

  _readRaw(collection, fallback) {
    const raw = this.backend.getItem(this._key(collection));
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  _write(collection, value) {
    this.backend.setItem(this._key(collection), JSON.stringify(value));
  }

  _config(collection) {
    const cfg = COLLECTIONS[collection];
    if (!cfg) throw new Error(`StateStore: unknown collection "${collection}"`);
    return cfg;
  }

  /** Insert (list) or upsert (keyed) an object. Returns the object. */
  put(collection, obj) {
    const cfg = this._config(collection);
    if (cfg.type === 'keyed') {
      const map = this._readRaw(collection, {});
      const id = cfg.key(obj);
      if (id === undefined || id === null || id === '') {
        throw new Error(`StateStore: cannot store in "${collection}" without a key`);
      }
      map[id] = obj;
      this._write(collection, map);
    } else {
      const arr = this._readRaw(collection, []);
      arr.push(obj);
      this._write(collection, arr);
    }
    return obj;
  }

  putAll(collection, objs) { for (const o of objs) this.put(collection, o); return objs; }

  get(collection, id) {
    const cfg = this._config(collection);
    if (cfg.type !== 'keyed') throw new Error(`StateStore: get() needs a keyed collection, "${collection}" is a list`);
    return this._readRaw(collection, {})[id] ?? null;
  }

  all(collection) {
    const cfg = this._config(collection);
    const data = this._readRaw(collection, cfg.type === 'keyed' ? {} : []);
    return cfg.type === 'keyed' ? Object.values(data) : data;
  }

  remove(collection, id) {
    const cfg = this._config(collection);
    if (cfg.type !== 'keyed') throw new Error(`StateStore: remove() needs a keyed collection, "${collection}" is a list`);
    const map = this._readRaw(collection, {});
    if (!(id in map)) return false;
    delete map[id];
    this._write(collection, map);
    return true;
  }

  /** Append-only audit convenience. */
  appendAudit(entry) { return this.put('audit', entry); }
  auditLog() { return this.all('audit'); }

  /** Update a charge's status in place (keyed helper). */
  setChargeStatus(chargeId, status) {
    const c = this.get('charges', chargeId);
    if (!c) throw new Error(`StateStore: charge "${chargeId}" not found`);
    const updated = { ...c, status };
    this.put('charges', updated);
    return updated;
  }

  clear(collection) {
    const cfg = this._config(collection);
    this._write(collection, cfg.type === 'keyed' ? {} : []);
  }

  clearAll() { for (const c of Object.keys(COLLECTIONS)) this.clear(c); }
}

export const COLLECTION_NAMES = Object.freeze(Object.keys(COLLECTIONS));
