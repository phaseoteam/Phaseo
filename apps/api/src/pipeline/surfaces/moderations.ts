// Purpose: Moderations pipeline surface.
// Why: Isolates moderations lifecycle and keeps IR handling explicit.
// How: Decodes OpenAI moderations -> IR, executes provider, encodes response.

import { handleError } from "@core/error-handler";
import { decodeOpenAIModerationsRequest } from "@protocols/openai-moderations/decode";
import { encodeOpenAIModerationsResponse } from "@protocols/openai-moderations/encode";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import type { PipelineRunnerArgs } from "./types";

export async function runModerationsPipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		(pre.ctx as any).protocol = "openai.moderations";

		timing.timer.mark("ir_decode");
		const ir = decodeOpenAIModerationsRequest(pre.ctx.body);
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
			exec.result.normalized = encodeOpenAIModerationsResponse(exec.result.ir as any);
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
		console.error("IR pipeline error:", err);
		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		return await handleError({
			stage: "execute",
			res: new Response(JSON.stringify({ error: "IR pipeline error", message: String(err) }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
			endpoint,
			ctx: pre.ctx,
			timingHeader: header || undefined,
			auditFailure,
			req,
		});
	}
}
