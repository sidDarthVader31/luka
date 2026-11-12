import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import type { ClassResult, FindingSeverity, NodeResult, SimulationResult } from "../../lib/api";
import { formatCompactNumber } from "../../lib/format";
import {
  SEVERITY_LABELS,
  bottleneck,
  componentRows,
  formatMs,
  formatNines,
  formatPercent,
  formatRps,
  formatSplit,
  formatSuccess,
  groupFindings,
  hasDemand,
  loadLevel,
  targetLine,
  targetSummary,
} from "./lib/results";
import { DEFAULT_PAYLOAD_KB, DEFAULT_READ_SHARE } from "./useSimulation";
import "./ResultsPanel.css";

export type ResultsTab = "results" | "components" | "estimates" | "assumptions";

const TABS: { id: ResultsTab; label: string }[] = [
  { id: "results", label: "Results" },
  { id: "components", label: "Components" },
  { id: "estimates", label: "Estimates" },
  { id: "assumptions", label: "Assumptions" },
];

type ResultsPanelProps = {
  result: SimulationResult;
  stale: boolean;
  /** Selects these nodes on the canvas. */
  onSelectNodes: (nodeIds: string[]) => void;
  onClose: () => void;
};

export function ResultsPanel(props: ResultsPanelProps) {
  const [tab, setTab] = useState<ResultsTab>("results");

  return (
    <aside className="results" aria-label="Results">
      <header className="results__header">
        <h2>Results</h2>
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Close results"
          onClick={props.onClose}
        >
          <IconX size={16} />
        </button>
      </header>

      {props.stale ? (
        <p className="results__stale">
          <IconAlertTriangle size={14} aria-hidden /> The design or traffic changed since this run.
          Run again to update.
        </p>
      ) : null}

      <div className="results__tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === tab}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "results" ? <ResultsTabView {...props} /> : null}
        {tab === "components" ? <ComponentsTab {...props} /> : null}
        {tab === "estimates" ? <EstimatesTab result={props.result} /> : null}
        {tab === "assumptions" ? <AssumptionsTab result={props.result} /> : null}
      </div>
    </aside>
  );
}

const SEVERITY_ICONS: Record<FindingSeverity, typeof IconCircleX> = {
  error: IconCircleX,
  warning: IconAlertTriangle,
  info: IconInfoCircle,
};

