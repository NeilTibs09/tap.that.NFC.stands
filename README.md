# Tap That – Sales Command Centre

A mobile-first web app for selling 15 Google Review NFC/QR stands in Gqeberha, Jeffreys Bay, St Francis Bay and nearby, 26 Oct – 1 Nov 2026.

It covers the whole campaign: **import or add leads → score and prioritise → call / WhatsApp / email → book and plan visits → take orders → reconcile payments → personalise and test stands → deliver**, with live stock and budget tracking.

## Run it

No build step and no dependencies.

```bash
npm start          # serves the app at http://localhost:8080
npm test           # unit tests for the business rules (Node 22+)
npm run e2e        # end-to-end browser test (needs Playwright + Chromium installed)
```

### Put it on your phone (GitHub Pages, free)

1. Merge to `main`.
2. In GitHub: **Settings → Pages → Source: GitHub Actions** (one-time).
3. The `Deploy to GitHub Pages` workflow publishes it at `https://<user>.github.io/<repo>/`.
4. Open that link on your phone → **Add to Home Screen**. After the first load it works without signal.

Any static host (Netlify, Cloudflare Pages) works too: upload `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `assets/`.

## Important: where your data lives

All data is stored **in the browser on the device you use** (localStorage). There is no server and no sync.

- Use **one device** for the campaign (your phone is best).
- **Export a backup daily** (More → Backup). The dashboard reminds you after 12 hours. Restore on another device to move.
- Clearing browser data deletes it. Don't use a private/incognito window (the app warns you if storage is blocked).

## What's in it

| Area | What it does |
| --- | --- |
| **Today** | Fully paid stands vs 15, stock breakdown, cash collected vs R6 750, outstanding, gross profit, today's calls/WhatsApps/emails/visits vs targets, things needing attention, pipeline counts. |
| **Leads** | Add/edit, CSV import with column matching and duplicate checks (including by Google Place ID), search/filter/sort, CSV export. Phones are normalised to +27 and classified mobile / landline / VoIP by prefix. |
| **Scoring** | Five criteria (25/25/20/20/10, editable), each rated Unknown / No / Some / Strong with written evidence. Unknown is shown as "% known", never assumed. Nothing is auto-scored from review counts. |
| **Outreach** | Call list ordered by: callbacks due → in the category's calling window → category priority → score. Personalised WhatsApp and email drafts that open in your own app, one at a time. Quick outcome logging, gatekeeper and callback capture, call script. |
| **Contact rules** | First contact plus up to 3 follow-ups (counted per day), unless the business responds or asks for a callback. "Declined" or "opt out" removes them from every list immediately and cancels planned visits. |
| **Visits** | Day plan grouped by area, route reordering, "open route in Google Maps" (uses exact listings when leads have a Place ID), drop-in ideas nearby, visit outcomes (demo, order, flyer, owner absent). |
| **Orders** | Reserve specific stands (TT-01…TT-15), unit price, discount, below-minimum approval with a reason, payments (cash/EFT/SnapScan…), payment status, delivery. Pipeline stages: unpaid → partially paid → fully paid → delivered. |
| **Stock safety** | A stand can only be in one active order. Every save re-checks this and refuses anything that would double-allocate, including from a second open tab. Unpaid holds expire after 48 h (never past the deadline) and are listed for **Release** or **Extend**. Part-paid orders never auto-release; cancelling them needs a refund note. |
| **Stand setup** | Per order: the customer's Google review link (with a format check and a Place ID → review link builder), where the link came from, branding source and notes, and a single "stand is ready" flag. Reminder never to ask for Google passwords or promise reviews. |
| **Settings** | Your details, dates, prices, stock count, targets, score weights, calling windows, message templates. |

Only **fully paid** orders count towards the 15-stand target.

## What is and isn't tested

Tested automatically:
- 39 unit tests (`tests/domain.test.js`): phone parsing, CSV parsing, scoring, stock allocation and double-allocation protection, reservations and expiry, payments, follow-up limits, opt-outs, call queue order, import mapping/duplicates, store atomicity, migration of older saved data, Place ID links and imports.
- An end-to-end browser test (`tests/e2e/smoke.mjs`) on a phone-sized screen: settings → CSV import → scoring → call outcome → WhatsApp draft → opt-out → visit → order → payments → stand setup → delivery → over-allocation blocked → expired reservation released → backup, plus a no-horizontal-scroll check.
- Offline loading via the service worker was checked in headless Chromium.

Not tested / limitations:
- The app doesn't program NFC tags or make QR codes; do that with your usual tools, then tick "stand is ready".
- WhatsApp (`wa.me`), phone (`tel:`), email (`mailto:`) and Google Maps links open those apps. Nothing is sent automatically, and there are no Google, WhatsApp or payment API integrations.
- Calling windows per category are starting assumptions; adjust them in Settings.
- Mobile/landline detection is by number prefix; ported numbers may be wrong.
- No multi-device sync (see "where your data lives").

## Prospect lists from Google Places (compliant workflow)

Google's Maps Platform terms (section 3.2.3) forbid copying and saving business names, addresses or reviews from the Places API. Only **Place IDs** may be stored indefinitely (Service Specific Terms, "Google ID Caching"). Latitude/longitude may be kept for at most 30 days.

So prospect lists for this app contain **only Place IDs**, plus labels from our own searches (the category we searched for and an approximate area), and **placeholder names** like `Barber prospect GQ-014`:

- The call list shows these leads with **Open Google listing to call**. You see the real name, number and reviews in Google Maps and call from there.
- Record only what you confirm yourself (business name, owner, numbers they give you) with **Add confirmed name & number**.
- WhatsApp and email drafts are blocked until a placeholder name has been replaced.
- The Maps link, the visit route and the review link (`search.google.com/local/writereview?placeid=…`) are all built from the Place ID.
- Treat the search labels as temporary: replace them with confirmed details, or delete unconfirmed prospects, within 30 days of the search.

Never commit prospect CSVs to this repository (it's public, and the files are git-ignored).

## Code layout

```
index.html, css/app.css, sw.js, manifest.webmanifest
js/main.js            routing, rendering, event handling
js/store.js           localStorage persistence (atomic, integrity-checked saves)
js/domain/*.js        business rules – pure functions, unit tested
js/views/*.js         screens
tests/                unit tests, e2e smoke test, local server
```
