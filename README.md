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
- backend-owned component defaults and edge capability metadata
- workload inputs:
  - requests per second
  - concurrent users
  - write pressure (read:write mix; capacity penalty, not path routing)
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
- autosave for saved designs
- version history for persisted designs
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

## Modeling guide

### Node properties

#### Replicas

`replicas` is the number of identical instances behind one logical component.

- use `replicas > 1` when you mean "the same service or dependency scaled horizontally"
- use separate nodes when they are actually different systems, like `payments-db` and `profile-db`

Example:

- one `Stateless Service` node with `replicas = 3` means three equivalent app instances
- two different database nodes means two different data stores with different responsibilities

#### Capacity / sec

`capacity / sec` is the steady throughput one replica of that component can process before it starts saturating.

Examples:

- gateway: requests/sec it can forward
- service: requests/sec it can process
- database: effective query or operation throughput/sec
- queue: operations/sec it can absorb or dispatch
- worker: jobs/sec it can consume

Luka multiplies this by `replicas` to estimate total node capacity.

#### Latency (ms)

`latency` is the base time that component adds when it is healthy.

Luka increases latency as utilization rises, so this is the near-best-case latency, not the worst-case latency.

#### Cache hit rate

`cache hit rate` only applies to cache nodes.

- `0.9` means 90% of eligible requests are served by cache
- `0.1` means only 10% are served by cache

Miss traffic continues downstream, which is why cache hit rate strongly affects database pressure.

### Edge properties

#### Interaction type

This tells Luka what kind of connection the edge represents.

- `sync_request`: normal synchronous request path
- `async_enqueue`: send work to a queue asynchronously
- `consume`: worker consumes queued work
- `conditional_branch`: branch traffic, such as cache hit or cache miss
- `fallback`: send dropped or failed traffic to a fallback path

#### Routing rule

This tells Luka how traffic should move across that edge.

- `always`: all eligible traffic goes through
- `cache_hit`: only cache-hit traffic goes through
- `cache_miss`: only cache-miss traffic goes through

#### Edge fanout multiplier

This multiplies traffic on that specific edge.

Use it when one operation creates multiple downstream operations on that connection.

Example:

- one message enqueue resulting in `10` delivery jobs on one edge means `fanout multiplier = 10`

This is different from the global scenario fanout because it is local to one connection.

### Scenario inputs

#### Requests / sec

The total incoming request rate to the system.

This is the main load driver for the simulation.

#### Concurrent users

How many users are active at the same time.

Luka uses this as an extra pressure signal in the simplified model.

#### Write pressure (read:write mix)

This control is a **capacity pressure factor**, not a traffic router.

Examples:

- `4` means a 4:1 read:write mix (writes are 20% of the mix)
- `1` means balanced read and write pressure

Higher write share tightens effective capacity on databases, queues, workers, and (more lightly) services. It does **not** send traffic down separate read vs write edges.

To model separate read and write paths, use **request flows** and attach edges to those flows.

Timeout and retry fields on edges produce **display-only** edge estimates. They do not currently change node utilization.

#### Payload (KB)

Approximate request or message size.

Larger payloads increase pressure and latency in the simulator.

#### Fanout count

Global amplification factor for fanout-heavy behavior.

Use it when one user action creates multiple downstream deliveries or jobs, especially on async paths.

### Request flows

Request flows let you model different behaviors in one design.

Examples:

- `Read Path`
- `Write Path`
- `Async Processing`

Each flow gets a traffic share, and edges can belong to one or more flows.

### Replica modeling rule

Use this rule to avoid ambiguity:

- use one node with multiple replicas for the same logical capacity pool
- use separate nodes for distinct systems with different responsibilities

Good examples:

- one `API Service` node with `replicas = 4`
- one `Read Replica Pool` node with `replicas = 3`
- separate `payments-db` and `profile-db` nodes if they are different databases

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
- [`docs/next-version/README.md`](docs/next-version/README.md) — office / vNext roadmap
