// Orders, stock allocation and payments.
//
// Single source of truth for allocation: an ACTIVE order's `unitIds`. A unit is
// "available" only if no active order lists it. Every mutation below re-checks
// that before assigning units, so one stand can never sit in two orders.
// All functions mutate the `state` passed in (the store hands them a draft copy
// and only saves if nothing throws).

import { ValidationError, endOfDay, roundMoney, sum, uid } from './util.js';

const EPS = 0.005;

export function unitLabel(n) {
  return `TT-${String(n).padStart(2, '0')}`;
}

export function makeUnits(count) {
  return Array.from({ length: count }, (_, i) => ({ id: unitLabel(i + 1), note: '' }));
}

export function activeOrders(state) {
  return state.orders.filter((o) => o.status === 'active');
}

export function allocatedUnitIds(state, exceptOrderId = null) {
  const ids = new Set();
  for (const o of activeOrders(state)) {
    if (o.id === exceptOrderId) continue;
    for (const u of o.unitIds) ids.add(u);
  }
  return ids;
}

export function availableUnits(state) {
  const taken = allocatedUnitIds(state);
  return state.units.filter((u) => !taken.has(u.id));
}

/** Grow or shrink the unit list to match the configured inventory count. */
export function syncUnitCount(state, count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n < 0 || n > 999) throw new ValidationError('Inventory must be between 0 and 999 stands.');
  const existing = new Set(state.units.map((u) => u.id));
  let i = 1;
  while (state.units.length < n) {
    const id = unitLabel(i++);
    if (!existing.has(id)) state.units.push({ id, note: '' });
  }
  if (state.units.length > n) {
    const taken = allocatedUnitIds(state);
    const removable = state.units.filter((u) => !taken.has(u.id)).reverse();
    const toRemove = state.units.length - n;
    if (removable.length < toRemove) {
      throw new ValidationError(
        `Can't reduce stock to ${n}: ${taken.size} stands are allocated to active orders.`
      );
    }
    const drop = new Set(removable.slice(0, toRemove).map((u) => u.id));
    state.units = state.units.filter((u) => !drop.has(u.id));
  }
  state.settings.inventoryCount = n;
}

export function orderTotal(o) {
  return roundMoney(Math.max(0, o.quantity * o.unitPrice - (o.discount || 0)));
}

export function orderPaid(o) {
  return roundMoney(sum(o.payments || [], (p) => p.amount));
}

export function orderBalance(o) {
  return roundMoney(orderTotal(o) - orderPaid(o));
}

export function paymentStatus(o) {
  const paid = orderPaid(o);
  if (paid <= EPS) return 'unpaid';
  if (paid + EPS >= orderTotal(o)) return 'paid';
  return 'partial';
}

export function isDelivered(o) {
  return o.delivery?.status === 'delivered';
}

/** Pipeline stage of a single order. "Delivered" only once it is also fully paid. */
export function orderStage(o) {
  if (o.status !== 'active') return 'cancelled';
  const ps = paymentStatus(o);
  if (ps === 'paid') return isDelivered(o) ? 'delivered' : 'order_paid';
  if (ps === 'partial') return 'order_partial';
  return 'order_unpaid';
}

export const ORDER_STAGE_LABEL = {
  order_unpaid: 'Confirmed – unpaid',
  order_partial: 'Partially paid',
  order_paid: 'Fully paid',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function netUnitPrice(o) {
  return o.quantity > 0 ? roundMoney(orderTotal(o) / o.quantity) : 0;
}

function validatePricing({ quantity, unitPrice, discount, belowMinReason }, settings) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError('Quantity must be a whole number of at least 1.');
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new ValidationError('Enter a unit price.');
  if (!Number.isFinite(discount) || discount < 0) throw new ValidationError('Discount cannot be negative.');
  const total = roundMoney(quantity * unitPrice - discount);
  if (total <= 0) throw new ValidationError('Order total must be more than R0.');
  const net = total / quantity;
  if (net + EPS < settings.minPrice && !String(belowMinReason || '').trim()) {
    throw new ValidationError(
      `Net price per stand (R${roundMoney(net)}) is below the R${settings.minPrice} minimum. Give a reason to approve it.`
    );
  }
}

export function reservationExpiry(settings, now) {
  const hours = Number(settings.reservationHours) || 48;
  const expiry = new Date(now.getTime() + hours * 3600000);
  const deadline = endOfDay(settings.endDate);
  // Never hold stock past the sales deadline, unless we're already past it.
  return (deadline > now && expiry > deadline ? deadline : expiry).toISOString();
}

// Stand setup record: only the review link, branding and whether it's ready.
export function emptyPersonalisation() {
  return {
    reviewUrl: '',
    reviewUrlSource: '', // customer | researched
    logoSource: '', // customer | researched | none
    logoNote: '',
    ready: false,
    readyAt: '',
    notes: '',
  };
}

