export type ParamTier = "safe" | "risky" | "critical";

const TIER_SAFE = new Set([
    "temperature",
    "top_p",
    "top_k",
    "frequency_penalty",
    "presence_penalty",
    "seed",
]);

const TIER_RISKY = new Set([
    "max_output_tokens",
    "max_tokens",
    "stop",
]);

const TIER_CRITICAL = new Set([
    "tools",
    "tool_choice",
    "response_format",
    "response",
]);

export function classifyParam(key: string): ParamTier {
    if (TIER_CRITICAL.has(key)) return "critical";
    if (TIER_RISKY.has(key)) return "risky";
    return TIER_SAFE.has(key) ? "safe" : "risky";
}
