import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("public landing routes", () => {
	it("labels gateway rollups with their actual measurement window", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_gateway_marketing_rollup")) {
				return new Response(JSON.stringify([{
					bucket_hour: new Date().toISOString(),
					requests: 2,
					success_requests: 2,
					total_tokens: 30,
					latency_sum_ms: 200,
					latency_samples: 2,
				}]), { status: 200 });
			}
			if (url.includes("v2_model_provider_routes")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-test",
					provider_slug: "openai",
					effective_from: null,
					effective_to: null,
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/landing/gateway-showcase?hours=24&top_models_limit=0&top_apps_limit=0",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			metrics: {
				summary: {
					windowHours: 24,
					requestsInWindow: 2,
					successfulInWindow: 2,
					tokensInWindow: 30,
				},
			},
		});
	});

	it("returns model statistics and selected visible models", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_model_provider_routes")) {
				return new Response(JSON.stringify([
					{ model_id: "openai/gpt-test", internal_model_id: "openai/gpt-test", api_model_id: "openai/gpt-test", effective_from: null, effective_to: null },
					{ model_id: "anthropic/claude-test", internal_model_id: "anthropic/claude-test", api_model_id: "anthropic/claude-test", effective_from: "2999-01-01T00:00:00Z", effective_to: null },
				]), { status: 200 });
			}
			if (url.includes("v2_models") && url.includes("model_slug=in.")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					name: "GPT Test",
					release_date: "2026-07-01",
					data_organisations: {
						organisation_id: "openai",
						name: "OpenAI",
						colour: "#000",
					},
				}]), { status: 200 });
			}
			if (url.includes("v2_models")) return new Response(JSON.stringify([
				{
					model_id: "openai/gpt-test",
					organisation_id: "openai",
					release_date: "2026-07-01",
				},
				{
					model_id: "anthropic/claude-test",
					organisation_id: "anthropic",
					release_date: "2020-01-01",
				},
			]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const [stats, main] = await Promise.all([
			app.request("https://phaseo.app/api/_web/landing/models/stats", {}, env),
			app.request("https://phaseo.app/api/_web/landing/models/main?ids=openai%2Fgpt-test", {}, env),
		]);

		expect(stats.status).toBe(200);
		expect(stats.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		await expect(stats.json()).resolves.toEqual({
			modelsCount: 2,
			orgsCount: 2,
			apiCount: 1,
			recentCount: 1,
		});
		expect(main.status).toBe(200);
		expect(main.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=86400, stale-while-revalidate=604800",
		);
		await expect(main.json()).resolves.toMatchObject({
			models: [{ model_id: "openai/gpt-test", name: "GPT Test" }],
		});
	});
});
