/**
 * Queue consumer for Artifacts `cf.artifacts.repo.pushed` on main.
 * Day 1 stub: log and acknowledge. Proactive replay lands on Day 2.
 *
 * @param {Message} message
 * @param {Env} env
 * @returns {Promise<void>}
 */
export async function handleArtifactsEvent(message, env) {
  void env;
  console.log(
    JSON.stringify({
      event: 'artifacts.queue',
      body: message.body,
    }),
  );
}
