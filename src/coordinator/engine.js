import git from 'isomorphic-git';
import { applyTaskEdit } from '../agent/edits.js';
import { formatTrailers, parseTrailers } from '../git/intent.js';
import { hasConflictMarkers, landFork } from '../git/land.js';
import { buildReplayContext } from '../git/replay.js';
import {
  changedPaths,
  commitOnBranch,
  createIdentityClock,
  forkBranch,
  initRepo,
  logMain,
  readTextAt,
  readTree,
} from '../git/repo.js';
import { changedSymbols } from '../git/symbols.js';
import { decide, findOverlaps, staleAfterLanding } from './radar.js';
import { createLandingQueue } from './landing.js';

/** @typedef {import('./types').AttemptView} AttemptView */
/** @typedef {import('./types').Claim} Claim */
/** @typedef {import('./types').CommitView} CommitView */
/** @typedef {import('./types').DemoEvent} DemoEvent */
/** @typedef {import('./types').DemoTask} DemoTask */
/** @typedef {import('./types').ProjectSnapshot} ProjectSnapshot */
/** @typedef {import('../git/types').ReplayContext} ReplayContext */

/** @type {Record<string, number>} */
export const DEMO_WORK = {
  t_rate_limit: 500,
  t_validate_login: 200,
  t_rename_email: 100,
  t_health: 200,
  t_request_log: 200,
  t_todos_page: 100,
};

/**
 * @typedef {Object} Attempt
 * @property {string} attemptId
 * @property {string} taskId
 * @property {string} agent
 * @property {string} intent
 * @property {string} prompt
 * @property {string[]} touches
 * @property {import('./types').AgentStatus} status
 * @property {string} forkName
 * @property {string} baseCommit
 * @property {string | null} replayOf
 * @property {number} replayCount
 * @property {number} startedAt
 * @property {string | null} sha
 * @property {boolean} stale
 * @property {string[]} blockedBy
 * @property {Claim[]} claims
 */

/**
 * @typedef {Object} EditContext
 * @property {string} taskId
 * @property {string} attemptId
 * @property {Record<string, string>} files
 * @property {ReplayContext | null} replay
 * @property {string} prompt
 * @property {string[]} touches
 */

/**
 * @typedef {{ at: number, priority: number, attemptId: string }} LandEvent
 */

/**
 * @param {Object} options
 * @param {Record<string, string>} options.files
 * @param {DemoTask[]} options.tasks
 * @param {(ctx: EditContext) => Record<string, string> | Promise<Record<string, string>>} [options.edit]
 * @param {Record<string, number>} [options.workTicks]
 * @param {number} [options.maxReplays]
 * @param {number} [options.replayDelay]
 * @param {(snapshot: ProjectSnapshot) => void} [options.onFrame]
 * @param {(info: { attemptId: string, agent: string, taskId: string, message: string, files: Record<string, string> }) => void | Promise<void>} [options.onFork]
 * @returns {Promise<ProjectSnapshot & { files: Record<string, string> }>}
 */
