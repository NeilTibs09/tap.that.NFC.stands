import { integrityIssues, unitBoard } from '../domain/inventory.js';
import { campaignMetrics } from '../domain/metrics.js';
import { formatRand } from '../domain/util.js';
import { html } from '../ui.js';

const LABEL = {
  available: 'Available',
  reserved: 'Reserved – unpaid',
  partial: 'Part-paid',
  paid: 'Paid – to deliver',
  delivered: 'Delivered',
};

export default {
  title: 'Stock',
  render({ state, now }) {
    const board = unitBoard(state);
    const issues = integrityIssues(state);
    const m = campaignMetrics(state, now);
    const name = (o) => state.leads.find((l) => l.id === o.leadId)?.name || '';
    return html`
      <div class="page-head"><h1>Stock: ${m.inventory} stands</h1><a class="btn" href="#/orders">Orders</a></div>
      ${issues.length
        ? html`<div class="card error stack"><h2>Stock problems</h2>${issues.map((i) => html`<p>${i}</p>`)}<p>Fix by cancelling the duplicate order. New changes that would cause this are blocked.</p></div>`
        : html`<div class="notice ok">Stock check passed: every stand is in at most one active order.</div>`}
      <div class="legend" style="margin:12px 0">${Object.entries(LABEL).map(([k, v]) => html`<span><i class="swatch-${k}"></i>${v} (${board.filter((b) => b.status === k).length})</span>`)}</div>
      <div class="units">
        ${board.map(
          (b) => html`<a class="unit ${b.status}" href="${b.order ? `#/order/${b.order.id}` : '#/order/new'}">
            <b>${b.unit.id}</b>${b.order ? name(b.order) : 'Available'}<br /><small>${LABEL[b.status]}</small></a>`
        )}
      </div>
      <section class="card stack" style="margin-top:12px">
        <h2>How reservations work</h2>
        <p>Creating an order reserves specific stands at once, so they can't be sold twice. Unpaid orders are held for ${state.settings.reservationHours} hours (never past ${state.settings.endDate}).</p>
        <p>When a hold runs out, the order shows under <a href="#/orders">Orders → Expired reservations</a>. Release it to put the stands back, or extend it if the customer confirmed. Part-paid orders are never released automatically. Cancel them with a refund note.</p>
        <p>Only fully paid stands count towards the target. Stock cost: ${formatRand(state.settings.inventoryCost)}. Change the number of stands in <a href="#/settings">Settings</a>.</p>
      </section>`;
  },
};
