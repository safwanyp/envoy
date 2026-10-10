/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, findOverlaps, staleAfterLanding } from './radar.js';

/**
 * @param {string} attemptId
 * @param {string} path
 * @param {string | null} symbol
 * @returns {import('./types').Claim}
 */
function claim(attemptId, path, symbol) {
  return { attemptId, path, symbol, kind: 'declared', createdAt: 0 };
}

test('a shared symbol overlaps at symbol level and names the other attempt', () => {
  const incoming = claim('a_in', 'src/auth.js', 'login');
  assert.deepEqual(
    findOverlaps(
      [
        claim('a_early', 'src/auth.js', 'login'),
        claim('a_in', 'src/auth.js', 'login'),
        claim('a_late', 'src/other.js', 'login'),
        claim('a_same', 'src/auth.js', 'login'),
      ],
      incoming,
    ),
    [
      { level: 'symbol', path: 'src/auth.js', symbol: 'login', attemptId: 'a_early' },
      { level: 'symbol', path: 'src/auth.js', symbol: 'login', attemptId: 'a_same' },
    ],
  );
});

test('different symbols on one path overlap at file level', () => {
  assert.deepEqual(findOverlaps([claim('a_other', 'src/auth.js', 'logout')], claim('a_in', 'src/auth.js', 'login')), [
    { level: 'file', path: 'src/auth.js', symbol: null, attemptId: 'a_other' },
  ]);
});

test('a null symbol overlaps at symbol level on the non-null name', () => {
  assert.deepEqual(findOverlaps([claim('a_whole', 'src/auth.js', null)], claim('a_in', 'src/auth.js', 'login')), [
    { level: 'symbol', path: 'src/auth.js', symbol: 'login', attemptId: 'a_whole' },
  ]);
  assert.deepEqual(findOverlaps([claim('a_other', 'src/auth.js', 'login')], claim('a_in', 'src/auth.js', null)), [
    { level: 'symbol', path: 'src/auth.js', symbol: 'login', attemptId: 'a_other' },
  ]);
  assert.deepEqual(findOverlaps([claim('a_whole', 'src/auth.js', null)], claim('a_in', 'src/auth.js', null)), [
    { level: 'symbol', path: 'src/auth.js', symbol: null, attemptId: 'a_whole' },
  ]);
});

test('yields only when the other attempt started earlier on a symbol overlap', () => {
  const symbolOverlap = {
    level: /** @type {'symbol'} */ ('symbol'),
    path: 'src/auth.js',
    symbol: 'login',
    attemptId: 'a_other',
  };
  const fileOverlap = {
    level: /** @type {'file'} */ ('file'),
    path: 'src/auth.js',
    symbol: null,
    attemptId: 'a_other',
  };
  const self = { attemptId: 'a_in', startedAt: 10 };
  const earlier = { attemptId: 'a_other', startedAt: 4 };
  const sameTime = { attemptId: 'a_other', startedAt: 10 };
  const later = { attemptId: 'a_other', startedAt: 12 };

  assert.equal(decide(symbolOverlap, self, earlier), 'yield');
  assert.equal(decide(symbolOverlap, self, sameTime), 'proceed');
  assert.equal(decide(symbolOverlap, self, later), 'proceed');
  assert.equal(decide(fileOverlap, self, earlier), 'proceed');
});

test('a whole-file landing stales every in-flight attempt on that path', () => {
  assert.deepEqual(
    staleAfterLanding([{ path: 'src/auth.js', symbols: [] }], [
      claim('a_m', 'src/auth.js', 'login'),
      claim('a_m', 'src/auth.js', 'logout'),
      claim('a_b', 'src/auth.js', null),
      claim('a_z', 'src/other.js', 'login'),
    ]),
    ['a_b', 'a_m'],
  );
});

test('landing one symbol stales that symbol and leaves an untouched claim out', () => {
  assert.deepEqual(
    staleAfterLanding([{ path: 'src/auth.js', symbols: ['login'] }], [
      claim('a_login', 'src/auth.js', 'login'),
      claim('a_logout', 'src/auth.js', 'logout'),
      claim('a_whole', 'src/auth.js', null),
    ]),
    ['a_login', 'a_whole'],
  );
});
