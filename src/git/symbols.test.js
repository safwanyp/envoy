/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTaskEdit } from '../agent/edits.js';
import { SEED_FILES } from '../demo/seed-files.js';
import { changedSymbols, extractSymbols, symbolChanges } from './symbols.js';

test('extractSymbols reads top-level functions, arrows, and classes', () => {
  const source = [
    'function alpha(x) {',
    '  return { x };',
    '}',
    '',
    'export function beta() {',
    '  return 1;',
    '}',
    '',
    'const gamma = (n) => {',
    '  return n + 1;',
    '};',
    '',
    'const delta = async (n) => {',
    '  return n;',
    '};',
    '',
    'class Zeta {',
    '  run() {',
    '    return 2;',
    '  }',
    '}',
    '',
    'function outer() {',
    '  function inner() {',
    '    return 3;',
    '  }',
    '  return inner();',
    '}',
  ].join('\n');

  assert.deepEqual(extractSymbols(source), [
    { name: 'alpha', startLine: 1, endLine: 3 },
    { name: 'beta', startLine: 5, endLine: 7 },
    { name: 'gamma', startLine: 9, endLine: 11 },
    { name: 'delta', startLine: 13, endLine: 15 },
    { name: 'Zeta', startLine: 17, endLine: 21 },
    { name: 'outer', startLine: 23, endLine: 28 },
  ]);
});

test('a brace in a string, template, or comment does not end the function', () => {
  const source = [
    '/*',
    'function fake() {',
    '  return 0;',
    '}',
    '*/',
    'function quoted() {',
    '  const s = "}";',
    '  const t = `}`;',
    '  /* } */',
    '  return s;',
    '}',
  ].join('\n');

  assert.deepEqual(extractSymbols(source), [{ name: 'quoted', startLine: 6, endLine: 11 }]);
});

test('an arrow whose params span lines ends at its closing brace', () => {
  const source = ['const pair = (', '  a,', '  b', ') => {', '  return a + b;', '};'].join('\n');
  assert.deepEqual(extractSymbols(source), [{ name: 'pair', startLine: 1, endLine: 6 }]);
});

test('an arrow without a block ends on the last line', () => {
  const source = ['const id = (x) => x;', 'function above() {', '  return 1;', '}'].join('\n');
  assert.deepEqual(extractSymbols(source), [
    { name: 'id', startLine: 1, endLine: 4 },
    { name: 'above', startLine: 2, endLine: 4 },
  ]);
});

test('changedSymbols names symbols added, removed, or edited', () => {
  const before = [
    'function kept() {',
    '  return 1;',
    '}',
    '',
    'function edited() {',
    '  return 1;',
    '}',
    '',
    'function removed() {',
    '  return 1;',
    '}',
  ].join('\n');
  const after = [
    'function kept() {',
    '  return 1;',
    '}',
    '',
    'function edited() {',
    '  return 2;',
    '}',
    '',
    'function added() {',
    '  return 3;',
    '}',
  ].join('\n');

  assert.deepEqual(changedSymbols(before, after), ['added', 'edited', 'removed']);
});

test('a symbol whose own lines did not change is left out', () => {
  const before = 'function kept() {\n  return 1;\n}\n\nfunction edited() {\n  return 1;\n}';
  const after = '\nfunction kept() {\n  return 1;\n}\n\nfunction edited() {\n  return 2;\n}';
  assert.deepEqual(changedSymbols(before, after), ['edited']);
});

test('a rate-limit edit reports validateLogin', () => {
  const edited = { ...SEED_FILES, ...applyTaskEdit('t_rate_limit', SEED_FILES) };
  const changes = symbolChanges(SEED_FILES, edited);
  const auth = changes.find((change) => change.path === 'src/routes/auth.js');
  assert.equal(auth?.symbols.includes('validateLogin'), true);
});
