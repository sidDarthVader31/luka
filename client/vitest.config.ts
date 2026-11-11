import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup-canvas.ts"],
    server: { deps: { inline: ["@excalidraw/excalidraw"] } },
  },
});
