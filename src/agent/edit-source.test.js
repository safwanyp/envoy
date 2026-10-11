/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED_FILES } from '../demo/seed-files.js';
import { createDemoEdit } from './edit-source.js';

test('a model write that contains the task marker replaces that file', async () => {
  const ai = {
    /**
     * @param {string} model
     * @param {Record<string, unknown>} input
     */
    async run(model, input) {
      assert.equal(model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      assert.equal(Array.isArray(input.tools), true);
      return {
        tool_calls: [
          {
            name: 'write_file',
            arguments: {
              path: 'src/lib/limiter.js',
              content: 'export function allowLogin(key) {\n  return true;\n}\n',
            },
          },
        ],
      };
    },
  };
  const demo = createDemoEdit(ai);
  const files = await demo.edit({
    taskId: 't_rate_limit',
    attemptId: 'a_1',
    files: SEED_FILES,
    replay: null,
    prompt: 'Add per-IP rate limiting to login',
    touches: ['src/routes/auth.js#validateLogin'],
  });
  assert.equal(files['src/lib/limiter.js'], 'export function allowLogin(key) {\n  return true;\n}\n');
  assert.equal((files['src/routes/auth.js'] ?? '').includes('allowLogin('), true);
  assert.equal(demo.tally.calls, 1);
  assert.equal(demo.tally.workersAi, 1);
  assert.equal(demo.tally.scripted, 0);
});

test('a model with no tool call keeps the scripted rate limiter', async () => {
  const ai = {
    /**
     * @param {string} _model
     * @param {Record<string, unknown>} _input
     */
    async run(_model, _input) {
      return { response: 'done' };
    },
  };
  const demo = createDemoEdit(ai);
  const files = await demo.edit({
    taskId: 't_rate_limit',
    attemptId: 'a_1',
    files: SEED_FILES,
    replay: null,
    prompt: 'Add per-IP rate limiting to login',
    touches: ['src/routes/auth.js#validateLogin'],
  });
  assert.equal((files['src/lib/limiter.js'] ?? '').includes('hits.get'), true);
  assert.equal(demo.tally.calls, 1);
  assert.equal(demo.tally.workersAi, 0);
  assert.equal(demo.tally.scripted, 1);
});

test('without a binding the edit is the scripted one', async () => {
  const demo = createDemoEdit(undefined);
  const files = await demo.edit({
    taskId: 't_health',
    attemptId: 'a_3',
    files: SEED_FILES,
    replay: null,
    prompt: 'Add GET /health',
    touches: ['src/server.js#health'],
  });
  assert.equal((files['src/server.js'] ?? '').includes('export function health('), true);
  assert.equal(demo.tally.calls, 0);
  assert.equal(demo.tally.workersAi, 0);
  assert.equal(demo.tally.scripted, 1);
});
