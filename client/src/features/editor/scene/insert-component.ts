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
/** Clearance kept around existing elements, arrows included. */
const INSERT_PADDING = 20;
const MAX_RINGS = 12;

type Box = { x: number; y: number; width: number; height: number };

/** Scene-space bounds; arrows and lines measure their points, which may sit left of or above x/y. */
function bounds(element: ExcalidrawElement): Box {
  if ("points" in element && element.points.length > 0) {
    const xs = element.points.map(([px]) => element.x + px);
    const ys = element.points.map(([, py]) => element.y + py);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

function overlaps(a: Box, b: Box, padding: number): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

/**
 * Grid offsets ring by ring around the origin. Within a ring, right comes first, then below,
 * so a design grows left to right as it usually reads.
 */
function ringOffsets(ring: number): Array<[number, number]> {
  if (ring === 0) {
    return [[0, 0]];
  }
  const cells: Array<[number, number]> = [];
  for (let dx = -ring; dx <= ring; dx += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) {
        cells.push([dx, dy]);
      }
    }
  }
  const rank = ([dx, dy]: [number, number]) =>
    Math.abs(dx) + Math.abs(dy) + (dx > 0 ? 0 : 0.5) + (dy >= 0 ? 0 : 0.25);
  return cells.sort((a, b) => rank(a) - rank(b));
}

/** The nearest grid spot around `box` that keeps clear of every element on the canvas. */
function freeSpot(elements: readonly ExcalidrawElement[], box: Box): { x: number; y: number } {
  const occupied = elements
    .filter((element) => !element.isDeleted && !(element.type === "text" && element.containerId))
    .map(bounds);
  const stepX = box.width + INSERT_GAP;
  const stepY = box.height + INSERT_GAP;
  for (let ring = 0; ring <= MAX_RINGS; ring += 1) {
    for (const [dx, dy] of ringOffsets(ring)) {
      const candidate = { ...box, x: box.x + dx * stepX, y: box.y + dy * stepY };
      if (!occupied.some((other) => overlaps(candidate, other, INSERT_PADDING))) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }
  return { x: box.x, y: box.y };
}

/** "Redis", then "Redis 2", "Redis 3"… for each further component of the same type. */
function defaultLabel(item: CatalogItem, elements: readonly ExcalidrawElement[]): string {
  const sameKind = elements.filter(
    (element) => !element.isDeleted && componentData(element)?.componentId === item.id,
  ).length;
  return sameKind === 0 ? item.name : `${item.name} ${sameKind + 1}`;
}

/**
 * New elements (container and label) for a component centred on `center`, or on the nearest
 * free spot around it.
 */
export function insertComponent(
  item: CatalogItem,
  elements: readonly ExcalidrawElement[],
  center: Point,
): ExcalidrawElement[] {
  const nodeId = nextNodeId(item.id, usedNodeIds(elements));
  const label = defaultLabel(item, elements);
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
        label: { text: defaultLabel(item, elements) },
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
