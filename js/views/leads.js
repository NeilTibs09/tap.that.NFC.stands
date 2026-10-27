import { CLOSED_STAGES, PIPELINE, LEAD_STAGES } from '../domain/constants.js';
import { contactState } from '../domain/contact.js';
import { leadStage } from '../domain/leads.js';
import { priorityCompare, scoreCompare, scoreLead } from '../domain/scoring.js';
import { formatDateTime, normaliseText } from '../domain/util.js';
import { areaOptions, categoryOptions, html, options, phoneBadges, qs, scoreBadge, stageChip, tierChip, empty } from '../ui.js';

function filtersFrom(query) {
  return {
    q: query.get('q') || '',
    stage: query.get('stage') || '',
    category: query.get('category') || '',
    area: query.get('area') || '',
    sort: query.get('sort') || 'priority',
  };
}

function filtered(state, f, now) {
  const w = state.settings.scoringWeights;
  const q = normaliseText(f.q);
  let list = state.leads.filter((l) => {
    const st = leadStage(l, state);
    if (f.stage === 'open' && CLOSED_STAGES.includes(st)) return false;
    if (f.stage === 'closed' && !CLOSED_STAGES.includes(st)) return false;
    if (f.stage && !['open', 'closed'].includes(f.stage) && st !== f.stage) return false;
    if (f.category && l.category !== f.category) return false;
    if (f.area && l.area !== f.area) return false;
    if (q) {
      const hay = normaliseText([l.name, l.suburb, l.address, l.contactName, ...(l.phones || []).map((p) => p.raw)].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const cmp = {
    priority: (a, b) => priorityCompare(a, b, w),
    score: (a, b) => scoreCompare(a, b, w),
    name: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    area: (a, b) => (a.area + a.suburb).localeCompare(b.area + b.suburb) || priorityCompare(a, b, w),
  }[f.sort] || ((a, b) => priorityCompare(a, b, w));
  list = list.sort(cmp);
  return list.map((lead) => ({ lead, score: scoreLead(lead, w), stage: leadStage(lead, state), contact: contactState(lead, state, now) }));
}

function listHtml(state, f, now) {
  const rows = filtered(state, f, now);
  if (!state.leads.length) {
    return empty('No leads yet.', html`<div class="row" style="justify-content:center"><a class="btn primary" href="#/lead/new">Add a lead</a><a class="btn" href="#/import">Import CSV</a></div>`);
  }
  if (!rows.length) return empty('No leads match these filters.');
  return html`<p class="muted">${rows.length} of ${state.leads.length} leads</p>
    <ul class="list">${rows.map(
      ({ lead, score, stage, contact }) => html`<li>
        <a class="item" href="#/lead/${lead.id}">
          <div class="row between"><span class="item-title">${lead.name}</span>${scoreBadge(score)}</div>
          <div class="item-meta">${[lead.suburb, lead.area].filter(Boolean).join(', ')}${lead.contactName ? ` · ${lead.contactName}` : ''}</div>
          <div class="row">${tierChip(lead.category)} ${stageChip(stage)}
            ${!contact.allowed ? html`<span class="chip danger">${contact.blocked === 'limit' ? 'Follow-ups used' : 'Do not contact'}</span>` : ''}
            ${lead.callbackAt ? html`<span class="chip warn">Callback ${formatDateTime(lead.callbackAt)}</span>` : ''}
          </div>
          <div class="row">${phoneBadges(lead)}</div>
        </a>
      </li>`
    )}</ul>`;
}

export default {
  title: 'Leads',
  render({ state, query, now }) {
    const f = filtersFrom(query);
    const stageOpts = [
      { value: 'open', label: 'All open' },
      ...PIPELINE.map((p) => ({ value: p.id, label: p.label })),
      ...LEAD_STAGES.filter((s) => !s.open).map((s) => ({ value: s.id, label: s.label })),
      { value: 'closed', label: 'All closed' },
    ];
    return html`
      <div class="page-head">
        <h1>Leads</h1>
        <div class="row"><a class="btn" href="#/import">Import CSV</a><a class="btn primary" href="#/lead/new">+ Add lead</a></div>
      </div>
      <div class="search stack">
        <input type="search" name="q" placeholder="Search name, suburb, contact or number" value="${f.q}" data-input="filter" aria-label="Search leads" />
        <div class="form-grid">
          <select name="stage" data-change="filter" aria-label="Stage">${options(stageOpts, f.stage, { empty: 'Any stage' })}</select>
          <select name="category" data-change="filter" aria-label="Category">${categoryOptions(f.category, 'Any category')}</select>
          <select name="area" data-change="filter" aria-label="Area">${areaOptions(f.area, 'Any area')}</select>
          <select name="sort" data-change="filter" aria-label="Sort">${options(
            [
              { value: 'priority', label: 'Sort: priority (category, then score)' },
              { value: 'score', label: 'Sort: score' },
              { value: 'area', label: 'Sort: area / suburb' },
              { value: 'recent', label: 'Sort: recently updated' },
              { value: 'name', label: 'Sort: name' },
            ],
            f.sort
          )}</select>
        </div>
      </div>
      <div id="lead-list">${listHtml(state, f, now)}</div>
    `;
  },
  inputs: { filter: update },
  changes: { filter: update },
};

function update(el, { state, now }) {
  const wrap = el.closest('main');
  const f = {};
  for (const name of ['q', 'stage', 'category', 'area', 'sort']) f[name] = wrap.querySelector(`[name=${name}]`).value;
  history.replaceState(null, '', `#/leads${qs({ ...f, sort: f.sort === 'priority' ? '' : f.sort })}`);
  wrap.querySelector('#lead-list').innerHTML = String(listHtml(state, f, now));
}
