# Local Development

## Prerequisites

- Node.js 24 or newer
- Go 1.23.x
- `corepack` available on the machine
- PostgreSQL 15 or newer for durable persistence

## Storage

By default the backend uses an in-memory store (data is lost on restart). Set `LUKA_DATABASE_URL` to persist designs in PostgreSQL via `pgx/v5`; see `.env.example`.

## Install frontend dependencies

From the repository root:

```bash
corepack pnpm install
```

## Run the backend

In one terminal:

```bash
cd server
go run ./cmd/api
```

For PostgreSQL persistence, set a database URL first:

```bash
export LUKA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/luka?sslmode=disable
cd server
go run ./cmd/api
```

The server runs embedded SQL migrations automatically on startup when a database URL is configured.

Default backend address:

- `http://127.0.0.1:8080`

Optional custom port:

```bash
LUKA_SERVER_ADDR=127.0.0.1:8081 go run ./cmd/api
```

If no `LUKA_DATABASE_URL` is set, the backend uses in-memory storage.

## Run the frontend

In a second terminal:

```bash
corepack pnpm --dir client dev
```

Default frontend address:

- `http://127.0.0.1:5173`

## How frontend API calls work locally

The Vite dev server proxies `/api/*` requests to the backend.

Default proxy target:

- `http://127.0.0.1:8080`

If your backend is running on another port, start the frontend like this:

```bash
VITE_PROXY_TARGET=http://127.0.0.1:8081 corepack pnpm --dir client dev
```

## Optional direct API base override

If you want the frontend to call the backend directly instead of using the Vite proxy:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080/api/v1 corepack pnpm --dir client dev
```

For local development, the proxy approach is simpler because it avoids cross-origin issues.

## Verification commands

Frontend:

```bash
corepack pnpm client:typecheck
corepack pnpm lint
corepack pnpm client:test
corepack pnpm client:build
```

Backend tests:

```bash
cd server
go test ./...
```
