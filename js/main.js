// App shell: routing, rendering and event delegation.

import { campaignMetrics } from './domain/metrics.js';
import { createStore } from './store.js';
import { esc, showError, toast } from './ui.js';

import dashboard from './views/dashboard.js';
import leads from './views/leads.js';
import leadDetail from './views/lead-detail.js';
import leadForm from './views/lead-form.js';
import outreach from './views/outreach.js';
import visits from './views/visits.js';
import orders from './views/orders.js';
import orderForm from './views/order-form.js';
import orderDetail from './views/order-detail.js';
import personalise from './views/personalise.js';
import stock from './views/stock.js';
import expenses from './views/expenses.js';
import importView from './views/import.js';
import settings from './views/settings.js';
import backup from './views/backup.js';
import more from './views/more.js';

const ROUTES = [
  [/^$|^today$/, dashboard, 'today'],
  [/^leads$/, leads, 'leads'],
  [/^lead\/new$/, leadForm, 'leads'],
  [/^lead\/([\w-]+)\/edit$/, leadForm, 'leads'],
  [/^lead\/([\w-]+)$/, leadDetail, 'leads'],
  [/^outreach$/, outreach, 'outreach'],
  [/^visits$/, visits, 'visits'],
  [/^orders$/, orders, 'orders'],
  [/^order\/new$/, orderForm, 'orders'],
  [/^order\/([\w-]+)$/, orderDetail, 'orders'],
  [/^personalise\/([\w-]+)$/, personalise, 'orders'],
  [/^stock$/, stock, 'more'],
  [/^expenses$/, expenses, 'more'],
  [/^import$/, importView, 'leads'],
  [/^settings$/, settings, 'more'],
  [/^backup$/, backup, 'more'],
  [/^more$/, more, 'more'],
];

let storage;
try {
  storage = window.localStorage;
  storage.setItem('__tt_probe', '1');
  storage.removeItem('__tt_probe');
} catch {
  storage = null;
}

const store = createStore(
  storage || {
    // Storage blocked (private mode etc.) – keep data in memory and warn loudly.
    _m: new Map(),
    getItem(k) {
      return this._m.has(k) ? this._m.get(k) : null;
    },
    setItem(k, v) {
      this._m.set(k, v);
    },
  }
);
store.load();

const root = document.getElementById('view');
let current = null;
let currentKey = '';

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { path, query: new URLSearchParams(query) };
}

function ctx() {
  const { path, query } = parseHash();
  for (const [re, view, tab] of ROUTES) {
    const m = path.match(re);
    if (m) return { view, tab, params: m.slice(1), query, path };
  }
  return { view: dashboard, tab: 'today', params: [], query, path: '' };
}

export const app = {
  store,
  get state() {
    return store.state;
  },
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  render: () => render({ keepScroll: true }),
  /** Run a store change; show errors as toasts. Returns the result or undefined. */
  act(fn, success) {
    try {
      const r = store.transact(fn);
      if (success) toast(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      showError(e);
      return undefined;
    }
  },
};

function renderHeader() {
  const m = campaignMetrics(store.state, new Date());
  const pill = document.getElementById('status-pill');
  pill.textContent = `${m.fullyPaidUnits}/${m.inventory} paid · ${m.afterEnd ? 'campaign ended' : `${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'} left`}`;
  pill.className = `pill ${m.fullyPaidUnits >= m.inventory ? 'done' : ''}`;
  const warn = document.getElementById('storage-warning');
  const issues = [];
  if (!storage) issues.push('This browser is blocking storage, so data will be lost when you close the tab. Use a normal (non-private) window.');
  if (store.loadError) issues.push(`Saved data could not be read (${store.loadError.message}). Editing is disabled to protect it. Go to More → Backup to export the raw data.`);
  warn.hidden = !issues.length;
  warn.innerHTML = issues.map((i) => `<p>${esc(i)}</p>`).join('');
}

function render({ keepScroll = false } = {}) {
  const c = ctx();
  const key = `${c.path}?${c.query}`;
  const scroll = window.scrollY;
  current?.view.unmount?.();
  const full = { ...c, app, state: store.state, now: new Date() };
  try {
    root.innerHTML = String(c.view.render(full));
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card error"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p><a href="#/today">Back to Today</a></p></div>`;
  }
  current = { ...c, full };
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === c.tab));
  document.title = `${c.view.title ? (typeof c.view.title === 'function' ? c.view.title(full) : c.view.title) + ' · ' : ''}Tap That Sales`;
  renderHeader();
  try {
    c.view.mount?.(root, full);
  } catch (e) {
    showError(e);
  }
  if (keepScroll && key === currentKey) window.scrollTo(0, scroll);
  else if (key !== currentKey) window.scrollTo(0, 0);
  currentKey = key;
}

function fresh() {
  // Handlers always get an up-to-date context.
  return { ...current, app, state: store.state, now: new Date() };
}

root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  const fn = current?.view.actions?.[el.dataset.action];
  if (!fn) return;
  if (el.tagName !== 'A' || el.getAttribute('href') === '#') ev.preventDefault();
  try {
    fn(el, fresh(), ev);
  } catch (e) {
    showError(e);
  }
});

root.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fn = current?.view.forms?.[form.dataset.form];
  try {
    fn?.(form, fresh(), ev);
  } catch (e) {
    showError(e);
  }
});

for (const type of ['input', 'change']) {
  root.addEventListener(type, (ev) => {
    const el = ev.target.closest(`[data-${type}]`);
    if (!el) return;
    const fn = current?.view[type === 'input' ? 'inputs' : 'changes']?.[el.dataset[type]];
    try {
      fn?.(el, fresh(), ev);
    } catch (e) {
      showError(e);
    }
  });
}

store.subscribe(() => render({ keepScroll: true }));
window.addEventListener('hashchange', () => render());
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key === 'tapthat.salescc.v1') {
    store.reloadFromStorage();
    toast('Updated with changes from another tab.', { type: 'info' });
  }
});

// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Refresh time-based views (call windows, expiry warnings) every minute.
setInterval(() => {
  if (current?.view.autoRefresh && document.visibilityState === 'visible' && !document.activeElement?.matches('input, textarea, select') && !document.getElementById('dialog')?.open) {
    render({ keepScroll: true });
  }
}, 60000);

render();
