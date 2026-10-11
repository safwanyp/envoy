/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editPrompt } from './prompts.js';

test('the replay prompt names the landed intent and the old diff', () => {
  const prompt = editPrompt({
    landed: [
      {
        sha: 'sha-rename',
        agent: 'agent-3',
        intent: 'Rename user field email to emailAddress everywhere',
        paths: ['src/routes/auth.js'],
      },
    ],
    previousDiff: 'allowLogin(email)',
  });
  assert.equal(prompt.includes('agent-3: Rename user field email to emailAddress everywhere (sha-rename)'), true);
  assert.equal(prompt.includes('allowLogin(email)'), true);
  assert.equal(prompt.includes('reference only'), true);
});
