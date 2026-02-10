// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

export type Endpoint =
    | "chat.completions"
    | "responses"
    | "messages"
    | "images.generations"
    | "images.edits"
    | "audio.speech"
    | "audio.transcription"
    | "audio.translations"
    | "moderations"
    | "video.generation"
    | "embeddings"
    | "batch"
    | "ocr"
    | "music.generate"
    | "files.upload"
    | "files.list"
    | "files.retrieve";

export type RequestMeta = {
    apiKeyId: string;             // Internal UUID for the gateway key
    apiKeyRef: string;            // Human-readable reference, e.g. kid_xxx
    apiKeyKid: string;            // Raw kid from token
    referer?: string | null;
    appTitle?: string | null;
    requestMethod?: string | null;
    requestUrl?: string | null;
    requestPath?: string | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    requestId: string;
    stream?: boolean;
    debug?: DebugOptions;
    echoUpstreamRequest?: boolean;
    returnUpstreamRequest?: boolean;
    returnUpstreamResponse?: boolean;
    startedAtMs?: number;
    upstreamStartMs?: number;
    keySource?: "gateway" | "byok";
    byokKeyId?: string | null;
    // Performance metrics
    throughput_tps?: number;      // Tokens per second
    generation_ms?: number;       // Provider processing time
    latency_ms?: number;          // End-to-end request time
    returnMeta?: boolean;         // Should meta block be returned to caller
    providerCapabilitiesBeta?: boolean;
};

export type DebugOptions = {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
};

export type ModelId = string;
export type ProviderName = "openai" | "anthropic" | "google" | "groq" | "stability" | "elevenlabs" | "together" | "fireworks" | string;

export interface ProviderCapability {
    provider: ProviderName;
    endpoints: Endpoint[];
    models: ModelId[];
}

export interface ProviderHealth {
    provider: ProviderName;
    latencyMs: number;     // p50 or recent EWMA
    throughput: number;    // req/sec capacity estimate (the higher the better)
    uptimePct: number;     // 0..100
    currentLoad: number;   // 0..1 (used for load-balancing)
    lastUpdated: number;   // epoch ms
}

export interface ProviderAdapter {
    name: ProviderName;
    supports(model: ModelId, endpoint: Endpoint): boolean;
    // Map your gateway-normalised body to provider-native request & return a Response
    execute(args: {
        endpoint: Endpoint;
        model: ModelId;
        body: any;
        meta: RequestMeta;
        byokApiKey?: string;           // if user supplies their own key later
    }): Promise<Response>;
}

// GATEWAY TYPES
export type GatewayChatMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "tool"; content: string; name?: string }

export type GatewayCompletionsRequest = {
    model: string;
    messages: GatewayChatMessage[];
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
    tools?: any[];
    response_format?: { type: 'json_object' };
    modalities?: Array<"text" | "image">;
};

export type GatewayCompletionsResponse = {
    id?: string; // Gateway request ID
    nativeResponseId?: string; // e.g. OpenAI's "id" from their response
    created: number;
    model: string;
    provider: string;
    choices: GatewayCompletionsChoice[];
    usage?: GatewayUsage;
    // NOTE: reasoning_details removed from top level - it belongs on the message object (see GatewayCompletionsChoice)
}

export type GatewayResponsePayload = GatewayCompletionsResponse | Record<string, any>;

