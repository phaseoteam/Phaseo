import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  resolve: { alias: [
    { find: "@/runtime/env", replacement: local("./runtime.ts") },
    { find: "@core", replacement: local("../../src/core") },
    { find: "@observability", replacement: local("../../src/observability") },
    { find: "@protocols", replacement: local("../../src/protocols") },
    { find: "@executors", replacement: local("../../src/executors") },
    { find: "@pipeline", replacement: local("../../src/pipeline") },
    { find: "@providers", replacement: local("../../src/providers") },
    { find: "@", replacement: local("../../src") },
  ] },
  test: {
    environment: "node", pool: "threads", maxWorkers: 1,
    disableConsoleIntercept: true,
    include: [
      "scripts/routing-simulator/*.test.ts",
      "src/pipeline/execute/routing.test.ts",
      "src/pipeline/execute/health.test.ts",
      "src/pipeline/execute/sticky-routing.optimistic.test.ts",
      "src/executors/_shared/timing/upstream.test.ts",
      "src/pipeline/execute/index.testing-mode.test.ts",
      "src/pipeline/after/stream.openai-usage.test.ts",
      "src/pipeline/after/stream-cancellation.test.ts",
    ],
    setupFiles: [local("./offline.ts")],
    testTimeout: 1_800_000,
  },
});
