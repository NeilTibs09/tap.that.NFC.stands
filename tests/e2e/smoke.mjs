// End-to-end smoke test through the real UI in headless Chromium (phone viewport).
// Run: npm run e2e   (needs the `playwright` package and a Chromium build available)
// Optional: SCREENSHOTS=/some/dir npm run e2e  to save screenshots of each step.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { serve } from '../serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8093;
const BASE = `http://localhost:${PORT}/`;
const shots = process.env.SCREENSHOTS;

const server = await serve(PORT);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Africa/Johannesburg' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Record wa.me / window.open calls instead of opening them.
await page.addInitScript(() => {
  window.__opened = [];
  window.open = (url) => {
    window.__opened.push(url);
    return null;
  };
});

let step = 0;
async function snap(name) {
  if (shots) await page.screenshot({ path: `${shots}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true });
}
const go = async (hash) => {
  await page.goto(BASE + hash);
  await page.waitForTimeout(150);
};
const confirm = async () => {
  await page.locator('dialog[open] button[value=ok]').click();
  await page.waitForTimeout(100);
};
const text = (sel) => page.locator(sel).first().innerText();

try {
  await go('#/today');
  await snap('empty-dashboard');

  // 1. Settings
  await go('#/settings');
  await page.fill('input[name="seller.name"]', 'Neil');
  await page.fill('input[name="seller.phone"]', '082 555 0000');
  await page.click('form[data-form=save] button.primary');
  await page.waitForTimeout(100);
  assert.equal(await page.inputValue('input[name="seller.name"]'), 'Neil');

  // 2. CSV import (paste)
  await go('#/import');
  await page.locator('details summary', { hasText: 'paste CSV' }).click();
  const csv = [
    'Business name,Type,Phone,Address,Rating,Reviews,Email',
    'Fade Lab,Barber,"041 581 1234 / 082 555 6666","5 Main Rd, Walmer, Gqeberha",4.6,87,',
    'Sea Breeze B&B,Guest house,072 293 0000,"1 Beach Rd, St Francis Bay",4.9,12,stay@seabreeze.example',
    'Wave Cafe,Coffee shop,083 111 2222,"Da Gama Rd, Jeffreys Bay",,,',
    'Glow Nails,Nail salon,084 333 4444,"Summerstrand, Port Elizabeth",,,',
    'Fade Lab,Barber,041 581 1234,"Walmer, Gqeberha",,,',
  ].join('\n');
  await page.fill('form[data-form=paste] textarea', csv);
  await page.click('form[data-form=paste] button');
  await page.waitForTimeout(150);
  await snap('import-preview');
  assert.match(await text('main'), /4\s*new · 1 duplicates skipped/);
  await page.click('button[data-action=commit]');
  await page.waitForTimeout(200);
  assert.match(page.url(), /#\/leads/);
  assert.match(await text('#lead-list'), /4 of 4 leads/);

  // Search filter
  await page.fill('input[name=q]', 'glow');
  await page.waitForTimeout(100);
  assert.match(await text('#lead-list'), /1 of 4 leads/);
  await page.fill('input[name=q]', '');
  await page.waitForTimeout(100);
  await snap('leads');

  // 3. Score a lead with evidence
  await page.locator('#lead-list a', { hasText: 'Fade Lab' }).click();
  await page.waitForTimeout(100);
  await page.click('a.btn[href$="/edit"]');
  await page.selectOption('select[name=score_access]', '1');
  await page.fill('input[name=evidence_access]', 'Owner cuts hair himself, on site daily');
  await page.selectOption('select[name=score_multi]', '0.5');
  await page.fill('input[name=contactName]', 'Sipho Ndlovu');
  await page.click('form[data-form=save] button[type=submit]');
  await page.waitForTimeout(150);
  assert.match(await text('main'), /38\/100/);
  const fadeUrl = page.url();
  const fadeId = fadeUrl.split('/').pop();

  // 4. Call outcome: visit booked -> creates a visit and moves stage
  await go('#/outreach');
  await snap('call-list');
  const fadeRow = page.locator('li.item', { hasText: 'Fade Lab' });
  await fadeRow.locator('details.log summary').click();
  await fadeRow.locator('.choices label', { hasText: 'Visit booked' }).click();
  await fadeRow.locator('input[name=when]').fill('2026-10-28T10:30');
  await fadeRow.locator('input[name=notes]').fill('Owner keen, bring demo');
  await fadeRow.locator('button[type=submit]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('li.item', { hasText: 'Fade Lab' }).count(), 0, 'called lead leaves today’s call list');
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('tapthat.salescc.v1')));
  const fade = state.leads.find((l) => l.id === fadeId);
  assert.equal(fade.stage, 'appointment');
  assert.equal(state.visits.length, 1);
  assert.equal(state.visits[0].date, '2026-10-28');

  // 5. WhatsApp: personalised draft, opened manually, logged
  await go('#/outreach?tab=whatsapp');
  const waRow = page.locator('li.item', { hasText: 'Sea Breeze' });
  await waRow.locator('details summary', { hasText: 'Write message' }).click();
  const draft = await waRow.locator('textarea').inputValue();
  assert.match(draft, /it's Neil from Tap That/);
  assert.match(draft, /Guests choose where to stay/);
  await snap('whatsapp-draft');
  await waRow.locator('button[data-action=waSend]').click();
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/wa\.me\/27722930000\?text=/);

  // 6. Opt-out removes a lead from all lists
  await go('#/outreach');
  const glow = page.locator('li.item', { hasText: 'Glow Nails' });
  await glow.locator('details.log summary').click();
  await glow.locator('.choices label', { hasText: 'Do not contact again' }).click();
  await glow.locator('button[type=submit]').click();
  await page.waitForTimeout(150);
  await go('#/outreach?tab=whatsapp');
  assert.equal(await page.locator('li.item', { hasText: 'Glow Nails' }).count(), 0);

  // 7. Visit: log demo
  await go('#/visits?date=2026-10-28');
  await snap('visits');
  const visit = page.locator('li.item', { hasText: 'Fade Lab' });
  await visit.locator('details.log summary').click();
  await visit.locator('.choices label', { hasText: 'Demo done' }).click();
  await visit.locator('button[type=submit]').click();
  await page.waitForTimeout(150);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('tapthat.salescc.v1')));
  assert.equal(state.visits[0].status, 'done');
  assert.equal(state.leads.find((l) => l.id === fadeId).stage, 'demo');

  // 8. Order: reserve 2, below-minimum blocked, part pay then full pay
  await go(`#/order/new?lead=${fadeId}`);
  await page.fill('input[name=quantity]', '2');
  await page.fill('input[name=discount]', '100');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#below-min').isHidden(), false, 'below-minimum reason shown');
  await page.click('form[data-form=create] button[type=submit]');
  await page.waitForTimeout(150);
  assert.match(page.url(), /order\/new/, 'blocked without reason');
  await page.fill('input[name=discount]', '0');
  await page.fill('input[name=payAmount]', '400');
  await snap('new-order');
  await page.click('form[data-form=create] button[type=submit]');
  await page.waitForTimeout(150);
  assert.match(page.url(), /#\/order\/o_/);
  assert.match(await text('main'), /TT-01, TT-02/);
  assert.match(await text('main'), /Partially paid/);
  await page.fill('form[data-form=pay] input[name=amount]', '500');
  await page.click('form[data-form=pay] button');
  await page.waitForTimeout(150);
  assert.match(await text('main'), /Fully paid/);
  const orderUrl = page.url();
  await snap('order-paid');

  // 9. Stand setup: review link, branding, ready (no timer, no checklist)
  await page.click('a[href^="#/personalise/"]');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#timer, input[data-key], canvas').count(), 0, 'timer/checklist/QR removed');
  await page.fill('input[name=reviewUrl]', 'https://g.page/r/CbGfxTest123/review');
  assert.match(await text('#url-check'), /opens the review form/);
  await page.selectOption('select[name=reviewUrlSource]', 'customer');
  await page.selectOption('select[name=logoSource]', 'customer');
  await page.fill('input[name=logoNote]', 'fadelab-logo.png');
  await page.check('input[name=ready]');
  await page.click('form[data-form=save] button.primary');
  await page.waitForTimeout(200);
  assert.match(await text('main'), /Stand ready/);
  await snap('stand-setup');

  // 10. Deliver
  await page.goto(orderUrl);
  await page.waitForTimeout(100);
  await page.click('button[data-action=deliver]');
  await page.waitForTimeout(150);
  assert.match(await text('main'), /Delivered/);

  // 11. Stock can't be over-allocated
  const waveId = state.leads.find((l) => l.name === 'Wave Cafe').id;
  await go(`#/order/new?lead=${waveId}`);
  assert.match(await text('form[data-form=create]'), /13 available/);
  await page.fill('input[name=quantity]', '14');
  await page.click('form[data-form=create] button[type=submit]');
  await page.waitForTimeout(150);
  assert.match(await page.locator('#toasts .toast.error').last().innerText(), /Only 13 stands available/);
  await page.fill('input[name=quantity]', '13');
  await page.click('form[data-form=create] button[type=submit]');
  await page.waitForTimeout(150);
  await go('#/order/new');
  assert.match(await text('main'), /No stands available/);

  // 12. Expired reservation -> release from the Orders page
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('tapthat.salescc.v1'));
    const o = s.orders.find((x) => x.quantity === 13);
    o.reservedUntil = new Date(Date.now() - 60000).toISOString();
    localStorage.setItem('tapthat.salescc.v1', JSON.stringify(s));
  });
  await go('#/orders');
  await page.reload();
  await page.waitForTimeout(150);
  assert.match(await text('main'), /Expired reservations \(1\)/);
  await snap('expired');
  await page.click('button[data-action=release]');
  await confirm();
  await page.waitForTimeout(100);
  await go('#/stock');
  assert.equal(await page.locator('.units .unit.available').count(), 13);
  assert.equal(await page.locator('.units .unit.delivered').count(), 2);
  await snap('stock');

  // 13. Dashboard counts only fully paid stands
  await go('#/today');
  assert.match(await text('.stat.hero'), /2 \/ 15/);
  assert.match(await text('#status-pill'), /2\/15 paid/);
  await snap('dashboard');

  // 14. Travel/expense tracking is gone
  await go('#/visits?date=2026-10-28');
  assert.equal(await page.locator('[data-action=logTrip]').count(), 0);
  assert.doesNotMatch(await text('main'), /trip estimate|fuel/i);
  await go('#/more');
  assert.doesNotMatch(await text('main'), /Expenses/);
  await go('#/today');
  assert.doesNotMatch(await text('main'), /Travel/);

  // 15. Backup export
  await go('#/backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-action=export]')]);
  assert.match(dl.suggestedFilename(), /^tap-that-backup-.*\.json$/);

  // 16. Desktop layout renders
  await page.setViewportSize({ width: 1280, height: 900 });
  await go('#/today');
  await snap('desktop-dashboard');

  // 17. No horizontal scroll at phone width on key screens
  await page.setViewportSize({ width: 360, height: 800 });
  for (const r of ['#/today', '#/leads', '#/outreach', '#/visits', '#/orders', '#/stock', '#/settings', `#/lead/${fadeId}`]) {
    await go(r);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal scroll on ${r} (overflow ${overflow}px)`);
  }

  assert.deepEqual(errors, [], 'no console errors');
  console.log('E2E smoke test passed (17 steps).');
} catch (e) {
  console.error('E2E FAILED:', e.message);
  if (shots) await page.screenshot({ path: `${shots}/failure.png`, fullPage: true });
  if (errors.length) console.error('Console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
