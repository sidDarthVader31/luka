# Simulator Node and Edge Schema

## 1. Schema Philosophy

The simulator schema should separate three concerns clearly:

- what the user sees on the canvas
- what the simulator understands semantically
- what the simulator computes mathematically

This leads to three layers in the model:

- display layer
- semantic layer
- execution layer

## 2. Graph Model

The system is represented as a directed graph made of:

- nodes
- edges
- request classes
- workload definitions
- simulation assumptions

For the MVP, the graph should be acyclic at the main path level wherever possible, but limited feedback behaviors such as retries can still be represented through explicit edge types rather than arbitrary loops.

## 3. Node Schema

Each node represents a typed infrastructure component.

### 3.1 Required node fields

Every node should contain the following fields:

| Field | Purpose |
| --- | --- |
| `id` | Unique identifier used by the engine |
| `label` | User-facing name shown on canvas |
| `archetype` | Simulator-aware component type |
| `position` | Canvas placement metadata |
| `properties` | Configurable parameters for the node |
| `defaults_source` | Indicates whether properties come from default profile, preset, or manual override |
| `enabled` | Whether the node participates in the current run |

### 3.2 Optional node fields

| Field | Purpose |
| --- | --- |
| `description` | Freeform note for the user |
| `tags` | Labels such as read-path or write-path |
| `version` | Future-proofing for schema evolution |
| `group_id` | Future grouping or subsystem support |

### 3.3 Node identity rule

The `label` is descriptive only.

Examples:

- `Chat Service`
- `Feed API`
- `Primary Redis`

The simulator behavior comes from the `archetype` and the `properties`, not from the label text.

## 4. Supported Node Archetypes for MVP

### 4.1 Client

Represents the workload source.

Core properties:

- request initiation rate
- connection count or concurrency
- payload size

Behavior:

- emits traffic into the graph

### 4.2 Load Balancer / API Gateway

Represents request distribution and entry-point overhead.

Core properties:

- throughput capacity
- base latency
- replica count

Behavior:

- forwards requests to downstream services

### 4.3 Stateless Service

Represents application compute without durable ownership of data.

Core properties:

- replicas
- per-replica throughput capacity
- base latency
- max concurrency
- timeout threshold

Behavior:

- processes requests
- may call downstream services, caches, databases, or queues

### 4.4 Cache

Represents a fast key-value layer.

Core properties:

- read capacity
- write capacity
- base latency
- hit rate assumption
- memory or capacity tier

Behavior:

- serves reads on hit
- forwards misses to downstream path when configured through edges

### 4.5 Database

Represents a durable primary data store.

Core properties:

- read capacity
- write capacity
- base latency
- connection limit
- replica count if reads are split in later versions

Behavior:

- handles durable reads and writes
- saturates when capacity or connection limits are exceeded

### 4.6 Queue / Stream

Represents asynchronous buffering between producers and consumers.

Core properties:

- enqueue capacity
- dequeue capacity
- retention bound or queue size bound
- base enqueue latency

Behavior:

- buffers work
- accumulates lag when production exceeds consumption

### 4.7 Worker

Represents asynchronous consumers processing queued work.

Core properties:

- replicas
- per-replica consume throughput
- processing latency
- concurrency

Behavior:

- consumes from queue
- executes downstream work asynchronously

## 5. Common Node Property Categories

To keep the model consistent, node properties should be grouped conceptually into:

### 5.1 Capacity properties

- max requests per second
- max operations per second
- max concurrent requests
- max connections

### 5.2 Latency properties

- base latency
- timeout threshold

### 5.3 Scaling properties

- replica count
- partition count where applicable later

### 5.4 Reliability properties

- failure threshold
- drop behavior when saturated
- timeout behavior

### 5.5 Domain-specific properties

Only where needed:

- cache hit rate
- queue retention
- database read/write split

## 6. Edge Schema

Each edge represents a typed interaction between two nodes.

### 6.1 Required edge fields

| Field | Purpose |
| --- | --- |
| `id` | Unique identifier |
| `source_node_id` | Upstream node |
| `target_node_id` | Downstream node |
| `interaction_type` | Meaning of the connection |
| `routing_rule` | How traffic moves across the edge |
| `enabled` | Whether the edge participates in the run |

### 6.2 Optional edge fields

| Field | Purpose |
| --- | --- |
| `label` | User-visible description |
| `priority` | Ordering among multiple candidate edges |
| `notes` | Freeform comments |
| `request_class_filter` | Restrict edge to certain request classes |

## 7. Supported Edge Interaction Types for MVP

### 7.1 Sync request

Used when the upstream node waits for the downstream node in the same request path.

Examples:

- gateway to service
- service to cache
- service to database

### 7.2 Async enqueue

Used when a request places work onto a queue or stream and does not wait for completion of downstream processing.

Examples:

- service to queue

### 7.3 Consume

Used when a worker or consumer reads from a queue.

Examples:

- queue to worker

### 7.4 Conditional branch

Used when only a subset of traffic follows this edge.

