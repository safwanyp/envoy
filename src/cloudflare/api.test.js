/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artifactsReposUrl, eventSubscriptionsUrl, mainRepoName, queuesUrl } from './api.js';

test('artifacts and queue URLs include the account', () => {
  assert.equal(
    artifactsReposUrl('acct', 'envoy'),
    'https://api.cloudflare.com/client/v4/accounts/acct/artifacts/namespaces/envoy/repos',
  );
  assert.equal(
    eventSubscriptionsUrl('acct'),
    'https://api.cloudflare.com/client/v4/accounts/acct/event_subscriptions/subscriptions',
  );
  assert.equal(queuesUrl('acct'), 'https://api.cloudflare.com/client/v4/accounts/acct/queues');
  assert.equal(mainRepoName('demo'), 'demo-main');
});
