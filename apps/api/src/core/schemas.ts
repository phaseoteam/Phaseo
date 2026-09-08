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

const ServiceTierSchema = z.enum(["standard", "fast", "priority", "flex", "batch"]);

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

const OpenAIContextManagementEntrySchema = z.object({
	type: z.literal("compaction"),
	compact_threshold: z.number().optional(),
}).passthrough();

const OpenAIContextManagementSchema = z.array(OpenAIContextManagementEntrySchema);

const OpenAIPromptCacheOptionsSchema = z.object({
	mode: z.enum(["implicit", "explicit"]).optional(),
	ttl: z.string().optional(),
}).passthrough();

const CacheControlSchema = z.object({
    type: z.string().optional(),
    ttl: z.string().optional(),
    scope: z.string().optional(),
}).passthrough();

const OpenAIProviderOptionsSchema = z.object({
	// Retain the historical object form for the gateway extension while the
	// first-class OpenAI field follows the official array contract.
	context_management: z.union([
		OpenAIContextManagementSchema,
		OpenAIContextManagementEntrySchema,
	]).optional(),
	prompt_cache_retention: z.string().optional(),
	prompt_cache_options: OpenAIPromptCacheOptionsSchema.optional(),
}).passthrough();

const AnthropicProviderOptionsSchema = z.object({
	cache_control: CacheControlSchema.optional(),
}).passthrough();

const GoogleProviderOptionsSchema = z.object({
	cache_control: CacheControlSchema.optional(),
	cached_content: z.string().optional(),
	cache_ttl: z.string().optional(),
}).passthrough();

const DeepInfraProviderOptionsSchema = z.object({
	fail_fast: z.boolean().optional(),
	min_p: z.number().min(0).max(1).optional(),
	stop_token_ids: z.array(z.number().int()).max(16).optional(),
	chat_template_kwargs: z.record(z.string(), z.any()).optional(),
	continue_final_message: z.boolean().optional(),
	ignore_eos: z.boolean().optional(),
}).passthrough();

const FireworksProviderOptionsSchema = z.object({
	min_p: z.number().min(0).max(1).optional(),
	typical_p: z.number().min(0).max(1).optional(),
	prompt_cache_isolation_key: z.string().optional(),
	raw_output: z.boolean().optional(),
	perf_metrics_in_response: z.boolean().optional(),
	mirostat_target: z.number().optional(),
	mirostat_lr: z.number().optional(),
	echo: z.boolean().optional(),
	echo_last: z.number().int().optional(),
	ignore_eos: z.boolean().optional(),
	context_length_exceeded_behavior: z.enum(["error", "truncate"]).optional(),
	reasoning_history: z.enum(["disabled", "interleaved", "preserved"]).optional(),
	return_token_ids: z.boolean().optional(),
	prompt_truncate_len: z.number().int().positive().optional(),
	safe_tokenization: z.boolean().optional(),
}).passthrough();

const GMICloudProviderOptionsSchema = z.object({
	ignore_eos: z.boolean().optional(),
	context_length_exceeded_behavior: z.enum(["truncate", "error"]).optional(),
}).passthrough();


