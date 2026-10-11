/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import git from 'isomorphic-git';
import { MemoryFS } from './memory-fs.js';

test('MemoryFS writes, reads, and lists a file', async () => {
  const fs = new MemoryFS();
  await fs.promises.writeFile('/workspace/README.md', 'hi\n');
  assert.equal(await fs.promises.readFile('/workspace/README.md', 'utf8'), 'hi\n');
  assert.deepEqual(await fs.promises.readdir('/workspace'), ['README.md']);
  const stat = await fs.promises.stat('/workspace/README.md');
  assert.equal(stat.isFile(), true);
  assert.equal(stat.size, 3);
});

test('isomorphic-git commits a file on MemoryFS', async () => {
  const fs = new MemoryFS();
  const dir = '/workspace';
  await git.init({ fs, dir, defaultBranch: 'main' });
  await fs.promises.writeFile(`${dir}/README.md`, 'hi\n');
  await git.add({ fs, dir, filepath: 'README.md' });
  const oid = await git.commit({
    fs,
    dir,
    message: 'hi',
    author: { name: 'Envoy', email: 'envoy@localhost' },
  });
  const commit = await git.readCommit({ fs, dir, oid });
  assert.equal(commit.oid, oid);
  assert.equal(commit.commit.message, 'hi\n');
  assert.equal(await fs.promises.readFile(`${dir}/README.md`, 'utf8'), 'hi\n');
});
