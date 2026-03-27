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
  rule_type: RoutingRuleType;
  routing_weight?: number;
  attempted_rps?: number;
  retried_rps?: number;
  timed_out_rps?: number;
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
};

export type RunResult = {
  summary: string;
  bottleneck?: RunNodeResult;
  nodes: RunNodeResult[];
  edges: RunEdgeResult[];
  paths?: PathExplanation[];
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
  }>;
};

export type Run = {
  id: string;
  design_id?: string;
  design_snapshot: Design;
  workload: Workload;
  simulation_config: {
    mode: "analytical";
  };
  status: "completed";
  result?: RunResult;
  created_at: string;
  completed_at?: string;
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
    mode: "analytical";
  };
}) {
  return request<Run>("/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
