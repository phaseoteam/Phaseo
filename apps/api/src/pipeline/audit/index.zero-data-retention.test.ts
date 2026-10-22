// Purpose: Zero data retention keeps a request's content out of everything the audit stores:
//          the I/O log object in R2 is the only place content goes. The I/O log metadata row
//          still records, without content, that ZDR was why nothing was kept.
// Why: The request's own (or its preset's) require_zero_data_retention only skipped the R2
//      object, so with workspace I/O logging on a database row still kept the full request,
//      response and provider payloads, on success and on both failure paths.
// How: Run auditSuccess and auditFailure with the real I/O log policy, workspace I/O logging
//      on, and a Supabase client and bucket that record every write.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	writes: {} as Record<string, Array<Record<string, any>>>,
	put: vi.fn(async (..._args: unknown[]) => null),
	keyPolicy: { privacyZdrOnly: false, neverStoreContent: false },
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ GATEWAY_IO_LOGS_BUCKET: { put: state.put } }),
	ensureRuntimeForBackground: () => () => {},
	isLocalTestingModeEnabled: () => false,
	getSupabaseAdmin: () => ({
		rpc: async () => ({ data: "event", error: null }),
		from: (table: string) => {
			if (table === "workspace_settings") {
				return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
					data: { io_logging_enabled: true, io_logging_include_provider_payloads: true },
					error: null,
				}) }) }) };
			}
			const record = (row: Record<string, any>) => (state.writes[table] ??= []).push(row);
			return {
				// gateway_requests reads the inserted row back.
				insert: (row: Record<string, any>) => {
					record(row);
					return Object.assign(Promise.resolve({ error: null }), {
						select: () => ({ single: async () => ({
							data: { id: "row_zdr", created_at: "2026-10-22T00:00:00.000Z", workspace_id: "ws_zdr" },
							error: null,
						}) }),
					});
				},
				upsert: async (row: Record<string, any>) => {
					record(row);
					return { error: null };
				},
			};
		},
	}),
}));

vi.mock("@/pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: async () => state.keyPolicy,
}));

vi.mock("../after/apps", () => ({ ensureAppId: async () => "app_zdr" }));

vi.mock("./upstream-requests", () => ({ persistGatewayUpstreamRequests: async () => undefined }));

import { auditFailure, auditSuccess } from "./index";

const PROMPT = "private prompt";
const ANSWER = "private answer";

type Kind = "success" | "before failure" | "execute failure";
type Zdr = { requestPayload?: Record<string, unknown>; zeroDataRetention?: boolean; detailMetadata?: Record<string, unknown>; keyZdr?: boolean };

async function audit(kind: Kind, zdr: Zdr = {}) {
	const shared = {
		requestId: "req_zdr",
		workspaceId: "ws_zdr",
		keyId: "key_zdr",
		model: "openai/gpt-5-mini",
		endpoint: "responses" as const,
		zeroDataRetention: zdr.zeroDataRetention,
		requestPayload: { model: "openai/gpt-5-mini", input: [{ role: "user", content: PROMPT }], ...zdr.requestPayload },
		gatewayResponse: { output: [{ role: "assistant", content: ANSWER }] },
		providerResponse: { output_text: ANSWER },
		detailMetadata: zdr.detailMetadata ?? {},
	};
	if (kind === "success") {
		await auditSuccess({
			...shared,
			provider: "openai",
			stream: false,
			byok: false,
			providerRequest: { input: PROMPT },
			usagePriced: { input_tokens: 3, output_tokens: 2 },
			totalCents: 0,
			totalNanos: 100,
			currency: "USD",
			statusCode: 200,
		});
	} else if (kind === "before failure") {
		await auditFailure({ ...shared, stage: "before", statusCode: 400, errorCode: "user:validation_error" });
	} else {
		await auditFailure({
			...shared,
			stage: "execute",
			stream: false,
			providerRequest: { input: PROMPT },
			statusCode: 502,
			errorCode: "upstream:upstream_error",
		});
	}
}

const kinds: Kind[] = ["success", "before failure", "execute failure"];

describe("audit content storage under zero data retention", () => {
	beforeEach(() => {
		state.writes = {};
		state.put.mockClear();
		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: false };
	});

	it.each(kinds)("stores the I/O log without zero data retention (%s)", async (kind) => {
		await audit(kind);

		expect(state.put).toHaveBeenCalledOnce();
		expect(new TextDecoder().decode(state.put.mock.calls[0]?.[1] as Uint8Array)).toContain(PROMPT);
		expect(state.writes.gateway_io_logs?.[0]?.io_log_status).toBe("stored");
	});

	it.each(kinds.flatMap((kind) => [
		[kind, "the request's provider.require_zero_data_retention", { requestPayload: { provider: { require_zero_data_retention: true } } }],
		[kind, "the request's routing.zdr", { requestPayload: { routing: { zdr: true } } }],
		// A preset's flag is only in the merged body, so it arrives as the context's flag.
		[kind, "the preset (context flag only)", { zeroDataRetention: true }],
		[kind, "the routing diagnostics", { detailMetadata: { routing_diagnostics: { workspacePolicy: { privacyZdrOnly: true } } } }],
		[kind, "a key guardrail", { keyZdr: true }],
	] as Array<[Kind, string, Zdr]>))("stores no content on %s when ZDR comes from %s", async (kind, _source, zdr) => {
		if (zdr.keyZdr) state.keyPolicy = { privacyZdrOnly: true, neverStoreContent: false };

		await audit(kind, zdr);

		// The request itself is still logged, without its content.
		expect(state.writes.gateway_requests).toHaveLength(1);
		expect(state.put).not.toHaveBeenCalled();
		// The I/O log records why, so the request log says "Skipped: zero data retention is required".
		expect(state.writes.gateway_io_logs).toEqual([{
			workspace_id: "ws_zdr",
			request_id: "req_zdr",
			io_log_status: "not_enabled",
			io_log_error: "Skipped: zero data retention is required for this request",
		}]);
	});

	it.each(kinds)("still stores no content for a key that never stores content (%s)", async (kind) => {
		state.keyPolicy = { privacyZdrOnly: false, neverStoreContent: true };

		await audit(kind);

		expect(state.writes.gateway_requests).toHaveLength(1);
		expect(state.put).not.toHaveBeenCalled();
		expect(state.writes.gateway_io_logs).toBeUndefined();
	});
});
