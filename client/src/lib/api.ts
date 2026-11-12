import type {
  Catalog,
  CreateDesignRequest,
  Design,
  DuplicateDesignRequest,
  Problem,
  SimulateRequest,
  SimulationResult,
  UpdateDesignRequest,
} from "./api-types.gen";

export type * from "./api-types.gen";
// Aliased because the DOM already defines `Node`.
export type { Edge as GraphEdge, Node as GraphNode } from "./api-types.gen";

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
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error ?? "Luka API request failed");
  }

  return (await response.json()) as T;
}

export function getCatalog() {
  return request<Catalog>("/catalog");
}

export function getDesign(designId: string) {
  return request<Design>(`/designs/${designId}`);
}

export async function listDesigns() {
  const response = await request<{ items: Design[] }>("/designs");
  return response.items;
}

export function createDesign(input: CreateDesignRequest) {
  return request<Design>("/designs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDesign(designId: string, input: UpdateDesignRequest) {
  return request<Design>(`/designs/${designId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function duplicateDesign(designId: string, input?: DuplicateDesignRequest) {
  return request<Design>(`/designs/${designId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function listTemplates() {
  const response = await request<{ items: Design[] }>("/templates");
  return response.items;
}

export async function simulate(input: SimulateRequest) {
  const response = await request<{ result: SimulationResult }>("/simulate", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.result;
}

export async function listProblems() {
  const response = await request<{ items: Problem[] }>("/problems");
  return response.items;
}

export function getProblem(problemId: string) {
  return request<Problem>(`/problems/${problemId}`);
}
