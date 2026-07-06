// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

import { z } from "zod";
import type { Endpoint } from "./types";
import { parseAsyncWebhookConfig } from "./async-notifications";
import {
	ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES,
	ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES,
	ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES,
	OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES,
} from "./nativeTools";

const ProviderRoutingSchema = z.object({
    // Existing gateway routing hints
    mode: z.string().nullable().optional(),
    order: z.array(z.string()).optional(),
    only: z.array(z.string()).optional(),
    ignore: z.array(z.string()).optional(),
    include_alpha: z.boolean().optional(),
    includeAlpha: z.boolean().optional(),
    // Additional provider routing fields
    allow_fallbacks: z.boolean().nullable().optional(),
    allowFallbacks: z.boolean().nullable().optional(),
    require_parameters: z.boolean().nullable().optional(),
    requireParameters: z.boolean().nullable().optional(),
    required_execution_region: z.string().nullable().optional(),
    requiredExecutionRegion: z.string().nullable().optional(),
    required_data_region: z.string().nullable().optional(),
    requiredDataRegion: z.string().nullable().optional(),
    require_zero_data_retention: z.boolean().nullable().optional(),
    requireZeroDataRetention: z.boolean().nullable().optional(),
    data_collection: z.enum(["allow", "deny"]).nullable().optional(),
    dataCollection: z.enum(["allow", "deny"]).nullable().optional(),
    zdr: z.boolean().nullable().optional(),
    enforce_distillable_text: z.boolean().nullable().optional(),
    enforceDistillableText: z.boolean().nullable().optional(),
    quantizations: z.array(z.string()).nullable().optional(),
    sort: z.union([z.string(), z.record(z.string(), z.any())]).nullable().optional(),
    max_price: z.object({
        prompt: z.union([z.number(), z.string()]).optional(),
        completion: z.union([z.number(), z.string()]).optional(),
        image: z.union([z.number(), z.string()]).optional(),
        audio: z.union([z.number(), z.string()]).optional(),
        request: z.union([z.number(), z.string()]).optional(),
    }).optional(),
    maxPrice: z.object({
        prompt: z.union([z.number(), z.string()]).optional(),
        completion: z.union([z.number(), z.string()]).optional(),
        image: z.union([z.number(), z.string()]).optional(),
        audio: z.union([z.number(), z.string()]).optional(),
        request: z.union([z.number(), z.string()]).optional(),
    }).optional(),
    preferred_min_throughput: z.union([z.number(), z.record(z.string(), z.number())]).optional(),
    preferredMinThroughput: z.union([z.number(), z.record(z.string(), z.number())]).optional(),
    preferred_max_latency: z.union([z.number(), z.record(z.string(), z.number())]).optional(),
    preferredMaxLatency: z.union([z.number(), z.record(z.string(), z.number())]).optional(),
    diagnostics: z.boolean().nullable().optional(),
    return_diagnostics: z.boolean().nullable().optional(),
    returnDiagnostics: z.boolean().nullable().optional(),
}).passthrough().optional();

const DebugOptionsSchema = z.object({
    enabled: z.boolean().optional(),
    echo_upstream_body: z.boolean().optional(),
    return_upstream_request: z.boolean().optional(),
    returnUpstreamRequest: z.boolean().optional(),
    return_upstream_response: z.boolean().optional(),
    returnUpstreamResponse: z.boolean().optional(),
    trace: z.boolean().optional(),
    trace_level: z.enum(["summary", "full"]).optional(),
    traceLevel: z.enum(["summary", "full"]).optional(),
}).optional();

const BetaOptionsSchema = z.object({
    openai_websocket_mode: z.boolean().optional(),
    openaiWebsocketMode: z.boolean().optional(),
    openai: z.object({
        websocket_mode: z.boolean().optional(),
        websocketMode: z.boolean().optional(),
    }).optional(),
}).passthrough().optional();

const ServiceTierSchema = z.enum(["standard", "priority", "flex", "batch"]);

const ImageConfigSchema = z.object({
    aspect_ratio: z.string().optional(),
    image_size: z.enum(["0.5K", "1K", "2K", "4K"]).optional(),
    font_inputs: z.array(
        z.object({
            font_url: z.string().url(),
            text: z.string(),
        }),
    ).optional(),
    super_resolution_references: z.array(z.string()).optional(),
    include_rai_reason: z.boolean().optional(),
    reference_images: z.array(z.any()).optional(),
}).catchall(
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.any()),
        z.record(z.string(), z.any()),
    ]),
).optional();

const ResponseFormatSchema = z.union([
    z.string(),
    z.object({
        type: z.string(),
        schema: z.any().optional(),
        name: z.string().optional(),
        strict: z.boolean().optional(),
        json_schema: z.object({
            name: z.string().optional(),
            strict: z.boolean().optional(),
            schema: z.any().optional(),
            schema_: z.any().optional(),
        }).optional(),
	}).passthrough(),
]);

const OpenAIContextManagementSchema = z.object({
	type: z.literal("compaction"),
	compact_threshold: z.number().optional(),
}).passthrough();

const CacheControlSchema = z.object({
    type: z.string().optional(),
    ttl: z.string().optional(),
    scope: z.string().optional(),
}).passthrough();

