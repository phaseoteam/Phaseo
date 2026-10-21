import { describe, expect, it } from "vitest";
import {
	buildAsyncGenAiOtlpPayload,
	buildGatewayGenAiOtlpPayload,
	genAiOperation,
	normaliseGenAiProvider,
	normaliseInputMessages,
	normaliseToolDefinitions,
} from "./otel-genai";

const options = {
	includeSensitiveContent: true,
	serviceName: "phaseo-test",
};

function spans(payload: any) {
	return payload.resourceSpans[0].scopeSpans[0].spans;
}

function attributes(span: any) {
	return Object.fromEntries(span.attributes.map((entry: any) => [entry.key, entry.value]));
}

describe("GenAI semantic convention mapping", () => {
	it("uses well-known operation and provider names", () => {
		expect(genAiOperation("chat.completions")).toBe("chat");
		expect(genAiOperation("audio.realtime")).toBe("generate_content");
		expect(genAiOperation("embeddings")).toBe("embeddings");
		expect(normaliseGenAiProvider("google-ai-studio")).toBe("gcp.gemini");
		expect(normaliseGenAiProvider("x-ai")).toBe("x_ai");
	});

	it("normalises multimodal messages and tool definitions", () => {
		expect(normaliseInputMessages({
			messages: [{ role: "user", content: [
				{ type: "text", text: "hello" },
				{ type: "image_url", image_url: { url: "https://example.test/image.png" } },
			] }],
		})).toEqual([expect.objectContaining({ role: "user" })]);
		expect(normaliseToolDefinitions({
			tools: [{ type: "function", function: { name: "weather", parameters: { type: "object" } } }],
		})).toEqual([expect.objectContaining({ name: "weather" })]);
	});
});

describe("buildGatewayGenAiOtlpPayload", () => {
	it("builds correlated server and per-attempt client spans", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_1",
			workspaceId: "ws_1",
			endpoint: "chat.completions",
			requestedModel: "openai/gpt-5",
			provider: "openai",
			requestPayload: { messages: [{ role: "user", content: "hello" }], temperature: 0.4 },
			responsePayload: { choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }] },
			usage: { prompt_tokens: 4, completion_tokens: 2 },
			providerAttempts: [{
				attempt_number: 1,
				started_at_unix_ms: 1_000,
				provider: "openai",
				endpoint: "chat.completions",
				model: "openai/gpt-5",
				provider_model_slug: "gpt-5",
				outcome: "success",
				duration_ms: 100,
				status: 200,
				upstream_url: "https://api.openai.com/v1/chat/completions",
			}],
			stream: true,
			finishReason: "stop",
			statusCode: 200,
			success: true,
			startedAtMs: 900,
			completedAtMs: 1_200,
			traceContext: {
				traceId: "1".repeat(32),
				parentSpanId: "2".repeat(16),
				traceFlags: 1,
			},
		}, options);
		const output = spans(payload);
		expect(output).toHaveLength(2);
		expect(output[0]).toMatchObject({ kind: 2, traceId: "1".repeat(32), parentSpanId: "2".repeat(16) });
		expect(output[1]).toMatchObject({ kind: 3, traceId: "1".repeat(32), parentSpanId: output[0].spanId });
		expect(attributes(output[1])["gen_ai.operation.name"]).toEqual({ stringValue: "chat" });
		expect(attributes(output[1])["gen_ai.usage.input_tokens"]).toEqual({ intValue: "4" });
		expect(output[1].startTimeUnixNano).toBe("1000000000");
	});

	it("reports cache reads and writes from the priced meters", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_cache",
			workspaceId: "ws_1",
			endpoint: "responses",
			requestedModel: "anthropic/claude-sonnet-4-6",
			provider: "anthropic",
			requestPayload: { input: "hello" },
			responsePayload: { output: [] },
			usage: {
				input_tokens: 32_050,
				output_tokens: 400,
				input_tokens_details: { cached_tokens: 30_000, cache_write_tokens: 2_000 },
				pricing: { lines: [
					{ dimension: "input_text_tokens", quantity: 50 },
					{ dimension: "cached_read_text_tokens", quantity: 30_000 },
					{ dimension: "cached_write_text_tokens_5m", quantity: 2_000 },
				] },
			},
			statusCode: 200,
			success: true,
			startedAtMs: 1,
			completedAtMs: 2,
		}, options);
		const span = attributes(spans(payload)[1]);
		expect(span["gen_ai.usage.input_tokens"]).toEqual({ intValue: "32050" });
		expect(span["gen_ai.usage.cache_read.input_tokens"]).toEqual({ intValue: "30000" });
		expect(span["gen_ai.usage.cache_creation.input_tokens"]).toEqual({ intValue: "2000" });
	});

	it("reports OpenAI-style cache writes without a pricing breakdown", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_cache_openai",
			workspaceId: "ws_1",
			endpoint: "chat.completions",
			requestedModel: "openai/gpt-5.6-sol",
			provider: "openai",
			requestPayload: { messages: [] },
			responsePayload: { choices: [] },
			usage: { prompt_tokens: 10_000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 } },
			statusCode: 200,
			success: true,
			startedAtMs: 1,
			completedAtMs: 2,
		}, options);
		const span = attributes(spans(payload)[1]);
		expect(span["gen_ai.usage.cache_read.input_tokens"]).toEqual({ intValue: "6000" });
		expect(span["gen_ai.usage.cache_creation.input_tokens"]).toEqual({ intValue: "3000" });
	});

	it("omits sensitive content when privacy excludes it", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_private",
			workspaceId: "ws_1",
			endpoint: "responses",
			requestedModel: "openai/gpt-5",
			requestPayload: { input: "secret" },
			responsePayload: { output: [{ role: "assistant", content: "secret output" }] },
			statusCode: 200,
			success: true,
			startedAtMs: 1,
			completedAtMs: 2,
		}, { ...options, includeSensitiveContent: false });
		const keys = Object.keys(attributes(spans(payload)[1]));
		expect(keys).not.toContain("gen_ai.input.messages");
		expect(keys).not.toContain("gen_ai.output.messages");
	});

	it("names the rate limit policy that rejected a request", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_limited",
			workspaceId: "ws_1",
			endpoint: "responses",
			requestedModel: "openai/gpt-5",
			statusCode: 429,
			success: false,
			errorType: "user",
			rateLimitPolicyId: "policy_1",
			rateLimitScope: "key",
			startedAtMs: 1,
			completedAtMs: 2,
		}, { ...options, includeSensitiveContent: false });
		const server = attributes(spans(payload)[0]);
		expect(server["phaseo.rate_limit.policy_id"]).toEqual({ stringValue: "policy_1" });
		expect(server["phaseo.rate_limit.scope"]).toEqual({ stringValue: "key" });
	});

	it("exports request labels, with multi-value classifier dimensions as arrays", () => {
		const payload = buildGatewayGenAiOtlpPayload({
			requestId: "req_labelled",
			workspaceId: "ws_1",
			endpoint: "chat.completions",
			requestedModel: "openai/gpt-5",
			statusCode: 200,
			success: true,
			labels: [
				{ key: "team", value: "contracts" },
				{ key: "department", value: "legal" },
				{ key: "topics", value: "billing" },
				{ key: "topics", value: "security" },
			],
			startedAtMs: 1,
			completedAtMs: 2,
		}, { ...options, includeSensitiveContent: false });
		const server = attributes(spans(payload)[0]);
		expect(server["phaseo.label.team"]).toEqual({ stringValue: "contracts" });
		expect(server["phaseo.label.department"]).toEqual({ stringValue: "legal" });
		expect(server["phaseo.label.topics"]).toEqual({ arrayValue: { values: [{ stringValue: "billing" }, { stringValue: "security" }] } });
	});

	it("exports request metadata and renames spans from its trace keys", () => {
		const base = {
			requestId: "req_metadata",
			workspaceId: "ws_1",
			endpoint: "chat.completions" as const,
			requestedModel: "openai/gpt-5",
			provider: "openai",
			providerModel: "gpt-5",
			statusCode: 200,
			success: true,
			startedAtMs: 1,
			completedAtMs: 2,
		};
		const payload = buildGatewayGenAiOtlpPayload({
			...base,
			metadata: { trace_name: "checkout", generation_name: "summarise cart", customer_tier: "pro" },
		}, { ...options, includeSensitiveContent: false });
		const [server, generation] = spans(payload);
		expect(server.name).toBe("checkout");
		expect(generation.name).toBe("summarise cart");
		expect(attributes(server)["phaseo.metadata.customer_tier"]).toEqual({ stringValue: "pro" });
		expect(attributes(generation)["phaseo.metadata.trace_name"]).toEqual({ stringValue: "checkout" });

		const named = spans(buildGatewayGenAiOtlpPayload({
			...base,
			metadata: { trace_name: "checkout", span_name: "cart step" },
		}, options));
		expect(named[0].name).toBe("cart step");

		const plain = spans(buildGatewayGenAiOtlpPayload(base, options));
		expect(plain[0].name).toBe("POST /v1/chat/completions");
		expect(plain[1].name).toBe("chat gpt-5");
	});
});

