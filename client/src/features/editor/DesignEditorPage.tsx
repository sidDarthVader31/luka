import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
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
} from "../../lib/api";
import {
  createDesign,
  createRun,
  duplicateDesign,
  getDesign,
  getStatus,
  listComponentArchetypes,
  listDesignVersions,
  listRunsForDesign,
  updateDesign,
} from "../../lib/api";
import {
  buildDraftDesign,
  buildEdge,
  cloneDesignIntoDraft,
  createBlankDraft,
  createNodeFromArchetype,
  createRequestClass,
  getSupportedEdgeOptions,
} from "../../lib/design-draft";
import { ComponentPalette } from "./components/ComponentPalette";
import {
  applyPreset,
  matchPreset,
  PROPERTY_LABELS,
  supportsCapacityPresets,
  type CapacitySize,
} from "./lib/capacity-presets";
import { captureEditorSnapshot, pushUndoSnapshot } from "./lib/editor-state";
import { resolveEdgeDefaults } from "./lib/edge-defaults";
import {
  buildEdgeLabel,
  flowEdgeToGraphEdge,
  flowNodeToGraphNode,
  graphEdgeToFlowEdge,
  graphNodeToFlowNode,
  type FlowEdgeData,
} from "./lib/flow-mappers";
import { validateGraphForRun } from "./lib/graph-validation";
import {
  buildExportMarkdown,
  buildRunComparison,
  formatCompactNumber,
  formatSignedNumber,
  formatSignedPercent,
  formatWorkload,
} from "./lib/run-comparison";
import { nodeTypes } from "./nodes/nodeTypes";
import type { SystemNodeData } from "./nodes/SystemNode";

const SAMPLE_CHAT = "sample-cache-aside";
const SAMPLE_QUEUE = "sample-queue-workflow";

type DockTab = "inspect" | "scenario" | "results";

type DesignEditorPageProps = {
  mode: "new" | "draft" | "saved";
};

