import type { Graph } from "../../../lib/api";

export type PreflightIssue = {
  message: string;
  nodeIds: string[];
};

/**
 * Instant feedback for problems that would make POST /simulate fail. Edge-level problems are
 * already reported as scene warnings by sceneToGraph, so only graph-wide checks live here.
 */
export function validateGraphForRun(graph: Graph): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (graph.nodes.length === 0) {
    issues.push({ message: "Add some components from the library to run.", nodeIds: [] });
    return issues;
  }

  const clients = graph.nodes.filter((node) => node.archetype === "client");
  if (clients.length === 0) {
    issues.push({ message: "Add a Client: traffic enters the system there.", nodeIds: [] });
  } else if (clients.length > 1) {
    issues.push({
      message: `The simulator supports one Client for now (found ${clients.length}).`,
      nodeIds: clients.map((node) => node.id),
    });
  }

  for (const path of graph.request_classes ?? []) {
    if (!path.name.trim()) {
      issues.push({ message: "Every traffic path needs a name.", nodeIds: [] });
    }
    if ((path.traffic_share ?? 0) <= 0) {
      issues.push({
        message: `Traffic path "${path.name}" needs a share above zero.`,
        nodeIds: [],
      });
    }
  }

  const cycle = findCycle(graph);
  if (cycle) {
    issues.push({ message: "Loops are not supported by the simulator yet.", nodeIds: cycle });
  }

  return issues;
}

function findCycle(graph: Graph): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.source_node_id, [
      ...(adjacency.get(edge.source_node_id) ?? []),
      edge.target_node_id,
    ]);
  }
  const done = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const index = stack.indexOf(id);
    if (index >= 0) {
      return stack.slice(index);
    }
    if (done.has(id)) {
      return null;
    }
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    done.add(id);
    return null;
  };

  for (const id of adjacency.keys()) {
    const cycle = visit(id);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}
