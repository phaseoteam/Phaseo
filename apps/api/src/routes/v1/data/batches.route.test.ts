import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	authResult: {
		ok: true as const,
		workspaceId: "ws_batch_test",
		apiKeyId: "key_batch_test",
		apiKeyRef: "kid_batch_test",
		apiKeyKid: "batch_test_kid",
		userId: null,
		internal: false,
	},
	batchMeta: new Map<string, Record<string, unknown>>(),
	fileMeta: new Map<string, Record<string, unknown>>(),
	webhookEvents: [] as Array<Record<string, unknown>>,
	finalizeCalls: [] as Array<Record<string, unknown>>,
	finalizeResult: null as Record<string, unknown> | null,
	finalizeError: null as Error | null,
	operationLog: [] as string[],
	batchMetaError: null as Error | null,
	reservationCalls: [] as Array<Record<string, unknown>>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	reservationError: null as Error | null,
	reservationResult: null as Record<string, unknown> | null,
	batchRecords: [] as Array<Record<string, unknown>>,
	catalogue: [] as Array<Record<string, unknown>>,
	fetchCalls: [] as Array<{
		url: string;
		method: string;
		bodyText: string | null;
		bodyJson: any;
		headers: Record<string, string>;
	}>,
}));

function resetState() {
	state.batchMeta.clear();
	state.fileMeta.clear();
	state.webhookEvents = [];
	state.finalizeCalls = [];
	state.finalizeResult = null;
	state.finalizeError = null;
	state.operationLog = [];
	state.batchMetaError = null;
	state.reservationCalls = [];
	state.releaseCalls = [];
	state.reservationError = null;
	state.reservationResult = null;
	state.batchRecords = [];
	state.catalogue = [];
	state.fetchCalls = [];
}

function batchKey(workspaceId: string, batchId: string) {
	return `${workspaceId}:${batchId}`;
}

function fileKey(workspaceId: string, fileId: string) {
	return `${workspaceId}:${fileId}`;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

vi.mock("@pipeline/before/auth", () => ({
	authenticate: vi.fn(async () => state.authResult),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://api.openai.example/v1",
	}),
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: vi.fn(() => ({ key: "test-openai-key" })),
}));

vi.mock("@core/async-notifications", () => ({
	buildAsyncWebSocketUrl: vi.fn((_baseUrl: string, kind: string, id: string) => `wss://example.com/v1/async/${kind}/${id}/ws`),
	dispatchAsyncWebhookEventInBackground: vi.fn((payload: Record<string, unknown>) => {
		state.webhookEvents.push(payload);
		state.operationLog.push(`webhook:${String(payload.phase)}`);
	}),
	parseAsyncWebhookConfig: vi.fn((_kind: string, webhook: Record<string, unknown>) => webhook),
	toAsyncLifecycleStatus: vi.fn((status: string) => {
		switch (String(status ?? "").toLowerCase()) {
			case "completed":
				return "completed";
			case "failed":
				return "failed";
			case "expired":
				return "expired";
			case "cancelled":
			case "canceled":
				return "cancelled";
			case "processing":
			case "in_progress":
			case "running":
				return "running";
			default:
				return "pending";
		}
	}),
	buildPublicAsyncWebhook: vi.fn((_kind: string, meta: Record<string, unknown>) => ({
		url: (meta.webhook as any)?.url ?? null,
		events: Array.isArray((meta.webhook as any)?.events) ? (meta.webhook as any).events : [],
		has_secret: typeof (meta.webhook as any)?.secret === "string" && (meta.webhook as any).secret.length > 0,
		delivery: {
			total_attempts: 0,
			delivered_events: 0,
			delivered_event_types: [],
			pending_retries: 0,
			next_retry_at: null,
			last_attempt_at: null,
			last_attempt_status: null,
			last_response_status: null,
			last_delivered_at: null,
			last_failure_at: null,
			last_error_message: null,
		},
		attempts: [],
	})),
}));

vi.mock("@core/batch-jobs", () => ({
	saveBatchJobMeta: vi.fn(async (workspaceId: string, batchId: string, meta: Record<string, unknown>) => {
		if (state.batchMetaError) throw state.batchMetaError;
		state.batchMeta.set(batchKey(workspaceId, batchId), { ...meta });
		state.operationLog.push(`save:${batchId}:${String(meta.status ?? "")}`);
	}),
	getBatchJobMeta: vi.fn(async (workspaceId: string, batchId: string) => {
		return state.batchMeta.get(batchKey(workspaceId, batchId)) ?? null;
	}),
	listTeamBatchJobs: vi.fn(async (args: Record<string, unknown>) => {
		const statuses = Array.isArray(args.statuses) ? args.statuses.map((value) => String(value)) : null;
		return state.batchRecords.filter((record) => {
			if (record.workspaceId !== args.workspaceId) return false;
			if (!statuses) return true;
			const status = String(record.status ?? (record.meta as any)?.status ?? "");
			return statuses.includes(status);
		});
	}),
	saveBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string, meta: Record<string, unknown>) => {
		state.fileMeta.set(fileKey(workspaceId, fileId), { ...meta });
	}),
}));

vi.mock("@core/batch-finalization", () => ({
	finalizeBatchJob: vi.fn(async (args: Record<string, unknown>) => {
		state.finalizeCalls.push(args);
		state.operationLog.push(`finalize:${String(args.status)}`);
		if (state.finalizeError) throw state.finalizeError;
		if (state.finalizeResult) return state.finalizeResult;
		return {
			status: String(args.status ?? ""),
			charged: false,
			billed: true,
			reason: "test",
		};
	}),
}));

