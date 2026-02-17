// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

import { z } from "zod";
import type { Endpoint } from "./types";

const ProviderRoutingSchema = z.object({
    // Existing gateway routing hints
    order: z.array(z.string()).optional(),
    only: z.array(z.string()).optional(),
    ignore: z.array(z.string()).optional(),
    include_alpha: z.boolean().optional(),
    includeAlpha: z.boolean().optional(),
    // OpenRouter-compatible provider routing fields
    allow_fallbacks: z.boolean().nullable().optional(),
    allowFallbacks: z.boolean().nullable().optional(),
    require_parameters: z.boolean().nullable().optional(),
    requireParameters: z.boolean().nullable().optional(),
    data_collection: z.enum(["allow", "deny"]).nullable().optional(),
    dataCollection: z.enum(["allow", "deny"]).nullable().optional(),
    zdr: z.boolean().nullable().optional(),
    enforce_distillable_text: z.boolean().nullable().optional(),
    enforceDistillableText: z.boolean().nullable().optional(),
    quantizations: z.array(z.string()).nullable().optional(),
    sort: z.union([z.string(), z.record(z.any())]).nullable().optional(),
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
    preferred_min_throughput: z.union([z.number(), z.record(z.number())]).optional(),
    preferredMinThroughput: z.union([z.number(), z.record(z.number())]).optional(),
    preferred_max_latency: z.union([z.number(), z.record(z.number())]).optional(),
    preferredMaxLatency: z.union([z.number(), z.record(z.number())]).optional(),
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

const ImageConfigSchema = z.object({
    aspect_ratio: z.string().optional(),
    image_size: z.enum(["1K", "2K", "4K"]).optional(),
    font_inputs: z.array(
        z.object({
            font_url: z.string().url(),
            text: z.string(),
        }),
    ).optional(),
    super_resolution_references: z.array(z.string()).optional(),
}).catchall(
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.any()),
        z.record(z.any()),
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

function isFileLike(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { arrayBuffer?: unknown; stream?: unknown };
    return typeof candidate.arrayBuffer === "function" && typeof candidate.stream === "function";
}

const UploadFileSchema = z.custom<File | Blob>(isFileLike, {
    message: "file is required",
});

function hasToolsInRequestShape(body: Record<string, any>): boolean {
    if (Array.isArray(body.tools) && body.tools.length > 0) return true;

    if (Array.isArray(body.messages)) {
        for (const msg of body.messages) {
            if (!msg || typeof msg !== "object") continue;
            if (msg.role === "tool") return true;
            if (Array.isArray((msg as any).tool_calls) && (msg as any).tool_calls.length > 0) return true;
            if (typeof (msg as any).tool_call_id === "string" && (msg as any).tool_call_id.length > 0) return true;
        }
    }

    const inputItems = Array.isArray(body.input_items)
        ? body.input_items
        : (Array.isArray(body.input) ? body.input : []);
    for (const item of inputItems) {
        if (!item || typeof item !== "object") continue;
        const type = typeof (item as any).type === "string" ? (item as any).type : "";
        if (type === "function_call" || type === "function_call_output" || type === "tool_call") {
            return true;
        }
        if (Array.isArray((item as any).tool_calls) && (item as any).tool_calls.length > 0) return true;
        if (typeof (item as any).tool_call_id === "string" && (item as any).tool_call_id.length > 0) return true;
        if (typeof (item as any).call_id === "string" && (item as any).call_id.length > 0) return true;
    }

    return false;
}

// Batch schema
export const BatchSchema = z.object({
    input_file_id: z.string().min(1),
    endpoint: z.string().min(1),
    completion_window: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
});
export type BatchRequest = z.infer<typeof BatchSchema>;

// Responses schema (OAI Responses API)
export const ResponsesSchema = z.object({
    model: z.string().min(1),
    models: z.array(z.string()).optional(),
    input: z.any().optional(),
    input_items: z.array(z.any()).optional(),
    conversation: z.union([z.string(), z.record(z.any())]).optional(),
    include: z.array(z.string()).optional(),
    instructions: z.union([z.string(), z.array(z.any()), z.record(z.any())]).optional(),
    max_output_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    max_tool_calls: z.number().int().nonnegative().optional(),
    max_tools_calls: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string()).optional(),
    parallel_tool_calls: z.boolean().optional(),
    plugins: z.array(z.record(z.any())).optional(),
    session_id: z.string().max(128).optional(),
    trace: z.record(z.any()).optional(),
    previous_response_id: z.string().optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    prompt: z.object({
        id: z.string(),
        variables: z.record(z.any()).optional(),
        version: z.string().optional(),
    }).optional(),
    prompt_cache_key: z.string().nullable().optional(),
    prompt_cache_retention: z.string().optional(),
    modalities: z.array(z.enum(["text", "image"])).optional(),
    image_config: ImageConfigSchema,
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).nullable().optional(),
        summary: z.string().nullable().optional(),
        enabled: z.boolean().nullable().optional(),
        max_tokens: z.number().int().nonnegative().nullable().optional(),
    }).optional(),
    safety_identifier: z.string().nullable().optional(),
    service_tier: z.string().optional(),
    speed: z.string().optional(),
    store: z.boolean().optional(),
    stream: z.boolean().optional(),
    stream_options: z.record(z.any()).optional(),
    n: z.never().optional(),
    temperature: z.number().min(0).max(2).optional(),
    text: z.record(z.any()).optional(),
    response_format: ResponseFormatSchema.optional(),
    tool_choice: z.union([z.string(), z.record(z.any())]).optional(),
    tools: z.array(z.record(z.any())).optional(),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    top_p: z.number().min(0).max(1).optional(),
    truncation: z.string().optional(),
    background: z.boolean().optional(),
    user: z.string().optional(),
    // Gateway-only flags (not forwarded upstream)
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
}).passthrough().superRefine((obj, ctx) => {
    if (obj.stream === true && hasToolsInRequestShape(obj as Record<string, any>)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stream"],
            message: "Streaming with tools is not supported. Set stream to false when tools are present.",
        });
    }
}).transform((obj) => {
    const next: any = { ...obj };
    if (next.max_output_tokens == null && next.max_completion_tokens != null) {
        next.max_output_tokens = next.max_completion_tokens;
    }
    if (next.max_tool_calls == null && next.max_tools_calls != null) {
        next.max_tool_calls = next.max_tools_calls;
    }
    delete next.max_tools_calls;
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
const EmbeddingOptionsSchema = z.object({
    google: z.object({
        output_dimensionality: z.number().int().positive().optional(),
        task_type: z.enum(["TASK_TYPE_UNSPECIFIED", "RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT", "SEMANTIC_SIMILARITY", "CLASSIFICATION"]).optional(),
        title: z.string().optional(),
    }).optional(),
    mistral: z.object({
        output_dimension: z.number().int().positive().optional(),
        output_dtype: z.enum(["float", "int8", "uint8", "binary", "ubinary"]).optional(),
    }).optional(),
}).optional();

export const EmbeddingsSchema = z.object({
    model: z.string().min(1),
    input: z.union([
        z.string(),
        z.array(z.string())
    ]).optional(),
    inputs: z.union([
        z.string(),
        z.array(z.string())
    ]).optional(),
    encoding_format: z.string().optional(),
    dimensions: z.number().int().positive().optional(),
    embedding_options: EmbeddingOptionsSchema,
    user: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
}).refine((obj) => obj.input != null || obj.inputs != null, {
    message: "input or inputs is required",
    path: ["input"],
}).transform((obj) => {
    const next: any = { ...obj };
    if (next.input == null && next.inputs != null) {
        next.input = next.inputs;
    }
    delete next.inputs;
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
        url: z.string().url(),
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

export const ChatCompletionsSchema = z.object({
    model: z.string().min(1),
    system: z.string().optional(),
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
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional().default("medium"),
        summary: z.enum(["auto", "concise", "detailed"]).optional().default("auto"),
        enabled: z.boolean().optional(),
        max_tokens: z.number().int().nonnegative().optional(),
    }).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    logit_bias: z.record(z.number()).optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    metadata: z.record(z.string()).optional(),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    presence_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().min(-9223372036854776000).max(9223372036854776000).optional(),
    stream: z.boolean().optional().default(false),
    stream_options: z.record(z.any()).optional(),
    n: z.never().optional(),
    temperature: z.number().min(0).max(2).optional().default(1),

    // Tools
    tools: z.array(z.object({
        type: z.literal("function"),
        function: z.object({
            name: z.string(),
            description: z.string().optional(),
            parameters: z.any(),
        }),
    })).optional(),

    max_tool_calls: z.number().int().positive().optional(),
    parallel_tool_calls: z.boolean().optional().default(true),
    tool_choice: z.union([z.string(), z.record(z.any())]).optional(),

    top_k: z.number().int().positive().optional(),
    logprobs: z.boolean().optional().default(false),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    top_p: z.number().min(0).max(1).optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    response_format: ResponseFormatSchema.optional(),
    modalities: z.array(z.enum(["text", "image"])).optional(),
    image_config: ImageConfigSchema,
    // This is used as the safety identifer/userid across providers
    user_id: z.string().optional(),
    user: z.string().optional(),

    service_tier: z.enum(["auto", "default", "flex", "standard", "priority"]).optional(),
    speed: z.string().optional(),
    route: z.union([z.string(), z.null()]).optional(),
    session_id: z.string().max(128).optional(),
    trace: z.record(z.any()).optional(),
    models: z.array(z.string()).optional(),
    plugins: z.array(z.record(z.any())).optional(),
    provider: ProviderRoutingSchema,
}).passthrough().superRefine((obj, ctx) => {
    if (obj.stream === true && hasToolsInRequestShape(obj as Record<string, any>)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stream"],
            message: "Streaming with tools is not supported. Set stream to false when tools are present.",
        });
    }
}).transform((obj) => {
    return obj;
});

