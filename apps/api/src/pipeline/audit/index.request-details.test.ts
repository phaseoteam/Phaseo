// Purpose: The audit never writes to gateway_request_details.
// Why: With workspace I/O logging on, every captured request inserted a row there, at first with the
//      full request, response and provider payloads. Nothing reads the table (the logs view and Open in
//      Chat read only the R2 I/O log), and production no longer has it, so each insert failed and
//      logged an error.
// How: Run auditSuccess and auditFailure with workspace I/O logging on, with and without an I/O log
//      bucket, and check no write reaches the table and no error or warning mentions it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	writes: {} as Record<string, Array<Record<string, any>>>,
	tables: [] as string[],
	put: vi.fn(async (..._args: unknown[]) => null),
	bucket: true,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => (state.bucket ? { GATEWAY_IO_LOGS_BUCKET: { put: state.put } } : {}),
	ensureRuntimeForBackground: () => () => {},
	isLocalTestingModeEnabled: () => false,
	getSupabaseAdmin: () => ({
		rpc: async () => ({ data: "event", error: null }),
		from: (table: string) => {
			state.tables.push(table);
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
							data: { id: "row_details", created_at: "2026-10-22T00:00:00.000Z", workspace_id: "ws_details" },
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
	fetchWorkspacePolicy: async () => ({ privacyZdrOnly: false, neverStoreContent: false }),
}));

vi.mock("../after/apps", () => ({ ensureAppId: async () => "app_details" }));

vi.mock("./upstream-requests", () => ({ persistGatewayUpstreamRequests: async () => undefined }));

import { auditFailure, auditSuccess } from "./index";

const PROMPT = "private prompt";
const ANSWER = "private answer";

type Kind = "success" | "before failure" | "execute failure";

async function audit(kind: Kind) {
	const shared = {
		requestId: "req_details",
		workspaceId: "ws_details",
		keyId: "key_details",
		model: "openai/gpt-5-mini",
		endpoint: "responses" as const,
		requestPayload: { model: "openai/gpt-5-mini", input: [{ role: "user", content: PROMPT }] },
		gatewayResponse: { output: [{ role: "assistant", content: ANSWER }] },
		providerResponse: { output_text: ANSWER },
		detailMetadata: { routing_diagnostics: { selectedProvider: "openai" } },
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
			provider: "openai",
			stream: false,
			providerRequest: { input: PROMPT },
			statusCode: 502,
			errorCode: "upstream:upstream_error",
		});
	}
}

const cases = (["success", "before failure", "execute failure"] as Kind[]).flatMap((kind) => [
	[kind, "the global endpoint", true],
	[kind, "a regional endpoint (no I/O log bucket)", false],
] as Array<[Kind, string, boolean]>);

describe("gateway_request_details", () => {
	beforeEach(() => {
		state.writes = {};
		state.tables = [];
		state.put.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(cases)("is never written on %s via %s", async (kind, _endpoint, bucket) => {
		state.bucket = bucket;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await audit(kind);

		expect(state.tables).not.toContain("gateway_request_details");
		expect(state.writes.gateway_request_details).toBeUndefined();
		const logged = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
		expect(logged).not.toMatch(/request_details|request details/i);
		// The request is still recorded, and its content goes to the I/O log in R2 when there's a
		// bucket and nowhere when there isn't.
		expect(state.writes.gateway_requests).toHaveLength(1);
		expect(state.put).toHaveBeenCalledTimes(bucket ? 1 : 0);
		expect(state.writes.gateway_io_logs?.[0]?.io_log_status).toBe(bucket ? "stored" : "missing_bucket");
	});
});
