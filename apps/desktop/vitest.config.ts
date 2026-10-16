import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Native-process fixtures share the hosted runner's CPU and startup budget.
		maxWorkers: 2,
		// Real SQLite, git and child-process tests run 5-10s on hosted Windows runners.
		testTimeout: 20_000,
	},
});