function ResultsTabView({ result, onSelectNodes }: ResultsPanelProps) {
  const summary = targetSummary(result.targets);
  const worst = bottleneck(result);
  const groups = groupFindings(result.findings);

  return (
    <>
      {summary ? (
        <section className="results__section">
          <h3>
            Targets <span className="results__muted">· {summary.label}</span>
          </h3>
          <ul className="results__targets">
            {result.targets!.map((target) => {
              const line = targetLine(target);
              return (
                <li key={target.target_id} data-passed={target.passed}>
                  {target.passed ? (
                    <IconCircleCheck size={16} aria-label="Passed" />
                  ) : (
                    <IconCircleX size={16} aria-label="Failed" />
                  )}
                  <span className="results__target-label">{target.label}</span>
                  <span className="results__num">
                    {line.actual} <span className="results__muted">(target {line.expected})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="results__section">
        <h3>End to end</h3>
        <div className="results__classes">
          <ClassCard title="Reads" value={result.end_to_end.reads} />
          <ClassCard title="Writes" value={result.end_to_end.writes} />
        </div>
      </section>

      {worst ? (
        <button
          type="button"
          className="results__bottleneck"
          data-level={loadLevel(worst)}
          onClick={() => onSelectNodes([worst.node_id])}
        >
          <span className="results__kicker">Bottleneck</span>
          <strong>
            {worst.label} · {formatPercent(worst.utilization)}
          </strong>
          <span>
            {formatCompactNumber(worst.demand.reads + worst.demand.writes)} req/s against a capacity
            of {formatRps(worst.capacity_rps)}.
          </span>
        </button>
      ) : null}

      {groups.length > 0 ? (
        <section className="results__section">
          <h3>Review</h3>
          {groups.map((group) => {
            const Icon = SEVERITY_ICONS[group.severity];
            return (
              <div key={group.severity} className="results__group">
                <span className="results__kicker">{SEVERITY_LABELS[group.severity]}</span>
                <ul className="results__findings">
                  {group.findings.map((finding) => {
                    const ids = finding.node_ids ?? [];
                    return (
                      <li key={`${finding.rule_id}-${ids.join(",")}`}>
                        <button
                          type="button"
                          data-severity={finding.severity}
                          disabled={ids.length === 0}
                          onClick={() => onSelectNodes(ids)}
                        >
                          <Icon size={16} aria-hidden />
                          <span>
                            <strong>{finding.title}</strong>
                            <span>{finding.detail}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      {result.warnings?.length ? (
        <section className="results__section">
          <h3>Warnings</h3>
          <ul className="results__plain">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ClassCard(props: { title: string; value: ClassResult }) {
  const { value } = props;
  if (value.demand_rps === 0) {
    return (
      <div className="results__class">
        <span className="results__kicker">{props.title}</span>
        <p className="results__muted">No traffic.</p>
      </div>
    );
  }
  return (
    <div className="results__class" title={value.working.join("\n")}>
      <span className="results__kicker">{props.title}</span>
      <dl>
        <dt>Served</dt>
        <dd>
          {formatCompactNumber(value.served_rps)} / {formatRps(value.demand_rps)}
        </dd>
        <dt>Success</dt>
        <dd>{formatSuccess(value.success_rate)}</dd>
        <dt>p50</dt>
        <dd>{formatMs(value.latency_p50_ms)}</dd>
        <dt>p99</dt>
        <dd>
          {formatMs(value.latency_p99_ms)}
          {value.latency_p99_ms !== undefined ? (
            <span className="results__muted"> upper bound</span>
          ) : null}
        </dd>
        <dt>Availability</dt>
        <dd>{formatNines(value.availability)}</dd>
      </dl>
    </div>
  );
}

function ComponentsTab({ result, onSelectNodes }: ResultsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = componentRows(result);
  return (
    <ul className="results__nodes">
      {rows.map((node) => {
        const open = node.node_id === openId;
        return (
          <li key={node.node_id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setOpenId(open ? null : node.node_id);
                onSelectNodes([node.node_id]);
              }}
            >
              <span
                className="results__dot"
                data-level={hasDemand(node) ? loadLevel(node) : "idle"}
              />
              <span className="results__name">{node.label}</span>
              <span className="results__num results__num--strong">
                {hasDemand(node) ? formatPercent(node.utilization) : "idle"}
              </span>
            </button>
            {open ? <NodeDetail node={node} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function NodeDetail({ node }: { node: NodeResult }) {
  return (
    <div className="results__detail">
      <dl>
        <dt>Demand</dt>
        <dd>{formatSplit(node.demand)}</dd>
        <dt>Served</dt>
        <dd>{formatSplit(node.served)}</dd>
        <dt>Capacity</dt>
        <dd>{formatRps(node.capacity_rps)}</dd>
        <dt>Latency</dt>
        <dd>
          {node.latency_p50_ms === undefined
            ? formatMs(undefined)
            : `p50 ${formatMs(node.latency_p50_ms)} · p99 ${formatMs(node.latency_p99_ms)}`}
        </dd>
        <dt>Availability</dt>
        <dd>{formatNines(node.availability)}</dd>
      </dl>
      {node.working.length > 0 ? (
        <pre className="results__working">{node.working.join("\n")}</pre>
      ) : null}
    </div>
  );
}

function EstimatesTab({ result }: { result: SimulationResult }) {
  const { estimates } = result;
  return (
    <section className="results__section">
      <dl className="results__estimates">
        <dt>Bandwidth</dt>
        <dd>{formatCompactNumber(estimates.bandwidth_mb_per_sec)} MB/s</dd>
        <dt>Storage per day</dt>
        <dd>{formatCompactNumber(estimates.storage_gb_per_day)} GB</dd>
        <dt>Storage per year</dt>
        <dd>{formatCompactNumber(estimates.storage_tb_per_year)} TB</dd>
      </dl>
      {estimates.working.length > 0 ? (
        <pre className="results__working">{estimates.working.join("\n")}</pre>
      ) : null}
    </section>
  );
}

function AssumptionsTab({ result }: { result: SimulationResult }) {
  const { workload } = result;
  const readShare = workload.read_share ?? DEFAULT_READ_SHARE;
  return (
    <div className="results__assumptions">
      <section className="results__section">
        <h3>Workload used</h3>
        <dl className="results__estimates">
          <dt>Requests</dt>
          <dd>{formatRps(workload.requests_per_second)}</dd>
          <dt>Reads</dt>
          <dd>{formatPercent(readShare)}</dd>
          <dt>Payload</dt>
          <dd>{workload.payload_kb ?? DEFAULT_PAYLOAD_KB} KB</dd>
        </dl>
      </section>
      <section className="results__section">
        <h3>How the numbers are worked out</h3>
        <ul className="results__plain">
          <li>
            A steady-state estimate, not a time-stepped simulation. Every number can be checked by
            hand from the rules below.
          </li>
          <li>
            Clients send reads and writes in the workload's ratio. A connection carries only the
            traffic it names (all, reads or writes).
          </li>
          <li>
            Services and workers send every request to each dependency. Gateways split traffic by
            weight. Caches and CDNs pass on read misses and all writes. Queues deliver every message
            to every consumer, as writes.
          </li>
          <li>
            Utilisation is load over capacity (instances × capacity per instance). For a database,
            writes go to primaries and reads spread over primaries and replicas, so utilisation is
            measured on the primaries.
          </li>
          <li>
            Above 100%, a component serves only its share of capacity and the rest fails. Its
            callers lose those requests too.
          </li>
          <li>
            Latency treats each instance as a queue: it rises sharply near 100% and is undefined
            once overloaded. End-to-end p50/p99 add up the waiting connections in sequence, so they
            are an upper bound. Fire-and-forget connections add no latency.
          </li>
          <li>
            Availability: a component is up if any instance is up. End to end, every waiting
            dependency must be up. Caches count as hard dependencies.
          </li>
        </ul>
      </section>
    </div>
  );
}
