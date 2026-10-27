// CSV lead import: column auto-mapping, category/area detection and duplicate checks.

import { AREAS } from './constants.js';
import { parseCSV } from './csv.js';
import { newLead } from './leads.js';
import { parsePhone, splitPhones, toE164 } from './phone.js';
import { normaliseText, toNumber } from './util.js';

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Business name', synonyms: ['name', 'business', 'business name', 'company', 'company name', 'title', 'place name'] },
  { key: 'category', label: 'Category / type', synonyms: ['category', 'categories', 'type', 'industry', 'business type', 'category name'] },
  { key: 'phone', label: 'Phone(s)', synonyms: ['phone', 'phones', 'phone number', 'telephone', 'tel', 'contact number', 'number', 'landline', 'mobile', 'cell', 'cellphone'] },
  { key: 'whatsapp', label: 'WhatsApp number', synonyms: ['whatsapp', 'whatsapp number', 'wa'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'e mail', 'email address', 'emails'] },
  { key: 'website', label: 'Website', synonyms: ['website', 'web', 'site', 'url', 'web site', 'homepage'] },
  { key: 'address', label: 'Address', synonyms: ['address', 'full address', 'street', 'street address', 'location', 'formatted address'] },
  { key: 'area', label: 'Town / area', synonyms: ['area', 'town', 'city', 'region', 'territory'] },
  { key: 'suburb', label: 'Suburb', synonyms: ['suburb', 'neighborhood', 'neighbourhood', 'district'] },
  { key: 'contactName', label: 'Owner / contact', synonyms: ['owner', 'contact', 'contact name', 'contact person', 'decision maker', 'manager'] },
  { key: 'googleRating', label: 'Google rating', synonyms: ['rating', 'stars', 'google rating', 'totalscore', 'total score', 'average rating'] },
  { key: 'googleReviewCount', label: 'Google review count', synonyms: ['reviews', 'review count', 'reviewscount', 'reviews count', 'number of reviews', 'user ratings total', 'google reviews'] },
  { key: 'mapsUrl', label: 'Google Maps link', synonyms: ['maps url', 'google maps', 'maps link', 'place url', 'maps', 'google maps url', 'map link'] },
  { key: 'reviewUrl', label: 'Google review link', synonyms: ['review link', 'review url', 'google review link', 'write review url'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'comments', 'comment', 'description'] },
];

export function autoMap(headers) {
  const norm = headers.map((h) => normaliseText(h));
  const mapping = {};
  const used = new Set();
  // Exact synonym matches first, then "contains" matches.
  for (const pass of ['exact', 'contains']) {
    for (const f of IMPORT_FIELDS) {
      if (mapping[f.key] !== undefined) continue;
      const idx = norm.findIndex(
        (h, i) =>
          !used.has(i) &&
          f.synonyms.some((s) => (pass === 'exact' ? h === s : s.length > 3 && h.includes(s)))
      );
      if (idx !== -1) {
        mapping[f.key] = idx;
        used.add(idx);
      }
    }
  }
  return mapping;
}

const CATEGORY_RULES = [
  ['barber', /\bbarber|men s groom|mens groom|gents|fade|shave\b/],
  ['accommodation', /guest ?house|\bb ?and ?b\b|bed and breakfast|backpacker|\blodge\b|self catering|\binn\b|hostel|guest farm|chalet|\bhotel\b|accommodation/],
  ['beauty', /salon|\bnail|beauty|hair|\bspa\b|lash|brow|aesthetic|wax|make ?up|stylist/],
  ['tourism', /\btour|safari|surf school|surf lesson|adventure|charter|tourism|excursion|game drive|tourist|\bguide\b|activities|boat trip|kayak/],
  ['cafe', /cafe|coffee|bakery|baker|patisserie|deli\b|tea room|roaster/],
];

export function detectCategory(text) {
  const t = normaliseText(text);
  if (!t) return 'other';
  for (const [id, re] of CATEGORY_RULES) if (re.test(t)) return id;
  return 'other';
}

const AREA_RULES = [
  ['Cape St Francis', /cape st francis|cape saint francis/],
  ['St Francis Bay', /st francis|saint francis/],
  ['Jeffreys Bay', /jeffrey ?s bay|jeffreysbay|j bay|jbay|wavecrest|aston bay|paradise beach/],
  ['Humansdorp', /humansdorp/],
  ['Kariega', /kariega|uitenhage/],
  ['Despatch', /despatch/],
  [
    'Gqeberha',
    /gqeberha|port elizabeth|\bpe\b|walmer|summerstrand|humewood|newton park|mill park|lorraine|kabega|sunridge|greenacres|richmond hill|parsons|westering|framesby|theescombe|fairview|cotswold|mount pleasant|charlo|sherwood|bluewater|motherwell|kwazakhele|new brighton|north end|korsten|schoenmakerskop|seaview|baakens|algoa park|linton grange|kragga kamma/,
  ],
];

