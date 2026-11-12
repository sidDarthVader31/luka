import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { remeasuredLabels } from "./scene/remeasure-labels";

// Thin, undoable wrappers over the Excalidraw API. Each call is one history entry.

/**
 * Screen pixels on the right of the canvas covered by the floating inspector. New components are
 * placed and kept clear of that strip, since selecting one opens the inspector over it.
 */
export const INSPECTOR_INSET = 290;

/** Centre of the canvas area left of `rightInset` screen pixels, in scene coordinates. */
export function viewportCenter(
  api: ExcalidrawImperativeAPI,
  rightInset = 0,
): { x: number; y: number } {
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const visibleWidth = Math.max(width - rightInset, width / 2);
  return { x: -scrollX + visibleWidth / 2 / zoom.value, y: -scrollY + height / 2 / zoom.value };
}

function isInView(
  api: ExcalidrawImperativeAPI,
  element: ExcalidrawElement,
  rightInset: number,
): boolean {
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const left = -scrollX;
  const top = -scrollY;
  return (
    element.x >= left &&
    element.y >= top &&
    element.x + element.width <= left + Math.max(width - rightInset, width / 2) / zoom.value &&
    element.y + element.height <= top + height / zoom.value
  );
}

/** Appends new elements, selects `selectId` and brings it into view if needed. */
export function addElements(
  api: ExcalidrawImperativeAPI,
  elements: ExcalidrawElement[],
  selectId?: string,
  rightInset = 0,
) {
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
    appState: selectId ? { selectedElementIds: { [selectId]: true } } : undefined,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  const selected = elements.find((element) => element.id === selectId);
  if (selected && !isInView(api, selected, rightInset)) {
    // Centre it in the strip left of the inspector (scrollToContent would centre it beneath).
    const { width, height, zoom } = api.getAppState();
    const visibleWidth = Math.max(width - rightInset, width / 2);
    api.updateScene({
      appState: {
        scrollX: visibleWidth / 2 / zoom.value - (selected.x + selected.width / 2),
        scrollY: height / 2 / zoom.value - (selected.y + selected.height / 2),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
}

/** Replaces existing elements by id (bumping their versions) and appends any new ones. */
export function replaceElements(api: ExcalidrawImperativeAPI, replacements: ExcalidrawElement[]) {
  const byId = new Map(replacements.map((element) => [element.id, element]));
  const current = api.getSceneElementsIncludingDeleted();
  const next = current.map((element) => {
    const replacement = byId.get(element.id);
    if (!replacement) {
      return element;
    }
    byId.delete(element.id);
    return newElementWith(element, replacement as Partial<ExcalidrawElement> as never);
  });
  api.updateScene({
    elements: [...next, ...byId.values()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Merges `patch` into an element's `customData.luka`, plus optional element fields (styling). */
export function updateLukaData(
  api: ExcalidrawImperativeAPI,
  elementId: string,
  patch: Record<string, unknown>,
  elementPatch: Partial<ExcalidrawElement> = {},
) {
  const element = api.getSceneElementsIncludingDeleted().find((entry) => entry.id === elementId);
  if (!element) {
    return;
  }
  const luka = { ...(element.customData?.luka ?? {}), ...patch };
  replaceElements(api, [
    {
      ...element,
      ...elementPatch,
      customData: { ...element.customData, luka },
    } as ExcalidrawElement,
  ]);
}

export function selectElement(api: ExcalidrawImperativeAPI, elementId: string) {
  selectElements(api, [elementId]);
}

/** Selects the given elements and scrolls them into view. */
export function selectElements(api: ExcalidrawImperativeAPI, elementIds: string[]) {
  const wanted = new Set(elementIds);
  const elements = api.getSceneElements().filter((entry) => wanted.has(entry.id));
  if (elements.length === 0) {
    return;
  }
  api.updateScene({
    appState: {
      selectedElementIds: Object.fromEntries(elements.map((element) => [element.id, true])),
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  api.scrollToContent(elements, { animate: true, duration: 300 });
}

/**
 * Re-lays out box labels once fonts have loaded (see remeasuredLabels). Not an undo step, and a
 * no-op when every label already fits.
 */
export function remeasureLabels(api: ExcalidrawImperativeAPI) {
  const replacements = remeasuredLabels(api.getSceneElements());
  if (replacements.length === 0) {
    return;
  }
  const byId = new Map(replacements.map((element) => [element.id, element]));
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => {
      const replacement = byId.get(element.id);
      return replacement
        ? newElementWith(element, replacement as Partial<ExcalidrawElement> as never)
        : element;
    }),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}
