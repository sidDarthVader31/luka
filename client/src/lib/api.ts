export type NodeArchetype =
  | "client"
  | "gateway"
  | "stateless_service"
  | "cache"
  | "database"
  | "queue"
  | "worker";

export type NodeColor =
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "cobalt"
  | "indigo"
  | "emerald"
  | "amber"
  | "coral"
  | "orange"
  | "teal";

export type EdgeInteractionType =
  | "sync_request"
  | "async_enqueue"
  | "consume"
  | "conditional_branch"
  | "fallback";
export type RoutingRuleType = "always" | "cache_hit" | "cache_miss";

export type GraphNode = {
  id: string;
  label: string;
  archetype: NodeArchetype;
  color: NodeColor;
  position: {
    x: number;
    y: number;
  };
  properties: {
    replicas?: number;
    capacity_rps?: number;
    base_latency_ms?: number;
    cache_hit_rate?: number;
    balancing_strategy?: "weighted_round_robin" | "least_pressure";
    cache_warmup_ticks?: number;
    cache_invalidation_rate?: number;
    read_capacity_rps?: number;
    write_capacity_rps?: number;
    connection_limit?: number;
  };
};

export type GraphEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  interaction_type: EdgeInteractionType;
  fanout_multiplier?: number;
  timeout_ms?: number;
  retry_attempts?: number;
  retry_budget_ratio?: number;
  circuit_breaker_threshold?: number;
  request_class_ids?: string[];
  routing_rule: {
    rule_type: RoutingRuleType;
    value?: number;
  };
};

export type RequestClass = {
  id: string;
  name: string;
  traffic_share?: number;
};

export type Design = {
  id: string;
  name: string;
  description?: string;
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    request_classes?: RequestClass[];
  };
  created_at?: string;
  updated_at?: string;
};

export type CreateDesignInput = {
  name: string;
  description?: string;
  graph: Design["graph"];
};

export type UpdateDesignInput = {
  name?: string;
  description?: string;
  graph?: Design["graph"];
};

export type ComponentArchetype = {
  archetype: NodeArchetype;
  display_name: string;
  default_color: GraphNode["color"];
  default_properties: Record<string, number>;
  supported_interactions: EdgeInteractionType[];
  supported_routing_rules: RoutingRuleType[];
};

export type DesignVersion = {
  design_id: string;
  version: number;
  design_snapshot: Design;
  created_at: string;
};

export type Workload = {
  requests_per_second: number;
  concurrent_users?: number;
  read_write_ratio?: number;
  payload_kb?: number;
  fanout_count?: number;
};

export type RunNodeResult = {
  node_id: string;
  label: string;
  archetype: NodeArchetype;
  incoming_rps: number;
  processed_rps: number;
  dropped_rps: number;
  effective_capacity_rps: number;
  utilization: number;
  estimated_latency_ms: number;
  queue_depth_estimate?: number;
  queue_lag_ms?: number;
  saturated: boolean;
  explanation: string;
};

export type RunEdgeResult = {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  interaction_type: EdgeInteractionType;
  fanout_multiplier: number;
  timeout_ms?: number;
  retry_attempts?: number;
  retry_budget_ratio?: number;
  rule_type: RoutingRuleType;
  routing_weight?: number;
  attempted_rps?: number;
  retried_rps?: number;
  timed_out_rps?: number;
  fallback_rps?: number;
  dead_lettered_rps?: number;
  circuit_open?: boolean;
  routed_rps: number;
};

export type PathExplanation = {
  kind: string;
  summary: string;
  node_ids: string[];
  edge_ids: string[];
  estimated_latency_ms?: number;
  queue_lag_ms?: number;
  retried_rps?: number;
  timed_out_rps?: number;
  fallback_rps?: number;
  dead_lettered_rps?: number;
};