export function DesignEditorPage({ mode }: DesignEditorPageProps) {
  const { designId } = useParams();
  const navigate = useNavigate();
  const blank = createBlankDraft();

  const [archetypes, setArchetypes] = useState<ComponentArchetype[]>([]);
  const [apiStatus, setApiStatus] = useState("…");
  const [draftName, setDraftName] = useState(blank.name);
  const [draftDescription, setDraftDescription] = useState(blank.description);
  const [requestClasses, setRequestClasses] = useState<RequestClass[]>(
    blank.requestClasses,
  );
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dockTab, setDockTab] = useState<DockTab>("scenario");
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceID, setConnectSourceID] = useState<string | null>(null);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [selectedEdgeID, setSelectedEdgeID] = useState<string | null>(null);
  const [showAdvancedConnect, setShowAdvancedConnect] = useState(false);

  const [requestsPerSecond, setRequestsPerSecond] = useState("10000");
  const [concurrentUsers, setConcurrentUsers] = useState("50000");
  const [readWriteRatio, setReadWriteRatio] = useState("4");
  const [payloadKB, setPayloadKB] = useState("8");
  const [fanoutCount, setFanoutCount] = useState("1");

  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [baselineRun, setBaselineRun] = useState<Run | null>(null);
  const [designRuns, setDesignRuns] = useState<Run[]>([]);
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([]);
  const [activeFlowResultID, setActiveFlowResultID] = useState("overall");
  const [showPreflight, setShowPreflight] = useState(false);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node<SystemNodeData>>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    Node<SystemNodeData>,
    Edge<FlowEdgeData>
  > | null>(null);
  const undoStack = useRef<ReturnType<typeof captureEditorSnapshot>[]>([]);
  const dragArchetype = useRef<ComponentArchetype | null>(null);
  const toastTimer = useRef<number | null>(null);

  const graphNodes = useMemo(() => nodes.map(flowNodeToGraphNode), [nodes]);
  const graphEdges = useMemo(() => edges.map(flowEdgeToGraphEdge), [edges]);
  const hasClient = graphNodes.some((node) => node.archetype === "client");
  const selectedNode = nodes.find((node) => node.id === selectedNodeID) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeID) ?? null;

  const preflight = useMemo(
    () =>
      validateGraphForRun({
        nodes: graphNodes,
        edges: graphEdges,
        requestClasses,
      }),
    [graphNodes, graphEdges, requestClasses],
  );

  const errorNodeIDs = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of preflight.issues) {
      for (const id of issue.nodeIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [preflight.issues]);

  const activeResult =
    activeFlowResultID === "overall"
      ? lastRun?.result
      : lastRun?.result?.flows?.find((flow) => flow.request_class_id === activeFlowResultID);

  const nodeResultsByID = useMemo(() => {
    return new Map<string, RunNodeResult>(
      (activeResult?.nodes ?? []).map((node) => [node.node_id, node]),
    );
  }, [activeResult]);

  const edgeResultsByID = useMemo(() => {
    return new Map<string, RunEdgeResult>(
      (activeResult?.edges ?? []).map((edge) => [edge.edge_id, edge]),
    );
  }, [activeResult]);

  const runComparison =
    baselineRun && lastRun ? buildRunComparison(baselineRun, lastRun) : null;

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const result = nodeResultsByID.get(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            utilization: result?.utilization,
            utilizationLabel:
              result !== undefined
                ? `${Math.round(result.utilization * 100)}%`
                : undefined,
            trafficLabel:
              result !== undefined
                ? `${formatCompactNumber(result.incoming_rps)} in`
                : undefined,
            isBottleneck: activeResult?.bottleneck?.node_id === node.id,
            hasError: errorNodeIDs.has(node.id),
            connectSource: connectSourceID === node.id,
          },
        };
      }),
    [nodes, nodeResultsByID, activeResult, errorNodeIDs, connectSourceID],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const result = edgeResultsByID.get(edge.id);
        const selected = edge.id === selectedEdgeID;
        return {
          ...edge,
          label: buildEdgeLabel(edge, result?.routed_rps),
          animated: Boolean(result && result.routed_rps > 0 && (result.timed_out_rps ?? 0) > 0),
          style: {
            stroke: selected ? "var(--accent)" : "#7a8a9c",
            strokeWidth: selected ? 1.75 : 1.25,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: selected ? "#2f5bff" : "#5b6b7c",
          },
        };
      }),
    [edges, edgeResultsByID, selectedEdgeID],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    if (savedDesign) {
      setAutosaveState("pending");
    }
  }, [savedDesign]);

  const pushUndo = useCallback(() => {
    undoStack.current = pushUndoSnapshot(
      undoStack.current,
      captureEditorSnapshot({
        draftName,
        draftDescription,
        requestClasses,
        nodes: graphNodes,
        edges: graphEdges,
      }),
    );
  }, [draftName, draftDescription, requestClasses, graphNodes, graphEdges]);

  const applyDraft = useCallback(
    (
      draft: {
        id?: string;
        name: string;
        description: string;
        requestClasses: RequestClass[];
        nodes: GraphNode[];
        edges: GraphEdge[];
      },
      design?: Design | null,
    ) => {
      setDraftName(draft.name);
      setDraftDescription(draft.description);
      setRequestClasses(draft.requestClasses);
      setNodes(draft.nodes.map(graphNodeToFlowNode));
      setEdges(draft.edges.map(graphEdgeToFlowEdge));
      setSavedDesign(design ?? null);
      setIsDirty(false);
      setAutosaveState(design ? "saved" : "idle");
      setSelectedNodeID(null);
      setSelectedEdgeID(null);
      setLastRun(null);
      setConnectSourceID(null);
      undoStack.current = [];
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [status, items] = await Promise.all([
          getStatus(),
          listComponentArchetypes(),
        ]);
        setApiStatus(`${status.name} ${status.version}`);
        setArchetypes(items);
      } catch (error) {
        setApiStatus("offline");
        showToast(error instanceof Error ? error.message : "Failed to reach API");
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (mode === "saved" && designId) {
      void (async () => {
        setBusy(true);
        try {
          const design = await getDesign(designId);
          applyDraft(cloneDesignIntoDraft(design), design);
          const [runs, versions] = await Promise.all([
            listRunsForDesign(design.id),
            listDesignVersions(design.id),
          ]);
          setDesignRuns(runs);
          setDesignVersions(versions);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Failed to load design");
          navigate("/");
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    if (mode === "new" || mode === "draft") {
      applyDraft(createBlankDraft(), null);
    }
  }, [mode, designId, applyDraft, navigate, showToast]);

  useEffect(() => {
    if (!savedDesign || !isDirty) {
      return;
    }
    setAutosaveState("pending");
    const handle = window.setTimeout(() => {
      void (async () => {
        setAutosaveState("saving");
        try {
          const design = await updateDesign(savedDesign.id, {
            name: draftName,
            description: draftDescription,
            graph: {
              nodes: graphNodes,
              edges: graphEdges,
              request_classes: requestClasses,
            },
          });
          setSavedDesign(design);
          setIsDirty(false);
          setAutosaveState("saved");
          setDesignVersions(await listDesignVersions(design.id));
        } catch {
          setAutosaveState("error");
        }
      })();
    }, 900);
    return () => window.clearTimeout(handle);
  }, [
    savedDesign,
    isDirty,
    draftName,
    draftDescription,
    graphNodes,
    graphEdges,
    requestClasses,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) {
        return;
      }
      if (event.key === "c" || event.key === "C") {
        setConnectMode((value) => !value);
        setConnectSourceID(null);
      }
      if (event.key === "f" || event.key === "F") {
        flowInstance?.fitView({ duration: 300, padding: 0.2 });
      }
      if (event.key === "Escape") {
        setConnectMode(false);
        setConnectSourceID(null);
        setShowPreflight(false);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !typing) {
        if (selectedEdgeID) {
          pushUndo();
          setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeID));
          setSelectedEdgeID(null);
          markDirty();
        } else if (selectedNodeID) {
          pushUndo();
          setNodes((current) => current.filter((node) => node.id !== selectedNodeID));
          setEdges((current) =>
            current.filter(
              (edge) => edge.source !== selectedNodeID && edge.target !== selectedNodeID,
            ),
          );
          setSelectedNodeID(null);
          markDirty();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault();
        const snapshot = undoStack.current.pop();
        if (!snapshot) {
          return;
        }
        setDraftName(snapshot.draftName);
        setDraftDescription(snapshot.draftDescription);
        setRequestClasses(snapshot.requestClasses);
        setNodes(snapshot.nodes.map(graphNodeToFlowNode));
        setEdges(snapshot.edges.map(graphEdgeToFlowEdge));
        markDirty();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    flowInstance,
    selectedEdgeID,
    selectedNodeID,
    setEdges,
    setNodes,
    pushUndo,
    markDirty,
  ]);

  function onNodesChange(changes: NodeChange<Node<SystemNodeData>>[]) {
    onNodesChangeBase(changes);
    if (changes.some((change) => change.type === "position" || change.type === "remove")) {
      markDirty();
    }
  }

  function onEdgesChange(changes: EdgeChange<Edge<FlowEdgeData>>[]) {
    onEdgesChangeBase(changes);
    if (changes.some((change) => change.type === "remove")) {
      markDirty();
    }
  }

  function createConnection(sourceID: string, targetID: string) {
    if (sourceID === targetID) {
      showToast("Source and target must be different nodes.");
      return;
    }
    const defaults = resolveEdgeDefaults({
      sourceNodeID: sourceID,
      nodes: graphNodes,
      archetypes,
    });
    pushUndo();
    const edge = buildEdge({
      sourceNodeID: sourceID,
      targetNodeID: targetID,
      interactionType: defaults.interactionType,
      ruleType: defaults.ruleType,
      requestClassIDs: requestClasses[0] ? [requestClasses[0].id] : undefined,
      existingEdges: graphEdges,
    });
    setEdges((current) =>
      addEdge(
        {
          ...graphEdgeToFlowEdge(edge),
        },
        current,
      ),
    );
    markDirty();
    setSelectedEdgeID(edge.id);
    setDockTab("inspect");
    showToast(
      `Connected as ${defaults.interactionType.replaceAll("_", " ")} — change in Inspect`,
    );
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }
    createConnection(connection.source, connection.target);
  }

  function handleNodeClick(nodeID: string) {
    if (connectMode) {
      if (!connectSourceID) {
        setConnectSourceID(nodeID);
        showToast("Click a target node to connect");
        return;
      }
      if (connectSourceID === nodeID) {
        setConnectSourceID(null);
        return;
      }
      createConnection(connectSourceID, nodeID);
      setConnectSourceID(null);
      return;
    }
    setSelectedNodeID(nodeID);
    setSelectedEdgeID(null);
    setDockTab("inspect");
  }

  function placeArchetype(
    archetype: ComponentArchetype,
    position?: { x: number; y: number },
  ) {
    if (archetype.archetype === "client" && hasClient) {
      showToast("Only one Client node is supported.");
      return;
    }
    pushUndo();
    const graphNode = createNodeFromArchetype(archetype, graphNodes, position);
    setNodes((current) => [...current, graphNodeToFlowNode(graphNode)]);
    markDirty();
    setSelectedNodeID(graphNode.id);
    setDockTab("inspect");
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const archetypeKey = event.dataTransfer.getData("application/luka-archetype");
    const archetype =
      archetypes.find((item) => item.archetype === archetypeKey) ??
      dragArchetype.current;
    if (!archetype || !flowInstance) {
      return;
    }
    const position = flowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    placeArchetype(archetype, position);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const payload = {
        name: draftName,
        description: draftDescription,
        graph: {
          nodes: graphNodes,
          edges: graphEdges,
          request_classes: requestClasses,
        },
      };
      const design = savedDesign
        ? await updateDesign(savedDesign.id, payload)
        : await createDesign(payload);
      setSavedDesign(design);
      setIsDirty(false);
      setAutosaveState("saved");
      setDesignVersions(await listDesignVersions(design.id));
      showToast(`Saved ${design.name}`);
      if (!designId || designId !== design.id) {
        navigate(`/designs/${design.id}`, { replace: true });
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!savedDesign) {
      showToast("Save the design before creating a variant.");
      return;
    }
    setBusy(true);
    try {
      const design = await duplicateDesign(savedDesign.id, {
        name: `${draftName} Variant`,
      });
      showToast(`Created ${design.name}`);
      navigate(`/designs/${design.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadSample(sampleID: string) {
    setBusy(true);
    try {
      const design = await getDesign(sampleID);
      applyDraft(cloneDesignIntoDraft(design), design);
      setDesignRuns(await listRunsForDesign(design.id));
      setDesignVersions(await listDesignVersions(design.id));
      showToast(`Loaded ${design.name}`);
      navigate(`/designs/${design.id}`, { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load sample");
    } finally {
      setBusy(false);
    }
  }

  function buildWorkload(): Workload | null {
    const rps = Number(requestsPerSecond);
    const users = Number(concurrentUsers);
    const ratio = Number(readWriteRatio);
    const payload = Number(payloadKB);
    const fanout = Number(fanoutCount);
    if (!(rps > 0) || users < 0 || !(ratio > 0) || !(payload > 0) || !(fanout > 0)) {
      showToast("Check workload inputs — RPS and sizes must be positive.");
      return null;
    }
    return {
      requests_per_second: rps,
      concurrent_users: users,
      read_write_ratio: ratio,
      payload_kb: payload,
      fanout_count: fanout,
    };
  }

  async function handleRun() {
    if (!preflight.ok) {
      setShowPreflight(true);
      setDockTab("inspect");
      return;
    }
    const workload = buildWorkload();
    if (!workload) {
      return;
    }
    setBusy(true);
    try {
      const designPayload = buildDraftDesign({
        id: savedDesign?.id,
        name: draftName,
        description: draftDescription,
        nodes: graphNodes,
        edges: graphEdges,
        requestClasses,
      });
      const run = await createRun(
        isDirty || !savedDesign
          ? {
              design: designPayload,
              workload,
              simulation_config: { mode: "analytical" },
            }
          : {
              design_id: savedDesign.id,
              workload,
              simulation_config: { mode: "analytical" },
            },
      );
      setLastRun(run);
      setActiveFlowResultID("overall");
      setDockTab("results");
      if (run.result?.bottleneck?.node_id) {
        setSelectedNodeID(run.result.bottleneck.node_id);
      }
      if (savedDesign && run.design_id === savedDesign.id) {
        setDesignRuns(await listRunsForDesign(savedDesign.id));
      }
      showToast(run.result?.summary ?? "Simulation complete");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  function exportJSON() {
    const design = buildDraftDesign({
      id: savedDesign?.id,
      name: draftName,
      description: draftDescription,
      nodes: graphNodes,
      edges: graphEdges,
      requestClasses,
    });
    downloadBlob(
      `${draftName.replace(/\s+/g, "-").toLowerCase() || "design"}.json`,
      JSON.stringify(design, null, 2),
      "application/json",
    );
  }

  function exportMarkdown() {
    const workload = buildWorkload() ?? {
      requests_per_second: Number(requestsPerSecond) || 0,
    };
    const markdown = buildExportMarkdown({
      designName: draftName,
      workload,
      summary: lastRun?.result?.summary,
      bottleneckLabel: lastRun?.result?.bottleneck?.label,
      nodes: lastRun?.result?.nodes ?? [],
      pathSummary: lastRun?.result?.paths?.[0]?.summary,
    });
    downloadBlob(
      `${draftName.replace(/\s+/g, "-").toLowerCase() || "run"}-summary.md`,
      markdown,
      "text/markdown",
    );
  }

  function updateSelectedNode(
    patch: Partial<Pick<GraphNode, "label" | "color">> & {
      properties?: GraphNode["properties"];
    },
  ) {
    if (!selectedNodeID) {
      return;
    }
    pushUndo();
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeID
          ? {
              ...node,
              data: {
                ...node.data,
                label: patch.label ?? node.data.label,
                color: patch.color ?? node.data.color,
                properties: patch.properties ?? node.data.properties,
              },
            }
          : node,
      ),
    );
    markDirty();
  }

  function updateSelectedEdge(patch: Partial<FlowEdgeData>) {
    if (!selectedEdgeID) {
      return;
    }
    pushUndo();
    setEdges((current) =>
      current.map((edge) =>
        edge.id === selectedEdgeID
          ? { ...edge, data: { ...edge.data!, ...patch } }
          : edge,
      ),
    );
    markDirty();
  }

  const edgeOptions = selectedEdge
    ? getSupportedEdgeOptions({
        sourceNodeID: selectedEdge.source,
        nodes: graphNodes,
        archetypes,
      })
    : { interactions: [] as EdgeInteractionType[], routingRules: [] as RoutingRuleType[] };

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-topbar__brand">
          <Link to="/">
            <strong>Luka</strong>
          </Link>
          <span>studio</span>
        </div>
        <div className="editor-topbar__name">
          <input
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              markDirty();
            }}
            aria-label="Design name"
          />
        </div>
        <div className="editor-topbar__status">
          <span>{apiStatus}</span>
          <span>{autosaveState}</span>
        </div>
        <div className="editor-topbar__actions">
          <button className="btn btn--ghost" type="button" onClick={() => navigate("/")}>
            Library
          </button>
          {savedDesign ? (
            <Link className="btn btn--ghost" to={`/designs/${savedDesign.id}/present`}>
              Present
            </Link>
          ) : null}
          <button
            className="btn btn--ghost"
            type="button"
            disabled={busy}
            onClick={() => void handleDuplicate()}
          >
            Variant
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            Save
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={busy}
            onClick={() => void handleRun()}
          >
            Run
          </button>
        </div>
      </header>

      <div className="editor-body">
        <ComponentPalette
          archetypes={archetypes}
          hasClient={hasClient}
          onDragStart={(archetype) => {
            dragArchetype.current = archetype;
          }}
          onPlace={(archetype) => {
            const center = flowInstance?.screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            });
            placeArchetype(archetype, center);
          }}
        />

        <section
          className="editor-canvas"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleCanvasDrop}
        >
          <div className="editor-canvas__toolbar">
            <button
              className="btn btn--tool"
              type="button"
              data-active={connectMode}
              onClick={() => {
                setConnectMode((value) => !value);
                setConnectSourceID(null);
              }}
            >
              Click connect {connectMode ? "(on)" : ""}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => flowInstance?.fitView({ duration: 300, padding: 0.2 })}
            >
              Fit
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => void handleLoadSample(SAMPLE_CHAT)}
            >
              Chat sample
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => void handleLoadSample(SAMPLE_QUEUE)}
            >
              Queue sample
            </button>
          </div>

          {nodes.length === 0 ? (
            <div className="editor-canvas__empty">
              <h2>Drop a Client to start</h2>
              <p>
                Drag from a node&apos;s <strong>edge</strong> to connect; drag the{" "}
                <strong>center</strong> to move. Optional: Click connect (C) for
                two-click linking.
              </p>
              <div className="editor-canvas__empty-actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => void handleLoadSample(SAMPLE_CHAT)}
                >
                  Load chat sample
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => void handleLoadSample(SAMPLE_QUEUE)}
                >
                  Load queue sample
                </button>
              </div>
            </div>
          ) : null}

          {showPreflight && !preflight.ok ? (
            <div className="banner banner--error">
              <p className="banner__title">Fix these before running</p>
              <ul>
                {preflight.issues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
              <div className="banner__actions">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => setShowPreflight(false)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {toast ? <div className="toast">{toast}</div> : null}

          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={96}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: "#2f5bff", strokeWidth: 1.5 }}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { strokeWidth: 1.25, stroke: "#7a8a9c" },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 18,
                height: 18,
                color: "#5b6b7c",
              },
            }}
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeID(edge.id);
              setSelectedNodeID(null);
              setDockTab("inspect");
            }}
            onPaneClick={() => {
              if (!connectMode) {
                setSelectedNodeID(null);
                setSelectedEdgeID(null);
              }
            }}
            onNodeDragStart={() => pushUndo()}
            fitView
          >
            <Background
              id="grid"
              gap={24}
              size={1}
              color="rgba(26,35,50,0.08)"
              variant={BackgroundVariant.Lines}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </section>

        <aside className="editor-dock">
          <div className="editor-dock__tabs">
            {(["inspect", "scenario", "results"] as DockTab[]).map((tab) => (
              <button
                key={tab}
                className="editor-dock__tab"
                type="button"
                data-active={dockTab === tab}
                onClick={() => setDockTab(tab)}
              >
                {tab === "inspect" ? "Inspect" : tab === "scenario" ? "Scenario" : "Results"}
              </button>
            ))}
          </div>
          <div className="editor-dock__body">
            {dockTab === "inspect" ? (
              <div className="dock-section">
                {selectedNode ? (
                  <>
                    <h3>{selectedNode.data.label}</h3>
                    <p className="hint">
                      {selectedNode.data.archetype.replaceAll("_", " ")}
                    </p>
                    <div className="field-stack">
                      <label className="field">
                        <span>Label</span>
                        <input
                          value={selectedNode.data.label}
                          onChange={(event) =>
                            updateSelectedNode({ label: event.target.value })
                          }
                        />
                      </label>
                      {supportsCapacityPresets(selectedNode.data.archetype) ? (
                        <div className="field">
                          <span>Capacity size</span>
                          <div className="preset-row">
                            {(["small", "medium", "large", "custom"] as CapacitySize[]).map(
                              (size) => (
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
                                    const preset = applyPreset(
                                      selectedNode.data.archetype,
                                      size,
                                    );
                                    if (!preset) {
                                      return;
                                    }
                                    updateSelectedNode({
                                      properties: {
                                        ...selectedNode.data.properties,
                                        ...preset,
                                      },
                                    });
                                  }}
                                >
                                  {size === "custom"
                                    ? "Custom"
                                    : size[0]!.toUpperCase() + size.slice(1)}
                                </button>
                              ),
                            )}
                          </div>
                          <small>
                            Pick a size to set instances and work capacity. Custom appears
                            when you edit advanced numbers.
                          </small>
                        </div>
                      ) : null}
                      {selectedNode.data.archetype === "cache" ? (
                        <label className="field">
                          <span>{PROPERTY_LABELS.cache_hit_rate.label}</span>
                          <input
                            inputMode="decimal"
                            value={String(
                              selectedNode.data.properties.cache_hit_rate ?? 0.8,
                            )}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              updateSelectedNode({
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
                            {(
                              [
                                "replicas",
                                "capacity_rps",
                                "base_latency_ms",
                              ] as const
                            ).map((key) => {
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
                                      updateSelectedNode({
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
                            {selectedNode.data.archetype === "cache" &&
                            selectedNode.data.properties.cache_hit_rate !== undefined ? (
                              <p className="hint">
                                Hit rate is shown above; latency stays in advanced.
                              </p>
                            ) : null}
                          </div>
                        </details>
                      ) : (
                        <p className="hint">
                          Client emits traffic from the Scenario tab — no capacity size.
                        </p>
                      )}
                    </div>
                    <button
                      className="btn btn--danger"
                      type="button"
                      onClick={() => {
                        pushUndo();
                        setNodes((current) =>
                          current.filter((node) => node.id !== selectedNode.id),
                        );
                        setEdges((current) =>
                          current.filter(
                            (edge) =>
                              edge.source !== selectedNode.id &&
                              edge.target !== selectedNode.id,
                          ),
                        );
                        setSelectedNodeID(null);
                        markDirty();
                      }}
                    >
                      Remove node
                    </button>
                  </>
                ) : selectedEdge ? (
                  <>
                    <h3>Connection</h3>
                    <p className="hint">
                      {selectedEdge.source} → {selectedEdge.target}
                    </p>
                    <div className="field-stack">
                      <label className="field">
                        <span>Interaction</span>
                        <select
                          value={selectedEdge.data?.interactionType}
                          onChange={(event) =>
                            updateSelectedEdge({
                              interactionType: event.target
                                .value as EdgeInteractionType,
                            })
                          }
                        >
                          {edgeOptions.interactions.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Routing rule</span>
                        <select
                          value={selectedEdge.data?.ruleType}
                          onChange={(event) =>
                            updateSelectedEdge({
                              ruleType: event.target.value as RoutingRuleType,
                            })
                          }
                        >
                          {edgeOptions.routingRules.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Request flows</span>
                        <div className="flow-list">
                          {requestClasses.map((flow) => (
                            <label className="flow-item" key={flow.id}>
                              <input
                                type="checkbox"
                                checked={
                                  selectedEdge.data?.requestClassIDs?.includes(flow.id) ??
                                  false
                                }
                                onChange={() => {
                                  const current = selectedEdge.data?.requestClassIDs ?? [];
                                  const next = current.includes(flow.id)
                                    ? current.filter((id) => id !== flow.id)
                                    : [...current, flow.id];
                                  updateSelectedEdge({
                                    requestClassIDs:
                                      next.length > 0
                                        ? next
                                        : requestClasses[0]
                                          ? [requestClasses[0].id]
                                          : [],
                                  });
                                }}
                              />
                              {flow.name}
                            </label>
                          ))}
                        </div>
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
                                  updateSelectedEdge({
                                    routingWeight: Number(event.target.value) || 1,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Fanout</span>
                              <input
                                value={String(selectedEdge.data?.fanoutMultiplier ?? 1)}
                                onChange={(event) =>
                                  updateSelectedEdge({
                                    fanoutMultiplier: Number(event.target.value) || 1,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div className="field-row">
                            <label className="field">
                              <span>Timeout ms</span>
                              <input
                                value={String(selectedEdge.data?.timeoutMS ?? 0)}
                                onChange={(event) =>
                                  updateSelectedEdge({
                                    timeoutMS: Number(event.target.value) || 0,
                                  })
                                }
                              />
                              <small>Display-only estimate</small>
                            </label>
                            <label className="field">
                              <span>Retries</span>
                              <input
                                value={String(selectedEdge.data?.retryAttempts ?? 0)}
                                onChange={(event) =>
                                  updateSelectedEdge({
                                    retryAttempts: Number(event.target.value) || 0,
                                  })
                                }
                              />
                              <small>Does not change utilization</small>
                            </label>
                          </div>
                        </div>
                      </details>
                    </div>
                    <button
                      className="btn btn--danger"
                      type="button"
                      onClick={() => {
                        pushUndo();
                        setEdges((current) =>
                          current.filter((edge) => edge.id !== selectedEdge.id),
                        );
                        setSelectedEdgeID(null);
                        markDirty();
                      }}
                    >
                      Remove edge
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Inspect</h3>
                    <p className="hint">
                      Select a node or edge on the canvas. Drag from a node&apos;s edge
                      to connect, or use Click connect (C).
                    </p>
                    <details
                      className="advanced-block"
                      open={showAdvancedConnect}
                      onToggle={(event) =>
                        setShowAdvancedConnect((event.target as HTMLDetailsElement).open)
                      }
                    >
                      <summary>Add connection…</summary>
                      <ManualConnectForm
                        nodes={graphNodes}
                        archetypes={archetypes}
                        requestClasses={requestClasses}
                        onCreate={(source, target, interaction, rule) => {
                          pushUndo();
                          const edge = buildEdge({
                            sourceNodeID: source,
                            targetNodeID: target,
                            interactionType: interaction,
                            ruleType: rule,
                            requestClassIDs: requestClasses[0]
                              ? [requestClasses[0].id]
                              : undefined,
                            existingEdges: graphEdges,
                          });
                          setEdges((current) => [...current, graphEdgeToFlowEdge(edge)]);
                          markDirty();
                          setSelectedEdgeID(edge.id);
                        }}
                      />
                    </details>
                  </>
                )}
              </div>
            ) : null}

            {dockTab === "scenario" ? (
              <div className="dock-section">
                <h3>Scenario</h3>
                <p className="hint">Workload assumptions and request flows for this design.</p>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={2}
                    value={draftDescription}
                    onChange={(event) => {
                      setDraftDescription(event.target.value);
                      markDirty();
                    }}
                  />
                </label>
                <div className="field-stack">
                  <label className="field">
                    <span>Incoming traffic (req/sec)</span>
                    <input
                      value={requestsPerSecond}
                      onChange={(event) => setRequestsPerSecond(event.target.value)}
                    />
                    <small>Main load entering the system.</small>
                  </label>
                  <label className="field">
                    <span>Active users</span>
                    <input
                      value={concurrentUsers}
                      onChange={(event) => setConcurrentUsers(event.target.value)}
                    />
                    <small>Soft pressure on gateways and services.</small>
                  </label>
                  <label className="field">
                    <span>Write pressure (read:write)</span>
                    <input
                      value={readWriteRatio}
                      onChange={(event) => setReadWriteRatio(event.target.value)}
                    />
                    <small>Capacity penalty only — use flows for path splits.</small>
                  </label>
                  <details className="advanced-block">
                    <summary>More load assumptions</summary>
                    <div className="field-row" style={{ marginTop: "0.65rem" }}>
                      <label className="field">
                        <span>Payload KB</span>
                        <input
                          value={payloadKB}
                          onChange={(event) => setPayloadKB(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Fanout</span>
                        <input
                          value={fanoutCount}
                          onChange={(event) => setFanoutCount(event.target.value)}
                        />
                      </label>
                    </div>
                  </details>
                </div>
                <h3>Request flows</h3>
                <div className="flow-list">
                  {requestClasses.map((flow, index) => (
                    <div className="flow-item" key={flow.id}>
                      <label className="field">
                        <span>Name</span>
                        <input
                          value={flow.name}
                          onChange={(event) => {
                            pushUndo();
                            setRequestClasses((current) =>
                              current.map((item) =>
                                item.id === flow.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            );
                            markDirty();
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Share</span>
                        <input
                          value={String(flow.traffic_share ?? 100)}
                          onChange={(event) => {
                            pushUndo();
                            setRequestClasses((current) =>
                              current.map((item) =>
                                item.id === flow.id
                                  ? {
                                      ...item,
                                      traffic_share: Number(event.target.value) || 1,
                                    }
                                  : item,
                              ),
                            );
                            markDirty();
                          }}
                        />
                      </label>
                      {requestClasses.length > 1 ? (
                        <button
                          className="btn btn--ghost"
                          type="button"
                          onClick={() => {
                            pushUndo();
                            setRequestClasses((current) =>
                              current.filter((item) => item.id !== flow.id),
                            );
                            markDirty();
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                      <span className="hint">Flow {index + 1}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    pushUndo();
                    setRequestClasses((current) => [
                      ...current,
                      createRequestClass(`Flow ${current.length + 1}`, 100, current.length + 1),
                    ]);
                    markDirty();
                  }}
                >
                  Add flow
                </button>
              </div>
            ) : null}

            {dockTab === "results" ? (
              <div className="dock-section">
                <h3>Results</h3>
                {lastRun?.result ? (
                  <>
                    <div className="metric-strip">
                      <div className="metric-strip__kicker">Bottleneck</div>
                      <strong>
                        {lastRun.result.bottleneck?.label ?? "None"} ·{" "}
                        {Math.round((lastRun.result.bottleneck?.utilization ?? 0) * 100)}%
                      </strong>
                      <p>{lastRun.result.summary}</p>
                    </div>
                    {(lastRun.result.flows?.length ?? 0) > 0 ? (
                      <div className="field-row">
                        <button
                          className="btn btn--tool"
                          type="button"
                          data-active={activeFlowResultID === "overall"}
                          onClick={() => setActiveFlowResultID("overall")}
                        >
                          Overall
                        </button>
                        {lastRun.result.flows?.map((flow) => (
                          <button
                            key={flow.request_class_id}
                            className="btn btn--tool"
                            type="button"
                            data-active={activeFlowResultID === flow.request_class_id}
                            onClick={() => setActiveFlowResultID(flow.request_class_id)}
                          >
                            {flow.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {activeResult?.paths?.map((path) => (
                      <div className="metric-strip" key={path.kind}>
                        <div className="metric-strip__kicker">{path.kind}</div>
                        <p>{path.summary}</p>
                      </div>
                    ))}
                    <div className="field-row">
                      <button className="btn" type="button" onClick={exportJSON}>
                        Export JSON
                      </button>
                      <button className="btn" type="button" onClick={exportMarkdown}>
                        Export MD
                      </button>
                    </div>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setBaselineRun(lastRun)}
                    >
                      Set as baseline
                    </button>
                    {runComparison ? (
                      <>
                        <h3>Compare vs baseline</h3>
                        <p className="hint">{runComparison.message}</p>
                        <p className="hint">
                          Util {formatSignedPercent(runComparison.utilizationDelta)} ·
                          Latency {formatSignedNumber(runComparison.latencyDelta)} ms ·
                          Drop {formatSignedNumber(runComparison.droppedDelta)}
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
                              {runComparison.rows.map((row) => (
                                <tr key={row.nodeId} data-hot={row.hot}>
                                  <td>{row.label}</td>
                                  <td className="mono">
                                    {Math.round(row.latestUtil * 100)}%
                                  </td>
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
                    ) : null}
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
                    {savedDesign ? (
                      <div className="history-list">
                        {designRuns.map((run) => (
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
                        {designRuns.length === 0 ? (
                          <p className="hint">No persisted runs yet.</p>
                        ) : null}
                        <p className="hint">{designVersions.length} saved versions</p>
                      </div>
                    ) : (
                      <p className="hint">Save the design to unlock run history.</p>
                    )}
                    {savedDesign ? (
                      <span className="btn" style={{ display: "inline-flex", marginTop: "0.5rem" }}>
                        Open compare page
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ManualConnectForm(props: {
  nodes: GraphNode[];
  archetypes: ComponentArchetype[];
  requestClasses: RequestClass[];
  onCreate: (
    source: string,
    target: string,
    interaction: EdgeInteractionType,
    rule: RoutingRuleType,
  ) => void;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const options = getSupportedEdgeOptions({
    sourceNodeID: source,
    nodes: props.nodes,
    archetypes: props.archetypes,
  });

  return (
    <div className="field-stack" style={{ marginTop: "0.65rem" }}>
      <label className="field">
        <span>Source</span>
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">Select</option>
          {props.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Target</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Select</option>
          {props.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        type="button"
        disabled={!source || !target}
        onClick={() =>
          props.onCreate(
            source,
            target,
            options.interactions[0] ?? "sync_request",
            options.routingRules[0] ?? "always",
          )
        }
      >
        Add edge
      </button>
    </div>
  );
}

function downloadBlob(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
