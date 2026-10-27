import { outcome as findOutcome } from '../domain/constants.js';
import { callQueue, currentSession, emailQueue, scheduledCallbacks, whatsappQueue } from '../domain/contact.js';
import { todayActivity } from '../domain/metrics.js';
import { formatNational } from '../domain/phone.js';
import { formatDateTime, formatRand } from '../domain/util.js';
import { empty, html, progress, qs, scoreBadge, tierChip } from '../ui.js';
import { callButtons, composerActions, emailComposer, handleLogOutcome, outcomeChanges, outcomeForm, whatsappComposer } from './components.js';

const PAGE = 25;

function lastTouch(contact) {
  const a = contact.lastActivity;
  if (!a) return 'Never contacted';
  return `Last: ${findOutcome(a.channel, a.outcome)?.label || a.outcome} (${a.channel}) ${formatDateTime(a.at)}`;
}

function leadHead(lead, score, extra = '') {
  return html`<div class="row between"><a class="item-title" href="#/lead/${lead.id}">${lead.name}</a>${scoreBadge(score)}</div>
    <div class="item-meta">${[lead.suburb, lead.area].filter(Boolean).join(', ')}${lead.contactName ? ` · ask for ${lead.contactName}` : ''}${lead.gatekeeperName ? ` · gatekeeper ${lead.gatekeeperName}` : ''}</div>
    <div class="row">${tierChip(lead.category)} ${extra}</div>`;
}

function callScript(price) {
  return html`<details class="card flat"><summary>Call script (tap to open)</summary>
  <div class="stack" style="margin-top:8px">
    <p><strong>Opener:</strong> "Hi, it's [name] from Tap That. Am I speaking to the owner?" If not: "Who's the best person to chat to about your Google reviews, and when are they usually in?" (log gatekeeper + callback time)</p>
    <p><strong>Pitch (20 sec):</strong> "I've got a small stand for your counter. Customers tap their phone or scan the QR and your Google review page opens straight away. It's personalised for you and I set it up on the spot."</p>
    <p><strong>Goal: book a visit.</strong> "It's easier to see than explain. Can I pop in for 2 minutes tomorrow morning or afternoon?"</p>
    <p><strong>Price:</strong> ${formatRand(price)} each, once-off. No subscription. I never need your Google password.</p>
    <p><strong>Don't:</strong> promise more reviews or ratings, or suggest offering rewards for reviews.</p>
    <p><strong>If they say no or ask not to be contacted:</strong> thank them and log it. They drop off all lists immediately.</p>
  </div></details>`;
}

