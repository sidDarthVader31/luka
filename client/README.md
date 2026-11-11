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
src/features/home/          home: blank sandbox, templates, your designs
src/features/catalog/       component catalog loading (GET /catalog)
src/features/editor/        editor page, canvas, library, inspector, traffic bar, results
src/features/editor/scene/  pure scene <-> graph functions (unit tested)
src/lib/                    API client and generated API types
src/shared/                 CSS tokens, shared controls, icons
```

## Scene model

The Excalidraw scene is the document (`Design.scene`); the simulation graph is derived from it on
every change and saved alongside it.

- A component is a shape with a bound text label and `customData.luka = { nodeId, componentId, properties }`.
- A connection is an arrow bound at both ends to components, with optional
  `customData.luka = { edgeId, interactionType, ruleType, ... }`.
- Everything else (free text, frames, plain shapes, unbound arrows) is annotation the simulator
  ignores. Unsupported or half-attached arrows are reported as warnings and left out of the graph.
- Designs without a scene (older designs, templates) are converted with `graph-to-scene.ts`.

The client does not run the simulation; it calls the Go API (`POST /api/v1/simulate`).

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
