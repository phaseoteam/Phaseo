import { describe, expect, it } from "vitest";
import { attachGatewaySuccessMeta, attachRoutingDiagnosticsToPayload } from "./index";

describe("attachGatewaySuccessMeta", () => {
	it("adds routing, response-cache, guardrail, and plugin metadata when meta is enabled", () => {
		const payload: Record<string, any> = {
			id: "resp_123",
			meta: {
				existing: true,
			},
		};

		const result = {
			provider: "openai",
		} as any;

		const ctx = {
			meta: {
				returnMeta: true,
			},
			requestedParams: ["temperature", "web_search_options"],
			paramRoutingDiagnostics: {
				providerCountBefore: 4,
				providerCountAfter: 2,
				droppedProviders: [
					{
						providerId: "anthropic",
						unsupportedParams: ["web_search_options"],
					},
				],
			},
			responseCache: {
				enabled: true,
				status: "miss",
				reason: null,
				key: "cache_key",
				fingerprint: "fp_123",
				ttlSeconds: 300,
				ttlSource: "preset",
			},
			guardrailEnforcement: {
				source: "sensitive_info",
				action: "redact",
				actions: ["redact"],
				blocked: false,
				flagged: false,
				redacted: true,
				detectionCount: 1,
				redactionCount: 1,
				detection_count: 1,
				redaction_count: 1,
				guardrailIds: ["gr_123"],
				guardrail_ids: ["gr_123"],
				detections: [
					{
						detectorId: "email_address",
						category: "pii",
						variant: "regex",
					},
				],
				detectors: [
					{
						detector_id: "email_address",
						category: "pii",
						variant: "regex",
					},
				],
			},
			pluginExecutions: [
				{
					id: "response-healing",
					status: "applied",
					metadata: {
						mode: "safe",
					},
				},
			],
		} as any;

		attachGatewaySuccessMeta({
			ctx,
			result,
			payload,
			includeMeta: true,
		});

		expect(payload.meta).toMatchObject({
			existing: true,
			routing: {
				selected_provider: "openai",
				requested_params: ["temperature", "web_search_options"],
				param_provider_count_before: 4,
				param_provider_count_after: 2,
				param_dropped_providers: [
					{
						provider: "anthropic",
						unsupported_params: ["web_search_options"],
					},
				],
			},
			response_cache: {
				status: "miss",
				key: "cache_key",
			},
			guardrail_enforcement: {
				action: "redact",
				redacted: true,
			},
		});
		expect(payload.meta.plugin_executions).toEqual(ctx.pluginExecutions);
	});

	it("leaves payload metadata unchanged when meta is disabled", () => {
		const payload: Record<string, any> = {
			meta: {
				existing: true,
			},
		};

		attachGatewaySuccessMeta({
			ctx: {
				meta: {
					returnMeta: false,
				},
				requestedParams: ["temperature"],
				responseCache: {
					enabled: true,
					status: "miss",
				},
			} as any,
			result: {
				provider: "openai",
			} as any,
			payload,
			includeMeta: false,
		});

		expect(payload).toEqual({
			meta: {
				existing: true,
			},
		});
	});

	it("adds top-level routing diagnostics only when explicitly requested", () => {
		const payload: Record<string, any> = {
			id: "resp_123",
		};
		const ctx = {
			meta: {
				returnMeta: true,
				returnRoutingDiagnostics: true,
			},
			routingDiagnostics: {
				rankedProviders: [{ providerId: "openai", score: 0.99 }],
			},
		} as any;

		attachRoutingDiagnosticsToPayload({
			ctx,
			payload,
		});

		expect(payload.routing_diagnostics).toEqual(ctx.routingDiagnostics);
	});

	it("does not add top-level routing diagnostics for plain meta responses", () => {
		const payload: Record<string, any> = {
			id: "resp_123",
		};

		attachRoutingDiagnosticsToPayload({
			ctx: {
				meta: {
					returnMeta: true,
					returnRoutingDiagnostics: false,
				},
				routingDiagnostics: {
					rankedProviders: [{ providerId: "openai", score: 0.99 }],
				},
			} as any,
			payload,
		});

		expect(payload.routing_diagnostics).toBeUndefined();
	});
});
