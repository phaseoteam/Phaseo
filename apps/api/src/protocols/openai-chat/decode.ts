// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Chat Completions Protocol - Decoder
// Transforms OpenAI Chat Completions Request -> IR

import type { ChatCompletionsRequest } from "@core/schemas";
import type {
	IRChatRequest,
	IRContentPart,
	IRMessage,
	IRToolCall,
	IRToolResult,
	IRTool,
} from "@core/ir";
import { extractToolNameOrType, isOpenAINativeWebSearchTool } from "@core/nativeTools";
import { normalizeOpenAIContent } from "../shared/normalizeContent";
import {
	normalizeImageConfig,
	normalizeModalities,
	normalizeThinkingConfig,
	normalizeOpenAIToolChoice,
	normalizeProviderGeoPreferences,
	normalizeResponseFormat,
	resolveTextServiceTier,
	normalizeProviderCacheOptions,
} from "../shared/text-normalizers";

/**
 * Decode OpenAI Chat Completions request to IR format
 *
 * Handles:
 * - Messages with multimodal content (text, images, audio, video)
 * - Tool calling (tools[], tool_calls[], tool results)
 * - All generation parameters
 * - Reasoning configuration
 *
 * @param req - Validated OpenAI Chat Completions request
 * @returns IR chat request
 */
