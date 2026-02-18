// Purpose: Shared pipeline error-response helpers.
// Why: Keeps unexpected execution error handling consistent across surfaces.
// How: Builds sanitized error payloads and logs scoped pipeline failures.

import type { PipelineContext } from "./before/types";

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

	// Only include raw error text when debug mode is explicitly enabled.
	if (ctx?.meta?.debug?.enabled) {
		payload.message =
			error instanceof Error ? error.message : String(error);
	}

	return new Response(JSON.stringify(payload), {
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

