// Purpose: Pipeline surface contracts.
// Why: Shared shape for per-surface pipeline runners.
// How: Defines the input each surface handler receives.

import type { Endpoint } from "@core/types";
import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "../execute";

export type PipelineRunnerArgs = {
	pre: { ok: true; ctx: PipelineContext };
	req: Request;
	endpoint: Endpoint;
	timing: PipelineTiming;
};