const ResponsesProviderOptionsSchema = z.object({
	openai: OpenAIProviderOptionsSchema.optional(),
	anthropic: AnthropicProviderOptionsSchema.optional(),
	google: GoogleProviderOptionsSchema.optional(),
	deepinfra: DeepInfraProviderOptionsSchema.optional(),
	fireworks: FireworksProviderOptionsSchema.optional(),
	gmicloud: GMICloudProviderOptionsSchema.optional(),
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
const BatchWebhookSchema = z.object({
    endpoint_id: z.string().min(1),
    events: z.array(z.string().min(1)).optional(),
}).strict();

const BatchRequestItemSchema = z.object({
    custom_id: z.string().min(1).optional(),
    customId: z.string().min(1).optional(),
    method: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    body: z.record(z.string(), z.any()).optional(),
    request: z.record(z.string(), z.any()).optional(),
}).refine((value) => Boolean(value.body || value.request), {
    message: "batch request requires body or request",
});

export const BatchSchema = z.object({
    input_file_id: z.string().min(1).optional(),
    requests: z.array(BatchRequestItemSchema).min(1).optional(),
    endpoint: z.string().min(1),
    completion_window: z.string().optional(),
    metadata: z.record(z.string().max(64), z.string().max(512))
        .refine((value) => Object.keys(value).length <= 16, "metadata supports at most 16 entries")
        .optional(),
    output_expires_after: z.object({
        anchor: z.literal("created_at"),
        seconds: z.number().int().min(3_600).max(2_592_000),
    }).strict().optional(),
    session_id: z.string().trim().min(1).max(256).optional(),
    webhook: BatchWebhookSchema.optional(),
    webhook_endpoint_id: z.string().min(1).optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).refine((value) => Boolean(value.input_file_id) !== Boolean(value.requests), {
    message: "Provide exactly one of input_file_id or requests.",
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
	context_management: OpenAIContextManagementSchema.optional(),
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).nullable().optional(),
        mode: z.enum(["standard", "pro"]).nullable().optional(),
        summary: z.enum(["auto", "concise", "detailed"]).nullable().optional(),
		context: z.enum(["auto", "current_turn", "all_turns"]).nullable().optional(),
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
	prompt_cache_options: OpenAIPromptCacheOptionsSchema.optional(),
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
const EmbeddingsStructuredInputSchema = z.record(z.string(), z.any()).refine(
	(value) => Object.keys(value).length > 0 && typeof value.type !== "string",
	{ message: "structured embedding input must not be empty" },
);

const EmbeddingsInputStringSchema = z.string().min(1);
const EmbeddingsInputTokenArraySchema = z.array(z.number().int()).max(2048);

const EmbeddingsInputItemSchema = z.union([
	EmbeddingsInputStringSchema,
	EmbeddingsInputTokenArraySchema,
	EmbeddingsInputObjectSchema,
	EmbeddingsStructuredInputSchema,
]);

const EmbeddingsInputSchema = z.union([
	EmbeddingsInputStringSchema,
	EmbeddingsInputTokenArraySchema,
	EmbeddingsInputObjectSchema,
	EmbeddingsStructuredInputSchema,
	z.array(EmbeddingsInputItemSchema).max(2048),
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
	fireworks: z.object({
		prompt_template: z.string().optional(),
		return_logits: z.array(z.number().int()).optional(),
		normalize: z.boolean().optional(),
	}).optional(),
}).optional();

export const EmbeddingsSchema = z.object({
    model: z.string().min(1),
    input: EmbeddingsInputSchema,
    session_id: z.string().trim().min(1).max(256).optional(),
    encoding_format: z.enum(["float", "base64", "base64_int8", "base64_binary"]).optional(),
    dimensions: z.number().int().positive().optional(),
	service_tier: z.enum(["auto", "default", "over-limit", "flex", "no-limit"]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
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
		detail: z.enum(["auto", "low", "high", "original"]).optional(),
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

const AudioUrlPartSchema = z.object({
    type: z.literal("audio_url"),
    audio_url: z.object({
        url: z.string().min(1),
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
    AudioUrlPartSchema,
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
	async: z.boolean().optional(),
	function: z.object({
		name: z.string(),
		description: z.string().optional(),
		parameters: z.any().optional(),
		strict: z.boolean().nullable().optional(),
	}),
});

const OpenAICustomToolSchema = z.object({
	type: z.literal("custom"),
	async: z.boolean().optional(),
	custom: z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		format: z.record(z.string(), z.any()).optional(),
	}).passthrough(),
}).passthrough();

const GatewayDatetimeToolSchema = z.object({
	type: z.enum(["phaseo:datetime", "gateway:datetime"]),
	parameters: z.object({
		timezone: z.string().min(1).optional(),
		timezones: z.array(z.string().min(1)).max(5).optional(),
	}).optional(),
});

const GatewayWebSearchToolSchema = z.object({
	type: z.enum(["phaseo:web_search", "gateway:web_search"]),
	parameters: z.object({
		engine: z.enum(["auto", "native", "exa", "firecrawl", "parallel", "perplexity", "tinyfish"]).optional(),
		max_results: z.number().int().positive().max(25).optional(),
		max_total_results: z.number().int().positive().max(100).optional(),
		search_context_size: z.enum(["low", "medium", "high"]).optional(),
		max_characters: z.number().int().positive().max(100000).optional(),
		max_uses: z.number().int().positive().optional(),
		allowed_domains: z.array(z.string().min(1)).optional(),
		excluded_domains: z.array(z.string().min(1)).optional(),
		include_domains: z.array(z.string().min(1)).optional(),
		exclude_domains: z.array(z.string().min(1)).optional(),
		include_text: z.boolean().optional(),
		include_highlights: z.boolean().optional(),
		user_location: z.record(z.string(), z.any()).optional(),
		language: z.string().optional(),
		page: z.number().int().min(0).max(10).optional(),
	}).optional(),
	engine: z.enum(["auto", "native", "exa", "firecrawl", "parallel", "perplexity", "tinyfish"]).optional(),
	max_results: z.number().int().positive().max(25).optional(),
	max_total_results: z.number().int().positive().max(100).optional(),
	search_context_size: z.enum(["low", "medium", "high"]).optional(),
	max_characters: z.number().int().positive().max(100000).optional(),
	max_uses: z.number().int().positive().optional(),
	allowed_domains: z.array(z.string().min(1)).optional(),
	excluded_domains: z.array(z.string().min(1)).optional(),
	include_domains: z.array(z.string().min(1)).optional(),
	exclude_domains: z.array(z.string().min(1)).optional(),
	include_text: z.boolean().optional(),
	include_highlights: z.boolean().optional(),
	user_location: z.record(z.string(), z.any()).optional(),
	language: z.string().optional(),
	page: z.number().int().min(0).max(10).optional(),
});

const GatewayWebFetchToolSchema = z.object({
	type: z.enum(["phaseo:web_fetch", "gateway:web_fetch"]),
	parameters: z.object({
		engine: z.enum(["auto", "native", "direct", "exa", "firecrawl", "parallel"]).optional(),
		max_chars: z.number().int().positive().max(100000).optional(),
		max_content_tokens: z.number().int().positive().max(100000).optional(),
		max_uses: z.number().int().positive().optional(),
		allowed_domains: z.array(z.string().min(1)).optional(),
		blocked_domains: z.array(z.string().min(1)).optional(),
		excluded_domains: z.array(z.string().min(1)).optional(),
	}).optional(),
	engine: z.enum(["auto", "native", "direct", "exa", "firecrawl", "parallel"]).optional(),
	url: z.string().url().optional(),
	max_chars: z.number().int().positive().max(100000).optional(),
	max_content_tokens: z.number().int().positive().max(100000).optional(),
	max_uses: z.number().int().positive().optional(),
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
	type: z.literal("phaseo:subagent"),
	parameters: z.object({
		model: z.string().min(1).optional(),
		instructions: z.string().min(1).optional(),
		max_uses: z.number().int().positive().optional(),
		max_tokens: z.number().int().min(1024).optional(),
		max_completion_tokens: z.number().int().min(1024).optional(),
		reasoning: z.record(z.string(), z.unknown()).optional(),
		temperature: z.number().min(0).max(2).optional(),
	}).optional(),
	model: z.string().min(1).optional(),
	instructions: z.string().min(1).optional(),
	max_uses: z.number().int().positive().optional(),
	max_tokens: z.number().int().min(1024).optional(),
	max_completion_tokens: z.number().int().min(1024).optional(),
	reasoning: z.record(z.string(), z.unknown()).optional(),
	temperature: z.number().min(0).max(2).optional(),
});

const GatewayFusionToolSchema = z.object({
	type: z.literal("phaseo:fusion"),
	parameters: z.object({
		analysis_models: z.array(z.string().min(1)).min(2).max(8).optional(),
		model: z.string().min(1).optional(),
		instructions: z.string().min(1).optional(),
		max_uses: z.number().int().positive().max(4).optional(),
		max_completion_tokens: z.number().int().min(1024).optional(),
	}).optional(),
});

const GatewaySearchModelsToolSchema = z.object({
	type: z.literal("phaseo:search_models"),
	parameters: z.object({
		max_results: z.number().int().min(1).max(20).optional(),
	}).optional(),
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
        effort: z.enum(["none", "instant", "minimal", "low", "medium", "high", "xhigh", "max"]).optional().default("medium"),
        mode: z.enum(["standard", "pro"]).optional(),
        summary: z.enum(["auto", "concise", "detailed"]).optional().default("auto"),
        enabled: z.boolean().optional(),
        max_tokens: z.number().int().nonnegative().optional(),
    }).optional(),
    reasoning_effort: z.enum(["none", "instant", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
	reasoning_summary: z.union([z.boolean(), z.enum(["auto", "concise", "detailed"])]).optional(),
	reasoning_summary_wait: z.boolean().optional(),
	diffusing: z.boolean().optional(),
	realtime: z.boolean().optional(),


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
    n: z.number().int().min(1).max(16).optional(),
    documents: z.array(z.object({
        content: z.string().min(1),
        metadata: z.array(z.object({
            key: z.string().min(1),
            value: z.string(),
        }).strict()).optional(),
    }).strict()).optional(),
    temperature: z.number().min(0).max(2).optional().default(1),

    // Tools
    tools: z.array(
		z.union([
			FunctionToolSchema,
			OpenAICustomToolSchema,
			GatewayDatetimeToolSchema,
			GatewayWebSearchToolSchema,
			GatewayWebFetchToolSchema,
			GatewayAdvisorToolSchema,
			GatewaySubagentToolSchema,
			GatewayFusionToolSchema,
			GatewaySearchModelsToolSchema,
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
    top_k: z.number().int().min(-1).optional(),
    min_p: z.number().min(0).max(1).optional(),
    repetition_penalty: z.number().positive().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    response_format: ResponseFormatSchema.optional(),
    modalities: z.array(z.string()).optional(),
    image_config: ImageConfigSchema,
    // This is used as the safety identifer/userid across providers
    user: z.string().optional(),
    user_id: z.string().optional(),

    service_tier: ServiceTierSchema.optional(),
    prompt_cache_key: z.string().nullable().optional(),
	prompt_cache_options: OpenAIPromptCacheOptionsSchema.optional(),
	verbosity: z.enum(["low", "medium", "high"]).optional(),
	audio: z.object({
		format: z.enum(["wav", "aac", "mp3", "flac", "opus", "pcm", "pcm16"]),
		voice: z.union([
			z.string().min(1),
			z.object({ id: z.string().min(1) }).passthrough(),
		]),
	}).optional(),
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
	// Preserve current and future Anthropic-native blocks such as document,
	// thinking, redacted_thinking, search results, and server-tool results.
	z.object({ type: z.string().min(1) }).passthrough(),
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
	strict: z.boolean().optional(),
	async: z.boolean().optional(),
});

const AnthropicNativeToolSchema = z.object({
	type: z.string().min(1),
	name: z.string().optional(),
}).passthrough();

const AnthropicToolChoiceSchema = z.union([
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("any") }),
	z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("tool"), name: z.string() }),
]).and(z.object({ disable_parallel_tool_use: z.boolean().optional() }).passthrough());

export const AnthropicMessagesSchema = z.object({
    model: z.string().min(1),
    session_id: z.string().trim().min(1).max(256).optional(),
    messages: z.array(
        z.object({
            role: z.enum(["user", "assistant"]),
            content: AnthropicMessageContentSchema,
        })
    ).min(1).max(100000),
    system: z.union([z.string(), z.array(AnthropicTextContentSchema)]).optional(),
    max_tokens: z.number().int().nonnegative(),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().nonnegative().optional(),
    stream: z.boolean().optional().default(false),
    tools: z.array(z.union([
		AnthropicToolSchema,
		GatewayDatetimeToolSchema,
		GatewayWebSearchToolSchema,
		GatewayWebFetchToolSchema,
		GatewayAdvisorToolSchema,
		GatewaySubagentToolSchema,
		GatewayFusionToolSchema,
		GatewaySearchModelsToolSchema,
		GatewayImageGenerationToolSchema,
		AnthropicNativeWebSearchToolSchema,
		AnthropicNativeWebFetchToolSchema,
		AnthropicNativeAdvisorToolSchema,
		AnthropicNativeToolSchema,
	])).optional(),
    tool_choice: AnthropicToolChoiceSchema.optional(),
    metadata: z.object({
        user_id: z.string().optional(),
    }).passthrough().optional(),
    service_tier: ServiceTierSchema.optional(),
	thinking: z.discriminatedUnion("type", [
		z.object({ type: z.literal("enabled"), budget_tokens: z.number().int().min(1024) }).passthrough(),
		z.object({ type: z.literal("disabled") }).passthrough(),
		z.object({
			type: z.literal("adaptive"),
			display: z.enum(["summarized", "omitted"]).optional(),
		}).passthrough(),
	]).optional(),
	output_config: z.object({
		effort: z.enum(["low", "medium", "high", "max"]).optional(),
		format: z.object({
			type: z.literal("json_schema"),
			schema: z.record(z.string(), z.any()),
		}).nullable().optional(),
	}).passthrough().optional(),
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

const MINIMAX_IMAGE_ASPECT_RATIOS = new Set([
    "1:1",
    "16:9",
    "4:3",
    "3:2",
    "2:3",
    "3:4",
    "9:16",
    "21:9",
]);

type MiniMaxImageRequestShape = {
    model?: string;
    prompt: string;
    size?: string;
    n?: number;
    response_format?: string;
    aspect_ratio?: string;
    width?: number;
    height?: number;
    subject_reference?: Array<Record<string, unknown>>;
};

function isMiniMaxImageModel(model: string | undefined): boolean {
    const normalized = model?.trim().toLowerCase();
    return normalized === "minimax/image-01"
        || normalized === "minimax/image-01-live"
        || normalized === "image-01"
        || normalized === "image-01-live";
}

function validateMiniMaxImageRequest(
    request: MiniMaxImageRequestShape,
    ctx: z.RefinementCtx,
    options: { allowSubjectReference: boolean },
): void {
    if (!isMiniMaxImageModel(request.model)) return;

    if (request.prompt.length > 1500) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["prompt"], message: "MiniMax image prompts must be at most 1500 characters" });
    }
    if (request.n !== undefined && request.n > 9) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["n"], message: "MiniMax supports between 1 and 9 images" });
    }
    if (request.aspect_ratio !== undefined && !MINIMAX_IMAGE_ASPECT_RATIOS.has(request.aspect_ratio)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aspect_ratio"], message: "MiniMax aspect_ratio is not supported" });
    }
    if ((request.width === undefined) !== (request.height === undefined)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [request.width === undefined ? "width" : "height"],
            message: "MiniMax width and height must be provided together",
        });
    }
    for (const field of ["width", "height"] as const) {
        const value = request[field];
        if (value !== undefined && (value < 512 || value > 2048 || value % 8 !== 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `MiniMax ${field} must be an integer from 512 to 2048 divisible by 8`,
            });
        }
    }
    if (request.size !== undefined && !MINIMAX_IMAGE_ASPECT_RATIOS.has(request.size)) {
        const match = /^(\d+)x(\d+)$/i.exec(request.size);
        if (!match) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["size"], message: "MiniMax size must be a supported aspect ratio or WIDTHxHEIGHT" });
        } else {
            const [width, height] = [Number(match[1]), Number(match[2])];
            if ([width, height].some((value) => value < 512 || value > 2048 || value % 8 !== 0)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["size"],
                    message: "MiniMax size dimensions must be from 512 to 2048 and divisible by 8",
                });
            }
        }
    }
    if (request.response_format !== undefined && !["url", "base64", "b64_json"].includes(request.response_format)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["response_format"], message: "MiniMax response_format must be url or b64_json" });
    }
    if (!options.allowSubjectReference || request.subject_reference === undefined) return;
    request.subject_reference.forEach((reference, index) => {
        if (reference.type !== "character") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subject_reference", index, "type"], message: "MiniMax subject references must use type character" });
        }
        if (typeof reference.image_file !== "string" || reference.image_file.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subject_reference", index, "image_file"], message: "MiniMax subject references require a non-empty image_file" });
        }
    });
}

