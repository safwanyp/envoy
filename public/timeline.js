/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */

/**
 * @param {HTMLElement} root
 * @param {ProjectSnapshot} state
 */
export function renderTimeline(root, state) {
  root.replaceChildren();
  for (const commit of [...state.commits].reverse()) {
    const item = document.createElement('article');
    item.className = 'commit';
    item.dataset.sha = commit.sha;
    item.dataset.key = `commit:${commit.sha}`;
    const title = document.createElement('h3');
    title.textContent = commit.summary ?? commit.message.trim();
    item.append(title);
    const meta = document.createElement('p');
    meta.className = 'commit-meta';
    const sha = document.createElement('code');
    sha.textContent = commit.sha.slice(0, 7);
    const who = commit.agent ?? 'envoy';
    const task = commit.task ?? 'merge';
    meta.append(sha, ` ${who} · ${task}`);
    if (commit.replayOf) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      const count = state.agents.filter((agent) => agent.taskId === commit.task && agent.replayOf).length;
      badge.textContent = `replayed ×${Math.max(count, 1)}`;
      meta.append(badge);
    }
    item.append(meta);
    root.append(item);
  }
}
