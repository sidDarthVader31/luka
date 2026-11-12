import type { NodeResult, SimulationResult } from "../../lib/api";

// A hand-written result in the Phase 3 shape: client → LB → API → Redis → Postgres, with
// Postgres overloaded. Numbers are consistent with docs/simulation-model.md but not golden.

function node(partial: Partial<NodeResult> & Pick<NodeResult, "node_id" | "label" | "archetype">) {
  return {
    demand: { reads: 0, writes: 0 },
    served: { reads: 0, writes: 0 },
    capacity_rps: 0,
    utilization: 0,
    overloaded: false,
    availability: 1,
    working: [],
    ...partial,
  } satisfies NodeResult;
}

export const resultFixture: SimulationResult = {
  workload: { requests_per_second: 10_000, read_share: 0.9, payload_kb: 1 },
  nodes: [
    node({
      node_id: "client-1",
      label: "Client",
      archetype: "client",
      demand: { reads: 9000, writes: 1000 },
      served: { reads: 9000, writes: 1000 },
    }),
    node({
      node_id: "lb-1",
      label: "LB",
      archetype: "gateway",
      demand: { reads: 9000, writes: 1000 },
      served: { reads: 9000, writes: 1000 },
      capacity_rps: 50_000,
      utilization: 0.2,
      latency_p50_ms: 8,
      latency_p99_ms: 9.1,
      availability: 0.999999,
      working: ["C = 2 × 25,000 = 50,000 req/s", "ρ = 10,000 / 50,000 = 20%"],
    }),
    node({
      node_id: "svc-1",
      label: "API",
      archetype: "stateless_service",
      demand: { reads: 9000, writes: 1000 },
      served: { reads: 9000, writes: 1000 },
      capacity_rps: 12_000,
      utilization: 0.8333,
      latency_p50_ms: 22,
      latency_p99_ms: 98,
      availability: 0.999999,
      working: ["C = 3 × 4,000 = 12,000 req/s", "ρ = 10,000 / 12,000 = 83%"],
    }),
    node({
      node_id: "cache-1",
      label: "Redis",
      archetype: "cache",
      demand: { reads: 9000, writes: 0 },
      served: { reads: 9000, writes: 0 },
      capacity_rps: 50_000,
      utilization: 0.18,
      latency_p50_ms: 3,
      latency_p99_ms: 4.2,
      availability: 0.999,
      working: ["Misses = 9,000 × (1 − 0.8) = 1,800 req/s"],
    }),
    node({
      node_id: "db-1",
      label: "Postgres",
      archetype: "database",
      demand: { reads: 1800, writes: 1000 },
      served: { reads: 1286, writes: 714 },
      capacity_rps: 2000,
      utilization: 1.4,
      overloaded: true,
      availability: 0.999,
      working: [
        "Primary load = 1,000 + 1,800 / (1 + 0) = 2,800 req/s",
        "ρ = 2,800 / (1 × 2,000) = 140%",
      ],
    }),
    node({ node_id: "idle-1", label: "Search", archetype: "search", capacity_rps: 5000 }),
  ],
  edges: [
    {
      edge_id: "e1",
      source_node_id: "client-1",
      target_node_id: "lb-1",
      mode: "sync",
      traffic: { reads: 9000, writes: 1000 },
    },
    {
      edge_id: "e4",
      source_node_id: "cache-1",
      target_node_id: "db-1",
      mode: "sync",
      traffic: { reads: 1800, writes: 0 },
    },
  ],
  end_to_end: {
    reads: {
      demand_rps: 9000,
      served_rps: 8486,
      success_rate: 0.94289,
      latency_p50_ms: 33,
      availability: 0.998,
      working: ["Reads succeed at 0.8 + 0.2 × 0.714 = 94.3%"],
    },
    writes: {
      demand_rps: 1000,
      served_rps: 714,
      success_rate: 0.714,
      availability: 0.999,
      working: ["Writes succeed at 71.4%"],
    },
  },
  bottleneck_node_id: "db-1",
  estimates: {
    bandwidth_mb_per_sec: 9.77,
    storage_gb_per_day: 58.83,
    storage_tb_per_year: 20.97,
    working: ["Bandwidth = 10,000 × 1 / 1024 = 9.77 MB/s"],
  },
  findings: [
    {
      rule_id: "read_heavy_without_cache",
      severity: "info",
      title: "Read-heavy",
      detail: "Consider a cache.",
    },
    {
      rule_id: "overloaded_node",
      severity: "error",
      title: "Postgres is overloaded",
      detail: "Add read replicas or shards.",
      node_ids: ["db-1"],
    },
    {
      rule_id: "near_capacity",
      severity: "warning",
      title: "API is near capacity",
      detail: "Add instances.",
      node_ids: ["svc-1"],
    },
  ],
  targets: [
    {
      target_id: "t1",
      label: "Serve 9k reads/s",
      passed: false,
      actual: 8486,
      expected: 9000,
      metric: "read_throughput",
    },
    {
      target_id: "t2",
      label: "Read p99 under 200 ms",
      passed: false,
      expected: 200,
      metric: "read_p99_ms",
    },
    {
      target_id: "t3",
      label: "Three nines",
      passed: true,
      actual: 0.998,
      expected: 0.99,
      metric: "availability",
    },
  ],
};
