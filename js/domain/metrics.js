// Campaign numbers for the dashboard. Only FULLY PAID orders count towards the
// sales target; part-paid stands are reported separately.

import { EXPENSE_CATEGORIES, PIPELINE } from './constants.js';
import {
  activeOrders,
  expiredReservations,
  isDelivered,
  orderBalance,
  orderPaid,
  orderTotal,
  paymentStatus,
  persoStatus,
  unitBoard,
} from './inventory.js';
import { leadStage } from './leads.js';
import { dayKey, daysBetween, roundMoney, sum } from './util.js';

const TRAVEL = new Set(EXPENSE_CATEGORIES.filter((c) => c.travel).map((c) => c.id));

export function expenseTotals(state) {
  const travel = state.expenses.filter((e) => TRAVEL.has(e.category));
  const other = state.expenses.filter((e) => !TRAVEL.has(e.category));
  const actual = (list) => roundMoney(sum(list, (e) => e.actual));
  // Projected = actual where known, otherwise the estimate.
  const projected = (list) =>
    roundMoney(sum(list, (e) => (e.actual !== null && e.actual !== undefined && e.actual !== '' ? e.actual : e.estimated)));
  return {
    travelActual: actual(travel),
    travelEstimated: roundMoney(sum(travel, (e) => e.estimated)),
    travelProjected: projected(travel),
    otherActual: actual(other),
    otherProjected: projected(other),
    pendingActuals: state.expenses.filter((e) => e.actual === null || e.actual === undefined || e.actual === '').length,
  };
}

export function campaignMetrics(state, now = new Date()) {
  const s = state.settings;
  const orders = activeOrders(state);
  const board = unitBoard(state);
  const count = (st) => board.filter((b) => b.status === st).length;
  const paidOrders = orders.filter((o) => paymentStatus(o) === 'paid');
  const fullyPaidUnits = sum(paidOrders, (o) => o.quantity);
  const partialUnits = sum(orders.filter((o) => paymentStatus(o) === 'partial'), (o) => o.quantity);
  const inventory = state.units.length;
  const collected = roundMoney(sum(orders, orderPaid));
  const outstanding = roundMoney(sum(orders, orderBalance));
  const committed = roundMoney(sum(orders, orderTotal));
  const exp = expenseTotals(state);
  const today = dayKey(now);
  const daysLeft = Math.max(0, daysBetween(today, s.endDate) + 1);
  const remaining = Math.max(0, inventory - fullyPaidUnits);
  return {
    inventory,
    available: count('available'),
    reserved: count('reserved'),
    partial: count('partial'),
    paid: count('paid'),
    delivered: count('delivered'),
    fullyPaidUnits,
    partialUnits,
    remaining,
    revenueTarget: roundMoney(inventory * s.minPrice),
    collected,
    outstanding,
    committed,
    inventoryCost: s.inventoryCost,
    grossProfit: roundMoney(collected - s.inventoryCost),
    netProfit: roundMoney(collected - s.inventoryCost - exp.travelActual - exp.otherActual),
    travelBudget: s.travelBudget,
    ...exp,
    travelRemaining: roundMoney(s.travelBudget - exp.travelActual),
    daysLeft,
    neededPerDay: daysLeft ? Math.ceil(remaining / daysLeft) : remaining,
    beforeStart: today < s.startDate,
    afterEnd: today > s.endDate,
    stockArrived: today >= s.stockArrivalDate,
  };
}

export function todayActivity(state, now = new Date()) {
  const today = dayKey(now);
  const acts = state.activities.filter((a) => dayKey(new Date(a.at)) === today);
  const visitLeads = new Set(acts.filter((a) => a.channel === 'visit').map((a) => a.leadId));
  return {
    calls: acts.filter((a) => a.channel === 'call').length,
    whatsapp: acts.filter((a) => a.channel === 'whatsapp' && a.outcome === 'sent').length,
    emails: acts.filter((a) => a.channel === 'email' && a.outcome === 'sent').length,
    visits: visitLeads.size,
    conversations: acts.filter((a) => ['interested', 'appointment', 'callback', 'demo', 'order'].includes(a.outcome)).length,
    booked: acts.filter((a) => a.outcome === 'appointment').length,
    demos: acts.filter((a) => a.outcome === 'demo' || a.outcome === 'order').length,
  };
}

export function pipelineCounts(state) {
  const counts = Object.fromEntries(PIPELINE.map((p) => [p.id, 0]));
  counts.declined = 0;
  counts.opted_out = 0;
  counts.not_suitable = 0;
  for (const l of state.leads) {
    const st = leadStage(l, state);
    counts[st] = (counts[st] || 0) + 1;
  }
  return counts;
}

/** Things that need attention, most urgent first. */
export function actionItems(state, now = new Date()) {
  const items = [];
  const leadName = (id) => state.leads.find((l) => l.id === id)?.name || 'Unknown';
  for (const o of expiredReservations(state, now)) {
    items.push({ level: 'danger', text: `Reservation expired: ${leadName(o.leadId)} (${o.quantity} stand${o.quantity > 1 ? 's' : ''}). Release or extend.`, href: `#/order/${o.id}` });
  }
  for (const o of activeOrders(state)) {
    if (isDelivered(o) && paymentStatus(o) !== 'paid') {
      items.push({ level: 'danger', text: `Delivered but not fully paid: ${leadName(o.leadId)} owes R${orderBalance(o)}.`, href: `#/order/${o.id}` });
    }
  }
  const due = state.leads.filter((l) => l.callbackAt && new Date(l.callbackAt) <= now && !['declined', 'opted_out', 'not_suitable'].includes(l.stage));
  if (due.length) items.push({ level: 'warn', text: `${due.length} callback${due.length > 1 ? 's' : ''} due now.`, href: '#/outreach' });
  const today = dayKey(now);
  const visitsToday = state.visits.filter((v) => v.date === today && v.status === 'planned');
  if (visitsToday.length) items.push({ level: 'info', text: `${visitsToday.length} visit${visitsToday.length > 1 ? 's' : ''} planned today.`, href: `#/visits?date=${today}` });
  const overdueVisits = state.visits.filter((v) => v.date < today && v.status === 'planned');
  if (overdueVisits.length) items.push({ level: 'warn', text: `${overdueVisits.length} past visit${overdueVisits.length > 1 ? 's' : ''} without an outcome.`, href: '#/visits?view=overdue' });
  for (const o of activeOrders(state)) {
    const ps = paymentStatus(o);
    if (ps === 'partial') items.push({ level: 'warn', text: `Balance due: ${leadName(o.leadId)} owes R${orderBalance(o)}.`, href: `#/order/${o.id}` });
    if (ps === 'paid' && !isDelivered(o)) {
      const st = persoStatus(o.personalisation);
      items.push({
        level: 'info',
        text: `Paid, awaiting ${st === 'tested' ? 'delivery' : 'personalisation'}: ${leadName(o.leadId)}.`,
        href: st === 'tested' ? `#/order/${o.id}` : `#/personalise/${o.id}`,
      });
    }
  }
  const lastBackup = state.meta?.lastBackupAt ? new Date(state.meta.lastBackupAt) : null;
  if (state.leads.length && (!lastBackup || now - lastBackup > 12 * 3600000)) {
    items.push({ level: 'warn', text: lastBackup ? 'No backup in the last 12 hours. Export one now.' : 'No backup yet. Export one now.', href: '#/backup' });
  }
  return items;
}
