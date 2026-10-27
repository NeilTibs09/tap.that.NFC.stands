import { CATEGORIES, DEFAULT_SETTINGS, SCORE_CRITERIA } from '../domain/constants.js';
import { syncUnitCount } from '../domain/inventory.js';
import { weightsTotal } from '../domain/scoring.js';
import { ValidationError, toNumber } from '../domain/util.js';
import { confirmDialog, formData, html } from '../ui.js';

const TEMPLATE_LABELS = {
  whatsappIntro: 'WhatsApp – first message',
  whatsappFollowUp1: 'WhatsApp – follow-up 1',
  whatsappFollowUp2: 'WhatsApp – follow-up 2',
  whatsappFollowUp3: 'WhatsApp – follow-up 3 (final)',
  whatsappEngaged: 'WhatsApp – interested / asked to be contacted',
  emailSubject: 'Email subject',
  emailBody: 'Email body',
};

export default {
  title: 'Settings',
  render({ state }) {
    const s = state.settings;
    const num = (name, label, value, hint = '') =>
      html`<label class="field"><span>${label}</span><input name="${name}" inputmode="decimal" value="${value}" />${hint ? html`<small>${hint}</small>` : ''}</label>`;
    return html`
      <div class="page-head"><h1>Settings</h1></div>
      <form data-form="save" class="stack">
        <fieldset class="form-grid">
          <legend>You (used in message drafts)</legend>
          <label class="field"><span>Your name</span><input name="seller.name" value="${s.seller.name}" placeholder="e.g. Neil" /></label>
          <label class="field"><span>Your phone</span><input name="seller.phone" value="${s.seller.phone}" inputmode="tel" /></label>
          <label class="field"><span>Your email</span><input name="seller.email" value="${s.seller.email}" type="email" /></label>
        </fieldset>

        <fieldset class="form-grid">
          <legend>Campaign</legend>
          <label class="field full"><span>Name</span><input name="campaignName" value="${s.campaignName}" /></label>
          <label class="field"><span>Start</span><input type="date" name="startDate" value="${s.startDate}" /></label>
          <label class="field"><span>Sales deadline</span><input type="date" name="endDate" value="${s.endDate}" /></label>
          <label class="field"><span>Stock arrives</span><input type="date" name="stockArrivalDate" value="${s.stockArrivalDate}" /></label>
          ${num('inventoryCount', 'Stands in stock', s.inventoryCount, "Can't go below stands already in orders.")}
          ${num('minPrice', 'Minimum price per stand (R)', s.minPrice)}
          ${num('defaultPrice', 'Default selling price (R)', s.defaultPrice)}
          ${num('inventoryCost', 'Total stock cost (R)', s.inventoryCost)}
          ${num('reservationHours', 'Hold unpaid orders for (hours)', s.reservationHours)}
          ${num('maxFollowUps', 'Follow-ups after first contact', s.maxFollowUps, 'Brief says 3.')}
        </fieldset>

        <fieldset class="form-grid">
          <legend>Daily targets</legend>
          ${num('dailyTargets.calls', 'Calls', s.dailyTargets.calls)}
          ${num('dailyTargets.whatsapp', 'Personal WhatsApps', s.dailyTargets.whatsapp)}
          ${num('dailyTargets.emails', 'Emails', s.dailyTargets.emails)}
          ${num('dailyTargets.visits', 'Visits (up to)', s.dailyTargets.visits)}
        </fieldset>

        <fieldset class="form-grid">
          <legend>Score weights (must total 100; now ${weightsTotal(s.scoringWeights)})</legend>
          ${SCORE_CRITERIA.map((c) => num(`scoringWeights.${c.key}`, c.label, s.scoringWeights[c.key]))}
        </fieldset>

        <fieldset>
          <legend>Calling windows by category</legend>
          <p class="muted">Starting guesses for when owners are free to talk. Adjust as you learn. The call list puts businesses in their window first.</p>
          ${CATEGORIES.map(
            (c) => html`<div class="form-grid" style="margin-top:8px">
              <strong class="full">${c.label}</strong>
              <label class="field"><span>Morning from</span><input type="time" name="cw.${c.id}.morning.0" value="${s.callWindows[c.id]?.morning?.[0] || ''}" /></label>
              <label class="field"><span>to</span><input type="time" name="cw.${c.id}.morning.1" value="${s.callWindows[c.id]?.morning?.[1] || ''}" /></label>
              <label class="field"><span>Afternoon from</span><input type="time" name="cw.${c.id}.afternoon.0" value="${s.callWindows[c.id]?.afternoon?.[0] || ''}" /></label>
              <label class="field"><span>to</span><input type="time" name="cw.${c.id}.afternoon.1" value="${s.callWindows[c.id]?.afternoon?.[1] || ''}" /></label>
            </div>`
          )}
        </fieldset>

        <fieldset class="stack">
          <legend>Message templates</legend>
          <p class="muted">Placeholders: {firstName} {business} {area} {seller} {sellerPhone} {price} {categoryLine}. Keep the opt-out line in first messages.</p>
          ${Object.entries(TEMPLATE_LABELS).map(
            ([k, label]) => html`<label class="field"><span>${label}</span>${k === 'emailSubject'
              ? html`<input name="tpl.${k}" value="${s.templates[k]}" />`
              : html`<textarea name="tpl.${k}" rows="5">${s.templates[k]}</textarea>`}</label>`
          )}
          <h3>Category line ({categoryLine})</h3>
          ${CATEGORIES.map((c) => html`<label class="field"><span>${c.label}</span><textarea name="cl.${c.id}" rows="2" style="min-height:60px">${s.categoryLines[c.id]}</textarea></label>`)}
        </fieldset>

        <div class="row end" style="position:sticky;bottom:calc(var(--nav-h) + 8px)">
          <button type="button" class="btn ghost" data-action="resetTemplates">Restore default templates</button>
          <button class="btn primary">Save settings</button>
        </div>
      </form>`;
  },
  forms: {
    save(form, { app }) {
      const d = formData(form);
      app.act((st) => {
        const s = st.settings;
        const n = (k, { min = 0, int = false } = {}) => {
          const v = toNumber(d[k], NaN);
          if (!Number.isFinite(v) || v < min) throw new ValidationError(`Check the value for "${k}".`);
          return int ? Math.round(v) : v;
        };
        s.seller = { name: d['seller.name'], phone: d['seller.phone'], email: d['seller.email'] };
        s.campaignName = d.campaignName;
        for (const k of ['startDate', 'endDate', 'stockArrivalDate']) if (d[k]) s[k] = d[k];
        if (s.endDate < s.startDate) throw new ValidationError('The deadline must be after the start date.');
        s.minPrice = n('minPrice', { min: 1 });
        s.defaultPrice = n('defaultPrice', { min: 1 });
        if (s.defaultPrice < s.minPrice) throw new ValidationError('Default price is below the minimum price.');
        s.inventoryCost = n('inventoryCost');
        s.reservationHours = n('reservationHours', { min: 1 });
        s.maxFollowUps = n('maxFollowUps', { int: true });
        for (const k of ['calls', 'whatsapp', 'emails', 'visits']) s.dailyTargets[k] = n(`dailyTargets.${k}`, { int: true });
        const weights = {};
        for (const c of SCORE_CRITERIA) weights[c.key] = n(`scoringWeights.${c.key}`);
        if (Math.round(weightsTotal(weights)) !== 100) throw new ValidationError(`Score weights add up to ${weightsTotal(weights)}, not 100.`);
        s.scoringWeights = weights;
        for (const c of CATEGORIES) {
          const t = (sess, i) => d[`cw.${c.id}.${sess}.${i}`] || '';
          s.callWindows[c.id] = { morning: [t('morning', 0), t('morning', 1)], afternoon: [t('afternoon', 0), t('afternoon', 1)] };
          s.categoryLines[c.id] = d[`cl.${c.id}`];
        }
        for (const k of Object.keys(TEMPLATE_LABELS)) s.templates[k] = d[`tpl.${k}`];
        syncUnitCount(st, n('inventoryCount', { int: true }));
      }, 'Settings saved');
    },
  },
  actions: {
    async resetTemplates(el, { app }) {
      if (!(await confirmDialog('Replace all message templates and category lines with the defaults?', { okLabel: 'Restore' }))) return;
      app.act((st) => {
        st.settings.templates = structuredClone(DEFAULT_SETTINGS.templates);
        st.settings.categoryLines = structuredClone(DEFAULT_SETTINGS.categoryLines);
      }, 'Templates restored');
    },
  },
};
