import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describe, expect, it } from "vitest";

import type { Graph, RequestClass } from "../../../lib/api";
import { catalogFixture } from "../../../test/fixtures/catalog";
import { componentElementId, connectionElementId, graphToScene } from "./graph-to-scene";
import {
  componentSkeleton,
  insertComponent,
  makeComponent,
  nextNodeId,
  reassignDuplicatedIds,
} from "./insert-component";
import { sceneToGraph } from "./scene-to-graph";
import { componentData } from "./types";

const catalog = catalogFixture.items;
const allTraffic: RequestClass[] = [{ id: "flow-1", name: "All traffic", traffic_share: 100 }];

function item(id: string) {
  return catalog.find((entry) => entry.id === id)!;
}

const sampleGraph: Graph = {
  request_classes: allTraffic,
  nodes: [
    node("client-1", "Client", "client", "client", 0, 0, {}),
    node("lb-1", "LB", "gateway", "load-balancer", 300, 0, {
      replicas: 2,
      capacity_rps: 25000,
      base_latency_ms: 8,
    }),
    node("svc-1", "API", "stateless_service", "service", 600, 0, {
      replicas: 4,
      capacity_rps: 10000,
      base_latency_ms: 20,
    }),
    node("cache-1", "Redis", "cache", "redis", 900, -150, {
      replicas: 1,
      capacity_rps: 50000,
      base_latency_ms: 3,
      cache_hit_rate: 0.9,
    }),
    node("db-1", "Postgres", "database", "postgres", 900, 150, {
      replicas: 1,
      capacity_rps: 7000,
      base_latency_ms: 25,
    }),
  ],
  edges: [
    edge("e1", "client-1", "lb-1"),
    edge("e2", "lb-1", "svc-1"),
    edge("e3", "svc-1", "cache-1"),
    {
      ...edge("e4", "cache-1", "db-1"),
      routing_rule: { rule_type: "cache_miss" },
      interaction_type: "conditional_branch",
    },
    { ...edge("e5", "svc-1", "db-1"), timeout_ms: 500, retry_attempts: 2 },
  ],
};

function node(
  id: string,
  label: string,
  archetype: Graph["nodes"][number]["archetype"],
  componentId: string,
  x: number,
  y: number,
  properties: Graph["nodes"][number]["properties"],
): Graph["nodes"][number] {
  return {
    id,
    label,
    archetype,
    component_id: componentId,
    position: { x, y },
    width: 180,
    height: 80,
    properties,
  };
}

function box(componentId: string, id: string, x: number) {
  const entry = item(componentId);
  return componentSkeleton(entry, { id, nodeId: `${componentId}-1`, label: entry.name, x, y: 0 });
}

function edge(id: string, source: string, target: string): Graph["edges"][number] {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    interaction_type: "sync_request",
    routing_rule: { rule_type: "always" },
    request_class_ids: ["flow-1"],
  };
}

describe("graphToScene / sceneToGraph", () => {
  it("round-trips a graph through a scene", () => {
    const scene = graphToScene(sampleGraph, catalog);
    const derived = sceneToGraph(scene.elements, catalog, allTraffic);

    expect(derived.warnings).toEqual([]);
    expect(derived.graph.nodes).toEqual(sampleGraph.nodes);
    expect(derived.graph.edges).toEqual(sampleGraph.edges);
    expect(derived.elementIdByNodeId.get("svc-1")).toBe(componentElementId("svc-1"));
    expect(derived.elementIdByEdgeId.get("e3")).toBe(connectionElementId("e3"));
  });

  it("binds arrows to both components and labels each container", () => {
    const scene = graphToScene(sampleGraph, catalog);
    const arrow = scene.elements.find((element) => element.id === connectionElementId("e1"));
    expect(arrow).toMatchObject({
      startBinding: { elementId: componentElementId("client-1") },
      endBinding: { elementId: componentElementId("lb-1") },
    });
    const texts = scene.elements.filter((element) => element.type === "text");
    expect(texts).toHaveLength(sampleGraph.nodes.length);
  });

  it("maps old nodes without a component id to the first catalog item of their kind", () => {
    const old: Graph = {
      nodes: [
        { id: "db", label: "DB", archetype: "database", position: { x: 0, y: 0 }, properties: {} },
      ],
      edges: [],
    };
    const derived = sceneToGraph(graphToScene(old, catalog).elements, catalog, []);
    expect(derived.graph.nodes[0]).toMatchObject({
      component_id: "postgres",
      archetype: "database",
    });
  });
});

