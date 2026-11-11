import { IconAlertTriangle, IconX } from "@tabler/icons-react";

import { formatCompactNumber } from "../../lib/format";
import { type ResultView, formatPercent, loadLevel } from "./lib/result-view";
import "./ResultsPanel.css";

type ResultsPanelProps = {
  views: ResultView[];
  activeId: string;
  onActiveChange: (id: string) => void;
  stale: boolean;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
};

export function ResultsPanel(props: ResultsPanelProps) {
  const view = props.views.find((entry) => entry.id === props.activeId) ?? props.views[0];
  if (!view) {
    return null;
  }
  const nodes = [...view.nodes]
    .filter((node) => node.archetype !== "client")
    .sort((a, b) => b.utilization - a.utilization);

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
          <IconAlertTriangle size={14} aria-hidden /> The design changed since this run. Run again
          to update.
        </p>
      ) : null}

      {props.views.length > 1 ? (
        <div className="results__tabs" role="tablist">
          {props.views.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === view.id}
              onClick={() => props.onActiveChange(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}

      <p className="results__summary">{view.summary}</p>

      {view.bottleneck ? (
        <button
          type="button"
          className="results__bottleneck"
          data-level={loadLevel(view.bottleneck.utilization)}
          onClick={() => props.onSelectNode(view.bottleneck!.node_id)}
        >
          <span className="results__kicker">Bottleneck</span>
          <strong>
            {view.bottleneck.label} · {formatPercent(view.bottleneck.utilization)}
          </strong>
          <span>{view.bottleneck.explanation}</span>
        </button>
      ) : null}

      {view.paths.length > 0 ? (
        <section className="results__section">
          <h3>Paths</h3>
          {view.paths.map((path) => (
            <div key={`${path.kind}-${path.node_ids.join("-")}`} className="results__path">
              <span className="results__kicker">{path.kind.replaceAll("_", " ")}</span>
              <p>{path.summary}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="results__section">
        <h3>Components</h3>
        <ul className="results__nodes">
          {nodes.map((node) => (
            <li key={node.node_id}>
              <button
                type="button"
                onClick={() => props.onSelectNode(node.node_id)}
                title={node.explanation}
              >
                <span className="results__dot" data-level={loadLevel(node.utilization)} />
                <span className="results__name">{node.label}</span>
                <span className="results__num">{formatCompactNumber(node.incoming_rps)} req/s</span>
                <span className="results__num results__num--strong">
                  {formatPercent(node.utilization)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
