/** @typedef {import('./types').Claim} Claim */
/** @typedef {import('./types').Overlap} Overlap */
/** @typedef {import('./types').RadarParty} RadarParty */

/**
 * @param {Claim[]} claims
 * @param {Claim} incoming
 * @returns {Overlap[]}
 */
export function findOverlaps(claims, incoming) {
  /** @type {Overlap[]} */
  const overlaps = [];
  for (const claim of claims) {
    if (claim.attemptId === incoming.attemptId) continue;
    if (claim.path !== incoming.path) continue;
    overlaps.push(toOverlap(claim, incoming));
  }
  return overlaps;
}

/**
 * @param {Overlap} overlap
 * @param {RadarParty} self
 * @param {RadarParty} other
 * @returns {'yield' | 'proceed'}
 */
export function decide(overlap, self, other) {
  if (overlap.level === 'symbol' && other.startedAt < self.startedAt) return 'yield';
  return 'proceed';
}

/**
 * @param {{ path: string, symbols: string[] }[]} landedChanges
 * @param {Claim[]} inFlightClaims
 * @returns {string[]}
 */
export function staleAfterLanding(landedChanges, inFlightClaims) {
  /** @type {Set<string>} */
  const stale = new Set();
  for (const claim of inFlightClaims) {
    const hit = landedChanges.some((change) => overlapsLanded(change, claim));
    if (hit) stale.add(claim.attemptId);
  }
  return [...stale].sort();
}

/**
 * @param {Claim} existing
 * @param {Claim} incoming
 * @returns {Overlap}
 */
function toOverlap(existing, incoming) {
  const left = existing.symbol;
  const right = incoming.symbol;
  if (left === null || right === null || left === right) {
    return {
      level: 'symbol',
      path: incoming.path,
      symbol: left === null ? right : left,
      attemptId: existing.attemptId,
    };
  }
  return {
    level: 'file',
    path: incoming.path,
    symbol: null,
    attemptId: existing.attemptId,
  };
}

/**
 * @param {{ path: string, symbols: string[] }} change
 * @param {Claim} claim
 * @returns {boolean}
 */
function overlapsLanded(change, claim) {
  if (change.path !== claim.path) return false;
  if (claim.symbol === null) return true;
  if (change.symbols.length === 0) return true;
  return change.symbols.includes(claim.symbol);
}
