/** @typedef {import('./state').Narration} Narration */

/**
 * @param {HTMLElement} root
 * @param {Narration} narration
 * @param {number} step
 * @returns {HTMLLIElement}
 */
export function appendTrail(root, narration, step) {
  root.querySelector('.trail-item.is-current')?.classList.remove('is-current');
  const item = document.createElement('li');
  item.className = `trail-item tone-${narration.tone} is-current`;
  const head = document.createElement('p');
  head.className = 'trail-head';
  const number = document.createElement('span');
  number.className = 'trail-step';
  number.textContent = String(step);
  const label = document.createElement('span');
  label.className = 'trail-label';
  label.textContent = narration.label;
  head.append(number, label);
  const title = document.createElement('p');
  title.className = 'trail-title';
  title.textContent = narration.title;
  const detail = document.createElement('p');
  detail.className = 'trail-detail';
  detail.textContent = narration.detail;
  item.append(head, title, detail);
  root.prepend(item);
  return item;
}
