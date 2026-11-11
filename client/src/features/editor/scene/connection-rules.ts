import type {
  CatalogItem,
  EdgeInteractionType,
  NodeArchetype,
  RoutingRuleType,
} from "../../../lib/api";

// Mirrors isAllowedConnection in server/internal/graphs/validation.go. Phase 3 replaces the
// edge model, at which point this table goes away.
const ALLOWED_TARGETS: Record<NodeArchetype, NodeArchetype[]> = {
  client: ["gateway", "stateless_service"],
  gateway: ["stateless_service"],
  stateless_service: ["stateless_service", "cache", "database", "queue"],
  cache: ["database"],
  database: [],
  queue: ["worker"],
  worker: ["stateless_service", "cache", "database", "queue"],
};

export function isAllowedConnection(source: NodeArchetype, target: NodeArchetype): boolean {
  return ALLOWED_TARGETS[source]?.includes(target) ?? false;
}

export function edgeOptions(source: CatalogItem | undefined): {
  interactions: EdgeInteractionType[];
  routingRules: RoutingRuleType[];
} {
  const interactions = source?.supported_interactions ?? [];
  const routingRules = source?.supported_routing_rules ?? [];
  return {
    interactions: interactions.length > 0 ? interactions : ["sync_request"],
    routingRules: routingRules.length > 0 ? routingRules : ["always"],
  };
}

export const INTERACTION_LABELS: Record<EdgeInteractionType, string> = {
  sync_request: "Request",
  async_enqueue: "Enqueue",
  consume: "Consume",
  conditional_branch: "Conditional",
  fallback: "Fallback",
};

export const ROUTING_RULE_LABELS: Record<RoutingRuleType, string> = {
  always: "Always",
  cache_hit: "On cache hit",
  cache_miss: "On cache miss",
};
