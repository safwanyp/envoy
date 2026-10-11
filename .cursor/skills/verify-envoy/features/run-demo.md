# Run demo

**Run demo** starts six scripted agents against one in-memory main branch. The button streams claim, yield, stale, replay, and landing frames, then `GET /api/state` shows the saved snapshot.

## Sub-features

- `demo-click` POSTs `/api/demo` from the button.
- `demo-stream` returns HTTP 200 and `application/x-ndjson` frames with an `agents` array.
- `demo-saved` `GET /api/state` after the stream includes a commit whose `task` is `t_rate_limit` and whose `replayOf` is a string.
- `demo-status` the status region changes from `Starting demo…` to a line about a yield, a replay, or a landing.

## How to get to it (user POV)

- Choose the `Run demo` button on the home shell.
- Or `POST /api/demo?project=demo` directly.

## Driving it with browser + curl

Preconditions:

- Doctor passed for `http://127.0.0.1:8791`.
- Shell UI is loaded.

- **API run.** `curl -sS -D- -N -X POST 'http://127.0.0.1:8791/api/demo?project=demo'`. Status is `200`. The body contains `"type":"yield"` and `"type":"stale"`.
- **Saved state.** `curl -sS 'http://127.0.0.1:8791/api/state?project=demo'`. The JSON includes `"task":"t_rate_limit"` and a non-null `replayOf` on that commit.
- **Button path.** Click `Run demo`. Wait until the button is enabled again. `#demo-status` is not the empty string and is not `Starting demo…`. `#timeline` contains `Envoy` agent names or intent text. `#lineage` contains `replaying` or `landed`.
- **Proof.** Save the demo response headers and a slice of the body, the state JSON, and a screenshot of the three panels under `.cursor/skills/verify-envoy/artifacts/run-demo/`.

## Gotchas

- The run takes about a second. A client that closes the stream early still leaves the snapshot if the Worker finishes `start`.
- Local mode does not call Artifacts. An empty timeline before the click is the initial state, not a failure.
- Posting the demo again replaces the snapshot with a new run.
