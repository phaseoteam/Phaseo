// src/lib/gateway/route-factory.ts
// Purpose: Pipeline entrypoint that wires before/execute/after stages.
// Why: Provides a single request lifecycle orchestrator.
// How: Orchestrates before -> execute -> after with timing hooks.

import { beforeRequest } from "./before";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
import { auditFailure } from "./audit";
import { Timer } from "./telemetry/timer";
import type { PipelineTiming } from "./execute";
import { resolvePipeline } from "./registry";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "./error-response";

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

        try {
            const runner = resolvePipeline(endpoint);
            return runner({ pre, req, endpoint, timing });
        } catch (err) {
            logPipelineExecutionError("entrypoint", err);
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
    };
}
