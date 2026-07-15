import { Hono } from "hono";

import { readGatewayIoLogObject } from "@/pipeline/audit/io-logging";
import { isGatewayIoLoggingFeatureEnabled } from "@/core/feature-flags";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";

export const internalIoLogRoutes = new Hono<Env>();

function timingSafeEqual(a: string, b: string): boolean {
	const length = Math.max(a.length, b.length);
	let difference = a.length === b.length ? 0 : 1;
	for (let index = 0; index < length; index += 1) {
		difference |= (index < a.length ? a.charCodeAt(index) : 0) ^ (index < b.length ? b.charCodeAt(index) : 0);
	}
	return difference === 0;
}

function isAuthorized(req: Request): boolean {
	const configured = String(getBindings().GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
	const provided = String(
		req.headers.get("x-phaseo-internal-token") ?? req.headers.get("x-internal-token") ?? "",
	).trim();
	return configured.length >= 128 && provided.length > 0 && timingSafeEqual(provided, configured);
}

function requestIdFromUrl(req: Request): string {
	const segments = new URL(req.url).pathname.split("/").filter(Boolean);
	try {
		return decodeURIComponent(segments.at(-1) ?? "").trim();
	} catch {
		return "";
	}
}

async function handleIoLogRequest(req: Request) {
	if (!isAuthorized(req)) {
		return json({ ok: false, error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
	}

	const url = new URL(req.url);
	const requestId = requestIdFromUrl(req);
	const workspaceId = url.searchParams.get("workspace_id")?.trim();
	if (!requestId || !workspaceId || requestId.length > 256 || workspaceId.length > 128) {
		return json({ ok: false, error: "invalid_request" }, 400, { "Cache-Control": "no-store" });
	}
	if (!(await isGatewayIoLoggingFeatureEnabled({ workspaceId }))) {
		return json({ ok: true, io_log: null }, 200, { "Cache-Control": "no-store" });
	}

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_io_logs")
		.select("io_log_status,io_log_storage_provider,io_log_bytes,io_log_retention_until,io_log_error,io_log_object_key")
		.eq("workspace_id", workspaceId)
		.eq("request_id", requestId)
		.maybeSingle();
	if (error) return json({ ok: false, error: "db_error" }, 500, { "Cache-Control": "no-store" });
	if (!data) return json({ ok: true, io_log: null }, 200, { "Cache-Control": "no-store" });

	let payload: Record<string, unknown> | null = null;
	if (data.io_log_status === "stored" && typeof data.io_log_object_key === "string") {
		try { payload = await readGatewayIoLogObject(data.io_log_object_key); } catch { payload = null; }
	}
	return json({ ok: true, io_log: {
		status: data.io_log_status ?? "not_enabled",
		storage_provider: data.io_log_storage_provider ?? null,
		bytes: data.io_log_bytes ?? null,
		retention_until: data.io_log_retention_until ?? null,
		error: data.io_log_error ?? null,
		payload,
	} }, 200, { "Cache-Control": "no-store" });
}

internalIoLogRoutes.get("/:requestId", withRuntime(handleIoLogRequest));
