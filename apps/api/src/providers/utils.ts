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
    T extends z.ZodTypeAny,
    K extends keyof z.infer<T>
>(schema: T, payload: unknown, omitKeys: K[] = [] as K[]) {
    const canonical = schema.parse(payload);
    const adapterPayload: any = { ...canonical };
    for (const key of omitKeys) {
        delete adapterPayload[key as string];
    }
    return { canonical, adapterPayload: adapterPayload as Omit<z.infer<T>, K> };
}
