// Purpose: The gateway_request_details row is written with request metadata only, never content.
// Why: With workspace I/O logging on, the row also stored the full request, response and provider
//      payloads, which nothing reads; the logs view and Open in Chat read only the R2 I/O log.
//      Requests served by the regional (EU and US) endpoints, whose I/O log says contents aren't
//      kept, still had them in the row.
// How: Run auditSuccess and auditFailure with workspace I/O logging on, with and without an I/O
//      log bucket, and check every detail row write for the payload columns and the content.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	writes: {} as Record<string, Array<Record<string, any>>>,
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
			if (table === "workspace_settings") {
				return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
					data: { io_logging_enabled: true, io_logging_include_provider_payloads: true },
					error: null,
				}) }) }) };
			}
			const record = (row: Record<string, any>) => (state.writes[table] ??= []).push(row);
			return {
				// gateway_requests reads the inserted row back; gateway_request_details awaits the insert.
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
const CONTENT_COLUMNS = [
	"request_payload",
	"request_content",
	"gateway_response",
	"response_content",
	"provider_request",
	"provider_response",
];

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

describe("gateway_request_details rows", () => {
	beforeEach(() => {
		state.writes = {};
		state.put.mockClear();
	});

	it.each(cases)("are written without content on %s via %s", async (kind, _endpoint, bucket) => {
		state.bucket = bucket;

		await audit(kind);

		const rows = state.writes.gateway_request_details ?? [];
		expect(rows).toHaveLength(1);
		for (const column of CONTENT_COLUMNS) expect(rows[0]).not.toHaveProperty(column);
		expect(JSON.stringify(rows)).not.toContain(PROMPT);
		expect(JSON.stringify(rows)).not.toContain(ANSWER);
		// The row keeps the request's metadata.
		expect(rows[0]).toMatchObject({
			gateway_request_id: "row_details",
			request_id: "req_details",
			workspace_id: "ws_details",
			endpoint: "responses",
			success: kind === "success",
			metadata: expect.objectContaining({ routing_diagnostics: { selectedProvider: "openai" } }),
		});
		// The content still goes to the I/O log in R2 when there's a bucket, and nowhere when there isn't.
		expect(state.put).toHaveBeenCalledTimes(bucket ? 1 : 0);
		expect(state.writes.gateway_io_logs?.[0]?.io_log_status).toBe(bucket ? "stored" : "missing_bucket");
	});
});
