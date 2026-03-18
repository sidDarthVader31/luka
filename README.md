# Luka

Luka is a visual system design simulator for interview prep and architecture reasoning.

Users build a system from typed infrastructure primitives, apply workload assumptions, and inspect which part of the design saturates first.

## Monorepo

- `client/` contains the React canvas editor
- `server/` contains the Go + Gin API, validation, persistence, and simulator

## Why PostgreSQL

Luka uses PostgreSQL for persistence because it fits the product shape well:

- `Design` and `Run` are real relational entities
- the graph, run snapshot, workload, and results fit naturally into `JSONB`
- PostgreSQL gives us strong relational structure without forcing early over-normalization
- it is a durable long-term choice for features like versioning, comparison history, and multi-user support

The Go backend uses `pgx/v5` for PostgreSQL access.

## Quick Start

Frontend dependencies:

```bash
corepack pnpm install
```

Backend:

```bash
cd server
go run ./cmd/api
```

Frontend:

```bash
corepack pnpm --dir client dev
```

For PostgreSQL-backed persistence and full local setup details, see [docs/local-development.md](/Users/sid/Documents/sid/test_projects/simulator-sd/docs/local-development.md).