const OpenAIProviderOptionsSchema = z.object({
	context_management: OpenAIContextManagementSchema.optional(),
	prompt_cache_retention: z.string().optional(),
}).passthrough();

const AnthropicProviderOptionsSchema = z.object({
	cache_control: CacheControlSchema.optional(),
}).passthrough();

const GoogleProviderOptionsSchema = z.object({
	cache_control: CacheControlSchema.optional(),
	cached_content: z.string().optional(),
	cache_ttl: z.string().optional(),
}).passthrough();


const ResponsesProviderOptionsSchema = z.object({
	openai: OpenAIProviderOptionsSchema.optional(),
	anthropic: AnthropicProviderOptionsSchema.optional(),
	google: GoogleProviderOptionsSchema.optional(),
}).passthrough();

const OPENAI_ASSISTANT_PHASE_VALUES = new Set(["commentary", "final_answer"]);

function validateResponsesInputAssistantPhase(input: unknown, ctx: z.RefinementCtx): void {
    if (!Array.isArray(input)) return;
    for (let idx = 0; idx < input.length; idx += 1) {
        const item = input[idx] as any;
        if (!item || typeof item !== "object") continue;
        const phase = item.phase;
        if (phase === undefined || phase === null) continue;

        const role = typeof item.role === "string" ? item.role : undefined;
        const itemType = typeof item.type === "string" ? item.type : undefined;
        const isMessageItem =
            itemType === "message" ||
            (itemType === undefined && role && ("content" in item));

        if (!isMessageItem || role !== "assistant") {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["input", idx, "phase"],
                message: "phase is only allowed on assistant message items",
            });
            continue;
        }

        if (typeof phase !== "string" || !OPENAI_ASSISTANT_PHASE_VALUES.has(phase)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["input", idx, "phase"],
                message: "phase must be one of: commentary, final_answer",
            });
        }
    }
}

function isFileLike(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { arrayBuffer?: unknown; stream?: unknown };
    return typeof candidate.arrayBuffer === "function" && typeof candidate.stream === "function";
}

const UploadFileSchema = z.custom<File | Blob>(isFileLike, {
    message: "file is required",
});

// Batch schema
export const BatchSchema = z.object({
    input_file_id: z.string().min(1),
    endpoint: z.string().min(1),
    completion_window: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type BatchRequest = z.infer<typeof BatchSchema>;

// Responses schema (OAI Responses API)
export const ResponsesSchema = z.object({
    model: z.string().min(1),
    input: z.union([z.string(), z.array(z.any()), z.record(z.string(), z.any())]),
    session_id: z.string().trim().min(1).max(256).optional(),
    background: z.boolean().optional(),
    include: z.array(z.string()).optional(),
    instructions: z.string().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    parallel_tool_calls: z.boolean().optional(),
    previous_response_id: z.string().optional(),
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).nullable().optional(),
        summary: z.enum(["auto", "concise", "detailed"]).nullable().optional(),
        enabled: z.boolean().nullable().optional(),
        max_tokens: z.number().int().nonnegative().nullable().optional(),
    }).optional(),

    service_tier: ServiceTierSchema.optional(),
    store: z.boolean().optional(),
    stream: z.boolean().optional(),
    n: z.never().optional(),
    temperature: z.number().min(0).max(2).optional(),
    text: z.record(z.string(), z.any()).optional(),
    tool_choice: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    tools: z.array(z.record(z.string(), z.any())).optional(),
    web_search_options: z.record(z.string(), z.any()).optional(),
    top_p: z.number().min(0).max(1).optional(),
    truncation: z.enum(["auto", "disabled"]).optional(),
    user: z.string().optional(),
    prompt_cache_key: z.string().nullable().optional(),
    safety_identifier: z.string().nullable().optional(),
    modalities: z.array(z.string()).optional(),
    image_config: ImageConfigSchema,
    provider_options: ResponsesProviderOptionsSchema.optional(),
    usage: z.boolean().optional(),
    // Gateway-only flags (not forwarded upstream)
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).passthrough().superRefine((obj, ctx) => {
    validateResponsesInputAssistantPhase((obj as any).input, ctx);
}).transform((obj) => {
    const next: any = { ...obj };
    if (!("prompt_cache_key" in next)) {
        next.prompt_cache_key = null;
    }
    if (!("safety_identifier" in next)) {
        next.safety_identifier = null;
    }
    return next;
});
export type ResponsesRequest = z.infer<typeof ResponsesSchema>;

// Embeddings schema
const EmbeddingsInputTextPartSchema = z.object({
	type: z.enum(["text", "input_text"]),
	text: z.string(),
}).passthrough();

const EmbeddingsInputImagePartSchema = z.object({
	type: z.enum(["image_url", "input_image", "image"]),
	image_url: z.union([
		z.string().min(1),
		z.object({
			url: z.string().min(1),
		}).passthrough(),
	]).optional(),
	url: z.union([
		z.string().min(1),
		z.object({
			url: z.string().min(1),
		}).passthrough(),
	]).optional(),
}).passthrough().refine((value) => value.image_url != null || value.url != null, {
	message: "image input parts require image_url or url",
});

