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
	reconciliationUpdates: [] as Array<Record<string, unknown>>,
	statusUpdates: [] as Array<Record<string, unknown>>,
	operationalFailures: [] as Array<Record<string, unknown>>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	requestRows: [] as Array<Record<string, unknown>>,
	saveBatchJobError: null as Error | null,
	saveBatchJobErrorOnCall: null as number | null,
	saveBatchJobCalls: 0,
	previewProviders: "openai,anthropic,google-ai-studio,mistral,x-ai,groq,together",
	googleApiKey: "test-google-key" as string | null,
	guardContextFailure: null as Response | null,
	policyAllowedProviders: null as string[] | null,
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
	state.reconciliationUpdates = [];
	state.statusUpdates = [];
	state.operationalFailures = [];
	state.releaseCalls = [];
	state.requestRows = [];
	state.saveBatchJobError = null;
	state.saveBatchJobErrorOnCall = null;
	state.saveBatchJobCalls = 0;
	state.previewProviders = "openai,anthropic,google-ai-studio,mistral,x-ai,groq,together";
	state.googleApiKey = "test-google-key";
	state.guardContextFailure = null;
	state.policyAllowedProviders = null;
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

vi.mock("@pipeline/before/guards", () => ({
	guardContext: vi.fn(async () => state.guardContextFailure
		? { ok: false, response: state.guardContextFailure }
		: ({ ok: true, value: {
			context: { teamSettings: {} },
			providers: ["openai", "anthropic", "google-ai-studio", "mistral", "x-ai", "groq", "together"].map((providerId) => ({ providerId })),
			resolvedModel: null,
			candidateDiagnostics: {},
		} })),
}));

vi.mock("@pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: vi.fn(async () => ({
		providerAllowlist: null,
		providerBlocklist: null,
		allowedApiModels: null,
		blockedApiModels: null,
		promptInjectionAction: null,
		promptInjectionGuardrailIds: [],
		sensitiveInfoRules: [],
		sensitiveInfoGuardrailIds: [],
		enforceAllowed: false,
		activeGuardrailIds: [],
	})),
	applyWorkspacePolicy: vi.fn((args: any) => ({
		ok: true,
		providers: state.policyAllowedProviders
			? args.providers.filter((provider: any) => state.policyAllowedProviders?.includes(provider.providerId))
			: args.providers,
		diagnostics: {},
	})),
}));

vi.mock("@pipeline/before/promptInjection", () => ({
	applyPromptInjectionGuardrails: vi.fn((args: any) => ({ ok: true, body: args.body, rawBody: args.rawBody, enforcement: null })),
}));

vi.mock("@pipeline/before/sensitiveInfo", () => ({
	applySensitiveInfoGuardrails: vi.fn((args: any) => ({ ok: true, body: args.body, rawBody: args.rawBody, enforcement: args.existingEnforcement ?? null })),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://api.openai.example/v1",
		...(state.googleApiKey ? { GOOGLE_AI_STUDIO_API_KEY: state.googleApiKey } : {}),
		BATCH_API_PREVIEW_PROVIDERS: state.previewProviders,
	}),
}));

vi.mock("@/observability/axiom", () => ({
	emitGatewayOperationalFailure: vi.fn(async (args: Record<string, unknown>) => {
		state.operationalFailures.push(args);
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
		has_secret:
			(typeof (meta.webhook as any)?.secret === "string" && (meta.webhook as any).secret.length > 0) ||
			(typeof (meta.webhook as any)?.endpoint_id === "string" && (meta.webhook as any).endpoint_id.length > 0),
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
		state.saveBatchJobCalls += 1;
		if (state.saveBatchJobError && (state.saveBatchJobErrorOnCall === null || state.saveBatchJobErrorOnCall === state.saveBatchJobCalls)) {
			throw state.saveBatchJobError;
		}
		state.batchMeta.set(batchKey(workspaceId, batchId), { ...meta });
	}),
	getBatchJobMeta: vi.fn(async (workspaceId: string, batchId: string) => {
		return state.batchMeta.get(batchKey(workspaceId, batchId)) ?? null;
	}),
	resolveBatchProviderNativeId: vi.fn((args: { batchId: string; nativeId?: string | null; meta?: Record<string, unknown> | null }) => {
		const nativeId = typeof args.nativeId === "string" && args.nativeId.trim() ? args.nativeId.trim() : null;
		const nativeBatchId =
			typeof args.meta?.nativeBatchId === "string" && args.meta.nativeBatchId.trim()
				? args.meta.nativeBatchId.trim()
				: null;
		return nativeId ?? nativeBatchId ?? args.batchId;
	}),
	getBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string) => {
		return state.fileMeta.get(fileKey(workspaceId, fileId)) ?? null;
	}),
	saveBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string, meta: Record<string, unknown>) => {
		state.fileMeta.set(fileKey(workspaceId, fileId), { ...meta });
	}),
	listPendingBatchJobs: vi.fn(async () => {
		return Array.from(state.batchMeta.entries()).map(([key, meta], index) => {
			const [workspaceId, batchId] = key.split(":");
			return {
				workspaceId,
				batchId,
				requestId: typeof meta.requestId === "string" ? meta.requestId : null,
				sessionId: typeof meta.sessionId === "string" ? meta.sessionId : null,
				appId: typeof meta.appId === "string" ? meta.appId : null,
				nativeId: typeof meta.nativeBatchId === "string" ? meta.nativeBatchId : null,
				provider: typeof meta.provider === "string" ? meta.provider : null,
				model: typeof meta.model === "string" ? meta.model : null,
				status: typeof meta.status === "string" ? meta.status : null,
				billedAt: null,
				meta,
				nextReconcileAt: "2026-06-17T10:00:00.000Z",
				reconcileAttempts: index + 1,
				updatedAt: "2026-06-17T10:00:00.000Z",
				createdAt: "2026-06-17T09:59:00.000Z",
			};
		});
	}),
	updateBatchJobReconciliation: vi.fn(async (args: Record<string, unknown>) => {
		state.reconciliationUpdates.push(args);
	}),
	setBatchJobStatus: vi.fn(async (workspaceId: string, batchId: string, status: string, metaPatch?: Record<string, unknown>) => {
		state.statusUpdates.push({ workspaceId, batchId, status, metaPatch });
		const key = batchKey(workspaceId, batchId);
		state.batchMeta.set(key, { ...(state.batchMeta.get(key) ?? {}), ...(metaPatch ?? {}), status });
	}),
}));

