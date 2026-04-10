// Purpose: Rerank pipeline surface.
// Why: Isolates rerank lifecycle and keeps IR handling explicit.
// How: Decodes OpenAI rerank -> IR, executes provider, encodes response.

import { handleError } from "@core/error-handler";
import { decodeOpenAIRerankRequest } from "@protocols/openai-rerank/decode";
import { encodeOpenAIRerankResponse } from "@protocols/openai-rerank/encode";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import type { PipelineRunnerArgs } from "./types";

export async function runRerankPipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		(pre.ctx as any).protocol = "openai.rerank";

		timing.timer.mark("ir_decode");
		const ir = decodeOpenAIRerankRequest(pre.ctx.body);
		ir.rawRequest = pre.ctx.rawBody;
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

		timing.timer.mark("ir_encode");
		if (exec.result.kind === "completed" && exec.result.ir) {
			exec.result.normalized = encodeOpenAIRerankResponse(exec.result.ir as any);
		}
		timing.timer.end("ir_encode");

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
		logPipelineExecutionError("rerank", err);
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
