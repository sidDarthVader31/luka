import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { CatalogItem } from "../../lib/api";
import { formatCompactNumber } from "../../lib/format";
import { ComponentIcon } from "../../shared/icons/ComponentIcon";
import type { CanvasView } from "./Canvas";
import { type ResultView, formatPercent, loadLevel } from "./lib/result-view";
import type { DerivedGraph } from "./scene/scene-to-graph";
import { componentData, connectionData } from "./scene/types";
import "./ResultOverlay.css";

type ResultOverlayProps = {
  elements: readonly ExcalidrawElement[];
  view: CanvasView;
  derived: DerivedGraph;
  catalog: CatalogItem[];
  result: ResultView | null;
};

/**
 * Draws component icons and, after a run, load badges and arrow rates on top of the canvas.
 * Positions come from scene coordinates and the viewport; the document is never modified.
 */
export function ResultOverlay({ elements, view, derived, catalog, result }: ResultOverlayProps) {
  const toScreen = (x: number, y: number) => ({
    left: (x + view.scrollX) * view.zoom,
    top: (y + view.scrollY) * view.zoom,
  });
  const nodeResults = new Map(result?.nodes.map((node) => [node.node_id, node]));
  const edgeResults = new Map(result?.edges.map((edge) => [edge.edge_id, edge]));
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const iconSize = Math.max(12, Math.min(20, 16 * view.zoom));

  return (
    <div className="overlay" aria-hidden>
      {elements.map((element) => {
        if (element.isDeleted) {
          return null;
        }
        const component = componentData(element);
        if (component && derived.elementIdByNodeId.get(component.nodeId) === element.id) {
          const item = itemById.get(component.componentId);
          const nodeResult = nodeResults.get(component.nodeId);
          const topLeft = toScreen(element.x, element.y);
          const topRight = toScreen(element.x + element.width, element.y);
          const showBadge = nodeResult && item?.kind !== "client";
          return (
            <div key={element.id}>
              {item ? (
                <span
                  className="overlay__icon"
                  style={{ left: topLeft.left + 6, top: topLeft.top + 6 }}
                >
                  <ComponentIcon name={item.icon} size={iconSize} />
                </span>
              ) : null}
              {showBadge ? (
                <span
                  className="overlay__badge"
                  data-level={loadLevel(nodeResult.utilization)}
                  style={{ left: topRight.left, top: topRight.top }}
                  title={nodeResult.explanation}
                >
                  {formatPercent(nodeResult.utilization)}
                </span>
              ) : null}
            </div>
          );
        }
        if (element.type === "arrow" && result) {
          const edgeId = connectionData(element)?.edgeId ?? element.id;
          const edgeResult = edgeResults.get(edgeId);
          if (!edgeResult || derived.elementIdByEdgeId.get(edgeId) !== element.id) {
            return null;
          }
          const { points } = element;
          const mid =
            points.length % 2 === 1
              ? points[(points.length - 1) / 2]!
              : ([
                  (points[points.length / 2 - 1]![0] + points[points.length / 2]![0]) / 2,
                  (points[points.length / 2 - 1]![1] + points[points.length / 2]![1]) / 2,
                ] as const);
          const position = toScreen(element.x + mid[0], element.y + mid[1]);
          return (
            <span key={element.id} className="overlay__rate" style={position}>
              {formatCompactNumber(edgeResult.routed_rps)} req/s
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}
