// Campaign constants and default settings. Everything here that a seller might
// want to change is copied into state.settings and editable on the Settings page.

export const CATEGORIES = [
  { id: 'barber', label: "Barber / men's grooming", short: 'Barber', tier: 1, rank: 1 },
  { id: 'accommodation', label: 'Guest house / B&B / backpackers', short: 'Accommodation', tier: 1, rank: 2 },
  { id: 'beauty', label: 'Beauty / nails / hair salon', short: 'Beauty & hair', tier: 1, rank: 3 },
  { id: 'tourism', label: 'Tourism operator / tour guide', short: 'Tourism', tier: 1, rank: 4 },
  { id: 'cafe', label: 'Café / coffee shop / bakery', short: 'Café & bakery', tier: 2, rank: 5 },
  { id: 'other', label: 'Other review-driven business', short: 'Other', tier: 3, rank: 6 },
];

export const TIER_LABEL = { 1: 'High priority', 2: 'Medium priority', 3: 'Additional' };

export function category(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export const AREAS = [
  'Gqeberha',
  'Kariega',
  'Despatch',
  'Jeffreys Bay',
  'Humansdorp',
  'St Francis Bay',
  'Cape St Francis',
  'Other',
];

// Manual pipeline stages (set by the seller or by logged outcomes).
export const LEAD_STAGES = [
  { id: 'prospect', label: 'Prospect', open: true },
  { id: 'interested', label: 'Interested', open: true },
  { id: 'appointment', label: 'Appointment booked', open: true },
  { id: 'demo', label: 'Demonstration completed', open: true },
  { id: 'declined', label: 'Declined', open: false },
  { id: 'opted_out', label: 'Opted out – do not contact', open: false },
  { id: 'not_suitable', label: 'Not suitable', open: false },
];

// Full pipeline, including stages derived from orders.
export const PIPELINE = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'interested', label: 'Interested' },
  { id: 'appointment', label: 'Appointment booked' },
  { id: 'demo', label: 'Demonstration completed' },
  { id: 'order_unpaid', label: 'Order confirmed – unpaid' },
  { id: 'order_partial', label: 'Partially paid' },
  { id: 'order_paid', label: 'Fully paid' },
  { id: 'delivered', label: 'Delivered' },
];

export const CLOSED_STAGES = ['declined', 'opted_out', 'not_suitable'];
export const ENGAGED_STAGES = ['interested', 'appointment', 'demo'];
export const OPEN_STAGE_ORDER = ['prospect', 'interested', 'appointment', 'demo'];

export function stageLabel(id) {
  return (
    PIPELINE.find((s) => s.id === id)?.label || LEAD_STAGES.find((s) => s.id === id)?.label || id
  );
}

export const SCORE_CRITERIA = [
  {
    key: 'access',
    label: 'Owner / decision-maker accessibility',
    hint: 'Is the owner usually on site, or can you reach them directly?',
  },
  {
    key: 'multi',
    label: 'Potential for multiple stands',
    hint: 'Several chairs, stations, rooms, counters or branches?',
  },
  {
    key: 'active',
    label: 'Active business with regular customers',
    hint: 'Evidence of steady trade: recent reviews, busy when visited, current hours.',
  },
  {
    key: 'reviewGap',
    label: 'Opportunity to improve review collection',
    hint: 'Evidence they would benefit, e.g. reviews lag behind visible customer volume or competitors.',
  },
  {
    key: 'lowOnline',
    label: 'Limited online engagement',
    hint: 'Few replies/posts, not asking for reviews. Low activity on its own is NOT proof of a strong prospect.',
  },
];

export const SCORE_LEVELS = [
  { value: null, label: 'Unknown' },
  { value: 0, label: 'No' },
  { value: 0.5, label: 'Some' },
  { value: 1, label: 'Strong' },
];

export const CHANNELS = [
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'visit', label: 'Visit' },
  { id: 'note', label: 'Note' },
];

export const OUTBOUND_CHANNELS = ['call', 'whatsapp', 'email', 'visit'];

