# Client

This folder contains the Luka frontend application.

## Planned stack

- React
- TypeScript
- Vite
- React Router
- React Flow
- Zustand
- TanStack Query
- Zod
- Tailwind CSS
- Radix Primitives

## Responsibility

The client owns the visual modeling experience:

- canvas and node editing
- request flow editing
- workload configuration
- result inspection
- communication with the backend API

It should not own the authoritative simulation engine.

## Available scripts

- `corepack pnpm dev`
- `corepack pnpm build`
- `corepack pnpm lint`
- `corepack pnpm test`

## Local dev

Run the backend first:

```bash
cd ../server
go run ./cmd/api
```

Then run the frontend:

```bash
corepack pnpm dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8080` by default.
