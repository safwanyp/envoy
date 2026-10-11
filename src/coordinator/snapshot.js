import { staleAfterLanding } from './radar.js';

/** @typedef {import('../coordinator/types').AttemptView} AttemptView */
/** @typedef {import('../coordinator/types').Claim} Claim */
/** @typedef {import('../coordinator/types').ProjectSnapshot} ProjectSnapshot */
/** @typedef {import('../coordinator/types').DemoEvent} DemoEvent */

const MAX_REPLAYS = 2;
const OPEN = new Set(['editing', 'planning', 'yielding']);

/**
 * @returns {ProjectSnapshot}
 */
export function emptySnapshot() {
  return { agents: [], claims: [], commits: [], events: [], lineage: [] };
}

/**
 * @param {AttemptView[]} agents
 * @returns {ProjectSnapshot['lineage']}
 */
export function lineageFrom(agents) {
  /** @type {ProjectSnapshot['lineage']} */
  const lineage = [];
  for (const agent of agents) {
    const group = lineage.find((item) => item.taskId === agent.taskId);
    if (group) group.attempts.push(agent);
    else lineage.push({ taskId: agent.taskId, agent: agent.agent, intent: agent.intent, attempts: [agent] });
  }
  return lineage;
}

/**
 * @param {ProjectSnapshot} snapshot
 * @param {AttemptView} attempt
 * @param {Claim[]} claims
 * @returns {ProjectSnapshot}
 */
export function registerAttempt(snapshot, attempt, claims) {
  if (snapshot.agents.some((item) => item.attemptId === attempt.attemptId)) return snapshot;
  const agents = [...snapshot.agents, attempt];
  return {
    ...snapshot,
    agents,
    claims: [...snapshot.claims, ...claims],
    lineage: lineageFrom(agents),
  };
}

/**
 * @param {ProjectSnapshot} snapshot
 * @param {{ repo: string, after: string, changes?: { path: string, symbols: string[] }[] }} push
 * @returns {ProjectSnapshot}
 */
export function applyMainMoved(snapshot, push) {
  const seen = snapshot.events.some(
    (event) => event.type === 'main-moved' && event.repo === push.repo && event.after === push.after,
  );
  if (seen) return snapshot;
  /** @type {DemoEvent} */
  const event = { type: 'main-moved', repo: push.repo, after: push.after };
  const changes = push.changes ?? [];
  const openIds = new Set(
    snapshot.agents.filter((agent) => OPEN.has(agent.status)).map((agent) => agent.attemptId),
  );
  const staleIds = staleAfterLanding(
    changes,
    snapshot.claims.filter((claim) => openIds.has(claim.attemptId)),
  );
  if (staleIds.length === 0) return { ...snapshot, events: [...snapshot.events, event] };

  const agents = snapshot.agents.map((agent) => ({ ...agent }));
  let claims = snapshot.claims.map((claim) => ({ ...claim }));
  /** @type {DemoEvent[]} */
  const events = [...snapshot.events, event];
  let nextN = nextAttemptNumber(agents);
  for (const attemptId of staleIds) {
    const agent = agents.find((item) => item.attemptId === attemptId);
    if (!agent) continue;
    events.push({ type: 'stale', attemptId, agent: agent.agent });
    if (agent.replayCount >= MAX_REPLAYS) {
      agent.status = 'needs-human';
      events.push({ type: 'needs-human', attemptId, agent: agent.agent });
      continue;
    }
    agent.status = 'replaying';
    nextN += 1;
    const replayId = `a_${nextN}`;
    agents.push({
      attemptId: replayId,
      taskId: agent.taskId,
      agent: agent.agent,
      intent: agent.intent,
      status: 'editing',
      replayOf: attemptId,
      replayCount: agent.replayCount + 1,
      sha: null,
      blockedBy: [],
    });
    claims = claims.concat(
      claims
        .filter((claim) => claim.attemptId === attemptId)
        .map((claim) => ({ ...claim, attemptId: replayId })),
    );
    events.push({
      type: 'replay',
      attemptId: replayId,
      agent: agent.agent,
      replayOf: attemptId,
      reason: 'stale',
    });
  }
  return { ...snapshot, agents, claims, events, lineage: lineageFrom(agents) };
}

/**
 * @param {AttemptView[]} agents
 * @returns {number}
 */
function nextAttemptNumber(agents) {
  let max = 0;
  for (const agent of agents) {
    const match = /^a_(\d+)$/.exec(agent.attemptId);
    const value = match ? Number(match[1]) : 0;
    if (value > max) max = value;
  }
  return max;
}
