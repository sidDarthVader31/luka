import { useEffect, useState } from "react";

import { type Problem, getProblem, listProblems } from "../../lib/api";

export type ProblemsState =
  | { status: "loading" }
  | { status: "ready"; problems: Problem[] }
  | { status: "error"; message: string };

export function useProblems(): ProblemsState {
  const [state, setState] = useState<ProblemsState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    listProblems()
      .then((problems) => active && setState({ status: "ready", problems }))
      .catch(
        (error: unknown) =>
          active &&
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load problems",
          }),
      );
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/** The problem a design is linked to, or null for a sandbox design (or while loading). */
export function useProblem(problemId: string | undefined): {
  problem: Problem | null;
  error: string | null;
} {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setProblem(null);
    setError(null);
    if (!problemId) {
      return;
    }
    let active = true;
    getProblem(problemId)
      .then((next) => active && setProblem(next))
      .catch(
        (err: unknown) =>
          active && setError(err instanceof Error ? err.message : "Could not load the problem"),
      );
    return () => {
      active = false;
    };
  }, [problemId]);
  return { problem, error };
}
