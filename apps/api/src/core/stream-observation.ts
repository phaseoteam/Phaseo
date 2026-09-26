/** Fixed-cardinality diagnostics only: no text, tool arguments, usage payloads or provider errors. */
export type StreamFinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error" | "other";
export type StreamObservation = Readonly<{
    state: "COMPLETED" | "FAILED" | "CANCELLED";
    committed: boolean;
    deliveredFrames: number;
    deliveredBytes: number;
    downstreamDisconnected: boolean;
    sawFinalUsage: boolean;
    finishReason: StreamFinishReason | null;
    errorOrigin: "provider" | "gateway" | "client" | null;
    firstFrameMs: number | null;
    firstOutputObservedMs: number | null;
    durationMs: number;
}>;

export function normalizeStreamFinishReason(reason: unknown): StreamFinishReason | null {
    if (reason == null || reason === "") return null;
    switch (reason) {
        case "stop": case "end_turn": case "stop_sequence": case "completed": return "stop";
        case "length": case "max_tokens": case "max_output_tokens": return "length";
        case "tool_calls": case "function_call": case "tool_use": return "tool_calls";
        case "content_filter": case "refusal": case "safety": return "content_filter";
        case "error": case "failed": case "failure": case "upstream_failure": return "error";
        default: return "other";
    }
}
