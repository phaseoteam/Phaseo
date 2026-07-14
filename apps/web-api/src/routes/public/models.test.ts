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
			if (url.includes("data_api_providers")) {
				return new Response(
					JSON.stringify([
						{ api_provider_id: "openai", default_execution_regions: ["US", "eu"] },
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
			if (url.includes("/rpc/get_model_performance_overview")) {
				return new Response(JSON.stringify([{ last_24h: { total_requests: 42 } }]), { status: 200 });
			}
			if (url.includes("benchmark_results")) {
				return new Response(JSON.stringify([{ model_id: "openai/gpt-test", benchmark_results: [] }]), { status: 200 });
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
		expect(performance.status).toBe(200);
		expect(performance.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
	});
});
