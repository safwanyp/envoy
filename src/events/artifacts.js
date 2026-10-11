import { parseArtifactsMessage, projectFromRepo } from './parse.js';

/**
 * @param {Message} message
 * @param {Env} env
 * @returns {Promise<void>}
 */
export async function handleArtifactsEvent(message, env) {
  const parsed = parseArtifactsMessage(message.body);
  if (!parsed) return;
  if (parsed.ref !== 'refs/heads/main') return;
  const id = env.COORDINATOR.idFromName(projectFromRepo(parsed.repo));
  const stub = env.COORDINATOR.get(id);
  await stub.fetch(
    new Request('https://envoy.internal/api/main-moved', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: parsed.repo, after: parsed.after }),
    }),
  );
}
