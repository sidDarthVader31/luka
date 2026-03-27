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

## Persistence note

The frontend talks to a Go backend that now supports PostgreSQL persistence for saved designs and runs.

The database choice is PostgreSQL because the product has both relational entities (`Design`, `Run`) and nested structured payloads (graph, snapshots, results), which fits PostgreSQL plus `JSONB` well.

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
