import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const patch = z.object({ allowOverage: z.boolean(), expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const settings = z.object({
    allowOverage: z.boolean(), policyVersion: z.number().int().nonnegative(),
    requestsUsedToday: z.number().int().nonnegative(), requestsIncluded: z.number().int().positive(),
    rpm: z.number().int().positive(), overageFeeNanos: z.number().int().nonnegative(),
    resetsAtMs: z.number().int().nonnegative(), overageAvailable: z.boolean(),
});
const errors = new Set(["unauthorized", "not_found", "free_model_quota_unavailable", "rate_limited",
    "invalid_free_model_policy", "free_model_overage_not_available", "policy_version_conflict"]);

export const accountFreeModelQuotaRouter = new Hono<{ Bindings: Env }>();
accountFreeModelQuotaRouter.use("*", bodyLimit({ maxSize: 512,
    onError: c => c.json({ error: "request_too_large" }, 413, PRIVATE_NO_STORE_HEADERS) }));
accountFreeModelQuotaRouter.on(["GET", "PATCH"], "/", async c => {
    const authorization = c.req.header("authorization");
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
    let body;
    if (c.req.method === "PATCH") {
        const parsed = patch.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json({ error: "invalid_free_model_policy" }, 400, PRIVATE_NO_STORE_HEADERS);
        body = parsed.data;
    }
    try {
        // Gateway verifies the session and selects the owner. Never forward an
        // owner/workspace argument, cookies, internal credentials or arbitrary URL.
        const origin = (c.env.GATEWAY_API_ORIGIN ?? "https://api.phaseo.app").replace(/\/+$/, "");
        const response = await fetch(`${origin}/internal/free-model-quota`, {
            method: c.req.method, headers: { authorization, "content-type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        const payload = await response.json() as { data?: unknown; error?: unknown };
        const data = settings.safeParse(payload?.data);
        if (response.status === 200 && data.success) return c.json({ data: data.data }, 200, PRIVATE_NO_STORE_HEADERS);
        if ([400, 401, 404, 409, 429, 503].includes(response.status) && typeof payload?.error === "string" && errors.has(payload.error)) {
            const headers = response.status === 429 ? { ...PRIVATE_NO_STORE_HEADERS, "Retry-After": "60" } : PRIVATE_NO_STORE_HEADERS;
            return new Response(JSON.stringify({ error: payload.error, ...(data.success ? { data: data.data } : {}) }), {
                status: response.status, headers: { ...headers, "Content-Type": "application/json" },
            });
        }
    } catch { /* An ambiguous PATCH is never retried. Only return safe errors. */ }
    return c.json({ error: "free_model_quota_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
});
