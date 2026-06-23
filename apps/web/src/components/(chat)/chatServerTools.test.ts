import { buildChatServerTools } from "./chatServerTools";

describe("buildChatServerTools", () => {
	it("returns no tools when every server tool is disabled", () => {
		expect(buildChatServerTools({})).toEqual([]);
	});

	it("builds datetime with a timezone when configured", () => {
		expect(
			buildChatServerTools({
				apiServerToolsEnabled: true,
				serverToolTimezone: "Europe/London",
			}),
		).toEqual([
			{
				type: "gateway:datetime",
				parameters: { timezone: "Europe/London" },
			},
		]);
	});

	it("builds web search, web fetch, advisor, and subagent tools", () => {
		const tools = buildChatServerTools({
			webSearchEnabled: true,
			serverToolWebFetchEnabled: true,
			serverToolAdvisorEnabled: true,
			serverToolSubagentEnabled: true,
			serverToolSubagentModel: "anthropic/claude-haiku-4.5",
			serverToolSubagentInstructions: "Return only implementation notes.",
			serverToolSubagentMaxUses: 3,
		});

		expect(tools.map((tool) => tool.type)).toEqual([
			"ai-stats:web_search",
			"ai-stats:web_fetch",
			"ai-stats:advisor",
			"ai-stats:subagent",
		]);
		expect(tools[3]).toEqual(
			expect.objectContaining({
				parameters: expect.objectContaining({
					model: "anthropic/claude-haiku-4.5",
					instructions: "Return only implementation notes.",
					max_uses: 3,
					max_completion_tokens: 1200,
				}),
			}),
		);
	});

	it("applies web search and web fetch defaults", () => {
		const tools = buildChatServerTools({
			webSearchEnabled: true,
			serverToolWebSearchEngine: "perplexity",
			serverToolWebSearchContextSize: "high",
			serverToolWebSearchMaxResults: 7,
			serverToolWebSearchMaxTotalResults: 40,
			serverToolWebSearchMaxCharacters: 12000,
			serverToolWebSearchAllowedDomains: "docs.example.com, api.example.com",
			serverToolWebSearchBlockedDomains: "spam.example",
			serverToolWebFetchEnabled: true,
			serverToolWebFetchEngine: "direct",
			serverToolWebFetchMaxContentTokens: 24000,
			serverToolWebFetchAllowedDomains: "docs.example.com",
			serverToolWebFetchBlockedDomains: "ads.example",
		});

		expect(tools[0]).toEqual({
			type: "ai-stats:web_search",
			parameters: {
				engine: "perplexity",
				search_context_size: "high",
				max_results: 7,
				max_total_results: 40,
				max_characters: 12000,
				allowed_domains: ["docs.example.com", "api.example.com"],
				excluded_domains: ["spam.example"],
			},
		});
		expect(tools[1]).toEqual({
			type: "ai-stats:web_fetch",
			parameters: {
				engine: "direct",
				max_content_tokens: 24000,
				allowed_domains: ["docs.example.com"],
				blocked_domains: ["ads.example"],
			},
		});
	});

	it("applies image generation defaults", () => {
		const tools = buildChatServerTools({
			serverToolImageGenerationEnabled: true,
			serverToolImageGenerationModel: "openai/gpt-image-2",
			serverToolImageGenerationQuality: "high",
			serverToolImageGenerationAspectRatio: "16:9",
			serverToolImageGenerationSize: "1536x864",
			serverToolImageGenerationBackground: "transparent",
			serverToolImageGenerationOutputFormat: "webp",
			serverToolImageGenerationOutputCompression: 72,
			serverToolImageGenerationModeration: "low",
		});

		expect(tools).toEqual([
			{
				type: "ai-stats:image_generation",
				parameters: {
					model: "openai/gpt-image-2",
					quality: "high",
					aspect_ratio: "16:9",
					size: "1536x864",
					background: "transparent",
					output_format: "webp",
					output_compression: 72,
					moderation: "low",
				},
			},
		]);
	});

	it("builds named advisor tools from configured advisors", () => {
		const tools = buildChatServerTools({
			serverToolAdvisorEnabled: true,
			serverToolAdvisors: [
				{
					name: "reviewer",
					model: "openai/gpt-latest",
					instructions: "Check the answer for gaps.",
				},
				{
					name: "architect",
					model: "anthropic/claude-latest",
					instructions: "Focus on implementation tradeoffs.",
				},
			],
		});

		expect(tools).toEqual([
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "reviewer",
					model: "openai/gpt-latest",
					instructions: "Check the answer for gaps.",
					max_uses: 1,
					max_completion_tokens: 1400,
				},
			},
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "architect",
					model: "anthropic/claude-latest",
					instructions: "Focus on implementation tradeoffs.",
					max_uses: 1,
					max_completion_tokens: 1400,
				},
			},
		]);
	});

	it("does not assign advisor names unless configured", () => {
		const tools = buildChatServerTools({
			serverToolAdvisorEnabled: true,
			serverToolAdvisors: [
				{
					name: "",
					model: "openai/gpt-latest",
					instructions: "Check the answer for gaps.",
				},
				{
					name: "",
					model: "anthropic/claude-latest",
					instructions: "This unnamed duplicate is ignored.",
				},
			],
		});

		expect(tools).toHaveLength(1);
		expect(tools[0]).toEqual({
			type: "ai-stats:advisor",
			parameters: {
				model: "openai/gpt-latest",
				instructions: "Check the answer for gaps.",
				max_uses: 1,
				max_completion_tokens: 1400,
			},
		});
	});

	it("builds fusion as named advisor tools", () => {
		const tools = buildChatServerTools({
			serverToolFusionEnabled: true,
			serverToolFusionAnalysisModels: [
				"anthropic/claude-opus-4.8",
				"openai/gpt-5.1",
				"google/gemini-3-pro",
			],
			serverToolFusionJudgeModel: "openai/gpt-5.1",
			serverToolFusionMaxUses: 8,
		});

		expect(tools).toHaveLength(4);
		expect(tools.map((tool) => tool.type)).toEqual([
			"ai-stats:advisor",
			"ai-stats:advisor",
			"ai-stats:advisor",
			"ai-stats:advisor",
		]);
		expect(tools[0]).toEqual(
			expect.objectContaining({
				parameters: expect.objectContaining({
					name: "fusion_analysis_1",
					model: "anthropic/claude-opus-4.8",
					max_uses: 8,
				}),
			}),
		);
		expect(tools[3]).toEqual(
			expect.objectContaining({
				parameters: expect.objectContaining({
					name: "fusion_judge",
					model: "openai/gpt-5.1",
					max_uses: 8,
				}),
			}),
		);
	});
});
