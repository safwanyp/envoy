/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTrailers } from './intent.js';
import { buildReplayContext } from './replay.js';

test('replay context keeps landed intents and skips merge commits', () => {
  const message = [
    'Rename the email field',
    '',
    'Call it emailAddress',
    '',
    'Envoy-Task: t_rename_email',
    'Envoy-Attempt: a_rename_1',
    'Envoy-Agent: agent-3',
    'Envoy-Intent: Rename user field email to emailAddress everywhere',
    'Envoy-Claims: src/lib/db.js#getUser, src/routes/auth.js#login',
    'Envoy-Base: abc',
  ].join('\n');

  const context = buildReplayContext(
    [
      { sha: 'sha-rename', message },
      { sha: 'sha-merge', message: 'Merge feature into main\n' },
    ],
    'old validateLogin\n',
    parseTrailers,
  );

  assert.deepEqual(context, {
    landed: [
      {
        sha: 'sha-rename',
        agent: 'agent-3',
        intent: 'Rename user field email to emailAddress everywhere',
        paths: ['src/lib/db.js', 'src/routes/auth.js'],
      },
    ],
    previousDiff: 'old validateLogin\n',
  });
});