vi.mock("@core/batch-requests", () => ({
	hashBatchRequestBody: vi.fn(async (body: unknown) => `hash:${JSON.stringify(body)}`),
	listBatchRequestRows: vi.fn(async (args: { workspaceId: string; batchId: string }) =>
		state.requestRows.filter((row) => row.workspaceId === args.workspaceId && row.batchId === args.batchId),
	),
	saveBatchRequestRows: vi.fn(async (args: { workspaceId: string; batchId: string; rows: Array<Record<string, unknown>> }) => {
		state.requestRows.push(
			...args.rows.map((row, index) => ({
				id: `breq_${state.requestRows.length + index + 1}`,
				workspaceId: args.workspaceId,
				batchId: args.batchId,
				provider: row.provider,
				nativeBatchId: row.nativeBatchId ?? null,
				customId: row.customId,
				requestIndex: row.requestIndex,
				method: row.method ?? null,
				endpoint: row.endpoint ?? null,
				model: row.model ?? null,
				status: row.status ?? "queued",
				requestBodyHash: row.requestBodyHash ?? null,
				responseStatus: row.responseStatus ?? null,
				responseBody: row.responseBody ?? null,
				errorBody: row.errorBody ?? null,
				usage: row.usage ?? null,
				costNanos: row.costNanos ?? null,
				costUsd: row.costUsd ?? null,
				meta: row.meta ?? {},
				createdAt: null,
				updatedAt: null,
				completedAt: row.completedAt ?? null,
			})),
		);
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

vi.mock("@core/batch-reservations", () => ({
	reserveBatchCredits: vi.fn(async ({ requestId }: { requestId: string }) => ({
		reservationId: `batch_hold:${requestId}`,
		reservedNanos: 10_000_000_000,
		status: "held",
		held: true,
		estimate: {
			strategy: "utf8_input_upper_bound_v1",
			requestCount: 1,
			inputTokenUpperBound: 64,
			outputTokenUpperBound: 16,
			marginBps: 1_000,
		},
	})),
}));

vi.mock("@core/wallet-reservations", () => ({
	releaseStaleOrphanBatchReservations: vi.fn(async () => 0),
	releaseWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.releaseCalls.push(args);
		return { status: "released", applied: true };
	}),
}));

vi.mock("@core/webhook-endpoints", () => ({
	getWebhookEndpointSigningConfig: vi.fn(async (args: { endpointId: string }) => {
		if (String(args.endpointId ?? "").startsWith("we_")) {
			return {
				id: args.endpointId,
				url: "https://hooks.example/aistats",
				secret: "whsec_test",
				events: ["batch.completed", "batch.failed", "batch.cancelled"],
			};
		}
		return null;
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

	it("applies originating key limits before uploading or submitting provider work", async () => {
		state.guardContextFailure = jsonResponse({ error: "key_limit_exceeded", reason: "daily_request_limit_reached" }, 429);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				model: "openai/gpt-4.1-mini",
				requests: [{ body: { model: "openai/gpt-4.1-mini", input: "hello", max_output_tokens: 8 } }],
			}),
		});
		expect(response.status).toBe(429);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("enforces provider restrictions attached to the originating key", async () => {
		state.policyAllowedProviders = ["anthropic"];
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				model: "openai/gpt-4.1-mini",
				requests: [{ body: { model: "openai/gpt-4.1-mini", input: "hello", max_output_tokens: 8 } }],
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "validation_error", reason: "batch_provider_not_allowed" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("proxies create + retrieve completed flow while keeping gateway-only fields local", async () => {
		state.fileMeta.set(fileKey("ws_batch_test", "file_input_123"), {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});
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

				if (url === "https://api.openai.example/v1/files/file_input_123/content" && method === "GET") {
					return new Response(JSON.stringify({ body: { model: "gpt-4.1-mini", max_output_tokens: 16 } }), { status: 200 });
				}
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
				webhook_endpoint_id: "we_batch_123",
			}),
		});

		expect(createResponse.status).toBe(200);
		const createPayload = await createResponse.json();
		expect(createPayload).toMatchObject({
			id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
			native_batch_id: "batch_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}$/),
			cancel_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}\/cancel$/),
			request_id: expect.any(String),
			provider: "openai",
			session_id: "session_123",
			webhook: {
				url: null,
				events: [],
				has_secret: true,
			},
			pricing_lines: [],
		});
		const publicBatchId = String(createPayload.id);
		expect(createPayload.webhook).not.toHaveProperty("secret");

		expect(state.fetchCalls[1]?.url).toBe("https://api.openai.example/v1/batches");
		expect(state.fetchCalls[1]?.bodyJson).toMatchObject({
			input_file_id: "file_input_123",
			endpoint: "/v1/responses",
			completion_window: "24h",
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", publicBatchId))).toMatchObject({
			provider: "openai",
			sessionId: "session_123",
			status: "queued",
			nativeBatchId: "batch_123",
			inputFileId: "file_input_123",
			outputFileId: "file_output_123",
			webhook: {
				endpoint_id: "we_batch_123",
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
				internalId: publicBatchId,
				phase: "created",
			},
		]);

		const retrieveResponse = await batchRoutes.request(`https://example.com/${publicBatchId}`, {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: publicBatchId,
			native_batch_id: "batch_123",
			status: "completed",
			lifecycle_status: "completed",
			polling_url: `https://example.com/${publicBatchId}`,
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
		expect(state.batchMeta.get(batchKey("ws_batch_test", publicBatchId))).toMatchObject({
			status: "completed",
			nativeBatchId: "batch_123",
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
				internalId: publicBatchId,
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "completed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: publicBatchId,
				status: "completed",
			},
		]);
	});

	it("proxies a failed retrieval flow and dispatches failed webhook phase", async () => {
		state.fileMeta.set(fileKey("ws_batch_test", "file_input_fail_123"), {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();

				if (url === "https://api.openai.example/v1/files/file_input_fail_123/content" && method === "GET") {
					return new Response(JSON.stringify({ body: { model: "gpt-4.1-mini", max_output_tokens: 16 } }), { status: 200 });
				}
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
		const createPayload = await createResponse.json();
		expect(createPayload).toMatchObject({
			id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
			native_batch_id: "batch_fail_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}$/),
			cancel_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}\/cancel$/),
		});
		const publicBatchId = String(createPayload.id);

		const retrieveResponse = await batchRoutes.request(`https://example.com/${publicBatchId}`, {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: publicBatchId,
			native_batch_id: "batch_fail_123",
			status: "failed",
			lifecycle_status: "failed",
			polling_url: `https://example.com/${publicBatchId}`,
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
		expect(state.batchMeta.get(batchKey("ws_batch_test", publicBatchId))).toMatchObject({
			status: "failed",
			nativeBatchId: "batch_fail_123",
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
				internalId: publicBatchId,
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "failed",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: publicBatchId,
				status: "failed",
			},
		]);
	});

	it("rejects file-based batch creation when the input file is not owned", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				state.fetchCalls.push({
					url: String(input),
					method: String(init?.method ?? "GET").toUpperCase(),
					bodyText: typeof init?.body === "string" ? init.body : null,
					bodyJson: null,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				return jsonResponse({ ok: false }, 500);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_unowned_123",
				endpoint: "/v1/responses",
				session_id: "session_unowned_123",
			}),
		});

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			error: "not_found",
			reason: "batch_input_file_not_found_or_not_owned",
			file_id: "file_unowned_123",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("rejects ad hoc batch webhook secrets in favor of managed webhook endpoints", async () => {
		state.fileMeta.set(fileKey("ws_batch_test", "file_input_webhook_123"), {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Invalid webhook config should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_webhook_123",
				endpoint: "/v1/responses",
				webhook: {
					url: "https://example.com/hooks/batch",
					secret: "whsec_plaintext",
				},
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "validation_error",
			reason: "batch_webhook_endpoint_required",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("rejects unknown managed batch webhook endpoints before provider submission", async () => {
		state.fileMeta.set(fileKey("ws_batch_test", "file_input_webhook_456"), {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Unknown webhook endpoint should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input_file_id: "file_input_webhook_456",
				endpoint: "/v1/responses",
				webhook_endpoint_id: "missing_endpoint",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "validation_error",
			reason: "batch_webhook_endpoint_not_found_or_inactive",
			webhook_endpoint_id: "missing_endpoint",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("creates provider-native batches for supported providers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				if (url === "https://api.groq.com/openai/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_groq_input", purpose: "batch", status: "uploaded" });
				}
				if (url === "https://api.groq.com/openai/v1/batches" && method === "POST") {
					return jsonResponse({ id: "batch_groq", status: "validating", input_file_id: "file_groq_input" });
				}
				if (url === "https://api.together.xyz/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_together_input", purpose: "batch-api", status: "uploaded" });
				}
				if (url === "https://api.together.xyz/v1/batches" && method === "POST") {
					return jsonResponse({ id: "batch_together", status: "VALIDATING", input_file_id: "file_together_input" });
				}
				if (url === "https://api.mistral.ai/v1/batch/jobs" && method === "POST") {
					return jsonResponse({ id: "batch_mistral", status: "RUNNING", total_requests: 1, succeeded_requests: 0, failed_requests: 0 });
				}
				if (url === "https://api.anthropic.com/v1/messages/batches" && method === "POST") {
					return jsonResponse({ id: "batch_anthropic", processing_status: "in_progress", request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 } });
				}
				if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent" && method === "POST") {
					return jsonResponse({ name: "batches/batch_gemini", metadata: { state: "BATCH_STATE_RUNNING", batchStats: { requestCount: 1, successfulRequestCount: 0, failedRequestCount: 0 } } });
				}
				if (url === "https://api.x.ai/v1/batches" && method === "POST") {
					return jsonResponse({ batch_id: "batch_xai", state: { num_requests: 0, num_pending: 0, num_success: 0, num_error: 0 } });
				}
				if (url === "https://api.x.ai/v1/batches/batch_xai/requests" && method === "POST") {
					return jsonResponse({ ok: true });
				}
				if (url === "https://api.x.ai/v1/batches/batch_xai" && method === "GET") {
					return jsonResponse({ batch_id: "batch_xai", state: { num_requests: 1, num_pending: 1, num_success: 0, num_error: 0 } });
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const makePayload = (label: string, model: string) => ({
			endpoint: "/v1/chat/completions",
			model,
			requests: [
				{
					custom_id: `${label}-request-1`,
					body: {
						model,
						messages: [{ role: "user", content: "Hello" }],
					},
				},
			],
		});

		for (const [provider, model, expectedId] of [
			["mistral", "mistral-large-latest", "batch_mistral"],
			["anthropic", "claude-4-sonnet", "batch_anthropic"],
			["gemini", "gemini-2.5-flash", "batch_gemini"],
		] as const) {
			const response = await batchRoutes.request("https://example.com/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(makePayload(provider, model)),
			});
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
				native_batch_id: provider === "gemini" ? "batches/batch_gemini" : expectedId,
				request_id: expect.any(String),
			});
		}

		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.mistral.ai/v1/batch/jobs",
			"POST https://api.anthropic.com/v1/messages/batches",
			"POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent",
		]);
		expect(state.fetchCalls[0]?.bodyJson).toMatchObject({
			endpoint: "/v1/chat/completions",
			model: "mistral-large-latest",
			requests: [
				{
					custom_id: "mistral-request-1",
					body: {
						model: "mistral-large-latest",
					},
				},
			],
		});
		expect(state.fetchCalls[1]?.bodyJson).toMatchObject({
			requests: [
				{
					custom_id: "anthropic-request-1",
					params: {
						model: "claude-4-sonnet",
					},
				},
			],
		});
		expect(state.fetchCalls[2]?.bodyJson).toMatchObject({
			batch: {
				model: "models/gemini-2.5-flash",
				displayName: expect.stringMatching(/^phaseo-batch_/),
				inputConfig: {
					requests: {
						requests: [
							{
								request: {
									model: "models/gemini-2.5-flash",
								},
								metadata: { custom_id: "gemini-request-1" },
							},
						],
					},
				},
			},
		});
		const savedJobs = Array.from(state.batchMeta.values());
		expect(savedJobs).toEqual(expect.arrayContaining([
			expect.objectContaining({ provider: "mistral", nativeBatchId: "batch_mistral", status: "in_progress", apiKeyId: "key_batch_test" }),
			expect.objectContaining({ provider: "anthropic", nativeBatchId: "batch_anthropic", status: "in_progress", apiKeyId: "key_batch_test" }),
			expect.objectContaining({ provider: "google-ai-studio", nativeBatchId: "batches/batch_gemini", apiKeyId: "key_batch_test" }),
		]));
	});

	it("routes requests batches from row-level models without requiring a top-level model", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				if (url === "https://api.anthropic.com/v1/messages/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_anthropic_row_model",
						processing_status: "in_progress",
						request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
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
				requests: [
					{
						custom_id: "anthropic-row-1",
						body: {
							model: "anthropic/claude-haiku-4.5",
							max_tokens: 8,
							messages: [{ role: "user", content: "Reply OK." }],
						},
					},
				],
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
			native_batch_id: "batch_anthropic_row_model",
			provider: "anthropic",
		});
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.anthropic.com/v1/messages/batches",
		]);
		expect(state.fetchCalls[0]?.bodyJson).toMatchObject({
			requests: [
				{
					custom_id: "anthropic-row-1",
					params: {
						model: "claude-haiku-4-5-20251001",
					},
				},
			],
		});
		expect(Array.from(state.batchMeta.values())).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: "anthropic",
				model: null,
				inputMode: "requests",
				nativeBatchId: "batch_anthropic_row_model",
			}),
		]));
	});

	it("rejects mixed-model OpenAI request batches before uploading provider files", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Mixed-model OpenAI batches should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				requests: [
					{
						custom_id: "openai-row-1",
						body: { model: "openai/gpt-5.4-nano", input: "Hello" },
					},
					{
						custom_id: "openai-row-2",
						body: { model: "openai/gpt-5.4-mini", input: "Hello again" },
					},
				],
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "batch_multiple_models_not_supported",
			provider: "openai",
			models: ["openai/gpt-5.4-nano", "openai/gpt-5.4-mini"],
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("allows mixed-model Anthropic batches because the native batch params carry each model", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				if (url === "https://api.anthropic.com/v1/messages/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_anthropic_mixed_models",
						processing_status: "in_progress",
						request_counts: { processing: 2, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
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
				provider: "anthropic",
				requests: [
					{
						custom_id: "anthropic-row-1",
						body: {
							model: "anthropic/claude-haiku-4.5",
							max_tokens: 8,
							messages: [{ role: "user", content: "Reply OK." }],
						},
					},
					{
						custom_id: "anthropic-row-2",
						body: {
							model: "anthropic/claude-sonnet-4.5",
							max_tokens: 8,
							messages: [{ role: "user", content: "Reply OK." }],
						},
					},
				],
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			native_batch_id: "batch_anthropic_mixed_models",
			provider: "anthropic",
		});
		expect(state.fetchCalls[0]?.bodyJson).toMatchObject({
			requests: [
				{
					custom_id: "anthropic-row-1",
					params: { model: "claude-haiku-4-5-20251001" },
				},
				{
					custom_id: "anthropic-row-2",
					params: { model: "claude-sonnet-4-5-20250929" },
				},
			],
		});
	});

	it("rejects Anthropic custom ids outside the provider contract before submission", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "anthropic",
				requests: [{
					custom_id: "invalid custom id",
					body: {
						model: "anthropic/claude-haiku-4.5",
						max_tokens: 32,
						messages: [{ role: "user", content: "Reply OK." }],
					},
				}],
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ reason: "anthropic_batch_custom_id_invalid" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(state.batchMeta.size).toBe(0);
	});

	it("keeps blocked xAI batches disabled even when explicitly configured", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				if (url === "https://api.x.ai/v1/batches" && method === "POST") {
					return jsonResponse({ batch_id: "batch_xai_mixed", state: { num_requests: 0, num_pending: 0, num_success: 0, num_error: 0 } });
				}
				if (url === "https://api.x.ai/v1/batches/batch_xai_mixed/requests" && method === "POST") {
					return jsonResponse({ ok: true });
				}
				if (url === "https://api.x.ai/v1/batches/batch_xai_mixed" && method === "GET") {
					return jsonResponse({ batch_id: "batch_xai_mixed", state: { num_requests: 2, num_pending: 2, num_success: 0, num_error: 0 } });
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "xai",
				requests: [
					{
						custom_id: "xai-row-1",
						body: { model: "x-ai/grok-4", input: "Reply OK." },
					},
					{
						custom_id: "xai-row-2",
						body: { model: "x-ai/grok-4-fast", input: "Reply OK again." },
					},
				],
			}),
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: {
				reason: "batch_provider_preview_disabled",
			},
		});
		expect(state.fetchCalls).toEqual([]);
	});

	it("keeps experimental file-backed providers disabled even when explicitly configured", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				state.fetchCalls.push({
					url,
					method,
					bodyText: typeof init?.body === "string" ? init.body : null,
					bodyJson: typeof init?.body === "string" ? JSON.parse(init.body) : null,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});
				if (url === "https://api.groq.com/openai/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_groq_mixed", purpose: "batch", status: "uploaded" });
				}
				if (url === "https://api.groq.com/openai/v1/batches" && method === "POST") {
					return jsonResponse({ id: "batch_groq_mixed", status: "validating", input_file_id: "file_groq_mixed" });
				}
				if (url === "https://api.together.xyz/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_together_mixed", purpose: "batch-api", status: "uploaded" });
				}
				if (url === "https://api.together.xyz/v1/batches" && method === "POST") {
					return jsonResponse({ id: "batch_together_mixed", status: "VALIDATING", input_file_id: "file_together_mixed" });
				}
				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		for (const [provider, firstModel, secondModel] of [
			["groq", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
			["together", "meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen3-235B-A22B-fp8-tput"],
		] as const) {
			const response = await batchRoutes.request("https://example.com/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					provider,
					endpoint: "/v1/chat/completions",
					requests: [
						{
							custom_id: `${provider}-row-1`,
							body: { model: firstModel, messages: [{ role: "user", content: "Reply OK." }] },
						},
						{
							custom_id: `${provider}-row-2`,
							body: { model: secondModel, messages: [{ role: "user", content: "Reply OK again." }] },
						},
					],
				}),
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({
				error: { reason: "batch_provider_preview_disabled" },
			});
		}

		expect(state.fetchCalls).toEqual([]);
	});

	it("rejects mixed-provider request batches until provider fan-out is implemented", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Mixed-provider batch routing should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				requests: [
					{
						custom_id: "openai-row",
						body: { model: "openai/gpt-5.4-nano", input: "Hello" },
					},
					{
						custom_id: "anthropic-row",
						body: {
							model: "anthropic/claude-haiku-4.5",
							max_tokens: 8,
							messages: [{ role: "user", content: "Hello" }],
						},
					},
				],
			}),
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: {
				type: "not_implemented",
				reason: "batch_multi_provider_requests_not_supported",
				input_mode: "requests",
				requested_providers: ["openai", "anthropic"],
			},
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("creates batches from model and prompts without provider or endpoint", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_openai_prompt_input", purpose: "batch", status: "uploaded" });
				}
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({ id: "batch_openai_prompt", status: "validating", input_file_id: "file_openai_prompt_input" });
				}
				if (url === "https://api.anthropic.com/v1/messages/batches" && method === "POST") {
					return jsonResponse({ id: "batch_anthropic_prompt", processing_status: "in_progress", request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 } });
				}
				if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent" && method === "POST") {
					return jsonResponse({ name: "batches/batch_gemini_prompt", metadata: { state: "BATCH_STATE_RUNNING", batchStats: { requestCount: 1, successfulRequestCount: 0, failedRequestCount: 0 } } });
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");

		for (const payload of [
			{ model: "openai/gpt-5-mini", prompts: ["Summarize this record."] },
			{ model: "anthropic/claude-sonnet-4", prompts: ["Summarize this record."] },
			{ model: "google/gemini-2.5-flash", prompts: ["Summarize this record."] },
		]) {
			const response = await batchRoutes.request("https://example.com/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			expect(response.status).toBe(200);
		}

		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"POST https://api.openai.example/v1/batches",
			"POST https://api.anthropic.com/v1/messages/batches",
			"POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent",
		]);
		expect(state.fetchCalls[1]?.bodyJson).toMatchObject({
			endpoint: "/v1/responses",
			input_file_id: "file_openai_prompt_input",
		});
		expect(state.fetchCalls[2]?.bodyJson).toMatchObject({
			requests: [
				{
					custom_id: "request-1",
					params: {
						model: "claude-sonnet-4",
						max_tokens: 1024,
						messages: [{ role: "user", content: "Summarize this record." }],
					},
				},
			],
		});
		expect(state.fetchCalls[3]?.bodyJson).toMatchObject({
			batch: {
				model: "models/gemini-2.5-flash",
				inputConfig: {
					requests: {
						requests: [
							{
								request: {
									contents: [{ role: "user", parts: [{ text: "Summarize this record." }] }],
								},
							},
						],
					},
				},
			},
		});
	});

	it("creates an OpenAI batch for GPT 5.4 Nano from prompt shorthand", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					expect(init?.body).toBeInstanceOf(FormData);
					const form = init?.body as FormData;
					expect(form.get("purpose")).toBe("batch");
					const file = form.get("file") as File;
					expect(file.name).toMatch(/^aistats-batch-.+\.jsonl$/);
					const line = JSON.parse((await file.text()).trim());
					expect(line).toEqual({
						custom_id: "request-1",
						method: "POST",
						url: "/v1/responses",
						body: {
							model: "gpt-5.4-nano",
							input: "Summarize this record for an offline eval.",
							max_output_tokens: 48,
						},
					});
					return jsonResponse({ id: "file_gpt54nano_input", purpose: "batch", status: "uploaded" });
				}
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_gpt54nano",
						status: "validating",
						endpoint: "/v1/responses",
						input_file_id: "file_gpt54nano_input",
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
				model: "openai/gpt-5.4-nano",
				prompts: ["Summarize this record for an offline eval."],
				max_tokens: 48,
				webhook_endpoint_id: "we_123",
			}),
		});

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload).toMatchObject({
			id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
			native_batch_id: "batch_gpt54nano",
			status: "validating",
			lifecycle_status: "pending",
			provider: "openai",
			input_file_id: "file_gpt54nano_input",
			webhook: {
				url: null,
				has_secret: true,
			},
		});
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"POST https://api.openai.example/v1/batches",
		]);
		expect(state.fetchCalls[1]?.bodyJson).toMatchObject({
			endpoint: "/v1/responses",
			input_file_id: "file_gpt54nano_input",
		});
		expect(state.batchMeta.get(batchKey("ws_batch_test", String(payload.id)))).toMatchObject({
			provider: "openai",
			model: "openai/gpt-5.4-nano",
			nativeBatchId: "batch_gpt54nano",
			inputFileId: "file_gpt54nano_input",
			webhook: {
				endpoint_id: "we_123",
			},
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_gpt54nano_input"))).toMatchObject({
			provider: "openai",
			purpose: "batch",
			status: "uploaded",
			keySource: "gateway",
		});
	});

	it("finalizes an OpenAI batch through reconciliation without user result fetch", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				const bodyText = typeof init?.body === "string" ? init.body : null;
				const bodyJson = bodyText ? JSON.parse(bodyText) : null;
				state.fetchCalls.push({
					url,
					method,
					bodyText,
					bodyJson,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					return jsonResponse({ id: "file_reconcile_input", purpose: "batch", status: "uploaded" });
				}
				if (url === "https://api.openai.example/v1/batches" && method === "POST") {
					return jsonResponse({
						id: "batch_reconcile_native",
						status: "in_progress",
						endpoint: "/v1/responses",
						input_file_id: "file_reconcile_input",
					});
				}
				if (url === "https://api.openai.example/v1/batches/batch_reconcile_native" && method === "GET") {
					return jsonResponse({
						id: "batch_reconcile_native",
						status: "completed",
						endpoint: "/v1/responses",
						input_file_id: "file_reconcile_input",
						output_file_id: "file_reconcile_output",
						error_file_id: "file_reconcile_error",
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { batchRoutes } = await import("./batches");
		const { runBatchReconciliationJob } = await import("@pipeline/batch-reconciliation");

		const createResponse = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "openai/gpt-5.4-nano",
				prompts: ["Reply with OK."],
				max_tokens: 8,
				webhook_endpoint_id: "we_reconcile_123",
			}),
		});

		expect(createResponse.status).toBe(200);
		const createPayload = await createResponse.json();
		const publicBatchId = String(createPayload.id);
		expect(publicBatchId).toMatch(/^batch_[A-Z0-9]{26}$/);
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "created",
			},
		]);

		const summary = await runBatchReconciliationJob({
			limit: 25,
			concurrency: 1,
			workerId: "route-test-worker",
			leaseSeconds: 300,
			shardCount: 1,
			shardIndex: 0,
		});

		expect(summary).toMatchObject({
			jobsScanned: 1,
			jobsPolled: 1,
			jobsUpdated: 1,
			jobsCompleted: 1,
			jobsErrored: 0,
		});
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"POST https://api.openai.example/v1/batches",
			"GET https://api.openai.example/v1/batches/batch_reconcile_native",
		]);
		expect(state.batchMeta.get(batchKey("ws_batch_test", publicBatchId))).toMatchObject({
			provider: "openai",
			status: "completed",
			nativeBatchId: "batch_reconcile_native",
			inputFileId: "file_reconcile_input",
			outputFileId: "file_reconcile_output",
			errorFileId: "file_reconcile_error",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_reconcile_output"))).toMatchObject({
			provider: "openai",
			status: "available",
		});
		expect(state.fileMeta.get(fileKey("ws_batch_test", "file_reconcile_error"))).toMatchObject({
			provider: "openai",
			status: "available",
		});
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: publicBatchId,
				status: "completed",
			},
		]);
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "completed",
			},
		]);
		expect(state.reconciliationUpdates).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: publicBatchId,
				nextReconcileAt: null,
				lastError: null,
			},
		]);
	});

	it("uses stored native batch ids for upstream retrieve and cancel while returning public ids", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_public_123"), {
			provider: "openai",
			status: "queued",
			nativeBatchId: "batch_native_123",
			inputFileId: "file_input_native_123",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				state.fetchCalls.push({
					url,
					method,
					bodyText: typeof init?.body === "string" ? init.body : null,
					bodyJson: typeof init?.body === "string" ? JSON.parse(init.body) : null,
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

		const { batchRoutes } = await import("./batches");

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_public_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "batch_public_123",
			status: "in_progress",
			polling_url: "https://example.com/batch_public_123",
			cancel_url: "https://example.com/batch_public_123/cancel",
			provider: "openai",
		});

		const cancelResponse = await batchRoutes.request("https://example.com/batch_public_123/cancel", {
			method: "POST",
		});

		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.json()).toMatchObject({
			id: "batch_public_123",
			status: "cancelled",
			polling_url: "https://example.com/batch_public_123",
			cancel_url: null,
			provider: "openai",
		});
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"GET https://api.openai.example/v1/batches/batch_native_123",
			"POST https://api.openai.example/v1/batches/batch_native_123/cancel",
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: "batch_public_123",
				status: "cancelled",
			},
		]);
	});

	it("lists completed batch request rows by internal batch id", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_public_123"), {
			provider: "openai",
			status: "completed",
			nativeBatchId: "batch_native_123",
			inputFileId: "file_input_native_123",
		});
		state.requestRows.push({
			id: "breq_1",
			workspaceId: "ws_batch_test",
			batchId: "batch_public_123",
			provider: "openai",
			nativeBatchId: "batch_native_123",
			customId: "request-1",
			requestIndex: 0,
			method: "POST",
			endpoint: "/v1/responses",
			model: "gpt-5.4-nano",
			status: "completed",
			requestBodyHash: "hash:request-1",
			responseStatus: 200,
			responseBody: { output_text: "ok" },
			errorBody: null,
			usage: { input_tokens: 5, output_tokens: 2 },
			costNanos: 1234,
			costUsd: 0.000001234,
			meta: {},
			createdAt: "2026-06-17T18:00:00.000Z",
			updatedAt: "2026-06-17T18:01:00.000Z",
			completedAt: "2026-06-17T18:01:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Listing stored result rows should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const response = await batchRoutes.request("https://example.com/batch_public_123/requests?limit=10", {
			method: "GET",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			object: "list",
			batch_id: "batch_public_123",
			data: [
				{
					id: "breq_1",
					custom_id: "request-1",
					request_index: 0,
					provider: "openai",
					native_batch_id: "batch_native_123",
					method: "POST",
					endpoint: "/v1/responses",
					model: "gpt-5.4-nano",
					status: "completed",
					request_body_hash: "hash:request-1",
					response_status: 200,
					response_body: null,
					error_body: null,
					usage: { input_tokens: 5, output_tokens: 2 },
					cost_nanos: 1234,
					cost_usd: 0.000001234,
					meta: {},
					created_at: "2026-06-17T18:00:00.000Z",
					updated_at: "2026-06-17T18:01:00.000Z",
					completed_at: "2026-06-17T18:01:00.000Z",
				},
			],
		});
		expect(state.fetchCalls).toEqual([]);
	});

	it("does not allow provider-native ids as user-facing batch ids", async () => {
		state.batchMeta.set(batchKey("ws_batch_test", "batch_public_123"), {
			provider: "openai",
			status: "queued",
			nativeBatchId: "batch_native_123",
			inputFileId: "file_input_native_123",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Native id lookup should not call upstream");
			}),
		);

		const { batchRoutes } = await import("./batches");

		const retrieveResponse = await batchRoutes.request("https://example.com/batch_native_123", {
			method: "GET",
		});
		const requestsResponse = await batchRoutes.request("https://example.com/batch_native_123/requests", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(404);
		expect(requestsResponse.status).toBe(404);
		expect(state.fetchCalls).toEqual([]);
	});

	it("does not submit a provider batch when durable submission intent persistence fails", async () => {
		state.saveBatchJobError = new Error("database unavailable");
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = String(init?.method ?? "GET").toUpperCase();
			state.fetchCalls.push({ url, method, bodyText: typeof init?.body === "string" ? init.body : null, bodyJson: typeof init?.body === "string" ? JSON.parse(init.body) : null, headers: {} });
			if (url.endsWith("/files") && method === "POST") return jsonResponse({ id: "file_persist_failure" });
			if (url.endsWith("/batches") && method === "POST") return jsonResponse({ id: "batch_native_persist_failure", status: "validating", input_file_id: "file_persist_failure" });
			if (url.endsWith("/batches/batch_native_persist_failure/cancel") && method === "POST") return jsonResponse({ id: "batch_native_persist_failure", status: "cancelling" });
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: { reason: "batch_submission_persistence_failed" } });
		expect(state.fetchCalls.some((call) => call.url.endsWith("/batches"))).toBe(false);
		expect(state.batchMeta.size).toBe(0);
	});

	it("keeps accepted batches reconcilable when the post-submit metadata write fails", async () => {
		state.saveBatchJobError = new Error("database unavailable after provider acceptance");
		state.saveBatchJobErrorOnCall = 2;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = String(init?.method ?? "GET").toUpperCase();
			if (url.endsWith("/files") && method === "POST") return jsonResponse({ id: "file_post_submit_failure" });
			if (url.endsWith("/batches") && method === "POST") {
				return jsonResponse({ id: "batch_native_post_submit_failure", status: "validating", input_file_id: "file_post_submit_failure" });
			}
			if (url.endsWith("/batches/batch_native_post_submit_failure/cancel") && method === "POST") {
				return jsonResponse({ id: "batch_native_post_submit_failure", status: "cancelling" });
			}
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		const payload = await response.json();
		expect(response.status).toBe(502);
		expect(payload).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				batch_id: expect.stringMatching(/^batch_/),
				native_batch_id: "batch_native_post_submit_failure",
				reservation_status: "held",
			},
		});
		expect(state.statusUpdates).toContainEqual(expect.objectContaining({
			status: "cancelling",
			metaPatch: expect.objectContaining({
				nativeBatchId: "batch_native_post_submit_failure",
				submissionOutcome: "accepted",
				reservationStatus: "held",
			}),
		}));
		expect(state.finalizeCalls).toEqual([]);
	});

	it("enforces the provider preview allowlist on discovery and submission", async () => {
		state.previewProviders = "openai";
		vi.stubGlobal("fetch", vi.fn(async () => {
			throw new Error("Preview-disabled providers must not reach upstream APIs");
		}));
		const { batchRoutes } = await import("./batches");
		const capabilities = await batchRoutes.request("https://example.com/capabilities", { method: "GET" });
		expect(capabilities.status).toBe(200);
		expect((await capabilities.json()).data).toEqual([
			expect.objectContaining({ id: "openai", status: "active" }),
		]);

		const create = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "anthropic",
				model: "anthropic/claude-haiku-4.5",
				max_tokens: 16,
				prompts: ["hello"],
			}),
		});
		expect(create.status).toBe(403);
		expect(await create.json()).toMatchObject({
			error: {
				reason: "batch_provider_preview_disabled",
				requested_providers: ["anthropic"],
				enabled_providers: ["openai"],
			},
		});
		expect(state.fetchCalls).toEqual([]);
	});

	it("retains the hold and quarantines the job when provider acceptance is unknown", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = String(init?.method ?? "GET").toUpperCase();
			if (url.endsWith("/files") && method === "POST") return jsonResponse({ id: "file_unknown_submission" });
			if (url.endsWith("/batches") && method === "POST") throw new Error("connection reset after request body was sent");
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		const payload = await response.json();
		expect(response.status).toBe(502);
		expect(payload).toMatchObject({
			error: {
				type: "upstream_outcome_unknown",
				reason: "batch_provider_create_outcome_unknown",
				reservation_status: "held",
				batch_id: expect.stringMatching(/^batch_/),
			},
		});
		const batchId = String(payload.error.batch_id);
		expect(state.batchMeta.get(batchKey("ws_batch_test", batchId))).toMatchObject({
			status: "submission_unknown",
			reservationStatus: "held",
			submissionOutcome: "unknown",
		});
		expect(state.finalizeCalls).toEqual([]);
		expect(state.operationalFailures).toContainEqual(expect.objectContaining({
			workflow: "batch_submission",
			resourceId: batchId,
		}));
	});

	it("finalizes definite provider rejections so they do not re-enter reconciliation", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = String(init?.method ?? "GET").toUpperCase();
			if (url.endsWith("/files") && method === "POST") return jsonResponse({ id: "file_rejected_submission" });
			if (url.endsWith("/batches") && method === "POST") return jsonResponse({ error: { message: "invalid model" } }, 400);
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		expect(response.status).toBe(400);
		const [finalization] = state.finalizeCalls;
		expect(finalization).toMatchObject({ workspaceId: "ws_batch_test", status: "failed" });
		const batchId = String(finalization?.batchId);
		expect(state.batchMeta.get(batchKey("ws_batch_test", batchId))).toMatchObject({
			status: "failed",
			submissionOutcome: "rejected",
			submissionError: "batch_provider_create_rejected_400",
		});
	});

	it("treats provider 5xx responses as an unknown outcome and keeps the hold", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = String(init?.method ?? "GET").toUpperCase();
			if (url.endsWith("/files") && method === "POST") return jsonResponse({ id: "file_503_submission" });
			if (url.endsWith("/batches") && method === "POST") return jsonResponse({ error: "temporary" }, 503);
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: {
				reason: "batch_provider_create_http_503_outcome_unknown",
				reservation_status: "held",
			},
		});
		expect(state.finalizeCalls).toEqual([]);
	});

	it("releases the reservation when provider-file upload throws before submission", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).endsWith("/files")) throw new Error("provider upload unavailable");
			throw new Error(`Unexpected fetch ${String(input)}`);
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", max_output_tokens: 16, prompts: ["hello"] }),
		});
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ reason: "batch_input_file_upload_failed" });
		expect(state.releaseCalls).toEqual([expect.objectContaining({
			workspaceId: "ws_batch_test",
			keyId: "key_batch_test",
			reservationId: expect.stringMatching(/^batch_hold:/),
		})]);
		expect(state.batchMeta.size).toBe(0);
	});

	it("releases pre-dispatch credential failures instead of quarantining them", async () => {
		state.googleApiKey = null;
		vi.stubGlobal("fetch", vi.fn(async () => {
			throw new Error("missing credentials must not dispatch");
		}));
		const { batchRoutes } = await import("./batches");
		const response = await batchRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "gemini",
				model: "gemini-2.5-flash",
				requests: [{ custom_id: "gemini-1", body: { model: "gemini-2.5-flash", contents: [{ parts: [{ text: "hello" }] }] } }],
			}),
		});
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ reason: "google_ai_studio_key_missing" });
		expect(state.finalizeCalls).toEqual([expect.objectContaining({ status: "failed" })]);
		expect(Array.from(state.batchMeta.values())).toEqual(expect.arrayContaining([
			expect.objectContaining({ submissionOutcome: "rejected", status: "failed" }),
		]));
		expect(state.operationalFailures).toEqual([]);
	});

	it("proxies batch cancellation and dispatches a cancelled webhook phase", async () => {
		state.fileMeta.set(fileKey("ws_batch_test", "file_input_cancel_123"), {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});
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

				if (url === "https://api.openai.example/v1/files/file_input_cancel_123/content" && method === "GET") {
					return new Response(JSON.stringify({ body: { model: "gpt-4.1-mini", max_output_tokens: 16 } }), { status: 200 });
				}
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
		const createPayload = await createResponse.json();
		expect(createPayload).toMatchObject({
			id: expect.stringMatching(/^batch_[A-Z0-9]{26}$/),
			native_batch_id: "batch_cancel_123",
			status: "queued",
			lifecycle_status: "pending",
			polling_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}$/),
			cancel_url: expect.stringMatching(/^https:\/\/example\.com\/batch_[A-Z0-9]{26}\/cancel$/),
		});
		const publicBatchId = String(createPayload.id);

		const cancelResponse = await batchRoutes.request(`https://example.com/${publicBatchId}/cancel`, {
			method: "POST",
		});

		expect(cancelResponse.status).toBe(200);
		expect(await cancelResponse.json()).toMatchObject({
			id: publicBatchId,
			native_batch_id: "batch_cancel_123",
			status: "cancelled",
			lifecycle_status: "cancelled",
			polling_url: `https://example.com/${publicBatchId}`,
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
		expect(state.fetchCalls[2]?.url).toBe("https://api.openai.example/v1/batches/batch_cancel_123/cancel");
		expect(state.fetchCalls[2]?.bodyJson).toEqual({});
		expect(state.batchMeta.get(batchKey("ws_batch_test", publicBatchId))).toMatchObject({
			status: "cancelled",
			nativeBatchId: "batch_cancel_123",
			inputFileId: "file_input_cancel_123",
		});
		expect(state.webhookEvents).toEqual([
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "created",
			},
			{
				workspaceId: "ws_batch_test",
				kind: "batch",
				internalId: publicBatchId,
				phase: "cancelled",
			},
		]);
		expect(state.finalizeCalls).toEqual([
			{
				workspaceId: "ws_batch_test",
				batchId: publicBatchId,
				status: "cancelled",
			},
		]);
	});
});