describe("sceneToGraph", () => {
  it("ignores annotations and uses defaults for new arrows", () => {
    const elements = convertToExcalidrawElements(
      [
        box("client", "a", 0),
        box("service", "b", 400),
        { type: "text", x: 0, y: 300, text: "a note" },
        { type: "rectangle", x: 0, y: 400, width: 100, height: 100 },
        { type: "arrow", x: 180, y: 40, start: { id: "a" }, end: { id: "b" } },
        {
          type: "arrow",
          x: 0,
          y: 600,
          points: [
            [0, 0],
            [100, 0],
          ],
        },
      ],
      { regenerateIds: false },
    );
    const derived = sceneToGraph(elements, catalog, allTraffic);

    expect(derived.warnings).toEqual([]);
    expect(derived.graph.nodes.map((entry) => entry.id)).toEqual(["client-1", "service-1"]);
    expect(derived.graph.edges).toHaveLength(1);
    expect(derived.graph.edges[0]).toMatchObject({
      source_node_id: "client-1",
      target_node_id: "service-1",
      interaction_type: "sync_request",
      routing_rule: { rule_type: "always" },
      request_class_ids: ["flow-1"],
    });
  });

  it("warns about half-attached and unsupported arrows and leaves them out", () => {
    const elements = convertToExcalidrawElements(
      [
        box("client", "a", 0),
        box("postgres", "b", 400),
        { type: "arrow", x: 180, y: 40, start: { id: "a" }, end: { id: "b" } },
        {
          type: "arrow",
          x: 180,
          y: 60,
          start: { id: "a" },
          points: [
            [0, 0],
            [100, 300],
          ],
        },
      ],
      { regenerateIds: false },
    );
    const derived = sceneToGraph(elements, catalog, allTraffic);
    expect(derived.graph.edges).toEqual([]);
    expect(derived.warnings.map((warning) => warning.message)).toEqual([
      "Client → Postgres is not a supported connection; it is ignored.",
      "An arrow from Client is not attached to a component at both ends.",
    ]);
  });

  it("falls back to an allowed interaction when the stored one is not supported", () => {
    const graph: Graph = {
      nodes: sampleGraph.nodes.slice(0, 2),
      edges: [{ ...edge("e1", "client-1", "lb-1"), interaction_type: "async_enqueue" }],
    };
    const derived = sceneToGraph(graphToScene(graph, catalog).elements, catalog, allTraffic);
    expect(derived.graph.edges[0]!.interaction_type).toBe("sync_request");
    expect(derived.warnings).toHaveLength(1);
  });

  it("skips deleted elements", () => {
    const scene = graphToScene(sampleGraph, catalog);
    const elements = scene.elements.map((element) =>
      element.id === componentElementId("db-1") ? { ...element, isDeleted: true } : element,
    );
    const derived = sceneToGraph(elements, catalog, allTraffic);
    expect(derived.graph.nodes.map((entry) => entry.id)).not.toContain("db-1");
    expect(derived.graph.edges.map((entry) => entry.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("insert-component", () => {
  it("creates a labelled container centred on the point with catalog defaults", () => {
    const elements = insertComponent(item("redis"), [], { x: 500, y: 300 });
    const box = elements.find((element) => element.type === "rectangle")!;
    const label = elements.find((element) => element.type === "text")!;
    expect(box.x + box.width / 2).toBe(500);
    expect(box.y + box.height / 2).toBe(300);
    expect(componentData(box)).toEqual({
      nodeId: "redis-1",
      componentId: "redis",
      properties: item("redis").default_properties,
    });
    expect(label).toMatchObject({ containerId: box.id, text: "Redis" });
  });

  it("numbers repeated components", () => {
    const first = insertComponent(item("service"), [], { x: 0, y: 0 });
    const second = insertComponent(item("service"), first, { x: 0, y: 200 });
    const derived = sceneToGraph([...first, ...second], catalog, []);
    expect(derived.graph.nodes.map((entry) => [entry.id, entry.label])).toEqual([
      ["service-1", "Service"],
      ["service-2", "Service 2"],
    ]);
  });

  it("places a new component beside one already at the insertion point", () => {
    const first = insertComponent(item("service"), [], { x: 0, y: 0 });
    const second = insertComponent(item("redis"), first, { x: 0, y: 0 });
    expect(second[0]!.x).toBe(first[0]!.x + first[0]!.width + 60);
    expect(second[0]!.y).toBe(first[0]!.y);
  });

  it("nextNodeId picks the lowest free index", () => {
    expect(nextNodeId("redis", new Set(["redis-1", "redis-3"]))).toBe("redis-2");
  });

  it("turns a plain rectangle into a labelled component and keeps its arrow bindings", () => {
    const [shape] = convertToExcalidrawElements(
      [{ type: "rectangle", id: "plain", x: 0, y: 0, width: 200, height: 100 }],
      { regenerateIds: false },
    );
    const withArrow: ExcalidrawElement = {
      ...shape!,
      boundElements: [{ type: "arrow", id: "a1" }],
    };
    const replacement = makeComponent(withArrow, item("kafka"), []);
    expect(replacement).toHaveLength(2);
    expect(componentData(replacement[0]!)).toMatchObject({
      nodeId: "kafka-1",
      componentId: "kafka",
    });
    expect(replacement[0]!.boundElements).toEqual([
      { type: "arrow", id: "a1" },
      { type: "text", id: replacement[1]!.id },
    ]);
    expect(replacement[1]).toMatchObject({ containerId: "plain", text: "Kafka" });
  });

  it("gives duplicated components and arrows fresh ids", () => {
    const scene = graphToScene(sampleGraph, catalog);
    const box = scene.elements.find((element) => element.id === componentElementId("svc-1"))!;
    const arrow = scene.elements.find((element) => element.id === connectionElementId("e1"))!;
    const copies = [
      { ...box, id: "copy-box" },
      { ...arrow, id: "copy-arrow" },
    ];
    const next = reassignDuplicatedIds([...scene.elements, ...copies], scene.elements);
    const copyBox = next.find((element) => element.id === "copy-box")!;
    const copyArrow = next.find((element) => element.id === "copy-arrow")!;
    expect(componentData(copyBox)?.nodeId).toBe("service-1");
    expect(copyArrow.customData?.luka.edgeId).toBe("copy-arrow");
    expect(next.slice(0, scene.elements.length)).toEqual(scene.elements);
  });
});
