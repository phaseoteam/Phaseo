import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServerToolContinuation, prepareServerToolsForTextRequest } from "./server-tools";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

const baseServerToolConfig = {
	enabled: true,
	datetimeDefaultTimezone: "UTC",
	webSearchEnabled: false,
	webSearchEngine: "exa" as const,
	webSearchMaxResults: 5,
	webSearchMaxTotalResults: null,
	webSearchResultsUsed: 0,
	webSearchContextSize: "medium" as const,
	webSearchIncludeText: false,
	webSearchIncludeHighlights: true,
	webSearchAllowedDomains: [],
	webSearchExcludedDomains: [],
	webFetchEnabled: false,
	webFetchMaxChars: 12000,
	webFetchAllowedDomains: [],
	webFetchExcludedDomains: [],
	applyPatchEnabled: false,
	imageGenerationEnabled: false,
	imageGenerationModel: "openai/gpt-image-latest",
	fusionEnabled: false,
	fusionAnalysisModels: [],
	fusionModel: null,
	fusionIncludeWeb: true,
	toolSearchEnabled: false,
};

describe("prepareServerToolsForTextRequest", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({
			EXA_API_KEY: "exa_test_key",
			EXA_BASE_URL: "https://api.exa.ai",
		});
	});

	it("passes native web search tools through unchanged", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "web_search_preview", search_context_size: "medium" }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.body.tools).toEqual([
			{ type: "web_search_preview", search_context_size: "medium" },
		]);
	});

	it("passes native web search tool choice through unchanged", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tool_choice: "web_search",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.body.tool_choice).toBe("web_search");
	});

	it("continues to accept gateway datetime tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "gateway:datetime" }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(Array.isArray(result.body.tools)).toBe(true);
		expect(
			(result.body.tools as Array<{ type?: string }>).some(
				(tool) => tool.type === "function",
			),
		).toBe(true);
	});

	it("rewrites gateway web search into a callable function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "gateway:web_search", parameters: { max_results: 4 } }],
				tool_choice: "gateway:web_search",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(result.config.webSearchEnabled).toBe(true);
		expect(result.config.webSearchMaxResults).toBe(4);
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "gateway_web_search" },
		});
		expect(
			(result.body.tools as Array<{ function?: { name?: string } }>).some(
				(tool) => tool.function?.name === "gateway_web_search",
			),
		).toBe(true);
	});

	it("rewrites gateway web fetch into a callable function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "gateway:web_fetch", parameters: { max_chars: 6000 } }],
				tool_choice: "gateway:web_fetch",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(result.config.webFetchEnabled).toBe(true);
		expect(result.config.webFetchMaxChars).toBe(6000);
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "gateway_web_fetch" },
		});
		expect(
			(result.body.tools as Array<{ function?: { name?: string } }>).some(
				(tool) => tool.function?.name === "gateway_web_fetch",
			),
		).toBe(true);
	});

	it("rewrites gateway apply patch into a callable function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-codex",
				tools: [{ type: "gateway:apply_patch" }],
				tool_choice: "gateway:apply_patch",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(result.config.applyPatchEnabled).toBe(true);
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "gateway_apply_patch" },
		});
		expect(
			(result.body.tools as Array<{ function?: { name?: string } }>).some(
				(tool) => tool.function?.name === "gateway_apply_patch",
			),
		).toBe(true);
	});

	it("rewrites image generation, fusion, and tool search server tools", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "anthropic/claude-opus-4.8",
				tools: [
					{ type: "gateway:image_generation", parameters: { model: "openai/gpt-image-latest" } },
					{ type: "gateway:fusion", parameters: { analysis_models: ["openai/gpt-5.5"], include_web: false } },
					{ type: "gateway:tool_search" },
				],
				tool_choice: "gateway:tool_search",
			},
			"openai.chat",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.imageGenerationEnabled).toBe(true);
		expect(result.config.fusionEnabled).toBe(true);
		expect(result.config.toolSearchEnabled).toBe(true);
		expect(result.config.fusionIncludeWeb).toBe(false);
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "gateway_tool_search" },
		});
		const functionNames = (result.body.tools as Array<{ function?: { name?: string } }>)
			.map((tool) => tool.function?.name)
			.filter(Boolean);
		expect(functionNames).toEqual([
			"gateway_image_generation",
			"gateway_fusion",
			"gateway_tool_search",
		]);
	});
});