export type GatewayCompletionsChoice = {
    index: number;
    message: {
        role: "assistant";
        content: string;
        images?: Array<{
            type: "image_url";
            image_url: {
                url: string;
            };
            mime_type?: string;
        }>;
        tool_calls?: Array<{
            id: string;
            type: "function";
            function: {
                name: string;
                arguments: string;
            };
        }>;
        // Per-message reasoning fields (MiniMax/Aion format)
        reasoning_content?: string; // Simple format: single string with all reasoning
        reasoning_details?: GatewayReasoningDetail[]; // Structured format: array of reasoning blocks
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "error" | null;
    reasoning?: boolean;
    logprobs?: Array<{
        token: string;
        logprob: number;
        top_logprobs?: Array<{ token?: string; logprob?: number }>;
    }>;
}

export type GatewayUsage = {
    // New, OpenAI-aligned meters
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_details?: {
        cached_tokens?: number;
        input_images?: number;
        input_audio?: number;
        input_videos?: number;
    };
    output_tokens_details?: {
        reasoning_tokens?: number;
        cached_tokens?: number;
        output_images?: number;
        output_audio?: number;
        output_videos?: number;
    };

    // Legacy meters kept for pricing + internal analytics

    input_text_tokens?: number;
    output_text_tokens?: number;

    cached_read_text_tokens?: number;
    reasoning_tokens?: number;

    cached_write_text_tokens?: number;

}

export type GatewayReasoningDetail = {
    id: string;
    index: number;
    type: "summary" | "encrypted" | "text";
    text?: string; // For type "text" or "summary"
    data?: string; // For type "encrypted" (base64 encoded)
};

// // Definitions of subtypes are below
// type Request = {
//     // Either "messages" or "prompt" is required
//     messages?: Message[];
//     prompt?: string;

//     // If "model" is unspecified, uses the user's default
//     model?: string; // See "Supported Models" section

//     // Allows to force the model to produce specific output format.
//     // See models page and note on this docs page for which models support it.
//     response_format?: { type: 'json_object' };

//     stop?: string | string[];
//     stream?: boolean; // Enable streaming

//     // See LLM Parameters (openrouter.ai/docs/api-reference/parameters)
//     max_output_tokens?: number; // Range: [1, context_length)
//     temperature?: number; // Range: [0, 2]

//     // Tool calling
//     // Will be passed down as-is for providers implementing OpenAI's interface.
//     // For providers with custom interfaces, we transform and map the properties.
//     // Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
//     // See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
//     tools?: Tool[];
//     tool_choice?: ToolChoice;

//     // Advanced optional parameters
//     seed?: number; // Integer only
//     top_p?: number; // Range: (0, 1]
//     top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
//     frequency_penalty?: number; // Range: [-2, 2]
//     presence_penalty?: number; // Range: [-2, 2]
//     repetition_penalty?: number; // Range: (0, 2]
//     logit_bias?: { [key: number]: number };
//     top_logprobs: number; // Integer only
//     min_p?: number; // Range: [0, 1]
//     top_a?: number; // Range: [0, 1]

//     // Reduce latency by providing the model with a predicted output
//     // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
//     prediction?: { type: 'content'; content: string };

//     // OpenRouter-only parameters
//     // See "Prompt Transforms" section: openrouter.ai/docs/transforms
//     transforms?: string[];
//     // See "Model Routing" section: openrouter.ai/docs/model-routing
//     models?: string[];
//     route?: 'fallback';
//     // See "Provider Routing" section: openrouter.ai/docs/provider-routing
//     provider?: ProviderPreferences;
//     user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.
// };

// // Subtypes:

// type TextContent = {
//     type: 'text';
//     text: string;
// };

// type ImageContentPart = {
//     type: 'image_url';
//     image_url: {
//         url: string; // URL or base64 encoded image data
//         detail?: string; // Optional, defaults to "auto"
//     };
// };

// type ContentPart = TextContent | ImageContentPart;

// type Message =
//     | {
//         role: 'user' | 'assistant' | 'system';
//         // ContentParts are only for the "user" role:
//         content: string | ContentPart[];
//         // If "name" is included, it will be prepended like this
//         // for non-OpenAI models: `{name}: {content}`
//         name?: string;
//     }
//     | {
//         role: 'tool';
//         content: string;
//         tool_call_id: string;
//         name?: string;
//     };

// type FunctionDescription = {
//     description?: string;
//     name: string;
//     parameters: object; // JSON Schema object
// };

// type Tool = {
//     type: 'function';
//     function: FunctionDescription;
// };

// type ToolChoice =
//     | 'none'
//     | 'auto'
//     | {
//         type: 'function';
//         function: {
//             name: string;
//         };
//     };



