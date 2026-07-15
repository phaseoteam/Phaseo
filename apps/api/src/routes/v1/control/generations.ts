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

function isMissingIoLogColumnError(error: unknown): boolean {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const code = String(record?.code ?? "");
    const message = String(record?.message ?? "").toLowerCase();
    return (code === "PGRST204" || code === "42703") && message.includes("io_log_");
}

async function fetchGenerationDetail(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    workspaceId: string,
    requestId: string,
) {
    const detailQuery = () => supabase
        .from("gateway_request_details")
        .select("request_payload,gateway_response,provider_request,provider_response,io_log_status,io_log_storage_provider,io_log_bucket,io_log_object_key,io_log_bytes,io_log_sha256,io_log_content_type,io_log_retention_until,io_log_error")
        .eq("workspace_id", workspaceId)
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const result = await detailQuery();
    if (!result.error || !isMissingIoLogColumnError(result.error)) return result;

    return supabase
        .from("gateway_request_details")
        .select("request_payload,gateway_response,provider_request,provider_response")
        .eq("workspace_id", workspaceId)
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
}

async function fetchGenerationSignals(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    workspaceId: string,
    requestId: string,
) {
    try {
        const [feedbackResult, eventsResult] = await Promise.all([
            supabase
                .from("gateway_feedback")
                .select("id,request_id,session_id,preset_id,test_run_id,source,rating,score,reason,reason_tags,comment,metadata,end_user_id,created_by_user_id,created_at")
                .eq("workspace_id", workspaceId)
                .eq("request_id", requestId)
                .order("created_at", { ascending: false })
                .limit(50),
            supabase
                .from("gateway_observability_events")
                .select("id,request_id,session_id,preset_id,test_run_id,category,event_name,value,numeric_value,metadata,end_user_id,source,occurred_at,created_by_user_id,created_at")
                .eq("workspace_id", workspaceId)
                .eq("request_id", requestId)
                .order("occurred_at", { ascending: false })
                .limit(50),
        ]);
        return {
            feedback: feedbackResult.error ? [] : feedbackResult.data ?? [],
            events: eventsResult.error ? [] : eventsResult.data ?? [],
        };
    } catch {
        return { feedback: [], events: [] };
    }
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

    const { data: detailData, error: detailError } = await fetchGenerationDetail(
        supabase,
        auth.workspaceId,
        id,
    );

    if (detailError) {
        return json({ ok: false, error: "db_error", message: detailError.message }, 500, { "Cache-Control": "no-store" });
    }
    const signals = await fetchGenerationSignals(supabase, auth.workspaceId, id);

    const detail = detailData as Record<string, any> | null;
    const replayRequest = resolveReplayRequest(detail?.request_payload);
    let ioLogPayload: Record<string, unknown> | null = null;
    if (detail?.io_log_status === "stored" && typeof detail.io_log_object_key === "string") {
        try {
            ioLogPayload = await readGatewayIoLogObject(detail.io_log_object_key);
        } catch {
            ioLogPayload = null;
        }
    }

    return json(
        {
            ...data,
            replay_supported: Boolean(replayRequest),
            replay_request: replayRequest,
            feedback: signals.feedback,
            events: signals.events,
            io_log: detail ? {
                status: detail.io_log_status ?? "not_enabled",
                storage_provider: detail.io_log_storage_provider ?? null,
                bucket: detail.io_log_bucket ?? null,
                object_key: detail.io_log_object_key ?? null,
                bytes: detail.io_log_bytes ?? null,
                sha256: detail.io_log_sha256 ?? null,
                content_type: detail.io_log_content_type ?? null,
                retention_until: detail.io_log_retention_until ?? null,
                error: detail.io_log_error ?? null,
                payload: ioLogPayload,
                request_payload: detail.request_payload ?? null,
                gateway_response: detail.gateway_response ?? null,
                provider_request: detail.provider_request ?? null,
                provider_response: detail.provider_response ?? null,
            } : null,
        },
        200,
        { "Cache-Control": "no-store" },
    );
}

export const generationsRoutes = new Hono<Env>();

generationsRoutes.get("/", withRuntime(handleGeneration));

