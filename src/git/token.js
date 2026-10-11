/**
 * Artifacts tokens look like `art_v1_<secret>?expires=<unix>`.
 * Git basic auth wants the secret only.
 * @param {string} token
 * @returns {string}
 */
export function tokenSecret(token) {
  const marker = '?expires=';
  const at = token.indexOf(marker);
  return at === -1 ? token : token.slice(0, at);
}
