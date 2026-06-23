import type { ChatModelSettings } from "@/lib/indexeddb/chats";

export type ChatServerToolConfig = Pick<
	ChatModelSettings,
	| "webSearchEnabled"
	| "serverToolWebSearchEngine"
	| "serverToolWebSearchContextSize"
	| "serverToolWebSearchMaxResults"
	| "serverToolWebSearchMaxTotalResults"
	| "serverToolWebSearchMaxCharacters"
	| "serverToolWebSearchAllowedDomains"
	| "serverToolWebSearchBlockedDomains"
	| "apiServerToolsEnabled"
	| "serverToolTimezone"
	| "serverToolWebFetchEnabled"
	| "serverToolWebFetchEngine"
	| "serverToolWebFetchMaxContentTokens"
	| "serverToolWebFetchAllowedDomains"
	| "serverToolWebFetchBlockedDomains"
	| "serverToolAdvisorEnabled"
	| "serverToolAdvisors"
	| "serverToolImageGenerationEnabled"
	| "serverToolImageGenerationModel"
	| "serverToolImageGenerationQuality"
	| "serverToolImageGenerationAspectRatio"
	| "serverToolImageGenerationSize"
	| "serverToolImageGenerationBackground"
	| "serverToolImageGenerationOutputFormat"
	| "serverToolImageGenerationOutputCompression"
	| "serverToolImageGenerationModeration"
	| "serverToolSubagentEnabled"
	| "serverToolSubagentModel"
	| "serverToolSubagentInstructions"
	| "serverToolSubagentMaxUses"
	| "serverToolFusionEnabled"
	| "serverToolFusionAnalysisModels"
	| "serverToolFusionJudgeModel"
	| "serverToolFusionMaxUses"
>;

const SUBAGENT_DEFAULT_MAX_COMPLETION_TOKENS = 1200;
const ADVISOR_DEFAULT_MAX_COMPLETION_TOKENS = 1400;
const ADVISOR_DEFAULT_INSTRUCTIONS =
	"Review the current answer plan for correctness, missing context, and implementation risk before the final response.";
const FUSION_DEFAULT_MAX_COMPLETION_TOKENS = 1400;
const FUSION_ANALYSIS_INSTRUCTIONS =
	"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.";
const FUSION_JUDGE_INSTRUCTIONS =
	"Compare the fusion analysis outputs, identify the strongest answer, and return concise guidance for the final response.";

type NormalizedAdvisorConfig = {
	name?: string;
	model?: string;
	instructions?: string;
};

function normalizeTimezone(timezone?: string | null) {
	return timezone?.trim() || undefined;
}

function normalizeModel(model?: string | null) {
	const trimmed = model?.trim();
	return trimmed && trimmed !== "auto" ? trimmed : undefined;
}

function normalizeInstructions(instructions?: string | null) {
	return instructions?.trim() || undefined;
}

function normalizeAdvisorName(name?: string | null) {
	return name?.trim().replace(/\s+/g, " ") || undefined;
}

function normalizePositiveInt(value?: number | null) {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.max(1, Math.floor(value));
}

function normalizePositiveIntWithMax(value: number | null | undefined, max: number) {
	const normalized = normalizePositiveInt(value);
	return normalized == null ? undefined : Math.min(max, normalized);
}

function normalizeSettingValue(value?: string | null) {
	const trimmed = value?.trim();
	return trimmed && trimmed !== "auto" ? trimmed : undefined;
}

function normalizeDomainList(value?: string | null) {
	const domains = (value ?? "")
		.split(",")
		.map((domain) => domain.trim())
		.filter(Boolean);
	return domains.length > 0 ? domains : undefined;
}

