import { afterEach, describe, expect, it, vi } from "vitest";
import { executor } from "../index";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import type { Protocol } from "@protocols/detect";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { opusMessage, opusStream, requestForProtocol, protocols, toolRoundTrip, priceOpusUsage } from "../../../../../tests/helpers/opus-55";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
afterEach(() => teardownTestRuntime());

function args(protocol: Protocol, stream = false, extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "managed-project", GOOGLE_VERTEX_ACCESS_TOKEN: "mock-managed-token" } as any);
	return {
		ir: decodeProtocol(protocol, { ...requestForProtocol(protocol, stream), ...extra }),
		requestId: "req_opus_vertex", workspaceId: "workspace", providerId: "google-vertex",
		endpoint: protocol === "anthropic.messages" ? "messages" : protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol, capability: "text.generate", providerModelSlug: "claude-opus-5-5",
		capabilityParams: [{ param_id: "max_tokens" }, { param_id: "tools" }, { param_id: "tool_choice" }],
		byokMeta: [], pricingCard: null, meta: { returnUsage: true },
	} as unknown as ExecutorExecuteArgs;
}

describe("managed Vertex Opus 5.5", () => {
	it.each(protocols)("keeps summarized thinking separate from answer text on buffered %s", async protocol => {
		const mock = installFetchMock([{ match: url => url.includes(":streamRawPredict"), response: opusStream("Summary") }]);
		try {
			const result = await executor(args(protocol));
			if (result.kind !== "completed" || !result.ir) throw new Error("expected completion");
			const wire = encodeProtocol(protocol, result.ir, "req_opus_vertex");
			expect(JSON.stringify(wire)).toContain("Summary");
			if (protocol === "openai.chat.completions") {
				expect(wire.choices[0].message.content).toBe("Answer");
				expect(wire.choices[0].message.reasoning_content).toBe("Summary");
			}
		} finally { mock.restore(); }
	});
	it.each(protocols)("buffers native Messages into %s with usage and blocks", async protocol => {
		const mock = installFetchMock([{ match: url => url === "https://aiplatform.googleapis.com/v1/projects/managed-project/locations/global/publishers/anthropic/models/claude-opus-5-5:streamRawPredict", response: opusStream() }]);
		try {
			const result = await executor(args(protocol));
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].bodyJson).toMatchObject({ anthropic_version: "vertex-2023-10-16", stream: true, thinking: { type: "adaptive" } });
			expect(mock.calls[0].bodyJson).not.toHaveProperty("model");
			expect(result.keySource).toBe("gateway");
			if (result.kind !== "completed") throw new Error("expected completion");
			expect(result.ir?.choices[0].message.content).toEqual(expect.arrayContaining([{ type: "text", text: "Answer" }]));
			expect(result.ir?.choices[0].message.content).toContainEqual({ type: "provider_block", block: opusMessage.content[0] });
			expect(result.ir?.choices[0].message.toolCalls?.[0]).toMatchObject({ id: "call_lookup", name: "lookup", arguments: '{"city":"London"}' });
			expect(result.bill.usage).toMatchObject({ input_tokens: 10, output_tokens: 7 });
			expect(priceOpusUsage(result.bill.usage, "google-vertex").cost_usd_str).toBe("0.000041000");
		} finally { mock.restore(); }
	});

	it.each(protocols)("streams %s and finalizes authoritative usage", async protocol => {
		const mock = installFetchMock([{ match: url => url.includes(":streamRawPredict"), response: opusStream() }]);
		try {
			const result = await executor(args(protocol, true));
			if (result.kind !== "stream") throw new Error("expected stream");
			const wire = await new Response(result.stream).text();
			expect(wire).toContain("Answer");
			expect(wire).toContain("lookup");
			expect(wire).toContain("call_lookup");
			if (protocol === "anthropic.messages") expect(wire).toContain("opaque-signature");
			const bill = await result.usageFinalizer?.();
			expect(bill?.usage).toMatchObject({ input_tokens: 10, output_tokens: 7 });
			expect(bill?.finish_reason).toBe("tool_calls");
			expect(priceOpusUsage(bill?.usage, "google-vertex").cost_usd_str).toBe("0.000041000");
		} finally { mock.restore(); }
	});

	it.each(protocols)("preserves the %s tool-result history", async protocol => {
		const mock = installFetchMock([{ match: url => url.includes(":streamRawPredict"), response: opusStream() }]);
		try {
			await executor(args(protocol, false, toolRoundTrip(protocol)));
			const messages = mock.calls[0].bodyJson.messages;
			expect(messages[1].content).toContainEqual(expect.objectContaining({ type: "tool_use", id: "call_lookup", name: "lookup", input: { city: "London" } }));
			expect(messages[2].content).toContainEqual(expect.objectContaining({ type: "tool_result", tool_use_id: "call_lookup" }));
			if (protocol === "anthropic.messages") expect(messages[1].content).toContainEqual(opusMessage.content[0]);
		} finally { mock.restore(); }
	});

	it.each([
		["temperature", { temperature: 0 }], ["top_p", { top_p: 0.5 }], ["top_k", { top_k: 10 }],
		["thinking", { thinking: { type: "disabled" } }],
		["tool_choice", { tool_choice: { type: "any" } }],
		["tool_choice", { tool_choice: { type: "tool", name: "lookup" } }],
		["messages", { messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Prefill" }] }],
	] as const)("rejects unsupported %s before stripping params or fetching", async (field, extra) => {
		const mock = installFetchMock([{ match: () => true, response: Response.json(opusMessage) }]);
		try {
			await expect(executor(args("anthropic.messages", false, extra))).rejects.toThrow(field);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
});
