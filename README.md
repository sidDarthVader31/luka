# Luka

Luka is a visual system design simulator for interview practice, architecture reviews, and fast tradeoff exploration.

Instead of stopping at boxes and arrows, Luka lets you:

- draw a system with typed infrastructure primitives
- define request flows like read, write, and async processing
- attach workload assumptions
- run a simulation
- see which node or path saturates first
- compare design variants and simulation runs

Luka is intentionally educational. It is designed to explain behavior clearly, not to pretend to be a cloud-accurate benchmark harness.

## Why Luka exists

Most system design tools are great at communication and weak at reasoning.

Luka is built to answer questions like:

- What breaks first at this traffic level?
- How much does a cache reduce DB pressure?
- Does adding a queue protect the synchronous path?
- Is the hot path actually the fanout edge, not the database?
- Which request flow is unhealthy: read, write, or async?

## Core idea

The canvas is generic, but the simulator is typed.

- Users can label a node anything they want: `Chat Service`, `Order API`, `Notification Worker`
- Luka reasons about archetypes such as `Gateway`, `Stateless Service`, `Cache`, `Database`, `Queue`, and `Worker`
- Edges are semantic, not decorative. They can represent sync calls, async enqueue, consume, conditional cache paths, fallback paths, and fanout

## Current MVP

Luka currently supports:

- a drag-and-drop canvas editor
- typed nodes with editable capacity and latency assumptions
- typed edges with fallback and edge-level fanout
- named request flows with traffic shares
- workload inputs:
  - requests per second
  - concurrent users
  - read/write ratio
  - payload size
  - global fanout count
- simulation output:
  - per-node utilization
  - latency impact
  - dropped load
  - hot edges
  - bottleneck explanation
  - per-flow summaries
- design persistence
- run history
- design duplication and comparison

## Monorepo layout

```text
.
├── client/   # React + TypeScript + Vite canvas app
├── server/   # Go + Gin API, simulator, validation, persistence
└── docs/     # product, API, and architecture notes
```

## Tech stack

### Frontend

- React
- TypeScript
- Vite
- React Flow

### Backend

- Go
- Gin
- PostgreSQL
- pgx/v5

## Why PostgreSQL

Luka uses PostgreSQL because the product naturally has relational entities like `Design` and `Run`, while still benefiting from flexible nested storage.

PostgreSQL works well here because:

- designs are saved entities
- runs are saved entities
- graphs, snapshots, workloads, and results fit cleanly into `JSONB`
- it gives us durable persistence without forcing early over-normalization
- it scales better for Luka's likely future than a purely local database like SQLite

## How the simulator thinks

At a high level, Luka:

1. validates the graph
2. resolves request flows
3. propagates workload through typed edges
4. computes per-node pressure using capacity and latency models
5. identifies the tightest component
6. explains the result in plain language

This means Luka is best thought of as:

- a visual modeling tool
- a capacity reasoning tool
- a teaching simulator

not a production load-testing platform

## Local development

### Install frontend dependencies

```bash
corepack pnpm install
```

### Run the backend

```bash
cd server
go run ./cmd/api
```

### Run the frontend

```bash
corepack pnpm --dir client dev
```

### Build and test

Frontend:

```bash
corepack pnpm --dir client build
```

Backend:

```bash
cd server
go test ./...
```

## Local URLs

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8080/api/v1/status`

## Persistence configuration

The backend can run with in-memory storage or PostgreSQL-backed persistence.

Use PostgreSQL by setting either:

- `LUKA_DATABASE_URL`
- `DATABASE_URL`

For full local setup details, see:

- [`docs/local-development.md`](docs/local-development.md)

## Important concepts

### Design

A saved architecture: nodes, edges, positions, request flows, and design metadata.

### Run

A simulation execution against a saved design or an inline draft.

### Request flow

A named traffic path such as `Read Path`, `Write Path`, or `Async Processing`.

### Node archetype

The simulator-aware meaning of a node, such as `Cache` or `Database`.

### Edge semantics

The simulator-aware meaning of an edge, such as sync, conditional miss, fallback, or fanout.

## Status

Luka is in active MVP development, but the core end-to-end loop already exists:

1. create a design
2. define flows and connections
3. save or duplicate the design
4. run a simulation
5. inspect the bottleneck and highlighted path
6. compare the outcome with previous runs

## Docs

- [`docs/mvp-spec.md`](docs/mvp-spec.md)
- [`docs/api-design.md`](docs/api-design.md)
- [`docs/local-development.md`](docs/local-development.md)
- [`docs/monorepo-structure.md`](docs/monorepo-structure.md)
- [`docs/simulator-schema.md`](docs/simulator-schema.md)
