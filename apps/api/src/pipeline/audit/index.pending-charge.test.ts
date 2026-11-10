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

import { auditFailure, auditSuccess } from "./index";

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

describe("the success row of a delivered request whose charge did not go through", () => {
	beforeEach(() => { state.writes = {}; });

	async function successRow(pendingCharge?: { costNanos: number | null; expectedCostNanos: number }) {
		await auditSuccess({
			requestId: "req_pending_success",
			billingRequestId: "bill_pending_success",
			workspaceId: "ws_pending",
			keyId: "00000000-0000-4000-8000-000000000001",
			provider: "openai",
			model: "openai/gpt-5-mini",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			usagePriced: { input_tokens: 10, output_tokens: 20 },
			totalCents: 0.03,
			totalNanos: 300,
			currency: "USD",
			statusCode: 200,
			...(pendingCharge ? { pendingCharge } : {}),
		} as Parameters<typeof auditSuccess>[0]);
		return state.writes.gateway_requests!.at(-1)!;
	}

	it("stays a success with its status, the stored charge and the expected bill", async () => {
		expect(await successRow({ costNanos: 0, expectedCostNanos: 300 })).toMatchObject({
			success: true, status_code: 200, billing_request_id: "bill_pending_success", cost_nanos: 0, expected_cost_nanos: 300,
		});
		// The stored total could not be read: the row records no charge, only the expected bill.
		const unread = await successRow({ costNanos: null, expectedCostNanos: 300 });
		expect(unread).toMatchObject({ success: true, expected_cost_nanos: 300 });
		expect(unread).not.toHaveProperty("cost_nanos");
	});

	it("writes the bill and no expected cost for an ordinary success", async () => {
		const row = await successRow();
		expect(row).toMatchObject({ success: true, cost_nanos: 300 });
		expect(row).not.toHaveProperty("expected_cost_nanos");
	});
});
