import {
	buildServerToolDefinitions,
	normalizeServerTools,
} from "./chat-playground-core";

describe("buildServerToolDefinitions", () => {
	it("caps and validates datetime timezone parameters", () => {
		const tools = buildServerToolDefinitions(["gateway:datetime"], {
			datetime: { timezone: "Asia/Tokyo" },
		}, {
			datetimeTimezone: "Europe/London",
			datetimeTimezones: [
				"UTC",
				"Europe/London",
				"America/New_York",
				"America/Los_Angeles",
				"../../etc/passwd",
				"Asia/Singapore",
				"Australia/Sydney",
			],
		});

		expect(tools).toEqual([
			{
				type: "gateway:datetime",
				parameters: {
					timezones: [
						"UTC",
						"Europe/London",
						"America/New_York",
						"America/Los_Angeles",
						"Asia/Singapore",
					],
				},
			},
		]);
	});

	it("supports the composer server tool set", () => {
		expect(
			normalizeServerTools([
				"ai-stats:web_search",
				"ai-stats:web_fetch",
				"ai-stats:image_generation",
				"gateway:datetime",
				"ai-stats:fusion",
				"ai-stats:advisor",
				"ai-stats:subagent",
				"ai-stats:apply_patch" as never,
			]),
		).toEqual([
			"ai-stats:web_search",
			"ai-stats:web_fetch",
			"ai-stats:image_generation",
			"gateway:datetime",
			"ai-stats:fusion",
			"ai-stats:advisor",
			"ai-stats:subagent",
		]);
	});

	it("builds fusion model sets and subagent as its documented tool type", () => {
		const tools = buildServerToolDefinitions(
			["ai-stats:fusion", "ai-stats:subagent"],
			{
				fusion: {
					models: [
						"openai/gpt-5.5",
						"anthropic/claude-opus-4.8",
						"openai/gpt-5.5",
						"",
					],
					judgeModel: "google/gemini-3.1-pro",
					maxUses: 2,
				},
				subagent: {
					model: "openai/gpt-5-nano",
					instructions: "Return concise findings only.",
					maxUses: 3,
					maxCompletionTokens: 900,
					temperature: 3,
					reasoningEffort: "max",
				},
			},
		);

		expect(tools).toEqual([
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "fusion_1",
					model: "openai/gpt-5.5",
					instructions:
						"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.",
					max_uses: 2,
				},
			},
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "fusion_2",
					model: "anthropic/claude-opus-4.8",
					instructions:
						"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.",
					max_uses: 2,
				},
			},
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "fusion_judge",
					model: "google/gemini-3.1-pro",
					instructions:
						"Review the analysis model outputs and identify the strongest final answer direction.",
					max_uses: 2,
				},
			},
			{
				type: "ai-stats:subagent",
				parameters: {
					model: "openai/gpt-5-nano",
					instructions: "Return concise findings only.",
					max_uses: 3,
					max_completion_tokens: 1024,
					temperature: 2,
					reasoning: { effort: "max" },
				},
			},
		]);
	});

	it("builds one advisor tool definition per configured advisor", () => {
		const tools = buildServerToolDefinitions(["ai-stats:advisor"], {
			advisors: [
				{
					name: "reviewer",
					model: "openai/gpt-5.5",
					instructions: "Review the answer.",
					maxUses: 2,
				},
				{
					name: "critic",
					model: "anthropic/claude-opus-4.8",
					reasoningEffort: "high",
				},
			],
		});

		expect(tools).toEqual([
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "reviewer",
					model: "openai/gpt-5.5",
					instructions: "Review the answer.",
					max_uses: 2,
				},
			},
			{
				type: "ai-stats:advisor",
				parameters: {
					name: "critic",
					model: "anthropic/claude-opus-4.8",
					reasoning: { effort: "high" },
				},
			},
		]);
	});
});
