import assert from 'node:assert/strict';
import { test } from 'node:test';

import { callQueue, contactState, callWindow, whatsappQueue } from '../js/domain/contact.js';
import { parseCSV, toCSV } from '../js/domain/csv.js';
import { autoMap, detectArea, detectCategory, planImport } from '../js/domain/importer.js';
import {
  addPayment,
  availableUnits,
  cancelOrder,
  createOrder,
  expiredReservations,
  extendReservation,
  integrityIssues,
  orderStage,
  paymentStatus,
  migratePersonalisation,
  persoStatus,
  updateSetup,
  releaseAllExpired,
  releaseReservation,
  removePayment,
  setDelivered,
  syncUnitCount,
  updateOrderTerms,
} from '../js/domain/inventory.js';
import { leadStage, logActivity, newLead, deleteLead } from '../js/domain/leads.js';
import { campaignMetrics, todayActivity } from '../js/domain/metrics.js';
import { classify, formatNational, splitPhones, toE164 } from '../js/domain/phone.js';
import { scoreLead } from '../js/domain/scoring.js';
import { checkReviewUrl, fillTemplate, mapsSearchLink, routeLink, waLink, whatsappDraft, writeReviewUrl, safeHref } from '../js/domain/templates.js';
import { endOfDay, formatRand, toNumber } from '../js/domain/util.js';
import { addVisit } from '../js/domain/visits.js';
import { createStore, freshState, STORAGE_KEY } from '../js/store.js';

const T0 = new Date('2026-10-28T09:30:00+02:00');

function setup(nLeads = 3) {
  const s = freshState(T0);
  for (let i = 0; i < nLeads; i++) {
    s.leads.push(newLead({ name: `Biz ${i}`, category: 'barber', phones: [`082 000 000${i}`] }, T0));
  }
  return s;
}

// ---------------- phone ----------------
test('SA phone numbers normalise to E.164', () => {
  assert.equal(toE164('041 581 1234'), '+27415811234');
  assert.equal(toE164('082-123-4567'), '+27821234567');
  assert.equal(toE164('+27 82 123 4567'), '+27821234567');
  assert.equal(toE164('+27 (0)82 123 4567'), '+27821234567');
  assert.equal(toE164('0027821234567'), '+27821234567');
  assert.equal(toE164('27821234567'), '+27821234567');
  assert.equal(toE164('12345'), null);
  assert.equal(toE164('+44 20 7946 0958'), null);
});

test('phone classification', () => {
  assert.equal(classify('+27415811234'), 'landline');
  assert.equal(classify('+27422931234'), 'landline');
  assert.equal(classify('+27821234567'), 'mobile');
  assert.equal(classify('+27612345678'), 'mobile');
  assert.equal(classify('+27731234567'), 'mobile');
  assert.equal(classify('+27861234567'), 'other');
  assert.equal(classify('+27871234567'), 'other');
  assert.equal(classify(null), 'unknown');
  assert.equal(formatNational('+27821234567'), '082 123 4567');
});

test('splitPhones handles several numbers in one cell', () => {
  assert.deepEqual(splitPhones('041 123 4567 / 082 123 4567'), ['041 123 4567', '082 123 4567']);
  assert.deepEqual(splitPhones('041 123 4567, 082 123 4567'), ['041 123 4567', '082 123 4567']);
  assert.deepEqual(splitPhones(''), []);
});

