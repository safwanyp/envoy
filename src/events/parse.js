/**
 * @typedef {Object} PushedEvent
 * @property {string} namespace
 * @property {string} repo
 * @property {string} before
 * @property {string} after
 * @property {string} ref
 */

/**
 * @param {unknown} body
 * @returns {PushedEvent | null}
 */
export function parseArtifactsMessage(body) {
  const event = typeof body === 'string' ? safeJson(body) : body;
  if (!event || typeof event !== 'object') return null;
  if (!('type' in event) || event.type !== 'cf.artifacts.repo.pushed') return null;
  const source = 'source' in event && event.source && typeof event.source === 'object' ? event.source : {};
  const payload = 'payload' in event && event.payload && typeof event.payload === 'object' ? event.payload : {};
  const after = 'after' in payload && typeof payload.after === 'string' ? payload.after : '';
  if (after.length === 0) return null;
  return {
    namespace: stringField(source, 'namespace'),
    repo: stringField(source, 'repoName'),
    before: stringField(payload, 'before'),
    after,
    ref: stringField(payload, 'ref'),
  };
}

/**
 * @param {string} repo
 * @returns {string}
 */
export function projectFromRepo(repo) {
  const suffix = '-main';
  if (repo.endsWith(suffix) && repo.length > suffix.length) return repo.slice(0, -suffix.length);
  return 'demo';
}

/**
 * @param {string} raw
 * @returns {unknown}
 */
function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {object} record
 * @param {string} key
 * @returns {string}
 */
function stringField(record, key) {
  if (!(key in record)) return '';
  const value = /** @type {Record<string, unknown>} */ (record)[key];
  return typeof value === 'string' ? value : '';
}
