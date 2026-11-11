# Client

The Luka frontend: the design library and the visual editor.

## Stack

- React 19, TypeScript, Vite
- React Router
- `@xyflow/react` (React Flow) for the canvas; to be replaced by Excalidraw in the rebuild
- Biome for lint and format, Vitest for tests

## Layout

```text
src/app/        router
src/features/   library page and editor (components, lib helpers, nodes)
src/lib/        API client and shared draft helpers
src/shared/     CSS tokens and styles
```

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
