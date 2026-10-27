import { category } from '../domain/constants.js';
import { toCSV } from '../domain/csv.js';
import { IMPORT_FIELDS, TEMPLATE_HEADERS, planImport } from '../domain/importer.js';
import { leadStage } from '../domain/leads.js';
import { PHONE_TYPES } from '../domain/phone.js';
import { scoreLead } from '../domain/scoring.js';
import { areaOptions, download, html, options, showError, toast } from '../ui.js';

let pending = null; // { text, mapping, defaults, fileName }

function preview(state) {
  if (!pending) return null;
  return planImport(pending.text, state.leads, pending.mapping, pending.defaults);
}

export default {
  title: 'Import leads',
  render({ state }) {
    const plan = preview(state);
    const ok = plan ? plan.items.filter((i) => !i.problems.length && !i.duplicateOf) : [];
    return html`
      <div class="page-head"><h1>Import leads</h1><a class="btn ghost" href="#/leads">Back to leads</a></div>
      <section class="card stack">
        <p>Import a CSV file (from a spreadsheet, Google Sheets "Download → CSV", or a business directory export). Columns are matched automatically and you can adjust them before importing. Nothing is saved until you press Import.</p>
        <div class="row">
          <label class="btn primary">Choose CSV file<input type="file" accept=".csv,text/csv,text/plain" data-change="file" class="sr-only" /></label>
          <button class="btn" data-action="template">Download blank template</button>
          <button class="btn" data-action="exportLeads" ${state.leads.length ? '' : 'disabled'}>Export current leads (CSV)</button>
        </div>
        <details><summary>…or paste CSV text</summary>
          <form data-form="paste" class="stack" style="margin-top:8px">
            <textarea name="text" rows="6" placeholder="Business name,Category,Phone,Address&#10;Fade Lab,Barber,082 123 4567,&quot;5 Main Rd, Walmer&quot;"></textarea>
            <div class="row end"><button class="btn">Preview</button></div>
          </form>
        </details>
        <p class="muted">Lead scores are never filled in from review counts or ratings. Rate each lead yourself once you have evidence.</p>
      </section>

      ${plan
        ? html`
        <section class="card stack" style="margin-top:12px">
          <h2>Preview${pending.fileName ? `: ${pending.fileName}` : ''}</h2>
          ${plan.errors.map((e) => html`<div class="notice danger">${e}</div>`)}
          <details ${plan.errors.length ? 'open' : ''}><summary>Column matching</summary>
            <div class="form-grid" style="margin-top:8px">
              ${IMPORT_FIELDS.map(
                (f) => html`<label class="field"><span>${f.label}</span><select data-change="map" data-field="${f.key}">${options(
                  plan.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
                  plan.mapping[f.key] === undefined ? '' : String(plan.mapping[f.key]),
                  { empty: '— not in file —' }
                )}</select></label>`
              )}
            </div>
          </details>
          <div class="form-grid">
            <label class="field"><span>Area when not detected</span><select data-change="defaultArea">${areaOptions(pending.defaults.area || 'Other')}</select></label>
          </div>
          <p><strong>${ok.length}</strong> new · ${plan.items.filter((i) => i.duplicateOf).length} duplicates skipped · ${plan.items.filter((i) => i.problems.length).length} rows with problems skipped</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Line</th><th>Business</th><th>Category</th><th>Area</th><th>Phones</th><th>Status</th></tr></thead>
            <tbody>${plan.items.slice(0, 200).map(
              (i) => html`<tr>
                <td>${i.line}</td><td>${i.lead.name || html`<em>missing</em>`}</td><td>${category(i.lead.category).short}</td><td>${i.lead.area}</td>
                <td>${i.lead.phones.map((p) => `${p.raw} (${PHONE_TYPES[p.type]})`).join(', ')}</td>
                <td>${i.problems.length ? html`<span class="chip danger">${i.problems.join(', ')}</span>` : i.duplicateOf ? html`<span class="chip warn">Duplicate of ${i.duplicateOf.name}</span>` : html`<span class="chip ok">New</span>`}</td>
              </tr>`
            )}</tbody>
          </table></div>
          ${plan.items.length > 200 ? html`<small class="muted">Showing the first 200 rows.</small>` : ''}
          <div class="row end">
            <button class="btn ghost" data-action="clear">Discard</button>
            <button class="btn primary" data-action="commit" ${ok.length && !plan.errors.length ? '' : 'disabled'}>Import ${ok.length} lead${ok.length === 1 ? '' : 's'}</button>
          </div>
        </section>`
        : ''}
    `;
  },
  changes: {
    async file(el, { app }) {
      const f = el.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) return showError(new Error('That file is over 5 MB. Split it into smaller files.'));
      const text = await f.text();
      pending = { text, mapping: null, defaults: { area: 'Other' }, fileName: f.name };
      pending.mapping = planImport(text, [], null).mapping;
      app.render();
    },
    map(el, { app }) {
      pending.mapping = { ...pending.mapping };
      if (el.value === '') delete pending.mapping[el.dataset.field];
      else pending.mapping[el.dataset.field] = Number(el.value);
      app.render();
    },
    defaultArea(el, { app }) {
      pending.defaults = { ...pending.defaults, area: el.value };
      app.render();
    },
  },
  forms: {
    paste(form, { app }) {
      const text = new FormData(form).get('text');
      if (!String(text).trim()) return;
      pending = { text, mapping: planImport(text, [], null).mapping, defaults: { area: 'Other' }, fileName: '' };
      app.render();
    },
  },
  actions: {
    clear(el, { app }) {
      pending = null;
      app.render();
    },
    commit(el, { app }) {
      const plan = preview(app.state);
      const add = plan.items.filter((i) => !i.problems.length && !i.duplicateOf).map((i) => i.lead);
      const n = app.act((s) => {
        // Re-check duplicates against the latest saved data.
        const fresh = planImport(pending.text, s.leads, pending.mapping, pending.defaults);
        const leads = fresh.items.filter((i) => !i.problems.length && !i.duplicateOf).map((i) => i.lead);
        s.leads.push(...leads);
        return leads.length;
      });
      if (n !== undefined) {
        pending = null;
        toast(`Imported ${n} lead${n === 1 ? '' : 's'}${n !== add.length ? ' (some became duplicates meanwhile)' : ''}.`);
        app.navigate('#/leads');
      }
    },
    template() {
      download('tap-that-leads-template.csv', toCSV([TEMPLATE_HEADERS, ['Fade Lab', 'Barber', '082 123 4567', '', 'hello@example.co.za', '', '5 Main Rd, Walmer, Gqeberha', 'Walmer', 'Gqeberha', 'Sipho', '4.6', '87', '', '', '']]), 'text/csv');
    },
    exportLeads(el, { state }) {
      const w = state.settings.scoringWeights;
      const rows = [
        ['Business name', 'Category', 'Area', 'Suburb', 'Address', 'Phones', 'WhatsApp', 'Email', 'Website', 'Owner', 'Stage', 'Score', '% known', 'Callback', 'Next action', 'Notes'],
        ...state.leads.map((l) => {
          const sc = scoreLead(l, w);
          return [l.name, category(l.category).short, l.area, l.suburb, l.address, l.phones.map((p) => p.raw).join(' / '), l.whatsapp, l.email, l.website, l.contactName, leadStage(l, state), sc.score, sc.knownPct, l.callbackAt, l.nextAction, l.notes];
        }),
      ];
      download(`tap-that-leads-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv');
    },
  },
};

