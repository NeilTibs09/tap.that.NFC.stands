import { PAYMENT_METHODS } from '../domain/constants.js';
import {
  ORDER_STAGE_LABEL,
  PERSO_STATUS_LABEL,
  addPayment,
  availableUnits,
  cancelOrder,
  extendReservation,
  isReservationExpired,
  netUnitPrice,
  orderBalance,
  orderPaid,
  orderStage,
  orderTotal,
  paymentStatus,
  persoStatus,
  releaseReservation,
  removePayment,
  setDelivered,
  updateOrderTerms,
} from '../domain/inventory.js';
import { formatDateTime, formatRand, toNumber } from '../domain/util.js';
import { confirmDialog, formData, html, options, toast } from '../ui.js';

export default {
  title: 'Order',
  render({ state, params, now }) {
    const o = state.orders.find((x) => x.id === params[0]);
    if (!o) return html`<p>Order not found. <a href="#/orders">Back to orders</a></p>`;
    const lead = state.leads.find((l) => l.id === o.leadId);
    const st = orderStage(o);
    const ps = persoStatus(o.personalisation);
    const active = o.status === 'active';
    const expired = isReservationExpired(o, now);
    const balance = orderBalance(o);
    const free = availableUnits(state).length;

    return html`
      <div class="page-head">
        <div><h1>${lead?.name || 'Order'}</h1><span class="chip stage-${st}">${ORDER_STAGE_LABEL[st]}</span></div>
        <a class="btn" href="#/lead/${o.leadId}">Customer</a>
      </div>

      ${expired ? html`<div class="notice danger">Reservation expired ${formatDateTime(o.reservedUntil)}. Release the stands or extend the hold.</div>` : ''}
      ${active && isDeliveredUnpaid(o) ? html`<div class="notice danger">Delivered but not fully paid: ${formatRand(balance)} outstanding.</div>` : ''}

      <section class="card" style="margin-top:12px">
        <dl class="kv">
          <dt>Stands</dt><dd>${active ? o.unitIds.join(', ') : `Released (${(o.releasedUnitIds || []).join(', ')})`}</dd>
          <dt>Quantity</dt><dd>${o.quantity}</dd>
          <dt>Price</dt><dd>${formatRand(o.unitPrice)} each${o.discount ? ` − ${formatRand(o.discount)} discount` : ''} = <strong>${formatRand(orderTotal(o))}</strong> (${formatRand(netUnitPrice(o))}/stand)</dd>
          ${o.belowMinReason ? html`<dt>Below-min reason</dt><dd>${o.belowMinReason}</dd>` : ''}
          <dt>Paid</dt><dd>${formatRand(orderPaid(o))} · <strong>${balance > 0 ? `${formatRand(balance)} outstanding` : 'nothing outstanding'}</strong></dd>
          <dt>Created</dt><dd>${formatDateTime(o.createdAt)}</dd>
          ${active && paymentStatus(o) === 'unpaid' ? html`<dt>Held until</dt><dd>${formatDateTime(o.reservedUntil)}</dd>` : ''}
          <dt>Personalisation</dt><dd>${PERSO_STATUS_LABEL[ps]}</dd>
          <dt>Delivery</dt><dd>${o.delivery?.status === 'delivered' ? `Delivered ${formatDateTime(o.delivery.at)}${o.delivery.note ? ` · ${o.delivery.note}` : ''}` : 'Not delivered'}</dd>
          ${o.notes ? html`<dt>Notes</dt><dd>${o.notes}</dd>` : ''}
          ${!active ? html`<dt>Cancelled</dt><dd>${formatDateTime(o.cancelledAt)} · ${o.cancelReason}${o.refundNote ? ` · ${o.refundNote}` : ''}</dd>` : ''}
        </dl>
      </section>

      ${active
        ? html`
        <section class="card stack" style="margin-top:12px">
          <h2>Payments</h2>
          ${o.payments.length
            ? html`<div class="table-wrap"><table><thead><tr><th>When</th><th>Method</th><th>Ref</th><th class="num">Amount</th><th></th></tr></thead><tbody>
                ${o.payments.map((p) => html`<tr><td>${formatDateTime(p.at)}</td><td>${p.method}</td><td>${p.reference}</td><td class="num">${formatRand(p.amount)}</td><td><button class="btn small ghost" data-action="removePayment" data-id="${p.id}" aria-label="Remove payment">✕</button></td></tr>`)}
              </tbody></table></div>`
            : html`<p class="muted">No payments yet.</p>`}
          ${balance > 0
            ? html`<form data-form="pay" class="form-grid">
                <label class="field"><span>Amount (R)</span><input name="amount" inputmode="decimal" value="${balance}" required /></label>
                <label class="field"><span>Method</span><select name="method">${options(PAYMENT_METHODS, 'Cash')}</select></label>
                <label class="field"><span>Reference</span><input name="reference" placeholder="EFT ref / SnapScan ID" /></label>
                <div class="row end full"><button class="btn primary">Record payment</button></div>
              </form>
              <p class="muted">Only record EFTs once the money shows in your account.</p>`
            : html`<div class="notice ok">Fully paid. Counts towards the target.</div>`}
        </section>

        <section class="card stack" style="margin-top:12px">
          <h2>Set up &amp; deliver</h2>
          <div class="actions">
            <a class="btn primary" href="#/personalise/${o.id}">Personalise (${PERSO_STATUS_LABEL[ps]})</a>
            ${o.delivery?.status === 'delivered'
              ? html`<button class="btn" data-action="undeliver">Mark not delivered</button>`
              : html`<button class="btn" data-action="deliver">Mark delivered</button>`}
          </div>
        </section>

        <section class="card stack" style="margin-top:12px">
          <details><summary>Change quantity or price</summary>
            <form data-form="terms" class="form-grid" style="margin-top:8px">
              <label class="field"><span>Quantity (${free} more available)</span><input name="quantity" type="number" min="1" step="1" value="${o.quantity}" /></label>
              <label class="field"><span>Price per stand</span><input name="unitPrice" inputmode="decimal" value="${o.unitPrice}" /></label>
              <label class="field"><span>Discount</span><input name="discount" inputmode="decimal" value="${o.discount}" /></label>
              <label class="field"><span>Below-minimum reason</span><input name="belowMinReason" value="${o.belowMinReason}" /></label>
              <label class="field full"><span>Notes</span><input name="notes" value="${o.notes}" /></label>
              <div class="row end full"><button class="btn">Save changes</button></div>
            </form>
          </details>
          ${paymentStatus(o) === 'unpaid'
            ? html`<div class="row"><button class="btn" data-action="extend">Extend hold 24h</button><button class="btn" data-action="release">Release reservation</button></div>`
            : ''}
          <details><summary>Cancel order</summary>
            <form data-form="cancel" class="form-grid" style="margin-top:8px">
              <label class="field full"><span>Reason *</span><input name="reason" required placeholder="Customer changed mind, duplicate…" /></label>
              ${orderPaid(o) > 0 ? html`<label class="field full"><span>Refund note * (${formatRand(orderPaid(o))} was paid)</span><input name="refundNote" required placeholder="e.g. Refunded R450 by EFT on 30 Oct" /></label>` : ''}
              <div class="row end full"><button class="btn danger">Cancel order &amp; release stands</button></div>
            </form>
          </details>
        </section>`
        : ''}
    `;
  },
  actions: {
    async removePayment(el, { app, params }) {
      if (!(await confirmDialog('Remove this payment? Use this only to fix a mistake.', { okLabel: 'Remove', danger: true }))) return;
      app.act((s) => removePayment(s, params[0], el.dataset.id), 'Payment removed');
    },
    async deliver(el, { app, params }) {
      const o = app.state.orders.find((x) => x.id === params[0]);
      const warnings = [];
      if (paymentStatus(o) !== 'paid') warnings.push(`it isn't fully paid (${formatRand(orderBalance(o))} outstanding)`);
      if (persoStatus(o.personalisation) !== 'tested') warnings.push("personalisation hasn't been tested");
      if (warnings.length && !(await confirmDialog(`Mark delivered even though ${warnings.join(' and ')}?`, { okLabel: 'Mark delivered' }))) return;
      app.act((s) => setDelivered(s, params[0], true), 'Marked delivered');
    },
    undeliver(el, { app, params }) {
      app.act((s) => setDelivered(s, params[0], false), 'Marked not delivered');
    },
    extend(el, { app, params }) {
      app.act((s) => extendReservation(s, params[0], 24), 'Hold extended by 24 hours');
    },
    async release(el, { app, params }) {
      if (!(await confirmDialog('Release these stands back to stock? The order will be cancelled.', { okLabel: 'Release', danger: true }))) return;
      app.act((s) => releaseReservation(s, params[0]), 'Reservation released');
    },
  },
  forms: {
    pay(form, { app, params }) {
      const d = formData(form);
      const p = app.act((s) => addPayment(s, params[0], { amount: toNumber(d.amount), method: d.method, reference: d.reference }));
      if (p) {
        const o = app.state.orders.find((x) => x.id === params[0]);
        toast(paymentStatus(o) === 'paid' ? `Fully paid! ${o.quantity} stand(s) count towards the target.` : `Payment recorded. ${formatRand(orderBalance(o))} still due.`);
      }
    },
    terms(form, { app, params }) {
      const d = formData(form);
      app.act(
        (s) =>
          updateOrderTerms(s, params[0], {
            quantity: Math.floor(toNumber(d.quantity)),
            unitPrice: toNumber(d.unitPrice),
            discount: toNumber(d.discount),
            belowMinReason: d.belowMinReason,
            notes: d.notes,
          }),
        'Order updated'
      );
    },
    async cancel(form, { app, params }) {
      const d = formData(form);
      if (!(await confirmDialog('Cancel this order and return its stands to stock?', { okLabel: 'Cancel order', danger: true }))) return;
      app.act((s) => cancelOrder(s, params[0], { reason: d.reason, refundNote: d.refundNote }), 'Order cancelled; stands released');
    },
  },
};

function isDeliveredUnpaid(o) {
  return o.delivery?.status === 'delivered' && paymentStatus(o) !== 'paid';
}
