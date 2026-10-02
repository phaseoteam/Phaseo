const nextJest = require("next/jest");

const createJestConfig = nextJest({
	dir: "./",
});

const customJestConfig = {
	testEnvironment: "node",
	testTimeout: 60000,
	moduleNameMapper: {
		"^@/app/\\(auth\\)/(.*)$": "<rootDir>/src/app/[locale]/(auth)/$1",
		"^@/app/\\(dashboard\\)/(.*)$": "<rootDir>/src/app/[locale]/(dashboard)/$1",
		"^@/app/\\(legal\\)/(.*)$": "<rootDir>/src/app/[locale]/(legal)/$1",
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	testPathIgnorePatterns: ["/node_modules/", "/.next/", "/tests/e2e/"],
	collectCoverageFrom: [
		"src/**/*.{ts,tsx}",
		"!src/**/index.ts",
		"!src/**/*.d.ts",
	],
};

module.exports = createJestConfig(customJestConfig);
