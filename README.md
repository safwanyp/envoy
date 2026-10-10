# Envoy

Many agents, one main branch. Conflict radar prevents most collisions; intent replay regenerates the rest.

Built for the Cloudflare [next Git platform](https://blog.cloudflare.com/next-git-platform-on-cloudflare/) competition. See [`PLAN.md`](./PLAN.md) for architecture and schedule.

## Requirements

- Node.js 20+
- pnpm
- Cloudflare account with Artifacts access (for `--mode cf` / deploy)
- [`cf`](https://developers.cloudflare.com/cf/) CLI (project dependency; Wrangler is not used)

## Setup

```bash
pnpm install
pnpm types
pnpm typecheck
```

## Local dev

```bash
pnpm dev
```

Open the printed URL (Vite defaults toward `http://127.0.0.1:8791`). The UI shell shows radar / timeline / lineage + **Run demo**. API routes under `/api/*` hit the Coordinator Durable Object.

```bash
curl -s 'http://127.0.0.1:8791/api/health?project=demo'
```

Artifacts and Workers AI require a paid Workers plan and are remote-only today. They live under mode `cf`:

```bash
pnpm types:cf   # Env includes ARTIFACTS + AI
pnpm dev:cf     # local DOs/assets + remote Artifacts/AI
pnpm deploy     # deploys --mode cf
```

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Local Worker + assets via `cf dev` (no Artifacts/AI) |
| `pnpm dev:cf` | Local + remote Artifacts/AI (paid plan) |
| `pnpm build` | `cf build` |
| `pnpm types` | Regenerate `.cloudflare/types` (local mode Env) |
| `pnpm types:cf` | Types for `--mode cf` |
| `pnpm typecheck` | Worker + UI `tsc --noEmit` |
| `pnpm test` | Pure-module tests (`node --test`) |
| `pnpm seed` | Create Artifacts main + push `demo/seed-repo` (Day 1) |
| `pnpm subscribe` | Wire main `pushed` → queue (Day 1) |
| `pnpm deploy` | Deploy with `cf deploy --mode cf` |

## Status

Day 1 scaffold on `cf` + Vite: Worker entry, Coordinator + AgentRunner stubs, queue trigger, static UI shell. Radar, landing, replay, and demo seed land next.
