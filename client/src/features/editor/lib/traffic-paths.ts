import type { GraphEdge, RequestClass } from "../../../lib/api";

// Request-class "traffic paths". Phase 3 replaces these with read/write traffic.

export function createRequestClass(
  name: string,
  trafficShare: number,
  index: number,
): RequestClass {
  return { id: `flow-${index}`, name, traffic_share: trafficShare };
}

/** Display percents that sum to ~100 from raw traffic_share values. */
export function pathPercents(paths: RequestClass[]): Map<string, number> {
  const total = paths.reduce((sum, path) => sum + Math.max(path.traffic_share ?? 0, 0), 0);
  const map = new Map<string, number>();
  if (total <= 0) {
    const even = paths.length > 0 ? Math.round((100 / paths.length) * 10) / 10 : 100;
    for (const path of paths) {
      map.set(path.id, even);
    }
    return map;
  }
  for (const path of paths) {
    map.set(path.id, Math.round(((path.traffic_share ?? 0) / total) * 1000) / 10);
  }
  return map;
}

export function sumPercents(paths: RequestClass[]): number {
  let sum = 0;
  for (const value of pathPercents(paths).values()) {
    sum += value;
  }
  return Math.round(sum * 10) / 10;
}

/** Set one path's percent; redistribute the rest so values sum to 100. */
export function setPathPercent(paths: RequestClass[], id: string, percent: number): RequestClass[] {
  if (paths.length === 0) {
    return paths;
  }
  if (paths.length === 1) {
    return paths.map((path) => ({ ...path, traffic_share: 100 }));
  }

  const clamped = Math.max(1, Math.min(99, percent));
  const others = paths.filter((path) => path.id !== id);
  const otherTotal =
    others.reduce((sum, path) => sum + Math.max(path.traffic_share ?? 0, 0), 0) || others.length;

  const next = paths.map((path) => {
    if (path.id === id) {
      return { ...path, traffic_share: clamped };
    }
    const share = (Math.max(path.traffic_share ?? 0, 0) / otherTotal) * (100 - clamped);
    return { ...path, traffic_share: Math.max(0.1, Math.round(share * 10) / 10) };
  });

  return normalizeSharesTo100(next);
}

function normalizeSharesTo100(paths: RequestClass[]): RequestClass[] {
  const total = paths.reduce((sum, path) => sum + Math.max(path.traffic_share ?? 0, 0), 0);
  if (total <= 0) {
    const even = 100 / paths.length;
    return paths.map((path) => ({ ...path, traffic_share: even }));
  }
  const scaled = paths.map((path) => ({
    ...path,
    traffic_share: (Math.max(path.traffic_share ?? 0, 0) / total) * 100,
  }));
  const rounded = scaled.map((path) => ({
    ...path,
    traffic_share: Math.round((path.traffic_share ?? 0) * 10) / 10,
  }));
  const drift = 100 - rounded.reduce((sum, path) => sum + (path.traffic_share ?? 0), 0);
  if (rounded[0] && Math.abs(drift) > 0.01) {
    rounded[0] = {
      ...rounded[0],
      traffic_share: Math.round(((rounded[0].traffic_share ?? 0) + drift) * 10) / 10,
    };
  }
  return rounded;
}

export function renamePath(paths: RequestClass[], id: string, name: string): RequestClass[] {
  return paths.map((path) => (path.id === id ? { ...path, name } : path));
}

export function removePath(paths: RequestClass[], id: string): RequestClass[] {
  if (paths.length <= 1) {
    return paths;
  }
  return normalizeSharesTo100(paths.filter((path) => path.id !== id));
}

export function addCustomPath(paths: RequestClass[]): RequestClass[] {
  const used = new Set(paths.map((path) => path.id));
  let nextIndex = paths.length + 1;
  while (used.has(`flow-${nextIndex}`)) {
    nextIndex += 1;
  }
  const next = [...paths, createRequestClass(`Path ${paths.length + 1}`, 10, nextIndex)];
  return normalizeSharesTo100(next);
}

export function allTrafficTemplate(): RequestClass[] {
  return [createRequestClass("All traffic", 100, 1)];
}

export function readWriteSplitTemplate(): RequestClass[] {
  return normalizeSharesTo100([
    createRequestClass("Read", 80, 1),
    createRequestClass("Write", 20, 2),
  ]);
}

export type PathCoverageWarning = {
  pathId: string;
  pathName: string;
  message: string;
};

/**
 * When multiple paths exist, warn if a path has no tagged edges.
 * (Untagged edges only belong to the first path in the simulator.)
 */
export function pathCoverageWarnings(
  paths: RequestClass[],
  edges: GraphEdge[],
): PathCoverageWarning[] {
  if (paths.length <= 1) {
    return [];
  }

  const warnings: PathCoverageWarning[] = [];
  for (const path of paths) {
    const tagged = edges.filter((edge) => (edge.request_class_ids ?? []).includes(path.id));
    if (tagged.length === 0) {
      warnings.push({
        pathId: path.id,
        pathName: path.name,
        message: `"${path.name}" has no tagged connections — select an edge and assign this path, or traffic may not reach the graph.`,
      });
    }
  }
  return warnings;
}
