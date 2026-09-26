import { z } from "zod";

// Lifecycle metadata is not geography. Unknown shapes still fail validation.
const lifecycle = z.object({
    status: z.enum(["available", "preview", "coming_soon", "limited_access", "deprecated", "retired", "unavailable"]),
    announcement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export function normalizeProviderAvailability(value: unknown): unknown {
    return value && typeof value === "object" && lifecycle.safeParse(value).success ? null : value;
}
