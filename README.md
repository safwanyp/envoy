# Envoy

Many agents, one main branch. The radar tells an agent who else is editing a file, and why. If a landing still conflicts, Envoy throws away the stale diff and re-runs the same intent on current main.

Built for the Cloudflare [next Git platform](https://blog.cloudflare.com/next-git-platform-on-cloudflare/) competition. [`PLAN.md`](./PLAN.md) is the architecture.

## Requirements

- Node.js 22.18 or newer. `cf` does not load `cloudflare.config.ts` on older Node.
- pnpm
- A Cloudflare API token only if you push the demo repo to Artifacts or deploy

## Run the demo on your machine

```bash
pnpm install
pnpm test
pnpm dev
```

Open `http://127.0.0.1:8791`. Click **Run demo**.

The page streams each claim, yield, and landing. When it finishes:

- **Radar** shows who claimed which file and symbol.
- **Main timeline** lists commits. Each agent commit carries `Envoy-Intent` trailers.
- **Lineage** shows agent-1's first attempt as replaying, then a later attempt as landed, marked as a replay of `a_1`.
- The status line ends on the last landing. In this run that text is `agent-5 landed (merge)`. Earlier frames include `agent-2 yielded` and `agent-1 is stale and will replay`.

`pnpm test` checks the git result. Main contains rate limiting on `emailAddress`, stricter password checks, `GET /health`, request logging, and todo pagination. No file contains conflict markers.

You can drive the same run without the button:

```bash
curl -N -X POST 'http://127.0.0.1:8791/api/demo?project=demo'
curl -s 'http://127.0.0.1:8791/api/state?project=demo'
```

Local dev does not call Artifacts or Workers AI. The six tasks use scripted edits so the run repeats. `src/agent/llm.js` is the Workers AI client for a later non-demo task.

## Push main to Artifacts

Create an API token that can manage Artifacts and Queues. Deploy once so the queue `envoy-artifacts-events` exists, then:

```bash
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_API_TOKEN=your-token
pnpm seed
pnpm subscribe
```

`pnpm seed` creates `<project>-main` in the `envoy` namespace and pushes `demo/seed-repo`. `pnpm subscribe` subscribes that repo's `pushed` events to the queue. Override the project with `ENVOY_PROJECT` (default `demo`).

Remote Artifacts and Workers AI need a paid Workers plan:

```bash
pnpm types:cf
pnpm dev:cf
pnpm deploy
```

Deploy is yours to run. This tree does not deploy itself.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Local Worker and assets. No Artifacts or AI. |
| `pnpm dev:cf` | Local Worker, remote Artifacts and AI. |
| `pnpm build` | `cf build` |
| `pnpm types` | Regenerate `.cloudflare/types` for local mode. |
| `pnpm types:cf` | Types for `--mode cf`. |
| `pnpm typecheck` | `tsc --noEmit` for the Worker and the UI. |
| `pnpm test` | `node --test` for radar, trailers, merge, and the six-task run. |
| `pnpm seed` | Create the Artifacts main repo and push `demo/seed-repo`. |
| `pnpm subscribe` | Subscribe main `pushed` events to `envoy-artifacts-events`. |
| `pnpm deploy` | `cf deploy --mode cf` |

## License

MIT. See `LICENSE`.
