/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */

/**
 * @param {HTMLElement} root
 * @param {ProjectSnapshot} state
 */
export function renderRadar(root, state) {
  /** @type {Map<string, import('./state').Claim[]>} */
  const byPath = new Map();
  for (const claim of state.claims) {
    const list = byPath.get(claim.path) ?? [];
    list.push(claim);
    byPath.set(claim.path, list);
  }
  root.replaceChildren();
  for (const [path, claims] of byPath) {
    const row = document.createElement('article');
    row.className = 'radar-row';
    const agents = new Set(claims.map((claim) => claim.attemptId));
    if (agents.size > 1) row.classList.add('overlap');
    const title = document.createElement('h3');
    title.className = 'radar-path';
    title.textContent = path;
    row.append(title);
    /** @type {Map<string, import('./state').Claim[]>} */
    const bySymbol = new Map();
    for (const claim of claims) {
      const key = claim.symbol ?? '(file)';
      const list = bySymbol.get(key) ?? [];
      list.push(claim);
      bySymbol.set(key, list);
    }
    for (const [symbol, group] of bySymbol) {
      const line = document.createElement('div');
      line.className = 'radar-symbol';
      const name = document.createElement('code');
      name.className = 'symbol-name';
      name.textContent = symbol;
      line.append(name);
      for (const claim of group) {
        const agent = state.agents.find((item) => item.attemptId === claim.attemptId);
        const status = agent?.status ?? 'planning';
        const chip = document.createElement('span');
        chip.className = `chip ${agentClass(agent?.agent ?? '')} status-${status}`;
        chip.title = status;
        chip.textContent = agent?.agent ?? claim.attemptId;
        line.append(chip);
      }
      row.append(line);
    }
    root.append(row);
  }
}

/**
 * @param {string} agent
 * @returns {string}
 */
function agentClass(agent) {
  const n = agent.replace('agent-', '');
  return `agent-${n || 'x'}`;
}
