import { DurableObject } from 'cloudflare:workers';
import { createDemoEdit } from '../agent/edit-source.js';
import { applyTaskEdit } from '../agent/edits.js';
import { DEMO_TASKS } from '../demo/tasks.js';
import { SEED_FILES } from '../demo/seed-files.js';
import { bindingControl, publishAgentFork } from '../git/forks.js';
import { runSpikeA } from '../git/publish.js';
import { runProject } from './engine.js';
import { applyMainMoved, emptySnapshot, registerAttempt } from './snapshot.js';

/** @typedef {import('./types').ProjectSnapshot} ProjectSnapshot */

export class Coordinator extends DurableObject {
  /**
   * @param {DurableObjectState} state
   * @param {Env} env
   */
  constructor(state, env) {
    super(state, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS snapshot (id TEXT PRIMARY KEY, body TEXT NOT NULL)`,
    );
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/api/ws') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify(await this.load()));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return Response.json({
        ok: true,
        service: 'coordinator',
        project: url.searchParams.get('project') ?? 'demo',
      });
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      return Response.json(await this.load());
    }

    if (url.pathname === '/api/demo' && request.method === 'POST') {
      return this.streamDemo();
    }

    if (url.pathname === '/api/attempts' && request.method === 'POST') {
      const body = await request.json();
      const incoming = normalizeAttempt(body);
      if (!incoming) return Response.json({ ok: false, error: 'bad_attempt' }, { status: 400 });
      const next = registerAttempt(await this.load(), incoming.attempt, incoming.claims);
      await this.save(next);
      this.broadcast(next);
      return Response.json(next);
    }

    if (url.pathname === '/api/main-moved' && request.method === 'POST') {
      const body = await request.json();
      const push = normalizePush(body);
      if (!push) return Response.json({ ok: false, error: 'bad_push' }, { status: 400 });
      const next = applyMainMoved(await this.load(), push);
      await this.save(next);
      this.broadcast(next);
      const replays = next.events.filter((event) => event.type === 'replay');
      return Response.json({ ok: true, events: next.events.length, replays });
    }

    if (url.pathname === '/api/spike/b' && request.method === 'POST') {
      const artifacts = artifactsBinding(this.env);
      if (!artifacts) return Response.json({ ok: false, error: 'artifacts_unavailable' }, { status: 501 });
      try {
        const control = bindingControl(artifacts);
        const files = { ...SEED_FILES, ...applyTaskEdit('t_health', SEED_FILES) };
        const published = await publishAgentFork(control, {
          sourceName: 'demo-main',
          forkName: 'demo-binding-agent-4',
          description: 'agent-4 binding fork',
          files,
          message: 'Add GET /health\n\nEnvoy-Agent: agent-4\n',
        });
        const text = await control.readText(published.name, 'main', 'src/server.js');
        return Response.json({
          ok: text?.includes('export function health(') === true,
          fork: published.name,
          commit: published.commit,
          created: published.created,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'spike failed';
        return Response.json({ ok: false, error: 'spike_failed', message }, { status: 502 });
      }
    }

    if (url.pathname === '/api/spike/a' && request.method === 'POST') {
      const artifacts = this.env.ARTIFACTS;
      if (!artifacts) {
        return Response.json({ ok: false, error: 'artifacts_unavailable' }, { status: 501 });
      }
      try {
        return Response.json(await runSpikeA(artifacts));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'spike failed';
        return Response.json({ ok: false, error: 'spike_failed', message }, { status: 502 });
      }
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  /**
   * @returns {Response}
   */
  streamDemo() {
    const encoder = new TextEncoder();
    const snapshot = this;
    const stream = new ReadableStream({
      /**
       * @param {ReadableStreamDefaultController<Uint8Array>} controller
       */
      async start(controller) {
        try {
          const demoEdit = createDemoEdit(aiBinding(snapshot.env));
          const result = await runProject({
            files: SEED_FILES,
            tasks: DEMO_TASKS,
            edit: demoEdit.edit,
            onFrame(frame) {
              controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
            },
          });
          /** @type {ProjectSnapshot} */
          const finalSnapshot = {
            agents: result.agents,
            claims: result.claims,
            commits: result.commits,
            events: result.events,
            lineage: result.lineage,
          };
          await snapshot.save(finalSnapshot);
          snapshot.broadcast(finalSnapshot);
          controller.enqueue(encoder.encode(`${JSON.stringify({ ...finalSnapshot, edits: demoEdit.tally })}\n`));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'demo failed';
          controller.enqueue(encoder.encode(`${JSON.stringify({ ok: false, error: message })}\n`));
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
    });
  }

  /**
   * @returns {Promise<ProjectSnapshot>}
   */
  async load() {
    const rows = this.ctx.storage.sql
      .exec(`SELECT body FROM snapshot WHERE id = ?`, 'current')
      .toArray();
    const body = rows[0]?.body;
    if (typeof body !== 'string') return emptySnapshot();
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.agents)) return emptySnapshot();
      return /** @type {ProjectSnapshot} */ (parsed);
    } catch {
      return emptySnapshot();
    }
  }

  /**
   * @param {ProjectSnapshot} value
   * @returns {Promise<void>}
   */
  async save(value) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO snapshot (id, body) VALUES (?, ?)`,
      'current',
      JSON.stringify(value),
    );
  }

