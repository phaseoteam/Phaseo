import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	authResult: {
		ok: true as const,
		workspaceId: "ws_batch_smoke",
		apiKeyId: "key_batch_smoke",
		apiKeyRef: "kid_batch_smoke",
		apiKeyKid: "batch_smoke_kid",
		userId: null,
		internal: false,
	},
	batchMeta: new Map<string, Record<string, unknown>>(),
	fileMeta: new Map<string, Record<string, unknown>>(),
	webhookEvents: [] as Array<Record<string, unknown>>,
	finalizeCalls: [] as Array<Record<string, unknown>>,
	loadPriceCardCalls: [] as Array<Record<string, unknown>>,
	reservationCalls: [] as Array<Record<string, unknown>>,
	fetchCalls: [] as Array<{
		url: string;
		method: string;
		bodyText: string | null;
		headers: Record<string, string>;
	}>,
}));

function resetState() {
	state.batchMeta.clear();
	state.fileMeta.clear();
	state.webhookEvents = [];
	state.finalizeCalls = [];
	state.loadPriceCardCalls = [];
	state.reservationCalls = [];
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

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: vi.fn(async (provider: string, model: string, endpoint: string) => {
		state.loadPriceCardCalls.push({ provider, model, endpoint });
		if (endpoint !== "text.generate") return null;
		return {
			provider,
			model,
			endpoint,
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: "test",
			rules: [
				{
					id: "input",
					pricing_plan: "batch",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1,
					price_per_unit: "0.000001",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					id: "output",
					pricing_plan: "batch",
					meter: "output_text_tokens",
					unit: "token",
					unit_size: 1,
					price_per_unit: "0.000002",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};
	}),
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.reservationCalls.push(args);
		return {
			status: "held",
			applied: true,
			alreadyApplied: false,
			amountNanos: args.amountNanos,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
	releaseWalletReservation: vi.fn(async () => ({
		status: "released",
		applied: true,
		alreadyApplied: false,
	})),
}));

vi.mock("@core/async-notifications", () => ({
	buildAsyncWebSocketUrl: vi.fn((_baseUrl: string, kind: string, id: string) => `wss://example.com/v1/async/${kind}/${id}/ws`),
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
	getBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string) => {
		return state.fileMeta.get(fileKey(workspaceId, fileId)) ?? null;
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

describe("mounted batch gateway smoke flows", () => {
	beforeEach(() => {
		resetState();
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	it("runs a successful batch flow through file upload, batch polling, and owned output download", async () => {
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
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					return jsonResponse({
						id: "file_input_123",
						object: "file",
						purpose: "batch",
						filename: "batch-input.jsonl",
						status: "uploaded",
						bytes: 19,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_input_123/content" && method === "GET") {
					return new Response('{"custom_id":"req_1","body":{"model":"gpt-5-mini","input":"hello"}}\n', {
						status: 200,
						headers: { "Content-Type": "application/jsonl" },
					});
				}

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_123",
						object: "batch",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_123",
						output_file_id: "file_output_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_123" && method === "GET") {
					return jsonResponse({
						id: "batch_123",
						object: "batch",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_123",
						output_file_id: "file_output_123",
						request_counts: {
							total: 2,
							completed: 2,
							failed: 0,
						},
					});
				}

				if (url === "https://api.openai.example/v1/files/file_output_123" && method === "GET") {
					return jsonResponse({
						id: "file_output_123",
						object: "file",
						purpose: "batch",
						filename: "batch-output.jsonl",
						status: "processed",
						bytes: 41,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_output_123/content" && method === "GET") {
					return new Response('{"response":{"status_code":200,"body":{"id":"resp_1"}}}\n', {
						status: 200,
						headers: {
							"Content-Type": "application/jsonl",
							"Content-Disposition": 'attachment; filename="batch-output.jsonl"',
						},
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const [{ Hono }, { batchRoutes }, { filesRoutes }] = await Promise.all([
			import("hono"),
			import("./batches"),
			import("./files"),
		]);
		const app = new Hono();
		app.route("/v1/batches", batchRoutes);
		app.route("/v1/files", filesRoutes);

		const uploadBody = new FormData();
		uploadBody.set("purpose", "batch");
		uploadBody.set("file", new Blob(['{"ok":true}\n'], { type: "application/jsonl" }), "batch-input.jsonl");

		const uploadResponse = await app.request("https://example.com/v1/files", {
			method: "POST",
			body: uploadBody,
		});
		expect(uploadResponse.status).toBe(200);
		expect(await uploadResponse.json()).toMatchObject({
			id: "file_input_123",
			status: "uploaded",
		});

		const createResponse = await app.request("https://example.com/v1/batches", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				session_id: "session_smoke_success",
			}),
		});
		expect(createResponse.status).toBe(200);
		expect(await createResponse.json()).toMatchObject({
			id: "batch_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: "https://example.com/v1/batches/batch_123",
			cancel_url: "https://example.com/v1/batches/batch_123/cancel",
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_smoke_success",
			pricing_lines: [],
		});
		expect(state.loadPriceCardCalls).toEqual([
			expect.objectContaining({
				provider: "openai",
				model: "gpt-5-mini",
				endpoint: "text.generate",
			}),
		]);
		expect(state.reservationCalls).toEqual([
			expect.objectContaining({
				workspaceId: "ws_batch_smoke",
				reservationId: expect.stringContaining("batch_hold:"),
				holdRefId: expect.any(String),
				amountNanos: expect.any(Number),
			}),
		]);

		const retrieveResponse = await app.request("https://example.com/v1/batches/batch_123", {
			method: "GET",
		});
		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_123",
			status: "completed",
			lifecycle_status: "completed",
			polling_url: "https://example.com/v1/batches/batch_123",
			cancel_url: null,
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_smoke_success",
			request_counts: {
				total: 2,
				completed: 2,
				failed: 0,
			},
			billing: {
				billed: true,
				charged: false,
				reason: "test",
			},
		});

		const fileResponse = await app.request("https://example.com/v1/files/file_output_123", {
			method: "GET",
		});
		expect(fileResponse.status).toBe(200);
		expect(await fileResponse.json()).toMatchObject({
			id: "file_output_123",
			status: "processed",
			filename: "batch-output.jsonl",
		});

		const contentResponse = await app.request("https://example.com/v1/files/file_output_123/content", {
			method: "GET",
		});
		expect(contentResponse.status).toBe(200);
		expect(contentResponse.headers.get("content-type")).toBe("application/jsonl");
		expect(await contentResponse.text()).toContain('"status_code":200');

		expect(state.batchMeta.get(batchKey("ws_batch_smoke", "batch_123"))).toMatchObject({
			status: "completed",
			sessionId: "session_smoke_success",
			inputFileId: "file_input_123",
			outputFileId: "file_output_123",
			requestCounts: {
				total: 2,
				completed: 2,
				failed: 0,
			},
		});
		expect(state.fileMeta.get(fileKey("ws_batch_smoke", "file_output_123"))).toMatchObject({
			provider: "openai",
			status: "processed",
			filename: "batch-output.jsonl",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_smoke",
				kind: "batch",
				internalId: "batch_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_smoke",
				kind: "batch",
				internalId: "batch_123",
				phase: "completed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_smoke",
				batchId: "batch_123",
				status: "completed",
			},
		]);
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"GET https://api.openai.example/v1/files/file_input_123/content",
			"POST https://api.openai.example/v1/batches",
			"GET https://api.openai.example/v1/batches/batch_123",
			"GET https://api.openai.example/v1/files/file_output_123",
			"GET https://api.openai.example/v1/files/file_output_123/content",
		]);
	});

	it("runs a failed batch flow through file upload, polling, and owned error download", async () => {
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
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					return jsonResponse({
						id: "file_input_fail_123",
						object: "file",
						purpose: "batch",
						filename: "batch-fail-input.jsonl",
						status: "uploaded",
						bytes: 21,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_input_fail_123/content" && method === "GET") {
					return new Response('{"custom_id":"req_fail_1","body":{"model":"gpt-5-mini","input":"fail"}}\n', {
						status: 200,
						headers: { "Content-Type": "application/jsonl" },
					});
				}

				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_fail_123",
						object: "batch",
						status: "queued",
						endpoint: "/v1/responses",
						input_file_id: "file_input_fail_123",
					});
				}

				if (url === "https://api.openai.example/v1/batches/batch_fail_123" && method === "GET") {
					return jsonResponse({
						id: "batch_fail_123",
						object: "batch",
						status: "failed",
						endpoint: "/v1/responses",
						input_file_id: "file_input_fail_123",
						error_file_id: "file_error_fail_123",
						request_counts: {
							total: 1,
							completed: 0,
							failed: 1,
						},
					});
				}

				if (url === "https://api.openai.example/v1/files/file_error_fail_123" && method === "GET") {
					return jsonResponse({
						id: "file_error_fail_123",
						object: "file",
						purpose: "batch",
						filename: "batch-error.jsonl",
						status: "processed",
						bytes: 37,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_error_fail_123/content" && method === "GET") {
					return new Response('{"error":{"message":"synthetic batch failure"}}\n', {
						status: 200,
						headers: {
							"Content-Type": "application/jsonl",
							"Content-Disposition": 'attachment; filename="batch-error.jsonl"',
						},
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const [{ Hono }, { batchRoutes }, { filesRoutes }] = await Promise.all([
			import("hono"),
			import("./batches"),
			import("./files"),
		]);
		const app = new Hono();
		app.route("/v1/batches", batchRoutes);
		app.route("/v1/files", filesRoutes);

		const uploadBody = new FormData();
		uploadBody.set("purpose", "batch");
		uploadBody.set("file", new Blob(['{"fail":true}\n'], { type: "application/jsonl" }), "batch-fail-input.jsonl");

		const uploadResponse = await app.request("https://example.com/v1/files", {
			method: "POST",
			body: uploadBody,
		});
		expect(uploadResponse.status).toBe(200);

		const createResponse = await app.request("https://example.com/v1/batches", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_fail_123",
				endpoint: "/v1/responses",
				session_id: "session_smoke_fail",
			}),
		});
		expect(createResponse.status).toBe(200);
		expect(await createResponse.json()).toMatchObject({
			id: "batch_fail_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: "https://example.com/v1/batches/batch_fail_123",
			cancel_url: "https://example.com/v1/batches/batch_fail_123/cancel",
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_smoke_fail",
			pricing_lines: [],
		});
		expect(state.loadPriceCardCalls).toEqual([
			expect.objectContaining({
				provider: "openai",
				model: "gpt-5-mini",
				endpoint: "text.generate",
			}),
		]);
		expect(state.reservationCalls).toEqual([
			expect.objectContaining({
				workspaceId: "ws_batch_smoke",
				reservationId: expect.stringContaining("batch_hold:"),
				holdRefId: expect.any(String),
				amountNanos: expect.any(Number),
			}),
		]);

		const retrieveResponse = await app.request("https://example.com/v1/batches/batch_fail_123", {
			method: "GET",
		});
		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_fail_123",
			status: "failed",
			lifecycle_status: "failed",
			polling_url: "https://example.com/v1/batches/batch_fail_123",
			cancel_url: null,
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_smoke_fail",
			error_file_id: "file_error_fail_123",
			billing: {
				billed: true,
				charged: false,
				reason: "test",
			},
		});

		const fileResponse = await app.request("https://example.com/v1/files/file_error_fail_123", {
			method: "GET",
		});
		expect(fileResponse.status).toBe(200);
		expect(await fileResponse.json()).toMatchObject({
			id: "file_error_fail_123",
			filename: "batch-error.jsonl",
		});

		const contentResponse = await app.request("https://example.com/v1/files/file_error_fail_123/content", {
			method: "GET",
		});
		expect(contentResponse.status).toBe(200);
		expect(await contentResponse.text()).toContain("synthetic batch failure");

		expect(state.batchMeta.get(batchKey("ws_batch_smoke", "batch_fail_123"))).toMatchObject({
			status: "failed",
			sessionId: "session_smoke_fail",
			errorFileId: "file_error_fail_123",
			requestCounts: {
				total: 1,
				completed: 0,
				failed: 1,
			},
		});
		expect(state.fileMeta.get(fileKey("ws_batch_smoke", "file_error_fail_123"))).toMatchObject({
			provider: "openai",
			status: "processed",
			filename: "batch-error.jsonl",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_smoke",
				kind: "batch",
				internalId: "batch_fail_123",
				phase: "created",
			},
			{
				workspaceId: "ws_batch_smoke",
				kind: "batch",
				internalId: "batch_fail_123",
				phase: "failed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_smoke",
				batchId: "batch_fail_123",
				status: "failed",
			},
		]);
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"GET https://api.openai.example/v1/files/file_input_fail_123/content",
			"POST https://api.openai.example/v1/batches",
			"GET https://api.openai.example/v1/batches/batch_fail_123",
			"GET https://api.openai.example/v1/files/file_error_fail_123",
			"GET https://api.openai.example/v1/files/file_error_fail_123/content",
		]);
	});
});
