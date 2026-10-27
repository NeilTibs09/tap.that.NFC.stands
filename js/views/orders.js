import {
  ORDER_STAGE_LABEL,
  PERSO_STATUS_LABEL,
  expiredReservations,
  isReservationExpired,
  orderBalance,
  orderPaid,
  orderStage,
  orderTotal,
  persoStatus,
  releaseAllExpired,
  releaseReservation,
  extendReservation,
} from '../domain/inventory.js';
import { campaignMetrics } from '../domain/metrics.js';
import { formatDateTime, formatRand } from '../domain/util.js';
import { confirmDialog, empty, html, qs } from '../ui.js';

const FILTERS = [
  { id: 'active', label: 'All active', test: (o) => o.status === 'active' },
  { id: 'order_unpaid', label: 'Unpaid', test: (o) => orderStage(o) === 'order_unpaid' },
  { id: 'order_partial', label: 'Part-paid', test: (o) => orderStage(o) === 'order_partial' },
  { id: 'order_paid', label: 'Paid, to deliver', test: (o) => orderStage(o) === 'order_paid' },
  { id: 'delivered', label: 'Delivered', test: (o) => orderStage(o) === 'delivered' },
  { id: 'cancelled', label: 'Cancelled', test: (o) => o.status === 'cancelled' },
];

export function orderRow(o, state, now) {
  const lead = state.leads.find((l) => l.id === o.leadId);
  const st = orderStage(o);
  const ps = persoStatus(o.personalisation);
  const expired = isReservationExpired(o, now);
  return html`<li><a class="item" href="#/order/${o.id}">
    <div class="row between"><span class="item-title">${lead?.name || 'Unknown'}</span><span class="chip stage-${st}">${ORDER_STAGE_LABEL[st]}</span></div>
    <div class="item-meta">${o.quantity} × ${formatRand(o.unitPrice)}${o.discount ? ` − ${formatRand(o.discount)}` : ''} = ${formatRand(orderTotal(o))} · paid ${formatRand(orderPaid(o))}${o.status === 'active' && orderBalance(o) > 0 ? ` · owes ${formatRand(orderBalance(o))}` : ''}</div>
    <div class="row">
      ${o.status === 'active' ? html`<span class="chip">${o.unitIds.join(', ')}</span><span class="chip ${ps === 'ready' ? 'ok' : 'warn'}">${PERSO_STATUS_LABEL[ps]}</span>` : html`<span class="chip">${o.cancelReason}</span>`}
      ${expired ? html`<span class="chip danger">Reservation expired</span>` : o.status === 'active' && st === 'order_unpaid' ? html`<span class="chip">Held until ${formatDateTime(o.reservedUntil)}</span>` : ''}
    </div>
  </a></li>`;
}

export default {
  title: 'Orders',
  autoRefresh: true,
  render({ state, query, now }) {
    const f = FILTERS.find((x) => x.id === query.get('f')) || FILTERS[0];
    const expired = expiredReservations(state, now);
    const list = state.orders.filter(f.test).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const m = campaignMetrics(state, now);
    return html`
      <div class="page-head">
        <h1>Orders</h1>
        <a class="btn primary ${m.available ? '' : 'disabled'}" href="#/order/new" aria-disabled="${m.available ? 'false' : 'true'}">+ New order</a>
      </div>
      <div class="grid stats">
        <div class="stat"><b>${m.available}</b><span>Stands available</span></div>
        <div class="stat"><b>${m.fullyPaidUnits}</b><span>Fully paid</span></div>
        <div class="stat"><b>${formatRand(m.outstanding)}</b><span>Outstanding</span></div>
        <div class="stat"><b>${formatRand(m.collected)}</b><span>Collected</span></div>
      </div>

      ${expired.length
        ? html`<section class="card warn stack" style="margin-top:12px">
            <h2>Expired reservations (${expired.length})</h2>
            <p>These unpaid orders are past their hold time. Release them to free the stands for other buyers, or extend if the customer has confirmed they will pay.</p>
            <ul class="list">${expired.map((o) => {
              const lead = state.leads.find((l) => l.id === o.leadId);
              return html`<li class="item"><div class="row between"><strong>${lead?.name}</strong><span>${o.quantity} stand(s) · ${o.unitIds.join(', ')}</span></div>
                <div class="item-meta">Held until ${formatDateTime(o.reservedUntil)}</div>
                <div class="row end"><button class="btn small" data-action="extend" data-id="${o.id}">Extend 24h</button><button class="btn small danger" data-action="release" data-id="${o.id}">Release stands</button></div></li>`;
            })}</ul>
            ${expired.length > 1 ? html`<div class="row end"><button class="btn danger" data-action="releaseAll">Release all ${expired.length}</button></div>` : ''}
          </section>`
        : ''}

      <nav class="tabs" style="margin-top:12px" aria-label="Order filters">
        ${FILTERS.map((x) => html`<a href="#/orders${qs({ f: x.id === 'active' ? '' : x.id })}" class="${x.id === f.id ? 'active' : ''}">${x.label} <small>${state.orders.filter(x.test).length}</small></a>`)}
      </nav>
      ${list.length ? html`<ul class="list">${list.map((o) => orderRow(o, state, now))}</ul>` : empty('No orders here yet.')}
    `;
  },
  actions: {
    extend(el, { app }) {
      app.act((s) => extendReservation(s, el.dataset.id, 24), 'Extended by 24 hours');
    },
    async release(el, { app }) {
      if (!(await confirmDialog('Release these stands back to available stock? The order will be cancelled.', { okLabel: 'Release', danger: true }))) return;
      app.act((s) => releaseReservation(s, el.dataset.id), 'Stands released');
    },
    async releaseAll(el, { app }) {
      if (!(await confirmDialog('Release all expired reservations?', { okLabel: 'Release all', danger: true }))) return;
      app.act((s) => releaseAllExpired(s), (r) => `Released ${r.length} reservation(s)`);
    },
  },
};
