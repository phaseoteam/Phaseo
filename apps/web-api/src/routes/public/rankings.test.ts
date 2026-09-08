import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public rankings routes", () => {
	it("passes URL parameters to the aggregate RPC and applies volatile caching", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ model_id: "openai/gpt-test", tokens: 10 }]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await app.request("https://phaseo.app/api/_web/rankings/timeseries?time_range=month&bucket_size=day&top_n=4", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_public_usage_timeseries");
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_time_range":"month"');
		await expect(response.json()).resolves.toEqual({ data: [{ model_id: "openai/gpt-test", tokens: 10 }] });
	});

	it("returns a compact cached benchmark leaderboard with model metadata", async () => {
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("v2_benchmarks")) {
				return new Response(JSON.stringify([{
					benchmark_id: "aa-intelligence-index-v4",
					name: "Artificial Analysis Intelligence Index v4.1",
					category: "general",
					ascending_order: true,
					benchmark_type: "numerical",
					total_models: 2,
				}]), { status: 200 });
			}
			if (url.includes("v2_benchmark_results")) {
				return new Response(JSON.stringify([
					{ benchmark_id: "aa-intelligence-index-v4", model_slug: "openai/gpt-test", score_numeric: 58, rank: 2 },
					{ benchmark_id: "aa-intelligence-index-v4", model_slug: "anthropic/claude-test", score_numeric: 61, rank: 1 },
				]), { status: 200 });
			}
			if (url.includes("v2_models")) {
				return new Response(JSON.stringify([
					{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", lab: { name: "OpenAI" } },
					{ model_slug: "anthropic/claude-test", name: "Claude Test", lab_slug: "anthropic", lab: { name: "Anthropic" } },
				]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/_web/rankings/benchmarks", {}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
		await expect(response.json()).resolves.toMatchObject({
			benchmarks: [{
				benchmark_id: "aa-intelligence-index-v4",
				entries: [
					{ model_id: "anthropic/claude-test", model_name: "Claude Test", rank: 1 },
					{ model_id: "openai/gpt-test", model_name: "GPT Test", rank: 2 },
				],
			}],
		});
	});

	it("serves the observed context-length distribution through the cached web API", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([
			{
				bucket_key: "under_4k",
				bucket_label: "Under 4K",
				bucket_order: 1,
				requests: 240,
				share_percent: 80,
			},
		]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/rankings/context-lengths?days=45",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=900",
		);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"get_public_context_length_distribution",
		);
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_days":45');
		await expect(response.json()).resolves.toMatchObject({
			days: 45,
			data: [{ bucket_key: "under_4k", requests: 240 }],
		});
	});

	it("serves model return rankings with catalogue metadata and aggregate-only fields", async () => {
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("get_public_model_retention_rankings")) return new Response(JSON.stringify([{
				model_id: "openai/gpt-test", retention_rate: 72.5, returning_workspace_weeks: 29,
				workspace_weeks: 40, unique_workspaces: 18, weeks_observed: 8,
				confidence_low: 57.2, confidence_high: 83.7, rank: 1,
			}]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", lab: { name: "OpenAI" },
			}]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const response = await app.request("https://phaseo.app/api/_web/rankings/model-retention?weeks=8&limit=10&min_workspace_weeks=40&min_workspaces=8&min_weeks=3", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
		const rpcCall = fetchMock.mock.calls.find(([input]) => String(input).includes("get_public_model_retention_rankings"));
		expect(String(rpcCall?.[1]?.body)).toContain('"p_weeks":8');
		expect(String(rpcCall?.[1]?.body)).toContain('"p_min_workspace_weeks":40');
	 expect(String(rpcCall?.[1]?.body)).toContain('"p_min_workspaces":20');
		await expect(response.json()).resolves.toMatchObject({
			data: [{ model_id: "openai/gpt-test", model_name: "GPT Test", organisation_id: "openai", retention_rate: 72.5 }],
			methodology: { cohortWeeks: 8, minimumWorkspaceWeeks: 40, minimumWorkspaces: 20, minimumWeeks: 3 },
		});
	});

	it("does not let public callers lower retention privacy floors", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/rankings/model-retention?min_workspace_weeks=1&min_workspaces=1&min_weeks=1",
			{},
			env,
		);

		expect(response.status).toBe(200);
		const rpcCall = fetchMock.mock.calls.find(([input]) => String(input).includes("get_public_model_retention_rankings"));
		const body = String(rpcCall?.[1]?.body);
		expect(body).toContain('"p_min_workspace_weeks":25');
		expect(body).toContain('"p_min_workspaces":20');
		expect(body).toContain('"p_min_weeks":2');
	});

	it("serves Fastest Models from its dedicated cached RPC", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([
			{ model_id: "openai/gpt-test", provider: "openai", median_throughput: 42 },
		]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/rankings/fastest-models?days=30&limit=20",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=900",
		);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_public_fastest_models");
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_days":30');
	});

	it("serves the Intelligence Index from its dedicated cached RPC", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
			benchmark_id: "aa-intelligence-index-v4",
			benchmark_name: "Artificial Analysis Intelligence Index v4.1.1",
			benchmark_type: "number",
			category: "general",
			model_id: "openai/gpt-test",
			model_name: "GPT Test",
			organisation_id: "openai",
			organisation_name: "OpenAI",
			score: 60,
			rank: 1,
			total_models: 261,
		}]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/rankings/intelligence-index?limit=20",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_public_intelligence_index");
		await expect(response.json()).resolves.toMatchObject({
			benchmark: {
				total_models: 261,
				entries: [{ model_id: "openai/gpt-test", rank: 1 }],
			},
		});
	});

	it("requests exact country rows without the former Other threshold", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([
			{ country_code: "GB", requests: 75, workspace_count: 1 },
		]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/rankings/geography?days=30",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_min_requests":1');
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_min_workspaces":1');
		await expect(response.json()).resolves.toMatchObject({
			data: [{ country_code: "GB", requests: 75 }],
		});
	});
});

