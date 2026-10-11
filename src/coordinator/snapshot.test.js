/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMainMoved, emptySnapshot, registerAttempt } from './snapshot.js';

test('a main push is appended without dropping agents', () => {
  const start = emptySnapshot();
  start.agents.push({
    attemptId: 'a_1',
    taskId: 't_health',
    agent: 'agent-4',
    intent: 'Add GET /health',
    status: 'editing',
    replayOf: null,
    replayCount: 0,
    sha: null,
    blockedBy: [],
  });
  const next = applyMainMoved(start, { repo: 'demo-main', after: 'abc123' });
  assert.equal(next.agents.length, 1);
  assert.equal(next.agents[0]?.attemptId, 'a_1');
  assert.deepEqual(next.events, [{ type: 'main-moved', repo: 'demo-main', after: 'abc123' }]);
  assert.equal(start.events.length, 0);
});

test('a push that touches a claimed symbol replays that attempt', () => {
  const start = registerAttempt(emptySnapshot(), editingAgent(), [
    {
      attemptId: 'a_1',
      path: 'src/routes/auth.js',
      symbol: 'validateLogin',
      kind: 'declared',
      createdAt: 0,
    },
  ]);
  const next = applyMainMoved(start, {
    repo: 'demo-main',
    after: 'def456',
    changes: [{ path: 'src/routes/auth.js', symbols: ['validateLogin'] }],
  });
  assert.equal(next.agents[0]?.status, 'replaying');
  assert.equal(next.agents[1]?.attemptId, 'a_2');
  assert.equal(next.agents[1]?.status, 'editing');
  assert.equal(next.agents[1]?.replayOf, 'a_1');
  assert.equal(next.agents[1]?.replayCount, 1);
  assert.deepEqual(
    next.events.map((event) => event.type),
    ['main-moved', 'stale', 'replay'],
  );
  const again = applyMainMoved(next, {
    repo: 'demo-main',
    after: 'def456',
    changes: [{ path: 'src/routes/auth.js', symbols: ['validateLogin'] }],
  });
  assert.equal(again.agents.length, 2);
});

test('a push on another file leaves the attempt editing', () => {
  const start = registerAttempt(emptySnapshot(), editingAgent(), [
    {
      attemptId: 'a_1',
      path: 'src/routes/auth.js',
      symbol: 'validateLogin',
      kind: 'declared',
      createdAt: 0,
    },
  ]);
  const next = applyMainMoved(start, {
    repo: 'demo-main',
    after: 'abc123',
    changes: [{ path: 'src/server.js', symbols: ['health'] }],
  });
  assert.equal(next.agents.length, 1);
  assert.equal(next.agents[0]?.status, 'editing');
  assert.deepEqual(next.events.map((event) => event.type), ['main-moved']);
});

/**
 * @returns {import('./types').AttemptView}
 */
function editingAgent() {
  return {
    attemptId: 'a_1',
    taskId: 't_rate_limit',
    agent: 'agent-1',
    intent: 'Add per-IP rate limiting to login',
    status: 'editing',
    replayOf: null,
    replayCount: 0,
    sha: null,
    blockedBy: [],
  };
}
