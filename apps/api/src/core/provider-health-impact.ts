// Shared pure classification; advisory reporting and stream outcomes use the same rules.
export type HealthImpact = "success" | "failure" | "neutral";

function normalizeHealthSignal(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

export function isRateLimitSignal(value: unknown): boolean {
    const normalized = normalizeHealthSignal(value);
    if (!normalized) return false;
    return normalized.includes("rate limit") || normalized.includes("rate_limit")
        || normalized.includes("too many requests") || normalized.includes("ratelimit")
        || normalized.includes("quota exceeded");
}

export function classifyProviderHealthImpact(args: {
    upstreamStatus?: number | null;
    aborted?: boolean;
    midStreamError?: boolean;
    finishReason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    credentialSource?: "gateway" | "byok";
    failureOrigin?: "provider" | "gateway" | "client";
}): HealthImpact {
    if (args.aborted || args.failureOrigin === "client" || args.failureOrigin === "gateway") return "neutral";
    const status = Number(args.upstreamStatus ?? 0);
    if (args.credentialSource === "byok" && [401, 402, 403, 429].includes(status)) return "neutral";
    if (args.midStreamError) return "failure";
    const finishReason = normalizeHealthSignal(args.finishReason);
    if (["error", "failed", "failure", "upstream_failure"].includes(finishReason)) return "failure";
    if (Number.isFinite(status) && status >= 200 && status < 300) return "success";
    if (status === 429 || status === 408) return "failure";
    if (status >= 400 && status < 500) return "neutral";
    if (status >= 500 && status < 600) return "failure";
    if (isRateLimitSignal(args.errorCode) || isRateLimitSignal(args.errorMessage)) {
        return args.credentialSource !== "byok" && args.failureOrigin === "provider" ? "failure" : "neutral";
    }
    const code = normalizeHealthSignal(args.errorCode);
    if (/^(econnreset|econnrefused|etimedout|ehostunreach|enetunreach|und_err_(connect_timeout|headers_timeout|body_timeout|socket))$/.test(code)) return args.failureOrigin === "provider" ? "failure" : "neutral";
    return args.failureOrigin === "provider" ? "failure" : "neutral";
}
