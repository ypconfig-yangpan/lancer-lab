import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@plugins": path.resolve(__dirname, "./src/plugins"),
      "@devops-desktop/ui": path.resolve(__dirname, "./src/ui/index.ts"),
      "@lancer/ui": path.resolve(__dirname, "./src/ui/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/shared/testing/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
