#!/usr/bin/env node
import http from 'isomorphic-git/http/node';
import { artifactsFileUrl, artifactsRepoUrl, artifactsTokensUrl, queuesUrl } from '../src/cloudflare/api.js';
import { cfEnvelope } from '../src/cloudflare/cf.js';
import { parseArtifactsMessage } from '../src/events/parse.js';
import { commitOnRemote } from '../src/git/publish.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const namespace = process.env.ARTIFACTS_NAMESPACE ?? 'envoy';
const queueName = process.env.ENVOY_QUEUE ?? 'envoy-artifacts-events';
const local = process.env.ENVOY_DEV ?? 'http://127.0.0.1:8792';
const repo = 'demo-main';

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run node scripts/prove-queue.js.');
  process.exit(1);
}

const health = await fetch(`${local}/api/health?project=demo`);
if (!health.ok) {
  console.error(`Local worker at ${local} did not answer /api/health.`);
  process.exit(1);
}

const stamp = String(Date.now());
const marker = `queue: "live-${stamp}"`;
const attemptId = `probe-${stamp}`;
const attempt = await postJson(`${local}/api/attempts?project=demo`, {
  attemptId,
  taskId: 't_health',
  agent: 'probe',
  intent: 'watch health while main moves',
  claims: [{ path: 'src/server.js', symbol: 'health' }],
});
if (!attempt.ok) {
  console.error('Could not register the open health claim.');
  process.exit(1);
}

const queueId = await queueIdByName();
const pushed = await pushHealth(marker);
const consumerId = await createPullConsumer(queueId);
try {
  const event = await waitForEvent(queueId, pushed.oid);
  const deliver = await postJson(`${local}/api/queue/local`, event.body);
  if (!deliver.ok) {
    console.error(`Local queue send failed (${deliver.status}).`);
    process.exit(1);
  }
  const replay = await waitForReplay(pushed.oid, attemptId);
  console.log(JSON.stringify({
    repo,
    queueId,
    commit: pushed.oid,
    created: pushed.created,
    event: event.summary,
    replay,
  }, null, 2));
} finally {
  await deleteConsumer(queueId, consumerId);
}

/**
 * @returns {Promise<string>}
 */
async function queueIdByName() {
  const listed = await cfEnvelope(queuesUrl(accountId), token, 'GET');
  if (!Array.isArray(listed)) throw new Error('queue list was empty');
  for (const item of listed) {
    if (!item || typeof item !== 'object') continue;
    if ('queue_name' in item && item.queue_name === queueName && 'queue_id' in item && typeof item.queue_id === 'string') {
      return item.queue_id;
    }
  }
  throw new Error(`Queue ${queueName} is missing.`);
}

/**
 * @param {string} text
 * @returns {Promise<{ oid: string, created: boolean }>}
 */
async function pushHealth(text) {
  const fileUrl = artifactsFileUrl(accountId, namespace, repo, 'main', 'src/server.js');
  const response = await fetch(fileUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not read src/server.js (${response.status}).`);
  const current = await response.text();
  const next = current.replace(/return \{ ok: true(?:, queue: "live-\d+")? \};/, `return { ok: true, ${text} };`);
  if (next === current) throw new Error('src/server.js has no health return to replace.');
  const info = /** @type {{ remote?: string }} */ (
    await cfEnvelope(artifactsRepoUrl(accountId, namespace, repo), token, 'GET')
  );
  const minted = /** @type {{ plaintext?: string }} */ (
    await cfEnvelope(artifactsTokensUrl(accountId, namespace), token, 'POST', { repo, scope: 'write' })
  );
  if (typeof info.remote !== 'string' || typeof minted.plaintext !== 'string') {
    throw new Error('demo-main did not yield a remote and write token.');
  }
  return commitOnRemote({
    remote: info.remote,
    token: minted.plaintext,
    files: { 'src/server.js': next },
    message: `Queue probe ${stamp}`,
    http,
  });
}

/**
 * @param {string} queueId
 * @returns {Promise<string>}
 */
async function createPullConsumer(queueId) {
  const created = /** @type {{ id?: string, consumer_id?: string }} */ (
    await cfEnvelope(`${queuesUrl(accountId)}/${queueId}/consumers`, token, 'POST', {
      type: 'http_pull',
      settings: { batch_size: 10, visibility_timeout_ms: 5000 },
    })
  );
  const id = created.consumer_id ?? created.id ?? '';
  if (id.length === 0) throw new Error('Pull consumer did not return an id.');
  return id;
}

/**
 * @param {string} queueId
 * @param {string} consumerId
 */
async function deleteConsumer(queueId, consumerId) {
  await cfEnvelope(`${queuesUrl(accountId)}/${queueId}/consumers/${consumerId}`, token, 'DELETE');
}

/**
 * @param {string} queueId
 * @param {string} oid
 * @returns {Promise<{ body: unknown, summary: import('../src/events/parse.js').PushedEvent }>}
 */
async function waitForEvent(queueId, oid) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const pulled = await cfEnvelope(`${queuesUrl(accountId)}/${queueId}/messages/pull`, token, 'POST', {
      visibility_timeout: 10000,
      batch_size: 10,
    });
    const messages = pulled && typeof pulled === 'object' && 'messages' in pulled && Array.isArray(pulled.messages)
      ? pulled.messages
      : [];
    for (const item of messages) {
      if (!item || typeof item !== 'object') continue;
      const body = messageBody(item);
      const parsed = parseArtifactsMessage(body);
      if (!parsed) {
        const keys = body && typeof body === 'object' ? Object.keys(body) : [typeof body];
        throw new Error(`Queue message did not match cf.artifacts.repo.pushed. Keys: ${keys.join(', ')}`);
      }
      const lease = 'lease_id' in item && typeof item.lease_id === 'string' ? item.lease_id : '';
      if (lease.length > 0) {
        await cfEnvelope(`${queuesUrl(accountId)}/${queueId}/messages/ack`, token, 'POST', {
          acks: [{ lease_id: lease }],
        });
      }
      if (parsed.repo === repo && parsed.after === oid) {
        return { body, summary: parsed };
      }
    }
    await sleep(2000);
  }
  throw new Error(`No cf.artifacts.repo.pushed event for ${oid} arrived within 90s.`);
}

/**
 * @param {string} oid
 * @param {string} attemptId
 */
async function waitForReplay(oid, attemptId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await fetch(`${local}/api/state?project=demo`);
    const snapshot = /** @type {{ events?: { type?: string, after?: string, attemptId?: string, replayOf?: string, agent?: string, reason?: string }[], agents?: { attemptId?: string, status?: string, replayOf?: string }[] }} */ (
      await response.json()
    );
    const moved = (snapshot.events ?? []).some((event) => event.type === 'main-moved' && event.after === oid);
    const replay = (snapshot.events ?? []).find((event) => event.type === 'replay' && event.replayOf === attemptId);
    if (moved && replay) {
      const agent = (snapshot.agents ?? []).find((item) => item.attemptId === replay.attemptId);
      return {
        after: oid,
        attemptId: replay.attemptId ?? '',
        replayOf: replay.replayOf ?? '',
        reason: replay.reason ?? '',
        status: agent?.status ?? '',
      };
    }
    await sleep(500);
  }
  throw new Error(`The coordinator did not replay ${attemptId} for ${oid}.`);
}

/**
 * @param {object} item
 * @returns {unknown}
 */
function messageBody(item) {
  if (!('body' in item)) return null;
  const body = item.body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * @param {string} url
 * @param {unknown} body
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status };
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
