// src/routes/v1/control/analytics.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";

// Coming soon: aggregated analytics endpoint; currently returns a placeholder.
async function handleAnalytics(req: Request) {
    // TODO: Validate access_token and return aggregated analytics.
    const body = await req.json().catch(() => ({}));
    const { access_token } = body as { access_token?: string };
    if (!access_token) {
        return json({ ok: false, error: "access_token_required" }, 400, { "Cache-Control": "no-store" });
    }
    return json({ ok: true, status: "not_implemented", message: "Analytics aggregation coming soon" }, 200, {
        "Cache-Control": "no-store",
    });
}

export const analyticsRoutes = new Hono<Env>();

analyticsRoutes.post("/", withRuntime(handleAnalytics));
