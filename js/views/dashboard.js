import { PIPELINE } from '../domain/constants.js';
import { currentSession } from '../domain/contact.js';
import { actionItems, campaignMetrics, pipelineCounts, todayActivity } from '../domain/metrics.js';
import { formatDay, formatRand, dayKey } from '../domain/util.js';
import { html, progress } from '../ui.js';

export default {
  title: 'Today',
  autoRefresh: true,
  render({ state, now }) {
    const s = state.settings;
    const m = campaignMetrics(state, now);
    const t = todayActivity(state, now);
    const items = actionItems(state, now);
    const counts = pipelineCounts(state);
    const today = dayKey(now);
    const seg = (n, color, label) =>
      n ? html`<span style="width:${(n / Math.max(1, m.inventory)) * 100}%;background:${color}" title="${label}: ${n}"></span>` : '';

    return html`
      <div class="page-head">
        <div>
          <h1>${formatDay(today)}</h1>
          <small>${s.campaignName} · ${formatDay(s.startDate)} – ${formatDay(s.endDate)} · ${currentSession(now) === 'morning' ? 'Morning session' : 'Afternoon session'}</small>
        </div>
        <a class="btn primary" href="#/outreach">Start outreach</a>
      </div>

      ${!state.leads.length
        ? html`<div class="card info stack">
            <h2>Get started</h2>
            <p>1. Add your name and number in <a href="#/settings">Settings</a> so message drafts are signed correctly.</p>
            <p>2. <a href="#/import">Import a CSV of businesses</a> or <a href="#/lead/new">add a lead</a>.</p>
            <p>3. Work the <a href="#/outreach">call and WhatsApp lists</a>, book visits, then take orders.</p>
          </div>`
        : ''}

      ${!m.stockArrived ? html`<div class="notice warn" style="margin-bottom:12px">Stock arrives ${formatDay(s.stockArrivalDate)}. You can take orders and payments now, but plan deliveries from then.</div>` : ''}

      <section class="grid stats">
        <div class="stat hero">
          <span>Fully paid stands (the target)</span>
          <b>${m.fullyPaidUnits} / ${m.inventory}</b>
          <div class="stackbar" style="margin-top:8px" aria-label="Stock status">
            ${seg(m.delivered, 'var(--brand)', 'Delivered')}${seg(m.paid, 'var(--ok)', 'Paid, not delivered')}${seg(m.partial, 'var(--info)', 'Part-paid')}${seg(m.reserved, 'var(--warn)', 'Reserved, unpaid')}
          </div>
          <div class="legend" style="margin-top:6px">
            <span><i style="background:var(--brand)"></i>Delivered ${m.delivered}</span>
            <span><i style="background:var(--ok)"></i>Paid ${m.paid}</span>
            <span><i style="background:var(--info)"></i>Part-paid ${m.partial}</span>
            <span><i style="background:var(--warn)"></i>Reserved ${m.reserved}</span>
            <span><i></i>Available ${m.available}</span>
          </div>
          <small>${m.afterEnd
            ? 'Campaign has ended.'
            : m.remaining
              ? `${m.remaining} still to be fully paid · about ${m.neededPerDay} per day over ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'}`
              : 'All stands fully paid. Target reached!'}</small>
        </div>
        <div class="stat"><b>${formatRand(m.collected)}</b><span>Collected of ${formatRand(m.revenueTarget)} target</span></div>
        <div class="stat"><b>${formatRand(m.outstanding)}</b><span>Outstanding on orders</span></div>
        <div class="stat"><b>${formatRand(m.grossProfit)}</b><span>Gross profit (collected − ${formatRand(m.inventoryCost)} stock)</span></div>
        <div class="stat"><b>${formatRand(m.travelActual)}</b><span>Travel spent of ${formatRand(m.travelBudget)}</span></div>
        <div class="stat"><b>${formatRand(m.netProfit)}</b><span>Net after logged expenses</span></div>
      </section>

      <section class="card" style="margin-top:12px">
        <div class="row between"><h2>Today's activity</h2><a href="#/outreach" class="btn small">Outreach lists</a></div>
        ${progress(t.calls, s.dailyTargets.calls, 'Calls')}
        ${progress(t.whatsapp, s.dailyTargets.whatsapp, 'Personal WhatsApps sent')}
        ${progress(t.emails, s.dailyTargets.emails, 'Emails sent')}
        ${progress(t.visits, s.dailyTargets.visits, 'Visits logged')}
        <p class="muted" style="margin-top:8px">${t.conversations} positive conversation${t.conversations === 1 ? '' : 's'} · ${t.booked} visit${t.booked === 1 ? '' : 's'} booked · ${t.demos} demo${t.demos === 1 ? '' : 's'} today</p>
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Needs attention</h2>
        ${items.length
          ? html`<ul class="list">${items.map(
              (i) => html`<li><a class="item notice ${i.level === 'danger' ? 'danger' : i.level === 'warn' ? 'warn' : ''}" href="${i.href}">${i.text}</a></li>`
            )}</ul>`
          : html`<p class="muted">Nothing urgent.</p>`}
      </section>

      <section class="card" style="margin-top:12px">
        <h2>Pipeline</h2>
        <div class="table-wrap"><table>
          <tbody>
            ${PIPELINE.map(
              (p) => html`<tr><td><a href="#/leads?stage=${p.id}">${p.label}</a></td><td class="num">${counts[p.id] || 0}</td></tr>`
            )}
            <tr><td class="muted"><a href="#/leads?stage=closed">Declined / opted out / not suitable</a></td><td class="num">${(counts.declined || 0) + (counts.opted_out || 0) + (counts.not_suitable || 0)}</td></tr>
          </tbody>
        </table></div>
      </section>
    `;
  },
};
