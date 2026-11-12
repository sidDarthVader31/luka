import type { CatalogItem, EdgeMode, EdgeTraffic, NodeArchetype } from "../../../lib/api";

export const KIND_LABELS: Record<NodeArchetype, string> = {
  client: "Client",
  cdn: "CDN",
  gateway: "Gateway",
  stateless_service: "Service",
  worker: "Worker",
  cache: "Cache",
  database: "Database",
  object_store: "Object store",
  search: "Search",
  queue: "Queue",
};

export const TRAFFIC_LABELS: Record<EdgeTraffic, string> = {
  all: "All",
  reads: "Reads only",
  writes: "Writes only",
};

export const MODE_LABELS: Record<EdgeMode, string> = {
  sync: "Waits for response",
  async: "Fire and forget",
};

/** Mirrors the server rule: a source may connect only to the kinds in its catalog item's list. */
export function isAllowedTarget(source: CatalogItem | undefined, target: NodeArchetype): boolean {
  return source?.allowed_targets.includes(target) ?? false;
}

/** Why `source` cannot connect to `target`, in one sentence for the inspector. */
export function disallowedReason(
  source: { label: string; item: CatalogItem },
  target: { label: string; item: CatalogItem },
): string {
  const allowed = source.item.allowed_targets;
  if (allowed.length === 0) {
    return `${source.label} is a ${source.item.name}, which is terminal: it can't send traffic onward.`;
  }
  const names = allowed.map((kind) => KIND_LABELS[kind]).join(", ");
  return `A ${source.item.name} can't send traffic to a ${KIND_LABELS[target.item.kind].toLowerCase()} (${target.label}). It can connect to: ${names}.`;
}

/** Queues always deliver asynchronously; the server ignores `mode` on their outgoing edges. */
export function isAlwaysAsync(source: CatalogItem | undefined): boolean {
  return source?.kind === "queue";
}

export function usesWeight(source: CatalogItem | undefined): boolean {
  return source?.kind === "gateway";
}
