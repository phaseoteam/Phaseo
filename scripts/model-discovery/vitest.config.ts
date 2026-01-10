import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.ts", "**/*.test.tsx"],
		exclude: ["node_modules", ".turbo", "dist", "build"],
		environment: "node",
		globals: true,
		clearMocks: true,
		mockReset: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			include: ["**/*.ts"],
			exclude: [
				"node_modules/",
				".turbo/",
				"dist/",
				"build/",
				"**/*.test.ts",
				"**/*.d.ts",
			],
		},
	},
});
