/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTool } from './tools.js';

test('write_file replaces one path and read_file returns it', () => {
  const written = applyTool({ 'a.js': 'old\n' }, 'write_file', { path: 'a.js', content: 'new\n' });
  assert.equal(written.files['a.js'], 'new\n');
  assert.equal(written.output, 'wrote a.js');
  const read = applyTool(written.files, 'read_file', { path: 'a.js' });
  assert.equal(read.output, 'new\n');
  const listed = applyTool(written.files, 'list_files', {});
  assert.equal(listed.output, 'a.js');
  assert.equal(applyTool(written.files, 'finish', {}).done, true);
});
