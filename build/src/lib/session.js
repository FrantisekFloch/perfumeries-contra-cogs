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

  clear() { this.backend.removeItem(this._k('model')); this.backend.removeItem(this._k('role')); }
}

export const ROLES = Object.freeze(['storage', 'accounting', 'finance']);
