// Purpose: Text generation pipeline surface.
// Why: Isolates text.generate request lifecycle from other surfaces.
// How: Decodes protocol -> IR, executes provider, encodes response.

import type { IRChatRequest, IRChatResponse } from "@core/ir";
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
import {
	attachServerToolUsage,
	attachServerToolUsageToRawUsage,
	buildSyntheticServerToolStream,
	buildServerToolContinuation,
	consumeTextProtocolStreamToIR,
	mergeIRUsageTotals,
	prepareServerToolsForTextRequest,
} from "./server-tools";

function looksLikeStackTrace(value: string): boolean {
	return /\n\s*at\s+[^\n]+/i.test(value) || /Error:\s*[^\n]+/i.test(value);
}

function sanitizeErrorExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!extra) return undefined;
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(extra)) {
		if (key === "stack" || key === "stackTrace" || key === "stacktrace") continue;
		if (value instanceof Error) {
			sanitized[key] = { name: value.name };
			continue;
		}
		if (typeof value === "string" && looksLikeStackTrace(value)) {
			sanitized[key] = "[redacted]";
			continue;
		}
		sanitized[key] = value;
	}
	return sanitized;
}

function createJsonErrorResponse(
	status: number,
	error: string,
	message: string,
	extra?: Record<string, unknown>,
): Response {
	const safeMessage = looksLikeStackTrace(message) ? "Internal error" : message;
	const safeExtra = sanitizeErrorExtra(extra);
	return new Response(
		JSON.stringify({
			error,
			message: safeMessage,
			...(safeExtra ?? {}),
		}),
		{
			status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		},
	);
}

async function materializeStreamResultToCompleted(args: {
	protocol: ReturnType<typeof detectTextProtocol>;
	requestId: string;
	model: string;
	result: any;
	startedAtMs?: number;
}): Promise<any> {
	const stream = args.result.stream ?? args.result.upstream?.body ?? null;
	if (!stream) {
		throw new Error("gateway_stream_materialization_missing_body");
	}
	const consumed = await consumeTextProtocolStreamToIR({
		protocol: args.protocol,
		stream,
		requestId: args.requestId,
		model: args.model,
		provider: args.result.provider,
		startedAtMs: args.startedAtMs,
	});
	return {
		...args.result,
		kind: "completed" as const,
		ir: consumed.ir,
		stream: null,
		usageFinalizer: null,
		rawResponse: consumed.rawResponse,
		generationTimeMs:
			typeof consumed.totalMs === "number"
				? consumed.totalMs
				: args.result.generationTimeMs,
		timing: {
			latencyMs:
				typeof consumed.firstFrameMs === "number"
					? consumed.firstFrameMs
					: args.result?.timing?.latencyMs,
			generationMs:
				typeof consumed.totalMs === "number"
					? consumed.totalMs
					: args.result?.timing?.generationMs,
		},
		bill: {
			...args.result.bill,
			usage:
				(args.result.bill?.usage && typeof args.result.bill.usage === "object")
					? args.result.bill.usage
					: (consumed.usageRaw && typeof consumed.usageRaw === "object"
						? consumed.usageRaw
						: args.result.bill?.usage),
		},
	};
}

