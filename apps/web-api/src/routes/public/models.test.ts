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

describe("public model routes", () => {
	it("includes the database-composed free router in page projection 5", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", gateway_status: "active",
				gateway_input_modalities: ["text"], gateway_output_modalities: ["text"], gateway_features: [], gateway_tiers: [],
			}]), { status: 200 });
			if (url.includes("get_public_free_router_overview")) return new Response(JSON.stringify({
				summary: { eligibleModels: 1, eligibleProviders: 2, routedRequests30d: 50, totalCostNanos30d: 0 },
				models: [{ modelId: "openai/gpt-test", inputModalities: ["text", "image"], outputModalities: ["text"] }],
			}), { status: 200 });
			return new Response("[]", { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/_web/models?shape=page&projection=5&limit=2000", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-free-router-overview");
		await expect(response.json()).resolves.toMatchObject({
			projection: 5,
			total: 2,
			models: [
				{ model_id: "phaseo/free", gateway_provider_count: 2, gateway_input_modalities: ["image", "text"], router_requests_30d: 50 },
				{ model_id: "openai/gpt-test" },
			],
			facets: { statusCounts: { active: 2 }, tierOptions: [{ value: "free", count: 1 }] },
		});
	});

	it("uses the database-aggregated catalogue for the models page shape", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_rows")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation_name: "OpenAI",
				primary_date: "2026-01-02", gateway_status: "active",
				gateway_provider_count: 1, gateway_active_provider_count: 1, gateway_endpoints: ["responses"],
				gateway_input_modalities: ["text"], gateway_output_modalities: ["text"], gateway_features: ["tools"],
				gateway_tiers: ["standard"], gateway_execution_regions: ["us"], gateway_provider_names: ["OpenAI"],
			}]), { status: 200 });
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
			shape: "page", pricing_complete: true, total: 1,
			models: [{ model_id: "openai/gpt-test", name: "GPT Test", gateway_execution_regions: ["us"], gateway_tiers: ["standard"] }],
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_monitor_model_rows"))).toBe(false);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_models_page_rows"))).toBe(true);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_model_catalogue_rows"))).toBe(false);
	});

	it("marks the compatibility catalogue as needing pricing enrichment before the page RPC is deployed", async () => {
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
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			pricing_complete: false,
			total: 1,
			models: [{ model_id: "openai/gpt-test" }],
		});
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_model_catalogue_rows"))).toBe(true);
	});

	it("supports the parallel V2 catalogue and rejects unknown versions", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_monitor_model_rows_v2")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(
				JSON.stringify([
					{
						model_id: "openai/gpt-test",
						full_name: "GPT Test",
						organisation_id: "openai",
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
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("data_models_v2"))).toBe(true);
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

	it("applies a distinct cache profile to the catalogue, benchmarks, and performance", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_benchmarks")) {
				return new Response(JSON.stringify([{ result_id: "result-1", benchmark_id: "mmlu", score: "0.85", score_numeric: 0.85, is_self_reported: false, other_info: null, source_link: "https://example.com", result_rank: 2, benchmark_name: "MMLU", total_models: 50, ascending_order: true, benchmark_type: "percentage" }]), { status: 200 });
			}
			if (url.includes("/rpc/get_model_performance_overview")) {
				return new Response(JSON.stringify([{ last_24h: { total_requests: 42 } }]), { status: 200 });
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

	it("never exposes a synthetic unknown provider in performance data", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/rpc/get_v2_model_performance_overview")) {
				return new Response(JSON.stringify({
					last_24h: { total_requests: 12, successful_requests: 11 },
					hourly_24h: [],
					provider_uptime_24h: [
						{ provider: "poolside", provider_name: "Poolside", requests: 11 },
						{ provider: "unknown", provider_name: "unknown", requests: 1 },
					],
					provider_daily_7d: [
						{ day: "2026-07-23", provider: "poolside", provider_name: "Poolside", requests: 11 },
						{ day: "2026-07-23", provider: "unknown", provider_name: "unknown", requests: 1 },
					],
				}), { status: 200 });
			}
			if (url.includes("/rpc/get_v2_model_provider_health_metrics")) {
				return new Response(JSON.stringify([]), { status: 200 });
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
			expect.objectContaining({ provider: "poolside" }),
		]);
		expect(payload.metrics.providerDaily7d).toEqual([
			expect.objectContaining({ provider: "poolside" }),
		]);
		expect(JSON.stringify(payload)).not.toContain('"unknown"');
	});

	it("returns compact gateway availability without loading full metadata", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (!url.includes("data_api_provider_models")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([{
				provider_api_model_id: "openai:gpt-test",
				is_active_gateway: true,
				routing_status: "active",
				effective_from: "2025-01-01T00:00:00Z",
				effective_to: null,
				data_api_provider_model_capabilities: [{ status: "active" }],
				data_api_providers: { status: "active", routing_status: "active" },
			}]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/availability", {}, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			availability: { isGatewayActive: true, activeProviderCount: 1 },
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls.every(([input]) => !String(input).includes("data_api_model_aliases"))).toBe(true);
	});

	it("returns the overview shape used by the model page", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			model_id: "openai/gpt-test",
			name: "GPT Test",
			organisation_id: "openai",
			license: "MIT",
			model_details: [{ detail_name: "context", detail_value: 128000 }],
			organisation: { name: "OpenAI", country_code: "US" },
			model_links: [],
		}]), { status: 200 })));

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
				license: null,
				model_details: [
					{ detail_name: "context", detail_value: 128000 },
					{ detail_name: "license", detail_value: "MIT" },
				],
			},
		});
	});

	it("returns public model app usage from the rollup RPC", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_usage_model_apps")) return new Response(JSON.stringify([{ app_id: "app-1", title: "Example", image_url: "https://example.com/app.png", url: "https://example.com", last_seen: "2026-07-17T00:00:00Z", requests: "4", success_requests: "3", total_tokens: "100" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", api_model_id: "gpt-test" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/models/openai%2Fgpt-test/apps", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=3600");
		await expect(response.json()).resolves.toEqual({ apps: [{ appId: "app-1", title: "Example", imageUrl: "https://example.com/app.png", url: "https://example.com", lastSeen: "2026-07-17T00:00:00Z", totalRequests: 4, successfulRequests: 3, totalTokens: 100 }] });
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
			if (url.includes("previous_model_id=eq.openai/gpt-test")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-next",
					name: "GPT Next",
					release_date: "2026-08-01",
				}]), { status: 200 });
			}
			if (url.includes("model_id=eq.openai/gpt-old")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-old",
					name: "GPT Old",
					release_date: "2026-01-01",
				}]), { status: 200 });
			}
			if (url.includes("previous_model_id")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					name: "GPT Test",
					previous_model_id: "openai/gpt-old",
					announcement_date: "2026-06-01",
					release_date: "2026-07-01",
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
			if (url.includes("data_api_model_aliases")) {
				return new Response(JSON.stringify([{
					api_model_id: "openai/gpt-test",
				}]), { status: 200 });
			}
			if (url.includes("data_api_model_page_notices")) {
				return new Response(JSON.stringify([{
					api_model_id: "openai/gpt-test",
					tone: "warning",
					markdown: "This model is changing.",
				}]), { status: 200 });
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
