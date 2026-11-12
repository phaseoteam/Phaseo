import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executor as decisions } from "./decisions";
import { execute as text } from "./text-generate";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import type { ExecutorExecuteArgs } from "@executors/types";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupTestRuntime());
afterEach(() => { vi.restoreAllMocks(); teardownTestRuntime(); });
const args = (): ExecutorExecuteArgs => ({
	providerId: "empiriolabs", providerModelSlug: "aplomb-1", endpoint: "decisions",
	requestId: "test", workspaceId: "test", byokMeta: [{ id: "test", key: "test-key" }] as ExecutorExecuteArgs["byokMeta"],
	pricingCard: {}, meta: { returnUpstreamRequest: true },
	ir: { model: "empiriolabs/aplomb-1", state: "The apple is red.", questions: {
		red: { type: "noul", instructions: "Is it red?" },
		colour: { type: "choice", instructions: "Colour?", criteria: { red: "Red", blue: "Blue" } },
		score: { type: "score", instructions: "Redness?", criteria: ["Not red", "Red"] },
	}, rawRequest: { long_context: "full" } },
});
const payload = () => ({ model: "aplomb-1", answers: {
	red: { type: "noul", noul: .99, confidence: .98 },
	colour: { type: "choice", choice: "red", probabilities: { red: .99, blue: .01 } },
	score: { type: "score", score: .99, probabilities: { "0": .01, "1": .99 } },
}, usage: { input_tokens: 64, output_tokens: 0 } });

describe("EmpirioLabs contracts", () => {
	it("maps decisions, bearer authentication and input-only billing", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload()));
		const result = await decisions(args());
		expect(fetchMock.mock.calls[0][0]).toBe("https://api.empiriolabs.ai/v1/decisions");
		expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer test-key" });
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ model: "aplomb-1", long_context: "full" });
		expect(result.upstream.status).toBe(200);
		expect(result.bill.usage).toMatchObject({ input_tokens: 64, output_tokens: 0, requests: 1 });
	});
	it("rejects invalid choice limits before a request", async () => {
		const a = args(); a.ir.questions.colour.criteria = { red: "Red" };
		const fetchMock = vi.spyOn(globalThis, "fetch");
		expect((await decisions(a)).upstream.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
	});
	it("rejects unexpected output billing", async () => {
		const p = payload(); p.usage.output_tokens = 1;
		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(p));
		expect((await decisions(args())).upstream.status).toBe(502);
	});
	it("rejects malformed answer distributions", async () => {
		const p = payload(); p.answers.colour.probabilities.red = .2;
		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(p));
		expect((await decisions(args())).upstream.status).toBe(502);
	});
	it.each(["web_search", "web_search_preview", "code_interpreter"])("blocks unpriced %s before network activity", async type => {
		const a = args(); a.ir = { model: "qwen/qwen3.8-flash", tools: [{ type }] };
		const fetchMock = vi.spyOn(globalThis, "fetch");
		expect((await text(a)).upstream.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
	});
	it.each(["perplexity-deep-research", "perplexity-advanced-deep-research"])("blocks unpriced research model %s", async model => {
		const a = args(); a.providerModelSlug = model;
		const fetchMock = vi.spyOn(globalThis, "fetch");
		expect((await text(a)).upstream.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
	});
	it("uses the documented OpenAI Responses input shape", () => {
		const wire = irToOpenAIResponses({ model: "qwen/qwen3.8-flash", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] }, "qwen3-8-flash", "empiriolabs");
		expect(wire.input).toHaveLength(1); expect(wire.input_items).toBeUndefined();
	});
});