export async function runTextGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		// Protocol detection
		timing.timer.mark("protocol_detect");
		const requestPath = new URL(req.url).pathname;
		const protocol = detectTextProtocol(endpoint, requestPath);
		(pre.ctx as any).protocol = protocol; // Store for observability
		timing.timer.end("protocol_detect");

		const preparedServerTools = prepareServerToolsForTextRequest(pre.ctx.body, protocol);
		if (preparedServerTools.ok === false) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: createJsonErrorResponse(
					400,
					"invalid_request",
					preparedServerTools.message,
				),
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}
		pre.ctx.body = preparedServerTools.body;

		// Decode protocol -> IR
		timing.timer.mark("ir_decode");
		const ir: IRChatRequest = decodeProtocol(protocol, pre.ctx.body);
		ir.rawRequest = pre.ctx.rawBody;
		timing.timer.end("ir_decode");
		const requestedStream = ir.stream === true;
		const irForExecution: IRChatRequest = {
			...ir,
			stream: true,
		};

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
		let exec = await doRequestWithIR(pre.ctx, irForExecution, timing);

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

		const shouldMaterializeInitialStream = !requestedStream || preparedServerTools.config.enabled;
		if (exec.result.kind === "stream" && shouldMaterializeInitialStream) {
			try {
				exec.result = await materializeStreamResultToCompleted({
					protocol,
					requestId: pre.ctx.requestId,
					model: pre.ctx.model,
					result: exec.result,
					startedAtMs: pre.ctx.meta.upstreamStartMs ?? pre.ctx.meta.startedAtMs,
				});
				if (typeof exec.result?.timing?.latencyMs === "number") {
					pre.ctx.meta.latency_ms = exec.result.timing.latencyMs;
				}
				if (typeof exec.result?.timing?.generationMs === "number") {
					pre.ctx.meta.generation_ms = exec.result.timing.generationMs;
				}
			} catch (error) {
				const header = timing.timer.header();
				pre.ctx.timing = timing.timer.snapshot();
				return await handleError({
					stage: "execute",
					res: createJsonErrorResponse(
						502,
						"gateway_stream_materialization_error",
						error instanceof Error ? error.message : String(error),
					),
					endpoint,
					ctx: pre.ctx,
					timingHeader: header || undefined,
					auditFailure,
					req,
				});
			}
		}

		if (preparedServerTools.config.enabled && exec.result.kind === "completed" && exec.result.ir) {
			const maxServerToolRounds = 8;
			let serverToolRounds = 0;
			let datetimeRequests = 0;
			let aggregateUsage = (exec.result.ir as IRChatResponse).usage;
			let latestIrResponse = exec.result.ir as IRChatResponse;
			let nextIrRequest = irForExecution;

			while (true) {
				const continuation = buildServerToolContinuation(
					latestIrResponse,
					preparedServerTools.config,
				);
				if (!continuation) break;
				if (serverToolRounds >= maxServerToolRounds) {
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: createJsonErrorResponse(
							502,
							"gateway_server_tool_error",
							"Server tool execution exceeded the maximum follow-up turns.",
							{ max_turns: maxServerToolRounds },
						),
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}
				serverToolRounds += 1;
				datetimeRequests += continuation.datetimeRequests;

				nextIrRequest = {
					...nextIrRequest,
					stream: true,
					toolChoice: "auto",
					messages: [
						...nextIrRequest.messages,
						continuation.assistantMessage,
						{
							role: "tool",
							toolResults: continuation.toolResults,
						},
					],
				};

				const followUpExec = await doRequestWithIR(pre.ctx, nextIrRequest, timing);
				if (followUpExec instanceof Response) {
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: followUpExec,
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}
				let followUpResult = followUpExec.result;
				if (followUpResult.kind === "stream") {
					try {
						followUpResult = await materializeStreamResultToCompleted({
							protocol,
							requestId: pre.ctx.requestId,
							model: pre.ctx.model,
							result: followUpResult,
							startedAtMs: pre.ctx.meta.upstreamStartMs ?? pre.ctx.meta.startedAtMs,
						});
						if (typeof followUpResult?.timing?.latencyMs === "number") {
							pre.ctx.meta.latency_ms = followUpResult.timing.latencyMs;
						}
						if (typeof followUpResult?.timing?.generationMs === "number") {
							pre.ctx.meta.generation_ms = followUpResult.timing.generationMs;
						}
					} catch (error) {
						const header = timing.timer.header();
						pre.ctx.timing = timing.timer.snapshot();
						return await handleError({
							stage: "execute",
							res: createJsonErrorResponse(
								502,
								"gateway_stream_materialization_error",
								error instanceof Error ? error.message : String(error),
							),
							endpoint,
							ctx: pre.ctx,
							timingHeader: header || undefined,
							auditFailure,
							req,
						});
					}
				}
				if (followUpResult.kind !== "completed" || !followUpResult.ir) {
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: createJsonErrorResponse(
							502,
							"gateway_server_tool_error",
							"Server tool follow-up request returned an unsupported response kind.",
						),
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}

				exec.result = followUpResult;
				latestIrResponse = followUpResult.ir as IRChatResponse;
				aggregateUsage = mergeIRUsageTotals(aggregateUsage, latestIrResponse.usage);
				latestIrResponse = {
					...latestIrResponse,
					usage: aggregateUsage,
				};
				exec.result.ir = latestIrResponse;
			}

			if (datetimeRequests > 0) {
				const mergedUsage = attachServerToolUsage(aggregateUsage, {
					datetimeRequests,
				});
				if (exec.result.ir) {
					(exec.result.ir as IRChatResponse).usage = mergedUsage;
				}
				exec.result.bill.usage = attachServerToolUsageToRawUsage(
					(exec.result.bill.usage as Record<string, any> | undefined) ?? undefined,
					{ datetimeRequests },
				);
				if (exec.result.rawResponse && typeof exec.result.rawResponse === "object") {
					const rawResponse = { ...(exec.result.rawResponse as Record<string, any>) };
					rawResponse.usage = attachServerToolUsageToRawUsage(
						rawResponse.usage as Record<string, any> | undefined,
						{ datetimeRequests },
					);
					exec.result.rawResponse = rawResponse;
				}
			}
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

		timing.timer.end("execute_total", "execute_start");

		if (
			preparedServerTools.config.enabled &&
			requestedStream &&
			exec.result.kind === "completed" &&
			protocolResponse
		) {
			const stream = buildSyntheticServerToolStream({
				protocol,
				payload: protocolResponse,
				requestId: pre.ctx.requestId,
				model:
					(typeof (protocolResponse as any)?.model === "string"
						? (protocolResponse as any).model
						: (typeof (exec.result.ir as any)?.model === "string"
							? (exec.result.ir as any).model
							: pre.ctx.model)),
				created:
					typeof (protocolResponse as any)?.created === "number"
						? (protocolResponse as any).created
						: null,
			});
			if (stream) {
				exec.result.kind = "stream";
				exec.result.stream = stream;
				exec.result.upstream = new Response(null, {
					status: exec.result.upstream.status,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-store",
					},
				});
			}
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
