import { describe, expect, it } from "vitest";

import { resolveEdgeDefaults } from "./edge-defaults";
import { validateGraphForRun } from "./graph-validation";
import { buildRunComparison, formatSignedPercent } from "./run-comparison";
import type { GraphNode, Run } from "../../../lib/api";

describe("validateGraphForRun", () => {
  it("requires a client node", () => {
    const result = validateGraphForRun({
      nodes: [
        {
          id: "service-1",
          label: "API",
          archetype: "stateless_service",
          color: "emerald",
          position: { x: 0, y: 0 },
          properties: {},
        },
      ],
      edges: [],
      requestClasses: [{ id: "flow-1", name: "Primary", traffic_share: 100 }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Client"))).toBe(true);
  });

  it("accepts a simple valid graph", () => {
    const nodes: GraphNode[] = [
      {
        id: "client-1",
        label: "Client",
        archetype: "client",
        color: "cobalt",
        position: { x: 0, y: 0 },
        properties: {},
      },
      {
        id: "service-1",
        label: "API",
        archetype: "stateless_service",
        color: "emerald",
        position: { x: 120, y: 0 },
        properties: { capacity_rps: 1000 },
      },
    ];
    const result = validateGraphForRun({
      nodes,
      edges: [
        {
          id: "edge-1",
          source_node_id: "client-1",
          target_node_id: "service-1",
          interaction_type: "sync_request",
          request_class_ids: ["flow-1"],
          routing_rule: { rule_type: "always" },
        },
      ],
      requestClasses: [{ id: "flow-1", name: "Primary", traffic_share: 100 }],
    });
    expect(result.ok).toBe(true);
  });
});

describe("resolveEdgeDefaults", () => {
  it("picks cache miss rule for cache sources when available", () => {
    const defaults = resolveEdgeDefaults({
      sourceNodeID: "cache-1",
      nodes: [
        {
          id: "cache-1",
          label: "Cache",
          archetype: "cache",
          color: "amber",
          position: { x: 0, y: 0 },
          properties: {},
        },
      ],
      archetypes: [
        {
          archetype: "cache",
          display_name: "Cache",
          default_color: "amber",
          default_properties: {},
          supported_interactions: ["conditional_branch"],
          supported_routing_rules: ["cache_miss", "cache_hit"],
        },
      ],
    });
    expect(defaults.interactionType).toBe("conditional_branch");
    expect(defaults.ruleType).toBe("cache_miss");
  });
});

describe("buildRunComparison", () => {
  it("builds per-node deltas", () => {
    const baseline = {
      id: "run_1",
      design_snapshot: { id: "d", name: "d", graph: { nodes: [], edges: [] } },
      workload: { requests_per_second: 1000 },
      simulation_config: { mode: "analytical" as const },
      status: "completed" as const,
      created_at: "",
      result: {
        summary: "baseline",
        bottleneck: {
          node_id: "db-1",
          label: "DB",
          archetype: "database" as const,
          incoming_rps: 100,
          processed_rps: 90,
          dropped_rps: 10,
          effective_capacity_rps: 90,
          utilization: 1.1,
          estimated_latency_ms: 40,
          saturated: true,
          explanation: "",
        },
        nodes: [
          {
            node_id: "db-1",
            label: "DB",
            archetype: "database" as const,
            incoming_rps: 100,
            processed_rps: 90,
            dropped_rps: 10,
            effective_capacity_rps: 90,
            utilization: 1.1,
            estimated_latency_ms: 40,
            saturated: true,
            explanation: "",
          },
        ],
        edges: [],
      },
    } satisfies Run;

    const latest = {
      ...baseline,
      id: "run_2",
      result: {
        ...baseline.result!,
        summary: "latest",
        bottleneck: {
          ...baseline.result!.bottleneck!,
          utilization: 0.7,
          estimated_latency_ms: 30,
          dropped_rps: 0,
        },
        nodes: [
          {
            ...baseline.result!.nodes[0],
            utilization: 0.7,
            estimated_latency_ms: 30,
            dropped_rps: 0,
            incoming_rps: 80,
          },
        ],
      },
    } satisfies Run;

    const comparison = buildRunComparison(baseline, latest);
    expect(comparison.rows).toHaveLength(1);
    expect(comparison.rows[0].utilDelta).toBeCloseTo(-0.4);
    expect(formatSignedPercent(comparison.rows[0].utilDelta)).toContain("-");
  });
});