describe("buildServerToolContinuation", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({
			EXA_API_KEY: "exa_test_key",
			EXA_BASE_URL: "https://api.exa.ai",
		});
	});

	it("executes gateway web search calls and records search usage", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					requestId: "exa_req_123",
					searchType: "auto",
					results: [
						{
							title: "Result 1",
							url: "https://example.com/1",
							publishedDate: "2026-05-09T00:00:00.000Z",
							author: "Author 1",
							highlights: ["Important detail"],
							text: "Page text 1",
							summary: "Summary 1",
						},
						{
							title: "Result 2",
							url: "https://example.com/2",
							highlights: ["Another detail"],
							text: "Page text 2",
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [
						{
							message: {
								role: "assistant",
								content: [],
								toolCalls: [
									{
										id: "call_search",
										name: "gateway_web_search",
										arguments: JSON.stringify({
											query: "latest AI policy",
											max_results: 2,
											include_text: true,
										}),
									},
								],
							},
							finishReason: "tool_calls",
						},
					],
				} as any,
				{
					...baseServerToolConfig,
					webSearchEnabled: true,
				},
			);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.exa.ai/search",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"x-api-key": "exa_test_key",
					}),
				}),
			);
			const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
			expect(body).toMatchObject({
				query: "latest AI policy",
				numResults: 2,
				type: "auto",
			});
			expect(continuation?.usage).toEqual({
				datetimeRequests: 0,
				webSearchRequests: 1,
				webFetchRequests: 2,
				applyPatchRequests: 0,
				imageGenerationRequests: 0,
				fusionRequests: 0,
				toolSearchRequests: 0,
			});
			expect(continuation?.toolResults).toHaveLength(1);
			expect(continuation?.toolResults[0]).toMatchObject({
				toolCallId: "call_search",
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "exa",
				request_id: "exa_req_123",
				search_type: "auto",
				query: "latest AI policy",
			});
			expect(parsed.results).toHaveLength(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("applies gateway web search domain filters and cumulative result limits", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					requestId: "exa_req_filters",
					results: [
						{ title: "A", url: "https://example.com/a", highlights: ["A"] },
						{ title: "B", url: "https://example.com/b", highlights: ["B"] },
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [
						{
							message: {
								role: "assistant",
								content: [],
								toolCalls: [
									{
										id: "call_search",
										name: "gateway_web_search",
										arguments: JSON.stringify({
											query: "agent search tools",
											max_results: 5,
										}),
									},
								],
							},
							finishReason: "tool_calls",
						},
					],
				} as any,
				{
					...baseServerToolConfig,
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchMaxTotalResults: 2,
					webSearchAllowedDomains: ["example.com"],
					webSearchExcludedDomains: ["reddit.com"],
				},
			);

			const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
			expect(body).toMatchObject({
				numResults: 2,
				includeDomains: ["example.com"],
				excludeDomains: ["reddit.com"],
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed.results).toHaveLength(2);
			expect(parsed.results_used).toBe(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("executes gateway web fetch calls and returns bounded text", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				"<html><head><title>Example Page</title></head><body><h1>Hello</h1><p>World</p></body></html>",
				{
					status: 200,
					headers: { "Content-Type": "text/html; charset=utf-8" },
				},
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [
						{
							message: {
								role: "assistant",
								content: [],
								toolCalls: [
									{
										id: "call_fetch",
										name: "gateway_web_fetch",
										arguments: JSON.stringify({
											url: "https://example.com/page",
											max_chars: 64,
										}),
									},
								],
							},
							finishReason: "tool_calls",
						},
					],
				} as any,
			{
				...baseServerToolConfig,
				webFetchEnabled: true,
			},
		);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://example.com/page",
				expect.objectContaining({
					method: "GET",
					redirect: "follow",
				}),
			);
			expect(continuation?.usage).toEqual({
				datetimeRequests: 0,
				webSearchRequests: 0,
				webFetchRequests: 1,
				applyPatchRequests: 0,
				imageGenerationRequests: 0,
				fusionRequests: 0,
				toolSearchRequests: 0,
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "fetch",
				url: "https://example.com/page",
				status: 200,
				title: "Example Page",
				text: "Example Page Hello World",
				truncated: false,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("captures gateway apply patch calls without applying files", async () => {
		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_patch",
									name: "gateway_apply_patch",
									arguments: JSON.stringify({
										summary: "Update greeting",
										patch: [
											"*** Begin Patch",
											"*** Update File: hello.txt",
											"@@",
											"-hello",
											"+hello world",
											"*** End Patch",
										].join("\n"),
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				...baseServerToolConfig,
				applyPatchEnabled: true,
			},
		);

		expect(continuation?.usage).toEqual({
			datetimeRequests: 0,
			webSearchRequests: 0,
			webFetchRequests: 0,
			applyPatchRequests: 1,
			imageGenerationRequests: 0,
			fusionRequests: 0,
			toolSearchRequests: 0,
		});
		const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
		expect(parsed).toMatchObject({
			type: "apply_patch",
			format: "codex_v4a",
			applied: false,
			summary: "Update greeting",
		});
		expect(parsed.patch).toContain("*** Begin Patch");
		expect(parsed.patch).toContain("*** End Patch");
	});

	it("executes gateway tool search calls from the local server-tool catalog", async () => {
		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_tool_search",
									name: "gateway_tool_search",
									arguments: JSON.stringify({
										query: "image generation",
										max_results: 3,
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				...baseServerToolConfig,
				toolSearchEnabled: true,
			},
		);

		expect(continuation?.usage).toEqual({
			datetimeRequests: 0,
			webSearchRequests: 0,
			webFetchRequests: 0,
			applyPatchRequests: 0,
			imageGenerationRequests: 0,
			fusionRequests: 0,
			toolSearchRequests: 1,
		});
		const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
		expect(parsed.results[0]).toMatchObject({
			type: "gateway:image_generation",
			function_name: "gateway_image_generation",
		});
	});
});