// ---------------- csv ----------------
test('CSV parser handles quotes, commas, CRLF, BOM and semicolons', () => {
  const rows = parseCSV('﻿name,address\r\n"Joe\'s ""Cuts""","1 Main Rd, Walmer"\r\n\r\nB,"multi\nline"\n');
  assert.deepEqual(rows, [
    ['name', 'address'],
    ['Joe\'s "Cuts"', '1 Main Rd, Walmer'],
    ['B', 'multi\nline'],
  ]);
  assert.deepEqual(parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('CSV writer round-trips and neutralises formulas', () => {
  const text = toCSV([['a,b', 'say "hi"', '=SUM(A1)', '+27821234567']]);
  assert.deepEqual(parseCSV(text), [['a,b', 'say "hi"', "'=SUM(A1)", '+27821234567']]);
});

// ---------------- scoring ----------------
test('scoring: unknown is reported, not assumed', () => {
  const s = freshState();
  const lead = newLead({ name: 'X' });
  let r = scoreLead(lead, s.settings.scoringWeights);
  assert.equal(r.score, 0);
  assert.equal(r.knownPct, 0);
  lead.scores.access = { level: 1, evidence: 'Owner cuts hair himself' };
  lead.scores.multi = { level: 0.5, evidence: '' };
  lead.scores.lowOnline = { level: 0, evidence: 'Replies to every review' };
  r = scoreLead(lead, s.settings.scoringWeights);
  assert.equal(r.score, 38); // 25 + 12.5 = 37.5, rounds to 38
  assert.equal(r.knownPct, 60);
  assert.equal(r.missingEvidence, 1);
});

// ---------------- inventory ----------------
test('orders allocate distinct stands and never over-allocate', () => {
  const s = setup();
  const o1 = createOrder(s, { leadId: s.leads[0].id, quantity: 10, unitPrice: 450 }, T0);
  const o2 = createOrder(s, { leadId: s.leads[1].id, quantity: 5, unitPrice: 450 }, T0);
  const all = [...o1.unitIds, ...o2.unitIds];
  assert.equal(new Set(all).size, 15);
  assert.equal(availableUnits(s).length, 0);
  assert.throws(() => createOrder(s, { leadId: s.leads[2].id, quantity: 1, unitPrice: 450 }, T0), /No stands are available/);
  assert.deepEqual(integrityIssues(s), []);
});

test('price below minimum needs a reason', () => {
  const s = setup();
  assert.throws(() => createOrder(s, { leadId: s.leads[0].id, quantity: 2, unitPrice: 450, discount: 50 }, T0), /below the R450 minimum/);
  const o = createOrder(s, { leadId: s.leads[0].id, quantity: 2, unitPrice: 450, discount: 50, belowMinReason: 'Bulk deal' }, T0);
  assert.equal(o.belowMinReason, 'Bulk deal');
  assert.throws(() => createOrder(s, { leadId: s.leads[0].id, quantity: 0, unitPrice: 450 }, T0), /Quantity/);
});

test('payments move an order through unpaid -> partial -> paid -> delivered', () => {
  const s = setup();
  const o = createOrder(s, { leadId: s.leads[0].id, quantity: 2, unitPrice: 450 }, T0);
  assert.equal(orderStage(o), 'order_unpaid');
  const p = addPayment(s, o.id, { amount: 400, method: 'Cash' }, T0);
  assert.equal(paymentStatus(o), 'partial');
  assert.equal(leadStage(s.leads[0], s), 'order_partial');
  assert.throws(() => addPayment(s, o.id, { amount: 600 }, T0), /more than the R500 balance/);
  addPayment(s, o.id, { amount: 500, method: 'EFT' }, T0);
  assert.equal(orderStage(o), 'order_paid');
  setDelivered(s, o.id, true, '', T0);
  assert.equal(orderStage(o), 'delivered');
  removePayment(s, o.id, p.id);
  assert.equal(orderStage(o), 'order_partial', 'delivered-but-unpaid is not "Delivered"');
});

test('only fully paid quantities count towards the target', () => {
  const s = setup();
  const a = createOrder(s, { leadId: s.leads[0].id, quantity: 3, unitPrice: 450 }, T0);
  const b = createOrder(s, { leadId: s.leads[1].id, quantity: 2, unitPrice: 450 }, T0);
  addPayment(s, a.id, { amount: 1350 }, T0);
  addPayment(s, b.id, { amount: 899 }, T0);
  const m = campaignMetrics(s, T0);
  assert.equal(m.fullyPaidUnits, 3);
  assert.equal(m.partialUnits, 2);
  assert.equal(m.collected, 2249);
  assert.equal(m.outstanding, 1);
  assert.equal(m.revenueTarget, 6750);
  assert.equal(m.grossProfit, 2249 - 1400);
  assert.equal(m.available, 10);
});

test('reservations expire, can be extended, and release their stands', () => {
  const s = setup();
  const o = createOrder(s, { leadId: s.leads[0].id, quantity: 4, unitPrice: 450 }, T0);
  const later = new Date(T0.getTime() + 49 * 3600000);
  assert.equal(expiredReservations(s, T0).length, 0);
  assert.equal(expiredReservations(s, later).length, 1);
  extendReservation(s, o.id, 24, later);
  assert.equal(expiredReservations(s, later).length, 0);
  const muchLater = new Date(later.getTime() + 25 * 3600000);
  const released = releaseAllExpired(s, muchLater);
  assert.equal(released.length, 1);
  assert.equal(o.status, 'cancelled');
  assert.equal(o.cancelReason, 'Reservation expired');
  assert.equal(availableUnits(s).length, 15);
});

test('reservations never hold stock past the deadline', () => {
  const s = setup();
  const lateOrder = createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }, new Date('2026-11-01T10:00:00+02:00'));
  assert.ok(new Date(lateOrder.reservedUntil) <= endOfDay('2026-11-01'));
});

test('part-paid orders do not expire and need a refund note to cancel', () => {
  const s = setup();
  const o = createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }, T0);
  addPayment(s, o.id, { amount: 200 }, T0);
  const later = new Date(T0.getTime() + 100 * 3600000);
  assert.equal(expiredReservations(s, later).length, 0);
  assert.throws(() => releaseReservation(s, o.id, later), /Only unpaid/);
  assert.throws(() => cancelOrder(s, o.id, { reason: 'changed mind' }, later), /refunded/);
  cancelOrder(s, o.id, { reason: 'changed mind', refundNote: 'Refunded R200 cash' }, later);
  assert.equal(availableUnits(s).length, 15);
});

