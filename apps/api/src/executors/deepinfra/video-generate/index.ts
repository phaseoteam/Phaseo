import type { IRVideoGenerationRequest } from "@core/ir";
import type { ProviderExecutor, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { mapDeepinfraVideo, deepinfraTokenHash } from "@providers/deepinfra/video";
import { resolveUploadableFromString } from "@providers/openai/endpoints/uploadable";
import { imageBytesToBase64 } from "@executors/_shared/image-results";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { saveVideoJobMeta, setVideoJobStatus } from "@core/video-jobs";
import { fetchUpstream } from "@executors/_shared/timing/upstream";

function failure(status: number, message: string): ExecutorResult {
	return { kind: "completed", upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" } };
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model;
	let mapped: ReturnType<typeof mapDeepinfraVideo>;
	try { mapped = mapDeepinfraVideo(ir, model); } catch (error) { return failure(400, (error as Error).message); }
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let callback: URL;
	try {
		callback = new URL("/internal/video-webhooks/deepinfra", bindings.GATEWAY_PUBLIC_BASE_URL);
		if (callback.protocol !== "https:") throw new Error("HTTPS required");
	} catch { return failure(503, "The public gateway callback URL must be configured for DeepInfra video."); }
	const { body, images, seconds, resolution, aspectRatio, veo } = mapped;
	try {
		for (const [index, input] of images.entries()) {
			const blob = typeof input === "string" ? (await resolveUploadableFromString(input, { defaultMimeType: "image/png", fallbackFilename: "image", maxBytes: 10 * 1024 * 1024, upstreamTiming: args.upstreamTiming })).blob : input;
			if (blob.size > 10 * 1024 * 1024 || !blob.type.startsWith("image/")) throw new Error("Invalid image input.");
			body[veo ? "image" : index === 0 ? "first_frame_image" : "last_frame_image"] = imageBytesToBase64(new Uint8Array(await blob.arrayBuffer()));
		}
	} catch { return failure(400, "Unable to read the video image input."); }
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const reservation = await reserveVideoGenerationCredits({ workspaceId: args.workspaceId, videoId: args.requestId, providerId: args.providerId, model, seconds, pricingCard: args.pricingCard, isByok: key.source === "byok", requestOptions: { resolution, aspect_ratio: aspectRatio, frame_rate: 24 } });
	if (!reservation.held && reservation.status !== "skip_zero_cost") return failure(reservation.status.startsWith("insufficient") ? 402 : 503, "Unable to secure priced video credits.");
	const token = crypto.randomUUID() + crypto.randomUUID();
	callback.searchParams.set("workspace", args.workspaceId);
	callback.searchParams.set("request", args.requestId);
	callback.searchParams.set("token", token);
	body.webhook = callback.toString();
	const meta = { provider: args.providerId, requestId: args.requestId, model, seconds, resolution, aspectRatio,
		deepinfraCallbackHash: await deepinfraTokenHash(token), reservationId: reservation.reservationId, reservedNanos: reservation.amountNanos,
		reservationStatus: reservation.status, keySource: key.source, byokKeyId: key.byokId, webhook: ir.webhook as Record<string, unknown> | null, outputAccess: ir.outputAccess ?? "both" as const };
	try { await saveVideoJobMeta(args.workspaceId, args.requestId, { ...meta, submissionState: "submitting" }, null, "pending"); }
	catch (error) { await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId: reservation.reservationId, releaseRefId: args.requestId }); throw error; }
	// On transport failure the journal remains open; a callback can still complete it.
	const upstream = await fetchUpstream(args, `https://api.deepinfra.com/v1/inference/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	if (!upstream.ok) {
		if (upstream.status < 500 && upstream.status !== 408) {
			await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId: reservation.reservationId, releaseRefId: args.requestId });
			await setVideoJobStatus(args.workspaceId, args.requestId, "failed", { submissionState: "rejected" });
		}
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId };
	}
	const result = await upstream.clone().json().catch(() => null) as any;
	if (typeof result?.request_id !== "string" || !result.request_id) {
		return failure(502, "DeepInfra submission is uncertain. Retain the gateway request ID and do not resubmit.");
	}
	await saveVideoJobMeta(args.workspaceId, args.requestId, { ...meta, providerTaskId: result.request_id, submissionState: "accepted" }, result.request_id, "queued");
	return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId,
		ir: { id: args.requestId, nativeId: result.request_id, provider: args.providerId, model, status: "queued", seconds: String(seconds), size: resolution } };
};
