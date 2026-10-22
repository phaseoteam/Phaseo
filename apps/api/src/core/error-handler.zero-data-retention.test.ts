// Purpose: A request whose preset requires zero data retention keeps its content out of
//          Phaseo's telemetry and stored logs when it fails before the request context exists.
// Why: Before the context exists, neither the raw payload nor the key's policy shows a
//      preset's flag; only the before stage's early observability snapshot carries it.
// How: Run handleError for the no_providers_after_preset_filter rejection with the real
//      telemetry event, and capture what the audit (I/O log and request details) receives.

import { beforeEach, describe, expect, it, vi } from "vitest";

const background = vi.hoisted(() => [] as Promise<unknown>[]);
const sendAxiomWideEvent = vi.hoisted(() => vi.fn(async (_event: Record<string, unknown>) => {}));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { background.push(promise.catch(() => undefined)); },
}));
vi.mock("@observability/axiom", () => ({
	sendAxiomWideEvent,
	emitGatewayTelemetryDeliveryFailure: async () => {},
	emitGatewayOperationalFailure: async () => {},
}));
// Neither the workspace nor the key's guardrails require ZDR.
vi.mock("@/pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: async () => ({ privacyZdrOnly: false, neverStoreContent: false }),
}));
// Broadcasts (the customer's own destination) are not under test and would hit the network.
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => {} }));

import { clearRuntime, configureRuntime } from "@/runtime/env";
import { handleError } from "./error-handler";

// The response beforeRequest returns when a preset's filters leave no provider.
function presetFilterRejection() {
	return new Response(JSON.stringify({
		error: "validation_error",
		details: [{
			message: 'Preset "@private" filters resulted in no available providers',
			path: ["preset"],
			keyword: "no_providers_after_preset_filter",
			params: { preset: "@private" },
		}],
		request_id: "req_preset_zdr",
		workspace_id: "ws_preset",
	}), { status: 400, headers: { "content-type": "application/json" } });
}

describe("handleError for a preset that requires zero data retention", () => {
	beforeEach(() => {
		sendAxiomWideEvent.mockClear();
		background.length = 0;
	});

	it.each([
		["keeps content out when the early snapshot carries the preset's ZDR", true],
		["sends the redacted payload when it doesn't", false],
	])("%s", async (_name, presetZdr) => {
		let auditArgs: any = null;
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			AXIOM_DETAIL_SAMPLE_RATE: "1",
		} as any);
		try {
			await handleError({
				stage: "before",
				res: presetFilterRejection(),
				endpoint: "responses",
				requestObservability: {
					// The raw payload: the preset's require_zero_data_retention isn't in it.
					requestPayload: { model: "@preset/private", input: "private prompt" },
					requestedModel: "@preset/private",
					workspaceId: "ws_preset",
					apiKeyId: "key_preset",
					...(presetZdr ? { zeroDataRetention: true } : {}),
				},
				auditFailure: async (args) => {
					auditArgs = args;
				},
			});
			await Promise.all(background.splice(0));
		} finally {
			clearRuntime();
		}

		const event = sendAxiomWideEvent.mock.calls.map((call) => call[0]).find((entry) => entry.event_type !== "gateway.telemetry_delivery");
		expect(event).toMatchObject({ observability_detail_level: "full", key_id: "key_preset", workspace_id: "ws_preset", status_code: 400 });
		// The I/O log reads this flag from the audit.
		expect(auditArgs.zeroDataRetention).toBe(presetZdr);
		if (presetZdr) {
			expect(event?.request_payload_redacted_json).toBeUndefined();
			expect(event?.gateway_response_redacted_json).toBeUndefined();
			expect(event?.provider_response_redacted_json).toBeUndefined();
			expect(event?.error_details_redacted_json).toBeUndefined();
		} else {
			// Telemetry masks string values, but the payload's shape still goes out.
			expect(event?.request_payload_redacted_json).toContain('"model":"@preset/private"');
			expect(event?.error_details_redacted_json).toBeDefined();
		}
	});
});
