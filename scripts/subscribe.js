#!/usr/bin/env node
import { eventSubscriptionsUrl, mainRepoName, queuesUrl } from '../src/cloudflare/api.js';
import { CfError, cfEnvelope } from '../src/cloudflare/cf.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const namespace = process.env.ARTIFACTS_NAMESPACE ?? 'envoy';
const project = process.env.ENVOY_PROJECT ?? 'demo';
const queueName = process.env.ENVOY_QUEUE ?? 'envoy-artifacts-events';
const repo = mainRepoName(project);
const subscriptionName = `envoy-${project}-main-pushed`;

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run pnpm subscribe.');
  process.exit(1);
}

const queueId = await ensureQueue();
const existing = await listSubscriptions();
const found = existing.find((item) => item.name === subscriptionName);
if (found) {
  console.log(JSON.stringify({ repo, queueId, subscription: found, created: false }));
} else {
  const created = await cfEnvelope(eventSubscriptionsUrl(accountId), token, 'POST', {
    name: subscriptionName,
    enabled: true,
    source: { type: 'artifacts.repo', namespace, repo_name: repo },
    events: ['pushed'],
    destination: { type: 'queues.queue', queue_id: queueId },
  });
  console.log(JSON.stringify({ repo, queueId, subscription: created, created: true }));
}

/**
 * @returns {Promise<string>}
 */
async function ensureQueue() {
  const listed = await cfEnvelope(queuesUrl(accountId), token, 'GET');
  const queues = Array.isArray(listed) ? listed : [];
  for (const item of queues) {
    if (!item || typeof item !== 'object') continue;
    if ('queue_name' in item && item.queue_name === queueName && 'queue_id' in item && typeof item.queue_id === 'string') {
      return item.queue_id;
    }
  }
  try {
    const created = /** @type {{ queue_id?: string }} */ (
      await cfEnvelope(queuesUrl(accountId), token, 'POST', { queue_name: queueName })
    );
    if (typeof created.queue_id !== 'string' || created.queue_id.length === 0) {
      throw new Error('queue create did not return queue_id');
    }
    return created.queue_id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue create failed';
    const status = err instanceof CfError ? err.status : 0;
    throw new Error(
      `Could not create queue ${queueName} (${status}): ${message}. The token needs Queues Write or Workers Scripts Write.`,
    );
  }
}

/**
 * @returns {Promise<{ id: string, name: string }[]>}
 */
async function listSubscriptions() {
  const listed = await cfEnvelope(eventSubscriptionsUrl(accountId), token, 'GET');
  if (!Array.isArray(listed)) return [];
  /** @type {{ id: string, name: string }[]} */
  const subscriptions = [];
  for (const item of listed) {
    if (!item || typeof item !== 'object') continue;
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const name = 'name' in item && typeof item.name === 'string' ? item.name : '';
    if (id.length === 0 || name.length === 0) continue;
    subscriptions.push({ id, name });
  }
  return subscriptions;
}
