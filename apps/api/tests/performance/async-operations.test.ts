import { beforeEach, describe, expect, it, vi } from "vitest";

type AsyncOperationRow = {
	workspace_id: string;
	kind: "video" | "batch" | "music";
	internal_id: string;
	request_id: string | null;
	session_id: string | null;
	app_id: string | null;
	provider: string | null;
	native_id: string | null;
	model: string | null;
	status: string | null;
	meta: Record<string, unknown> | null;
	billed_at: string | null;
	created_at: string | null;
	updated_at: string | null;
};

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
	const state = {
		row: null as AsyncOperationRow | null,
	};

	const maybeSingle = vi.fn(async () => ({
		data: state.row,
		error: null,
	}));

	const upsert = vi.fn(async (payload: Record<string, unknown>) => {
		const previous = state.row;
		state.row = {
			workspace_id: String(payload.workspace_id),
			kind: payload.kind as AsyncOperationRow["kind"],
			internal_id: String(payload.internal_id),
			request_id: (payload.request_id as string | null | undefined) ?? null,
			session_id: (payload.session_id as string | null | undefined) ?? null,
			app_id: (payload.app_id as string | null | undefined) ?? null,
			provider: (payload.provider as string | null | undefined) ?? null,
			native_id: (payload.native_id as string | null | undefined) ?? null,
			model: (payload.model as string | null | undefined) ?? null,
			status: (payload.status as string | null | undefined) ?? null,
			meta: (payload.meta as Record<string, unknown> | null | undefined) ?? {},
			billed_at: previous?.billed_at ?? null,
			created_at: previous?.created_at ?? String(payload.updated_at ?? new Date().toISOString()),
			updated_at: String(payload.updated_at ?? previous?.updated_at ?? new Date().toISOString()),
		};
		return { error: null };
	});

	const supabase = {
		from: vi.fn((table: string) => {
			if (table !== "gateway_async_operations") {
				throw new Error(`Unexpected table: ${table}`);
			}

			return {
				select: vi.fn(() => {
					const query = {
						eq: vi.fn(() => query),
						maybeSingle,
					};
					return query;
				}),
				upsert,
			};
		}),
	};

	return {
		state,
		maybeSingle,
		upsert,
		supabase,
	};
});

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => runtime.supabase,
}));

const { __resetAsyncOperationCachesForTests, getAsyncOperation, upsertAsyncOperation } = await import(
	"@/core/async-operations"
);

describe("async operations warm-cache performance", () => {
	beforeEach(() => {
		runtime.state.row = {
			workspace_id: "team_async_perf",
			kind: "video",
			internal_id: "video_123",
			request_id: "req_async_123",
			session_id: "session_async_123",
			app_id: null,
			provider: "openai",
			native_id: "native_async_123",
			model: "openai/sora-2",
			status: "queued",
			meta: { provider: "openai", requestId: "req_async_123" },
			billed_at: null,
			created_at: "2026-05-05T10:00:00.000Z",
			updated_at: "2026-05-05T10:00:00.000Z",
		};
		runtime.maybeSingle.mockClear();
		runtime.upsert.mockClear();
		runtime.supabase.from.mockClear();
		__resetAsyncOperationCachesForTests();
	});

	it("deduplicates concurrent cold point reads to one Supabase lookup", async () => {
		const [a, b, c] = await Promise.all([
			getAsyncOperation("team_async_perf", "video", "video_123"),
			getAsyncOperation("team_async_perf", "video", "video_123"),
			getAsyncOperation("team_async_perf", "video", "video_123"),
		]);

		expect(a?.internalId).toBe("video_123");
		expect(b?.internalId).toBe("video_123");
		expect(c?.internalId).toBe("video_123");
		expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
	});

	it("keeps warm async-operation point reads under 5ms p95 with no extra Supabase lookups", async () => {
		const warm = await getAsyncOperation("team_async_perf", "video", "video_123");
		expect(warm?.internalId).toBe("video_123");

		runtime.maybeSingle.mockClear();

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			const result = await getAsyncOperation("team_async_perf", "video", "video_123");
			samples.push(performance.now() - started);
			expect(result?.status).toBe("queued");
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][async-operations] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(5);
		expect(runtime.maybeSingle).toHaveBeenCalledTimes(0);
	});

	it("invalidates the point-read cache after upserts so follow-up reads observe fresh state", async () => {
		const initial = await getAsyncOperation("team_async_perf", "video", "video_123");
		expect(initial?.status).toBe("queued");

		runtime.maybeSingle.mockClear();

		await upsertAsyncOperation({
			workspaceId: "team_async_perf",
			kind: "video",
			internalId: "video_123",
			requestId: "req_async_123",
			sessionId: "session_async_123",
			provider: "openai",
			nativeId: "native_async_123",
			model: "openai/sora-2",
			status: "completed",
			meta: {
				provider: "openai",
				requestId: "req_async_123",
				finalizedAt: "2026-05-05T10:01:00.000Z",
			},
		});

		const refreshed = await getAsyncOperation("team_async_perf", "video", "video_123");
		expect(refreshed?.status).toBe("completed");
		expect(refreshed?.meta.finalizedAt).toBe("2026-05-05T10:01:00.000Z");
		expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
	});
});
