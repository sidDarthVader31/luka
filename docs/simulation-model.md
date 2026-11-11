# Simulation model

Luka estimates how a design behaves under a steady load. It is an analytical model, not a time-stepped simulation: every number comes from the rules below and can be checked by hand. When a rule changes, change this file and the golden tests in the same commit.

Types: `server/internal/domain`. Engine: `server/internal/simulator`.

## Inputs

**Workload**

| Field | Default | Meaning |
|---|---|---|
| `requests_per_second` (R) | required, > 0 | Total requests per second from all clients |
| `read_share` (s) | 0.9 | Fraction of requests that are reads |
| `payload_kb` (P) | 1 | Average request or record size |

Each client node emits reads `R·s` and writes `R·(1−s)`. With more than one client, R is split evenly across them.

**Edges.** An edge has `traffic` (`all`, `reads` or `writes`; default `all`) and `mode` (`sync` or `async`; default `sync`). An edge carries only the traffic it names.
- **Sync:** the caller waits for the target. The edge adds latency and can fail the caller's request.
- **Async:** the edge carries load to the target but adds no latency and never fails the caller. Edges out of a queue are always treated as async.

**Node properties.** Missing values take the catalog item's defaults. A missing or non-positive `capacity_rps` on a node that has capacity is a validation error, never a silent default.

## How traffic moves

Nodes are processed in topological order; cycles are rejected. A node's demand is the sum of the traffic on its incoming edges. A node forwards only what it served (see Capacity), filtered by each outgoing edge's `traffic`.

| Kind | What it forwards |
|---|---|
| `client` | Its emitted traffic, to every target |
| `gateway` | Splits served traffic across its targets in proportion to edge `weight` (load balancing) |
| `stateless_service`, `worker` | Served traffic to **every** target (each dependency gets every request it is wired for) |
| `cache`, `cdn` | Read misses `reads·(1−h)` plus all writes, to every target. `h` = `cache_hit_rate` |
| `queue` | Every served message to every target (each consumer group gets every message). Messages arrive downstream as writes |
| `database`, `object_store`, `search` | Nothing. These are terminal; outgoing edges are a validation error |

## Capacity and utilisation

For most kinds: capacity `C = replicas × capacity_rps`, utilisation `ρ = (reads + writes) / C`.

**Database.**
- Each of `shards` (k, default 1) has one primary and `read_replicas` (m, default 0) replicas, each able to do `capacity_rps` (c).
- Writes go to primaries only; reads spread evenly over primaries and replicas.
- Primary load is `writes + reads/(1+m)`, over primary capacity `k·c`, so `ρ = (writes + reads/(1+m)) / (k·c)`. Replicas carry less than primaries, so this is the binding utilisation. `capacity_rps` in the result is `k·c`.

**Queue.** `ρ = messages / (replicas × capacity_rps)` measures the broker. A queue never drops messages. Consumers that are slower than arrivals show up as overload on the consumer, and the review flags the backlog.

**Served traffic.** If ρ ≤ 1, everything is served. Otherwise each class is served at `1/ρ` of demand and the rest fails. The node is `overloaded` when ρ > 1.

## Latency

Each instance is modelled as an M/M/1 queue with service time `S = base_latency_ms` at utilisation ρ (requests spread randomly over instances).
- Waiting time is zero with probability `1−ρ`; otherwise it is exponential with mean `S/(1−ρ)`.
- The q-quantile of response time is `S + max(0, S/(1−ρ) · ln(ρ/(1−q)))`:
  - p50 uses q = 0.5
  - p99 uses q = 0.99
- When ρ ≥ 1, latency is undefined: the node reports no latency and every path through it has no p99.

**End-to-end latency** for a class, starting at the client:
- **Sync calls in sequence:** a node's latency plus the sum of its sync dependencies' latencies (a service is assumed to call its dependencies one after another).
- **Branches.** A branch taken with probability p is included in the q-quantile only if `p > 1−q`. A cache miss path with miss rate 5% therefore counts in p99 but not in p50. Gateway branches take the slowest branch that meets this test.
- **Upper bound:** summing per-node quantiles gives an upper bound, and the UI labels it as one.

## Success rate and backpressure

For each class, success at a node is `σ = served/demand` (1 when not overloaded), times the success of everything it calls synchronously for that class:
- **Service or worker:** the product over its sync dependencies.
- **Gateway:** the weight-averaged success of its targets.
- **Cache or CDN:** `h + (1−h) × success(downstream)` for reads; downstream success for writes.

End-to-end served = demand × success at the client's targets. An overloaded database therefore lowers what the service in front of it really serves.

## Availability

- **One node:** with per-instance availability `a` (catalog default, for example 0.999) and n instances, the node is up if any instance is up: `1 − (1−a)^n`.
- **Database:** each shard needs its primary or a promoted replica, `1 − (1−a)^(1+m)`, and every shard must be up: that value `^k`.
- **End to end:** the product over nodes on the sync path, weight-averaged across gateway branches. Clients count as 1. A cache is treated as a hard dependency (conservative), so a single-instance cache shows up in availability.

## Estimates

- **Bandwidth:** `R × P / 1024` MB/s at the clients.
- **Storage per day:** `Σ served writes at database and object_store nodes × P × 86400 / 1024²` GB/day.
- **Storage per year:** storage per day × 365 / 1024 TB/year.

## Bottleneck

The bottleneck is the node with the highest ρ. Ties go to the earliest node in topological order, then by node id, so results are deterministic.

## Review findings

Rule-based, from the graph and the results:

| Rule | Severity | Fires when |
|---|---|---|
| `overloaded_node` | error | ρ > 1 |
| `near_capacity` | warning | 0.8 < ρ ≤ 1 |
| `single_point_of_failure` | warning | A sync-path node other than a client has one instance (database: 1 shard with no replicas) |
| `writes_exceed_primary` | error | A database's writes alone exceed `k·c` |
| `read_heavy_without_cache` | info | read share ≥ 0.8 and a database serving reads has no cache or CDN in front on any path |
| `queue_without_consumer` | error | A queue has no outgoing edge |
| `unconnected_node` | warning | A node has no edges |

## Problems

A problem fixes the workload and lists targets on end-to-end metrics:
- `read_throughput` / `write_throughput`: served RPS
- `read_p99_ms` / `write_p99_ms`: p99, which fails when undefined
- `availability`: the lower of reads and writes

A design linked to a problem runs with the problem's workload.
