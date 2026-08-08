import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("credit model availability route", () => {
	it("returns creator logos with an edge-cached country preview", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			let rows: unknown[] = [];
			if (url.includes("v2_model_provider_routes")) {
				rows = [{
					provider_model_id: "openai:gpt-test",
					provider_slug: "openai",
					model_slug: "openai/gpt-test",
					metadata: {},
					effective_from: null,
					effective_to: null,
				}];
			} else if (url.includes("v2_providers")) {
				rows = [{
					provider_slug: "openai",
					metadata: {
						availability: {
							mode: "allowlist",
							countries: ["US"],
						},
					},
				}];
			} else if (url.includes("v2_models")) {
				rows = [{
					model_slug: "openai/gpt-test",
					name: "GPT Test",
					lab_slug: "openai",
					lab: { name: "OpenAI" },
				}];
			}
			return new Response(JSON.stringify(rows), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/credits/model-availability?country=CN",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=900, s-maxage=900, stale-while-revalidate=900",
		);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=900",
		);
		expect(response.headers.get("cache-tag")).toBe("web-api-credit-model-availability");
		await expect(response.json()).resolves.toEqual({
			countryCode: "CN",
			restrictedModels: [{ id: "openai/gpt-test", name: "GPT Test", logoId: "openai", organisationName: "OpenAI" }],
			regionRestrictedModels: [],
		});
	});

	it("does not cache invalid country responses", async () => {
		const response = await app.request(
			"https://phaseo.app/api/_web/credits/model-availability?country=XX",
			{},
			env,
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
