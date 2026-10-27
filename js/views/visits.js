import { outcome as findOutcome } from '../domain/constants.js';
import { contactState } from '../domain/contact.js';
import { leadStage } from '../domain/leads.js';
import { priorityCompare } from '../domain/scoring.js';
import { mapsSearchLink, routeLink } from '../domain/templates.js';
import { addDays, dayKey, daysBetween, formatDay } from '../domain/util.js';
import { addVisit, dayPlan, dropInSuggestions, groupByArea, moveVisit } from '../domain/visits.js';
import { confirmDialog, empty, html, href, options, progress, qs, scoreBadge, stageChip, tierChip, toast } from '../ui.js';
import { callButtons, composerActions, handleLogOutcome, outcomeChanges, outcomeForm } from './components.js';

function campaignDays(settings) {
  const n = daysBetween(settings.startDate, settings.endDate);
  return Array.from({ length: Math.max(1, n + 1) }, (_, i) => addDays(settings.startDate, i));
}

export default {
  title: 'Visits',
  render({ state, query, now }) {
    const s = state.settings;
    const today = dayKey(now);
    if (query.get('view') === 'overdue') return overdue(state);
    const date = query.get('date') || today;
    const plan = dayPlan(state, date);
    const groups = groupByArea(plan);
    const active = plan.filter((x) => x.visit.status === 'planned');
    const done = plan.filter((x) => x.visit.status === 'done');
    const areasToday = [...new Set(active.map((x) => x.lead.area))];
    const suggestions = dropInSuggestions(state, date, now);
    const leadOpts = state.leads
      .filter((l) => contactState(l, state, now).allowed && !plan.some((x) => x.lead.id === l.id && x.visit.status === 'planned'))
      .sort((a, b) => (a.area + (a.suburb || '')).localeCompare(b.area + (b.suburb || '')) || priorityCompare(a, b, s.scoringWeights))
      .map((l) => ({ value: l.id, label: `${l.area}${l.suburb ? ' / ' + l.suburb : ''} – ${l.name}` }));
    const route = routeLink(active.map((x) => x.lead));

    return html`
      <div class="page-head">
        <h1>Visits · ${formatDay(date)}</h1>
        <input type="date" value="${date}" data-change="pickDate" aria-label="Pick a date" style="width:auto" />
      </div>
      <nav class="tabs" aria-label="Campaign days">
        ${campaignDays(s).map((d) => html`<a href="#/visits${qs({ date: d })}" class="${d === date ? 'active' : ''}">${formatDay(d)}${d === today ? ' ·today' : ''} <small>${state.visits.filter((v) => v.date === d && v.status !== 'cancelled').length}</small></a>`)}
      </nav>

      <section class="card stack">
        ${progress(done.length, s.dailyTargets.visits, 'Visits done')}
        <div class="row between">
          <span>${active.length} planned · ${areasToday.join(', ') || 'no areas yet'}</span>
          ${route ? html`<a class="btn primary" href="${route}" target="_blank" rel="noopener">Open route in Google Maps</a>` : ''}
        </div>
        ${active.length > 10 ? html`<small class="muted">Google Maps routes take up to 10 stops; the link covers the first 10.</small>` : ''}
        <div class="notice">Carry: stock, a working demo stand, printed flyers, a phone with NFC to test, and the payment QR/bank details.</div>
      </section>

      <section style="margin-top:12px">
        ${groups.length
          ? groups.map(
              (g) => html`<h2 style="margin-top:12px">${g.area}</h2>
              <ul class="list">${g.items.map((x, i) => visitCard(x, state, now, i, g.items.length))}</ul>`
            )
          : empty('No visits planned for this day. Add one below, or book visits from the call list.')}
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Add a visit</h2>
        <form data-form="addVisit" class="form-grid">
          <input type="hidden" name="date" value="${date}" />
          <label class="field full"><span>Business</span><select name="leadId" required>${options(leadOpts, '', { empty: 'Choose…' })}</select></label>
          <label class="field"><span>Time (blank = drop-in)</span><input type="time" name="time" /></label>
          <label class="field"><span>Notes</span><input name="notes" /></label>
          <div class="full row end"><button class="btn primary">Add</button></div>
        </form>
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Drop-in ideas ${plan.length ? `near ${[...new Set(plan.map((x) => x.lead.area))].join(', ')}` : ''}</h2>
        <p class="muted">Top-priority leads in the same areas that you can contact and haven't visited yet.</p>
        ${suggestions.length
          ? html`<ul class="list">${suggestions.map(
              ({ lead, score }) => html`<li class="item"><div class="row between"><a href="#/lead/${lead.id}" class="item-title">${lead.name}</a>${scoreBadge(score)}</div>
                <div class="item-meta">${[lead.suburb, lead.area].filter(Boolean).join(', ')}</div>
                <div class="row">${tierChip(lead.category)} ${stageChip(leadStage(lead, state))}<button class="btn small" data-action="quickAdd" data-lead="${lead.id}" data-date="${date}">+ Add to ${formatDay(date)}</button></div></li>`
            )}</ul>`
          : html`<p class="muted">No suggestions (leads need an address or Maps link).</p>`}
      </section>`;
  },
  actions: {
    ...composerActions,
    quickAdd(el, { app }) {
      app.act((s) => addVisit(s, { leadId: el.dataset.lead, date: el.dataset.date }), 'Added');
    },
    move(el, { app }) {
      app.act((s) => moveVisit(s, el.dataset.id, Number(el.dataset.delta)));
    },
    async cancelVisit(el, { app }) {
      if (!(await confirmDialog('Remove this visit from the plan?', { okLabel: 'Remove' }))) return;
      app.act((s) => {
        const v = s.visits.find((x) => x.id === el.dataset.id);
        v.status = 'cancelled';
      }, 'Visit cancelled');
    },
    restoreVisit(el, { app }) {
      app.act((s) => {
        s.visits.find((x) => x.id === el.dataset.id).status = 'planned';
      });
    },
    async moveDay(el, { app }) {
      const v = app.state.visits.find((x) => x.id === el.dataset.id);
      const d = await confirmDialog('Move to which date? (YYYY-MM-DD)', { okLabel: 'Move', input: { label: 'Date', value: addDays(v.date, 1), required: true } });
      if (!d) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return toast('Use the format YYYY-MM-DD.', { type: 'error' });
      app.act((s) => {
        s.visits.find((x) => x.id === v.id).date = d;
      }, `Moved to ${formatDay(d)}`);
    },
  },
  changes: {
    ...outcomeChanges,
    pickDate(el, { app }) {
      if (el.value) app.navigate(`#/visits${qs({ date: el.value })}`);
    },
  },
  forms: {
    logOutcome: handleLogOutcome,
    addVisit(form, { app }) {
      const d = Object.fromEntries(new FormData(form));
      if (!d.leadId) return toast('Choose a business.', { type: 'error' });
      app.act((s) => addVisit(s, d), 'Visit added');
    },
  },
};

