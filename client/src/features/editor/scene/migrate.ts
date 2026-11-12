import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { strokeStyleFor } from "./style";
import { connectionData, isLegacyConnection } from "./types";

/**
 * Upgrades arrows saved with the Phase 2 connection shape to `{ edgeId, traffic, mode }` and draws
 * async ones dashed. Returns the same array when nothing needed changing.
 */
export function migrateSceneElements(
  elements: readonly ExcalidrawElement[],
): readonly ExcalidrawElement[] {
  if (!elements.some(isLegacyConnection)) {
    return elements;
  }
  return elements.map((element) => {
    if (!isLegacyConnection(element)) {
      return element;
    }
    const data = connectionData(element)!;
    const { luka: _old, ...rest } = element.customData ?? {};
    return {
      ...element,
      strokeStyle: strokeStyleFor(data.mode),
      customData: { ...rest, luka: data },
    };
  });
}
