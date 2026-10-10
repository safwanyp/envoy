# Run demo stub

Until AgentRunner + seed land, Run demo must tell the user the demo is not wired — not silently succeed.

## Sub-features

- `demo-click` POSTs `/api/demo` from the button.
- `demo-stub` returns HTTP 501 with `error: demo_not_wired`.
- `demo-status` surfaces the stub message in the status region.

## How to get to it (user POV)

- Choose the `Run demo` button on the home shell.
- Or `POST /api/demo?project=demo` directly.

## Driving it with browser + curl

Preconditions:

- Doctor passed for `http://127.0.0.1:8791`.
- Shell UI is loaded.

- **API stub.** Run `curl -sS -D- -X POST 'http://127.0.0.1:8791/api/demo?project=demo'`. Status is `501`; body includes `"error":"demo_not_wired"`.
- **Button path.** Click `Run demo`. The status region (`#demo-status`) contains text about the demo being stubbed / not wired.
- **Proof.** Save the curl headers+body to `.cursor/skills/verify-envoy/artifacts/run-demo-stub/api.txt` and a screenshot or ARIA snippet of the status text under the same directory.

## Gotchas

- A future Day-2 success path will invalidate this recipe — update the map when demo actually spawns agents.
- Do not treat 501 as a launch failure; for this feature, 501 is the correct user-visible outcome.
