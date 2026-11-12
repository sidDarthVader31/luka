import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { CatalogItem, NodeProperties } from "../../../lib/api";
import { COMPONENT_SIZE, COMPONENT_STYLE, backgroundFor } from "./style";
import { type ComponentData, componentData, connectionData } from "./types";

type Point = { x: number; y: number };

export function randomElementId(): string {
  return `luka-${Math.random().toString(36).slice(2, 12)}`;
}

function usedNodeIds(elements: readonly ExcalidrawElement[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    const data = componentData(element);
    if (data && !element.isDeleted) {
      ids.add(data.nodeId);
    }
  }
  return ids;
}

/** The lowest free `<componentId>-<n>` id. */
export function nextNodeId(componentId: string, used: Set<string>): string {
  let index = 1;
  while (used.has(`${componentId}-${index}`)) {
    index += 1;
  }
  return `${componentId}-${index}`;
}

export function componentSkeleton(
  item: CatalogItem,
  input: {
    id: string;
    nodeId: string;
    label: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    properties?: NodeProperties;
  },
): ExcalidrawElementSkeleton {
  const data: ComponentData = {
    nodeId: input.nodeId,
    componentId: item.id,
    properties: { ...(input.properties ?? item.default_properties) },
  };
  return {
    type: "rectangle",
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width ?? COMPONENT_SIZE.width,
    height: input.height ?? COMPONENT_SIZE.height,
    ...COMPONENT_STYLE,
    backgroundColor: backgroundFor(item.category_id),
    label: { text: input.label },
    customData: { luka: data },
  };
}

const INSERT_GAP = 60;

/** Moves a box right until it no longer overlaps an existing component. */
function freeSpot(
  elements: readonly ExcalidrawElement[],
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const occupied = elements.filter((element) => !element.isDeleted && componentData(element));
  let { x } = box;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const hit = occupied.find(
      (element) =>
        x < element.x + element.width &&
        x + box.width > element.x &&
        box.y < element.y + element.height &&
        box.y + box.height > element.y,
    );
    if (!hit) {
      break;
    }
    x = hit.x + hit.width + INSERT_GAP;
  }
  return { x, y: box.y };
}

/**
 * New elements (container and label) for a component centred on `center`, nudged right if that
 * spot is taken.
 */
export function insertComponent(
  item: CatalogItem,
  elements: readonly ExcalidrawElement[],
  center: Point,
): ExcalidrawElement[] {
  const used = usedNodeIds(elements);
  const nodeId = nextNodeId(item.id, used);
  const sameKind = elements.filter(
    (element) => !element.isDeleted && componentData(element)?.componentId === item.id,
  ).length;
  const label = sameKind === 0 ? item.name : `${item.name} ${sameKind + 1}`;
  const spot = freeSpot(elements, {
    x: Math.round(center.x - COMPONENT_SIZE.width / 2),
    y: Math.round(center.y - COMPONENT_SIZE.height / 2),
    ...COMPONENT_SIZE,
  });
  return convertToExcalidrawElements(
    [
      componentSkeleton(item, {
        id: randomElementId(),
        nodeId,
        label,
        ...spot,
      }),
    ],
    { regenerateIds: false },
  );
}

/**
 * Turns a plain shape into a component. Returns the replacement for `shape` plus a new label if
 * it had none. Existing styling, label and arrow bindings are kept.
 */
export function makeComponent(
  shape: ExcalidrawElement,
  item: CatalogItem,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const data: ComponentData = {
    nodeId: nextNodeId(item.id, usedNodeIds(elements)),
    componentId: item.id,
    properties: { ...item.default_properties },
  };
  const customData = { ...shape.customData, luka: data };
  const hasLabel = (shape.boundElements ?? []).some((bound) => bound.type === "text");
  if (hasLabel) {
    return [{ ...shape, customData }];
  }
  const converted = convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        id: shape.id,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        label: { text: item.name },
      },
    ],
    { regenerateIds: false },
  );
  const text = converted.find((element) => element.type === "text");
  if (!text) {
    return [{ ...shape, customData }];
  }
  return [
    {
      ...shape,
      customData,
      boundElements: [...(shape.boundElements ?? []), { type: "text", id: text.id }],
    },
    text,
  ];
}

/**
 * Excalidraw copies customData when elements are duplicated or pasted. Give each copied component
 * a fresh node id and each copied connection a fresh edge id so the graph stays unambiguous.
 */
export function reassignDuplicatedIds(
  next: readonly ExcalidrawElement[],
  previous: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const previousIds = new Set(previous.map((element) => element.id));
  const used = usedNodeIds(previous);
  return next.map((element) => {
    if (previousIds.has(element.id)) {
      return element;
    }
    const component = componentData(element);
    if (component) {
      if (!used.has(component.nodeId)) {
        used.add(component.nodeId);
        return element;
      }
      const nodeId = nextNodeId(component.componentId, used);
      used.add(nodeId);
      return { ...element, customData: { ...element.customData, luka: { ...component, nodeId } } };
    }
    const connection = connectionData(element);
    if (connection) {
      return {
        ...element,
        customData: { ...element.customData, luka: { ...connection, edgeId: element.id } },
      };
    }
    return element;
  });
}