export function decodeOpenAIChatRequest(req: ChatCompletionsRequest): IRChatRequest {
	const reqAny = req as any;
	const metadataFromRequest = req.metadata ? { ...req.metadata } : undefined;
	const providerCacheOptions = normalizeProviderCacheOptions(req as any);
	const metadata = req.user
		? { ...(metadataFromRequest ?? {}), user: req.user }
		: metadataFromRequest;
	const messages: IRMessage[] = [];

	const systemPrompt = reqAny.system ?? reqAny.system_prompt;
	if (systemPrompt) {
		messages.push({
			role: "system",
			content: normalizeOpenAIContent(systemPrompt),
		});
	}

	for (const msgAny of req.messages as Array<any>) {
		const normalizedRole = msgAny.role;

		if (normalizedRole === "system" || normalizedRole === "developer" || normalizedRole === "user") {
			messages.push({
				role: normalizedRole,
				content: normalizeOpenAIContent(msgAny.content),
			});
		} else if (normalizedRole === "assistant") {
			const assistantContent = normalizeOpenAIContent(msgAny.content || "");
			const reasoningContent = typeof msgAny.reasoning_content === "string" ? msgAny.reasoning_content : "";
			const content: IRContentPart[] = reasoningContent
				? [{ type: "reasoning_text", text: reasoningContent } as const, ...assistantContent]
				: assistantContent;

			messages.push({
				role: "assistant",
				content,
				toolCalls: Array.isArray(msgAny.tool_calls) ? msgAny.tool_calls.map(decodeToolCall) : undefined,
			});
		} else if (normalizedRole === "tool") {
			messages.push({
				role: "tool",
				toolResults: [
					{
						toolCallId: msgAny.tool_call_id,
						content: typeof msgAny.content === "string" ? msgAny.content : JSON.stringify(msgAny.content),
					},
				],
			});
		}
	}

	const tools: IRTool[] | undefined = req.tools?.map(decodeOpenAITool);

	const toolChoice = normalizeOpenAIToolChoice(req.tool_choice);
	const rawOpenAIToolChoice = req.tool_choice
		&& typeof req.tool_choice === "object"
		&& !Array.isArray(req.tool_choice)
		&& (req.tool_choice as any).type === "allowed_tools"
			? { ...(req.tool_choice as Record<string, any>) }
			: undefined;

	const reasoningFromRequest = req.reasoning
		? {
			effort: req.reasoning.effort,
			mode: req.reasoning.mode,
			summary: req.reasoning.summary as any,
			enabled: req.reasoning.enabled,
			maxTokens: req.reasoning.max_tokens,
		}
		: undefined;
	const reasoningEffortAlias =
		typeof reqAny.reasoning_effort === "string" && reqAny.reasoning_effort.length > 0
			? reqAny.reasoning_effort
			: undefined;
	const reasoningSummaryAlias =
		typeof reqAny.reasoning_summary === "string" && reqAny.reasoning_summary.length > 0
			? reqAny.reasoning_summary
			: undefined;
	const reasoningFromThinking = normalizeThinkingConfig(reqAny.thinking);
	const reasoning = {
		...(reasoningFromThinking ?? {}),
		...(reasoningFromRequest ?? {}),
		...(reasoningEffortAlias !== undefined ? { effort: reasoningEffortAlias } : {}),
		...(reasoningSummaryAlias !== undefined ? { summary: reasoningSummaryAlias } : {}),
	};

	const hasInceptionVendorOptions =
		typeof reqAny.diffusing === "boolean" ||
		typeof reqAny.realtime === "boolean" ||
		typeof reqAny.reasoning_summary === "boolean" ||
		typeof reqAny.reasoning_summary_wait === "boolean" ||
		typeof reqAny.reasoning_summary_wait === "number";
	const openAIRequestFields = {
		...(reqAny.prediction !== undefined ? { prediction: reqAny.prediction } : {}),
		...(reqAny.moderation !== undefined ? { moderation: reqAny.moderation } : {}),
	};
	const hasOpenAIRequestFields = Object.keys(openAIRequestFields).length > 0;
	const hasAI21RequestFields = reqAny.n !== undefined || reqAny.documents !== undefined;
	const hasAkashMLRequestFields = reqAny.n !== undefined;
	const hasArceeRequestFields = reqAny.n !== undefined;
	const hasBasetenRequestFields = reqAny.n !== undefined;
	const featherlessOptions = Object.fromEntries(
		["min_p", "stop_token_ids", "include_stop_str_in_output", "min_tokens", "chat_template_kwargs"]
			.filter((key) => reqAny[key] !== undefined)
			.map((key) => [key, reqAny[key]]),
	);
	const hasFeatherlessOptions = Object.keys(featherlessOptions).length > 0;
	const hasFriendliRequestFields = reqAny.n !== undefined;
	const morpheusOptions = {
		...(reqAny.n !== undefined ? { n: reqAny.n } : {}),
		...(reqAny.session_id !== undefined ? { session_id: reqAny.session_id } : {}),
	};
	const hasMorpheusRequestFields = Object.keys(morpheusOptions).length > 0;
	const hasClarifaiRequestFields = Array.isArray(reqAny.mcp_servers);
	const hasMinimaxRequestFields = typeof reqAny.reasoning_split === "boolean";
	const hasSiliconFlowRequestFields = reqAny.n !== undefined;
	const hasStepFunRequestFields = reqAny.n !== undefined || reqAny.reasoning_format !== undefined;
	const mistralOptions = Object.fromEntries(
		["n", "prediction", "safe_prompt", "prompt_mode", "guardrails"]
			.filter((key) => reqAny[key] !== undefined)
			.map((key) => [key, reqAny[key]]),
	);
	const hasMistralRequestFields = Object.keys(mistralOptions).length > 0;
	const moonshotMessageFields = Array.isArray(reqAny.messages)
		? reqAny.messages.map((message: any) => ({
			...(typeof message?.name === "string" ? { name: message.name } : {}),
			...(typeof message?.partial === "boolean" ? { partial: message.partial } : {}),
		}))
		: [];
	const hasMoonshotMessageFields = moonshotMessageFields.some((entry: any) => Object.keys(entry).length > 0);
	const moonshotOptions = {
		...(reqAny.n !== undefined ? { n: reqAny.n } : {}),
		...(reqAny.prediction !== undefined ? { prediction: reqAny.prediction } : {}),
		...(hasMoonshotMessageFields ? { message_fields: moonshotMessageFields } : {}),
	};
	const hasMoonshotRequestFields = Object.keys(moonshotOptions).length > 0;
	const deepInfraOptions = reqAny.provider_options?.deepinfra;
	const hasDeepInfraOptions = deepInfraOptions && typeof deepInfraOptions === "object";
	const fireworksOptions = reqAny.provider_options?.fireworks;
	const hasFireworksOptions = fireworksOptions && typeof fireworksOptions === "object";
	const gmiCloudOptions = reqAny.provider_options?.gmicloud;
	const hasGMICloudOptions = gmiCloudOptions && typeof gmiCloudOptions === "object";
	const veniceOptions = reqAny.venice_parameters ?? reqAny.provider_options?.venice;
	const hasVeniceOptions = veniceOptions && typeof veniceOptions === "object" && !Array.isArray(veniceOptions);
	const zaiOptions = reqAny.provider_options?.zai ?? reqAny.provider_options?.["z-ai"];
	const hasZaiOptions = (zaiOptions && typeof zaiOptions === "object" && !Array.isArray(zaiOptions)) || typeof reqAny.tool_stream === "boolean";
	const vendor = hasInceptionVendorOptions || rawOpenAIToolChoice || hasOpenAIRequestFields || hasAI21RequestFields || hasAkashMLRequestFields || hasArceeRequestFields || hasBasetenRequestFields || hasFriendliRequestFields || hasMorpheusRequestFields || hasFeatherlessOptions || hasClarifaiRequestFields || hasMinimaxRequestFields || hasSiliconFlowRequestFields || hasStepFunRequestFields || hasMistralRequestFields || hasMoonshotRequestFields || hasDeepInfraOptions || hasFireworksOptions || hasGMICloudOptions || hasVeniceOptions || hasZaiOptions
		? {
			...(rawOpenAIToolChoice || hasOpenAIRequestFields
				? {
					openai: {
						...(rawOpenAIToolChoice ? { tool_choice: rawOpenAIToolChoice } : {}),
						...openAIRequestFields,
					},
				}
				: {}),
			...(hasInceptionVendorOptions ? {
			inception: {
				...(typeof reqAny.diffusing === "boolean" ? { diffusing: reqAny.diffusing } : {}),
				...(typeof reqAny.realtime === "boolean" ? { realtime: reqAny.realtime } : {}),
				...(typeof reqAny.reasoning_summary === "boolean" ? { reasoning_summary: reqAny.reasoning_summary } : {}),
				...((typeof reqAny.reasoning_summary_wait === "boolean" || typeof reqAny.reasoning_summary_wait === "number")
					? { reasoning_summary_wait: reqAny.reasoning_summary_wait }
					: {}),
			},
			} : {}),
			...(hasAI21RequestFields ? {
				ai21: {
					...(reqAny.n !== undefined ? { n: reqAny.n } : {}),
					...(reqAny.documents !== undefined ? { documents: reqAny.documents } : {}),
				},
			} : {}),
			...(hasAkashMLRequestFields ? { akashml: { n: reqAny.n } } : {}),
			...(hasArceeRequestFields ? { arcee: { n: reqAny.n } } : {}),
			...(hasBasetenRequestFields ? { baseten: { n: reqAny.n } } : {}),
			...(hasFeatherlessOptions ? { featherless: featherlessOptions } : {}),
			...(hasFriendliRequestFields ? { friendli: { n: reqAny.n } } : {}),
			...(hasMorpheusRequestFields ? { morpheus: morpheusOptions } : {}),
			...(hasClarifaiRequestFields ? { clarifai: { mcp_servers: [...reqAny.mcp_servers] } } : {}),
			...(hasMinimaxRequestFields ? {
				minimax: {
					...(typeof reqAny.reasoning_split === "boolean" ? { reasoning_split: reqAny.reasoning_split } : {}),
				},
			} : {}),
			...(hasSiliconFlowRequestFields ? { siliconflow: { n: reqAny.n } } : {}),
			...(hasStepFunRequestFields ? {
				stepfun: {
					...(reqAny.n !== undefined ? { n: reqAny.n } : {}),
					...(reqAny.reasoning_format !== undefined ? { reasoning_format: reqAny.reasoning_format } : {}),
				},
			} : {}),
			...(hasMistralRequestFields ? { mistral: mistralOptions } : {}),
			...(hasMoonshotRequestFields ? { moonshot: moonshotOptions } : {}),
			...(hasDeepInfraOptions ? { deepinfra: { ...deepInfraOptions } } : {}),
			...(hasFireworksOptions ? { fireworks: { ...fireworksOptions } } : {}),
			...(hasGMICloudOptions ? { gmicloud: { ...gmiCloudOptions } } : {}),
			...(hasVeniceOptions ? { venice: { ...veniceOptions } } : {}),
			...(hasZaiOptions ? { zai: {
				...(zaiOptions && typeof zaiOptions === "object" ? { ...zaiOptions } : {}),
				...(typeof reqAny.tool_stream === "boolean" ? { tool_stream: reqAny.tool_stream } : {}),
			} } : {}),
		}
		: undefined;

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,
		maxTokens: (req as any).max_completion_tokens ?? req.max_tokens ?? req.max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: (req as any).top_k,
		minP: reqAny.min_p,
		seed: req.seed,
		tools,
		toolChoice,
		webSearchOptions: reqAny.web_search_options ?? reqAny.webSearchOptions,
		parallelToolCalls: req.parallel_tool_calls,
		maxToolCalls: (req as any).max_tool_calls,
		reasoning:
			reasoning && Object.values(reasoning).some((value) => value !== undefined)
				? reasoning
				: undefined,
		responseFormat: normalizeResponseFormat(req.response_format),
		modalities: normalizeModalities((req as any).modalities ?? (req as any).response_modalities ?? (req as any).responseModalities),
		imageConfig: normalizeImageConfig((req as any).image_config ?? (req as any).imageConfig),
		frequencyPenalty: req.frequency_penalty,
		presencePenalty: req.presence_penalty,
		repetitionPenalty: reqAny.repetition_penalty,
		logitBias: req.logit_bias,
		logprobs: req.logprobs,
		topLogprobs: req.top_logprobs,
		stop: reqAny.stop,
		streamOptions: req.stream_options,
		background: (req as any).background,
		serviceTier: resolveTextServiceTier({
			service_tier: (req as any).service_tier,
		}),
		geo: normalizeProviderGeoPreferences(req as any),
		promptCacheKey: (req as any).prompt_cache_key,
		promptCacheRetention: providerCacheOptions.promptCacheRetention,
		promptCacheOptions: reqAny.prompt_cache_options
			?? reqAny.provider_options?.openai?.prompt_cache_options,
		textVerbosity: reqAny.verbosity,
		audioConfig: reqAny.audio,
		anthropicCacheControl: providerCacheOptions.anthropicCacheControl,
		googleCachedContent: providerCacheOptions.googleCachedContent,
		xaiConversationId: providerCacheOptions.xaiConversationId,
		safetyIdentifier: (req as any).safety_identifier,
		vendor,
		userId: req.user_id ?? req.user,
		metadata,
	};
}

