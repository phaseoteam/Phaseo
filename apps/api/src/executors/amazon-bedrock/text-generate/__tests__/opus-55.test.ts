import { afterEach, describe, expect, it } from "vitest";
import { executor } from "../index";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import type { Protocol } from "@protocols/detect";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { opusMessage, opusStream, requestForProtocol, protocols, toolRoundTrip, priceOpusUsage } from "../../../../../tests/helpers/opus-55";

afterEach(() => teardownTestRuntime());
function args(protocol: Protocol, stream = false, region = "us-east-1", model = "anthropic.claude-opus-5-5", extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	setupRuntimeFromEnv({ AMAZON_BEDROCK_API_KEY: "mock-managed-key", AMAZON_BEDROCK_REGION: region } as any);
	return {
		ir: decodeProtocol(protocol, { ...requestForProtocol(protocol, stream), ...extra }),
		requestId: "req_opus_bedrock", workspaceId: "workspace", providerId: "amazon-bedrock",
		endpoint: protocol === "anthropic.messages" ? "messages" : protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol, capability: "text.generate", providerModelSlug: model, capabilityParams: null,
		byokMeta: [], pricingCard: null, meta: { returnUsage: true },
	} as unknown as ExecutorExecuteArgs;
}

describe("managed Bedrock Opus 5.5 Mantle contract", () => {
	it.each(protocols)("keeps summarized thinking separate from answer text on buffered %s", async protocol => {
		const message = { ...opusMessage, content: [{ type: "thinking", thinking: "Summary", signature: "opaque-signature" }, ...opusMessage.content.slice(1)] };
		const mock = installFetchMock([{ match: url => url.endsWith("/anthropic/v1/messages"), response: Response.json(message) }]);
		try {
			const result = await executor(args(protocol));
			if (result.kind !== "completed" || !result.ir) throw new Error("expected completion");
			const wire = encodeProtocol(protocol, result.ir, "req_opus_bedrock");
			expect(JSON.stringify(wire)).toContain("Summary");
			if (protocol === "openai.chat.completions") {
				expect(wire.choices[0].message.content).toBe("Answer");
				expect(wire.choices[0].message.reasoning_content).toBe("Summary");
			}
		} finally { mock.restore(); }
	});
	it.each(protocols)("preserves %s tool call/result IDs in a subsequent turn", async protocol => {
		const mock = installFetchMock([{ match: url => url.endsWith("/anthropic/v1/messages"), response: Response.json(opusMessage) }]);
		try {
			await executor(args(protocol, false, "us-east-1", "anthropic.claude-opus-5-5", toolRoundTrip(protocol)));
			const messages = mock.calls[0].bodyJson.messages;
			expect(messages[1].content).toContainEqual(expect.objectContaining({ type: "tool_use", id: "call_lookup", name: "lookup", input: { city: "London" } }));
			expect(messages[2].content).toContainEqual(expect.objectContaining({ type: "tool_result", tool_use_id: "call_lookup" }));
			if (protocol === "anthropic.messages") expect(messages[1].content).toContainEqual(opusMessage.content[0]);
		} finally { mock.restore(); }
	});
	it.each(protocols)("sends incoming %s to Messages and encodes tools, thinking and usage", async protocol => {
		const mock = installFetchMock([{ match: url => url === "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages", response: Response.json(opusMessage) }]);
		try {
			const result = await executor(args(protocol));
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "anthropic.claude-opus-5-5", stream: false, thinking: { type: "adaptive" } });
			expect(result.keySource).toBe("gateway");
			if (result.kind !== "completed" || !result.ir) throw new Error("expected completion");
			expect(result.ir.choices[0].message.content).toContainEqual({ type: "provider_block", block: opusMessage.content[0] });
			const wire = JSON.stringify(encodeProtocol(protocol, result.ir, "req_opus_bedrock"));
			expect(wire).toContain("Answer");
			expect(wire).toContain("call_lookup");
			expect(result.bill.usage).toMatchObject({ input_tokens: 10, output_tokens: 7, cached_read_text_tokens: 3, cached_write_text_tokens: 2 });
			expect(result.bill.finish_reason).toBe("tool_calls");
			expect(priceOpusUsage(result.bill.usage, "amazon-bedrock").cost_usd_str).toBe("0.000041000");
		} finally { mock.restore(); }
	});

	it.each(protocols)("streams native SSE into %s with final usage", async protocol => {
		const mock = installFetchMock([{ match: url => url.endsWith("/anthropic/v1/messages"), response: opusStream("Summary") }]);
		try {
			const result = await executor(args(protocol, true));
			if (result.kind !== "stream") throw new Error("expected stream");
			const wire = await new Response(result.stream).text();
			expect(wire).toContain("Answer");
			expect(wire).toContain("Summary");
			expect(wire).toContain("lookup");
			if (protocol === "anthropic.messages") expect(wire).toContain("opaque-signature");
			const bill = await result.usageFinalizer?.();
			expect(bill?.usage).toMatchObject({ input_tokens: 10, output_tokens: 7, cached_read_text_tokens: 3, cached_write_text_tokens: 2 });
			expect(bill?.finish_reason).toBe("tool_calls");
			expect(priceOpusUsage(bill?.usage, "amazon-bedrock").cost_usd_str).toBe("0.000041000");
		} finally { mock.restore(); }
	});

	it("signs the exact Messages path in the credential-selected region", async () => {
		const request = args("openai.responses");
		teardownTestRuntime();
		setupRuntimeFromEnv({ AMAZON_BEDROCK_API_KEY: JSON.stringify({ accessKeyId: "mock-access", secretAccessKey: "mock-secret", region: "ap-southeast-4", baseUrl: "https://bedrock-mantle.ap-southeast-4.api.aws/openai/v1" }), AMAZON_BEDROCK_REGION: "us-west-2" } as any);
		const mock = installFetchMock([{ match: url => url === "https://bedrock-mantle.ap-southeast-4.api.aws/anthropic/v1/messages", response: Response.json(opusMessage) }]);
		try { await executor(request); expect(mock.calls[0].headers.Authorization).toContain("/ap-southeast-4/bedrock/aws4_request"); }
		finally { mock.restore(); }
	});

	it.each(["us-east-1", "ap-southeast-4", "us-gov-west-1"])("preserves configured %s", async region => {
		const mock = installFetchMock([{ match: url => url === `https://bedrock-mantle.${region}.api.aws/anthropic/v1/messages`, response: Response.json(opusMessage) }]);
		try { await executor(args("anthropic.messages", false, region)); expect(mock.calls).toHaveLength(1); }
		finally { mock.restore(); }
	});

	it.each([
		["us-west-2", "anthropic.claude-opus-5-5", "region"],
		["us-east-1", "us.anthropic.claude-opus-5-5", "model"],
		["us-east-1", "eu.anthropic.claude-opus-5-5", "model"],
		["us-east-1", "global.anthropic.claude-opus-5-5", "model"],
	])("rejects unsupported region/profile %s %s before inference", async (region, model, issue) => {
		const mock = installFetchMock([{ match: () => true, response: Response.json(opusMessage) }]);
		try { await expect(executor(args("anthropic.messages", false, region, model))).rejects.toThrow(issue); expect(mock.calls).toHaveLength(0); }
		finally { mock.restore(); }
	});

	it.each([
		{ response_format: { type: "json_schema", json_schema: { name: "answer", schema: { type: "object" } } } },
		{ tools: [{ type: "function", function: { name: "lookup", strict: true, parameters: { type: "object" } } }] },
	])("rejects structured outputs and strict tools", async extra => {
		const mock = installFetchMock([{ match: () => true, response: Response.json(opusMessage) }]);
		try { await expect(executor(args("openai.chat.completions", false, "us-east-1", "anthropic.claude-opus-5-5", extra))).rejects.toThrow(/structured|strict/); expect(mock.calls).toHaveLength(0); }
		finally { mock.restore(); }
	});
});
