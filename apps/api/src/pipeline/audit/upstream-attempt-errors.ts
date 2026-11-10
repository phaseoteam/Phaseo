// Purpose: Read the provider's error code, type, message and description from one provider attempt.
// Why: v2_request_attempts stores the same text the retired gateway_upstream_requests table
// held, taken the same way, so request detail reads alike on both sides of the cut-over. The executor already trims these to 320 characters (truncateAttemptText in
// pipeline/execute/index.ts), and the audit writers drop the raw payload preview for keys that
// keep content out of telemetry. Only these four summary fields are read here.

export type UpstreamAttemptErrorFields = {
    upstream_error_code: string | null;
    upstream_error_type: string | null;
    upstream_error_message: string | null;
    upstream_error_description: string | null;
};

export function upstreamAttemptErrorFields(attempt: Record<string, unknown>): UpstreamAttemptErrorFields {
    const error = attempt.error && typeof attempt.error === "object"
        ? attempt.error as Record<string, unknown>
        : {};
    return {
        upstream_error_code: typeof attempt.upstream_error_code === "string"
            ? attempt.upstream_error_code
            : typeof error.code === "string" ? error.code : null,
        upstream_error_type: typeof attempt.upstream_error_type === "string"
            ? attempt.upstream_error_type
            : typeof error.type === "string" ? error.type : null,
        upstream_error_message: typeof attempt.upstream_error_message === "string"
            ? attempt.upstream_error_message
            : typeof error.message === "string" ? error.message : null,
        upstream_error_description: typeof attempt.upstream_error_description === "string"
            ? attempt.upstream_error_description
            : typeof error.description === "string" ? error.description : null,
    };
}
