// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";

async function handleCreate(req: Request) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return json({
        status_code: 501,
        error: "not_implemented",
        description: "Batch endpoint is not implemented yet.",
    }, 501, { "Cache-Control": "no-store" });
}

async function handleRetrieve(req: Request, id: string) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return json({
        status_code: 501,
        error: "not_implemented",
        description: "Batch endpoint is not implemented yet.",
        batch_id: id || null,
    }, 501, { "Cache-Control": "no-store" });
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));

