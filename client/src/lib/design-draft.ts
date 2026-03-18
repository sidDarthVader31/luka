import type {
  ComponentArchetype,
  Design,
  EdgeInteractionType,
  GraphEdge,
  GraphNode,
  RoutingRuleType,
} from "./api";

export function buildDraftDesign(input: {
  id?: string | null;
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Design {
  return {
    id: input.id ?? "adhoc-ui-design",
    name: input.name.trim() || "Untitled Design",
    description: input.description.trim(),
    graph: {
      nodes: input.nodes,
      edges: input.edges,
    },
  };
}

export function createBlankDraft() {
  return {
    name: "Untitled Design",
    description: "",
    nodes: [] as GraphNode[],
    edges: [] as GraphEdge[],
  };
}

export function createNodeFromArchetype(
  archetype: ComponentArchetype,
  existingNodes: GraphNode[],
): GraphNode {
  const nextIndex =
    existingNodes.filter((node) => node.archetype === archetype.archetype).length +
    1;

  return {
    id: `${archetype.archetype}-${nextIndex}`,
    label: `${archetype.display_name} ${nextIndex}`,
    archetype: archetype.archetype,
    properties: { ...archetype.default_properties },
  };
}

export function buildEdge(input: {
  sourceNodeID: string;
  targetNodeID: string;
  interactionType: EdgeInteractionType;
  ruleType: RoutingRuleType;
  existingEdges: GraphEdge[];
}): GraphEdge {
  return {
    id: `edge-${input.existingEdges.length + 1}`,
    source_node_id: input.sourceNodeID,
    target_node_id: input.targetNodeID,
    interaction_type: input.interactionType,
    routing_rule: {
      rule_type: input.ruleType,
    },
  };
}

export function getSupportedEdgeOptions(input: {
  sourceNodeID: string;
  nodes: GraphNode[];
  archetypes: ComponentArchetype[];
}) {
  const sourceNode = input.nodes.find((node) => node.id === input.sourceNodeID);
  if (!sourceNode) {
    return {
      interactions: ["sync_request"] as EdgeInteractionType[],
      routingRules: ["always"] as RoutingRuleType[],
    };
  }

  const archetype = input.archetypes.find(
    (item) => item.archetype === sourceNode.archetype,
  );

  return {
    interactions:
      archetype?.supported_interactions ??
      (["sync_request"] as EdgeInteractionType[]),
    routingRules:
      archetype?.supported_routing_rules ?? (["always"] as RoutingRuleType[]),
  };
}

export function cloneDesignIntoDraft(design: Design) {
  return {
    id: design.id,
    name: design.name,
    description: design.description ?? "",
    nodes: structuredClone(design.graph.nodes),
    edges: structuredClone(design.graph.edges),
  };
}
