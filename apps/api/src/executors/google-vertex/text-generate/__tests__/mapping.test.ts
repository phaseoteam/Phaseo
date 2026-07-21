import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { geminiToIR, irToGemini, resolveVertexModelRoute } from "../index";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function buildExecuteArgs(): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemini-3.6-flash",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
	};
	return {
		ir,
		requestId: "req_google_vertex_empty",
		workspaceId: "team_test",
		providerId: "google-vertex",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: "gemini-3.6-flash",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

describe("google-vertex route resolution", () => {
	it("routes prefixed models by family", () => {
		expect(resolveVertexModelRoute("google/gemini-2.5-flash").family).toBe("gemini");
		expect(resolveVertexModelRoute("anthropic/claude-sonnet-4@20250514").family).toBe("anthropic");
		expect(resolveVertexModelRoute("openai/gpt-4.1").family).toBe("openapi_chat");
	});
});

describe("google-vertex empty response handling", () => {
	it("turns a zero-output Gemini response into a failoverable error", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent"),
			response: new Response(JSON.stringify({
				candidates: [{ finishReason: "STOP" }],
				usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 0, totalTokenCount: 8 },
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await execute(buildExecuteArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir).toBeUndefined();
		expect(result.upstream?.status).toBe(502);
	});
});

describe("google-vertex irToGemini", () => {
	it("removes JSON Schema additionalProperties from function declarations", async () => {
		const request = await irToGemini({
			model: "gemini-3.5-flash-lite",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			tools: [{
				name: "lookup",
				description: "Look something up",
				parameters: {
					type: "object",
					additionalProperties: false,
					properties: {
						query: { type: "string", additionalProperties: false },
					},
				},
			}],
		} as any);

		expect(request.tools?.[0]?.functionDeclarations?.[0]?.parameters).toEqual({
			type: "object",
			properties: { query: { type: "string" } },
		});
	});

	it("maps system and developer roles into systemInstruction parts", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash",
			stream: false,
			messages: [
				{ role: "system", content: [{ type: "text", text: "system prompt" }] },
				{ role: "developer", content: [{ type: "text", text: "developer prompt" }] },
				{ role: "user", content: [{ type: "text", text: "hello" }] },
			],
		} as any);

		expect(request.systemInstruction?.parts).toEqual([
			{ text: "system prompt" },
			{ text: "developer prompt" },
		]);
	});

	it("maps gemini-3 reasoning enabled to thinkingLevel", async () => {
		const request = await irToGemini({
			model: "gemini-3-pro",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { enabled: true },
		} as any, "gemini-3-pro");

		expect(request.generationConfig?.thinkingConfig?.includeThoughts).toBe(true);
		expect(request.generationConfig?.thinkingConfig?.thinkingLevel).toBe("HIGH");
		expect(request.generationConfig?.thinkingConfig?.thinkingBudget).toBeUndefined();
	});

	it("maps reasoning.effort to thinkingLevel for gemini-3.1 image preview", async () => {
		const request = await irToGemini({
			model: "gemini-3.1-flash-image-preview",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { effort: "medium", enabled: true },
		} as any, "gemini-3.1-flash-image-preview");

		expect(request.generationConfig?.thinkingConfig?.thinkingLevel).toBe("MEDIUM");
		expect(request.generationConfig?.thinkingConfig?.thinkingBudget).toBeUndefined();
	});

	it("maps imageConfig into generationConfig.imageConfig", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash-image",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "draw a cat" }] }],
			imageConfig: {
				aspectRatio: "1:1",
				imageSize: "0.5K",
				includeRaiReason: true,
				referenceImages: [{ referenceType: "REFERENCE_TYPE_RAW" }],
			},
		} as any);

		expect(request.generationConfig?.imageConfig).toEqual({
			aspectRatio: "1:1",
			imageSize: "0.5K",
			includeRaiReason: true,
			referenceImages: [{ referenceType: "REFERENCE_TYPE_RAW" }],
		});
	});

	it("supports disabling thought inclusion explicitly", async () => {
		const request = await irToGemini({
			model: "gemini-3-pro",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { includeThoughts: false, enabled: true },
		} as any, "gemini-3-pro");

		expect(request.generationConfig?.thinkingConfig?.includeThoughts).toBe(false);
	});
});

describe("google-vertex geminiToIR", () => {
	it("maps thought parts to reasoning_text content", () => {
		const ir = geminiToIR({
			id: "vertex_resp_1",
			candidates: [{
				index: 0,
				content: {
					parts: [
						{
							text: "thinking...",
							thought: true,
							thought_signature: "sig_1",
						},
						{
							text: "final answer",
						},
					],
				},
				finishReason: "STOP",
			}],
			usageMetadata: {
				promptTokenCount: 5,
				candidatesTokenCount: 3,
				totalTokenCount: 8,
			},
		}, "req_1", "gemini-2.5-flash", "google-vertex");

		expect(ir.choices).toHaveLength(1);
		expect(ir.choices[0].message.content[0]).toMatchObject({
			type: "reasoning_text",
			text: "thinking...",
			thoughtSignature: "sig_1",
		});
		expect(ir.choices[0].message.content[1]).toMatchObject({
			type: "text",
			text: "final answer",
		});
	});
});

