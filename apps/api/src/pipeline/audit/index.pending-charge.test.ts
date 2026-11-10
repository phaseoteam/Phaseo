// A delivered request whose charge did not go through is audited as pending reconciliation. Its
// gateway_requests row must carry both the charge the database confirmed (cost_nanos, which the
// row then owns, so a debit that committed while its response was lost is not counted as 0) and the
// bill it meant to charge (expected_cost_nanos), so usage and budgets count the unpaid part.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ writes: {} as Record<string, Array<Record<string, any>>> }));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	ensureRuntimeForBackground: () => () => {},
	isLocalTestingModeEnabled: () => false,
	getSupabaseAdmin: () => ({
		rpc: async () => ({ data: "event", error: null }),
		from: (table: string) => {
			if (table === "workspace_settings") {
				return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { io_logging_enabled: false }, error: null }) }) }) };
			}
			const record = (row: Record<string, any>) => (state.writes[table] ??= []).push(row);
			return {
				insert: (row: Record<string, any>) => {
					record(row);
					return Object.assign(Promise.resolve({ error: null }), {
						select: () => ({ single: async () => ({ data: { id: "row_pending", created_at: "2026-11-06T00:00:00.000Z", workspace_id: "ws_pending" }, error: null }) }),
					});
				},
				upsert: async (row: Record<string, any>) => {
					record(row);
					return { error: null };
				},
			};
		},
	}),
}));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ fetchWorkspacePolicy: async () => ({ privacyZdrOnly: false, neverStoreContent: false }) }));
vi.mock("../after/apps", () => ({ ensureAppId: async () => "app_pending" }));

import { auditFailure } from "./index";

async function pendingRow(fields: { costNanos?: number; expectedCostNanos?: number }) {
	await auditFailure({
		stage: "execute",
		requestId: "req_pending",
		billingRequestId: "bill_pending",
		workspaceId: "ws_pending",
		keyId: "00000000-0000-4000-8000-000000000001",
		model: "openai/gpt-5-mini",
		endpoint: "chat.completions",
		provider: "openai",
		stream: true,
		statusCode: 500,
		errorCode: "gateway:stream_finalization_failed",
		...fields,
	});
	return state.writes.gateway_requests!.at(-1)!;
}

describe("the failure row of a delivered request whose charge did not go through", () => {
	beforeEach(() => { state.writes = {}; });

	it("writes the confirmed charge and the expected bill", async () => {
		expect(await pendingRow({ costNanos: 0, expectedCostNanos: 300 })).toMatchObject({
			success: false, billing_request_id: "bill_pending", cost_nanos: 0, expected_cost_nanos: 300,
		});
		// A debit that committed while every response was lost: the row owns the true charge.
		expect(await pendingRow({ costNanos: 300, expectedCostNanos: 300 })).toMatchObject({ cost_nanos: 300, expected_cost_nanos: 300 });
	});

	it("writes no expected cost for an ordinary failure", async () => {
		const row = await pendingRow({});
		expect(row).not.toHaveProperty("expected_cost_nanos");
		expect(row).not.toHaveProperty("cost_nanos");
	});
});
