/** @typedef {import('./state').DemoEvent} DemoEvent */
/** @typedef {import('./state').Narration} Narration */
/** @typedef {import('./state').ProjectSnapshot} ProjectSnapshot */
/** @typedef {import('./state').Claim} Claim */

const LANDING_KIND = {
  'fast-forward': 'fast-forward',
  merge: 'clean merge',
  overlay: 'file overlay',
};

/**
 * @param {DemoEvent} event
 * @param {ProjectSnapshot} state
 * @returns {Narration}
 */
export function narrate(event, state) {
  if (event.type === 'main-moved') {
    return {
      tone: 'info',
      label: 'Main moved',
      title: `Main moved to ${event.after.slice(0, 7)}`,
      detail: `A push to ${event.repo} arrived through the Artifacts event queue. Envoy checks it against every open claim.`,
      focus: [],
      sha: event.after,
    };
  }

  const agent = event.agent;
  const intent = intentOf(state, event.attemptId);

  if (event.type === 'proceed') {
    const mine = claimsOf(state, event.attemptId);
    const neighbours = othersOnPaths(state, event.attemptId, mine);
    /** @type {string} */
    let detail;
    if (event.level === 'clear' || neighbours.length === 0) {
      detail = `Claims ${list(mine.map(target))}. Nobody else is working there.`;
    } else if (event.level === 'file') {
      detail = `Shares ${list(unique(mine.map((claim) => claim.path)))} with ${list(neighbours)}, but edits a different function, so it goes ahead.`;
    } else {
      const rivals = othersOnSymbols(state, event.attemptId, mine);
      detail = `Overlaps ${list(rivals.length > 0 ? rivals : neighbours)} on ${list(mine.map(target))}. Its task started first, so it goes ahead.`;
    }
    return { tone: 'info', label: 'Claim', title: `${agent} starts: ${intent}`, detail, focus: [event.attemptId], sha: null };
  }

  if (event.type === 'yield') {
    const blockers = event.waitingFor.map((id) => agentOf(state, id));
    const shared = sharedTargets(state, event.attemptId, event.waitingFor);
    return {
      tone: 'warn',
      label: 'Yield',
      title: `${agent} waits for ${list(blockers)}`,
      detail: `Both want ${list(shared)}. ${list(blockers)} claimed it first, so ${agent} holds off instead of writing a conflict.`,
      focus: [event.attemptId, ...event.waitingFor],
      sha: null,
    };
  }

  if (event.type === 'resume') {
    return {
      tone: 'info',
      label: 'Resume',
      title: `${agent} resumes`,
      detail: 'The code it was waiting on has landed. It continues on top of the new main.',
      focus: [event.attemptId],
      sha: null,
    };
  }

  if (event.type === 'stale') {
    return {
      tone: 'danger',
      label: 'Stale',
      title: `${agent}'s work is out of date`,
      detail: `A landing on main changed ${list(claimsOf(state, event.attemptId).map(target))}, which ${agent} had claimed. Envoy stops it before it finishes a diff that would conflict.`,
      focus: [event.attemptId],
      sha: null,
    };
  }

  if (event.type === 'replay') {
    const why = event.reason === 'stale' ? 'main moved under it' : 'its merge conflicted';
    return {
      tone: 'replay',
      label: 'Replay',
      title: `${agent} replays its task on current main`,
      detail: `Attempt ${event.attemptId} replaces ${event.replayOf} because ${why}. It is told what landed and why, then redoes "${intent}".`,
      focus: [event.attemptId, event.replayOf],
      sha: null,
    };
  }

  if (event.type === 'landed') {
    return {
      tone: 'ok',
      label: 'Landed',
      title: `${agent} landed on main`,
      detail: `${intent}. ${capitalize(LANDING_KIND[event.kind])} at ${event.sha.slice(0, 7)}.`,
      focus: [event.attemptId],
      sha: event.sha,
    };
  }

  if (event.type === 'needs-human') {
    return {
      tone: 'danger',
      label: 'Needs a human',
      title: `${agent} needs a human`,
      detail: 'Two replays did not land cleanly, so Envoy stops retrying.',
      focus: [event.attemptId],
      sha: null,
    };
  }

  return {
    tone: 'danger',
    label: 'Failed',
    title: `${agent} failed`,
    detail: event.message,
    focus: [event.attemptId],
    sha: null,
  };
}

/**
 * @param {ProjectSnapshot} state
 * @returns {string}
 */
export function summarize(state) {
  const tasks = state.lineage.length;
  const landed = state.lineage.filter((group) => group.attempts.some((attempt) => attempt.status === 'landed')).length;
  const yields = state.events.filter((event) => event.type === 'yield').length;
  const replays = state.events.filter((event) => event.type === 'replay').length;
  return `Done. ${landed} of ${tasks} tasks landed on main, with ${count(yields, 'yield')} and ${count(replays, 'replay')}.`;
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @returns {string}
 */
function agentOf(state, attemptId) {
  return state.agents.find((item) => item.attemptId === attemptId)?.agent ?? attemptId;
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @returns {string}
 */
function intentOf(state, attemptId) {
  return state.agents.find((item) => item.attemptId === attemptId)?.intent ?? 'its task';
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @returns {Claim[]}
 */
function claimsOf(state, attemptId) {
  return state.claims.filter((claim) => claim.attemptId === attemptId);
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @param {Claim[]} mine
 * @returns {string[]}
 */
function othersOnPaths(state, attemptId, mine) {
  const paths = new Set(mine.map((claim) => claim.path));
  const others = state.claims
    .filter((claim) => claim.attemptId !== attemptId && paths.has(claim.path))
    .map((claim) => agentOf(state, claim.attemptId));
  const self = agentOf(state, attemptId);
  return unique(others).filter((name) => name !== self);
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @param {Claim[]} mine
 * @returns {string[]}
 */
function othersOnSymbols(state, attemptId, mine) {
  const self = agentOf(state, attemptId);
  const others = state.claims
    .filter((claim) => claim.attemptId !== attemptId && mine.some((own) => overlaps(own, claim)))
    .map((claim) => agentOf(state, claim.attemptId));
  return unique(others).filter((name) => name !== self);
}

/**
 * @param {Claim} a
 * @param {Claim} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return a.path === b.path && (a.symbol === null || b.symbol === null || a.symbol === b.symbol);
}

/**
 * @param {ProjectSnapshot} state
 * @param {string} attemptId
 * @param {string[]} otherIds
 * @returns {string[]}
 */
function sharedTargets(state, attemptId, otherIds) {
  const mine = claimsOf(state, attemptId);
  const theirs = state.claims.filter((claim) => otherIds.includes(claim.attemptId));
  const shared = mine.filter((claim) => theirs.some((other) => overlaps(claim, other)));
  return unique((shared.length > 0 ? shared : mine).map(target));
}

/**
 * @param {Claim} claim
 * @returns {string}
 */
function target(claim) {
  return claim.symbol ? `${claim.symbol}() in ${claim.path}` : claim.path;
}

/**
 * @param {string[]} items
 * @returns {string}
 */
function list(items) {
  if (items.length === 0) return 'nothing yet';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * @param {string[]} items
 * @returns {string[]}
 */
function unique(items) {
  return [...new Set(items)];
}

/**
 * @param {number} n
 * @param {string} noun
 * @returns {string}
 */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * @param {string} text
 * @returns {string}
 */
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
