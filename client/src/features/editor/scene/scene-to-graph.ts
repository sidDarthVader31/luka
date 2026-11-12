import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { CatalogItem, Graph, GraphEdge, GraphNode } from "../../../lib/api";
import { disallowedReason, isAllowedTarget, isAlwaysAsync, usesWeight } from "./connection-rules";
import {
  type SceneWarning,
  boundLabel,
  componentData,
  connectionData,
  isArrow,
  isComponent,
} from "./types";

export type DerivedGraph = {
  graph: Graph;
  warnings: SceneWarning[];
  /** Excalidraw element id for each node id and edge id, for selection and the result overlay. */
  elementIdByNodeId: Map<string, string>;
  elementIdByEdgeId: Map<string, string>;
  /**
   * Arrows bound to two components that may not connect (by catalog `allowed_targets`), keyed by
   * element id, with the reason. They are left out of the graph and highlighted on the canvas.
   */
  disallowedArrows: Map<string, string>;
};

/**
 * Derives the simulation graph from an Excalidraw scene. Components become nodes, arrows bound
 * at both ends to components become edges, everything else is annotation. Problems are reported
 * as warnings and the offending arrow is left out, so the graph is always saveable.
 */
export function sceneToGraph(
  elements: readonly ExcalidrawElement[],
  catalog: CatalogItem[],
): DerivedGraph {
  const live = elements.filter((element) => !element.isDeleted);
  const byId = new Map(live.map((element) => [element.id, element]));
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const warnings: SceneWarning[] = [];

  const nodes: GraphNode[] = [];
  const nodeByElementId = new Map<string, { node: GraphNode; item: CatalogItem }>();
  const elementIdByNodeId = new Map<string, string>();

  for (const element of live) {
    if (!isComponent(element)) {
      continue;
    }
    const data = componentData(element)!;
    const item = itemById.get(data.componentId);
    if (!item) {
      warnings.push({
        elementIds: [element.id],
        message: `Unknown component type "${data.componentId}"; it is ignored.`,
      });
      continue;
    }
    if (elementIdByNodeId.has(data.nodeId)) {
      warnings.push({
        elementIds: [element.id],
        message: `Two components share the id "${data.nodeId}"; the second is ignored.`,
      });
      continue;
    }
    const label = boundLabel(element, byId)?.text.trim() || item.name;
    const node: GraphNode = {
      id: data.nodeId,
      label,
      archetype: item.kind,
      component_id: item.id,
      position: { x: Math.round(element.x), y: Math.round(element.y) },
      properties: { ...data.properties },
    };
    nodes.push(node);
    nodeByElementId.set(element.id, { node, item });
    elementIdByNodeId.set(node.id, element.id);
  }

  const edges: GraphEdge[] = [];
  const elementIdByEdgeId = new Map<string, string>();
  const disallowedArrows = new Map<string, string>();

  for (const element of live) {
    if (!isArrow(element)) {
      continue;
    }
    const source = element.startBinding
      ? nodeByElementId.get(element.startBinding.elementId)
      : undefined;
    const target = element.endBinding
      ? nodeByElementId.get(element.endBinding.elementId)
      : undefined;
    const data = connectionData(element);

    if (!source || !target) {
      // A plain arrow between annotations is fine. Warn only when it looks like a connection.
      if (source || target || data) {
        const end = source ?? target;
        warnings.push({
          elementIds: [element.id],
          message: `An arrow from ${end?.node.label ?? "a component"} is not attached to a component at both ends.`,
        });
      }
      continue;
    }
    if (source.node.id === target.node.id) {
      warnings.push({
        elementIds: [element.id],
        message: `${source.node.label} cannot connect to itself.`,
      });
      continue;
    }
    if (!isAllowedTarget(source.item, target.item.kind)) {
      const reason = disallowedReason(
        { label: source.node.label, item: source.item },
        { label: target.node.label, item: target.item },
      );
      disallowedArrows.set(element.id, reason);
      warnings.push({
        elementIds: [element.id],
        message: `${source.node.label} → ${target.node.label} is not allowed; it is ignored.`,
      });
      continue;
    }

    const edgeId = data?.edgeId ?? element.id;
    if (elementIdByEdgeId.has(edgeId)) {
      warnings.push({
        elementIds: [element.id],
        message: `Two arrows share the id "${edgeId}"; the second is ignored.`,
      });
      continue;
    }

    const edge: GraphEdge = {
      id: edgeId,
      source_node_id: source.node.id,
      target_node_id: target.node.id,
      traffic: data?.traffic ?? "all",
      mode: isAlwaysAsync(source.item) ? "async" : (data?.mode ?? "sync"),
    };
    if (usesWeight(source.item) && data?.weight && data.weight > 0) {
      edge.weight = data.weight;
    }
    edges.push(edge);
    elementIdByEdgeId.set(edgeId, element.id);
  }

  return {
    graph: { nodes, edges },
    warnings,
    elementIdByNodeId,
    elementIdByEdgeId,
    disallowedArrows,
  };
}