const EmbeddingsInputAudioPartSchema = z.object({
	type: z.literal("input_audio"),
	input_audio: z.object({
		data: z.string().optional(),
		url: z.string().min(1).optional(),
		format: z.string().optional(),
	}).passthrough().refine((value) => value.data != null || value.url != null, {
		message: "input_audio.data or input_audio.url is required",
	}),
}).passthrough();

const EmbeddingsInputVideoPartSchema = z.object({
	type: z.enum(["input_video", "video_url"]),
	video_url: z.union([
		z.string().min(1),
		z.object({
			url: z.string().min(1),
		}).passthrough(),
	]).optional(),
	url: z.union([
		z.string().min(1),
		z.object({
			url: z.string().min(1),
		}).passthrough(),
	]).optional(),
}).passthrough().refine((value) => value.video_url != null || value.url != null, {
	message: "video input parts require video_url or url",
});

const EmbeddingsInputPartSchema = z.union([
	EmbeddingsInputTextPartSchema,
	EmbeddingsInputImagePartSchema,
	EmbeddingsInputAudioPartSchema,
	EmbeddingsInputVideoPartSchema,
]);

const EmbeddingsMultimodalContentSchema = z.array(EmbeddingsInputPartSchema).min(1);

const EmbeddingsInputObjectSchema = z.object({
	content: EmbeddingsMultimodalContentSchema,
}).passthrough();

const EmbeddingsInputTokenArraySchema = z.array(z.number().int());

const EmbeddingsInputItemSchema = z.union([
	z.string(),
	EmbeddingsInputTokenArraySchema,
	EmbeddingsInputObjectSchema,
]);

const EmbeddingsInputSchema = z.union([
	z.string(),
	EmbeddingsInputTokenArraySchema,
	EmbeddingsInputObjectSchema,
	z.array(EmbeddingsInputItemSchema),
]);

const EmbeddingsProviderOptionsSchema = z.object({
    google: z.object({
        task_type: z.string().regex(/^[A-Z_]+$/).optional(),
        title: z.string().optional(),
    }).optional(),
    mistral: z.object({
        output_dtype: z.enum(["float", "int8", "uint8", "binary", "ubinary"]).optional(),
    }).optional(),
    voyage: z.object({
        input_type: z.enum(["query", "document"]).optional(),
        truncation: z.boolean().optional(),
        output_dtype: z.enum(["float", "int8", "uint8", "binary", "ubinary"]).optional(),
        output_dimension: z.number().int().positive().optional(),
    }).optional(),
}).optional();

