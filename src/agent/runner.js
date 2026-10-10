import { DurableObject } from 'cloudflare:workers';

/**
 * One attempt (including replays). Skeleton stub for Day 1.
 */
export class AgentRunner extends DurableObject {
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
    void request;
    return Response.json({
      ok: true,
      service: 'agent-runner',
      status: 'idle',
    });
  }
}
