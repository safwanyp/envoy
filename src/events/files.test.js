/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changesBetween } from './files.js';

test('a health edit between two commits names health', async () => {
  const repo = fakeRepo({
    before: 'export function health() {\n  return { ok: true };\n}\n',
    after: 'export function health() {\n  return { ok: true, queue: "live" };\n}\n',
  });
  const changes = await changesBetween(repo, 'a'.repeat(40), 'b'.repeat(40));
  assert.deepEqual(changes, [{ path: 'src/server.js', symbols: ['health'] }]);
});

test('a zero before ref is an empty tree', async () => {
  const repo = fakeRepo({
    before: '',
    after: 'export function health() {\n  return { ok: true };\n}\n',
  });
  const changes = await changesBetween(repo, '0'.repeat(40), 'b'.repeat(40));
  assert.deepEqual(changes, [{ path: 'src/server.js', symbols: ['health'] }]);
});

/**
 * @param {{ before: string, after: string }} texts
 * @returns {ArtifactsRepo}
 */
function fakeRepo(texts) {
  const trees = {
    'tree-before': [{ name: 'src', type: 'tree', hash: 'src-before', mode: '40000' }],
    'src-before': [{ name: 'server.js', type: 'blob', hash: 'blob-before', mode: '100644' }],
    'tree-after': [{ name: 'src', type: 'tree', hash: 'src-after', mode: '40000' }],
    'src-after': [{ name: 'server.js', type: 'blob', hash: 'blob-after', mode: '100644' }],
  };
  const blobs = {
    'blob-before': texts.before,
    'blob-after': texts.after,
  };
  return /** @type {ArtifactsRepo} */ ({
    async readCommit(hash) {
      if (hash.startsWith('a')) return { treeHash: 'tree-before', hash };
      if (hash.startsWith('b')) return { treeHash: 'tree-after', hash };
      return null;
    },
    async readTree(hash) {
      return /** @type {ArtifactsTreeEntry[]} */ (trees[/** @type {keyof typeof trees} */ (hash)] ?? null);
    },
    async readBlob(hash) {
      const text = blobs[/** @type {keyof typeof blobs} */ (hash)];
      if (text === undefined) return null;
      return { async text() { return text; } };
    },
  });
}
