// Purpose: Adapter-backed pipeline surface for non-IR endpoints.
// Why: Media/OCR/music endpoints use provider-native payloads, not text protocol decode/encode.
// How: Executes via adapter routing and then reuses after-stage normalization/auditing.

import { handleError } from "@core/error-handler";
import { doRequestWithAdapters } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import type { PipelineRunnerArgs } from "./types";

export async function runAdapterPipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		timing.timer.mark("execute_start");
		const exec = await doRequestWithAdapters(pre.ctx, timing);

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
		console.error("Adapter pipeline error:", err);
		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		return await handleError({
			stage: "execute",
			res: new Response(JSON.stringify({ error: "adapter pipeline error", message: String(err) }), {
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
