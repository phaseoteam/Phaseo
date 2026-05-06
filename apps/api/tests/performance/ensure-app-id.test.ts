import { beforeEach, describe, expect, it, vi } from "vitest";

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
	const state = {
		id: "app_123",
	};

	const selectData = vi.fn(async () => ({
		data: [{ id: state.id }],
		error: null,
	}));

	const updateEqWorkspace = vi.fn(async () => ({ error: null }));
	const updateEqId = vi.fn(() => ({
		eq: updateEqWorkspace,
	}));
	const update = vi.fn(() => ({
		eq: updateEqId,
	}));

	const insertSingle = vi.fn(async () => ({
		data: { id: state.id },
		error: null,
	}));
	const insertSelect = vi.fn(() => ({
		single: insertSingle,
	}));
	const insert = vi.fn(() => ({
		select: insertSelect,
	}));

	const supabase = {
		from: vi.fn((table: string) => {
			if (table !== "api_apps") {
				throw new Error(`Unexpected table: ${table}`);
			}
			const query = {
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						eq: vi.fn(() => ({
							order: vi.fn(() => ({
								limit: selectData,
							})),
						})),
					})),
				})),
				update,
				insert,
			};
			return query;
		}),
	};

	return {
		state,
		selectData,
		update,
		updateEqId,
		updateEqWorkspace,
		insert,
		insertSelect,
		insertSingle,
		supabase,
	};
});

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => runtime.supabase,
}));

const { __resetEnsureAppIdCacheForTests, ensureAppId } = await import(
	"@/pipeline/after/apps"
);

describe("ensureAppId warm-cache performance", () => {
	beforeEach(() => {
		runtime.state.id = "app_123";
		runtime.selectData.mockClear();
		runtime.update.mockClear();
		runtime.updateEqId.mockClear();
		runtime.updateEqWorkspace.mockClear();
		runtime.insert.mockClear();
		runtime.insertSelect.mockClear();
		runtime.insertSingle.mockClear();
		runtime.supabase.from.mockClear();
		__resetEnsureAppIdCacheForTests();
	});

	it("deduplicates concurrent cold app-id resolution to one lookup/update cycle", async () => {
		const [a, b, c] = await Promise.all([
			ensureAppId({
				workspaceId: "team_perf_apps",
				referer: "https://example.com/app",
			}),
			ensureAppId({
				workspaceId: "team_perf_apps",
				referer: "https://example.com/app",
			}),
			ensureAppId({
				workspaceId: "team_perf_apps",
				referer: "https://example.com/app",
			}),
		]);

		expect(a).toBe("app_123");
		expect(b).toBe("app_123");
		expect(c).toBe("app_123");
		expect(runtime.selectData).toHaveBeenCalledTimes(1);
		expect(runtime.update).toHaveBeenCalledTimes(1);
		expect(runtime.insert).toHaveBeenCalledTimes(0);
	});

	it("keeps warm ensureAppId calls under 5ms p95 with no extra DB work", async () => {
		const warm = await ensureAppId({
			workspaceId: "team_perf_apps",
			referer: "https://example.com/app",
		});
		expect(warm).toBe("app_123");

		runtime.selectData.mockClear();
		runtime.update.mockClear();
		runtime.insert.mockClear();

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			const result = await ensureAppId({
				workspaceId: "team_perf_apps",
				referer: "https://example.com/app",
			});
			samples.push(performance.now() - started);
			expect(result).toBe("app_123");
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][ensure-app-id] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(5);
		expect(runtime.selectData).toHaveBeenCalledTimes(0);
		expect(runtime.update).toHaveBeenCalledTimes(0);
		expect(runtime.insert).toHaveBeenCalledTimes(0);
	});
});
