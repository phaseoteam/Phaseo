// Purpose: Finalize async video jobs when providers reach terminal states.
// Why: Billing must be tied to provider completion/failure, not client polling.
// How: Updates job status, performs idempotent completion charging, and records billing markers.

import { loadPriceCard } from "@pipeline/pricing/loader";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { applyByokServiceFee } from "@pipeline/pricing/byok-fee";
import { getSupabaseAdmin } from "@/runtime/env";
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
import { computeVideoPricedUsage } from "@core/video-pricing";

const VIDEO_CAPTURE_REQUEST_ID_PREFIX = "video_capture";
const GATEWAY_REQUEST_SYNC_MAX_ATTEMPTS = 3;
const GATEWAY_REQUEST_SYNC_RETRY_MS = 200;

type GatewayRequestSyncResult = "updated" | "skipped_no_request_id" | "not_found" | "error";

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
	if (provider === "minimax" || provider === "minimax-lightning") {
		const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
		const lower = withoutModelsPrefix.toLowerCase();
		const withoutNamespace = lower.replace(/^minimax\//, "");
		const minimaxAliasMap: Record<string, string> = {
			"minimax-hailuo-2.3": "minimax/hailuo-2.3",
			"minimax-hailuo-2.3-fast": "minimax/hailuo-2.3-fast",
			"minimax-hailuo-02": "minimax/hailuo-02",
			"hailuo-2.3": "minimax/hailuo-2.3",
			"hailuo-2.3-fast": "minimax/hailuo-2.3-fast",
			"hailuo-02": "minimax/hailuo-02",
		};
		out.push(`minimax/${withoutNamespace}`);
		const mapped = minimaxAliasMap[withoutNamespace] ?? minimaxAliasMap[lower];
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

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function nanosToUsd(value: number | undefined): number | undefined {
	if (!Number.isFinite(value ?? NaN)) return undefined;
	const nanos = Math.max(0, Number(value));
	return nanos / 1e9;
}

function resolveDurationMs(args: {
	createdAtIso?: string | null;
	createdAtMs?: number | null;
	finalizedAtIso: string;
}): number | undefined {
	const finalizedAtMs = Date.parse(args.finalizedAtIso);
	if (!Number.isFinite(finalizedAtMs)) return undefined;
	const isoCreatedAtMs =
		typeof args.createdAtIso === "string" && args.createdAtIso.trim().length > 0
			? Date.parse(args.createdAtIso)
			: NaN;
	const sourceCreatedAtMs =
		Number.isFinite(isoCreatedAtMs)
			? isoCreatedAtMs
			: toFiniteNumber(args.createdAtMs);
	if (!Number.isFinite(sourceCreatedAtMs ?? NaN)) return undefined;
	return Math.max(0, Math.round(finalizedAtMs - Number(sourceCreatedAtMs)));
}

function extractPricedTotalNanos(pricedUsage?: Record<string, unknown>): number | undefined {
	if (!pricedUsage) return undefined;
	const usage = pricedUsage as Record<string, unknown>;
	const pricing =
		usage.pricing && typeof usage.pricing === "object" && !Array.isArray(usage.pricing)
			? (usage.pricing as Record<string, unknown>)
			: null;
	const breakdown =
		usage.pricing_breakdown &&
		typeof usage.pricing_breakdown === "object" &&
		!Array.isArray(usage.pricing_breakdown)
			? (usage.pricing_breakdown as Record<string, unknown>)
			: null;
	return (
		toFiniteNumber(pricing?.total_nanos) ??
		toFiniteNumber(usage.total_nanos) ??
		toFiniteNumber(breakdown?.total_nanos)
	);
}

function extractPricedCostUsd(pricedUsage?: Record<string, unknown>): number | undefined {
	if (!pricedUsage) return undefined;
	const usage = pricedUsage as Record<string, unknown>;
	const pricing =
		usage.pricing && typeof usage.pricing === "object" && !Array.isArray(usage.pricing)
			? (usage.pricing as Record<string, unknown>)
			: null;
	const direct =
		toFiniteNumber(pricing?.cost_usd) ??
		toFiniteNumber(usage.cost_usd) ??
		toFiniteNumber(usage.costUsd);
	if (direct != null) return Math.max(0, direct);
	const fromNanos = nanosToUsd(extractPricedTotalNanos(pricedUsage));
	return fromNanos != null ? Math.max(0, fromNanos) : undefined;
}

function buildPricingBreakdownMeta(args: {
	costNanos?: number;
	costUsd?: number;
	pricedUsage?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
	const fromUsage =
		args.pricedUsage &&
		typeof (args.pricedUsage as any).pricing_breakdown === "object" &&
		(args.pricedUsage as any).pricing_breakdown !== null
			? ((args.pricedUsage as any).pricing_breakdown as Record<string, unknown>)
			: undefined;
	if (fromUsage) return fromUsage;
	if (args.costNanos == null && args.costUsd == null) return undefined;
	return {
		...(args.costNanos != null ? { total_nanos: Math.max(0, Math.round(args.costNanos)) } : {}),
		...(args.costUsd != null ? { total_usd_str: Math.max(0, args.costUsd).toFixed(9) } : {}),
	};
}

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toPositiveFinite(value: unknown): number | null {
	const parsed = toFiniteNumber(value);
	if (parsed == null || parsed <= 0) return null;
	return parsed;
}

function extractPricingLines(pricedUsage?: Record<string, unknown>): unknown[] | undefined {
	const pricing =
		pricedUsage &&
		typeof (pricedUsage as any).pricing === "object" &&
		(pricedUsage as any).pricing !== null
			? ((pricedUsage as any).pricing as Record<string, unknown>)
			: null;
	const lines = pricing?.lines;
	if (!Array.isArray(lines)) return undefined;
	return lines;
}

function shouldMarkVideoJobBilled(syncResult: GatewayRequestSyncResult): boolean {
	return syncResult === "updated" || syncResult === "skipped_no_request_id";
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncGatewayRequestFromVideoFinalization(args: {
	teamId: string;
	requestId?: string | null;
	costNanos?: number | null;
	costUsd?: number | null;
	seconds?: number | null;
	resolution?: string | null;
	quality?: string | null;
	durationMs?: number | null;
	pricingLines?: unknown[] | null;
}): Promise<GatewayRequestSyncResult> {
	const requestId = normalizeOptionalText(args.requestId);
	if (!requestId) return "skipped_no_request_id";

	const supabase = getSupabaseAdmin();
	for (let attempt = 1; attempt <= GATEWAY_REQUEST_SYNC_MAX_ATTEMPTS; attempt += 1) {
		try {
			const { data: rows, error: readError } = await supabase
				.from("gateway_requests")
				.select("id,created_at,usage,pricing_lines")
				.eq("team_id", args.teamId)
				.eq("request_id", requestId)
				.order("created_at", { ascending: false })
				.limit(1);
			if (readError) throw readError;
			const row = Array.isArray(rows) ? rows[0] : null;
			if (!row) {
				if (attempt < GATEWAY_REQUEST_SYNC_MAX_ATTEMPTS) {
					await wait(GATEWAY_REQUEST_SYNC_RETRY_MS * attempt);
					continue;
				}
				console.warn("video_gateway_request_sync_not_found", {
					teamId: args.teamId,
					requestId,
					attempt,
				});
				return "not_found";
			}

			const usage =
				row.usage && typeof row.usage === "object" && !Array.isArray(row.usage)
					? { ...(row.usage as Record<string, unknown>) }
					: {};
			const seconds = toPositiveFinite(args.seconds);
			const resolution = normalizeOptionalText(args.resolution);
			const quality = normalizeOptionalText(args.quality);
			const costUsd = toFiniteNumber(args.costUsd);
			if (seconds != null) usage.output_video_seconds = seconds;
			if (resolution) {
				usage.resolution = resolution;
				usage.video_resolution = resolution;
			}
			if (quality) usage.video_quality = quality;
			if (costUsd != null) {
				usage.cost_usd = Math.max(0, costUsd);
				usage.costUsd = Math.max(0, costUsd);
			}

			const updatePatch: Record<string, unknown> = { usage };
			const costNanos = toFiniteNumber(args.costNanos);
			if (costNanos != null) updatePatch.cost_nanos = Math.max(0, Math.round(costNanos));
			const durationMs = toFiniteNumber(args.durationMs);
			if (durationMs != null) updatePatch.generation_ms = Math.max(0, Math.round(durationMs));

			const pricingLines =
				Array.isArray(args.pricingLines) && args.pricingLines.length > 0
					? args.pricingLines
					: Array.isArray(row.pricing_lines)
						? row.pricing_lines
						: [];
			updatePatch.pricing_lines = pricingLines;

			const { data: updatedRows, error: updateError } = await supabase
				.from("gateway_requests")
				.update(updatePatch)
				.eq("id", row.id)
				.eq("team_id", args.teamId)
				.select("id");
			if (updateError) throw updateError;
			if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
				console.warn("video_gateway_request_sync_no_rows_updated", {
					teamId: args.teamId,
					requestId,
					gatewayRequestId: row.id,
					attempt,
				});
				if (attempt < GATEWAY_REQUEST_SYNC_MAX_ATTEMPTS) {
					await wait(GATEWAY_REQUEST_SYNC_RETRY_MS * attempt);
					continue;
				}
				return "not_found";
			}
			return "updated";
		} catch (error) {
			if (attempt < GATEWAY_REQUEST_SYNC_MAX_ATTEMPTS) {
				console.warn("video_gateway_request_sync_retrying_after_error", {
					teamId: args.teamId,
					requestId,
					attempt,
					error,
				});
				await wait(GATEWAY_REQUEST_SYNC_RETRY_MS * attempt);
				continue;
			}
			console.error("video_gateway_request_sync_failed", {
				error,
				teamId: args.teamId,
				requestId,
				attempt,
			});
			return "error";
		}
	}
	return "error";
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

	const pricedBase = computeVideoPricedUsage({
		seconds,
		card,
		model: resolvedModel || model,
		requestOptions: {
			...normalizedRequestOptions(requestOptions),
			...buildVideoPricingRequestOptions({
				size: (requestOptions as any)?.size ?? (requestOptions as any)?.video_params?.size,
				resolution: (requestOptions as any)?.resolution ?? (requestOptions as any)?.video_params?.resolution,
				input_resolution:
					(requestOptions as any)?.input_resolution ?? (requestOptions as any)?.video_params?.input_resolution,
				seconds:
					(requestOptions as any)?.seconds ??
					(requestOptions as any)?.duration_seconds ??
					(requestOptions as any)?.video_params?.seconds ??
					(requestOptions as any)?.video_params?.duration_seconds ??
					seconds,
				quality: (requestOptions as any)?.quality ?? (requestOptions as any)?.video_params?.quality,
				video_params: (requestOptions as any)?.video_params,
			}),
		},
	});
	const byokAdjusted = await applyByokServiceFee({
		teamId,
		isByok,
		baseCostNanos: Number((pricedBase as any)?.pricing?.total_nanos ?? 0) || 0,
		pricedUsage: pricedBase,
		currencyHint: "USD",
	});
	const pricedUsage = byokAdjusted.pricedUsage as unknown as Record<string, unknown> | undefined;
	const totalNanos = byokAdjusted.totalNanos;
	if (totalNanos <= 0) {
		return { charged: false, pricedUsage, reason: "zero_cost" };
	}

	const chargeRequestId = `${VIDEO_CAPTURE_REQUEST_ID_PREFIX}:${videoId}`;
	await recordUsageAndCharge({
		requestId: chargeRequestId,
		teamId,
		cost_nanos: totalNanos,
	});
	return { charged: true, pricedUsage };
}

export async function finalizeVideoJob(args: FinalizeVideoJobArgs): Promise<FinalizeVideoJobResult> {
	const existingJob = await getVideoJobRecord(args.teamId, args.videoId);
	const currentStatus = String(existingJob?.status ?? "").toLowerCase();
	const finalizedAtIso = new Date().toISOString();
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
	const durationMs = isTerminal
		? resolveDurationMs({
			createdAtIso: existingJob?.createdAt,
			createdAtMs: existingJob?.meta?.createdAt ?? null,
			finalizedAtIso,
		})
		: undefined;
	const metaPatch = isTerminal
		? {
			...(args.metaPatch ?? {}),
			finalizedAt: finalizedAtIso,
			...(typeof durationMs === "number" ? { durationMs } : {}),
		}
		: { ...(args.metaPatch ?? {}) };
	if (currentStatus !== nextStatus || Object.keys(metaPatch).length > 0) {
		await setVideoJobStatus(args.teamId, args.videoId, nextStatus, metaPatch);
	}

	const videoMeta = await getVideoJobMeta(args.teamId, args.videoId);
	const reservationId = String(videoMeta?.reservationId ?? `${VIDEO_RESERVATION_PREFIX}${args.videoId}`).trim();
	const requestIdForAudit = normalizeOptionalText(videoMeta?.requestId);
	const secondsForAudit = resolveVideoUsageSeconds(videoMeta, args.seconds);
	const resolutionForAudit =
		normalizeOptionalText((args.requestOptions as any)?.resolution) ??
		normalizeOptionalText((args.requestOptions as any)?.input_resolution) ??
		normalizeOptionalText((args.requestOptions as any)?.size) ??
		normalizeOptionalText((args.requestOptions as any)?.video_params?.resolution) ??
		normalizeOptionalText((args.requestOptions as any)?.video_params?.input_resolution) ??
		normalizeOptionalText((args.requestOptions as any)?.video_params?.size) ??
		normalizeOptionalText(videoMeta?.resolution);
	const qualityForAudit =
		normalizeOptionalText((args.requestOptions as any)?.quality) ??
		normalizeOptionalText((args.requestOptions as any)?.video_params?.quality) ??
		normalizeOptionalText(videoMeta?.quality);

	if (nextStatus === "failed") {
		try {
			const released = await releaseWalletReservation({
				teamId: args.teamId,
				reservationId,
				releaseRefId: args.videoId,
			});
			await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
				finalizedAt: finalizedAtIso,
				...(typeof durationMs === "number" ? { durationMs } : {}),
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: released.status,
			});
			const syncResult = await syncGatewayRequestFromVideoFinalization({
				teamId: args.teamId,
				requestId: requestIdForAudit,
				costNanos: 0,
				costUsd: 0,
				seconds: secondsForAudit ?? null,
				resolution: resolutionForAudit,
				quality: qualityForAudit,
				durationMs: durationMs ?? null,
			});
			if (
				released.status === "released" ||
				released.status === "captured" ||
				released.status === "not_found"
			) {
				if (shouldMarkVideoJobBilled(syncResult)) {
					await markVideoJobBilled(args.teamId, args.videoId);
				} else {
					console.warn("video_mark_billed_deferred_until_gateway_sync", {
						teamId: args.teamId,
						videoId: args.videoId,
						requestId: requestIdForAudit,
						syncResult,
					});
				}
			}
			return {
				status: nextStatus,
				charged: false,
				reason: released.status,
			};
		} catch (releaseErr) {
			await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
				finalizedAt: finalizedAtIso,
				...(typeof durationMs === "number" ? { durationMs } : {}),
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: "release_failed",
			});
			await syncGatewayRequestFromVideoFinalization({
				teamId: args.teamId,
				requestId: requestIdForAudit,
				costNanos: 0,
				costUsd: 0,
				seconds: secondsForAudit ?? null,
				resolution: resolutionForAudit,
				quality: qualityForAudit,
				durationMs: durationMs ?? null,
			});
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
			const costNanos = Math.max(0, Number(captured.amountNanos ?? 0) || 0);
			const costUsd = nanosToUsd(costNanos) ?? 0;
			await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
				finalizedAt: finalizedAtIso,
				...(typeof durationMs === "number" ? { durationMs } : {}),
				charged: true,
				costNanos,
				costUsd,
				billingReason: captured.status,
				pricingBreakdown: buildPricingBreakdownMeta({ costNanos, costUsd }),
			});
			const syncResult = await syncGatewayRequestFromVideoFinalization({
				teamId: args.teamId,
				requestId: requestIdForAudit,
				costNanos,
				costUsd,
				seconds: secondsForAudit ?? null,
				resolution: resolutionForAudit,
				quality: qualityForAudit,
				durationMs: durationMs ?? null,
			});
			if (shouldMarkVideoJobBilled(syncResult)) {
				await markVideoJobBilled(args.teamId, args.videoId);
			} else {
				console.warn("video_mark_billed_deferred_until_gateway_sync", {
					teamId: args.teamId,
					videoId: args.videoId,
					requestId: requestIdForAudit,
					syncResult,
				});
			}
			return {
				status: nextStatus,
				charged: true,
				reason: captured.status,
			};
		}
		if (captured.status === "released") {
			await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
				finalizedAt: finalizedAtIso,
				...(typeof durationMs === "number" ? { durationMs } : {}),
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: captured.status,
			});
			const syncResult = await syncGatewayRequestFromVideoFinalization({
				teamId: args.teamId,
				requestId: requestIdForAudit,
				costNanos: 0,
				costUsd: 0,
				seconds: secondsForAudit ?? null,
				resolution: resolutionForAudit,
				quality: qualityForAudit,
				durationMs: durationMs ?? null,
			});
			if (shouldMarkVideoJobBilled(syncResult)) {
				await markVideoJobBilled(args.teamId, args.videoId);
			} else {
				console.warn("video_mark_billed_deferred_until_gateway_sync", {
					teamId: args.teamId,
					videoId: args.videoId,
					requestId: requestIdForAudit,
					syncResult,
				});
			}
			return {
				status: nextStatus,
				charged: false,
				reason: captured.status,
			};
		}
		const shouldFallbackToLegacyDebit =
			captured.status === "not_found" || captured.status === "unknown";
		if (!shouldFallbackToLegacyDebit) {
			await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
				finalizedAt: finalizedAtIso,
				...(typeof durationMs === "number" ? { durationMs } : {}),
				charged: false,
				billingReason: captured.status,
			});
			return {
				status: nextStatus,
				charged: false,
				reason: captured.status,
			};
		}
	} catch (captureErr) {
		await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
			finalizedAt: finalizedAtIso,
			...(typeof durationMs === "number" ? { durationMs } : {}),
			charged: false,
			billingReason: "capture_failed",
		});
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
			size:
				(args.requestOptions as any)?.size ??
				(args.requestOptions as any)?.video_params?.size ??
				videoMeta?.resolution,
			resolution:
				(args.requestOptions as any)?.resolution ??
				(args.requestOptions as any)?.input_resolution ??
				(args.requestOptions as any)?.video_params?.resolution ??
				(args.requestOptions as any)?.video_params?.input_resolution ??
				videoMeta?.resolution,
			input_resolution:
				(args.requestOptions as any)?.input_resolution ??
				(args.requestOptions as any)?.resolution ??
				(args.requestOptions as any)?.video_params?.input_resolution ??
				(args.requestOptions as any)?.video_params?.resolution ??
				videoMeta?.resolution,
			seconds:
				(args.requestOptions as any)?.seconds ??
				(args.requestOptions as any)?.duration_seconds ??
				(args.requestOptions as any)?.video_params?.seconds ??
				(args.requestOptions as any)?.video_params?.duration_seconds ??
				args.seconds ??
				videoMeta?.seconds,
			quality:
				(args.requestOptions as any)?.quality ??
				(args.requestOptions as any)?.video_params?.quality ??
				videoMeta?.quality,
			video_params: (args.requestOptions as any)?.video_params,
		}),
	};
	if (!model) {
		await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
			finalizedAt: finalizedAtIso,
			...(typeof durationMs === "number" ? { durationMs } : {}),
			charged: false,
			billingReason: "missing_model",
		});
		return {
			status: nextStatus,
			charged: false,
			reason: "missing_model",
		};
	}
	if (seconds == null) {
		await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
			finalizedAt: finalizedAtIso,
			...(typeof durationMs === "number" ? { durationMs } : {}),
			charged: false,
			billingReason: "missing_seconds",
		});
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
	const fallbackCostNanos = extractPricedTotalNanos(charge.pricedUsage);
	const fallbackCostUsd = extractPricedCostUsd(charge.pricedUsage);
	await setVideoJobStatus(args.teamId, args.videoId, nextStatus, {
		finalizedAt: finalizedAtIso,
		...(typeof durationMs === "number" ? { durationMs } : {}),
		charged: charge.charged,
		...(typeof fallbackCostNanos === "number" ? { costNanos: Math.max(0, fallbackCostNanos) } : {}),
		...(typeof fallbackCostUsd === "number" ? { costUsd: Math.max(0, fallbackCostUsd) } : {}),
		billingReason: charge.reason ?? null,
		...(charge.pricedUsage ? { pricedUsage: charge.pricedUsage } : {}),
		...(buildPricingBreakdownMeta({
			costNanos: fallbackCostNanos,
			costUsd: fallbackCostUsd,
			pricedUsage: charge.pricedUsage,
		})
			? {
				pricingBreakdown: buildPricingBreakdownMeta({
					costNanos: fallbackCostNanos,
					costUsd: fallbackCostUsd,
					pricedUsage: charge.pricedUsage,
				}),
			}
			: {}),
	});
	const syncResult = await syncGatewayRequestFromVideoFinalization({
		teamId: args.teamId,
		requestId: requestIdForAudit,
		costNanos: typeof fallbackCostNanos === "number" ? fallbackCostNanos : null,
		costUsd: typeof fallbackCostUsd === "number" ? fallbackCostUsd : null,
		seconds: secondsForAudit ?? null,
		resolution: resolutionForAudit,
		quality: qualityForAudit,
		durationMs: durationMs ?? null,
		pricingLines: extractPricingLines(charge.pricedUsage),
	});
	if ((charge.charged || charge.reason === "zero_cost" || charge.reason === "already_billed")) {
		if (shouldMarkVideoJobBilled(syncResult)) {
			await markVideoJobBilled(args.teamId, args.videoId);
		} else {
			console.warn("video_mark_billed_deferred_until_gateway_sync", {
				teamId: args.teamId,
				videoId: args.videoId,
				requestId: requestIdForAudit,
				syncResult,
				chargeReason: charge.reason ?? null,
				charged: charge.charged,
			});
		}
	}

	return {
		status: nextStatus,
		charged: charge.charged,
		pricedUsage: charge.pricedUsage,
		reason: charge.reason,
	};
}