export const EmbeddingsSchema = z.object({
    model: z.string().min(1),
    input: EmbeddingsInputSchema,
    encoding_format: z.enum(["float", "base64", "base64_int8", "base64_binary"]).optional(),
    dimensions: z.number().int().positive().optional(),
    provider_options: EmbeddingsProviderOptionsSchema,
    // Back-compat alias; normalized to provider_options below.
    embedding_options: EmbeddingsProviderOptionsSchema.optional(),
    user: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).transform((obj) => {
    const provider_options = obj.provider_options ?? obj.embedding_options;
    const next: any = {
        ...obj,
        provider_options,
    };
    delete next.embedding_options;
    return next;
});
export type EmbeddingsRequest = z.infer<typeof EmbeddingsSchema>;

// Chat Completions schema
const TextPartSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const ImageUrlPartSchema = z.object({
    type: z.literal("image_url"),
    image_url: z.object({
        url: z.string().min(1),
    }),
});

const InputAudioPartSchema = z.object({
    type: z.literal("input_audio"),
    input_audio: z.object({
        data: z.string().optional(),
        url: z.string().url().optional(),
        format: z.string().optional(),
    }).refine((value) => value.data != null || value.url != null, {
        message: "input_audio.data or input_audio.url is required",
    }),
});

const InputVideoPartSchema = z.object({
    type: z.literal("input_video"),
    video_url: z.object({
        url: z.string().url(),
    }),
});

const VideoUrlPartSchema = z.object({
    type: z.literal("video_url"),
    video_url: z.object({
        url: z.string().url(),
    }),
});

const ToolCallPartSchema = z.object({
    type: z.literal("tool_call"),
    id: z.string(),
    function: z.object({
        name: z.string(),
        arguments: z.string(),
    }),
});

const MessageContentPartSchema = z.union([
    TextPartSchema,
    ImageUrlPartSchema,
    InputAudioPartSchema,
    InputVideoPartSchema,
    VideoUrlPartSchema,
    ToolCallPartSchema,
]);

const MessageContentSchema = z.union([
    z.string(),
    z.array(MessageContentPartSchema),
]);

const ToolCallSchema = z.object({
    id: z.string(),
    type: z.literal("function"),
    function: z.object({
        name: z.string(),
        arguments: z.string(),
        description: z.string().optional(),
        parameters: z.any().optional(),
    }),
});

const FunctionToolSchema = z.object({
	type: z.literal("function"),
	function: z.object({
		name: z.string(),
		description: z.string().optional(),
		parameters: z.any(),
	}),
});

const GatewayDatetimeToolSchema = z.object({
	type: z.literal("gateway:datetime"),
	parameters: z.object({
		timezone: z.string().min(1).optional(),
		timezones: z.array(z.string().min(1)).optional(),
	}).optional(),
});

const GatewayWebSearchToolSchema = z.object({
	type: z.enum(["phaseo:web_search", "gateway:web_search"]),
	parameters: z.object({
		engine: z.enum(["auto", "native", "exa", "firecrawl", "parallel"]).optional(),
		max_results: z.number().int().positive().max(25).optional(),
		max_total_results: z.number().int().positive().max(100).optional(),
		search_context_size: z.enum(["low", "medium", "high"]).optional(),
		max_characters: z.number().int().positive().max(50000).optional(),
		allowed_domains: z.array(z.string().min(1)).optional(),
		excluded_domains: z.array(z.string().min(1)).optional(),
		include_domains: z.array(z.string().min(1)).optional(),
		exclude_domains: z.array(z.string().min(1)).optional(),
		include_text: z.boolean().optional(),
		include_highlights: z.boolean().optional(),
		user_location: z.record(z.string(), z.any()).optional(),
	}).optional(),
	engine: z.enum(["auto", "native", "exa", "firecrawl", "parallel"]).optional(),
	max_results: z.number().int().positive().max(25).optional(),
	max_total_results: z.number().int().positive().max(100).optional(),
	search_context_size: z.enum(["low", "medium", "high"]).optional(),
	max_characters: z.number().int().positive().max(50000).optional(),
	allowed_domains: z.array(z.string().min(1)).optional(),
	excluded_domains: z.array(z.string().min(1)).optional(),
	include_domains: z.array(z.string().min(1)).optional(),
	exclude_domains: z.array(z.string().min(1)).optional(),
	include_text: z.boolean().optional(),
	include_highlights: z.boolean().optional(),
	user_location: z.record(z.string(), z.any()).optional(),
});

const GatewayWebFetchToolSchema = z.object({
	type: z.enum(["phaseo:web_fetch", "gateway:web_fetch"]),
	parameters: z.object({
		engine: z.enum(["auto", "native", "direct", "exa", "firecrawl", "parallel"]).optional(),
		max_chars: z.number().int().positive().max(50000).optional(),
		max_content_tokens: z.number().int().positive().max(50000).optional(),
		allowed_domains: z.array(z.string().min(1)).optional(),
		blocked_domains: z.array(z.string().min(1)).optional(),
		excluded_domains: z.array(z.string().min(1)).optional(),
	}).optional(),
	engine: z.enum(["auto", "native", "direct", "exa", "firecrawl", "parallel"]).optional(),
	url: z.string().url().optional(),
	max_chars: z.number().int().positive().max(50000).optional(),
	max_content_tokens: z.number().int().positive().max(50000).optional(),
	allowed_domains: z.array(z.string().min(1)).optional(),
	blocked_domains: z.array(z.string().min(1)).optional(),
	excluded_domains: z.array(z.string().min(1)).optional(),
});

const GatewayAdvisorToolSchema = z.object({
	type: z.literal("phaseo:advisor"),
	parameters: z.object({
		name: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/).optional(),
		model: z.string().min(1).optional(),
		instructions: z.string().min(1).optional(),
		forward_transcript: z.boolean().optional(),
		max_uses: z.number().int().positive().optional(),
		max_tokens: z.number().int().min(1024).optional(),
		max_completion_tokens: z.number().int().min(1024).optional(),
		reasoning: z.record(z.string(), z.unknown()).optional(),
		temperature: z.number().min(0).max(2).optional(),
	}).optional(),
	name: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/).optional(),
	model: z.string().min(1).optional(),
	instructions: z.string().min(1).optional(),
	forward_transcript: z.boolean().optional(),
	max_uses: z.number().int().positive().optional(),
	max_tokens: z.number().int().min(1024).optional(),
	max_completion_tokens: z.number().int().min(1024).optional(),
	reasoning: z.record(z.string(), z.unknown()).optional(),
	temperature: z.number().min(0).max(2).optional(),
});

const GatewaySubagentToolSchema = z.object({
	type: z.enum(["phaseo:subagent", "openrouter:subagent"]),
	parameters: z.object({
		model: z.string().min(1).optional(),
		instructions: z.string().min(1).optional(),
		max_uses: z.number().int().positive().optional(),
		max_tokens: z.number().int().min(1024).optional(),
		max_completion_tokens: z.number().int().min(1024).optional(),
		reasoning: z.record(z.string(), z.unknown()).optional(),
		temperature: z.number().min(0).max(2).optional(),
		tools: z.array(z.record(z.string(), z.any())).optional(),
	}).optional(),
	model: z.string().min(1).optional(),
	instructions: z.string().min(1).optional(),
	max_uses: z.number().int().positive().optional(),
	max_tokens: z.number().int().min(1024).optional(),
	max_completion_tokens: z.number().int().min(1024).optional(),
	reasoning: z.record(z.string(), z.unknown()).optional(),
	temperature: z.number().min(0).max(2).optional(),
	tools: z.array(z.record(z.string(), z.any())).optional(),
});

