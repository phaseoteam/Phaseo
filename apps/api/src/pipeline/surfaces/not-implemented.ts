// Purpose: Placeholder pipeline surface for endpoints intentionally disabled.
// Why: Keeps endpoint routing explicit while unsupported features are deferred.
// How: Returns a consistent not_implemented response with request correlation.

import type { PipelineRunnerArgs } from "./types";

export async function runNotImplementedPipeline(
	args: PipelineRunnerArgs,
): Promise<Response> {
	const { pre, endpoint } = args;
	return new Response(
		JSON.stringify({
			generation_id: pre.ctx.requestId,
			status_code: 501,
			error: "not_implemented",
			description: `Endpoint ${endpoint} is not implemented yet.`,
		}),
		{
			status: 501,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		},
	);
}

