// Purpose: Executor for Alibaba Cloud video-generate.
// Why: Enables Wan video create flow through IR -> DashScope -> IR.
// How: Submits async task, returns queued response with encoded task identifier.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { computeBill } from "@pipeline/pricing/engine";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import type { ProviderExecutor } from "../../types";

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com";
const DASHSCOPE_TASK_PREFIX = "dscope_";

function encodeDashscopeTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${DASHSCOPE_TASK_PREFIX}${b64}`;
}

function toDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	if (typeof ir.durationSeconds === "number" && Number.isFinite(ir.durationSeconds) && ir.durationSeconds > 0) {
		return ir.durationSeconds;
	}
	if (typeof ir.duration === "number" && Number.isFinite(ir.duration) && ir.duration > 0) {
		return ir.duration;
	}
	if (typeof ir.seconds === "number" && Number.isFinite(ir.seconds) && ir.seconds > 0) {
		return ir.seconds;
	}
	if (typeof ir.seconds === "string" && ir.seconds.trim().length > 0) {
		const parsed = Number(ir.seconds.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function extractAlibabaConfig(rawRequest: Record<string, any>): Record<string, any> {
	const fromConfig = rawRequest?.config?.alibaba;
	const fromTopLevel = rawRequest?.alibaba;
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

function normalizeInputSource(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	return toNonEmptyString(source.uri) ??
		toNonEmptyString(source.url) ??
		toNonEmptyString(source.gcsUri) ??
		toNonEmptyString(source.gcs_uri);
}

function countImageReferences(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + countImageReferences(item), 0);
	}
	if (typeof value === "object") {
		const asRecord = value as Record<string, unknown>;
		if (normalizeInputSource(asRecord) != null) return 1;
		if (typeof asRecord.url === "string" && asRecord.url.trim().length > 0) return 1;
		if (typeof asRecord.uri === "string" && asRecord.uri.trim().length > 0) return 1;
	}
	return 0;
}

function resolveWanInputImageCount(requestObject: Record<string, unknown>): number {
	const input =
		requestObject.input && typeof requestObject.input === "object" && !Array.isArray(requestObject.input)
			? (requestObject.input as Record<string, unknown>)
			: {};
	const fromInput =
		countImageReferences(input.img_url) +
		countImageReferences(input.image_url) +
		countImageReferences(input.image) +
		countImageReferences(input.images);
	const fromContent = Array.isArray(requestObject.content)
		? requestObject.content.reduce((sum, part) => {
			if (!part || typeof part !== "object" || Array.isArray(part)) return sum;
			const entry = part as Record<string, unknown>;
			const type = String(entry.type ?? "").toLowerCase();
			if (type === "image_url" || type === "image") {
				return sum + countImageReferences(entry.image_url ?? entry.image ?? entry.url ?? entry.uri);
			}
			return sum;
		}, 0)
		: 0;
	return Math.max(0, fromInput + fromContent);
}

function irToWanRequest(ir: IRVideoGenerationRequest, model: string): any {
	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const alibabaConfig = extractAlibabaConfig(rawRequest);
	const passthroughRequest =
		alibabaConfig.request && typeof alibabaConfig.request === "object" && !Array.isArray(alibabaConfig.request)
			? { ...(alibabaConfig.request as Record<string, any>) }
			: {};

	if (Object.keys(passthroughRequest).length > 0) {
		if (passthroughRequest.model == null) passthroughRequest.model = model;
		if (passthroughRequest.input == null) {
			passthroughRequest.input = {
				prompt: ir.prompt,
			};
		}
		return passthroughRequest;
	}

	const seconds = toDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const ratio = toNonEmptyString(alibabaConfig.ratio) ?? ir.aspectRatio ?? ir.ratio;
	const inputImage = normalizeInputSource(
		alibabaConfig.img_url ??
		alibabaConfig.image_url ??
		ir.inputReference ??
		ir.inputImage ??
		ir.input?.image,
	);
	return {
		model,
		input: {
			prompt: ir.prompt,
			...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
			...(inputImage ? { img_url: inputImage } : {}),
		},
		parameters: {
			...(typeof seconds === "number" ? { duration: seconds } : {}),
			...(size ? { size } : {}),
			...(ratio ? { ratio } : {}),
			...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
			...(toNonEmptyString(alibabaConfig.callback_url) ? { callback_url: alibabaConfig.callback_url } : {}),
		},
	};
}

function wanToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRVideoGenerationResponse {
	const taskId = json?.output?.task_id ?? json?.task_id ?? json?.id ?? null;
	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};

	return {
		id: requestId,
		nativeId: taskId ? encodeDashscopeTaskId(String(taskId)) : undefined,
		model,
		provider,
		status: "queued",
		result: {
			task_id: taskId ?? undefined,
			dashscope: json,
		},
		usage,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "wan2.2-t2v-plus";
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.ALIBABA_CLOUD_API_KEY,
	);
	const baseUrl = (bindings.ALIBABA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
	const requestObject = irToWanRequest(ir, model);
	const inputImageCount = resolveWanInputImageCount(requestObject as Record<string, unknown>);
	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const requestedSeconds = toDurationSeconds(ir) ?? null;
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
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
			seconds: requestedSeconds,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: ir.resolution,
				quality,
				input_image_count: inputImageCount,
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
		console.error("wan_video_reservation_failed_pre_submit", {
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
			console.error("wan_video_reservation_release_failed", {
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

	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
				"X-DashScope-Async": "enable",
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
		upstream_id:
			res.headers.get("x-request-id") ??
			res.headers.get("x-dashscope-request-id") ??
			undefined,
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
	const irResponse = wanToIR(json, args.requestId, model, args.providerId);
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
	irResponse.usage = {
		...(irResponse.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
		requests: 1,
		...(requestedSeconds != null ? { output_video_seconds: requestedSeconds } : {}),
		...(inputImageCount > 0 ? { input_image_count: inputImageCount } : {}),
	} as any;
	if (!irResponse.nativeId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "Alibaba video create response did not include a task id.",
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
	if (irResponse.nativeId) {
		const taskId =
			typeof json?.output?.task_id === "string"
				? json.output.task_id
				: typeof json?.task_id === "string"
					? json.task_id
					: typeof json?.id === "string"
						? json.id
						: String(irResponse.nativeId);
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: taskId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: requestedSeconds,
				resolution: size ?? null,
				quality,
				inputImageCount,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, taskId, irResponse.status);
		} catch (err) {
			console.error("wan_video_job_meta_store_failed", {
				error: err,
				workspaceId: args.workspaceId,
				videoId: String(irResponse.nativeId),
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "Alibaba",
				nativeVideoId: String(irResponse.nativeId),
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