const GatewayImageGenerationToolSchema = z.object({
	type: z.literal("phaseo:image_generation"),
	parameters: z.object({
		prompt: z.string().min(1).optional(),
		description: z.string().min(1).optional(),
		model: z.string().min(1).optional(),
		quality: z.string().min(1).optional(),
		size: z.string().min(1).optional(),
		aspect_ratio: z.string().min(1).optional(),
		background: z.string().min(1).optional(),
		output_format: z.string().min(1).optional(),
		output_compression: z.number().min(0).max(100).optional(),
		moderation: z.string().min(1).optional(),
	}).optional(),
	model: z.string().min(1).optional(),
	quality: z.string().min(1).optional(),
	size: z.string().min(1).optional(),
	aspect_ratio: z.string().min(1).optional(),
	background: z.string().min(1).optional(),
	output_format: z.string().min(1).optional(),
	output_compression: z.number().min(0).max(100).optional(),
	moderation: z.string().min(1).optional(),
	prompt: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
});

const GatewayApplyPatchToolSchema = z.object({
	type: z.literal("phaseo:apply_patch"),
	parameters: z.object({
		engine: z.enum(["auto", "native", "phaseo"]).optional(),
	}).optional(),
	engine: z.enum(["auto", "native", "phaseo"]).optional(),
});

const OpenAINativeWebSearchToolSchema = z.object({
	type: z.enum(OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES),
}).passthrough();

const AnthropicNativeWebSearchToolSchema = z.object({
	type: z.enum(ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES),
	name: z.string().optional(),
	max_uses: z.number().int().positive().optional(),
	allowed_domains: z.array(z.string().min(1)).optional(),
	blocked_domains: z.array(z.string().min(1)).optional(),
	user_location: z.object({
		type: z.string(),
		city: z.string().optional(),
		region: z.string().optional(),
		country: z.string().optional(),
		timezone: z.string().optional(),
	}).passthrough().optional(),
}).passthrough();

const AnthropicNativeWebFetchToolSchema = z.object({
	type: z.enum(ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES),
	name: z.string().optional(),
	max_uses: z.number().int().positive().optional(),
	max_content_tokens: z.number().int().positive().optional(),
	allowed_domains: z.array(z.string().min(1)).optional(),
	blocked_domains: z.array(z.string().min(1)).optional(),
}).passthrough();

const AnthropicNativeAdvisorToolSchema = z.object({
	type: z.enum(ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES),
	name: z.literal("advisor").optional(),
	model: z.string().min(1),
	max_uses: z.number().int().positive().optional(),
	max_tokens: z.number().int().min(1024).optional(),
	caching: z.object({
		type: z.literal("ephemeral"),
		ttl: z.enum(["5m", "1h"]),
	}).optional(),
}).passthrough();

export const ChatCompletionsSchema = z.object({
    model: z.string().min(1),
    session_id: z.string().trim().min(1).max(256).optional(),
    messages: z.array(
        z.discriminatedUnion("role", [
            z.object({
                role: z.literal("system"),
                content: MessageContentSchema,
                name: z.string().optional(),
            }),
            z.object({
                role: z.literal("developer"),
                content: MessageContentSchema,
                name: z.string().optional(),
            }),
            z.object({
                role: z.literal("user"),
                content: MessageContentSchema,
                name: z.string().optional(),
            }),
            z.object({
                role: z.literal("assistant"),
                content: MessageContentSchema.optional(),
                name: z.string().optional(),
                tool_calls: z.array(ToolCallSchema).optional(),
                reasoning_content: z.string().optional(),
            }),
            z.object({
                role: z.literal("tool"),
                content: MessageContentSchema,
                name: z.string().optional(),
                tool_call_id: z.string(),
            }),
        ])
    ).min(1),
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional().default("medium"),
        summary: z.enum(["auto", "concise", "detailed"]).optional().default("auto"),
        enabled: z.boolean().optional(),
        max_tokens: z.number().int().nonnegative().optional(),
    }).optional(),


    frequency_penalty: z.number().min(-2).max(2).optional(),
    logit_bias: z.record(z.string(), z.number()).optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    usage: z.boolean().optional(),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    presence_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().min(-9223372036854776000).max(9223372036854776000).optional(),
    store: z.boolean().optional(),
    stream: z.boolean().optional().default(false),
    stream_options: z.record(z.string(), z.any()).optional(),
    n: z.never().optional(),
    temperature: z.number().min(0).max(2).optional().default(1),

    // Tools
    tools: z.array(
		z.union([
			FunctionToolSchema,
			GatewayDatetimeToolSchema,
			GatewayWebSearchToolSchema,
			GatewayWebFetchToolSchema,
			GatewayAdvisorToolSchema,
			GatewaySubagentToolSchema,
			GatewayImageGenerationToolSchema,
			OpenAINativeWebSearchToolSchema,
		]),
	).optional(),

    max_tool_calls: z.number().int().positive().optional(),
    parallel_tool_calls: z.boolean().optional().default(true),
    tool_choice: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    web_search_options: z.record(z.string(), z.any()).optional(),

    logprobs: z.boolean().optional().default(false),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    top_p: z.number().min(0).max(1).optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    response_format: ResponseFormatSchema.optional(),
    modalities: z.array(z.string()).optional(),
    image_config: ImageConfigSchema,
    // This is used as the safety identifer/userid across providers
    user: z.string().optional(),
    user_id: z.string().optional(),

    service_tier: ServiceTierSchema.optional(),
    prompt_cache_key: z.string().nullable().optional(),
    provider_options: ResponsesProviderOptionsSchema.optional(),
    safety_identifier: z.string().nullable().optional(),
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).passthrough().transform((obj) => {
    return obj;
});

