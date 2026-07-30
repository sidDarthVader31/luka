import type { GraphNode, NodeArchetype } from "../../../lib/api";

export type CapacitySize = "small" | "medium" | "large" | "custom";

export type CapacityPreset = {
  replicas?: number;
  capacity_rps?: number;
  base_latency_ms?: number;
  cache_hit_rate?: number;
};

const PRESETS: Partial<Record<NodeArchetype, Record<"small" | "medium" | "large", CapacityPreset>>> =
  {
    gateway: {
      small: { replicas: 1, capacity_rps: 8000, base_latency_ms: 8 },
      medium: { replicas: 2, capacity_rps: 25000, base_latency_ms: 8 },
      large: { replicas: 4, capacity_rps: 40000, base_latency_ms: 8 },
    },
    stateless_service: {
      small: { replicas: 1, capacity_rps: 3000, base_latency_ms: 20 },
      medium: { replicas: 2, capacity_rps: 10000, base_latency_ms: 20 },
      large: { replicas: 4, capacity_rps: 20000, base_latency_ms: 20 },
    },
    cache: {
      small: {
        replicas: 1,
        capacity_rps: 20000,
        base_latency_ms: 3,
        cache_hit_rate: 0.7,
      },
      medium: {
        replicas: 1,
        capacity_rps: 50000,
        base_latency_ms: 3,
        cache_hit_rate: 0.8,
      },
      large: {
        replicas: 2,
        capacity_rps: 80000,
        base_latency_ms: 3,
        cache_hit_rate: 0.9,
      },
    },
    database: {
      small: { replicas: 1, capacity_rps: 2000, base_latency_ms: 25 },
      medium: { replicas: 1, capacity_rps: 7000, base_latency_ms: 25 },
      large: { replicas: 2, capacity_rps: 12000, base_latency_ms: 25 },
    },
    queue: {
      small: { replicas: 1, capacity_rps: 15000, base_latency_ms: 4 },
      medium: { replicas: 1, capacity_rps: 40000, base_latency_ms: 4 },
      large: { replicas: 2, capacity_rps: 60000, base_latency_ms: 4 },
    },
    worker: {
      small: { replicas: 1, capacity_rps: 2000, base_latency_ms: 30 },
      medium: { replicas: 3, capacity_rps: 12000, base_latency_ms: 30 },
      large: { replicas: 6, capacity_rps: 20000, base_latency_ms: 30 },
    },
  };

export function supportsCapacityPresets(archetype: NodeArchetype): boolean {
  return archetype in PRESETS;
}

export function applyPreset(
  archetype: NodeArchetype,
  size: Exclude<CapacitySize, "custom">,
): CapacityPreset | null {
  return PRESETS[archetype]?.[size] ?? null;
}

export function matchPreset(
  archetype: NodeArchetype,
  properties: GraphNode["properties"],
): CapacitySize {
  const table = PRESETS[archetype];
  if (!table) {
    return "custom";
  }

  for (const size of ["small", "medium", "large"] as const) {
    const preset = table[size];
    if (propertiesMatch(properties, preset)) {
      return size;
    }
  }

  return "custom";
}

function propertiesMatch(
  properties: GraphNode["properties"],
  preset: CapacityPreset,
): boolean {
  for (const [key, expected] of Object.entries(preset) as Array<
    [keyof CapacityPreset, number | undefined]
  >) {
    if (expected === undefined) {
      continue;
    }
    const actual = properties[key];
    if (actual === undefined) {
      return false;
    }
    if (Math.abs(actual - expected) > 1e-9) {
      return false;
    }
  }
  return true;
}

export const PROPERTY_LABELS: Record<
  keyof NonNullable<GraphNode["properties"]>,
  { label: string; help: string }
> = {
  replicas: {
    label: "Instances",
    help: "How many identical copies share the load.",
  },
  capacity_rps: {
    label: "Work per instance / sec",
    help: "Rough max ops one instance can handle before saturating.",
  },
  base_latency_ms: {
    label: "Healthy latency (ms)",
    help: "Delay when the component is not overloaded.",
  },
  cache_hit_rate: {
    label: "Cache hit rate",
    help: "Fraction of reads served without hitting the DB (0–1).",
  },
};

/** FE-only preset table for later backend handoff. */
export function describePresetTable(): string {
  return Object.entries(PRESETS)
    .map(([archetype, sizes]) => {
      const rows = (["small", "medium", "large"] as const)
        .map((size) => {
          const p = sizes[size];
          const hit =
            p.cache_hit_rate !== undefined
              ? `, hit ${Math.round(p.cache_hit_rate * 100)}%`
              : "";
          return `  ${size}: ${p.replicas}×${p.capacity_rps} rps, ${p.base_latency_ms}ms${hit}`;
        })
        .join("\n");
      return `${archetype}:\n${rows}`;
    })
    .join("\n\n");
}
