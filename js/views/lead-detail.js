import { CHANNELS, LEAD_STAGES, outcome as findOutcome } from '../domain/constants.js';
import { contactState } from '../domain/contact.js';
import { ORDER_STAGE_LABEL, orderBalance, orderStage, orderTotal } from '../domain/inventory.js';
import { deleteLead, leadStage, removeActivity } from '../domain/leads.js';
import { scoreLead } from '../domain/scoring.js';
import { mapsSearchLink } from '../domain/templates.js';
import { dayKey, formatDateTime, formatDay, formatRand } from '../domain/util.js';
import { addVisit } from '../domain/visits.js';
import { confirmDialog, html, href, options, phoneBadges, scoreBadge, stageChip, tierChip, toast } from '../ui.js';
import {
  callButtons,
  composerActions,
  contactBanner,
  emailComposer,
  handleLogOutcome,
  outcomeChanges,
  outcomeForm,
  whatsappComposer,
} from './components.js';

export default {
  title: ({ state, params }) => state.leads.find((l) => l.id === params[0])?.name || 'Lead',
  render({ state, params, now }) {
    const lead = state.leads.find((l) => l.id === params[0]);
    if (!lead) return html`<p>Lead not found. <a href="#/leads">Back to leads</a></p>`;
    const sc = scoreLead(lead, state.settings.scoringWeights);
    const stage = leadStage(lead, state);
    const cs = contactState(lead, state, now);
    const orders = state.orders.filter((o) => o.leadId === lead.id);
    const visits = state.visits.filter((v) => v.leadId === lead.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const acts = state.activities.filter((a) => a.leadId === lead.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const mapLink = lead.mapsUrl ? href(lead.mapsUrl) : mapsSearchLink(lead);

    return html`
      <div class="page-head">
        <div class="grow">
          <h1>${lead.name}</h1>
          <div class="row">${tierChip(lead.category)} ${stageChip(stage)} ${scoreBadge(sc)}</div>
          <div class="item-meta">${[lead.address || lead.suburb, lead.area].filter(Boolean).join(', ')}</div>
        </div>
        <a class="btn" href="#/lead/${lead.id}/edit">Edit</a>
      </div>

      ${contactBanner(lead, state, now)}

      <section class="card stack" style="margin-top:12px" data-call-host>
        <div class="actions">
          ${cs.allowed ? callButtons(lead) : ''}
          <a class="btn" href="${mapLink}" target="_blank" rel="noopener">Directions / Maps</a>
          <a class="btn" href="#/order/new?lead=${lead.id}">New order</a>
        </div>
        ${lead.callbackAt ? html`<div class="notice warn">Callback booked: ${formatDateTime(lead.callbackAt)} <button class="btn small ghost" data-action="clearCallback">Clear</button></div>` : ''}
        <details class="log" ${cs.allowed ? '' : 'open'}>
          <summary>Log a call, message, visit or note</summary>
          ${outcomeForm(lead, { channels: cs.allowed ? ['call', 'whatsapp', 'email', 'visit', 'note'] : ['note'] })}
        </details>
      </section>

      ${cs.allowed
        ? html`<section class="card stack" style="margin-top:12px">
            <details><summary>WhatsApp draft</summary>${whatsappComposer(lead, state, now)}</details>
            ${lead.email ? html`<details><summary>Email draft</summary>${emailComposer(lead, state, now)}</details>` : ''}
          </section>`
        : ''}

      <section class="card" style="margin-top:12px">
        <h2>Plan a visit</h2>
        <form data-form="planVisit" class="form-grid">
          <label class="field"><span>Date</span><input type="date" name="date" value="${dayKey(now)}" required /></label>
          <label class="field"><span>Time (blank = drop-in)</span><input type="time" name="time" /></label>
          <label class="field full"><span>Notes</span><input name="notes" placeholder="Bring demo stand, ask for owner…" /></label>
          <div class="full row end"><button class="btn primary" ${cs.allowed ? '' : 'disabled'}>Add to visit plan</button></div>
        </form>
        ${visits.length
          ? html`<ul class="list" style="margin-top:12px">${visits.map(
              (v) => html`<li class="item"><a href="#/visits?date=${v.date}">${formatDay(v.date)} ${v.time}</a> · ${v.kind === 'appointment' ? 'Appointment' : 'Drop-in'} · <span class="chip ${v.status === 'done' ? 'ok' : v.status === 'planned' ? 'info' : ''}">${v.status}</span>${v.demoDone ? html` <span class="chip ok">Demo done</span>` : ''}</li>`
            )}</ul>`
          : ''}
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Details</h2>
        <dl class="kv">
          <dt>Phones</dt><dd><div class="row">${phoneBadges(lead)}</div>${lead.phones.length ? '' : '—'}</dd>
          ${lead.whatsapp ? html`<dt>WhatsApp</dt><dd>${lead.whatsapp}</dd>` : ''}
          <dt>Email</dt><dd>${lead.email || '—'}</dd>
          <dt>Website</dt><dd>${lead.website ? html`<a href="${href(lead.website)}" target="_blank" rel="noopener">${lead.website}</a>` : '—'}</dd>
          <dt>Owner / DM</dt><dd>${lead.contactName || 'Unknown'}${lead.contactRole ? ` (${lead.contactRole})` : ''} · decision-maker: ${lead.decisionMaker}</dd>
          <dt>Gatekeeper</dt><dd>${lead.gatekeeperName || '—'}${lead.gatekeeperNotes ? ` · ${lead.gatekeeperNotes}` : ''}</dd>
          <dt>Best time</dt><dd>${lead.bestTime || '—'}</dd>
          <dt>Google</dt><dd>${lead.googleRating ?? '?'}★ · ${lead.googleReviewCount ?? '?'} reviews ${lead.reviewUrl ? html`· <a href="${href(lead.reviewUrl)}" target="_blank" rel="noopener">review link</a>` : ''}</dd>
          <dt>Possible stands</dt><dd>${lead.potentialStands ?? 'Unknown'}</dd>
          <dt>Next action</dt><dd>${lead.nextAction || '—'}</dd>
          <dt>Notes</dt><dd style="white-space:pre-wrap">${lead.notes || '—'}</dd>
        </dl>
        <form data-form="setStage" class="row" style="margin-top:12px">
          <label class="field grow"><span>Stage (manual)</span><select name="stage">${options(LEAD_STAGES.map((s) => ({ value: s.id, label: s.label })), lead.stage)}</select></label>
          <button class="btn" style="align-self:flex-end">Update</button>
        </form>
      </section>

      <section class="card" style="margin-top:12px">
        <div class="row between"><h2>Score: ${sc.score}/100</h2><a class="btn small" href="#/lead/${lead.id}/edit">Edit scores</a></div>
        <p class="muted">${sc.knownPct}% of criteria known.${sc.missingEvidence ? ` ${sc.missingEvidence} rating(s) have no evidence noted.` : ''}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Criterion</th><th>Rating</th><th class="num">Pts</th><th>Evidence</th></tr></thead>
          <tbody>${sc.breakdown.map(
            (b) => html`<tr><td>${b.label}</td><td>${b.level === null ? html`<span class="muted">Unknown</span>` : b.level === 1 ? 'Strong' : b.level === 0.5 ? 'Some' : 'No'}</td><td class="num">${Math.round(b.earned * 10) / 10}/${b.weight}</td><td>${b.evidence || html`<span class="muted">—</span>`}</td></tr>`
          )}</tbody>
        </table></div>
      </section>

      ${orders.length
        ? html`<section class="card" style="margin-top:12px"><h2>Orders</h2><ul class="list">${orders.map(
            (o) => html`<li><a class="item" href="#/order/${o.id}"><div class="row between"><span>${o.quantity} × ${formatRand(o.unitPrice)} = ${formatRand(orderTotal(o))}</span><span class="chip">${ORDER_STAGE_LABEL[orderStage(o)]}</span></div>
              <div class="item-meta">${o.status === 'active' ? `Balance ${formatRand(orderBalance(o))} · stands ${o.unitIds.join(', ')}` : `Cancelled: ${o.cancelReason}`}</div></a></li>`
          )}</ul></section>`
        : ''}

      <section class="card" style="margin-top:12px">
        <h2>History</h2>
        ${acts.length
          ? html`<ul class="timeline">${acts.map((a) => {
              const o = findOutcome(a.channel, a.outcome);
              return html`<li><strong>${CHANNELS.find((c) => c.id === a.channel)?.label}</strong> · ${a.channel === 'note' ? '' : o?.label || a.outcome} <small>${formatDateTime(a.at)}</small>
                ${a.notes ? html`<div>${a.notes}</div>` : ''}
                ${a.message ? html`<details><summary><small>Message</small></summary><div class="message-preview muted">${a.message}</div></details>` : ''}
                <button class="btn small ghost" data-action="deleteActivity" data-id="${a.id}" aria-label="Delete this entry">Delete</button></li>`;
            })}</ul>`
          : html`<p class="muted">No contact yet.</p>`}
      </section>

      <div class="row end" style="margin-top:16px"><button class="btn ghost" data-action="deleteLead">Delete lead</button></div>
    `;
  },
  actions: {
    ...composerActions,
    async deleteLead(el, { app, params }) {
      const lead = app.state.leads.find((l) => l.id === params[0]);
      if (!(await confirmDialog(`Delete ${lead.name} and its history? This can't be undone.`, { okLabel: 'Delete', danger: true }))) return;
      if (app.act((s) => (deleteLead(s, lead.id), true), 'Lead deleted')) app.navigate('#/leads');
    },
    async deleteActivity(el, { app }) {
      if (!(await confirmDialog('Delete this history entry? (Stage changes stay as they are.)', { okLabel: 'Delete', danger: true }))) return;
      app.act((s) => removeActivity(s, el.dataset.id), 'Entry deleted');
    },
    clearCallback(el, { app, params }) {
      app.act((s) => {
        s.leads.find((l) => l.id === params[0]).callbackAt = '';
      }, 'Callback cleared');
    },
  },
  changes: { ...outcomeChanges },
  forms: {
    logOutcome: handleLogOutcome,
    setStage(form, { app, params }) {
      const stage = new FormData(form).get('stage');
      app.act((s) => {
        const l = s.leads.find((x) => x.id === params[0]);
        l.stage = stage;
        l.updatedAt = new Date().toISOString();
        if (stage === 'opted_out' || stage === 'declined') {
          l.callbackAt = '';
          s.visits.forEach((v) => v.leadId === l.id && v.status === 'planned' && (v.status = 'cancelled'));
        }
      }, 'Stage updated');
    },
    planVisit(form, { app, params }) {
      const d = Object.fromEntries(new FormData(form));
      const v = app.act((s) => addVisit(s, { leadId: params[0], date: d.date, time: d.time, notes: d.notes }));
      if (v) toast(`Added to ${formatDay(v.date)} plan`, { action: 'Open plan', onAction: () => app.navigate(`#/visits?date=${v.date}`) });
    },
  },
};
