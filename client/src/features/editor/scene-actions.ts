import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Thin, undoable wrappers over the Excalidraw API. Each call is one history entry.

export function viewportCenter(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  return { x: -scrollX + width / 2 / zoom.value, y: -scrollY + height / 2 / zoom.value };
}

function isInView(api: ExcalidrawImperativeAPI, element: ExcalidrawElement): boolean {
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const left = -scrollX;
  const top = -scrollY;
  return (
    element.x >= left &&
    element.y >= top &&
    element.x + element.width <= left + width / zoom.value &&
    element.y + element.height <= top + height / zoom.value
  );
}

/** Appends new elements, selects `selectId` and brings it into view if needed. */
export function addElements(
  api: ExcalidrawImperativeAPI,
  elements: ExcalidrawElement[],
  selectId?: string,
) {
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
    appState: selectId ? { selectedElementIds: { [selectId]: true } } : undefined,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  const selected = elements.find((element) => element.id === selectId);
  if (selected && !isInView(api, selected)) {
    api.scrollToContent(selected, { animate: true, duration: 300 });
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
