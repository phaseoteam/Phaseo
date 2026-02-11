// Purpose: Executor for openai / video-generate.
// Why: Runs video generation through IR -> OpenAI -> IR conversion.
// How: Maps unified IR request fields to /videos and normalizes response and usage.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { saveVideoJobMeta } from "@core/video-jobs";
import type { ProviderExecutor } from "../../types";

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
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

function mapOpenAiVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

async function resolveInputReferenceBlob(ir: IRVideoGenerationRequest): Promise<{ blob: Blob; name: string } | null> {
	const ref = ir.inputReference?.trim();
	if (!ref) return null;
	let mimeType = ir.inputReferenceMimeType ?? "application/octet-stream";
	let fileBlob: Blob | null = null;
	let filename = "reference";

	const dataUrlMatch = ref.match(/^data:([^;]+);base64,(.+)$/);
	if (dataUrlMatch) {
		mimeType = dataUrlMatch[1] ?? mimeType;
		const bytes = Uint8Array.from(atob(dataUrlMatch[2] ?? ""), (c) => c.charCodeAt(0));
		fileBlob = new Blob([bytes], { type: mimeType });
	} else if (ref.startsWith("http://") || ref.startsWith("https://")) {
		const fetched = await fetch(ref);
		if (!fetched.ok) {
			throw new Error(`openai_video_input_reference_fetch_failed_${fetched.status}`);
		}
		fileBlob = await fetched.blob();
		mimeType = fileBlob.type || mimeType;
		const urlParts = ref.split("/");
		filename = urlParts[urlParts.length - 1] || filename;
	} else {
		const bytes = Uint8Array.from(atob(ref), (c) => c.charCodeAt(0));
		fileBlob = new Blob([bytes], { type: mimeType });
	}

	return fileBlob ? { blob: fileBlob, name: filename } : null;
}

function openAiVideoToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	requestedSeconds?: number,
): IRVideoGenerationResponse {
	const status = mapOpenAiVideoStatus(json?.status);
	const seconds =
		(typeof json?.seconds === "number" ? json.seconds : undefined) ??
		(typeof json?.duration_seconds === "number" ? json.duration_seconds : undefined) ??
		requestedSeconds;

	const output = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data)
			? json.data
			: [];

	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};

	return {
		id: requestId,
		nativeId: json?.id ?? undefined,
		model,
		provider,
		status,
		output,
		result: json,
		usage,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "sora-2";
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.OPENAI_API_KEY,
	);
	const seconds = parseDurationSeconds(ir);
	const mappedRequestEnabled = Boolean(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest);

	let headers = openAICompatHeaders("openai", keyInfo.key);
	let requestBody: BodyInit;
	let mappedRequest: string | undefined;

	if (ir.inputReference) {
		const form = new FormData();
		form.append("model", model);
		form.append("prompt", ir.prompt);
		if (seconds != null) form.append("seconds", String(seconds));
		if (ir.size) form.append("size", ir.size);
		if (ir.quality) form.append("quality", ir.quality);
		const resolved = await resolveInputReferenceBlob(ir);
		if (resolved) {
			form.append("input_reference", resolved.blob, resolved.name);
		}
		requestBody = form;
		delete (headers as any)["Content-Type"];
		if (mappedRequestEnabled) {
			mappedRequest = JSON.stringify({
				model,
				prompt: ir.prompt,
				...(seconds != null ? { seconds } : {}),
				...(ir.size ? { size: ir.size } : {}),
				...(ir.quality ? { quality: ir.quality } : {}),
				input_reference: "[multipart]",
			});
		}
	} else {
		const jsonBody = {
			model,
			prompt: ir.prompt,
			...(seconds != null ? { seconds } : {}),
			...(ir.size ? { size: ir.size } : {}),
			...(ir.quality ? { quality: ir.quality } : {}),
		};
		requestBody = JSON.stringify(jsonBody);
		if (mappedRequestEnabled) mappedRequest = JSON.stringify(jsonBody);
	}

	const res = await fetch(openAICompatUrl("openai", "/videos"), {
		method: "POST",
		headers,
		body: requestBody,
	});

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? undefined,
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
	const irResponse = openAiVideoToIR(json, args.requestId, model, args.providerId, seconds);
	const nativeVideoId = irResponse.nativeId ?? json?.id;
	if (nativeVideoId) {
		try {
			await saveVideoJobMeta(args.teamId, String(nativeVideoId), {
				provider: args.providerId,
				model,
				seconds: seconds ?? null,
				size: ir.size ?? null,
				quality: ir.quality ?? (ir.rawRequest as any)?.quality ?? null,
				createdAt: Date.now(),
			});
		} catch (err) {
			console.error("openai_video_job_meta_store_failed", {
				error: err,
				teamId: args.teamId,
				videoId: String(nativeVideoId),
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