function decodeOpenAITool(tool: any): IRTool {
	if (isOpenAINativeWebSearchTool(tool) || (typeof tool?.type === "string" && tool.type !== "function")) {
		return {
			name: extractToolNameOrType(tool.custom ?? tool) ?? tool.type,
			type: tool.type,
			description: typeof tool.description === "string"
				? tool.description
				: typeof tool.custom?.description === "string"
					? tool.custom.description
					: undefined,
			parameters: {},
			async: typeof tool.async === "boolean" ? tool.async : undefined,
			raw: { ...tool },
		};
	}

	return {
		name: extractToolNameOrType(tool) ?? "tool",
		description: tool.function?.description || tool.description,
		parameters: tool.function?.parameters || tool.parameters || {},
		strict: tool.function?.strict ?? tool.strict,
		async: typeof tool.async === "boolean" ? tool.async : undefined,
	};
}

/**
 * Normalize content to IRContentPart[]
 * Handles both string and array content
 */
// normalizeOpenAIContent moved to shared helper for consistent IR conversion

/**
 * Decode tool call from OpenAI format to IR
 */
function decodeToolCall(tc: any): IRToolCall {
	if (tc?.type === "custom") {
		return {
			id: tc.id,
			name: tc.custom?.name || tc.name,
			arguments: tc.custom?.input || tc.input || "",
			type: "custom",
		};
	}
	return {
		id: tc.id,
		name: tc.function?.name || tc.name,
		arguments: tc.function?.arguments || tc.arguments || "{}",
	};
}
