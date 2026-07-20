import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };

afterEach(() => vi.unstubAllGlobals());

describe("public provider routes", () => {
	it("returns the enriched provider index with stable caching", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("data_api_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI", colour: "#000", country_code: "US", provider_family_id: "openai", offer_label: null, offer_scope: "global" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ provider_id: "openai", model_id: "openai/gpt-test", api_model_id: "gpt-test", provider_api_model_id: "pm-1", provider_model_slug: "gpt-test", is_active_gateway: true, effective_from: "2026-01-01T00:00:00Z", effective_to: null, input_modalities: ["text", "image"], output_modalities: ["text"] }]), { status: 200 });
			if (url.includes("data_api_pricing_rules")) return new Response(JSON.stringify([{ model_key: "openai:gpt-test:free:chat", effective_from: "2026-01-01T00:00:00Z", effective_to: null }]), { status: 200 });
			if (url.includes("gateway_usage_rollup_15m_model_provider")) return new Response(JSON.stringify([{ bucket_15m: new Date().toISOString(), provider: "openai", requests: 10, total_tokens: 100 }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", input_types: ["text"], output_types: ["text"] }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/api-providers", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
		await expect(response.json()).resolves.toMatchObject({ providers: [{ api_provider_id: "openai", api_provider_name: "OpenAI", total_models: 1, active_models: 1, free_models: 1, total_daily_tokens: 100, total_monthly_tokens: 100, modality_support: { text: { input: 1, output: 1 }, image: { input: 1, output: 0 } } }] });
	});

	it("returns parity-shaped top model and app telemetry with the short edge policy", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("get_top_models_stats_tokens")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", model_name: "GPT Test", request_count: "4", total_tokens: "120", median_latency_ms: "12.6", median_throughput: "3.456" }]), { status: 200 });
			if (url.includes("get_top_apps_stats")) return new Response(JSON.stringify([{ app_id: "app-1", title: "Example", url: "https://example.com", total_tokens: "99" }, { app_id: "unknown", title: "Unknown", total_tokens: 1000 }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", hidden: false }]), { status: 200 });
			if (url.includes("api_apps")) return new Response(JSON.stringify([{ id: "app-1", image_url: "https://example.com/app.png" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const [models, apps] = await Promise.all([
			app.request("https://phaseo.app/api/_web/api-providers/openai/top-models?count=6", {}, env),
			app.request("https://phaseo.app/api/_web/api-providers/openai/top-apps?period=week&count=20", {}, env),
		]);
		for (const response of [models, apps]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
			expect(response.headers.get("cache-tag")).toContain("web-api-provider-openai");
		}
		await expect(models.json()).resolves.toEqual({ models: [{ model_id: "openai/gpt-test", model_name: "GPT Test", request_count: 4, total_tokens: 120, median_latency_ms: 13, median_throughput: 3.46 }] });
		await expect(apps.json()).resolves.toEqual({ apps: [{ app_id: "app-1", title: "Example", url: "https://example.com", image_url: "https://example.com/app.png", total_tokens: 99 }] });
	});

	it("returns provider updates with lifecycle ordering and an hourly cache", async () => {
		const release = new Date().toISOString();
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("get_provider_token_usage")) return new Response(JSON.stringify([{ total_tokens: "500" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", api_model_id: "gpt-test", created_at: release, is_active_gateway: true }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", release_date: release, announcement_date: null, organisation: { organisation_id: "openai", name: "OpenAI" } }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/api-providers/openai/updates", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
		await expect(response.json()).resolves.toMatchObject({ recentTokens: 500, recentModels: [{ model_id: "openai/gpt-test", data_models: { name: "GPT Test" } }], newModels: [{ api_model_id: "gpt-test" }] });
	});

	it("aggregates provider rollups into the existing metrics payload", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("gateway_usage_rollup_15m_model_provider")) return new Response(JSON.stringify([{
				bucket_15m: new Date().toISOString(), canonical_model_id: "openai/gpt-test", requests: 10, success_requests: 9,
				total_tokens: 100, latency_sum_ms: 500, latency_samples: 10, throughput_sum: 200, throughput_samples: 10,
			}]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/api-providers/openai/metrics?hours=24", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
		await expect(response.json()).resolves.toMatchObject({
			summary: { uptimePct: 90, avgLatencyMs: 50, avgThroughput: 20, requests24h: 10, successful24h: 9 },
			timeseries: { latency: expect.any(Array), throughput: expect.any(Array) },
			dailyModelLeaderboards: expect.any(Object),
		});
	});

	it("returns dense model and app token series for every requested day", async () => {
		const bucket = new Date().toISOString();
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("get_top_models_stats_tokens")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test" }]), { status: 200 });
			if (url.includes("get_top_apps_stats")) return new Response(JSON.stringify([{ app_id: "app-1", title: "Example", url: "https://example.com" }]), { status: 200 });
			if (url.includes("gateway_usage_rollup_15m_model_provider")) return new Response(JSON.stringify([{ bucket_15m: bucket, canonical_model_id: "openai/gpt-test", total_tokens: 20 }]), { status: 200 });
			if (url.includes("gateway_usage_rollup_15m_provider_app")) return new Response(JSON.stringify([{ bucket_15m: bucket, app_id: "app-1", total_tokens: 15 }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test" }]), { status: 200 });
			if (url.includes("api_apps")) return new Response(JSON.stringify([{ id: "app-1", title: "Example", url: "https://example.com", image_url: "https://example.com/app.png" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const [modelResponse, appResponse] = await Promise.all([
			app.request("https://phaseo.app/api/_web/api-providers/openai/model-token-timeseries?days=2&topModels=8", {}, env),
			app.request("https://phaseo.app/api/_web/api-providers/openai/app-token-timeseries?days=2&topApps=20", {}, env),
		]);
		for (const response of [modelResponse, appResponse]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
		}
		const modelPayload = await modelResponse.json() as { models: unknown[]; points: unknown[] };
		const appPayload = await appResponse.json() as { apps: unknown[]; points: unknown[] };
		expect(modelPayload.models).toEqual([{ modelId: "openai/gpt-test", modelName: "GPT Test", totalTokens: 20 }]);
		expect(modelPayload.points).toContainEqual(expect.objectContaining({ modelId: "openai/gpt-test", tokens: 20 }));
		expect(appPayload.apps).toEqual([{ appId: "app-1", title: "Example", url: "https://example.com", imageUrl: "https://example.com/app.png", totalTokens: 15 }]);
		expect(appPayload.points).toContainEqual(expect.objectContaining({ appId: "app-1", tokens: 15 }));
	});

	it("returns the provider model list with merged capabilities and current pricing", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", provider_id: "openai", api_model_id: "gpt-test", provider_model_slug: "gpt-test", model_id: "openai/gpt-test", is_active_gateway: true, input_modalities: ["text"], output_modalities: ["text"], created_at: "2026-07-01T00:00:00Z" }]), { status: 200 });
			if (url.includes("data_api_provider_model_capabilities")) return new Response(JSON.stringify([{ provider_api_model_id: "pm-1", capability_id: "chat/completions", params: { temperature: true }, status: "active" }]), { status: 200 });
			if (url.includes("data_api_pricing_rules")) return new Response(JSON.stringify([
				{ model_key: "openai:gpt-test:chat/completions", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 2, effective_from: "2026-01-01T00:00:00Z", effective_to: null, priority: 0 },
				{ model_key: "openai:gpt-test:chat/completions", pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 6, effective_from: "2026-01-01T00:00:00Z", effective_to: null, priority: 0 },
			]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", release_date: "2026-06-01", announcement_date: null, hidden: false }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/api-providers/openai/models", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
		const payload = await response.json() as { models: Array<Record<string, unknown>> };
		expect(payload.models).toHaveLength(1);
		expect(payload.models[0]).toMatchObject({ model_id: "openai/gpt-test", api_model_id: "gpt-test", model_name: "GPT Test", endpoints: ["chat/completions"], supported_params: ["temperature"], input_price_per_1m_usd: 2, output_price_per_1m_usd: 6 });
		expect(payload.models[0]?.pricing_meters).toEqual(expect.arrayContaining([expect.objectContaining({ meter: "input_text_tokens", price_per_1m_usd: 2 })]));
	});
});
