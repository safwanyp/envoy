/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleArtifactsEvent } from './artifacts.js';

test('a main push posts the changed symbol to the coordinator', async () => {
  /** @type {unknown} */
  let posted = null;
  const env = envWith((body) => {
    posted = body;
  });
  await handleArtifactsEvent(
    message({
      before: 'a'.repeat(40),
      after: 'b'.repeat(40),
    }),
    env,
  );
  assert.deepEqual(posted, {
    repo: 'demo-main',
    after: 'b'.repeat(40),
    changes: [{ path: 'src/server.js', symbols: ['health'] }],
  });
});

test('a push without the Artifacts binding posts no symbol changes', async () => {
  /** @type {unknown} */
  let posted = null;
  const env = /** @type {Env} */ (/** @type {unknown} */ ({
    COORDINATOR: coordinator((body) => {
      posted = body;
    }),
  }));
  await handleArtifactsEvent(message({ before: 'a'.repeat(40), after: 'c'.repeat(40) }), env);
  assert.deepEqual(posted, { repo: 'demo-main', after: 'c'.repeat(40), changes: [] });
});

/**
 * @param {{ before: string, after: string }} refs
 * @returns {Message}
 */
function message(refs) {
  return /** @type {Message} */ ({
    body: {
      type: 'cf.artifacts.repo.pushed',
      source: { type: 'artifacts.repo', namespace: 'envoy', repoName: 'demo-main' },
      payload: { ref: 'refs/heads/main', before: refs.before, after: refs.after },
    },
    ack() {},
  });
}

/**
 * @param {(body: unknown) => void} onPost
 * @returns {Env}
 */
function envWith(onPost) {
  const texts = {
    'blob-before': 'export function health() {\n  return { ok: true };\n}\n',
    'blob-after': 'export function health() {\n  return { ok: true, queue: "live" };\n}\n',
  };
  const trees = {
    'tree-before': [{ name: 'src', type: 'tree', hash: 'src-before', mode: '40000' }],
    'src-before': [{ name: 'server.js', type: 'blob', hash: 'blob-before', mode: '100644' }],
    'tree-after': [{ name: 'src', type: 'tree', hash: 'src-after', mode: '40000' }],
    'src-after': [{ name: 'server.js', type: 'blob', hash: 'blob-after', mode: '100644' }],
  };
  return /** @type {Env} */ (/** @type {unknown} */ ({
    COORDINATOR: coordinator(onPost),
    ARTIFACTS: {
      async get() {
        return {
          /**
           * @param {string} hash
           */
          async readCommit(hash) {
            if (hash.startsWith('a')) return { treeHash: 'tree-before', hash };
            if (hash.startsWith('b')) return { treeHash: 'tree-after', hash };
            return null;
          },
          /**
           * @param {string} hash
           */
          async readTree(hash) {
            return trees[/** @type {keyof typeof trees} */ (hash)] ?? null;
          },
          /**
           * @param {string} hash
           */
          async readBlob(hash) {
            const text = texts[/** @type {keyof typeof texts} */ (hash)];
            if (text === undefined) return null;
            return { async text() { return text; } };
          },
          [Symbol.dispose]() {},
        };
      },
    },
  }));
}

/**
 * @param {(body: unknown) => void} onPost
 */
function coordinator(onPost) {
  return {
    /**
     * @param {string} name
     */
    idFromName(name) {
      return name;
    },
    get() {
      return {
        /**
         * @param {Request} request
         */
        async fetch(request) {
          onPost(await request.json());
          return new Response('ok');
        },
      };
    },
  };
}
