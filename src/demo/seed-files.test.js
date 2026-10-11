/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SEED_FILES } from './seed-files.js';
import { DEMO_TASKS } from './tasks.js';

test('the bundled seed matches demo/seed-repo', async () => {
  const root = path.resolve('demo/seed-repo');
  const fromDisk = await loadTree(root);
  assert.deepEqual(SEED_FILES, fromDisk);
});

test('the bundled tasks match demo/tasks.json', async () => {
  const raw = await readFile(path.resolve('demo/tasks.json'), 'utf8');
  assert.deepEqual(DEMO_TASKS, JSON.parse(raw));
});

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Promise<Record<string, string>>}
 */
async function loadTree(dir, prefix = '') {
  /** @type {Record<string, string>} */
  const files = {};
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix.length === 0 ? entry : `${prefix}/${entry}`;
    const info = await stat(full);
    if (info.isDirectory()) Object.assign(files, await loadTree(full, rel));
    else files[rel] = await readFile(full, 'utf8');
  }
  return files;
}
