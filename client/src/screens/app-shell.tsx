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
  ConnectionMode,
  ConnectionLineType,
  Controls,
  MarkerType,
  Position,
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
  DesignVersion,
  EdgeInteractionType,
  GraphEdge,
  GraphNode,
  RequestClass,
  RoutingRuleType,
  Run,
  RunEdgeResult,
  RunNodeResult,
  Workload,
} from "../lib/api";
import {
  createDesign,
  createRun,
  duplicateDesign,
  getDesign,
  getStatus,
  listDesignVersions,
  listRunsForDesign,
  listComponentArchetypes,
  updateDesign,
} from "../lib/api";
import {
  buildDraftDesign,
  buildEdge,
  cloneDesignIntoDraft,
  createRequestClass,
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
  routingWeight: number;
  fanoutMultiplier: number;
  timeoutMS: number;
  retryAttempts: number;
  requestClassIDs: string[];
};

type EditorSnapshot = {
  draftName: string;
  draftDescription: string;
  requestClasses: RequestClass[];
  canvasNodes: Node<FlowNodeData>[];
  canvasEdges: Edge<FlowEdgeData>[];
  selectedNodeID: string | null;
  selectedEdgeID: string | null;
};

export function AppShell() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [feedback, setFeedback] = useState(
    "Start with a blank board, drag colored components into place, then connect only what you want to simulate.",
  );
  const [catalog, setCatalog] = useState<ComponentArchetype[]>([]);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([]);
  const [designRuns, setDesignRuns] = useState<Run[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [baselineRun, setBaselineRun] = useState<Run | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draftID, setDraftID] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Fresh Canvas");
  const [draftDescription, setDraftDescription] = useState("");
  const [requestClasses, setRequestClasses] = useState<RequestClass[]>([]);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [selectedEdgeID, setSelectedEdgeID] = useState<string | null>(null);
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
  const [newEdgeRoutingWeight, setNewEdgeRoutingWeight] = useState("1");
  const [newEdgeFanoutMultiplier, setNewEdgeFanoutMultiplier] = useState("1");
  const [newEdgeTimeoutMS, setNewEdgeTimeoutMS] = useState("0");
  const [newEdgeRetryAttempts, setNewEdgeRetryAttempts] = useState("0");
  const [newEdgeRequestClassIDs, setNewEdgeRequestClassIDs] = useState<string[]>([]);
  const [activeFlowResultID, setActiveFlowResultID] = useState("overall");
  const [canvasHintDismissed, setCanvasHintDismissed] = useState(false);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<Node<FlowNodeData>, Edge<FlowEdgeData>> | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<EditorSnapshot[]>([]);

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
  const selectedEdge = useMemo(
    () => canvasEdges.find((edge) => edge.id === selectedEdgeID) ?? null,
    [canvasEdges, selectedEdgeID],
  );
  const nodeLabelsByID = useMemo(
    () => new Map(canvasNodes.map((node) => [node.id, node.data.label])),
    [canvasNodes],
  );
  const isRunningSimulation = busyAction === "Running simulation";

  const activeFlowResult = useMemo(() => {
    if (activeFlowResultID === "overall") {
      return lastRun?.result ?? null;
    }

    return (
      lastRun?.result?.flows?.find(
        (flow) => flow.request_class_id === activeFlowResultID,
      ) ?? null
    );
  }, [activeFlowResultID, lastRun]);

  const resultNodesByID = useMemo(
    () =>
      new Map((activeFlowResult?.nodes ?? []).map((node) => [node.node_id, node])),
    [activeFlowResult],
  );

  const resultEdgesByID = useMemo(
    () =>
      new Map((activeFlowResult?.edges ?? []).map((edge) => [edge.edge_id, edge])),
    [activeFlowResult],
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
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            width: 220,
            borderRadius: 18,
            border: `2px solid ${result ? utilizationBorderColor(result.utilization, palette.border) : palette.border}`,
            background: result
              ? utilizationBackground(node.data.color, result.utilization)
              : palette.background,
            color: palette.text,
            boxShadow:
              activeFlowResult?.bottleneck?.node_id === node.id
                ? "0 0 0 4px rgba(216, 77, 58, 0.22), 0 14px 28px rgba(71, 93, 124, 0.2)"
                : result && result.utilization >= 0.8
                  ? "0 0 0 2px rgba(232, 153, 29, 0.18), 0 10px 24px rgba(71, 93, 124, 0.14)"
                  : "0 10px 24px rgba(71, 93, 124, 0.12)",
            padding: 0,
            opacity: result ? 1 : 0.96,
          },
          selected: node.id === selectedNodeID,
        };
      }),
    [activeFlowResult, canvasNodes, resultNodesByID, selectedNodeID],
  );

  const displayEdges = useMemo(
    () =>
      canvasEdges.map((edge) => {
        const result = resultEdgesByID.get(edge.id);
        const highlight = getEdgeHighlight(
          edge,
          result,
          activeFlowResult?.edges ?? [],
          resultNodesByID,
        );

        return {
          ...edge,
          label: buildEdgeLabel(edge, result),
          selected: edge.id === selectedEdgeID,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: highlight.stroke,
          },
          animated: highlight.animated,
          style: {
            stroke: edge.id === selectedEdgeID ? "#173561" : highlight.stroke,
            strokeWidth:
              edge.id === selectedEdgeID
                ? highlight.strokeWidth + 1.5
                : highlight.strokeWidth,
            strokeDasharray: highlight.dashed ? "8 6" : undefined,
          },
          labelStyle: {
            fill: "#364152",
            fontSize: 12,
            fontWeight: 700,
          },
          labelBgStyle: {
            fill: "rgba(255,255,255,0.96)",
          },
        };
      }),
    [activeFlowResult, canvasEdges, resultEdgesByID, resultNodesByID, selectedEdgeID],
  );

  const hottestEdge = useMemo(
    () =>
      (activeFlowResult?.edges ?? []).reduce<RunEdgeResult | undefined>((current, edge) => {
        if (!current || edge.routed_rps > current.routed_rps) {
          return edge;
        }

        return current;
      }, undefined),
    [activeFlowResult],
  );

  const activePaths = activeFlowResult?.paths ?? [];
  const criticalPath = activePaths.find((path) => path.kind === "critical_path") ?? null;
  const queueBacklogPath =
    activePaths.find((path) => path.kind === "queue_backlog") ?? null;
  const affectedNodes = useMemo(
    () =>
      (activeFlowResult?.nodes ?? [])
        .filter(
          (node) =>
            node.archetype !== "client" &&
            node.node_id !== activeFlowResult?.bottleneck?.node_id &&
            (node.utilization >= 0.8 ||
              node.dropped_rps > 0 ||
              (node.queue_lag_ms ?? 0) > 0),
        )
        .sort((left, right) => {
          const leftScore =
            left.utilization * 1000 +
            left.dropped_rps +
            (left.queue_lag_ms ?? 0);
          const rightScore =
            right.utilization * 1000 +
            right.dropped_rps +
            (right.queue_lag_ms ?? 0);

          return rightScore - leftScore;
        }),
    [activeFlowResult],
  );

  function captureSnapshot(): EditorSnapshot {
    return {
      draftName,
      draftDescription,
      requestClasses: structuredClone(requestClasses),
      canvasNodes: structuredClone(canvasNodes),
      canvasEdges: structuredClone(canvasEdges),
      selectedNodeID,
      selectedEdgeID,
    };
  }

  function pushUndoSnapshot() {
    const next = [...undoStackRef.current, captureSnapshot()].slice(-100);
    undoStackRef.current = next;
    setUndoDepth(next.length);
  }

  function applySnapshot(snapshot: EditorSnapshot) {
    setDraftName(snapshot.draftName);
    setDraftDescription(snapshot.draftDescription);
    setRequestClasses(structuredClone(snapshot.requestClasses));
    setCanvasNodes(structuredClone(snapshot.canvasNodes));
    setCanvasEdges(structuredClone(snapshot.canvasEdges));
    setSelectedNodeID(snapshot.selectedNodeID);
    setSelectedEdgeID(snapshot.selectedEdgeID);
    setLastRun(null);
    setIsDirty(true);
  }

  function handleUndo() {
    const current = undoStackRef.current;
    const snapshot = current[current.length - 1];
    if (!snapshot) {
      setFeedback("Nothing to undo yet.");
      return;
    }

    undoStackRef.current = current.slice(0, -1);
    setUndoDepth(undoStackRef.current.length);
    applySnapshot(snapshot);
    setFeedback("Undid the last canvas change.");
  }

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

    if (newEdgeInteraction === "fallback" && newEdgeRule !== "always") {
      setNewEdgeRule("always");
    }
  }, [edgeOptions, newEdgeInteraction, newEdgeRule]);

  useEffect(() => {
    if (requestClasses.length === 0) {
      setNewEdgeRequestClassIDs([]);
      return;
    }

    setNewEdgeRequestClassIDs((current) => {
      const filtered = current.filter((requestClassID) =>
        requestClasses.some((requestClass) => requestClass.id === requestClassID),
      );

      if (filtered.length > 0) {
        return filtered;
      }

      return [requestClasses[0].id];
    });

    if (
      activeFlowResultID !== "overall" &&
      !requestClasses.some((requestClass) => requestClass.id === activeFlowResultID)
    ) {
      setActiveFlowResultID("overall");
    }
  }, [activeFlowResultID, requestClasses]);

  useEffect(() => {
    if (!savedDesign?.id) {
      setDesignRuns([]);
      setDesignVersions([]);
      return;
    }

    void loadRunHistory(savedDesign.id);
    void loadVersionHistory(savedDesign.id);
  }, [savedDesign?.id]);

  useEffect(() => {
    if (!savedDesign?.id) {
      setAutosaveState("idle");
      return;
    }

    if (!isDirty || busyAction !== null) {
      setAutosaveState(isDirty ? "pending" : "saved");
      return;
    }

    setAutosaveState("pending");
    const timeoutID = window.setTimeout(() => {
      void runAutosave();
    }, 1200);

    return () => window.clearTimeout(timeoutID);
  }, [
    savedDesign?.id,
    isDirty,
    busyAction,
    draftName,
    draftDescription,
    requestClasses,
    canvasNodes,
    canvasEdges,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (!selectedNodeID) {
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        handleRemoveNode(selectedNodeID);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeID, canvasEdges, canvasNodes, requestClasses, draftName, draftDescription]);

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

  async function loadVersionHistory(designID: string) {
    try {
      const versions = await listDesignVersions(designID);
      setDesignVersions(versions);
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

  function buildPersistedDesignPayload() {
    return {
      name: draftName.trim() || "Fresh Canvas",
      description: draftDescription.trim(),
      graph: {
        nodes: canvasNodes.map(flowNodeToGraphNode),
        edges: canvasEdges.map(flowEdgeToGraphEdge),
        request_classes: requestClasses,
      },
    };
  }

  function syncPersistedDesign(design: Design) {
    setSavedDesign(design);
    setDraftID(design.id);
    setIsDirty(false);
    setAutosaveState("saved");
  }

  async function runAutosave() {
    if (!savedDesign?.id || !isDirty) {
      return;
    }

    setAutosaveState("saving");

    try {
      const design = await updateDesign(savedDesign.id, buildPersistedDesignPayload());
      syncPersistedDesign(design);
      void loadVersionHistory(design.id);
      setFeedback(`Autosaved ${design.id}.`);
    } catch (error) {
      setAutosaveState("error");
      setFeedback(readError(error));
    }
  }

  function resetToBlankCanvas() {
    const blank = createBlankDraft();

    setSavedDesign(null);
    setDraftID(null);
    setDraftName(blank.name);
    setDraftDescription(blank.description);
    setRequestClasses(blank.requestClasses);
    setCanvasNodes([]);
    setCanvasEdges([]);
    setDesignRuns([]);
    setDesignVersions([]);
    setSelectedNodeID(null);
    setSelectedEdgeID(null);
    setNewEdgeSourceID("");
    setNewEdgeTargetID("");
    setNewEdgeFanoutMultiplier("1");
    setNewEdgeRequestClassIDs(blank.requestClasses.map((requestClass) => requestClass.id));
    setActiveFlowResultID("overall");
    setCanvasHintDismissed(false);
    setLastRun(null);
    setBaselineRun(null);
    setIsDirty(false);
    setAutosaveState("idle");
    undoStackRef.current = [];
    setUndoDepth(0);
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
    setRequestClasses(draft.requestClasses);
    setCanvasNodes(draft.nodes.map(graphNodeToFlowNode));
    setCanvasEdges(draft.edges.map(graphEdgeToFlowEdge));
    setSelectedNodeID(draft.nodes[0]?.id ?? null);
    setSelectedEdgeID(null);
    setNewEdgeSourceID(draft.nodes[0]?.id ?? "");
    setNewEdgeTargetID(draft.nodes[1]?.id ?? "");
    setNewEdgeFanoutMultiplier("1");
    setNewEdgeRequestClassIDs(
      draft.requestClasses
        .slice(0, 1)
        .map((requestClass) => requestClass.id),
    );
    setActiveFlowResultID("overall");
    setCanvasHintDismissed(false);
    setLastRun(null);
    if (!options?.preserveBaseline) {
      setBaselineRun(null);
    }
    setIsDirty(false);
    setAutosaveState(design.id ? "saved" : "idle");
    undoStackRef.current = [];
    setUndoDepth(0);
  }

  function currentDraftDesign() {
    return buildDraftDesign({
      id: draftID,
      name: draftName,
      description: draftDescription,
      nodes: canvasNodes.map(flowNodeToGraphNode),
      edges: canvasEdges.map(flowEdgeToGraphEdge),
      requestClasses,
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

    const design = savedDesign
      ? await withAction("Saving design", () =>
          updateDesign(savedDesign.id, buildPersistedDesignPayload()),
        )
      : await withAction("Saving design", () => createDesign(buildPersistedDesignPayload()));

    if (!design) {
      return;
    }

    if (savedDesign) {
      syncPersistedDesign(design);
      void loadVersionHistory(design.id);
    } else {
      applyDesignToEditor(design, { preserveBaseline: true });
    }
    setFeedback(`Saved ${design.id}.`);
  }

  async function handleDuplicateDesign() {
    if (canvasNodes.length === 0) {
      setFeedback("Add components before creating a variant.");
      return;
    }

    const name = `${draftName.trim() || "Fresh Canvas"} Variant`;
    const payload = {
      ...buildPersistedDesignPayload(),
      name,
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
    setActiveFlowResultID("overall");
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
    if (savedDesign?.id) {
      setAutosaveState("pending");
    }
  }

  function addNode(archetype: ComponentArchetype) {
    pushUndoSnapshot();
    const graphNode = createNodeFromArchetype(
      archetype,
      canvasNodes.map(flowNodeToGraphNode),
      getVisibleDropPosition(flowInstance, canvasShellRef.current, canvasNodes.length),
    );
    const flowNode = graphNodeToFlowNode(graphNode);

    setCanvasNodes((current) => [...current, flowNode]);
    setSelectedNodeID(flowNode.id);
    setSelectedEdgeID(null);
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
    if (changes.some((change) => change.type === "remove")) {
      pushUndoSnapshot();
    }

    onCanvasNodesChange(changes);

    const selectedChange = [...changes]
      .reverse()
      .find((change) => change.type === "select");
    if (selectedChange?.type === "select") {
      setSelectedNodeID(selectedChange.selected ? selectedChange.id : null);
      if (selectedChange.selected) {
        setSelectedEdgeID(null);
      }
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
    if (changes.some((change) => change.type === "remove")) {
      pushUndoSnapshot();
    }

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

    pushUndoSnapshot();

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
      routingWeight: 1,
      fanoutMultiplier: 1,
      timeoutMS: 0,
      retryAttempts: 0,
      requestClassIDs:
        requestClasses.length > 0 ? [requestClasses[0].id] : undefined,
      existingEdges: canvasEdges.map(flowEdgeToGraphEdge),
    });

    setCanvasEdges((current) =>
      addEdge(graphEdgeToFlowEdge(graphEdge), current),
    );
    setSelectedEdgeID(graphEdge.id);
    setSelectedNodeID(null);
    setCanvasHintDismissed(true);
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

    const fanoutMultiplier = parseEdgeFanoutInput(newEdgeFanoutMultiplier);
    if (!fanoutMultiplier.ok) {
      setFeedback(fanoutMultiplier.error);
      return;
    }

    const routingWeight = parsePositiveDecimalInput(
      newEdgeRoutingWeight,
      "Routing weight must be zero or greater.",
    );
    if (!routingWeight.ok) {
      setFeedback(routingWeight.error);
      return;
    }

    const timeoutMS = parsePositiveDecimalInput(
      newEdgeTimeoutMS,
      "Timeout (ms) must be zero or greater.",
    );
    if (!timeoutMS.ok) {
      setFeedback(timeoutMS.error);
      return;
    }

    const retryAttempts = parseWholeNumberInput(
      newEdgeRetryAttempts,
      "Retry attempts must be zero or greater.",
    );
    if (!retryAttempts.ok) {
      setFeedback(retryAttempts.error);
      return;
    }

    const graphEdge = buildEdge({
      sourceNodeID: newEdgeSourceID,
      targetNodeID: newEdgeTargetID,
      interactionType: newEdgeInteraction,
      ruleType: newEdgeInteraction === "fallback" ? "always" : newEdgeRule,
      routingWeight: routingWeight.value,
      fanoutMultiplier: fanoutMultiplier.value,
      timeoutMS: timeoutMS.value,
      retryAttempts: retryAttempts.value,
      requestClassIDs: newEdgeRequestClassIDs,
      existingEdges: canvasEdges.map(flowEdgeToGraphEdge),
    });

    pushUndoSnapshot();
    setCanvasEdges((current) => [...current, graphEdgeToFlowEdge(graphEdge)]);
    setSelectedEdgeID(graphEdge.id);
    setSelectedNodeID(null);
    setCanvasHintDismissed(true);
    setLastRun(null);
    markDirty();
    setFeedback(`Created arrow ${newEdgeSourceID} → ${newEdgeTargetID}.`);
  }

  function handleEdgeInteractionChange(edgeID: string, interactionType: EdgeInteractionType) {
    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                interactionType,
                ruleType:
                  interactionType === "fallback"
                    ? "always"
                    : edge.data?.ruleType ?? "always",
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleEdgeRuleChange(edgeID: string, ruleType: RoutingRuleType) {
    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                ruleType,
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleEdgeFanoutChange(edgeID: string, value: string) {
    const parsed = parseEdgeFanoutInput(value);
    if (!parsed.ok && value !== "") {
      return;
    }

    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                fanoutMultiplier:
                  value === "" ? 1 : parsed.ok ? parsed.value : 1,
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleEdgeRoutingWeightChange(edgeID: string, value: string) {
    const parsed = parsePositiveDecimalInput(
      value,
      "Routing weight must be zero or greater.",
    );
    if (!parsed.ok && value !== "") {
      return;
    }

    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                routingWeight: value === "" ? 1 : parsed.ok ? parsed.value : 1,
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleEdgeTimeoutChange(edgeID: string, value: string) {
    const parsed = parsePositiveDecimalInput(
      value,
      "Timeout (ms) must be zero or greater.",
    );
    if (!parsed.ok && value !== "") {
      return;
    }

    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                timeoutMS: value === "" ? 0 : parsed.ok ? parsed.value : 0,
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  function handleEdgeRetryChange(edgeID: string, value: string) {
    const parsed = parseWholeNumberInput(
      value,
      "Retry attempts must be zero or greater.",
    );
    if (!parsed.ok && value !== "") {
      return;
    }

    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) =>
        edge.id === edgeID
          ? {
              ...edge,
              data: {
                ...edge.data,
                retryAttempts: value === "" ? 0 : parsed.ok ? parsed.value : 0,
              },
            }
          : edge,
      ),
    );
    setLastRun(null);
    markDirty();
  }

  const handleNodeClick: NodeMouseHandler<Node<FlowNodeData>> = (_, node) => {
    setSelectedNodeID(node.id);
    setSelectedEdgeID(null);
  };

  function handleColorChange(nodeID: string, color: GraphNode["color"]) {
    pushUndoSnapshot();
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
    pushUndoSnapshot();
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
    pushUndoSnapshot();
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
    pushUndoSnapshot();
    setCanvasNodes((current) => current.filter((node) => node.id !== nodeID));
    setCanvasEdges((current) =>
      current.filter((edge) => edge.source !== nodeID && edge.target !== nodeID),
    );
    if (selectedNodeID === nodeID) {
      setSelectedNodeID(null);
    }
    setSelectedEdgeID(null);
    setLastRun(null);
    markDirty();
  }

  function handleRemoveEdge(edgeID: string) {
    pushUndoSnapshot();
    setCanvasEdges((current) => current.filter((edge) => edge.id !== edgeID));
    if (selectedEdgeID === edgeID) {
      setSelectedEdgeID(null);
    }
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

  function handleAddRequestFlow() {
    pushUndoSnapshot();
    const nextIndex = requestClasses.length + 1;
    const requestClass = createRequestClass(`Flow ${nextIndex}`, 25, nextIndex);
    setRequestClasses((current) => [...current, requestClass]);
    setNewEdgeRequestClassIDs([requestClass.id]);
    markDirty();
  }

  function handleRequestFlowNameChange(requestClassID: string, value: string) {
    pushUndoSnapshot();
    setRequestClasses((current) =>
      current.map((requestClass) =>
        requestClass.id === requestClassID
          ? {
              ...requestClass,
              name: value,
            }
          : requestClass,
      ),
    );
    markDirty();
  }

  function handleRequestFlowShareChange(requestClassID: string, value: string) {
    const trafficShare = value === "" ? 1 : Number(value);
    if (!Number.isFinite(trafficShare) || trafficShare <= 0) {
      return;
    }

    pushUndoSnapshot();
    setRequestClasses((current) =>
      current.map((requestClass) =>
        requestClass.id === requestClassID
          ? {
              ...requestClass,
              traffic_share: trafficShare,
            }
          : requestClass,
      ),
    );
    markDirty();
  }

  function handleRemoveRequestFlow(requestClassID: string) {
    if (requestClasses.length === 1) {
      setFeedback("At least one flow is required for the current MVP.");
      return;
    }

    pushUndoSnapshot();
    const remaining = requestClasses.filter(
      (requestClass) => requestClass.id !== requestClassID,
    );

    setRequestClasses(remaining);
    setCanvasEdges((current) =>
      current.map((edge) => {
        const filteredIDs = (edge.data?.requestClassIDs ?? []).filter(
          (id) => id !== requestClassID,
        );

        return {
          ...edge,
          data: {
            ...edge.data,
            requestClassIDs:
              filteredIDs.length > 0 ? filteredIDs : [remaining[0].id],
          },
        };
      }),
    );
    if (activeFlowResultID === requestClassID) {
      setActiveFlowResultID("overall");
    }
    markDirty();
  }

  function handleEdgeRequestClassToggle(edgeID: string, requestClassID: string) {
    pushUndoSnapshot();
    setCanvasEdges((current) =>
      current.map((edge) => {
        if (edge.id !== edgeID) {
          return edge;
        }

        const currentIDs = edge.data?.requestClassIDs ?? [];
        const nextIDs = currentIDs.includes(requestClassID)
          ? currentIDs.filter((id) => id !== requestClassID)
          : [...currentIDs, requestClassID];

        return {
          ...edge,
          data: {
            ...edge.data,
            requestClassIDs:
              nextIDs.length > 0 ? nextIDs : [requestClasses[0].id],
          },
        };
      }),
    );
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
          <button
            className="ghost-button"
            onClick={handleUndo}
            type="button"
            disabled={undoDepth === 0}
          >
            Undo
          </button>
          <button className="ghost-button" onClick={resetToBlankCanvas} type="button">
            Start Fresh
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
        <div className="info-pill">
          <span>Backend</span>
          <strong>{apiStatus}</strong>
        </div>
        <div className="info-pill">
          <span>Design</span>
          <strong>{savedDesign ? savedDesign.id : "Unsaved canvas"}</strong>
        </div>
        <div className="info-pill">
          <span>Sync</span>
          <strong>{isDirty ? "Unsaved changes" : "All changes synced"}</strong>
        </div>
        <div className="info-pill">
          <span>Autosave</span>
          <strong>{formatAutosaveState(savedDesign, autosaveState)}</strong>
        </div>
        <div className="info-pill">
          <span>Graph</span>
          <strong>
            {canvasNodes.length} nodes / {canvasEdges.length} edges
          </strong>
        </div>
        <div className="info-pill">
          <span>Flows</span>
          <strong>{requestClasses.length} active</strong>
        </div>
        <div className="info-pill">
          <span>Versions</span>
          <strong>{savedDesign ? designVersions.length : 0}</strong>
        </div>
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
                  className={`catalog-card catalog-card--${item.default_color}`}
                  style={buildCatalogCardStyle(item.default_color)}
                  draggable
                  onDragStart={handleArchetypeDragStart(item)}
                  onDragEnd={() => setDraggedArchetype(null)}
                  onClick={() => addNode(item)}
                  type="button"
                >
                  <span className="catalog-card__dot" />
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

          <div className="panel">
            <p className="panel-kicker">Request Flows</p>
            <h2>{requestClasses.length} active flows</h2>
            <div className="flow-list">
              {requestClasses.map((requestClass) => (
                <div className="flow-card" key={requestClass.id}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={requestClass.name}
                      onChange={(event) =>
                        handleRequestFlowNameChange(
                          requestClass.id,
                          event.target.value,
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Traffic share</span>
                    <input
                      inputMode="decimal"
                      value={requestClass.traffic_share ?? ""}
                      onChange={(event) =>
                        handleRequestFlowShareChange(
                          requestClass.id,
                          event.target.value,
                        )
                      }
                    />
                  </label>
                  <button
                    className="ghost-button"
                    onClick={() => handleRemoveRequestFlow(requestClass.id)}
                    type="button"
                  >
                    Remove Flow
                  </button>
                </div>
              ))}
            </div>
            <button className="ghost-button" onClick={handleAddRequestFlow} type="button">
              Add Flow
            </button>
          </div>
        </aside>

        <section className="board-panel">
          <div
            ref={canvasShellRef}
            className={`canvas-shell${draggedArchetype ? " canvas-shell--ready" : ""}`}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
          >
            <div className="canvas-toolbar">
              <button
                className="ghost-button ghost-button--toolbar"
                onClick={() => flowInstance?.fitView({ duration: 350, padding: 0.2 })}
                type="button"
              >
                Fit View
              </button>
              <button
                className="ghost-button ghost-button--toolbar"
                onClick={() =>
                  flowInstance?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 350 })
                }
                type="button"
              >
                Reset View
              </button>
              {selectedNode ? (
                <button
                  className="ghost-button ghost-button--danger ghost-button--toolbar"
                  onClick={() => handleRemoveNode(selectedNode.id)}
                  type="button"
                >
                  Remove {selectedNode.data.label}
                </button>
              ) : null}
            </div>

            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              onInit={setFlowInstance}
              onNodeDragStart={() => pushUndoSnapshot()}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={36}
              connectionLineType={ConnectionLineType.SmoothStep}
              connectionLineStyle={{
                stroke: "#4f88da",
                strokeWidth: 3,
                strokeDasharray: "8 6",
              }}
              defaultEdgeOptions={{
                type: "smoothstep",
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: "#6f819a",
                },
              }}
              onPaneClick={() => {
                setSelectedNodeID(null);
                setSelectedEdgeID(null);
              }}
              onNodeClick={handleNodeClick}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeID(edge.id);
                setSelectedNodeID(null);
              }}
            >
              <Background gap={24} size={1} color="#d8e0ef" />
              <Controls />
            </ReactFlow>

            <div className="canvas-legend">
              <div className="canvas-legend__row">
                <span className="legend-swatch legend-swatch--hot" />
                <span>Hot path</span>
              </div>
              <div className="canvas-legend__row">
                <span className="legend-swatch legend-swatch--warm" />
                <span>Under pressure nodes</span>
              </div>
              <div className="canvas-legend__row">
                <span className="legend-swatch legend-swatch--fallback" />
                <span>Fallback active</span>
              </div>
            </div>

            {isRunningSimulation ? (
              <div className="canvas-run-overlay">
                <div className="run-visualizer">
                  <div className="run-visualizer__pulse" />
                  <div className="run-visualizer__pulse run-visualizer__pulse--delay" />
                  <strong>Running simulation</strong>
                  <span>Propagating load through the current graph.</span>
                </div>
              </div>
            ) : null}

            {canvasNodes.length === 0 ? (
              <div className="canvas-empty">
                <strong>Drop components here</strong>
                <p>
                  New nodes are placed in the visible center of the board so they
                  never disappear off-screen.
                </p>
              </div>
            ) : !canvasHintDismissed && canvasEdges.length === 0 ? (
              <div className="canvas-hint">
                <span>
                  Drag from a node&apos;s right handle into another node&apos;s left handle
                  to create an edge directly on the canvas.
                </span>
                <button
                  className="ghost-button ghost-button--hint"
                  onClick={() => setCanvasHintDismissed(true)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>

          {lastRun?.result ? (
            <>
              <div className="run-summary">
                <div className="run-summary__header">
                  <div>
                    <p className="panel-kicker">Latest run</p>
                    <strong>{activeFlowResult?.summary ?? lastRun.result.summary}</strong>
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
                <div className="flow-toggle-bar">
                  <button
                    className={`flow-toggle${activeFlowResultID === "overall" ? " flow-toggle--active" : ""}`}
                    onClick={() => setActiveFlowResultID("overall")}
                    type="button"
                  >
                    Overall
                  </button>
                  {(lastRun.result.flows ?? []).map((flow) => (
                    <button
                      key={flow.request_class_id}
                      className={`flow-toggle${activeFlowResultID === flow.request_class_id ? " flow-toggle--active" : ""}`}
                      onClick={() => setActiveFlowResultID(flow.request_class_id)}
                      type="button"
                    >
                      {flow.name}
                    </button>
                  ))}
                </div>
                <div className="comparison-grid comparison-grid--run">
                  <div className="comparison-card">
                    <span>Bottleneck</span>
                    <strong>
                      {activeFlowResult?.bottleneck?.label ?? "No bottleneck"}
                    </strong>
                  </div>
                  <div className="comparison-card">
                    <span>Hot edge</span>
                    <strong>
                      {hottestEdge
                        ? `${nodeLabelsByID.get(hottestEdge.source_node_id) ?? hottestEdge.source_node_id} → ${nodeLabelsByID.get(hottestEdge.target_node_id) ?? hottestEdge.target_node_id}`
                        : "No routed edges"}
                    </strong>
                  </div>
                  <div className="comparison-card">
                    <span>Flow coverage</span>
                    <strong>
                      {activeFlowResultID === "overall"
                        ? `${lastRun.result.flows?.length ?? 0} flows`
                        : activeFlowResult?.name ?? "Single flow"}
                    </strong>
                  </div>
                  <div className="comparison-card">
                    <span>Peak load</span>
                    <strong>
                      {hottestEdge
                        ? `${formatCompactNumber(hottestEdge.routed_rps)} rps`
                        : "0 rps"}
                    </strong>
                  </div>
                  <div className="comparison-card">
                    <span>Critical path</span>
                    <strong>
                      {criticalPath ? summarizePathForCard(criticalPath, nodeLabelsByID) : "No path yet"}
                    </strong>
                  </div>
                  <div className="comparison-card">
                    <span>Queue lag</span>
                    <strong>
                      {queueBacklogPath?.queue_lag_ms
                        ? `${Math.round(queueBacklogPath.queue_lag_ms)} ms`
                        : "Healthy"}
                    </strong>
                  </div>
                </div>
                <p>{formatWorkload(lastRun.workload)}</p>
                {activeFlowResult?.bottleneck ? (
                  <p>{activeFlowResult.bottleneck.explanation}</p>
                ) : null}
                {affectedNodes.length > 0 ? (
                  <div className="affected-components">
                    <div className="affected-components__header">
                      <span>Also affected</span>
                      <strong>{affectedNodes.length} components need attention</strong>
                    </div>
                    <div className="affected-components__grid">
                      {affectedNodes.map((node) => (
                        <article className="affected-card" key={`${activeFlowResultID}-${node.node_id}`}>
                          <div className="affected-card__header">
                            <strong>{node.label}</strong>
                            <span>{Math.round(node.utilization * 100)}% util</span>
                          </div>
                          <p>{node.explanation}</p>
                          <div className="affected-card__metrics">
                            <span>{formatCompactNumber(node.incoming_rps)} in</span>
                            <span>{formatCompactNumber(node.processed_rps)} ok</span>
                            {node.dropped_rps > 0 ? (
                              <span>{formatCompactNumber(node.dropped_rps)} dropped</span>
                            ) : null}
                            {(node.queue_lag_ms ?? 0) > 0 ? (
                              <span>{Math.round(node.queue_lag_ms ?? 0)} ms lag</span>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                {activePaths.length > 0 ? (
                  <div className="path-explanations">
                    {activePaths.map((path) => (
                      <article className="path-card" key={`${activeFlowResultID}-${path.kind}`}>
                        <div className="path-card__header">
                          <span>{path.kind.replaceAll("_", " ")}</span>
                          <strong>
                            {path.estimated_latency_ms
                              ? `${Math.round(path.estimated_latency_ms)} ms`
                              : "Path insight"}
                          </strong>
                        </div>
                        <p>{path.summary}</p>
                        <div className="path-card__metrics">
                          {path.queue_lag_ms ? (
                            <span>{Math.round(path.queue_lag_ms)} ms queue lag</span>
                          ) : null}
                          {path.retried_rps ? (
                            <span>{formatCompactNumber(path.retried_rps)} retry rps</span>
                          ) : null}
                          {path.timed_out_rps ? (
                            <span>{formatCompactNumber(path.timed_out_rps)} timed out rps</span>
                          ) : null}
                        </div>
                        {path.node_ids.length > 0 ? (
                          <small>
                            {path.node_ids
                              .map((nodeID) => nodeLabelsByID.get(nodeID) ?? nodeID)
                              .join(" -> ")}
                          </small>
                        ) : null}
                      </article>
                    ))}
                  </div>
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
                        {colorLabel(color)}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="empty-copy">
                  Use replicas for identical instances of the same logical component.
                  Use separate nodes when they represent different systems with different responsibilities.
                </p>

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
                        <span className="history-chip">
                          {run.result?.flows?.length ?? 0} flows
                        </span>
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
            <p className="panel-kicker">Versions</p>
            <h2>{savedDesign ? "Saved revisions" : "Save to start versioning"}</h2>
            {savedDesign ? (
              designVersions.length > 0 ? (
                <div className="history-list">
                  {designVersions.map((version) => (
                    <div className="history-card" key={`${version.design_id}-${version.version}`}>
                      <div>
                        <strong>Version {version.version}</strong>
                        <small>
                          {new Date(version.created_at).toLocaleString()}
                        </small>
                      </div>
                      <div className="history-card__actions">
                        <span>{version.design_snapshot.name}</span>
                        <span className="history-chip">
                          {version.design_snapshot.graph.nodes.length} nodes
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">
                  This design has not recorded any versions yet.
                </p>
              )
            ) : (
              <p className="empty-copy">
                Save the current design once to enable autosave and build revision history.
              </p>
            )}
          </div>

          <div className="panel">
            <p className="panel-kicker">Connections</p>
            <h2>{canvasEdges.length ? "Current edges" : "No edges yet"}</h2>
            <p className="empty-copy">
              Drag from the visible handle on one node into another node to connect them.
              Use the form below when you want to fine-tune routing rules, fallbacks, or
              flow assignments.
            </p>
            {selectedEdge ? (
              <div className="edge-focus-card">
                <div className="edge-focus-card__header">
                  <div>
                    <strong>
                      {nodeLabelsByID.get(selectedEdge.source) ?? selectedEdge.source} →{" "}
                      {nodeLabelsByID.get(selectedEdge.target) ?? selectedEdge.target}
                    </strong>
                    <small>Selected edge</small>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => setSelectedEdgeID(null)}
                    type="button"
                  >
                    Deselect
                  </button>
                </div>

                <div className="edge-editor edge-editor--focused">
                  <select
                    value={selectedEdge.data?.interactionType ?? "sync_request"}
                    onChange={(event) =>
                      handleEdgeInteractionChange(
                        selectedEdge.id,
                        event.target.value as EdgeInteractionType,
                      )
                    }
                  >
                    {getSupportedEdgeOptions({
                      sourceNodeID: selectedEdge.source,
                      nodes: canvasNodes.map(flowNodeToGraphNode),
                      archetypes: catalog,
                    }).interactions.map((interaction) => (
                      <option key={`${selectedEdge.id}-${interaction}`} value={interaction}>
                        {interaction}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedEdge.data?.ruleType ?? "always"}
                    disabled={selectedEdge.data?.interactionType === "fallback"}
                    onChange={(event) =>
                      handleEdgeRuleChange(
                        selectedEdge.id,
                        event.target.value as RoutingRuleType,
                      )
                    }
                  >
                    {getSupportedEdgeOptions({
                      sourceNodeID: selectedEdge.source,
                      nodes: canvasNodes.map(flowNodeToGraphNode),
                      archetypes: catalog,
                    }).routingRules.map((rule) => (
                      <option key={`${selectedEdge.id}-${rule}`} value={rule}>
                        {rule}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={String(selectedEdge.data?.routingWeight ?? 1)}
                    onChange={(event) =>
                      handleEdgeRoutingWeightChange(selectedEdge.id, event.target.value)
                    }
                  />
                  <input
                    inputMode="decimal"
                    value={String(selectedEdge.data?.fanoutMultiplier ?? 1)}
                    onChange={(event) =>
                      handleEdgeFanoutChange(selectedEdge.id, event.target.value)
                    }
                  />
                  <input
                    inputMode="decimal"
                    value={String(selectedEdge.data?.timeoutMS ?? 0)}
                    onChange={(event) =>
                      handleEdgeTimeoutChange(selectedEdge.id, event.target.value)
                    }
                  />
                  <input
                    inputMode="numeric"
                    value={String(selectedEdge.data?.retryAttempts ?? 0)}
                    onChange={(event) =>
                      handleEdgeRetryChange(selectedEdge.id, event.target.value)
                    }
                  />
                  <div className="flow-checkboxes">
                    {requestClasses.map((requestClass) => (
                      <label className="flow-checkbox" key={`${selectedEdge.id}-${requestClass.id}`}>
                        <input
                          checked={
                            selectedEdge.data?.requestClassIDs?.includes(requestClass.id) ??
                            false
                          }
                          onChange={() =>
                            handleEdgeRequestClassToggle(selectedEdge.id, requestClass.id)
                          }
                          type="checkbox"
                        />
                        <span>{requestClass.name}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    className="ghost-button ghost-button--danger"
                    onClick={() => handleRemoveEdge(selectedEdge.id)}
                    type="button"
                  >
                    Remove edge
                  </button>
                </div>
              </div>
            ) : null}
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
                  disabled={newEdgeInteraction === "fallback"}
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

              <label className="field">
                <span>Routing weight</span>
                <input
                  inputMode="decimal"
                  value={newEdgeRoutingWeight}
                  onChange={(event) =>
                    setNewEdgeRoutingWeight(event.target.value)
                  }
                />
              </label>

              <label className="field">
                <span>Edge fanout multiplier</span>
                <input
                  inputMode="decimal"
                  value={newEdgeFanoutMultiplier}
                  onChange={(event) =>
                    setNewEdgeFanoutMultiplier(event.target.value)
                  }
                />
              </label>

              <label className="field">
                <span>Timeout (ms)</span>
                <input
                  inputMode="decimal"
                  value={newEdgeTimeoutMS}
                  onChange={(event) => setNewEdgeTimeoutMS(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Retry attempts</span>
                <input
                  inputMode="numeric"
                  value={newEdgeRetryAttempts}
                  onChange={(event) =>
                    setNewEdgeRetryAttempts(event.target.value)
                  }
                />
              </label>

              <div className="field">
                <span>Flows</span>
                <div className="flow-checkboxes">
                  {requestClasses.map((requestClass) => (
                    <label className="flow-checkbox" key={requestClass.id}>
                      <input
                        checked={newEdgeRequestClassIDs.includes(requestClass.id)}
                        onChange={() =>
                          setNewEdgeRequestClassIDs((current) => {
                            const next = current.includes(requestClass.id)
                              ? current.filter((id) => id !== requestClass.id)
                              : [...current, requestClass.id];

                            return next.length > 0 ? next : [requestClasses[0].id];
                          })
                        }
                        type="checkbox"
                      />
                      <span>{requestClass.name}</span>
                    </label>
                  ))}
                </div>
              </div>

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
                {canvasEdges.map((edge) => {
                  const edgeSpecificOptions = getSupportedEdgeOptions({
                    sourceNodeID: edge.source,
                    nodes: canvasNodes.map(flowNodeToGraphNode),
                    archetypes: catalog,
                  });

                  return (
                    <li
                      key={edge.id}
                      className={edge.id === selectedEdgeID ? "edge-list__item--selected" : ""}
                      onClick={() => {
                        setSelectedEdgeID(edge.id);
                        setSelectedNodeID(null);
                      }}
                    >
                      <div>
                        <strong>
                          {nodeLabelsByID.get(edge.source) ?? edge.source} →{" "}
                          {nodeLabelsByID.get(edge.target) ?? edge.target}
                        </strong>
                        <small>
                          {edge.data?.interactionType ?? "sync_request"} /{" "}
                          {edge.data?.ruleType ?? "always"}
                          {edge.data?.routingWeight && edge.data.routingWeight > 1
                            ? ` / w${edge.data.routingWeight}`
                            : ""}
                          {edge.data?.fanoutMultiplier &&
                          edge.data.fanoutMultiplier > 1
                            ? ` / x${edge.data.fanoutMultiplier}`
                            : ""}
                          {edge.data?.timeoutMS && edge.data.timeoutMS > 0
                            ? ` / ${edge.data.timeoutMS}ms`
                            : ""}
                          {edge.data?.retryAttempts && edge.data.retryAttempts > 0
                            ? ` / r${edge.data.retryAttempts}`
                            : ""}
                        </small>
                      </div>
                      <div className="edge-editor">
                        <select
                          value={edge.data?.interactionType ?? "sync_request"}
                          onChange={(event) =>
                            handleEdgeInteractionChange(
                              edge.id,
                              event.target.value as EdgeInteractionType,
                            )
                          }
                        >
                          {edgeSpecificOptions.interactions.map((interaction) => (
                            <option
                              key={`${edge.id}-${interaction}`}
                              value={interaction}
                            >
                              {interaction}
                            </option>
                          ))}
                        </select>
                        <select
                          value={edge.data?.ruleType ?? "always"}
                          disabled={edge.data?.interactionType === "fallback"}
                          onChange={(event) =>
                            handleEdgeRuleChange(
                              edge.id,
                              event.target.value as RoutingRuleType,
                            )
                          }
                        >
                          {edgeSpecificOptions.routingRules.map((rule) => (
                            <option key={`${edge.id}-${rule}`} value={rule}>
                              {rule}
                            </option>
                          ))}
                        </select>
                        <input
                          inputMode="decimal"
                          value={String(edge.data?.routingWeight ?? 1)}
                          onChange={(event) =>
                            handleEdgeRoutingWeightChange(edge.id, event.target.value)
                          }
                        />
                        <input
                          inputMode="decimal"
                          value={String(edge.data?.fanoutMultiplier ?? 1)}
                          onChange={(event) =>
                            handleEdgeFanoutChange(edge.id, event.target.value)
                          }
                        />
                        <input
                          inputMode="decimal"
                          value={String(edge.data?.timeoutMS ?? 0)}
                          onChange={(event) =>
                            handleEdgeTimeoutChange(edge.id, event.target.value)
                          }
                        />
                        <input
                          inputMode="numeric"
                          value={String(edge.data?.retryAttempts ?? 0)}
                          onChange={(event) =>
                            handleEdgeRetryChange(edge.id, event.target.value)
                          }
                        />
                        <div className="flow-checkboxes">
                          {requestClasses.map((requestClass) => (
                            <label className="flow-checkbox" key={`${edge.id}-${requestClass.id}`}>
                              <input
                                checked={
                                  edge.data?.requestClassIDs?.includes(requestClass.id) ??
                                  false
                                }
                                onChange={() =>
                                  handleEdgeRequestClassToggle(edge.id, requestClass.id)
                                }
                                type="checkbox"
                              />
                              <span>{requestClass.name}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          className="ghost-button"
                          onClick={() => handleRemoveEdge(edge.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
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
      routingWeight: edge.routing_rule.value ?? 1,
      fanoutMultiplier: edge.fanout_multiplier ?? 1,
      timeoutMS: edge.timeout_ms ?? 0,
      retryAttempts: edge.retry_attempts ?? 0,
      requestClassIDs: edge.request_class_ids ?? [],
    },
  };
}

function flowEdgeToGraphEdge(edge: Edge<FlowEdgeData>): GraphEdge {
  return {
    id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    interaction_type: edge.data?.interactionType ?? "sync_request",
    fanout_multiplier: edge.data?.fanoutMultiplier ?? 1,
    timeout_ms: edge.data?.timeoutMS ?? 0,
    retry_attempts: edge.data?.retryAttempts ?? 0,
    request_class_ids: edge.data?.requestClassIDs ?? [],
    routing_rule: {
      rule_type: edge.data?.ruleType ?? "always",
      value: edge.data?.routingWeight ?? 1,
    },
  };
}

function buildEdgeLabel(
  edge: Edge<FlowEdgeData>,
  result:
    | {
        routed_rps: number;
      }
    | undefined,
) {
  const semantic =
    edge.data?.interactionType === "fallback"
      ? "fallback"
      : edge.data?.ruleType && edge.data.ruleType !== "always"
        ? edge.data.ruleType
        : edge.data?.interactionType ?? "sync_request";
  const weightLabel =
    edge.data?.routingWeight && edge.data.routingWeight > 1
      ? ` w${edge.data.routingWeight}`
      : "";
  const fanoutLabel =
    edge.data?.fanoutMultiplier && edge.data.fanoutMultiplier > 1
      ? ` x${edge.data.fanoutMultiplier}`
      : "";
  const timeoutLabel =
    edge.data?.timeoutMS && edge.data.timeoutMS > 0
      ? ` ${edge.data.timeoutMS}ms`
      : "";
  const retryLabel =
    edge.data?.retryAttempts && edge.data.retryAttempts > 0
      ? ` r${edge.data.retryAttempts}`
      : "";
  const throughputLabel = result
    ? ` · ${formatCompactNumber(result.routed_rps)} rps`
    : "";

  return `${semantic}${weightLabel}${fanoutLabel}${timeoutLabel}${retryLabel}${throughputLabel}`;
}

function getEdgeHighlight(
  edge: Edge<FlowEdgeData>,
  result:
    | {
        routed_rps: number;
        source_node_id?: string;
        target_node_id?: string;
        timed_out_rps?: number;
      }
    | undefined,
  allEdgeResults: Array<{
    routed_rps: number;
  }>,
  nodeResultsByID?: Map<
    string,
    {
      utilization: number;
      dropped_rps: number;
      queue_lag_ms?: number;
    }
  >,
) {
  const maxRouted = Math.max(
    1,
    ...allEdgeResults.map((edgeResult) => edgeResult.routed_rps),
  );
  const loadRatio = result ? result.routed_rps / maxRouted : 0;
  const isFallback = edge.data?.interactionType === "fallback";
  const sourceResult = nodeResultsByID?.get(edge.source);
  const targetResult = nodeResultsByID?.get(edge.target);
  const isUnderPressure =
    (sourceResult?.utilization ?? 0) >= 0.8 ||
    (targetResult?.utilization ?? 0) >= 0.8 ||
    (sourceResult?.dropped_rps ?? 0) > 0 ||
    (targetResult?.dropped_rps ?? 0) > 0 ||
    (sourceResult?.queue_lag_ms ?? 0) > 0 ||
    (targetResult?.queue_lag_ms ?? 0) > 0;

  if (isFallback && result && result.routed_rps > 0) {
    return {
      stroke: "#d9903d",
      strokeWidth: 4,
      dashed: true,
      animated: true,
    };
  }

  if (isFallback) {
    return {
      stroke: "#e3b06f",
      strokeWidth: 2.5,
      dashed: true,
      animated: false,
    };
  }

  if (result && (result.timed_out_rps ?? 0) > 0) {
    return {
      stroke: "#d84d3a",
      strokeWidth: 4.25,
      dashed: false,
      animated: true,
    };
  }

  if (isUnderPressure && loadRatio >= 0.45) {
    return {
      stroke: "#d84d3a",
      strokeWidth: loadRatio >= 0.85 ? 4.25 : 3.5,
      dashed: false,
      animated: loadRatio >= 0.85,
    };
  }

  if (loadRatio >= 0.85) {
    return {
      stroke: "#2f9e63",
      strokeWidth: 4,
      dashed: false,
      animated: true,
    };
  }

  if (loadRatio >= 0.45) {
    return {
      stroke: "#52b47b",
      strokeWidth: 3.25,
      dashed: false,
      animated: false,
    };
  }

  if (result && result.routed_rps > 0) {
    return {
      stroke: "#7ac596",
      strokeWidth: 2.75,
      dashed: false,
      animated: false,
    };
  }

  return {
    stroke: "#a8b6cb",
    strokeWidth: 2,
    dashed: false,
    animated: false,
  };
}

function buildCatalogCardStyle(color: GraphNode["color"]) {
  const palette = getNodePalette(color);
  return {
    background: palette.background,
    border: `1px solid ${palette.border}`,
    color: palette.text,
  };
}

function buildNodeLabel(
  nodeData: FlowNodeData,
  result:
    | {
        utilization: number;
        incoming_rps: number;
        queue_lag_ms?: number;
      }
    | undefined,
): ReactNode {
  return (
    <div className="flow-node-copy">
      <div className="flow-node-copy__eyebrow">
        <span>{nodeData.archetype.replaceAll("_", " ")}</span>
        <span>{result ? statusLabel(result.utilization) : "ready"}</span>
      </div>
      <strong>{nodeData.label}</strong>
      {result ? (
        <div className="flow-node-copy__meta">
          <span>{Math.max(1, nodeData.properties.replicas ?? 1)} replicas</span>
          <span>{Math.round(result.utilization * 100)}% util</span>
          <span>{formatCompactNumber(result.incoming_rps)} rps</span>
          {result.queue_lag_ms ? <span>{Math.round(result.queue_lag_ms)} ms lag</span> : null}
        </div>
      ) : (
        <div className="flow-node-copy__meta">
          <span>{Math.max(1, nodeData.properties.replicas ?? 1)} replicas</span>
        </div>
      )}
    </div>
  );
}

function summarizePathForCard(
  path: {
    node_ids: string[];
  },
  nodeLabelsByID: Map<string, string>,
) {
  const labels = path.node_ids
    .slice(0, 3)
    .map((nodeID) => nodeLabelsByID.get(nodeID) ?? nodeID);

  if (path.node_ids.length > 3) {
    labels.push("...");
  }

  return labels.join(" -> ");
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

function getNodePalette(color: GraphNode["color"]) {
  switch (color) {
    case "blue":
      return {
        background: "linear-gradient(180deg, #edf4ff 0%, #d9e9ff 100%)",
        border: "#4f88da",
        text: "#173561",
      };
    case "green":
      return {
        background: "linear-gradient(180deg, #ecfbf3 0%, #d5f0e2 100%)",
        border: "#3aa57a",
        text: "#163a2c",
      };
    case "yellow":
      return {
        background: "linear-gradient(180deg, #fff7de 0%, #fee9b1 100%)",
        border: "#cc9732",
        text: "#61430b",
      };
    case "red":
      return {
        background: "linear-gradient(180deg, #fff0eb 0%, #ffd8cf 100%)",
        border: "#d47a68",
        text: "#5e2319",
      };
    default:
      return {
        background: "linear-gradient(180deg, #edf4ff 0%, #d9e9ff 100%)",
        border: "#4f88da",
        text: "#173561",
      };
  }
}

function colorLabel(color: GraphNode["color"]) {
  switch (color) {
    case "blue":
      return "Cobalt";
    case "green":
      return "Mint";
    case "yellow":
      return "Amber";
    case "red":
      return "Coral";
    default:
      return color;
  }
}

function statusLabel(utilization: number) {
  if (utilization >= 1) {
    return "saturated";
  }

  if (utilization >= 0.8) {
    return "warming";
  }

  if (utilization > 0) {
    return "healthy";
  }

  return "ready";
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

function formatAutosaveState(
  savedDesign: Design | null,
  autosaveState: "idle" | "pending" | "saving" | "saved" | "error",
) {
  if (!savedDesign) {
    return "Manual save only";
  }

  switch (autosaveState) {
    case "pending":
      return "Pending";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
    case "error":
      return "Needs attention";
    default:
      return "Idle";
  }
}

function utilizationBorderColor(utilization: number, fallbackColor: string) {
  if (utilization >= 1) {
    return "#d84d3a";
  }

  if (utilization >= 0.8) {
    return "#d84d3a";
  }

  if (utilization > 0) {
    return "#4f6ef7";
  }

  return fallbackColor;
}

function utilizationBackground(
  color: GraphNode["color"],
  utilization: number,
) {
  if (utilization >= 1) {
    return "linear-gradient(180deg, #ffe5e1 0%, #ffd8d1 100%)";
  }

  if (utilization >= 0.8) {
    return "linear-gradient(180deg, #fff0ed 0%, #ffe2db 100%)";
  }

  return getNodePalette(color).background;
}

function parseEdgeFanoutInput(
  value: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: 1 };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: "Edge fanout multiplier must be a positive number.",
    };
  }

  return { ok: true, value: parsed };
}

function parsePositiveDecimalInput(
  value: string,
  errorMessage: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      ok: false,
      error: errorMessage,
    };
  }

  return { ok: true, value: parsed };
}

function parseWholeNumberInput(
  value: string,
  errorMessage: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      error: errorMessage,
    };
  }

  return { ok: true, value: parsed };
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
