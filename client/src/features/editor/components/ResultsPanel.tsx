import type { SimulationResult } from "../../../lib/api";

type ActiveResultView =
  | {
      paths?: Array<{ kind: string; summary: string }>;
    }
  | null
  | undefined;

type ResultsPanelProps = {
  result: SimulationResult | null;
  activeFlowResultID: string;
  activeResult: ActiveResultView;
  onActiveFlowChange: (id: string) => void;
};

export function ResultsPanel(props: ResultsPanelProps) {
  const { result } = props;

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
        </>
      ) : (
        <p className="hint">Run a simulation to see bottleneck and path insights.</p>
      )}
    </div>
  );
}
