/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */

/**
 * @param {HTMLElement} root
 * @param {ProjectSnapshot} state
 */
export function renderTimeline(root, state) {
  root.replaceChildren();
  for (const commit of state.commits) {
    const item = document.createElement('article');
    item.className = 'commit';
    const title = document.createElement('h3');
    title.textContent = commit.summary ?? commit.message.trim();
    item.append(title);
    const meta = document.createElement('p');
    meta.className = 'commit-meta';
    const who = commit.agent ?? 'envoy';
    const task = commit.task ?? 'merge';
    meta.textContent = `${who} · ${task} · ${commit.sha.slice(0, 7)}`;
    item.append(meta);
    if (commit.replayOf) {
      const badge = document.createElement('p');
      badge.className = 'badge';
      const count = state.agents.filter((agent) => agent.taskId === commit.task && agent.replayOf).length;
      badge.textContent = `replayed ×${Math.max(count, 1)}`;
      item.append(badge);
    }
    root.append(item);
  }
}