export function detectArea(...texts) {
  const t = normaliseText(texts.filter(Boolean).join(' '));
  for (const [area, re] of AREA_RULES) if (re.test(t)) return area;
  return '';
}

function normaliseArea(value) {
  if (!value) return '';
  const exact = AREAS.find((a) => normaliseText(a) === normaliseText(value));
  return exact || detectArea(value);
}

function get(row, mapping, key) {
  const i = mapping[key];
  return i === undefined || i === null || i === '' ? '' : String(row[Number(i)] ?? '').trim();
}

export function rowToLead(row, mapping, defaults = {}, now = new Date()) {
  const name = get(row, mapping, 'name');
  const rawCategory = get(row, mapping, 'category');
  const address = get(row, mapping, 'address');
  const areaCell = get(row, mapping, 'area');
  const area = normaliseArea(areaCell) || detectArea(address, name) || defaults.area || 'Other';
  const phones = splitPhones(get(row, mapping, 'phone')).map((p) => parsePhone(p));
  const wa = toE164(get(row, mapping, 'whatsapp')) || '';
  const rating = get(row, mapping, 'googleRating');
  const reviews = get(row, mapping, 'googleReviewCount');
  return newLead(
    {
      name,
      category: detectCategory(`${rawCategory} ${name}`) || defaults.category || 'other',
      area,
      suburb: get(row, mapping, 'suburb'),
      address,
      phones,
      whatsapp: wa,
      email: get(row, mapping, 'email'),
      website: get(row, mapping, 'website'),
      mapsUrl: get(row, mapping, 'mapsUrl'),
      reviewUrl: get(row, mapping, 'reviewUrl'),
      reviewUrlSource: get(row, mapping, 'reviewUrl') ? 'researched' : '',
      contactName: get(row, mapping, 'contactName'),
      googleRating: rating === '' || !Number.isFinite(toNumber(rating, NaN)) ? null : toNumber(rating),
      googleReviewCount: reviews === '' || !Number.isFinite(toNumber(reviews, NaN)) ? null : Math.round(toNumber(reviews)),
      notes: [rawCategory && `Imported category: ${rawCategory}`, get(row, mapping, 'notes')].filter(Boolean).join('\n'),
      source: defaults.source || 'csv import',
    },
    now
  );
}

export function findDuplicate(lead, existing) {
  const phones = new Set(lead.phones.map((p) => p.e164).filter(Boolean));
  if (lead.whatsapp) phones.add(lead.whatsapp);
  const key = normaliseText(lead.name);
  return (
    existing.find((e) => {
      if (phones.size && (e.phones || []).some((p) => p.e164 && phones.has(p.e164))) return true;
      if (phones.size && e.whatsapp && phones.has(e.whatsapp)) return true;
      return key && normaliseText(e.name) === key && e.area === lead.area;
    }) || null
  );
}

/** Parse CSV text and return a preview of what would be imported. */
export function planImport(text, existingLeads, mappingOverride, defaults = {}, now = new Date()) {
  const rows = parseCSV(text);
  if (!rows.length) return { headers: [], mapping: {}, items: [], errors: ['The file is empty.'] };
  const headers = rows[0].map((h) => String(h).trim());
  const mapping = mappingOverride || autoMap(headers);
  const errors = [];
  if (mapping.name === undefined || mapping.name === '') errors.push('Pick which column holds the business name.');
  const items = [];
  const accepted = [];
  rows.slice(1).forEach((row, i) => {
    const lead = rowToLead(row, mapping, defaults, now);
    const problems = [];
    if (!lead.name) problems.push('No business name');
    if (!lead.phones.length && !lead.email && !lead.whatsapp && !lead.address) problems.push('No phone, email or address');
    const dup = lead.name ? findDuplicate(lead, existingLeads) || findDuplicate(lead, accepted) : null;
    if (!problems.length && !dup) accepted.push(lead);
    items.push({ line: i + 2, lead, duplicateOf: dup, problems });
  });
  return { headers, mapping, items, errors };
}

export const TEMPLATE_HEADERS = [
  'Business name',
  'Category',
  'Phone',
  'WhatsApp',
  'Email',
  'Website',
  'Address',
  'Suburb',
  'Town',
  'Owner',
  'Google rating',
  'Google reviews',
  'Google Maps link',
  'Review link',
  'Notes',
];
