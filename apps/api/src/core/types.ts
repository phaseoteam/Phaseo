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

export type RequestBetaOptions = {
    openai_websocket_mode?: boolean;
    openaiWebsocketMode?: boolean;
    openai?: {
        websocket_mode?: boolean;
        websocketMode?: boolean;
    };
    [key: string]: unknown;
};

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
    beta?: RequestBetaOptions;
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
