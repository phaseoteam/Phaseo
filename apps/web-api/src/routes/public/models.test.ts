import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CATALOGUE_CACHE_SCHEMA_VERSION, fetchGatewayMonitorRows, internalProviderFilters, isMissingTierHealthRpcError, publicProviderId } from "@/routes/public/models";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("provider health RPC fallback", () => {
	it("falls back only when PostgREST reports the tiered RPC itself as missing", () => {
		expect(isMissingTierHealthRpcError({
			code: "PGRST202",
			message: "Could not find the function public.get_v2_model_provider_tier_health_metrics",
		})).toBe(true);
		expect(isMissingTierHealthRpcError({
			code: "42703",
			message: "column v2_request_facts.service_tier_slug does not exist",
		})).toBe(false);
		expect(isMissingTierHealthRpcError({
			code: "PGRST202",
			message: "Could not find the function public.some_other_function",
		})).toBe(false);
	});
});

describe("public model canonical resolution", () => {
	it("resolves an encoded model-page alias through the canonical RPC", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_resolution")) {
				return new Response(JSON.stringify({
					requestedModelId: "openai/gpt-astra-latest",
					canonicalModelId: "openai/gpt-6-astra",
					internalModelId: "openai/gpt-6-astra",
					source: "alias",
				}));
			}
			return new Response(JSON.stringify([]));
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-astra-latest/canonical",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			resolution: {
				requestedModelId: "openai/gpt-astra-latest",
				canonicalModelId: "openai/gpt-6-astra",
				internalModelId: "openai/gpt-6-astra",
				source: "alias",
			},
		});
	});
});

describe("stealth provider filters", () => {
	it("invalidates catalogue cache entries created before stealth redaction", () => {
		expect(CATALOGUE_CACHE_SCHEMA_VERSION).toBe("4");
	});

	it("maps internal identities to exactly stealth", () => {
		expect(publicProviderId("private-provider", new Set(["private-provider"]))).toBe("stealth");
		expect(publicProviderId("public-provider", new Set(["private-provider"]))).toBe("public-provider");
	});

	it("expands the public stealth filter internally and rejects guessed private filters", () => {
		const privateProviders = new Set(["private-a", "private-b"]);
		expect(internalProviderFilters(["stealth"], privateProviders)).toEqual(["private-a", "private-b"]);
		expect(internalProviderFilters(["private-a"], privateProviders)).toEqual([]);
		expect(internalProviderFilters(["public", "stealth"], privateProviders)).toEqual([
			"private-a",
			"private-b",
			"public",
		]);
	});

	it("redacts service-role monitor rows before building the public catalogue", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) return new Response(JSON.stringify([{
				model_id: "stealth/preview",
				model_name: "Preview",
				provider_api_model_id: "stealth:preview",
				provider_id: "private-provider",
				api_provider_name: "Private Provider",
				api_model_id: "stealth/preview",
				provider_model_slug: "secret-upstream-model",
				capability_id: "text.generate",
				capability_status: "active",
				is_active_gateway: true,
			}]));
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{
				provider_model_id: "stealth:preview",
			}]));
			return new Response(JSON.stringify([]));
		}));

		const rows = await fetchGatewayMonitorRows(env);
		const serialized = JSON.stringify([...rows.values()]);
		expect(serialized).toContain('"id":"stealth"');
		expect(serialized).toContain('"name":"Stealth"');
		expect(serialized).not.toContain("private-provider");
		expect(serialized).not.toContain("secret-upstream-model");
		expect(serialized).not.toContain("Private Provider");
	});
});