export type ChatCompletionsRequest = z.infer<typeof ChatCompletionsSchema>;

// Anthropic Messages schema
const AnthropicTextContentSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const AnthropicImageContentSchema = z.object({
    type: z.literal("image"),
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
    input: z.record(z.any()),
});

const AnthropicToolResultContentSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.any())]),
});

const AnthropicContentBlockSchema = z.union([
    AnthropicTextContentSchema,
    AnthropicImageContentSchema,
    AnthropicToolUseContentSchema,
    AnthropicToolResultContentSchema,
]);

const AnthropicMessageContentSchema = z.union([
    z.string(),
    z.array(AnthropicContentBlockSchema),
]);

const AnthropicToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.any()),
});

const AnthropicToolChoiceSchema = z.union([
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("any") }),
    z.object({ type: z.literal("tool"), name: z.string() }),
]);

export const AnthropicMessagesSchema = z.object({
    model: z.string().min(1),
    messages: z.array(
        z.object({
            role: z.enum(["user", "assistant"]),
            content: AnthropicMessageContentSchema,
        })
    ).min(1),
    system: z.union([z.string(), z.array(AnthropicContentBlockSchema)]).optional(),
    max_tokens: z.number().int().positive().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    stream: z.boolean().optional().default(false),
    n: z.never().optional(),
    tools: z.array(AnthropicToolSchema).optional(),
    tool_choice: AnthropicToolChoiceSchema.optional(),
    metadata: z.record(z.any()).optional(),
    service_tier: z.string().optional(),
    speed: z.string().optional(),
    thinking: z.object({
        type: z.enum(["enabled", "disabled", "adaptive"]),
        budget_tokens: z.number().int().nonnegative().optional(),
        effort: z.enum(["low", "medium", "high", "max", "xhigh"]).optional(),
    }).optional(),
    output_config: z.object({
        effort: z.enum(["low", "medium", "high", "max", "xhigh"]).optional(),
    }).optional(),
    reasoning: z.object({
        effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
    }).optional(),
    modalities: z.array(z.enum(["text", "image"])).optional(),
    image_config: ImageConfigSchema,
    stop_sequences: z.array(z.string()).optional(),
    // Gateway-only flags (not forwarded upstream)
    meta: z.boolean().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
}).passthrough()
    .refine((obj) => obj.max_tokens != null || obj.max_output_tokens != null, {
        message: "max_tokens or max_output_tokens is required",
        path: ["max_tokens"],
    })
    .transform((obj) => {
        const next: any = { ...obj };
        if (next.max_tokens == null && next.max_output_tokens != null) {
            next.max_tokens = next.max_output_tokens;
        }
        return next;
    });

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
    provider: ProviderRoutingSchema,
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
    provider: ProviderRoutingSchema,
});
export type ImagesEditRequest = z.infer<typeof ImagesEditSchema>;