// stage: moves the lead to this stage (forward-only for open stages; closed stages always apply)
// consent: the prospect agreed to be contacted again (doesn't burn the follow-up limit)
// needsTime: the form asks for a date/time (callback or visit)
export const OUTCOMES = {
  call: [
    { id: 'no_answer', label: 'No answer' },
    { id: 'voicemail', label: 'Left voicemail' },
    { id: 'gatekeeper', label: 'Spoke to gatekeeper', needsTime: 'callback' },
    { id: 'callback', label: 'Asked me to call back', consent: true, needsTime: 'callback' },
    { id: 'interested', label: 'Interested', stage: 'interested' },
    { id: 'appointment', label: 'Visit booked', stage: 'appointment', needsTime: 'visit' },
    { id: 'declined', label: 'Not interested', stage: 'declined' },
    { id: 'opted_out', label: 'Do not contact again', stage: 'opted_out' },
    { id: 'wrong_number', label: 'Wrong / dead number' },
  ],
  whatsapp: [
    { id: 'sent', label: 'Message sent' },
    { id: 'interested', label: 'Replied – interested', stage: 'interested' },
    { id: 'callback', label: 'Replied – contact me later', consent: true, needsTime: 'callback' },
    { id: 'appointment', label: 'Replied – visit booked', stage: 'appointment', needsTime: 'visit' },
    { id: 'declined', label: 'Replied – not interested', stage: 'declined' },
    { id: 'opted_out', label: 'Replied STOP / opt out', stage: 'opted_out' },
  ],
  email: [
    { id: 'sent', label: 'Email sent' },
    { id: 'interested', label: 'Replied – interested', stage: 'interested' },
    { id: 'appointment', label: 'Replied – visit booked', stage: 'appointment', needsTime: 'visit' },
    { id: 'declined', label: 'Replied – not interested', stage: 'declined' },
    { id: 'opted_out', label: 'Asked to be removed', stage: 'opted_out' },
    { id: 'bounced', label: 'Bounced' },
  ],
  visit: [
    { id: 'owner_absent', label: 'Owner not there', needsTime: 'callback' },
    { id: 'flyer', label: 'Left a flyer', needsTime: 'callback' },
    { id: 'demo', label: 'Demo done', stage: 'demo' },
    { id: 'appointment', label: 'Booked a return visit', stage: 'appointment', needsTime: 'visit' },
    { id: 'interested', label: 'Interested, thinking about it', stage: 'interested' },
    { id: 'order', label: 'Order taken', stage: 'demo' },
    { id: 'declined', label: 'Not interested', stage: 'declined' },
    { id: 'opted_out', label: 'Do not contact again', stage: 'opted_out' },
  ],
  note: [{ id: 'note', label: 'Note' }],
};

export function outcome(channel, id) {
  return (OUTCOMES[channel] || []).find((o) => o.id === id);
}

export const PAYMENT_METHODS = ['Cash', 'EFT', 'SnapScan', 'Zapper', 'Card', 'Other'];

export const EXPENSE_CATEGORIES = [
  { id: 'fuel', label: 'Fuel / mileage', travel: true },
  { id: 'toll', label: 'Toll', travel: true },
  { id: 'parking', label: 'Parking', travel: true },
  { id: 'printing', label: 'Printing / flyers', travel: false },
  { id: 'other', label: 'Other', travel: false },
];

export const PERSO_STEPS = [
  { key: 'linkVerified', label: 'Review link opened and confirmed it is the right business', group: 'config' },
  { key: 'logoApplied', label: 'Logo / branding applied (or confirmed none needed)', group: 'config' },
  { key: 'nfcWritten', label: 'NFC tag programmed with the review link', group: 'config' },
  { key: 'qrApplied', label: 'QR code applied to the stand', group: 'config' },
  { key: 'testedAndroid', label: 'Tested NFC tap on an Android phone', group: 'test' },
  { key: 'testedIphone', label: 'Tested NFC tap on an iPhone', group: 'test' },
  { key: 'testedQr', label: 'Tested QR scan opens the review page', group: 'test' },
];

const window = (morning, afternoon) => ({ morning, afternoon });

// Suggested calling windows. These are starting assumptions, not data – edit in Settings.
export const DEFAULT_CALL_WINDOWS = {
  barber: window(['09:00', '11:00'], ['14:00', '15:30']),
  accommodation: window(['10:00', '12:00'], ['14:00', '16:00']),
  beauty: window(['08:30', '10:00'], ['14:00', '15:30']),
  tourism: window(['08:00', '09:30'], ['16:00', '17:30']),
  cafe: window(['09:30', '11:00'], ['14:30', '16:00']),
  other: window(['09:00', '11:30'], ['14:00', '16:00']),
};

