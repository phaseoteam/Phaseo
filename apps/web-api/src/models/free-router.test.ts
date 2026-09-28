import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFreeRouterOverview } from "@/models/free-router";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchFreeRouterOverview", () => {
	it("loads usage as a database aggregate instead of fetching request rows", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rest/v1/v2_models?")) {
				return new Response(JSON.stringify([{
					model_slug: "example/model:free",
					name: "Example Model (Free)",
					lab_slug: "example",
					input_modalities: ["text"],
					output_modalities: ["text"],
					lab: { name: "Example" },
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/v2_model_provider_routes?")) {
				return new Response(JSON.stringify([{
					provider_slug: "provider",
					provider_model_slug: "provider/example-model",
					model_slug: "example/model:free",
					input_modalities: ["text"],
					output_modalities: ["text"],
					routing_enabled: true,
					status: "active",
					effective_from: null,
					effective_to: null,
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/rpc/get_free_router_usage_summary")) {
				return new Response(JSON.stringify([{
					model_slug: "example/model:free",
					requests_30d: 42,
					total_cost_nanos: "0",
					last_routed_at: "2026-09-27T12:00:00Z",
				}]), { status: 200 });
			}
			throw new Error(`Unexpected Supabase request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const overview = await fetchFreeRouterOverview(env);

		expect(overview.summary).toMatchObject({
			eligibleModels: 1,
			eligibleProviders: 1,
			routedRequests30d: 42,
			totalCostNanos30d: 0,
		});
		expect(overview.models[0]?.usage).toEqual({
			requests30d: 42,
			totalCostNanos30d: 0,
			lastRoutedAt: "2026-09-27T12:00:00Z",
		});

		const rpcCall = fetchMock.mock.calls.find(([input]) => String(input).includes("get_free_router_usage_summary"));
		expect(rpcCall).toBeDefined();
		const rpcBody = JSON.parse(String(rpcCall?.[1]?.body));
		expect(rpcBody).toMatchObject({ p_model_slugs: ["example/model:free"] });
		expect(typeof rpcBody.p_since).toBe("string");
		expect(fetchMock.mock.calls.some(([input]) => /v2_request_(facts|pricing_lines)/.test(String(input)))).toBe(false);
	});
});
