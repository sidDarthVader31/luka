import { useCallback, useState } from "react";

import { type Graph, type SimulationResult, type Workload, simulate } from "../../lib/api";

export const DEFAULT_WORKLOAD: Workload = {
  requests_per_second: 10_000,
  payload_kb: 8,
  concurrent_users: 50_000,
  read_write_ratio: 4,
  fanout_count: 1,
};

/** What affects the simulation; layout changes (moving a box) do not make results stale. */
export function graphSignature(graph: Graph): string {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => [node.id, node.archetype, node.properties]),
    edges: graph.edges,
    paths: graph.request_classes,
  });
}

export type Simulation = {
  result: SimulationResult | null;
  error: string | null;
  running: boolean;
  /** Signature of the graph the current result was computed for. */
  signature: string | null;
  run: (design: { id: string; name: string; graph: Graph }, workload: Workload) => Promise<void>;
  clear: () => void;
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
      const next = await simulate({ design, workload });
      setResult(next);
      setSignature(graphSignature(design.graph));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setSignature(null);
    setError(null);
  }, []);

  return { result, error, running, signature, run, clear };
}
