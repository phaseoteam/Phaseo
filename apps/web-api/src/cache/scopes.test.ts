import { describe, expect, it } from "vitest";
import { listCacheScopes, resolveCacheScope } from "@/cache/scopes";

describe("cache scopes", () => {
	it("exposes named scopes without duplicate static tags", () => {
		for (const scope of listCacheScopes()) {
			expect(scope.tags.length).toBe(new Set(scope.tags).size);
			expect(scope.tags.length).toBeLessThanOrEqual(100);
		}
	});

	it("requires targets for singular scopes", () => {
		expect(() => resolveCacheScope("model", "")).toThrow("Model ID is required");
		expect(() => resolveCacheScope("provider", null)).toThrow("Provider ID is required");
	});

	it("constructs tags using the same encoding as public routes", () => {
		const result = resolveCacheScope("model", "openai/gpt-5");
		expect(result.tags).toContain("web-api-model-openai2Fgpt-5");
		expect(result.tags).toContain("web-api-search");
	});

	it("keeps the incident scope within Cloudflare's per-request operation limit", () => {
		const result = resolveCacheScope("all-public");
		expect(result.definition.danger).toBe("high");
		expect(result.tags.length).toBeLessThanOrEqual(100);
	});
});
