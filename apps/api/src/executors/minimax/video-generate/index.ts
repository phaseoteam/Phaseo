// Purpose: Executor for minimax / video-generate.
// Why: Uses MiniMax native video APIs directly instead of relay providers.
// How: Submits async jobs to /v1/video_generation and returns normalized queued IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { computeBill } from "@pipeline/pricing/engine";

const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io";

function encodeMiniMaxVideoId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${MINIMAX_VIDEO_PREFIX}${b64}`;
}

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

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMiniMaxResolutionForPricing(value: unknown): string | undefined {
	const raw = toNonEmptyString(value);
	if (!raw) return undefined;
	const pMatch = raw.match(/^(\d+)\s*p$/i);
	if (pMatch) return `${pMatch[1]}P`;
	return raw;
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function toVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded" || status === "success" || status === "finished") {
		return "completed";
	}
	if (status === "fail" || status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function extractTaskId(json: any): string | undefined {
	const taskId = json?.task_id ?? json?.taskId ?? json?.id ?? json?.data?.task_id ?? json?.data?.taskId;
	if (taskId == null) return undefined;
	const value = String(taskId).trim();
	return value.length > 0 ? value : undefined;
}

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const direct =
		json?.video_url ??
		json?.videoUrl ??
		json?.download_url ??
		json?.data?.video_url ??
		json?.data?.videoUrl ??
		json?.output?.video_url ??
		json?.output?.videoUrl;
	if (typeof direct === "string" && direct.length > 0) {
		return [{ index: 0, uri: direct, mime_type: "video/mp4" }];
	}
	return [];
}

function isMiniMaxImageToVideoOnlyModel(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized === "minimax-hailuo-2.3-fast" || normalized.endsWith("/hailuo-2.3-fast");
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "video-01";
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.MINIMAX_API_KEY;
		},
	);

	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const rawConfig =
		rawRequest.config && typeof rawRequest.config === "object" && !Array.isArray(rawRequest.config)
			? (rawRequest.config as Record<string, any>)
			: {};
	const minimaxExtensions = (
		rawRequest.minimax ??
		rawConfig.minimax ??
		rawRequest.provider_params ??
		{}
	) as Record<string, any>;
	const passthroughRequest =
		minimaxExtensions.request &&
		typeof minimaxExtensions.request === "object" &&
		!Array.isArray(minimaxExtensions.request)
			? { ...(minimaxExtensions.request as Record<string, any>) }
			: {};

	if (passthroughRequest.model == null) passthroughRequest.model = model;
	if (passthroughRequest.prompt == null) passthroughRequest.prompt = ir.prompt;
	if (passthroughRequest.duration == null && seconds != null) passthroughRequest.duration = seconds;
	if (passthroughRequest.resolution == null) {
		const resolution =
			toNonEmptyString(passthroughRequest.size) ??
			toNonEmptyString(passthroughRequest.resolution) ??
			size;
		if (resolution) passthroughRequest.resolution = resolution;
	}
	if ("size" in passthroughRequest) delete passthroughRequest.size;
	if (passthroughRequest.quality == null && quality) passthroughRequest.quality = quality;
	if (passthroughRequest.first_frame_image == null && ir.inputReference) {
		passthroughRequest.first_frame_image = ir.inputReference;
	}
	if (passthroughRequest.seed == null && typeof ir.seed === "number") passthroughRequest.seed = ir.seed;
	const requestBody = JSON.stringify(passthroughRequest);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	if (isMiniMaxImageToVideoOnlyModel(model) && !toNonEmptyString(passthroughRequest.first_frame_image)) {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "input_reference_required",
					message: "MiniMax-Hailuo-2.3-Fast requires input_reference / first_frame_image.",
				},
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null as string | null,
			},
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
	const passthroughSeconds = toPositiveNumber(
		passthroughRequest.duration ??
		passthroughRequest.duration_seconds ??
		passthroughRequest.seconds ??
		passthroughRequest.video_params?.duration_seconds ??
		passthroughRequest.video_params?.seconds,
	);
	const secondsForBilling = seconds ?? passthroughSeconds ?? null;
	const passthroughResolution =
		toNonEmptyString(passthroughRequest.resolution) ??
		toNonEmptyString(passthroughRequest.input_resolution) ??
		toNonEmptyString(passthroughRequest.video_params?.resolution) ??
		toNonEmptyString(passthroughRequest.video_params?.input_resolution);
	const resolutionForBilling = normalizeMiniMaxResolutionForPricing(size ?? passthroughResolution);
	const qualityForBilling =
		toNonEmptyString(quality) ??
		toNonEmptyString(passthroughRequest.quality) ??
		toNonEmptyString(passthroughRequest.video_params?.quality) ??
		null;

	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	try {
		const reserved = await reserveVideoGenerationCredits({
			workspaceId: args.workspaceId,
			videoId: `req_${args.requestId}`,
			providerId: args.providerId,
			model,
			seconds: secondsForBilling,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size: resolutionForBilling,
				resolution: ir.resolution,
				quality: qualityForBilling,
				seconds: secondsForBilling,
			}),
			isByok: keyInfo.source === "byok",
		});
		reservationId = reserved.reservationId;
		reservationStatus = reserved.status;
		reservedNanos = reserved.amountNanos;
		if (reserved.status === "skip_missing_seconds_or_pricing") {
			reservationGateError = {
				status: 400,
				type: "missing_billing_dimensions",
				message: "Video duration seconds and pricing must be resolvable before submission.",
			};
		}
		if (reserved.amountNanos > 0 && !reserved.held && reserved.status !== "insufficient_funds") {
			reservationGateError = {
				status: 503,
				type: "reservation_not_held",
				message: `Unable to secure wallet reservation before provider submission (status=${reserved.status}).`,
			};
		}
	} catch (reserveErr) {
		console.error("minimax_video_reservation_failed_pre_submit", {
			error: reserveErr,
			workspaceId: args.workspaceId,
			requestId: args.requestId,
		});
		reservationGateError = {
			status: 503,
			type: "reservation_unavailable",
			message: "Unable to reserve credits for video generation.",
		};
	}

	const releaseReservationOnFailure = async () => {
		if (!reservationId) return;
		try {
			await releaseWalletReservation({
				workspaceId: args.workspaceId,
				reservationId,
				releaseRefId: args.requestId,
			});
		} catch (releaseErr) {
			console.error("minimax_video_reservation_release_failed", {
				error: releaseErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				reservationId,
			});
		}
	};

	if (reservationStatus === "insufficient_funds") {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "insufficient_funds",
					message: "Insufficient available credits for video reservation hold.",
				},
			}),
			{ status: 402, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null as string | null,
			},
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
	if (reservationGateError) {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: reservationGateError.type,
					message: reservationGateError.message,
				},
			}),
			{ status: reservationGateError.status, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null as string | null,
			},
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
	let res: Response;
	try {
		res = await fetch(`${baseUrl}/v1/video_generation`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
			},
			body: requestBody,
		});
	} catch (fetchErr) {
		await releaseReservationOnFailure();
		throw fetchErr;
	}

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined,
		finish_reason: null as string | null,
	};

	if (!res.ok) {
		await releaseReservationOnFailure();
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const json = await res.json().catch(() => ({}));
	const taskId = extractTaskId(json);
	const encodedId = taskId ? encodeMiniMaxVideoId(taskId) : undefined;
	if (encodedId) {
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: taskId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: secondsForBilling,
				resolution: resolutionForBilling ?? null,
				quality: qualityForBilling,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				createdAt: Date.now(),
			}, taskId ?? encodedId, toVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status));
		} catch (error) {
			console.error("minimax_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
		}
	}

	// Async create requests should only bill request metering.
	// Completion-duration billing is finalized by webhook/reconciliation workers.
	const usageMeters: Record<string, number> = {
		requests: 1,
	};
	if (args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, { model });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	} else {
		bill.usage = usageMeters;
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status: toVideoStatus(json?.status ?? json?.task_status),
		output: extractVideoOutput(json),
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(secondsForBilling != null ? { output_video_seconds: secondsForBilling } : {}),
		} as any,
		rawResponse: json,
	};

	return {
		kind: "completed",
		ir: irResponse,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
	};
}

export const executor: ProviderExecutor = execute;
