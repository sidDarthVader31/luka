import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";

import type {
  ComponentArchetype,
  Design,
  GraphNode,
  Run,
} from "../lib/api";
import {
  createDesign,
  createRun,
  getDesign,
  getRun,
  getStatus,
  listComponentArchetypes,
  updateDesign,
} from "../lib/api";
import { SystemNode, type SystemNodeData } from "../components/system-node";
import {
  buildDraftDesign,
  buildEdge,
  cloneDesignIntoDraft,
  createBlankDraft,
  createNodeFromArchetype,
  getSupportedEdgeOptions,
} from "../lib/design-draft";
import { buildDemoDesign } from "../lib/demo-design";

const sampleDesignID = "sample-cache-aside";

const nodeTypes = {
  systemNode: SystemNode,
};

const nodePropertyLabels: Record<keyof GraphNode["properties"], string> = {
  replicas: "Replicas",
  capacity_rps: "Capacity RPS",
  base_latency_ms: "Base latency (ms)",
  cache_hit_rate: "Cache hit rate",
};

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [feedback, setFeedback] = useState(
    "Use this screen to shape a draft on the canvas, save it, and run it.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [requestsPerSecond, setRequestsPerSecond] = useState("100000");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [draftID, setDraftID] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Untitled Design");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftNodes, setDraftNodes] = useState<GraphNode[]>([]);
  const [draftEdges, setDraftEdges] = useState<Design["graph"]["edges"]>([]);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [newEdgeSourceID, setNewEdgeSourceID] = useState("");
  const [newEdgeTargetID, setNewEdgeTargetID] = useState("");
  const [newEdgeInteraction, setNewEdgeInteraction] = useState<
    "sync_request" | "conditional_branch"
  >("sync_request");
  const [newEdgeRule, setNewEdgeRule] = useState<
    "always" | "cache_hit" | "cache_miss"
  >("always");
  const [isDirty, setIsDirty] = useState(false);

  const selectedNode = useMemo(
    () => draftNodes.find((node) => node.id === selectedNodeID) ?? null,
    [draftNodes, selectedNodeID],
  );

  const supportedEdgeOptions = useMemo(
    () =>
      getSupportedEdgeOptions({
        sourceNodeID: newEdgeSourceID,
        nodes: draftNodes,
        archetypes: catalog,
      }),
    [catalog, draftNodes, newEdgeSourceID],
  );

  const flowNodes = useMemo<Node<SystemNodeData>[]>(
    () =>
      draftNodes.map((node) => ({
        id: node.id,
        type: "systemNode",
        position: node.position,
        selected: node.id === selectedNodeID,
        data: {
          label: node.label,
          archetype: node.archetype,
        },
      })),
    [draftNodes, selectedNodeID],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      draftEdges.map((edge) => ({
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        label:
          edge.routing_rule.rule_type === "always"
            ? edge.interaction_type
            : `${edge.interaction_type} / ${edge.routing_rule.rule_type}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      })),
    [draftEdges],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (
      supportedEdgeOptions.interactions.length > 0 &&
      !supportedEdgeOptions.interactions.includes(newEdgeInteraction)
    ) {
      setNewEdgeInteraction(supportedEdgeOptions.interactions[0]);
    }

    if (
      supportedEdgeOptions.routingRules.length > 0 &&
      !supportedEdgeOptions.routingRules.includes(newEdgeRule)
    ) {
      setNewEdgeRule(supportedEdgeOptions.routingRules[0]);
    }
  }, [newEdgeInteraction, newEdgeRule, supportedEdgeOptions]);

  async function bootstrap() {
    try {
      const [status, archetypes, design] = await Promise.all([
        getStatus(),
        listComponentArchetypes(),
        getDesign(sampleDesignID),
      ]);

      setApiStatus(`${status.name} ${status.version} (${status.api})`);
      setCatalog(archetypes);
      applyDesignToEditor(design);
      setFeedback("Backend connected. Sample design loaded.");
    } catch (error) {
      setApiStatus("Backend unavailable");
      setFeedback(readError(error));
    }
  }

  async function withAction<T>(
    label: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    setBusyAction(label);
    setFeedback(`${label}...`);

    try {
      return await action();
    } catch (error) {
      setFeedback(readError(error));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  function applyDesignToEditor(design: Design) {
    const draft = cloneDesignIntoDraft(design);

    setSavedDesign(design);
    setDraftID(draft.id);
    setDraftName(draft.name);
    setDraftDescription(draft.description);
    setDraftNodes(draft.nodes);
    setDraftEdges(draft.edges);
    setSelectedNodeID(draft.nodes[0]?.id ?? null);
    setNewEdgeSourceID(draft.nodes[0]?.id ?? "");
    setNewEdgeTargetID(draft.nodes[1]?.id ?? "");
    setIsDirty(false);
  }

  function resetToBlankDraft() {
    const blank = createBlankDraft();

    setSavedDesign(null);
    setDraftID(null);
    setDraftName(blank.name);
    setDraftDescription(blank.description);
    setDraftNodes(blank.nodes);
    setDraftEdges(blank.edges);
    setSelectedNodeID(null);
    setNewEdgeSourceID("");
    setNewEdgeTargetID("");
    setIsDirty(false);
    setFeedback("Started a blank canvas draft.");
  }

  function markDirty() {
    setIsDirty(true);
  }

  function currentDraftDesign() {
    return buildDraftDesign({
      id: draftID,
      name: draftName,
      description: draftDescription,
      nodes: draftNodes,
      edges: draftEdges,
    });
  }

  async function handleLoadSample() {
    const design = await withAction("Loading sample design", () =>
      getDesign(sampleDesignID),
    );
    if (!design) {
      return;
    }

    applyDesignToEditor(design);
    setFeedback(`Loaded design ${design.id}.`);
  }

  function handleUseDemoDraft() {
    const draft = buildDemoDesign("UI Demo Draft");

    setSavedDesign(null);
    setDraftID(null);
    setDraftName(draft.name);
    setDraftDescription(draft.description ?? "");
    setDraftNodes(draft.graph.nodes);
    setDraftEdges(draft.graph.edges);
    setSelectedNodeID(draft.graph.nodes[0]?.id ?? null);
    setNewEdgeSourceID(draft.graph.nodes[0]?.id ?? "");
    setNewEdgeTargetID(draft.graph.nodes[1]?.id ?? "");
    setIsDirty(true);
    setFeedback("Loaded a demo draft into the canvas.");
  }

  async function handleSaveDesign() {
    if (draftNodes.length === 0) {
      setFeedback("Add at least one node before saving the draft.");
      return;
    }

    const payload = {
      name: draftName.trim() || "Untitled Design",
      description: draftDescription.trim(),
      graph: {
        nodes: draftNodes,
        edges: draftEdges,
      },
    };

    const design = savedDesign
      ? await withAction("Updating saved design", () =>
          updateDesign(savedDesign.id, payload),
        )
      : await withAction("Creating saved design", () => createDesign(payload));

    if (!design) {
      return;
    }

    applyDesignToEditor(design);
    setFeedback(`Saved design ${design.id}.`);
  }

  async function handleCreateRun() {
    if (draftNodes.length === 0) {
      setFeedback("Add at least one node before starting a run.");
      return;
    }

    const rps = Number(requestsPerSecond);
    if (!Number.isFinite(rps) || rps <= 0) {
      setFeedback("Requests per second must be a positive number.");
      return;
    }

    const design = currentDraftDesign();
    const useInlineDraft = isDirty || !savedDesign;

    const run = await withAction("Creating run", () =>
      createRun(
        useInlineDraft
          ? {
              design,
              workload: {
                requests_per_second: rps,
              },
              simulation_config: {
                mode: "analytical",
              },
            }
          : {
              design_id: savedDesign.id,
              workload: {
                requests_per_second: rps,
              },
              simulation_config: {
                mode: "analytical",
              },
            },
      ),
    );
    if (!run) {
      return;
    }

    setLastRun(run);
    setFeedback(
      useInlineDraft
        ? `Created inline run ${run.id} from the current unsaved draft.`
        : `Created run ${run.id} from saved design ${savedDesign.id}.`,
    );
  }

  async function handleReloadLastRun() {
    if (!lastRun) {
      setFeedback("Create a run before reloading it.");
      return;
    }

    const run = await withAction("Reloading run", () => getRun(lastRun.id));
    if (!run) {
      return;
    }

    setLastRun(run);
    setFeedback(`Reloaded run ${run.id}.`);
  }

  function handleAddNode(archetype: ComponentArchetype) {
    const node = createNodeFromArchetype(archetype, draftNodes);

    setDraftNodes((current) => [...current, node]);
    setSelectedNodeID(node.id);
    if (!newEdgeSourceID) {
      setNewEdgeSourceID(node.id);
    } else if (!newEdgeTargetID) {
      setNewEdgeTargetID(node.id);
    }
    markDirty();
  }

  function handleRemoveNode(nodeID: string) {
    setDraftNodes((current) => current.filter((node) => node.id !== nodeID));
    setDraftEdges((current) =>
      current.filter(
        (edge) => edge.source_node_id !== nodeID && edge.target_node_id !== nodeID,
      ),
    );

    if (selectedNodeID === nodeID) {
      setSelectedNodeID(null);
    }
    if (newEdgeSourceID === nodeID) {
      setNewEdgeSourceID("");
    }
    if (newEdgeTargetID === nodeID) {
      setNewEdgeTargetID("");
    }

    markDirty();
  }

  function handleNodeLabelChange(nodeID: string, value: string) {
    setDraftNodes((current) =>
      current.map((node) => (node.id === nodeID ? { ...node, label: value } : node)),
    );
    markDirty();
  }

  function handleNodePropertyChange(
    nodeID: string,
    key: keyof GraphNode["properties"],
    value: string,
  ) {
    setDraftNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeID) {
          return node;
        }

        return {
          ...node,
          properties: {
            ...node.properties,
            [key]: value === "" ? undefined : Number(value),
          },
        };
      }),
    );
    markDirty();
  }

  function handleNodeDragStop(nodeID: string, position: { x: number; y: number }) {
    setDraftNodes((current) =>
      current.map((node) => (node.id === nodeID ? { ...node, position } : node)),
    );
    markDirty();
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    const defaults = getSupportedEdgeOptions({
      sourceNodeID: connection.source,
      nodes: draftNodes,
      archetypes: catalog,
    });

    const edge = buildEdge({
      sourceNodeID: connection.source,
      targetNodeID: connection.target,
      interactionType: defaults.interactions[0] ?? "sync_request",
      ruleType: defaults.routingRules[0] ?? "always",
      existingEdges: draftEdges,
    });

    setDraftEdges((current) => [...current, edge]);
    setNewEdgeSourceID(connection.source);
    setNewEdgeTargetID(connection.target);
    setNewEdgeInteraction(edge.interaction_type);
    setNewEdgeRule(edge.routing_rule.rule_type);
    markDirty();
    setFeedback(`Connected ${connection.source} -> ${connection.target}.`);
  }

  function handleNodesChange(changes: NodeChange<Node<SystemNodeData>>[]) {
    const hasStructuralChange = changes.some(
      (change) => change.type === "position" || change.type === "remove",
    );

    setDraftNodes((current) => {
      const nextFlowNodes = applyNodeChanges(
        changes,
        current.map((node) => ({
          id: node.id,
          type: "systemNode",
          position: node.position,
          selected: node.id === selectedNodeID,
          data: {
            label: node.label,
            archetype: node.archetype,
          },
        })),
      );

      const nextFlowByID = new Map(nextFlowNodes.map((node) => [node.id, node]));

      return current
        .filter((node) => nextFlowByID.has(node.id))
        .map((node) => {
          const flowNode = nextFlowByID.get(node.id);
          if (!flowNode) {
            return node;
          }

          return {
            ...node,
            position: flowNode.position,
          };
        });
    });

    const selectedChange = [...changes]
      .reverse()
      .find((change) => change.type === "select");
    if (selectedChange?.type === "select") {
      setSelectedNodeID(selectedChange.selected ? selectedChange.id : null);
    }

    const removedNodeIDs = new Set(
      changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );
    if (removedNodeIDs.size > 0) {
      setDraftEdges((current) =>
        current.filter(
          (edge) =>
            !removedNodeIDs.has(edge.source_node_id) &&
            !removedNodeIDs.has(edge.target_node_id),
        ),
      );
    }

    if (hasStructuralChange) {
      markDirty();
    }
  }

  function handleAddEdge() {
    if (!newEdgeSourceID || !newEdgeTargetID) {
      setFeedback("Select both a source and a target node before adding an edge.");
      return;
    }

    if (newEdgeSourceID === newEdgeTargetID) {
      setFeedback("An edge source and target must be different nodes.");
      return;
    }

    const edge = buildEdge({
      sourceNodeID: newEdgeSourceID,
      targetNodeID: newEdgeTargetID,
      interactionType: newEdgeInteraction,
      ruleType: newEdgeRule,
      existingEdges: draftEdges,
    });

    setDraftEdges((current) => [...current, edge]);
    markDirty();
  }

  function handleRemoveEdge(edgeID: string) {
    setDraftEdges((current) => current.filter((edge) => edge.id !== edgeID));
    markDirty();
  }

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    setSelectedNodeID(node.id);
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Luka</p>
          <h1>System design, but stress-tested.</h1>
          <p className="lede">
            This is the first canvas-based editor slice powered by React Flow.
            You can drag nodes, connect them on the canvas, save the design,
            and run simulations against either the saved design or the current
            unsaved draft.
          </p>
        </div>

        <aside className="hero-panel">
          <span className="panel-label">Backend status</span>
          <strong>{apiStatus}</strong>
          <p>{feedback}</p>
        </aside>
      </section>

      <section className="workspace-grid workspace-grid--top">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Editor Controls</p>
              <h2>Draft and persistence</h2>
            </div>
            {busyAction ? <span className="badge busy">{busyAction}</span> : null}
          </div>

          <div className="control-stack">
            <label className="field">
              <span>Design name</span>
              <input
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  markDirty();
                }}
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                rows={3}
                value={draftDescription}
                onChange={(event) => {
                  setDraftDescription(event.target.value);
                  markDirty();
                }}
              />
            </label>

            <label className="field">
              <span>Requests per second</span>
              <input
                inputMode="numeric"
                value={requestsPerSecond}
                onChange={(event) => setRequestsPerSecond(event.target.value)}
              />
            </label>

            <div className="button-row">
              <button onClick={resetToBlankDraft} disabled={busyAction !== null}>
                Start blank draft
              </button>
              <button onClick={handleLoadSample} disabled={busyAction !== null}>
                Load sample design
              </button>
              <button onClick={handleUseDemoDraft} disabled={busyAction !== null}>
                Use demo draft
              </button>
            </div>

            <div className="button-row">
              <button onClick={handleSaveDesign} disabled={busyAction !== null}>
                {savedDesign ? "Save changes" : "Create saved design"}
              </button>
              <button onClick={handleCreateRun} disabled={busyAction !== null}>
                Create run
              </button>
              <button
                onClick={handleReloadLastRun}
                disabled={busyAction !== null}
              >
                Reload last run
              </button>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Latest run</p>
              <h2>{lastRun?.id ?? "No run created"}</h2>
            </div>
            {lastRun ? <span className="badge">{lastRun.status}</span> : null}
          </div>

          {lastRun?.result ? (
            <div className="metric-stack">
              <p>{lastRun.result.summary}</p>

              {lastRun.result.bottleneck ? (
                <div className="result-callout">
                  <span className="panel-label">Bottleneck</span>
                  <strong>{lastRun.result.bottleneck.label}</strong>
                  <p>{lastRun.result.bottleneck.explanation}</p>
                </div>
              ) : null}

              <div className="metric-grid">
                {lastRun.result.nodes.map((node) => (
                  <div className="metric-card" key={node.node_id}>
                    <span>{node.label}</span>
                    <strong>{Math.round(node.utilization * 100)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-state">
              Create a run to inspect the bottleneck and node metrics.
            </p>
          )}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel--canvas">
          <div className="panel-header">
            <div>
              <p className="panel-label">Canvas</p>
              <h2>{draftName || "Untitled Design"}</h2>
            </div>
            {savedDesign ? (
              <span className="badge">{savedDesign.id}</span>
            ) : (
              <span className="badge busy">unsaved</span>
            )}
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>Nodes</span>
              <strong>{draftNodes.length}</strong>
            </div>
            <div className="metric-card">
              <span>Edges</span>
              <strong>{draftEdges.length}</strong>
            </div>
            <div className="metric-card">
              <span>State</span>
              <strong>{isDirty ? "Dirty" : "Synced"}</strong>
            </div>
          </div>

          <div className="canvas-shell">
            <ReactFlow
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onNodesChange={handleNodesChange}
              onNodeDrag={(_, node) => handleNodeDragStop(node.id, node.position)}
              onNodeDragStop={(_, node) =>
                handleNodeDragStop(node.id, node.position)
              }
              onConnect={handleConnect}
            >
              <Background gap={24} size={1} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Component catalog</p>
              <h2>Add nodes from backend archetypes</h2>
            </div>
          </div>

          <ul className="catalog-list">
            {catalog.map((item) => (
              <li className="catalog-item" key={item.archetype}>
                <div>
                  <strong>{item.display_name}</strong>
                  <p>{item.archetype}</p>
                </div>
                <div className="catalog-actions">
                  <small>{item.supported_routing_rules.join(", ")}</small>
                  <button onClick={() => handleAddNode(item)} type="button">
                    Add node
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Inspector</p>
              <h2>{selectedNode?.label ?? "Select a node"}</h2>
            </div>
          </div>

          {selectedNode ? (
            <div className="control-stack">
              <label className="field">
                <span>Node label</span>
                <input
                  value={selectedNode.label}
                  onChange={(event) =>
                    handleNodeLabelChange(selectedNode.id, event.target.value)
                  }
                />
              </label>

              <div className="property-grid">
                {Object.entries(nodePropertyLabels).map(([key, label]) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <input
                      inputMode="decimal"
                      value={
                        selectedNode.properties[key as keyof GraphNode["properties"]] ??
                        ""
                      }
                      onChange={(event) =>
                        handleNodePropertyChange(
                          selectedNode.id,
                          key as keyof GraphNode["properties"],
                          event.target.value,
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <button
                className="ghost-button"
                onClick={() => handleRemoveNode(selectedNode.id)}
                type="button"
              >
                Remove selected node
              </button>
            </div>
          ) : (
            <p className="empty-state">
              Select a node on the canvas to edit its label and properties.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Edges</p>
              <h2>Canvas connections and overrides</h2>
            </div>
          </div>

          <div className="control-stack">
            <div className="property-grid">
              <label className="field">
                <span>Source</span>
                <select
                  value={newEdgeSourceID}
                  onChange={(event) => setNewEdgeSourceID(event.target.value)}
                >
                  <option value="">Select source</option>
                  {draftNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Target</span>
                <select
                  value={newEdgeTargetID}
                  onChange={(event) => setNewEdgeTargetID(event.target.value)}
                >
                  <option value="">Select target</option>
                  {draftNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="property-grid">
              <label className="field">
                <span>Interaction type</span>
                <select
                  value={newEdgeInteraction}
                  onChange={(event) =>
                    setNewEdgeInteraction(
                      event.target.value as "sync_request" | "conditional_branch",
                    )
                  }
                >
                  {supportedEdgeOptions.interactions.map((interaction) => (
                    <option key={interaction} value={interaction}>
                      {interaction}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Routing rule</span>
                <select
                  value={newEdgeRule}
                  onChange={(event) =>
                    setNewEdgeRule(
                      event.target.value as "always" | "cache_hit" | "cache_miss",
                    )
                  }
                >
                  {supportedEdgeOptions.routingRules.map((rule) => (
                    <option key={rule} value={rule}>
                      {rule}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="button-row">
              <button onClick={handleAddEdge} type="button">
                Add edge manually
              </button>
            </div>

            {draftEdges.length === 0 ? (
              <p className="empty-state">
                No edges yet. Drag a connection between nodes on the canvas, or
                add one manually here.
              </p>
            ) : (
              <ul className="simple-list">
                {draftEdges.map((edge) => (
                  <li key={edge.id}>
                    <div className="edge-copy">
                      <strong>{edge.source_node_id}</strong>
                      <span>
                        {edge.interaction_type} / {edge.routing_rule.rule_type}
                      </span>
                      <small>{edge.target_node_id}</small>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => handleRemoveEdge(edge.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the Luka API.";
}
