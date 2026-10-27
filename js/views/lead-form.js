import { LEAD_STAGES, SCORE_CRITERIA, SCORE_LEVELS } from '../domain/constants.js';
import { findDuplicate } from '../domain/importer.js';
import { newLead, validateLead } from '../domain/leads.js';
import { parsePhone, splitPhones, toE164, formatNational } from '../domain/phone.js';
import { scoreLead } from '../domain/scoring.js';
import { toNumber } from '../domain/util.js';
import { areaOptions, categoryOptions, confirmDialog, formData, html, options, raw, showError, toast } from '../ui.js';

const levelValue = (v) => (v === null || v === undefined ? '' : String(v));

export default {
  title: ({ params }) => (params[0] ? 'Edit lead' : 'New lead'),
  render({ state, params }) {
    const existing = params[0] ? state.leads.find((l) => l.id === params[0]) : null;
    if (params[0] && !existing) return html`<p>Lead not found. <a href="#/leads">Back to leads</a></p>`;
    const l = existing || newLead();
    const w = state.settings.scoringWeights;
    const sc = scoreLead(l, w);
    const phonesText = l.phones.map((p) => p.raw).join('\n');
    return html`
      <div class="page-head">
        <h1>${existing ? `Edit ${l.name}` : 'New lead'}</h1>
        <a class="btn ghost" href="${existing ? `#/lead/${l.id}` : '#/leads'}">Cancel</a>
      </div>
      <form data-form="save" class="stack" novalidate>
        <fieldset class="form-grid">
          <legend>Business</legend>
          <label class="field full"><span>Business name *</span><input name="name" required value="${l.name}" autocomplete="off" /></label>
          <label class="field"><span>Category</span><select name="category">${categoryOptions(l.category)}</select></label>
          <label class="field"><span>Town / area</span><select name="area">${areaOptions(l.area)}</select></label>
          <label class="field"><span>Suburb</span><input name="suburb" value="${l.suburb}" placeholder="e.g. Walmer, Summerstrand" /></label>
          <label class="field full"><span>Address</span><input name="address" value="${l.address}" placeholder="Street address (used for directions)" /></label>
          <label class="field"><span>Website</span><input name="website" value="${l.website}" inputmode="url" /></label>
          <label class="field"><span>Google Maps link</span><input name="mapsUrl" value="${l.mapsUrl}" inputmode="url" /></label>
          <label class="field"><span>Google rating</span><input name="googleRating" value="${l.googleRating ?? ''}" inputmode="decimal" placeholder="Unknown" /></label>
          <label class="field"><span>Google review count</span><input name="googleReviewCount" value="${l.googleReviewCount ?? ''}" inputmode="numeric" placeholder="Unknown" /></label>
          <label class="field full"><span>Google review link</span><input name="reviewUrl" value="${l.reviewUrl}" inputmode="url" placeholder="https://g.page/r/…/review" /></label>
          <label class="field"><span>Review link source</span><select name="reviewUrlSource">${options(
            [
              { value: 'customer', label: 'Supplied by customer' },
              { value: 'researched', label: 'Researched by me' },
            ],
            l.reviewUrlSource,
            { empty: '—' }
          )}</select></label>
        </fieldset>

        <fieldset class="form-grid">
          <legend>Contact</legend>
          <label class="field full"><span>Phone numbers (one per line)</span>
            <textarea name="phones" rows="2" style="min-height:64px" placeholder="041 123 4567&#10;082 123 4567">${phonesText}</textarea>
            <small>Mobile/landline is detected from the number prefix.</small></label>
          <label class="field"><span>WhatsApp number (if different)</span><input name="whatsapp" value="${l.whatsapp ? formatNational(l.whatsapp) : ''}" inputmode="tel" /></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${l.email}" /></label>
          <label class="field"><span>Owner / decision-maker</span><input name="contactName" value="${l.contactName}" /></label>
          <label class="field"><span>Their role</span><input name="contactRole" value="${l.contactRole}" placeholder="Owner, manager…" /></label>
          <label class="field"><span>Is this the decision-maker?</span><select name="decisionMaker">${options(
            [
              { value: 'unknown', label: 'Unknown' },
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
            l.decisionMaker
          )}</select></label>
          <label class="field"><span>Gatekeeper name</span><input name="gatekeeperName" value="${l.gatekeeperName}" placeholder="Receptionist, staff member…" /></label>
          <label class="field full"><span>Gatekeeper notes</span><input name="gatekeeperNotes" value="${l.gatekeeperNotes}" placeholder="e.g. Owner in on Tue/Thu mornings" /></label>
          <label class="field"><span>Best time to reach</span><input name="bestTime" value="${l.bestTime}" placeholder="e.g. weekdays before 10:00" /></label>
          <label class="field"><span>Possible number of stands</span><input name="potentialStands" value="${l.potentialStands ?? ''}" inputmode="numeric" placeholder="Unknown" /></label>
        </fieldset>

        <fieldset>
          <legend>Lead score <span class="muted">(currently ${sc.score}/100, ${sc.knownPct}% known)</span></legend>
          <p class="muted">Rate only what you have evidence for and note the evidence. Leave as Unknown if you don't know. A business with few reviews is not automatically a strong prospect.</p>
          ${SCORE_CRITERIA.map(
            (c) => html`<div class="form-grid" style="margin-top:10px">
              <label class="field"><span>${c.label} (${w[c.key]} pts)</span>
                <select name="score_${c.key}">${options(
                  SCORE_LEVELS.map((lv) => ({ value: levelValue(lv.value), label: lv.label })),
                  levelValue(l.scores?.[c.key]?.level)
                )}</select>
                <small>${c.hint}</small></label>
              <label class="field"><span>Evidence</span><input name="evidence_${c.key}" value="${l.scores?.[c.key]?.evidence || ''}" placeholder="What did you see or hear?" /></label>
            </div>`
          )}
        </fieldset>

        <fieldset class="form-grid">
          <legend>Status</legend>
          <label class="field"><span>Stage</span><select name="stage">${options(
            LEAD_STAGES.map((s) => ({ value: s.id, label: s.label })),
            l.stage
          )}</select><small>Order stages (unpaid, paid, delivered) are set automatically from orders.</small></label>
          <label class="field"><span>Next action</span><input name="nextAction" value="${l.nextAction}" placeholder="e.g. Drop flyer, call owner Thu" /></label>
          <label class="field full"><span>Notes</span><textarea name="notes">${l.notes}</textarea></label>
        </fieldset>

        <div class="row end">
          <a class="btn ghost" href="${existing ? `#/lead/${l.id}` : '#/leads'}">Cancel</a>
          <button class="btn primary" type="submit">${raw(existing ? 'Save changes' : 'Add lead')}</button>
        </div>
      </form>`;
  },
  forms: {
    async save(form, { app, params }) {
      const d = formData(form);
      const id = params[0];
      const before = id ? app.state.leads.find((l) => l.id === id) : null;
      const priorPhones = new Map((before?.phones || []).map((p) => [p.e164 || p.raw, p]));
      const phones = splitPhones(d.phones.replace(/\n/g, ' / ')).map((r) => {
        const p = parsePhone(r);
        const prior = priorPhones.get(p.e164 || p.raw);
        return prior?.invalid ? { ...p, invalid: true } : p;
      });
      const unparsed = d.phones.split('\n').map((x) => x.trim()).filter(Boolean).filter((x) => !toE164(x));
      const scores = {};
      for (const c of SCORE_CRITERIA) {
        const v = d[`score_${c.key}`];
        scores[c.key] = { level: v === '' ? null : Number(v), evidence: d[`evidence_${c.key}`] || '' };
      }
      const num = (v) => (v === '' ? null : toNumber(v, null));
      const fields = {
        name: d.name,
        category: d.category,
        area: d.area,
        suburb: d.suburb,
        address: d.address,
        website: d.website,
        mapsUrl: d.mapsUrl,
        googleRating: num(d.googleRating),
        googleReviewCount: num(d.googleReviewCount),
        reviewUrl: d.reviewUrl,
        reviewUrlSource: d.reviewUrlSource,
        phones,
        whatsapp: toE164(d.whatsapp) || '',
        email: d.email,
        contactName: d.contactName,
        contactRole: d.contactRole,
        decisionMaker: d.decisionMaker,
        gatekeeperName: d.gatekeeperName,
        gatekeeperNotes: d.gatekeeperNotes,
        bestTime: d.bestTime,
        potentialStands: num(d.potentialStands),
        scores,
        stage: d.stage,
        nextAction: d.nextAction,
        notes: d.notes,
      };
      try {
        validateLead(fields);
      } catch (e) {
        return showError(e);
      }
      if (d.whatsapp && !fields.whatsapp) return showError(new Error("The WhatsApp number isn't a valid South African number."));
      if (unparsed.length) toast(`Kept as unknown type: ${unparsed.join(', ')}`, { type: 'info' });

      if (!id) {
        const draft = newLead(fields);
        const dup = findDuplicate(draft, app.state.leads);
        if (dup && !(await confirmDialog(`This looks like a duplicate of "${dup.name}" (${dup.area}). Add anyway?`, { okLabel: 'Add anyway' }))) return;
        const created = app.act((s) => {
          s.leads.push(draft);
          return draft;
        }, 'Lead added');
        if (created) app.navigate(`#/lead/${created.id}`);
      } else {
        const ok = app.act((s) => {
          const l = s.leads.find((x) => x.id === id);
          if (!l) throw new Error('Lead not found.');
          Object.assign(l, fields, { updatedAt: new Date().toISOString() });
          return true;
        }, 'Saved');
        if (ok) app.navigate(`#/lead/${id}`);
      }
    },
  },
};
