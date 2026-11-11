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
| GET | `/api/v1/problems` | `{ items: Problem[] }`, the practice problems, brief included |
| GET | `/api/v1/problems/:problemId` | `Problem`, 404 if unknown |
| GET | `/api/v1/templates` | `{ items: Design[] }`, the built-in read-only samples |
| POST | `/api/v1/designs` | Body `{ name, description?, problem_id?, graph, scene? }` -> 201 `Design`. An unknown `problem_id` is 400. |
| GET | `/api/v1/designs` | `{ items: Design[] }`, user designs only (samples excluded, use `/templates`) |
| GET | `/api/v1/designs/:designId` | `Design`. Also works for sample ids. |
| PATCH | `/api/v1/designs/:designId` | Body `{ name?, description?, graph?, scene? }` -> `Design`. `scene` replaces the stored scene only when non-empty. **400 for sample ids.** |
| POST | `/api/v1/designs/:designId/duplicate` | Body `{ name?, description? }` -> 201 `Design` with a new random id (`des_<hex>`). Copies the scene and `problem_id`. Works on samples. |
| POST | `/api/v1/simulate` | Stateless simulation, see below. |

Sample ids: `sample-cache-aside`, `sample-queue-workflow`.

Problem ids: `url-shortener`, `rate-limiter`, `news-feed`, `chat-service`, `video-upload`, `ride-matching`.

## Catalog

`GET /api/v1/catalog` lists the components a design can use. Categories are ordered: `clients`, `edge`, `compute`, `data`, `messaging`.

Each `CatalogItem` has `id`, `name`, `category_id`, `description`, `icon` (Tabler icon name), `kind` (the engine kind), `default_properties`, `fields` and `allowed_targets`. `fields` describe the editable properties (`key`, `label`, `help?`, `unit?`, `min`, `max?`, `step?`, `primary?`); non-primary fields belong under "More settings". `allowed_targets` lists the kinds this item may connect to; the server enforces the same table.

Item ids: `client`, `cdn`, `load-balancer`, `api-gateway`, `service`, `worker`, `redis`, `memcached`, `postgres`, `mysql`, `dynamodb`, `cassandra`, `s3`, `elasticsearch`, `kafka`, `sqs`, `rabbitmq`.

## Graph

- Nodes: `id`, `label`, `archetype` (kind), `component_id?`, `position`, `properties`. Missing (zero) properties take the catalog item's defaults. Databases use `shards` and `read_replicas`; other kinds use `replicas`.
- Edges: `id`, `source_node_id`, `target_node_id`, `traffic` (`all` | `reads` | `writes`, empty means `all`), `mode` (`sync` | `async`, empty means `sync`), `weight?` (gateway split, 0 means 1).
- `component_id`, if set, must exist in the catalog and match the node's `archetype`.
- Saving checks structure only. Running also needs a client connected to something and no cycles. Unconnected nodes only produce `warnings`.

## Scene

`Design.scene` is the client's Excalidraw document, stored and returned as opaque JSON. It is optional. Scenes over 5 MB are rejected with 400.

## `POST /api/v1/simulate`

Request. Provide exactly one of `design_id` or `design`:

```json
{
  "design_id": "des_abc123",
  "design": { "name": "...", "problem_id": "url-shortener", "graph": { "nodes": [], "edges": [] } },
  "workload": { "requests_per_second": 10000, "read_share": 0.9, "payload_kb": 1 }
}
```

- If the design has a `problem_id`, the problem's workload is used and `workload` is ignored. Otherwise `workload` is required: `requests_per_second` > 0, `read_share` from 0 to 1 (0 or missing means 0.9), `payload_kb` ≥ 0 (0 or missing means 1).
- An inline `design` need not be saved.
- The graph is validated in run mode; failures are 400 with the issues listed in `error`.

Response 200: `{ "result": SimulationResult }` with

- `workload`: the workload actually used.
- `nodes[]`: per node `demand`, `served` (reads/writes per second), `capacity_rps`, `utilization`, `overloaded`, `latency_p50_ms?`, `latency_p99_ms?` (omitted when overloaded), `availability`, `working[]` (calculation steps).
- `edges[]`: effective `mode` and `traffic` per edge.
- `end_to_end.reads` / `end_to_end.writes`: `demand_rps`, `served_rps`, `success_rate`, `latency_p50_ms?`, `latency_p99_ms?` (an upper bound), `availability`, `working[]`.
- `bottleneck_node_id`, `estimates` (bandwidth, storage per day and year, with `working`), `findings[]` (rule-based review), `targets[]` (only for a problem), `warnings[]`.

Every formula is in `docs/simulation-model.md`. Nothing is stored.

Example: `curl -XPOST localhost:8080/api/v1/simulate -H 'Content-Type: application/json' -d @server/internal/simulator/testdata/url_shortener.json`.
