import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes de integração (I0.5; ADR-0001 §4): contra o Supabase de
// desenvolvimento ou o efêmero do CI. Falham, nunca pulam, sem banco.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/preparacao-global.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
