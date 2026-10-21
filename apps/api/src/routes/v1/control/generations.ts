// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure, AuthSuccess } from "@pipeline/before/auth";
import { getSupabaseAdmin } from "@/runtime/env";
import { readGatewayIoLogObject } from "@pipeline/audit/io-logging";
import { isGatewayIoLoggingFeatureEnabled } from "@core/feature-flags";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "../../utils";
import { requireCapability } from "./route-helpers";

function canReadGenerationIoLog(auth: AuthSuccess): boolean {
	if (auth.internal) return true;
	const scopes = new Set([...(auth.scopes ?? []), ...(auth.oauthScopes ?? [])]);
	return scopes.has(CAPABILITIES.GENERATIONS_READ);
}

// Workspaces can limit stored contents to owners and admins. API keys then act
// with their creator's role; a failed lookup hides the contents.
async function canReadWorkspaceIoLogContents(
	supabase: ReturnType<typeof getSupabaseAdmin>,
	auth: AuthSuccess,
): Promise<boolean> {
	if (auth.internal) return true;
	const settings = await supabase
		.from("workspace_settings")
		.select("io_logging_contents_access")
		.eq("workspace_id", auth.workspaceId)
		.maybeSingle();
	if (settings.error) return String(settings.error.code ?? "") === "42703";
	if (settings.data?.io_logging_contents_access !== "admins") return true;
	const userId = String(auth.userId ?? "").trim();
	if (!userId) return false;
	const [membership, workspace] = await Promise.all([
		supabase.from("workspace_members").select("role").eq("workspace_id", auth.workspaceId).eq("user_id", userId).maybeSingle(),
		supabase.from("workspaces").select("owner_user_id").eq("id", auth.workspaceId).maybeSingle(),
	]);
	if (membership.error || workspace.error) return false;
	if (workspace.data?.owner_user_id === userId) return true;
	return ["owner", "admin"].includes(String(membership.data?.role ?? "").toLowerCase());
}

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

    const auth = await authenticate(req, { allowOAuthJwt: true });
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return json({ ok: false, error: "unauthorised", reason }, 401, { "Cache-Control": "no-store" });
    }
	if (auth.authMethod === "oauth") {
		const scopeError = requireCapability(auth, CAPABILITIES.GENERATIONS_READ);
		if (scopeError) return scopeError;
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

	const ioLoggingFeatureEnabled = canReadGenerationIoLog(auth) && await isGatewayIoLoggingFeatureEnabled({
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
		userId: auth.userId,
		internal: auth.internal,
	});
	const { data: ioLogData, error: ioLogError } = ioLoggingFeatureEnabled
		? await fetchGenerationIoLog(supabase, auth.workspaceId, id)
		: { data: null, error: null };

    if (ioLogError) {
        return json({ ok: false, error: "db_error", message: ioLogError.message }, 500, { "Cache-Control": "no-store" });
    }

    const ioLog = ioLogData as Record<string, any> | null;
    const contentsReadable = ioLog?.io_log_status === "stored"
        && await canReadWorkspaceIoLogContents(supabase, auth);
    let ioLogPayload: Record<string, unknown> | null = null;
    if (contentsReadable && typeof ioLog?.io_log_object_key === "string") {
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
				status: ioLog.io_log_status === "stored" && !contentsReadable ? "restricted" : ioLog.io_log_status ?? "not_enabled",
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

