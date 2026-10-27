// Lead records, pipeline stages and activity logging.

import {
  CLOSED_STAGES,
  OPEN_STAGE_ORDER,
  PIPELINE,
  outcome as findOutcome,
} from './constants.js';
import { activeOrders, orderStage } from './inventory.js';
import { parsePhone } from './phone.js';
import { emptyScores } from './scoring.js';
import { ValidationError, dayKey, formatTime, uid } from './util.js';

export function newLead(input = {}, now = new Date()) {
  const lead = {
    id: uid('l_'),
    name: '',
    category: 'other',
    area: 'Gqeberha',
    suburb: '',
    address: '',
    phones: [],
    whatsapp: '',
    email: '',
    website: '',
    mapsUrl: '',
    reviewUrl: '',
    reviewUrlSource: '',
    googleRating: null,
    googleReviewCount: null,
    contactName: '',
    contactRole: '',
    decisionMaker: 'unknown', // yes | no | unknown
    gatekeeperName: '',
    gatekeeperNotes: '',
    bestTime: '',
    callbackAt: '',
    potentialStands: null,
    scores: emptyScores(),
    stage: 'prospect',
    nextAction: '',
    notes: '',
    source: 'manual',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...input,
  };
  lead.phones = (lead.phones || []).map((p) => (typeof p === 'string' ? parsePhone(p) : p)).filter((p) => p.raw);
  return lead;
}

export function validateLead(lead) {
  if (!String(lead.name || '').trim()) throw new ValidationError('Business name is required.');
  if (lead.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) throw new ValidationError('That email address looks wrong.');
}

/** Pipeline stage including order progress. With several orders, the least advanced one wins. */
export function leadStage(lead, state) {
  const orders = activeOrders(state).filter((o) => o.leadId === lead.id);
  if (orders.length) {
    const idx = Math.min(...orders.map((o) => PIPELINE.findIndex((p) => p.id === orderStage(o))));
    return PIPELINE[idx].id;
  }
  return lead.stage;
}

export function hasActiveOrder(lead, state) {
  return activeOrders(state).some((o) => o.leadId === lead.id);
}

/** Apply a stage from an outcome: closed stages always apply; open stages only move forward. */
export function advanceStage(lead, stage) {
  if (!stage) return;
  if (CLOSED_STAGES.includes(stage)) {
    lead.stage = stage;
    return;
  }
  const cur = OPEN_STAGE_ORDER.indexOf(lead.stage);
  const next = OPEN_STAGE_ORDER.indexOf(stage);
  if (cur === -1 || next > cur) lead.stage = stage;
}

/**
 * Record an outcome against a lead. Updates stage, callback time and
 * contact details, and books a visit when the outcome is "visit booked".
 * Returns the created activity.
 */
export function logActivity(state, input, now = new Date()) {
  const lead = state.leads.find((l) => l.id === input.leadId);
  if (!lead) throw new ValidationError('Lead not found.');
  const channel = input.channel;
  const out = findOutcome(channel, input.outcome);
  if (!out) throw new ValidationError('Choose an outcome.');

  const activity = {
    id: uid('a_'),
    leadId: lead.id,
    channel,
    outcome: out.id,
    at: input.at || now.toISOString(),
    notes: String(input.notes || '').trim(),
    message: input.message || '',
    phone: input.phone || '',
    visitId: input.visitId || '',
  };
  state.activities.push(activity);

  advanceStage(lead, out.stage);

  if (input.contactName) lead.contactName = String(input.contactName).trim();
  if (input.decisionMaker) lead.decisionMaker = input.decisionMaker;
  if (input.gatekeeperName) lead.gatekeeperName = String(input.gatekeeperName).trim();
  if (input.gatekeeperNotes) lead.gatekeeperNotes = String(input.gatekeeperNotes).trim();
  if (input.nextAction !== undefined && input.nextAction !== '') lead.nextAction = String(input.nextAction).trim();

  if (out.stage === 'opted_out' || out.stage === 'declined') {
    lead.callbackAt = '';
    lead.nextAction = out.stage === 'opted_out' ? 'Do not contact' : 'Declined – no further contact';
    // Cancel future planned visits automatically.
    for (const v of state.visits) {
      if (v.leadId === lead.id && v.status === 'planned') v.status = 'cancelled';
    }
  } else if (out.needsTime === 'callback') {
    lead.callbackAt = input.when || '';
  } else if (input.clearCallback !== false && channel !== 'note') {
    // A completed conversation clears a due callback.
    if (lead.callbackAt && new Date(lead.callbackAt) <= now) lead.callbackAt = '';
  }

  if (out.needsTime === 'visit' && input.when) {
    const when = new Date(input.when);
    state.visits.push({
      id: uid('v_'),
      leadId: lead.id,
      date: dayKey(when),
      time: formatTime(when),
      kind: 'appointment',
      status: 'planned',
      order: 0,
      outcome: '',
      demoDone: false,
      notes: activity.notes,
    });
    lead.callbackAt = '';
  }
  if (out.id === 'wrong_number' && input.phone) {
    const p = lead.phones.find((x) => x.e164 === input.phone || x.raw === input.phone);
    if (p) p.invalid = true;
  }
  lead.updatedAt = now.toISOString();
  return activity;
}

export function removeActivity(state, activityId) {
  state.activities = state.activities.filter((a) => a.id !== activityId);
}

export function deleteLead(state, leadId) {
  if (state.orders.some((o) => o.leadId === leadId && o.status === 'active')) {
    throw new ValidationError('This business has an active order. Cancel the order before deleting.');
  }
  state.leads = state.leads.filter((l) => l.id !== leadId);
  state.activities = state.activities.filter((a) => a.leadId !== leadId);
  state.visits = state.visits.filter((v) => v.leadId !== leadId);
}

export function usablePhones(lead) {
  return (lead.phones || []).filter((p) => p.e164 && !p.invalid);
}

export function whatsappNumber(lead) {
  if (lead.whatsapp) return lead.whatsapp;
  return usablePhones(lead).find((p) => p.type === 'mobile')?.e164 || '';
}

export function firstName(lead) {
  const n = String(lead.contactName || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}
