// Rendering helpers. Every interpolated value in html`` is HTML-escaped unless
// wrapped with raw(), so imported CSV data can't inject markup.

import { CATEGORIES, AREAS, category, stageLabel } from './domain/constants.js';
import { PHONE_TYPES, formatNational } from './domain/phone.js';
import { safeHref } from './domain/templates.js';

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function interp(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(interp).join('');
  if (v === null || v === undefined || v === false || v === true) return '';
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += interp(v) + strings[i + 1];
  });
  return new Safe(out);
}

export function href(url) {
  return safeHref(url) || '#';
}

export function options(list, selected, { empty } = {}) {
  const items = list.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return html`${empty !== undefined ? html`<option value="">${empty}</option>` : ''}${items.map(
    (o) => html`<option value="${o.value}" ${raw(String(o.value) === String(selected ?? '') ? 'selected' : '')}>${o.label}</option>`
  )}`;
}

export const categoryOptions = (sel, empty) => options(CATEGORIES.map((c) => ({ value: c.id, label: c.label })), sel, { empty });
export const areaOptions = (sel, empty) => options(AREAS, sel, { empty });

export function stageChip(stage) {
  return html`<span class="chip stage-${stage}">${stageLabel(stage)}</span>`;
}

export function tierChip(catId) {
  const c = category(catId);
  return html`<span class="chip tier-${c.tier}">${c.short}</span>`;
}

export function scoreBadge(score) {
  const cls = score.score >= 60 ? 'hi' : score.score >= 35 ? 'mid' : 'lo';
  return html`<span class="score ${cls}" title="Score ${score.score}/100, ${score.knownPct}% of criteria known">${score.score}<small>/100${score.knownPct < 100 ? ` · ${score.knownPct}% known` : ''}</small></span>`;
}

export function phoneBadges(lead) {
  return (lead.phones || []).map(
    (p) =>
      html`<span class="chip phone-${p.type} ${p.invalid ? 'invalid' : ''}" title="${PHONE_TYPES[p.type]}">${p.e164 ? formatNational(p.e164) : p.raw} · ${PHONE_TYPES[p.type]}${p.invalid ? ' (wrong number)' : ''}</span>`
  );
}

export function progress(value, target, label) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return html`<div class="progress">
    <div class="progress-head"><span>${label}</span><strong>${value}${target ? html` / ${target}` : ''}</strong></div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${value}" aria-label="${label}"><span style="width:${pct}%"></span></div>
  </div>`;
}

export function empty(text, action = '') {
  return html`<div class="empty"><p>${text}</p>${action}</div>`;
}

export function formData(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (out[k] !== undefined) out[k] = [].concat(out[k], v);
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

// ---- Toasts & dialogs ----------------------------------------------------

export function toast(message, { type = 'ok', action, onAction, timeout = 4000 } = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      onAction?.();
      el.remove();
    });
  }
  host.appendChild(el);
  setTimeout(() => el.remove(), action ? Math.max(timeout, 7000) : timeout);
}

export function showError(e) {
  // Validation messages are expected; anything else is a bug worth logging.
  if (e?.name !== 'ValidationError') console.error(e);
  toast(e?.message || String(e), { type: 'error', timeout: 7000 });
}

/** Promise-based confirm using <dialog>; falls back to window.confirm. */
export function confirmDialog(message, { okLabel = 'Yes', cancelLabel = 'Cancel', danger = false, input } = {}) {
  const dlg = document.getElementById('dialog');
  if (!dlg || typeof dlg.showModal !== 'function') {
    if (input) {
      const v = window.prompt(message, input.value || '');
      return Promise.resolve(v === null ? null : v);
    }
    return Promise.resolve(window.confirm(message));
  }
  dlg.innerHTML = `<form method="dialog" class="dialog-body">
      <p>${esc(message)}</p>
      ${input ? `<label class="field"><span>${esc(input.label || '')}</span><input name="v" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.required ? 'required' : ''}></label>` : ''}
      <div class="row end">
        <button value="cancel" formnovalidate class="btn ghost">${esc(cancelLabel)}</button>
        <button value="ok" class="btn ${danger ? 'danger' : 'primary'}">${esc(okLabel)}</button>
      </div>
    </form>`;
  return new Promise((resolve) => {
    dlg.addEventListener(
      'close',
      () => {
        const ok = dlg.returnValue === 'ok';
        if (input) resolve(ok ? dlg.querySelector('input[name=v]').value.trim() : null);
        else resolve(ok);
      },
      { once: true }
    );
    dlg.showModal();
    dlg.querySelector(input ? 'input' : 'button[value=ok]')?.focus();
  });
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined && v !== null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
