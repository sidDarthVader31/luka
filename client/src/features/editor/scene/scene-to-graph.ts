import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { CatalogItem, Graph, GraphEdge, GraphNode, RequestClass } from "../../../lib/api";
import { edgeOptions, isAllowedConnection } from "./connection-rules";
import {
  type SceneWarning,
  boundLabel,
  componentData,
  connectionData,
  isArrow,
  isComponent,
} from "./types";

// The server rejects explicit sizes below these.
const MIN_NODE_WIDTH = 80;
const MIN_NODE_HEIGHT = 48;

export type DerivedGraph = {
  graph: Graph;
  warnings: SceneWarning[];
  /** Excalidraw element id for each node id and edge id, for selection and the result overlay. */
  elementIdByNodeId: Map<string, string>;
  elementIdByEdgeId: Map<string, string>;
};

/**
 * Derives the simulation graph from an Excalidraw scene. Components become nodes, arrows bound
 * at both ends to components become edges, everything else is annotation. Problems are reported
 * as warnings and the offending arrow is left out, so the graph is always saveable.
 */
export function sceneToGraph(
  elements: readonly ExcalidrawElement[],
  catalog: CatalogItem[],
  requestClasses: RequestClass[],
): DerivedGraph {
  const live = elements.filter((element) => !element.isDeleted);
  const byId = new Map(live.map((element) => [element.id, element]));
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const warnings: SceneWarning[] = [];

  const nodes: GraphNode[] = [];
  const nodeByElementId = new Map<string, GraphNode>();
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
    if (element.width >= MIN_NODE_WIDTH) {
      node.width = Math.round(element.width);
    }
    if (element.height >= MIN_NODE_HEIGHT) {
      node.height = Math.round(element.height);
    }
    nodes.push(node);
    nodeByElementId.set(element.id, node);
    elementIdByNodeId.set(node.id, element.id);
  }

  const edges: GraphEdge[] = [];
  const elementIdByEdgeId = new Map<string, string>();
  const defaultRequestClassIds = requestClasses[0] ? [requestClasses[0].id] : [];
  const knownRequestClassIds = new Set(requestClasses.map((item) => item.id));

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
        warnings.push({
          elementIds: [element.id],
          message: `An arrow from ${source?.label ?? target?.label ?? "a component"} is not attached to a component at both ends.`,
        });
      }
      continue;
    }
    if (source.id === target.id) {
      warnings.push({
        elementIds: [element.id],
        message: `${source.label} cannot connect to itself.`,
      });
      continue;
    }
    if (!isAllowedConnection(source.archetype, target.archetype)) {
      warnings.push({
        elementIds: [element.id],
        message: `${source.label} → ${target.label} is not a supported connection; it is ignored.`,
      });
      continue;
    }

    const options = edgeOptions(itemById.get(source.component_id ?? ""));
    let interactionType = data?.interactionType ?? options.interactions[0]!;
    if (!options.interactions.includes(interactionType)) {
      warnings.push({
        elementIds: [element.id],
        message: `${source.label} → ${target.label}: "${interactionType}" is not allowed from ${source.label}; using "${options.interactions[0]}".`,
      });
      interactionType = options.interactions[0]!;
    }
    let ruleType = data?.ruleType ?? options.routingRules[0]!;
    if (
      !options.routingRules.includes(ruleType) ||
      (interactionType === "fallback" && ruleType !== "always")
    ) {
      ruleType = "always";
    }

    const requestClassIds = (data?.requestClassIds ?? []).filter((id) =>
      knownRequestClassIds.has(id),
    );
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
      source_node_id: source.id,
      target_node_id: target.id,
      interaction_type: interactionType,
      routing_rule: { rule_type: ruleType },
      request_class_ids: requestClassIds.length > 0 ? requestClassIds : defaultRequestClassIds,
    };
    if (data?.fanoutMultiplier && data.fanoutMultiplier > 0) {
      edge.fanout_multiplier = data.fanoutMultiplier;
    }
    if (data?.timeoutMs && data.timeoutMs > 0) {
      edge.timeout_ms = data.timeoutMs;
    }
    if (data?.retryAttempts && data.retryAttempts > 0) {
      edge.retry_attempts = data.retryAttempts;
    }
    edges.push(edge);
    elementIdByEdgeId.set(edgeId, element.id);
  }

  return {
    graph: { nodes, edges, request_classes: requestClasses },
    warnings,
    elementIdByNodeId,
    elementIdByEdgeId,
  };
}
