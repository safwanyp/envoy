/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArtifactsMessage, projectFromRepo } from './parse.js';

test('a main push event keeps the repo and the new sha', () => {
  const parsed = parseArtifactsMessage({
    type: 'cf.artifacts.repo.pushed',
    source: { type: 'artifacts.repo', namespace: 'envoy', repoName: 'demo-main' },
    payload: {
      ref: 'refs/heads/main',
      before: 'abc123',
      after: 'def789',
    },
  });
  assert.deepEqual(parsed, {
    namespace: 'envoy',
    repo: 'demo-main',
    before: 'abc123',
    after: 'def789',
    ref: 'refs/heads/main',
  });
  assert.equal(projectFromRepo(parsed?.repo ?? ''), 'demo');
});

test('fork pushes and empty bodies are ignored', () => {
  assert.equal(parseArtifactsMessage({ type: 'cf.artifacts.repo.created' }), null);
  assert.equal(parseArtifactsMessage('not json'), null);
  assert.equal(projectFromRepo('fork-a_1'), 'demo');
});