export type ChatCompletionsRequest = z.infer<typeof ChatCompletionsSchema>;

// Anthropic Messages schema
const AnthropicTextContentSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema.optional(),
});

const AnthropicImageContentSchema = z.object({
    type: z.literal("image"),
    cache_control: CacheControlSchema.optional(),
    source: z.object({
        type: z.enum(["base64", "url"]),
        media_type: z.string().optional(),
        data: z.string().optional(),
        url: z.string().optional(),
    }),
});

const AnthropicToolUseContentSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()),
});

const AnthropicToolResultContentSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.any())]),
    cache_control: CacheControlSchema.optional(),
});

const AnthropicServerToolUseContentSchema = z.object({
    type: z.literal("server_tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()).optional(),
});

const AnthropicAdvisorToolResultContentSchema = z.object({
    type: z.literal("advisor_tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.any())]).optional(),
});

const AnthropicContentBlockSchema = z.union([
    AnthropicTextContentSchema,
    AnthropicImageContentSchema,
    AnthropicToolUseContentSchema,
    AnthropicToolResultContentSchema,
    AnthropicServerToolUseContentSchema,
    AnthropicAdvisorToolResultContentSchema,
]);

const AnthropicMessageContentSchema = z.union([
    z.string(),
    z.array(AnthropicContentBlockSchema),
]);

const AnthropicToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.string(), z.any()),
    cache_control: CacheControlSchema.optional(),
});

const AnthropicToolChoiceSchema = z.union([
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("any") }),
    z.object({ type: z.literal("tool"), name: z.string() }),
]);

export const AnthropicMessagesSchema = z.object({
    model: z.string().min(1),
    session_id: z.string().trim().min(1).max(256).optional(),
    messages: z.array(
        z.object({
            role: z.enum(["user", "assistant"]),
            content: AnthropicMessageContentSchema,
        })
    ).min(1),
    system: z.union([z.string(), z.array(AnthropicTextContentSchema)]).optional(),
    max_tokens: z.number().int().positive(),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    stream: z.boolean().optional().default(false),
    tools: z.array(z.union([
		AnthropicToolSchema,
		GatewayDatetimeToolSchema,
		GatewayWebSearchToolSchema,
		GatewayWebFetchToolSchema,
		GatewayAdvisorToolSchema,
		GatewaySubagentToolSchema,
		GatewayImageGenerationToolSchema,
		AnthropicNativeWebSearchToolSchema,
		AnthropicNativeWebFetchToolSchema,
		AnthropicNativeAdvisorToolSchema,
	])).optional(),
    tool_choice: AnthropicToolChoiceSchema.optional(),
    metadata: z.object({
        user_id: z.string().optional(),
    }).passthrough().optional(),
    service_tier: ServiceTierSchema.optional(),
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
        enabled: z.boolean().optional(),
        summary: z.enum(["auto", "concise", "detailed"]).optional(),
        max_tokens: z.number().int().nonnegative().optional(),
    }).optional(),

    stop_sequences: z.array(z.string()).optional(),
    web_search_options: z.record(z.string(), z.any()).optional(),
    webSearchOptions: z.record(z.string(), z.any()).optional(),
    plugins: z.array(z.any()).optional(),
    provider_options: ResponsesProviderOptionsSchema.optional(),
    usage: z.boolean().optional(),
    // Gateway-only flags (not forwarded upstream)
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).passthrough();

export type AnthropicMessagesRequest = z.infer<typeof AnthropicMessagesSchema>;

