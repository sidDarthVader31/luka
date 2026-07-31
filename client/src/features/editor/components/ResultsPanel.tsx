import type { Design, DesignVersion, Run } from "../../../lib/api";
import {
  formatSignedNumber,
  formatSignedPercent,
  formatWorkload,
  type RunComparison,
} from "../lib/run-comparison";

type ActiveResultView = {
  paths?: Array<{ kind: string; summary: string }>;
} | null | undefined;

type ResultsPanelProps = {
  lastRun: Run | null;
  activeFlowResultID: string;
  activeResult: ActiveResultView;
  runComparison: RunComparison | null;
  savedDesign: Design | null;
  designRuns: Run[];
  designVersions: DesignVersion[];
  onActiveFlowChange: (id: string) => void;
  onExportJSON: () => void;
  onExportMarkdown: () => void;
  onSetBaseline: () => void;
};

export function ResultsPanel(props: ResultsPanelProps) {
  const result = props.lastRun?.result;

  return (
    <div className="dock-section">
      <h3>Results</h3>

      {result ? (
        <>
          <div className="metric-strip">
            <div className="metric-strip__kicker">Bottleneck</div>
            <strong>
              {result.bottleneck?.label ?? "None"} ·{" "}
              {Math.round((result.bottleneck?.utilization ?? 0) * 100)}%
            </strong>
            <p>{result.summary}</p>
          </div>

          {(result.flows?.length ?? 0) > 0 ? (
            <div className="field-row">
              <button
                className="btn btn--tool"
                type="button"
                data-active={props.activeFlowResultID === "overall"}
                onClick={() => props.onActiveFlowChange("overall")}
              >
                Overall
              </button>
              {result.flows?.map((flow) => (
                <button
                  key={flow.request_class_id}
                  className="btn btn--tool"
                  type="button"
                  data-active={props.activeFlowResultID === flow.request_class_id}
                  onClick={() => props.onActiveFlowChange(flow.request_class_id)}
                >
                  {flow.name}
                </button>
              ))}
            </div>
          ) : null}

          {props.activeResult?.paths?.map((path) => (
            <div className="metric-strip" key={path.kind}>
              <div className="metric-strip__kicker">{path.kind}</div>
              <p>{path.summary}</p>
            </div>
          ))}

          <div className="field-row">
            <button className="btn" type="button" onClick={props.onExportJSON}>
              Export JSON
            </button>
            <button className="btn" type="button" onClick={props.onExportMarkdown}>
              Export MD
            </button>
          </div>

          <details className="advanced-block">
            <summary>Compare this run</summary>
            <div style={{ marginTop: "0.65rem" }}>
              <button className="btn" type="button" onClick={props.onSetBaseline}>
                Set as baseline
              </button>
              {props.runComparison ? (
                <>
                  <p className="hint">{props.runComparison.message}</p>
                  <p className="hint">
                    Util {formatSignedPercent(props.runComparison.utilizationDelta)} ·
                    Latency {formatSignedNumber(props.runComparison.latencyDelta)} ms ·
                    Drop {formatSignedNumber(props.runComparison.droppedDelta)}
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table className="compare-table">
                      <thead>
                        <tr>
                          <th>Node</th>
                          <th>Util</th>
                          <th>Δ util</th>
                          <th>Δ lat</th>
                          <th>Δ drop</th>
                        </tr>
                      </thead>
                      <tbody>
                        {props.runComparison.rows.map((row) => (
                          <tr key={row.nodeId} data-hot={row.hot}>
                            <td>{row.label}</td>
                            <td className="mono">{Math.round(row.latestUtil * 100)}%</td>
                            <td className="mono">
                              {formatSignedPercent(row.utilDelta)}
                            </td>
                            <td className="mono">
                              {formatSignedNumber(row.latencyDelta)}
                            </td>
                            <td className="mono">
                              {formatSignedNumber(row.droppedDelta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="hint">
                  Set a baseline, run again, then compare utilization shifts.
                </p>
              )}
            </div>
          </details>
        </>
      ) : (
        <p className="hint">Run a simulation to see bottleneck and path insights.</p>
      )}

      <h3>Saved runs</h3>
      <div className="coming-soon-wrap">
        <div className="coming-soon-wrap__overlay" aria-hidden="true">
          <span className="coming-soon-chip">Coming soon</span>
        </div>
        <div className="coming-soon-wrap__content" aria-disabled="true">
          {props.savedDesign ? (
            <div className="history-list">
              {props.designRuns.map((run) => (
                <div className="history-card" key={run.id}>
                  <strong>{run.result?.bottleneck?.label ?? run.id}</strong>
                  <small>{formatWorkload(run.workload)}</small>
                  <div className="history-card__actions">
                    <button className="btn btn--ghost" type="button" tabIndex={-1}>
                      View
                    </button>
                    <button className="btn btn--ghost" type="button" tabIndex={-1}>
                      Compare
                    </button>
                  </div>
                </div>
              ))}
              {props.designRuns.length === 0 ? (
                <p className="hint">No persisted runs yet.</p>
              ) : null}
              <p className="hint">{props.designVersions.length} saved versions</p>
            </div>
          ) : (
            <p className="hint">Save the design to unlock run history.</p>
          )}
          {props.savedDesign ? (
            <span className="btn" style={{ display: "inline-flex", marginTop: "0.5rem" }}>
              Open compare page
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
