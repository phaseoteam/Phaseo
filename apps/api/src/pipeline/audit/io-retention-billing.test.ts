import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	insertedEmails: [] as Array<Record<string, unknown>>,
	settingsUpdates: [] as Array<Record<string, unknown>>,
}));

const workspaceRow = {
	workspace_id: "00000000-0000-4000-8000-000000000001",
	io_logging_enabled: true,
	io_logging_retention_days: 365,
	io_logging_billing_status: "active",
	io_logging_grace_until: null,
	io_logging_last_billing_warning_at: null,
	io_logging_last_billing_warning_kind: null,
	io_logging_price_per_million_units_nanos: 0,
};

function buildSupabaseMock() {
	return {
		auth: {
			admin: {
				getUserById: vi.fn(async () => ({
					data: {
						user: {
							email: "owner@example.com",
							user_metadata: { first_name: "Ada" },
						},
					},
				})),
			},
		},
		from(table: string) {
			if (table === "workspace_settings") {
				return {
					select: () => ({
						eq: () => ({
							gt: () => ({
								order: () => ({
									limit: async () => ({
										data: [workspaceRow],
										error: null,
									}),
								}),
							}),
						}),
					}),
					update: (payload: Record<string, unknown>) => ({
						eq: async () => {
							state.settingsUpdates.push(payload);
							return { error: null };
						},
					}),
				};
			}
			if (table === "workspaces") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: {
									id: workspaceRow.workspace_id,
									name: "Acme",
									owner_user_id: "user_1",
								},
								error: null,
							}),
						}),
					}),
				};
			}
			if (table === "email_outbox") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						state.insertedEmails.push(payload);
						return { error: null };
					},
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		},
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcCalls.push({ name, args });
			if (name === "gateway_io_retention_usage_snapshot") {
				return {
					data: [{
						event_units: 1_000_000,
						billable_bytes: 64 * 1024 * 1_000_000,
						object_count: 1_000_000,
					}],
					error: null,
				};
			}
			if (name === "gateway_io_retention_charge_once") {
				return {
					data: [{
						status: "grace",
						amount_nanos: args.p_amount_nanos,
						before_balance_nanos: 0,
						after_balance_nanos: 0,
						grace_until: "2026-07-19T00:10:00.000Z",
					}],
					error: null,
				};
			}
			throw new Error(`Unexpected rpc: ${name}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		GATEWAY_IO_RETENTION_BILLING_LIMIT: "10",
		GATEWAY_IO_RETENTION_GRACE_DAYS: "14",
		GATEWAY_IO_RETENTION_PRICE_PER_MILLION_UNITS_NANOS: "0",
		GATEWAY_IO_RETENTION_PRUNE_LIMIT: "250",
	}),
	getSupabaseAdmin: () => buildSupabaseMock(),
}));

describe("runGatewayIoRetentionBillingJob", () => {
	beforeEach(() => {
		state.rpcCalls.length = 0;
		state.insertedEmails.length = 0;
		state.settingsUpdates.length = 0;
	});

	it("charges extended retention usage and queues a grace warning when credits are unavailable", async () => {
		const { runGatewayIoRetentionBillingJob } = await import("./io-retention-billing");

		const summary = await runGatewayIoRetentionBillingJob({
			asOf: new Date("2026-07-05T00:10:00.000Z"),
		});

		expect(summary).toEqual({
			processed: 1,
			charged: 0,
			grace: 1,
			suspended: 0,
			skipped: 0,
			prunedObjects: 0,
			warningsQueued: 1,
			failed: 0,
		});
		expect(state.rpcCalls[0]).toMatchObject({
			name: "gateway_io_retention_usage_snapshot",
			args: {
				p_workspace_id: workspaceRow.workspace_id,
				p_included_days: 90,
				p_event_unit_bytes: 65_536,
			},
		});
		expect(state.rpcCalls[1]).toMatchObject({
			name: "gateway_io_retention_charge_once",
			args: {
				p_workspace_id: workspaceRow.workspace_id,
				p_billing_date: "2026-07-05",
				p_event_units: 1_000_000,
				p_grace_days: 14,
			},
		});
		expect(state.rpcCalls[1]?.args.p_amount_nanos).toBe(59_501_026);
		expect(state.insertedEmails[0]).toMatchObject({
			kind: "io_retention_grace",
			template: "io_retention_grace",
			to_email: "owner@example.com",
			workspace_id: workspaceRow.workspace_id,
			payload: expect.objectContaining({
				workspace_name: "Acme",
				retention_days: 365,
				grace_until: "2026-07-19T00:10:00.000Z",
			}),
		});
		expect(state.settingsUpdates[0]).toMatchObject({
			io_logging_last_billing_warning_kind: "grace",
			io_logging_last_billing_warning_at: "2026-07-05T00:10:00.000Z",
		});
	});
});
