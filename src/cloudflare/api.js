/**
 * @param {string} accountId
 * @param {string} namespace
 * @returns {string}
 */
export function artifactsReposUrl(accountId, namespace) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/artifacts/namespaces/${namespace}/repos`;
}

/**
 * @param {string} accountId
 * @returns {string}
 */
export function eventSubscriptionsUrl(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/event_subscriptions/subscriptions`;
}

/**
 * @param {string} accountId
 * @returns {string}
 */
export function queuesUrl(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`;
}

/**
 * @param {string} accountId
 * @param {string} queueId
 * @returns {string}
 */
export function queuePullUrl(accountId, queueId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues/${queueId}/messages/pull`;
}

/**
 * @param {string} accountId
 * @param {string} namespace
 * @param {string} name
 * @returns {string}
 */
export function artifactsRepoUrl(accountId, namespace, name) {
  return `${artifactsReposUrl(accountId, namespace)}/${encodeURIComponent(name)}`;
}

/**
 * @param {string} accountId
 * @param {string} namespace
 * @param {string} name
 * @returns {string}
 */
export function artifactsForkUrl(accountId, namespace, name) {
  return `${artifactsRepoUrl(accountId, namespace, name)}/fork`;
}

/**
 * @param {string} accountId
 * @param {string} namespace
 * @returns {string}
 */
export function artifactsTokensUrl(accountId, namespace) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/artifacts/namespaces/${encodeURIComponent(namespace)}/tokens`;
}

/**
 * @param {string} accountId
 * @param {string} namespace
 * @param {string} name
 * @param {string} ref
 * @param {string} filePath
 * @returns {string}
 */
export function artifactsFileUrl(accountId, namespace, name, ref, filePath) {
  const url = new URL(`${artifactsRepoUrl(accountId, namespace, name)}/file`);
  url.searchParams.set('ref', ref);
  url.searchParams.set('path', filePath);
  return url.toString();
}

/**
 * @param {string} repo
 * @returns {string}
 */
export function mainRepoName(repo) {
  return `${repo}-main`;
}
