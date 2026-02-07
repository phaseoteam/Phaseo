// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

const DEFAULT_PREVIEW_LIMIT = 8000;
const REDACT_KEYS = new Set([
    "raw_request",
    "raw_response",
    "rawRequest",
    "upstream_request",
    "upstream_response",
    "mappedRequest",
    "rawResponse",
]);

function truncate(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...[truncated ${text.length - limit} chars]`;
}

export function previewValue(value: unknown, limit = DEFAULT_PREVIEW_LIMIT): string | undefined {
    if (value === undefined) return undefined;
    if (value === null) return "null";
    if (typeof value === "string") return truncate(value, limit);
    try {
        return truncate(JSON.stringify(value), limit);
    } catch {
        return "[unserializable]";
    }
}

export function parseJsonLoose(value: string | null | undefined): unknown {
    if (value == null) return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

export function isDebugAllowed(): boolean {
    return true;
}

function redactPayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => redactPayload(item));
    }
    if (!value || typeof value !== "object") return value;
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
        if (REDACT_KEYS.has(key)) {
            output[key] = "[redacted]";
        } else {
            output[key] = redactPayload(val);
        }
    }
    return output;
}

export async function logDebugEvent(kind: string, payload: Record<string, unknown>) {
    if (!isDebugAllowed()) return;
    const entry = {
        ts: new Date().toISOString(),
        kind,
        ...(redactPayload(payload) as Record<string, unknown>),
    };
    try {
        console.log("[gateway-debug]", JSON.stringify(entry));
    } catch {
        // Swallow debug logging errors to avoid impacting requests
    }
}

