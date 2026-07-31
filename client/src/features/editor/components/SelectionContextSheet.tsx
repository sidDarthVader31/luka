import type {
  EdgeInteractionType,
  GraphNode,
  RequestClass,
  RoutingRuleType,
} from "../../../lib/api";
import {
  applyPreset,
  matchPreset,
  PROPERTY_LABELS,
  supportsCapacityPresets,
  type CapacitySize,
} from "../lib/capacity-presets";
import type { FlowEdgeData } from "../lib/flow-mappers";
import type { SystemNodeData } from "../nodes/SystemNode";
import type { Edge, Node } from "@xyflow/react";

type SelectionContextSheetProps = {
  selectedNode: Node<SystemNodeData> | null;
  selectedEdge: Edge<FlowEdgeData> | null;
  requestClasses: RequestClass[];
  edgeOptions: {
    interactions: EdgeInteractionType[];
    routingRules: RoutingRuleType[];
  };
  onDone: () => void;
  onUpdateNode: (
    patch: Partial<Pick<GraphNode, "label" | "color">> & {
      properties?: GraphNode["properties"];
    },
  ) => void;
  onUpdateEdge: (patch: Partial<FlowEdgeData>) => void;
  onRemoveNode: () => void;
  onRemoveEdge: () => void;
};

