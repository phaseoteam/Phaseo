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
	feedbackSummaryRows: [] as Array<Record<string, unknown>>,
	testRunRow: {
		id: "66666666-6666-4666-8666-666666666666",
		preset_id: "55555555-5555-4555-8555-555555555555",
		baseline_preset_id: null,
	} as Record<string, unknown> | null,
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
						data: { id: "55555555-5555-4555-8555-555555555555" },
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
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

describe("feedback control routes", () => {
	beforeEach(() => {
		state.insertCalls.length = 0;
		state.queryCalls.length = 0;
		state.feedbackSummaryRows = [];
		state.testRunRow = {
			id: "66666666-6666-4666-8666-666666666666",
			preset_id: "55555555-5555-4555-8555-555555555555",
			baseline_preset_id: null,
		};
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

	it("summarizes feedback by preset for comparison views", async () => {
		state.feedbackSummaryRows = [
			{
				preset_id: "55555555-5555-4555-8555-555555555555",
				rating: "correct",
				score: 1,
				created_at: "2026-07-05T10:00:00.000Z",
			},
			{
				preset_id: "55555555-5555-4555-8555-555555555555",
				rating: "partly_correct",
				score: 0.5,
				created_at: "2026-07-05T09:00:00.000Z",
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
				}),
			],
		});
	});

	it("applies date filters when summarizing preset feedback", async () => {
		const response = await feedbackRoutes.request(
			"https://api.example.com/summary?group_by=preset&since=2026-07-01T00:00:00.000Z&until=2026-07-06T00:00:00.000Z",
		);

		expect(response.status).toBe(200);
		expect(state.queryCalls).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: "gateway_feedback",
					method: "gte",
					args: ["created_at", "2026-07-01T00:00:00.000Z"],
				}),
				expect.objectContaining({
					table: "gateway_feedback",
					method: "lte",
					args: ["created_at", "2026-07-06T00:00:00.000Z"],
				}),
			]),
		);
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

	it("summarizes feedback by indexed metadata dimensions", async () => {
		state.feedbackSummaryRows = [
			{
				metadata_dimensions: { user_tier: "free" },
				rating: "thumbs_down",
				score: 0,
				created_at: "2026-07-05T10:00:00.000Z",
			},
			{
				metadata_dimensions: { user_tier: "pro" },
				rating: "correct",
				score: 1,
				created_at: "2026-07-05T09:00:00.000Z",
			},
			{
				metadata_dimensions: { user_tier: "pro" },
				rating: "partly_correct",
				score: 0.5,
				created_at: "2026-07-05T08:00:00.000Z",
			},
		];

		const response = await feedbackRoutes.request("https://api.example.com/summary?group_by=metadata&metadata_key=user_tier");

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
	});
});
