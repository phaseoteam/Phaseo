// Purpose: Video generation pipeline surface.
// Why: Ensures /videos requests use unified IR conversion before provider execution.
// How: Decodes request body -> IR video request, executes IR pipeline, then encodes response.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import { handleError } from "@core/error-handler";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import type { PipelineRunnerArgs } from "./types";

function decodeVideoRequestToIR(body: any): IRVideoGenerationRequest {
	const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input)
		? body.input
		: undefined;
	const referenceImages = Array.isArray(body?.reference_images)
		? body.reference_images
		: Array.isArray(input?.reference_images)
			? input.reference_images
			: undefined;

	return {
		model: body?.model,
		prompt: body?.prompt,
		seconds: body?.seconds,
		size: body?.size,
		quality: body?.quality,
		inputReference: body?.input_reference,
		inputReferenceMimeType: body?.input_reference_mime_type,
		input: input
			? {
				image: input?.image,
				video: input?.video,
				lastFrame: input?.last_frame ?? input?.lastFrame,
				referenceImages,
			}
			: undefined,
		inputImage: body?.input_image ?? input?.image,
		inputVideo: body?.input_video ?? input?.video,
		lastFrame: body?.input_last_frame ?? body?.last_frame ?? input?.last_frame ?? input?.lastFrame,
		referenceImages,
		duration: body?.duration,
		durationSeconds: body?.duration_seconds,
		ratio: body?.ratio,
		aspectRatio: body?.aspect_ratio,
		resolution: body?.resolution,
		negativePrompt: body?.negative_prompt,
		sampleCount: body?.sample_count,
		numberOfVideos: body?.number_of_videos,
		seed: body?.seed,
		personGeneration: body?.person_generation,
		generateAudio: body?.generate_audio,
		enhancePrompt: body?.enhance_prompt,
		outputStorageUri: body?.output_storage_uri,
		rawRequest: body,
	};
}

function encodeVideoIRToClient(ir: IRVideoGenerationResponse, requestId: string): Record<string, any> {
	const nativeId = ir.nativeId ?? null;
	const createdAt = Math.floor(Date.now() / 1000);
	const result = ir.result && typeof ir.result === "object" ? ir.result : undefined;
	const usage: any = ir.usage && typeof ir.usage === "object"
		? {
			input_tokens: ir.usage.inputTokens ?? 0,
			output_tokens: ir.usage.outputTokens ?? 0,
			total_tokens: ir.usage.totalTokens ?? ((ir.usage.inputTokens ?? 0) + (ir.usage.outputTokens ?? 0)),
			...((ir.status === "completed" && (ir.usage as any).output_video_seconds != null)
				? { output_video_seconds: Number((ir.usage as any).output_video_seconds) }
				: {}),
		}
		: undefined;

	return {
		id: nativeId || ir.id || requestId,
		object: "video",
		status: ir.status || "queued",
		created_at: createdAt,
		model: ir.model,
		nativeResponseId: nativeId,
		provider: ir.provider,
		...(Array.isArray(ir.output) ? { output: ir.output } : {}),
		...(result ? { result } : {}),
		...(usage ? { usage } : {}),
	};
}

export async function runVideoGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		timing.timer.mark("ir_decode");
		const ir = decodeVideoRequestToIR(pre.ctx.body);
		timing.timer.end("ir_decode");

		timing.timer.mark("execute_start");
		const exec = await doRequestWithIR(pre.ctx, ir, timing);

		if (exec instanceof Response) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: exec,
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}

		if (exec.result.kind === "completed" && exec.result.ir) {
			exec.result.normalized = encodeVideoIRToClient(exec.result.ir as IRVideoGenerationResponse, pre.ctx.requestId);
		}

		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		pre.ctx.timer = timing.timer;

		return finalizeRequest({
			pre,
			exec: { ok: true, result: exec.result },
			endpoint,
			timingHeader: header || undefined,
		});
	} catch (err) {
		logPipelineExecutionError("video-generate", err);
		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		return await handleError({
			stage: "execute",
			res: buildPipelineExecutionErrorResponse(err, pre.ctx),
			endpoint,
			ctx: pre.ctx,
			timingHeader: header || undefined,
			auditFailure,
			req,
		});
	}
}
