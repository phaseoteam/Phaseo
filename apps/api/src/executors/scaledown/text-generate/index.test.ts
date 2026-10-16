import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

beforeEach(() => setupRuntimeFromEnv({ SCALEDOWN_API_KEY: "scaledown-test" }));
afterEach(() => { vi.restoreAllMocks(); teardownTestRuntime(); });

const invoice = {
	type: "json_schema" as const, name: "invoice",
	schema: { type: "object", properties: { vendor: { type: "string", description: "company name" } } },
};
function argsFor(slug: string, overrides: Partial<IRChatRequest> = {}): ExecutorExecuteArgs {
	return {
		providerId: "scaledown", providerModelSlug: slug, endpoint: "chat.completions",
		requestId: "req_scaledown", workspaceId: "ws_test", byokMeta: [], pricingCard: {}, meta: {},
		capability: "text.generate", protocol: "openai.chat.completions",
		ir: { model: `scaledown/${slug}`, stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "Acme Corp invoiced $500." }] }], ...overrides },
	} as ExecutorExecuteArgs;
}
const completion = (content: Record<string, unknown>) => Response.json({
	id: "chatcmpl-1", object: "chat.completion", created: 1760000000, model: "extract-1",
	choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
	usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
});

describe("ScaleDown Summarize and Extract", () => {
	it.each([undefined, false])("sends Extract with strict=%s as a non-strict schema and x-api-key", async (strict) => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completion({ entities: [], structured_result: null }));
		const result = await executor(argsFor("extract-1", { responseFormat: { ...invoice, strict } }));
		expect(result.upstream.status).toBe(200);
		expect(fetchMock.mock.calls[0][0]).toBe("https://api.scaledown.xyz/v1/chat/completions");
		const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
		expect(headers.get("x-api-key")).toBe("scaledown-test");
		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body).toMatchObject({ model: "extract-1", stream: false, response_format: { type: "json_schema", json_schema: { strict: false } } });
		expect(body.temperature).toBeUndefined();
	});
	it("sends Summarize with max_tokens and no sampling params", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completion({ summary: "Acme billed $500." }));
		const result = await executor(argsFor("summarize-1", { maxTokens: 150 }));
		expect(result.upstream.status).toBe(200);
		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body.model).toBe("summarize-1");
		expect(body.max_tokens ?? body.max_completion_tokens).toBe(150);
		expect(body.temperature).toBeUndefined();
	});
	it.each([
		["summarize-1", { stream: true }],
		["summarize-1", { tools: [{ type: "function", function: { name: "f", parameters: {} } }] }],
		["extract-1", {}],
		["extract-1", { responseFormat: { type: "json_object" } }],
		["extract-1", { responseFormat: { ...invoice, strict: true } }],
		["summarize-1", { temperature: 0.7 }],
		["summarize-1", { topP: 0.9 }],
		["summarize-1", { topK: 5 }],
		["summarize-1", { minP: 0.1 }],
		["summarize-1", { seed: 0 }],
		["summarize-1", { stop: ["stop"] }],
		["summarize-1", { frequencyPenalty: 0 }],
		["summarize-1", { presencePenalty: 0 }],
		["summarize-1", { repetitionPenalty: 1 }],
		["summarize-1", { logitBias: {} }],
		["summarize-1", { logprobs: false }],
		["summarize-1", { topLogprobs: 0 }],
		["summarize-1", { toolChoice: "none" }],
		["summarize-1", { parallelToolCalls: false }],
		["summarize-1", { maxToolCalls: 1 }],
		["compress", {}],
	] as Array<[string, Partial<IRChatRequest>]>)("rejects %s %o before a request", async (slug, overrides) => {
		const fetchMock = vi.spyOn(globalThis, "fetch");
		const result = await executor(argsFor(slug, overrides));
		expect(result.upstream.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
