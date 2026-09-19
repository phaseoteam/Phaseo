import type { MiddlewareHandler } from "hono";
import type { Env } from "@/env";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import { requireAccountWorkspace } from "./context";

export async function deliverRequestStateMutation(env: Env, workspaceId: string, token: string, phase: "begin" | "finish"): Promise<void> {
    if (!env.GATEWAY_API_ORIGIN || !env.GATEWAY_INTERNAL_TEST_TOKEN) throw new Error("request_state_delivery_unconfigured");
    const origin = new URL(env.GATEWAY_API_ORIGIN);
    if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("request_state_delivery_origin_invalid");
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch(new URL("/internal/request-state/mutation", origin), {
                method: "POST", headers: { "content-type": "application/json", "x-internal-token": env.GATEWAY_INTERNAL_TEST_TOKEN },
                body: JSON.stringify({ workspaceId, token, phase }), signal: AbortSignal.timeout(60_000),
            });
            if (!response.ok) throw new Error("request_state_delivery_failed");
            return;
        } catch {
            if (attempt === 1) throw new Error("request_state_delivery_failed");
        }
    }
}

// Off by default. It applies only to the explicitly enrolled staging workspace,
// after authentication and membership checks. No account's normal path changes.
export const fenceRequestStateMutation: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
    const enrolled = c.env.GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID;
    if (!enrolled || !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) return next();
    if (!await requireUser(c.req.raw, c.env)) return next();
    let workspaceId = c.req.query("workspaceId");
    if (c.req.header("content-type")?.includes("application/json")) {
        const body: unknown = await c.req.json().catch(() => null);
        if (body && typeof body === "object" && "workspaceId" in body && typeof body.workspaceId === "string") workspaceId = body.workspaceId;
    }
    // Key mutation endpoints identify the workspace through the key, not the
    // currently selected UI workspace. Resolve it before deciding to fence.
    const keyId = /\/keys\/([0-9a-f-]{36})(?:\/|$)/i.exec(new URL(c.req.url).pathname)?.[1];
    if (keyId) {
        const key = await getDataClient(c.env).from("keys").select("workspace_id").eq("id", keyId).maybeSingle();
        if (key.error) return c.json({ error: "request_state_lookup_failed" }, 503);
        workspaceId = key.data?.workspace_id;
    }
    const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
    if (context?.workspaceId !== enrolled || !["owner", "admin"].includes(context.role.toLowerCase())) return next();
    const token = crypto.randomUUID();
    try { await deliverRequestStateMutation(c.env, enrolled, token, "begin"); }
    catch { return c.json({ error: "request_state_delivery_failed", mutation_applied: false }, 503); }
    try { await next(); }
    finally {
        try { await deliverRequestStateMutation(c.env, enrolled, token, "finish"); }
        catch {
            // Mutation may have committed. Do not report success or encourage a
            // blind create retry. Admission remains fenced and outbox retained.
            c.res = Response.json({ error: "request_state_sync_pending", mutation_may_have_applied: true }, { status: 503 });
        }
    }
};
