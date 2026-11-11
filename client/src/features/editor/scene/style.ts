// Scene element styling. These are Excalidraw palette values (scene data, not UI chrome), so
// they live here rather than in tokens.css.
export const COMPONENT_SIZE = { width: 180, height: 80 } as const;

export const COMPONENT_STYLE = {
  strokeColor: "#1e1e1e",
  fillStyle: "solid",
  strokeWidth: 2,
  roughness: 1,
  roundness: { type: 3 },
} as const;

const CATEGORY_BACKGROUND: Record<string, string> = {
  clients: "#e7f5ff",
  edge: "#f3f0ff",
  compute: "#ebfbee",
  data: "#fff4e6",
  messaging: "#fff9db",
};

export function backgroundFor(categoryId: string): string {
  return CATEGORY_BACKGROUND[categoryId] ?? "#f8f9fa";
}
