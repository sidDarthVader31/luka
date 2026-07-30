import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { listRunsForDesign, type Run } from "../../lib/api";
import {
  buildRunComparison,
  formatSignedNumber,
  formatSignedPercent,
  formatWorkload,
} from "../editor/lib/run-comparison";

export function CompareRunsPage() {
  const { designId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  const leftID = searchParams.get("left") ?? "";
  const rightID = searchParams.get("right") ?? "";

  useEffect(() => {
    void (async () => {
      try {
        const items = await listRunsForDesign(designId);
        setRuns(items);
        if (!searchParams.get("left") && items[1]) {
          searchParams.set("left", items[1].id);
        }
        if (!searchParams.get("right") && items[0]) {
          searchParams.set("right", items[0].id);
        }
        if (!searchParams.get("left") || !searchParams.get("right")) {
          setSearchParams(searchParams, { replace: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load runs");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  const left = runs.find((run) => run.id === leftID) ?? null;
  const right = runs.find((run) => run.id === rightID) ?? null;
  const comparison = useMemo(
    () => (left && right ? buildRunComparison(left, right) : null),
    [left, right],
  );

  return (
    <main className="library-page">
      <div className="library-page__inner">
        <header className="library-page__header">
          <p className="brand">Luka</p>
          <h1>Compare runs</h1>
          <p className="lead">
            Per-node utilization deltas between a baseline and a later run on this design.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
            <Link className="btn" to={`/designs/${designId}`}>
              Back to editor
            </Link>
            <Link className="btn btn--ghost" to="/">
              Library
            </Link>
          </div>
        </header>

        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

        <div className="field-row" style={{ marginBottom: "1rem", maxWidth: 640 }}>
          <label className="field">
            <span>Baseline (left)</span>
            <select
              value={leftID}
              onChange={(event) => {
                searchParams.set("left", event.target.value);
                setSearchParams(searchParams);
              }}
            >
              <option value="">Select run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} · {formatWorkload(run.workload)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Latest (right)</span>
            <select
              value={rightID}
              onChange={(event) => {
                searchParams.set("right", event.target.value);
                setSearchParams(searchParams);
              }}
            >
              <option value="">Select run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} · {formatWorkload(run.workload)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {comparison ? (
          <>
            <div className="metric-strip" style={{ marginBottom: "1rem" }}>
              <div className="metric-strip__kicker">Summary</div>
              <strong>
                {comparison.baselineLabel} → {comparison.latestLabel}
              </strong>
              <p>{comparison.message}</p>
              <p>
                Util {formatSignedPercent(comparison.utilizationDelta)} · Latency{" "}
                {formatSignedNumber(comparison.latencyDelta)} ms · Drop{" "}
                {formatSignedNumber(comparison.droppedDelta)}
              </p>
            </div>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Baseline util</th>
                  <th>Latest util</th>
                  <th>Δ util</th>
                  <th>Δ latency</th>
                  <th>Δ dropped</th>
                  <th>Δ incoming</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.nodeId} data-hot={row.hot}>
                    <td>{row.label}</td>
                    <td className="mono">{Math.round(row.baselineUtil * 100)}%</td>
                    <td className="mono">{Math.round(row.latestUtil * 100)}%</td>
                    <td className="mono">{formatSignedPercent(row.utilDelta)}</td>
                    <td className="mono">{formatSignedNumber(row.latencyDelta)}</td>
                    <td className="mono">{formatSignedNumber(row.droppedDelta)}</td>
                    <td className="mono">{formatSignedNumber(row.incomingDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="hint">Select two runs to compare. Save and run the design first.</p>
        )}
      </div>
    </main>
  );
}
