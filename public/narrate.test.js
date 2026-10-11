import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrate, summarize } from './narrate.js';

/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */

/** @type {import('./state').AttemptView} */
const first = { attemptId: 'a_1', taskId: 't_rate_limit', agent: 'agent-1', intent: 'Add rate limiting', status: 'replaying', replayOf: null };
/** @type {import('./state').AttemptView} */
const yielder = { attemptId: 'a_6', taskId: 't_validate_login', agent: 'agent-2', intent: 'Validate login', status: 'landed', replayOf: null };
/** @type {import('./state').AttemptView} */
const replay = { attemptId: 'a_7', taskId: 't_rate_limit', agent: 'agent-1', intent: 'Add rate limiting', status: 'landed', replayOf: 'a_1' };

/** @type {ProjectSnapshot} */
const state = {
  agents: [first, yielder, replay],
  claims: [
    { attemptId: 'a_1', path: 'src/routes/auth.js', symbol: 'validateLogin' },
    { attemptId: 'a_6', path: 'src/routes/auth.js', symbol: 'validateLogin' },
  ],
  commits: [{ sha: 'abcdef1234', message: 'x', summary: 'Add rate limiting', agent: 'agent-1', task: 't_rate_limit', replayOf: 'a_1' }],
  events: [
    { type: 'yield', attemptId: 'a_6', agent: 'agent-2', waitingFor: ['a_1'] },
    { type: 'replay', attemptId: 'a_7', agent: 'agent-1', replayOf: 'a_1', reason: 'stale' },
    { type: 'landed', attemptId: 'a_7', agent: 'agent-1', sha: 'abcdef1234', kind: 'merge' },
  ],
  lineage: [
    {
      taskId: 't_rate_limit',
      agent: 'agent-1',
      intent: 'Add rate limiting',
      attempts: [first, replay],
    },
    {
      taskId: 't_validate_login',
      agent: 'agent-2',
      intent: 'Validate login',
      attempts: [yielder],
    },
  ],
};

test('a yield names the blocker and the shared function', () => {
  const event = state.events[0];
  assert.ok(event);
  const line = narrate(event, state);
  assert.equal(line.tone, 'warn');
  assert.equal(line.title, 'agent-2 waits for agent-1');
  assert.match(line.detail, /validateLogin\(\) in src\/routes\/auth\.js/);
  assert.deepEqual(line.focus, ['a_6', 'a_1']);
});

test('a replay focuses the old and new attempts', () => {
  const event = state.events[1];
  assert.ok(event);
  const line = narrate(event, state);
  assert.equal(line.tone, 'replay');
  assert.deepEqual(line.focus, ['a_7', 'a_1']);
  assert.match(line.detail, /main moved under it/);
});

test('a landing quotes the commit and the merge kind', () => {
  const event = state.events[2];
  assert.ok(event);
  const line = narrate(event, state);
  assert.equal(line.sha, 'abcdef1234');
  assert.equal(line.detail, 'Add rate limiting. Clean merge at abcdef1.');
});

test('a symbol-level proceed names only agents on the same function', () => {
  /** @type {ProjectSnapshot} */
  const busy = {
    ...state,
    agents: [...state.agents, { ...yielder, attemptId: 'a_2', agent: 'agent-3', status: 'editing' }],
    claims: [
      { attemptId: 'a_7', path: 'src/routes/auth.js', symbol: 'validateLogin' },
      { attemptId: 'a_6', path: 'src/routes/auth.js', symbol: 'validateLogin' },
      { attemptId: 'a_2', path: 'src/routes/auth.js', symbol: 'login' },
    ],
  };
  const line = narrate({ type: 'proceed', attemptId: 'a_7', agent: 'agent-1', level: 'symbol' }, busy);
  assert.match(line.detail, /^Overlaps agent-2 on validateLogin\(\)/);
});

test('the summary counts landed tasks, yields, and replays', () => {
  assert.equal(summarize(state), 'Done. 2 of 2 tasks landed on main, with 1 yield and 1 replay.');
});
