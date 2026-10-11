/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { applyTaskEdit } from '../agent/edits.js';
import { parseTrailers } from '../git/intent.js';
import { runProject } from './engine.js';

const SEED_PATHS = [
  'package.json',
  'src/server.js',
  'src/lib/db.js',
  'src/lib/http.js',
  'src/routes/auth.js',
  'src/routes/todos.js',
  'src/routes/users.js',
];

/**
 * @returns {Promise<Record<string, string>>}
 */
async function loadSeed() {
  const root = path.resolve('demo/seed-repo');
  /** @type {Record<string, string>} */
  const files = {};
  for (const rel of SEED_PATHS) {
    files[rel] = await readFile(path.join(root, rel), 'utf8');
  }
  return files;
}

/**
 * @returns {Promise<import('./types').DemoTask[]>}
 */
async function loadTasks() {
  const raw = await readFile(path.resolve('demo/tasks.json'), 'utf8');
  return JSON.parse(raw);
}

test('rate limiting follows a rename of the email field', async () => {
  const files = await loadSeed();
  const renamed = { ...files, ...applyTaskEdit('t_rename_email', files) };
  const limited = applyTaskEdit('t_rate_limit', renamed);
  const auth = limited['src/routes/auth.js'] ?? '';
  assert.equal(auth.includes('allowLogin(emailAddress)'), true);
  assert.equal(auth.includes('allowLogin(email)'), false);
  assert.equal(auth.includes("from '../lib/limiter.js'"), true);
  assert.equal((limited['src/lib/limiter.js'] ?? '').includes('export function allowLogin'), true);
});

test('stricter validation keeps the rate limit already in validateLogin', async () => {
  const files = await loadSeed();
  const limited = { ...files, ...applyTaskEdit('t_rate_limit', files) };
  const validated = applyTaskEdit('t_validate_login', limited);
  const auth = validated['src/routes/auth.js'] ?? '';
  assert.equal(auth.includes('rate limited'), true);
  assert.equal(auth.includes('password too short'), true);
});

test('six demo tasks land without conflict markers', async () => {
  const result = await runProject({ files: await loadSeed(), tasks: await loadTasks() });
  const auth = result.files['src/routes/auth.js'] ?? '';
  const server = result.files['src/server.js'] ?? '';
  const todos = result.files['src/routes/todos.js'] ?? '';
  const db = result.files['src/lib/db.js'] ?? '';

  assert.equal(auth.includes('<<<<<<<'), false);
  assert.equal(server.includes('<<<<<<<'), false);
  assert.equal(auth.includes('allowLogin(emailAddress)'), true);
  assert.equal(auth.includes('password too short'), true);
  assert.equal(auth.includes('body?.emailAddress'), true);
  assert.equal(db.includes('emailAddress'), true);
  assert.equal(db.includes('user.email ==='), false);
  assert.equal(server.includes('export function health('), true);
  assert.equal(server.includes('export function logRequest('), true);
  assert.equal(server.includes('pathnameOf(req) === \'/health\''), true);
  assert.equal(todos.includes('query?.limit'), true);

  const yieldEvent = result.events.find((event) => event.type === 'yield' && event.agent === 'agent-2');
  assert.equal(yieldEvent?.type, 'yield');
  const staleEvent = result.events.find((event) => event.type === 'stale' && event.agent === 'agent-1');
  assert.equal(staleEvent?.type, 'stale');
  const replayEvent = result.events.find((event) => event.type === 'replay' && event.agent === 'agent-1');
  assert.equal(replayEvent?.type, 'replay');
  if (replayEvent?.type === 'replay') assert.equal(replayEvent.reason, 'stale');
  const fileProceed = result.events.find(
    (event) => event.type === 'proceed' && event.agent === 'agent-5' && event.level === 'file',
  );
  assert.equal(fileProceed?.type, 'proceed');

  const tasks = ['t_rate_limit', 't_validate_login', 't_rename_email', 't_health', 't_request_log', 't_todos_page'];
  for (const task of tasks) {
    const commit = result.commits.find((item) => item.task === task);
    assert.equal(commit?.task, task);
    const message = commit?.message ?? '';
    const intent = parseTrailers(message);
    assert.equal(intent.task, task);
    const record = result.files[`.envoy/intents/${intent.attempt}.json`];
    assert.equal(typeof record, 'string');
    const parsed = JSON.parse(record ?? '');
    assert.equal(parsed.task, task);
  }

  const rate = result.commits.find((item) => item.task === 't_rate_limit');
  assert.equal(typeof rate?.replayOf, 'string');
  const rateAttempt = result.agents.find((agent) => agent.taskId === 't_rate_limit' && agent.status === 'landed');
  assert.equal(rateAttempt?.replayOf !== null, true);
  const validation = result.agents.find((agent) => agent.taskId === 't_validate_login');
  assert.equal(validation?.status, 'landed');
  assert.equal(result.agents.some((agent) => agent.status === 'needs-human'), false);
});