function visitCard({ visit, lead }, state, now, idx, count) {
  const cs = contactState(lead, state, now);
  const mapLink = lead.placeId ? mapsSearchLink(lead) : lead.mapsUrl ? href(lead.mapsUrl) : mapsSearchLink(lead);
  const out = visit.outcome ? findOutcome('visit', visit.outcome) : null;
  return html`<li class="item" data-call-host style="${visit.status === 'cancelled' ? 'opacity:.6' : ''}">
    <div class="row between">
      <a class="item-title" href="#/lead/${lead.id}">${visit.time ? `${visit.time} · ` : ''}${lead.name}</a>
      <span class="chip ${visit.status === 'done' ? 'ok' : visit.status === 'planned' ? 'info' : ''}">${visit.kind === 'appointment' ? 'Appointment' : 'Drop-in'} · ${visit.status}</span>
    </div>
    <div class="item-meta">${lead.address || lead.suburb || ''}${lead.contactName ? ` · ask for ${lead.contactName}` : ''}${lead.gatekeeperName ? ` · gatekeeper ${lead.gatekeeperName}` : ''}</div>
    ${visit.notes ? html`<div class="item-meta">${visit.notes}</div>` : ''}
    ${out ? html`<div class="row"><span class="chip ok">${out.label}</span>${visit.demoDone ? html`<span class="chip ok">Demo done</span>` : ''}</div>` : ''}
    ${visit.status === 'planned'
      ? html`<div class="actions" style="margin-top:8px">
          <a class="btn small" href="${mapLink}" target="_blank" rel="noopener">Navigate</a>
          ${cs.allowed ? callButtons(lead, { small: true }) : ''}
          <a class="btn small" href="#/order/new?lead=${lead.id}">Take order</a>
        </div>
        <details class="log"><summary>Log visit outcome</summary>${outcomeForm(lead, { channels: ['visit'], visitId: visit.id, prefix: 'v' })}</details>
        <div class="row end">
          <button class="btn small ghost" data-action="move" data-id="${visit.id}" data-delta="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Move earlier">↑</button>
          <button class="btn small ghost" data-action="move" data-id="${visit.id}" data-delta="1" ${idx === count - 1 ? 'disabled' : ''} aria-label="Move later">↓</button>
          <button class="btn small ghost" data-action="moveDay" data-id="${visit.id}">Move day</button>
          <button class="btn small ghost" data-action="cancelVisit" data-id="${visit.id}">Remove</button>
        </div>`
      : visit.status === 'cancelled'
        ? html`<div class="row end"><button class="btn small ghost" data-action="restoreVisit" data-id="${visit.id}">Restore</button></div>`
        : html`<div class="row end"><a class="btn small" href="#/order/new?lead=${lead.id}">Take order</a></div>`}
  </li>`;
}

function overdue(state) {
  const today = dayKey(new Date());
  const items = state.visits.filter((v) => v.date < today && v.status === 'planned');
  return html`<div class="page-head"><h1>Past visits without an outcome</h1><a class="btn" href="#/visits">Back</a></div>
    ${items.length
      ? html`<ul class="list">${items.map((v) => {
          const l = state.leads.find((x) => x.id === v.leadId);
          return html`<li><a class="item" href="#/visits${qs({ date: v.date })}">${formatDay(v.date)} ${v.time} · ${l?.name}</a></li>`;
        })}</ul>`
      : empty('All caught up.')}`;
}
