// Five-minute personalisation workflow for an order's stands.

import { PERSO_STEPS } from '../domain/constants.js';
import { PERSO_STATUS_LABEL, persoStatus } from '../domain/inventory.js';
import { checkReviewUrl, mapsSearchLink, writeReviewUrl } from '../domain/templates.js';
import { formatDateTime } from '../domain/util.js';
import { formData, html, options, showError, toast, href, raw } from '../ui.js';

let timer = null;

function elapsed(p) {
  if (!p.startedAt) return 0;
  const end = p.completedAt ? new Date(p.completedAt) : new Date();
  return Math.max(0, Math.floor((end - new Date(p.startedAt)) / 1000));
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function drawQR(canvas, text, scale = 8) {
  if (typeof window.qrcode !== 'function' || !text) return false;
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = (n + quiet * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  return true;
}

export default {
  title: 'Personalise',
  render({ state, params }) {
    const o = state.orders.find((x) => x.id === params[0]);
    if (!o) return html`<p>Order not found. <a href="#/orders">Back</a></p>`;
    if (o.status !== 'active') return html`<p>This order is cancelled. <a href="#/order/${o.id}">Back</a></p>`;
    const lead = state.leads.find((l) => l.id === o.leadId);
    const p = o.personalisation;
    const st = persoStatus(p);
    const check = checkReviewUrl(p.reviewUrl);
    const target = (state.settings.personalisationMinutes || 5) * 60;
    const secs = elapsed(p);
    const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

    return html`
      <div class="page-head">
        <div><h1>Personalise · ${lead?.name}</h1><small>${o.quantity} stand(s): ${o.unitIds.join(', ')}</small></div>
        <a class="btn" href="#/order/${o.id}">Back to order</a>
      </div>

      <section class="card row between">
        <div>
          <div class="timer ${secs > target ? 'over' : ''}" id="timer" aria-live="off">${mmss(secs)}</div>
          <small>Target ${mmss(target)} per stand · ${PERSO_STATUS_LABEL[st]}${p.completedAt ? ` · finished ${formatDateTime(p.completedAt)}` : ''}</small>
        </div>
        ${p.startedAt && !p.completedAt
          ? html`<button class="btn" data-action="resetTimer">Reset timer</button>`
          : p.completedAt
            ? html`<button class="btn ghost" data-action="resetTimer">Restart timer</button>`
            : html`<button class="btn primary" data-action="startTimer">Start timer</button>`}
      </section>

      <div class="notice warn" style="margin-top:12px"><strong>Never ask for a Google account password</strong>, and never promise a number of reviews or a better rating. Don't suggest rewards for reviews; Google doesn't allow it.</div>

      <section class="card stack" style="margin-top:12px">
        <h2>1. Google review link</h2>
        <form data-form="link" class="stack">
          <label class="field"><span>Review link</span><input name="reviewUrl" value="${p.reviewUrl}" inputmode="url" placeholder="https://g.page/r/…/review" data-input="checkUrl" /></label>
          <div id="url-check" class="notice ${check.level === 'ok' ? 'ok' : check.level === 'warn' ? 'warn' : 'danger'}">${check.message}</div>
          <label class="field"><span>Where did the link come from?</span><select name="reviewUrlSource">${options(
            [
              { value: 'customer', label: 'Customer supplied it (from their Google Business Profile → "Ask for reviews")' },
              { value: 'researched', label: 'I found it myself from their public listing' },
            ],
            p.reviewUrlSource,
            { empty: 'Choose…' }
          )}</select></label>
          <div class="row end"><button class="btn primary">Save link</button></div>
        </form>
        <details><summary>How to find the link without the customer's login</summary>
          <div class="stack" style="margin-top:8px">
            <p><strong>Best:</strong> the owner opens their Google Business Profile (Google Maps app or business.google.com) → <em>Ask for reviews</em> → copies the link and WhatsApps it to you.</p>
            <p><strong>Or build it from the Place ID:</strong> look the business up in Google's free <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder" target="_blank" rel="noopener">Place ID Finder</a>, copy its Place ID (starts with "ChIJ…") and paste it here:</p>
            <form data-form="placeId" class="row">
              <input name="placeId" class="grow" placeholder="ChIJ…" style="flex:1 1 200px" />
              <button class="btn">Build link</button>
            </form>
            <p><a href="${mapsSearchLink(lead || {})}" target="_blank" rel="noopener">Find ${lead?.name} on Google Maps</a> to check you have the right business.</p>
          </div>
        </details>
        ${p.reviewUrl ? html`<a class="btn" href="${href(p.reviewUrl)}" target="_blank" rel="noopener">Open link to check it</a>` : ''}
      </section>

      <section class="card stack" style="margin-top:12px">
        <h2>2. Logo &amp; branding</h2>
        <form data-form="logo" class="form-grid">
          <label class="field"><span>Logo source</span><select name="logoSource">${options(
            [
              { value: 'customer', label: 'Customer supplied' },
              { value: 'researched', label: 'Taken from their website / social media' },
              { value: 'none', label: 'No logo – name only' },
            ],
            p.logoSource,
            { empty: 'Choose…' }
          )}</select></label>
          <label class="field"><span>Notes</span><input name="logoNote" value="${p.logoNote}" placeholder="File name, colours, where it's saved" /></label>
          <div class="row end full"><button class="btn">Save</button></div>
        </form>
      </section>

      <section class="card stack" style="margin-top:12px">
        <h2>3. QR code &amp; NFC</h2>
        ${check.level === 'bad'
          ? html`<p class="muted">Add a valid review link first.</p>`
          : html`<div class="qr-wrap">
              <canvas id="qr" width="180" height="180" aria-label="QR code for the review link"></canvas>
              <div class="stack">
                <button class="btn" data-action="downloadQR">Download QR (PNG)</button>
                ${nfcSupported
                  ? html`<button class="btn primary" data-action="writeNFC">Write link to NFC tag</button>
                      <small>Beta: uses Chrome on Android's Web NFC. Hold the stand's tag to the back of the phone after tapping. Not yet tested on the real stands – always test the tap afterwards.</small>`
                  : html`<small>To program the NFC tag, use a tag-writing app (e.g. "NFC Tools") and write a URL record with the review link above. (This browser can't write NFC directly; Chrome on Android can.)</small>`}
              </div>
            </div>`}
      </section>

      <section class="card stack" style="margin-top:12px">
        <h2>4. Checklist</h2>
        ${PERSO_STEPS.map(
          (s) => html`<label class="check"><input type="checkbox" data-change="step" data-key="${s.key}" ${raw(p.steps?.[s.key] ? 'checked' : '')} /><span>${s.label}${s.group === 'test' ? html` <small>(test)</small>` : ''}</span></label>`
        )}
        <p class="muted">"Configured &amp; tested" needs all set-up steps, one tap test (Android or iPhone) and the QR test. If you only have one phone type, test with what you have and note it.</p>
        <form data-form="notes" class="stack">
          <label class="field"><span>Setup / test notes</span><textarea name="notes" rows="3">${p.notes}</textarea></label>
          <div class="row end"><button class="btn">Save notes</button></div>
        </form>
      </section>
    `;
  },
  mount(root, { state, params }) {
    const o = state.orders.find((x) => x.id === params[0]);
    if (!o) return;
    const canvas = root.querySelector('#qr');
    if (canvas && o.personalisation.reviewUrl) drawQR(canvas, o.personalisation.reviewUrl, 8);
    clearInterval(timer);
    if (o.personalisation.startedAt && !o.personalisation.completedAt) {
      const target = (state.settings.personalisationMinutes || 5) * 60;
      timer = setInterval(() => {
        const el = document.getElementById('timer');
        if (!el) return clearInterval(timer);
        const s = elapsed(o.personalisation);
        el.textContent = mmss(s);
        el.classList.toggle('over', s > target);
      }, 1000);
    }
  },
  unmount() {
    clearInterval(timer);
  },
  inputs: {
    checkUrl(el) {
      const c = checkReviewUrl(el.value);
      const box = document.getElementById('url-check');
      box.textContent = c.message;
      box.className = `notice ${c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'danger'}`;
    },
  },
  changes: {
    step(el, { app, params }) {
      update(app, params[0], (p) => {
        p.steps[el.dataset.key] = el.checked;
        if (!p.startedAt && el.checked) p.startedAt = new Date().toISOString();
      });
    },
  },
  actions: {
    startTimer(el, { app, params }) {
      update(app, params[0], (p) => {
        p.startedAt = new Date().toISOString();
        p.completedAt = '';
      });
    },
    resetTimer(el, { app, params }) {
      update(app, params[0], (p) => {
        p.startedAt = new Date().toISOString();
        p.completedAt = '';
      });
    },
    downloadQR(el, { state, params }) {
      const o = state.orders.find((x) => x.id === params[0]);
      const lead = state.leads.find((l) => l.id === o.leadId);
      const c = document.createElement('canvas');
      if (!drawQR(c, o.personalisation.reviewUrl, 24)) return showError(new Error('QR library not loaded.'));
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `${(lead?.name || 'review').replace(/[^\w]+/g, '-').toLowerCase()}-review-qr.png`;
      a.click();
    },
    async writeNFC(el, { app, params, state }) {
      const o = state.orders.find((x) => x.id === params[0]);
      try {
        const writer = new window.NDEFReader();
        toast('Hold the NFC tag to the back of your phone…', { type: 'info' });
        await writer.write({ records: [{ recordType: 'url', data: o.personalisation.reviewUrl }] });
        update(app, params[0], (p) => {
          p.steps.nfcWritten = true;
        });
        toast('NFC tag written. Now test it with a tap.');
      } catch (e) {
        showError(new Error(`NFC write failed: ${e.message || e}`));
      }
    },
  },
  forms: {
    link(form, { app, params }) {
      const d = formData(form);
      update(
        app,
        params[0],
        (p, s, o) => {
          p.reviewUrl = d.reviewUrl;
          p.reviewUrlSource = d.reviewUrlSource;
          if (!p.startedAt) p.startedAt = new Date().toISOString();
          const lead = s.leads.find((l) => l.id === o.leadId);
          if (lead && d.reviewUrl) {
            lead.reviewUrl = d.reviewUrl;
            lead.reviewUrlSource = d.reviewUrlSource;
          }
        },
        'Review link saved'
      );
    },
    placeId(form) {
      const id = new FormData(form).get('placeId');
      const url = writeReviewUrl(id);
      if (!url) return;
      const input = document.querySelector('input[name=reviewUrl]');
      input.value = url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast('Link built. Check it opens the right business, then Save.');
    },
    logo(form, { app, params }) {
      const d = formData(form);
      update(app, params[0], (p) => Object.assign(p, { logoSource: d.logoSource, logoNote: d.logoNote }), 'Saved');
    },
    notes(form, { app, params }) {
      const d = formData(form);
      update(app, params[0], (p) => (p.notes = d.notes), 'Notes saved');
    },
  },
};

function update(app, orderId, fn, msg) {
  app.act((s) => {
    const o = s.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'active') throw new Error('Order not found or cancelled.');
    fn(o.personalisation, s, o);
    const st = persoStatus(o.personalisation);
    if (st === 'tested' && !o.personalisation.completedAt) o.personalisation.completedAt = new Date().toISOString();
    if (st !== 'tested') o.personalisation.completedAt = '';
  }, msg);
}