test('a content conflict replays once and then lands the new edit', async () => {
  /** @type {import('./types').DemoTask[]} */
  const tasks = [
    {
      id: 't_left',
      agent: 'agent-a',
      delayMs: 0,
      prompt: 'Write left',
      intent: 'Write left',
      touches: ['a.js#alpha'],
    },
    {
      id: 't_right',
      agent: 'agent-b',
      delayMs: 0,
      prompt: 'Write right',
      intent: 'Write right',
      touches: ['a.js#beta'],
    },
  ];
  const result = await runProject({
    files: { 'a.js': 'base\n' },
    tasks,
    workTicks: { t_left: 10, t_right: 20 },
    edit(ctx) {
      if (ctx.replay) return { 'a.js': 'right-replayed\n' };
      return { 'a.js': `${ctx.taskId}\n` };
    },
  });
  assert.equal(result.files['a.js'], 'right-replayed\n');
  assert.equal(result.files['a.js']?.includes('<<<<<<<'), false);
  const replay = result.events.find((event) => event.type === 'replay');
  assert.equal(replay?.type, 'replay');
  if (replay?.type === 'replay') assert.equal(replay.reason, 'conflict');
  const right = result.commits.find((item) => item.task === 't_right');
  assert.equal(typeof right?.replayOf, 'string');
});

test('two conflicting replays stop at needs-human', async () => {
  /** @type {import('./types').DemoTask[]} */
  const tasks = [
    { id: 't_a', agent: 'agent-a', delayMs: 0, prompt: 'A', intent: 'A', touches: ['a.js#alpha'] },
    { id: 't_b', agent: 'agent-b', delayMs: 0, prompt: 'B', intent: 'B', touches: ['a.js#beta'] },
    { id: 't_c', agent: 'agent-c', delayMs: 5, prompt: 'C', intent: 'C', touches: ['a.js#alpha'] },
    { id: 't_e', agent: 'agent-e', delayMs: 6, prompt: 'E', intent: 'E', touches: ['a.js#alpha'] },
  ];
  const result = await runProject({
    files: { 'a.js': 'base\n' },
    tasks,
    replayDelay: 40,
    workTicks: { t_a: 10, t_b: 20, t_c: 15, t_e: 50 },
    edit(ctx) {
      return { 'a.js': `${ctx.taskId}-${ctx.attemptId}\n` };
    },
  });
  assert.equal(result.files['a.js'], 't_e-a_4\n');
  assert.equal(result.files['a.js']?.includes('<<<<<<<'), false);
  const human = result.agents.find((agent) => agent.status === 'needs-human');
  assert.equal(human?.agent, 'agent-b');
  assert.equal(human?.replayCount, 2);
  const replays = result.events.filter((event) => event.type === 'replay' && event.agent === 'agent-b');
  assert.equal(replays.length, 2);
});

test('a conflict with no replays left is needs-human and main stays put', async () => {
  /** @type {import('./types').DemoTask[]} */
  const tasks = [
    {
      id: 't_left',
      agent: 'agent-a',
      delayMs: 0,
      prompt: 'Write left',
      intent: 'Write left',
      touches: ['a.js#alpha'],
    },
    {
      id: 't_right',
      agent: 'agent-b',
      delayMs: 0,
      prompt: 'Write right',
      intent: 'Write right',
      touches: ['a.js#beta'],
    },
  ];
  const result = await runProject({
    files: { 'a.js': 'base\n' },
    tasks,
    maxReplays: 0,
    workTicks: { t_left: 10, t_right: 20 },
    edit(ctx) {
      return { 'a.js': `${ctx.attemptId}\n` };
    },
  });
  assert.equal(result.files['a.js'], 'a_1\n');
  assert.equal(result.files['a.js']?.includes('<<<<<<<'), false);
  const humans = result.agents.filter((agent) => agent.status === 'needs-human');
  assert.equal(humans.length, 1);
  assert.equal(humans[0]?.agent, 'agent-b');
  assert.equal(result.events.some((event) => event.type === 'replay'), false);
});
