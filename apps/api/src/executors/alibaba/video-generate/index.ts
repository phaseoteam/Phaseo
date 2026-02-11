// Purpose: Executor for alibaba/qwen / video-generate.
// Why: Enables Wan video create flow through IR -> DashScope -> IR.
// How: Submits async task, returns queued response with encoded task identifier.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
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

function irToWanRequest(ir: IRVideoGenerationRequest, model: string): any {
	const seconds = toDurationSeconds(ir);
	const size = ir.size || ir.resolution;
	const ratio = ir.aspectRatio || ir.ratio;
	return {
		model,
		input: {
			prompt: ir.prompt,
			...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
			...(ir.inputReference ? { img_url: ir.inputReference } : {}),
		},
		parameters: {
			...(typeof seconds === "number" ? { duration: seconds } : {}),
			...(size ? { size } : {}),
			...(ratio ? { ratio } : {}),
			...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
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
		() => bindings.ALIBABA_API_KEY || bindings.QWEN_API_KEY,
	);
	const baseUrl = (bindings.ALIBABA_BASE_URL || bindings.QWEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
	const requestObject = irToWanRequest(ir, model);
	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;

	const res = await fetch(`${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			"X-DashScope-Async": "enable",
		},
		body: requestBody,
	});

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
	if (irResponse.nativeId) {
		try {
			await saveVideoJobMeta(args.teamId, String(irResponse.nativeId), {
				provider: args.providerId,
				model,
				seconds: toDurationSeconds(ir) ?? null,
				size: ir.size ?? ir.resolution ?? ir.aspectRatio ?? ir.ratio ?? null,
				quality: ir.quality ?? null,
				createdAt: Date.now(),
			});
		} catch (err) {
			console.error("wan_video_job_meta_store_failed", {
				error: err,
				teamId: args.teamId,
				videoId: String(irResponse.nativeId),
				requestId: args.requestId,
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