// Images Generation schema
export const ImagesGenerationSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().min(1),
    size: z.string().optional(),
    resolution: z.string().min(1).optional(),
    n: z.number().int().min(1).max(10).optional(),
    quality: z.string().optional(),
    stream: z.boolean().optional(),
    partial_images: z.number().int().min(0).max(3).optional(),
    response_format: z.string().optional(),
    output_format: z.enum(["png", "jpeg", "webp"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    style: z.string().optional(),
    user: z.string().optional(),
    aspect_ratio: z.string().min(1).optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    seed: z.number().int().optional(),
    prompt_optimizer: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).superRefine((request, ctx) => {
    validateMiniMaxImageRequest(request, ctx, { allowSubjectReference: false });
    const model = request.model.trim().toLowerCase().replace(/^openai\//, "");
    const isGptImage = model.startsWith("gpt-image-") || model === "chatgpt-image-latest";
    if (!isGptImage) return;

    if (request.prompt.length > 32_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["prompt"], message: "GPT Image prompts must be at most 32000 characters" });
    }
    if (request.quality && !["auto", "low", "medium", "high"].includes(request.quality)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quality"], message: "GPT Image quality must be auto, low, medium, or high" });
    }
    if (request.response_format !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["response_format"], message: "response_format is not supported by GPT Image models" });
    }
    if (request.style !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["style"], message: "style is only supported by dall-e-3" });
    }
    if (request.output_compression !== undefined && request.output_format !== "jpeg" && request.output_format !== "webp") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["output_compression"], message: "output_compression requires jpeg or webp output_format" });
    }
    if (request.background === "transparent" && request.output_format === "jpeg") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["background"], message: "transparent backgrounds require png or webp output_format" });
    }

    const isGptImage2 = /^gpt-image-2(?:$|-)/.test(model);
    if (!isGptImage2) return;
    if (!request.size || request.size === "auto") return;
    const dimensions = /^(\d+)x(\d+)$/i.exec(request.size);
    if (!dimensions) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["size"], message: "gpt-image-2 size must be auto or WIDTHxHEIGHT" });
        return;
    }
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    const pixels = width * height;
    if (width % 16 !== 0 || height % 16 !== 0 || longEdge > 3840 || longEdge / shortEdge > 3 || pixels < 655_360 || pixels > 8_294_400) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["size"],
            message: "gpt-image-2 dimensions must be multiples of 16, at most 3840px per edge, within a 3:1 ratio, and between 655360 and 8294400 pixels",
        });
    }
});
export type ImagesGenerationRequest = z.infer<typeof ImagesGenerationSchema>;

