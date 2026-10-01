import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { saveVideoJobMeta, setVideoJobStatus } from "@core/video-jobs";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

const emptyBill = { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null };

function failure(status: number, message: string): ExecutorResult {
	return { kind: "completed", ir: undefined, bill: { ...emptyBill },
		upstream: Response.json({ error: { type: "invalid_request_error", message } }, { status }),
		keySource: null, byokKeyId: null };
}

// Novita's video API is native /v3/async, not its OpenAI-compatible text API.
// Only reviewed model contracts are accepted; never infer a route from user input.
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model;
	if (!["seedance-v1.5-pro", "seedance-v1.5-pro-t2v", "seedance-v1.5-pro-i2v", "bytedance/seedance-1.5-pro", "bytedance/seedance-1-5-pro"].includes(model)) {
		return failure(400, "This Novita video model does not have a validated native request contract.");
	}
	const seconds = Number(ir.durationSeconds ?? ir.duration ?? ir.seconds ?? 5);
	const size = ir.resolution ?? ir.size ?? "720p";
	const image = typeof ir.inputReference === "string" ? ir.inputReference : typeof ir.inputImage === "string" ? ir.inputImage : undefined;
	const lastImage = typeof ir.lastFrame === "string" ? ir.lastFrame : undefined;
	const options = ir.providerParams ?? {};
	if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) return failure(400, "Novita Seedance 1.5 requires 4–12 seconds.");
	if (!["480p", "720p"].includes(size)) return failure(400, "Novita Seedance 1.5 currently supports priced 480p and 720p requests.");
	if ((ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1) return failure(400, "Novita video requests support one output.");
	if (ir.inputReferences?.some((ref) => ref.type !== "image" || (ref.role !== "first_frame" && ref.role !== "last_frame"))) {
		return failure(400, "Novita Seedance 1.5 accepts first and last image frames, not generic media references.");
	}
	if (lastImage && !image) return failure(400, "A last frame requires a first frame.");
	if (model.endsWith("-i2v") && !image) return failure(400, "This Novita model requires a first frame.");
	if (model.endsWith("-t2v") && image) return failure(400, "This Novita model only accepts text input.");
	const allowed = new Set(["watermark", "camera_fixed", "service_tier", "fps"]);
	if (Object.keys(options).some((key) => !allowed.has(key))) return failure(400, "Unsupported Novita video provider option.");
	if (options.service_tier != null && options.service_tier !== "default") return failure(400, "Novita flex pricing is not enabled; use service_tier default.");
	if (options.fps != null && options.fps !== 24) return failure(400, "Novita Seedance 1.5 requires 24 fps.");
	if (["watermark", "camera_fixed"].some((key) => options[key] != null && typeof options[key] !== "boolean")) return failure(400, "watermark and camera_fixed must be booleans.");
	const ratio = ir.aspectRatio ?? (image ? "adaptive" : "16:9");
	if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", ...(image ? ["adaptive"] : [])].includes(ratio)) return failure(400, "Unsupported Novita aspect ratio.");
	const generateAudio = ir.generateAudio ?? true;
	const body = { ...options, prompt: ir.prompt, duration: seconds, resolution: size, ratio,
		generate_audio: generateAudio, ...(ir.seed != null ? { seed: ir.seed } : {}),
		...(image ? { image } : {}), ...(lastImage ? { last_image: lastImage } : {}) };
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.NOVITA_API_KEY);
	const reservation = await reserveVideoGenerationCredits({ workspaceId: args.workspaceId, videoId: args.requestId,
		providerId: args.providerId, model, seconds, pricingCard: args.pricingCard, isByok: key.source === "byok",
		requestOptions: buildVideoPricingRequestOptions({ size, seconds, audio: generateAudio, aspect_ratio: ratio }) });
	if (!reservation.held && reservation.status !== "skip_zero_cost") {
		return failure(reservation.status.startsWith("insufficient") ? 402 : 503, "Unable to secure priced video credits before submission.");
	}
	const meta = { provider: args.providerId, requestId: args.requestId, model, seconds, resolution: size,
		audio: generateAudio, aspectRatio: ratio, reservationId: reservation.reservationId,
		reservedNanos: reservation.amountNanos, reservationStatus: reservation.status,
		keySource: key.source, byokKeyId: key.byokId, webhook: ir.webhook as Record<string, unknown> | null,
		outputAccess: ir.outputAccess ?? "both" as const };
	try {
		await saveVideoJobMeta(args.workspaceId, args.requestId, { ...meta, submissionState: "submitting" }, null, "pending");
	} catch (error) {
		await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId: reservation.reservationId, releaseRefId: args.requestId });
		throw error;
	}
	let response: Response;
	try {
		response = await fetchUpstream(args, `https://api.novita.ai/v3/async/seedance-v1.5-pro-${image ? "i2v" : "t2v"}`, {
			method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
		});
	} catch (error) {
		await setVideoJobStatus(args.workspaceId, args.requestId, "pending", { submissionState: "unknown" }).catch(() => undefined);
		throw error;
	}
	if (!response.ok) {
		if (response.status < 500 && response.status !== 408) {
			await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId: reservation.reservationId, releaseRefId: args.requestId });
			await setVideoJobStatus(args.workspaceId, args.requestId, "failed", { submissionState: "rejected" });
		} else {
			await setVideoJobStatus(args.workspaceId, args.requestId, "pending", { submissionState: "unknown" });
		}
		return { kind: "completed", ir: undefined, bill: { ...emptyBill }, upstream: response, keySource: key.source, byokKeyId: key.byokId };
	}
	const result = await response.clone().json().catch(() => null) as any;
	const nativeId = typeof result?.id === "string" ? result.id : typeof result?.task_id === "string" ? result.task_id : undefined;
	if (!nativeId) {
		await setVideoJobStatus(args.workspaceId, args.requestId, "pending", { submissionState: "unknown" });
		return failure(502, "Novita submission outcome is uncertain. Retain the gateway request ID and do not resubmit.");
	}
	await saveVideoJobMeta(args.workspaceId, args.requestId, { ...meta, providerTaskId: nativeId, submissionState: "accepted" }, nativeId, "queued");
	return { kind: "completed", bill: { ...emptyBill }, upstream: response,
		keySource: key.source, byokKeyId: key.byokId,
		ir: { id: args.requestId, nativeId, provider: args.providerId, model, status: "queued", seconds: String(seconds), size },
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}),
	};
}

export const executor: ProviderExecutor = execute;
