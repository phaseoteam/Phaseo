// Purpose: Shared pipeline error-response helpers.
// Why: Keeps unexpected execution error handling consistent across surfaces.
// How: Builds sanitized error payloads and logs scoped pipeline failures.

import type { PipelineContext } from "./before/types";
import { safeJsonStringify } from "@/lib/safe-json";

export function buildPipelineExecutionErrorResponse(
	error: unknown,
	ctx?: PipelineContext,
): Response {
	const payload: Record<string, unknown> = {
		error: "pipeline_execution_error",
		description: "Internal pipeline execution error.",
	};

	if (ctx?.requestId) {
		payload.request_id = ctx.requestId;
	}

	// Never return exception text to callers. Debug mode may add request-scoped
	// diagnostics elsewhere, but implementation errors remain server-only.
	void error;

	return new Response(safeJsonStringify(payload), {
		status: 500,
		headers: { "Content-Type": "application/json" },
	});
}

export function logPipelineExecutionError(
	scope: string,
	error: unknown,
): void {
	console.error(`${scope} pipeline error:`, error);
}
