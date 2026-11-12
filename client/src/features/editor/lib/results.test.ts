import { describe, expect, it } from "vitest";

import { resultFixture } from "../../../test/fixtures/result";
import {
  bottleneck,
  componentRows,
  countNines,
  edgeLabel,
  formatAvailability,
  formatMs,
  formatNines,
  formatSuccess,
  groupFindings,
  hasDemand,
  loadLevel,
  targetLine,
  targetSummary,
} from "./results";

describe("availability", () => {
  it("counts nines despite float error", () => {
    expect(countNines(0.999)).toBe(3);
    expect(countNines(0.9995)).toBe(3);
    expect(countNines(0.99)).toBe(2);
    expect(countNines(0.95)).toBe(1);
    expect(countNines(0.5)).toBe(0);
    expect(countNines(1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("formats with enough digits to show the nines", () => {
    expect(formatAvailability(0.999)).toBe("99.9%");
    expect(formatAvailability(0.9995)).toBe("99.95%");
    expect(formatAvailability(0.99995)).toBe("99.995%");
    expect(formatAvailability(0.95)).toBe("95%");
    expect(formatAvailability(0.997)).toBe("99.7%");
    expect(formatAvailability(1)).toBe("100%");
  });

  it("labels the nines", () => {
    expect(formatNines(0.999)).toBe("99.9% · 3 nines");
    expect(formatNines(0.95)).toBe("95% · 1 nine");
    expect(formatNines(0.5)).toBe("50%");
    expect(formatNines(1)).toBe("100%");
  });
});

describe("latency and success", () => {
  it("shows undefined p99 as overloaded", () => {
    expect(formatMs(undefined)).toBe("Undefined (overloaded)");
    expect(formatMs(null)).toBe("Undefined (overloaded)");
    expect(formatMs(4.24)).toBe("4.2 ms");
    expect(formatMs(98.4)).toBe("98 ms");
    expect(formatMs(1530)).toBe("1.5 s");
  });

  it("never rounds a lossy success rate up to 100%", () => {
    expect(formatSuccess(0.9999)).toBe("99.9%");
    expect(formatSuccess(1)).toBe("100%");
    expect(formatSuccess(0.714)).toBe("71.4%");
  });
});

describe("targets", () => {
  it("formats actual vs expected, with null actual as undefined", () => {
    const [throughput, p99, availability] = resultFixture.targets!;
    expect(targetLine(throughput!)).toEqual({ actual: "8.5k req/s", expected: "≥ 9.0k req/s" });
    expect(targetLine(p99!)).toEqual({ actual: "Undefined (overloaded)", expected: "≤ 200 ms" });
    expect(targetLine(availability!)).toEqual({ actual: "99.8%", expected: "≥ 99%" });
  });

  it("summarises how many targets were met", () => {
    expect(targetSummary(resultFixture.targets)).toEqual({
      met: 1,
      total: 3,
      allPassed: false,
      label: "1 of 3 targets met",
    });
    expect(targetSummary(undefined)).toBeNull();
    expect(targetSummary([])).toBeNull();
  });
});

describe("result selectors", () => {
  it("groups findings by severity, errors first", () => {
    expect(
      groupFindings(resultFixture.findings).map((group) => [
        group.severity,
        group.findings.map((finding) => finding.rule_id),
      ]),
    ).toEqual([
      ["error", ["overloaded_node"]],
      ["warning", ["near_capacity"]],
      ["info", ["read_heavy_without_cache"]],
    ]);
  });

  it("finds the bottleneck and lists components without clients", () => {
    expect(bottleneck(resultFixture)?.label).toBe("Postgres");
    expect(componentRows(resultFixture).map((node) => node.node_id)).toEqual([
      "lb-1",
      "svc-1",
      "cache-1",
      "db-1",
      "idle-1",
    ]);
  });

  it("classifies load and demand", () => {
    const [, lb, svc, , db, idle] = resultFixture.nodes;
    expect([lb, svc, db].map((node) => loadLevel(node!))).toEqual(["ok", "warn", "over"]);
    expect(hasDemand(idle!)).toBe(false);
    expect(hasDemand(db!)).toBe(true);
  });

  it("labels edges with total req/s and the read/write split", () => {
    expect(edgeLabel(resultFixture.edges[0]!)).toEqual({
      text: "10.0k req/s",
      title: "9.0k reads · 1.0k writes",
    });
  });
});
