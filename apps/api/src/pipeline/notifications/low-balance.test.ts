import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	automationsEnabled: "true",
	insertCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
	updateCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

function buildSupabaseMock() {
	return {
		auth: {
			admin: {
				getUserById: async () => ({
					data: {
						user: {
							email: "owner@example.com",
							user_metadata: { first_name: "Ada" },
						},
					},
				}),
			},
		},
		from(table: string) {
			if (table === "workspaces") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: { id: "ws_1", name: "Research", owner_user_id: "user_1" },
								error: null,
							}),
						}),
					}),
				};
			}
			if (table === "email_outbox") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						state.insertCalls.push({ table, payload });
						return { error: null };
					},
				};
			}
			if (table === "workspace_settings") {
				return {
					update: (payload: Record<string, unknown>) => ({
						eq: async () => {
							state.updateCalls.push({ table, payload });
							return { error: null };
						},
					}),
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		RESEND_API_KEY: "resend_key",
		RESEND_ONBOARDING_AUTOMATIONS_ENABLED: state.automationsEnabled,
	}),
	getSupabaseAdmin: () => buildSupabaseMock(),
}));

describe("low-balance notifications", () => {
	beforeEach(() => {
		state.automationsEnabled = "true";
		state.insertCalls.length = 0;
		state.updateCalls.length = 0;
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("sends the Resend automation event with the expected recipient and payload", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "event_1" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const { enqueueLowBalanceEmail } = await import("./low-balance");
		await enqueueLowBalanceEmail({
			workspaceId: "ws_1",
			balanceNanos: 8_500_000_000,
			settings: {
				enabled: true,
				thresholdNanos: 10_000_000_000,
				lastSentAt: null,
				lastSentBalanceNanos: null,
			},
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.resend.com/events");
		expect(JSON.parse(String(init.body))).toMatchObject({
			event: "workspace.low_balance",
			email: "owner@example.com",
			payload: {
				firstName: "Ada",
				workspaceId: "ws_1",
				workspaceName: "Research",
				balanceUsd: 8.5,
				thresholdUsd: 10,
			},
		});
		expect(state.updateCalls).toHaveLength(1);
	});

	it("does not send again during the six-hour cooldown", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { enqueueLowBalanceEmail } = await import("./low-balance");

		await enqueueLowBalanceEmail({
			workspaceId: "ws_1",
			balanceNanos: 8_000_000_000,
			settings: {
				enabled: true,
				thresholdNanos: 10_000_000_000,
				lastSentAt: new Date().toISOString(),
				lastSentBalanceNanos: 8_500_000_000,
			},
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(state.insertCalls).toHaveLength(0);
		expect(state.updateCalls).toHaveLength(0);
	});

	it("queues the configured template when Resend Automations are disabled", async () => {
		state.automationsEnabled = "false";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { enqueueLowBalanceEmail } = await import("./low-balance");

		await enqueueLowBalanceEmail({
			workspaceId: "ws_1",
			balanceNanos: 8_500_000_000,
			settings: {
				enabled: true,
				thresholdNanos: 10_000_000_000,
				lastSentAt: null,
				lastSentBalanceNanos: null,
			},
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(state.insertCalls).toHaveLength(1);
		expect(state.insertCalls[0]?.payload).toMatchObject({
			kind: "low_balance",
			template: "low_balance",
			to_email: "owner@example.com",
			workspace_id: "ws_1",
		});
	});
});
