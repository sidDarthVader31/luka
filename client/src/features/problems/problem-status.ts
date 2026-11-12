import type { Design } from "../../lib/api";

export type ProblemStatus = "not_started" | "in_progress" | "solved";

export const STATUS_LABELS: Record<ProblemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  solved: "Solved",
};

const KEY_PREFIX = "luka:lastRunPassed:";

/** Whether the last run of a design met every target; null when unknown. Never throws. */
export function readLastRunPassed(designId: string): boolean | null {
  try {
    const value = window.localStorage.getItem(KEY_PREFIX + designId);
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

export function writeLastRunPassed(designId: string, passed: boolean): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + designId, String(passed));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); status is a convenience.
  }
}

export type ProblemProgress = {
  status: ProblemStatus;
  /** The most recently updated design for the problem, to continue. */
  latest?: Design;
};

/**
 * A problem is solved when any of the user's designs for it last passed every target, in
 * progress when a design exists, and not started otherwise.
 */
export function problemProgress(
  problemId: string,
  designs: Design[],
  lastRunPassed: (designId: string) => boolean | null = readLastRunPassed,
): ProblemProgress {
  const mine = designs
    .filter((design) => design.problem_id === problemId)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  if (mine.length === 0) {
    return { status: "not_started" };
  }
  const solved = mine.some((design) => lastRunPassed(design.id) === true);
  return { status: solved ? "solved" : "in_progress", latest: mine[0] };
}