export type RunResult = {
  summary: string;
  bottleneck?: RunNodeResult;
  nodes: RunNodeResult[];
  edges: RunEdgeResult[];
  paths?: PathExplanation[];
  ticks?: Array<{
    index: number;
    time_ms: number;
    summary?: string;
    nodes: Array<{
      node_id: string;
      incoming_rps: number;
      processed_rps: number;
      dropped_rps: number;
      utilization: number;
      estimated_latency_ms: number;
      queue_depth_estimate?: number;
      queue_lag_ms?: number;
      saturated: boolean;
    }>;
    edges: Array<{
      edge_id: string;
      attempted_rps?: number;
      routed_rps: number;
      retried_rps?: number;
      timed_out_rps?: number;
      fallback_rps?: number;
      dead_lettered_rps?: number;
      circuit_open?: boolean;
      routing_weight?: number;
    }>;
  }>;
  flows?: Array<{
    request_class_id: string;
    name: string;
    traffic_share: number;
    workload: Workload;
    summary: string;
    bottleneck?: RunNodeResult;
    nodes: RunNodeResult[];
    edges: RunEdgeResult[];
    paths?: PathExplanation[];
    ticks?: RunResult["ticks"];
  }>;
};

export type Run = {
  id: string;
  design_id?: string;
  design_snapshot: Design;
  workload: Workload;
  simulation_config: {
    mode: "analytical" | "tick_based";
    tick_count?: number;
    tick_duration_ms?: number;
  };
  status: "completed";
  result?: RunResult;
  created_at: string;
  completed_at?: string;
};

export type StreamedTick = NonNullable<RunResult["ticks"]>[number];

export type SimulationStreamEvent = {
  type: "start" | "tick" | "complete" | "error";
  run_id?: string;
  tick?: StreamedTick;
  result?: RunResult;
  error?: string;
};

export type ApiStatus = {
  name: string;
  version: string;
  api: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string; details?: string }
      | null;

    throw new Error(
      errorBody?.details ?? errorBody?.error ?? "Luka API request failed",
    );
  }

  return (await response.json()) as T;
}

export function getStatus() {
  return request<ApiStatus>("/status");
}

export async function listComponentArchetypes() {
  const response = await request<{ items: ComponentArchetype[] }>(
    "/component-archetypes",
  );

  return response.items;
}

export function getDesign(designId: string) {
  return request<Design>(`/designs/${designId}`);
}

export function createDesign(input: CreateDesignInput) {
  return request<Design>("/designs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDesign(designId: string, input: UpdateDesignInput) {
  return request<Design>(`/designs/${designId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function duplicateDesign(
  designId: string,
  input?: {
    name?: string;
    description?: string;
  },
) {
  return request<Design>(`/designs/${designId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function createRun(input: {
  design_id?: string;
  design?: Design;
  workload: Workload;
  simulation_config: {
    mode: "analytical" | "tick_based";
    tick_count?: number;
    tick_duration_ms?: number;
  };
}) {
  return request<Run>("/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function streamRun(
  input: Parameters<typeof createRun>[0],
  handlers: {
    onStart?: () => void;
    onTick?: (tick: StreamedTick) => void;
    onComplete?: (event: SimulationStreamEvent) => void;
  } = {},
) {
  const response = await fetch(`${API_BASE}/runs/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string; details?: string }
      | null;

    throw new Error(
      errorBody?.details ?? errorBody?.error ?? "Luka stream request failed",
    );
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completionEvent: SimulationStreamEvent | null = null;

  function handleChunk(chunk: string) {
    let eventType = "message";
    const dataLines: string[] = [];

    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    const payload = JSON.parse(dataLines.join("\n")) as SimulationStreamEvent;
    const effectiveType = payload.type || (eventType as SimulationStreamEvent["type"]);

    switch (effectiveType) {
      case "start":
        handlers.onStart?.();
        break;
      case "tick":
        if (payload.tick) {
          handlers.onTick?.(payload.tick);
        }
        break;
      case "complete":
        completionEvent = payload;
        handlers.onComplete?.(payload);
        break;
      case "error":
        throw new Error(payload.error || "Luka simulation stream failed");
      default:
        break;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      handleChunk(chunk);
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  return completionEvent;
}

export function getRun(runId: string) {
  return request<Run>(`/runs/${runId}`);
}

export async function listRunsForDesign(designId: string) {
  const response = await request<{ items: Run[] }>(`/designs/${designId}/runs`);

  return response.items;
}

export async function listDesignVersions(designId: string) {
  const response = await request<{ items: DesignVersion[] }>(`/designs/${designId}/versions`);

  return response.items;
}
