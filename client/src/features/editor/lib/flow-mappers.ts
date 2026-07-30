import type { Edge, Node } from "@xyflow/react";

import type {
  EdgeInteractionType,
  GraphEdge,
  GraphNode,
  RoutingRuleType,
} from "../../../lib/api";
import type { SystemNodeData } from "../nodes/SystemNode";
import { shortInteractionLabel } from "./edge-defaults";
import { formatCompactNumber } from "./run-comparison";

export type FlowEdgeData = {
  interactionType: EdgeInteractionType;
  ruleType: RoutingRuleType;
  routingWeight: number;
  fanoutMultiplier: number;
  timeoutMS: number;
  retryAttempts: number;
  requestClassIDs: string[];
};

export function graphNodeToFlowNode(node: GraphNode): Node<SystemNodeData> {
  return {
    id: node.id,
    type: "system",
    position: node.position,
    data: {
      label: node.label,
      archetype: node.archetype,
      color: node.color,
      properties: node.properties,
    },
  };
}

export function flowNodeToGraphNode(node: Node<SystemNodeData>): GraphNode {
  return {
    id: node.id,
    label: node.data.label,
    archetype: node.data.archetype,
    color: node.data.color,
    position: { x: node.position.x, y: node.position.y },
    properties: node.data.properties,
  };
}

export function graphEdgeToFlowEdge(edge: GraphEdge): Edge<FlowEdgeData> {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    data: {
      interactionType: edge.interaction_type,
      ruleType: edge.routing_rule.rule_type,
      routingWeight: edge.routing_rule.value ?? 1,
      fanoutMultiplier: edge.fanout_multiplier ?? 1,
      timeoutMS: edge.timeout_ms ?? 0,
      retryAttempts: edge.retry_attempts ?? 0,
      requestClassIDs: edge.request_class_ids ?? [],
    },
  };
}

export function flowEdgeToGraphEdge(edge: Edge<FlowEdgeData>): GraphEdge {
  return {
    id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    interaction_type: edge.data?.interactionType ?? "sync_request",
    fanout_multiplier:
      edge.data?.fanoutMultiplier && edge.data.fanoutMultiplier > 1
        ? edge.data.fanoutMultiplier
        : undefined,
    timeout_ms:
      edge.data?.timeoutMS && edge.data.timeoutMS > 0 ? edge.data.timeoutMS : undefined,
    retry_attempts:
      edge.data?.retryAttempts && edge.data.retryAttempts > 0
        ? edge.data.retryAttempts
        : undefined,
    request_class_ids: edge.data?.requestClassIDs?.length
      ? edge.data.requestClassIDs
      : undefined,
    routing_rule: {
      rule_type: edge.data?.ruleType ?? "always",
      value:
        edge.data?.routingWeight && edge.data.routingWeight > 1
          ? edge.data.routingWeight
          : undefined,
    },
  };
}

export function buildEdgeLabel(
  edge: Edge<FlowEdgeData>,
  routedRps?: number,
): string {
  const semantic =
    edge.data?.interactionType === "fallback"
      ? "fallback"
      : edge.data?.ruleType && edge.data.ruleType !== "always"
        ? edge.data.ruleType
        : shortInteractionLabel(edge.data?.interactionType ?? "sync_request");
  const throughput =
    routedRps !== undefined ? ` · ${formatCompactNumber(routedRps)} rps` : "";
  return `${semantic}${throughput}`;
}
