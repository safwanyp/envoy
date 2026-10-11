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
 * @param {string} repo
 * @returns {string}
 */
export function mainRepoName(repo) {
  return `${repo}-main`;
}
