import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

import { getDesign, listRunsForDesign, type Design, type Run } from "../../lib/api";
import {
  graphEdgeToFlowEdge,
  graphNodeToFlowNode,
  type FlowEdgeData,
} from "../editor/lib/flow-mappers";
import { formatCompactNumber } from "../editor/lib/run-comparison";
import { nodeTypes } from "../editor/nodes/nodeTypes";
import type { SystemNodeData } from "../editor/nodes/SystemNode";
import type { Edge, Node } from "@xyflow/react";

export function PresentModePage() {
  const { designId = "" } = useParams();
  const [design, setDesign] = useState<Design | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SystemNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getDesign(designId);
        setDesign(loaded);
        setNodes(loaded.graph.nodes.map(graphNodeToFlowNode));
        setEdges(loaded.graph.edges.map(graphEdgeToFlowEdge));
        const runs = await listRunsForDesign(designId);
        setRun(runs[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load design");
      }
    })();
  }, [designId, setNodes, setEdges]);

  const displayNodes = useMemo(() => {
    const results = new Map((run?.result?.nodes ?? []).map((node) => [node.node_id, node]));
    const bottleneck = run?.result?.bottleneck?.node_id;
    return nodes.map((node) => {
      const result = results.get(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          utilization: result?.utilization,
          utilizationLabel:
            result !== undefined ? `${Math.round(result.utilization * 100)}%` : undefined,
          trafficLabel:
            result !== undefined
              ? `${formatCompactNumber(result.incoming_rps)} in`
              : undefined,
          isBottleneck: bottleneck === node.id,
        },
      };
    });
  }, [nodes, run]);

  if (error) {
    return (
      <main className="present-page">
        <div className="present-page__banner">
          <h1>Present mode</h1>
          <p>{error}</p>
          <Link to="/">Back to library</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="present-page">
      <div className="present-page__banner">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <h1>{design?.name ?? "Loading…"}</h1>
            <p>
              {run?.result?.summary ??
                "No run yet — open the editor and run a simulation first."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "start" }}>
            <Link className="btn" to={`/designs/${designId}`}>
              Edit
            </Link>
            <Link className="btn btn--ghost" to="/">
              Library
            </Link>
          </div>
        </div>
        {run?.result?.bottleneck ? (
          <div className="metric-strip" style={{ marginTop: "0.85rem" }}>
            <div className="metric-strip__kicker">Bottleneck</div>
            <strong>
              {run.result.bottleneck.label} ·{" "}
              {Math.round(run.result.bottleneck.utilization * 100)}% util
            </strong>
          </div>
        ) : null}
      </div>
      <div className="present-page__canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={edges.map((edge) => ({
            ...edge,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#9aa8b8" },
          }))}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="rgba(26,35,50,0.08)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </main>
  );
}
