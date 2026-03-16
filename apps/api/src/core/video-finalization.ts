// Purpose: Finalize async video jobs when providers reach terminal states.
// Why: Billing must be tied to provider completion/failure, not client polling.
// How: Updates job status, performs idempotent completion charging, and records billing markers.

import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBill } from "@pipeline/pricing/engine";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { applyByokServiceFee } from "@pipeline/pricing/byok-fee";
import {
	getVideoJobMeta,
	getVideoJobRecord,
	isVideoJobBilled,
	markVideoJobBilled,
	setVideoJobStatus,
	type VideoJobMeta,
} from "@core/video-jobs";
import { captureWalletReservation, releaseWalletReservation } from "@core/wallet-reservations";
import { VIDEO_RESERVATION_PREFIX } from "@core/video-reservations";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

const VIDEO_CAPTURE_REQUEST_ID_PREFIX = "video_capture";

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function normalizeVideoModelForPricing(providerId: string, model: string): string[] {
	const trimmed = model.trim();
	if (!trimmed) return [];
	const out: string[] = [trimmed];
	const provider = providerId.trim().toLowerCase();

	if (provider === "openai") {
		const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
		const bareModel = withoutModelsPrefix.replace(/^openai\//i, "");
		if (bareModel.length > 0) out.push(`openai/${bareModel}`);
		if (/^sora-2(?:-|$)/i.test(bareModel)) out.push("openai/sora-2");
		if (/^sora-2-pro(?:-|$)/i.test(bareModel)) out.push("openai/sora-2-pro-2025-10-03");
	}

	if (provider === "google-ai-studio" || provider === "google-vertex") {
		const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
		const withoutGooglePrefix = withoutModelsPrefix.replace(/^google\//i, "");
		const googleAliasMap: Record<string, string> = {
			"veo-3.1-fast-generate-preview": "google/veo-3.1-fast-preview",
			"veo-3.1-generate-preview": "google/veo-3.1-preview",
			"veo-3.0-fast-generate-001": "google/veo-3-fast-preview",
			"veo-3.0-generate-001": "google/veo-3-preview",
			"veo-2.0-generate-001": "google/veo-2",
		};
		out.push(`google/${withoutGooglePrefix}`);
		const mapped = googleAliasMap[withoutGooglePrefix];
		if (mapped) out.push(mapped);
	}

	return [...new Set(out.map((value) => value.trim()).filter(Boolean))];
}

function resolveBillingModel(
	providerId: string,
	videoMeta: VideoJobMeta | null,
	...modelCandidates: Array<unknown>
): string {
	const orderedCandidates: string[] = [];
	if (typeof videoMeta?.model === "string") orderedCandidates.push(videoMeta.model);
	for (const candidate of modelCandidates) {
		if (typeof candidate === "string") orderedCandidates.push(candidate);
	}

	for (const candidate of orderedCandidates) {
		const normalized = normalizeVideoModelForPricing(providerId, candidate);
		if (normalized.length > 0) return normalized[0]!;
	}
	return "";
}

function resolveVideoUsageSeconds(videoMeta: VideoJobMeta | null, ...candidates: unknown[]): number | undefined {
	const preferred = toPositiveNumber(videoMeta?.seconds);
	if (preferred != null) return preferred;
	for (const candidate of candidates) {
		const parsed = toPositiveNumber(candidate);
		if (parsed != null) return parsed;
	}
	return undefined;
}

function normalizedRequestOptions(source: Record<string, unknown> | undefined): Record<string, unknown> {
	if (!source) return {};
	return Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0),
	);
}

export type FinalizeVideoJobArgs = {
	teamId: string;
	videoId: string;
	providerId: string;
	status: "queued" | "in_progress" | "completed" | "failed";
	model?: string | null;
	seconds?: number | null;
	requestOptions?: Record<string, unknown>;
	isByok?: boolean;
	metaPatch?: Record<string, unknown>;
};

export type FinalizeVideoJobResult = {
	status: "queued" | "in_progress" | "completed" | "failed";
	charged: boolean;
	pricedUsage?: Record<string, unknown>;
	reason?: string;
};

