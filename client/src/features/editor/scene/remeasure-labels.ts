import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

function isBoundText(element: ExcalidrawElement): element is ExcalidrawTextElement {
  return element.type === "text" && !element.isDeleted && element.containerId !== null;
}

/**
 * Lays every box label out again with the fonts as currently loaded.
 *
 * Excalidraw registers its hand-drawn font only once the editor mounts, so labels built before
 * that (from a saved graph, a template, or a problem's starter Client) are measured with a
 * fallback font: the drawn text overflows its box and the first and last letters get clipped.
 * Returns the replacement text elements, or an empty array when every label already fits.
 */
export function remeasuredLabels(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const replacements: ExcalidrawElement[] = [];
  for (const text of elements.filter(isBoundText)) {
    const container = byId.get(text.containerId!);
    if (!container || container.isDeleted || container.type === "arrow") {
      continue;
    }
    const [, fresh] = convertToExcalidrawElements(
      [
        {
          type: container.type as "rectangle" | "ellipse" | "diamond",
          id: container.id,
          x: container.x,
          y: container.y,
          width: container.width,
          height: container.height,
          label: {
            text: text.originalText,
            fontSize: text.fontSize,
            fontFamily: text.fontFamily,
            textAlign: text.textAlign,
            verticalAlign: text.verticalAlign,
            strokeColor: text.strokeColor,
          },
        },
      ],
      { regenerateIds: false },
    );
    if (!fresh || fresh.type !== "text") {
      continue;
    }
    if (fresh.width === text.width && fresh.height === text.height && fresh.text === text.text) {
      continue;
    }
    replacements.push({
      ...text,
      x: fresh.x,
      y: fresh.y,
      width: fresh.width,
      height: fresh.height,
      text: fresh.text,
      lineHeight: fresh.lineHeight,
    });
  }
  return replacements;
}
