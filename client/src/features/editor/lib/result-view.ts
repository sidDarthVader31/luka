import type {
  EdgeSimulationResult,
  NodeSimulationResult,
  PathExplanation,
  SimulationResult,
} from "../../../lib/api";

export type ResultView = {
  id: string;
  name: string;
  summary: string;
  bottleneck?: NodeSimulationResult;
  nodes: NodeSimulationResult[];
  edges: EdgeSimulationResult[];
  paths: PathExplanation[];
};

export const OVERALL = "overall";

/** The overall result or one request-class flow, in a common shape. */
export function resultViews(result: SimulationResult): ResultView[] {
  const overall: ResultView = {
    id: OVERALL,
    name: "Overall",
    summary: result.summary,
    bottleneck: result.bottleneck,
    nodes: result.nodes,
    edges: result.edges,
    paths: result.paths ?? [],
  };
  const flows = (result.flows ?? []).map<ResultView>((flow) => ({
    id: flow.request_class_id,
    name: flow.name,
    summary: flow.summary,
    bottleneck: flow.bottleneck,
    nodes: flow.nodes,
    edges: flow.edges,
    paths: flow.paths ?? [],
  }));
  return flows.length > 1 ? [overall, ...flows] : [overall];
}

export type LoadLevel = "ok" | "warn" | "over";

export function loadLevel(utilization: number): LoadLevel {
  if (utilization > 1) {
    return "over";
  }
  return utilization >= 0.8 ? "warn" : "ok";
}

export function formatPercent(utilization: number): string {
  return `${Math.round(utilization * 100)}%`;
}
