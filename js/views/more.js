import { html } from '../ui.js';

const LINKS = [
  ['#/stock', 'Stock board', 'All stands and where each one is'],
  ['#/import', 'Import / export leads', 'CSV import with duplicate checks'],
  ['#/backup', 'Backup & restore', 'Export your data daily'],
  ['#/settings', 'Settings', 'Your details, targets, prices, templates, scoring'],
];

export default {
  title: 'More',
  render() {
    return html`
      <div class="page-head"><h1>More</h1></div>
      <ul class="list">${LINKS.map(([h, t, d]) => html`<li><a class="item" href="${h}"><div class="item-title">${t}</div><div class="item-meta">${d}</div></a></li>`)}</ul>
      <section class="card stack" style="margin-top:12px">
        <h2>Ground rules</h2>
        <p>• WhatsApp and email are drafts you send yourself, one at a time. Nothing is sent in bulk.</p>
        <p>• After the first contact, at most 3 follow-ups unless the business responds. Anyone who declines or opts out drops off every list immediately.</p>
        <p>• Never ask for a Google password. Never promise reviews or ratings.</p>
        <p>• Only fully paid stands count towards the 15-stand target.</p>
      </section>
      <section class="card stack" style="margin-top:12px">
        <h2>Install on your phone</h2>
        <p><strong>Android (Chrome):</strong> menu ⋮ → <em>Add to Home screen</em> / <em>Install app</em>.</p>
        <p><strong>iPhone (Safari):</strong> Share → <em>Add to Home Screen</em>.</p>
        <p class="muted">Once opened, it works without signal. Your data stays on this device.</p>
      </section>`;
  },
};
