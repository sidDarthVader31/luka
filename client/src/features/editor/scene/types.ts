import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

import type { EdgeMode, EdgeTraffic, NodeProperties } from "../../../lib/api";

/** Stored on a component's container element as `customData.luka`. */
export type ComponentData = {
  nodeId: string;
  componentId: string;
  properties: NodeProperties;
};

/**
 * Stored on a connection arrow as `customData.luka`. New arrows have no data until the inspector
 * edits them; they read as `{ traffic: "all", mode: "sync" }`.
 */
export type ConnectionData = {
  edgeId: string;
  traffic: EdgeTraffic;
  mode: EdgeMode;
  /** Only used when the source is a gateway. */
  weight?: number;
};

/** The minimal app state we persist; everything else (viewport, tools, collaborators) is transient. */
export type PersistedAppState = {
  viewBackgroundColor?: string;
};

/** The document stored as `Design.scene`. */
export type LukaScene = {
  type: "luka-scene";
  version: 1;
  elements: readonly ExcalidrawElement[];
  appState: PersistedAppState;
};

export type SceneWarning = {
  elementIds: string[];
  message: string;
};

export const COMPONENT_SHAPES = new Set(["rectangle", "ellipse", "diamond"]);

export function componentData(element: ExcalidrawElement): ComponentData | null {
  const luka = element.customData?.luka as Partial<ComponentData> | undefined;
  if (!luka || typeof luka.nodeId !== "string" || typeof luka.componentId !== "string") {
    return null;
  }
  return { nodeId: luka.nodeId, componentId: luka.componentId, properties: luka.properties ?? {} };
}

const TRAFFIC_VALUES: readonly EdgeTraffic[] = ["all", "reads", "writes"];
const ASYNC_INTERACTIONS = new Set(["async_enqueue", "consume"]);

/**
 * Normalises stored connection fields, including the Phase 2 shape
 * (`interactionType`, `ruleType`, fan-out, timeout, retries, request classes):
 * enqueue and consume become async, everything else sync, and traffic becomes `all`.
 */
export function migrateConnection(raw: Record<string, unknown>): Omit<ConnectionData, "edgeId"> {
  const traffic = TRAFFIC_VALUES.includes(raw.traffic as EdgeTraffic)
    ? (raw.traffic as EdgeTraffic)
    : "all";
  let mode: EdgeMode;
  if (raw.mode === "sync" || raw.mode === "async") {
    mode = raw.mode;
  } else {
    const interaction = raw.interactionType ?? raw.interaction_type;
    mode = typeof interaction === "string" && ASYNC_INTERACTIONS.has(interaction) ? "async" : "sync";
  }
  const weight = typeof raw.weight === "number" && raw.weight > 0 ? raw.weight : undefined;
  return weight === undefined ? { traffic, mode } : { traffic, mode, weight };
}

export function connectionData(element: ExcalidrawElement): ConnectionData | null {
  const luka = element.customData?.luka as Record<string, unknown> | undefined;
  if (!luka || typeof luka.edgeId !== "string") {
    return null;
  }
  return { edgeId: luka.edgeId, ...migrateConnection(luka) };
}

/** Whether stored arrow data is in an older shape than `ConnectionData`. */
export function isLegacyConnection(element: ExcalidrawElement): boolean {
  const luka = element.customData?.luka as Record<string, unknown> | undefined;
  if (!luka || typeof luka.edgeId !== "string") {
    return false;
  }
  return luka.mode === undefined || luka.traffic === undefined || "interactionType" in luka;
}

export function isComponent(element: ExcalidrawElement): boolean {
  return (
    !element.isDeleted && COMPONENT_SHAPES.has(element.type) && componentData(element) !== null
  );
}

export function isArrow(element: ExcalidrawElement): element is ExcalidrawArrowElement {
  return element.type === "arrow";
}

export function isScene(value: unknown): value is LukaScene {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { elements?: unknown }).elements)
  );
}

/** The bound text label of a container, if any. */
export function boundLabel(
  container: ExcalidrawElement,
  byId: Map<string, ExcalidrawElement>,
): ExcalidrawTextElement | null {
  for (const bound of container.boundElements ?? []) {
    if (bound.type !== "text") {
      continue;
    }
    const text = byId.get(bound.id);
    if (text && !text.isDeleted && text.type === "text") {
      return text;
    }
  }
  return null;
}
