import { PAYMENT_METHODS } from '../domain/constants.js';
import { addPayment, availableUnits, createOrder } from '../domain/inventory.js';
import { formatDateTime, formatRand, roundMoney, toNumber } from '../domain/util.js';
import { formData, html, options, showError, toast } from '../ui.js';

function calc(form, settings) {
  const q = Math.max(0, Math.floor(toNumber(form.quantity.value)));
  const p = toNumber(form.unitPrice.value);
  const d = toNumber(form.discount.value);
  const total = roundMoney(q * p - d);
  const net = q ? roundMoney(total / q) : 0;
  return { q, p, d, total, net, below: q > 0 && net + 0.005 < settings.minPrice };
}

export default {
  title: 'New order',
  render({ state, query, now }) {
    const s = state.settings;
    const free = availableUnits(state);
    const leadId = query.get('lead') || '';
    const leads = [...state.leads]
      .filter((l) => l.stage !== 'opted_out' || l.id === leadId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id, label: `${l.name} (${l.area})` }));
    const hold = Number(s.reservationHours) || 48;
    if (!free.length) {
      return html`<div class="page-head"><h1>New order</h1></div>
        <div class="card warn stack"><h2>No stands available</h2>
        <p>All ${state.units.length} stands are allocated. Release an expired or cancelled reservation on the <a href="#/orders">Orders</a> page, or raise the inventory count in <a href="#/settings">Settings</a> if you have more stock.</p></div>`;
    }
    return html`
      <div class="page-head"><h1>New order</h1><a class="btn ghost" href="${leadId ? `#/lead/${leadId}` : '#/orders'}">Cancel</a></div>
      <form data-form="create" class="stack" novalidate>
        <fieldset class="form-grid">
          <legend>Order</legend>
          <label class="field full"><span>Customer</span><select name="leadId" required>${options(leads, leadId, { empty: 'Choose a business…' })}</select>
            <small>Not in the list? <a href="#/lead/new">Add the business first</a>.</small></label>
          <label class="field"><span>Quantity (${free.length} available)</span><input name="quantity" type="number" min="1" max="${free.length}" step="1" value="1" required data-input="calc" /></label>
          <label class="field"><span>Price per stand (R)</span><input name="unitPrice" inputmode="decimal" value="${s.defaultPrice}" required data-input="calc" /></label>
          <label class="field"><span>Discount on the order (R)</span><input name="discount" inputmode="decimal" value="0" data-input="calc" /></label>
          <div class="field full"><div id="calc" class="notice"></div></div>
          <label class="field full" id="below-min" hidden><span>Reason for selling below ${formatRand(s.minPrice)} per stand *</span><input name="belowMinReason" placeholder="e.g. 3-stand bundle agreed" /></label>
          <label class="field full"><span>Notes</span><input name="notes" placeholder="Delivery details, branding requests…" /></label>
        </fieldset>
        <fieldset class="form-grid">
          <legend>Payment now (optional)</legend>
          <label class="field"><span>Amount received (R)</span><input name="payAmount" inputmode="decimal" placeholder="0" /></label>
          <label class="field"><span>Method</span><select name="payMethod">${options(PAYMENT_METHODS, 'Cash')}</select></label>
          <label class="field"><span>Reference</span><input name="payRef" placeholder="EFT ref, SnapScan ID…" /></label>
        </fieldset>
        <p class="muted">Stands are reserved for this order straight away. Unpaid reservations are held ${hold} hours (until about ${formatDateTime(new Date(now.getTime() + hold * 3600000).toISOString())}, never past the deadline), then flagged for release.</p>
        <div class="row end"><button class="btn primary" type="submit">Reserve stands &amp; create order</button></div>
      </form>`;
  },
  mount(root, { state }) {
    const form = root.querySelector('form[data-form=create]');
    if (form) update(form, state.settings);
  },
  inputs: {
    calc(el, { state }) {
      update(el.form, state.settings);
    },
  },
  forms: {
    create(form, { app }) {
      const d = formData(form);
      const payAmount = toNumber(d.payAmount);
      const order = app.act((s) => {
        const o = createOrder(s, {
          leadId: d.leadId,
          quantity: Math.floor(toNumber(d.quantity)),
          unitPrice: toNumber(d.unitPrice),
          discount: toNumber(d.discount),
          belowMinReason: d.belowMinReason,
          notes: d.notes,
        });
        if (payAmount > 0) addPayment(s, o.id, { amount: payAmount, method: d.payMethod, reference: d.payRef });
        return o;
      });
      if (order) {
        toast(`Order created: stands ${order.unitIds.join(', ')} reserved`);
        app.navigate(`#/order/${order.id}`);
      }
    },
  },
};

function update(form, settings) {
  try {
    const c = calc(form, settings);
    form.querySelector('#calc').textContent = `Total ${formatRand(c.total)} · ${formatRand(c.net)} per stand${c.below ? ` · below the ${formatRand(settings.minPrice)} minimum` : ''}`;
    form.querySelector('#calc').className = `notice ${c.below ? 'warn' : ''}`;
    form.querySelector('#below-min').hidden = !c.below;
  } catch (e) {
    showError(e);
  }
}
