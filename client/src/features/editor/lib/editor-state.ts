import type { GraphEdge, GraphNode, RequestClass } from "../../../lib/api";

export type EditorSnapshot = {
  draftName: string;
  draftDescription: string;
  requestClasses: RequestClass[];
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function captureEditorSnapshot(input: EditorSnapshot): EditorSnapshot {
  return {
    draftName: input.draftName,
    draftDescription: input.draftDescription,
    requestClasses: structuredClone(input.requestClasses),
    nodes: structuredClone(input.nodes),
    edges: structuredClone(input.edges),
  };
}

export function pushUndoSnapshot(
  stack: EditorSnapshot[],
  snapshot: EditorSnapshot,
  limit = 40,
): EditorSnapshot[] {
  return [...stack, snapshot].slice(-limit);
}
