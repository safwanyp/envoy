import { DurableObject } from 'cloudflare:workers';
import { DEMO_TASKS } from '../demo/tasks.js';
import { SEED_FILES } from '../demo/seed-files.js';
import { runSpikeA } from '../git/publish.js';
import { runProject } from './engine.js';
import { applyMainMoved, emptySnapshot } from './snapshot.js';

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

    if (url.pathname === '/api/main-moved' && request.method === 'POST') {
      const body = await request.json();
      const push = normalizePush(body);
      if (!push) return Response.json({ ok: false, error: 'bad_push' }, { status: 400 });
      const next = applyMainMoved(await this.load(), push);
      await this.save(next);
      this.broadcast(next);
      return Response.json({ ok: true, events: next.events.length });
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
          const result = await runProject({
            files: SEED_FILES,
            tasks: DEMO_TASKS,
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
          controller.enqueue(encoder.encode(`${JSON.stringify(finalSnapshot)}\n`));
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
function normalizePush(body) {
  if (!body || typeof body !== 'object') return null;
  const repo = 'repo' in body && typeof body.repo === 'string' ? body.repo : '';
  const after = 'after' in body && typeof body.after === 'string' ? body.after : '';
  if (repo.length === 0 || after.length === 0) return null;
  return { repo, after };
}