test('changing order quantity reallocates stands safely', () => {
  const s = setup();
  const a = createOrder(s, { leadId: s.leads[0].id, quantity: 2, unitPrice: 450 }, T0);
  createOrder(s, { leadId: s.leads[1].id, quantity: 12, unitPrice: 450 }, T0);
  assert.throws(() => updateOrderTerms(s, a.id, { quantity: 4 }), /Only 1 more/);
  updateOrderTerms(s, a.id, { quantity: 3 });
  assert.equal(a.unitIds.length, 3);
  assert.deepEqual(integrityIssues(s), []);
  updateOrderTerms(s, a.id, { quantity: 1 });
  assert.equal(availableUnits(s).length, 2);
});

test('integrity check catches a stand in two orders', () => {
  const s = setup();
  const a = createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }, T0);
  const b = createOrder(s, { leadId: s.leads[1].id, quantity: 1, unitPrice: 450 }, T0);
  b.unitIds = [...a.unitIds];
  assert.match(integrityIssues(s)[0], /allocated to two orders/);
});

test('inventory count can grow, and cannot shrink below allocated', () => {
  const s = setup();
  createOrder(s, { leadId: s.leads[0].id, quantity: 14, unitPrice: 450 }, T0);
  assert.throws(() => syncUnitCount(s, 13), /allocated/);
  syncUnitCount(s, 16);
  assert.equal(s.units.length, 16);
  assert.equal(new Set(s.units.map((u) => u.id)).size, 16);
});

test('stand setup: link, branding, ready', () => {
  const s = setup();
  const o = createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }, T0);
  assert.equal(persoStatus(o.personalisation), 'not_started');
  assert.throws(() => updateSetup(s, o.id, { ready: true }, T0), /review link/);
  updateSetup(s, o.id, { logoSource: 'customer', logoNote: 'logo.png' }, T0);
  assert.equal(persoStatus(o.personalisation), 'in_progress');
  updateSetup(s, o.id, { reviewUrl: 'https://g.page/r/abc/review', reviewUrlSource: 'customer', ready: true }, T0);
  assert.equal(persoStatus(o.personalisation), 'ready');
  assert.equal(o.personalisation.readyAt, T0.toISOString());
  updateSetup(s, o.id, { ready: false }, T0);
  assert.equal(o.personalisation.readyAt, '');
  assert.deepEqual(Object.keys(o.personalisation).sort(), ['logoNote', 'logoSource', 'notes', 'readyAt', 'ready', 'reviewUrl', 'reviewUrlSource'].sort());
});

