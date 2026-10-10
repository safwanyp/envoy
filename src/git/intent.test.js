/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTrailers, parseTrailers } from './intent.js';

const intent = {
  summary: 'Add per-IP rate limiting to POST /login',
  rationale: 'The plan step caps login attempts so credential stuffing cannot sit on the route.',
  task: 't_rate_limit',
  attempt: 'a_7f3c',
  agent: 'agent-3',
  intent: 'Add per-IP rate limiting to POST /login (5/min)',
  claims: ['src/routes/auth.js#validateLogin', 'src/lib/limiter.js'],
  replayOf: null,
  base: 'abc123',
};

const message = `Add per-IP rate limiting to POST /login

The plan step caps login attempts so credential stuffing cannot sit on the route.

Envoy-Task: t_rate_limit
Envoy-Attempt: a_7f3c
Envoy-Agent: agent-3
Envoy-Intent: Add per-IP rate limiting to POST /login (5/min)
Envoy-Claims: src/routes/auth.js#validateLogin, src/lib/limiter.js
Envoy-Base: abc123`;

const replay = {
  summary: 'Replay per-IP rate limiting on current main',
  rationale: 'Main moved under the first attempt.',
  task: 't_rate_limit',
  attempt: 'a_9c01',
  agent: 'agent-3',
  intent: 'Add per-IP rate limiting to POST /login (5/min)',
  claims: ['src/lib/limiter.js#allow'],
  replayOf: 'a_7f3c',
  base: 'def456',
};

const replayMessage = `Replay per-IP rate limiting on current main

Main moved under the first attempt.

Envoy-Task: t_rate_limit
Envoy-Attempt: a_9c01
Envoy-Agent: agent-3
Envoy-Intent: Add per-IP rate limiting to POST /login (5/min)
Envoy-Claims: src/lib/limiter.js#allow
Envoy-Replay-Of: a_7f3c
Envoy-Base: def456`;

test('formatTrailers writes the commit message and parseTrailers reads it back', () => {
  assert.equal(formatTrailers(intent), message);
  assert.deepEqual(parseTrailers(message), intent);
  assert.deepEqual(parseTrailers(`${message}\n`), intent);
});

test('an empty rationale round-trips through a blank paragraph', () => {
  const bare = { ...intent, rationale: '' };
  const bareMessage = `Add per-IP rate limiting to POST /login



Envoy-Task: t_rate_limit
Envoy-Attempt: a_7f3c
Envoy-Agent: agent-3
Envoy-Intent: Add per-IP rate limiting to POST /login (5/min)
Envoy-Claims: src/routes/auth.js#validateLogin, src/lib/limiter.js
Envoy-Base: abc123`;
  assert.equal(formatTrailers(bare), bareMessage);
  assert.deepEqual(parseTrailers(bareMessage), bare);
});

test('formatTrailers includes Envoy-Replay-Of immediately before Envoy-Base', () => {
  assert.equal(formatTrailers(replay), replayMessage);
  assert.deepEqual(parseTrailers(replayMessage), replay);
});

test('parseTrailers ignores unknown trailers', () => {
  const withUnknown = replayMessage.replace(
    'Envoy-Base: def456',
    'Envoy-Note: scratch\nNot-A-Trailer: nope\nEnvoy-Base: def456',
  );
  assert.deepEqual(parseTrailers(withUnknown), replay);
});

test('parseTrailers names a missing trailer', () => {
  const broken = message.replace('Envoy-Task: t_rate_limit\n', '');
  assert.throws(() => parseTrailers(broken), { message: 'Missing Envoy-Task' });
});