export function createOrder(state, input, now = new Date()) {
  const settings = state.settings;
  const lead = state.leads.find((l) => l.id === input.leadId);
  if (!lead) throw new ValidationError('Choose a customer for this order.');
  const quantity = Number(input.quantity);
  const unitPrice = Number(input.unitPrice);
  const discount = Number(input.discount || 0);
  validatePricing({ quantity, unitPrice, discount, belowMinReason: input.belowMinReason }, settings);

  const free = availableUnits(state);
  if (free.length < quantity) {
    throw new ValidationError(
      free.length === 0
        ? 'No stands are available. Release an expired or cancelled reservation first.'
        : `Only ${free.length} stand${free.length === 1 ? '' : 's'} available.`
    );
  }
  const order = {
    id: uid('o_'),
    leadId: lead.id,
    createdAt: now.toISOString(),
    quantity,
    unitPrice: roundMoney(unitPrice),
    discount: roundMoney(discount),
    belowMinReason: String(input.belowMinReason || '').trim(),
    unitIds: free.slice(0, quantity).map((u) => u.id),
    status: 'active',
    reservedUntil: reservationExpiry(settings, now),
    payments: [],
    personalisation: emptyPersonalisation(),
    delivery: { status: 'pending', at: '', note: '' },
    notes: String(input.notes || '').trim(),
    cancelledAt: '',
    cancelReason: '',
  };
  if (lead.reviewUrl) {
    order.personalisation.reviewUrl = lead.reviewUrl;
    order.personalisation.reviewUrlSource = lead.reviewUrlSource || '';
  }
  state.orders.push(order);
  assertIntegrity(state);
  return order;
}

function findActive(state, orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) throw new ValidationError('Order not found.');
  if (o.status !== 'active') throw new ValidationError('This order is cancelled.');
  return o;
}

export function updateOrderTerms(state, orderId, input) {
  const o = findActive(state, orderId);
  const quantity = Number(input.quantity ?? o.quantity);
  const unitPrice = Number(input.unitPrice ?? o.unitPrice);
  const discount = Number(input.discount ?? o.discount);
  const belowMinReason = input.belowMinReason ?? o.belowMinReason;
  validatePricing({ quantity, unitPrice, discount, belowMinReason }, state.settings);
  const newTotal = roundMoney(quantity * unitPrice - discount);
  if (orderPaid(o) > newTotal + EPS) throw new ValidationError('Payments already exceed that total. Remove a payment first.');

  if (quantity > o.unitIds.length) {
    const need = quantity - o.unitIds.length;
    const free = availableUnits(state);
    if (free.length < need) throw new ValidationError(`Only ${free.length} more stand(s) available.`);
    o.unitIds.push(...free.slice(0, need).map((u) => u.id));
  } else if (quantity < o.unitIds.length) {
    o.unitIds = o.unitIds.slice(0, quantity);
  }
  o.quantity = quantity;
  o.unitPrice = roundMoney(unitPrice);
  o.discount = roundMoney(discount);
  o.belowMinReason = String(belowMinReason || '').trim();
  if (input.notes !== undefined) o.notes = String(input.notes).trim();
  assertIntegrity(state);
  return o;
}

export function addPayment(state, orderId, input, now = new Date()) {
  const o = findActive(state, orderId);
  const amount = roundMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Payment amount must be more than R0.');
  const balance = orderBalance(o);
  if (amount > balance + EPS) {
    throw new ValidationError(`That's more than the R${balance} balance. Check the amount.`);
  }
  const p = {
    id: uid('p_'),
    amount,
    method: input.method || 'Cash',
    reference: String(input.reference || '').trim(),
    at: input.at || now.toISOString(),
  };
  o.payments.push(p);
  return p;
}

export function removePayment(state, orderId, paymentId) {
  const o = findActive(state, orderId);
  const before = o.payments.length;
  o.payments = o.payments.filter((p) => p.id !== paymentId);
  if (o.payments.length === before) throw new ValidationError('Payment not found.');
}

export function cancelOrder(state, orderId, { reason, refundNote } = {}, now = new Date()) {
  const o = findActive(state, orderId);
  if (!String(reason || '').trim()) throw new ValidationError('Give a reason for cancelling.');
  if (orderPaid(o) > EPS && !String(refundNote || '').trim()) {
    throw new ValidationError('This order has payments. Record how the money was refunded (or kept) before cancelling.');
  }
  if (isDelivered(o)) throw new ValidationError('This order was delivered. Mark it not delivered first if the stand came back.');
  o.status = 'cancelled';
  o.cancelledAt = now.toISOString();
  o.cancelReason = String(reason).trim();
  o.refundNote = String(refundNote || '').trim();
  // Keep a record of which stands it held; they are free again because the order is no longer active.
  o.releasedUnitIds = o.unitIds;
  o.unitIds = [];
  return o;
}

