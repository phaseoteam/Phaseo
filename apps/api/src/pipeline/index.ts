// src/lib/gateway/route-factory.ts
// Purpose: Pipeline entrypoint that wires before/execute/after stages.
// Why: Provides a single request lifecycle orchestrator.
// How: Orchestrates before -> execute -> after with timing hooks.

import { beforeRequest } from "./before";
import { doRequestWithIR, doRequest } from "./execute";
import { finalizeRequest } from "./after";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
import { auditFailure } from "./audit";
import { Timer } from "./telemetry/timer";
import type { PipelineTiming } from "./execute";
import { detectProtocol } from "@protocols/detect";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import type { IRChatRequest } from "@core/ir";
import {
	decodeOpenAIEmbeddingsRequest,
	decodeOpenAIEmbeddingsResponse,
} from "@protocols/openai-embeddings/decode";
import {
	encodeOpenAIEmbeddingsRequest,
	encodeOpenAIEmbeddingsResponse,
} from "@protocols/openai-embeddings/encode";

export function makeEndpointHandler(opts: { endpoint: Endpoint; schema: any; }) {
    const { endpoint, schema } = opts;

    return async function handler(req: Request) {
        const timer = new Timer();
        const timing: PipelineTiming = {
            timer,
            internal: { adapterMarked: false },
        };
        timing.timer.mark("preflight_start");

        // Log the whole request
        // console.log("Incoming request:", req);

        // Safely log the request body without consuming the original stream
        // req.clone().text().then(body => console.log("Request body:", body)).catch(err => console.error("Error logging request body:", err));

        timing.timer.mark("before_start");
        const pre = await beforeRequest(req, endpoint, timing.timer, schema);
        timing.timer.end("before_start");

        // If before failed, log and return error immediately
        if (!pre.ok) {
            // Use error handler directly
            return await handleError({
                stage: "before",
                res: (pre as { ok: false; response: Response }).response,
                endpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        // ==========================================================================
        // IR PIPELINE
        // Flow: validate → decode to IR → execute via provider executor → decode
        // back to IR → render protocol envelope for the caller.
        // ==========================================================================
        try {
            if (endpoint === "embeddings") {
                // Embeddings use a separate IR flow (no chat normalization)
                timing.timer.mark("protocol_detect");
                (pre.ctx as any).protocol = "openai.embeddings";
                timing.timer.end("protocol_detect");

                timing.timer.mark("ir_decode");
                const ir = decodeOpenAIEmbeddingsRequest(pre.ctx.body);
                timing.timer.end("ir_decode");

                // Normalize request body from IR before execution
                pre.ctx.body = encodeOpenAIEmbeddingsRequest(ir);

                timing.timer.mark("execute_start");
                const exec = await doRequest(pre.ctx, timing);
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

                // Normalize response via Embeddings IR
                if (exec.result.kind === "completed" && exec.result.normalized) {
                    const embeddingIr = decodeOpenAIEmbeddingsResponse(exec.result.normalized);
                    exec.result.normalized = encodeOpenAIEmbeddingsResponse(embeddingIr);
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
            }

            // Protocol detection
            timing.timer.mark("protocol_detect");
            const requestPath = new URL(req.url).pathname;
            const protocol = detectProtocol(endpoint, requestPath);
            (pre.ctx as any).protocol = protocol; // Store for observability
            timing.timer.end("protocol_detect");

            // Decode protocol → IR
            timing.timer.mark("ir_decode");
            const ir: IRChatRequest = decodeProtocol(protocol, pre.ctx.body);
            timing.timer.end("ir_decode");

            // Execute with IR
            timing.timer.mark("execute_start");
            const exec = await doRequestWithIR(pre.ctx, ir, timing);

            // If doRequestWithIR returned a Response, it's an error
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

            // Encode IR → protocol response
            timing.timer.mark("ir_encode");
            let protocolResponse;
            if (exec.result.kind === "completed" && exec.result.ir) {
                protocolResponse = encodeProtocol(protocol, exec.result.ir, pre.ctx.requestId);
            } else {
                // For streaming, we'll handle encoding in the stream processor
                // For now, just pass through
                protocolResponse = null;
            }
            timing.timer.end("ir_encode");

            // Store encoded response in result for finalizeRequest
            if (protocolResponse) {
                exec.result.normalized = protocolResponse;
            }

            // Populate ctx timing
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
            // IR pipeline error
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
    };
}











