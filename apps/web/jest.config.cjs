const nextJest = require("next/jest");

const createJestConfig = nextJest({
	dir: "./",
});

const customJestConfig = {
	testEnvironment: "node",
	testTimeout: 60000,
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	testPathIgnorePatterns: ["/node_modules/", "/.next/"],
	collectCoverageFrom: [
		"src/**/*.{ts,tsx}",
		"!src/**/index.ts",
		"!src/**/*.d.ts",
	],
};

module.exports = createJestConfig(customJestConfig);
