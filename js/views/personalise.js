// Stand setup: record the customer's Google review link, branding, and whether the stand is ready.

import { PERSO_STATUS_LABEL, persoStatus, updateSetup } from '../domain/inventory.js';
import { checkReviewUrl, mapsSearchLink, writeReviewUrl } from '../domain/templates.js';
import { formatDateTime } from '../domain/util.js';
import { formData, href, html, options, raw, toast } from '../ui.js';

const levelClass = (c) => (c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'danger');

export default {
  title: 'Stand setup',
  render({ state, params }) {
    const o = state.orders.find((x) => x.id === params[0]);
    if (!o) return html`<p>Order not found. <a href="#/orders">Back</a></p>`;
    if (o.status !== 'active') return html`<p>This order is cancelled. <a href="#/order/${o.id}">Back</a></p>`;
    const lead = state.leads.find((l) => l.id === o.leadId) || {};
    const p = o.personalisation;
    const check = checkReviewUrl(p.reviewUrl);

    return html`
      <div class="page-head">
        <div><h1>Stand setup · ${lead.name}</h1><small>${o.quantity} stand(s): ${o.unitIds.join(', ')} · ${PERSO_STATUS_LABEL[persoStatus(p)]}${p.ready && p.readyAt ? ` ${formatDateTime(p.readyAt)}` : ''}</small></div>
        <a class="btn" href="#/order/${o.id}">Back to order</a>
      </div>

      <div class="notice warn"><strong>Never ask for a Google account password</strong>, and never promise a number of reviews or a better rating.</div>

      <form data-form="save" class="stack" style="margin-top:12px">
        <fieldset class="stack">
          <legend>Google review link</legend>
          <label class="field"><span>Review link</span><input name="reviewUrl" value="${p.reviewUrl}" inputmode="url" placeholder="https://g.page/r/…/review" data-input="checkUrl" /></label>
          <div id="url-check" class="notice ${levelClass(check)}">${check.message}</div>
          <label class="field"><span>Where did the link come from?</span><select name="reviewUrlSource">${options(
            [
              { value: 'customer', label: 'Customer supplied it' },
              { value: 'researched', label: 'I found it from their public listing' },
            ],
            p.reviewUrlSource,
            { empty: 'Choose…' }
          )}</select></label>
          ${p.reviewUrl ? html`<a class="btn" href="${href(p.reviewUrl)}" target="_blank" rel="noopener">Open link to check it's the right business</a>` : ''}
        </fieldset>

        <fieldset class="form-grid">
          <legend>Branding</legend>
          <label class="field"><span>Logo / branding source</span><select name="logoSource">${options(
            [
              { value: 'customer', label: 'Customer supplied' },
              { value: 'researched', label: 'Taken from their website / social media' },
              { value: 'none', label: 'No logo – name only' },
            ],
            p.logoSource,
            { empty: 'Choose…' }
          )}</select></label>
          <label class="field"><span>Branding notes</span><input name="logoNote" value="${p.logoNote}" placeholder="File name, colours, where it's saved" /></label>
        </fieldset>

        <fieldset class="stack">
          <legend>Ready?</legend>
          <label class="check"><input type="checkbox" name="ready" value="1" ${raw(p.ready ? 'checked' : '')} /><span>Stand is ready: link programmed and tested, branding applied</span></label>
          <label class="field"><span>Notes</span><textarea name="notes" rows="3">${p.notes}</textarea></label>
        </fieldset>

        <div class="row end"><button class="btn primary">Save</button></div>
      </form>

      <details class="card" style="margin-top:12px"><summary>How to find the review link without the customer's login</summary>
        <div class="stack" style="margin-top:8px">
          <p><strong>Best:</strong> the owner opens their Google Business Profile (Google Maps app or business.google.com) → <em>Ask for reviews</em> → copies the link and sends it to you.</p>
          ${lead.placeId
            ? html`<p>This lead has a Google Place ID, so the review link can be built from it:</p>
                <button type="button" class="btn" data-action="fromPlaceId" data-place="${lead.placeId}">Use review link from Place ID</button>`
            : html`<p><strong>Or build it from the Place ID:</strong> find the business in Google's free <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder" target="_blank" rel="noopener">Place ID Finder</a>, copy its Place ID (starts with "ChIJ…") and paste it here:</p>
                <form data-form="placeId" class="row"><input name="placeId" placeholder="ChIJ…" style="flex:1 1 200px" /><button class="btn">Build link</button></form>`}
          <p><a href="${mapsSearchLink(lead)}" target="_blank" rel="noopener">Find ${lead.name} on Google Maps</a> to check you have the right business.</p>
        </div>
      </details>
    `;
  },
  inputs: {
    checkUrl(el) {
      const c = checkReviewUrl(el.value);
      const box = document.getElementById('url-check');
      box.textContent = c.message;
      box.className = `notice ${levelClass(c)}`;
    },
  },
  forms: {
    save(form, { app, params }) {
      const d = formData(form);
      app.act(
        (s) =>
          updateSetup(s, params[0], {
            reviewUrl: d.reviewUrl,
            reviewUrlSource: d.reviewUrlSource,
            logoSource: d.logoSource,
            logoNote: d.logoNote,
            notes: d.notes,
            ready: d.ready === '1',
          }) &&
          // Remember the link on the business record for any future order.
          rememberLink(s, params[0], d),
        'Stand setup saved'
      );
    },
    placeId(form) {
      fillLink(writeReviewUrl(new FormData(form).get('placeId')));
    },
  },
  actions: {
    fromPlaceId(el) {
      fillLink(writeReviewUrl(el.dataset.place));
    },
  },
};

function rememberLink(s, orderId, d) {
  const o = s.orders.find((x) => x.id === orderId);
  const lead = s.leads.find((l) => l.id === o.leadId);
  if (lead && d.reviewUrl) {
    lead.reviewUrl = d.reviewUrl;
    lead.reviewUrlSource = d.reviewUrlSource;
  }
  return true;
}

function fillLink(url) {
  if (!url) return;
  const input = document.querySelector('input[name=reviewUrl]');
  input.value = url;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  toast('Link filled in. Open it to check it is the right business, then Save.');
}
