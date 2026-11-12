# Client

The Luka frontend: the home screen and the Excalidraw-based editor.

## Stack

- React 19, TypeScript, Vite
- React Router
- `@excalidraw/excalidraw` for the canvas, `@tabler/icons-react` for component icons
- Biome for lint and format, Vitest for tests

## Layout

```text
src/app/                    router
src/features/home/          home: practice problems, blank sandbox, templates, your designs
src/features/problems/      problem loading, status (Not started / In progress / Solved), brief Markdown
src/features/catalog/       component catalog loading (GET /catalog)
src/features/editor/        editor page, canvas, library, inspector, traffic bar, results
src/features/editor/scene/  pure scene <-> graph functions (unit tested)
src/features/editor/lib/    result selectors and formatters (unit tested)
src/lib/                    API client and generated API types
src/shared/                 CSS tokens, shared controls, icons
```

## Scene model

The Excalidraw scene is the document (`Design.scene`); the simulation graph is derived from it on
every change and saved alongside it.

- A component is a shape with a bound text label and `customData.luka = { nodeId, componentId, properties }`.
- A connection is an arrow bound at both ends to components, with optional
  `customData.luka = { edgeId, traffic, mode, weight? }`. Async (fire and forget) arrows are drawn
  dashed. `weight` is only sent when the source is a gateway. Phase 2 arrows
  (`interactionType`, ...) are migrated on load: enqueue and consume become async, the rest sync.
- Which components may connect comes from each catalog item's `allowed_targets`. A disallowed
  arrow is marked "Not allowed" on the canvas, explained in the inspector and left out of the graph.
- Everything else (free text, frames, plain shapes, unbound arrows) is annotation the simulator
  ignores. Unsupported or half-attached arrows are reported as warnings and left out of the graph.
- Designs without a scene (older designs, templates) are converted with `graph-to-scene.ts`.
- Excalidraw loads its hand-drawn font only after it mounts, so labels built earlier are measured
  with a fallback font. `remeasure-labels.ts` lays them out again once fonts finish loading.

The client does not run the simulation; it calls the Go API (`POST /api/v1/simulate`). The model
is described in `docs/simulation-model.md`. A design linked to a problem (`problem_id`) runs with
the problem's workload, so the traffic bar is read-only there.

Whether a problem design's last run met every target is kept in local storage
(`luka:lastRunPassed:<designId>`) and drives the "Solved" status on the home screen.

## Scripts

```bash
corepack pnpm dev        # Vite dev server, proxies /api to http://127.0.0.1:8080
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Set `VITE_PROXY_TARGET` to point the dev proxy at another backend, or `VITE_API_BASE_URL` to call
the API directly.