it("paginates AA results, excludes hidden and old-version scores, and ranks costs and ties correctly", async () => {
  const ids = ["aa-intelligence-index-v4", "aa-coding-index-v4", "aa-agentic-index-v4", "aa-intelligence-index-cost-v4"];
  const info = "Test configuration; Intelligence Index v4.3";
  const rows = [
    ...Array.from({length: 500}, (_, index) => ({ benchmark_id: ids[0], model_slug: `test/model-${index}`, score_numeric: index, other_info: info })),
    { benchmark_id: ids[0], model_slug: "test/last", score_numeric: 900, other_info: info, variant: "max", result_key: "last:max" },
	{ benchmark_id: ids[0], model_slug: "test/last", score_numeric: 850, other_info: info, variant: "high", result_key: "last:high" },
    { benchmark_id: ids[0], model_slug: "test/hidden", score_numeric: 1000, other_info: info },
    { benchmark_id: ids[0], model_slug: "test/old", score_numeric: 1200, other_info: "Intelligence Index v4.1.1" },
    { benchmark_id: ids[3], model_slug: "test/last", score_numeric: 10.25, other_info: info },
    { benchmark_id: ids[3], model_slug: "test/model-0", score_numeric: 0, other_info: info },
    { benchmark_id: ids[3], model_slug: "test/model-1", score_numeric: 0, other_info: info },
  ];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/v2_benchmarks')) return new Response(JSON.stringify(ids.map((id, index) => ({ benchmark_id: id, name: id, ascending_order: index !== 3, benchmark_type: 'numerical' }))));
    if (url.pathname.endsWith('/v2_benchmark_results')) {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify(rows.slice(offset, offset + 500)));
    }
    if (url.pathname.endsWith('/v2_models')) {
      expect(url.searchParams.get('hidden')).toBe('eq.false');
      const requested = url.searchParams.get('model_slug') ?? '';
	  return new Response(JSON.stringify([...new Set(rows.map(row=>row.model_slug))].filter(id=>id !== 'test/hidden' && requested.includes(id + ',') || id !== 'test/hidden' && requested.includes(id + ')')).map(id=>({ model_slug: id, name: id, lab_slug:'test', lab:{name:'Test',colour:'#123456'} }))));
    }
    return new Response('[]');
  });
  vi.stubGlobal('fetch', fetchMock);
  const response = await app.request('https://phaseo.app/api/_web/rankings/benchmarks', {}, env);
  expect(response.status).toBe(200);
  const { benchmarks } = await response.json() as any;
  expect(benchmarks).toHaveLength(4);
  expect(benchmarks[0].entries[0]).toMatchObject({ model_id:'test/last', score:900, rank:1, other_info:info });
	expect(benchmarks[0].entries[0]).toMatchObject({ organisation_colour:'#123456', configurations:[{variant:'max',score:900},{variant:'high',score:850}] });
  expect(benchmarks[0].entries.some((entry:any)=>['test/old','test/hidden'].includes(entry.model_id))).toBe(false);
  expect(benchmarks[3].lower_is_better).toBe(true);
  expect(benchmarks[3].entries.map((entry:any)=>[entry.score,entry.rank])).toEqual([[0,1],[0,1],[10.25,3]]);
  expect(fetchMock.mock.calls.filter(([url])=>String(url).includes('/v2_benchmark_results'))).toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([url])=>String(url).includes('/v2_models'))).toHaveLength(3);
});
