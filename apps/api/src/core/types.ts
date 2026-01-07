export type CoreRole = "system" | "user" | "assistant" | "tool";

export type CoreContentPart =
    | { type: "text"; text: string }
    | { type: "image"; url: string; detail?: string }
    | { type: "input_audio"; data: string; format: string }
    | { type: "input_video"; url: string }
    | { type: "file_ref"; id: string; mime?: string }
    | { type: "tool_call"; id: string; name: string; arguments: string }
    | { type: "tool_result"; id: string; content: string };

export type CoreTurn = {
    role: CoreRole;
    content: CoreContentPart[];
};

export type CoreTool = {
    name: string;
    description?: string;
    schema?: any;
    strict?: boolean;
};

export type CoreToolChoice =
    | "auto"
    | "none"
    | "required"
    | { name: string };

export type CoreSampling = {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    seed?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
};

export type CoreLimits = {
    max_output_tokens?: number;
    stop?: string[];
};

export type CoreResponseFormat = {
    type: "json_schema" | "json_object" | "text";
    schema?: any;
};

export type CoreRequestMetadata = {
    request_id?: string;
    user_id?: string;
    tags?: string[];
    trace?: Record<string, string>;
};

export type CoreRequest = {
    model: string;
    input: CoreTurn[];
    system?: string;
    tools?: CoreTool[];
    tool_choice?: CoreToolChoice;
    sampling?: CoreSampling;
    limits?: CoreLimits;
    response?: CoreResponseFormat;
    stream?: boolean;
    metadata?: CoreRequestMetadata;
    strictness?: "off" | "warn" | "error";
};

export type CoreUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
};

export type CoreResponse = {
    output: CoreTurn[];
    usage?: CoreUsage;
    provider?: { id: string; model?: string; region?: string };
    timing?: { ttfb_ms?: number; total_ms?: number };
    warnings?: string[];
    raw?: any;
};
