// Visit planning: day lists, geographic grouping, drop-in suggestions and trip estimates.

import { AREAS } from './constants.js';
import { contactState } from './contact.js';
import { scoreLead, priorityCompare } from './scoring.js';
import { ValidationError, roundMoney, uid } from './util.js';

export function addVisit(state, input) {
  const lead = state.leads.find((l) => l.id === input.leadId);
  if (!lead) throw new ValidationError('Choose a business to visit.');
  if (!input.date) throw new ValidationError('Choose a date.');
  if (['opted_out', 'declined'].includes(lead.stage)) throw new ValidationError(`${lead.name} has declined or opted out.`);
  const dup = state.visits.find((v) => v.leadId === lead.id && v.date === input.date && v.status === 'planned');
  if (dup) throw new ValidationError(`${lead.name} is already on the plan for that day.`);
  const sameDay = state.visits.filter((v) => v.date === input.date);
  const visit = {
    id: uid('v_'),
    leadId: lead.id,
    date: input.date,
    time: input.time || '',
    kind: input.kind || (input.time ? 'appointment' : 'drop_in'),
    status: 'planned',
    order: sameDay.length ? Math.max(...sameDay.map((v) => v.order || 0)) + 1 : 1,
    outcome: '',
    demoDone: false,
    notes: String(input.notes || '').trim(),
  };
  state.visits.push(visit);
  return visit;
}

const areaIndex = (a) => {
  const i = AREAS.indexOf(a);
  return i === -1 ? AREAS.length : i;
};

/** Visits for a day sorted by area, then route order, then time. */
export function dayPlan(state, date) {
  const leads = new Map(state.leads.map((l) => [l.id, l]));
  return state.visits
    .filter((v) => v.date === date)
    .map((v) => ({ visit: v, lead: leads.get(v.leadId) }))
    .filter((x) => x.lead)
    .sort((a, b) => {
      const ar = areaIndex(a.lead.area) - areaIndex(b.lead.area);
      if (ar) return ar;
      const so = (a.lead.suburb || '').localeCompare(b.lead.suburb || '');
      if (so) return so;
      if ((a.visit.order || 0) !== (b.visit.order || 0)) return (a.visit.order || 0) - (b.visit.order || 0);
      return (a.visit.time || '99').localeCompare(b.visit.time || '99');
    });
}

export function groupByArea(plan) {
  const groups = new Map();
  for (const item of plan) {
    const key = item.lead.area || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([area, items]) => ({ area, items }));
}

export function moveVisit(state, visitId, delta) {
  const v = state.visits.find((x) => x.id === visitId);
  if (!v) return;
  const plan = dayPlan(state, v.date).filter((x) => x.lead.area === state.leads.find((l) => l.id === v.leadId)?.area);
  plan.forEach((x, i) => (x.visit.order = i + 1));
  const idx = plan.findIndex((x) => x.visit.id === visitId);
  const swap = plan[idx + delta];
  if (!swap) return;
  [v.order, swap.visit.order] = [swap.visit.order, v.order];
}

/** High-scoring, contactable leads in the same areas as the day's visits that aren't planned yet. */
export function dropInSuggestions(state, date, now = new Date(), limit = 12) {
  const plan = dayPlan(state, date);
  const areas = new Set(plan.map((x) => x.lead.area));
  const planned = new Set(state.visits.filter((v) => v.status === 'planned').map((v) => v.leadId));
  const visitedDone = new Set(state.visits.filter((v) => v.status === 'done').map((v) => v.leadId));
  const weights = state.settings.scoringWeights;
  return state.leads
    .filter((l) => (areas.size ? areas.has(l.area) : true) && !planned.has(l.id) && !visitedDone.has(l.id))
    .filter((l) => contactState(l, state, now).allowed)
    .filter((l) => l.address || l.mapsUrl)
    .sort((a, b) => priorityCompare(a, b, weights))
    .slice(0, limit)
    .map((lead) => ({ lead, score: scoreLead(lead, weights) }));
}

/** Rough fuel estimate: the furthest area's round trip plus 15 km per extra area. */
export function tripEstimate(state, date) {
  const plan = dayPlan(state, date).filter((x) => x.visit.status !== 'cancelled');
  const areas = [...new Set(plan.map((x) => x.lead.area || 'Other'))];
  if (!areas.length) return { km: 0, cost: 0, areas };
  const kmTable = state.settings.areaKm || {};
  const kms = areas.map((a) => Number(kmTable[a] ?? kmTable.Other ?? 50));
  const km = Math.max(...kms) + 15 * (areas.length - 1);
  return { km, cost: roundMoney(km * (Number(state.settings.costPerKm) || 0)), areas };
}
