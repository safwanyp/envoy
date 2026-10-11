import { renderLineage } from './lineage.js';
import { renderRadar } from './radar.js';
import { renderTimeline } from './timeline.js';

const project = new URL(location.href).searchParams.get('project') ?? 'demo';

/** @type {HTMLButtonElement | null} */
const runDemo = document.querySelector('#run-demo');
/** @type {HTMLElement | null} */
const demoStatus = document.querySelector('#demo-status');
/** @type {HTMLElement | null} */
const radar = document.querySelector('#radar');
/** @type {HTMLElement | null} */
const timeline = document.querySelector('#timeline');
/** @type {HTMLElement | null} */
const lineage = document.querySelector('#lineage');

/**
 * @param {import('./state').ProjectSnapshot} state
 */
function render(state) {
  if (radar) renderRadar(radar, state);
  if (timeline) renderTimeline(timeline, state);
  if (lineage) renderLineage(lineage, state);
  if (demoStatus && state.events.length > 0) {
    demoStatus.textContent = describe(state.events[state.events.length - 1]);
  }
}

/**
 * @param {import('./state').DemoEvent | undefined} event
 * @returns {string}
 */
function describe(event) {
  if (!event) return '';
  if (event.type === 'yield') return `${event.agent} yielded`;
  if (event.type === 'stale') return `${event.agent} is stale and will replay`;
  if (event.type === 'replay') return `${event.agent} replaying (${event.reason})`;
  if (event.type === 'landed') return `${event.agent} landed (${event.kind})`;
  if (event.type === 'needs-human') return `${event.agent} needs a human`;
  if (event.type === 'proceed') return `${event.agent} proceeding`;
  if (event.type === 'resume') return `${event.agent} resumed`;
  if (event.type === 'failed') return `${event.agent} failed`;
  if (event.type === 'main-moved') return `main moved to ${event.after.slice(0, 7)}`;
  return '';
}

/**
 * @returns {Promise<void>}
 */
async function refreshState() {
  const res = await fetch(`/api/state?project=${encodeURIComponent(project)}`);
  if (!res.ok) throw new Error(`state ${res.status}`);
  render(/** @type {import('./state').ProjectSnapshot} */ (await res.json()));
}

/**
 * @returns {Promise<void>}
 */
async function onRunDemo() {
  if (!runDemo || !demoStatus) return;
  runDemo.disabled = true;
  demoStatus.textContent = 'Starting demo…';
  try {
    const res = await fetch(`/api/demo?project=${encodeURIComponent(project)}`, { method: 'POST' });
    if (!res.ok || !res.body) {
      demoStatus.textContent = `Demo failed (${res.status})`;
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
        if (frame && typeof frame === 'object' && Array.isArray(frame.agents)) render(frame);
        else if (frame && typeof frame === 'object' && 'error' in frame) {
          demoStatus.textContent = String(frame.error);
        }
      }
    }
    await refreshState();
    if (demoStatus.textContent === 'Starting demo…') demoStatus.textContent = 'Demo finished.';
  } catch (err) {
    demoStatus.textContent = err instanceof Error ? err.message : 'Demo failed';
  } finally {
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
  const frame = JSON.parse(String(event.data));
  if (frame && typeof frame === 'object' && Array.isArray(frame.agents)) render(frame);
});

void refreshState().catch((err) => {
  if (demoStatus) demoStatus.textContent = err instanceof Error ? err.message : 'Failed to load state';
});
