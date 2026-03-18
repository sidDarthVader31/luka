import type { CreateDesignInput } from "./api";

export function buildDemoDesign(name: string): CreateDesignInput {
  return {
    name,
    description: "Demo design created from the Luka UI integration screen.",
    graph: {
      nodes: [
        {
          id: "client-1",
          label: "Client",
          archetype: "client",
          properties: {},
        },
        {
          id: "service-1",
          label: "Chat Service",
          archetype: "stateless_service",
          properties: {
            replicas: 4,
            capacity_rps: 30000,
            base_latency_ms: 20,
          },
        },
        {
          id: "cache-1",
          label: "Redis Cache",
          archetype: "cache",
          properties: {
            replicas: 2,
            capacity_rps: 70000,
            base_latency_ms: 3,
            cache_hit_rate: 0.9,
          },
        },
        {
          id: "db-1",
          label: "Postgres",
          archetype: "database",
          properties: {
            replicas: 1,
            capacity_rps: 7000,
            base_latency_ms: 25,
          },
        },
      ],
      edges: [
        {
          id: "edge-client-service",
          source_node_id: "client-1",
          target_node_id: "service-1",
          interaction_type: "sync_request",
          routing_rule: {
            rule_type: "always",
          },
        },
        {
          id: "edge-service-cache",
          source_node_id: "service-1",
          target_node_id: "cache-1",
          interaction_type: "sync_request",
          routing_rule: {
            rule_type: "always",
          },
        },
        {
          id: "edge-cache-db",
          source_node_id: "cache-1",
          target_node_id: "db-1",
          interaction_type: "conditional_branch",
          routing_rule: {
            rule_type: "cache_miss",
          },
        },
      ],
    },
  };
}
