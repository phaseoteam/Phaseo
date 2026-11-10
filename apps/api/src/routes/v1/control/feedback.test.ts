import { beforeEach, describe, expect, it, vi } from "vitest";

const guardManagementAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: (...args: unknown[]) => guardManagementAuthMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: unknown[]) => getSupabaseAdminMock(...args),
}));

vi.mock("@/routes/utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
	json: (data: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
		}),
}));

import {
	feedbackRoutes,
	observabilityEventsRoutes,
	presetTestRunsRoutes,
} from "./feedback";

type InsertCall = {
	table: string;
	payload: Record<string, unknown>;
};

const state = {
	insertCalls: [] as InsertCall[],
	queryCalls: [] as Array<{
		table: string;
		method: string;
		args: unknown[];
	}>,
	rpcCalls: [] as Array<{
		name: string;
		args: Record<string, unknown>;
	}>,
	feedbackSummaryRows: [] as Array<Record<string, unknown>>,
	feedbackSummaryRpcRows: [] as Array<Record<string, unknown>>,
	testRunRow: {
		id: "66666666-6666-4666-8666-666666666666",
		preset_id: "55555555-5555-4555-8555-555555555555",
		baseline_preset_id: null,
	} as Record<string, unknown> | null,
	visiblePresetRows: [{ id: "55555555-5555-4555-8555-555555555555" }] as Array<Record<string, unknown>>,
};

function buildSelectChain(
	table: string,
	result: { data: unknown; error: null },
) {
	const chain: any = {
		eq: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "eq", args });
			return chain;
		}),
		is: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "is", args });
			return chain;
		}),
		neq: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "neq", args });
			return chain;
		}),
		or: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "or", args });
			return chain;
		}),
		contains: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "contains", args });
			return chain;
		}),
		gte: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "gte", args });
			return chain;
		}),
		lte: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "lte", args });
			return chain;
		}),
		not: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "not", args });
			return chain;
		}),
		order: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "order", args });
			return chain;
		}),
		limit: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "limit", args });
			return chain;
		}),
		range: vi.fn((...args: unknown[]) => {
			state.queryCalls.push({ table, method: "range", args });
			return chain;
		}),
		maybeSingle: vi.fn(async () => result),
		then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
	};
	return chain;
}

