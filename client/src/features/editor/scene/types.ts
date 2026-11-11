import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

import type { EdgeInteractionType, NodeProperties, RoutingRuleType } from "../../../lib/api";

/** Stored on a component's container element as `customData.luka`. */
export type ComponentData = {
  nodeId: string;
  componentId: string;
  properties: NodeProperties;
};

/** Stored on a connection arrow as `customData.luka`. All fields are optional on new arrows. */
export type ConnectionData = {
  edgeId: string;
  interactionType?: EdgeInteractionType;
  ruleType?: RoutingRuleType;
  fanoutMultiplier?: number;
  timeoutMs?: number;
  retryAttempts?: number;
  requestClassIds?: string[];
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

export function connectionData(element: ExcalidrawElement): ConnectionData | null {
  const luka = element.customData?.luka as Partial<ConnectionData> | undefined;
  if (!luka || typeof luka.edgeId !== "string") {
    return null;
  }
  return luka as ConnectionData;
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
