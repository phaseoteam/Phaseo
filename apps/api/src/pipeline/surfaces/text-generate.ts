// Purpose: Text generation pipeline surface.
// Why: Isolates text.generate request lifecycle from other surfaces.
// How: Decodes protocol -> IR, executes provider, encodes response.

import type { IRChatRequest } from "@core/ir";
import { handleError } from "@core/error-handler";
import { detectProtocol } from "@protocols/detect";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import type { PipelineRunnerArgs } from "./types";

export async function runTextGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		// Protocol detection
		timing.timer.mark("protocol_detect");
		const requestPath = new URL(req.url).pathname;
		const protocol = detectProtocol(endpoint, requestPath);
		(pre.ctx as any).protocol = protocol; // Store for observability
		timing.timer.end("protocol_detect");

		// Decode protocol -> IR
		timing.timer.mark("ir_decode");
		const ir: IRChatRequest = decodeProtocol(protocol, pre.ctx.body);
		ir.rawRequest = pre.ctx.rawBody;
		timing.timer.end("ir_decode");

		// Execute with IR
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

		// Encode IR -> protocol response
		timing.timer.mark("ir_encode");
		let protocolResponse;
		if (exec.result.kind === "completed" && exec.result.ir) {
			protocolResponse = encodeProtocol(protocol, exec.result.ir as any, pre.ctx.requestId);
		} else {
			protocolResponse = null;
		}
		timing.timer.end("ir_encode");

		if (protocolResponse) {
			exec.result.normalized = protocolResponse;
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
