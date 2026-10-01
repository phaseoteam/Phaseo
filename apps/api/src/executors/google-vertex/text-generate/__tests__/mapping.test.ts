import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { geminiToIR, irToGemini, resolveVertexModelRoute, resolveVertexApiBase } from "../index";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

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
	it("routes managed GPT OSS 20B to its supported region and preserves SSE usage", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_ACCESS_TOKEN: "test-token" } as any);
		const chunks = [
			{ model: "openai/gpt-oss-20b-maas", choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Reason" } }] },
			{ choices: [{ index: 0, delta: { content: "Answer" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4 } } },
		];
		const mock = installFetchMock([{ match: url => url === "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/endpoints/openapi/chat/completions", response: new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }) }]);
		try {
			const result = await execute({ ...buildExecuteArgs(), providerModelSlug: "openai/gpt-oss-20b-maas" });
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "openai/gpt-oss-20b-maas", stream: true, stream_options: { include_usage: true } });
			if (result.kind !== "completed") throw new Error("Expected buffered completion");
			expect((result.ir as any).choices[0].message.content).toEqual(expect.arrayContaining([{ type: "reasoning_text", text: "Reason" }, { type: "text", text: "Answer" }]));
			expect(result.bill.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
		} finally { mock.restore(); teardownTestRuntime(); setupTestRuntime(); }
	});
	it("keeps global Claude pricing and EU residency aligned with native endpoints", () => {
		const bindings = { GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_LOCATION: "us-east5" };
		expect(resolveVertexApiBase(bindings, "google-vertex", "anthropic")).toContain("aiplatform.googleapis.com/v1/projects/test-project/locations/global");
		expect(resolveVertexApiBase(bindings, "google-vertex-eu", "anthropic")).toContain("aiplatform.eu.rep.googleapis.com/v1/projects/test-project/locations/eu");
		expect(() => resolveVertexApiBase(bindings, "google-vertex-eu", "gemini")).toThrow("google-vertex_eu_location_required");
		expect(() => resolveVertexApiBase({ ...bindings, GOOGLE_VERTEX_BASE_URL: "https://aiplatform.googleapis.com/v1/projects/test-project/locations/global" }, "google-vertex-eu", "anthropic")).toThrow("google-vertex_endpoint_region_mismatch");
		expect(resolveVertexApiBase({ ...bindings, GOOGLE_VERTEX_LOCATION: "europe-west4" }, "google-vertex-eu", "gemini")).toContain("europe-west4-aiplatform.googleapis.com");
	});
	it.each(["us", "eu"])("uses the %s multi-region Claude streaming endpoint", async location => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_LOCATION: location, GOOGLE_VERTEX_ACCESS_TOKEN: "test-token" } as any);
		const mock = installFetchMock([{ match: url => url === `https://aiplatform.${location}.rep.googleapis.com/v1/projects/test-project/locations/${location}/publishers/anthropic/models/claude-opus-4-8:streamRawPredict`, response: Response.json({ id: "message", content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) }]);
		try {
			await execute({ ...buildExecuteArgs(), providerId: location === "eu" ? "google-vertex-eu" : "vertex-test", providerModelSlug: "claude-opus-4-8" });
			expect(mock.calls[0].bodyJson).toMatchObject({ anthropic_version: "vertex-2023-10-16", stream: true });
			expect(mock.calls[0].bodyJson).not.toHaveProperty("model");
		} finally { mock.restore(); teardownTestRuntime(); setupTestRuntime(); }
	});
	it("uses the global API hostname for global requests", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_LOCATION: "global", GOOGLE_VERTEX_ACCESS_TOKEN: "test-token" } as any);
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/"),
			response: new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { headers: { "Content-Type": "application/json" } }),
		}]);
		try { expect((await execute(buildExecuteArgs())).kind).toBe("completed"); }
		finally { mock.restore(); teardownTestRuntime(); setupTestRuntime(); }
	});
	it("routes prefixed models by family", () => {
		expect(resolveVertexModelRoute("google/gemini-2.5-flash").family).toBe("gemini");
		expect(resolveVertexModelRoute("anthropic/claude-sonnet-4@20250514").family).toBe("anthropic");
		expect(resolveVertexModelRoute("openai/gpt-4.1").family).toBe("openapi_chat");
	});
});

describe("google-vertex empty response handling", () => {
	it("preserves usage and billing for a successful zero-output Gemini response", async () => {
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

		let result: Awaited<ReturnType<typeof execute>>;
		try {
			result = await execute(buildExecuteArgs());
		} finally {
			mock.restore();
		}

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.usage).toMatchObject({ inputTokens: 8, outputTokens: 0, totalTokens: 8 });
		expect(result.bill.usage).toMatchObject({ input_tokens: 8, output_tokens: 0 });
		expect(result.upstream?.status).toBe(200);
	});
});

describe("google-vertex irToGemini", () => {
	it("maps Gemini 3.8 service tier and structured output", async () => {
		const request = await irToGemini({
			model: "gemini-3.8-flash",
			stream: false,
			serviceTier: "flex",
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			responseFormat: {
				type: "json_schema",
				name: "result",
				schema: { type: "object", properties: { answer: { type: "string" } } },
			},
		} as any);

		expect(request.serviceTier).toBe("flex");
		expect(request.generationConfig).toMatchObject({
			responseMimeType: "application/json",
			responseSchema: { type: "object", properties: { answer: { type: "string" } } },
		});
	});

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
