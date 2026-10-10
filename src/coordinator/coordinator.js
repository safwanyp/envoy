import { DurableObject } from 'cloudflare:workers';

/**
 * Per-project coordinator: agents, claims/radar, landing queue, intent log, WS hub.
 * Skeleton: health + empty state only. Full radar/landing lands on Day 2.
 */
export class Coordinator extends DurableObject {
  /**
   * @param {DurableObjectState} state
   * @param {Env} env
   */
  constructor(state, env) {
    super(state, env);
    this.state = state;
    /** @type {Env} */
    this.env = env;
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return Response.json({
        ok: true,
        service: 'coordinator',
        project: url.searchParams.get('project') ?? 'demo',
      });
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      return Response.json({
        agents: [],
        claims: [],
        intents: [],
        landings: [],
      });
    }

    if (url.pathname === '/api/demo' && request.method === 'POST') {
      return Response.json(
        {
          ok: false,
          error: 'demo_not_wired',
          message: 'Run demo is stubbed until AgentRunner + seed land.',
        },
        { status: 501 },
      );
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
