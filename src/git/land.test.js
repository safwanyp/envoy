/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasConflictMarkers, landFork, overlayDisjoint } from './land.js';
import { commitOnBranch, createIdentityClock, forkBranch, initRepo, readTree } from './repo.js';

test('a fork of current main fast-forwards', async () => {
  const identity = createIdentityClock();
  const repo = await initRepo({ 'a.js': 'one\n' }, identity(), 'seed');
  await forkBranch(repo.fs, repo.dir, 'feature', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'feature', { 'a.js': 'two\n' }, 'edit a', identity());
  const landed = await landFork(repo.fs, repo.dir, 'feature', repo.sha, identity());
  assert.equal(landed.kind, 'fast-forward');
  const files = await readTree(repo.fs, repo.dir, 'main');
  assert.equal(files['a.js'], 'two\n');
  assert.equal(hasConflictMarkers(files['a.js'] ?? ''), false);
});

test('edits to different files merge and keep both sides', async () => {
  const identity = createIdentityClock();
  const repo = await initRepo({ 'a.js': 'a\n', 'b.js': 'b\n' }, identity(), 'seed');
  await forkBranch(repo.fs, repo.dir, 'left', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'left', { 'a.js': 'a2\n' }, 'edit a', identity());
  await forkBranch(repo.fs, repo.dir, 'right', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'right', { 'b.js': 'b2\n' }, 'edit b', identity());
  const first = await landFork(repo.fs, repo.dir, 'left', repo.sha, identity());
  assert.equal(first.kind, 'fast-forward');
  const second = await landFork(repo.fs, repo.dir, 'right', repo.sha, identity());
  assert.equal(second.kind, 'merge');
  const files = await readTree(repo.fs, repo.dir, 'main');
  assert.equal(files['a.js'], 'a2\n');
  assert.equal(files['b.js'], 'b2\n');
  assert.equal(hasConflictMarkers(`${files['a.js']}${files['b.js']}`), false);
});

test('the same line edited twice asks for a replay and leaves main clean', async () => {
  const identity = createIdentityClock();
  const repo = await initRepo({ 'a.js': 'one\n' }, identity(), 'seed');
  await forkBranch(repo.fs, repo.dir, 'left', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'left', { 'a.js': 'left\n' }, 'left', identity());
  await forkBranch(repo.fs, repo.dir, 'right', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'right', { 'a.js': 'right\n' }, 'right', identity());
  const first = await landFork(repo.fs, repo.dir, 'left', repo.sha, identity());
  assert.equal(first.kind, 'fast-forward');
  const before = await readTree(repo.fs, repo.dir, 'main');
  const second = await landFork(repo.fs, repo.dir, 'right', repo.sha, identity());
  assert.deepEqual(second, { kind: 'replay', reason: 'conflict' });
  const after = await readTree(repo.fs, repo.dir, 'main');
  assert.equal(after['a.js'], 'left\n');
  assert.equal(after['a.js'], before['a.js']);
  assert.equal(hasConflictMarkers(after['a.js'] ?? ''), false);
});

test('disjoint overlay keeps main edits and adds the fork file', async () => {
  const identity = createIdentityClock();
  const repo = await initRepo({ 'a.js': 'a\n', 'b.js': 'b\n' }, identity(), 'seed');
  await forkBranch(repo.fs, repo.dir, 'left', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'left', { 'a.js': 'a2\n' }, 'edit a', identity());
  await forkBranch(repo.fs, repo.dir, 'right', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'right', { 'b.js': 'b2\n' }, 'edit b', identity());
  await landFork(repo.fs, repo.dir, 'left', repo.sha, identity());
  const overlaid = await overlayDisjoint(repo.fs, repo.dir, 'right', repo.sha, identity());
  assert.equal(overlaid?.kind, 'overlay');
  const files = await readTree(repo.fs, repo.dir, 'main');
  assert.equal(files['a.js'], 'a2\n');
  assert.equal(files['b.js'], 'b2\n');
});

test('overlay refuses when both sides edited one path', async () => {
  const identity = createIdentityClock();
  const repo = await initRepo({ 'a.js': 'a\n' }, identity(), 'seed');
  await forkBranch(repo.fs, repo.dir, 'left', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'left', { 'a.js': 'left\n' }, 'left', identity());
  await forkBranch(repo.fs, repo.dir, 'right', repo.sha);
  await commitOnBranch(repo.fs, repo.dir, 'right', { 'a.js': 'right\n' }, 'right', identity());
  await landFork(repo.fs, repo.dir, 'left', repo.sha, identity());
  const overlaid = await overlayDisjoint(repo.fs, repo.dir, 'right', repo.sha, identity());
  assert.equal(overlaid, null);
  const files = await readTree(repo.fs, repo.dir, 'main');
  assert.equal(files['a.js'], 'left\n');
});
