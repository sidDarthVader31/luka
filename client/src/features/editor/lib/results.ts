import type {
  EdgeResult,
  Finding,
  FindingSeverity,
  NodeResult,
  SimulationResult,
  TargetMetric,
  TargetResult,
  Traffic,
} from "../../../lib/api";
import { formatCompactNumber } from "../../../lib/format";

// Pure selectors and formatters for SimulationResult. Unit tested in results.test.ts.

export type LoadLevel = "ok" | "warn" | "over";

export function loadLevel(node: Pick<NodeResult, "utilization" | "overloaded">): LoadLevel {
  if (node.overloaded || node.utilization > 1) {
    return "over";
  }
  return node.utilization > 0.8 ? "warn" : "ok";
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function total(traffic: Traffic): number {
  return traffic.reads + traffic.writes;
}

export function hasDemand(node: NodeResult): boolean {
  return total(node.demand) > 0;
}

export function formatRps(value: number): string {
  return `${formatCompactNumber(value)} req/s`;
}

/** "1.2k reads · 300 writes" */
export function formatSplit(traffic: Traffic): string {
  return `${formatCompactNumber(traffic.reads)} reads · ${formatCompactNumber(traffic.writes)} writes`;
}

export const UNDEFINED_LATENCY = "Undefined (overloaded)";

/** Milliseconds, or the overload label when the server omitted the value. */
export function formatMs(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return UNDEFINED_LATENCY;
  }
  if (value >= 1000) {
    return `${Number((value / 1000).toFixed(1))} s`;
  }
  if (value < 10) {
    return `${Math.round(value * 10) / 10} ms`;
  }
  return `${Math.round(value)} ms`;
}

/** Number of nines in an availability: 0.999 → 3, 0.9995 → 3, 0.95 → 1. */
export function countNines(availability: number): number {
  if (availability >= 1) {
    return Number.POSITIVE_INFINITY;
  }
  if (availability <= 0) {
    return 0;
  }
  // The epsilon absorbs float error: 1 - 0.999 is 0.0010000000000000009.
  return Math.max(0, Math.floor(-Math.log10(1 - availability) + 1e-6));
}

/** Availability as a percentage that shows its nines: 0.999 → "99.9%", 0.99995 → "99.995%". */
export function formatAvailability(availability: number): string {
  if (availability >= 1) {
    return "100%";
  }
  const decimals = Math.min(6, Math.max(1, countNines(availability) - 1));
  return `${Number((availability * 100).toFixed(decimals))}%`;
}

/** "99.9% · 3 nines" */
export function formatNines(availability: number): string {
  const nines = countNines(availability);
  const percent = formatAvailability(availability);
  if (!Number.isFinite(nines) || nines === 0) {
    return percent;
  }
  return `${percent} · ${nines} nine${nines === 1 ? "" : "s"}`;
}

export function formatSuccess(rate: number): string {
  if (rate >= 1) {
    return "100%";
  }
  // Round down so a lossy path never reads as 100%.
  return `${(Math.floor(rate * 1000) / 10).toFixed(1)}%`;
}

/** Targets on latency are upper limits; the rest are lower limits. */
export function targetComparison(metric: TargetMetric): "≤" | "≥" {
  return metric === "read_p99_ms" || metric === "write_p99_ms" ? "≤" : "≥";
}

export function formatTargetValue(metric: TargetMetric, value: number): string {
  switch (metric) {
    case "read_p99_ms":
    case "write_p99_ms":
      return formatMs(value);
    case "availability":
      return formatAvailability(value);
    default:
      return formatRps(value);
  }
}

export function targetLine(target: TargetResult): { actual: string; expected: string } {
  return {
    actual:
      target.actual === undefined || target.actual === null
        ? UNDEFINED_LATENCY
        : formatTargetValue(target.metric, target.actual),
    expected: `${targetComparison(target.metric)} ${formatTargetValue(target.metric, target.expected)}`,
  };
}

export type TargetSummary = { met: number; total: number; allPassed: boolean; label: string };

export function targetSummary(targets: TargetResult[] | undefined): TargetSummary | null {
  if (!targets || targets.length === 0) {
    return null;
  }
  const met = targets.filter((target) => target.passed).length;
  return {
    met,
    total: targets.length,
    allPassed: met === targets.length,
    label: `${met} of ${targets.length} targets met`,
  };
}

const SEVERITY_ORDER: FindingSeverity[] = ["error", "warning", "info"];

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Suggestions",
};

export function groupFindings(
  findings: Finding[],
): { severity: FindingSeverity; findings: Finding[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0);
}

/** Nodes for the Components tab: everything but clients, in the server's (topological) order. */
export function componentRows(result: SimulationResult): NodeResult[] {
  return result.nodes.filter((node) => node.archetype !== "client");
}

export function bottleneck(result: SimulationResult): NodeResult | undefined {
  return result.bottleneck_node_id
    ? result.nodes.find((node) => node.node_id === result.bottleneck_node_id)
    : undefined;
}

export function edgeLabel(edge: EdgeResult): { text: string; title: string } {
  return { text: formatRps(total(edge.traffic)), title: formatSplit(edge.traffic) };
}
