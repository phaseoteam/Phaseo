// Purpose: Pipeline registry for endpoint -> surface routing.
// Why: Avoids a growing if/else block in the pipeline entrypoint.
// How: Maps endpoints to per-surface pipeline runners.

import type { Endpoint } from "@core/types";
import type { PipelineRunnerArgs } from "./surfaces/types";
import { runTextGeneratePipeline } from "./surfaces/text-generate";
import { runEmbeddingsPipeline } from "./surfaces/embeddings";
import { runModerationsPipeline } from "./surfaces/moderations";

export type PipelineRunner = (args: PipelineRunnerArgs) => Promise<Response>;

const PIPELINES: Partial<Record<Endpoint, PipelineRunner>> = {
	embeddings: runEmbeddingsPipeline,
	moderations: runModerationsPipeline,
	"chat.completions": runTextGeneratePipeline,
	responses: runTextGeneratePipeline,
	messages: runTextGeneratePipeline,
};

export function resolvePipeline(endpoint: Endpoint): PipelineRunner {
	return PIPELINES[endpoint] ?? runTextGeneratePipeline;
}
