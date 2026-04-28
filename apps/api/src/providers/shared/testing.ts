import { getBindings } from "@/runtime/env";

function sanitizeTestId(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 128);
}

function isEnabled(): boolean {
    const bindings = getBindings();
    return String(bindings.NODE_ENV ?? "").trim().toLowerCase() === "test";
}

export function resolveUpstreamTestId(value: unknown): string | undefined {
    if (!isEnabled()) return undefined;
    return sanitizeTestId(value);
}

export function upstreamTestHeaders(meta: { testId?: string | null } | null | undefined): Record<string, string> {
    const testId = resolveUpstreamTestId(meta?.testId);
    if (!testId) return {};
    return {
        "X-Test-Id": testId,
    };
}
