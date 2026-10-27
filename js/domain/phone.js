// South African phone number normalisation and classification.
//
// National numbers are 0 + 9 digits. Classification is by prefix and is a best
// guess: numbers get ported, so treat "mobile" as "probably on WhatsApp", not a fact.
//   01x–05x  geographic landlines (041 = Gqeberha, 042 = Kouga/Jeffreys Bay/St Francis)
//   06x, 07x, 081–084  mobile
//   080 toll-free, 086 share-call/fax, 087 VoIP -> "other"

export const PHONE_TYPES = {
  mobile: 'Mobile',
  landline: 'Landline',
  other: 'VoIP / toll-free',
  unknown: 'Unknown',
};

/** Returns an E.164 string (+27XXXXXXXXX) or null when it isn't a recognisable SA number. */
export function toE164(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const plus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus && digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('27')) {
    let rest = digits.slice(2);
    // "+27 (0)82 ..." -> drop the trunk 0
    if (rest.length === 10 && rest.startsWith('0')) rest = rest.slice(1);
    return rest.length === 9 && rest[0] !== '0' ? `+27${rest}` : null;
  }
  if (plus) return null; // a foreign number we don't handle
  if (digits.length === 10 && digits.startsWith('0')) return `+27${digits.slice(1)}`;
  if (digits.length === 9 && digits[0] !== '0') return `+27${digits}`;
  return null;
}

export function classify(e164) {
  if (!e164 || !e164.startsWith('+27')) return 'unknown';
  const nsn = e164.slice(3);
  const a = nsn[0];
  const ab = nsn.slice(0, 2);
  if (a === '6' || a === '7') return 'mobile';
  if (['81', '82', '83', '84'].includes(ab)) return 'mobile';
  if (a === '8') return 'other';
  if (['1', '2', '3', '4', '5'].includes(a)) return 'landline';
  return 'unknown';
}

/** "+27821234567" -> "082 123 4567" */
export function formatNational(e164) {
  if (!e164 || !e164.startsWith('+27')) return e164 || '';
  const n = '0' + e164.slice(3);
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Parse a raw number into the stored phone shape. */
export function parsePhone(raw, label = '') {
  const e164 = toE164(raw);
  return {
    raw: String(raw ?? '').trim(),
    e164,
    type: classify(e164),
    label,
  };
}

/** Split a cell like "041 123 4567 / 082 123 4567" into individual numbers. */
export function splitPhones(cell) {
  if (!cell) return [];
  return String(cell)
    .split(/[\/;|\n]|,(?=\s*[+0-9(])|\bor\b/i)
    .map((s) => s.trim())
    .filter((s) => s.replace(/\D/g, '').length >= 9);
}

export function isMobile(phone) {
  return phone?.type === 'mobile' && !!phone.e164;
}