export const DEFAULT_CATEGORY_LINES = {
  barber:
    'New clients pick a barber off Google reviews, and a stand on your counter makes it easy for happy clients to leave one before they walk out.',
  accommodation:
    'Guests choose where to stay based on reviews, and a stand at reception or breakfast makes it easy for them to review you at checkout.',
  beauty: 'A stand at reception lets happy clients leave a Google review in seconds while they pay.',
  tourism:
    'Guests can tap the stand at the end of a tour and leave a review while the experience is still fresh.',
  cafe: 'A small stand at the till lets regulars leave a Google review with one tap.',
  other: 'A stand on your counter makes it easy for happy customers to leave a Google review.',
};

export const DEFAULT_TEMPLATES = {
  whatsappIntro:
    "Hi {firstName}, it's {seller} from Tap That. I supply Google Review stands to local businesses. Customers tap their phone on the stand (or scan the QR code) and your Google review page opens straight away. {categoryLine}\n\nThey're {price} each, personalised for {business} and set up on the spot in about 5 minutes. Could I pop in this week for a quick 2-minute demo?\n\nIf it's not for you, just reply STOP and I won't message again.",
  whatsappFollowUp1:
    "Hi {firstName}, {seller} from Tap That again. Just checking if you saw my message about the Google Review stand for {business}? I'm in {area} this week and can show you how it works in 2 minutes. Would a quick visit suit you? (Reply STOP and I won't message again.)",
  whatsappFollowUp2:
    'Hi {firstName}, I have a few stands left this week ({price} each, set up in 5 minutes). Happy to drop by {business} for a quick demo if you have a moment. (Reply STOP to opt out.)',
  whatsappFollowUp3:
    "Hi {firstName}, last message from me, I promise! If a Google Review stand for {business} would be useful, just reply and I'll bring one past. Otherwise, all the best. – {seller}",
  whatsappEngaged:
    'Hi {firstName}, {seller} from Tap That. Thanks for your interest in the review stand for {business}. When suits you for a quick visit? I can set it up on the spot.',
  emailSubject: 'Google Review stand for {business}',
  emailBody:
    "Hi {firstName},\n\nMy name is {seller} from Tap That. I supply Google Review stands to local businesses in the Eastern Cape.\n\nCustomers tap their phone on the stand (NFC) or scan its QR code, and your Google review page opens straight away, so it's easier for happy customers to leave a review. {categoryLine}\n\nEach stand is {price}, personalised for {business}, and I set it up on the spot in about 5 minutes. I never need your Google password.\n\nCould I visit this week to show you how it works? It takes about 2 minutes.\n\nKind regards,\n{seller}\n{sellerPhone}\n\nIf you'd prefer not to hear from me again, just reply and let me know.",
};

export const DEFAULT_AREA_KM = {
  Gqeberha: 40,
  Kariega: 70,
  Despatch: 60,
  'Jeffreys Bay': 160,
  Humansdorp: 180,
  'St Francis Bay': 200,
  'Cape St Francis': 210,
  Other: 50,
};

export const DEFAULT_SETTINGS = {
  campaignName: 'Tap That – Eastern Cape launch',
  startDate: '2026-10-26',
  endDate: '2026-11-01',
  stockArrivalDate: '2026-10-28',
  inventoryCount: 15,
  minPrice: 450,
  defaultPrice: 450,
  inventoryCost: 1400,
  travelBudget: 1000,
  costPerKm: 2.5,
  reservationHours: 48,
  personalisationMinutes: 5,
  maxFollowUps: 3,
  dailyTargets: { calls: 50, whatsapp: 50, emails: 10, visits: 20 },
  scoringWeights: { access: 25, multi: 25, active: 20, reviewGap: 20, lowOnline: 10 },
  seller: { name: '', phone: '', email: '' },
  callWindows: DEFAULT_CALL_WINDOWS,
  categoryLines: DEFAULT_CATEGORY_LINES,
  templates: DEFAULT_TEMPLATES,
  areaKm: DEFAULT_AREA_KM,
};