// Images Edit schema (OpenAI compatible)
const ImageEditUploadSchema = z.custom<string | Blob>(
    (value) => typeof value === "string"
        ? value.trim().length > 0
        : typeof Blob !== "undefined" && value instanceof Blob && value.size > 0,
    "Expected a non-empty image upload, URL, or base64 value",
);

const ImageEditOptionalInteger = (minimum: number, maximum: number) => z.preprocess(
    (value) => value === null || value === "" || value === undefined ? undefined : value,
    z.coerce.number().int().min(minimum).max(maximum).optional(),
);

const ImageEditOptionalBoolean = z.preprocess(
    (value) => value === null || value === "" || value === undefined
        ? undefined
        : typeof value === "string"
            ? value.toLowerCase() === "true"
                ? true
                : value.toLowerCase() === "false"
                    ? false
                    : value
            : value,
    z.boolean().optional(),
);

export const ImagesEditSchema = z.object({
    model: z.string().min(1).optional().default("openai/gpt-image-1.5"),
    image: z.union([
        ImageEditUploadSchema,
        z.array(ImageEditUploadSchema).min(1).max(16),
    ]),
    mask: ImageEditUploadSchema.optional(),
    prompt: z.string().min(1).max(32000),
    size: z.string().optional(),
    resolution: z.string().min(1).optional(),
    n: ImageEditOptionalInteger(1, 10),
    quality: z.enum(["standard", "low", "medium", "high", "auto"]).optional(),
    stream: ImageEditOptionalBoolean,
    partial_images: ImageEditOptionalInteger(0, 3),
    response_format: z.enum(["url", "b64_json"]).optional(),
    output_format: z.enum(["png", "jpeg", "webp"]).optional(),
    output_compression: ImageEditOptionalInteger(0, 100),
    moderation: z.enum(["auto", "low"]).optional(),
    input_fidelity: z.enum(["high", "low"]).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    user: z.string().optional(),
    aspect_ratio: z.string().min(1).optional(),
    width: z.preprocess(
        (value) => value === null || value === "" || value === undefined ? undefined : value,
        z.coerce.number().int().optional(),
    ),
    height: z.preprocess(
        (value) => value === null || value === "" || value === undefined ? undefined : value,
        z.coerce.number().int().optional(),
    ),
    seed: z.preprocess(
        (value) => value === null || value === "" || value === undefined ? undefined : value,
        z.coerce.number().int().optional(),
    ),
    prompt_optimizer: ImageEditOptionalBoolean,
    subject_reference: z.array(z.record(z.string(), z.unknown())).min(1).optional(),
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).superRefine((body, ctx) => {
    validateMiniMaxImageRequest(body, ctx, { allowSubjectReference: true });
    const model = body.model.split("/").pop()?.toLowerCase();
    const isDallE2 = model === "dall-e-2";
    const isGptImage = model?.startsWith("gpt-image-") || model === "chatgpt-image-latest";
    const isGrokImagineImage2 = model === "grok-imagine-image-2.0";
    if (isGrokImagineImage2) {
        const size = body.size?.toLowerCase();
        const resolution = body.resolution?.toLowerCase();
        if (size && resolution && size !== resolution) {
            ctx.addIssue({
                code: "custom",
                path: ["size"],
                message: "Grok Imagine Image 2.0 size and resolution must match when both are provided",
            });
        }
        for (const [field, value] of [["size", size], ["resolution", resolution]] as const) {
            if (value && value !== "1k" && value !== "2k") {
                ctx.addIssue({
                    code: "custom",
                    path: [field],
                    message: `Grok Imagine Image 2.0 ${field} must be 1k or 2k`,
                });
            }
        }
    }
    if (isDallE2) {
        if (body.prompt.length > 1000) {
            ctx.addIssue({
                code: "custom",
                path: ["prompt"],
                message: "dall-e-2 image edit prompts must be 1000 characters or fewer",
            });
        }
        if (Array.isArray(body.image) && body.image.length > 1) {
            ctx.addIssue({
                code: "custom",
                path: ["image"],
                message: "dall-e-2 accepts only one image per edit request",
            });
        }
        if (body.size != null && !["256x256", "512x512", "1024x1024"].includes(body.size)) {
            ctx.addIssue({
                code: "custom",
                path: ["size"],
                message: "dall-e-2 edit size must be 256x256, 512x512, or 1024x1024",
            });
        }
    }
    if (isGptImage && body.quality === "standard") {
        ctx.addIssue({
            code: "custom",
            path: ["quality"],
            message: "GPT Image quality must be low, medium, high, or auto",
        });
    }
    if (isGptImage && body.response_format != null) {
        ctx.addIssue({
            code: "custom",
            path: ["response_format"],
            message: "GPT Image models always return base64 images and do not accept response_format",
        });
    }
    if (model === "gpt-image-1-mini" && body.input_fidelity != null) {
        ctx.addIssue({
            code: "custom",
            path: ["input_fidelity"],
            message: "gpt-image-1-mini does not support input_fidelity",
        });
    }
    if (body.background === "transparent" && body.output_format === "jpeg") {
        ctx.addIssue({
            code: "custom",
            path: ["output_format"],
            message: "Transparent image output requires png or webp",
        });
    }
    if (body.output_compression != null && body.output_format !== "jpeg" && body.output_format !== "webp") {
        ctx.addIssue({
            code: "custom",
            path: ["output_compression"],
            message: "output_compression requires output_format jpeg or webp",
        });
    }
    if (body.partial_images != null && body.stream !== true) {
        ctx.addIssue({
            code: "custom",
            path: ["partial_images"],
            message: "partial_images requires stream=true",
        });
    }
});
export type ImagesEditRequest = z.infer<typeof ImagesEditSchema>;

// Moderations schema
export const ModerationsSchema = z.object({
    // OpenAI makes `model` optional and defaults it to omni-moderation-latest.
    // Use the gateway's canonical model id so omitted-model requests can still
    // pass through model discovery before the executor maps the provider slug.
    model: z.string().min(1).optional().default("openai/omni-moderation"),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
	metadata: z.record(z.string(), z.any()).nullable().optional(),
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
        ),
		z.array(z.object({
			role: z.enum(["system", "user", "assistant", "tool"]),
			content: z.any(),
		}).passthrough()),
		z.array(z.array(z.object({
			role: z.enum(["system", "user", "assistant", "tool"]),
			content: z.any(),
		}).passthrough())),
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
    max_tokens_per_doc: z.number().int().positive().optional(),
    priority: z.number().int().min(0).max(999).optional(),
    rank_fields: z.array(z.string().min(1)).optional(),
    user: z.string().optional(),
    service_tier: z.enum(["auto", "default", "over-limit", "flex", "no-limit"]).optional(),
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
    input: z.string().min(1).max(40000),
	session_id: z.string().trim().min(1).max(256).optional(),
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
    speed: z.number().min(0.25).max(4).optional(),
    instructions: z.string().max(4096).optional(),
    config: z.object({
        elevenlabs: ElevenLabsSpeechConfigSchema.optional(),
		minimax: z.record(z.string(), z.any()).optional(),
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
}).superRefine((body, ctx) => {
	const isMiniMax = body.model.toLowerCase().startsWith("minimax/");
	const isXAi = /(?:^|\/)(?:grok-tts|grok-voice)/i.test(body.model);
	const normalizedModel = body.model.toLowerCase();
	const model = normalizedModel.split(/[\/:]/).pop() ?? "";
	const compactModel = model.replace(/[._-]/g, "");
	const isElevenLabs = normalizedModel.startsWith("eleven-labs/")
		|| normalizedModel.startsWith("elevenlabs:")
		|| /^eleven(?:labs)?[-_]/.test(model);
	const elevenLabsLimit = compactModel.includes("flashv25") || compactModel.includes("turbov25")
		? 40000
		: compactModel.includes("flashv2") || compactModel.includes("turbov2")
			? 30000
			: compactModel.includes("multilingualv2")
				? 10000
				: compactModel === "elevenv3"
					? 5000
					: 10000;
	if (isElevenLabs && body.input.length > elevenLabsLimit) {
		ctx.addIssue({ code: "custom", path: ["input"], message: `Speech input must be at most ${elevenLabsLimit} characters for this ElevenLabs model` });
	} else if (!isElevenLabs && !isMiniMax && !isXAi && body.input.length > 4096) {
		ctx.addIssue({ code: "custom", path: ["input"], message: "Speech input must be at most 4096 characters for this provider" });
	}
});
export type AudioSpeechRequest = z.infer<typeof AudioSpeechSchema>;

// Audio Transcription schema
export const AudioTranscriptionSchema = z.object({
    model: z.string().min(1),
    file: UploadFileSchema.optional(),
    file_url: z.string().url().max(2083).nullable().optional(),
	s3_presigned_url: z.string().url().max(2083).nullable().optional(),
    file_id: z.string().min(1).nullable().optional(),
    language: z.string().optional(),
    languages: z.array(z.string().regex(/^[A-Za-z]{2}$/, "languages must contain ISO-639-1 codes")).min(1).optional(),
    keywords: z.array(z.string().min(1)).optional(),
    prompt: z.string().optional(),
    temperature: z.coerce.number().optional(),
    response_format: z.enum(["json", "text", "srt", "verbose_json", "vtt", "diarized_json"]).optional(),
    stream: z.preprocess(
        (value) => typeof value === "string"
            ? value.toLowerCase() === "true"
                ? true
                : value.toLowerCase() === "false"
                    ? false
                    : value
            : value,
        z.boolean().nullable().optional(),
    ),
    timestamp_granularities: z.array(z.enum(["word", "segment"])).optional(),
    diarize: z.preprocess(
        (value) => typeof value === "string"
            ? value.toLowerCase() === "true"
                ? true
                : value.toLowerCase() === "false"
                    ? false
                    : value
            : value,
        z.boolean().optional(),
    ),
	enable_diarization: z.preprocess(
		(value) => typeof value === "string"
			? value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : value
			: value,
		z.boolean().optional(),
	),
	output_content: z.string().optional(),
	session_id: z.string().trim().min(1).max(256).optional(),
    context_bias: z.array(z.string().min(1).regex(/^[^,\s]+$/, "context_bias entries cannot contain commas or whitespace")).max(100).optional(),
    include: z.array(z.string()).optional(),
    chunking_strategy: z.union([
        z.literal("auto"),
        z.object({
            type: z.literal("server_vad"),
            prefix_padding_ms: z.number().int().nonnegative().optional(),
            silence_duration_ms: z.number().int().nonnegative().optional(),
            threshold: z.number().min(0).max(1).optional(),
        }),
    ]).optional(),
    known_speaker_names: z.array(z.string().min(1)).max(4).optional(),
    known_speaker_references: z.array(z.string().min(1)).max(4).optional(),
	config: z.object({
		elevenlabs: z.record(z.string(), z.any()).optional(),
	}).passthrough().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).superRefine((body, ctx) => {
    const model = body.model.split("/").pop()?.toLowerCase() ?? "";
    const isMistralTranscription = body.model.toLowerCase().startsWith("mistral/") || model.startsWith("voxtral-");
    const isGptTranscribe = model === "gpt-transcribe";
    const isDiarize = model === "gpt-4o-transcribe-diarize";
    const isMorpheusTranscription = body.model.toLowerCase().startsWith("morpheus/");
	const isXAiTranscription = model === "grok-transcribe";
	const isMetaTranscription = model === "muse-voice-transcribe-1.0";
	const isElevenLabsTranscription = body.model.toLowerCase().startsWith("eleven-labs/") || model.startsWith("scribe-");
    const sources = [body.file, body.file_url, body.s3_presigned_url, body.file_id].filter(Boolean);
    if (isMistralTranscription && sources.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["file"], message: "Mistral transcription requires exactly one of file, file_url, or file_id" });
	} else if (isElevenLabsTranscription && sources.length !== 1) {
		ctx.addIssue({ code: "custom", path: ["file"], message: "ElevenLabs transcription requires exactly one of file, file_url, or s3_presigned_url" });
	} else if (!isMistralTranscription && !isMorpheusTranscription && !isElevenLabsTranscription && !body.file) {
        ctx.addIssue({ code: "custom", path: ["file"], message: "file is required" });
	} else if (isMorpheusTranscription && sources.length !== 1) {
		ctx.addIssue({ code: "custom", path: ["file"], message: "Morpheus transcription requires exactly one of file, file_url, or s3_presigned_url" });
    }
	const isOvhWhisper = model === "whisper-large-v3" || model === "whisper-large-v3-turbo";
	const maxFileBytes = isElevenLabsTranscription ? 5 * 1024 * 1024 * 1024 : isXAiTranscription ? 500 * 1024 * 1024 : isMetaTranscription ? 32 * 1024 * 1024 : isOvhWhisper ? 2048 * 1024 * 1024 : 25 * 1024 * 1024;
    if (!isMistralTranscription && body.file && body.file.size > maxFileBytes) {
		ctx.addIssue({ code: "custom", path: ["file"], message: `Transcription files must be ${isElevenLabsTranscription ? "5 GB" : isXAiTranscription ? "500 MB" : isMetaTranscription ? "32 MB" : isOvhWhisper ? "2048 MB" : "25 MB"} or smaller` });
    }
    const file = body.file;
    const filename = file && typeof File !== "undefined" && file instanceof File ? file.name.toLowerCase() : "";
    const extension = filename.includes(".") ? filename.split(".").pop() : "";
    const supportedExtensions = new Set(["aac", "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "opus", "wav", "webm"]);
    const mimeType = file?.type.toLowerCase() ?? "";
    const hasSupportedMime = mimeType.startsWith("audio/") || mimeType === "video/mp4" || mimeType === "video/webm";
    if (file && (!extension || !supportedExtensions.has(extension)) && !hasSupportedMime) {
        ctx.addIssue({ code: "custom", path: ["file"], message: "Unsupported transcription file format" });
    }
    if (isMistralTranscription && body.language && (body.timestamp_granularities?.length ?? 0) > 0) {
        ctx.addIssue({ code: "custom", path: ["timestamp_granularities"], message: "Mistral timestamp_granularities cannot be combined with language" });
    }
    if (isMistralTranscription && body.language && !/^\w{2}$/.test(body.language)) {
        ctx.addIssue({ code: "custom", path: ["language"], message: "Mistral language must be a two-character code" });
    }
	if (!isMistralTranscription && ((body.temperature ?? 0) < 0 || (body.temperature ?? 0) > (isElevenLabsTranscription ? 2 : 1))) {
		ctx.addIssue({ code: "custom", path: ["temperature"], message: `temperature must be between 0 and ${isElevenLabsTranscription ? 2 : 1}` });
    }
    if (body.languages && !isGptTranscribe) {
        ctx.addIssue({ code: "custom", path: ["languages"], message: "languages is only supported by gpt-transcribe" });
    }
	if (body.keywords && !isGptTranscribe && !isXAiTranscription && !isElevenLabsTranscription && !isMetaTranscription) {
        ctx.addIssue({ code: "custom", path: ["keywords"], message: "keywords is only supported by gpt-transcribe" });
    }
    if (body.language && body.languages) {
        ctx.addIssue({ code: "custom", path: ["languages"], message: "Send either language or languages, not both" });
    }
	for (const [index, keyword] of (body.keywords ?? []).entries()) {
        if (/[<>\r\n]/.test(keyword)) {
            ctx.addIssue({ code: "custom", path: ["keywords", index], message: "keywords cannot contain angle brackets or line breaks" });
        }
    }
	if (isElevenLabsTranscription && (body.keywords?.length ?? 0) > 1000) {
		ctx.addIssue({ code: "custom", path: ["keywords"], message: "ElevenLabs supports at most 1000 keyterms" });
	}
	for (const [index, keyword] of (isElevenLabsTranscription ? body.keywords ?? [] : []).entries()) {
		if (keyword.length >= 50 || keyword.trim().split(/\s+/).length > 5 || /[<>{}\[\]\\]/.test(keyword)) {
			ctx.addIssue({ code: "custom", path: ["keywords", index], message: "ElevenLabs keyterms must be under 50 characters, at most 5 words, and exclude angle/square/curly brackets and backslashes" });
		}
	}
    if ((body.known_speaker_names || body.known_speaker_references) && !isDiarize) {
        ctx.addIssue({ code: "custom", path: ["known_speaker_names"], message: "Known speakers are only supported by gpt-4o-transcribe-diarize" });
    }
    if ((body.known_speaker_names?.length ?? 0) !== (body.known_speaker_references?.length ?? 0)) {
        ctx.addIssue({ code: "custom", path: ["known_speaker_references"], message: "Known speaker names and references must have matching lengths" });
    }
    for (const [index, reference] of (body.known_speaker_references ?? []).entries()) {
        if (!/^data:(?:audio|video)\/[a-z0-9.+-]+;base64,/i.test(reference)) {
            ctx.addIssue({ code: "custom", path: ["known_speaker_references", index], message: "Known speaker references must be base64 data URLs" });
        }
    }
});
export type AudioTranscriptionRequest = z.infer<typeof AudioTranscriptionSchema>;

// Audio Translation schema
const OPENAI_TRANSLATION_MAX_FILE_BYTES = 25 * 1024 * 1024;
const OPENAI_TRANSLATION_EXTENSIONS = new Set([
    "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);
const OPENAI_TRANSLATION_MIME_TYPES = new Set([
    "audio/flac", "audio/mpeg", "audio/mp4", "video/mp4", "audio/mpga",
    "audio/x-m4a", "audio/m4a", "audio/ogg", "application/ogg",
    "audio/wav", "audio/x-wav", "audio/webm", "video/webm",
]);

function hasSupportedOpenAITranslationFormat(file: File | Blob): boolean {
    const filename = typeof File !== "undefined" && file instanceof File ? file.name : "";
    const extension = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : undefined;
    const mimeType = typeof file.type === "string" ? file.type.toLowerCase().split(";", 1)[0] : "";
    return Boolean(
        (extension && OPENAI_TRANSLATION_EXTENSIONS.has(extension)) ||
        (mimeType && OPENAI_TRANSLATION_MIME_TYPES.has(mimeType))
    );
}

export const AudioTranslationSchema = z.object({
    model: z.string().min(1),
    file: UploadFileSchema
        .refine((file) => file.size <= OPENAI_TRANSLATION_MAX_FILE_BYTES, {
            message: "audio translation files must be 25 MB or smaller",
        })
        .refine(hasSupportedOpenAITranslationFormat, {
            message: "audio translation file must be flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm",
        }),
    language: z.string().optional(),
    prompt: z.string().optional(),
    temperature: z.coerce.number().min(0).max(1).optional(),
    response_format: z.enum(["json", "text", "srt", "verbose_json", "vtt"]).optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
});
export type AudioTranslationRequest = z.infer<typeof AudioTranslationSchema>;

const VideoReferenceTypeSchema = z.enum(["asset", "style", "character", "location", "generic"]).or(z.string());
const VideoInputReferenceRoleSchema = z.enum(["first_frame", "last_frame", "reference", "source", "mask"]);

const VideoImageInputReferenceSchema = z.object({
	type: z.literal("image_url"),
	role: VideoInputReferenceRoleSchema.optional(),
	reference_type: VideoReferenceTypeSchema.optional(),
	image_url: z.object({
		url: z.string().url().refine((value) => new URL(value).protocol === "https:", {
			message: "video input references must use https",
		}),
	}),
}).strict();

const VideoMediaInputReferenceSchema = z.object({
	type: z.enum(["video_url", "audio_url"]),
	role: VideoInputReferenceRoleSchema.optional(),
	reference_type: VideoReferenceTypeSchema.optional(),
	media_url: z.object({
		url: z.string().url().refine((value) => new URL(value).protocol === "https:", {
			message: "video input references must use https",
		}),
	}),
}).strict();

const VideoInputReferenceSchema = z.union([VideoImageInputReferenceSchema, VideoMediaInputReferenceSchema]);
const VideoFrameImageSchema = VideoImageInputReferenceSchema.omit({ role: true, reference_type: true }).extend({
	frame_type: z.enum(["first_frame", "last_frame"]),
});

const VideoOutputConfigSchema = z.object({
	access: z.enum(["bytes", "signed_url", "both"]).default("both"),
}).default({ access: "both" });

const VideoWebhookSchema = z.object({
	endpoint_id: z.string().min(1),
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

const VIDEO_PROVIDER_CONTROLLED_KEYS = new Set([
	"imageurl", "imageurls", "videourl", "videourls", "audiourl", "audiourls",
	"imageuri", "videouri", "audiouri", "endimageurl", "firstframeimage", "lastframeimage",
	"firstframe", "lastframe", "referenceimage", "referencevideo", "referenceaudio",
	"inputimage", "inputvideo", "inputaudio", "inputreference", "inputreferences",
	"promptimage", "promptvideo", "frameimages", "quality", "n", "numvideos", "numframes",
	"inputresolution", "inputvideoseconds", "inputaudioseconds", "inputimagecount", "inputvideocount",
	"totaltokens",
	"generate_audio",
	"generateaudio",
	"audio",
	"reference_images",
	"referenceimages",
	"reference_videos",
	"referencevideos",
	"reference_audios",
	"referenceaudios",
	"image",
	"video",
	"input_image",
	"input_video",
	"last_image",
	"last_frame",
	"request",
	"model",
	"prompt",
	"input",
	"content",
	"duration",
	"duration_seconds",
	"durationseconds",
	"input_video_duration",
	"inputvideoduration",
	"input_video_duration_seconds",
	"inputvideodurationseconds",
	"input_audio_duration",
	"inputaudioduration",
	"seconds",
	"size",
	"resolution",
	"aspect_ratio",
	"aspectratio",
	"ratio",
	"sample_count",
	"samplecount",
	"number_of_videos",
	"numberofvideos",
	"callback_url",
	"callbackurl",
]);

function rejectVideoProviderControlledFields(
	value: unknown,
	ctx: z.RefinementCtx,
	path: Array<string | number> = [],
): void {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		value.forEach((entry, index) => rejectVideoProviderControlledFields(entry, ctx, [...path, index]));
		return;
	}
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
		if (VIDEO_PROVIDER_CONTROLLED_KEYS.has(key.toLowerCase()) || VIDEO_PROVIDER_CONTROLLED_KEYS.has(normalizedKey)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [...path, key],
				message: `${key} must be supplied through a validated top-level video field`,
			});
			continue;
		}
		rejectVideoProviderControlledFields(entry, ctx, [...path, key]);
	}
}

const VideoProviderParamsSchema = z.record(z.string(), z.any()).superRefine((value, ctx) => {
	rejectVideoProviderControlledFields(value, ctx);
});

// Video Generation schema
export const VideoGenerationSchema = z.object({
	model: z.string().min(1).default("sora-2"),
	prompt: z.string().max(32_000).default(""),
	seconds: z.enum(["4", "8", "12", "16", "20"]).optional(),
	input_reference: z.union([
		z.custom<Blob>((value) => typeof Blob !== "undefined" && value instanceof Blob),
		z.object({
			file_id: z.string().min(1).optional(),
			// A 20 MB image expands to roughly 26.7 MB when represented as a base64 data URL.
			image_url: z.string().min(1).max(28_000_000).optional(),
		}).strict().superRefine((value, ctx) => {
			if ((value.file_id ? 1 : 0) + (value.image_url ? 1 : 0) !== 1) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of file_id or image_url" });
			}
		}),
	]).optional(),
	duration: z.number().int().positive().max(120).optional(),
	input_video_duration: z.number().positive().max(3600).optional(),
	input_audio_duration: z.number().min(2).max(20).optional(),
	size: z.string().min(1).optional(),
	resolution: z.string().min(1).optional(),
	aspect_ratio: z.string().min(1).optional(),
	seed: z.number().int().optional(),
	sample_count: z.number().int().min(1).max(4).optional(),
	negative_prompt: z.string().optional(),
	generate_audio: z.boolean().optional(),
	enhance_prompt: z.boolean().optional(),
	compression_quality: z.number().int().min(0).max(100).optional(),
	person_generation: z.string().optional(),
	resize_mode: z.string().optional(),
	input_references: z.array(VideoInputReferenceSchema).optional(),
	frame_images: z.array(VideoFrameImageSchema).min(1).max(2).optional(),
	provider_params: VideoProviderParamsSchema.optional(),
	provider_options: z.record(z.string(), VideoProviderParamsSchema).optional(),
	output: VideoOutputConfigSchema.optional(),
	webhook: VideoWebhookSchema.optional(),
	echo_upstream_request: z.boolean().optional(),
	debug: DebugOptionsSchema,
	beta: BetaOptionsSchema,
	provider: ProviderRoutingSchema,
	routing: ProviderRoutingSchema,
}).strict().superRefine((obj, ctx) => {
	if (obj.provider_params && obj.provider_options) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provider_options"], message: "Use provider_options or provider_params, not both" });
	}
	if (obj.seconds !== undefined && obj.duration !== undefined && Number(obj.seconds) !== obj.duration) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["duration"], message: "duration must match seconds when both are supplied" });
	}
	if (obj.frame_images) {
		const roles = obj.frame_images.map((frame) => frame.frame_type);
		if (new Set(roles).size !== roles.length || obj.input_reference != null || obj.input_references?.some((reference) => reference.role === "first_frame" || reference.role === "last_frame")) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frame_images"], message: "Supply each frame once using frame_images or input references" });
		}
	}
	const hasImageInput = obj.input_reference != null || obj.frame_images?.length || obj.input_references?.some((reference) => reference.type === "image_url");
	if (!obj.prompt.trim() && !hasImageInput) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "prompt is required unless an image input reference is provided",
			path: ["prompt"],
		});
	}
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
const MistralOcrAnnotationFormatSchema = z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        schema: z.record(z.string(), z.any()),
        strict: z.boolean().optional(),
    }).strict(),
}).strict();

const MistralOcrDocumentSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("file"),
        file_id: z.string().uuid(),
    }).strict(),
    z.object({
        type: z.literal("document_url"),
        document_url: z.string().min(1),
        document_name: z.string().nullable().optional(),
    }).strict(),
    z.object({
        type: z.literal("image_url"),
        image_url: z.union([
            z.string().min(1),
            z.object({
                url: z.string().min(1),
                detail: z.enum(["auto", "low", "high"]).nullable().optional(),
            }).strict(),
        ]),
    }).strict(),
]);

export const OcrSchema = z.object({
    model: z.string().min(1),
    // Legacy shorthand retained for compatibility; `document` mirrors Mistral's native API.
    image: z.string().min(1).optional(),
    document: MistralOcrDocumentSchema.optional(),
    pages: z.union([z.string().min(1), z.array(z.number().int().nonnegative())]).nullable().optional(),
    include_image_base64: z.boolean().nullable().optional(),
    image_limit: z.number().int().nonnegative().nullable().optional(),
    image_min_size: z.number().int().nonnegative().nullable().optional(),
    bbox_annotation_format: MistralOcrAnnotationFormatSchema.nullable().optional(),
    document_annotation_format: MistralOcrAnnotationFormatSchema.nullable().optional(),
    document_annotation_prompt: z.string().nullable().optional(),
    table_format: z.enum(["markdown", "html"]).nullable().optional(),
    extract_header: z.boolean().optional(),
    extract_footer: z.boolean().optional(),
    include_blocks: z.boolean().optional(),
    confidence_scores_granularity: z.enum(["word", "page"]).nullable().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).superRefine((request, ctx) => {
    if ((request.image ? 1 : 0) + (request.document ? 1 : 0) !== 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["document"],
            message: "Exactly one of image or document is required",
        });
    }
    if (request.document_annotation_prompt != null && request.document_annotation_format == null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["document_annotation_prompt"],
            message: "document_annotation_prompt requires document_annotation_format",
        });
    }
});
export type OcrRequest = z.infer<typeof OcrSchema>;

