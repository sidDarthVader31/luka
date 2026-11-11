# Luka

Luka is a system design simulator for interview practice. You draw an architecture from typed
building blocks (client, gateway, service, cache, database, queue, worker), set a workload, and
run an analytical simulation that shows which component saturates first and why.

It is an educational model, not a cloud-accurate benchmark: capacity defaults are illustrative.

## Status

A rebuild is in progress. The code was largely AI-generated and is being reworked in three
phases: cleanup, an Excalidraw-based canvas, and a rewrite of the simulator. Expect churn.

## What works today

- Node-and-edge editor built on React Flow with a component palette and per-node/edge settings
- Workload inputs (requests per second, users, payload size, fanout) and traffic paths
  (request classes)
- Analytical simulation: per-node utilization, dropped traffic, latency, and the bottleneck
  with a short explanation
- Save, autosave and reopen designs; sample architectures offered as templates that are copied
  before editing
- In-memory storage by default, optional PostgreSQL

Not included: presentation mode, run history, design versions, run comparison or export.
These were removed because Luka targets interview practice.

## Run locally

Requirements: Node 24+, Go 1.23+, `corepack`.

```bash
corepack pnpm install
corepack pnpm server:dev   # API on http://127.0.0.1:8080
corepack pnpm client:dev   # UI on http://127.0.0.1:5173
```

See [docs/local-development.md](docs/local-development.md) for PostgreSQL and configuration, and
[.env.example](.env.example) for environment variables.

Checks:

```bash
corepack pnpm client:typecheck
corepack pnpm lint
corepack pnpm client:test
corepack pnpm client:build
corepack pnpm server:test
```

## Repository layout

```text
client/   React 19 + Vite + TypeScript UI (@xyflow/react, React Router)
server/   Go + Gin API and simulation engine
docs/     Development notes and pre-rebuild API/schema docs
```

`docs/api-design.md` and `docs/simulator-schema.md` describe the pre-rebuild API and will be
replaced.
