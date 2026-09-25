/** Shared terminal semantics for native buffered responses and stream bridges. */
export function deriveResponsesCompletion(finishReason?: string | null): {
    status: "completed" | "incomplete" | "failed";
    incompleteDetails?: { reason: "max_output_tokens" | "content_filter" };
} {
    if (finishReason === "error") return { status: "failed" };
    if (finishReason === "length" || finishReason === "max_tokens") {
        return { status: "incomplete", incompleteDetails: { reason: "max_output_tokens" } };
    }
    if (finishReason === "content_filter") {
        return { status: "incomplete", incompleteDetails: { reason: "content_filter" } };
    }
    return { status: "completed" };
}
