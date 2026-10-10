# Envoy verification map

Maintained source for verifying user-facing Envoy behavior. Read this index, then the feature file for the recipe you are proving.

## Baseline preconditions

- Launch with `pnpm exec cf dev --port 8791` from the repo root.
- Base URL `http://127.0.0.1:8791`, project `demo`.
- Run `./.cursor/skills/verify-envoy/helpers/doctor.sh http://127.0.0.1:8791` and require exit `0`.
- Never drive an instance you did not start for this verification run.
- Local default env has no Artifacts/AI. Do not require `pnpm dev:cf` for these features.

## Driving conventions

- Start every recipe from a fresh doctor-passed instance unless preconditions say otherwise.
- Prefer button/heading accessible names over CSS selectors.
- Treat commands as literal.
- HTTP via `curl`; UI via browser/CDP against the pinned base URL.
- Keep proof artifacts; only tear down the `cf`/Vite process this run started.

## Proof and skip reporting

- Capture the user action and the resulting state.
- UI proof: ARIA snapshot and/or screenshot showing the Envoy brand.
- API proof: request line, status code, and response body saved under `artifacts/`.
- Report unreachable paths with the unmet precondition. Do not claim a skipped entry point verified via another path.

## Feature entry contract

Each feature file: H1 + one paragraph, then exactly `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.

## Features

- [Coordinator health](./coordinator-health.md) — `/api/health` readiness for the demo project.
- [Shell UI](./shell-ui.md) — brand, three panels, empty states.
- [Run demo stub](./run-demo-stub.md) — Run demo button surfaces the Day-1 stub error (501).