// Moderations schema
export const ModerationsSchema = z.object({
    model: z.string().min(1),
    meta: z.boolean().optional().default(false),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
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

// Audio Speech schema
export const AudioSpeechSchema = z.object({
    model: z.string().min(1),
    input: z.string().min(1),
    voice: z.string().optional(),
    format: z.enum(["mp3", "wav", "ogg", "aac", "flac", "opus", "pcm"]).optional(),
    response_format: z.enum(["mp3", "wav", "aac", "flac", "opus", "pcm"]).optional(),
    stream_format: z.enum(["audio", "sse"]).optional(),
    speed: z.number().positive().optional(),
    instructions: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
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
    provider: ProviderRoutingSchema,
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
    provider: ProviderRoutingSchema,
});
export type AudioTranslationRequest = z.infer<typeof AudioTranslationSchema>;

const VideoInputSourceSchema = z.union([
    z.string().min(1),
    z.record(z.any()),
]);

const VideoReferenceImageSchema = z.object({
    reference_type: z.string().optional(),
    referenceType: z.string().optional(),
    image: VideoInputSourceSchema.optional(),
    uri: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    mime_type: z.string().optional(),
    mimeType: z.string().optional(),
}).passthrough();

// Video Generation schema
export const VideoGenerationSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().min(1),
    // OpenAI Sora fields
    seconds: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    size: z.string().optional(),
    quality: z.string().optional(),
    input_reference: z.string().optional(),
    input_reference_mime_type: z.string().optional(),
    input: z.object({
        image: VideoInputSourceSchema.optional(),
        video: VideoInputSourceSchema.optional(),
        last_frame: VideoInputSourceSchema.optional(),
        reference_images: z.array(VideoReferenceImageSchema).optional(),
    }).passthrough().optional(),
    input_image: VideoInputSourceSchema.optional(),
    input_video: VideoInputSourceSchema.optional(),
    last_frame: VideoInputSourceSchema.optional(),
    input_last_frame: VideoInputSourceSchema.optional(),
    reference_images: z.array(VideoReferenceImageSchema).optional(),

    // Gateway-friendly aliases (mapped in adapters)
    duration: z.number().int().min(1).max(120).optional(),
    duration_seconds: z.number().int().positive().optional(),
    ratio: z.string().optional(),
    aspect_ratio: z.string().optional(),

    // Veo/Gemini options
    resolution: z.string().optional(),
    negative_prompt: z.string().optional(),
    sample_count: z.number().int().positive().optional(),
    number_of_videos: z.number().int().positive().optional(),
    seed: z.number().int().optional(),
    person_generation: z.string().optional(),
    generate_audio: z.boolean().optional(),
    enhance_prompt: z.boolean().optional(),
    output_storage_uri: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
});
export type VideoGenerationRequest = z.infer<typeof VideoGenerationSchema>;

// OCR schema
export const OcrSchema = z.object({
    model: z.string().min(1),
    image: z.string().min(1), // URL or base64
    language: z.string().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
    provider: ProviderRoutingSchema,
});
export type OcrRequest = z.infer<typeof OcrSchema>;

// Music Generate schema
export const MusicGenerateSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().optional(),
    duration: z.number().int().positive().optional(),
    format: z.enum(["mp3", "wav", "ogg", "aac"]).optional(),
    provider: ProviderRoutingSchema,
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
        request: z.record(z.any()).optional(),
    }).passthrough().optional(),
    echo_upstream_request: z.boolean().optional(),
    debug: DebugOptionsSchema,
});
export type MusicGenerateRequest = z.infer<typeof MusicGenerateSchema>;

// Generation response schema
export const GenerationResponseSchema = z.object({
    request_id: z.string(),
    team_id: z.string(),
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

