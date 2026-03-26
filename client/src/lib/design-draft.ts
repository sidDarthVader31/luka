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
  position?: { x: number; y: number },
): GraphNode {
  const nextIndex = nextAvailableIndex(
    existingNodes
      .filter((node) => node.archetype === archetype.archetype)
      .map((node) => node.id),
    `${archetype.archetype}-`,
  );

  return {
    id: `${archetype.archetype}-${nextIndex}`,
    label: `${archetype.display_name} ${nextIndex}`,
    archetype: archetype.archetype,
    color: getDefaultNodeColor(archetype.archetype),
    position:
      position ?? {
        x: 160 + ((nextIndex - 1) % 3) * 240,
        y: 120 + Math.floor((nextIndex - 1) / 3) * 180,
      },
    properties: { ...archetype.default_properties },
  };
}

export function buildEdge(input: {
  sourceNodeID: string;
  targetNodeID: string;
  interactionType: EdgeInteractionType;
  ruleType: RoutingRuleType;
  fanoutMultiplier?: number;
  existingEdges: GraphEdge[];
}): GraphEdge {
  const nextIndex = nextAvailableIndex(
    input.existingEdges.map((edge) => edge.id),
    "edge-",
  );

  return {
    id: `edge-${nextIndex}`,
    source_node_id: input.sourceNodeID,
    target_node_id: input.targetNodeID,
    interaction_type: input.interactionType,
    fanout_multiplier:
      input.fanoutMultiplier && input.fanoutMultiplier > 1
        ? input.fanoutMultiplier
        : undefined,
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

function nextAvailableIndex(ids: string[], prefix: string) {
  const used = new Set(
    ids
      .map((id) => Number(id.replace(prefix, "")))
      .filter((value) => Number.isInteger(value) && value > 0),
  );

  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }

  return candidate;
}

function getDefaultNodeColor(archetype: ComponentArchetype["archetype"]) {
  switch (archetype) {
    case "client":
    case "gateway":
      return "blue";
    case "stateless_service":
    case "worker":
      return "green";
    case "cache":
    case "queue":
      return "yellow";
    case "database":
      return "red";
    default:
      return "blue";
  }
}
