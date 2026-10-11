/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMainMoved, emptySnapshot } from './snapshot.js';

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
