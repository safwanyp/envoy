import { bindings, defineConfig, exports, triggers } from 'cf/config';

/**
 * @param {string} name
 * @param {{ withCloudBindings: boolean }} opts
 */
function envoyWorker(name: string, opts: { withCloudBindings: boolean }) {
  return {
    name,
    compatibilityDate: '2026-10-10',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: 'src/index.js',
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      notFoundHandling: 'single-page-application' as const,
      // Keep Worker-first so /api/* and ASSETS.fetch routing stay unchanged.
      runWorkerFirst: true,
    },
    triggers: [
      triggers.queue({
        name: 'envoy-artifacts-events',
      }),
    ],
    exports: {
      Coordinator: exports.durableObject({ storage: 'sqlite' }),
      AgentRunner: exports.durableObject({ storage: 'sqlite' }),
    },
    env: {
      COORDINATOR: bindings.durableObject({
        worker: name,
        exportName: 'Coordinator',
      }),
      AGENT: bindings.durableObject({
        worker: name,
        exportName: 'AgentRunner',
      }),
      ASSETS: bindings.assets(),
      EVENTS: bindings.queue({
        name: 'envoy-artifacts-events',
      }),
      ...(opts.withCloudBindings
        ? {
            ARTIFACTS: bindings.artifacts({
              namespace: 'envoy',
              // Artifacts has no local simulator; paid plan required.
              dev: { remote: true },
            }),
            AI: bindings.ai({
              dev: { remote: true },
            }),
          }
        : {}),
    },
  };
}

export default defineConfig((ctx) => {
  switch (ctx.mode) {
    case 'cf': {
      return { worker: envoyWorker('envoy-cf', { withCloudBindings: true }) };
    }
    default: {
      return { worker: envoyWorker('envoy', { withCloudBindings: false }) };
    }
  }
});
