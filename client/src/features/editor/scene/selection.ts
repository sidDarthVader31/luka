import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { CatalogItem, GraphEdge, GraphNode } from "../../../lib/api";
import type { DerivedGraph } from "./scene-to-graph";
import {
  COMPONENT_SHAPES,
  type ComponentData,
  type ConnectionData,
  componentData,
  connectionData,
} from "./types";

export type SelectionTarget =
  | {
      kind: "component";
      element: ExcalidrawElement;
      data: ComponentData;
      node: GraphNode;
      item: CatalogItem;
    }
  | {
      kind: "connection";
      element: ExcalidrawElement;
      data: ConnectionData;
      edge: GraphEdge;
      sourceItem: CatalogItem | undefined;
    }
  | {
      /** An arrow between two components that may not connect. */
      kind: "disallowed-connection";
      element: ExcalidrawElement;
      reason: string;
    }
  | { kind: "shape"; element: ExcalidrawElement }
  | null;

/** What the inspector should show for the current Excalidraw selection. */
export function resolveSelection(
  selectedIds: readonly string[],
  elements: readonly ExcalidrawElement[],
  catalog: CatalogItem[],
  derived: DerivedGraph,
): SelectionTarget {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const ids = new Set<string>();
  for (const id of selectedIds) {
    const element = byId.get(id);
    if (!element || element.isDeleted) {
      continue;
    }
    // A selected label stands for its container.
    ids.add(element.type === "text" && element.containerId ? element.containerId : id);
  }
  if (ids.size !== 1) {
    return null;
  }
  const element = byId.get([...ids][0]!);
  if (!element) {
    return null;
  }

  const component = componentData(element);
  if (component) {
    const node = derived.graph.nodes.find((entry) => entry.id === component.nodeId);
    const item = catalog.find((entry) => entry.id === component.componentId);
    if (node && item && derived.elementIdByNodeId.get(node.id) === element.id) {
      return { kind: "component", element, data: component, node, item };
    }
    return null;
  }

  if (element.type === "arrow") {
    const reason = derived.disallowedArrows.get(element.id);
    if (reason) {
      return { kind: "disallowed-connection", element, reason };
    }
    const stored = connectionData(element);
    const edgeId = stored?.edgeId ?? element.id;
    const edge = derived.graph.edges.find((entry) => entry.id === edgeId);
    if (!edge || derived.elementIdByEdgeId.get(edgeId) !== element.id) {
      return null;
    }
    const source = derived.graph.nodes.find((entry) => entry.id === edge.source_node_id);
    const sourceItem = catalog.find((entry) => entry.id === source?.component_id);
    const data: ConnectionData = stored ?? {
      edgeId,
      traffic: edge.traffic,
      mode: edge.mode,
    };
    return { kind: "connection", element, data, edge, sourceItem };
  }

  if (COMPONENT_SHAPES.has(element.type)) {
    return { kind: "shape", element };
  }
  return null;
}