function buildSupabaseMock() {
	return {
		rpc(name: string, args: Record<string, unknown>) {
			state.rpcCalls.push({ name, args });
			if (name !== "gateway_feedback_summary") {
				throw new Error(`Unexpected RPC: ${name}`);
			}
			return Promise.resolve({
				data: state.feedbackSummaryRpcRows,
				error: null,
			});
		},
		from(table: string) {
			if (table === "gateway_feedback") {
				return {
					insert: (payload: Record<string, unknown>) => {
						state.insertCalls.push({ table, payload });
						return {
							select: () => ({
								maybeSingle: async () => ({
									data: {
										id: "11111111-1111-4111-8111-111111111111",
										...payload,
										created_at: "2026-07-05T10:00:00.000Z",
									},
									error: null,
								}),
							}),
						};
					},
					select: () => buildSelectChain(table, {
						data: state.feedbackSummaryRows,
						error: null,
					}),
				};
			}
			if (table === "gateway_requests") {
				return {
					select: () => buildSelectChain(table, {
						data: { id: "99999999-9999-4999-8999-999999999999" },
						error: null,
					}),
				};
			}
			if (table === "presets") {
				return {
					select: () => buildSelectChain(table, {
						data: state.visiblePresetRows,
						error: null,
					}),
				};
			}
			if (table === "gateway_preset_test_runs") {
				return {
					select: () => buildSelectChain(table, {
						data: state.testRunRow,
						error: null,
					}),
				};
			}
			if (table === "gateway_observability_events") {
				return {
					insert: (payload: Record<string, unknown>) => {
						state.insertCalls.push({ table, payload });
						return {
							select: () => ({
								maybeSingle: async () => ({
									data: {
										id: "22222222-2222-4222-8222-222222222222",
										...payload,
										created_at: "2026-07-05T10:00:00.000Z",
									},
									error: null,
								}),
							}),
						};
					},
					select: () => buildSelectChain(table, { data: [], error: null }),
				};
			}
			// The management key acts as its creator, an admin of the workspace.
			if (table === "workspace_members") {
				return { select: () => buildSelectChain(table, { data: { role: "admin" }, error: null }) };
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

describe("feedback control routes", () => {
	beforeEach(() => {
		state.insertCalls.length = 0;
		state.queryCalls.length = 0;
		state.rpcCalls.length = 0;
		state.feedbackSummaryRows = [];
		state.feedbackSummaryRpcRows = [];
		state.testRunRow = {
			id: "66666666-6666-4666-8666-666666666666",
			preset_id: "55555555-5555-4555-8555-555555555555",
			baseline_preset_id: null,
		};
		state.visiblePresetRows = [{ id: "55555555-5555-4555-8555-555555555555" }];
		guardManagementAuthMock.mockReset();
		getSupabaseAdminMock.mockReset();
		guardManagementAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "33333333-3333-4333-8333-333333333333",
				userId: "44444444-4444-4444-8444-444444444444",
				authMethod: "api_key",
				scopes: [],
			},
		});
		getSupabaseAdminMock.mockReturnValue(buildSupabaseMock());
	});

	it("rejects writes when a scoped API key is missing feedback write capability", async () => {
		guardManagementAuthMock.mockResolvedValueOnce({
			ok: true,
			value: {
				workspaceId: "33333333-3333-4333-8333-333333333333",
				userId: "44444444-4444-4444-8444-444444444444",
				authMethod: "api_key",
				scopes: ["feedback:read"],
			},
		});

		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				rating: "correct",
			}),
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: "insufficient_scope",
			message: "Token requires feedback:write",
		});
		expect(state.insertCalls).toHaveLength(0);
	});

	it("creates feedback linked to a gateway request", async () => {
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				rating: "thumbs_down",
				reason: "incorrect",
				reasonTags: ["wrong_fact"],
				score: 0.2,
				comment: "The answer cited the wrong policy.",
				metadata: {
					user_tier: "pro",
					user: { id: "external-user-123" },
				},
			}),
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			data: expect.objectContaining({
				request_id: "gen_123",
				rating: "thumbs_down",
				score: 0.2,
				reason_tags: ["wrong_fact"],
			}),
		});
		expect(state.insertCalls[0]).toMatchObject({
			table: "gateway_feedback",
			payload: expect.objectContaining({
				workspace_id: "33333333-3333-4333-8333-333333333333",
				request_id: "gen_123",
				metadata_dimensions: {
					user_tier: "pro",
				},
				created_by_user_id: "44444444-4444-4444-8444-444444444444",
			}),
		});
		expect(state.queryCalls).toContainEqual({
			table: "gateway_requests",
			method: "eq",
			args: ["workspace_id", "33333333-3333-4333-8333-333333333333"],
		});
	});

	it("hides another user's private preset from feedback writes", async () => {
		state.visiblePresetRows = [];
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				presetId: "55555555-5555-4555-8555-555555555555",
				rating: "correct",
			}),
		});

		expect(response.status).toBe(404);
		expect(state.insertCalls).toHaveLength(0);
	});

	it("rejects unsupported feedback ratings before database insertion", async () => {
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				rating: "mostly_good",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "bad_request",
			message: "Unsupported feedback rating",
		});
		expect(state.insertCalls).toHaveLength(0);
	});

	it("rejects invalid feedback scores before database insertion", async () => {
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ requestId: "gen_123", score: 5 }),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: "bad_request" });
		expect(state.insertCalls).toHaveLength(0);
	});

	it("rejects malformed optional preset identifiers instead of silently dropping them", async () => {
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				presetId: "not-a-uuid",
				rating: "correct",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "bad_request",
			message: "Invalid preset or test run id",
		});
		expect(state.insertCalls).toHaveLength(0);
	});

	it("rejects unsupported test run statuses before database insertion", async () => {
		const response = await presetTestRunsRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				presetId: "55555555-5555-4555-8555-555555555555",
				status: "queued_forever",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "bad_request",
			message: "Unsupported test run status",
		});
		expect(state.insertCalls).toHaveLength(0);
	});

	it("links feedback to the test run preset when only the test run is supplied", async () => {
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				testRunId: "66666666-6666-4666-8666-666666666666",
				rating: "correct",
				score: 1,
			}),
		});

		expect(response.status).toBe(201);
		expect(state.insertCalls[0]).toMatchObject({
			table: "gateway_feedback",
			payload: expect.objectContaining({
				preset_id: "55555555-5555-4555-8555-555555555555",
				test_run_id: "66666666-6666-4666-8666-666666666666",
			}),
		});
	});

	it("creates custom outcome events linked to a request", async () => {
		const response = await observabilityEventsRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				category: "outcome",
				event: "ticket_resolved",
				value: true,
				numericValue: 1,
			}),
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			data: expect.objectContaining({
				request_id: "gen_123",
				category: "outcome",
				event_name: "ticket_resolved",
				numeric_value: 1,
			}),
		});
	});

	it("rejects feedback when preset and test run do not match", async () => {
		state.visiblePresetRows.push({ id: "77777777-7777-4777-8777-777777777777" });
		const response = await feedbackRoutes.request("https://api.example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requestId: "gen_123",
				presetId: "77777777-7777-4777-8777-777777777777",
				testRunId: "66666666-6666-4666-8666-666666666666",
				rating: "correct",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "bad_request",
			message: "Preset does not belong to the supplied test run",
		});
		expect(state.insertCalls).toHaveLength(0);
	});

	it("summarizes all matching feedback through the SQL RPC", async () => {
		state.feedbackSummaryRpcRows = [
			{
				group_value: "55555555-5555-4555-8555-555555555555",
				count: 2,
				positive: 1,
				negative: 0,
				partial: 1,
				average_score: 0.75,
				ratings: { correct: 1, partly_correct: 1 },
				last_feedback_at: "2026-07-05T10:00:00.000Z",
			},
		];

		const response = await feedbackRoutes.request("https://api.example.com/summary?group_by=preset");

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			group_by: "preset_id",
			data: [
				expect.objectContaining({
					preset_id: "55555555-5555-4555-8555-555555555555",
					count: 2,
					positive: 1,
					partial: 1,
					average_score: 0.75,
					ratings: { correct: 1, partly_correct: 1 },
				}),
			],
		});
		expect(state.rpcCalls).toEqual([
			expect.objectContaining({
				name: "gateway_feedback_summary",
				args: expect.objectContaining({
					p_workspace_id: "33333333-3333-4333-8333-333333333333",
					p_visible_preset_ids: ["55555555-5555-4555-8555-555555555555"],
					p_group_by: "preset_id",
					p_limit: 5000,
				}),
			}),
		]);
		expect(state.queryCalls.some((call) => call.table === "presets" && call.method === "or")).toBe(true);
	});
	it("passes date and target filters to the summary RPC", async () => {
		const response = await feedbackRoutes.request(
			"https://api.example.com/summary?group_by=preset&request_id=gen_123&since=2026-07-01T00:00:00.000Z&until=2026-07-06T00:00:00.000Z",
		);

		expect(response.status).toBe(200);
		expect(state.rpcCalls[0]).toEqual(
			expect.objectContaining({
				name: "gateway_feedback_summary",
				args: expect.objectContaining({
					p_request_id: "gen_123",
					p_created_since: "2026-07-01T00:00:00.000Z",
					p_created_until: "2026-07-06T00:00:00.000Z",
				}),
			}),
		);
	});

	it("rejects malformed summary filters", async () => {
		const invalidDate = await feedbackRoutes.request("https://api.example.com/summary?since=yesterday");
		expect(invalidDate.status).toBe(400);

		const invalidGrouping = await feedbackRoutes.request("https://api.example.com/summary?group_by=creator");
		expect(invalidGrouping.status).toBe(400);

		const invalidPreset = await feedbackRoutes.request("https://api.example.com/summary?preset_id=not-a-uuid");
		expect(invalidPreset.status).toBe(400);
		expect(state.rpcCalls).toHaveLength(0);
	});
	it("applies metadata dimension filters when listing feedback", async () => {
		state.feedbackSummaryRows = [
			{
				id: "11111111-1111-4111-8111-111111111111",
				workspace_id: "33333333-3333-4333-8333-333333333333",
				request_id: "gen_123",
				session_id: "session_123",
				preset_id: "55555555-5555-4555-8555-555555555555",
				test_run_id: "66666666-6666-4666-8666-666666666666",
				source: "api",
				rating: "correct",
				score: 1,
				reason: null,
				reason_tags: [],
				comment: null,
				metadata: {},
				metadata_dimensions: { user_tier: "pro" },
				end_user_id: null,
				created_by_user_id: "44444444-4444-4444-8444-444444444444",
				created_at: "2026-07-05T10:00:00.000Z",
			},
		];

		const response = await feedbackRoutes.request(
			"https://api.example.com/?metadata.user_tier=pro&rating=correct",
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: [
				expect.objectContaining({
					rating: "correct",
					metadata_dimensions: { user_tier: "pro" },
				}),
			],
		});
		expect(state.queryCalls).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: "gateway_feedback",
					method: "contains",
					args: ["metadata_dimensions", { user_tier: "pro" }],
				}),
				expect.objectContaining({
					table: "gateway_feedback",
					method: "eq",
					args: ["rating", "correct"],
				}),
			]),
		);
	});

	it("filters unrated feedback with a null rating and rejects unknown ratings", async () => {
		const unrated = await feedbackRoutes.request("https://api.example.com/?rating=unrated");
		expect(unrated.status).toBe(200);
		expect(state.queryCalls).toContainEqual({
			table: "gateway_feedback",
			method: "is",
			args: ["rating", null],
		});

		state.queryCalls.length = 0;
		const invalid = await feedbackRoutes.request("https://api.example.com/?rating=mostly_good");
		expect(invalid.status).toBe(400);
		await expect(invalid.json()).resolves.toMatchObject({
			error: "bad_request",
			message: "Unsupported feedback rating",
		});
	});

	it("summarizes feedback by indexed metadata dimensions in SQL", async () => {
		state.feedbackSummaryRpcRows = [
			{
				group_value: "free",
				count: 1,
				positive: 0,
				negative: 1,
				partial: 0,
				average_score: 0,
				ratings: { thumbs_down: 1 },
				last_feedback_at: "2026-07-05T10:00:00.000Z",
			},
			{
				group_value: "pro",
				count: 2,
				positive: 1,
				negative: 0,
				partial: 1,
				average_score: 0.75,
				ratings: { correct: 1, partly_correct: 1 },
				last_feedback_at: "2026-07-05T09:00:00.000Z",
			},
		];

		const response = await feedbackRoutes.request(
			"https://api.example.com/summary?group_by=metadata&metadata_key=user_tier&metadata.region=ca",
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			group_by: "metadata",
			data: expect.arrayContaining([
				expect.objectContaining({
					metadata_key: "user_tier",
					metadata_value: "free",
					count: 1,
					negative: 1,
					average_score: 0,
				}),
				expect.objectContaining({
					metadata_key: "user_tier",
					metadata_value: "pro",
					count: 2,
					positive: 1,
					partial: 1,
					average_score: 0.75,
				}),
			]),
		});
		expect(state.rpcCalls[0]?.args).toEqual(
			expect.objectContaining({
				p_group_by: "metadata",
				p_metadata_key: "user_tier",
				p_metadata_filters: { region: "ca" },
			}),
		);
	});

});
