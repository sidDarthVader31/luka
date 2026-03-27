# Server

This folder contains the Luka backend service.

## Planned stack

- Go
- Gin
- PostgreSQL
- `pgx/v5`

## Responsibility

The server owns:

- the HTTP API
- design validation
- persistence
- simulation execution
- bottleneck detection
- result explanation generation

The simulator core should live here so the backend remains the source of truth.

## Database choice

The backend uses PostgreSQL for persistence.

Why PostgreSQL:

- `designs` and `runs` are relational entities with clear lifecycle and ownership
- the system graph, design snapshots, workload, and results fit well into `JSONB`
- it keeps the schema flexible while preserving strong queryability and transactional guarantees
- it scales better for Luka's likely future than a purely local database like SQLite

The Postgres integration uses `pgx/v5`.

## Persistence modes

- If `LUKA_DATABASE_URL` or `DATABASE_URL` is set, the server uses PostgreSQL and runs embedded migrations on startup.
- If no database URL is set, the server falls back to in-memory repositories for quick local prototyping.

## Available commands

- `go run ./cmd/api`
- `go test ./...`
