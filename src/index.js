import { handleArtifactsEvent } from './events/artifacts.js';

export { Coordinator } from './coordinator/coordinator.js';
export { AgentRunner } from './agent/runner.js';

/**
 * @param {URL} url
 * @returns {string}
 */
function projectIdFrom(url) {
  return url.searchParams.get('project') ?? 'demo';
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function routeApi(request, env) {
  const url = new URL(request.url);
  const id = env.COORDINATOR.idFromName(projectIdFrom(url));
  const stub = env.COORDINATOR.get(id);
  return stub.fetch(request);
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return routeApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  /**
   * @param {MessageBatch} batch
   * @param {Env} env
   * @returns {Promise<void>}
   */
  async queue(batch, env) {
    for (const message of batch.messages) {
      await handleArtifactsEvent(message, env);
      message.ack();
    }
  },
};
