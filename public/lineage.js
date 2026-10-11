/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */

/**
 * @param {HTMLElement} root
 * @param {ProjectSnapshot} state
 */
export function renderLineage(root, state) {
  root.replaceChildren();
  for (const group of state.lineage) {
    const block = document.createElement('article');
    block.className = 'lineage-task';
    const title = document.createElement('h3');
    title.textContent = group.agent;
    block.append(title);
    const intent = document.createElement('p');
    intent.className = 'lineage-intent';
    intent.textContent = group.intent;
    block.append(intent);
    const list = document.createElement('ol');
    for (const attempt of group.attempts) {
      const item = document.createElement('li');
      item.className = `status-${attempt.status}`;
      const replay = attempt.replayOf ? ` replay of ${attempt.replayOf}` : '';
      item.textContent = `${attempt.attemptId} ${attempt.status}${replay}`;
      list.append(item);
    }
    block.append(list);
    root.append(block);
  }
}
