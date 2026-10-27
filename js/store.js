// Persistence. All data lives in this browser's localStorage under one key.
//
// Every change goes through transact(): it re-reads the latest saved copy
// (so a second open tab can't overwrite newer data), applies the change to a
// copy, checks stock integrity, and only then saves. If anything throws,
// nothing is saved.

import { DEFAULT_SETTINGS } from './domain/constants.js';
import { assertIntegrity, makeUnits } from './domain/inventory.js';
import { emptyScores } from './domain/scoring.js';

export const STORAGE_KEY = 'tapthat.salescc.v1';
export const SCHEMA_VERSION = 1;

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function freshState(now = new Date()) {
  return {
    version: SCHEMA_VERSION,
    settings: clone(DEFAULT_SETTINGS),
    leads: [],
    activities: [],
    visits: [],
    orders: [],
    units: makeUnits(DEFAULT_SETTINGS.inventoryCount),
    expenses: [],
    meta: { createdAt: now.toISOString(), updatedAt: now.toISOString(), lastBackupAt: '', rev: 0 },
  };
}

function mergeDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined || target[k] === null) target[k] = clone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') mergeDefaults(target[k], v);
  }
  return target;
}

/** Bring older or partial data up to the current shape. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Tap That backup.');
  const s = raw;
  for (const key of ['leads', 'activities', 'visits', 'orders', 'expenses']) {
    if (!Array.isArray(s[key])) s[key] = [];
  }
  s.settings = mergeDefaults(s.settings || {}, DEFAULT_SETTINGS);
  if (!Array.isArray(s.units) || !s.units.length) s.units = makeUnits(s.settings.inventoryCount);
  s.meta = mergeDefaults(s.meta || {}, { createdAt: new Date().toISOString(), updatedAt: '', lastBackupAt: '', rev: 0 });
  for (const l of s.leads) {
    l.phones = Array.isArray(l.phones) ? l.phones : [];
    l.scores = mergeDefaults(l.scores || {}, emptyScores());
    l.stage = l.stage || 'prospect';
  }
  for (const o of s.orders) {
    o.payments = Array.isArray(o.payments) ? o.payments : [];
    o.unitIds = Array.isArray(o.unitIds) ? o.unitIds : [];
  }
  s.version = SCHEMA_VERSION;
  return s;
}

export function createStore(storage) {
  const listeners = new Set();
  let state = null;
  let lastError = null;

  function read() {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return freshState();
    return migrate(JSON.parse(text));
  }

  function write(next) {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function load() {
    try {
      state = read();
      lastError = null;
    } catch (e) {
      // Don't silently replace unreadable data – keep it and show the error.
      lastError = e;
      state = freshState();
      state.meta.loadError = String(e.message || e);
    }
    return state;
  }

  function notify() {
    for (const fn of listeners) fn(state);
  }

  return {
    get state() {
      return state || load();
    },
    get loadError() {
      return lastError;
    },
    load,
    /** Apply a change atomically. fn receives a draft; return value is passed through. */
    transact(fn) {
      if (lastError) throw new Error('Saved data could not be read, so changes are disabled to protect it. Export the raw data from Settings first.');
      const latest = read();
      const draft = clone(latest);
      const result = fn(draft);
      assertIntegrity(draft);
      draft.meta.updatedAt = new Date().toISOString();
      draft.meta.rev = (draft.meta.rev || 0) + 1;
      write(draft);
      state = draft;
      notify();
      return result;
    },
    replaceAll(next) {
      const migrated = migrate(clone(next));
      assertIntegrity(migrated);
      write(migrated);
      lastError = null;
      state = migrated;
      notify();
    },
    exportText() {
      return storage.getItem(STORAGE_KEY) || JSON.stringify(state || freshState());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Call when another tab changed storage. */
    reloadFromStorage() {
      load();
      notify();
    },
  };
}
