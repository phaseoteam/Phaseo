import {
	DEFAULT_SETTINGS,
	buildDefaultSystemPrompt,
	buildServerToolDefinitions,
	estimatePromptTokenCount,
	getChangedSettings,
	isGeneratedDefaultSystemPrompt,
	normalizeServerTools,
} from "./chat-playground-core";

describe("buildDefaultSystemPrompt", () => {
	it("instructs models to produce valid Streamdown-compatible LaTeX", () => {
		const prompt = buildDefaultSystemPrompt("openai/gpt-5.6-luna-pro");

		expect(prompt).toContain(
			"Markdown; ```code fences```; `backticks` for code, filenames, paths, and functions.",
		);
		expect(prompt).toContain(
			"Use $...$ or $$...$$ only for typeset math",
		);
		expect(prompt).toContain(
			"Keep numbers, percentages, and currency plain.",
		);
		expect(prompt).toContain(
			"escape % in math (e.g. $80\\%$)",
		);
		expect(prompt).toContain("no \\(...\\) or \\[...\\].");
		expect(prompt).not.toContain("Formatting Rules:");
	});
});

describe("estimatePromptTokenCount", () => {
	it("uses a four-character approximation without rounding nonempty prompts to zero", () => {
		expect(estimatePromptTokenCount("")).toBe(0);
		expect(estimatePromptTokenCount("a")).toBe(1);
		expect(estimatePromptTokenCount("abcd")).toBe(1);
		expect(estimatePromptTokenCount("abcde")).toBe(2);
	});
});

describe("isGeneratedDefaultSystemPrompt", () => {
	const modelId = "openai/gpt-5.6-luna";
	const nickname = "Luna";
	const identity = `You are ${modelId}, known as: ${nickname}, a large language model from openai.`;

	it("recognizes the current compact default prompt", () => {
		expect(isGeneratedDefaultSystemPrompt(buildDefaultSystemPrompt(modelId, nickname), modelId, nickname)).toBe(true);
	});

	it("recognizes the prior and legacy formatting suffixes", () => {
		const previous = `${identity}\n\nFormatting Rules:\n- Do not use \\(...\\) or \\[...\\] delimiters.`;
		const legacy = `${identity}\n\nFormatting Rules:\n- **For all mathematical expressions, you must use dollar-sign delimiters. Use $...$ for inline math and $$...$$ for block math. Do not use (...) or [...] delimiters.**`;

		expect(isGeneratedDefaultSystemPrompt(previous, modelId, nickname)).toBe(true);
		expect(isGeneratedDefaultSystemPrompt(legacy, modelId, nickname)).toBe(true);
	});

	it("recognizes the full legacy generated prompt without a nickname", () => {
		const legacy = [
			`You are ${modelId}, a large language model from openai.`,
			"",
			"Formatting Rules:",
			"- Use Markdown for lists, tables, and styling.",
			"- Use ```code fences``` for all code blocks.",
			"- Format file names, paths, and function names with `inline code` backticks.",
			"- **For all mathematical expressions, you must use dollar-sign delimiters. Use $...$ for inline math and $$...$$ for block math. Do not use (...) or [...] delimiters.**",
		].join("\n");

		expect(isGeneratedDefaultSystemPrompt(legacy, modelId)).toBe(true);
		expect(
			getChangedSettings(
				{ ...DEFAULT_SETTINGS, systemPrompt: legacy },
				modelId,
			),
		).not.toContainEqual({ label: "System prompt", value: "Custom" });
	});

	it("does not accept extra instructions inside a generated-looking prompt", () => {
		const custom = `${identity}\n\nFormatting Rules:\nAlways answer in haiku.\n- Do not use \\(...\\) or \\[...\\] delimiters.`;

		expect(isGeneratedDefaultSystemPrompt(custom, modelId, nickname)).toBe(false);
	});

	it("does not classify a custom prompt as generated", () => {
		expect(isGeneratedDefaultSystemPrompt("Always answer in haiku.", modelId, nickname)).toBe(false);
	});
});

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
				"phaseo:web_search",
				"phaseo:web_fetch",
				"phaseo:image_generation",
				"gateway:datetime",
				"phaseo:fusion",
				"phaseo:advisor",
				"phaseo:subagent",
				"phaseo:apply_patch" as never,
			]),
		).toEqual([
			"phaseo:web_search",
			"phaseo:web_fetch",
			"phaseo:image_generation",
			"gateway:datetime",
			"phaseo:fusion",
			"phaseo:advisor",
			"phaseo:subagent",
		]);
	});

	it("builds fusion model sets and subagent as its documented tool type", () => {
		const tools = buildServerToolDefinitions(
			["phaseo:fusion", "phaseo:subagent"],
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
				type: "phaseo:advisor",
				parameters: {
					name: "fusion_1",
					model: "openai/gpt-5.5",
					instructions:
						"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.",
					max_uses: 2,
				},
			},
			{
				type: "phaseo:advisor",
				parameters: {
					name: "fusion_2",
					model: "anthropic/claude-opus-4.8",
					instructions:
						"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.",
					max_uses: 2,
				},
			},
			{
				type: "phaseo:advisor",
				parameters: {
					name: "fusion_judge",
					model: "google/gemini-3.1-pro",
					instructions:
						"Review the analysis model outputs and identify the strongest final answer direction.",
					max_uses: 2,
				},
			},
			{
				type: "phaseo:subagent",
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
		const tools = buildServerToolDefinitions(["phaseo:advisor"], {
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
				type: "phaseo:advisor",
				parameters: {
					name: "reviewer",
					model: "openai/gpt-5.5",
					instructions: "Review the answer.",
					max_uses: 2,
				},
			},
			{
				type: "phaseo:advisor",
				parameters: {
					name: "critic",
					model: "anthropic/claude-opus-4.8",
					reasoning: { effort: "high" },
				},
			},
		]);
	});
});
