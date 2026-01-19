const DEFAULT_PREVIEW_LIMIT = 8000;

function truncate(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…[truncated ${text.length - limit} chars]`;
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

export function isDebugAllowed(): boolean {
    return true;
}

export async function logDebugEvent(kind: string, payload: Record<string, unknown>) {
    if (!isDebugAllowed()) return;
    const entry = {
        ts: new Date().toISOString(),
        kind,
        ...payload,
    };
    try {
        console.log("[gateway-debug]", JSON.stringify(entry));
    } catch {
        // Swallow debug logging errors to avoid impacting requests
    }
}