function toStatusRank(status: string): number {
	switch (status) {
		case "queued":
			return 1;
		case "in_progress":
			return 2;
		case "completed":
		case "failed":
			return 3;
		default:
			return 0;
	}
}

function isTerminalStatus(status: string): boolean {
	return status === "completed" || status === "failed";
}

async function chargeVideoCompletion(args: {
	teamId: string;
	videoId: string;
	providerId: string;
	model: string;
	seconds: number;
	requestOptions?: Record<string, unknown>;
	isByok?: boolean;
}): Promise<{ charged: boolean; pricedUsage?: Record<string, unknown>; reason?: string }> {
	const { teamId, videoId, providerId, model, seconds, requestOptions, isByok = false } = args;
	if (!videoId || !model || !Number.isFinite(seconds) || seconds <= 0) {
		return { charged: false, reason: "invalid_billing_inputs" };
	}

	const alreadyBilled = await isVideoJobBilled(teamId, videoId);
	if (alreadyBilled) return { charged: false, reason: "already_billed" };

	const modelCandidates = normalizeVideoModelForPricing(providerId, model);
	const endpointCandidates = ["video.generate", "video.generation", "video.generations"];
	let resolvedModel = "";
	let card = null as Awaited<ReturnType<typeof loadPriceCard>>;
	for (const modelCandidate of modelCandidates.length > 0 ? modelCandidates : [model]) {
		for (const endpointCandidate of endpointCandidates) {
			card = await loadPriceCard(providerId, modelCandidate, endpointCandidate);
			if (card) {
				resolvedModel = modelCandidate;
				break;
			}
		}
		if (card) break;
	}
	if (!card) return { charged: false, reason: "price_card_missing" };

	const pricedBase = computeBill(
		{ output_video_seconds: seconds },
		card,
		{
			...normalizedRequestOptions(requestOptions),
			...buildVideoPricingRequestOptions({
				resolution: (requestOptions as any)?.resolution ?? (requestOptions as any)?.video_params?.resolution,
				quality: (requestOptions as any)?.quality ?? (requestOptions as any)?.video_params?.quality,
				video_params: (requestOptions as any)?.video_params,
			}),
			model: resolvedModel || model,
		},
	);
	const byokAdjusted = await applyByokServiceFee({
		teamId,
		isByok,
		baseCostNanos: Number(pricedBase?.pricing?.total_nanos ?? 0) || 0,
		pricedUsage: pricedBase,
		currencyHint: "USD",
	});
	const pricedUsage = byokAdjusted.pricedUsage as unknown as Record<string, unknown> | undefined;
	const totalNanos = byokAdjusted.totalNanos;
	if (totalNanos <= 0) {
		await markVideoJobBilled(teamId, videoId);
		return { charged: false, pricedUsage, reason: "zero_cost" };
	}

	const chargeRequestId = `${VIDEO_CAPTURE_REQUEST_ID_PREFIX}:${videoId}`;
	await recordUsageAndCharge({
		requestId: chargeRequestId,
		teamId,
		cost_nanos: totalNanos,
	});
	await markVideoJobBilled(teamId, videoId);
	return { charged: true, pricedUsage };
}