export function SelectionContextSheet(props: SelectionContextSheetProps) {
  const { selectedNode, selectedEdge } = props;

  if (selectedNode) {
    return (
      <div className="dock-section">
        <div className="context-sheet__header">
          <div>
            <h3>{selectedNode.data.label}</h3>
            <p className="hint">
              {selectedNode.data.archetype.replaceAll("_", " ")}
            </p>
          </div>
          <button className="btn btn--ghost" type="button" onClick={props.onDone}>
            Done
          </button>
        </div>

        <div className="field-stack">
          <label className="field">
            <span>Label</span>
            <input
              value={selectedNode.data.label}
              onChange={(event) => props.onUpdateNode({ label: event.target.value })}
            />
          </label>

          {supportsCapacityPresets(selectedNode.data.archetype) ? (
            <div className="field">
              <span>Capacity size</span>
              <div className="preset-row">
                {(["small", "medium", "large", "custom"] as CapacitySize[]).map((size) => (
                  <button
                    key={size}
                    className="preset-chip"
                    type="button"
                    data-active={
                      matchPreset(
                        selectedNode.data.archetype,
                        selectedNode.data.properties,
                      ) === size
                    }
                    disabled={size === "custom"}
                    onClick={() => {
                      if (size === "custom") {
                        return;
                      }
                      const preset = applyPreset(selectedNode.data.archetype, size);
                      if (!preset) {
                        return;
                      }
                      props.onUpdateNode({
                        properties: {
                          ...selectedNode.data.properties,
                          ...preset,
                        },
                      });
                    }}
                  >
                    {size === "custom" ? "Custom" : size[0]!.toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
              <small>
                Sets instances and work capacity. Custom appears when you edit advanced
                numbers.
              </small>
            </div>
          ) : null}

          {selectedNode.data.archetype === "cache" ? (
            <label className="field">
              <span>{PROPERTY_LABELS.cache_hit_rate.label}</span>
              <input
                inputMode="decimal"
                value={String(selectedNode.data.properties.cache_hit_rate ?? 0.8)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  props.onUpdateNode({
                    properties: {
                      ...selectedNode.data.properties,
                      cache_hit_rate: Number.isFinite(next)
                        ? next
                        : selectedNode.data.properties.cache_hit_rate,
                    },
                  });
                }}
              />
              <small>{PROPERTY_LABELS.cache_hit_rate.help}</small>
            </label>
          ) : null}

          {selectedNode.data.archetype !== "client" ? (
            <details className="advanced-block">
              <summary>Advanced capacity</summary>
              <div className="field-stack" style={{ marginTop: "0.65rem" }}>
                {(["replicas", "capacity_rps", "base_latency_ms"] as const).map((key) => {
                  if (selectedNode.data.properties[key] === undefined) {
                    return null;
                  }
                  const meta = PROPERTY_LABELS[key];
                  return (
                    <label className="field" key={key}>
                      <span>{meta.label}</span>
                      <input
                        inputMode="decimal"
                        value={String(selectedNode.data.properties[key] ?? "")}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          props.onUpdateNode({
                            properties: {
                              ...selectedNode.data.properties,
                              [key]: Number.isFinite(next)
                                ? next
                                : selectedNode.data.properties[key],
                            },
                          });
                        }}
                      />
                      <small>{meta.help}</small>
                    </label>
                  );
                })}
              </div>
            </details>
          ) : (
            <p className="hint">
              Client emits traffic from Load — no capacity size on this node.
            </p>
          )}
        </div>

        <button className="btn btn--danger" type="button" onClick={props.onRemoveNode}>
          Remove node
        </button>
      </div>
    );
  }

  if (selectedEdge) {
    return (
      <div className="dock-section">
        <div className="context-sheet__header">
          <div>
            <h3>Connection</h3>
            <p className="hint">
              {selectedEdge.source} → {selectedEdge.target}
            </p>
          </div>
          <button className="btn btn--ghost" type="button" onClick={props.onDone}>
            Done
          </button>
        </div>

        <div className="field-stack">
          <label className="field">
            <span>Interaction</span>
            <select
              value={selectedEdge.data?.interactionType}
              onChange={(event) =>
                props.onUpdateEdge({
                  interactionType: event.target.value as EdgeInteractionType,
                })
              }
            >
              {props.edgeOptions.interactions.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <small>How traffic moves across this connection.</small>
          </label>

          <label className="field">
            <span>Routing rule</span>
            <select
              value={selectedEdge.data?.ruleType}
              onChange={(event) =>
                props.onUpdateEdge({
                  ruleType: event.target.value as RoutingRuleType,
                })
              }
            >
              {props.edgeOptions.routingRules.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Traffic paths</span>
            <div className="flow-list">
              {props.requestClasses.map((path) => (
                <label className="flow-item" key={path.id}>
                  <input
                    type="checkbox"
                    checked={
                      selectedEdge.data?.requestClassIDs?.includes(path.id) ?? false
                    }
                    onChange={() => {
                      const current = selectedEdge.data?.requestClassIDs ?? [];
                      const next = current.includes(path.id)
                        ? current.filter((id) => id !== path.id)
                        : [...current, path.id];
                      props.onUpdateEdge({
                        requestClassIDs:
                          next.length > 0
                            ? next
                            : props.requestClasses[0]
                              ? [props.requestClasses[0].id]
                              : [],
                      });
                    }}
                  />
                  {path.name}
                </label>
              ))}
            </div>
            <small>Which load paths use this connection.</small>
          </label>

          <details className="advanced-block">
            <summary>Advanced (weight, fanout, timeout)</summary>
            <div className="field-stack" style={{ marginTop: "0.65rem" }}>
              <div className="field-row">
                <label className="field">
                  <span>Weight</span>
                  <input
                    value={String(selectedEdge.data?.routingWeight ?? 1)}
                    onChange={(event) =>
                      props.onUpdateEdge({
                        routingWeight: Number(event.target.value) || 1,
                      })
                    }
                  />
                  <small>Affects split when multiple edges leave a node.</small>
                </label>
                <label className="field">
                  <span>Fanout</span>
                  <input
                    value={String(selectedEdge.data?.fanoutMultiplier ?? 1)}
                    onChange={(event) =>
                      props.onUpdateEdge({
                        fanoutMultiplier: Number(event.target.value) || 1,
                      })
                    }
                  />
                  <small>Affects utilization on this connection.</small>
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Timeout ms</span>
                  <input
                    value={String(selectedEdge.data?.timeoutMS ?? 0)}
                    onChange={(event) =>
                      props.onUpdateEdge({
                        timeoutMS: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <small>Display-only estimate — does not change utilization.</small>
                </label>
                <label className="field">
                  <span>Retries</span>
                  <input
                    value={String(selectedEdge.data?.retryAttempts ?? 0)}
                    onChange={(event) =>
                      props.onUpdateEdge({
                        retryAttempts: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <small>Display-only — does not change utilization.</small>
                </label>
              </div>
            </div>
          </details>
        </div>

        <button className="btn btn--danger" type="button" onClick={props.onRemoveEdge}>
          Remove edge
        </button>
      </div>
    );
  }

  return null;
}
