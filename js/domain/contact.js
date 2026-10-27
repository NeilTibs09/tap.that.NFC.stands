// Contact rules: who may be contacted, follow-up limits, calling windows and
// the daily call / WhatsApp / email queues.
//
// Follow-up rule: contact attempts are counted per calendar day (a no-answer call
// plus a WhatsApp on the same day is one attempt). The first day is the initial
// contact; after that up to `maxFollowUps` more days are allowed while the
// prospect hasn't responded. Once a prospect engages (interested, booked, demo,
// order) the limit no longer applies. "Call me back" is consent for one more
// attempt. Declined / opted-out leads are blocked immediately.

import { CLOSED_STAGES, ENGAGED_STAGES, OUTBOUND_CHANNELS, category, outcome } from './constants.js';
import { hasActiveOrder, usablePhones, whatsappNumber } from './leads.js';
import { priorityCompare, scoreLead } from './scoring.js';
import { dayKey, minutesOfDay } from './util.js';

export function outboundActivities(state, leadId) {
  return state.activities
    .filter((a) => a.leadId === leadId && OUTBOUND_CHANNELS.includes(a.channel))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function contactState(lead, state, now = new Date()) {
  const max = Number(state.settings.maxFollowUps ?? 3);
  if (lead.stage === 'opted_out') return { allowed: false, blocked: 'opted_out', reason: 'Opted out. Do not contact.' };
  if (lead.stage === 'declined') return { allowed: false, blocked: 'declined', reason: 'Declined. No further contact.' };
  if (lead.stage === 'not_suitable') return { allowed: false, blocked: 'not_suitable', reason: 'Marked not suitable.' };

  const acts = outboundActivities(state, lead.id);
  const days = [...new Set(acts.map((a) => dayKey(new Date(a.at))))];
  const today = dayKey(now);
  const contactedToday = days.includes(today);
  const followUpsUsed = Math.max(0, days.length - 1);
  const engaged = ENGAGED_STAGES.includes(lead.stage) || hasActiveOrder(lead, state);
  const last = acts[acts.length - 1];
  const consent = !!last && !!outcome(last.channel, last.outcome)?.consent;
  const base = { followUpsUsed, maxFollowUps: max, attempts: days.length, contactedToday, engaged, lastActivity: last };

  if (engaged) return { ...base, allowed: true, remaining: Infinity, reason: 'Engaged – follow up as agreed.' };
  if (followUpsUsed >= max && !consent && !contactedToday) {
    return {
      ...base,
      allowed: false,
      blocked: 'limit',
      remaining: 0,
      reason: `Initial contact + ${max} follow-ups used with no response. Stop unless they get in touch.`,
    };
  }
  const remaining = Math.max(0, max - followUpsUsed);
  let reason;
  if (days.length === 0) reason = 'Not contacted yet – initial contact.';
  else if (consent) reason = 'They asked to be contacted again.';
  else if (contactedToday) reason = `Contacted today (follow-up ${followUpsUsed} of ${max}).`;
  else reason = `Next attempt is follow-up ${followUpsUsed + 1} of ${max}.`;
  return { ...base, allowed: true, remaining, consent, reason };
}

export function callWindow(categoryId, settings, now = new Date()) {
  const w = settings.callWindows?.[categoryId] || settings.callWindows?.other;
  const mins = now.getHours() * 60 + now.getMinutes();
  const sessions = ['morning', 'afternoon'].map((s) => ({
    session: s,
    start: w?.[s]?.[0],
    end: w?.[s]?.[1],
  }));
  for (const s of sessions) {
    if (s.start && s.end && mins >= minutesOfDay(s.start) && mins < minutesOfDay(s.end)) {
      return { inWindow: true, session: s.session, label: `${s.start}–${s.end}`, sessions };
    }
  }
  const next = sessions.find((s) => s.start && mins < minutesOfDay(s.start));
  return { inWindow: false, session: null, label: next ? `best from ${next.start}` : 'best tomorrow', sessions };
}

export function currentSession(now = new Date()) {
  return now.getHours() < 13 ? 'morning' : 'afternoon';
}

function channelToday(state, leadId, channel, now) {
  const today = dayKey(now);
  return state.activities.some((a) => a.leadId === leadId && a.channel === channel && dayKey(new Date(a.at)) === today);
}

function callbackDue(lead, now) {
  return !!lead.callbackAt && new Date(lead.callbackAt) <= now;
}

function callbackLater(lead, now) {
  return !!lead.callbackAt && new Date(lead.callbackAt) > now;
}

/**
 * Today's call list. Excludes blocked leads, leads already called today
 * (unless a callback is due), and leads with a callback booked for later.
 */
export function callQueue(state, now = new Date()) {
  const weights = state.settings.scoringWeights;
  const rows = [];
  for (const lead of state.leads) {
    if (!usablePhones(lead).length) continue;
    const cs = contactState(lead, state, now);
    if (!cs.allowed) continue;
    if (callbackLater(lead, now)) continue;
    const due = callbackDue(lead, now);
    if (!due && channelToday(state, lead.id, 'call', now)) continue;
    const win = callWindow(lead.category, state.settings, now);
    rows.push({ lead, contact: cs, window: win, callbackDue: due, score: scoreLead(lead, weights) });
  }
  rows.sort((a, b) => {
    if (a.callbackDue !== b.callbackDue) return a.callbackDue ? -1 : 1;
    if (a.window.inWindow !== b.window.inWindow) return a.window.inWindow ? -1 : 1;
    // Fresh leads before repeat follow-ups at equal priority
    const pc = priorityCompare(a.lead, b.lead, weights);
    if (pc !== 0) return pc;
    return a.contact.attempts - b.contact.attempts;
  });
  return rows;
}

export function scheduledCallbacks(state, now = new Date()) {
  return state.leads
    .filter((l) => callbackLater(l, now) && contactState(l, state, now).allowed)
    .sort((a, b) => String(a.callbackAt).localeCompare(String(b.callbackAt)));
}

/** WhatsApp list: leads with a (probable) mobile number, not messaged today. */
export function whatsappQueue(state, now = new Date()) {
  const weights = state.settings.scoringWeights;
  const rows = [];
  for (const lead of state.leads) {
    const number = whatsappNumber(lead);
    if (!number) continue;
    const cs = contactState(lead, state, now);
    if (!cs.allowed) continue;
    if (callbackLater(lead, now)) continue;
    if (channelToday(state, lead.id, 'whatsapp', now)) continue;
    rows.push({ lead, number, contact: cs, score: scoreLead(lead, weights), calledToday: channelToday(state, lead.id, 'call', now) });
  }
  rows.sort((a, b) => priorityCompare(a.lead, b.lead, weights) || a.contact.attempts - b.contact.attempts);
  return rows;
}

export function emailQueue(state, now = new Date()) {
  const weights = state.settings.scoringWeights;
  return state.leads
    .filter((l) => l.email && contactState(l, state, now).allowed && !channelToday(state, l.id, 'email', now))
    .map((lead) => ({ lead, contact: contactState(lead, state, now), score: scoreLead(lead, weights) }))
    .sort((a, b) => priorityCompare(a.lead, b.lead, weights));
}

/** Soft warning for messaging outside polite hours. */
export function politeHoursWarning(now = new Date()) {
  const h = now.getHours();
  if (now.getDay() === 0) return "It's Sunday – many owners won't want business messages today.";
  if (h < 8 || h >= 18) return "It's outside business hours – consider waiting until 08:00–18:00.";
  return '';
}

export function isClosed(lead) {
  return CLOSED_STAGES.includes(lead.stage);
}

export function categoryTier(lead) {
  return category(lead.category).tier;
}
