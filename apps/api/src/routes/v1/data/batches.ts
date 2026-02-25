// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { getBatchJobMeta } from "@core/batch-jobs";

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
    const batchId = String(id ?? "").trim();
    if (!batchId) {
        return err("validation_error", { reason: "missing_batch_id" });
    }
    let meta = null;
    try {
        meta = await getBatchJobMeta(auth.teamId, batchId);
    } catch (lookupErr) {
        console.error("batch_job_meta_lookup_failed", {
            error: lookupErr,
            teamId: auth.teamId,
            batchId,
        });
    }
    if (!meta) {
        return err("not_found", {
            reason: "batch_not_found_or_not_owned",
            batch_id: batchId,
            team_id: auth.teamId,
        });
    }
    return json({
        status_code: 501,
        error: "not_implemented",
        description: "Batch endpoint is not implemented yet.",
        batch_id: batchId,
        provider: meta.provider,
        model: meta.model ?? null,
    }, 501, { "Cache-Control": "no-store" });
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));