  /**
   * @param {ProjectSnapshot} value
   */
  broadcast(value) {
    const text = JSON.stringify(value);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(text);
    }
  }
}

/**
 * @param {unknown} body
 * @returns {{ repo: string, after: string } | null}
 */
/**
 * @param {Env} env
 * @returns {Artifacts | undefined}
 */
function artifactsBinding(env) {
  const artifacts = /** @type {Env & { ARTIFACTS?: Artifacts }} */ (env).ARTIFACTS;
  return artifacts;
}

/**
 * @param {Env} env
 * @returns {import('../agent/types').ToolCaller | undefined}
 */
function aiBinding(env) {
  const ai = /** @type {Env & { AI?: { run?: (model: string, input: Record<string, unknown>) => Promise<unknown> } }} */ (
    env
  ).AI;
  if (!ai || typeof ai.run !== 'function') return undefined;
  return {
    run(model, input) {
      return /** @type {{ run: (model: string, input: Record<string, unknown>) => Promise<unknown> }} */ (ai).run(
        model,
        input,
      );
    },
  };
}

/**
 * @param {unknown} body
 * @returns {{ repo: string, after: string, changes: { path: string, symbols: string[] }[] } | null}
 */
function normalizePush(body) {
  if (!body || typeof body !== 'object') return null;
  const repo = 'repo' in body && typeof body.repo === 'string' ? body.repo : '';
  const after = 'after' in body && typeof body.after === 'string' ? body.after : '';
  if (repo.length === 0 || after.length === 0) return null;
  /** @type {{ path: string, symbols: string[] }[]} */
  const changes = [];
  if ('changes' in body && Array.isArray(body.changes)) {
    for (const item of body.changes) {
      if (!item || typeof item !== 'object') continue;
      const path = 'path' in item && typeof item.path === 'string' ? item.path : '';
      if (path.length === 0) continue;
      /** @type {string[]} */
      const symbols = [];
      if ('symbols' in item && Array.isArray(item.symbols)) {
        for (const symbol of item.symbols) {
          if (typeof symbol === 'string') symbols.push(symbol);
        }
      }
      changes.push({ path, symbols });
    }
  }
  return { repo, after, changes };
}

/**
 * @param {unknown} body
 * @returns {{ attempt: import('./types').AttemptView, claims: import('./types').Claim[] } | null}
 */
function normalizeAttempt(body) {
  if (!body || typeof body !== 'object') return null;
  const attemptId = stringField(body, 'attemptId');
  const taskId = stringField(body, 'taskId');
  const agent = stringField(body, 'agent');
  const intent = stringField(body, 'intent');
  if (attemptId.length === 0 || taskId.length === 0 || agent.length === 0 || intent.length === 0) return null;
  if (!('claims' in body) || !Array.isArray(body.claims) || body.claims.length === 0) return null;
  /** @type {import('./types').Claim[]} */
  const claims = [];
  for (const item of body.claims) {
    if (!item || typeof item !== 'object') return null;
    const path = 'path' in item && typeof item.path === 'string' ? item.path : '';
    if (path.length === 0) return null;
    const symbol = 'symbol' in item && typeof item.symbol === 'string' ? item.symbol : null;
    claims.push({
      attemptId,
      path,
      symbol,
      kind: 'declared',
      createdAt: claims.length,
    });
  }
  return {
    attempt: {
      attemptId,
      taskId,
      agent,
      intent,
      status: 'editing',
      replayOf: null,
      replayCount: 0,
      sha: null,
      blockedBy: [],
    },
    claims,
  };
}

/**
 * @param {object} body
 * @param {string} key
 * @returns {string}
 */
function stringField(body, key) {
  if (!(key in body)) return '';
  const value = /** @type {Record<string, unknown>} */ (body)[key];
  return typeof value === 'string' ? value : '';
}
