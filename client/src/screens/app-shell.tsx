import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";

import type {
  ComponentArchetype,
  Design,
  EdgeInteractionType,
  GraphEdge,
  GraphNode,
  RoutingRuleType,
  Run,
  RunNodeResult,
  Workload,
} from "../lib/api";
import {
  createDesign,
  createRun,
  duplicateDesign,
  getDesign,
  getStatus,
  listRunsForDesign,
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

type FlowNodeData = {
  label: string;
  archetype: GraphNode["archetype"];
  color: GraphNode["color"];
  properties: GraphNode["properties"];
};

type FlowEdgeData = {
  interactionType: EdgeInteractionType;
  ruleType: RoutingRuleType;
};

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [feedback, setFeedback] = useState(
    "Start with a blank board, drag colored components into place, then connect only what you want to simulate.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [designRuns, setDesignRuns] = useState<Run[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [baselineRun, setBaselineRun] = useState<Run | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draftID, setDraftID] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Fresh Canvas");
  const [draftDescription, setDraftDescription] = useState("");
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [requestsPerSecond, setRequestsPerSecond] = useState("100000");
  const [concurrentUsers, setConcurrentUsers] = useState("250000");
  const [readWriteRatio, setReadWriteRatio] = useState("4");
  const [payloadKB, setPayloadKB] = useState("8");
  const [fanoutCount, setFanoutCount] = useState("1");
  const [draggedArchetype, setDraggedArchetype] = useState<string | null>(null);
  const [newEdgeSourceID, setNewEdgeSourceID] = useState("");
  const [newEdgeTargetID, setNewEdgeTargetID] = useState("");
  const [newEdgeInteraction, setNewEdgeInteraction] =
    useState<EdgeInteractionType>("sync_request");
  const [newEdgeRule, setNewEdgeRule] = useState<RoutingRuleType>("always");
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<Node<FlowNodeData>, Edge<FlowEdgeData>> | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);

  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState<
    Node<FlowNodeData>
  >([]);
  const [canvasEdges, setCanvasEdges, onCanvasEdgesChange] = useEdgesState<
    Edge<FlowEdgeData>
  >([]);

  const selectedNode = useMemo(
    () => canvasNodes.find((node) => node.id === selectedNodeID) ?? null,
    [canvasNodes, selectedNodeID],
  );

  const resultNodesByID = useMemo(
    () =>
      new Map((lastRun?.result?.nodes ?? []).map((node) => [node.node_id, node])),
    [lastRun],
  );

  const runComparison = useMemo(
    () =>
      baselineRun && lastRun && baselineRun.id !== lastRun.id
        ? buildRunComparison(baselineRun, lastRun)
        : null,
    [baselineRun, lastRun],
  );

  const edgeOptions = useMemo(
    () =>
      getSupportedEdgeOptions({
        sourceNodeID: newEdgeSourceID,
        nodes: canvasNodes.map(flowNodeToGraphNode),
        archetypes: catalog,
      }),
    [canvasNodes, catalog, newEdgeSourceID],
  );

  const displayNodes = useMemo(
    () =>
      canvasNodes.map((node) => {
        const result = resultNodesByID.get(node.id);
        const palette = getNodePalette(node.data.color);

        return {
          ...node,
          data: {
            ...node.data,
            label: buildNodeLabel(node.data, result),
          },
          sourcePosition: "right",
          targetPosition: "left",
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
    [canvasNodes, lastRun, resultNodesByID, selectedNodeID],
  );

  const displayEdges = useMemo(
    () =>
      canvasEdges.map((edge) => ({
        ...edge,
        label:
          edge.data?.ruleType && edge.data.ruleType !== "always"
            ? edge.data.ruleType
            : edge.data?.interactionType ?? "sync_request",
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
    [canvasEdges],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (
      edgeOptions.interactions.length > 0 &&
      !edgeOptions.interactions.includes(newEdgeInteraction)
    ) {
      setNewEdgeInteraction(edgeOptions.interactions[0]);
    }

    if (
      edgeOptions.routingRules.length > 0 &&
      !edgeOptions.routingRules.includes(newEdgeRule)
    ) {
      setNewEdgeRule(edgeOptions.routingRules[0]);
    }
  }, [edgeOptions, newEdgeInteraction, newEdgeRule]);

  useEffect(() => {
    if (!savedDesign?.id) {
      setDesignRuns([]);
      return;
    }

    void loadRunHistory(savedDesign.id);
  }, [savedDesign?.id]);

  async function bootstrap() {
    try {
      const [status, archetypes] = await Promise.all([
        getStatus(),
        listComponentArchetypes(),
      ]);

      setApiStatus(`${status.name} ${status.version}`);
      setCatalog(archetypes);
      resetToBlankCanvas();
      setFeedback(
        "Blank canvas ready. Drag a component from the left shelf into the board.",
      );
    } catch (error) {
      setApiStatus("Backend unavailable");
      setFeedback(readError(error));
    }
  }

  async function loadRunHistory(designID: string) {
    try {
      const runs = await listRunsForDesign(designID);
      setDesignRuns(runs);
    } catch (error) {
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

  function resetToBlankCanvas() {
    const blank = createBlankDraft();

    setSavedDesign(null);
    setDraftID(null);
    setDraftName("Fresh Canvas");
    setDraftDescription(blank.description);
    setCanvasNodes([]);
    setCanvasEdges([]);
    setDesignRuns([]);
    setSelectedNodeID(null);
    setNewEdgeSourceID("");
    setNewEdgeTargetID("");
    setLastRun(null);
    setBaselineRun(null);
    setIsDirty(false);
  }

  function applyDesignToEditor(
    design: Design,
    options?: { preserveBaseline?: boolean },
  ) {
    const draft = cloneDesignIntoDraft(design);

    setSavedDesign(design);
    setDraftID(draft.id);
    setDraftName(draft.name);
    setDraftDescription(draft.description);
    setCanvasNodes(draft.nodes.map(graphNodeToFlowNode));
    setCanvasEdges(draft.edges.map(graphEdgeToFlowEdge));
    setSelectedNodeID(draft.nodes[0]?.id ?? null);
    setNewEdgeSourceID(draft.nodes[0]?.id ?? "");
    setNewEdgeTargetID(draft.nodes[1]?.id ?? "");
    setLastRun(null);
    if (!options?.preserveBaseline) {
      setBaselineRun(null);
    }
    setIsDirty(false);
  }

  function currentDraftDesign() {
    return buildDraftDesign({
      id: draftID,
      name: draftName,
      description: draftDescription,
      nodes: canvasNodes.map(flowNodeToGraphNode),
      edges: canvasEdges.map(flowEdgeToGraphEdge),
    });
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
    if (canvasNodes.length === 0) {
      setFeedback("Add at least one component before saving.");
      return;
    }

    const payload = {
      name: draftName.trim() || "Fresh Canvas",
      description: draftDescription.trim(),
      graph: {
        nodes: canvasNodes.map(flowNodeToGraphNode),
        edges: canvasEdges.map(flowEdgeToGraphEdge),
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

    applyDesignToEditor(design, { preserveBaseline: true });
    setFeedback(`Saved ${design.id}.`);
  }

  async function handleDuplicateDesign() {
    if (canvasNodes.length === 0) {
      setFeedback("Add components before creating a variant.");
      return;
    }

    const name = `${draftName.trim() || "Fresh Canvas"} Variant`;
    const payload = {
      name,
      description: draftDescription.trim(),
      graph: {
        nodes: canvasNodes.map(flowNodeToGraphNode),
        edges: canvasEdges.map(flowEdgeToGraphEdge),
      },
    };

    const design =
      savedDesign && !isDirty
        ? await withAction("Duplicating design", () =>
            duplicateDesign(savedDesign.id, {
              name,
              description: draftDescription.trim(),
            }),
          )
        : await withAction("Creating design variant", () => createDesign(payload));

    if (!design) {
      return;
    }

    applyDesignToEditor(design, { preserveBaseline: true });
    setFeedback(`Opened variant ${design.id}.`);
  }

  async function handleRunSimulation() {
    if (canvasNodes.length === 0) {
      setFeedback("Add components before running the simulation.");
      return;
    }

    const workload = buildWorkloadFromInputs({
      requestsPerSecond,
      concurrentUsers,
      readWriteRatio,
      payloadKB,
      fanoutCount,
    });
    if (!workload.ok) {
      setFeedback(workload.error);
      return;
    }

    const design = currentDraftDesign();
    const run = await withAction("Running simulation", () =>
      createRun(
        isDirty || !savedDesign
          ? {
              design,
              workload: workload.value,
              simulation_config: { mode: "analytical" },
            }
          : {
              design_id: savedDesign.id,
              workload: workload.value,
              simulation_config: { mode: "analytical" },
            },
      ),
    );

    if (!run) {
      return;
    }

    setLastRun(run);
    if (savedDesign?.id && run.design_id === savedDesign.id) {
      void loadRunHistory(run.design_id);
    }
    setFeedback(run.result?.summary ?? `Completed run ${run.id}.`);
    if (run.result?.bottleneck?.node_id) {
      setSelectedNodeID(run.result.bottleneck.node_id);
    }
  }

  function markDirty() {
    setIsDirty(true);
  }

  function addNode(archetype: ComponentArchetype) {
    const graphNode = createNodeFromArchetype(
      archetype,
      canvasNodes.map(flowNodeToGraphNode),
      getVisibleDropPosition(flowInstance, canvasShellRef.current, canvasNodes.length),
    );
    const flowNode = graphNodeToFlowNode(graphNode);

    setCanvasNodes((current) => [...current, flowNode]);
    setSelectedNodeID(flowNode.id);
    if (!newEdgeSourceID) {
      setNewEdgeSourceID(flowNode.id);
    } else if (!newEdgeTargetID) {
      setNewEdgeTargetID(flowNode.id);
    }
    setLastRun(null);
    markDirty();
    setFeedback(`Added ${archetype.display_name}.`);
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

    addNode(archetype);
    setDraggedArchetype(null);
  }

  function handleNodesChange(changes: NodeChange<Node<FlowNodeData>>[]) {
    onCanvasNodesChange(changes);

    const selectedChange = [...changes]
      .reverse()
      .find((change) => change.type === "select");
    if (selectedChange?.type === "select") {
      setSelectedNodeID(selectedChange.selected ? selectedChange.id : null);
    }

    if (changes.some((change) => change.type === "remove")) {
      const removedIDs = new Set(
        changes
          .filter((change) => change.type === "remove")
          .map((change) => change.id),
      );
      setCanvasEdges((current) =>
        current.filter(
          (edge) => !removedIDs.has(edge.source) && !removedIDs.has(edge.target),
        ),
      );
      setLastRun(null);
      markDirty();
    }

    if (changes.some((change) => change.type === "position")) {
      setLastRun(null);
      markDirty();
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge<FlowEdgeData>>[]) {
    onCanvasEdgesChange(changes);
    if (changes.length > 0) {
      setLastRun(null);
      markDirty();
    }
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    const options = getSupportedEdgeOptions({
      sourceNodeID: connection.source,
      nodes: canvasNodes.map(flowNodeToGraphNode),
      archetypes: catalog,
    });
    const graphEdge = buildEdge({
      sourceNodeID: connection.source,
      targetNodeID: connection.target,
      interactionType: options.interactions[0] ?? "sync_request",
      ruleType: options.routingRules[0] ?? "always",
      existingEdges: canvasEdges.map(flowEdgeToGraphEdge),
    });

    setCanvasEdges((current) =>
      addEdge(graphEdgeToFlowEdge(graphEdge), current),
    );
    setLastRun(null);
    markDirty();
    setFeedback(`Connected ${connection.source} to ${connection.target}.`);
  }

  function handleCreateEdge() {
    if (!newEdgeSourceID || !newEdgeTargetID) {
      setFeedback("Choose both a source and a target node to create an arrow.");
      return;
    }

    if (newEdgeSourceID === newEdgeTargetID) {
      setFeedback("Source and target must be different nodes.");
      return;
    }

    const graphEdge = buildEdge({
      sourceNodeID: newEdgeSourceID,
      targetNodeID: newEdgeTargetID,
      interactionType: newEdgeInteraction,
      ruleType: newEdgeRule,
      existingEdges: canvasEdges.map(flowEdgeToGraphEdge),
    });

    setCanvasEdges((current) => [...current, graphEdgeToFlowEdge(graphEdge)]);
    setLastRun(null);
    markDirty();
    setFeedback(`Created arrow ${newEdgeSourceID} → ${newEdgeTargetID}.`);
  }

  const handleNodeClick: NodeMouseHandler<Node<FlowNodeData>> = (_, node) => {
    setSelectedNodeID(node.id);
  };

  function handleColorChange(nodeID: string, color: GraphNode["color"]) {
    setCanvasNodes((current) =>
      current.map((node) =>
        node.id === nodeID
          ? {
              ...node,
              data: {
                ...node.data,
                color,
              },
            }
          : node,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleNodeLabelChange(nodeID: string, value: string) {
    setCanvasNodes((current) =>
      current.map((node) =>
        node.id === nodeID
          ? {
              ...node,
              data: {
                ...node.data,
                label: value,
              },
            }
          : node,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleNodePropertyChange(
    nodeID: string,
    key: keyof GraphNode["properties"],
    value: string,
  ) {
    setCanvasNodes((current) =>
      current.map((node) =>
        node.id === nodeID
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  [key]: value === "" ? undefined : Number(value),
                },
              },
            }
          : node,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleRemoveNode(nodeID: string) {
    setCanvasNodes((current) => current.filter((node) => node.id !== nodeID));
    setCanvasEdges((current) =>
      current.filter((edge) => edge.source !== nodeID && edge.target !== nodeID),
    );
    if (selectedNodeID === nodeID) {
      setSelectedNodeID(null);
    }
    setLastRun(null);
    markDirty();
  }

  function handleRemoveEdge(edgeID: string) {
    setCanvasEdges((current) => current.filter((edge) => edge.id !== edgeID));
    setLastRun(null);
    markDirty();
  }

  function handleSetBaseline() {
    if (!lastRun) {
      setFeedback("Run a simulation first, then pin it as the baseline.");
      return;
    }

    setBaselineRun(lastRun);
    setFeedback(`Pinned ${lastRun.id} as the baseline scenario.`);
  }

  function handleUseHistoryRun(run: Run) {
    setBaselineRun(run);
    setFeedback(`Using ${run.id} as the comparison baseline.`);
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
          <button className="ghost-button" onClick={resetToBlankCanvas} type="button">
            New Canvas
          </button>
          <button className="ghost-button" onClick={handleLoadSample} type="button">
            Load Sample
          </button>
          <button
            className="ghost-button"
            onClick={handleDuplicateDesign}
            type="button"
            disabled={busyAction !== null}
          >
            Create Variant
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
          {canvasNodes.length} nodes / {canvasEdges.length} edges
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
            <p className="panel-kicker">Scenario</p>
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
            <div className="field-grid">
              <label className="field">
                <span>Requests / sec</span>
                <input
                  inputMode="numeric"
                  value={requestsPerSecond}
                  onChange={(event) => setRequestsPerSecond(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Concurrent users</span>
                <input
                  inputMode="numeric"
                  value={concurrentUsers}
                  onChange={(event) => setConcurrentUsers(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Read:write ratio</span>
                <input
                  inputMode="decimal"
                  value={readWriteRatio}
                  onChange={(event) => setReadWriteRatio(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Payload (KB)</span>
                <input
                  inputMode="decimal"
                  value={payloadKB}
                  onChange={(event) => setPayloadKB(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Fanout count</span>
                <input
                  inputMode="numeric"
                  value={fanoutCount}
                  onChange={(event) => setFanoutCount(event.target.value)}
                />
              </label>
            </div>
          </div>
        </aside>

        <section className="board-panel">
          <div
            ref={canvasShellRef}
            className={`canvas-shell${draggedArchetype ? " canvas-shell--ready" : ""}`}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
          >
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              onInit={setFlowInstance}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onPaneClick={() => setSelectedNodeID(null)}
              onNodeClick={handleNodeClick}
            >
              <Background gap={24} size={1} color="#d8e0ef" />
              <Controls />
            </ReactFlow>

            {canvasNodes.length === 0 ? (
              <div className="canvas-empty">
                <strong>Drop components here</strong>
                <p>
                  New nodes are placed in the visible center of the board so they
                  never disappear off-screen.
                </p>
              </div>
            ) : null}
          </div>

          {lastRun?.result ? (
            <>
              <div className="run-summary">
                <div className="run-summary__header">
                  <div>
                    <p className="panel-kicker">Latest run</p>
                    <strong>{lastRun.result.summary}</strong>
                  </div>
                  <div className="run-summary__actions">
                    <button
                      className="ghost-button"
                      onClick={handleSetBaseline}
                      type="button"
                    >
                      Pin Baseline
                    </button>
                    {baselineRun ? (
                      <button
                        className="ghost-button"
                        onClick={() => setBaselineRun(null)}
                        type="button"
                      >
                        Clear Baseline
                      </button>
                    ) : null}
                  </div>
                </div>
                <p>{formatWorkload(lastRun.workload)}</p>
                {lastRun.result.bottleneck ? (
                  <p>{lastRun.result.bottleneck.explanation}</p>
                ) : null}
              </div>

              {baselineRun ? (
                <div className="run-summary run-summary--baseline">
                  <p className="panel-kicker">Baseline</p>
                  <strong>
                    {baselineRun.result?.summary ?? `Pinned ${baselineRun.id}`}
                  </strong>
                  <p>{formatWorkload(baselineRun.workload)}</p>
                </div>
              ) : null}

              {runComparison ? (
                <div className="run-summary run-summary--comparison">
                  <p className="panel-kicker">Comparison</p>
                  <div className="comparison-grid">
                    <div className="comparison-card">
                      <span>Bottleneck</span>
                      <strong>
                        {runComparison.baselineLabel} {"->"}{" "}
                        {runComparison.latestLabel}
                      </strong>
                    </div>
                    <div className="comparison-card">
                      <span>Utilization delta</span>
                      <strong>
                        {formatSignedPercent(runComparison.utilizationDelta)}
                      </strong>
                    </div>
                    <div className="comparison-card">
                      <span>Latency delta</span>
                      <strong>{formatSignedNumber(runComparison.latencyDelta)} ms</strong>
                    </div>
                    <div className="comparison-card">
                      <span>Drop delta</span>
                      <strong>{formatSignedNumber(runComparison.droppedDelta)} rps</strong>
                    </div>
                  </div>
                  <p>{runComparison.message}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <aside className="sidebar">
          <div className="panel">
            <p className="panel-kicker">Inspector</p>
            <h2>{selectedNode?.data.label ?? "Select a node"}</h2>
            {selectedNode ? (
              <div className="inspector">
                <label className="field">
                  <span>Label</span>
                  <input
                    value={selectedNode.data.label}
                    onChange={(event) =>
                      handleNodeLabelChange(selectedNode.id, event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Color</span>
                  <select
                    value={selectedNode.data.color}
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
                        selectedNode.data.properties[
                          key as keyof GraphNode["properties"]
                        ] ?? ""
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
            <p className="panel-kicker">Run History</p>
            <h2>{savedDesign ? "Persisted runs" : "Save to unlock history"}</h2>
            {savedDesign ? (
              designRuns.length > 0 ? (
                <div className="history-list">
                  {designRuns.map((run) => (
                    <div className="history-card" key={run.id}>
                      <div>
                        <strong>{run.result?.bottleneck?.label ?? run.id}</strong>
                        <small>{formatWorkload(run.workload)}</small>
                      </div>
                      <div className="history-card__actions">
                        <span>{run.id}</span>
                        <button
                          className="ghost-button"
                          onClick={() => handleUseHistoryRun(run)}
                          type="button"
                        >
                          Compare
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">
                  This design does not have persisted runs yet. Save it and run a few scenarios to build comparison history.
                </p>
              )
            ) : (
              <p className="empty-copy">
                Save the current design to build a run history you can compare against later.
              </p>
            )}
          </div>

          <div className="panel">
            <p className="panel-kicker">Connections</p>
            <h2>{canvasEdges.length ? "Current edges" : "No edges yet"}</h2>
            <div className="inspector">
              <label className="field">
                <span>Source</span>
                <select
                  value={newEdgeSourceID}
                  onChange={(event) => setNewEdgeSourceID(event.target.value)}
                >
                  <option value="">Select source</option>
                  {canvasNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.data.label}
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
                  {canvasNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.data.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Interaction</span>
                <select
                  value={newEdgeInteraction}
                  onChange={(event) =>
                    setNewEdgeInteraction(
                      event.target.value as EdgeInteractionType,
                    )
                  }
                >
                  {edgeOptions.interactions.map((interaction) => (
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
                    setNewEdgeRule(event.target.value as RoutingRuleType)
                  }
                >
                  {edgeOptions.routingRules.map((rule) => (
                    <option key={rule} value={rule}>
                      {rule}
                    </option>
                  ))}
                </select>
              </label>

              <button onClick={handleCreateEdge} type="button">
                Add Arrow
              </button>
            </div>

            {canvasEdges.length === 0 ? (
              <p className="empty-copy">
                Build your first connection with the arrow composer above.
              </p>
            ) : (
              <ul className="edge-list">
                {canvasEdges.map((edge) => (
                  <li key={edge.id}>
                    <div>
                      <strong>
                        {edge.source} → {edge.target}
                      </strong>
                      <small>
                        {edge.data?.interactionType ?? "sync_request"} /{" "}
                        {edge.data?.ruleType ?? "always"}
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

function graphNodeToFlowNode(node: GraphNode): Node<FlowNodeData> {
  return {
    id: node.id,
    position: node.position,
    data: {
      label: node.label,
      archetype: node.archetype,
      color: node.color,
      properties: node.properties,
    },
  };
}

function flowNodeToGraphNode(node: Node<FlowNodeData>): GraphNode {
  return {
    id: node.id,
    label: node.data.label,
    archetype: node.data.archetype,
    color: node.data.color,
    position: {
      x: node.position.x,
      y: node.position.y,
    },
    properties: node.data.properties,
  };
}

function graphEdgeToFlowEdge(edge: GraphEdge): Edge<FlowEdgeData> {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    data: {
      interactionType: edge.interaction_type,
      ruleType: edge.routing_rule.rule_type,
    },
  };
}

function flowEdgeToGraphEdge(edge: Edge<FlowEdgeData>): GraphEdge {
  return {
    id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    interaction_type: edge.data?.interactionType ?? "sync_request",
    routing_rule: {
      rule_type: edge.data?.ruleType ?? "always",
    },
  };
}

function buildNodeLabel(
  nodeData: FlowNodeData,
  result:
    | {
        utilization: number;
        incoming_rps: number;
      }
    | undefined,
): ReactNode {
  return (
    <div className="flow-node-copy">
      <div className="flow-node-copy__eyebrow">
        <span>{nodeData.label}</span>
        <span>{nodeData.archetype}</span>
      </div>
      <strong>{nodeData.color}</strong>
      {result ? (
        <div className="flow-node-copy__meta">
          <span>{Math.round(result.utilization * 100)}% util</span>
          <span>{formatCompactNumber(result.incoming_rps)} rps</span>
        </div>
      ) : null}
    </div>
  );
}

function getVisibleDropPosition(
  flowInstance: ReactFlowInstance<Node<FlowNodeData>, Edge<FlowEdgeData>> | null,
  container: HTMLDivElement | null,
  nodeCount: number,
) {
  if (!flowInstance || !container) {
    return {
      x: 120 + (nodeCount % 3) * 240,
      y: 120 + Math.floor(nodeCount / 3) * 160,
    };
  }

  const rect = container.getBoundingClientRect();
  const center = flowInstance.screenToFlowPosition({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });

  return {
    x: center.x - 110 + (nodeCount % 3) * 24,
    y: center.y - 36 + (nodeCount % 3) * 18,
  };
}

function defaultColorForArchetype(archetype: ComponentArchetype["archetype"]) {
  switch (archetype) {
    case "client":
    case "gateway":
      return "blue";
    case "stateless_service":
    case "worker":
      return "green";
    case "cache":
    case "queue":
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

function buildWorkloadFromInputs(input: {
  requestsPerSecond: string;
  concurrentUsers: string;
  readWriteRatio: string;
  payloadKB: string;
  fanoutCount: string;
}): { ok: true; value: Workload } | { ok: false; error: string } {
  const requestsPerSecond = Number(input.requestsPerSecond);
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    return { ok: false, error: "Requests per second must be a positive number." };
  }

  const concurrentUsers = Number(input.concurrentUsers);
  if (!Number.isFinite(concurrentUsers) || concurrentUsers < 0) {
    return { ok: false, error: "Concurrent users must be zero or greater." };
  }

  const readWriteRatio = Number(input.readWriteRatio);
  if (!Number.isFinite(readWriteRatio) || readWriteRatio <= 0) {
    return { ok: false, error: "Read:write ratio must be a positive number." };
  }

  const payloadKB = Number(input.payloadKB);
  if (!Number.isFinite(payloadKB) || payloadKB <= 0) {
    return { ok: false, error: "Payload size must be a positive number." };
  }

  const fanoutCount = Number(input.fanoutCount);
  if (!Number.isInteger(fanoutCount) || fanoutCount <= 0) {
    return { ok: false, error: "Fanout count must be a positive integer." };
  }

  return {
    ok: true,
    value: {
      requests_per_second: requestsPerSecond,
      concurrent_users: concurrentUsers,
      read_write_ratio: readWriteRatio,
      payload_kb: payloadKB,
      fanout_count: fanoutCount,
    },
  };
}

function buildRunComparison(baselineRun: Run, latestRun: Run) {
  const baseline = baselineRun.result?.bottleneck;
  const latest = latestRun.result?.bottleneck;

  return {
    baselineLabel: baseline?.label ?? "No bottleneck",
    latestLabel: latest?.label ?? "No bottleneck",
    utilizationDelta: (latest?.utilization ?? 0) - (baseline?.utilization ?? 0),
    latencyDelta:
      (latest?.estimated_latency_ms ?? 0) - (baseline?.estimated_latency_ms ?? 0),
    droppedDelta: (latest?.dropped_rps ?? 0) - (baseline?.dropped_rps ?? 0),
    message: describeComparison(baseline, latest),
  };
}

function describeComparison(
  baseline: RunNodeResult | undefined,
  latest: RunNodeResult | undefined,
) {
  if (!baseline && !latest) {
    return "Neither run produced a bottleneck result yet.";
  }

  if (!baseline || !latest) {
    return "Only one of the compared runs has a bottleneck result, so the comparison is partial.";
  }

  if (baseline.node_id !== latest.node_id) {
    return `The bottleneck moved from ${baseline.label} to ${latest.label}, which means the pressure shifted to a different layer of the system.`;
  }

  if (latest.utilization > baseline.utilization) {
    return `${latest.label} stayed the bottleneck and got worse under the latest workload assumptions.`;
  }

  if (latest.utilization < baseline.utilization) {
    return `${latest.label} stayed the bottleneck, but the latest workload or design changes relieved some pressure.`;
  }

  return `${latest.label} remains the bottleneck with nearly unchanged pressure.`;
}

function formatWorkload(workload: Workload) {
  const readWriteRatio = workload.read_write_ratio ?? 4;
  const payloadKB = workload.payload_kb ?? 4;
  const fanoutCount = workload.fanout_count ?? 1;
  const concurrentUsers = workload.concurrent_users ?? 0;

  return `${formatCompactNumber(workload.requests_per_second)} rps, ${formatCompactNumber(concurrentUsers)} concurrent users, ${readWriteRatio}:1 read/write, ${payloadKB} KB payload, fanout x${fanoutCount}`;
}

function formatSignedPercent(value: number) {
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded > 0) {
    return `+${rounded}%`;
  }

  return `${rounded}%`;
}

function formatSignedNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) {
    return `+${rounded}`;
  }

  return `${rounded}`;
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
