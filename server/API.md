# Luka server API

Base URL: `http://localhost:8080` (override with `LUKA_SERVER_ADDR`). All bodies are JSON.

Persistence: in-memory by default; set `LUKA_DATABASE_URL` (fallback `DATABASE_URL`) for Postgres.

## Errors

Every error is `{ "error": "<message>" }`.

| Status | Meaning |
| --- | --- |
| 400 | Malformed body or validation failure (including graph validation, PATCH on a sample). |
| 404 | Design not found. |
| 500 | Unexpected failure. The message is always `internal server error`; details are logged server-side. |

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ status, service }` |
| GET | `/api/v1/status` | `{ name, version, api }` |
| GET | `/api/v1/catalog` | `Catalog`: `{ categories: {id,name}[], items: CatalogItem[] }`, see below |
| GET | `/api/v1/templates` | `{ items: Design[] }`, the built-in read-only samples |
| POST | `/api/v1/designs` | Body `{ name, description?, graph, scene? }` -> 201 `Design` |
| GET | `/api/v1/designs` | `{ items: Design[] }`, user designs only (samples excluded, use `/templates`) |
| GET | `/api/v1/designs/:designId` | `Design`. Also works for sample ids. |
| PATCH | `/api/v1/designs/:designId` | Body `{ name?, description?, graph?, scene? }` -> `Design`. `scene` replaces the stored scene only when non-empty. **400 for sample ids.** |
| POST | `/api/v1/designs/:designId/duplicate` | Body `{ name?, description? }` -> 201 `Design` with a new random id (`des_<hex>`). Copies the scene too. Works on samples; use it to open a template as an editable copy. |
| POST | `/api/v1/simulate` | Stateless simulation, see below. |

Removed: `/component-archetypes` (use `/catalog`), `/designs/:id/versions`, `/designs/:id/runs`, `POST /runs`, `GET /runs/:id`.

Sample ids: `sample-cache-aside`, `sample-queue-workflow`.

## Catalog

`GET /api/v1/catalog` lists the components a design can use. Categories are ordered: `clients`, `edge`, `compute`, `data`, `messaging`.

Each `CatalogItem` has `id`, `name`, `category_id`, `description`, `icon` (Tabler icon name), `kind` (the engine kind, a `NodeArchetype`), `default_properties`, `fields`, `supported_interactions` and `supported_routing_rules`. `fields` describe the editable properties (`key`, `label`, `unit?`, `min`, `max?`, `step?`, `primary?`); the client has none, and only caches have `cache_hit_rate`.

Item ids: `client`, `load-balancer`, `api-gateway`, `service`, `worker`, `redis`, `memcached`, `postgres`, `mysql`, `dynamodb`, `cassandra`, `kafka`, `sqs`, `rabbitmq`.

## Scene and `component_id`

- `Design.scene` is the client's Excalidraw document, stored and returned as opaque JSON. It is optional; designs and samples without one are converted from `graph` by the client. Scenes over 5 MB are rejected with 400.
- `Node.component_id` is a catalog item id. If set, it must exist in the catalog and its `kind` must equal the node's `archetype`, otherwise 400. An empty value is allowed (older designs).

## `POST /api/v1/simulate`

Request. Provide exactly one of `design_id` or `design`:

```json
{
  "design_id": "des_abc123",
  "design": { "name": "...", "graph": { "nodes": [], "edges": [], "request_classes": [] } },
  "workload": {
    "requests_per_second": 1000,
    "concurrent_users": 0,
    "read_write_ratio": 0,
    "payload_kb": 0,
    "fanout_count": 0
  }
}
```

- `workload.requests_per_second` must be > 0; the other fields must not be negative.
- An inline `design` need not be saved (unsaved drafts work). `id` and `name` are optional.
- The graph is validated in run mode (needs exactly one client node, valid edges, etc.); failures are 400 with the issues listed in `error`.

Response 200:

```json
{
  "result": {
    "summary": "...",
    "bottleneck": { "node_id": "...", "...": "NodeSimulationResult" },
    "nodes": [],
    "edges": [],
    "paths": [],
    "flows": []
  }
}
```

Nothing is stored. `result` has the same shape as the old `Run.result` (see `internal/domain/simulation.go`).
