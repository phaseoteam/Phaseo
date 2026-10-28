import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { artificialAnalysisCatalogue, fetchArtificialAnalysisCoverage } from "./artificial-analysis-catalogue";
import { getDataClient } from "@/data/supabase";

const rows = ["artificial-analysis", "aa-intelligence-index", "aa-intelligence-index-v3", "aa-intelligence-index-v4", "aa-intelligence-index-v5", "aa-coding-index-v4", "aa-intelligence-index-cost-v4", "aa-briefcase", "mmlu"].map((id) => ({ benchmark_id: id, name: id, total_models: 999 }));
const coverage = [
	{ benchmark_id: "aa-intelligence-index-v3", total_models: 1, published: true },
	{ benchmark_id: "aa-intelligence-index-v4", total_models: 2, published: true },
	{ benchmark_id: "aa-coding-index-v4", total_models: 1, published: true },
	{ benchmark_id: "aa-intelligence-index-cost-v4", total_models: 1, published: true },
	{ benchmark_id: "aa-briefcase", total_models: 1, published: false },
];
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" };
afterEach(() => vi.unstubAllGlobals());

describe("Artificial Analysis catalogue", () => {
	it("groups legacy and versioned rows, ignores empty future versions, and counts unique models", () => {
		const catalogue = artificialAnalysisCatalogue(rows, coverage);
		expect(catalogue.versions).toEqual([4, 3]);
		expect(catalogue.currentVersion).toBe(4);
		expect(catalogue.entries.map((row) => row.benchmark_id)).toEqual(["mmlu", "artificial-analysis"]);
		expect(catalogue.entries[1].total_models).toBe(2);
		expect(catalogue.metrics(4)[1].total_models).toBe(1);
		expect(catalogue.otherEvaluations).toEqual([{ id: "aa-briefcase", name: "aa-briefcase" }]);
	});
	it("selects a newer version only after complete publication, even if partial results exist", () => {
		expect(artificialAnalysisCatalogue(rows, [...coverage, { benchmark_id: "aa-intelligence-index-v5", total_models: 1, published: false }]).currentVersion).toBe(4);
		expect(artificialAnalysisCatalogue(rows, [...coverage, { benchmark_id: "aa-intelligence-index-v5", total_models: 1, published: true }]).currentVersion).toBe(5);
	});
	it("keeps legacy and other evaluations discoverable without a populated versioned index", () => {
		expect(artificialAnalysisCatalogue(rows, []).entries).toEqual(rows);
		const catalogue = artificialAnalysisCatalogue(rows, [...coverage, { benchmark_id: "aa-intelligence-index", total_models: 1, published: false }]);
		expect(catalogue.otherEvaluations).toContainEqual({ id: "aa-intelligence-index", name: "aa-intelligence-index" });
	});
	it("keeps global search independent of unavailable score coverage", async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_benchmark_results")) return Response.json({ message: "unavailable" }, { status: 503 });
			return Response.json(url.includes("v2_benchmarks") ? rows : []);
		});
		vi.stubGlobal("fetch", fetch);
		const response = await app.request("https://phaseo.app/api/_web/search", {}, env);
		expect(response.status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(4);
		expect(fetch.mock.calls.some(([input]) => String(input).includes("v2_benchmark_results"))).toBe(false);
	});
	it("preserves physical search destinations when metadata has no populated versioned index", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).includes("v2_benchmarks")
			? [{ benchmark_id: "aa-briefcase", name: "AA Briefcase", total_models: 1 }, { benchmark_id: "aa-intelligence-index-v5", name: "AA v5", total_models: 0 }]
			: [])));
		const response = await app.request("https://phaseo.app/api/_web/search", {}, env);
		expect(response.status).toBe(200);
		expect((await response.json() as { b: string[][] }).b.map((row) => row[3])).toEqual(["/benchmarks/aa-briefcase", "/benchmarks/aa-intelligence-index-v5"]);
	});
	it("rejects unknown major versions before scanning coverage", async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toContain("v2_benchmarks");
			return Response.json(rows);
		});
		vi.stubGlobal("fetch", fetch);
		const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis?version=999", {}, env);
		expect(response.status).toBe(404);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("loads SQL-aggregated coverage in one RPC without downloading result rows", async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			expect(url.pathname).toBe("/rest/v1/rpc/get_artificial_analysis_coverage");
			return Response.json(coverage);
		});
		vi.stubGlobal("fetch", fetch);
		const result = await fetchArtificialAnalysisCoverage(getDataClient(env), rows);
		expect(result).toEqual(coverage);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("serves one search entry and resolves stable detail links to the selected version", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/rpc/get_artificial_analysis_coverage")) return Response.json(coverage);
			if (url.pathname.endsWith("/v2_benchmarks")) {
				if (url.searchParams.get("select")?.includes("results:v2_benchmark_results")) {
					return Response.json(rows.map((row) => ({ benchmark_id: row.benchmark_id, results: [] })));
				}
				const id = url.searchParams.get("benchmark_id");
				return Response.json(id?.startsWith("eq.") ? rows.find((row) => row.benchmark_id === id.slice(3)) ?? null : rows);
			}
			if (url.pathname.endsWith("/v2_benchmark_results")) return Response.json(url.searchParams.has("benchmark_id") && url.searchParams.get("benchmark_id")?.startsWith("in.") ? coverage : []);
			return Response.json([]);
		}));
		const search = await app.request("https://phaseo.app/api/_web/search", {}, env);
		expect(search.status).toBe(200);
		const payload = await search.json() as { b: string[][] };
		expect(payload.b.filter((row) => row[1] === "Artificial Analysis")).toEqual([["artificial-analysis", "Artificial Analysis", "Intelligence, Coding, Agentic, Evaluation Cost", "/benchmarks/artificial-analysis"]]);
		const listing = await app.request("https://phaseo.app/api/_web/benchmarks", {}, env);
		expect(listing.status).toBe(200);
		expect(await listing.json()).toMatchObject({ benchmarks: [
			{ benchmark_id: "artificial-analysis", total_models: 2, metrics: expect.arrayContaining([expect.objectContaining({ key: "intelligence", total_models: 2 }), expect.objectContaining({ key: "coding", total_models: 1 })]) },
			{ benchmark_id: "mmlu" },
		] });
		for (const [query, expected] of [["", "aa-intelligence-index-v4"], ["?version=3", "aa-intelligence-index-v3"], ["?metric=coding", "aa-coding-index-v4"], ["?metric=cost", "aa-intelligence-index-cost-v4"], ["?metric=coding&version=3", "aa-intelligence-index-v3"], ["?metric=agentic", "aa-intelligence-index-v4"]]) {
			const response = await app.request(`https://phaseo.app/api/_web/benchmarks/artificial-analysis${query}`, {}, env);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ benchmark: { id: expected, suite: { current_version: 4, versions: [4, 3] } } });
		}
		const unavailable = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis?version=5", {}, env);
		expect(unavailable.status).toBe(404);
	});
	it.each(["metric=unknown", "version=0", "version=4.3", "version=-1"])("rejects invalid selection %s without querying data", async (query) => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const response = await app.request(`https://phaseo.app/api/_web/benchmarks/artificial-analysis?${query}`, {}, env);
		expect(response.status).toBe(404);
		expect(fetch).not.toHaveBeenCalled();
	});
});
