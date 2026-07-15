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
});
