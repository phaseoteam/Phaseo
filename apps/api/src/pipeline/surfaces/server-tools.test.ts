import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServerToolContinuation, prepareServerToolsForTextRequest } from "./server-tools";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

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

	it("rewrites AI Stats web search into a callable function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:web_search", parameters: { max_results: 4 } }],
				tool_choice: "ai-stats:web_search",
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
			function: { name: "ai_stats_web_search" },
		});
		expect(
			(result.body.tools as Array<{ function?: { name?: string } }>).some(
				(tool) => tool.function?.name === "ai_stats_web_search",
			),
		).toBe(true);
	});

	it("accepts AI Stats web search aliases and engine parameters", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{
						type: "ai-stats:web_search",
						parameters: {
							engine: "exa",
							max_results: 12,
							max_total_results: 30,
							search_context_size: "high",
							allowed_domains: ["arxiv.org"],
							excluded_domains: ["reddit.com"],
						},
					},
				],
				tool_choice: "ai-stats:web_search",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config).toMatchObject({
			enabled: true,
			webSearchEnabled: true,
			webSearchEngine: "exa",
			webSearchMaxResults: 12,
			webSearchMaxTotalResults: 30,
			webSearchContextSize: "high",
			webSearchAllowedDomains: ["arxiv.org"],
			webSearchExcludedDomains: ["reddit.com"],
		});
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "ai_stats_web_search" },
		});
	});

	it("converts AI Stats native web search aliases into provider-native tools", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{
						type: "ai-stats:web_search",
						parameters: {
							engine: "native",
							search_context_size: "low",
							user_location: { type: "approximate", country: "US" },
						},
					},
				],
				tool_choice: "ai-stats:web_search",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(false);
		expect(result.body.tools).toEqual([
			{
				type: "web_search_preview",
				search_context_size: "low",
				user_location: { type: "approximate", country: "US" },
			},
		]);
		expect(result.body.tool_choice).toBe("web_search_preview");
	});

	it("rewrites AI Stats web fetch into a callable function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:web_fetch", parameters: { max_chars: 6000 } }],
				tool_choice: "ai-stats:web_fetch",
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
			function: { name: "ai_stats_web_fetch" },
		});
		expect(
			(result.body.tools as Array<{ function?: { name?: string } }>).some(
				(tool) => tool.function?.name === "ai_stats_web_fetch",
			),
		).toBe(true);
	});

	it("converts native AI Stats web fetch into Anthropic native web fetch", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "claude-sonnet-4.6",
				tools: [
					{
						type: "ai-stats:web_fetch",
						parameters: {
							engine: "native",
							max_content_tokens: 9000,
							allowed_domains: ["docs.ai-stats.com"],
							blocked_domains: ["internal.ai-stats.com"],
						},
					},
				],
				tool_choice: "ai-stats:web_fetch",
			},
			"anthropic.messages",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(false);
		expect(result.body.tools).toEqual([
			{
				type: "web_fetch_20260209",
				name: "web_fetch",
				max_content_tokens: 9000,
				allowed_domains: ["docs.ai-stats.com"],
				blocked_domains: ["internal.ai-stats.com"],
			},
		]);
		expect(result.body.tool_choice).toEqual({ type: "tool", name: "web_fetch" });
	});

	it("resolves auto AI Stats web fetch to Anthropic native web fetch", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "claude-sonnet-4.6",
				tools: [
					{
						type: "ai-stats:web_fetch",
						parameters: {
							engine: "auto",
							max_content_tokens: 7000,
						},
					},
				],
				tool_choice: "ai-stats:web_fetch",
			},
			"anthropic.messages",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(false);
		expect(result.body.tools).toEqual([
			{
				type: "web_fetch_20260209",
				name: "web_fetch",
				max_content_tokens: 7000,
			},
		]);
	});

	it("resolves auto AI Stats web fetch to Exa when configured on non-native surfaces", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:web_fetch", parameters: { engine: "auto" } }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.webFetchEnabled).toBe(true);
		expect(result.config.webFetchEngine).toBe("exa");
	});

	it("resolves auto AI Stats web fetch to direct when Exa is not configured", () => {
		getBindingsMock.mockReturnValue({});
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:web_fetch", parameters: { engine: "auto" } }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.webFetchEnabled).toBe(true);
		expect(result.config.webFetchEngine).toBe("direct");
	});

	it("rejects native AI Stats web fetch on non-Anthropic request surfaces", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{
						type: "ai-stats:web_fetch",
						parameters: { engine: "native" },
					},
				],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to fail");
		}
		expect(result.message).toContain("Anthropic Messages");
	});

	it("rewrites named AI Stats advisors into Anthropic managed tools", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "claude-sonnet-4.6",
				tools: [
					{
						type: "ai-stats:advisor",
						parameters: {
							name: "reviewer",
							model: "claude-opus-4-8",
							instructions: "Review for migration risk.",
							forward_transcript: true,
							max_uses: 2,
							max_completion_tokens: 1400,
							reasoning: { effort: "high" },
							temperature: 0.2,
						},
					},
					{
						type: "ai-stats:advisor",
						parameters: {
							name: "architect",
							instructions: "Focus on architecture tradeoffs.",
						},
					},
				],
				tool_choice: "ai-stats:advisor",
			},
			"anthropic.messages",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(result.config.advisorEnabled).toBe(true);
		expect(result.config.defaultAdvisorFunctionName).toBe("ai_stats_advisor_reviewer");
		expect(result.config.advisors?.ai_stats_advisor_reviewer).toMatchObject({
			name: "reviewer",
			model: "claude-opus-4-8",
			instructions: "Review for migration risk.",
			forwardTranscript: true,
			maxUses: 2,
			maxTokens: 1400,
			reasoning: { effort: "high" },
			temperature: 0.2,
		});
		expect(result.config.advisors?.ai_stats_advisor_architect).toMatchObject({
			name: "architect",
			forwardTranscript: false,
			maxUses: 1,
		});
		expect(result.body.tools).toEqual([
			{
				name: "ai_stats_advisor_reviewer",
				description: expect.stringContaining('"reviewer" advisor model'),
				input_schema: expect.objectContaining({
					properties: expect.objectContaining({
						prompt: expect.objectContaining({ type: "string" }),
					}),
				}),
			},
			{
				name: "ai_stats_advisor_architect",
				description: expect.stringContaining('"architect" advisor model'),
				input_schema: expect.objectContaining({
					required: ["prompt"],
					properties: expect.objectContaining({
						model: expect.objectContaining({ type: "string" }),
					}),
				}),
			},
		]);
		expect(result.body.tool_choice).toEqual({ type: "tool", name: "ai_stats_advisor_reviewer" });
	});

	it("rewrites AI Stats advisor into an OpenAI-compatible managed function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{
						type: "ai-stats:advisor",
						parameters: { model: "anthropic/claude-opus-4-8" },
					},
				],
				tool_choice: "ai-stats:advisor",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(result.config.advisorEnabled).toBe(true);
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "ai_stats_advisor" },
		});
		expect(result.body.tools).toEqual([
			{
				type: "function",
				function: {
					name: "ai_stats_advisor",
					description: expect.stringContaining("advisor model"),
					parameters: expect.objectContaining({
						required: ["prompt"],
					}),
				},
			},
		]);
	});

	it("rejects duplicate AI Stats advisor names", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{ type: "ai-stats:advisor", parameters: { name: "reviewer" } },
					{ type: "ai-stats:advisor", parameters: { name: " reviewer " } },
				],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected duplicate advisors to fail");
		expect(result.message).toContain("Duplicate Advisor name");
	});

	it("rejects multiple unnamed AI Stats advisors", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{ type: "ai-stats:advisor" },
					{ type: "ai-stats:advisor" },
				],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected unnamed advisors to fail");
		expect(result.message).toContain("Only one unnamed Advisor");
	});

	it("rewrites AI Stats image generation into a managed function tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [
					{
						type: "ai-stats:image_generation",
						parameters: {
							model: "openai/gpt-image-2",
							quality: "high",
							aspect_ratio: "16:9",
							output_format: "png",
						},
					},
				],
				tool_choice: "ai-stats:image_generation",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("Expected image generation tool to prepare");
		expect(result.config.imageGenerationEnabled).toBe(true);
		expect(result.config.imageGeneration).toMatchObject({
			model: "openai/gpt-image-2",
			quality: "high",
			aspectRatio: "16:9",
			outputFormat: "png",
		});
		expect(result.body.tool_choice).toEqual({
			type: "function",
			function: { name: "ai_stats_image_generation" },
		});
		expect(result.body.tools).toEqual([
			{
				type: "function",
				function: expect.objectContaining({
					name: "ai_stats_image_generation",
					parameters: expect.objectContaining({
						properties: expect.objectContaining({
							prompt: expect.any(Object),
							description: expect.any(Object),
						}),
					}),
				}),
			},
		]);
	});

	it("rewrites AI Stats apply patch on Responses and rejects other surfaces", () => {
		const responsesResult = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:apply_patch" }],
				tool_choice: "ai-stats:apply_patch",
			},
			"openai.responses",
		);
		expect(responsesResult.ok).toBe(true);
		if (!responsesResult.ok) throw new Error("Expected apply patch tool to prepare");
		expect(responsesResult.config.applyPatchEnabled).toBe(true);
		expect(responsesResult.body.tool_choice).toEqual({
			type: "function",
			function: { name: "ai_stats_apply_patch" },
		});

		const chatResult = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "ai-stats:apply_patch" }],
			},
			"openai.chat.completions",
		);
		expect(chatResult.ok).toBe(false);
		if (chatResult.ok) throw new Error("Expected apply patch to reject chat completions");
		expect(chatResult.message).toContain("Responses API");
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

	it("executes AI Stats web search calls and records search usage", async () => {
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
										name: "ai_stats_web_search",
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
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: false,
					webFetchMaxChars: 12000,
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
			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				query: "latest AI policy",
				type: "auto",
				numResults: 2,
				contents: {
					text: true,
				},
			});
			expect(continuation?.usage).toEqual({
				datetimeRequests: 0,
				webSearchRequests: 1,
				webSearchResults: 2,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
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

	it("executes AI Stats advisor calls through the provided advisor executor", async () => {
		const executeAdvisor = vi.fn(async () => ({
			ok: true as const,
			content: "Use a smaller migration with explicit rollback steps.",
			usage: {
				inputTokens: 30,
				outputTokens: 12,
				totalTokens: 42,
			},
		}));

		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_advisor",
									name: "ai_stats_advisor_reviewer",
									arguments: JSON.stringify({
										prompt: "Review this migration plan.",
										model: "anthropic/claude-opus-4-8",
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				enabled: true,
				datetimeDefaultTimezone: "UTC",
				webSearchEnabled: false,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
				advisorEnabled: true,
				defaultAdvisorModel: "openai/gpt-5-nano",
				defaultAdvisorFunctionName: "ai_stats_advisor_reviewer",
				advisors: {
					ai_stats_advisor_reviewer: {
						functionName: "ai_stats_advisor_reviewer",
						name: "reviewer",
						instructions: "Review for migration risk.",
						forwardTranscript: true,
						maxUses: 2,
						maxTokens: 1400,
						reasoning: { effort: "high" },
						temperature: 0.2,
					},
				},
			},
			{ executeAdvisor },
		);

		expect(executeAdvisor).toHaveBeenCalledWith({
			model: "anthropic/claude-opus-4-8",
			prompt: "Review this migration plan.",
			maxTokens: 1400,
			instructions: "Review for migration risk.",
			forwardTranscript: true,
			reasoning: { effort: "high" },
			temperature: 0.2,
		});
		expect(continuation?.usage.advisorRequests).toBe(1);
		expect(continuation?.advisorUsage).toEqual({
			inputTokens: 30,
			outputTokens: 12,
			totalTokens: 42,
		});
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toEqual({
			status: "ok",
			name: "reviewer",
			model: "anthropic/claude-opus-4-8",
			advice: "Use a smaller migration with explicit rollback steps.",
		});
	});

	it("executes AI Stats image generation calls through the provided image executor", async () => {
		const executeImageGeneration = vi.fn(async () => ({
			ok: true as const,
			model: "openai/gpt-image-2",
			imageUrl: "https://example.com/generated.png",
			mimeType: "image/png",
			usage: {
				inputTokens: 12,
				outputTokens: 0,
				totalTokens: 12,
				_ext: { outputImageTokens: 1 },
			},
		}));

		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_image",
									name: "ai_stats_image_generation",
									arguments: JSON.stringify({
										prompt: "A futuristic city at sunset",
										aspect_ratio: "16:9",
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				enabled: true,
				datetimeDefaultTimezone: "UTC",
				webSearchEnabled: false,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
				imageGenerationEnabled: true,
				imageGeneration: {
					model: "openai/gpt-image-2",
					quality: "high",
				},
			},
			{ executeImageGeneration },
		);

		expect(executeImageGeneration).toHaveBeenCalledWith({
			model: "openai/gpt-image-2",
			prompt: "A futuristic city at sunset",
			quality: "high",
			size: undefined,
			aspectRatio: "16:9",
			background: undefined,
			outputFormat: undefined,
			outputCompression: undefined,
			moderation: undefined,
		});
		expect(continuation?.usage.imageGenerationRequests).toBe(1);
		expect(continuation?.imageGenerationUsage).toEqual({
			inputTokens: 12,
			outputTokens: 0,
			totalTokens: 12,
			_ext: { outputImageTokens: 1 },
		});
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toEqual({
			status: "ok",
			model: "openai/gpt-image-2",
			imageUrl: "https://example.com/generated.png",
			mime_type: "image/png",
		});
	});

	it("uses the default image model and accepts description as the image prompt", async () => {
		const executeImageGeneration = vi.fn(async () => ({
			ok: true as const,
			model: "openai/gpt-image-2",
			imageUrl: "https://example.com/generated.png",
		}));

		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_image",
									name: "ai_stats_image_generation",
									arguments: JSON.stringify({
										description: "A product mockup on a neutral desk",
										size: "1024x1024",
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				enabled: true,
				datetimeDefaultTimezone: "UTC",
				webSearchEnabled: false,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
				imageGenerationEnabled: true,
			},
			{ executeImageGeneration },
		);

		expect(executeImageGeneration).toHaveBeenCalledWith(expect.objectContaining({
			model: "openai/gpt-image-2",
			prompt: "A product mockup on a neutral desk",
			size: "1024x1024",
		}));
		expect(continuation?.usage.imageGenerationRequests).toBe(1);
	});

	it("validates AI Stats apply patch operations without applying files", async () => {
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
									name: "ai_stats_apply_patch",
									arguments: JSON.stringify({
										operation: {
											type: "create_file",
											path: "/src/hello.py",
											diff: "+print(\"Hello\")\n",
										},
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				enabled: true,
				datetimeDefaultTimezone: "UTC",
				webSearchEnabled: false,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
				applyPatchEnabled: true,
			},
		);

		expect(continuation?.usage.applyPatchRequests).toBe(1);
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toEqual({
			status: "completed",
				operation: {
					type: "create_file",
					path: "/src/hello.py",
					diff: "+print(\"Hello\")",
				},
			message: "Patch operation validated. The client must apply or reject this patch and report the result.",
		});
	});

	it("forwards max_characters to Exa text contents when provided", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ results: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			await buildServerToolContinuation(
				{
					choices: [
						{
							message: {
								role: "assistant",
								content: [],
								toolCalls: [
									{
										id: "call_search_chars",
										name: "ai_stats_web_search",
										arguments: JSON.stringify({
											query: "latest AI policy",
											include_text: true,
											max_characters: 2048,
										}),
									},
								],
							},
							finishReason: "tool_calls",
						},
					],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: false,
					webFetchMaxChars: 12000,
				},
			);

			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				contents: {
					text: { maxCharacters: 2048 },
				},
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("returns an explicit error for managed search engines that are not configured yet", async () => {
		const continuation = await buildServerToolContinuation(
			{
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_parallel",
									name: "ai_stats_web_search",
									arguments: JSON.stringify({
										query: "latest AI policy",
										engine: "parallel",
									}),
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			} as any,
			{
				enabled: true,
				datetimeDefaultTimezone: "UTC",
				webSearchEnabled: true,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
			},
		);

		expect(continuation?.usage).toMatchObject({
			webSearchRequests: 1,
			webSearchResults: 0,
			webSearchExtraResults: 0,
			webFetchRequests: 0,
		});
		const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
		expect(parsed).toMatchObject({
			error: "search_not_configured",
			engine: "parallel",
		});
	});

	it("executes configured Parallel web search calls", async () => {
		getBindingsMock.mockReturnValue({
			PARALLEL_API_KEY: "parallel_test_key",
			PARALLEL_BASE_URL: "https://api.parallel.ai",
		});
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					search_id: "parallel_search_123",
					results: [
						{
							title: "Parallel Result",
							url: "https://example.com/parallel",
							publish_date: "2026-06-01",
							excerpts: ["Parallel excerpt"],
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
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_parallel",
								name: "ai_stats_web_search",
								arguments: JSON.stringify({
									query: "latest AI policy",
									engine: "parallel",
									max_results: 1,
									max_characters: 1200,
									allowed_domains: ["example.com"],
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: false,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.parallel.ai/v1/search",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ "x-api-key": "parallel_test_key" }),
				}),
			);
			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				objective: "latest AI policy",
				advanced_settings: {
					max_results: 1,
					source_policy: { include_domains: ["example.com"] },
					excerpt_settings: { max_chars_per_result: 1200 },
				},
			});
			expect(continuation?.usage).toMatchObject({
				webSearchRequests: 1,
				webSearchResults: 1,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "parallel",
				engine: "parallel",
				request_id: "parallel_search_123",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("executes configured Firecrawl web search calls", async () => {
		getBindingsMock.mockReturnValue({
			FIRECRAWL_API_KEY: "firecrawl_test_key",
			FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
		});
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					success: true,
					id: "firecrawl_search_123",
					creditsUsed: 1,
					data: {
						web: [
							{
								title: "Firecrawl Result",
								url: "https://example.com/firecrawl",
								description: "Firecrawl snippet",
								markdown: "Firecrawl markdown body",
							},
						],
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_firecrawl",
								name: "ai_stats_web_search",
								arguments: JSON.stringify({
									query: "latest AI policy",
									engine: "firecrawl",
									max_results: 1,
									include_text: true,
									max_characters: 10,
									excluded_domains: ["reddit.com"],
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: false,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.firecrawl.dev/v2/search",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ Authorization: "Bearer firecrawl_test_key" }),
				}),
			);
			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				query: "latest AI policy",
				limit: 1,
				excludeDomains: ["reddit.com"],
				scrapeOptions: { formats: [{ type: "markdown" }] },
			});
			expect(continuation?.usage).toMatchObject({
				webSearchRequests: 1,
				webSearchResults: 1,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "firecrawl",
				engine: "firecrawl",
				request_id: "firecrawl_search_123",
				credits_used: 1,
			});
			expect(parsed.results[0].text).toBe("Firecrawl");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("rejects Firecrawl web search calls with both include and exclude domain filters", async () => {
		getBindingsMock.mockReturnValue({
			FIRECRAWL_API_KEY: "firecrawl_test_key",
			FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_firecrawl_domains",
								name: "ai_stats_web_search",
								arguments: JSON.stringify({
									query: "latest AI policy",
									engine: "firecrawl",
									allowed_domains: ["example.com"],
									excluded_domains: ["reddit.com"],
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: true,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: false,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(continuation?.usage).toMatchObject({
				webSearchRequests: 1,
				webSearchResults: 0,
				webSearchExtraResults: 0,
			});
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				error: "invalid_domain_policy",
				engine: "firecrawl",
				allowed_domains: ["example.com"],
				excluded_domains: ["reddit.com"],
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("executes AI Stats web fetch calls and returns bounded text", async () => {
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
										name: "ai_stats_web_fetch",
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
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: false,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: true,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://example.com/page",
				expect.objectContaining({
					method: "GET",
					redirect: "manual",
					signal: expect.any(AbortSignal),
				}),
			);
			expect(continuation?.usage).toEqual({
				datetimeRequests: 0,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 1,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
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

	it("rejects direct web fetch calls to private network targets", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_private_fetch",
								name: "ai_stats_web_fetch",
								arguments: JSON.stringify({
									url: "http://127.0.0.1:8787/admin",
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: false,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: true,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).not.toHaveBeenCalled();
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				error: "url_blocked_by_domain_policy",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("rejects direct web fetch redirects to private network targets", async () => {
		const fetchMock = vi.fn(async () =>
			new Response("", {
				status: 302,
				headers: { location: "http://169.254.169.254/latest/meta-data" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_redirect_private_fetch",
								name: "ai_stats_web_fetch",
								arguments: JSON.stringify({
									url: "https://example.com/redirect",
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: false,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: true,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				error: "redirect_blocked_by_domain_policy",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("executes configured Parallel web fetch calls", async () => {
		getBindingsMock.mockReturnValue({
			PARALLEL_API_KEY: "parallel_test_key",
			PARALLEL_BASE_URL: "https://api.parallel.ai",
		});
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					extract_id: "parallel_extract_123",
					results: [
						{
							url: "https://example.com/page",
							title: "Parallel Page",
							publish_date: "2026-06-01",
							full_content: "Parallel markdown body with extra text",
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
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_parallel_fetch",
								name: "ai_stats_web_fetch",
								arguments: JSON.stringify({
									url: "https://example.com/page",
									engine: "parallel",
									max_chars: 16,
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: false,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: true,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.parallel.ai/v1/extract",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ "x-api-key": "parallel_test_key" }),
				}),
			);
			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				urls: ["https://example.com/page"],
				advanced_settings: {
					full_content: { max_chars_per_result: 16 },
				},
			});
			expect(continuation?.usage).toMatchObject({ webFetchRequests: 1 });
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "parallel",
				engine: "parallel",
				request_id: "parallel_extract_123",
				title: "Parallel Page",
				text: "Parallel markdow",
				truncated: true,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("executes configured Firecrawl web fetch calls", async () => {
		getBindingsMock.mockReturnValue({
			FIRECRAWL_API_KEY: "firecrawl_test_key",
			FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
		});
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					id: "firecrawl_scrape_123",
					data: {
						markdown: "Firecrawl markdown body",
						metadata: {
							title: "Firecrawl Page",
							sourceURL: "https://example.com/page",
							statusCode: 200,
							contentType: "text/html",
						},
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const continuation = await buildServerToolContinuation(
				{
					choices: [{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [{
								id: "call_firecrawl_fetch",
								name: "ai_stats_web_fetch",
								arguments: JSON.stringify({
									url: "https://example.com/page",
									engine: "firecrawl",
									max_content_tokens: 9,
								}),
							}],
						},
						finishReason: "tool_calls",
					}],
				} as any,
				{
					enabled: true,
					datetimeDefaultTimezone: "UTC",
					webSearchEnabled: false,
					webSearchMaxResults: 5,
					webSearchIncludeText: false,
					webSearchIncludeHighlights: true,
					webFetchEnabled: true,
					webFetchMaxChars: 12000,
				},
			);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.firecrawl.dev/v2/scrape",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ Authorization: "Bearer firecrawl_test_key" }),
				}),
			);
			expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
				url: "https://example.com/page",
				formats: ["markdown"],
				onlyMainContent: true,
			});
			expect(continuation?.usage).toMatchObject({ webFetchRequests: 1 });
			const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
			expect(parsed).toMatchObject({
				provider: "firecrawl",
				engine: "firecrawl",
				request_id: "firecrawl_scrape_123",
				title: "Firecrawl Page",
				status: 200,
				text: "Firecrawl",
				truncated: true,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

