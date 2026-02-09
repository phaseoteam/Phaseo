// Purpose: Pipeline registry for endpoint -> surface routing.
// Why: Avoids a growing if/else block in the pipeline entrypoint.
// How: Maps endpoints to per-surface pipeline runners.

import type { Endpoint } from "@core/types";
import type { PipelineRunnerArgs } from "./surfaces/types";
import { runTextGeneratePipeline } from "./surfaces/text-generate";
import { runEmbeddingsPipeline } from "./surfaces/embeddings";
import { runModerationsPipeline } from "./surfaces/moderations";
import { runVideoGeneratePipeline } from "./surfaces/video-generate";
import { runAdapterPipeline } from "./surfaces/adapter";
import { runNonTextPipeline } from "./surfaces/non-text";

export type PipelineRunner = (args: PipelineRunnerArgs) => Promise<Response>;

const PIPELINES: Partial<Record<Endpoint, PipelineRunner>> = {
	embeddings: runEmbeddingsPipeline,
	moderations: runModerationsPipeline,
	"chat.completions": runTextGeneratePipeline,
	responses: runTextGeneratePipeline,
	messages: runTextGeneratePipeline,
	"images.generations": runNonTextPipeline,
	"images.edits": runNonTextPipeline,
	"audio.speech": runNonTextPipeline,
	"audio.transcription": runNonTextPipeline,
	"audio.translations": runNonTextPipeline,
	"video.generation": runVideoGeneratePipeline,
	ocr: runNonTextPipeline,
	"music.generate": runNonTextPipeline,
	batch: runAdapterPipeline,
};

export function resolvePipeline(endpoint: Endpoint): PipelineRunner {
	return PIPELINES[endpoint] ?? runTextGeneratePipeline;
}
