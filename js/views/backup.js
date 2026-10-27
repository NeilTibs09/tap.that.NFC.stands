import { formatDateTime } from '../domain/util.js';
import { confirmDialog, download, html, showError, toast } from '../ui.js';

export default {
  title: 'Backup',
  render({ app, state }) {
    const last = state.meta?.lastBackupAt;
    return html`
      <div class="page-head"><h1>Backup &amp; restore</h1></div>
      <section class="card stack">
        <p>All data is stored <strong>only in this browser on this device</strong>. If the browser's data is cleared, or the phone is lost, it's gone. Export a backup at least once a day and keep it somewhere safe (email it to yourself or save it to Google Drive).</p>
        <p>Last backup: <strong>${last ? formatDateTime(last) : 'never'}</strong></p>
        ${app.store.loadError ? html`<div class="notice danger">Saved data couldn't be read. "Export backup" below saves the raw data so nothing is lost.</div>` : ''}
        <div class="row"><button class="btn primary" data-action="export">Export backup (.json)</button></div>
      </section>
      <section class="card stack" style="margin-top:12px">
        <h2>Restore / move to another device</h2>
        <p>Restoring <strong>replaces everything</strong> on this device with the backup. Use it to move to a new phone or laptop. Only use one device at a time, because changes don't sync between devices.</p>
        <label class="btn">Choose backup file<input type="file" accept=".json,application/json" data-change="restore" class="sr-only" /></label>
      </section>
      <section class="card stack" style="margin-top:12px">
        <h2>Start over</h2>
        <p class="muted">Deletes all leads, orders and history on this device. Export a backup first.</p>
        <button class="btn danger" data-action="wipe">Delete all data…</button>
      </section>`;
  },
  actions: {
    export(el, { app }) {
      const text = app.store.exportText();
      download(`tap-that-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, text, 'application/json');
      if (!app.store.loadError) app.act((s) => (s.meta.lastBackupAt = new Date().toISOString()));
      toast('Backup downloaded. Keep it somewhere safe.');
    },
    async wipe(el, { app }) {
      const v = await confirmDialog('Type DELETE to remove all data from this device.', { okLabel: 'Delete everything', danger: true, input: { label: 'Confirm', required: true } });
      if (v !== 'DELETE') return v !== null && toast('Not deleted (you must type DELETE).', { type: 'error' });
      const { freshState } = await import('../store.js');
      app.store.replaceAll(freshState());
      toast('All data deleted.');
      app.navigate('#/today');
    },
  },
  changes: {
    async restore(el, { app }) {
      const f = el.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.leads) || !data.settings) throw new Error("This file isn't a Tap That backup.");
        const msg = `Replace ALL data on this device with this backup (${data.leads.length} leads, ${(data.orders || []).length} orders, saved ${formatDateTime(data.meta?.updatedAt) || 'unknown'})?`;
        if (!(await confirmDialog(msg, { okLabel: 'Replace', danger: true }))) return;
        app.store.replaceAll(data);
        toast('Backup restored.');
        app.navigate('#/today');
      } catch (e) {
        showError(e);
      } finally {
        el.value = '';
      }
    },
  },
};
