#!/usr/bin/env node
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { applyTaskEdit } from '../src/agent/edits.js';
import { runProject } from '../src/coordinator/engine.js';
import { SEED_FILES } from '../src/demo/seed-files.js';
import { DEMO_TASKS } from '../src/demo/tasks.js';
import { mainRepoName } from '../src/cloudflare/api.js';
import { publishAgentFork, restControl } from '../src/git/forks.js';
import { landFork } from '../src/git/land.js';
import { MemoryFS } from '../src/git/memory-fs.js';
import { commitOnRemote } from '../src/git/publish.js';
import { identityAt, readTextAt } from '../src/git/repo.js';
import { tokenSecret } from '../src/git/token.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const namespace = process.env.ARTIFACTS_NAMESPACE ?? 'envoy';
const project = process.env.ENVOY_PROJECT ?? 'demo';
const mainName = mainRepoName(project);

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run pnpm spike:b.');
  process.exit(1);
}

/** @type {Record<string, [string, string]>} */
const MARKERS = {
  t_rate_limit: ['src/lib/limiter.js', 'allowLogin('],
  t_validate_login: ['src/routes/auth.js', 'password too short'],
  t_rename_email: ['src/lib/db.js', 'emailAddress'],
  t_health: ['src/server.js', 'export function health('],
  t_request_log: ['src/server.js', 'export function logRequest('],
  t_todos_page: ['src/routes/todos.js', 'query?.limit'],
};

const control = restControl(accountId, token, namespace);
/** @type {{ attemptId: string, agent: string, taskId: string, fork: string, commit: string, created: boolean, marker: boolean, remote: string, token: string }[]} */
const published = [];
/** @type {{ attemptId: string, message: string }[]} */
const failures = [];

await runProject({
  files: SEED_FILES,
  tasks: DEMO_TASKS,
  async onFork(info) {
    const forkName = `${project}-a-${info.attemptId}`;
    try {
      const result = await publishAgentFork(control, {
        sourceName: mainName,
        forkName,
        description: `${info.agent} ${info.taskId}`,
        files: info.files,
        message: info.message,
        http,
      });
      const marker = MARKERS[info.taskId];
      const text = marker ? await control.readText(result.name, 'main', marker[0]) : '';
      const ok = Boolean(marker && text && text.includes(marker[1]));
      published.push({
        attemptId: info.attemptId,
        agent: info.agent,
        taskId: info.taskId,
        fork: result.name,
        commit: result.commit,
        created: result.created,
        marker: ok,
        remote: result.remote,
        token: result.token,
      });
      if (!ok) failures.push({ attemptId: info.attemptId, message: `missing marker in ${marker?.[0] ?? 'unknown'}` });
    } catch (err) {
      failures.push({ attemptId: info.attemptId, message: err instanceof Error ? err.message : 'publish failed' });
    }
  },
});

const mainInfo = await control.find(mainName);
if (!mainInfo) throw new Error(`${mainName} is missing`);
const mainToken = await control.writeToken(mainName);
const healthFiles = { ...SEED_FILES, ...applyTaskEdit('t_health', SEED_FILES) };
const mainPush = await commitOnRemote({
  remote: mainInfo.remote,
  token: mainToken,
  files: healthFiles,
  message: 'Spike B divergent main\n',
  http,
});

const health = byTask('t_health');
const todos = byTask('t_todos_page');
const clean = await mergePair(health, todos);
const left = await publishAgentFork(control, {
  sourceName: mainName,
  forkName: `${project}-spike-b-left`,
  description: 'spike b conflict left',
  files: { ...SEED_FILES, 'src/server.js': 'export function health() {\n  return { ok: true, side: "left" };\n}\n' },
  message: 'Spike B left\n',
  http,
});
const right = await publishAgentFork(control, {
  sourceName: mainName,
  forkName: `${project}-spike-b-right`,
  description: 'spike b conflict right',
  files: { ...SEED_FILES, 'src/server.js': 'export function health() {\n  return { ok: true, side: "right" };\n}\n' },
  message: 'Spike B right\n',
  http,
});
const conflict = await mergePair(
  { remote: left.remote, token: left.token },
  { remote: right.remote, token: right.token },
);

const forks = published.map((item) => ({
  attemptId: item.attemptId,
  agent: item.agent,
  taskId: item.taskId,
  fork: item.fork,
  commit: item.commit,
  created: item.created,
  marker: item.marker,
}));
const summary = {
  forks,
  failures,
  main: { repo: mainName, commit: mainPush.oid, created: mainPush.created },
  clean,
  conflict: { kind: conflict.kind },
};
console.log(JSON.stringify(summary, null, 2));
const tasks = new Set(forks.filter((item) => item.marker).map((item) => item.taskId));
const missingTasks = Object.keys(MARKERS).filter((taskId) => !tasks.has(taskId));
if (failures.length > 0 || missingTasks.length > 0 || !clean.health || !clean.todos || conflict.kind !== 'replay') {
  process.exit(1);
}

/**
 * @param {string} taskId
 * @returns {{ remote: string, token: string }}
 */
function byTask(taskId) {
  const found = published.find((item) => item.taskId === taskId && item.marker);
  if (!found) throw new Error(`missing published fork for ${taskId}`);
  return found;
}

/**
 * @param {{ remote: string, token: string }} ours
 * @param {{ remote: string, token: string }} theirs
 * @returns {Promise<{ kind: string, health: boolean, todos: boolean }>}
 */
async function mergePair(ours, theirs) {
  const fs = new MemoryFS();
  const dir = '/repo';
  await git.clone({
    fs,
    http,
    dir,
    url: ours.remote,
    ref: 'main',
    singleBranch: true,
    onAuth: () => ({ username: 'x', password: tokenSecret(ours.token) }),
  });
  await git.addRemote({ fs, dir, remote: 'other', url: theirs.remote, force: true });
  await git.fetch({
    fs,
    http,
    dir,
    remote: 'other',
    ref: 'main',
    singleBranch: true,
    onAuth: () => ({ username: 'x', password: tokenSecret(theirs.token) }),
  });
  await git.branch({ fs, dir, ref: 'incoming', object: 'refs/remotes/other/main', force: true });
  const mainOid = await git.resolveRef({ fs, dir, ref: 'main' });
  const commit = await git.readCommit({ fs, dir, oid: mainOid });
  const base = commit.commit.parent[0];
  if (!base) throw new Error('fork commit has no parent');
  const landed = await landFork(fs, dir, 'incoming', base, identityAt(1_700_000_100));
  if (landed.kind === 'replay') return { kind: landed.kind, health: false, todos: false };
  const server = (await readTextAt(fs, dir, 'main', 'src/server.js')) ?? '';
  const todoFile = (await readTextAt(fs, dir, 'main', 'src/routes/todos.js')) ?? '';
  return {
    kind: landed.kind,
    health: server.includes('export function health('),
    todos: todoFile.includes('query?.limit'),
  };
}