export default {
  title: 'Outreach',
  render({ state, query, now }) {
    const tab = query.get('tab') || 'calls';
    const n = Number(query.get('n')) || PAGE;
    const s = state.settings;
    const t = todayActivity(state, now);
    const calls = callQueue(state, now);
    const was = whatsappQueue(state, now);
    const emails = emailQueue(state, now);
    const callbacks = scheduledCallbacks(state, now);
    const tabLink = (id, label, count) => html`<a href="#/outreach${qs({ tab: id })}" class="${tab === id ? 'active' : ''}">${label} <small>${count}</small></a>`;
    const more = (total) =>
      total > n ? html`<div class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="#/outreach${qs({ tab, n: n + PAGE })}">Show more (${total - n} left)</a></div>` : '';

    let body;
    if (tab === 'calls') {
      const sessionLabel = currentSession(now) === 'morning' ? 'Morning session' : 'Afternoon session';
      body = html`
        <div class="card">${progress(t.calls, s.dailyTargets.calls, `Calls today · ${sessionLabel}`)}</div>
        ${callScript(s.defaultPrice)}
        <p class="muted">Order: callbacks due → businesses in their best calling window → category priority → score. Already called today and booked-later callbacks are hidden.</p>
        ${calls.length
          ? html`<ul class="list">${calls.slice(0, n).map(
              ({ lead, contact, window, callbackDue, score }) => html`<li class="item" data-call-host>
                ${leadHead(
                  lead,
                  score,
                  html`${callbackDue ? html`<span class="chip warn">Callback due ${formatDateTime(lead.callbackAt)}</span>` : ''}
                  <span class="chip ${window.inWindow ? 'ok' : ''}">${window.inWindow ? `Good time now (${window.label})` : window.label}</span>`
                )}
                <div class="item-meta">${lastTouch(contact)} · ${contact.reason}</div>
                ${lead.bestTime ? html`<div class="item-meta">Best time: ${lead.bestTime}</div>` : ''}
                <div class="actions" style="margin-top:8px">${callButtons(lead, { small: true })}</div>
                <details class="log"><summary>Log call outcome</summary>${outcomeForm(lead, { channels: ['call'], prefix: 'q' })}</details>
              </li>`
            )}</ul>${more(calls.length)}`
          : empty(state.leads.length ? 'No one left to call right now. Check callbacks or add more leads.' : 'Add or import leads to build your call list.')}`;
    } else if (tab === 'whatsapp') {
      body = html`
        <div class="card">${progress(t.whatsapp, s.dailyTargets.whatsapp, 'Personal WhatsApps today')}</div>
        <div class="notice">Each message opens in WhatsApp for you to check and send yourself, one business at a time. No bulk sending. Anyone who replies STOP must be logged as "opt out".</div>
        ${was.length
          ? html`<ul class="list" style="margin-top:12px">${was.slice(0, n).map(
              ({ lead, number, contact, score, calledToday }) => html`<li class="item">
                ${leadHead(lead, score, html`<span class="chip phone-mobile">${formatNational(number)}</span>${calledToday ? html`<span class="chip">Called today</span>` : ''}`)}
                <div class="item-meta">${lastTouch(contact)} · ${contact.reason}</div>
                <details><summary>Write message</summary>${whatsappComposer(lead, state, now, { prefix: 'q' })}</details>
                <details class="log"><summary>Log a reply</summary>${outcomeForm(lead, { channels: ['whatsapp'], prefix: 'qw' })}</details>
              </li>`
            )}</ul>${more(was.length)}`
          : empty('No one to message right now (needs a mobile/WhatsApp number and not messaged today).')}`;
    } else if (tab === 'email') {
      body = html`
        <div class="card">${progress(t.emails, s.dailyTargets.emails, 'Emails today')}</div>
        <p class="muted">Use email where it fits, e.g. guest houses and tour operators who list an email address.</p>
        ${emails.length
          ? html`<ul class="list">${emails.slice(0, n).map(
              ({ lead, contact, score }) => html`<li class="item">
                ${leadHead(lead, score)}
                <div class="item-meta">${lastTouch(contact)} · ${contact.reason}</div>
                <details><summary>Write email</summary>${emailComposer(lead, state, now, { prefix: 'q' })}</details>
                <details class="log"><summary>Log a reply</summary>${outcomeForm(lead, { channels: ['email'], prefix: 'qe' })}</details>
              </li>`
            )}</ul>${more(emails.length)}`
          : empty('No leads with email addresses to contact today.')}`;
    } else {
      body = callbacks.length
        ? html`<ul class="list">${callbacks.map(
            (lead) => html`<li><a class="item" href="#/lead/${lead.id}"><div class="item-title">${lead.name}</div><div class="item-meta">${formatDateTime(lead.callbackAt)} · ${lead.contactName || lead.gatekeeperName || ''} ${lead.nextAction ? `· ${lead.nextAction}` : ''}</div></a></li>`
          )}</ul>`
        : empty('No callbacks booked.');
    }

    return html`
      <div class="page-head"><h1>Outreach</h1></div>
      <nav class="tabs" aria-label="Outreach lists">
        ${tabLink('calls', 'Calls', calls.length)}
        ${tabLink('whatsapp', 'WhatsApp', was.length)}
        ${tabLink('email', 'Email', emails.length)}
        ${tabLink('callbacks', 'Booked callbacks', callbacks.length)}
      </nav>
      <div class="stack">${body}</div>`;
  },
  actions: { ...composerActions },
  changes: { ...outcomeChanges },
  forms: { logOutcome: handleLogOutcome },
};

