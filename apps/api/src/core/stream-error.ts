import { classifyProviderHealthImpact, type HealthImpact } from "./provider-health-impact";
import { SseProtocolError } from "./sse";

export type StreamErrorOrigin = "provider" | "gateway" | "client";
export type StreamErrorKind = "transport" | "protocol" | "upstream" | "transform" | "cancelled";

/** Safe, bounded metadata only: never retain provider payloads, credentials or exception messages. */
export class GatewayStreamError extends Error {
    readonly healthImpact: HealthImpact;
    readonly retryable: boolean;
    constructor(
        readonly origin: StreamErrorOrigin,
        readonly kind: StreamErrorKind,
        readonly code: string,
        readonly status?: number,
        credentialSource?: "gateway" | "byok",
    ) {
        super(origin === "gateway" ? "The gateway could not process the stream."
            : origin === "client" ? "The stream was cancelled." : "The upstream stream failed before successful completion.");
        this.name = "GatewayStreamError";
        this.healthImpact = classifyProviderHealthImpact({ failureOrigin: origin,
            upstreamStatus: status, credentialSource, midStreamError: origin === "provider" });
        // This is eligibility only. Commitment and financial retry policy must ALSO allow retry.
        this.retryable = origin === "provider" && (kind === "transport"
            || (kind === "upstream" && (status === 408 || status === 429 || (status ?? 0) >= 500)));
        Object.freeze(this);
    }
}

export function classifyStreamException(error: unknown, origin: StreamErrorOrigin): GatewayStreamError {
    if (error instanceof GatewayStreamError) return error;
    if (error instanceof SseProtocolError) return new GatewayStreamError(error.code.endsWith("_too_large") ? "gateway" : origin, "protocol", error.code);
    return new GatewayStreamError(origin, origin === "provider" ? "transport" : origin === "client" ? "cancelled" : "transform",
        origin === "provider" ? "upstream_stream_failure" : origin === "client" ? "stream_cancelled" : "gateway_stream_failure");
}

const CODE_STATUS: Readonly<Record<string, number>> = Object.freeze({
    invalid_api_key: 401, authentication_error: 401, permission_denied: 403, permission_error: 403,
    billing_error: 402, insufficient_quota: 429, rate_limit_exceeded: 429, rate_limit_error: 429,
    overloaded_error: 529, api_error: 500, timeout_error: 504,
});

export function classifyStreamProviderError(payload: any, credentialSource?: "gateway" | "byok"): GatewayStreamError {
    const error = payload?.response?.error ?? payload?.error ?? payload;
    const rawCode = error?.code ?? error?.type;
    // Do not reflect arbitrary exception/provider strings as client-facing error codes.
    const code = typeof rawCode === "string" && /^[a-zA-Z0-9_.-]{1,96}$/.test(rawCode) ? rawCode : "upstream_stream_failure";
    const status = Number(error?.status_code ?? error?.status ?? payload?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599
        ? status : Object.hasOwn(CODE_STATUS, code) ? CODE_STATUS[code] : undefined;
    return new GatewayStreamError("provider", "upstream", code, safeStatus, credentialSource);
}