function pushNamedAdvisorTool(
	tools: Array<Record<string, unknown>>,
	args: {
		name: string;
		model?: string;
		instructions: string;
		maxUses?: number;
		maxCompletionTokens?: number;
	},
) {
	const parameters: Record<string, unknown> = {
		name: args.name,
		instructions: args.instructions,
		max_completion_tokens:
			args.maxCompletionTokens ?? FUSION_DEFAULT_MAX_COMPLETION_TOKENS,
	};
	if (args.model) {
		parameters.model = args.model;
	}
	if (args.maxUses) {
		parameters.max_uses = args.maxUses;
	}
	tools.push({
		type: "ai-stats:advisor",
		parameters,
	});
}

export function buildChatServerTools(config: ChatServerToolConfig) {
	const tools: Array<Record<string, unknown>> = [];

	if (config.webSearchEnabled) {
		const parameters: Record<string, unknown> = {};
		const engine = normalizeSettingValue(config.serverToolWebSearchEngine);
		const contextSize = normalizeSettingValue(
			config.serverToolWebSearchContextSize,
		);
		const maxResults = normalizePositiveIntWithMax(
			config.serverToolWebSearchMaxResults,
			25,
		);
		const maxTotalResults = normalizePositiveIntWithMax(
			config.serverToolWebSearchMaxTotalResults,
			100,
		);
		const maxCharacters = normalizePositiveIntWithMax(
			config.serverToolWebSearchMaxCharacters,
			50000,
		);
		const allowedDomains = normalizeDomainList(
			config.serverToolWebSearchAllowedDomains,
		);
		const blockedDomains = normalizeDomainList(
			config.serverToolWebSearchBlockedDomains,
		);
		if (engine) parameters.engine = engine;
		if (contextSize) parameters.search_context_size = contextSize;
		if (maxResults) parameters.max_results = maxResults;
		if (maxTotalResults) parameters.max_total_results = maxTotalResults;
		if (maxCharacters) parameters.max_characters = maxCharacters;
		if (allowedDomains) parameters.allowed_domains = allowedDomains;
		if (blockedDomains) parameters.excluded_domains = blockedDomains;
		tools.push(
			Object.keys(parameters).length > 0
				? { type: "ai-stats:web_search", parameters }
				: { type: "ai-stats:web_search" },
		);
	}

	if (config.serverToolWebFetchEnabled) {
		const parameters: Record<string, unknown> = {};
		const engine = normalizeSettingValue(config.serverToolWebFetchEngine);
		const maxContentTokens = normalizePositiveIntWithMax(
			config.serverToolWebFetchMaxContentTokens,
			50000,
		);
		const allowedDomains = normalizeDomainList(
			config.serverToolWebFetchAllowedDomains,
		);
		const blockedDomains = normalizeDomainList(
			config.serverToolWebFetchBlockedDomains,
		);
		if (engine) parameters.engine = engine;
		if (maxContentTokens) parameters.max_content_tokens = maxContentTokens;
		if (allowedDomains) parameters.allowed_domains = allowedDomains;
		if (blockedDomains) parameters.blocked_domains = blockedDomains;
		tools.push(
			Object.keys(parameters).length > 0
				? { type: "ai-stats:web_fetch", parameters }
				: { type: "ai-stats:web_fetch" },
		);
	}

	if (config.apiServerToolsEnabled) {
		const timezone = normalizeTimezone(config.serverToolTimezone);
		tools.push(
			timezone
				? { type: "gateway:datetime", parameters: { timezone } }
				: { type: "gateway:datetime" },
		);
	}

	if (config.serverToolAdvisorEnabled) {
		const configuredAdvisors: NormalizedAdvisorConfig[] = [];
		const rawAdvisors = config.serverToolAdvisors ?? [];
		rawAdvisors.forEach((advisor) => {
			const name = normalizeAdvisorName(advisor.name);
			const model = normalizeModel(advisor.model);
			const instructions = normalizeInstructions(advisor.instructions);
			if (!name && !model && !instructions) return;
			if (
				!name &&
				configuredAdvisors.some((configuredAdvisor) => !configuredAdvisor.name)
			) {
				return;
			}
			configuredAdvisors.push({ name, model, instructions });
		});
		const advisors: NormalizedAdvisorConfig[] =
			configuredAdvisors.length > 0
				? configuredAdvisors
				: [{ instructions: ADVISOR_DEFAULT_INSTRUCTIONS }];

		for (const advisor of advisors) {
			const parameters: Record<string, unknown> = {
				instructions:
					advisor.instructions ?? ADVISOR_DEFAULT_INSTRUCTIONS,
				max_uses: 1,
				max_completion_tokens: ADVISOR_DEFAULT_MAX_COMPLETION_TOKENS,
			};
			if (advisor.name) {
				parameters.name = advisor.name;
			}
			if (advisor.model) {
				parameters.model = advisor.model;
			}
			tools.push({
				type: "ai-stats:advisor",
				parameters,
			});
		}
	}

	if (config.serverToolFusionEnabled) {
		const maxUses = normalizePositiveInt(config.serverToolFusionMaxUses);
		const analysisModels = (config.serverToolFusionAnalysisModels ?? [])
			.map(normalizeModel)
			.filter((model): model is string => Boolean(model));
		analysisModels.forEach((model, index) => {
			pushNamedAdvisorTool(tools, {
				name: `fusion_analysis_${index + 1}`,
				model,
				instructions: FUSION_ANALYSIS_INSTRUCTIONS,
				maxUses,
			});
		});
		const judgeModel = normalizeModel(config.serverToolFusionJudgeModel);
		if (judgeModel) {
			pushNamedAdvisorTool(tools, {
				name: "fusion_judge",
				model: judgeModel,
				instructions: FUSION_JUDGE_INSTRUCTIONS,
				maxUses,
			});
		}
	}

	if (config.serverToolSubagentEnabled) {
		const parameters: Record<string, unknown> = {
			max_completion_tokens: SUBAGENT_DEFAULT_MAX_COMPLETION_TOKENS,
		};
		const model = normalizeModel(config.serverToolSubagentModel);
		const instructions = normalizeInstructions(
			config.serverToolSubagentInstructions,
		);
		const maxUses = normalizePositiveInt(config.serverToolSubagentMaxUses);
		if (model) {
			parameters.model = model;
		}
		if (instructions) {
			parameters.instructions = instructions;
		}
		if (maxUses) {
			parameters.max_uses = maxUses;
		}
		tools.push({
			type: "ai-stats:subagent",
			parameters,
		});
	}

	if (config.serverToolImageGenerationEnabled) {
		const parameters: Record<string, unknown> = {};
		const model = normalizeModel(config.serverToolImageGenerationModel);
		const quality = normalizeSettingValue(config.serverToolImageGenerationQuality);
		const aspectRatio = normalizeSettingValue(
			config.serverToolImageGenerationAspectRatio,
		);
		const size = normalizeSettingValue(config.serverToolImageGenerationSize);
		const background = normalizeSettingValue(
			config.serverToolImageGenerationBackground,
		);
		const outputFormat = normalizeSettingValue(
			config.serverToolImageGenerationOutputFormat,
		);
		const outputCompression =
			typeof config.serverToolImageGenerationOutputCompression === "number" &&
			Number.isFinite(config.serverToolImageGenerationOutputCompression)
				? Math.max(
						0,
						Math.min(100, config.serverToolImageGenerationOutputCompression),
					)
				: undefined;
		const moderation = normalizeSettingValue(
			config.serverToolImageGenerationModeration,
		);
		if (model) parameters.model = model;
		if (quality) parameters.quality = quality;
		if (aspectRatio) parameters.aspect_ratio = aspectRatio;
		if (size) parameters.size = size;
		if (background) parameters.background = background;
		if (outputFormat) parameters.output_format = outputFormat;
		if (outputCompression != null) {
			parameters.output_compression = outputCompression;
		}
		if (moderation) parameters.moderation = moderation;
		tools.push(
			Object.keys(parameters).length > 0
				? { type: "ai-stats:image_generation", parameters }
				: { type: "ai-stats:image_generation" },
		);
	}

	return tools;
}
