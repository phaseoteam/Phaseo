import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { normalizeIRForProvider } from "./normalize";
import {
	clearDroppedParams,
	declaredRouteParams,
	droppedParamsForClient,
	droppedParamsHeader,
	dropUnsupportedParams,
	recordDroppedParams,
} from "./unsupportedParams";

function ir(overrides: Partial<IRChatRequest> = {}): IRChatRequest {
	return {
		model: "openai/gpt-5.4",
		stream: true,
		messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		...overrides,
	} as IRChatRequest;
}

// The archived catalogue row for openai/gpt-5.4 (text.generate).
const GPT_54_PARAMS = [
	"seed", "max_tokens", "response_format", "structured_outputs", "stop", "frequency_penalty", "presence_penalty",
	"logit_bias", "logprobs", "top_logprobs", "tools", "tool_choice", "temperature", "top_p", "reasoning",
	"include_reasoning", "reasoning_effort",
];

describe("dropUnsupportedParams", () => {
	it("drops sampling parameters the route does not declare and keeps the ones it does", () => {
		const request = ir({ topK: 40, minP: 0.1, temperature: 0.3, stop: ["END"], seed: 7 });
		const result = dropUnsupportedParams(request, "openai", GPT_54_PARAMS);
		expect(result.dropped).toEqual([
			{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" },
			{ param: "min_p", reason: "unsupported_by_provider", source: "catalogue" },
		]);
		expect(result.ir.topK).toBeUndefined();
		expect(result.ir.minP).toBeUndefined();
		expect(result.ir).toMatchObject({ temperature: 0.3, stop: ["END"], seed: 7 });
		// The caller's request is not modified.
		expect(request.topK).toBe(40);
	});

	it("reads every catalogue shape: a record, a list of ids, and param_id rows", () => {
		expect(declaredRouteParams({ top_k: {} })).toEqual({ top_k: {} });
		expect(declaredRouteParams(["top_k"])).toEqual({ top_k: {} });
		expect(declaredRouteParams([{ param_id: "top_k", provider_max: 100 }])).toEqual({ top_k: { provider_max: 100 } });
		const kept = dropUnsupportedParams(ir({ topK: 40 }), "openai", [{ param_id: "top_k", provider_min: null }]);
		expect(kept.dropped).toEqual([]);
	});

	it.each([[undefined], [null], [{}], [[]]])("fails open when the route declares no params (%j)", (params) => {
		const request = ir({ topK: 40, minP: 0.1, repetitionPenalty: 1.1 });
		const result = dropUnsupportedParams(request, "together", params);
		expect(result.dropped).toEqual([]);
		expect(result.ir).toBe(request);
	});

	it("drops what the provider profile marks unsupported even without catalogue params", () => {
		const result = dropUnsupportedParams(ir({ topK: 40, parallelToolCalls: false, logprobs: true }), "cohere", undefined);
		expect(result.dropped.map((entry) => [entry.param, entry.source])).toEqual([
			["top_k", "provider_profile"],
			["logprobs", "provider_profile"],
			["parallel_tool_calls", "provider_profile"],
		]);
	});

	it("keeps what the provider profile marks supported even when the route omits it", () => {
		// DeepSeek's profile supports logprobs; the route below does not list it.
		const result = dropUnsupportedParams(ir({ logprobs: true }), "deepseek", ["max_tokens", "temperature"]);
		expect(result.dropped).toEqual([]);
	});

	it("never drops parameters the catalogue does not track, such as parallel_tool_calls, by absence", () => {
		const result = dropUnsupportedParams(ir({ parallelToolCalls: false, maxToolCalls: 3 }), "openai", GPT_54_PARAMS);
		expect(result.dropped).toEqual([]);
	});

	it("never touches structural fields or gateway-only options", () => {
		const request = ir({
			maxTokens: 100,
			tools: [{ name: "f", parameters: {} }],
			toolChoice: "auto",
			responseFormat: { type: "json_object" },
			reasoning: { effort: "high" },
			metadata: { a: "b" },
		});
		const result = dropUnsupportedParams(request, "openai", ["seed"]);
		expect(result.dropped).toEqual([]);
		expect(result.ir).toBe(request);
	});

	it("drops a value outside the route's declared list", () => {
		const params = { stop: { supported_values: ["END", "STOP"] } };
		expect(dropUnsupportedParams(ir({ stop: ["END"] }), "openai", params).dropped).toEqual([]);
		expect(dropUnsupportedParams(ir({ stop: ["HALT"] }), "openai", params).dropped).toEqual([
			{ param: "stop", reason: "value_not_supported", source: "catalogue" },
		]);
	});
});

describe("normalizeIRForProvider", () => {
	it("removes unsupported parameters before execution and reports them", () => {
		const reported: unknown[] = [];
		const next = normalizeIRForProvider(ir({ topK: 40, temperature: 0.5 }), "openai", "openai.chat.completions", {
			capabilityParams: Object.fromEntries(GPT_54_PARAMS.map((param) => [param, {}])),
			onDroppedParams: (dropped) => reported.push(...dropped),
		});
		expect(next.topK).toBeUndefined();
		expect(next.temperature).toBe(0.5);
		expect(reported).toEqual([{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" }]);
	});
});

describe("dropped parameter notice", () => {
	it("reports only client-sent parameters of the provider that ran last, with surface names", () => {
		const ctx: any = { endpoint: "messages", requestedParams: ["top_k", "stop"], routingDiagnostics: null };
		recordDroppedParams(ctx, "openai", [
			{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" },
			{ param: "stop", reason: "unsupported_by_provider", source: "catalogue" },
			{ param: "temperature", reason: "unsupported_by_provider", source: "catalogue" },
		]);
		expect(ctx.routingDiagnostics.droppedParams.params.map((entry: any) => [entry.param, entry.client_sent])).toEqual([
			["top_k", true],
			["stop_sequences", true],
			["temperature", false],
		]);
		const client = droppedParamsForClient(ctx);
		expect(client.map((entry) => entry.param)).toEqual(["top_k", "stop_sequences"]);
		expect(droppedParamsHeader(client)).toBe("top_k, stop_sequences");

		clearDroppedParams(ctx);
		expect(droppedParamsForClient(ctx)).toEqual([]);
	});

	it("does not let a sub-request on a copied context overwrite the main record", () => {
		const main: any = { endpoint: "chat.completions", requestedParams: ["top_k"], routingDiagnostics: { stickyRouting: { hit: true } } };
		recordDroppedParams(main, "openai", [{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue" }]);
		const advisor: any = { ...main, requestedParams: [] };
		clearDroppedParams(advisor);
		recordDroppedParams(advisor, "anthropic", []);
		expect(droppedParamsForClient(main)).toEqual([{ param: "top_k", reason: "unsupported_by_provider", source: "catalogue", provider: "openai" }]);
		expect(main.routingDiagnostics.stickyRouting).toEqual({ hit: true });
	});
});
