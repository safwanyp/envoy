# Shell UI

The first viewport shows the Envoy brand, a short tagline, Run demo, and three empty panels (Radar, Main timeline, Lineage) before any agents run.

## Sub-features

- `shell-brand` renders the Envoy heading as the primary brand signal.
- `shell-panels` exposes Radar, Main timeline, and Lineage regions with empty-state copy.
- `shell-state` loads `/api/state` without filling panels (empty arrays today).

## How to get to it (user POV)

- Open `http://127.0.0.1:8791/` in a browser.
- Land on the page after `pnpm exec cf dev --port 8791`.

## Driving it with browser

Preconditions:

- Doctor passed for `http://127.0.0.1:8791`.

- **Open shell.** Navigate to `http://127.0.0.1:8791/`. Document title is `Envoy`; an `h1` reads `Envoy`.
- **Confirm panels.** Find headings `Radar`, `Main timeline`, and `Lineage`. Empty panel bodies expose their `data-empty` messages.
- **Confirm Run demo.** Find a button named `Run demo` (enabled on load).
- **Proof.** Save an ARIA snapshot and screenshot under `.cursor/skills/verify-envoy/artifacts/shell-ui/` showing the brand and three panel headings.

## Gotchas

- Do not treat the stub demo status line as a panel failure; it may show a prior click message.
- CSS-only emptiness (`:empty::before`) may not appear in ARIA — assert headings + button names, and optionally the `data-empty` attributes in the DOM.
