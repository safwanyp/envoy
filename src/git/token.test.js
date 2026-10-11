/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenSecret } from './token.js';

test('tokenSecret drops the expires suffix', () => {
  assert.equal(tokenSecret('art_v1_abc?expires=1760000000'), 'art_v1_abc');
});

test('tokenSecret leaves a bare secret unchanged', () => {
  assert.equal(tokenSecret('art_v1_abc'), 'art_v1_abc');
});
