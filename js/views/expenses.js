import { EXPENSE_CATEGORIES } from '../domain/constants.js';
import { campaignMetrics } from '../domain/metrics.js';
import { dayKey, formatDay, formatRand, toNumber, uid } from '../domain/util.js';
import { confirmDialog, empty, formData, html, options, progress, showError } from '../ui.js';

const isSet = (v) => v !== null && v !== undefined && v !== '';

export default {
  title: 'Expenses',
  render({ state, now }) {
    const m = campaignMetrics(state, now);
    const list = [...state.expenses].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const cat = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id);
    return html`
      <div class="page-head"><h1>Expenses</h1></div>
      <section class="card stack">
        ${progress(Math.round(m.travelActual), m.travelBudget, 'Travel spent (actual, R)')}
        <p class="muted">Estimated travel logged: ${formatRand(m.travelEstimated)} · projected (actual where known, else estimate): ${formatRand(m.travelProjected)} · left in budget: ${formatRand(m.travelRemaining)}</p>
        ${m.travelProjected > m.travelBudget ? html`<div class="notice danger">Projected travel is over the ${formatRand(m.travelBudget)} budget.</div>` : ''}
        ${m.pendingActuals ? html`<div class="notice warn">${m.pendingActuals} entr${m.pendingActuals === 1 ? 'y needs' : 'ies need'} an actual amount.</div>` : ''}
        <p>Other expenses: ${formatRand(m.otherActual)} · Net profit after all logged costs: <strong>${formatRand(m.netProfit)}</strong></p>
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Add expense</h2>
        <form data-form="add" class="form-grid">
          <label class="field"><span>Date</span><input type="date" name="date" value="${dayKey(now)}" required /></label>
          <label class="field"><span>Category</span><select name="category">${options(EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), 'fuel')}</select></label>
          <label class="field full"><span>Description</span><input name="description" placeholder="e.g. Fuel – JBay & St Francis trip" /></label>
          <label class="field"><span>Kilometres</span><input name="km" inputmode="numeric" /></label>
          <label class="field"><span>Estimated (R)</span><input name="estimated" inputmode="decimal" /></label>
          <label class="field"><span>Actual (R)</span><input name="actual" inputmode="decimal" placeholder="Fill in when paid" /></label>
          <div class="row end full"><button class="btn primary">Add</button></div>
        </form>
      </section>

      <section style="margin-top:12px">
        ${list.length
          ? html`<div class="card table-wrap"><table>
              <thead><tr><th>Date</th><th>What</th><th class="num">Km</th><th class="num">Est.</th><th class="num">Actual</th><th></th></tr></thead>
              <tbody>${list.map(
                (e) => html`<tr>
                  <td>${formatDay(e.date)}</td>
                  <td>${e.description || cat(e.category)?.label}<br /><small>${cat(e.category)?.label}${cat(e.category)?.travel ? ' · travel' : ''}</small></td>
                  <td class="num">${e.km || ''}</td>
                  <td class="num">${isSet(e.estimated) ? formatRand(e.estimated) : ''}</td>
                  <td class="num">${isSet(e.actual) ? formatRand(e.actual) : html`<button class="btn small" data-action="setActual" data-id="${e.id}">Set</button>`}</td>
                  <td><button class="btn small ghost" data-action="edit" data-id="${e.id}" aria-label="Edit actual">✎</button><button class="btn small ghost" data-action="remove" data-id="${e.id}" aria-label="Delete">✕</button></td>
                </tr>`
              )}</tbody></table></div>`
          : empty('No expenses logged yet. Log trip estimates from the Visits page, then add actuals here.')}
      </section>`;
  },
  forms: {
    add(form, { app }) {
      const d = formData(form);
      const est = d.estimated === '' ? null : toNumber(d.estimated, NaN);
      const act = d.actual === '' ? null : toNumber(d.actual, NaN);
      if (Number.isNaN(est) || Number.isNaN(act)) return showError(new Error('Amounts must be numbers.'));
      if (est === null && act === null) return showError(new Error('Enter an estimated or actual amount.'));
      app.act(
        (s) =>
          s.expenses.push({
            id: uid('e_'),
            date: d.date,
            category: d.category,
            description: d.description,
            km: d.km ? toNumber(d.km) : null,
            estimated: est ?? 0,
            actual: act,
            notes: '',
          }),
        'Expense added'
      );
      form.reset();
    },
  },
  actions: {
    setActual: askActual,
    edit: askActual,
    async remove(el, { app }) {
      if (!(await confirmDialog('Delete this expense?', { okLabel: 'Delete', danger: true }))) return;
      app.act((s) => (s.expenses = s.expenses.filter((e) => e.id !== el.dataset.id)), 'Deleted');
    },
  },
};

async function askActual(el, { app }) {
  const e = app.state.expenses.find((x) => x.id === el.dataset.id);
  const v = await confirmDialog('Actual amount paid (R)', { okLabel: 'Save', input: { label: 'Amount', value: isSet(e.actual) ? e.actual : e.estimated || '', required: true } });
  if (v === null) return;
  const n = toNumber(v, NaN);
  if (!Number.isFinite(n) || n < 0) return showError(new Error('Enter a valid amount.'));
  app.act((s) => (s.expenses.find((x) => x.id === e.id).actual = n), 'Actual amount saved');
}
