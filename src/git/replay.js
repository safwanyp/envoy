/** @typedef {import('../git/types').ReplayContext} ReplayContext */
/** @typedef {import('../git/types').ReplayLanded} ReplayLanded */

/**
 * @param {{ sha: string, message: string }[]} commits
 * @param {string} previousDiff
 * @param {(message: string) => { agent: string, intent: string, claims: string[] }} parse
 * @returns {ReplayContext}
 */
export function buildReplayContext(commits, previousDiff, parse) {
  /** @type {ReplayLanded[]} */
  const landed = [];
  for (const commit of commits) {
    try {
      const intent = parse(commit.message);
  /** @type {string[]} */
  const paths = [];
      for (const claim of intent.claims) {
        const path = claim.split('#')[0] ?? claim;
        if (!paths.includes(path)) paths.push(path);
      }
      landed.push({
        sha: commit.sha,
        agent: intent.agent,
        intent: intent.intent,
        paths,
      });
    } catch {
      continue;
    }
  }
  return { landed, previousDiff };
}
