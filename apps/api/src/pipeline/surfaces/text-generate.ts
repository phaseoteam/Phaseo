// Purpose: Text generation pipeline surface.
// Why: Isolates text.generate request lifecycle from other surfaces.
// How: Decodes protocol -> IR, executes provider, encodes response.

import type { IRChatRequest } from "@core/ir";
import { handleError } from "@core/error-handler";
import { detectTextProtocol } from "@protocols/detect";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { auditFailure } from "../audit";
import type { PipelineRunnerArgs } from "./types";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import {
	buildTextIRContractErrorResponse,
	validateTextIRContract,
} from "../text-ir-contract";

export async function runTextGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		// Protocol detection
		timing.timer.mark("protocol_detect");
		const requestPath = new URL(req.url).pathname;
		const protocol = detectTextProtocol(endpoint, requestPath);
		(pre.ctx as any).protocol = protocol; // Store for observability
		timing.timer.end("protocol_detect");

		// Decode protocol -> IR
		timing.timer.mark("ir_decode");
		const ir: IRChatRequest = decodeProtocol(protocol, pre.ctx.body);
		ir.rawRequest = pre.ctx.rawBody;
		timing.timer.end("ir_decode");

		// Enforce canonical IR invariants before provider execution.
		const irIssues = validateTextIRContract(ir);
		if (irIssues.length > 0) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: buildTextIRContractErrorResponse(irIssues, pre.ctx),
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}

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
		logPipelineExecutionError("text-generate", err);
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
