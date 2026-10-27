import { afterEach, expect, it, vi } from "vitest";
import app from "@/index";
import { AA_V4_ARCHIVE } from "./artificial-analysis-archive";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" };
const id4 = "aa-intelligence-index-v4", id5 = "aa-intelligence-index-v5", coding4 = "aa-coding-index-v4";
const result = (benchmark_id: string, score: string) => ({ benchmark_id, score, result_id: benchmark_id, model_slug: "lab/model", other_info: `Artificial Analysis ID source; Intelligence Index v${benchmark_id.endsWith("-v4") ? "4.3.2" : "5.0"}` });
const benchmarks = [id4, id5, coding4].map((benchmark_id) => ({ benchmark_id, name: benchmark_id, total_models: benchmark_id === coding4 ? 0 : 1 }));
afterEach(() => vi.unstubAllGlobals());

it("defaults to published v5 and reads v4 from its immutable publication instead of mutable result rows", async () => {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith("get_artificial_analysis_coverage")) return Response.json(benchmarks.map((row) => ({ ...row, published: true })));
		if (url.pathname.endsWith("artificial_analysis_snapshots")) {
			expect(url.searchParams.get("snapshot_id")).toBe(`eq.${AA_V4_ARCHIVE.core}`);
			return Response.json({ methodology_version: "4.3.2", payload: { results: [result(id4, "43.2"), result(coding4, "10")] } });
		}
		if (url.pathname.endsWith("v2_models")) return Response.json([{ model_slug: "lab/model", hidden: false, name: "Model", lab: null }]);
		if (url.searchParams.get("select")?.includes("results:v2_benchmark_results")) {
			expect(url.searchParams.get("benchmark_id")).not.toContain("-v4");
			return Response.json([{ benchmark_id: id5, results: [result(id5, "25")] }]);
		}
		const id = url.searchParams.get("benchmark_id");
		return Response.json(id?.startsWith("eq.") ? benchmarks.find((row) => row.benchmark_id === id.slice(3)) : benchmarks);
	}));
	for (const [query, expectedId, score] of [["", id5, "25"], ["?version=4", id4, "43.2"], ["?metric=coding&version=4", coding4, "10"]]) {
		const response = await app.request(`https://phaseo.app/api/_web/benchmarks/artificial-analysis${query}`, {}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ benchmark: { id: expectedId, results: [{ score }], suite: { current_version: 5, versions: [5, 4], version_labels: { 4: "4.3.2" } } } });
	}
});

it("uses frozen rich scores and pagination, removes private data, and respects current hidden/deleted models", async () => {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith("artificial_analysis_public_snapshots")) {
			expect(url.searchParams.get("snapshot_id")).toBe(`eq.${AA_V4_ARCHIVE.public}`);
			return Response.json({ snapshot_id: AA_V4_ARCHIVE.public, methodology_version: "4.3.2", fetched_at: "2026-10-27T07:58:04Z", payload: {
				sourceUrl: "https://artificialanalysis.ai/models", matching: { sources: [
					{ id: "a", model_id: "lab/model" }, { id: "b", model_id: "lab/model" }, { id: "hidden", model_id: "lab/hidden" }, { id: "deleted", model_id: "lab/deleted" },
				] }, models: ["b", "hidden", "a", "deleted", "unmatched"].map((id) => ({ id, intelligenceIndex: 0, sourceData: { private: true }, outputTokensPerTask: { output: 0 } })),
			} });
		}
		if (url.pathname.endsWith("v2_models")) return Response.json([{ model_slug: "lab/model", hidden: false }, { model_slug: "lab/hidden", hidden: true }]);
		throw new Error(`Unexpected request ${url.pathname}`);
	}));
	const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis/data?version=4&limit=1&offset=1", {}, env);
	const data = await response.json();
	expect(response.status).toBe(200);
	expect(data).toEqual({ snapshot_id: AA_V4_ARCHIVE.public, methodology_version: "4.3.2", fetched_at: "2026-10-27T07:58:04Z", source_url: "https://artificialanalysis.ai/models", total: 2,
		models: [{ id: "b", intelligenceIndex: 0, outputTokensPerTask: { output: 0 }, model_id: "lab/model" }] });
	expect(JSON.stringify(data)).not.toContain("private");
	expect(JSON.stringify(data)).not.toContain("matching");
});

it("fails closed when the pinned archive is missing rather than showing a newer v4 dataset", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)));
	const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis/data?version=4", {}, env);
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ error: "aa_data_unavailable" });
});

it("keeps the unversioned rich endpoint frozen on v4 until v5 is available", async () => {
	let version = "4.4";
	let archiveReads = 0;
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).includes("/rpc/")) return Response.json({ snapshot_id: "latest", methodology_version: version, total: 0, models: [] });
		archiveReads++;
		return Response.json({ snapshot_id: AA_V4_ARCHIVE.public, methodology_version: "4.3.2", payload: { models: [], matching: { sources: [] } } });
	}));
	const url = "https://phaseo.app/api/_web/benchmarks/artificial-analysis/data";
	expect(await (await app.request(url, {}, env)).json()).toMatchObject({ snapshot_id: AA_V4_ARCHIVE.public, methodology_version: "4.3.2" });
	version = "5.0";
	expect(await (await app.request(url, {}, env)).json()).toMatchObject({ snapshot_id: "latest", methodology_version: "5.0" });
	expect(archiveReads).toBe(1);
});