test('old checklist-style setup records migrate to ready / not ready', () => {
  const done = { linkVerified: true, logoApplied: true, nfcWritten: true, qrApplied: true, testedAndroid: true, testedIphone: false, testedQr: true };
  const a = migratePersonalisation({ reviewUrl: 'https://g.page/r/x', steps: done, startedAt: 'x', completedAt: '2026-10-28T10:00:00Z' });
  assert.equal(a.ready, true);
  assert.equal(a.readyAt, '2026-10-28T10:00:00Z');
  assert.equal(a.steps, undefined);
  assert.equal(a.startedAt, undefined);
  const b = migratePersonalisation({ reviewUrl: 'https://g.page/r/x', steps: { ...done, testedQr: false } });
  assert.equal(b.ready, false);
});

// ---------------- contact rules ----------------
test('follow-ups: initial + 3, counted per day, then blocked', () => {
  const s = setup(1);
  const lead = s.leads[0];
  const day = (n, h = 10) => new Date(`2026-10-${26 + n}T${String(h).padStart(2, '0')}:00:00+02:00`);
  logActivity(s, { leadId: lead.id, channel: 'call', outcome: 'no_answer' }, day(0));
  logActivity(s, { leadId: lead.id, channel: 'whatsapp', outcome: 'sent' }, day(0, 11)); // same day = same attempt
  assert.equal(contactState(lead, s, day(0, 12)).followUpsUsed, 0);
  logActivity(s, { leadId: lead.id, channel: 'call', outcome: 'no_answer' }, day(1));
  logActivity(s, { leadId: lead.id, channel: 'call', outcome: 'voicemail' }, day(2));
  logActivity(s, { leadId: lead.id, channel: 'whatsapp', outcome: 'sent' }, day(3));
  const sameDay = contactState(lead, s, day(3, 15));
  assert.equal(sameDay.followUpsUsed, 3);
  assert.equal(sameDay.allowed, true, 'still the same attempt today');
  const next = contactState(lead, s, day(4));
  assert.equal(next.allowed, false);
  assert.equal(next.blocked, 'limit');
});

test('a callback request is consent to contact again', () => {
  const s = setup(1);
  const lead = s.leads[0];
  for (let i = 0; i < 4; i++) {
    logActivity(s, { leadId: lead.id, channel: 'call', outcome: i === 3 ? 'callback' : 'no_answer' }, new Date(`2026-10-2${6 + i}T10:00:00+02:00`));
  }
  assert.equal(contactState(lead, s, new Date('2026-10-31T10:00:00+02:00')).allowed, true);
});

test('declined and opt-out stop contact immediately and cancel planned visits', () => {
  const s = setup(2);
  addVisit(s, { leadId: s.leads[0].id, date: '2026-10-29' });
  logActivity(s, { leadId: s.leads[0].id, channel: 'call', outcome: 'opted_out' }, T0);
  logActivity(s, { leadId: s.leads[1].id, channel: 'whatsapp', outcome: 'declined' }, T0);
  assert.equal(contactState(s.leads[0], s, T0).allowed, false);
  assert.equal(contactState(s.leads[1], s, T0).allowed, false);
  assert.equal(s.visits[0].status, 'cancelled');
  assert.equal(callQueue(s, T0).length, 0);
  assert.equal(whatsappQueue(s, T0).length, 0);
  assert.throws(() => addVisit(s, { leadId: s.leads[0].id, date: '2026-10-30' }), /opted out/);
});

test('engaged leads have no follow-up limit; stage only moves forward', () => {
  const s = setup(1);
  const lead = s.leads[0];
  logActivity(s, { leadId: lead.id, channel: 'call', outcome: 'appointment', when: '2026-10-29T10:00:00+02:00' }, T0);
  assert.equal(lead.stage, 'appointment');
  assert.equal(s.visits.length, 1);
  assert.equal(s.visits[0].date, '2026-10-29');
  logActivity(s, { leadId: lead.id, channel: 'whatsapp', outcome: 'interested' }, T0);
  assert.equal(lead.stage, 'appointment', 'does not go backwards');
  for (let i = 1; i < 6; i++) logActivity(s, { leadId: lead.id, channel: 'call', outcome: 'no_answer' }, new Date(T0.getTime() + i * 86400000));
  assert.equal(contactState(lead, s, new Date(T0.getTime() + 7 * 86400000)).allowed, true);
});

