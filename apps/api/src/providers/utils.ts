// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { z } from "zod";

// Sanitize provider payloads using the schema we already validate against.
export function sanitizePayload<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
    return schema.parse(payload);
}

/**
 * Build both the canonical gateway request (fully typed) and a provider-specific
 * payload that strips gateway-only fields (e.g. meta/usage flags) before
 * sending upstream.
 */
export function buildAdapterPayload<
    T extends z.ZodTypeAny
>(schema: T, payload: unknown, omitKeys: string[] = []) {
    const canonical = schema.parse(payload);
    const adapterPayload: Record<string, unknown> = { ...(canonical as Record<string, unknown>) };
    delete adapterPayload.provider;
    for (const key of omitKeys) {
        delete adapterPayload[key];
    }
    return { canonical, adapterPayload: adapterPayload as z.infer<T> };
}

