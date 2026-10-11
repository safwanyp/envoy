#!/usr/bin/env node
import { eventSubscriptionsUrl, mainRepoName, queuesUrl } from '../src/cloudflare/api.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const namespace = process.env.ARTIFACTS_NAMESPACE ?? 'envoy';
const project = process.env.ENVOY_PROJECT ?? 'demo';
const queueName = process.env.ENVOY_QUEUE ?? 'envoy-artifacts-events';
const repo = mainRepoName(project);

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run pnpm subscribe.');
  process.exit(1);
}

const queues = await cf(queuesUrl(accountId), 'GET');
const list = Array.isArray(queues) ? queues : [];
const queue = list.find((item) => item && typeof item === 'object' && 'queue_name' in item && item.queue_name === queueName);
const queueId = queue && typeof queue === 'object' && 'queue_id' in queue && typeof queue.queue_id === 'string' ? queue.queue_id : '';
if (queueId.length === 0) {
  throw new Error(`Queue ${queueName} was not found. Deploy once so the queue exists, then subscribe.`);
}

const created = await cf(eventSubscriptionsUrl(accountId), 'POST', {
  name: `envoy-${project}-main-pushed`,
  enabled: true,
  source: { type: 'artifacts.repo', namespace, repo_name: repo },
  events: ['pushed'],
  destination: { type: 'queues.queue', queue_id: queueId },
});
console.log(JSON.stringify({ repo, queueId, subscription: created }));

/**
 * @param {string} url
 * @param {'GET' | 'POST'} method
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<unknown>}
 */
async function cf(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = /** @type {{ success?: boolean, errors?: { message?: string }[], result?: unknown }} */ (
    await response.json()
  );
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((item) => item.message).join('; ') || response.statusText;
    throw new Error(message);
  }
  return payload.result;
}