test('call queue puts due callbacks first and skips leads already called today', () => {
  const s = setup(3);
  logActivity(s, { leadId: s.leads[0].id, channel: 'call', outcome: 'no_answer' }, T0);
  logActivity(s, { leadId: s.leads[1].id, channel: 'call', outcome: 'callback', when: new Date(T0.getTime() - 60000).toISOString() }, new Date(T0.getTime() - 3600000));
  const q = callQueue(s, T0);
  assert.equal(q[0].lead.id, s.leads[1].id);
  assert.ok(!q.some((r) => r.lead.id === s.leads[0].id));
});

test('calling windows by category', () => {
  const s = freshState();
  assert.equal(callWindow('barber', s.settings, new Date('2026-10-28T09:30:00')).inWindow, true);
  assert.equal(callWindow('barber', s.settings, new Date('2026-10-28T12:30:00')).inWindow, false);
  assert.equal(callWindow('tourism', s.settings, new Date('2026-10-28T16:30:00')).session, 'afternoon');
});

test('deleting a lead with an active order is blocked', () => {
  const s = setup(1);
  createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }, T0);
  assert.throws(() => deleteLead(s, s.leads[0].id), /active order/);
});

test('today activity counts', () => {
  const s = setup(2);
  logActivity(s, { leadId: s.leads[0].id, channel: 'call', outcome: 'no_answer' }, T0);
  logActivity(s, { leadId: s.leads[0].id, channel: 'whatsapp', outcome: 'sent' }, T0);
  logActivity(s, { leadId: s.leads[1].id, channel: 'visit', outcome: 'demo' }, T0);
  const t = todayActivity(s, T0);
  assert.deepEqual([t.calls, t.whatsapp, t.visits, t.demos], [1, 1, 1, 1]);
});

// ---------------- templates & links ----------------
test('templates fill placeholders and choose follow-up drafts', () => {
  const s = freshState();
  s.settings.seller.name = 'Neil';
  const lead = newLead({ name: 'Fade Lab', category: 'barber', area: 'Jeffreys Bay', contactName: 'Sipho Ndlovu' });
  const d = whatsappDraft(lead, s.settings, { attempts: 0 });
  assert.equal(d.key, 'whatsappIntro');
  assert.match(d.text, /^Hi Sipho, it's Neil from Tap That/);
  assert.match(d.text, /R450/);
  assert.match(d.text, /reply STOP/);
  assert.equal(whatsappDraft(lead, s.settings, { attempts: 2, followUpsUsed: 1 }).key, 'whatsappFollowUp2');
  assert.equal(fillTemplate('Hi {firstName} , {unknown}', { firstName: 'there' }), 'Hi there, {unknown}');
  assert.equal(waLink('+27821234567', 'hi there'), 'https://wa.me/27821234567?text=hi%20there');
});

test('review link checks', () => {
  assert.equal(checkReviewUrl('https://g.page/r/CbGfx123/review').level, 'ok');
  assert.equal(checkReviewUrl(writeReviewUrl('ChIJabc')).level, 'ok');
  assert.equal(checkReviewUrl('https://maps.app.goo.gl/xyz').level, 'warn');
  assert.equal(checkReviewUrl('https://example.com').level, 'bad');
  assert.equal(checkReviewUrl('nope').level, 'bad');
});

test('safeHref blocks script URLs', () => {
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('www.fadelab.co.za'), 'https://www.fadelab.co.za');
  assert.equal(safeHref('https://x.co'), 'https://x.co');
});

// ---------------- import ----------------
test('category and area detection', () => {
  assert.equal(detectCategory("Gents Barber Shop"), 'barber');
  assert.equal(detectCategory('Bed & Breakfast'), 'accommodation');
  assert.equal(detectCategory('Nail salon'), 'beauty');
  assert.equal(detectCategory('Surf school'), 'tourism');
  assert.equal(detectCategory('Coffee shop'), 'cafe');
  assert.equal(detectCategory('Plumber'), 'other');
  assert.equal(detectArea('12 Da Gama Rd, Jeffreys Bay, 6330'), 'Jeffreys Bay');
  assert.equal(detectArea('1 Main St, Walmer, Port Elizabeth'), 'Gqeberha');
  assert.equal(detectArea('St Francis Bay'), 'St Francis Bay');
  assert.equal(detectArea('Cape St Francis'), 'Cape St Francis');
});

