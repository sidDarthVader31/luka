import { afterEach, describe, expect, it, vi } from "vitest";

import type { Design, Problem } from "../../lib/api";
import { catalogFixture } from "../../test/fixtures/catalog";
import { parseMarkdown } from "./parse-markdown";
import { problemProgress, readLastRunPassed, writeLastRunPassed } from "./problem-status";
import { starterDesign } from "./starter";

function design(id: string, problemId: string | undefined, updatedAt: string): Design {
  return {
    id,
    name: id,
    problem_id: problemId,
    graph: { nodes: [], edges: [] },
    updated_at: updatedAt,
  };
}

const problem: Problem = {
  id: "url-shortener",
  title: "URL shortener",
  summary: "Short links at scale.",
  difficulty: "easy",
  brief: "# Brief",
  workload: { requests_per_second: 10000, read_share: 0.95 },
  targets: [],
};

describe("problemProgress", () => {
  const designs = [
    design("a", "url-shortener", "2026-11-01T00:00:00Z"),
    design("b", "url-shortener", "2026-11-05T00:00:00Z"),
    design("c", "feed", "2026-11-06T00:00:00Z"),
    design("d", undefined, "2026-11-07T00:00:00Z"),
  ];

  it("is not started without designs for the problem", () => {
    expect(problemProgress("chat", designs, () => null)).toEqual({ status: "not_started" });
  });

  it("is in progress until a design's last run passed, and points at the latest design", () => {
    const progress = problemProgress("url-shortener", designs, () => false);
    expect(progress.status).toBe("in_progress");
    expect(progress.latest?.id).toBe("b");
  });

  it("is solved when any design's last run passed every target", () => {
    const passed = (id: string) => (id === "a" ? true : null);
    expect(problemProgress("url-shortener", designs, passed).status).toBe("solved");
  });
});

describe("lastRunPassed storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips per design id", () => {
    expect(readLastRunPassed("x")).toBeNull();
    writeLastRunPassed("x", true);
    writeLastRunPassed("y", false);
    expect(readLastRunPassed("x")).toBe(true);
    expect(readLastRunPassed("y")).toBe(false);
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeLastRunPassed("x", true)).not.toThrow();
    expect(readLastRunPassed("x")).toBeNull();
  });
});

describe("starterDesign", () => {
  it("links the problem and starts with one client", () => {
    const request = starterDesign(problem, catalogFixture.items);
    expect(request.name).toBe("URL shortener");
    expect(request.problem_id).toBe("url-shortener");
    expect(request.graph.nodes.map((node) => node.archetype)).toEqual(["client"]);
    expect(request.graph.edges).toEqual([]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists and inline marks", () => {
    expect(
      parseMarkdown(
        "# Title\n\nServe **10k** reads\nper second.\n\n- one `a`\n- *two*\n\n1. first",
      ),
    ).toEqual([
      { type: "heading", level: 1, content: [{ type: "text", text: "Title" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Serve " },
          { type: "strong", text: "10k" },
          { type: "text", text: " reads per second." },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [
            { type: "text", text: "one " },
            { type: "code", text: "a" },
          ],
          [{ type: "em", text: "two" }],
        ],
      },
      { type: "list", ordered: true, items: [[{ type: "text", text: "first" }]] },
    ]);
  });

  it("keeps HTML as plain text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }],
      },
    ]);
  });
});
