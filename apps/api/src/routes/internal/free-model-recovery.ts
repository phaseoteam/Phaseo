import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "@/runtime/types";

const headers = { "Cache-Control": "private, no-store" };
const retry = z.object({ workspaceId: z.uuid(), requestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    expectedAttempts: z.number().int().min(0).max(31) }).strict();
export const internalFreeModelRecoveryRoutes = new Hono<Env>();

internalFreeModelRecoveryRoutes.use("*", async (c, next) => {
    // Same private operator credential as the existing internal administration
    // routes. Never accept a session, inference key, owner header or public body
    // as authority to inspect another owner's financial recovery state.
    const expected = String(c.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
    const provided = c.req.header("x-internal-token") ?? "";
    let diff = provided.length ^ expected.length;
    for (let i = 0; i < 512; i++) diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    if (expected.length < 128 || expected.length > 512 || provided.length > 512 || diff !== 0) {
        return c.json({ error: "unauthorized" }, 401, headers);
    }
    if (!c.env.FREE_MODEL_QUOTA || !c.env.FREE_MODEL_RATE_LIMITER) return c.json({ error: "recovery_unavailable" }, 503, headers);
    let gate: { success: boolean };
    try { gate = await c.env.FREE_MODEL_RATE_LIMITER.limit({ key: "fee-recovery:operators" }); }
    catch { return c.json({ error: "recovery_unavailable" }, 503, headers); }
    if (gate?.success !== true) return c.json({ error: "rate_limited" }, 429, { ...headers, "Retry-After": "60" });
    await next();
});
internalFreeModelRecoveryRoutes.use("*", bodyLimit({ maxSize: 768,
    onError: c => c.json({ error: "request_too_large" }, 413, headers) }));

internalFreeModelRecoveryRoutes.get("/:ownerId", async c => {
    const owner = z.uuid().safeParse(c.req.param("ownerId"));
    if (!owner.success) return c.json({ error: "invalid_owner_id" }, 400, headers);
    try {
        const quota = c.env.FREE_MODEL_QUOTA!.getByName(`owner:${owner.data}`);
        return c.json({ data: await quota.feeReviews() }, 200, headers);
    } catch { return c.json({ error: "recovery_unavailable" }, 503, headers); }
});

internalFreeModelRecoveryRoutes.post("/:ownerId/retry", async c => {
    const owner = z.uuid().safeParse(c.req.param("ownerId"));
    const input = retry.safeParse(await c.req.json().catch(() => null));
    if (!owner.success || !input.success) return c.json({ error: "invalid_recovery_request" }, 400, headers);
    try {
        const { workspaceId, requestId, expectedAttempts } = input.data;
        const result = await c.env.FREE_MODEL_QUOTA!.getByName(`owner:${owner.data}`).retryReviewedFee(workspaceId, requestId, expectedAttempts);
        return c.json({ data: result }, 200, headers);
    } catch {
        // Do not retry an ambiguous acknowledgement or expose source diagnostics.
        return c.json({ error: "recovery_unconfirmed_refresh_required" }, 409, headers);
    }
});