test('CSV import maps columns, detects duplicates and bad rows', () => {
  const existing = [newLead({ name: 'Old Barber', phones: ['082 111 2222'] })];
  const csv = [
    'Business name,Type,Phone,Address,Rating,Reviews',
    'Fade Lab,Barber,"041 581 1234 / 082 555 6666","5 Main Rd, Walmer, Gqeberha",4.6,87',
    'Duplicate By Phone,Barber,082 111 2222,Jeffreys Bay,,',
    ',Salon,082 999 0000,Somewhere,,',
    'Sea Breeze B&B,Guest house,042 293 0000,"St Francis Bay",4.9,12',
    'Fade Lab,Barber,041 581 1234,"Walmer, Gqeberha",,',
  ].join('\n');
  const plan = planImport(csv, existing);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.items.length, 5);
  const [a, dup, bad, b, dupInFile] = plan.items;
  assert.equal(a.lead.category, 'barber');
  assert.equal(a.lead.area, 'Gqeberha');
  assert.equal(a.lead.phones.length, 2);
  assert.deepEqual(a.lead.phones.map((p) => p.type), ['landline', 'mobile']);
  assert.equal(a.lead.googleRating, 4.6);
  assert.equal(a.lead.googleReviewCount, 87);
  assert.ok(dup.duplicateOf);
  assert.deepEqual(bad.problems, ['No business name']);
  assert.equal(b.lead.category, 'accommodation');
  assert.equal(b.lead.area, 'St Francis Bay');
  assert.equal(b.lead.googleReviewCount, 12);
  assert.ok(dupInFile.duplicateOf, 'duplicate within the same file');
  // Scores are never auto-filled from review counts.
  assert.equal(a.lead.scores.reviewGap.level, null);
});

test('autoMap recognises common export headers', () => {
  const m = autoMap(['title', 'totalScore', 'reviewsCount', 'phone', 'categoryName', 'address', 'url']);
  assert.equal(m.name, 0);
  assert.equal(m.googleRating, 1);
  assert.equal(m.googleReviewCount, 2);
  assert.equal(m.phone, 3);
  assert.equal(m.category, 4);
});

// ---------------- visits ----------------
test('Place IDs give exact Maps links and routes', () => {
  const a = newLead({ name: 'Barber prospect 1', area: 'Gqeberha', placeId: 'ChIJaaa' });
  const b = newLead({ name: 'Barber prospect 2', area: 'Gqeberha', placeId: 'ChIJbbb' });
  assert.match(mapsSearchLink(a), /query_place_id=ChIJaaa$/);
  const ph = newLead({ name: 'Barber prospect GQ-001', area: 'Gqeberha', placeId: 'ChIJccc' });
  assert.doesNotMatch(mapsSearchLink(ph), /prospect/);
  const r = routeLink([a, b]);
  assert.match(r, /destination_place_id=ChIJbbb/);
  assert.match(r, /waypoint_place_ids=ChIJaaa/);
  const c = newLead({ name: 'No ID', address: '1 Main Rd', area: 'Gqeberha' });
  assert.doesNotMatch(routeLink([a, c]), /place_id/, 'mixed lists fall back to text');
});

test('Place-ID-only CSV rows import and de-duplicate by Place ID', () => {
  const csv = [
    'Business name,Category,Town,Suburb,Google Maps link,Google Place ID,Review link',
    'Barber prospect GQ-001,Barber,Gqeberha,Walmer (approx.),https://www.google.com/maps/search/?api=1&query=barber&query_place_id=ChIJaaa,ChIJaaa,https://search.google.com/local/writereview?placeid=ChIJaaa',
    'Barber prospect GQ-002,Barber,Gqeberha,Walmer (approx.),,ChIJaaa,',
  ].join('\n');
  const existing = [newLead({ name: 'Someone else', placeId: 'ChIJzzz' })];
  const plan = planImport(csv, existing);
  assert.equal(plan.items[0].problems.length, 0);
  assert.equal(plan.items[0].lead.placeId, 'ChIJaaa');
  assert.equal(plan.items[0].lead.category, 'barber');
  assert.equal(plan.items[0].lead.reviewUrlSource, 'researched');
  assert.ok(plan.items[1].duplicateOf, 'same Place ID twice is a duplicate');
});

