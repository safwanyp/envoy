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
- The page plays the run back one step every 1.5 seconds, holding yields, stale signals, and replays for 3 seconds, even though the local engine finishes in under a second. The banner under the top bar explains the current step, the elements it involves glow, and the **Event trail** keeps every step. The banner ends on `Done. 6 of 6 tasks landed on main, with 1 yield and 1 replay.`

`pnpm test` checks the git result. Main contains rate limiting on `emailAddress`, stricter password checks, `GET /health`, request logging, and todo pagination. No file contains conflict markers.

You can drive the same run without the button:

```bash
curl -N -X POST 'http://127.0.0.1:8791/api/demo?project=demo'
curl -s 'http://127.0.0.1:8791/api/state?project=demo'
```

Local `pnpm dev` does not call Artifacts or Workers AI. The six tasks use scripted edits so the run repeats. `pnpm dev:cf` gives that loop a remote AI binding. A model write replaces a file only when the text contains the task marker.

## Push main to Artifacts

Create an API token that can manage Artifacts. `pnpm subscribe` creates the queue `envoy-artifacts-events` when it is missing, so the token also needs Queues Write or Workers Scripts Write. Deploy stays a separate step.

```bash
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_API_TOKEN=your-token
pnpm seed
pnpm subscribe
```

`pnpm seed` creates `<project>-main` in the `envoy` namespace. It pushes `demo/seed-repo` only when it creates the repo. A later run prints the existing commit. `pnpm subscribe` subscribes that repo's `pushed` events to the queue. If queue creation returns 403, the script names the missing permission and exits. Override the project with `ENVOY_PROJECT` (default `demo`).

`pnpm dev:cf` does not receive those remote queue messages. With that server running, `pnpm prove:queue` pushes a health edit, pulls the event, and sends it to the local queue handler. The handler reads the two commits and starts a replay when an open claim overlaps. `pnpm deploy` is what attaches the Worker as the consumer.

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
| `pnpm seed` | Create the Artifacts main repo and push `demo/seed-repo` on the first create. |
| `pnpm subscribe` | Create `envoy-artifacts-events` if needed, then subscribe main `pushed` events. |
| `pnpm prove:queue` | Push `demo-main`, pull the `cf.artifacts.repo.pushed` event, and replay it through the local queue handler. Requires `pnpm dev:cf`. |
| `pnpm spike:b` | Fork each demo attempt on Artifacts and classify a clean merge and a conflict. |
| `pnpm spike:d` | Score two Workers AI models on ten tool-call rounds. |
| `pnpm deploy` | `cf deploy --mode cf` |

## License

MIT. See `LICENSE`.
