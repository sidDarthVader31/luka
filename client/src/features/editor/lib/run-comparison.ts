import type { Run, RunNodeResult, Workload } from "../../../lib/api";

export type NodeCompareRow = {
  nodeId: string;
  label: string;
  baselineUtil: number;
  latestUtil: number;
  utilDelta: number;
  latencyDelta: number;
  droppedDelta: number;
  incomingDelta: number;
  hot: boolean;
};

export type RunComparison = {
  baselineLabel: string;
  latestLabel: string;
  utilizationDelta: number;
  latencyDelta: number;
  droppedDelta: number;
  message: string;
  rows: NodeCompareRow[];
};

export function buildRunComparison(baselineRun: Run, latestRun: Run): RunComparison {
  const baseline = baselineRun.result?.bottleneck;
  const latest = latestRun.result?.bottleneck;
  const baselineNodes = new Map(
    (baselineRun.result?.nodes ?? []).map((node) => [node.node_id, node]),
  );
  const latestNodes = latestRun.result?.nodes ?? [];

  const rows: NodeCompareRow[] = latestNodes
    .filter((node) => node.archetype !== "client")
    .map((node) => {
      const prev = baselineNodes.get(node.node_id);
      return buildRow(node, prev);
    });

  for (const [nodeId, prev] of baselineNodes) {
    if (prev.archetype === "client") {
      continue;
    }
    if (!latestNodes.some((node) => node.node_id === nodeId)) {
      rows.push(buildRow(undefined, prev));
    }
  }

  rows.sort((a, b) => b.latestUtil - a.latestUtil);

  return {
    baselineLabel: baseline?.label ?? "No bottleneck",
    latestLabel: latest?.label ?? "No bottleneck",
    utilizationDelta: (latest?.utilization ?? 0) - (baseline?.utilization ?? 0),
    latencyDelta:
      (latest?.estimated_latency_ms ?? 0) - (baseline?.estimated_latency_ms ?? 0),
    droppedDelta: (latest?.dropped_rps ?? 0) - (baseline?.dropped_rps ?? 0),
    message: describeComparison(baseline, latest),
    rows,
  };
}

function buildRow(
  latest: RunNodeResult | undefined,
  baseline: RunNodeResult | undefined,
): NodeCompareRow {
  const label = latest?.label ?? baseline?.label ?? "Unknown";
  const nodeId = latest?.node_id ?? baseline?.node_id ?? "unknown";
  const baselineUtil = baseline?.utilization ?? 0;
  const latestUtil = latest?.utilization ?? 0;
  return {
    nodeId,
    label,
    baselineUtil,
    latestUtil,
    utilDelta: latestUtil - baselineUtil,
    latencyDelta:
      (latest?.estimated_latency_ms ?? 0) - (baseline?.estimated_latency_ms ?? 0),
    droppedDelta: (latest?.dropped_rps ?? 0) - (baseline?.dropped_rps ?? 0),
    incomingDelta: (latest?.incoming_rps ?? 0) - (baseline?.incoming_rps ?? 0),
    hot: latestUtil >= 0.8 || baselineUtil >= 0.8,
  };
}

function describeComparison(
  baseline: RunNodeResult | undefined,
  latest: RunNodeResult | undefined,
) {
  if (!baseline && !latest) {
    return "Neither run produced a bottleneck result yet.";
  }
  if (!baseline || !latest) {
    return "Only one of the compared runs has a bottleneck result, so the comparison is partial.";
  }
  if (baseline.node_id !== latest.node_id) {
    return `The bottleneck moved from ${baseline.label} to ${latest.label}.`;
  }
  if (latest.utilization > baseline.utilization) {
    return `${latest.label} stayed the bottleneck and got worse.`;
  }
  if (latest.utilization < baseline.utilization) {
    return `${latest.label} stayed the bottleneck, but pressure eased.`;
  }
  return `${latest.label} remains the bottleneck with nearly unchanged pressure.`;
}

export function formatWorkload(workload: Workload) {
  const readWriteRatio = workload.read_write_ratio ?? 4;
  const payloadKB = workload.payload_kb ?? 4;
  const fanoutCount = workload.fanout_count ?? 1;
  const concurrentUsers = workload.concurrent_users ?? 0;
  return `${formatCompactNumber(workload.requests_per_second)} rps, ${formatCompactNumber(concurrentUsers)} users, write pressure ${readWriteRatio}:1, ${payloadKB} KB, fanout x${fanoutCount}`;
}

export function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value * 100) / 100);
}

export function formatSignedPercent(value: number) {
  const pct = Math.round(value * 1000) / 10;
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function formatSignedNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function buildExportMarkdown(input: {
  designName: string;
  workload: Workload;
  summary?: string;
  bottleneckLabel?: string;
  nodes: RunNodeResult[];
  pathSummary?: string;
}) {
  const top = [...input.nodes]
    .filter((node) => node.archetype !== "client")
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 5);

  const lines = [
    `# Luka run summary: ${input.designName}`,
    "",
    "## Workload",
    formatWorkload(input.workload),
    "",
    "## Bottleneck",
    input.summary ?? "No summary",
    input.bottleneckLabel ? `Primary bottleneck: **${input.bottleneckLabel}**` : "",
    "",
    "## Top saturated components",
    ...top.map(
      (node) =>
        `- ${node.label}: ${Math.round(node.utilization * 100)}% util, ${formatCompactNumber(node.incoming_rps)} in, ${formatCompactNumber(node.dropped_rps)} dropped`,
    ),
    "",
    "## Critical path",
    input.pathSummary ?? "n/a",
    "",
    "## Assumptions disclaimer",
    "Luka is an educational analytical model. Capacity defaults are illustrative. Timeout/retry edge stats are display-only and do not change node utilization. Write pressure adjusts capacity penalties; use request flows for separate read/write paths.",
    "",
  ];

  return lines.filter((line) => line !== undefined).join("\n");
}
