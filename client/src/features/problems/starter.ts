import type { CatalogItem, CreateDesignRequest, Problem } from "../../lib/api";
import { insertComponent } from "../editor/scene/insert-component";
import { sceneToGraph } from "../editor/scene/scene-to-graph";
import type { LukaScene } from "../editor/scene/types";

/** A new design for a problem: linked by `problem_id`, with one Client on the canvas. */
export function starterDesign(problem: Problem, catalog: CatalogItem[]): CreateDesignRequest {
  const client = catalog.find((item) => item.kind === "client");
  const elements = client ? insertComponent(client, [], { x: 0, y: 0 }) : [];
  const scene: LukaScene = { type: "luka-scene", version: 1, elements, appState: {} };
  return {
    name: problem.title,
    problem_id: problem.id,
    graph: sceneToGraph(elements, catalog).graph,
    scene,
  };
}
