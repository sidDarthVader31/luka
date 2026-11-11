import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
  EdgeInteractionType,
  GraphEdge,
  GraphNode,
  RequestClass,
  RoutingRuleType,
  RunEdgeResult,
  RunNodeResult,
  SimulationResult,
  Workload,
} from "../../lib/api";
import {
  createDesign,
  getDesign,
  listComponentArchetypes,
  simulate,
  updateDesign,
} from "../../lib/api";
import { formatCompactNumber } from "../../lib/format";
import {
  buildDraftDesign,
  buildEdge,
  cloneDesignIntoDraft,
  createBlankDraft,
  createNodeFromArchetype,
  getSupportedEdgeOptions,
} from "../../lib/design-draft";
import { ComponentPalette } from "./components/ComponentPalette";
import { LoadPanel } from "./components/LoadPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { SelectionContextSheet } from "./components/SelectionContextSheet";
import { captureEditorSnapshot, pushUndoSnapshot } from "./lib/editor-state";
import { resolveEdgeDefaults } from "./lib/edge-defaults";
import {
  buildEdgeLabel,
  flowEdgeToGraphEdge,
  flowNodeToGraphNode,
  graphEdgeToFlowEdge,
  graphNodeToFlowNode,
  withResolvedHandles,
  type FlowEdgeData,
} from "./lib/flow-mappers";
import { pickHandlesForNodes } from "./lib/handle-geometry";
import { validateGraphForRun } from "./lib/graph-validation";
import { pathCoverageWarnings } from "./lib/traffic-paths";
import { nodeTypes } from "./nodes/nodeTypes";
import type { SystemNodeData } from "./nodes/SystemNode";

type DockTab = "load" | "results";

type DesignEditorPageProps = {
  mode: "new" | "draft" | "saved";
};

