import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	settings: {
		io_logging_enabled: true,
		io_logging_retention_days: 365,
		io_logging_include_provider_payloads: true,
		io_logging_billing_status: "active",
	} as Record<string, unknown>,
	bucket: {
		put: vi.fn(async () => null),
	},
	metadataRows: [] as Array<Record<string, unknown>>,
	keyPolicy: { privacyZdrOnly: false } as { privacyZdrOnly: boolean; neverStoreContent?: boolean } | Error,
}));

vi.mock("@/pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: async () => {
		if (state.keyPolicy instanceof Error) throw state.keyPolicy;
		return state.keyPolicy;
	},
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		GATEWAY_IO_LOGS_BUCKET: state.bucket,
		GATEWAY_IO_LOGS_BUCKET_NAME: "ai-stats-gateway-io-logs",
		GATEWAY_IO_LOGGING_MAX_BYTES: "5242880",
	}),
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			if (table === "workspace_settings") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: state.settings, error: null }),
						}),
					}),
				};
			}
			if (table === "gateway_io_logs") {
				return {
					upsert: async (row: Record<string, unknown>) => {
						state.metadataRows.push(row);
						return { error: null };
					},
				};
			}
			throw new Error(`unexpected table: ${table}`);
		},
	}),
}));

describe("persistGatewayIoLog", () => {
	beforeEach(() => {
		state.settings = {
			io_logging_enabled: true,
			io_logging_retention_days: 365,
			io_logging_include_provider_payloads: true,
			io_logging_billing_status: "active",
		};
		state.bucket.put.mockClear();
		state.metadataRows = [];
		state.keyPolicy = { privacyZdrOnly: false };
		vi.resetModules();
	});

	it("does not write an object when workspace logging is disabled", async () => {
		state.settings.io_logging_enabled = false;
		const { persistGatewayIoLog } = await import("./io-logging");

		const result = await persistGatewayIoLog({
			requestId: "req_disabled",
			workspaceId: "workspace_1",
			success: true,
		});

		expect(result).toEqual({ io_log_status: "not_enabled" });
		expect(state.bucket.put).not.toHaveBeenCalled();
		expect(state.metadataRows).toEqual([
			expect.objectContaining({
				workspace_id: "workspace_1",
				request_id: "req_disabled",
				io_log_status: "not_enabled",
			}),
		]);
	});

	it("stores private structured payloads with durable object metadata", async () => {
		const { persistGatewayIoLog } = await import("./io-logging");

		const result = await persistGatewayIoLog({
			requestId: "req_123",
			workspaceId: "workspace_1",
			appId: "app_1",
			keyId: "key_1",
			endpoint: "chat.completions",
			modelId: "phaseo/test",
			provider: "test-provider",
			statusCode: 200,
			success: true,
			requestPayload: { messages: [{ role: "user", content: "Hello" }] },
			gatewayResponse: { id: "chatcmpl_1" },
			providerRequest: { prompt: "Hello" },
			providerResponse: { output: "Hi" },
			metadata: { session_id: "session_1" },
			lifecycleEvents: { version: 1, events: [{ sequence: 1, type: "provider.started", elapsed_ms: 0, timestamp_ms: 1000 }], truncated: false },
		});

		expect(result).toMatchObject({
			io_log_status: "stored",
			io_log_storage_provider: "cloudflare_r2",
			io_log_bucket: "ai-stats-gateway-io-logs",
			io_log_object_key: expect.stringMatching(
				/^workspaces\/workspace_1\/\d{4}\/\d{2}\/\d{2}\/req_123\.json$/,
			),
			io_log_content_type: "application/json",
			io_log_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(state.bucket.put).toHaveBeenCalledTimes(1);
		expect(state.metadataRows).toEqual([
			expect.objectContaining({
				workspace_id: "workspace_1",
				request_id: "req_123",
				io_log_status: "stored",
			}),
		]);

		const [, bytes, options] = state.bucket.put.mock.calls[0] ?? [];
		const payload = JSON.parse(new TextDecoder().decode(bytes as Uint8Array));
		expect(payload).toMatchObject({
			request_id: "req_123",
			workspace_id: "workspace_1",
			provider_request: { prompt: "Hello" },
			provider_response: { output: "Hi" },
			lifecycle_events: { version: 1, events: [{ sequence: 1, type: "provider.started", elapsed_ms: 0, timestamp_ms: 1000 }], truncated: false },
		});
		expect(options).toMatchObject({
			httpMetadata: { contentType: "application/json" },
			customMetadata: {
				request_id: "req_123",
				workspace_id: "workspace_1",
			},
		});
	});

	it("keeps new logs for the included 90-day window when extended retention is suspended", async () => {
		state.settings.io_logging_billing_status = "suspended";
		const { persistGatewayIoLog } = await import("./io-logging");
		const startedAt = Date.now();

		const result = await persistGatewayIoLog({
			requestId: "req_suspended",
			workspaceId: "workspace_1",
			success: true,
		});

		const retentionUntil = Date.parse(result.io_log_retention_until ?? "");
		expect(retentionUntil).toBeGreaterThanOrEqual(startedAt + 89 * 24 * 60 * 60 * 1000);
		expect(retentionUntil).toBeLessThanOrEqual(startedAt + 91 * 24 * 60 * 60 * 1000);
	});

	it("keeps configured extended retention while billing is in grace", async () => {
		state.settings.io_logging_billing_status = "grace";
		const { persistGatewayIoLog } = await import("./io-logging");
		const startedAt = Date.now();

		const result = await persistGatewayIoLog({
			requestId: "req_grace",
			workspaceId: "workspace_1",
			success: true,
		});

		const retentionUntil = Date.parse(result.io_log_retention_until ?? "");
		expect(retentionUntil).toBeGreaterThanOrEqual(startedAt + 364 * 24 * 60 * 60 * 1000);
		expect(retentionUntil).toBeLessThanOrEqual(startedAt + 366 * 24 * 60 * 60 * 1000);
	});

	it("never stores bodies for a zero data retention workspace", async () => {
		state.settings.privacy_zdr_only = true;
		const { persistGatewayIoLog, resolveGatewayIoLoggingPolicy } = await import("./io-logging");

		const policy = await resolveGatewayIoLoggingPolicy({ workspaceId: "workspace_1" });
		const result = await persistGatewayIoLog({
			requestId: "req_zdr_workspace",
			workspaceId: "workspace_1",
			success: true,
			requestPayload: { messages: [{ role: "user", content: "secret" }] },
		});

		expect(policy).toMatchObject({ zeroDataRetention: true, captureEnabled: false });
		expect(result).toEqual({ io_log_status: "not_enabled" });
		expect(state.bucket.put).not.toHaveBeenCalled();
	});

	it("never stores bodies when the key's guardrail requires zero data retention", async () => {
		const { persistGatewayIoLog } = await import("./io-logging");

		const result = await persistGatewayIoLog({
			requestId: "req_zdr_guardrail",
			workspaceId: "workspace_1",
			success: true,
			requestPayload: { messages: [{ role: "user", content: "secret" }] },
			metadata: { routing_diagnostics: { workspacePolicy: { privacyZdrOnly: true } } },
		});

		expect(result).toEqual({
			io_log_status: "not_enabled",
			io_log_error: "Skipped: zero data retention is required for this request",
		});
		expect(state.bucket.put).not.toHaveBeenCalled();
	});

	it("never stores bodies when the key's guardrail requires ZDR, even without diagnostics", async () => {
		state.keyPolicy = { privacyZdrOnly: true };
		const { persistGatewayIoLog, resolveGatewayIoLoggingPolicy } = await import("./io-logging");

		const policy = await resolveGatewayIoLoggingPolicy({ workspaceId: "workspace_1", keyId: "key_1" });
		const result = await persistGatewayIoLog({ requestId: "req_key_zdr", workspaceId: "workspace_1", keyId: "key_1", success: false });

		expect(policy).toMatchObject({ zeroDataRetention: true, captureEnabled: false });
		expect(result).toEqual({ io_log_status: "not_enabled" });
		expect(state.bucket.put).not.toHaveBeenCalled();
	});

	it("keeps bodies out of storage when the key's policy can't be read", async () => {
		state.keyPolicy = new Error("kv down");
		const { resolveGatewayIoLoggingPolicy } = await import("./io-logging");

		await expect(resolveGatewayIoLoggingPolicy({ workspaceId: "workspace_1", keyId: "key_1" }))
			.resolves.toMatchObject({ captureEnabled: false });
	});

	it("never stores bodies for a key created with never_store_content, even with workspace logging on", async () => {
		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: true };
		const { persistGatewayIoLog, resolveGatewayIoLoggingPolicy } = await import("./io-logging");

		const policy = await resolveGatewayIoLoggingPolicy({ workspaceId: "workspace_1", keyId: "key_agent" });
		const result = await persistGatewayIoLog({
			requestId: "req_never_store",
			workspaceId: "workspace_1",
			keyId: "key_agent",
			success: true,
			requestPayload: { messages: [{ role: "user", content: "secret" }] },
			gatewayResponse: { output: "answer" },
		});

		expect(policy).toMatchObject({
			enabled: true,
			zeroDataRetention: false,
			neverStoreContent: true,
			featureEnabled: false,
			captureEnabled: false,
		});
		expect(result).toEqual({ io_log_status: "not_enabled" });
		expect(state.bucket.put).not.toHaveBeenCalled();
	});

	it("still stores bodies for other keys in the same workspace", async () => {
		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: false };
		const { resolveGatewayIoLoggingPolicy } = await import("./io-logging");

		await expect(resolveGatewayIoLoggingPolicy({ workspaceId: "workspace_1", keyId: "key_1" }))
			.resolves.toMatchObject({ neverStoreContent: false, captureEnabled: true });
	});
});

