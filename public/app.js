import { renderLineage } from './lineage.js';
import { narrate, summarize } from './narrate.js';
import { renderRadar } from './radar.js';
import { renderTimeline } from './timeline.js';
import { appendTrail } from './trail.js';

/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */
/** @typedef {import('./state').Narration} Narration */

const STEP_MS = 1500;
const KEY_STEP_MS = 3000;

const project = new URL(location.href).searchParams.get('project') ?? 'demo';

/** @type {HTMLButtonElement | null} */
const runDemo = document.querySelector('#run-demo');
/** @type {HTMLElement | null} */
const demoStatus = document.querySelector('#demo-status');
/** @type {HTMLElement | null} */
const demoDetail = document.querySelector('#demo-detail');
/** @type {HTMLElement | null} */
const demoLabel = document.querySelector('#demo-label');
/** @type {HTMLElement | null} */
const demoStep = document.querySelector('#demo-step');
/** @type {HTMLElement | null} */
const now = document.querySelector('#now');
/** @type {HTMLElement | null} */
const radar = document.querySelector('#radar');
/** @type {HTMLElement | null} */
const timeline = document.querySelector('#timeline');
/** @type {HTMLElement | null} */
const lineage = document.querySelector('#lineage');
/** @type {HTMLElement | null} */
const trail = document.querySelector('#trail');

/** @type {ProjectSnapshot} */
const EMPTY = { agents: [], claims: [], commits: [], events: [], lineage: [] };

/** @type {Set<string>} */
let seenKeys = new Set();
let narrated = 0;
let playing = false;
/** @type {ProjectSnapshot[]} */
const queue = [];
/** @type {Promise<void> | null} */
let draining = null;

/**
 * @param {ProjectSnapshot} state
 * @param {boolean} flash
 */
function renderBoard(state, flash) {
  if (radar) renderRadar(radar, state);
  if (timeline) renderTimeline(timeline, state);
  if (lineage) renderLineage(lineage, state);
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {NodeListOf<HTMLElement>} */
  const keyed = document.querySelectorAll('[data-key]');
  for (const element of keyed) {
    const key = element.dataset.key ?? '';
    keys.add(key);
    if (flash && !seenKeys.has(key)) element.classList.add('is-new');
  }
  seenKeys = keys;
}

/**
 * @param {{ tone: string, label: string, title: string, detail: string, step?: number }} line
 */
function announce(line) {
  if (demoStatus) demoStatus.textContent = line.title;
  if (demoDetail) demoDetail.textContent = line.detail;
  if (demoLabel) demoLabel.textContent = line.label;
  if (demoStep) demoStep.textContent = line.step ? `Step ${line.step}` : '';
  if (now) {
    now.dataset.tone = line.tone;
    now.classList.remove('is-changing');
    void now.offsetWidth;
    now.classList.add('is-changing');
  }
}

function clearSpotlight() {
  for (const element of document.querySelectorAll('.is-focus, .is-active')) {
    element.classList.remove('is-focus', 'is-active');
    if (element instanceof HTMLElement) delete element.dataset.tone;
  }
}

/**
 * @param {Narration} narration
 */
