import type { z } from "zod";
import type {
	CouncilAnalysisSchema,
	CouncilRunConfigSchema,
	CouncilRunCreateSchema,
} from "./schema";

export type CouncilRunCreateInput = z.infer<typeof CouncilRunCreateSchema>;
export type CouncilRunConfig = z.infer<typeof CouncilRunConfigSchema>;
export type CouncilAnalysis = z.infer<typeof CouncilAnalysisSchema>;

export type CouncilRunStatus =
	| "queued"
	| "running_sources"
	| "running_analysis"
	| "running_fusion"
	| "completed"
	| "partial"
	| "failed";

export type CouncilStepType = "source" | "analysis" | "fusion";
export type CouncilStepStatus = "pending" | "completed" | "failed";

export type CouncilRunEventType =
	| "run.created"
	| "sources.started"
	| "source.completed"
	| "source.failed"
	| "analysis.started"
	| "analysis.completed"
	| "analysis.failed"
	| "fusion.started"
	| "fusion.completed"
	| "run.partial"
	| "run.completed"
	| "run.failed";

export type CouncilRunEvent = {
	type: CouncilRunEventType;
	at: string;
	data?: Record<string, unknown>;
};

export type CouncilTaskSpec = {
	original_prompt: string;
	task_type: "analysis" | "strategy" | "implementation" | "general";
	instructions: string[];
	format_preferences: {
		style: "markdown";
		depth: "detailed";
	};
};

export type CouncilSourceResult = {
	child_index: number;
	model_id: string;
	status: "completed" | "failed";
	output_text: string | null;
	latency_ms: number;
	input_tokens: number | null;
	output_tokens: number | null;
	cost_usd: number | null;
	error: string | null;
};

export type CouncilRunStep = {
	id: string;
	step_type: CouncilStepType;
	step_order: number;
	model_id: string | null;
	status: CouncilStepStatus;
	latency_ms: number | null;
	input_tokens: number | null;
	output_tokens: number | null;
	cost_usd: number | null;
	error: string | null;
	output_preview: string | null;
	created_at: string;
	completed_at: string | null;
};

export type CouncilRunRecord = {
	id: string;
	feature: "council";
	workspace_id: string;
	user_id: string | null;
	status: CouncilRunStatus;
	conversation_id: string | null;
	original_prompt: string;
	task_spec_json: CouncilTaskSpec;
	grounding_enabled: boolean;
	source_model_ids: string[];
	analyser_model_id: string;
	fuser_model_id: string;
	config: CouncilRunConfig;
	source_results: CouncilSourceResult[];
	analysis_json: CouncilAnalysis | null;
	final_answer_markdown: string | null;
	steps: CouncilRunStep[];
	events: CouncilRunEvent[];
	total_cost_usd: number | null;
	total_input_tokens: number;
	total_output_tokens: number;
	error: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
};

