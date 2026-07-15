// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { getSupabaseAdmin } from "@/runtime/env";
import { readGatewayIoLogObject } from "@pipeline/audit/io-logging";
import { json, withRuntime } from "../../utils";

function resolveReplayRequest(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entries = Object.entries(value as Record<string, unknown>).filter(
        ([, entry]) => entry !== undefined,
    );
    if (entries.length === 0) return null;
    return Object.fromEntries(entries);
}

async function fetchGenerationIoLog(
	supabase: ReturnType<typeof getSupabaseAdmin>,
	workspaceId: string,
	requestId: string,
) {
	return supabase
		.from("gateway_io_logs")
		.select("io_log_status,io_log_storage_provider,io_log_bucket,io_log_object_key,io_log_bytes,io_log_sha256,io_log_content_type,io_log_retention_until,io_log_error")
		.eq("workspace_id", workspaceId)
		.eq("request_id", requestId)
		.maybeSingle();
}

async function handleGeneration(req: Request) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
        return json({ ok: false, error: "missing_id" }, 400, { "Cache-Control": "no-store" });
    }

    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return json({ ok: false, error: "unauthorised", reason }, 401, { "Cache-Control": "no-store" });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from("gateway_requests")
        .select("*")
        .eq("workspace_id", auth.workspaceId)
        .eq("request_id", id)
        .maybeSingle();

    if (error) {
        return json({ ok: false, error: "db_error", message: error.message }, 500, { "Cache-Control": "no-store" });
    }

    if (!data) {
        return json({ ok: false, error: "not_found" }, 404, { "Cache-Control": "no-store" });
    }

    const { data: ioLogData, error: ioLogError } = await fetchGenerationIoLog(
        supabase,
        auth.workspaceId,
        id,
    );

    if (ioLogError) {
        return json({ ok: false, error: "db_error", message: ioLogError.message }, 500, { "Cache-Control": "no-store" });
    }

    const ioLog = ioLogData as Record<string, any> | null;
    let ioLogPayload: Record<string, unknown> | null = null;
    if (ioLog?.io_log_status === "stored" && typeof ioLog.io_log_object_key === "string") {
        try {
            ioLogPayload = await readGatewayIoLogObject(ioLog.io_log_object_key);
        } catch {
            ioLogPayload = null;
        }
    }
    const replayRequest = resolveReplayRequest(ioLogPayload?.request_payload);

    return json(
        {
            ...data,
            replay_supported: Boolean(replayRequest),
            replay_request: replayRequest,
			io_log: ioLog ? {
				status: ioLog.io_log_status ?? "not_enabled",
				storage_provider: ioLog.io_log_storage_provider ?? null,
				bucket: ioLog.io_log_bucket ?? null,
				object_key: ioLog.io_log_object_key ?? null,
				bytes: ioLog.io_log_bytes ?? null,
				sha256: ioLog.io_log_sha256 ?? null,
				content_type: ioLog.io_log_content_type ?? null,
				retention_until: ioLog.io_log_retention_until ?? null,
				error: ioLog.io_log_error ?? null,
				payload: ioLogPayload,
			} : null,
        },
        200,
        { "Cache-Control": "no-store" },
    );
}

export const generationsRoutes = new Hono<Env>();

generationsRoutes.get("/", withRuntime(handleGeneration));

