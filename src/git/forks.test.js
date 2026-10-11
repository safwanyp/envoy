/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureFork } from './forks.js';

test('ensureFork returns a write token for a repo that already exists', async () => {
  let forks = 0;
  /** @type {import('./forks.js').RepoControl} */
  const control = {
    async create() {
      throw new Error('create');
    },
    async find() {
      return { name: 'demo-a-a_1', remote: 'https://example.test/git/demo-a-a_1', source: 'demo-main' };
    },
    async fork() {
      forks += 1;
      throw new Error('fork');
    },
    async writeToken() {
      return 'write-token';
    },
    async readText() {
      return null;
    },
  };
  const handle = await ensureFork(control, 'demo-main', 'demo-a-a_1', 'agent-1');
  assert.equal(handle.token, 'write-token');
  assert.equal(handle.remote, 'https://example.test/git/demo-a-a_1');
  assert.equal(forks, 0);
});

test('ensureFork forks when the repo is missing', async () => {
  /** @type {import('./forks.js').RepoControl} */
  const control = {
    async create() {
      throw new Error('create');
    },
    async find() {
      return null;
    },
    async fork(sourceName, forkName) {
      assert.equal(sourceName, 'demo-main');
      assert.equal(forkName, 'demo-a-a_4');
      return {
        name: forkName,
        remote: 'https://example.test/git/demo-a-a_4',
        token: 'fork-token',
        source: sourceName,
      };
    },
    async writeToken() {
      throw new Error('token');
    },
    async readText() {
      return null;
    },
  };
  const handle = await ensureFork(control, 'demo-main', 'demo-a-a_4', 'agent-4');
  assert.equal(handle.token, 'fork-token');
  assert.equal(handle.source, 'demo-main');
});
