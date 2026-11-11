import { describe, expect, it } from "vitest";

import type { Graph } from "../../../lib/api";
import { validateGraphForRun } from "./graph-validation";
import {
  addCustomPath,
  pathCoverageWarnings,
  pathPercents,
  readWriteSplitTemplate,
  removePath,
  setPathPercent,
  sumPercents,
} from "./traffic-paths";

describe("traffic paths", () => {
  it("keeps percents summing to 100 when editing one path", () => {
    const paths = readWriteSplitTemplate();
    const next = setPathPercent(paths, paths[0]!.id, 70);
    expect(sumPercents(next)).toBe(100);
    expect(pathPercents(next).get(paths[0]!.id)).toBe(70);
  });

  it("does not reuse an id after a path is removed", () => {
    const three = addCustomPath(readWriteSplitTemplate());
    const two = removePath(three, three[1]!.id);
    const ids = addCustomPath(two).map((path) => path.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("warns when a path has no tagged edges", () => {
    const paths = readWriteSplitTemplate();
    const warnings = pathCoverageWarnings(paths, [
      {
        id: "edge-1",
        source_node_id: "a",
        target_node_id: "b",
        interaction_type: "sync_request",
        request_class_ids: [paths[0]!.id],
        routing_rule: { rule_type: "always" },
      },
    ]);
    expect(warnings.map((item) => item.pathId)).toEqual([paths[1]!.id]);
  });
});

describe("validateGraphForRun", () => {
  const node = (id: string, archetype: Graph["nodes"][number]["archetype"]) => ({
    id,
    label: id,
    archetype,
    position: { x: 0, y: 0 },
    properties: {},
  });
  const edge = (id: string, source: string, target: string) => ({
    id,
    source_node_id: source,
    target_node_id: target,
    interaction_type: "sync_request" as const,
    routing_rule: { rule_type: "always" as const },
  });

  it("asks for components on an empty graph", () => {
    expect(validateGraphForRun({ nodes: [], edges: [] })).toHaveLength(1);
  });

  it("requires exactly one client", () => {
    expect(
      validateGraphForRun({ nodes: [node("s", "stateless_service")], edges: [] })[0]?.message,
    ).toMatch(/Add a Client/);
    const two = validateGraphForRun({
      nodes: [node("a", "client"), node("b", "client")],
      edges: [],
    });
    expect(two[0]?.nodeIds).toEqual(["a", "b"]);
  });

  it("reports the nodes on a cycle", () => {
    const issues = validateGraphForRun({
      nodes: [node("c", "client"), node("a", "stateless_service"), node("b", "stateless_service")],
      edges: [edge("1", "c", "a"), edge("2", "a", "b"), edge("3", "b", "a")],
    });
    expect(issues).toEqual([{ message: expect.stringMatching(/Loops/), nodeIds: ["a", "b"] }]);
  });

  it("passes a valid graph", () => {
    expect(
      validateGraphForRun({
        nodes: [node("c", "client"), node("a", "stateless_service")],
        edges: [edge("1", "c", "a")],
      }),
    ).toEqual([]);
  });
});
