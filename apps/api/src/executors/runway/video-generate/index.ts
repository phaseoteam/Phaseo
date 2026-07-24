// Purpose: Executor for runway / video-generate.
// Why: Supports Runway async text-to-video behind the OpenAI-style /v1/videos contract.
// How: Creates a task, stores encoded task IDs, and returns normalized status/output payloads.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import type { ProviderExecutor } from "../../types";

const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";
const RUNWAY_VIDEO_PREFIX = "rwyvid_";

function encodeRunwayTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${RUNWAY_VIDEO_PREFIX}${b64}`;
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

function toVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "canceled" || status === "cancelled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function normalizeRunwayRatio(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value.trim();
	if (!normalized) return undefined;
	const ratioMap: Record<string, string> = {
		"16:9": "1280:720",
		"9:16": "720:1280",
		"1280x720": "1280:720",
		"720x1280": "720:1280",
	};
	return ratioMap[normalized] ?? normalized;
}

function normalizeInputSource(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	return toNonEmptyString(source.uri) ??
		toNonEmptyString(source.url) ??
		toNonEmptyString(source.gcsUri) ??
		toNonEmptyString(source.gcs_uri);
}

function extractRunwayConfig(rawRequest: Record<string, any>): Record<string, any> {
	const fromConfig = rawRequest?.config?.runway;
	const fromTopLevel = rawRequest?.runway;
	const providerParams =
		rawRequest?.provider_params && typeof rawRequest.provider_params === "object" && !Array.isArray(rawRequest.provider_params)
			? rawRequest.provider_params
			: null;
	for (const candidate of [fromConfig, fromTopLevel, providerParams]) {
		if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
			return candidate as Record<string, any>;
		}
	}
	return {};
}

function buildRunwayRequest(ir: IRVideoGenerationRequest, model: string): Record<string, any> {
	const rawRequest = ((ir.rawRequest ?? {}) as Record<string, any>);
	const runwayConfig = extractRunwayConfig(rawRequest);
	const passthroughRequest =
		runwayConfig.request && typeof runwayConfig.request === "object" && !Array.isArray(runwayConfig.request)
			? { ...(runwayConfig.request as Record<string, any>) }
			: {};

	if (Object.keys(passthroughRequest).length > 0) {
		if (passthroughRequest.model == null) passthroughRequest.model = model;
		if (passthroughRequest.promptText == null && passthroughRequest.prompt == null) {
			passthroughRequest.promptText = ir.prompt;
		}
		return passthroughRequest;
	}

	const ratio = normalizeRunwayRatio(
		toNonEmptyString(runwayConfig.ratio) ??
		toNonEmptyString(runwayConfig.aspect_ratio) ??
		toNonEmptyString(runwayConfig.aspectRatio) ??
		ir.aspectRatio ??
		ir.ratio,
	);
	const duration = toPositiveNumber(
		runwayConfig.duration ??
		runwayConfig.duration_seconds ??
		runwayConfig.durationSeconds ??
		parseDurationSeconds(ir),
	);
	const seed = toPositiveNumber(runwayConfig.seed ?? ir.seed);
	const imageUri = normalizeInputSource(
		runwayConfig.image_uri ??
		runwayConfig.imageUri ??
		ir.inputImage ??
		ir.inputReference ??
		ir.input?.image,
	);

	return {
		model,
		promptText: ir.prompt,
		...(typeof duration === "number" ? { duration } : {}),
		...(ratio ? { ratio } : {}),
		...(typeof seed === "number" ? { seed } : {}),
		...(imageUri ? { imageUri } : {}),
	};
}

function extractTaskId(json: any): string | undefined {
	const taskId = json?.id ?? json?.task_id ?? json?.taskId ?? json?.data?.id ?? json?.data?.task_id;
	if (taskId == null) return undefined;
	const normalized = String(taskId).trim();
	return normalized.length > 0 ? normalized : undefined;
}

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const direct =
		json?.output?.video_url ??
		json?.output?.url ??
		json?.video_url ??
		json?.videoUrl ??
		json?.asset?.url ??
		json?.assets?.video ??
		json?.data?.output?.video_url;
	if (typeof direct === "string" && direct.length > 0) {
		return [{ index: 0, uri: direct, mime_type: "video/mp4" }];
	}

	const output = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data?.output)
			? json.data.output
			: [];
	if (output.length > 0) {
		return output.map((item: any, index: number) => ({
			index,
			uri: item?.url ?? item?.uri ?? item?.video_url ?? null,
			mime_type: item?.mime_type ?? item?.mimeType ?? "video/mp4",
		}));
	}
	return [];
}

function resolveRunwayApiVersion(rawRequest: Record<string, any>, bindings: Record<string, string | undefined>): string | undefined {
	const runwayConfig = extractRunwayConfig(rawRequest);
	return toNonEmptyString(runwayConfig.api_version ?? runwayConfig.apiVersion) ??
		toNonEmptyString(bindings.RUNWAY_API_VERSION);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "gen4.5";
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.RUNWAY_API_KEY;
		},
	);
	const requestObject = buildRunwayRequest(ir, model);
	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	try {
		const reserved = await reserveVideoGenerationCredits({
			workspaceId: args.workspaceId,
			videoId: args.requestId,
			providerId: args.providerId,
			model,
			seconds: seconds ?? null,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: ir.resolution,
				quality,
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
		if (reserved.amountNanos > 0 && !reserved.held && !isInsufficientVideoReservationStatus(reserved.status)) {
			reservationGateError = {
				status: 503,
				type: "reservation_not_held",
				message: `Unable to secure wallet reservation before provider submission (status=${reserved.status}).`,
			};
		}
	} catch (reserveErr) {
		console.error("runway_video_reservation_failed_pre_submit", {
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
			console.error("runway_video_reservation_release_failed", {
				error: releaseErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				reservationId,
			});
		}
	};

	if (isInsufficientVideoReservationStatus(reservationStatus)) {
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
	const baseUrl = String(bindings.RUNWAY_BASE_URL || DEFAULT_RUNWAY_BASE_URL).replace(/\/+$/, "");
	const apiVersion = resolveRunwayApiVersion((ir.rawRequest ?? {}) as Record<string, any>, bindings);

	const headers: Record<string, string> = {
		Authorization: `Bearer ${keyInfo.key}`,
		"Content-Type": "application/json",
	};
	if (apiVersion) headers["X-Runway-Version"] = apiVersion;

	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/v1/text_to_video`, {
			method: "POST",
			headers,
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
	const encodedId = taskId ? encodeRunwayTaskId(taskId) : undefined;
	const status = toVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
	if (!encodedId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "Runway video create response did not include a task id.",
				},
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
		};
	}

	if (encodedId) {
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: taskId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: seconds ?? null,
				resolution: size ?? null,
				quality,
				outputAccess: ir.outputAccess ?? "bytes",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, taskId ?? encodedId, status);
		} catch (error) {
			console.error("runway_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "Runway",
				nativeVideoId: encodedId,
				reservationId,
				reservationStatus,
				bill,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse: json,
			});
		}
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status,
		output: extractVideoOutput(json),
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(seconds != null ? { output_video_seconds: seconds } : {}),
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
