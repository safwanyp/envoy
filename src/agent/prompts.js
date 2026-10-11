/** @typedef {import('../git/types').ReplayContext} ReplayContext */

const EDIT = `You edit a tiny JavaScript API. Use the tools. Claim a file before you write it. Finish when the task is done. Do not add conflict markers.`;

/**
 * @returns {string}
 */
export function planPrompt() {
  return 'Return a one-line summary and the files or symbols you will touch. Do not edit yet.';
}

/**
 * @param {ReplayContext | null} replay
 * @returns {string}
 */
export function editPrompt(replay) {
  if (!replay) return EDIT;
  const reasons = replay.landed.map((item) => `${item.agent}: ${item.intent} (${item.sha})`).join('\n');
  return `${EDIT}\nMain moved underneath you for these reasons:\n${reasons}\nYour previous diff is reference only. Do not apply it blindly.\n${replay.previousDiff}`;
}