/** Unpaid orders whose hold time has passed. Part-paid orders never expire automatically. */
export function isReservationExpired(o, now = new Date()) {
  return (
    o.status === 'active' &&
    paymentStatus(o) === 'unpaid' &&
    !isDelivered(o) &&
    !!o.reservedUntil &&
    new Date(o.reservedUntil) < now
  );
}

export function expiredReservations(state, now = new Date()) {
  return activeOrders(state).filter((o) => isReservationExpired(o, now));
}

export function releaseReservation(state, orderId, now = new Date()) {
  const o = findActive(state, orderId);
  if (paymentStatus(o) !== 'unpaid') throw new ValidationError('Only unpaid reservations can be released. Cancel the order instead.');
  return cancelOrder(state, orderId, { reason: isReservationExpired(o, now) ? 'Reservation expired' : 'Reservation released' }, now);
}

export function releaseAllExpired(state, now = new Date()) {
  return expiredReservations(state, now).map((o) => releaseReservation(state, o.id, now));
}

export function extendReservation(state, orderId, hours, now = new Date()) {
  const o = findActive(state, orderId);
  const base = Math.max(now.getTime(), new Date(o.reservedUntil || now).getTime());
  o.reservedUntil = new Date(base + Number(hours) * 3600000).toISOString();
  return o;
}

export function setDelivered(state, orderId, delivered, note = '', now = new Date()) {
  const o = findActive(state, orderId);
  o.delivery = delivered
    ? { status: 'delivered', at: now.toISOString(), note: String(note || '').trim() }
    : { status: 'pending', at: '', note: '' };
  return o;
}

export function persoStatus(p) {
  if (!p) return 'not_started';
  if (p.ready) return 'ready';
  if (p.reviewUrl || p.logoSource || p.logoNote) return 'in_progress';
  return 'not_started';
}

export const PERSO_STATUS_LABEL = {
  not_started: 'Setup not started',
  in_progress: 'Setup details recorded',
  ready: 'Stand ready',
};

/** Convert setup records saved by the earlier version (timer + checklist). */
export function migratePersonalisation(p) {
  const base = emptyPersonalisation();
  if (!p) return base;
  const out = { ...base };
  for (const k of Object.keys(base)) if (p[k] !== undefined) out[k] = p[k];
  if (p.steps && p.ready === undefined) {
    const s = p.steps;
    const configured = s.linkVerified && s.logoApplied && s.nfcWritten && s.qrApplied;
    out.ready = !!(configured && (s.testedAndroid || s.testedIphone) && s.testedQr);
    out.readyAt = out.ready ? p.completedAt || '' : '';
  }
  return out;
}

/** Per-unit view for the stock board. */
export function unitBoard(state) {
  const byUnit = new Map();
  for (const o of activeOrders(state)) for (const u of o.unitIds) byUnit.set(u, o);
  return state.units.map((u) => {
    const o = byUnit.get(u.id);
    if (!o) return { unit: u, status: 'available', order: null };
    const st = orderStage(o);
    const status =
      st === 'delivered'
        ? 'delivered'
        : st === 'order_paid'
          ? 'paid'
          : st === 'order_partial'
            ? 'partial'
            : 'reserved';
    return { unit: u, status, order: o };
  });
}

export function integrityIssues(state) {
  const issues = [];
  const unitIds = new Set(state.units.map((u) => u.id));
  const seen = new Map();
  for (const o of activeOrders(state)) {
    if (o.unitIds.length !== o.quantity) {
      issues.push(`Order ${o.id} is for ${o.quantity} stands but holds ${o.unitIds.length}.`);
    }
    for (const u of o.unitIds) {
      if (!unitIds.has(u)) issues.push(`Order ${o.id} holds unknown stand ${u}.`);
      if (seen.has(u)) issues.push(`Stand ${u} is allocated to two orders (${seen.get(u)} and ${o.id}).`);
      seen.set(u, o.id);
    }
    if (!state.leads.some((l) => l.id === o.leadId)) issues.push(`Order ${o.id} has no customer record.`);
  }
  return issues;
}

export function assertIntegrity(state) {
  const issues = integrityIssues(state);
  if (issues.length) throw new ValidationError(`Stock check failed: ${issues[0]}`);
}

/** Save the stand setup fields. A stand can only be marked ready once it has a review link. */
export function updateSetup(state, orderId, fields, now = new Date()) {
  const o = findActive(state, orderId);
  const p = migratePersonalisation(o.personalisation);
  for (const k of ['reviewUrl', 'reviewUrlSource', 'logoSource', 'logoNote', 'notes']) {
    if (fields[k] !== undefined) p[k] = String(fields[k] || '').trim();
  }
  if (fields.ready !== undefined) {
    const ready = !!fields.ready;
    if (ready && !p.reviewUrl) throw new ValidationError('Add the Google review link before marking the stand ready.');
    if (ready && !p.ready) p.readyAt = now.toISOString();
    if (!ready) p.readyAt = '';
    p.ready = ready;
  }
  o.personalisation = p;
  return o;
}
