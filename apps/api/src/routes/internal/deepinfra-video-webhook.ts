import { getVideoJobRecord, saveVideoJobMeta } from "@core/video-jobs";
import { finalizeVideoJob } from "@core/video-finalization";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { deepinfraTokenHash, deepinfraVideoResult } from "@providers/deepinfra/video";
import { timingSafeEqual } from "./video-webhooks.helpers";

export async function handleDeepinfraVideoWebhook(req: Request, rawBody: string): Promise<Response> {
	const url = new URL(req.url);
	const workspaceId = url.searchParams.get("workspace") ?? "";
	const videoId = url.searchParams.get("request") ?? "";
	const token = url.searchParams.get("token") ?? "";
	const respond = (status: number, error?: string) => Response.json(error ? { error } : { ok: true }, { status, headers: { "Cache-Control": "no-store" } });
	if (!workspaceId || !videoId || token.length !== 72) return respond(401, "invalid_callback");
	const job = await getVideoJobRecord(workspaceId, videoId);
	if (job?.provider !== "deepinfra" || !job.meta?.deepinfraCallbackHash || !timingSafeEqual(await deepinfraTokenHash(token), job.meta.deepinfraCallbackHash)) return respond(401, "invalid_callback");
	let payload: any;
	let result: ReturnType<typeof deepinfraVideoResult>;
	try {
		payload = JSON.parse(rawBody);
		if (typeof payload?.request_id !== "string" || !payload.request_id || (job.nativeId && job.nativeId !== payload.request_id)) return respond(409, "request_id_mismatch");
		result = deepinfraVideoResult(payload);
	} catch { return respond(400, "invalid_provider_result"); }
	// Do not let a later or repeated callback overwrite terminal cost or output metadata.
	if (!["completed", "failed", "cancelled", "expired"].includes(job.status ?? "")) {
		await saveVideoJobMeta(workspaceId, videoId, { ...job.meta, providerTaskId: payload.request_id, submissionState: "accepted",
			...(result.status === "completed" ? { deepinfraNativeCostUsd: result.cost, downloadUrl: result.downloadUrl } : {}) }, payload.request_id, result.status);
	}
	await finalizeVideoJob({ workspaceId, videoId, providerId: "deepinfra", status: result.status, model: job.model, seconds: job.meta.seconds, isByok: job.meta.keySource === "byok" });
	dispatchVideoWebhookEventInBackground({ workspaceId, videoId, eventType: result.status === "completed" ? "video.completed" : result.status === "cancelled" ? "video.cancelled" : "video.failed" });
	return respond(200);
}
