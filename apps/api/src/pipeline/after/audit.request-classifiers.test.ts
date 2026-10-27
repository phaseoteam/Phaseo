import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const rpc = vi.fn(async () => ({ error: null }));
const CLASSIFIER = {
	id: "00000000-0000-4000-8000-0000000000c1", workspace_id: "ws_classified", name: "Department", description: null, enabled: true,
	model: "google/gemini-2.5-flash-lite", instructions: "",
	dimensions: [{ key: "department", name: "Department", description: null, multiple: false, allow_other: true, values: [{ value: "legal", description: null }, { value: "sales", description: null }] }],
	sample_rate_bps: 10_000, sample_by: "request", input_scope: "prompt", scope: {}, monthly_budget_nanos: null,
	created_by: null, created_at: "2026-10-19T12:00:00Z", updated_at: "2026-10-19T12:00:00Z",
};

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/tiered-cache", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	tieredRead: async (options: { key: string; loader: () => Promise<unknown> }) =>
		options.key.startsWith("request-classifiers:") ? [CLASSIFIER] : options.key.startsWith("request-classifier-spend:") ? [] : options.loader(),
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getSupabaseAdmin: () => ({ rpc }),
}));
// The workspace is in the request classifiers beta (#3061). The real gate reads the runtime
// bindings, which this test doesn't configure, so classification was silently skipped.
vi.mock("@core/feature-flags", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	isRequestClassifiersAccessEnabled: async () => true,
}));

import { handleSuccessAudit } from "./audit";

describe("handleSuccessAudit request classifiers", () => {
	it("writes classifier answers as labels, next to caller labels, before the request is persisted", async () => {
		auditSuccessMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		const call = vi.fn(async () => new Response(JSON.stringify({
			id: "resp_classifier_1",
			cost_nanos: 12_000,
			output_text: JSON.stringify({ d0: { value: "legal", confidence: 0.8 } }),
		})));

		await handleSuccessAudit(
			{
				requestId: "req_classified_1",
				workspaceId: "ws_classified",
				endpoint: "chat.completions",
				capability: "text.generate",
				model: "openai/gpt-5.4",
				stream: false,
				body: { messages: [{ role: "user", content: "Is this NDA clause enforceable?" }] },
				rawBody: { messages: [{ role: "user", content: "Is this NDA clause enforceable?" }] },
				requestClassifierCall: call,
				meta: {
					requestId: "req_classified_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
					labels: [{ key: "team", value: "contracts" }],
				},
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
			} as any,
			{
				kind: "completed",
				upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
				provider: "openai",
				generationTimeMs: 120,
				bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "stop" },
				mappedRequest: null,
				rawResponse: { choices: [{ message: { content: "Probably not." } }] },
			} as any,
			false,
			{ output_tokens: 3, total_tokens: 3 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_native_1",
			{ choices: [{ message: { content: "Probably not." } }] },
		);

		expect(call).toHaveBeenCalledTimes(1);
		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const persisted = auditSuccessMock.mock.calls[0][0];
		const expectedLabels = [{ key: "team", value: "contracts" }, { key: "department", value: "legal" }];
		expect(persisted.labels ?? persisted.detailMetadata.labels).toEqual(expectedLabels);
		expect(persisted.detailMetadata.labels).toEqual(expectedLabels);
		expect(persisted.detailMetadata.classifications).toEqual([{
			classifier_id: CLASSIFIER.id,
			status: "classified",
			model: "google/gemini-2.5-flash-lite",
			labels: [{ key: "department", value: "legal", confidence: 0.8 }],
			response_id: "resp_classifier_1",
			cost_nanos: 12_000,
			// How the classifier model was asked (#3066); without a known route it's a schema request.
			format: "json_schema",
		}]);
		expect(rpc).toHaveBeenCalledWith("record_request_classifier_spend", expect.objectContaining({ p_cost_nanos: 12_000 }));
	});
});
