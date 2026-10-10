# Coordinator health

Health tells an operator (or agent) that the Worker is routing `/api/*` to the per-project Coordinator Durable Object and that the demo project answers.

## Sub-features

- `health-ok` returns JSON `{ ok: true, service: "coordinator", project: "demo" }`.
- `health-project` echoes the `project` query parameter.

## How to get to it (user POV)

- Open or request `GET /api/health?project=demo` on the running Envoy base URL.
- Run `./.cursor/skills/verify-envoy/helpers/doctor.sh <base>` which includes this check.

## Driving it with curl

Preconditions:

- Envoy is listening on `http://127.0.0.1:8791`.
- Doctor has not already failed for this instance.

- **Request health.** Run `curl -sS 'http://127.0.0.1:8791/api/health?project=demo'`. Body includes `"ok":true` and `"service":"coordinator"`.
- **Project echo.** Run `curl -sS 'http://127.0.0.1:8791/api/health?project=alpha'`. Body includes `"project":"alpha"`.
- **Proof.** Save both bodies to `.cursor/skills/verify-envoy/artifacts/coordinator-health/demo.json` and `alpha.json`. Both files must contain `"ok": true`.

## Gotchas

- Another process may already own Vite's default port. Always use the pinned verification port `8791`.
- Assets SPA fallback can mask mis-routed paths; health must be JSON, not HTML.
- A 200 from `/` alone is not proof the Coordinator is up — always hit `/api/health`.
