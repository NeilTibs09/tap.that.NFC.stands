// Message drafts and deep links (WhatsApp, phone, email, Google Maps).
// Nothing here sends anything: links open the relevant app with a draft
// that the seller reviews and sends by hand, one business at a time.

import { firstName, isPlaceholderName } from './leads.js';
import { formatRand } from './util.js';

export function fillTemplate(template, vars) {
  return String(template || '')
    .replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : m))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function messageVars(lead, settings) {
  return {
    business: lead.name || 'your business',
    firstName: firstName(lead) || 'there',
    area: lead.suburb || lead.area || 'your area',
    seller: settings.seller?.name || 'the Tap That team',
    sellerPhone: settings.seller?.phone || '',
    price: formatRand(settings.defaultPrice || settings.minPrice),
    categoryLine: settings.categoryLines?.[lead.category] || settings.categoryLines?.other || '',
  };
}

/** Pick the right WhatsApp template for where the lead is in the conversation. */
export function whatsappTemplateKey(contact) {
  if (!contact || contact.attempts === 0) return 'whatsappIntro';
  if (contact.engaged || contact.consent) return 'whatsappEngaged';
  const n = Math.min(3, Math.max(1, contact.contactedToday ? contact.followUpsUsed || 1 : contact.followUpsUsed + 1));
  return `whatsappFollowUp${n}`;
}

export function whatsappDraft(lead, settings, contact) {
  const key = whatsappTemplateKey(contact);
  return { key, text: fillTemplate(settings.templates[key], messageVars(lead, settings)) };
}

export function emailDraft(lead, settings) {
  const vars = messageVars(lead, settings);
  return {
    subject: fillTemplate(settings.templates.emailSubject, vars),
    body: fillTemplate(settings.templates.emailBody, vars),
  };
}

export function waLink(e164, text = '') {
  const digits = String(e164 || '').replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(e164) {
  return `tel:${String(e164 || '').replace(/[^+\d]/g, '')}`;
}

export function mailtoLink(email, subject = '', body = '') {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}${params.length ? '?' + params.join('&') : ''}`;
}

/** Google Maps link for a lead. With a Place ID it opens that exact listing. */
export function mapsSearchLink(lead) {
  // A placeholder name would only confuse Maps' fallback search; the Place ID does the work.
  const name = isPlaceholderName(lead.name) ? '' : lead.name;
  const q = [name, lead.address || lead.suburb, lead.area].filter(Boolean).join(', ');
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return lead.placeId ? `${base}&query_place_id=${encodeURIComponent(lead.placeId)}` : base;
}

function placeQuery(lead) {
  return [lead.address || lead.name, lead.address ? '' : lead.suburb, lead.area].filter(Boolean).join(', ');
}

/**
 * Google Maps driving directions through up to 10 stops (Maps URL limit).
 * When every stop has a Place ID, the exact listings are used.
 */
export function routeLink(leads) {
  const list = leads.filter((l) => l.placeId || placeQuery(l)).slice(0, 10);
  if (!list.length) return '';
  const text = list.map(placeQuery);
  const usePlaceIds = list.every((l) => l.placeId);
  const last = list.length - 1;
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(text[last])}`;
  if (usePlaceIds) url += `&destination_place_id=${encodeURIComponent(list[last].placeId)}`;
  if (last > 0) {
    url += `&waypoints=${encodeURIComponent(text.slice(0, last).join('|'))}`;
    if (usePlaceIds) url += `&waypoint_place_ids=${encodeURIComponent(list.slice(0, last).map((l) => l.placeId).join('|'))}`;
  }
  return url;
}

// --- Review links --------------------------------------------------------

export function writeReviewUrl(placeId) {
  const id = String(placeId || '').trim();
  return id ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}` : '';
}

/** Check a review URL looks like a Google link. Returns {level: ok|warn|bad, message}. */
export function checkReviewUrl(url) {
  const u = String(url || '').trim();
  if (!u) return { level: 'bad', message: 'No review link yet.' };
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return { level: 'bad', message: "That isn't a valid web address." };
  }
  if (parsed.protocol !== 'https:') return { level: 'warn', message: 'Use an https:// link.' };
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'g.page' && /^\/r\//.test(parsed.pathname)) {
    return { level: 'ok', message: 'Google Business Profile review link – opens the review form.' };
  }
  if (host === 'search.google.com' && parsed.pathname.startsWith('/local/writereview') && parsed.searchParams.get('placeid')) {
    return { level: 'ok', message: 'Google write-review link – opens the review form.' };
  }
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
    return { level: 'warn', message: 'Maps share link – opens the listing, not straight to the review form. Prefer a review link.' };
  }
  if (/^google\.[a-z.]+$/.test(host) || host === 'maps.google.com') {
    return { level: 'warn', message: 'Google Maps listing link – customers need an extra tap to review. Prefer a review link.' };
  }
  return { level: 'bad', message: "This doesn't look like a Google link. Double-check before programming the stand." };
}

export function safeHref(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^(https?:|tel:|mailto:)/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return `https://${u}`;
  return '';
}
