import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { getSupabaseActor } from "@/lib/oauth/service";
import { json, withRuntime } from "@/routes/utils";

const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const Patch = z.object({ allowOverage: z.boolean(), expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const Owner = z.string().uuid();

/** Dashboard-only contract, not an inference/management-key capability. The
 * verified session selects the owner; no body, workspace or identity header can
 * select another person's policy. Reads intentionally bypass all caches. */
export const internalFreeModelSettingsRoutes = new Hono<Env>();

internalFreeModelSettingsRoutes.use("*", bodyLimit({
    maxSize: 512,
    onError: () => json({ error: "request_too_large" }, 413, PRIVATE),
}));

internalFreeModelSettingsRoutes.on(["GET", "PATCH"], "/", withRuntime(async (req, context) => {
    const env = context!.env;
    if (env.GATEWAY_FREE_MODEL_QUOTA_ENABLED !== "true") return json({ error: "not_found" }, 404, PRIVATE);
    if (!env.FREE_MODEL_QUOTA || !env.FREE_MODEL_RATE_LIMITER) return json({ error: "free_model_quota_unavailable" }, 503, PRIVATE);
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: "unauthorized" }, 401, PRIVATE);
    try {
        // Cloudflare sets this ingress header. Use the original request because
        // withRuntime removes it from the request passed to application code.
        // A separate edge key sheds invalid-session floods before Auth I/O.
        const address = context!.req.raw.headers.get("cf-connecting-ip") ?? "unknown";
        const authentication = await env.FREE_MODEL_RATE_LIMITER.limit({ key: `settings-auth:${address}` });
        if (!authentication.success) return json({ error: "rate_limited" }, 429, { ...PRIVATE, "Retry-After": "60" });
        // Control-plane session verification only; never called on inference.
        const actor = await getSupabaseActor(token);
        if (!actor || !Owner.safeParse(actor.userId).success) return json({ error: "unauthorized" }, 401, PRIVATE);
        const edge = await env.FREE_MODEL_RATE_LIMITER.limit({ key: `settings:${actor.userId}` });
        if (!edge.success) return json({ error: "rate_limited" }, 429, { ...PRIVATE, "Retry-After": "60" });
        const quota = env.FREE_MODEL_QUOTA.getByName(`owner:${actor.userId}`);
        if (req.method === "GET") {
            return json({ data: { ...await quota.getSettings(), overageAvailable: false } }, 200, PRIVATE);
        }
        const body = Patch.safeParse(await req.json().catch(() => null));
        if (!body.success) return json({ error: "invalid_free_model_policy" }, 400, PRIVATE);
        // Do not collect apparent consent to a feature that cannot yet safely
        // authorize, settle and recover its fee. Disabling is always supported.
        if (body.data.allowOverage) return json({ error: "free_model_overage_not_available" }, 409, PRIVATE);
        const result = await quota.setOverage(false, body.data.expectedVersion);
        return json({ data: { ...result.settings, overageAvailable: false },
            ...(result.updated ? {} : { error: "policy_version_conflict" }) }, result.updated ? 200 : 409, PRIVATE);
    } catch {
        // No retry after an ambiguous mutation acknowledgement. GET the current
        // version before retrying; do not surface provider diagnostics or tokens.
        return json({ error: "free_model_quota_unavailable" }, 503, PRIVATE);
    }
}));
