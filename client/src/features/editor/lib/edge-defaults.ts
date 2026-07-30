import type {
  ComponentArchetype,
  EdgeInteractionType,
  GraphNode,
  RoutingRuleType,
} from "../../../lib/api";
import { getSupportedEdgeOptions } from "../../../lib/design-draft";

export function resolveEdgeDefaults(input: {
  sourceNodeID: string;
  nodes: GraphNode[];
  archetypes: ComponentArchetype[];
}): {
  interactionType: EdgeInteractionType;
  ruleType: RoutingRuleType;
} {
  const options = getSupportedEdgeOptions(input);
  return {
    interactionType: options.interactions[0] ?? "sync_request",
    ruleType: options.routingRules[0] ?? "always",
  };
}

export function shortInteractionLabel(interactionType: EdgeInteractionType): string {
  switch (interactionType) {
    case "async_enqueue":
      return "enqueue";
    case "conditional_branch":
      return "branch";
    case "sync_request":
      return "sync";
    default:
      return interactionType;
  }
}