export async function runProject(options) {
  const edit = options.edit ?? ((ctx) => applyTaskEdit(ctx.taskId, ctx.files));
  const workTicks = options.workTicks ?? DEMO_WORK;
  const maxReplays = options.maxReplays ?? 2;
  const replayDelay = options.replayDelay ?? 0;
  const onFrame = options.onFrame ?? (() => undefined);
  const onFork = options.onFork ?? (() => undefined);
  const identity = createIdentityClock();
  const repo = await initRepo(options.files, identity(), 'Seed the demo API');
  /** @type {Attempt[]} */
  const attempts = [];
  /** @type {DemoEvent[]} */
  const events = [];
  /** @type {LandEvent[]} */
  const lands = [];
  const landings = createLandingQueue();
  let seq = 0;

  const ordered = options.tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => a.task.delayMs - b.task.delayMs || a.index - b.index);

  for (const { task } of ordered) {
    seq += 1;
    const attempt = createAttempt(task, seq, await head(), null, 0);
    attempts.push(attempt);
    openAttempt(attempt, task.delayMs + (workTicks[task.id] ?? 1000), 0);
    onFrame(await snapshot());
  }

  let guard = 0;
  while (lands.length > 0) {
    guard += 1;
    if (guard > 40) throw new Error('landing schedule did not finish');
    lands.sort(compareLand);
    const next = lands.shift();
    if (!next) break;
    const attempt = findAttempt(next.attemptId);
    if (attempt.status !== 'editing') continue;
    await finish(attempt, next.at);
    onFrame(await snapshot());
  }

  const files = await readTree(repo.fs, repo.dir, 'main');
  for (const text of Object.values(files)) {
    if (hasConflictMarkers(text)) throw new Error('main contains conflict markers');
  }
  return { ...(await snapshot()), files };

  /**
   * @param {DemoTask} task
   * @param {number} n
   * @param {string} baseCommit
   * @param {string | null} replayOf
   * @param {number} replayCount
   * @returns {Attempt}
   */
  function createAttempt(task, n, baseCommit, replayOf, replayCount) {
    const attemptId = `a_${n}`;
    return {
      attemptId,
      taskId: task.id,
      agent: task.agent,
      intent: task.intent,
      prompt: task.prompt,
      touches: task.touches,
      status: 'planning',
      forkName: attemptId,
      baseCommit,
      replayOf,
      replayCount,
      startedAt: task.delayMs,
      sha: null,
      stale: false,
      blockedBy: [],
      claims: task.touches.map((touch, index) => ({
        attemptId,
        ...parseTouch(touch),
        kind: /** @type {const} */ ('declared'),
        createdAt: index,
      })),
    };
  }

  /**
   * @param {Attempt} attempt
   * @param {number} at
   * @param {number} priority
   */
  function openAttempt(attempt, at, priority) {
    const judged = judge(attempt);
    if (judged.action === 'yield') {
      attempt.status = 'yielding';
      attempt.blockedBy = judged.yieldedTo;
      events.push({
        type: 'yield',
        attemptId: attempt.attemptId,
        agent: attempt.agent,
        waitingFor: judged.yieldedTo,
      });
      return;
    }
    attempt.status = 'editing';
    events.push({
      type: 'proceed',
      attemptId: attempt.attemptId,
      agent: attempt.agent,
      level: judged.level,
    });
    lands.push({ at, priority, attemptId: attempt.attemptId });
  }

  /**
   * @param {Attempt} attempt
   * @returns {{ action: 'yield' | 'proceed', yieldedTo: string[], level: 'clear' | 'file' | 'symbol' }}
   */
  function judge(attempt) {
    const existing = attempts
      .filter((other) => other.attemptId !== attempt.attemptId && isOpen(other))
      .flatMap((other) => other.claims);
    /** @type {'yield' | 'proceed'} */
    let action = 'proceed';
    /** @type {string[]} */
    const yieldedTo = [];
    /** @type {'clear' | 'file' | 'symbol'} */
    let level = 'clear';
    for (const claim of attempt.claims) {
      for (const overlap of findOverlaps(existing, claim)) {
        const other = findAttempt(overlap.attemptId);
        const decision = decide(
          overlap,
          { attemptId: attempt.attemptId, startedAt: attempt.startedAt },
          { attemptId: other.attemptId, startedAt: other.startedAt },
        );
        if (decision === 'yield') {
          action = 'yield';
          level = 'symbol';
          if (!yieldedTo.includes(other.attemptId)) yieldedTo.push(other.attemptId);
        } else if (level === 'clear') {
          level = overlap.level;
        }
      }
    }
    return { action, yieldedTo, level };
  }

  /**
   * @param {Attempt} attempt
   * @param {number} now
   * @returns {Promise<void>}
   */
  async function finish(attempt, now) {
    if (attempt.stale) {
      await beginReplay(attempt, 'stale', now);
      return;
    }
    try {
      const beforeTree = await readTree(repo.fs, repo.dir, attempt.baseCommit);
      const would = await Promise.resolve(
        edit({
          taskId: attempt.taskId,
          attemptId: attempt.attemptId,
          files: beforeTree,
          replay: null,
          prompt: attempt.prompt,
          touches: attempt.touches,
        }),
      );
      const previousDiff = Object.entries(would)
        .map(([path, text]) => `*** ${path}\n${text}`)
        .join('\n');
      const since = await commitsSince(attempt.baseCommit);
      const replay = attempt.replayOf ? buildReplayContext(since, previousDiff, parseTrailers) : null;
      const changed = await Promise.resolve(
        edit({
          taskId: attempt.taskId,
          attemptId: attempt.attemptId,
          files: beforeTree,
          replay,
          prompt: attempt.prompt,
          touches: attempt.touches,
        }),
      );
      const intent = {
        summary: attempt.intent,
        rationale: attempt.prompt,
        task: attempt.taskId,
        attempt: attempt.attemptId,
        agent: attempt.agent,
        intent: attempt.intent,
        claims: attempt.touches,
        replayOf: attempt.replayOf,
        base: attempt.baseCommit,
      };
      const record = `${JSON.stringify({ ...intent, replay }, null, 2)}\n`;
      await forkBranch(repo.fs, repo.dir, attempt.forkName, attempt.baseCommit);
      await commitOnBranch(
        repo.fs,
        repo.dir,
        attempt.forkName,
        { ...changed, [`.envoy/intents/${attempt.attemptId}.json`]: record },
        formatTrailers(intent),
        identity(),
      );
      await onFork({
        attemptId: attempt.attemptId,
        agent: attempt.agent,
        taskId: attempt.taskId,
        message: formatTrailers(intent),
        files: await readTree(repo.fs, repo.dir, attempt.forkName),
      });
      const mainBefore = await head();
      const result = await landings.run(() =>
        landFork(repo.fs, repo.dir, attempt.forkName, attempt.baseCommit, identity()),
      );
      if (result.kind === 'replay') {
        await beginReplay(attempt, 'conflict', now);
        return;
      }
      attempt.status = 'landed';
      attempt.sha = result.sha;
      events.push({
        type: 'landed',
        attemptId: attempt.attemptId,
        agent: attempt.agent,
        sha: result.sha,
        kind: result.kind,
      });
      await noteMainMoved(mainBefore, result.sha, now);
      await resumeYielders(now);
    } catch (err) {
      attempt.status = 'failed';
      events.push({
        type: 'failed',
        attemptId: attempt.attemptId,
        agent: attempt.agent,
        message: err instanceof Error ? err.message : 'attempt failed',
      });
    }
  }

  /**
   * @param {Attempt} attempt
   * @param {'stale' | 'conflict'} reason
   * @param {number} now
   * @returns {Promise<void>}
   */
  async function beginReplay(attempt, reason, now) {
    if (attempt.replayCount >= maxReplays) {
      attempt.status = 'needs-human';
      events.push({ type: 'needs-human', attemptId: attempt.attemptId, agent: attempt.agent });
      return;
    }
    attempt.status = 'replaying';
    seq += 1;
    const next = createAttempt(taskOf(attempt), seq, await head(), attempt.attemptId, attempt.replayCount + 1);
    next.startedAt = attempt.startedAt;
    attempts.push(next);
    events.push({
      type: 'replay',
      attemptId: next.attemptId,
      agent: next.agent,
      replayOf: attempt.attemptId,
      reason,
    });
    openAttempt(next, now + replayDelay, -1);
  }

  /**
   * @param {string} base
   * @param {string} sha
   * @param {number} now
   * @returns {Promise<void>}
   */
  async function noteMainMoved(base, sha, now) {
    const paths = await changedPaths(repo.fs, repo.dir, base, sha);
    /** @type {{ path: string, symbols: string[] }[]} */
    const changes = [];
    for (const path of paths) {
      if (!path.endsWith('.js')) continue;
      const before = (await readTextAt(repo.fs, repo.dir, base, path)) ?? '';
      const after = (await readTextAt(repo.fs, repo.dir, sha, path)) ?? '';
      const symbols = changedSymbols(before, after);
      if (symbols.length > 0) changes.push({ path, symbols });
    }
    const openClaims = attempts.filter((item) => item.status === 'editing').flatMap((item) => item.claims);
    for (const attemptId of staleAfterLanding(changes, openClaims)) {
      const staleAttempt = findAttempt(attemptId);
      if (staleAttempt.stale) continue;
      staleAttempt.stale = true;
      events.push({ type: 'stale', attemptId, agent: staleAttempt.agent });
      const pending = lands.find((item) => item.attemptId === attemptId);
      if (pending) {
        pending.at = now;
        pending.priority = -1;
      }
    }
  }

  /**
   * @param {number} now
   * @returns {Promise<void>}
   */
  async function resumeYielders(now) {
    for (const waiting of attempts) {
      if (waiting.status !== 'yielding') continue;
      if (!waiting.blockedBy.every((id) => chainLanded(id))) continue;
      waiting.baseCommit = await head();
      waiting.stale = false;
      waiting.status = 'planning';
      const at = now + (workTicks[waiting.taskId] ?? 1000);
      openAttempt(waiting, at, 1);
    }
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function chainLanded(id) {
    const attempt = findAttempt(id);
    if (attempt.status === 'landed') return true;
    return attempts.some((other) => other.replayOf === id && chainLanded(other.attemptId));
  }

  /**
   * @param {string} ref
   * @returns {Promise<{ sha: string, message: string }[]>}
   */
  async function commitsSince(ref) {
    const commits = await logMain(repo.fs, repo.dir);
    /** @type {{ sha: string, message: string }[]} */
    const newer = [];
    for (const commit of commits) {
      if (commit.sha === ref) break;
      newer.push(commit);
    }
    return newer.reverse();
  }

  /** @returns {Promise<string>} */
  function head() {
    return git.resolveRef({ fs: repo.fs, dir: repo.dir, ref: 'main' });
  }

  /** @returns {Promise<ProjectSnapshot>} */
  async function snapshot() {
    const commits = await logMain(repo.fs, repo.dir);
    /** @type {CommitView[]} */
    const views = [];
    for (const commit of commits.reverse()) {
      if (commit.message.startsWith('Seed the demo API')) continue;
      /** @type {CommitView} */
      const view = {
        sha: commit.sha,
        message: commit.message,
        summary: commit.message.trim(),
        agent: null,
        task: null,
        attempt: null,
        replayOf: null,
      };
      try {
        const intent = parseTrailers(commit.message);
        view.summary = intent.summary;
        view.agent = intent.agent;
        view.task = intent.task;
        view.attempt = intent.attempt;
        view.replayOf = intent.replayOf;
      } catch {
        view.summary = commit.message.trim();
      }
      views.push(view);
    }
    const agents = attempts.map(toView);
    /** @type {ProjectSnapshot['lineage']} */
    const lineage = [];
    for (const agent of agents) {
      const group = lineage.find((item) => item.taskId === agent.taskId);
      if (group) group.attempts.push(agent);
      else lineage.push({ taskId: agent.taskId, agent: agent.agent, intent: agent.intent, attempts: [agent] });
    }
    return {
      agents,
      claims: attempts.flatMap((item) => item.claims),
      commits: views,
      events: events.slice(),
      lineage,
    };
  }

  /**
   * @param {string} attemptId
   * @returns {Attempt}
   */
  function findAttempt(attemptId) {
    const attempt = attempts.find((item) => item.attemptId === attemptId);
    if (!attempt) throw new Error(`missing attempt ${attemptId}`);
    return attempt;
  }

  /**
   * @param {Attempt} attempt
   * @returns {DemoTask}
   */
  function taskOf(attempt) {
    return {
      id: attempt.taskId,
      agent: attempt.agent,
      delayMs: attempt.startedAt,
      prompt: attempt.prompt,
      intent: attempt.intent,
      touches: attempt.touches,
    };
  }
}

/**
 * @param {Attempt} attempt
 * @returns {boolean}
 */
function isOpen(attempt) {
  return attempt.status === 'editing' || attempt.status === 'yielding' || attempt.status === 'planning';
}

/**
 * @param {Attempt} attempt
 * @returns {AttemptView}
 */
function toView(attempt) {
  return {
    attemptId: attempt.attemptId,
    taskId: attempt.taskId,
    agent: attempt.agent,
    intent: attempt.intent,
    status: attempt.status,
    replayOf: attempt.replayOf,
    replayCount: attempt.replayCount,
    sha: attempt.sha,
    blockedBy: attempt.blockedBy.slice(),
  };
}

/**
 * @param {string} touch
 * @returns {{ path: string, symbol: string | null }}
 */
function parseTouch(touch) {
  const hash = touch.indexOf('#');
  if (hash === -1) return { path: touch, symbol: null };
  const symbol = touch.slice(hash + 1);
  return { path: touch.slice(0, hash), symbol: symbol.length > 0 ? symbol : null };
}

/**
 * @param {LandEvent} a
 * @param {LandEvent} b
 * @returns {number}
 */
function compareLand(a, b) {
  return a.at - b.at || a.priority - b.priority;
}