describe("public model routes", () => {
	it("keeps expired rules and time windows in pricing history", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-30T12:00:00Z"));
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{
				provider_model_id: "pm-1", provider_slug: "deepseek", model_slug: "deepseek/deepseek-v4-flash-0731",
				provider_model_slug: "deepseek-v4-flash", status: "active", routing_enabled: true,
			}]), { status: 200 });
			if (url.includes("v2_route_capabilities")) return new Response("[]", { status: 200 });
			if (url.includes("v2_providers")) return new Response(JSON.stringify([{
				provider_slug: "deepseek", name: "DeepSeek", status: "active", routing_enabled: true, metadata: {},
			}]), { status: 200 });
			if (url.includes("v2_pricing_skus")) return new Response(JSON.stringify([
				{ sku_id: "old", provider_model_id: "pm-1", service_tier_slug: "standard", operation: "text.generate", status: "active", currency: "USD", effective_from: "2026-07-01T00:00:00Z", effective_to: "2026-08-01T00:00:00Z", metadata: {} },
				{ sku_id: "new", provider_model_id: "pm-1", service_tier_slug: "standard", operation: "text.generate", status: "active", currency: "USD", effective_from: "2026-08-01T00:00:00Z", effective_to: null, metadata: { time_windows: [{ label: "peak", timezone: "UTC", start_time: "01:00", end_time: "04:00", price_per_unit: 0.44 }] } },
			]), { status: 200 });
			if (url.includes("v2_pricing_sku_meters")) return new Response(JSON.stringify([
				{ sku_meter_id: "old-input", sku_id: "old", meter_key: "input_text_tokens", unit: "token", unit_quantity: 1_000_000, price_nanos: 140_000_000, meter_order: 100, metadata: {} },
				{ sku_meter_id: "new-input", sku_id: "new", meter_key: "input_text_tokens", unit: "token", unit_quantity: 1_000_000, price_nanos: 220_000_000, meter_order: 100, metadata: {} },
			]), { status: 200 });
			return new Response("[]", { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/deepseek%2Fdeepseek-v4-flash-0731/pricing-history?days=3650",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			rules: [
				expect.objectContaining({ ruleId: "new-input", timeWindows: [expect.objectContaining({ label: "peak" })] }),
				expect.objectContaining({ ruleId: "old-input", effectiveTo: "2026-08-01T00:00:00Z", timeWindows: [] }),
			],
		});
	});

	it("includes the database-composed free router in page projection 5", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", gateway_status: "active",
				gateway_input_modalities: ["text"], gateway_output_modalities: ["text"], gateway_features: [], gateway_tiers: [],
			}]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", input_modalities: ["text", "image"], output_modalities: ["text"], lab: { name: "OpenAI" } }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([
				{ provider_slug: "provider-a", provider_model_slug: "gpt-test-a", model_slug: "openai/gpt-test", input_modalities: ["text"], output_modalities: ["text"], routing_enabled: true, status: "active", effective_from: null, effective_to: null },
				{ provider_slug: "provider-b", provider_model_slug: "gpt-test-b", model_slug: "openai/gpt-test", input_modalities: ["image"], output_modalities: ["text"], routing_enabled: true, status: "active", effective_from: null, effective_to: null },
			]), { status: 200 });
			if (url.includes("v2_request_facts")) return new Response(JSON.stringify([{
				request_event_id: "event-1", routed_model_slug: "openai/gpt-test", occurred_at: "2026-07-26T00:00:00Z",
			}]), { status: 200 });
			if (url.includes("v2_request_pricing_lines")) return new Response(JSON.stringify([{
				request_event_id: "event-1", charged_nanos: 125,
			}]), { status: 200 });
			return new Response("[]", { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/_web/models?catalogue_version=v2&shape=page&projection=5&limit=2000", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-free-router-overview");
		await expect(response.json()).resolves.toMatchObject({
			projection: 5,
			total: 2,
			models: [
				{ model_id: "phaseo/free", gateway_provider_count: 2, gateway_input_modalities: ["image", "text"], router_requests_30d: 1, router_spend_nanos_30d: 125 },
				{ model_id: "openai/gpt-test" },
			],
			facets: { statusCounts: { active: 2 }, tierOptions: [{ value: "free", count: 1 }] },
		});
	});

	it("uses the complete V2 public catalogue projection by default", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) return new Response(JSON.stringify([
				{
					model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation_name: "OpenAI",
					primary_date: "2026-01-02", gateway_status: "active",
					gateway_provider_count: 1, gateway_active_provider_count: 1, gateway_endpoints: ["responses"],
					gateway_input_modalities: ["text"], gateway_output_modalities: ["text"], gateway_features: ["tools"],
					gateway_tiers: ["standard"], gateway_execution_regions: ["us"], gateway_provider_names: ["OpenAI"],
				},
				{
					model_id: "openai/gpt-coming-soon", name: "GPT Coming Soon", organisation_id: "openai",
					organisation_name: "OpenAI", gateway_status: "coming_soon",
				},
				{
					model_id: "openai/gpt-inactive", name: "GPT Inactive", organisation_id: "openai",
					organisation_name: "OpenAI", gateway_status: "not_active",
				},
			]), { status: 200 });
			if (url.includes("get_public_model_catalogue_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "Gateway name", organisation_id: "openai", organisation_name: "OpenAI",
				gateway_status: "active", gateway_provider_count: 1, gateway_active_provider_count: 1,
				gateway_endpoints: ["responses"], gateway_input_modalities: ["text"], gateway_output_modalities: ["text"],
				gateway_features: ["tools"], gateway_provider_names: ["OpenAI"], gateway_active_provider_names: ["OpenAI"],
				gateway_provider_details: [{ id: "openai", name: "OpenAI", status: "active", is_active: true }],
				gateway_api_model_ids: ["openai/gpt-test"], context_lengths: [128000], supported_parameters: ["temperature"],
			}]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", description: "Compact model",
				release_date: "2026-01-02", input_types: ["text"], output_types: ["text"], organisation: { name: "OpenAI", colour: "#fff" },
			}]), { status: 200 });
			if (url.includes("get_v2_provider_region_map")) return new Response(JSON.stringify([{ provider_slug: "openai", regions: ["US"] }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/models?shape=page&limit=2000", {}, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			shape: "page", pricing_complete: true, total: 3,
			models: [
				{ model_id: "openai/gpt-test", name: "GPT Test", gateway_execution_regions: ["us"], gateway_tiers: ["standard"] },
				{ model_id: "openai/gpt-coming-soon", gateway_status: "coming_soon" },
				{ model_id: "openai/gpt-inactive", gateway_status: "not_active" },
			],
			facets: { statusCounts: { active: 1, coming_soon: 1, not_active: 1 } },
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_monitor_model_rows"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_models_page_rows"))).toBe(true);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_v2_public_models_page_rows"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_model_catalogue_rows"))).toBe(false);
	});

	it("uses the route-scoped V2 projection for explicit region and service-tier filters", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_v2_public_models_page_rows")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai",
					organisation_name: "OpenAI", gateway_status: "active",
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/models?shape=page&projection=4&limit=2000&region=ca&service_tier=priority",
			{},
			env,
		);

		expect(response.status).toBe(200);
		const scopedCall = fetchMock.mock.calls.find(([input]) =>
			String(input).includes("get_v2_public_models_page_rows")
		);
		expect(scopedCall).toBeDefined();
		expect(JSON.parse(String(scopedCall?.[1]?.body))).toMatchObject({
			p_region: "ca",
			p_service_tier: "priority",
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_models_page_rows"))).toBe(false);
	});

	it("serves the V2 models page from the compact page projection", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation_name: "OpenAI",
				primary_date: "2026-01-02", gateway_status: "active",
				gateway_provider_count: 1, gateway_active_provider_count: 1, gateway_endpoints: ["responses"],
				gateway_input_modalities: ["text"], gateway_output_modalities: ["text"], gateway_features: ["tools"],
				gateway_tiers: ["standard"], gateway_execution_regions: ["us"], gateway_provider_names: ["OpenAI"],
				lowest_standard_input_price: 0.3, lowest_standard_input_price_unit: "billing unit",
				lowest_standard_output_price: 1.2, lowest_standard_output_price_unit: "billing unit",
				pricing_detail_rows: [
					{ meter_key: "input_text_tokens", price: 0.3, display_unit: "1M tokens", unit_quantity: 1_000_000 },
					{ meter_key: "output_text_tokens", price: 1.2, display_unit: "1M tokens", unit_quantity: 1_000_000 },
				],
			}]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", input_modalities: ["text"], output_modalities: ["text"], lab: { name: "OpenAI" } }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ provider_slug: "openai", provider_model_slug: "gpt-test", model_slug: "openai/gpt-test", input_modalities: ["text"], output_modalities: ["text"], routing_enabled: true, status: "active", effective_from: null, effective_to: null }]), { status: 200 });
			if (url.includes("v2_request_facts")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/models?catalogue_version=v2&shape=page&projection=6&limit=2000",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-models-v2");
		expect(response.headers.get("cache-tag")).toContain("web-api-free-router-overview");
		await expect(response.json()).resolves.toMatchObject({
			catalogue_version: "v2",
			shape: "page",
			projection: 6,
			pricing_complete: true,
			total: 2,
			models: [
				{ model_id: "phaseo/free" },
				{
					model_id: "openai/gpt-test",
					lowest_standard_input_price_unit: "1M tokens",
					lowest_standard_output_price_unit: "1M tokens",
					pricing_detail_rows: [
						{ label: "Input Text Tokens", value: "$0.3 / 1M tokens" },
						{ label: "Output Text Tokens", value: "$1.2 / 1M tokens" },
					],
				},
			],
			facets: { statusCounts: { active: 2 } },
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_monitor_model_rows"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("data_models?"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_models_page_rows"))).toBe(true);
	});

	it("serves compact table rows without loading the nested model catalogue", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) {
				const monitorRow = {
				model_id: "openai/gpt-test", api_model_id: "openai/gpt-test", model_name: "GPT Test",
				organisation_id: "openai", organisation_name: "OpenAI", provider_id: "openai",
				api_provider_name: "OpenAI", capability_id: "responses", capability_status: "active",
				is_active_gateway: true, input_modalities: ["text"], output_modalities: ["text"],
				capability_params: { properties: { temperature: { type: "number" } } },
				input_price: 1, output_price: 2, context_length: 128000,
				provider_max_output_tokens: 4096, weekly_tokens_model: 100,
				weekly_tokens_model_provider: 250, model_release_date: "2026-01-02",
				};
				return new Response(JSON.stringify([
					{ ...monitorRow, provider_api_model_id: "provider-model-a" },
					{ ...monitorRow, provider_api_model_id: "provider-model-b", input_price: 0.5 },
				]), { status: 200 });
			}
			if (url.includes("get_v2_provider_region_map")) return new Response(JSON.stringify([
				{ provider_slug: "openai", regions: ["US"] },
			]), { status: 200 });
			if (url.includes("v2_providers?")) return new Response(JSON.stringify([
				{ provider_slug: "openai", status: "active" },
			]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/models?catalogue_version=v2&shape=table&projection=2&limit=10000",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-models-v2");
		const payload = await response.json() as {
			models: Array<{ id: string; provider: Record<string, unknown> }>;
			[key: string]: unknown;
		};
		expect(payload).toMatchObject({
			catalogue_version: "v2",
			shape: "table",
			projection: 2,
			total: 2,
			models: [{
				id: "openai/gpt-test::openai::provider-model-a::responses",
				modelId: "openai/gpt-test",
				provider: { id: "openai", inputPrice: 1, outputPrice: 2, executionRegions: ["us"] },
				endpoint: "responses",
				popularityTokensWeek: 250,
			}, {
				id: "openai/gpt-test::openai::provider-model-b::responses",
				provider: { inputPrice: 0.5 },
			}],
			facets: {
				endpoints: ["responses"],
				modalities: ["text"],
				features: [],
				statuses: ["active"],
			},
		});
		expect(new Set(payload.models.map((model) => model.id)).size).toBe(2);
		expect(payload.models[0].provider).not.toHaveProperty("standardInputPrice");
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("v2_models?"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("data_models?"))).toBe(false);

		const laterPageResponse = await app.request(
			"https://phaseo.app/api/_web/models?catalogue_version=v2&shape=table&projection=2&limit=10000&offset=20000",
			{},
			env,
		);
		expect(laterPageResponse.status).toBe(200);
		await expect(laterPageResponse.json()).resolves.toMatchObject({
			offset: 20_000,
			models: [],
		});
	});

	it("keeps free provider offers separate in the compact table projection", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) return new Response(JSON.stringify([{
				model_id: "poolside/laguna-s-2.1",
				api_model_id: "poolside/laguna-s-2.1:free",
				model_name: "Laguna S 2.1",
				organisation_id: "poolside",
				organisation_name: "Poolside",
				provider_id: "poolside",
				provider_api_model_id: "poolside:poolside/laguna-s-2.1:free",
				api_provider_name: "Poolside",
				capability_id: "text.generate",
				capability_status: "active",
				is_active_gateway: true,
				is_free_variant: true,
				input_modalities: ["text"],
				output_modalities: ["text"],
			}]), { status: 200 });
			if (url.includes("get_v2_provider_region_map")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("v2_providers?")) return new Response(JSON.stringify([
				{ provider_slug: "poolside", status: "active" },
			]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models?catalogue_version=v2&shape=table&projection=2&limit=10000",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			models: [{
				model: "Laguna S 2.1 (Free)",
				modelId: "poolside/laguna-s-2.1:free",
				tier: "free",
			}],
		});
	});

	it("does not fall back to the V1 catalogue when the complete V2 page RPC is unavailable", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) {
				return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.get_public_models_page_rows" }), { status: 404 });
			}
			if (url.includes("get_public_model_catalogue_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", gateway_status: "inactive",
				gateway_provider_details: [], gateway_api_model_ids: ["openai/gpt-test"], gateway_features: [],
			}]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", input_types: ["text"], output_types: ["text"],
			}]), { status: 200 });
			if (url.includes("get_v2_provider_region_map")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/models?shape=page&projection=fallback-test", {}, env);
		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({ error: "models_unavailable" });
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_model_catalogue_rows"))).toBe(false);
	});

	it("supports the parallel V2 catalogue and rejects unknown versions", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(
				JSON.stringify([
					{
						model_slug: "openai/gpt-test",
						name: "GPT Test",
						lab_slug: "openai",
					},
				]),
				{ status: 200, headers: { "content-range": "0-0/1" } },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const [v2, invalid] = await Promise.all([
			app.request("https://phaseo.app/api/_web/models?catalogue_version=v2", {}, env),
			app.request("https://phaseo.app/api/_web/models?catalogue_version=v3", {}, env),
		]);

		expect(v2.status).toBe(200);
		expect(await v2.json()).toMatchObject({
			catalogue_version: "v2",
			total: 1,
		});
		expect(v2.headers.get("cache-tag")).toBe("web-api-models,web-api-models-v2");
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("v2_models"))).toBe(true);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("status=neq.disabled"))).toBe(true);
		expect(invalid.status).toBe(400);
	});

	it("preserves provider execution regions in gateway monitor rows", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) {
				return new Response(
					JSON.stringify([
						{
							model_id: "openai/gpt-test",
							api_model_id: "gpt-test",
							provider_id: "openai",
							capability_id: "chat/completions",
							capability_status: "active",
							is_active_gateway: true,
						},
					]),
					{ status: 200 },
				);
			}
			if (url.includes("get_v2_provider_region_map")) {
				return new Response(
					JSON.stringify([
						{ provider_slug: "openai", regions: ["US", "eu"] },
					]),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test" }]),
				{ status: 200, headers: { "content-range": "0-0/1" } },
			);
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models?region-check=1",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			models: [
				{
					gateway_monitor_rows: [
						{ provider: { executionRegions: ["us", "eu"] } },
					],
				},
			],
		});
	});

	it("excludes external providers from models-page monitor rows", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows")) {
				return new Response(JSON.stringify([
					{
						model_id: "google/gemini-3.5-flash",
						api_model_id: "google/gemini-3.5-flash",
						provider_id: " OpenRouter ",
						capability_id: "text.generate",
						capability_status: "active",
						is_active_gateway: false,
					},
				]), { status: 200 });
			}
			if (url.includes("v2_providers")) {
				return new Response(JSON.stringify([
					{ provider_slug: "openrouter", status: "external" },
				]), { status: 200 });
			}
			if (url.includes("get_v2_provider_region_map")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(JSON.stringify([
				{ model_slug: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash" },
			]), { status: 200, headers: { "content-range": "0-0/1" } });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models?catalogue_version=v2&external-status-check=1",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			models: [
				{
					model_id: "google/gemini-3.5-flash",
					gateway_monitor_rows: [],
				},
			],
		});
	});

	it("applies a distinct cache profile to the catalogue, benchmarks, and performance", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_benchmarks")) {
				return new Response(JSON.stringify([{ result_id: "result-1", benchmark_id: "mmlu", score: "0.85", score_numeric: 0.85, is_self_reported: false, other_info: null, source_link: "https://example.com", result_rank: 2, benchmark_name: "MMLU", total_models: 50, ascending_order: true, benchmark_type: "percentage" }]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({ last_24h: { total_requests: 42 }, hourly_24h: [], provider_uptime_24h: [], provider_daily_7d: [] }), { status: 200 });
			}
			if (url.includes("benchmark_results")) {
				return new Response(JSON.stringify([{ model_id: "openai/gpt-test", benchmark_results: [{ id: "result-1", benchmark_id: "mmlu", score: "0.85", is_self_reported: false, other_info: null, source_link: "https://example.com", rank: 2, benchmark: { id: "mmlu", name: "MMLU", total_models: 50, ascending_order: true, type: "percentage" } }] }]), { status: 200 });
			}
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test" }]), {
				status: 200,
				headers: { "content-range": "0-0/1" },
			});
		}));

		const [catalogue, benchmarks, performance] = await Promise.all([
			app.request("https://phaseo.app/api/_web/models", {}, env),
			app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/benchmarks", {}, env),
			app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/performance", {}, env),
		]);

		expect(catalogue.status).toBe(200);
		expect(catalogue.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300, stale-while-revalidate=300");
		expect(benchmarks.status).toBe(200);
		expect(benchmarks.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
		await expect(benchmarks.json()).resolves.toMatchObject({ highlights: [{ benchmarkId: "mmlu", score: 85, scoreDisplay: "85%", rank: 2 }] });
		expect(performance.status).toBe(200);
		expect(performance.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
	});

	it("keeps the model page healthy when the optional performance rollup fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 503 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test/performance",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ modelId: "openai/gpt-test", metrics: null, performance: null });
	});

	it("suppresses performance and uptime series for a single-request cohort", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_quality_hourly_v1")) {
				return new Response(JSON.stringify([{
					bucket: "2026-08-27T09:00:00Z",
					requests: 1,
					tool_call_responses: 1,
					tool_call_errors: 1,
					tool_invalid_json_errors: 1,
					tool_schema_mismatch_errors: 0,
					tool_unknown_name_errors: 0,
					structured_output_responses: 1,
					structured_output_errors: 0,
					structured_invalid_json_errors: 0,
					structured_schema_mismatch_errors: 0,
					structured_missing_output_errors: 0,
					cache_read_pct: 60,
				}, {
					bucket: "2026-08-27T10:00:00Z",
					requests: 2,
					tool_call_responses: 0,
					tool_call_errors: 0,
					structured_output_responses: 0,
					structured_output_errors: 0,
					cache_read_pct: null,
				}]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_health_metrics")) {
				return new Response(JSON.stringify([{
					provider_id: "test-provider",
					provider_name: "Test Provider",
					health_requests: 1,
					uptime_pct: 100,
					percentile_latency_ms: 240,
					percentile_throughput: 18.5,
					buckets: [{
						start: "2026-08-27T09:00:00Z",
						end: "2026-08-27T10:00:00Z",
						requests: 1,
						success_pct: 100,
					}],
				}]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_hourly_performance_v2")) {
				return new Response(JSON.stringify([{
					bucket: "2026-08-27T09:00:00Z",
					provider_id: "test-provider",
					provider_name: "Test Provider",
					requests: 1,
					gateway_ttft_ms: 240,
					gateway_e2e_ms: 680,
					effective_throughput_tps: 18.5,
					tool_call_requests: 1,
					tool_call_errors: 1,
					structured_output_requests: 1,
					structured_output_errors: 0,
					cache_telemetry_requests: 20,
					cache_hit_requests: 12,
				}]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({
					last_24h: {
						total_requests: 1,
						successful_requests: 1,
						uptime_pct: 100,
						avg_latency_ms: 240,
						avg_throughput: 18.5,
					},
					hourly_24h: [{
						bucket: "2026-08-27T09:00:00Z",
						requests: 1,
						success_pct: 100,
						avg_latency_ms: 240,
						avg_throughput: 18.5,
					}],
					provider_uptime_24h: [],
					provider_daily_7d: [],
				}), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/test%2Flow-volume/performance",
			{},
			env,
		);
		const payload = await response.json() as any;

		expect(response.status).toBe(200);
		expect(payload.minimumSampleSize).toBe(20);
		expect(payload.metrics.summary).toMatchObject({ totalRequests: 0, successfulRequests: 0 });
		expect(payload.metrics.hourly).toEqual([]);
		expect(payload.metrics.successSeries).toEqual([]);
		expect(payload.metrics.providerHourly7d).toEqual([]);
		expect(payload.metrics.qualitySeries).toEqual([]);
		expect(payload.metrics.providerPerformance).toEqual([]);
	});

	it("never exposes a synthetic unknown provider in performance data", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/v2_providers?")) {
				return new Response(JSON.stringify([
					{ provider_slug: "poolside", metadata: { colour: "#12AB78" } },
				]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_hourly_performance_v2")) {
				return new Response(JSON.stringify([
					{ bucket: "2026-07-23T12:00:00Z", provider_id: "poolside", provider_name: "Poolside", requests: 20 },
					{ bucket: "2026-07-23T12:00:00Z", provider_id: "unknown", provider_name: "unknown", requests: 1 },
				]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_cached_input_metrics")) {
				return new Response(JSON.stringify({
					hourly_24h: [],
					provider_daily_7d: [
						{ day: "2026-07-23", provider: "poolside", cached_input_pct: 62.5, cached_input_tokens: 625, effective_input_tokens: 1000, telemetry_requests: 20 },
					],
				}), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({
					last_24h: { total_requests: 21, successful_requests: 20 },
					hourly_24h: [],
					provider_uptime_24h: [
						{ provider: "poolside", provider_name: "Poolside", requests: 20 },
						{ provider: "unknown", provider_name: "unknown", requests: 1 },
					],
					provider_daily_7d: [
						{ day: "2026-07-23", provider: "poolside", provider_name: "Poolside", requests: 20 },
						{ day: "2026-07-23", provider: "unknown", provider_name: "unknown", requests: 1 },
					],
				}), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_health_metrics")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_percentile_series_v2")) {
				return new Response(JSON.stringify([50, 75, 90, 95, 99].map((percentile) => ({
					usage_day: "2026-07-23",
					provider_id: "poolside",
					provider_name: "Poolside",
					requests: 20,
					percentile,
					gateway_ttft_ms: percentile === 95 ? 900 : 230,
					provider_duration_ms: percentile === 95 ? 1200 : 500,
					effective_throughput_tps: percentile === 95 ? 13.4 : 8.5,
					output_speed_tps: percentile === 95 ? 15.2 : 9.1,
					phaseo_overhead_ms: percentile === 95 ? 45 : 20,
					tpot_ms: percentile === 95 ? 65 : 110,
					itl_ms: percentile === 95 ? 65 : 110,
					cached_input_pct: percentile === 95 ? 88.5 : 62.5,
				}))), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/poolside%2Flaguna-s-2.1/performance",
			{},
			env,
		);
		const payload = await response.json() as any;

		expect(response.status).toBe(200);
		expect(payload.performance.provider_uptime_24h).toEqual([
			expect.objectContaining({ provider: "poolside" }),
		]);
		expect(payload.performance.provider_daily_7d).toEqual([
			expect.objectContaining({ provider: "poolside" }),
		]);
		expect(payload.metrics.providerPerformance).toEqual([
			expect.objectContaining({ provider: "poolside", providerColor: "#12AB78" }),
		]);
		expect(payload.metrics.providerDaily7d).toEqual([
			expect.objectContaining({
			provider: "poolside",
			providerColor: "#12AB78",
			cachedInputPct: 62.5,
			cachedInputTokens: 625,
			effectiveInputTokens: 1000,
			cacheTelemetryRequests: 20,
			requests: 20,
		}),
		]);
		expect(payload.metrics.providerHourly7d).toEqual([
			expect.objectContaining({ provider: "poolside", requests: 20 }),
		]);
		expect(payload.metrics.providerHourly7d).toEqual([
			expect.objectContaining({ provider: "poolside", requests: 20 }),
		]);
		expect(payload.metrics.providerPercentileDaily7d).toHaveLength(5);
		expect(payload.metrics.providerPercentileDaily7d).toContainEqual(
			expect.objectContaining({
				provider: "poolside",
				providerColor: "#12AB78",
				percentile: 95,
				avgLatencyMs: 900,
				avgGenerationMs: 1200,
				avgThroughput: 13.4,
				cachedInputPct: 88.5,
			}),
		);
		expect(JSON.stringify(payload)).not.toContain('"unknown"');
	});

	it("does not request single-provider percentiles when seven-day traffic has multiple providers", async () => {
		let percentileRpcCalls = 0;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({
					last_24h: { total_requests: 12, successful_requests: 11 },
					hourly_24h: [],
					provider_uptime_24h: [
						{ provider: "poolside", provider_name: "Poolside", requests: 11 },
					],
					provider_daily_7d: [
						{ day: "2026-07-23", provider: "poolside", provider_name: "Poolside", requests: 11 },
						{ day: "2026-07-20", provider: "openai", provider_name: "OpenAI", requests: 4 },
					],
				}), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_health_metrics")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_percentile_series_v2")) {
				percentileRpcCalls += 1;
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/test%2Fmodel/performance",
			{},
			env,
		);
		const payload = await response.json() as any;

		expect(response.status).toBe(200);
		expect(percentileRpcCalls).toBe(0);
		expect(payload.metrics.providerPercentileDaily7d).toEqual([]);
	});

	it("does not replace a filtered cohort with all-traffic provider health", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_performance_metrics")) {
				return new Response(JSON.stringify({
					last_24h: { total_requests: 1, successful_requests: 1 },
					hourly_24h: [],
					provider_uptime_24h: [{ provider: "filtered", requests: 1 }],
					provider_daily_7d: [],
				}), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_health_metrics")) {
				return new Response(JSON.stringify([
					{ provider_id: "all-traffic", health_requests: 100 },
				]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/test%2Fmodel/performance?stream=stream",
			{},
			env,
		);
		const payload = await response.json() as any;

		expect(response.status).toBe(200);
		expect(payload.performance.provider_uptime_24h).toEqual([
			expect.objectContaining({ provider: "filtered" }),
		]);
		expect(payload.performance.provider_uptime_24h).not.toContainEqual(
			expect.objectContaining({ provider: "all-traffic" }),
		);
	});

	it("returns compact gateway availability without loading full metadata", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (!url.includes("get_v2_model_availability")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify({ is_gateway_active: true, active_provider_count: 1 }), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/availability", {}, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			availability: { isGatewayActive: true, activeProviderCount: 1 },
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_v2_model_availability"))).toBe(true);
	});

	it("uses standard-tier availability without dropping alternate pricing plans", async () => {
		const fetchMock = vi.fn(async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if (String(input).includes("/rpc/get_v2_model_pricing")) {
				const body = JSON.parse(String(init?.body));
				const isStandard = body.p_service_tier === "standard";
				return new Response(JSON.stringify([{
					provider: {
						api_provider_id: "openai",
						status: "active",
						routing_status: isStandard ? "active" : "disabled",
					},
					provider_models: [{
						id: "openai:openai/gpt-5.6-sol",
						endpoint: "text.generate",
						is_active_gateway: isStandard,
						routing_status: "active",
						capability_status: "active",
					}],
					pricing_rules: isStandard
						? [{ id: "standard-price", pricing_plan: "standard" }]
						: [
							{ id: "standard-price", pricing_plan: "standard" },
							{ id: "batch-price", pricing_plan: "batch" },
						],
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-5.6-sol/pricing",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			providers: [{
				provider: { routing_status: "active" },
				provider_models: [{ is_active_gateway: true }],
				pricing_rules: [
					{ id: "standard-price", pricing_plan: "standard" },
					{ id: "batch-price", pricing_plan: "batch" },
				],
			}],
		});
		const pricingCalls = fetchMock.mock.calls.filter(([input]) =>
			String(input).includes("/rpc/get_v2_model_pricing")
		);
		expect(pricingCalls.map((call) => JSON.parse(String(call[1]?.body)).p_service_tier))
			.toEqual([null, "standard"]);
	});

	it("returns the overview shape used by the model page", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/v2_models?")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test", name: "GPT Test", description: null, lab_slug: "openai",
				status: "active", catalogue_status: "active", released_at: "2026-07-01T00:00:00Z",
				announced_at: null, input_modalities: ["text"], output_modalities: ["text"], metadata: {}, hidden: false,
			}]), { status: 200 });
			if (url.includes("/v2_labs?")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI", country_code: "US" }]), { status: 200 });
			if (url.includes("get_v2_model_identity")) return new Response(JSON.stringify({ model_slug: "openai/gpt-test", license: "MIT", license_url: null, limits: { context: 128000 } }), { status: 200 });
			if (url.includes("get_v2_model_aliases")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("get_v2_model_variants")) return new Response(JSON.stringify([
				{ model_id: "openai/gpt-test", name: "GPT Test", variant_kind: "standard" },
				{ model_id: "openai/gpt-test:free", name: "GPT Test (Free)", variant_kind: "free" },
			]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-model-details");
		await expect(response.json()).resolves.toMatchObject({
			model: {
				model_id: "openai/gpt-test",
				license: "MIT",
				model_details: [
					{ detail_name: "license", detail_value: "MIT" },
				],
				variants: [
					{ model_id: "openai/gpt-test", name: "GPT Test", variant_kind: "standard" },
					{ model_id: "openai/gpt-test:free", name: "GPT Test (Free)", variant_kind: "free" },
				],
			},
		});
	});

	it("renders the overview when optional enrichments are unavailable", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/v2_models?")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test", name: "GPT Test", description: null, lab_slug: "openai",
				status: "active", catalogue_status: "active", released_at: "2026-07-01T00:00:00Z",
				announced_at: null, input_modalities: ["text"], output_modalities: ["text"], metadata: {}, hidden: false,
			}]), { status: 200 });
			if (url.includes("/v2_labs?")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI", country_code: "US" }]), { status: 200 });
			if (url.includes("get_v2_model_identity")) return new Response(JSON.stringify({ error: "identity temporarily unavailable" }), { status: 503 });
			if (url.includes("get_v2_model_aliases")) return new Response(JSON.stringify({ error: "aliases temporarily unavailable" }), { status: 503 });
			if (url.includes("get_v2_model_variants")) return new Response(JSON.stringify({ error: "variants temporarily unavailable" }), { status: 503 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			model: {
				model_id: "openai/gpt-test",
				name: "GPT Test",
				organisation_id: "openai",
				aliases: [],
				variants: [],
			},
		});
	});

	it("uses a targeted model lookup without calling the wide overview RPC", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/v2_models?")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test",
				name: "GPT Test",
				description: "A test model",
				lab_slug: "openai",
				status: "active",
				catalogue_status: "active",
				released_at: "2026-07-01T00:00:00Z",
				announced_at: null,
				input_modalities: ["text"],
				output_modalities: ["text"],
				metadata: { limits: { context: 128000 } },
				hidden: false,
			}]), { status: 200 });
			if (url.includes("/v2_labs?")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI", country_code: "US" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			model: {
				model_id: "openai/gpt-test",
				name: "GPT Test",
				description: "A test model",
				organisation: { name: "OpenAI" },
				model_details: [{ detail_name: "input_context_length", detail_value: 128000 }],
			},
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_v2_model_overview"))).toBe(false);
	});

	it("returns public model app usage from the rollup RPC", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_v2_model_apps")) return new Response(JSON.stringify([{ app_id: "app-1", title: "Example", image_url: "https://example.com/app.png", url: "https://example.com", last_seen: "2026-07-17T00:00:00Z", requests: "4", success_requests: "3", total_tokens: "100" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/apps", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=3600");
		await expect(response.json()).resolves.toEqual({ apps: [{ appId: "app-1", title: "Example", imageUrl: "https://example.com/app.png", url: "https://example.com", lastSeen: "2026-07-17T00:00:00Z", totalRequests: 4, successfulRequests: 3, totalTokens: 100 }], source: "v2" });
	});

	it("returns parity-shaped timeline and subscription-plan sections", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = decodeURIComponent(String(input));
			if (url.includes("/rpc/get_v2_model_subscription_plans")) {
				return new Response(JSON.stringify([{ plan_uuid: "plan-uuid", plan_id: "pro", name: "Pro", lab_slug: "phaseo", price: 20, currency: "USD", frequency: "month", model_info: { note: "included" }, rate_limit: { rpm: 10 }, model_other_info: null }]), { status: 200 });
			}
			if (url.includes("data_subscription_plan_models")) {
				return new Response(JSON.stringify([{
					plan_uuid: "plan-uuid",
					model_info: { note: "included" },
					rate_limit: { rpm: 10 },
					other_info: null,
				}]), { status: 200 });
			}
			if (url.includes("data_subscription_plans")) {
				return new Response(JSON.stringify([{
					plan_uuid: "plan-uuid",
					plan_id: "pro",
					name: "Pro",
					organisation_id: "phaseo",
					price: 20,
					currency: "USD",
					frequency: "month",
					organisation: { organisation_id: "phaseo", name: "Phaseo" },
				}]), { status: 200 });
			}
			if (url.includes("previous_model_slug=eq.openai/gpt-test")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-next",
					name: "GPT Next",
					released_at: "2026-08-01",
				}]), { status: 200 });
			}
			if (url.includes("model_slug=eq.openai/gpt-old")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-old",
					name: "GPT Old",
					released_at: "2026-01-01",
				}]), { status: 200 });
			}
			if (url.includes("model_slug=eq.openai/gpt-test")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-test",
					name: "GPT Test",
					previous_model_slug: "openai/gpt-old",
					announced_at: "2026-06-01",
					released_at: "2026-07-01",
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([{
				model_id: "openai/gpt-test",
			}]), { status: 200 });
		}));

		const [timeline, subscriptions] = await Promise.all([
			app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/timeline", {}, env),
			app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/subscription-plans", {}, env),
		]);

		expect(timeline.status).toBe(200);
		expect(timeline.headers.get("cache-tag")).toContain("web-api-model-timelines");
		expect(await timeline.json()).toMatchObject({
			events: expect.arrayContaining([
				expect.objectContaining({ eventType: "FutureModel", modelId: "openai/gpt-next" }),
				expect.objectContaining({ eventType: "ModelEvent", eventName: "Released" }),
			]),
		});
		expect(subscriptions.status).toBe(200);
		expect(subscriptions.headers.get("cache-tag")).toContain("web-api-model-subscriptions");
		await expect(subscriptions.json()).resolves.toMatchObject({
			subscription_plans: [{
				plan_id: "pro",
				prices: [{ price: 20, frequency: "month" }],
				model_info: { rate_limit: { rpm: 10 } },
			}],
		});
	});

	it("resolves aliases to a validated public model notice", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_aliases")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-test",
				}]), { status: 200 });
			}
			if (url.includes("v2_model_page_notices")) {
				return new Response(JSON.stringify([{
					api_model_id: "openai/gpt-test",
					tone: "warning",
					markdown: "This model is changing.",
				}]), { status: 200 });
			}
			if (url.includes("v2_models")) {
				return new Response(JSON.stringify([{ model_slug: "openai/gpt-test" }]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/gpt-test-alias/notice",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		expect(response.headers.get("cache-tag")).toContain("web-api-model-notices");
		await expect(response.json()).resolves.toEqual({
			notice: {
				apiModelId: "openai/gpt-test",
				tone: "warning",
				markdown: "This model is changing.",
			},
		});
	});

	it("computes realtime model medians across aliases with a short cache", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("data_api_provider_models")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					api_model_id: "gpt-test",
				}]), { status: 200 });
			}
			if (url.includes("gateway_requests")) {
				return new Response(JSON.stringify([
					{ latency_ms: 100, throughput: 20, generation_ms: null, usage: null },
					{ latency_ms: 300, throughput: null, generation_ms: 2_000, usage: { output_tokens: 80 } },
				]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test/realtime?minutes=15",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=300, stale-while-revalidate=300",
		);
		await expect(response.json()).resolves.toEqual({ stats: {
			requestsInWindow: 2,
			latencyP50Ms: 200,
			throughputP50TokPerSec: 30,
		} });
	});

	it("maps token trajectory RPC output behind its independent cache", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_model_token_trajectory")) {
				return new Response(JSON.stringify([{
					release_date: "2026-01-01",
					deprecation_date: "2026-01-03T00:00:00Z",
					points: [{ date: "2026-01-03", tokens: 25, cumulativeTokens: 100, daysSinceRelease: 2 }],
					token_milestones: [{ threshold: 100, reachedOn: "2026-01-03", daysSinceRelease: 2 }],
					successor_milestones: [],
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([{ model_id: "openai/gpt-test" }]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/openai%2Fgpt-test/token-trajectory",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=21600",
		);
		await expect(response.json()).resolves.toMatchObject({ trajectory: {
			releaseDate: "2026-01-01",
			deprecationDaysSinceRelease: 2,
			tokenMilestones: [{ threshold: 100 }],
		} });
	});

	it("keeps provider routing health on its exact route and volatile cache", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
			{ provider_id: "openai", breaker_state: "open", is_deranked: false, open_until_ms: Date.now() + 60_000 },
			{ provider_id: "openai", breaker_state: "half_open", is_deranked: false, open_until_ms: null },
		]), { status: 200 })));

		const response = await app.request(
			"https://phaseo.app/api/_web/models/provider-routing-health?provider_ids=openai",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toBe("web-api-provider-routing-health");
		await expect(response.json()).resolves.toEqual({ providers: { openai: {
			providerId: "openai",
			deranked: true,
			recovering: false,
			openCount: 1,
			halfOpenCount: 1,
			checkedPairs: 2,
		} } });
	});
});
