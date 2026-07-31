import type { GraphEdge, RequestClass } from "../../../lib/api";
import {
  RPS_CHIPS,
  addCustomPath,
  allTrafficTemplate,
  formatRpsChip,
  pathCoverageWarnings,
  pathPercents,
  readWriteSplitTemplate,
  removePath,
  renamePath,
  setPathPercent,
  sumPercents,
} from "../lib/traffic-paths";

type LoadPanelProps = {
  requestsPerSecond: string;
  concurrentUsers: string;
  payloadKB: string;
  fanoutCount: string;
  requestClasses: RequestClass[];
  graphEdges: GraphEdge[];
  preflightIssueCount: number;
  onRequestsPerSecondChange: (value: string) => void;
  onConcurrentUsersChange: (value: string) => void;
  onPayloadKBChange: (value: string) => void;
  onFanoutCountChange: (value: string) => void;
  onRequestClassesChange: (next: RequestClass[], options?: { retagEdges?: boolean }) => void;
};

export function LoadPanel(props: LoadPanelProps) {
  const percents = pathPercents(props.requestClasses);
  const percentSum = sumPercents(props.requestClasses);
  const coverage = pathCoverageWarnings(props.requestClasses, props.graphEdges);
  const rpsNumber = Number(props.requestsPerSecond);
  const activeChip = RPS_CHIPS.find((chip) => chip === rpsNumber);

  return (
    <div className="dock-section">
      <h3>Load</h3>
      <p className="hint">
        Peak traffic assumptions for this design. Topology stays on the canvas.
      </p>

      <div className="load-ready">
        {props.preflightIssueCount === 0 ? (
          <span className="load-ready__ok">Ready to run</span>
        ) : (
          <span className="load-ready__warn">
            {props.preflightIssueCount} issue
            {props.preflightIssueCount === 1 ? "" : "s"} before run
          </span>
        )}
      </div>

      <section className="load-block">
        <h4 className="load-block__title">Peak traffic</h4>
        <label className="field">
          <span>Requests / sec</span>
          <input
            inputMode="decimal"
            value={props.requestsPerSecond}
            onChange={(event) => props.onRequestsPerSecondChange(event.target.value)}
          />
          <small>Main load entering the system — drives utilization.</small>
        </label>
        <div className="chip-row" role="group" aria-label="RPS presets">
          {RPS_CHIPS.map((chip) => (
            <button
              key={chip}
              className="preset-chip"
              type="button"
              data-active={activeChip === chip}
              onClick={() => props.onRequestsPerSecondChange(String(chip))}
            >
              {formatRpsChip(chip)}
            </button>
          ))}
        </div>
      </section>

      <section className="load-block">
        <h4 className="load-block__title">Traffic paths</h4>
        <p className="hint">
          Named slices of peak RPS (for example Read vs Write). Tag connections in the
          selection sheet so each path uses the right edges.
        </p>

        <div className="flow-list">
          {props.requestClasses.map((path) => (
            <div className="flow-item" key={path.id}>
              <label className="field">
                <span>Name</span>
                <input
                  value={path.name}
                  onChange={(event) =>
                    props.onRequestClassesChange(
                      renamePath(props.requestClasses, path.id, event.target.value),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>% of traffic</span>
                <input
                  inputMode="decimal"
                  value={String(percents.get(path.id) ?? 0)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) {
                      return;
                    }
                    props.onRequestClassesChange(
                      setPathPercent(props.requestClasses, path.id, next),
                    );
                  }}
                />
                <small>Affects how peak RPS is split across paths.</small>
              </label>
              {props.requestClasses.length > 1 ? (
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() =>
                    props.onRequestClassesChange(
                      removePath(props.requestClasses, path.id),
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {percentSum !== 100 ? (
          <p className="hint load-warn">
            Percents sum to {percentSum}% — they will be normalized to 100% on run.
          </p>
        ) : null}

        {coverage.map((warning) => (
          <p className="hint load-warn" key={warning.pathId}>
            {warning.message}
          </p>
        ))}

        <div className="field-row" style={{ marginTop: "0.5rem" }}>
          {props.requestClasses.length === 1 ? (
            <button
              className="btn"
              type="button"
              onClick={() =>
                props.onRequestClassesChange(readWriteSplitTemplate(), {
                  retagEdges: true,
                })
              }
            >
              Add read / write split
            </button>
          ) : (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() =>
                props.onRequestClassesChange(allTrafficTemplate(), { retagEdges: true })
              }
            >
              Reset to all traffic
            </button>
          )}
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() =>
              props.onRequestClassesChange(addCustomPath(props.requestClasses), {
                retagEdges: true,
              })
            }
          >
            Add path
          </button>
        </div>
      </section>

      <details className="advanced-block">
        <summary>Assumptions</summary>
        <div className="field-stack" style={{ marginTop: "0.65rem" }}>
          <label className="field">
            <span>Session pressure (soft)</span>
            <input
              inputMode="decimal"
              value={props.concurrentUsers}
              onChange={(event) => props.onConcurrentUsersChange(event.target.value)}
            />
            <small>
              Soft concurrency pressure on gateways and services — not a hard session
              limit.
            </small>
          </label>
          <label className="field">
            <span>Avg payload (KB)</span>
            <input
              inputMode="decimal"
              value={props.payloadKB}
              onChange={(event) => props.onPayloadKBChange(event.target.value)}
            />
            <small>Affects latency and capacity after ~4 KB.</small>
          </label>
          <label className="field">
            <span>Async fanout (global)</span>
            <input
              inputMode="decimal"
              value={props.fanoutCount}
              onChange={(event) => props.onFanoutCountChange(event.target.value)}
            />
            <small>
              Multiplies async enqueue edges only. Prefer per-connection fanout when
              editing an edge.
            </small>
          </label>
        </div>
      </details>
    </div>
  );
}
