// Realtime maintenance windows. The relay runs in its own Worker
// (phaseo-realtime), and deploying it ends every call it carries, so it is only
// deployed in an announced window: new sessions are refused first, live calls
// finish on their own, then the relay deploys. The switch is a key in the
// gateway cache so it can flip without a deploy (KV takes up to a minute to
// reach every location). See .agents/skills/realtime-maintenance.
import { withErrorObject } from "@core/error-object";
import { getBindings } from "@/runtime/env";

export const REALTIME_MAINTENANCE_KEY = "realtime:maintenance:v1";
const DEFAULT_RETRY_AFTER_SECONDS = 15 * 60;

export type RealtimeMaintenance = {
	/** When the window is expected to end, if announced. */
	until: string | null;
	message: string | null;
};

/** The current window, or null. A switch that can't be read never blocks calls. */
export async function readRealtimeMaintenance(): Promise<RealtimeMaintenance | null> {
	const cache = getBindings().GATEWAY_CACHE;
	if (!cache) return null;
	const value = await cache.get<Record<string, unknown>>(REALTIME_MAINTENANCE_KEY, "json").catch((error) => {
		console.error("realtime_maintenance_read_failed", { error: error instanceof Error ? error.message : String(error) });
		return null;
	});
	if (!value || value.enabled !== true) return null;
	const until = typeof value.until === "string" && Number.isFinite(Date.parse(value.until)) ? value.until : null;
	const message = typeof value.message === "string" && value.message.trim() ? value.message.trim().slice(0, 500) : null;
	return { until, message };
}

export function realtimeMaintenanceResponse(window: RealtimeMaintenance, ids: { requestId: string; workspaceId: string }) {
	const untilMs = window.until ? Date.parse(window.until) : Number.NaN;
	const retryAfter = Number.isFinite(untilMs)
		? Math.max(60, Math.ceil((untilMs - Date.now()) / 1000))
		: DEFAULT_RETRY_AFTER_SECONDS;
	const body = withErrorObject({
		error: "service_unavailable",
		reason: "realtime_maintenance",
		message: window.message
			?? "Realtime voice is in a maintenance window. Calls already in progress are not affected. Try again later.",
		maintenance_until: window.until,
		status_code: 503,
		error_type: "system",
		request_id: ids.requestId,
		generation_id: ids.requestId,
		workspace_id: ids.workspaceId,
	}, 503, { retryAfter: String(retryAfter) });
	return new Response(JSON.stringify(body), {
		status: 503,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
	});
}