function spotlight(narration) {
  clearSpotlight();
  /** @type {string[]} */
  const selectors = narration.focus.map((id) => `[data-attempt="${CSS.escape(id)}"]`);
  if (narration.sha) selectors.push(`[data-sha="${CSS.escape(narration.sha)}"]`);
  if (selectors.length === 0) return;
  for (const element of document.querySelectorAll(selectors.join(', '))) {
    if (!(element instanceof HTMLElement)) continue;
    element.classList.add('is-focus');
    element.dataset.tone = narration.tone;
    for (const container of [element.closest('.panel'), element.closest('.radar-row')]) {
      if (!(container instanceof HTMLElement)) continue;
      container.classList.add('is-active');
      container.dataset.tone = narration.tone;
    }
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {ProjectSnapshot} frame
 * @returns {Promise<void>}
 */
function enqueue(frame) {
  queue.push(frame);
  draining ??= drain().finally(() => {
    draining = null;
  });
  return draining;
}

/**
 * @returns {Promise<void>}
 */
async function drain() {
  while (queue.length > 0) {
    const frame = queue.shift();
    if (!frame) break;
    renderBoard(frame, true);
    for (const event of frame.events.slice(narrated)) {
      narrated++;
      const narration = narrate(event, frame);
      announce({ ...narration, step: narrated });
      if (trail) appendTrail(trail, narration, narrated);
      spotlight(narration);
      await wait(narration.tone === 'info' || narration.tone === 'ok' ? STEP_MS : KEY_STEP_MS);
    }
  }
}

/**
 * @param {ProjectSnapshot} state
 * @returns {boolean}
 */
function settled(state) {
  return state.agents.length > 0 && state.agents.every((agent) => agent.status !== 'editing' && agent.status !== 'planning' && agent.status !== 'yielding' && agent.status !== 'landing');
}

/**
 * @param {ProjectSnapshot} state
 */
function showHistory(state) {
  clearSpotlight();
  renderBoard(state, false);
  if (trail) {
    trail.replaceChildren();
    state.events.forEach((event, index) => appendTrail(trail, narrate(event, state), index + 1));
    trail.querySelector('.is-current')?.classList.remove('is-current');
  }
  narrated = state.events.length;
  if (state.events.length === 0) {
    announce({
      tone: 'info',
      label: 'Ready',
      title: 'Six agents, one main branch.',
      detail: 'Press Run demo to watch six agents take overlapping tasks. Each step is explained here and kept in the event trail.',
    });
  } else if (settled(state)) {
    announce({
      tone: 'ok',
      label: 'Last run',
      title: summarize(state),
      detail: 'The event trail lists every step. Press Run demo to watch it again.',
    });
  } else {
    const last = state.events[state.events.length - 1];
    if (last) announce({ ...narrate(last, state), step: state.events.length });
  }
}

/**
 * @returns {Promise<void>}
 */
async function refreshState() {
  const res = await fetch(`/api/state?project=${encodeURIComponent(project)}`);
  if (!res.ok) throw new Error(`state ${res.status}`);
  showHistory(/** @type {ProjectSnapshot} */ (await res.json()));
}

/**
 * @returns {Promise<void>}
 */
async function onRunDemo() {
  if (!runDemo) return;
  runDemo.disabled = true;
  playing = true;
  narrated = 0;
  seenKeys = new Set();
  clearSpotlight();
  renderBoard(EMPTY, false);
  trail?.replaceChildren();
  announce({ tone: 'info', label: 'Starting', title: 'Starting demo…', detail: 'Six agents are picking up their tasks.' });
  /** @type {ProjectSnapshot | null} */
  let last = null;
  try {
    const res = await fetch(`/api/demo?project=${encodeURIComponent(project)}`, { method: 'POST' });
    if (!res.ok || !res.body) {
      announce({ tone: 'danger', label: 'Error', title: `Demo failed (${res.status})`, detail: 'The demo endpoint did not start a run.' });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        const frame = JSON.parse(line);
        if (frame && typeof frame === 'object' && Array.isArray(frame.agents)) {
          last = /** @type {ProjectSnapshot} */ (frame);
          void enqueue(last);
        } else if (frame && typeof frame === 'object' && 'error' in frame) {
          await draining;
          announce({ tone: 'danger', label: 'Error', title: 'Demo failed', detail: String(frame.error) });
          return;
        }
      }
    }
    await draining;
    clearSpotlight();
    trail?.querySelector('.is-current')?.classList.remove('is-current');
    if (last) {
      const escalated = last.events.some((event) => event.type === 'needs-human' || event.type === 'failed');
      announce({
        tone: escalated ? 'warn' : 'ok',
        label: 'Done',
        title: summarize(last),
        detail: escalated
          ? 'At least one task stopped and needs a person. The event trail shows where.'
          : 'Nobody resolved a conflict by hand. The event trail keeps every step.',
      });
    }
  } catch (err) {
    announce({ tone: 'danger', label: 'Error', title: 'Demo failed', detail: err instanceof Error ? err.message : String(err) });
  } finally {
    playing = false;
    runDemo.disabled = false;
  }
}

runDemo?.addEventListener('click', () => {
  void onRunDemo();
});

const socket = new WebSocket(
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?project=${encodeURIComponent(project)}`,
);
socket.addEventListener('message', (event) => {
  if (playing) return;
  const frame = JSON.parse(String(event.data));
  if (frame && typeof frame === 'object' && Array.isArray(frame.agents)) showHistory(frame);
});

void refreshState().catch((err) => {
  announce({ tone: 'danger', label: 'Error', title: 'Failed to load state', detail: err instanceof Error ? err.message : String(err) });
});
