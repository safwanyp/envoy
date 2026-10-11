import { changesBetween } from './files.js';
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
  const changes = await pushChanges(env, parsed);
  const id = env.COORDINATOR.idFromName(projectFromRepo(parsed.repo));
  const stub = env.COORDINATOR.get(id);
  await stub.fetch(
    new Request('https://envoy.internal/api/main-moved', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: parsed.repo, after: parsed.after, changes }),
    }),
  );
}

/**
 * @param {Env} env
 * @param {import('./parse.js').PushedEvent} parsed
 * @returns {Promise<{ path: string, symbols: string[] }[]>}
 */
async function pushChanges(env, parsed) {
  const artifacts = /** @type {Env & { ARTIFACTS?: Artifacts }} */ (env).ARTIFACTS;
  if (!artifacts) return [];
  /** @type {ArtifactsRepo | undefined} */
  let repo;
  try {
    repo = await artifacts.get(parsed.repo);
    return await changesBetween(repo, parsed.before, parsed.after);
  } finally {
    repo?.[Symbol.dispose]();
  }
}
