import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The simulator imports gateway internals through the same aliases as apps/api/vitest.config.ts.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = path.join(apiRoot, "src");

export default defineConfig({
	root: apiRoot,
	resolve: {
		alias: {
			"@": src,
			"@core": path.join(src, "core"),
			"@pipeline": path.join(src, "pipeline"),
			"@protocols": path.join(src, "protocols"),
			"@executors": path.join(src, "executors"),
			"@providers": path.join(src, "providers"),
			"@observability": path.join(src, "observability"),
		},
	},
	test: {
		environment: "node",
		testTimeout: 30 * 60_000,
		hookTimeout: 60_000,
		maxConcurrency: 1,
		fileParallelism: false,
		pool: "forks",
		include: ["tools/provider-simulator/**/*.sim.ts", "tools/provider-simulator/**/*.test.ts"],
	},
});
