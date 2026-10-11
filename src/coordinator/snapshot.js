/** @typedef {import('../coordinator/types').ProjectSnapshot} ProjectSnapshot */
/** @typedef {import('../coordinator/types').DemoEvent} DemoEvent */

/**
 * @returns {ProjectSnapshot}
 */
export function emptySnapshot() {
  return { agents: [], claims: [], commits: [], events: [], lineage: [] };
}

/**
 * @param {ProjectSnapshot} snapshot
 * @param {{ repo: string, after: string }} push
 * @returns {ProjectSnapshot}
 */
export function applyMainMoved(snapshot, push) {
  /** @type {DemoEvent} */
  const event = { type: 'main-moved', repo: push.repo, after: push.after };
  return { ...snapshot, events: [...snapshot.events, event] };
}