test('store migration drops travel/expense data and old settings', () => {
  const storage = memoryStorage();
  const old = freshState();
  old.expenses = [{ id: 'e1', category: 'fuel', estimated: 100, actual: 90 }];
  Object.assign(old.settings, { travelBudget: 1000, costPerKm: 2.5, areaKm: { Gqeberha: 40 }, personalisationMinutes: 5 });
  storage.setItem(STORAGE_KEY, JSON.stringify(old));
  const store = createStore(storage);
  store.load();
  assert.equal(store.state.expenses, undefined);
  for (const k of ['travelBudget', 'costPerKm', 'areaKm', 'personalisationMinutes']) assert.equal(store.state.settings[k], undefined, k);
  const m = campaignMetrics(store.state, T0);
  assert.equal(m.travelBudget, undefined);
  assert.equal(m.netProfit, undefined);
});

// ---------------- util ----------------
test('money formatting and parsing', () => {
  assert.equal(formatRand(6750), 'R6 750');
  assert.equal(formatRand(1234.5), 'R1 234.50');
  assert.equal(toNumber('R 1,234.50'), 1234.5);
  assert.equal(toNumber('450,50'), 450.5);
});

// ---------------- store ----------------
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('store transactions are atomic and pick up other tabs’ writes', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.load();
  store.transact((s) => s.leads.push(newLead({ name: 'A' })));
  // A failing change saves nothing.
  assert.throws(() =>
    store.transact((s) => {
      s.leads.push(newLead({ name: 'B' }));
      throw new Error('boom');
    })
  );
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).leads.length, 1);
  // Another tab writes directly to storage; our next transaction builds on it.
  const other = JSON.parse(storage.getItem(STORAGE_KEY));
  other.leads.push(newLead({ name: 'From other tab' }));
  storage.setItem(STORAGE_KEY, JSON.stringify(other));
  store.transact((s) => s.leads.push(newLead({ name: 'C' })));
  assert.deepEqual(store.state.leads.map((l) => l.name), ['A', 'From other tab', 'C']);
});

test('store refuses to save a double allocation', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.load();
  store.transact((s) => {
    s.leads.push(newLead({ name: 'A' }), newLead({ name: 'B' }));
  });
  store.transact((s) => createOrder(s, { leadId: s.leads[0].id, quantity: 1, unitPrice: 450 }));
  assert.throws(() =>
    store.transact((s) => {
      const o = createOrder(s, { leadId: s.leads[1].id, quantity: 1, unitPrice: 450 });
      o.unitIds = [...s.orders[0].unitIds];
    }),
    /allocated to two orders/
  );
  assert.equal(store.state.orders.length, 1);
});

test('store keeps unreadable data instead of overwriting it', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const store = createStore(storage);
  store.load();
  assert.ok(store.loadError);
  assert.throws(() => store.transact(() => {}), /could not be read/);
  assert.equal(storage.getItem(STORAGE_KEY), '{not json');
});

test('Place-ID-only prospects appear in the call list; placeholder names are recognised', async () => {
  const { isPlaceholderName } = await import('../js/domain/leads.js');
  const s = freshState(T0);
  s.leads.push(newLead({ name: 'Barber prospect GQ-014', category: 'barber', placeId: 'ChIJaaa' }, T0));
  s.leads.push(newLead({ name: 'No contact info', category: 'barber' }, T0));
  const q = callQueue(s, T0);
  assert.deepEqual(q.map((r) => r.lead.name), ['Barber prospect GQ-014']);
  assert.equal(whatsappQueue(s, T0).length, 0, 'no WhatsApp without a confirmed mobile number');
  assert.equal(isPlaceholderName('Barber prospect GQ-014'), true);
  assert.equal(isPlaceholderName('Fade Lab'), false);
});
