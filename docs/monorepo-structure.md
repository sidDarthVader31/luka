# Luka Monorepo Structure

## Goal

Keep Luka in a simple monorepo with a clear split:

- `client/` owns the frontend application
- `server/` owns the backend API and simulator engine

The repo should stay easy to understand for a small team and should avoid shared-package complexity until there is a real need for it.

## Top-Level Layout

```text
.
├── client/
├── server/
├── docs/
├── package.json
└── pnpm-workspace.yaml
```

## Why This Structure

- The frontend and backend can evolve independently.
- The repository stays simple enough for a first build.
- We avoid premature abstraction like a `packages/` folder before shared code actually exists.
- The simulator logic remains on the server, which keeps the client lighter and avoids duplicating business logic.

## Client Responsibilities

`client/` owns everything related to the browser application:

- React app shell
- routing
- graph editor and canvas interactions
- local UI state
- API client calls to the backend
- simulation configuration forms
- result visualizations

### Client boundary rules

- The client should not contain the core simulation engine.
- The client may validate forms and shape data, but the server remains the source of truth for simulation logic.
- The client can compute UI-only derived values, but not authoritative capacity math.
- The client should treat backend results as canonical.

## Server Responsibilities

`server/` owns everything related to execution, simulation, and persistence:

- Gin HTTP API
- request validation at the API boundary
- design persistence
- simulation orchestration
- core simulator logic
- result generation and explanations

### Server boundary rules

- The server owns the typed graph execution model.
- The server owns capacity calculations and bottleneck detection.
- The server owns canonical validation of nodes, edges, and workloads.
- The server should expose stable JSON contracts to the client.

## Recommended Internal Layout

### Client

```text
client/
├── public/
├── src/
│   ├── app/
│   ├── routes/
│   ├── features/
│   │   ├── canvas/
│   │   ├── inspector/
│   │   ├── simulation/
│   │   └── design-library/
│   ├── components/
│   ├── lib/
│   ├── state/
│   └── styles/
└── README.md
```

### Server

```text
server/
├── cmd/
│   └── api/
├── internal/
│   ├── api/
│   │   └── http/
│   ├── app/
│   ├── domain/
│   ├── simulator/
│   ├── store/
│   └── platform/
├── migrations/
└── README.md
```

## Package Boundaries

### `client/`

The frontend package should remain a single app package for now.

Do not split into multiple frontend packages until there is proven need for:

- reusable UI libraries
- shared schema packages
- design system extraction

### `server/`

The backend should remain a single Go service for MVP.

Do not break it into microservices. Luka is itself a system-design product, but the product implementation should stay monolithic until the architecture demands more separation.

## Shared Code Policy

For MVP, do not create a shared package just because both sides use similar concepts.

Instead:

- define API contracts clearly
- generate or mirror schema carefully later if needed
- add a `packages/` or `shared/` folder only when duplication becomes painful

This avoids early complexity.

## Ownership Summary

- `client/`: presentation, interaction, browser state
- `server/`: API, persistence, simulator, explanations
- `docs/`: product and architecture decisions

## Future Extension Point

If Luka later needs shared assets, the first likely additions would be:

- `packages/contracts/` for shared schemas
- `packages/ui/` for reusable component primitives

These should be added only after real duplication appears.