export function DesignEditorPage({ mode }: DesignEditorPageProps) {
  const { designId } = useParams();
  const navigate = useNavigate();
  const blank = createBlankDraft();

  const [archetypes, setArchetypes] = useState<ComponentArchetype[]>([]);
  const [draftName, setDraftName] = useState(blank.name);
  const [draftDescription, setDraftDescription] = useState(blank.description);
  const [requestClasses, setRequestClasses] = useState<RequestClass[]>(blank.requestClasses);
  const [savedDesign, setSavedDesign] = useState<Design | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dockTab, setDockTab] = useState<DockTab>("load");
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceID, setConnectSourceID] = useState<string | null>(null);
  const [selectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [selectedEdgeID, setSelectedEdgeID] = useState<string | null>(null);

  const [requestsPerSecond, setRequestsPerSecond] = useState("10000");
  const [concurrentUsers, setConcurrentUsers] = useState("50000");
  const [payloadKB, setPayloadKB] = useState("8");
  const [fanoutCount, setFanoutCount] = useState("1");
  // Not exposed in the Load panel yet; sent as a fixed default.
  const readWriteRatio = "4";

  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
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
  const resizeUndoPushed = useRef(false);

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

  const coverageWarnings = useMemo(
    () => pathCoverageWarnings(requestClasses, graphEdges),
    [requestClasses, graphEdges],
  );

  const loadIssueCount = preflight.issues.length + coverageWarnings.length;

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
      ? lastResult
      : lastResult?.flows?.find((flow) => flow.request_class_id === activeFlowResultID);

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
              result !== undefined ? `${Math.round(result.utilization * 100)}%` : undefined,
            trafficLabel:
              result !== undefined ? `${formatCompactNumber(result.incoming_rps)} in` : undefined,
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
        const resolved = withResolvedHandles(edge, nodes);
        const result = edgeResultsByID.get(edge.id);
        const selected = edge.id === selectedEdgeID;
        return {
          ...resolved,
          label: buildEdgeLabel(resolved, result?.routed_rps),
          animated: Boolean(result && result.routed_rps > 0 && (result.timed_out_rps ?? 0) > 0),
          style: {
            stroke: selected ? "var(--accent)" : "var(--edge)",
            strokeWidth: selected ? 1.75 : 1.25,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: selected ? "var(--accent)" : "var(--edge-marker)",
          },
        };
      }),
    [edges, nodes, edgeResultsByID, selectedEdgeID],
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
      setLastResult(null);
      setConnectSourceID(null);
      undoStack.current = [];
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    void (async () => {
      try {
        setArchetypes(await listComponentArchetypes());
      } catch (error) {
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
        } catch {
          setAutosaveState("error");
        }
      })();
    }, 900);
    return () => window.clearTimeout(handle);
  }, [savedDesign, isDirty, draftName, draftDescription, graphNodes, graphEdges, requestClasses]);

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
  }, [flowInstance, selectedEdgeID, selectedNodeID, setEdges, setNodes, pushUndo, markDirty]);

  function onNodesChange(changes: NodeChange<Node<SystemNodeData>>[]) {
    for (const change of changes) {
      if (change.type === "dimensions" && change.resizing && !resizeUndoPushed.current) {
        pushUndo();
        resizeUndoPushed.current = true;
      }
      if (change.type === "dimensions" && change.resizing === false) {
        resizeUndoPushed.current = false;
      }
    }
    onNodesChangeBase(changes);
    if (
      changes.some(
        (change) =>
          change.type === "position" ||
          change.type === "remove" ||
          (change.type === "dimensions" && change.resizing === true),
      )
    ) {
      markDirty();
    }
  }

  function onEdgesChange(changes: EdgeChange<Edge<FlowEdgeData>>[]) {
    onEdgesChangeBase(changes);
    if (changes.some((change) => change.type === "remove")) {
      markDirty();
    }
  }

  function createConnection(
    sourceID: string,
    targetID: string,
    sourceHandleID?: string | null,
    targetHandleID?: string | null,
  ) {
    if (sourceID === targetID) {
      showToast("Source and target must be different nodes.");
      return;
    }
    const sourceNode = nodes.find((node) => node.id === sourceID);
    const targetNode = nodes.find((node) => node.id === targetID);
    const picked = sourceNode && targetNode ? pickHandlesForNodes(sourceNode, targetNode) : null;
    const resolvedSourceHandle = sourceHandleID || picked?.sourceHandle;
    const resolvedTargetHandle = targetHandleID || picked?.targetHandle;

    const defaults = resolveEdgeDefaults({
      sourceNodeID: sourceID,
      nodes: graphNodes,
      archetypes,
    });
    pushUndo();
    const edge = buildEdge({
      sourceNodeID: sourceID,
      targetNodeID: targetID,
      sourceHandleID: resolvedSourceHandle,
      targetHandleID: resolvedTargetHandle,
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
    showToast(
      `Connected as ${defaults.interactionType.replaceAll("_", " ")} — edit in the side sheet`,
    );
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }
    createConnection(
      connection.source,
      connection.target,
      connection.sourceHandle,
      connection.targetHandle,
    );
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
  }

  function placeArchetype(archetype: ComponentArchetype, position?: { x: number; y: number }) {
    if (archetype.archetype === "client" && hasClient) {
      showToast("Only one Client node is supported.");
      return;
    }
    pushUndo();
    const graphNode = createNodeFromArchetype(archetype, graphNodes, position);
    setNodes((current) => [...current, graphNodeToFlowNode(graphNode)]);
    markDirty();
    setSelectedNodeID(graphNode.id);
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const archetypeKey = event.dataTransfer.getData("application/luka-archetype");
    const archetype =
      archetypes.find((item) => item.archetype === archetypeKey) ?? dragArchetype.current;
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

  function buildWorkload(): Workload | null {
    const rps = Number(requestsPerSecond);
    const users = Number(concurrentUsers);
    const ratio = Number(readWriteRatio);
    const payload = Number(payloadKB);
    const fanout = Number(fanoutCount);
    if (!(rps > 0) || users < 0 || !(ratio > 0) || !(payload > 0) || !(fanout > 0)) {
      showToast("Check load inputs — RPS and sizes must be positive.");
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
      setSelectedNodeID(null);
      setSelectedEdgeID(null);
      setDockTab("load");
      return;
    }
    if (coverageWarnings.length > 0) {
      setSelectedNodeID(null);
      setSelectedEdgeID(null);
      setDockTab("load");
      showToast(coverageWarnings[0]!.message);
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
      const result = await simulate(
        isDirty || !savedDesign
          ? { design: designPayload, workload }
          : { design_id: savedDesign.id, workload },
      );
      setLastResult(result);
      setActiveFlowResultID("overall");
      setSelectedNodeID(null);
      setSelectedEdgeID(null);
      setDockTab("results");
      showToast(result.summary || "Simulation complete");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(false);
    }
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
        edge.id === selectedEdgeID ? { ...edge, data: { ...edge.data!, ...patch } } : edge,
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
          <input
            className="editor-topbar__description"
            value={draftDescription}
            placeholder="Short description (optional)"
            onChange={(event) => {
              setDraftDescription(event.target.value);
              markDirty();
            }}
            aria-label="Design description"
          />
        </div>
        <div className="editor-topbar__status">
          <span>{autosaveState}</span>
        </div>
        <div className="editor-topbar__actions">
          <button className="btn btn--ghost" type="button" onClick={() => navigate("/")}>
            Library
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => void handleSave()}>
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
          </div>

          {nodes.length === 0 ? (
            <div className="editor-canvas__empty">
              <h2>Drop a Client to start</h2>
              <p>
                Drag from a node&apos;s <strong>edge</strong> to connect; drag the{" "}
                <strong>center</strong> to move. Optional: Click connect (C) for two-click linking.
              </p>
              <div className="editor-canvas__empty-actions">
                <Link className="btn" to="/">
                  Browse samples in the library
                </Link>
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
            connectionLineStyle={{ stroke: "var(--accent)", strokeWidth: 1.5 }}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { strokeWidth: 1.25, stroke: "var(--edge)" },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 14,
                height: 14,
                color: "var(--edge-marker)",
              },
            }}
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeID(edge.id);
              setSelectedNodeID(null);
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
              color="var(--grid)"
              variant={BackgroundVariant.Lines}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </section>

        <aside className="editor-dock">
          <div className="editor-dock__tabs">
            {(["load", "results"] as DockTab[]).map((tab) => (
              <button
                key={tab}
                className="editor-dock__tab"
                type="button"
                data-active={!selectedNode && !selectedEdge && dockTab === tab}
                onClick={() => {
                  setSelectedNodeID(null);
                  setSelectedEdgeID(null);
                  setDockTab(tab);
                }}
              >
                {tab === "load" ? "Load" : "Results"}
              </button>
            ))}
            {selectedNode || selectedEdge ? (
              <span className="editor-dock__tab editor-dock__tab--context" data-active="true">
                Selected
              </span>
            ) : null}
          </div>
          <div className="editor-dock__body">
            {selectedNode || selectedEdge ? (
              <SelectionContextSheet
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                requestClasses={requestClasses}
                edgeOptions={edgeOptions}
                onDone={() => {
                  setSelectedNodeID(null);
                  setSelectedEdgeID(null);
                }}
                onUpdateNode={updateSelectedNode}
                onUpdateEdge={updateSelectedEdge}
                onRemoveNode={() => {
                  if (!selectedNode) {
                    return;
                  }
                  pushUndo();
                  setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
                  setEdges((current) =>
                    current.filter(
                      (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id,
                    ),
                  );
                  setSelectedNodeID(null);
                  markDirty();
                }}
                onRemoveEdge={() => {
                  if (!selectedEdge) {
                    return;
                  }
                  pushUndo();
                  setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
                  setSelectedEdgeID(null);
                  markDirty();
                }}
              />
            ) : dockTab === "load" ? (
              <LoadPanel
                requestsPerSecond={requestsPerSecond}
                concurrentUsers={concurrentUsers}
                payloadKB={payloadKB}
                fanoutCount={fanoutCount}
                requestClasses={requestClasses}
                graphEdges={graphEdges}
                preflightIssueCount={loadIssueCount}
                onRequestsPerSecondChange={setRequestsPerSecond}
                onConcurrentUsersChange={setConcurrentUsers}
                onPayloadKBChange={setPayloadKB}
                onFanoutCountChange={setFanoutCount}
                onRequestClassesChange={(next, options) => {
                  pushUndo();
                  setRequestClasses(next);
                  if (options?.retagEdges) {
                    const ids = next.map((path) => path.id);
                    setEdges((current) =>
                      current.map((edge) => ({
                        ...edge,
                        data: {
                          ...edge.data!,
                          requestClassIDs: ids,
                        },
                      })),
                    );
                  }
                  markDirty();
                }}
              />
            ) : (
              <ResultsPanel
                result={lastResult}
                activeFlowResultID={activeFlowResultID}
                activeResult={activeResult}
                onActiveFlowChange={setActiveFlowResultID}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
