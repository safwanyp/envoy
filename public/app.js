const project = new URL(location.href).searchParams.get('project') ?? 'demo';

/** @type {HTMLButtonElement | null} */
const runDemo = document.querySelector('#run-demo');
/** @type {HTMLElement | null} */
const demoStatus = document.querySelector('#demo-status');

/**
 * @returns {Promise<void>}
 */
async function refreshState() {
  const res = await fetch(`/api/state?project=${encodeURIComponent(project)}`);
  if (!res.ok) {
    throw new Error(`state ${res.status}`);
  }
  // Panels stay empty until Day 2 wires live data.
  await res.json();
}

/**
 * @returns {Promise<void>}
 */
async function onRunDemo() {
  if (!runDemo || !demoStatus) return;
  runDemo.disabled = true;
  demoStatus.textContent = 'Starting demo…';
  try {
    const res = await fetch(`/api/demo?project=${encodeURIComponent(project)}`, {
      method: 'POST',
    });
    const body = /** @type {{ message?: string; error?: string }} */ (await res.json());
    if (!res.ok) {
      demoStatus.textContent = body.message ?? body.error ?? `Demo failed (${res.status})`;
      return;
    }
    demoStatus.textContent = 'Demo running.';
    await refreshState();
  } catch (err) {
    demoStatus.textContent = err instanceof Error ? err.message : 'Demo failed';
  } finally {
    runDemo.disabled = false;
  }
}

runDemo?.addEventListener('click', () => {
  void onRunDemo();
});

void refreshState().catch((err) => {
  if (demoStatus) {
    demoStatus.textContent = err instanceof Error ? err.message : 'Failed to load state';
  }
});
