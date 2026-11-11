import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

import type { CatalogItem, Graph, GraphNode } from "../../../lib/api";
import { componentSkeleton } from "./insert-component";
import { COMPONENT_SIZE } from "./style";
import type { ConnectionData, LukaScene } from "./types";

export function componentElementId(nodeId: string): string {
  return `node:${nodeId}`;
}

export function connectionElementId(edgeId: string): string {
  return `edge:${edgeId}`;
}

/** The catalog item for a node: its component id, else the first item of the same kind. */
export function catalogItemForNode(
  node: Pick<GraphNode, "component_id" | "archetype">,
  catalog: CatalogItem[],
): CatalogItem | undefined {
  return (
    catalog.find((item) => item.id === node.component_id) ??
    catalog.find((item) => item.kind === node.archetype)
  );
}

/** Builds a scene for a design saved before scenes existed (old designs and templates). */
export function graphToScene(graph: Graph, catalog: CatalogItem[]): LukaScene {
  const skeletons: ExcalidrawElementSkeleton[] = [];
  const nodesById = new Map<string, GraphNode>();

  for (const node of graph.nodes) {
    const item = catalogItemForNode(node, catalog);
    if (!item) {
      continue;
    }
    nodesById.set(node.id, node);
    skeletons.push(
      componentSkeleton(item, {
        id: componentElementId(node.id),
        nodeId: node.id,
        label: node.label,
        x: node.position.x,
        y: node.position.y,
        width: node.width || COMPONENT_SIZE.width,
        height: node.height || COMPONENT_SIZE.height,
        properties: node.properties,
      }),
    );
  }

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.source_node_id);
    const target = nodesById.get(edge.target_node_id);
    if (!source || !target) {
      continue;
    }
    const { start, end } = arrowEnds(source, target);
    const data: ConnectionData = {
      edgeId: edge.id,
      interactionType: edge.interaction_type,
      ruleType: edge.routing_rule.rule_type,
      fanoutMultiplier: edge.fanout_multiplier,
      timeoutMs: edge.timeout_ms,
      retryAttempts: edge.retry_attempts,
      requestClassIds: edge.request_class_ids,
    };
    skeletons.push({
      type: "arrow",
      id: connectionElementId(edge.id),
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
      points: [
        [0, 0],
        [end.x - start.x, end.y - start.y],
      ],
      strokeColor: "#1e1e1e",
      strokeWidth: 2,
      start: { id: componentElementId(source.id) },
      end: { id: componentElementId(target.id) },
      customData: { luka: stripUndefined(data) },
    });
  }

  return {
    type: "luka-scene",
    version: 1,
    elements: convertToExcalidrawElements(skeletons, { regenerateIds: false }),
    appState: {},
  };
}

type Box = { x: number; y: number; width: number; height: number };

function box(node: GraphNode): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width || COMPONENT_SIZE.width,
    height: node.height || COMPONENT_SIZE.height,
  };
}

/** Connect facing sides: left/right when the target is mostly beside, top/bottom when above or below. */
function arrowEnds(sourceNode: GraphNode, targetNode: GraphNode) {
  const source = box(sourceNode);
  const target = box(targetNode);
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    return {
      start: { x: right ? source.x + source.width : source.x, y: source.y + source.height / 2 },
      end: { x: right ? target.x : target.x + target.width, y: target.y + target.height / 2 },
    };
  }
  const down = dy >= 0;
  return {
    start: { x: source.x + source.width / 2, y: down ? source.y + source.height : source.y },
    end: { x: target.x + target.width / 2, y: down ? target.y : target.y + target.height },
  };
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
