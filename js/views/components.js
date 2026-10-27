// Pieces shared by several screens: outcome logging, message composers, contact banner.

import { CHANNELS, OUTCOMES, outcome as findOutcome } from '../domain/constants.js';
import { contactState, politeHoursWarning } from '../domain/contact.js';
import { isPlaceholderName, logActivity, removeActivity, usablePhones, whatsappNumber } from '../domain/leads.js';
import { PHONE_TYPES, formatNational } from '../domain/phone.js';
import { emailDraft, mailtoLink, mapsSearchLink, telLink, waLink, whatsappDraft } from '../domain/templates.js';
import { fromLocalInput, toLocalInput } from '../domain/util.js';
import { formData, html, raw, showError, toast } from '../ui.js';

export function contactBanner(lead, state, now) {
  const cs = contactState(lead, state, now);
  if (!cs.allowed) return html`<div class="notice danger"><strong>Stop:</strong> ${cs.reason}</div>`;
  const cls = cs.engaged ? 'ok' : cs.remaining <= 1 && cs.attempts > 0 ? 'warn' : '';
  return html`<div class="notice ${cls}">${cs.reason}${!cs.engaged && cs.attempts > 0 ? ` (${cs.remaining} follow-up${cs.remaining === 1 ? '' : 's'} left)` : ''}</div>`;
}

export function callButtons(lead, { small = false } = {}) {
  const phones = usablePhones(lead);
  if (!phones.length && lead.placeId) {
    return html`<a class="btn ${small ? 'small' : ''} primary" href="${mapsSearchLink(lead)}" target="_blank" rel="noopener" data-action="callStart" data-lead="${lead.id}" data-phone="">
      Open Google listing to call</a>
      ${isPlaceholderName(lead.name) ? html`<a class="btn ${small ? 'small' : ''}" href="#/lead/${lead.id}/edit">Add confirmed name &amp; number</a>` : ''}`;
  }
  return phones.map(
    (p) => html`<a class="btn ${small ? 'small' : ''} primary" href="${telLink(p.e164)}" data-action="callStart" data-lead="${lead.id}" data-phone="${p.e164}">
      Call ${formatNational(p.e164)} <small style="color:inherit;opacity:.8">${PHONE_TYPES[p.type]}</small></a>`
  );
}

/**
 * Outcome form. `channels` limits which channels can be picked; the first is selected.
 * Submits to forms.logOutcome, which views wire to handleLogOutcome().
 */
export function outcomeForm(lead, { channels = ['call', 'whatsapp', 'email', 'visit', 'note'], visitId = '', phone = '', prefix = '' } = {}) {
  const first = channels[0];
  const id = (s) => `${prefix}${lead.id}-${s}`;
  return html`<form data-form="logOutcome" class="stack outcome-form">
    <input type="hidden" name="leadId" value="${lead.id}" />
    <input type="hidden" name="visitId" value="${visitId}" />
    <input type="hidden" name="phone" value="${phone}" />
    ${channels.length > 1
      ? html`<div class="choices" role="radiogroup" aria-label="Channel">${channels.map(
          (c) => html`<label><input type="radio" name="channel" value="${c}" data-change="outcomeChannel" ${raw(c === first ? 'checked' : '')} />${CHANNELS.find((x) => x.id === c).label}</label>`
        )}</div>`
      : html`<input type="hidden" name="channel" value="${first}" />`}
    ${channels.map(
      (c) => html`<div class="choices" data-channel-group="${c}" ${raw(c === first ? '' : 'hidden')} role="radiogroup" aria-label="Outcome">
        ${OUTCOMES[c].map(
          (o) => html`<label><input type="radio" name="outcome" value="${o.id}" ${raw(c === 'note' && c === first ? 'checked' : '')} data-change="outcomePick" />${o.label}</label>`
        )}
      </div>`
    )}
    <div class="form-grid">
      <label class="field"><span>Callback / visit date & time</span><input type="datetime-local" name="when" id="${id('when')}" />
        <small>Needed for "visit booked"; optional for callbacks.</small></label>
      <label class="field"><span>Spoke to (name)</span><input name="contactName" placeholder="${lead.contactName || 'Owner / manager name'}" /></label>
      <label class="field"><span>Decision-maker?</span><select name="decisionMaker"><option value="">No change</option><option value="yes">Yes</option><option value="no">No – gatekeeper</option></select></label>
      <label class="field"><span>Gatekeeper name</span><input name="gatekeeperName" placeholder="${lead.gatekeeperName || 'If you spoke to staff'}" /></label>
      <label class="field full"><span>Notes</span><input name="notes" placeholder="What was said, owner's hours, objections…" /></label>
      <label class="field full"><span>Next action</span><input name="nextAction" placeholder="${lead.nextAction || 'e.g. Visit Thu with demo stand'}" /></label>
    </div>
    <div class="row end"><button class="btn primary" type="submit">Save outcome</button></div>
  </form>`;
}

export const outcomeChanges = {
  outcomeChannel(el) {
    const form = el.closest('form');
    form.querySelectorAll('[data-channel-group]').forEach((g) => {
      const on = g.dataset.channelGroup === el.value;
      g.hidden = !on;
      if (!on) g.querySelectorAll('input').forEach((i) => (i.checked = false));
    });
    if (el.value === 'note') form.querySelector('[data-channel-group=note] input').checked = true;
  },
  outcomePick(el) {
    const form = el.closest('form');
    const channel = form.querySelector('[name=channel]:checked, input[type=hidden][name=channel]')?.value;
    const o = findOutcome(channel, el.value);
    const when = form.querySelector('[name=when]');
    if (o?.needsTime && !when.value) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(o.needsTime === 'visit' ? 10 : 9, 0, 0, 0);
      when.value = toLocalInput(d.toISOString());
    }
  },
};

/** Shared submit handler. Returns the logged activity (or undefined). */
export function handleLogOutcome(form, { app }) {
  const d = formData(form);
  const channel = d.channel;
  if (!d.outcome) return showError(new Error('Pick an outcome.'));
  const o = findOutcome(channel, d.outcome);
  const when = fromLocalInput(d.when);
  if (o?.needsTime === 'visit' && !when) return showError(new Error('Pick the date and time of the visit.'));
  if (!d.notes && channel === 'note') return showError(new Error('Write the note.'));
  const act = app.act((s) => {
    const a = logActivity(s, {
      leadId: d.leadId,
      channel,
      outcome: d.outcome,
      notes: d.notes,
      when: o?.needsTime ? when : '',
      contactName: d.contactName,
      decisionMaker: d.decisionMaker,
      gatekeeperName: d.gatekeeperName,
      nextAction: d.nextAction,
      phone: d.phone,
      visitId: d.visitId,
    });
    if (d.visitId) {
      const v = s.visits.find((x) => x.id === d.visitId);
      if (v) {
        v.status = 'done';
        v.outcome = d.outcome;
        v.demoDone = v.demoDone || ['demo', 'order'].includes(d.outcome);
        if (d.notes) v.notes = [v.notes, d.notes].filter(Boolean).join('\n');
      }
    }
    return a;
  });
  if (!act) return undefined;
  const lead = app.state.leads.find((l) => l.id === d.leadId);
  if (d.outcome === 'order') {
    toast('Outcome saved. Now create the order.');
    app.navigate(`#/order/new?lead=${d.leadId}`);
  } else {
    toast(`Saved: ${lead?.name} – ${o.label}`, {
      action: 'Undo',
      onAction: () => app.act((s) => removeActivity(s, act.id), 'Undone (stage changes stay – edit the lead if needed)'),
    });
  }
  return act;
}

