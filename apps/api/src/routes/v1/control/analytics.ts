// src/routes/v1/control/analytics.ts
// Purpose: Control-plane route handler for analytics operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";

// Coming soon: aggregated analytics endpoint; currently returns a placeholder.
async function handleAnalytics(req: Request) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return json({ ok: false, error: "unauthorised", reason }, 401, { "Cache-Control": "no-store" });
    }

    return json({ ok: true, status: "not_implemented", message: "Analytics aggregation coming soon" }, 200, {
        "Cache-Control": "no-store",
    });
}

export const analyticsRoutes = new Hono<Env>();

analyticsRoutes.post("/", withRuntime(handleAnalytics));









