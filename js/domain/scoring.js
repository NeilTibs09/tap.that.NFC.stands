// Lead scoring. Each criterion is rated Unknown / No / Some / Strong by the seller,
// with written evidence. Unknown contributes 0 points but is reported separately
// so a low score from missing information isn't mistaken for a weak prospect.

import { SCORE_CRITERIA, category } from './constants.js';

export function emptyScores() {
  return Object.fromEntries(SCORE_CRITERIA.map((c) => [c.key, { level: null, evidence: '' }]));
}

export function weightsTotal(weights) {
  return SCORE_CRITERIA.reduce((acc, c) => acc + (Number(weights?.[c.key]) || 0), 0);
}

export function scoreLead(lead, weights) {
  const total = weightsTotal(weights) || 1;
  let points = 0;
  let knownWeight = 0;
  const breakdown = SCORE_CRITERIA.map((c) => {
    const w = Number(weights?.[c.key]) || 0;
    const entry = lead?.scores?.[c.key] || { level: null, evidence: '' };
    const level = entry.level === null || entry.level === undefined || entry.level === '' ? null : Number(entry.level);
    const earned = level === null ? 0 : level * w;
    if (level !== null) knownWeight += w;
    points += earned;
    return { ...c, weight: w, level, earned, evidence: entry.evidence || '' };
  });
  // Normalise to /100 even if weights were edited to a different total.
  const score = Math.round((points / total) * 100);
  const knownPct = Math.round((knownWeight / total) * 100);
  const missingEvidence = breakdown.filter((b) => b.level !== null && b.level > 0 && !b.evidence.trim()).length;
  return { score, knownPct, breakdown, missingEvidence };
}

/** Sort comparator: category priority first, then score, then fewer unknowns. */
export function priorityCompare(a, b, weights) {
  const ca = category(a.category);
  const cb = category(b.category);
  if (ca.tier !== cb.tier) return ca.tier - cb.tier;
  const sa = scoreLead(a, weights);
  const sb = scoreLead(b, weights);
  if (sa.score !== sb.score) return sb.score - sa.score;
  if (ca.rank !== cb.rank) return ca.rank - cb.rank;
  return String(a.name).localeCompare(String(b.name));
}

export function scoreCompare(a, b, weights) {
  const sa = scoreLead(a, weights);
  const sb = scoreLead(b, weights);
  if (sa.score !== sb.score) return sb.score - sa.score;
  return priorityCompare(a, b, weights);
}
