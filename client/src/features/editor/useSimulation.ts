import { useCallback, useState } from "react";

import {
  type Design,
  type Graph,
  type SimulationResult,
  type Workload,
  simulate,
} from "../../lib/api";

// Server defaults (docs/simulation-model.md).
export const DEFAULT_READ_SHARE = 0.9;
export const DEFAULT_PAYLOAD_KB = 1;

export const DEFAULT_WORKLOAD: Workload = {
  requests_per_second: 1_000,
  read_share: DEFAULT_READ_SHARE,
  payload_kb: DEFAULT_PAYLOAD_KB,
};

/** What affects the simulation; layout changes (moving a box) do not make results stale. */
export function runSignature(graph: Graph, workload: Workload | undefined): string {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => [node.id, node.archetype, node.properties]),
    edges: graph.edges,
    workload: workload ?? null,
  });
}

type RunDesign = Pick<Design, "id" | "name" | "graph" | "problem_id">;

export type Simulation = {
  result: SimulationResult | null;
  error: string | null;
  running: boolean;
  /** Signature of the graph and workload the current result was computed for. */
  signature: string | null;
  /** Pass no workload for a problem design: the server uses the problem's. */
  run: (design: RunDesign, workload: Workload | undefined) => Promise<SimulationResult | null>;
};

export function useSimulation(): Simulation {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback<Simulation["run"]>(async (design, workload) => {
    setRunning(true);
    setError(null);
    try {
      // Always send the design inline so unsaved edits are simulated.
      const next = await simulate(workload ? { design, workload } : { design });
      setResult(next);
      setSignature(runSignature(design.graph, workload));
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { result, error, running, signature, run };
}
