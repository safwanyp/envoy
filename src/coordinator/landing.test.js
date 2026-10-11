/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLandingQueue } from './landing.js';

test('landing jobs finish in the order they were queued', async () => {
  const queue = createLandingQueue();
  /** @type {string[]} */
  const order = [];
  const first = queue.run(async () => {
    order.push('start-1');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    order.push('end-1');
    return 1;
  });
  const second = queue.run(async () => {
    order.push('start-2');
    order.push('end-2');
    return 2;
  });
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
});
