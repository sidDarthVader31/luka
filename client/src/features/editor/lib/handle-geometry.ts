import type { Node } from "@xyflow/react";

import type { SystemNodeData } from "../nodes/SystemNode";

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 88;

export function nodeCenter(node: Node<SystemNodeData>): { x: number; y: number } {
  const width = node.width ?? node.measured?.width ?? DEFAULT_NODE_WIDTH;
  const height = node.height ?? node.measured?.height ?? DEFAULT_NODE_HEIGHT;
  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

/** Pick rim handles so the edge exits/enters the facing sides. */
export function pickHandlesForNodes(
  source: Node<SystemNodeData>,
  target: Node<SystemNodeData>,
): { sourceHandle: string; targetHandle: string } {
  const from = nodeCenter(source);
  const to = nodeCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "out-right", targetHandle: "in-left" }
      : { sourceHandle: "out-left", targetHandle: "in-right" };
  }

  return dy >= 0
    ? { sourceHandle: "out-bottom", targetHandle: "in-top" }
    : { sourceHandle: "out-top", targetHandle: "in-bottom" };
}

export { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH };
