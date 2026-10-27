import { describe, expect, it } from "vitest";
import { contextSchema } from "./schemas";

function contextPayload(capabilityParams: unknown) {
	return {
		workspace_id: "ws_capability_params",
		resolved_model: "openai/gpt-5.4-nano",
		key_ok: { ok: true, reason: null },
		key_limit_ok: { ok: true, reason: null },
		credit_ok: { ok: true, reason: null },
		providers: [
			{
				provider_id: "openai",
				api_model_id: "openai/gpt-5.4-nano",
				provider_model_slug: "gpt-5.4-nano-2026-03-17",
				capability_params: capabilityParams,
			},
		],
		pricing: {},
	};
}

describe("contextSchema provider capability params", () => {
	it("normalizes empty descriptor arrays to an empty capability record", () => {
		const parsed = contextSchema.parse(contextPayload([]));

		expect(parsed.providers[0]?.capabilityParams).toEqual({});
	});

	it("normalizes catalog descriptor arrays into a record keyed by param_id", () => {
		const parsed = contextSchema.parse(contextPayload([
			{
				param_id: "seed",
				provider_min: null,
				provider_max: null,
				provider_default: null,
				notes: null,
			},
			{
				param_id: "max_tokens",
				provider_min: 1,
				provider_max: 128_000,
				provider_default: 4_096,
				notes: "Provider output-token limit",
			},
		]));

		expect(parsed.providers[0]?.capabilityParams).toEqual({
			seed: {
				provider_min: null,
				provider_max: null,
				provider_default: null,
				notes: null,
			},
			max_tokens: {
				provider_min: 1,
				provider_max: 128_000,
				provider_default: 4_096,
				notes: "Provider output-token limit",
			},
		});
		expect(Object.keys(parsed.providers[0]?.capabilityParams ?? {})).toEqual([
			"seed",
			"max_tokens",
		]);
	});

	it("normalizes string entries and resolves duplicate param_id descriptors last-wins", () => {
		const parsed = contextSchema.parse(contextPayload([
			"temperature",
			{ param_id: "seed", provider_default: 1, notes: "older row" },
			{ param_id: "seed", provider_default: 2, notes: "newer row" },
		]));

		expect(parsed.providers[0]?.capabilityParams).toEqual({
			temperature: {},
			seed: {
				provider_default: 2,
				notes: "newer row",
			},
		});
	});

	it("accepts the data policy entry the context RPC appends to descriptor arrays", () => {
		const withPolicy = contextSchema.parse(contextPayload([
			{ param_id: "tools" },
			{ data_policy: { catalogManaged: true } },
		]));
		const withoutPolicy = contextSchema.parse(contextPayload([{ param_id: "tools" }, {}]));

		expect(withPolicy.providers[0]?.capabilityParams).toEqual({
			tools: {},
			data_policy: { catalogManaged: true },
		});
		expect(withoutPolicy.providers[0]?.capabilityParams).toEqual({ tools: {} });
	});

	it("preserves the existing record form", () => {
		const params = {
			request: { allowlist: ["temperature", "max_tokens"] },
			reasoning: { maxReasoningTokens: 8_192 },
		};
		const parsed = contextSchema.parse(contextPayload(params));

		expect(parsed.providers[0]?.capabilityParams).toEqual(params);
	});

	it.each([
		["non-object/non-string entries", [42]],
		["missing param_id", [{ provider_min: 0 }]],
		["blank param_id", [{ param_id: "   ", provider_min: 0 }]],
	])("rejects malformed descriptor arrays with %s", (_description, capabilityParams) => {
		const parsed = contextSchema.safeParse(contextPayload(capabilityParams));

		expect(parsed.success).toBe(false);
	});
});
