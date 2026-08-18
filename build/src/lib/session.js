// Session state for the demo (currently the selected Contra COGS model).
// Backed by a key-value store: sessionStorage in the browser, memory in tests.

import { CONTRA_COGS_MODEL_VALUES, isEnumValue } from './enums.js';

export function createMemoryKV() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export function getSessionBackend() {
  try { if (typeof sessionStorage !== 'undefined') return sessionStorage; } catch { /* sandboxed */ }
  return null;
}

export class Session {
  constructor(backend = createMemoryKV(), ns = 'perfumeries:session') {
    this.backend = backend;
    this.ns = ns;
  }

  _k(x) { return `${this.ns}:${x}`; }

  setModel(model) {
    if (!isEnumValue(CONTRA_COGS_MODEL_VALUES, model)) throw new Error(`Session: invalid model "${model}"`);
    this.backend.setItem(this._k('model'), model);
    return model;
  }

  getModel() { return this.backend.getItem(this._k('model')); }

  isModelSelected() { return isEnumValue(CONTRA_COGS_MODEL_VALUES, this.getModel()); }

  setRole(role) {
    if (!ROLES.includes(role)) throw new Error(`Session: invalid role "${role}"`);
    this.backend.setItem(this._k('role'), role);
    return role;
  }

  getRole() { return this.backend.getItem(this._k('role')); }

  isRoleSelected() { return ROLES.includes(this.getRole()); }

  setLang(l) { if (!['en', 'sk'].includes(l)) throw new Error(`Session: invalid lang "${l}"`); this.backend.setItem(this._k('lang'), l); return l; }
  getLang() { return this.backend.getItem(this._k('lang')) || 'en'; }

  /** Model filter for dashboards: 'all' | 'A' | 'B'. */
  setModelFilter(m) { if (!['all', 'A', 'B'].includes(m)) throw new Error(`Session: invalid model filter "${m}"`); this.backend.setItem(this._k('modelFilter'), m); return m; }
  getModelFilter() { return this.backend.getItem(this._k('modelFilter')) || 'all'; }

  clear() { ['model', 'role', 'lang', 'modelFilter'].forEach((k) => this.backend.removeItem(this._k(k))); }
}

// v2: Storage + Accounting merged into a single "Operations" view; Finance stays.
export const ROLES = Object.freeze(['operations', 'finance']);
