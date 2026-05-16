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
	dispatchAsyncWebhookEventInBackground: vi.fn((payload: Record<string, unknown>) => {
		state.webhookEvents.push(payload);
	}),
	parseAsyncWebhookConfig: vi.fn((_kind: string, webhook: Record<string, unknown>) => webhook),
	toAsyncLifecycleStatus: vi.fn((status: string) => {
		switch (String(status ?? "").toLowerCase()) {
			case "completed":
				return "completed";
			case "failed":
			case "expired":
				return "failed";
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
		state.batchMeta.set(batchKey(workspaceId, batchId), { ...meta });
	}),
	getBatchJobMeta: vi.fn(async (workspaceId: string, batchId: string) => {
		return state.batchMeta.get(batchKey(workspaceId, batchId)) ?? null;
	}),
	saveBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string, meta: Record<string, unknown>) => {
		state.fileMeta.set(fileKey(workspaceId, fileId), { ...meta });
	}),
}));

vi.mock("@core/batch-finalization", () => ({
	finalizeBatchJob: vi.fn(async (args: Record<string, unknown>) => {
		state.finalizeCalls.push(args);
		return {
			status: String(args.status ?? ""),
			charged: false,
			billed: true,
			reason: "test",
		};
	}),
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
	});
});
