/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete, toolCallsFrom } from './llm.js';

test('complete returns the tool call a model produced', async () => {
  const ai = {
    /**
     * @param {string} model
     * @param {Record<string, unknown>} input
     */
    async run(model, input) {
      assert.equal(model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      assert.equal(Array.isArray(input.tools), true);
      return {
        response: '',
        tool_calls: [{ name: 'write_file', arguments: { path: 'src/server.js', content: 'health\n' } }],
      };
    },
  };
  const result = await complete(ai, [{ role: 'user', content: 'add health' }], [{ name: 'write_file' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.toolCalls, [
    { name: 'write_file', arguments: { path: 'src/server.js', content: 'health\n' } },
  ]);
});

test('complete without a binding reports that AI is unavailable', async () => {
  const result = await complete(undefined, [], []);
  assert.deepEqual(result, { ok: false, error: 'ai_unavailable', text: '', toolCalls: [] });
  assert.deepEqual(toolCallsFrom({ tool_calls: 'nope' }), []);
});
