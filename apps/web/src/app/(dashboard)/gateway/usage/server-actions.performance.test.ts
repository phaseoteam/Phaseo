export {};

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const getServerAccountContext = jest.fn();
const fetchAccountWebApi = jest.fn();

jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi }));

const rows = Array.from({ length: 25 }, (_, index) => ({
	request_id: `req_${index}`,
	created_at: `2026-05-05T10:${String(index).padStart(2, "0")}:00.000Z`,
	app_title: `App ${index}`,
}));

let fetchPaginatedRequests: typeof import("./server-actions").fetchPaginatedRequests;

describe("fetchPaginatedRequests performance", () => {
	beforeAll(async () => {
		({ fetchPaginatedRequests } = await import("./server-actions"));
	});

	beforeEach(() => {
		getServerAccountContext.mockReset().mockResolvedValue({ accessToken: "access-token", workspaceId: "team_perf_logs", obfuscateInfo: false });
		fetchAccountWebApi.mockReset().mockResolvedValue({ result: { data: rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 } });
	});

	it("keeps the Worker transport wrapper under 10ms p95 for the mocked hot path", async () => {
		const params = { timeRange: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-05T23:59:59.999Z" }, page: 1, sortField: "created_at", sortDirection: "desc" as const };
		const warm = await fetchPaginatedRequests(params);
		expect(warm.data).toHaveLength(25);
		expect(warm.data[0]?.app_title).toBe("App 0");
		getServerAccountContext.mockClear();
		fetchAccountWebApi.mockClear();

		const samples: number[] = [];
		const iterations = 200;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			const result = await fetchPaginatedRequests(params);
			samples.push(performance.now() - started);
			expect(result.total).toBe(25);
		}
		const p95 = percentile(samples, 95);
		expect(p95).toBeLessThan(10);
		expect(getServerAccountContext).toHaveBeenCalledTimes(iterations);
		expect(fetchAccountWebApi).toHaveBeenCalledTimes(iterations);
		expect(fetchAccountWebApi).toHaveBeenLastCalledWith("/api/account/settings/usage/actions", "access-token", expect.objectContaining({ method: "POST" }));
	});
});