export async function finalizeVideoJob(args: FinalizeVideoJobArgs): Promise<FinalizeVideoJobResult> {
	const existingJob = await getVideoJobRecord(args.teamId, args.videoId);
	const currentStatus = String(existingJob?.status ?? "").toLowerCase();
	let nextStatus = args.status;
	if (isTerminalStatus(currentStatus)) {
		if (currentStatus !== args.status) {
			console.warn("video_finalize_stale_terminal_status_ignored", {
				teamId: args.teamId,
				videoId: args.videoId,
				currentStatus,
				incomingStatus: args.status,
			});
		}
		nextStatus = currentStatus as FinalizeVideoJobArgs["status"];
	} else if (currentStatus && toStatusRank(args.status) < toStatusRank(currentStatus)) {
		console.warn("video_finalize_status_downgrade_ignored", {
			teamId: args.teamId,
			videoId: args.videoId,
			currentStatus,
			incomingStatus: args.status,
		});
		nextStatus = currentStatus as FinalizeVideoJobArgs["status"];
	}

	const isTerminal = nextStatus === "completed" || nextStatus === "failed";
	const metaPatch = isTerminal
		? {
			...(args.metaPatch ?? {}),
			finalizedAt: new Date().toISOString(),
		}
		: { ...(args.metaPatch ?? {}) };
	if (currentStatus !== nextStatus || Object.keys(metaPatch).length > 0) {
		await setVideoJobStatus(args.teamId, args.videoId, nextStatus, metaPatch);
	}

	const videoMeta = await getVideoJobMeta(args.teamId, args.videoId);
	const reservationId = String(videoMeta?.reservationId ?? `${VIDEO_RESERVATION_PREFIX}${args.videoId}`).trim();

	if (nextStatus === "failed") {
		try {
			const released = await releaseWalletReservation({
				teamId: args.teamId,
				reservationId,
				releaseRefId: args.videoId,
			});
			if (
				released.status === "released" ||
				released.status === "captured" ||
				released.status === "not_found"
			) {
				await markVideoJobBilled(args.teamId, args.videoId);
			}
			return {
				status: nextStatus,
				charged: false,
				reason: released.status,
			};
		} catch (releaseErr) {
			console.error("video_release_failed", {
				error: releaseErr,
				teamId: args.teamId,
				videoId: args.videoId,
			});
			return {
				status: nextStatus,
				charged: false,
				reason: "release_failed",
			};
		}
	}

	if (nextStatus !== "completed") {
		return {
			status: nextStatus,
			charged: false,
			reason: "non_completed_terminal",
		};
	}

	try {
		const captured = await captureWalletReservation({
			teamId: args.teamId,
			reservationId,
			captureRefId: args.videoId,
		});
		if (captured.status === "captured" && (captured.applied || captured.alreadyApplied)) {
			await markVideoJobBilled(args.teamId, args.videoId);
			return {
				status: nextStatus,
				charged: true,
				reason: captured.status,
			};
		}
		if (captured.status === "released") {
			await markVideoJobBilled(args.teamId, args.videoId);
			return {
				status: nextStatus,
				charged: false,
				reason: captured.status,
			};
		}
		const shouldFallbackToLegacyDebit =
			captured.status === "not_found" || captured.status === "unknown";
		if (!shouldFallbackToLegacyDebit) {
			return {
				status: nextStatus,
				charged: false,
				reason: captured.status,
			};
		}
	} catch (captureErr) {
		console.error("video_capture_reservation_failed", {
			error: captureErr,
			teamId: args.teamId,
			videoId: args.videoId,
		});
		return {
			status: nextStatus,
			charged: false,
			reason: "capture_failed",
		};
	}

	const model = resolveBillingModel(args.providerId, videoMeta, args.model);
	const seconds = resolveVideoUsageSeconds(videoMeta, args.seconds);
	const requestOptions = {
		...normalizedRequestOptions(args.requestOptions),
		...buildVideoPricingRequestOptions({
			resolution:
				(args.requestOptions as any)?.resolution ??
				(args.requestOptions as any)?.video_params?.resolution ??
				videoMeta?.resolution,
			quality:
				(args.requestOptions as any)?.quality ??
				(args.requestOptions as any)?.video_params?.quality ??
				videoMeta?.quality,
		}),
	};
	if (!model) {
		return {
			status: nextStatus,
			charged: false,
			reason: "missing_model",
		};
	}
	if (seconds == null) {
		return {
			status: nextStatus,
			charged: false,
			reason: "missing_seconds",
		};
	}

	const charge = await chargeVideoCompletion({
		teamId: args.teamId,
		videoId: args.videoId,
		providerId: args.providerId,
		model,
		seconds,
		requestOptions,
		isByok: args.isByok ?? (videoMeta?.keySource === "byok"),
	});

	return {
		status: nextStatus,
		charged: charge.charged,
		pricedUsage: charge.pricedUsage,
		reason: charge.reason,
	};
}
