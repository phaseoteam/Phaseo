import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public compare routes", () => {
	it("returns final compare usage from one cached Worker request", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_compare_realtime")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", realtime_requests: 2, realtime_latency_p50: 75, realtime_throughput_p50: 100,
			}]), { status: 200 });
			if (url.includes("get_model_performance_overview")) return new Response(JSON.stringify([{
				last_24h: { total_requests: 5 }, hourly_24h: [],
			}]), { status: 200 });
			if (url.includes("get_model_token_trajectory")) return new Response(JSON.stringify([{ points: [] }]), { status: 200 });
			if (url.includes("get_compare_usage_daily")) return new Response(JSON.stringify([{
				day_bucket: new Date().toISOString().slice(0, 10), model_id: "openai/gpt-test", requests: 4, input_tokens: 900, output_tokens: 100, reasoning_tokens: 0,
			}]), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/compare/usage?ids=openai%2Fgpt-test", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300, stale-while-revalidate=300");
		const body = await response.json() as { usage: Record<string, { activity30d: Array<Record<string, unknown>> }> };
		expect(body).toMatchObject({ usage: {
			"openai/gpt-test": { totalRequests: 5, requests30m: 2, latencyP50Ms30m: 75, throughputP50TokPerSec30m: 100 },
		} });
		const activity = body.usage["openai/gpt-test"]!.activity30d;
		expect(activity).toHaveLength(30);
		expect(activity.at(-1)).toMatchObject({ requests: 4, input: 900, output: 100, reasoning: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("get_public_compare_realtime"))).toBe(true);
	});

	it("leaves the daily series out until the activity function is deployed", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_compare_realtime")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test" }]), { status: 200 });
			if (url.includes("get_compare_usage_daily")) return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function" }), { status: 404 });
			return new Response(JSON.stringify([{}]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/_web/compare/usage?ids=openai%2Fgpt-test", {}, env);

		expect(response.status).toBe(200);
		const body = await response.json() as { usage: Record<string, Record<string, unknown>> };
		expect(body.usage["openai/gpt-test"]).toBeDefined();
		expect(body.usage["openai/gpt-test"]).not.toHaveProperty("activity30d");
	});

	it("rejects oversized detailed selections before querying the database", async () => {
		const response = await app.request("https://phaseo.app/api/_web/compare/selection?ids=a,b,c,d,e", {}, env);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "invalid_compare_selection" });
	});

	it("returns detailed models from one batch endpoint", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
			if (url.pathname.endsWith("/v2_models")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test",
				name: "GPT Test",
				lab_slug: "openai",
				status: "active",
				input_modalities: ["text"],
				output_modalities: ["text"],
				lab: { lab_slug: "openai", name: "OpenAI" },
			}]), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/compare/selection?ids=openai%2Fgpt-test", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300");
		await expect(response.json()).resolves.toMatchObject({
			models: [{ id: "openai/gpt-test", name: "GPT Test", benchmark_results: [], prices: [] }],
		});
		const modelUrls = fetchMock.mock.calls.map(([input]) => String(input));
		expect(modelUrls.filter((url) => url.includes("/v2_models?")).length).toBe(1);
	});

	it("places the compared models among each capability leaderboard", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("epoch-capabilities-index")) return new Response("[]", { status: 200 });
			if (url.includes("v2_benchmarks")) return new Response(JSON.stringify([
				{ benchmark_id: "aa-intelligence-index-v4", name: "Intelligence Index", ascending_order: true, total_models: 7 },
				{ benchmark_id: "aa-intelligence-index-cost-v4", name: "Cost to run the Intelligence Index", ascending_order: false, total_models: 7 },
			]), { status: 200 });
			if (url.includes("v2_benchmark_results")) return new Response(JSON.stringify(Array.from({ length: 7 }, (_, index) => [
				{ benchmark_id: "aa-intelligence-index-v4", model_slug: `lab/model-${index + 1}`, score_numeric: 70 - index },
				{ benchmark_id: "aa-intelligence-index-cost-v4", model_slug: `lab/model-${index + 1}`, score_numeric: 100 + index },
			]).flat()), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify(Array.from({ length: 7 }, (_, index) => ({
				model_slug: `lab/model-${index + 1}`, name: `Model ${index + 1}`, lab_slug: "lab", lab: { name: "Lab" },
			}))), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/compare/peers?ids=lab%2Fmodel-7,lab%2Fmodel-2", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
		const body = await response.json() as { boards: Array<{ id: string; total: number; entries: Array<{ modelId: string; rank: number }> }> };
		expect(body.boards.map((board) => board.id)).toEqual(["aa-intelligence-index-v4"]);
		expect(body.boards[0]!.total).toBe(7);
		expect(body.boards[0]!.entries.map((entry) => [entry.modelId, entry.rank])).toEqual([
			["lab/model-1", 1], ["lab/model-2", 2], ["lab/model-3", 3], ["lab/model-4", 4], ["lab/model-5", 5], ["lab/model-7", 7],
		]);
	});

	it("returns the composed compare view with the selection cache policy", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
			if (url.pathname.endsWith("/v2_models")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test",
				name: "GPT Test",
				lab_slug: "openai",
				status: "active",
				input_modalities: ["text"],
				output_modalities: ["text"],
				lab: { lab_slug: "openai", name: "OpenAI" },
			}]), { status: 200 });
			if (url.pathname.endsWith("/v2_benchmark_results")) return new Response(JSON.stringify([{
				result_id: 1, model_slug: "openai/gpt-test", benchmark_id: "mmlu", score: 90, is_self_reported: true, other_info: "With Thinking",
				benchmark: { benchmark_id: "mmlu", name: "MMLU", category: "knowledge", ascending_order: true, benchmark_type: "percentage" },
			}]), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/compare/view?ids=openai%2Fgpt-test,missing%2Fmodel", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-model-pricing");
		await expect(response.json()).resolves.toMatchObject({
			models: [{ id: "openai/gpt-test", lab: { id: "openai", name: "OpenAI" }, pricing: null, providers: [], otherListings: [] }],
			benchmarks: [{ id: "mmlu", source: "lab", higherIsBetter: true, results: { "openai/gpt-test": [{ score: 90, variant: "With Thinking" }] } }],
		});
		const invalid = await app.request("https://phaseo.app/api/_web/compare/view?ids=a,b,c,d,e", {}, env);
		expect(invalid.status).toBe(400);
	});

	it("returns the visible compare catalogue with edge cache headers", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			model_slug: "openai/gpt-test",
			name: "GPT Test",
			lab_slug: "openai",
			status: "active",
			announced_at: "2026-06-01",
			released_at: "2026-07-01",
			deprecated_at: null,
			retired_at: null,
			input_modalities: ["text"],
			output_modalities: ["text"],
			lab: { lab_slug: "openai", name: "OpenAI" },
		}]), { status: 200 })));

		const response = await app.request("https://phaseo.app/api/_web/compare/models", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		expect(response.headers.get("cache-tag")).toContain("web-api-compare");
		await expect(response.json()).resolves.toMatchObject({
			models: [{
				id: "openai/gpt-test",
				name: "GPT Test",
				provider: { provider_id: "openai", name: "OpenAI" },
			}],
		});
	});

	it("pages past the 1,000-row database limit and serves slim picker options", async () => {
		const row = (index: number) => ({
			model_slug: `lab/model-${String(index).padStart(4, "0")}`,
			name: `Model ${String(index).padStart(4, "0")}`,
			lab_slug: "lab",
			released_at: "2026-07-01",
			input_modalities: ["text"],
			output_modalities: ["text", "image"],
			lab: { lab_slug: "lab", name: "Lab" },
		});
		// Model 0 has an expired route, model 1 a future one, model 2 a paused provider and
		// model 3 no callable capability; models 4-1,101 are served now.
		const route = (index: number) => ({
			provider_model_id: `route-${String(index).padStart(4, "0")}`,
			provider_slug: index === 2 ? "paused" : "live",
			model_slug: row(index).model_slug,
			effective_from: index === 1 ? "2999-01-01T00:00:00Z" : null,
			effective_to: index === 0 ? "2020-01-01T00:00:00Z" : null,
		});
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const offset = Number(url.searchParams.get("offset") ?? 0);
			// PostgREST caps every response at 1,000 rows.
			const limit = Math.min(Number(url.searchParams.get("limit") ?? 1_000), 1_000);
			if (url.pathname.endsWith("/v2_providers")) return new Response(JSON.stringify([{ provider_slug: "live" }]), { status: 200 });
			const source = url.pathname.endsWith("/v2_model_provider_routes")
				? Array.from({ length: 1_102 }, (_, index) => route(index))
				: url.pathname.endsWith("/v2_route_capabilities")
					? Array.from({ length: 1_102 }, (_, index) => index).filter((index) => index !== 3).map((index) => ({ provider_model_id: route(index).provider_model_id, capability_id: "text.generate" }))
					: Array.from({ length: 1_250 }, (_, index) => row(index));
			return new Response(JSON.stringify(source.slice(offset, offset + limit)), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const [models, options] = await Promise.all([
			app.request("https://phaseo.app/api/_web/compare/models", {}, env),
			app.request("https://phaseo.app/api/_web/compare/options", {}, env),
		]);

		expect((await models.json() as { models: unknown[] }).models).toHaveLength(1_250);
		expect(options.status).toBe(200);
		expect(options.headers.get("cache-tag")).toContain("web-api-compare");
		const { models: picker } = await options.json() as { models: Array<Record<string, unknown>> };
		expect(picker).toHaveLength(1_250);
		expect(picker[1_249]).toEqual({
			id: "lab/model-1249",
			name: "Model 1249",
			status: null,
			routed: false,
			release_date: "2026-07-01",
			input_types: ["text"],
			output_types: ["text", "image"],
			provider: { provider_id: "lab", name: "Lab" },
		});
		expect(picker.slice(0, 5).map((option) => option.routed)).toEqual([false, false, false, false, true]);
		expect(picker[1_101].routed).toBe(true);
		expect(picker[1_102].routed).toBe(false);
		const urls = fetchMock.mock.calls.map(([input]) => decodeURIComponent(String(input)));
		const routeUrls = urls.filter((url) => url.includes("/v2_model_provider_routes"));
		expect(routeUrls).toHaveLength(2);
		expect(routeUrls.every((url) => url.includes("routing_enabled=eq.true") && url.includes("status=in.(active,degraded)") && url.includes("or=(access_scope.is.null,access_scope.neq.internal)") && url.includes("order=provider_model_id.asc"))).toBe(true);
		const capabilityUrls = urls.filter((url) => url.includes("/v2_route_capabilities"));
		expect(capabilityUrls).toHaveLength(2);
		expect(capabilityUrls.every((url) => url.includes("status=in.(active,degraded)") && url.includes("order=provider_model_id.asc,capability_id.asc"))).toBe(true);
		expect(urls.some((url) => url.includes("/v2_providers") && url.includes("routing_enabled=eq.true") && url.includes("status=eq.active"))).toBe(true);
		expect(urls.filter((url) => url.includes("/v2_models")).every((url) => url.includes("order=name.asc,model_slug.asc"))).toBe(true);
	});
});