// Images Generation schema
export const ImagesGenerationSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().min(1),
    size: z.string().optional(),
    n: z.number().int().min(1).max(10).optional(),
    quality: z.string().optional(),
    response_format: z.string().optional(),
    output_format: z.enum(["png", "jpeg", "webp"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    style: z.string().optional(),
    user: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type ImagesGenerationRequest = z.infer<typeof ImagesGenerationSchema>;

// Images Edit schema (OpenAI compatible)
export const ImagesEditSchema = z.object({
    model: z.string().min(1),
    image: z.union([
        z.string().min(1), // base64 or URL
        z.array(z.string().min(1)).min(1), // OpenAI-compatible multi-image edits
    ]),
    mask: z.string().optional(),
    prompt: z.string().min(1),
    size: z.string().optional(),
    n: z.number().int().min(1).max(10).optional(),
    quality: z.string().optional(),
    response_format: z.string().optional(),
    output_format: z.enum(["png", "jpeg", "webp"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    input_fidelity: z.enum(["high", "low"]).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    user: z.string().optional(),
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type ImagesEditRequest = z.infer<typeof ImagesEditSchema>;

// Moderations schema
export const ModerationsSchema = z.object({
    model: z.string().min(1),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
    input: z.union([
        z.string(),
        z.array(z.string()),
        z.array(
            z.discriminatedUnion("type", [
                z.object({
                    type: z.literal("text"),
                    text: z.string(),
                }),
                z.object({
                    type: z.literal("image_url"),
                    image_url: z.object({
                        url: z.string().refine(
                            (val) => {
                                // Accepts http(s) URLs or data URLs
                                return /^https?:\/\//.test(val) || /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(val);
                            },
                            {
                                message: "Must be a valid image URL or data URL (base64-encoded image)",
                            }
                        ),
                    })
                })
            ])
        )
    ]),
});
export type ModerationsRequest = z.infer<typeof ModerationsSchema>;

// Rerank schema
const RerankDocumentSchema = z.union([
    z.string(),
    z.record(z.string(), z.any()),
]);

export const RerankSchema = z.object({
    model: z.string().min(1),
    query: z.string().min(1),
    documents: z.array(RerankDocumentSchema).min(1),
    top_n: z.number().int().positive().optional(),
    // Compatibility alias used by some APIs.
    top_k: z.number().int().positive().optional(),
    return_documents: z.boolean().optional(),
    max_chunks_per_doc: z.number().int().positive().optional(),
    rank_fields: z.array(z.string().min(1)).optional(),
    user: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    provider_options: z.record(z.string(), z.any()).optional(),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).passthrough().transform((obj) => {
    const next: any = { ...obj };
    if (!("top_n" in next) && typeof next.top_k === "number") {
        next.top_n = next.top_k;
    }
    return next;
});
export type RerankRequest = z.infer<typeof RerankSchema>;

// Audio Speech schema
const ElevenLabsSpeechConfigSchema = z.object({
    output_format: z.string().optional(),
    language_code: z.string().optional(),
    voice_settings: z.record(z.string(), z.any()).optional(),
    seed: z.number().int().optional(),
    pronunciation_dictionary_locators: z.array(z.any()).optional(),
    enable_logging: z.boolean().optional(),
    voice: z.string().optional(),
    voice_id: z.string().optional(),
    voiceId: z.string().optional(),
    voice_name: z.string().optional(),
    voiceName: z.string().optional(),
}).passthrough();

export const AudioSpeechSchema = z.object({
    model: z.string().min(1),
    input: z.string().min(1),
    voice: z.union([
        z.string(),
        z.object({
            id: z.string().optional(),
            name: z.string().optional(),
            voiceName: z.string().optional(),
        }).passthrough(),
    ]).optional(),
    format: z.enum(["mp3", "wav", "ogg", "aac", "flac", "opus", "pcm"]).optional(),
    response_format: z.enum(["mp3", "wav", "aac", "flac", "opus", "pcm"]).optional(),
    stream_format: z.enum(["audio", "sse"]).optional(),
    speed: z.number().positive().optional(),
    instructions: z.string().optional(),
    config: z.object({
        elevenlabs: ElevenLabsSpeechConfigSchema.optional(),
        google: z.object({
            voice_name: z.string().optional(),
            voiceName: z.string().optional(),
        }).passthrough().optional(),
    }).passthrough().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).superRefine((obj, ctx) => {
    if (obj.stream_format !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stream_format"],
            message: "audio.speech does not support stream_format; binary audio is returned by default and response_format controls the encoding.",
        });
    }
});
export type AudioSpeechRequest = z.infer<typeof AudioSpeechSchema>;

// Audio Transcription schema
export const AudioTranscriptionSchema = z.object({
    model: z.string().min(1),
    file: UploadFileSchema,
    language: z.string().optional(),
    prompt: z.string().optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
    response_format: z.string().optional(),
    timestamp_granularities: z.array(z.enum(["word", "segment"])).optional(),
    include: z.array(z.string()).optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type AudioTranscriptionRequest = z.infer<typeof AudioTranscriptionSchema>;

// Audio Translation schema
export const AudioTranslationSchema = z.object({
    model: z.string().min(1),
    file: UploadFileSchema,
    language: z.string().optional(),
    prompt: z.string().optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
    response_format: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type AudioTranslationRequest = z.infer<typeof AudioTranslationSchema>;

const VideoReferenceTypeSchema = z.enum(["asset", "style", "character", "location", "generic"]).or(z.string());
const VideoInputReferenceRoleSchema = z.enum(["first_frame", "last_frame", "reference", "source", "mask"]);

const VideoInputReferenceContentPartSchema = z.object({
	type: z.literal("image_url"),
	role: VideoInputReferenceRoleSchema.optional(),
	reference_type: VideoReferenceTypeSchema.optional(),
	image_url: z.object({
		url: z.string().min(1),
	}),
}).strict();

const VideoInputReferenceSchema = VideoInputReferenceContentPartSchema;

const VideoOutputConfigSchema = z.object({
	access: z.enum(["bytes", "signed_url", "both"]).default("both"),
}).default({ access: "both" });

const VideoWebhookSchema = z.object({
	url: z.string().min(1),
	secret: z.string().min(1).optional(),
	events: z.array(z.string().min(1)).optional(),
}).strict().transform((value, ctx) => {
	const parsed = parseAsyncWebhookConfig("video", value);
	if (!parsed) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Invalid video webhook configuration",
		});
		return z.NEVER;
	}
	return parsed;
});

// Video Generation schema
export const VideoGenerationSchema = z.object({
	model: z.string().min(1),
	prompt: z.string().min(1),
	duration: z.number().int().positive().max(120).optional(),
	size: z.string().min(1).optional(),
	resolution: z.string().min(1).optional(),
	aspect_ratio: z.string().min(1).optional(),
	seed: z.number().int().optional(),
	sample_count: z.number().int().positive().optional(),
	negative_prompt: z.string().optional(),
	generate_audio: z.boolean().optional(),
	enhance_prompt: z.boolean().optional(),
	compression_quality: z.number().int().min(0).max(100).optional(),
	person_generation: z.string().optional(),
	resize_mode: z.string().optional(),
	input_references: z.array(VideoInputReferenceSchema).optional(),
	provider_params: z.record(z.string(), z.any()).optional(),
	output: VideoOutputConfigSchema.optional(),
	webhook: VideoWebhookSchema.optional(),
	echo_upstream_request: z.boolean().optional(),
	debug: DebugOptionsSchema,
	beta: BetaOptionsSchema,
	provider: ProviderRoutingSchema,
	routing: ProviderRoutingSchema,
}).strict().superRefine((obj, ctx) => {
	if (obj.size && (obj.resolution || obj.aspect_ratio)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "size cannot be combined with resolution or aspect_ratio",
			path: ["size"],
		});
	}
});
export type VideoGenerationRequest = z.infer<typeof VideoGenerationSchema>;

// OCR schema
export const OcrSchema = z.object({
    model: z.string().min(1),
    image: z.string().min(1), // URL or base64
    language: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type OcrRequest = z.infer<typeof OcrSchema>;

// Music Generate schema
export const MusicGenerateSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().optional(),
    duration: z.number().int().positive().optional(),
    format: z.enum(["mp3", "wav", "ogg", "aac"]).optional(),
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
    suno: z.object({
        prompt: z.string().optional(),
        style: z.string().optional(),
        title: z.string().optional(),
        customMode: z.boolean().optional(),
        instrumental: z.boolean().optional(),
        personaId: z.string().optional(),
        personaModel: z.string().optional(),
        model: z.string().optional(),
        negativeTags: z.string().optional(),
        vocalGender: z.enum(["m", "f"]).optional(),
        styleWeight: z.number().min(0).max(1).optional(),
        weirdnessConstraint: z.number().min(0).max(1).optional(),
        audioWeight: z.number().min(0).max(1).optional(),
        callBackUrl: z.string().url().optional(),
    }).passthrough().optional(),
    elevenlabs: z.object({
        prompt: z.string().optional(),
        composition_plan: z.any().optional(),
        music_length_ms: z.number().int().positive().optional(),
        model_id: z.string().optional(),
        force_instrumental: z.boolean().optional(),
        store_for_inpainting: z.boolean().optional(),
        with_timestamps: z.boolean().optional(),
        sign_with_c2pa: z.boolean().optional(),
        output_format: z.string().optional(),
    }).passthrough().optional(),
    minimax: z.object({
        prompt: z.string().optional(),
        duration: z.number().int().positive().optional(),
        callback_url: z.string().url().optional(),
        request: z.record(z.string(), z.any()).optional(),
    }).passthrough().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
});
export type MusicGenerateRequest = z.infer<typeof MusicGenerateSchema>;

// Generation response schema
export const GenerationResponseSchema = z.object({
    request_id: z.string(),
    workspace_id: z.string(),
    app_id: z.string().nullable(),
    endpoint: z.string(),
    model_id: z.string(),
    provider: z.string(),
    native_response_id: z.string().nullable(),
    stream: z.boolean(),
    byok: z.boolean(),
    status_code: z.number(),
    success: z.boolean(),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
    latency_ms: z.number(),
    generation_ms: z.number(),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
    }).nullable(),
    cost_nanos: z.number(),
    currency: z.string(),
    pricing_lines: z.array(z.any()),
    key_id: z.string(),
    throughput: z.number().nullable(),
});
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;

// Function to get schema for a given endpoint
export function schemaFor(endpoint: Endpoint): z.ZodTypeAny | null {
    switch (endpoint) {
        case "chat.completions": return ChatCompletionsSchema;
        case "responses": return ResponsesSchema;
        case "messages": return AnthropicMessagesSchema;
        case "moderations": return ModerationsSchema;
        case "rerank": return RerankSchema;
        case "audio.speech": return AudioSpeechSchema;
        case "audio.transcription": return AudioTranscriptionSchema;
        case "audio.translations": return AudioTranslationSchema;
        case "images.generations": return ImagesGenerationSchema;
        case "images.edits": return ImagesEditSchema;
        case "video.generation": return VideoGenerationSchema;
        case "embeddings": return EmbeddingsSchema;
        case "batch": return BatchSchema;
        case "ocr": return OcrSchema;
        case "music.generate": return MusicGenerateSchema;
        case "files.upload":
        case "files.list":
        case "files.retrieve":
            return null; // No schema for files endpoints
        default:
            return null;
    }
}
