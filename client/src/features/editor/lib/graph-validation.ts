import type { GraphEdge, GraphNode, RequestClass } from "../../../lib/api";

export type PreflightIssue = {
  message: string;
  nodeIds: string[];
  edgeIds: string[];
};

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
};

const ALLOWED: Record<string, string[]> = {
  client: ["gateway", "stateless_service"],
  gateway: ["stateless_service"],
  stateless_service: ["stateless_service", "cache", "database", "queue"],
  cache: ["database"],
  database: [],
  queue: ["worker"],
  worker: ["stateless_service", "cache", "database", "queue"],
};

export function validateGraphForRun(input: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  requestClasses: RequestClass[];
}): PreflightResult {
  const issues: PreflightIssue[] = [];
  const nodeByID = new Map(input.nodes.map((node) => [node.id, node]));
  const nodeIDs = new Set<string>();

  if (input.nodes.length === 0) {
    issues.push({
      message: "Add at least one node before running a simulation.",
      nodeIds: [],
      edgeIds: [],
    });
  }

  let clientCount = 0;
  for (const node of input.nodes) {
    if (nodeIDs.has(node.id)) {
      issues.push({
        message: `Duplicate node id ${node.id}.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
    nodeIDs.add(node.id);
    if (!node.label.trim()) {
      issues.push({
        message: `Node ${node.id} needs a label.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
    if (node.archetype === "client") {
      clientCount += 1;
    }
  }

  if (clientCount === 0) {
    issues.push({
      message: "Exactly one Client node is required to run.",
      nodeIds: [],
      edgeIds: [],
    });
  } else if (clientCount > 1) {
    issues.push({
      message: `Only one Client is supported (found ${clientCount}).`,
      nodeIds: input.nodes.filter((n) => n.archetype === "client").map((n) => n.id),
      edgeIds: [],
    });
  }

  const requestClassIDs = new Set(input.requestClasses.map((item) => item.id));
  for (const requestClass of input.requestClasses) {
    if (!requestClass.name.trim()) {
      issues.push({
        message: "Every traffic path needs a name.",
        nodeIds: [],
        edgeIds: [],
      });
    }
    if ((requestClass.traffic_share ?? 0) <= 0) {
      issues.push({
        message: `Traffic path "${requestClass.name}" needs a share greater than zero.`,
        nodeIds: [],
        edgeIds: [],
      });
    }
  }

  const adjacency = new Map<string, string[]>();

  for (const edge of input.edges) {
    const source = nodeByID.get(edge.source_node_id);
    const target = nodeByID.get(edge.target_node_id);

    if (!source) {
      issues.push({
        message: `Edge ${edge.id} references unknown source.`,
        nodeIds: [],
        edgeIds: [edge.id],
      });
      continue;
    }
    if (!target) {
      issues.push({
        message: `Edge ${edge.id} references unknown target.`,
        nodeIds: [],
        edgeIds: [edge.id],
      });
      continue;
    }
    if (edge.source_node_id === edge.target_node_id) {
      issues.push({
        message: `Edge ${edge.id} cannot connect a node to itself.`,
        nodeIds: [edge.source_node_id],
        edgeIds: [edge.id],
      });
    }

    const allowed = ALLOWED[source.archetype] ?? [];
    if (!allowed.includes(target.archetype)) {
      issues.push({
        message: `Cannot connect ${source.archetype} → ${target.archetype}.`,
        nodeIds: [source.id, target.id],
        edgeIds: [edge.id],
      });
    }

    if (
      (edge.routing_rule.rule_type === "cache_hit" ||
        edge.routing_rule.rule_type === "cache_miss") &&
      source.archetype !== "cache"
    ) {
      issues.push({
        message: `Edge ${edge.id} uses ${edge.routing_rule.rule_type} but source is not a cache.`,
        nodeIds: [source.id],
        edgeIds: [edge.id],
      });
    }

    if (input.requestClasses.length > 0 && (edge.request_class_ids?.length ?? 0) === 0) {
      issues.push({
        message: `Edge ${edge.id} must belong to at least one traffic path.`,
        nodeIds: [],
        edgeIds: [edge.id],
      });
    }

    for (const flowID of edge.request_class_ids ?? []) {
      if (!requestClassIDs.has(flowID)) {
        issues.push({
          message: `Edge ${edge.id} references unknown traffic path ${flowID}.`,
          nodeIds: [],
          edgeIds: [edge.id],
        });
      }
    }

    const next = adjacency.get(edge.source_node_id) ?? [];
    next.push(edge.target_node_id);
    adjacency.set(edge.source_node_id, next);
  }

  if (hasCycle(adjacency)) {
    issues.push({
      message: "Cycles are not supported by the current simulator.",
      nodeIds: [],
      edgeIds: [],
    });
  }

  return { ok: issues.length === 0, issues };
}

function hasCycle(adjacency: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (nodeID: string): boolean => {
    if (stack.has(nodeID)) {
      return true;
    }
    if (visited.has(nodeID)) {
      return false;
    }
    visited.add(nodeID);
    stack.add(nodeID);
    for (const next of adjacency.get(nodeID) ?? []) {
      if (visit(next)) {
        return true;
      }
    }
    stack.delete(nodeID);
    return false;
  };

  for (const nodeID of adjacency.keys()) {
    if (visit(nodeID)) {
      return true;
    }
  }
  return false;
}
