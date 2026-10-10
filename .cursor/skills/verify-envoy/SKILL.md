---
name: verify-envoy
description: Drive the Envoy Worker UI and /api Coordinator the way a user does — launch local cf dev, doctor health, exercise radar/timeline/lineage shell and Run demo, capture proof. Use when verifying Envoy behavior, UI regressions, or API readiness.
---

# Verify Envoy

Project-local control surface for Envoy. Read cold: launch an isolated instance, doctor it, drive one mapped feature, keep evidence, then clean up only what you started.

## Launch

Pinned host/port via `vite.config.ts` (`127.0.0.1:8791`). Prefer a dedicated verification process:

```bash
pnpm exec cf dev --port 8791
```

Ready when the Vite/`cf` banner shows a local URL on port `8791` (e.g. `http://127.0.0.1:8791/`).

Base URL for this run: `http://127.0.0.1:8791`

Default project query: `project=demo`

Teardown: free only port `8791` for the instance you started, e.g. `lsof -tiTCP:8791 -sTCP:LISTEN | xargs kill` (escalate to `kill -9` only if it ignores SIGTERM). Never `pkill -f cf` / `pkill -f vite` across the machine.

Do not use Wrangler. Use `pnpm dev` for human interactive work when nothing else owns `8791`.

## Doctor

Read-only. Run before any drive when something looks off:

```bash
curl -sS -o /tmp/envoy-doctor.json -w '%{http_code}' \
  'http://127.0.0.1:8791/api/health?project=demo'
```

Worth driving only when:

- HTTP status is `200`
- body JSON has `"ok": true` and `"service": "coordinator"`
- `GET /` returns HTML containing the brand `Envoy` and a button whose accessible name is `Run demo`

If doctor fails, do not drive. Fix launch (port bind, `pnpm install`, type errors) first.

## Drive

Two harnesses:

1. **HTTP** — `curl` for `/api/*` (Coordinator DO). Prefer this for API proofs.
2. **Browser / CDP** — Cursor browser tools (or equivalent) against `http://127.0.0.1:8791/`. Prefer accessible names: heading `Envoy`, button `Run demo`, headings `Radar`, `Main timeline`, `Lineage`.

Stable handles today:

| Handle | Kind |
|--------|------|
| `Run demo` | button name |
| `#demo-status` | status region (`role="status"`) |
| `#radar`, `#timeline`, `#lineage` | panel bodies |
| `/api/health?project=demo` | health |
| `/api/state?project=demo` | empty coordinator state |
| `POST /api/demo?project=demo` | demo trigger (stub → 501 until Day 2) |

Do not use coordinate clicks. Do not call Durable Object internals or test-only setters — there are none yet.

## Evidence

Store under `.cursor/skills/verify-envoy/artifacts/<feature-id>/` (gitignored). Keep artifacts after cleanup.

Proof standards:

- Exercise the real user path (browser button or documented `curl`), not internal module imports.
- Capture the action and the resulting state (status text, HTTP status + body, ARIA/screenshot).
- For mutations, confirm a second read of visible or API state. Today's demo is a stub: proof is the `501` + `demo_not_wired` response and the status line text, not a successful multi-agent run.
- Side effects: none expected for health/state; demo must not spawn agents yet.

## Cleanup

1. Stop only the `cf dev` / Vite process listening on `8791` that you started.
2. Leave `.cursor/skills/verify-envoy/artifacts/` intact.
3. Do not delete the user's other `cf` sessions or `.cloudflare/` state unless this run created a disposable dir you named in Launch.

## Helpers

```bash
# From repo root — printable doctor
./.cursor/skills/verify-envoy/helpers/doctor.sh http://127.0.0.1:8791
```

`doctor.sh` exits `0` only when health JSON matches the Doctor contract above.
