import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { dedupeSeenModelRows, fetchPreviousModelsByProviders, markPendingModelRemovals } from "./index";

type SeenModelRow = {
	provider_id: string;
	model_id: string;
	watch_snapshot?: unknown;
	removal_pending?: boolean;
};

function buildPagedSupabase(rows: SeenModelRow[]) {
	const ranges: Array<[number, number]> = [];
	const query = {
		select: vi.fn(() => query),
		in: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn(async (from: number, to: number) => {
			ranges.push([from, to]);
			return { data: rows.slice(from, to + 1), error: null };
		}),
	};
	return {
		ranges,
		client: { from: vi.fn(() => query) },
	};
}

describe("fetchPreviousModelsByProviders", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
	});

	it("loads every page when a shard has more than 1,000 stored models", async () => {
		const rows = Array.from({ length: 1_093 }, (_, index) => ({
			provider_id: "large-provider",
			model_id: `model-${index.toString().padStart(4, "0")}`,
			watch_snapshot: { contextLength: null, maxCompletionTokens: null, pricingDetails: null, pricingFingerprint: null },
		}));
		const supabase = buildPagedSupabase(rows);
		getSupabaseAdminMock.mockReturnValue(supabase.client);

		const state = await fetchPreviousModelsByProviders(["large-provider"]);

		expect(state.byProvider.get("large-provider")?.modelIds).toHaveLength(1_093);
		expect(supabase.ranges).toEqual([[0, 999], [1_000, 1_999]]);
	});

	it("requests an empty final page when the row count is an exact page multiple", async () => {
		const rows = Array.from({ length: 1_000 }, (_, index) => ({
			provider_id: "exact-provider",
			model_id: `model-${index.toString().padStart(4, "0")}`,
			watch_snapshot: null,
		}));
		const supabase = buildPagedSupabase(rows);
		getSupabaseAdminMock.mockReturnValue(supabase.client);

		const state = await fetchPreviousModelsByProviders(["exact-provider"]);

		expect(state.byProvider.get("exact-provider")?.modelIds).toHaveLength(1_000);
		expect(supabase.ranges).toEqual([[0, 999], [1_000, 1_999]]);
	});

	it("loads provisional removals with the provider snapshot", async () => {
		const supabase = buildPagedSupabase([{
			provider_id: "provider",
			model_id: "occasionally-missing-model",
			watch_snapshot: null,
			removal_pending: true,
		}]);
		getSupabaseAdminMock.mockReturnValue(supabase.client);

		const state = await fetchPreviousModelsByProviders(["provider"]);

		expect(state.byProvider.get("provider")?.pendingRemovalIds).toEqual(
			new Set(["occasionally-missing-model"]),
		);
	});
});

describe("dedupeSeenModelRows", () => {
	function seenRow(providerId: string, modelId: string, contextLength: number | null = null) {
		return {
			provider_id: providerId,
			provider_name: providerId,
			model_id: modelId,
			watch_snapshot: { contextLength, maxCompletionTokens: null, pricingDetails: null, pricingFingerprint: null },
			model_details: null,
			pricing_details: null,
			last_seen_at: "2026-10-09T11:05:00.000Z",
			last_run_id: "run-1",
			removal_pending: false,
		};
	}

	it("keeps one row per provider and model so ON CONFLICT never sees a key twice", () => {
		const rows = [
			seenRow("empiriolabs", "model-a", 1_000),
			seenRow("empiriolabs", "model-b"),
			seenRow("empiriolabs", "model-a", 2_000),
			seenRow("other", "model-a"),
		];

		const deduped = dedupeSeenModelRows(rows);

		expect(deduped.map((row) => [row.provider_id, row.model_id])).toEqual([
			["empiriolabs", "model-a"],
			["empiriolabs", "model-b"],
			["other", "model-a"],
		]);
		// First occurrence wins, so the result does not depend on the later duplicate.
		expect(deduped[0]?.watch_snapshot.contextLength).toBe(1_000);
	});

	it("reports each dropped duplicate so the source provider can be logged", () => {
		const dropped: string[] = [];

		dedupeSeenModelRows(
			[
				seenRow("empiriolabs", "model-a"),
				seenRow("empiriolabs", "model-a"),
				seenRow("empiriolabs", "model-b"),
				seenRow("empiriolabs", "model-b"),
				seenRow("other", "model-a"),
			],
			(row) => dropped.push(`${row.provider_id}/${row.model_id}`),
		);

		expect(dropped).toEqual(["empiriolabs/model-a", "empiriolabs/model-b"]);
	});

	it("does not call the duplicate callback when every key is unique", () => {
		const onDuplicate = vi.fn();

		dedupeSeenModelRows([seenRow("a", "m1"), seenRow("a", "m2"), seenRow("b", "m1")], onDuplicate);

		expect(onDuplicate).not.toHaveBeenCalled();
	});

	it("treats case and whitespace variants as distinct keys, matching the primary key", () => {
		const deduped = dedupeSeenModelRows([
			seenRow("provider", "Model-A"),
			seenRow("provider", "model-a"),
			seenRow("provider", "model-a "),
		]);

		expect(deduped).toHaveLength(3);
	});
});

describe("markPendingModelRemovals", () => {
	it("refreshes retention while marking the first missing check", async () => {
		const query = {
			update: vi.fn(() => query),
			eq: vi.fn(() => query),
			in: vi.fn(async () => ({ error: null })),
		};
		getSupabaseAdminMock.mockReturnValue({ from: vi.fn(() => query) });

		await markPendingModelRemovals([{
			provider_id: "provider",
			model_id: "temporarily-missing-model",
		}]);

		expect(query.update).toHaveBeenCalledWith({
			removal_pending: true,
			last_seen_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
		});
	});
});