const ParseImageUrlSchema = z.string().min(1).refine(
    (value) => /^https?:\/\//.test(value) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value),
    { message: "image_url must be an http(s) URL or a base64 image data URI" },
);

export const ParseSchema = z.object({
    model: z.string().min(1),
    document: z.object({
        type: z.literal("image_url"),
        image_url: ParseImageUrlSchema,
    }).strict(),
    output_format: z.enum(["markdown", "blocks"]).optional().default("markdown"),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    beta: BetaOptionsSchema,
    provider: ProviderRoutingSchema,
    routing: ProviderRoutingSchema,
}).strict();
export type ParseRequest = z.infer<typeof ParseSchema>;

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
        prompt: z.string().max(2000).optional(),
        lyrics: z.string().max(3500).optional(),
        stream: z.boolean().optional(),
        output_format: z.enum(["url", "hex"]).optional(),
        lyrics_optimizer: z.boolean().optional(),
        is_instrumental: z.boolean().optional(),
        audio_url: z.string().url().optional(),
        audio_base64: z.string().min(1).optional(),
        cover_feature_id: z.string().min(1).optional(),
        audio_setting: z.object({
            sample_rate: z.union([z.literal(16000), z.literal(24000), z.literal(32000), z.literal(44100)]).optional(),
            bitrate: z.union([z.literal(32000), z.literal(64000), z.literal(128000), z.literal(256000)]).optional(),
            format: z.enum(["mp3", "wav", "pcm"]).optional(),
        }).strict().optional(),
    }).strict().optional(),
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
        case "parse": return ParseSchema;
        case "music.generate": return MusicGenerateSchema;
        case "files.upload":
        case "files.list":
        case "files.retrieve":
            return null; // No schema for files endpoints
        default:
            return null;
    }
}