vi.mock("@core/batch-reservations", () => ({
	reserveBatchCredits: vi.fn(async (args: Record<string, unknown>) => {
		if (state.reservationError) {
			throw state.reservationError;
		}
		state.reservationCalls.push(args);
		if (state.reservationResult) {
			return state.reservationResult;
		}
		return {
			reservationId: `batch_hold:${String(args.batchId)}`,
			held: true,
			amountNanos: 123_000_000,
			status: "held",
			estimatedUsage: {
				requests: 1,
				input_text_tokens: 12,
				output_text_tokens: 256,
				total_tokens: 268,
				estimated: true,
				pricing: { total_nanos: 123_000_000 },
			},
		};
	}),
}));

vi.mock("@core/wallet-reservations", () => ({
	releaseWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.releaseCalls.push(args);
		return {
			status: "released",
			applied: true,
			alreadyApplied: false,
			amountNanos: 123_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
}));

vi.mock("../control/models.catalogue", () => ({
	fetchCatalogue: vi.fn(async () => state.catalogue),
}));

vi.mock("../../utils", () => ({
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("batchRoutes", () => {
	beforeEach(() => {
		resetState();
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	it("decorates settled batch payloads with fallback pricing lines when priced usage lines are empty", async () => {
		const { decorateBatchPayload } = await import("./batches");

		const payload = decorateBatchPayload({
			requestUrl: "https://example.com/batches/batch_empty_lines",
			payload: { id: "batch_empty_lines", status: "completed" },
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/images/generations",
				costNanos: 500_000_000,
				costUsd: 0.5,
				pricedUsage: {
					requests: 1,
					output_image: 2,
					pricing: { total_nanos: 500_000_000, lines: [] },
				},
				requestCounts: { total: 1, completed: 1, failed: 0 },
			} as any,
		});

		expect(payload).toMatchObject({
			id: "batch_empty_lines",
			pricing_lines: [
				{
					dimension: "batch_requests",
					pricing_plan: "batch",
					service_tier: "batch",
					endpoint: "/v1/images/generations",
					units: 1,
					total_nanos: 500_000_000,
					total_usd_str: "0.500000000",
				},
			],
			billing: { state: "settled", total_nanos: 500_000_000 },
		});
	});

	it("decorates in-progress batch payloads with request-count progress", async () => {
		const { decorateBatchPayload } = await import("./batches");

		const payload = decorateBatchPayload({
			requestUrl: "https://example.com/batches/batch_progress_counts",
			payload: { id: "batch_progress_counts", status: "in_progress" },
			meta: {
				provider: "openai",
				status: "in_progress",
				requestCounts: { total: 10, completed: 4, failed: 1 },
			} as any,
		});

		expect(payload).toMatchObject({
			id: "batch_progress_counts",
			status: "in_progress",
			lifecycle_status: "running",
			progress: 50,
		});
	});

	it("keeps completed batches settled when a mismatched hold was released and charged", async () => {
		const { decorateBatchPayload } = await import("./batches");

		const payload = decorateBatchPayload({
			requestUrl: "https://example.com/batches/batch_released_charged",
			payload: { id: "batch_released_charged", status: "completed" },
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				reservationId: "batch_hold:req_released_charged",
				reservationStatus: "released_and_charged_actual",
				reservedNanos: 1_000_000_000,
				costNanos: 750_000_000,
				costUsd: 0.75,
				charged: true,
				billingReason: "charged:released_and_charged_actual",
				finalizedAt: "2026-06-10T10:05:00.000Z",
				estimatedUsage: {
					requests: 1,
					pricing: {
						total_nanos: 1_000_000_000,
					},
				},
			} as any,
		});

		expect(payload).toMatchObject({
			id: "batch_released_charged",
			status: "completed",
			billing: {
				state: "settled",
				billed: true,
				charged: true,
				reason: "charged:released_and_charged_actual",
				reservation_id: "batch_hold:req_released_charged",
				reservation_status: "released_and_charged_actual",
				estimated_nanos: 1_000_000_000,
				reserved_nanos: 1_000_000_000,
				total_nanos: 750_000_000,
				cost_nanos: 750_000_000,
				settled_user_cost: "0.75",
				finalized_at: "2026-06-10T10:05:00.000Z",
			},
		});
	});

	it("lists owned persisted batches without proxying the shared upstream batch list", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for local batch listing");
			}),
		);
		state.batchRecords = [
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_list_1",
				requestId: "req_batch_list_1",
				sessionId: "session_list_1",
				appId: null,
				nativeId: "batch_native_list_1",
				provider: "openai",
				model: "openai/gpt-5-mini",
				status: "in_progress",
				billedAt: null,
				createdAt: "2026-06-10T20:00:00.000Z",
				updatedAt: "2026-06-10T20:01:00.000Z",
				meta: {
					provider: "openai",
					requestId: "req_batch_list_1",
					sessionId: "session_list_1",
					status: "in_progress",
					nativeBatchId: "batch_native_list_1",
					endpoint: "/v1/responses",
					inputFileId: "file_batch_list_input",
					reservationId: "batch_hold:req_batch_list_1",
					reservedNanos: 222_000_000,
					reservationStatus: "held",
					estimatedUsage: {
						pricing: { total_nanos: 222_000_000 },
					},
					webhook: {
						url: "https://example.com/hooks/batch-list",
						events: ["job.completed"],
					},
				},
			},
			{
				workspaceId: "other_workspace",
				batchId: "batch_other",
				status: "completed",
				meta: { provider: "openai" },
			},
		];

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/?limit=5&status=in_progress", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			object: "list",
			first_id: "batch_list_1",
			last_id: "batch_list_1",
			has_more: false,
			data: [
				{
					id: "batch_list_1",
					native_batch_id: "batch_native_list_1",
					object: "batch",
					status: "in_progress",
					lifecycle_status: "running",
					polling_url: "https://example.com/batch_list_1",
					cancel_url: "https://example.com/batch_list_1/cancel",
					request_id: "req_batch_list_1",
					provider: "openai",
					session_id: "session_list_1",
					input_file_id: "file_batch_list_input",
					webhook: {
						url: "https://example.com/hooks/batch-list",
						events: ["job.completed"],
						has_secret: false,
					},
					billing: {
						state: "estimated",
						reservation_id: "batch_hold:req_batch_list_1",
						reservation_status: "held",
						estimated_provider_cost: "0.22",
						estimated_user_cost: "0.22",
						estimated_nanos: 222_000_000,
						reserved_nanos: 222_000_000,
					},
				},
			],
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("accepts expired as an explicit persisted batch list filter", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for local batch listing");
			}),
		);
		state.batchRecords = [
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_expired_list_1",
				status: "expired",
				createdAt: "2026-06-10T20:00:00.000Z",
				updatedAt: "2026-06-10T20:01:00.000Z",
				meta: {
					provider: "openai",
					status: "expired",
					endpoint: "/v1/responses",
					reservationId: "batch_hold:req_expired_list_1",
					reservationStatus: "released_terminal_expired",
				},
			},
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_failed_list_1",
				status: "failed",
				createdAt: "2026-06-10T20:02:00.000Z",
				updatedAt: "2026-06-10T20:03:00.000Z",
				meta: {
					provider: "openai",
					status: "failed",
				},
			},
		];

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/?status=expired", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			object: "list",
			first_id: "batch_expired_list_1",
			last_id: "batch_expired_list_1",
			data: [
				{
					id: "batch_expired_list_1",
					status: "expired",
					lifecycle_status: "expired",
					cancel_url: null,
					billing: {
						state: "void",
						reservation_status: "released_terminal_expired",
						settled_provider_cost: "0.00",
						settled_user_cost: "0.00",
					},
				},
			],
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("keeps failed and expired batch list filters distinct", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for local batch listing");
			}),
		);
		state.batchRecords = [
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_failed_list_1",
				status: "failed",
				createdAt: "2026-06-10T20:00:00.000Z",
				updatedAt: "2026-06-10T20:01:00.000Z",
				meta: {
					provider: "openai",
					status: "failed",
					endpoint: "/v1/responses",
				},
			},
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_expired_list_1",
				status: "expired",
				createdAt: "2026-06-10T20:02:00.000Z",
				updatedAt: "2026-06-10T20:03:00.000Z",
				meta: {
					provider: "openai",
					status: "expired",
					endpoint: "/v1/responses",
				},
			},
		];

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/?status=failed", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			object: "list",
			first_id: "batch_failed_list_1",
			last_id: "batch_failed_list_1",
			data: [
				{
					id: "batch_failed_list_1",
					status: "failed",
					lifecycle_status: "failed",
				},
			],
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("accepts comma-separated batch status filters on status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for local batch listing");
			}),
		);
		state.batchRecords = [
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_completed_list_1",
				status: "completed",
				createdAt: "2026-06-10T20:00:00.000Z",
				updatedAt: "2026-06-10T20:01:00.000Z",
				meta: {
					provider: "openai",
					status: "completed",
					endpoint: "/v1/responses",
				},
			},
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_cancelled_list_1",
				status: "cancelled",
				createdAt: "2026-06-10T20:02:00.000Z",
				updatedAt: "2026-06-10T20:03:00.000Z",
				meta: {
					provider: "openai",
					status: "cancelled",
					endpoint: "/v1/responses",
				},
			},
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_expired_list_1",
				status: "expired",
				createdAt: "2026-06-10T20:04:00.000Z",
				updatedAt: "2026-06-10T20:05:00.000Z",
				meta: {
					provider: "openai",
					status: "expired",
					endpoint: "/v1/responses",
				},
			},
		];

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/?status=completed,canceled", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			object: "list",
			first_id: "batch_completed_list_1",
			last_id: "batch_cancelled_list_1",
			data: [
				{
					id: "batch_completed_list_1",
					status: "completed",
					lifecycle_status: "completed",
				},
				{
					id: "batch_cancelled_list_1",
					status: "cancelled",
					lifecycle_status: "cancelled",
				},
			],
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("proxies create + retrieve completed flow while keeping gateway-only fields local", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				let bodyJson: any = null;
				if (bodyText) {
					bodyJson = JSON.parse(bodyText);
				}
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_123",
						output_file_id: "file_output_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_123" && method === "GET") {
					return jsonResponse({
						id: "batch_123",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_123",
						output_file_id: "file_output_123",
						error_file_id: "file_error_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				session_id: "session_123",
				webhook: {
					url: "https://example.com/hooks/batch",
					secret: "whsec_batch_secret",
					events: ["job.completed"],
				},
			}),
		});

		expect(createResponse.status).toBe(200);
		const createPayload = await createResponse.json();
		expect(createPayload).toMatchObject({
			id: "batch_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: "https://example.com/batch_123",
			cancel_url: "https://example.com/batch_123/cancel",
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_123",
			webhook: {
				url: "https://example.com/hooks/batch",
				events: ["job.completed"],
				has_secret: true,
			},
			billing: {
				state: "estimated",
				reservation_status: "held",
				estimated_provider_cost: "0.12",
				estimated_user_cost: "0.12",
				estimated_nanos: 123_000_000,
				reserved_nanos: 123_000_000,
			},
			pricing_lines: [],
		});
		expect(createPayload.webhook).not.toHaveProperty("secret");

		expect(state.fetchCalls[0]?.url).toBe("https://api.openai.example/v1/batches");
		expect(state.fetchCalls[0]?.bodyJson).toEqual({
			input_file_id: "file_input_123",
			endpoint: "/v1/responses",
			completion_window: "24h",
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_123"))).toMatchObject({
			provider: "openai",
			sessionId: "session_123",
			status: "queued",
			inputFileId: "file_input_123",
			outputFileId: "file_output_123",
			webhook: {
				url: "https://example.com/hooks/batch",
				secret: "whsec_batch_secret",
				events: ["job.completed"],
			},
			reservationStatus: "held",
			reservedNanos: 123_000_000,
		});
		expect(state.reservationCalls[0]).toMatchObject({
			workspaceId: "ws_batch_test",
			inputFileId: "file_input_123",
			endpoint: "/v1/responses",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_input_123"))).toMatchObject({
			provider: "openai",
			status: "uploaded",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_output_123"))).toMatchObject({
			provider: "openai",
			status: "available",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_123",
				phase: "created",
			},
		]);

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_123",
			status: "completed",
			lifecycle_status: "completed",
			polling_url: "https://example.com/batch_123",
			cancel_url: null,
			error_file_id: "file_error_123",
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_123",
			pricing_lines: [],
			billing: {
				billed: true,
				charged: false,
				reason: "test",
				currency: "usd",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_123"))).toMatchObject({
			status: "completed",
			errorFileId: "file_error_123",
			outputFileId: "file_output_123",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_error_123"))).toMatchObject({
			provider: "openai",
			status: "available",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_123",
				phase: "completed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_123",
				status: "completed",
			},
		]);
		expect(state.operationLog).toEqual([
			"save:batch_123:queued",
			"webhook:created",
			"save:batch_123:completed",
			"finalize:completed",
			"webhook:completed",
		]);
	});

	it("dispatches progress webhooks after persisted in-progress batch status refresh", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_progress_route_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_progress_route_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_progress_route_123" && method === "GET") {
					return jsonResponse({
						id: "batch_progress_route_123",
						status: "in_progress",
						endpoint: "/v1/responses",
						input_file_id: "file_input_progress_route_123",
						request_counts: {
							total: 10,
							completed: 3,
							failed: 1,
						},
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_progress_route_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				webhook: {
					url: "https://example.com/hooks/batch-progress",
					events: ["batch.progress", "batch.completed"],
				},
			}),
		});
		expect(createResponse.status).toBe(200);
		state.webhookEvents = [];
		state.operationLog = [];

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_progress_route_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_progress_route_123",
			status: "in_progress",
			lifecycle_status: "running",
			progress: 40,
			last_polled_at: expect.any(String),
			polled_status: "in_progress",
			request_counts: {
				total: 10,
				completed: 3,
				failed: 1,
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_progress_route_123"))).toMatchObject({
			status: "in_progress",
			requestCounts: {
				total: 10,
				completed: 3,
				failed: 1,
			},
			lastPolledAt: expect.any(String),
			polledStatus: "in_progress",
		});
		expect(state.finalizeCalls).toEqual([]);
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_progress_route_123",
				phase: "progress",
				progress: 40,
			},
		]);
		expect(state.operationLog).toEqual([
			"save:batch_progress_route_123:in_progress",
			"webhook:progress",
		]);
	});

	it("fails closed before upstream submission when the batch reservation hold is unavailable", async () => {
		state.reservationError = new Error("wallet reservation outage");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when reservation fails");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "gateway_error",
			reason: "batch_reservation_unavailable",
			workspace_id: "ws_batch_test",
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("returns insufficient_funds before upstream submission for insufficient reservation statuses", async () => {
		state.reservationResult = {
			reservationId: "batch_hold:req_insufficient",
			held: false,
			amountNanos: 123_000_000,
			status: " Insufficient_Balance ",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when reservation has insufficient balance");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(402);
		expect(await response.json()).toMatchObject({
			error: "insufficient_funds",
			reason: "batch_reservation_insufficient_credits",
			workspace_id: "ws_batch_test",
			reservation_status: " Insufficient_Balance ",
			required_nanos: 123_000_000,
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("fails closed before upstream submission when batch pricing cannot be resolved", async () => {
		state.reservationResult = {
			reservationId: "batch_hold:req_unpriced",
			held: false,
			amountNanos: 0,
			status: "skip_price_card_missing",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when pricing is unavailable");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "gateway_error",
			reason: "batch_reservation_pricing_unavailable",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("fails closed before upstream submission when an input row endpoint is unsupported", async () => {
		state.reservationResult = {
			reservationId: "batch_hold:req_unsupported_row_endpoint",
			held: false,
			amountNanos: 0,
			status: "skip_unsupported_endpoint",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when an input row endpoint is unsupported");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_reservation_unsupported_endpoint",
			supported_endpoints: expect.arrayContaining([
				"/v1/responses",
				"/v1/chat/completions",
				"/v1/embeddings",
				"/v1/completions",
				"/v1/moderations",
				"/v1/images/generations",
				"/v1/images/edits",
				"/v1/videos",
			]),
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("fails closed before upstream submission when a batch input row is not priceable", async () => {
		state.reservationResult = {
			reservationId: "batch_hold:req_invalid_input_row",
			held: false,
			amountNanos: 0,
			status: "skip_invalid_input_row",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when a batch row cannot be priced");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_invalid_row",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_reservation_invalid_input_row",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("fails closed before upstream submission when a video batch cannot be duration-priced", async () => {
		state.reservationResult = {
			reservationId: "batch_hold:req_video_missing_duration",
			held: false,
			amountNanos: 0,
			status: "skip_missing_video_seconds",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called when video duration is missing");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_video",
				endpoint: "/v1/videos",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_reservation_missing_video_duration",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("rejects unsupported OpenAI batch endpoints before reservation or upstream submission", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for unsupported endpoints");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/audio/speech",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_unsupported_endpoint",
			endpoint: "/v1/audio/speech",
			supported_endpoints: expect.arrayContaining([
				"/v1/responses",
				"/v1/chat/completions",
				"/v1/embeddings",
				"/v1/completions",
				"/v1/moderations",
				"/v1/images/generations",
				"/v1/images/edits",
				"/v1/videos",
			]),
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(0);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("rejects malformed batch webhook configs before reservation or upstream submission", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for malformed webhooks");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				webhook: "https://example.com/hooks/batch",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "invalid_batch_webhook",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(0);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("allows legacy completions batches through reservation and upstream submission", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_completions_123",
						status: "validating",
						endpoint: "/v1/completions",
						input_file_id: "file_input_completions_123",
						completion_window: "24h",
					});
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_completions_123",
				endpoint: "/v1/completions",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: "batch_completions_123",
			status: "validating",
			endpoint: "/v1/completions",
		});
		expect(state.reservationCalls).toEqual([
			expect.objectContaining({
				workspaceId: "ws_batch_test",
				inputFileId: "file_input_completions_123",
				endpoint: "/v1/completions",
			}),
		]);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(state.batchMeta.get("ws_batch_test:batch_completions_123")).toMatchObject({
			endpoint: "/v1/completions",
			reservationStatus: "held",
		});
	});

	it("fails the gateway response when batch metadata cannot be persisted", async () => {
		state.batchMetaError = new Error("async operation store unavailable");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_meta_failed_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_meta_failed_123",
						completion_window: "24h",
					});
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_meta_failed_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				webhook: {
					url: "https://example.com/hooks/batch",
					events: ["batch.created", "batch.completed"],
				},
			}),
		});

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_batch_id: "batch_meta_failed_123",
				reservation_id: expect.stringContaining("batch_hold:"),
				reservation_status: "held",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_meta_failed_123"))).toBeUndefined();
		expect(state.webhookEvents).toEqual([]);
		expect(state.operationLog).toEqual([]);
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_input_meta_failed_123"))).toBeUndefined();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases the held reservation when upstream batch creation throws", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network connection reset");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "gateway_error",
			reason: "batch_upstream_create_failed",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				reservationId: expect.stringContaining("batch_hold:"),
				releaseRefId: expect.any(String),
			},
		]);
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("releases the held reservation when upstream batch creation succeeds without a batch id", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_missing_id_123",
					});
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_missing_id_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "upstream_error",
			reason: "batch_upstream_missing_id",
			workspace_id: "ws_batch_test",
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				reservationId: expect.stringContaining("batch_hold:"),
				releaseRefId: expect.any(String),
			},
		]);
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("releases the held reservation and decorates billing when upstream batch creation returns an error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						error: {
							type: "invalid_request_error",
							message: "Input file is not valid for this endpoint.",
						},
					}, 400);
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_invalid_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: {
				type: "invalid_request_error",
				message: "Input file is not valid for this endpoint.",
			},
			billing: {
				state: "void",
				billed: true,
				charged: false,
				reason: "upstream_create_failed",
				reservation_id: expect.stringContaining("batch_hold:"),
				reservation_status: "released",
				estimated_nanos: 123_000_000,
				reserved_nanos: 123_000_000,
				total_nanos: 0,
				cost_nanos: 0,
				cost_usd: 0,
			},
		});
		expect(state.reservationCalls).toHaveLength(1);
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				reservationId: expect.stringContaining("batch_hold:"),
				releaseRefId: expect.any(String),
			},
		]);
		expect(state.batchMeta.size).toBe(0);
		expect(state.fileMeta.size).toBe(0);
		expect(state.webhookEvents).toEqual([]);
	});

	it("proxies a failed retrieval flow and dispatches failed webhook phase", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_fail_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_fail_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_fail_123" && method === "GET") {
					return jsonResponse({
						id: "batch_fail_123",
						status: "failed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_fail_123",
						error_file_id: "file_error_fail_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_fail_123",
				endpoint: "/v1/responses",
				session_id: "session_fail_123",
			}),
		});

		expect(createResponse.status).toBe(200);
		expect(await createResponse.json()).toMatchObject({
			id: "batch_fail_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: "https://example.com/batch_fail_123",
			cancel_url: "https://example.com/batch_fail_123/cancel",
		});

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_fail_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_fail_123",
			status: "failed",
			lifecycle_status: "failed",
			polling_url: "https://example.com/batch_fail_123",
			cancel_url: null,
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_fail_123",
			pricing_lines: [],
			billing: {
				billed: true,
				charged: false,
				reason: "test",
				settled_provider_cost: "0.00",
				settled_user_cost: "0.00",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_fail_123"))).toMatchObject({
			status: "failed",
			errorFileId: "file_error_fail_123",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_error_fail_123"))).toMatchObject({
			provider: "openai",
			status: "available",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_fail_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_fail_123",
				phase: "failed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_fail_123",
				status: "failed",
			},
		]);
	});

	it("proxies an expired retrieval flow and dispatches expired webhook phase", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_expired_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_expired_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_expired_123" && method === "GET") {
					return jsonResponse({
						id: "batch_expired_123",
						status: "expired",
						endpoint: "/v1/responses",
						input_file_id: "file_input_expired_123",
						error_file_id: "file_error_expired_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_expired_123",
				endpoint: "/v1/responses",
				session_id: "session_expired_123",
			}),
		});

		expect(createResponse.status).toBe(200);

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_expired_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_expired_123",
			status: "expired",
			lifecycle_status: "expired",
			polling_url: "https://example.com/batch_expired_123",
			cancel_url: null,
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_expired_123",
			billing: {
				billed: true,
				charged: false,
				reason: "test",
				state: "void",
				settled_provider_cost: "0.00",
				settled_user_cost: "0.00",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_expired_123"))).toMatchObject({
			status: "expired",
			errorFileId: "file_error_expired_123",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_expired_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_expired_123",
				phase: "expired",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_expired_123",
				status: "expired",
			},
		]);
	});

	it("does not overwrite a stored failed batch or dispatch completed when an upstream read is stale", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_stale_terminal_123"), {
			provider: "openai",
			requestId: "req_stale_terminal_123",
			status: "failed",
			nativeBatchId: "batch_stale_terminal_123",
			endpoint: "/v1/responses",
			inputFileId: "file_input_stale_terminal_123",
			errorFileId: "file_error_stale_terminal_123",
			finalizedAt: "2026-06-10T20:00:00.000Z",
			billingReason: "failed",
			charged: false,
			costNanos: 0,
			costUsd: 0,
			reservationId: "batch_hold:req_stale_terminal_123",
			reservationStatus: "released_failed",
		});
		state.finalizeResult = {
			status: "failed",
			charged: false,
			billed: false,
			reason: "stale_terminal_status",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches/batch_stale_terminal_123" && method === "GET") {
					return jsonResponse({
						id: "batch_stale_terminal_123",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_stale_terminal_123",
						output_file_id: "file_output_stale_terminal_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const retrieveResponse = await batchRoutes.request("https://example.com/batch_stale_terminal_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_stale_terminal_123",
			status: "failed",
			lifecycle_status: "failed",
			cancel_url: null,
			billing: {
				billed: false,
				charged: false,
				reason: "stale_terminal_status",
				state: "void",
				reservation_id: "batch_hold:req_stale_terminal_123",
				reservation_status: "released_failed",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_stale_terminal_123"))).toMatchObject({
			status: "failed",
			outputFileId: "file_output_stale_terminal_123",
		});
		expect(state.webhookEvents).toEqual([]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_stale_terminal_123",
				status: "completed",
			},
		]);
	});

	it("does not dispatch terminal webhooks when batch finalization fails after status refresh", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_finalize_failed_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_finalize_failed_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_finalize_failed_123" && method === "GET") {
					return jsonResponse({
						id: "batch_finalize_failed_123",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_finalize_failed_123",
						output_file_id: "file_output_finalize_failed_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_finalize_failed_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				webhook: {
					url: "https://example.com/hooks/batch-finalize-failed",
					events: ["job.completed"],
				},
			}),
		});
		expect(createResponse.status).toBe(200);
		state.webhookEvents = [];
		state.operationLog = [];
		state.finalizeError = new Error("wallet release unavailable");

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_finalize_failed_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_finalize_failed_123",
			status: "completed",
			lifecycle_status: "completed",
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_finalize_failed_123"))).toMatchObject({
			status: "completed",
			outputFileId: "file_output_finalize_failed_123",
			reservationStatus: "held",
		});
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_finalize_failed_123",
				status: "completed",
			},
		]);
		expect(state.webhookEvents).toEqual([]);
		expect(state.operationLog).toEqual([
			"save:batch_finalize_failed_123:completed",
			"finalize:completed",
		]);
	});

	it("does not finalize or dispatch terminal webhooks when refreshed batch metadata cannot be persisted", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_refresh_meta_failed_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_refresh_meta_failed_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_refresh_meta_failed_123" && method === "GET") {
					return jsonResponse({
						id: "batch_refresh_meta_failed_123",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_refresh_meta_failed_123",
						output_file_id: "file_output_refresh_meta_failed_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_refresh_meta_failed_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});
		expect(createResponse.status).toBe(200);
		state.webhookEvents = [];
		state.operationLog = [];
		state.batchMetaError = new Error("async operation store unavailable");

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_refresh_meta_failed_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(502);
		expect(await retrieveResponse.json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				batch_id: "batch_refresh_meta_failed_123",
				native_batch_id: "batch_refresh_meta_failed_123",
				status: "completed",
				reservation_id: expect.stringContaining("batch_hold:"),
				reservation_status: "held",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_refresh_meta_failed_123"))).toMatchObject({
			status: "queued",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_output_refresh_meta_failed_123"))).toBeUndefined();
		expect(state.finalizeCalls).toEqual([]);
		expect(state.webhookEvents).toEqual([]);
		expect(state.operationLog).toEqual([]);
	});

	it("proxies batch cancellation and dispatches a cancelled webhook phase", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				let bodyJson: any = null;
				if (bodyText) {
					bodyJson = JSON.parse(bodyText);
				}
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_cancel_123/cancel" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_123",
						status: "cancelled",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_cancel_123",
				endpoint: "/v1/responses",
				session_id: "session_cancel_123",
			}),
		});

		expect(createResponse.status).toBe(200);
		expect(await createResponse.json()).toMatchObject({
			id: "batch_cancel_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: "https://example.com/batch_cancel_123",
			cancel_url: "https://example.com/batch_cancel_123/cancel",
		});

		const cancelResponse = await batchRoutes.request("https://example.com/batch_cancel_123/cancel", {
			method: "POST",
		});

		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.json()).toMatchObject({
			id: "batch_cancel_123",
			status: "cancelled",
			lifecycle_status: "cancelled",
			polling_url: "https://example.com/batch_cancel_123",
			cancel_url: null,
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_cancel_123",
			pricing_lines: [],
			billing: {
				billed: true,
				charged: false,
				reason: "test",
				settled_provider_cost: "0.00",
				settled_user_cost: "0.00",
			},
		});
		expect(state.fetchCalls[1]?.url).toBe("https://api.openai.example/v1/batches/batch_cancel_123/cancel");
		expect(state.fetchCalls[1]?.bodyJson).toEqual({});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_cancel_123"))).toMatchObject({
			status: "cancelled",
			inputFileId: "file_input_cancel_123",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_cancel_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: "batch_cancel_123",
				phase: "cancelled",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_cancel_123",
				status: "cancelled",
			},
		]);
		expect(state.operationLog).toEqual([
			"save:batch_cancel_123:queued",
			"webhook:created",
			"save:batch_cancel_123:cancelled",
			"finalize:cancelled",
			"webhook:cancelled",
		]);
	});

	it("does not dispatch cancelled webhooks when batch finalization fails after cancel refresh", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_finalize_failed_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_finalize_failed_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_cancel_finalize_failed_123/cancel" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_finalize_failed_123",
						status: "cancelled",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_finalize_failed_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_cancel_finalize_failed_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				webhook: {
					url: "https://example.com/hooks/batch-cancel-finalize-failed",
					events: ["job.cancelled"],
				},
			}),
		});
		expect(createResponse.status).toBe(200);
		state.webhookEvents = [];
		state.operationLog = [];
		state.finalizeError = new Error("wallet release unavailable");

		const cancelResponse = await batchRoutes.request("https://example.com/batch_cancel_finalize_failed_123/cancel", {
			method: "POST",
		});

		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.json()).toMatchObject({
			id: "batch_cancel_finalize_failed_123",
			status: "cancelled",
			lifecycle_status: "cancelled",
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_cancel_finalize_failed_123"))).toMatchObject({
			status: "cancelled",
			reservationStatus: "held",
		});
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_cancel_finalize_failed_123",
				status: "cancelled",
			},
		]);
		expect(state.webhookEvents).toEqual([]);
		expect(state.operationLog).toEqual([
			"save:batch_cancel_finalize_failed_123:cancelled",
			"finalize:cancelled",
		]);
	});

	it("does not finalize or dispatch cancelled webhooks when cancel metadata cannot be persisted", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_meta_failed_123",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_meta_failed_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_cancel_meta_failed_123/cancel" && method === "POST") {
					return jsonResponse({
						id: "batch_cancel_meta_failed_123",
						status: "cancelled",
						endpoint: "/v1/responses",
						input_file_id: "file_input_cancel_meta_failed_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_cancel_meta_failed_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			}),
		});
		expect(createResponse.status).toBe(200);
		state.webhookEvents = [];
		state.operationLog = [];
		state.batchMetaError = new Error("async operation store unavailable");

		const cancelResponse = await batchRoutes.request("https://example.com/batch_cancel_meta_failed_123/cancel", {
			method: "POST",
		});

		expect(cancelResponse.status).toBe(502);
		expect(await cancelResponse.json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				batch_id: "batch_cancel_meta_failed_123",
				native_batch_id: "batch_cancel_meta_failed_123",
				status: "cancelled",
				reservation_id: expect.stringContaining("batch_hold:"),
				reservation_status: "held",
			},
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_cancel_meta_failed_123"))).toMatchObject({
			status: "queued",
		});
		expect(state.finalizeCalls).toEqual([]);
		expect(state.webhookEvents).toEqual([]);
		expect(state.operationLog).toEqual([]);
	});

	it("does not dispatch duplicate cancelled webhooks for an already-cancelled batch", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_cancel_again_123"), {
			provider: "openai",
			status: "cancelled",
			requestId: "req_batch_cancel_again_123",
			sessionId: "session_cancel_again_123",
			nativeBatchId: "batch_cancel_again_123",
			inputFileId: "file_input_cancel_again_123",
			webhook: {
				url: "https://example.com/hooks/batch-cancel-again",
				events: ["job.cancelled"],
				secret: "whsec_cancel_again",
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Already-cancelled batches should not be cancelled upstream again");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/batch_cancel_again_123/cancel", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: "batch_cancel_again_123",
			status: "cancelled",
			lifecycle_status: "cancelled",
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.webhookEvents).toEqual([]);
		expect(state.finalizeCalls).toEqual([]);
		expect(state.operationLog).toEqual([]);
	});

	it("rejects cancellation for completed batches without calling upstream", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_completed_cancel_123"), {
			provider: "openai",
			status: "completed",
			requestId: "req_batch_completed_cancel_123",
			nativeBatchId: "batch_completed_cancel_123",
			inputFileId: "file_input_completed_cancel_123",
			outputFileId: "file_output_completed_cancel_123",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Completed batches should not be cancelled upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/batch_completed_cancel_123/cancel", {
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_cancel_requires_non_terminal_status",
			request_id: expect.any(String),
			workspace_id: "ws_batch_test",
			batch_id: "batch_completed_cancel_123",
			status: "completed",
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.webhookEvents).toEqual([]);
		expect(state.finalizeCalls).toEqual([]);
		expect(state.operationLog).toEqual([]);
	});

	it("uses persisted native OpenAI batch id for retrieve and cancel while preserving local ownership", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson: bodyText ? JSON.parse(bodyText) : null,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/batches/batch_native_123" && method === "GET") {
					return jsonResponse({
						id: "batch_native_123",
						status: "in_progress",
						endpoint: "/v1/responses",
						input_file_id: "file_input_native_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_native_123/cancel" && method === "POST") {
					return jsonResponse({
						id: "batch_native_123",
						status: "cancelled",
						endpoint: "/v1/responses",
						input_file_id: "file_input_native_123",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);
		state.batchMeta.set(batchKey("ws_batch_test", "batch_public_123"), {
			provider: "openai",
			nativeBatchId: "batch_native_123",
			status: "in_progress",
			inputFileId: "file_input_native_123",
			sessionId: "session_native_123",
		});

		const { batchRoutes } = await import("./batches");

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_public_123", {
			method: "GET",
		});
		expect(retrieveResponse.status).toBe(200);

		const cancelResponse = await batchRoutes.request("https://example.com/batch_public_123/cancel", {
			method: "POST",
		});
		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.json()).toMatchObject({
			id: "batch_public_123",
			native_batch_id: "batch_native_123",
			status: "cancelled",
			lifecycle_status: "cancelled",
			polling_url: "https://example.com/batch_public_123",
			cancel_url: null,
			session_id: "session_native_123",
		});
		expect(state.fetchCalls.map((call) => [call.method, call.url])).toEqual([
			["GET", "https://api.openai.example/v1/batches/batch_native_123"],
			["POST", "https://api.openai.example/v1/batches/batch_native_123/cancel"],
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_public_123",
				status: "cancelled",
			},
		]);
		expect(state.batchMeta.get(batchKey("ws_batch_test", "batch_public_123"))).toMatchObject({
			nativeBatchId: "batch_native_123",
			status: "cancelled",
		});
	});

	it("rejects upstream status refresh for persisted non-OpenAI batch providers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for unsupported batch providers");
			}),
		);
		state.batchMeta.set(batchKey("ws_batch_test", "batch_custom_status_123"), {
			provider: "custom-provider",
			nativeBatchId: "native_custom_status_123",
			status: "in_progress",
		});

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/batch_custom_status_123", {
			method: "GET",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented_yet",
			reason: "batch_status_provider_not_supported",
			batch_id: "batch_custom_status_123",
			native_batch_id: "native_custom_status_123",
			provider: "custom-provider",
			workspace_id: "ws_batch_test",
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.webhookEvents).toEqual([]);
		expect(state.finalizeCalls).toEqual([]);
	});

	it("rejects cancellation for persisted non-OpenAI batch providers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called for unsupported batch providers");
			}),
		);
		state.batchMeta.set(batchKey("ws_batch_test", "batch_custom_123"), {
			provider: "custom-provider",
			nativeBatchId: "native_custom_123",
			status: "in_progress",
		});

		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/batch_custom_123/cancel", {
			method: "POST",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented_yet",
			reason: "batch_cancel_provider_not_supported",
			batch_id: "batch_custom_123",
			native_batch_id: "native_custom_123",
			provider: "custom-provider",
			workspace_id: "ws_batch_test",
		});
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(state.webhookEvents).toEqual([]);
		expect(state.finalizeCalls).toEqual([]);
	});

	it("lists batch-capable models with supported parameter details", async () => {
		state.catalogue = [
			{
				model_id: "openai/gpt-5-mini",
				name: "GPT-5 mini",
				status: "active",
				input_types: ["text"],
				output_types: ["text"],
				supported_params: ["endpoint", "completion_window"],
				supported_params_detail: {
					endpoint: {
						supported: true,
						values: ["/v1/responses", "/v1/chat/completions"],
						aliases: ["request_endpoint"],
						providers: ["openai"],
					},
					completion_window: {
						supported: true,
						values: ["24h"],
						aliases: ["window"],
						providers: ["openai"],
					},
				},
				providers: [
					{
						api_provider_id: "openai",
						params: ["endpoint", "completion_window"],
						params_detail: {
							endpoint: {
								supported: true,
								values: ["/v1/responses", "/v1/chat/completions"],
								aliases: ["request_endpoint"],
							},
							completion_window: {
								supported: true,
								values: ["24h"],
								aliases: ["window"],
							},
						},
					},
				],
				pricing: {
					pricing_plan: "standard",
					meters: {},
				},
			},
		];

		const { fetchCatalogue } = await import("../control/models.catalogue");
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/models", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			object: "list",
			data: [
				{
					model: "openai/gpt-5-mini",
					name: "GPT-5 mini",
					status: "active",
					input_types: ["text"],
					output_types: ["text"],
					supported_params: ["endpoint", "completion_window"],
					supported_parameters: ["endpoint", "completion_window"],
					supported_params_detail: {
						endpoint: {
							supported: true,
							values: ["/v1/responses", "/v1/chat/completions"],
							aliases: ["request_endpoint"],
							providers: ["openai"],
						},
						completion_window: {
							supported: true,
							values: ["24h"],
							aliases: ["window"],
							providers: ["openai"],
						},
					},
					supported_parameters_detail: {
						endpoint: {
							supported: true,
							values: ["/v1/responses", "/v1/chat/completions"],
							aliases: ["request_endpoint"],
							providers: ["openai"],
						},
						completion_window: {
							supported: true,
							values: ["24h"],
							aliases: ["window"],
							providers: ["openai"],
						},
					},
					providers: [
						{
							id: "openai",
							supported_params: ["endpoint", "completion_window"],
							supported_parameters: ["endpoint", "completion_window"],
							supported_params_detail: {
								endpoint: {
									supported: true,
									values: ["/v1/responses", "/v1/chat/completions"],
									aliases: ["request_endpoint"],
								},
								completion_window: {
									supported: true,
									values: ["24h"],
									aliases: ["window"],
								},
							},
							supported_parameters_detail: {
								endpoint: {
									supported: true,
									values: ["/v1/responses", "/v1/chat/completions"],
									aliases: ["request_endpoint"],
								},
								completion_window: {
									supported: true,
									values: ["24h"],
									aliases: ["window"],
								},
							},
						},
					],
					pricing: {
						pricing_plan: "standard",
						meters: {},
					},
				},
			],
		});
		expect(fetchCatalogue).toHaveBeenCalledWith({
			endpoints: ["batch"],
			params: [],
			statuses: ["active"],
		});
	});

	it("passes supported parameter filters through to batch model catalogue lookups", async () => {
		const { fetchCatalogue } = await import("../control/models.catalogue");
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/models?params=request_endpoint,window&params=endpoint", {
			method: "GET",
		});

		expect(response.status).toBe(200);
	expect(fetchCatalogue).toHaveBeenCalledWith({
		endpoints: ["batch"],
		params: ["request_endpoint", "window", "endpoint"],
		statuses: ["active"],
	});
});
});
