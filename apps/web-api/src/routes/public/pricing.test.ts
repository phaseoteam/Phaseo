import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const targetRoute = {
	provider_model_id: "00000000-0000-4000-8000-999999999999",
	provider_slug: "openai",
	provider_model_slug: "gpt-5.6-sol",
	model_slug: "openai/gpt-5.6-sol",
	routing_enabled: true,
	status: "active",
	effective_from: null,
	effective_to: null,
};

const targetModel = {
	model_slug: "openai/gpt-5.6-sol",
	name: "GPT 5.6 Sol",
	released_at: "2026-07-09T00:00:00Z",
	announced_at: null,
};

const targetSku = {
	sku_id: "sku-sol",
	provider_model_id: targetRoute.provider_model_id,
	operation: "text.generate",
	service_tier_slug: "standard",
	currency: "USD",
	status: "active",
	effective_from: null,
	effective_to: null,
	metadata: {},
};

const targetMeter = {
	sku_id: targetSku.sku_id,
	meter_key: "input_text_tokens",
	unit: "token",
	unit_quantity: 1_000_000,
	price_nanos: 5_000_000_000,
	metadata: {},
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("public pricing routes", () => {
	it("chunks large provider-model filters before querying PostgREST", async () => {
		const routes = Array.from({ length: 205 }, (_, index) => ({
			provider_model_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
			provider_slug: "openai",
			provider_model_slug: "gpt-test",
			model_slug: "openai/gpt-test",
			routing_enabled: true,
			status: "active",
			effective_from: null,
			effective_to: null,
		}));
		let skuQueryCount = 0;

		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify(routes), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test", name: "GPT Test", released_at: null, announced_at: null,
			}]), { status: 200 });
			if (url.includes("v2_pricing_skus")) {
				skuQueryCount += 1;
				return new Response(JSON.stringify([{
					sku_id: "sku-1", provider_model_id: routes[0]?.provider_model_id, operation: "text.generate",
					service_tier_slug: "standard", currency: "USD", status: "active", effective_from: null,
					effective_to: null, metadata: {},
				}]), { status: 200 });
			}
			if (url.includes("v2_pricing_sku_meters")) return new Response(JSON.stringify([{
				sku_id: "sku-1", meter_key: "input_text_tokens", unit: "token", unit_quantity: 1_000_000,
				price_nanos: 5_000_000_000, metadata: {},
			}]), { status: 200 });
			return new Response("[]", { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/_web/pricing/models", {}, env);
		const payload = await response.json() as { models: unknown[] };

		expect(response.status).toBe(200);
		expect(skuQueryCount).toBe(3);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900");
		expect(response.headers.get("cache-control")).toBe("public, max-age=0");
		expect(payload.models).toHaveLength(1);
	});

	it("paginates V2 provider routes so records beyond the first 1,000 are included", async () => {
		let providerPage = 0;
		const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
			...targetRoute,
			provider_model_id: `00000000-0000-4000-8001-${String(index).padStart(12, "0")}`,
			provider_model_slug: `model-${index}`,
			model_slug: `organisation/model-${index}`,
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) {
				providerPage += 1;
				return new Response(JSON.stringify(providerPage === 1 ? firstPage : [targetRoute]), { status: 200 });
			}
			if (url.includes("v2_models")) return new Response(JSON.stringify([targetModel]), { status: 200 });
			if (url.includes("v2_pricing_skus")) return new Response(JSON.stringify([targetSku]), { status: 200 });
			if (url.includes("v2_pricing_sku_meters")) return new Response(JSON.stringify([targetMeter]), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/pricing/models", {}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			models: [{
				model: "openai/gpt-5.6-sol",
				display_name: "GPT 5.6 Sol",
				provider: "openai",
				endpoint: "text.generate",
				meters: [{ meter: "input_text_tokens", price_per_unit: "5" }],
			}],
		});
		const providerRequests = fetchMock.mock.calls.filter(([input]) =>
			String(input).includes("v2_model_provider_routes")
		);
		expect(providerRequests).toHaveLength(2);
	});

	it("filters V2 provider routes when model IDs are supplied", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) return new Response("[]", { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/pricing/models?model_ids=openai%2Fgpt-5.6-sol",
			{},
			env,
		);

		expect(response.status).toBe(200);
		const providerUrl = String(fetchMock.mock.calls.find(([input]) =>
			String(input).includes("v2_model_provider_routes")
		)?.[0]);
		expect(decodeURIComponent(providerUrl)).toContain("model_slug=in.(openai/gpt-5.6-sol)");
	});

	it("rejects cache-busting parameters before accessing the database", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/pricing/models?cb=random",
			{},
			env,
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "unsupported_query_parameter" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fails closed instead of caching a truncated provider-route catalogue", async () => {
		const fullPage = Array.from({ length: 1_000 }, (_, index) => ({
			provider_model_id: `provider:model-${index}`,
			provider_slug: "provider",
			provider_model_slug: `model-${index}`,
			model_slug: `organisation/model-${index}`,
			routing_enabled: true,
			status: "active",
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) {
				const providerCalls = fetchMock.mock.calls.filter(([input]) =>
					String(input).includes("v2_model_provider_routes")
				).length;
				return new Response(JSON.stringify(
					providerCalls === 5 ? [...fullPage, { ...fullPage[0], provider_model_id: "provider:overflow" }] : fullPage,
				), { status: 200 });
			}
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/pricing/models", {}, env);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({ error: "pricing_models_unavailable" });
		const providerRequests = fetchMock.mock.calls.filter(([input]) =>
			String(input).includes("v2_model_provider_routes")
		);
		expect(providerRequests).toHaveLength(5);
	});
});
