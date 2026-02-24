// Purpose: Video generation pipeline surface.
// Why: Ensures /videos requests use unified IR conversion before provider execution.
// How: Decodes request body -> IR video request, executes IR pipeline, then encodes response.

import { handleError } from "@core/error-handler";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import type { PipelineRunnerArgs } from "./types";
import {
	decodeOpenAIVideoRequestToIR,
	encodeVideoIRToOpenAIResponse,
} from "./video-codec";

export async function runVideoGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		timing.timer.mark("ir_decode");
		const ir = decodeOpenAIVideoRequestToIR(pre.ctx.body);
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
			exec.result.normalized = encodeVideoIRToOpenAIResponse(exec.result.ir as any, pre.ctx.requestId);
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
