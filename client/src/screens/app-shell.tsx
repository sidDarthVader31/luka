import { useEffect, useMemo, useState, type DragEvent } from "react";
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
  type ReactFlowInstance,
} from "@xyflow/react";

import type {
  ComponentArchetype,
  Design,
  GraphNode,
  NodeArchetype,
  Run,
} from "../lib/api";
import {
  createDesign,
  createRun,
  getDesign,
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

const sampleDesignID = "sample-cache-aside";
const runStages = [
  "Sampling traffic envelopes",
  "Routing requests across the graph",
  "Measuring saturation and latency",
];

const nodeTypes = {
  systemNode: SystemNode,
};

const nodePropertyLabels: Record<keyof GraphNode["properties"], string> = {
  replicas: "Replicas",
  capacity_rps: "Capacity RPS",
  base_latency_ms: "Base latency (ms)",
  cache_hit_rate: "Cache hit rate",
};

const nodePropertyOrder: Array<keyof GraphNode["properties"]> = [
  "replicas",
  "capacity_rps",
  "base_latency_ms",
  "cache_hit_rate",
];

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [feedback, setFeedback] = useState(
    "Drag infrastructure primitives onto the board, wire them together, and run a pulse through the design.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [requestsPerSecond, setRequestsPerSecond] = useState("100000");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draftID, setDraftID] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Untitled Lab");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftNodes, setDraftNodes] = useState<GraphNode[]>([]);
  const [draftEdges, setDraftEdges] = useState<Design["graph"]["edges"]>([]);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [draggedArchetype, setDraggedArchetype] = useState<NodeArchetype | null>(
    null,
  );
  const [runStageIndex, setRunStageIndex] = useState(0);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<Node<SystemNodeData>, Edge> | null
  >(null);

  const isRunningSimulation = busyAction === "Running simulation";

  const selectedNode = useMemo(
    () => draftNodes.find((node) => node.id === selectedNodeID) ?? null,
    [draftNodes, selectedNodeID],
  );

  const selectedNodePropertyKeys = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const keys = new Set<keyof GraphNode["properties"]>();
    const archetype = catalog.find(
      (item) => item.archetype === selectedNode.archetype,
    );

    for (const key of Object.keys(archetype?.default_properties ?? {})) {
      keys.add(key as keyof GraphNode["properties"]);
    }

    for (const key of Object.keys(selectedNode.properties)) {
      keys.add(key as keyof GraphNode["properties"]);
    }

    return nodePropertyOrder.filter((key) => keys.has(key));
  }, [catalog, selectedNode]);

  const nodeMetricsByID = useMemo(
    () =>
      new Map((lastRun?.result?.nodes ?? []).map((node) => [node.node_id, node])),
    [lastRun],
  );

  const edgeMetricsByID = useMemo(
    () =>
      new Map((lastRun?.result?.edges ?? []).map((edge) => [edge.edge_id, edge])),
    [lastRun],
  );

  const flowNodes = useMemo<Node<SystemNodeData>[]>(
    () =>
      draftNodes.map((node) => {
        const metric = nodeMetricsByID.get(node.id);
        const isBottleneck = lastRun?.result?.bottleneck?.node_id === node.id;

        let status: SystemNodeData["status"] = "idle";
        if (isRunningSimulation) {
          status = "active";
        } else if (isBottleneck) {
          status = "bottleneck";
        } else if ((metric?.incoming_rps ?? 0) > 0) {
          status = "active";
        }

        return {
          id: node.id,
          type: "systemNode",
          position: node.position,
          selected: node.id === selectedNodeID,
          data: {
            label: node.label,
            archetype: node.archetype,
            status,
            utilizationLabel: metric
              ? `${formatPercent(metric.utilization)} util`
              : undefined,
            trafficLabel:
              metric && metric.incoming_rps > 0
                ? `${formatCompactNumber(metric.incoming_rps)} rps`
                : undefined,
          },
        };
      }),
    [draftNodes, isRunningSimulation, lastRun, nodeMetricsByID, selectedNodeID],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      draftEdges.map((edge) => {
        const metric = edgeMetricsByID.get(edge.id);
        const hitsBottleneck =
          edge.target_node_id === lastRun?.result?.bottleneck?.node_id;

        const stroke = hitsBottleneck
          ? "#ff6b57"
          : isRunningSimulation
            ? "#f4b061"
            : metric?.routed_rps
              ? "#7ba2ff"
              : "rgba(244, 239, 231, 0.28)";

        return {
          id: edge.id,
          source: edge.source_node_id,
          target: edge.target_node_id,
          label: metric?.routed_rps
            ? `${formatCompactNumber(metric.routed_rps)} rps`
            : edge.routing_rule.rule_type === "always"
              ? edge.interaction_type
              : `${edge.interaction_type} • ${edge.routing_rule.rule_type}`,
          animated: isRunningSimulation || Boolean(metric?.routed_rps),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
          },
          style: {
            stroke,
            strokeWidth: metric?.routed_rps
              ? Math.min(5, 2 + metric.routed_rps / 25000)
              : 2,
          },
          labelStyle: {
            fill: "#f4efe7",
            fontSize: 12,
            fontWeight: 700,
          },
          labelBgStyle: {
            fill: "rgba(12, 13, 16, 0.82)",
            opacity: 0.92,
          },
        };
      }),
    [draftEdges, edgeMetricsByID, isRunningSimulation, lastRun],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isRunningSimulation) {
      setRunStageIndex(0);
      return;
    }

    const intervalID = window.setInterval(() => {
      setRunStageIndex((current) => (current + 1) % runStages.length);
    }, 550);

    return () => window.clearInterval(intervalID);
  }, [isRunningSimulation]);

  async function bootstrap() {
    try {
      const [status, archetypes, design] = await Promise.all([
        getStatus(),
        listComponentArchetypes(),
        getDesign(sampleDesignID),
      ]);

      setApiStatus(`${status.name} ${status.version}`);
      setCatalog(archetypes);
      applyDesignToEditor(design);
      setFeedback(
        "Sample design loaded. Drag a primitive from the shelf to start reshaping it.",
      );
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
    setLastRun(null);
    setIsDirty(false);
  }

  function handleStartNewLab() {
    const blank = createBlankDraft();

    setSavedDesign(null);
    setDraftID(null);
    setDraftName(blank.name);
    setDraftDescription(blank.description);
    setDraftNodes(blank.nodes);
    setDraftEdges(blank.edges);
    setSelectedNodeID(null);
    setLastRun(null);
    setIsDirty(false);
    setFeedback("Fresh lab ready. Drag your first component into the canvas.");
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
    setFeedback("Sample design loaded onto the canvas.");
  }

  async function handleSaveDesign() {
    if (draftNodes.length === 0) {
      setFeedback("Drop at least one component into the canvas before saving.");
      return;
    }

    const payload = {
      name: draftName.trim() || "Untitled Lab",
      description: draftDescription.trim(),
      graph: {
        nodes: draftNodes,
        edges: draftEdges,
      },
    };

    const design = savedDesign
      ? await withAction("Saving design", () =>
          updateDesign(savedDesign.id, payload),
        )
      : await withAction("Saving design", () => createDesign(payload));

    if (!design) {
      return;
    }

    applyDesignToEditor(design);
    setFeedback(`Saved design ${design.id}.`);
  }

  async function handleCreateRun() {
    if (draftNodes.length === 0) {
      setFeedback("Drop a few components into the canvas before running a pulse.");
      return;
    }

    const rps = Number(requestsPerSecond);
    if (!Number.isFinite(rps) || rps <= 0) {
      setFeedback("Requests per second must be a positive number.");
      return;
    }

    const design = currentDraftDesign();
    const useInlineDraft = isDirty || !savedDesign;

    const run = await withAction("Running simulation", async () => {
      const [createdRun] = await Promise.all([
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
        delay(1600),
      ]);

      return createdRun;
    });

    if (!run) {
      return;
    }

    setLastRun(run);
    if (run.result?.bottleneck?.node_id) {
      setSelectedNodeID(run.result.bottleneck.node_id);
    }
    setFeedback(
      run.result?.summary ??
        (useInlineDraft
          ? `Created inline run ${run.id}.`
          : `Created run ${run.id} from saved design ${savedDesign?.id}.`),
    );
  }

  function addNodeToDraft(
    archetype: ComponentArchetype,
    position?: { x: number; y: number },
  ) {
    let createdNode: GraphNode | null = null;

    setDraftNodes((current) => {
      createdNode = createNodeFromArchetype(archetype, current, position);
      return createdNode ? [...current, createdNode] : current;
    });

    if (!createdNode) {
      return;
    }

    setSelectedNodeID(createdNode.id);
    markDirty();
    setFeedback(`Dropped ${createdNode.label} into the lab.`);
  }

  function handleArchetypeDragStart(archetype: ComponentArchetype) {
    return (event: DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        "application/luka-archetype",
        archetype.archetype,
      );
      event.dataTransfer.effectAllowed = "move";
      setDraggedArchetype(archetype.archetype);
    };
  }

  function handleArchetypeDragEnd() {
    setDraggedArchetype(null);
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const archetypeKey =
      event.dataTransfer.getData("application/luka-archetype") || draggedArchetype;
    if (!archetypeKey) {
      return;
    }

    const archetype = catalog.find((item) => item.archetype === archetypeKey);
    if (!archetype) {
      setDraggedArchetype(null);
      return;
    }

    const position = flowInstance
      ? flowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
      : undefined;

    addNodeToDraft(archetype, position);
    setDraggedArchetype(null);
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
            status: "idle",
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

    const selectedChange = [...changes]
      .reverse()
      .find((change) => change.type === "select");
    if (selectedChange?.type === "select") {
      setSelectedNodeID(selectedChange.selected ? selectedChange.id : null);
    }

    if (hasStructuralChange) {
      markDirty();
    }
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
    markDirty();
    setFeedback(`Connected ${connection.source} to ${connection.target}.`);
  }

  function handleRemoveEdge(edgeID: string) {
    setDraftEdges((current) => current.filter((edge) => edge.id !== edgeID));
    markDirty();
  }

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    setSelectedNodeID(node.id);
  };

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <div className="studio-mark">L</div>
          <div>
            <p className="studio-kicker">Luka Studio</p>
            <h1>{draftName || "Untitled Lab"}</h1>
            <p>{feedback}</p>
          </div>
        </div>

        <div className="studio-actions">
          <button
            className="ghost-button"
            onClick={handleStartNewLab}
            type="button"
          >
            Start New Lab
          </button>
          <button
            className="ghost-button"
            onClick={handleLoadSample}
            type="button"
          >
            Load Sample
          </button>
          <button
            onClick={handleSaveDesign}
            type="button"
            disabled={busyAction !== null || draftNodes.length === 0}
          >
            Save Design
          </button>
          <button
            className="run-button"
            onClick={handleCreateRun}
            type="button"
            disabled={busyAction !== null || draftNodes.length === 0}
          >
            Run Pulse
          </button>
        </div>
      </header>

      <section className="studio-meta">
        <span className="status-pill">{apiStatus}</span>
        <span className={`status-pill${isDirty ? " status-pill--warn" : ""}`}>
          {isDirty ? "Unsaved changes" : "Synced"}
        </span>
        <span className="status-pill">
          {draftNodes.length} nodes / {draftEdges.length} edges
        </span>
        <span className="status-pill">
          {savedDesign ? savedDesign.id : "No saved design yet"}
        </span>
        <span className="status-pill">
          {lastRun ? `Last run ${lastRun.id}` : "No simulation run yet"}
        </span>
      </section>

      <section className="studio-workspace">
        <aside className="studio-sidebar studio-sidebar--left">
          <section className="sidebar-card">
            <div className="section-copy">
              <p className="section-kicker">Component Shelf</p>
              <h2>Drag primitives into the canvas</h2>
              <p>
                Each card comes from the backend archetype catalog, so what you
                drop is exactly what the simulator understands.
              </p>
            </div>

            <div className="shelf-grid">
              {catalog.map((item) => (
                <button
                  key={item.archetype}
                  className={`shelf-card${
                    draggedArchetype === item.archetype ? " is-dragging" : ""
                  }`}
                  draggable
                  onDragStart={handleArchetypeDragStart(item)}
                  onDragEnd={handleArchetypeDragEnd}
                  onClick={() => addNodeToDraft(item)}
                  type="button"
                >
                  <span className="shelf-card__eyebrow">{item.archetype}</span>
                  <strong>{item.display_name}</strong>
                  <small>
                    {item.supported_routing_rules.join(", ")} routing
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-card">
            <div className="section-copy">
              <p className="section-kicker">Design Brief</p>
              <h2>Give the lab a point of view</h2>
            </div>

            <label className="field">
              <span>Name</span>
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
                rows={5}
                value={draftDescription}
                onChange={(event) => {
                  setDraftDescription(event.target.value);
                  markDirty();
                }}
              />
            </label>
          </section>
        </aside>

        <section className="canvas-column">
          <div className="canvas-card">
            <div className="canvas-card__header">
              <div className="section-copy">
                <p className="section-kicker">Canvas</p>
                <h2>Build the request path visually</h2>
                <p>
                  Drag from the shelf, connect components directly, and click a
                  node to tune its capacity assumptions.
                </p>
              </div>

              {busyAction ? (
                <span className="status-pill status-pill--busy">{busyAction}</span>
              ) : null}
            </div>

            <div
              className={`canvas-board${
                draggedArchetype ? " canvas-board--armed" : ""
              }`}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            >
              <ReactFlow
                fitView
                fitViewOptions={{ padding: 0.2 }}
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onInit={setFlowInstance}
                onNodeClick={handleNodeClick}
                onNodesChange={handleNodesChange}
                onConnect={handleConnect}
                onPaneClick={() => setSelectedNodeID(null)}
              >
                <Background gap={24} size={1} />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>

              {draftNodes.length === 0 ? (
                <div className="canvas-empty">
                  <strong>Drop your first component here</strong>
                  <p>
                    Start with a client or service, then fan the flow outward
                    into cache, database, and supporting layers.
                  </p>
                </div>
              ) : null}

              {isRunningSimulation ? (
                <div className="run-overlay">
                  <div className="run-overlay__pulse" />
                  <div className="run-overlay__content">
                    <span className="section-kicker">Simulation pulse</span>
                    <strong>{runStages[runStageIndex]}</strong>
                    <div className="run-overlay__stages">
                      {runStages.map((stage, index) => (
                        <span
                          key={stage}
                          className={
                            index === runStageIndex ? "is-current" : undefined
                          }
                        >
                          {index + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="canvas-card__footer">
              <div className="metric-card metric-card--wide">
                <span>Run posture</span>
                <strong>
                  {lastRun?.result?.bottleneck
                    ? `${lastRun.result.bottleneck.label} is the current bottleneck`
                    : "No bottleneck measured yet"}
                </strong>
              </div>
              <div className="metric-card">
                <span>Traffic</span>
                <strong>{formatCompactNumber(Number(requestsPerSecond))} rps</strong>
              </div>
              <div className="metric-card">
                <span>Saved state</span>
                <strong>{savedDesign ? "Persisted" : "Draft only"}</strong>
              </div>
            </div>
          </div>
        </section>

        <aside className="studio-sidebar studio-sidebar--right">
          <section className="sidebar-card">
            <div className="section-copy">
              <p className="section-kicker">Simulation</p>
              <h2>Run controls</h2>
            </div>

            <label className="field">
              <span>Requests per second</span>
              <input
                inputMode="numeric"
                value={requestsPerSecond}
                onChange={(event) => setRequestsPerSecond(event.target.value)}
              />
            </label>

            <div className="action-row">
              <button
                className="run-button"
                onClick={handleCreateRun}
                type="button"
                disabled={busyAction !== null || draftNodes.length === 0}
              >
                Run Pulse
              </button>
              <button
                className="ghost-button"
                onClick={handleSaveDesign}
                type="button"
                disabled={busyAction !== null || draftNodes.length === 0}
              >
                Save
              </button>
            </div>

            {lastRun?.result ? (
              <div className="result-callout">
                <span className="section-kicker">Latest signal</span>
                <strong>{lastRun.result.summary}</strong>
                {lastRun.result.bottleneck ? (
                  <p>{lastRun.result.bottleneck.explanation}</p>
                ) : null}
              </div>
            ) : (
              <p className="empty-copy">
                Run the current design to animate the graph and surface the first
                bottleneck.
              </p>
            )}
          </section>

          <section className="sidebar-card">
            <div className="section-copy">
              <p className="section-kicker">Inspector</p>
              <h2>{selectedNode?.label ?? "Select a node"}</h2>
            </div>

            {selectedNode ? (
              <div className="inspector-stack">
                <label className="field">
                  <span>Node label</span>
                  <input
                    value={selectedNode.label}
                    onChange={(event) =>
                      handleNodeLabelChange(selectedNode.id, event.target.value)
                    }
                  />
                </label>

                <div className="coordinate-chip">
                  <span>x {Math.round(selectedNode.position.x)}</span>
                  <span>y {Math.round(selectedNode.position.y)}</span>
                </div>

                {selectedNodePropertyKeys.length > 0 ? (
                  <div className="property-grid">
                    {selectedNodePropertyKeys.map((key) => (
                      <label className="field" key={key}>
                        <span>{nodePropertyLabels[key]}</span>
                        <input
                          inputMode="decimal"
                          value={selectedNode.properties[key] ?? ""}
                          onChange={(event) =>
                            handleNodePropertyChange(
                              selectedNode.id,
                              key,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">
                    This node does not expose editable numeric properties yet.
                  </p>
                )}

                <button
                  className="ghost-button ghost-button--danger"
                  onClick={() => handleRemoveNode(selectedNode.id)}
                  type="button"
                >
                  Remove node
                </button>
              </div>
            ) : (
              <p className="empty-copy">
                Click a node on the canvas to edit its label and simulation
                properties.
              </p>
            )}
          </section>

          <section className="sidebar-card">
            <div className="section-copy">
              <p className="section-kicker">Connections</p>
              <h2>{draftEdges.length ? "Canvas links" : "No links yet"}</h2>
            </div>

            {draftEdges.length === 0 ? (
              <p className="empty-copy">
                Drag from one node handle to another to create a path.
              </p>
            ) : (
              <ul className="edge-list">
                {draftEdges.map((edge) => (
                  <li className="edge-list__item" key={edge.id}>
                    <div>
                      <strong>
                        {edge.source_node_id} → {edge.target_node_id}
                      </strong>
                      <small>
                        {edge.interaction_type} / {edge.routing_rule.rule_type}
                      </small>
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
          </section>
        </aside>
      </section>
    </main>
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the Luka API.";
}
