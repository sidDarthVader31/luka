import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Background,
  Controls,
  Position,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";

import type { ComponentArchetype, Design, GraphNode, Run } from "../lib/api";
import {
  createDesign,
  createRun,
  getDesign,
  getStatus,
  listComponentArchetypes,
  updateDesign,
} from "../lib/api";
import {
  buildDraftDesign,
  buildEdge,
  cloneDesignIntoDraft,
  createBlankDraft,
  createNodeFromArchetype,
  getSupportedEdgeOptions,
} from "../lib/design-draft";

const sampleDesignID = "sample-cache-aside";

const colorOptions: GraphNode["color"][] = ["blue", "green", "yellow", "red"];
const nodePropertyLabels: Record<keyof GraphNode["properties"], string> = {
  replicas: "Replicas",
  capacity_rps: "Capacity / sec",
  base_latency_ms: "Latency (ms)",
  cache_hit_rate: "Cache hit rate",
};

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [feedback, setFeedback] = useState(
    "Start with a blank board, drag colored components into place, then connect only what you want to simulate.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draftID, setDraftID] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Fresh Canvas");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftNodes, setDraftNodes] = useState<GraphNode[]>([]);
  const [draftEdges, setDraftEdges] = useState<Design["graph"]["edges"]>([]);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [requestsPerSecond, setRequestsPerSecond] = useState("100000");
  const [draggedArchetype, setDraggedArchetype] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<Node, Edge> | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);

  const selectedNode = useMemo(
    () => draftNodes.find((node) => node.id === selectedNodeID) ?? null,
    [draftNodes, selectedNodeID],
  );

  const resultNodesByID = useMemo(
    () =>
      new Map((lastRun?.result?.nodes ?? []).map((node) => [node.node_id, node])),
    [lastRun],
  );

  const flowNodes = useMemo<Node[]>(
    () =>
      draftNodes.map((node) => {
        const nodeResult = resultNodesByID.get(node.id);
        const palette = getNodePalette(node.color);

        return {
          id: node.id,
          position: node.position,
          data: {
            label: (
              <div className="flow-node-copy">
                <div className="flow-node-copy__eyebrow">
                  <span>{node.label}</span>
                  <span>{node.archetype}</span>
                </div>
                <strong>{node.color}</strong>
                {nodeResult ? (
                  <div className="flow-node-copy__meta">
                    <span>{Math.round(nodeResult.utilization * 100)}% util</span>
                    <span>{formatCompactNumber(nodeResult.incoming_rps)} rps</span>
                  </div>
                ) : null}
              </div>
            ),
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            width: 220,
            borderRadius: 18,
            border: `2px solid ${palette.border}`,
            background: palette.background,
            color: palette.text,
            boxShadow:
              lastRun?.result?.bottleneck?.node_id === node.id
                ? "0 0 0 3px rgba(216, 77, 58, 0.18), 0 10px 24px rgba(71, 93, 124, 0.14)"
                : "0 10px 24px rgba(71, 93, 124, 0.12)",
            padding: 0,
          },
          selected: node.id === selectedNodeID,
        };
      }),
    [draftNodes, lastRun, resultNodesByID, selectedNodeID],
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
            : edge.routing_rule.rule_type,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#4f6ef7",
        },
        style: {
          stroke: "#4f6ef7",
          strokeWidth: 2.5,
        },
        labelStyle: {
          fill: "#364152",
          fontSize: 12,
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: "rgba(255,255,255,0.96)",
        },
      })),
    [draftEdges],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      const [status, archetypes] = await Promise.all([
        getStatus(),
        listComponentArchetypes(),
      ]);

      setApiStatus(`${status.name} ${status.version}`);
      setCatalog(archetypes);

      const blank = createBlankDraft();
      setDraftName(blank.name);
      setDraftDescription(blank.description);
      setDraftNodes(blank.nodes);
      setDraftEdges(blank.edges);
      setFeedback(
        "Blank canvas ready. Drag a component from the left shelf into the board.",
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

  function currentDraftDesign() {
    return buildDraftDesign({
      id: draftID,
      name: draftName,
      description: draftDescription,
      nodes: draftNodes,
      edges: draftEdges,
    });
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

  function handleStartBlankCanvas() {
    const blank = createBlankDraft();
    setSavedDesign(null);
    setDraftID(null);
    setDraftName("Fresh Canvas");
    setDraftDescription(blank.description);
    setDraftNodes(blank.nodes);
    setDraftEdges(blank.edges);
    setSelectedNodeID(null);
    setLastRun(null);
    setIsDirty(false);
    setFeedback("Blank canvas ready.");
  }

  async function handleLoadSample() {
    const design = await withAction("Loading sample", () => getDesign(sampleDesignID));
    if (!design) {
      return;
    }

    applyDesignToEditor(design);
    setFeedback("Loaded sample design.");
  }

  async function handleSaveDesign() {
    if (draftNodes.length === 0) {
      setFeedback("Add at least one component before saving.");
      return;
    }

    const payload = {
      name: draftName.trim() || "Fresh Canvas",
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
    setFeedback(`Saved ${design.id}.`);
  }

  async function handleRunSimulation() {
    if (draftNodes.length === 0) {
      setFeedback("Add components before running the simulation.");
      return;
    }

    const rps = Number(requestsPerSecond);
    if (!Number.isFinite(rps) || rps <= 0) {
      setFeedback("Requests per second must be a positive number.");
      return;
    }

    const design = currentDraftDesign();
    const run = await withAction("Running simulation", () =>
      createRun(
        isDirty || !savedDesign
          ? {
              design,
              workload: { requests_per_second: rps },
              simulation_config: { mode: "analytical" },
            }
          : {
              design_id: savedDesign.id,
              workload: { requests_per_second: rps },
              simulation_config: { mode: "analytical" },
            },
      ),
    );

    if (!run) {
      return;
    }

    setLastRun(run);
    setFeedback(run.result?.summary ?? `Completed run ${run.id}.`);
    if (run.result?.bottleneck?.node_id) {
      setSelectedNodeID(run.result.bottleneck.node_id);
    }
  }

  function markDirty() {
    setIsDirty(true);
  }

  function addNode(archetype: ComponentArchetype, position?: { x: number; y: number }) {
    const createdNode = createNodeFromArchetype(archetype, draftNodes, position);

    setDraftNodes((current) => [...current, createdNode]);
    setSelectedNodeID(createdNode.id);
    setLastRun(null);
    markDirty();

    window.requestAnimationFrame(() => {
      flowInstance?.setCenter(createdNode.position.x + 80, createdNode.position.y + 40, {
        zoom: 1,
        duration: 180,
      });
    });
  }

  function handleArchetypeDragStart(archetype: ComponentArchetype) {
    return (event: DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        "application/luka-archetype",
        archetype.archetype,
      );
      event.dataTransfer.effectAllowed = "copy";
      setDraggedArchetype(archetype.archetype);
    };
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const archetypeKey =
      event.dataTransfer.getData("application/luka-archetype") || draggedArchetype;
    const archetype = catalog.find((item) => item.archetype === archetypeKey);
    if (!archetype) {
      setDraggedArchetype(null);
      return;
    }

    const position = flowInstance?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    addNode(archetype, position);
    setDraggedArchetype(null);
    setFeedback(`Added ${archetype.display_name}.`);
  }

  function handleNodesChange(changes: NodeChange<Node>[]) {
    setDraftNodes((current) => {
      const nextFlowNodes = applyNodeChanges(
        changes,
        current.map((node) => ({
          id: node.id,
          position: node.position,
          data: {
            label: node.label,
          },
          selected: node.id === selectedNodeID,
        })),
      );

      const nextFlowByID = new Map(nextFlowNodes.map((node) => [node.id, node]));

      return current
        .filter((node) => nextFlowByID.has(node.id))
        .map((node) => ({
          ...node,
          position: nextFlowByID.get(node.id)?.position ?? node.position,
        }));
    });

    const removedNodeIDs = changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id);

    if (removedNodeIDs.length > 0) {
      const removedIDs = new Set(removedNodeIDs);
      setDraftEdges((current) =>
        current.filter(
          (edge) =>
            !removedIDs.has(edge.source_node_id) &&
            !removedIDs.has(edge.target_node_id),
        ),
      );
      setLastRun(null);
      markDirty();
    }

    const selectedChange = [...changes]
      .reverse()
      .find((change) => change.type === "select");
    if (selectedChange?.type === "select") {
      setSelectedNodeID(selectedChange.selected ? selectedChange.id : null);
    }

    if (changes.some((change) => change.type === "position")) {
      setLastRun(null);
      markDirty();
    }
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    const edge = buildEdge({
      sourceNodeID: connection.source,
      targetNodeID: connection.target,
      ...getDefaultEdgeBehavior(connection.source),
      existingEdges: draftEdges,
    });

    setDraftEdges((current) => [...current, edge]);
    setLastRun(null);
    markDirty();
    setFeedback(`Connected ${connection.source} to ${connection.target}.`);
  }

  function getDefaultEdgeBehavior(sourceNodeID: string) {
    const options = getSupportedEdgeOptions({
      sourceNodeID,
      nodes: draftNodes,
      archetypes: catalog,
    });

    return {
      interactionType: options.interactions[0] ?? "sync_request",
      ruleType: options.routingRules[0] ?? "always",
    };
  }

  function handleNodeClick(_: unknown, node: Node) {
    setSelectedNodeID(node.id);
  }

  function handleColorChange(nodeID: string, color: GraphNode["color"]) {
    setDraftNodes((current) =>
      current.map((node) => (node.id === nodeID ? { ...node, color } : node)),
    );
    setLastRun(null);
    markDirty();
  }

  function handleNodeLabelChange(nodeID: string, value: string) {
    setDraftNodes((current) =>
      current.map((node) => (node.id === nodeID ? { ...node, label: value } : node)),
    );
    setLastRun(null);
    markDirty();
  }

  function handleNodePropertyChange(
    nodeID: string,
    key: keyof GraphNode["properties"],
    value: string,
  ) {
    setDraftNodes((current) =>
      current.map((node) =>
        node.id === nodeID
          ? {
              ...node,
              properties: {
                ...node.properties,
                [key]: value === "" ? undefined : Number(value),
              },
            }
          : node,
      ),
    );
    setLastRun(null);
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
    setLastRun(null);
    markDirty();
  }

  function handleRemoveEdge(edgeID: string) {
    setDraftEdges((current) => current.filter((edge) => edge.id !== edgeID));
    setLastRun(null);
    markDirty();
  }

  return (
    <main className="studio-shell studio-shell--light">
      <header className="topbar">
        <div>
          <p className="brand-kicker">Luka</p>
          <h1>System Design Canvas</h1>
          <p className="brand-copy">{feedback}</p>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={handleStartBlankCanvas} type="button">
            New Canvas
          </button>
          <button className="ghost-button" onClick={handleLoadSample} type="button">
            Load Sample
          </button>
          <button onClick={handleSaveDesign} type="button" disabled={busyAction !== null}>
            Save Design
          </button>
          <button
            className="run-button"
            onClick={handleRunSimulation}
            type="button"
            disabled={busyAction !== null}
          >
            Run Simulation
          </button>
        </div>
      </header>

      <section className="info-strip">
        <span>{apiStatus}</span>
        <span>{savedDesign ? savedDesign.id : "Unsaved design"}</span>
        <span>{isDirty ? "Unsaved changes" : "All changes synced"}</span>
        <span>
          {draftNodes.length} nodes / {draftEdges.length} edges
        </span>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="panel">
            <p className="panel-kicker">Components</p>
            <h2>Drag onto canvas</h2>
            <div className="catalog-grid">
              {catalog.map((item) => (
                <button
                  key={item.archetype}
                  className={`catalog-card catalog-card--${defaultColorForArchetype(item.archetype)}`}
                  draggable
                  onDragStart={handleArchetypeDragStart(item)}
                  onDragEnd={() => setDraggedArchetype(null)}
                  onClick={() => addNode(item)}
                  type="button"
                >
                  <strong>{item.display_name}</strong>
                  <small>{item.archetype}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <p className="panel-kicker">Design</p>
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
            <label className="field">
              <span>Requests / sec</span>
              <input
                inputMode="numeric"
                value={requestsPerSecond}
                onChange={(event) => setRequestsPerSecond(event.target.value)}
              />
            </label>
          </div>
        </aside>

        <section className="board-panel">
          <div
            className={`canvas-shell${draggedArchetype ? " canvas-shell--ready" : ""}`}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
          >
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onInit={setFlowInstance}
              onNodesChange={handleNodesChange}
              onConnect={handleConnect}
              onPaneClick={() => setSelectedNodeID(null)}
              onNodeClick={handleNodeClick as NodeMouseHandler}
            >
              <Background gap={24} size={1} color="#d8e0ef" />
              <Controls />
            </ReactFlow>

            {draftNodes.length === 0 ? (
              <div className="canvas-empty">
                <strong>Drop components here</strong>
                <p>
                  The board starts empty on purpose, so you only see connections you
                  actually create.
                </p>
              </div>
            ) : null}
          </div>

          {lastRun?.result ? (
            <div className="run-summary">
              <strong>{lastRun.result.summary}</strong>
              {lastRun.result.bottleneck ? (
                <p>{lastRun.result.bottleneck.explanation}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="sidebar">
          <div className="panel">
            <p className="panel-kicker">Inspector</p>
            <h2>{selectedNode?.label ?? "Select a node"}</h2>
            {selectedNode ? (
              <div className="inspector">
                <label className="field">
                  <span>Label</span>
                  <input
                    value={selectedNode.label}
                    onChange={(event) =>
                      handleNodeLabelChange(selectedNode.id, event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Color</span>
                  <select
                    value={selectedNode.color}
                    onChange={(event) =>
                      handleColorChange(
                        selectedNode.id,
                        event.target.value as GraphNode["color"],
                      )
                    }
                  >
                    {colorOptions.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>

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
                Click a node to edit its label, color, and capacity assumptions.
              </p>
            )}
          </div>

          <div className="panel">
            <p className="panel-kicker">Connections</p>
            <h2>{draftEdges.length ? "Current edges" : "No edges yet"}</h2>
            {draftEdges.length === 0 ? (
              <p className="empty-copy">
                Draw from one node handle to another to create a connection.
              </p>
            ) : (
              <ul className="edge-list">
                {draftEdges.map((edge) => (
                  <li key={edge.id}>
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
          </div>
        </aside>
      </section>
    </main>
  );
}

function defaultColorForArchetype(archetype: ComponentArchetype["archetype"]) {
  switch (archetype) {
    case "client":
      return "blue";
    case "stateless_service":
      return "green";
    case "cache":
      return "yellow";
    case "database":
      return "red";
    default:
      return "blue";
  }
}

function getNodePalette(color: GraphNode["color"]) {
  switch (color) {
    case "blue":
      return {
        background: "#dfe9ff",
        border: "#7fa4ff",
        text: "#13284b",
      };
    case "green":
      return {
        background: "#ddf6e7",
        border: "#71c98c",
        text: "#153724",
      };
    case "yellow":
      return {
        background: "#fff2bf",
        border: "#e1ba33",
        text: "#5b4303",
      };
    case "red":
      return {
        background: "#ffdeda",
        border: "#f28d80",
        text: "#5e1e16",
      };
    default:
      return {
        background: "#dfe9ff",
        border: "#7fa4ff",
        text: "#13284b",
      };
  }
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

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the Luka API.";
}