describe("keyNeverStoresContent", () => {
	beforeEach(() => {
		state.keyPolicy = { privacyZdrOnly: false };
		vi.resetModules();
	});

	it("uses what the request context already knows", async () => {
		state.keyPolicy = new Error("must not be read");
		const { keyNeverStoresContent } = await import("./io-logging");

		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_1", known: true })).resolves.toBe(true);
		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_1", known: false })).resolves.toBe(false);
	});

	it("reads the key's policy for requests that failed before routing", async () => {
		const { keyNeverStoresContent } = await import("./io-logging");

		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: true };
		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_agent" })).resolves.toBe(true);
		state.keyPolicy = { privacyZdrOnly: false };
		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_2" })).resolves.toBe(false);
	});

	it("has nothing to look up without a key or a workspace", async () => {
		state.keyPolicy = new Error("must not be read");
		const { keyNeverStoresContent } = await import("./io-logging");

		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: null })).resolves.toBe(false);
		await expect(keyNeverStoresContent({ workspaceId: "unknown", keyId: "key_1" })).resolves.toBe(false);
	});

	it("counts an unreadable policy as never store", async () => {
		state.keyPolicy = new Error("kv down");
		const { keyNeverStoresContent } = await import("./io-logging");

		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_1" })).resolves.toBe(true);
	});

	it("reads ZDR diagnostics from a guardrail rejection's error body", async () => {
		const { persistGatewayIoLog } = await import("./io-logging");

		const result = await persistGatewayIoLog({
			requestId: "req_rejected",
			workspaceId: "workspace_1",
			success: false,
			metadata: { routing_diagnostics: null },
			gatewayResponse: { error: "guardrail_blocked", routing_diagnostics: { workspacePolicy: { privacyZdrOnly: true } } },
		});

		expect(result.io_log_status).toBe("not_enabled");
		expect(state.bucket.put).not.toHaveBeenCalled();
	});
});

