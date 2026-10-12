import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Native-process fixtures share the hosted runner's CPU and startup budget.
		maxWorkers: 2,
	},
});