Examples:

- cache hit return path
- cache miss to database
- fixed traffic split between services

### 7.5 Fallback

Used when a downstream path is attempted only after another path fails or is skipped.

Examples:

- primary cache to database fallback
- primary service to backup service

## 8. Routing Rule Schema

The routing rule is the heart of the edge model. An edge without routing semantics is only a drawing line.

For MVP, routing rules should be constrained to a small set.

### 8.1 Supported routing rule types (implemented)

| Rule Type | Meaning |
| --- | --- |
| `always` | All eligible traffic follows this edge (subject to interaction type and peer weight split) |
| `cache_hit` | Traffic follows this edge on cache hit (source must be a cache) |
| `cache_miss` | Traffic follows this edge on cache miss (source must be a cache) |

Fanout is modeled as `edge.fanout_multiplier` and global `workload.fanout_count` on async enqueue edges — not as a routing rule type.

### 8.1.1 Not yet implemented

These appear in older planning notes and are **not** in the engine today:

| Rule Type | Status |
| --- | --- |
| `percentage_split` | Use `routing_rule.value` weights among peer edges with the same interaction + rule instead |
| `fanout` as a rule type | Use `fanout_multiplier` on the edge |
| `on_success` / `on_failure` | Use `fallback` interaction for dropped load |

### 8.2 Routing rule fields

| Field | Purpose |
| --- | --- |
| `rule_type` | Which routing behavior is used |
| `value` | Weight among peer edges that share the same interaction type and rule type |

### 8.3 Async enqueue split semantics

- A **sync** edge and an **async_enqueue** edge from the same node both receive full processed RPS (side-effect enqueue: every request may also enqueue).
- Multiple **async_enqueue** edges that share the same routing rule split processed RPS by routing weight.
- Timeout / retry on edges are **display-only estimates**. They do not change node incoming RPS or utilization in the current analytical model.

## 9. Request Class Schema

The same graph can carry multiple request types with different paths and traffic assumptions.

Each request class should contain:

| Field | Purpose |
| --- | --- |
| `id` | Unique identifier |
| `name` | User-facing name such as read message or send message |
| `entry_node_id` | Starting node in the graph |
| `default_workload_profile` | Default traffic assumptions for this request class |
| `active` | Whether it participates in the run |

Examples:

- send message
- fetch recent messages
- update presence

## 10. Workload Schema

Workload definitions apply pressure to request classes.

Each workload definition should support:

| Field | Purpose |
| --- | --- |
| `request_class_id` | Which request class is being driven |
| `requests_per_second` | Input arrival rate |
| `concurrent_users` | Concurrent active users if relevant |
| `payload_size` | Relative request size assumption |
| `read_write_ratio` | Write-pressure mix used as a capacity penalty (not path routing) |
| `burst_factor` | Optional multiplier for stress scenarios (not implemented) |
| `duration` | Optional future support for time-based runs (not implemented) |

For MVP, `requests_per_second` is the most important field. Use request classes to model separate read vs write paths.

## 11. Simulation Output Schema

Each run should produce structured results at both system and node level.

### 11.1 System-level outputs

- total input load
- total successful throughput
- first bottleneck
- dominant failure mode
- summary explanation

### 11.2 Node-level outputs

For each node:

- incoming rate
- processed rate
- dropped or failed rate
- utilization
- estimated latency contribution
- saturation status
- explanation snippet

### 11.3 Edge-level outputs

For each edge:

- routed rate
- branch share
- fanout-expanded downstream load where applicable

## 12. Validation Rules

The schema should reject or warn on the following:

- node without archetype
- edge without interaction type
- edge without routing rule
- request class without entry node
- graph with unreachable active nodes
- cache miss edge without a corresponding cache node in the path
- queue consume edge without queue source and worker target
- percentage splits that do not sum correctly for the same branch group

## 13. Modeling Rules for MVP

To keep the engine reliable, the first version should enforce a few modeling constraints:

- A node must have exactly one archetype.
- A label can be anything but must not affect behavior.
- A synchronous path should be explicit and directed.
- Conditional branches must be declared through routing rules, not inferred from layout.
- Async flows must pass through a queue or stream node.
- Feedback loops should be modeled only through explicit supported patterns such as fallback or fanout, not through arbitrary cyclic graphs.

## 14. Example Mental Model

A user may draw a node labeled `Chat Service`.

The simulator should interpret it as:

- label: `Chat Service`
- archetype: `Stateless Service`
- properties: replicas, capacity, latency, concurrency

If the user connects it to `Redis` and `Postgres`, the simulator still needs explicit edge semantics such as:

- service to cache: synchronous read
- cache to database: cache miss branch
- service to queue: async enqueue

This is the minimum semantic structure needed for the simulator to reason accurately.

## 15. Design Principle Summary

The schema should stay:

- generic enough to model many systems
- constrained enough to remain computable
- explicit enough to avoid ambiguity
- simple enough for interview use

The right abstraction is not freeform drawing. It is a typed graph with human-friendly labels.