describe("async GenAI lifecycle spans", () => {
	it("models submission as PRODUCER and finalisation as a linked CONSUMER", () => {
		const submission = buildAsyncGenAiOtlpPayload({
			requestId: "req_batch",
			workspaceId: "ws_1",
			operation: "batch",
			phase: "submit",
			endpoint: "batch",
			model: "openai/gpt-5",
			startedAtMs: 1,
			completedAtMs: 2,
			success: true,
			spanId: "3".repeat(16),
		}, options);
		expect(spans(submission.payload)[0]).toMatchObject({ kind: 4, spanId: "3".repeat(16) });

		const finalised = buildAsyncGenAiOtlpPayload({
			requestId: "req_batch_final",
			workspaceId: "ws_1",
			operation: "batch",
			phase: "finalize",
			endpoint: "chat.completions",
			model: "openai/gpt-5",
			startedAtMs: 1,
			completedAtMs: 10,
			success: true,
			linkContext: submission.context,
		}, options);
		expect(spans(finalised.payload)[0]).toMatchObject({
			kind: 5,
			links: [expect.objectContaining({
				traceId: submission.context.traceId,
				spanId: submission.context.parentSpanId,
			})],
		});
	});

	it("models a realtime turn as a GenAI CLIENT span", () => {
		const turn = buildAsyncGenAiOtlpPayload({
			requestId: "turn_1",
			workspaceId: "ws_1",
			operation: "realtime",
			phase: "turn",
			endpoint: "audio.realtime",
			model: "openai/gpt-realtime",
			sessionId: "rt_1",
			startedAtMs: 1,
			completedAtMs: 2,
			success: true,
		}, options);
		const span = spans(turn.payload)[0];
		expect(span.kind).toBe(3);
		expect(attributes(span)["gen_ai.operation.name"]).toEqual({ stringValue: "generate_content" });
		expect(attributes(span)["gen_ai.conversation.id"]).toEqual({ stringValue: "rt_1" });
	});
});
