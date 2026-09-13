import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { saveVideoJobMeta, setVideoJobStatus } from "@core/video-jobs";
import { mapBflVideo } from "./contract";
import { bflVideoPricingOptions, trustedBflPollingUrl } from "@providers/black-forest-labs/video";

const emptyBill = { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null };

function failure(status: number, message: string): ExecutorResult {
	return { kind: "completed", ir: undefined, bill: { ...emptyBill },
		upstream: Response.json({ error: { type: "invalid_request_error", message } }, { status }),
		keySource: null, byokKeyId: null };
}

// Native FLUX 3 submission is journaled before the billable request.
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model;
	if (!["flux-3-video", "black-forest-labs/flux-3-video"].includes(model)) return failure(400, "Unsupported Black Forest Labs video model.");
	let mapped: ReturnType<typeof mapBflVideo>;
	try { mapped = mapBflVideo(ir); } catch (error) { return failure(400, (error as Error).message); }
	const { seconds, resolution: size, mode, draft, body } = mapped;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.BLACK_FOREST_LABS_API_KEY || bindings.BFL_API_KEY);
	const reservation = await reserveVideoGenerationCredits({ workspaceId: args.workspaceId, videoId: args.requestId,
		providerId: args.providerId, model, seconds, pricingCard: args.pricingCard, isByok: key.source === "byok",
		requestOptions: bflVideoPricingOptions(size, mode, draft) });
	if (!reservation.held && reservation.status !== "skip_zero_cost") {
		return failure(reservation.status.startsWith("insufficient") ? 402 : 503, "Unable to secure priced video credits before submission.");
	}
	const meta = { provider: args.providerId, requestId: args.requestId, model, seconds, resolution: size,
		audio: body.generate_audio, aspectRatio: body.aspect_ratio, bflMode: mode, bflDraft: draft, reservationId: reservation.reservationId,
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
		response = await fetchUpstream(args, "https://api.bfl.ai/v1/flux-3-video", {
			method: "POST", headers: { "x-key": key.key, "Content-Type": "application/json" }, body: JSON.stringify(body),
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
	const nativeId = typeof result?.id === "string" ? result.id : undefined;
	const pollingUrl = trustedBflPollingUrl(result?.polling_url);
	if (!nativeId || !pollingUrl) {
		await setVideoJobStatus(args.workspaceId, args.requestId, "pending", { submissionState: "unknown" });
		return failure(502, "Black Forest Labs submission outcome is uncertain. Retain the gateway request ID and do not resubmit.");
	}
	await saveVideoJobMeta(args.workspaceId, args.requestId, { ...meta, providerTaskId: nativeId, bflPollingUrl: pollingUrl, submissionState: "accepted" }, nativeId, "queued");
	return { kind: "completed", bill: { ...emptyBill }, upstream: response,
		keySource: key.source, byokKeyId: key.byokId,
		ir: { id: args.requestId, nativeId, provider: args.providerId, model, status: "queued", seconds: String(seconds), size },
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}),
	};
}

export const executor: ProviderExecutor = execute;