export function whatsappComposer(lead, state, now, { prefix = '' } = {}) {
  const cs = contactState(lead, state, now);
  const number = whatsappNumber(lead);
  if (!number) return html`<p class="muted">No mobile / WhatsApp number on file.</p>`;
  if (!cs.allowed) return html`<p class="muted">Messaging is blocked for this lead.</p>`;
  if (isPlaceholderName(lead.name)) return placeholderNotice(lead);
  const draft = whatsappDraft(lead, state.settings, cs);
  const polite = politeHoursWarning(now);
  const id = `${prefix}wa-${lead.id}`;
  return html`<div class="stack">
    ${polite ? html`<div class="notice warn">${polite}</div>` : ''}
    <label class="field"><span>Message to ${formatNational(number)} <small>(template: ${draft.key.replace('whatsapp', '')})</small></span>
      <textarea id="${id}" rows="7">${draft.text}</textarea>
      <small>Personalise it before sending. It opens in WhatsApp for you to send by hand.</small></label>
    <div class="row end">
      <button type="button" class="btn wa" data-action="waSend" data-lead="${lead.id}" data-number="${number}" data-text-id="${id}">Open in WhatsApp &amp; log as sent</button>
    </div>
  </div>`;
}

export function emailComposer(lead, state, now, { prefix = '' } = {}) {
  if (!lead.email) return html`<p class="muted">No email address on file.</p>`;
  const cs = contactState(lead, state, now);
  if (!cs.allowed) return html`<p class="muted">Emailing is blocked for this lead.</p>`;
  if (isPlaceholderName(lead.name)) return placeholderNotice(lead);
  const d = emailDraft(lead, state.settings);
  const id = `${prefix}em-${lead.id}`;
  return html`<div class="stack">
    <label class="field"><span>Subject</span><input id="${id}-s" value="${d.subject}" /></label>
    <label class="field"><span>Email to ${lead.email}</span><textarea id="${id}-b" rows="9">${d.body}</textarea></label>
    <div class="row end"><button type="button" class="btn primary" data-action="emailSend" data-lead="${lead.id}" data-id="${id}">Open email app &amp; log as sent</button></div>
  </div>`;
}

function placeholderNotice(lead) {
  return html`<div class="notice warn">"${lead.name}" is a placeholder. <a href="#/lead/${lead.id}/edit">Add the business name you confirmed</a> before writing to them.</div>`;
}

export const composerActions = {
  waSend(el, { app }) {
    const text = document.getElementById(el.dataset.textId)?.value || '';
    if (!text.trim()) return showError(new Error('The message is empty.'));
    window.open(waLink(el.dataset.number, text), '_blank', 'noopener');
    const act = app.act((s) => logActivity(s, { leadId: el.dataset.lead, channel: 'whatsapp', outcome: 'sent', message: text, phone: el.dataset.number }));
    if (act) {
      toast('Logged as sent. Log their reply when it comes in.', {
        action: "Didn't send",
        onAction: () => app.act((s) => removeActivity(s, act.id), 'Removed'),
      });
    }
  },
  emailSend(el, { app }) {
    const lead = app.state.leads.find((l) => l.id === el.dataset.lead);
    const subject = document.getElementById(`${el.dataset.id}-s`)?.value || '';
    const body = document.getElementById(`${el.dataset.id}-b`)?.value || '';
    const a = document.createElement('a');
    a.href = mailtoLink(lead.email, subject, body);
    a.click();
    const act = app.act((s) => logActivity(s, { leadId: lead.id, channel: 'email', outcome: 'sent', message: `${subject}\n\n${body}` }));
    if (act) toast('Logged as sent.', { action: "Didn't send", onAction: () => app.act((s) => removeActivity(s, act.id), 'Removed') });
  },
  callStart(el) {
    // Let the tel: link dial; open this lead's outcome form so the result gets logged.
    const host = el.closest('[data-call-host]');
    const details = host?.querySelector('details.log');
    if (details) {
      details.open = true;
      const ph = details.querySelector('input[name=phone]');
      if (ph) ph.value = el.dataset.phone;
    }
  },
};