describe("keyKeepsContentOutOfTelemetry", () => {
	beforeEach(() => {
		state.keyPolicy = { privacyZdrOnly: false };
		vi.resetModules();
	});

	it("uses what the request context already knows", async () => {
		state.keyPolicy = new Error("must not be read");
		const { keyKeepsContentOutOfTelemetry } = await import("./io-logging");

		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_1", known: true })).resolves.toBe(true);
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_1", known: false })).resolves.toBe(false);
	});

	it("keeps content out under zero data retention, which never_store_content alone does not cover", async () => {
		const { keyKeepsContentOutOfTelemetry, keyNeverStoresContent } = await import("./io-logging");

		// ZDR from the workspace setting or one of the key's guardrails (fetchWorkspacePolicy merges both).
		state.keyPolicy = { privacyZdrOnly: true, neverStoreContent: false };
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_zdr" })).resolves.toBe(true);
		// Broadcasts to the customer's own destination still follow never_store_content only.
		await expect(keyNeverStoresContent({ workspaceId: "workspace_1", keyId: "key_zdr" })).resolves.toBe(false);

		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: true };
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_agent" })).resolves.toBe(true);
		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: false };
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_2" })).resolves.toBe(false);
	});

	it("has nothing to look up without a key or a workspace, and counts an unreadable policy as keep out", async () => {
		state.keyPolicy = new Error("must not be read");
		const { keyKeepsContentOutOfTelemetry } = await import("./io-logging");

		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: null })).resolves.toBe(false);
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "unknown", keyId: "key_1" })).resolves.toBe(false);
		await expect(keyKeepsContentOutOfTelemetry({ workspaceId: "workspace_1", keyId: "key_1" })).resolves.toBe(true);
	});
});
