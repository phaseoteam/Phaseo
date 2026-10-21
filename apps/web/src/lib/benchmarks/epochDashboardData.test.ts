import { fetchEpochDashboard } from "./epochDashboardData";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ cacheLife: jest.fn() }));
const benchmark: BenchmarkPage = { id: "epoch-capabilities-index", name: null, category: null, ascending_order: true, total_models: 1, link: null, results: [{ id: "result", model_id: "lab/imported", score: 0, is_self_reported: false, updated_at: "2025-01-01" }] };
const original = global.fetch;
afterEach(() => { global.fetch = original; jest.restoreAllMocks(); });

it("keeps fresh general scores when the domain source fails", async () => {
	global.fetch = jest.fn(async (url) => String(url).endsWith("eci_scores.csv") ? new Response("Model,eci\nNew model,160") : new Response("unavailable", { status: 503 }));
	const data = await fetchEpochDashboard(benchmark);
	expect(data).toMatchObject({ source: "epoch", domainsAvailable: false, rows: [{ id: "New model", scores: { overall: 160, coding: null, maths: null } }] });
	expect(data.sourceDate).toBeTruthy();
});
it("rejects malformed domain metadata without replacing the general publication with stale catalogue scores", async () => {
	global.fetch = jest.fn(async (url) => new Response(String(url).endsWith("eci_scores.csv") ? "Model,eci\nNew model,160" : String(url).endsWith(".json") ? "{invalid" : "model,benchmark,performance"));
	expect(await fetchEpochDashboard(benchmark)).toMatchObject({ source: "epoch", domainsAvailable: false, rows: [{ id: "New model" }] });
});
it("serves imported zero scores with an explicit fallback when Epoch cannot be reached", async () => {
	jest.spyOn(console, "warn").mockImplementation(() => {});
	global.fetch = jest.fn(async () => { throw new Error("offline"); });
	expect(await fetchEpochDashboard(benchmark)).toMatchObject({ source: "catalogue", domainsAvailable: false, rows: [{ modelId: "lab/imported", scores: { overall: 0, coding: null, maths: null }, access: "unknown", interval: null }] });
});
