import { ResponsesSchema } from "@/core/schemas";
import { makeEndpointHandler } from "@/pipeline";
import { ensureRuntimeForBackground } from "@/runtime/env";
import {
	ANALYSIS_SYSTEM_PROMPT,
	buildAnalysisPayload,
	buildFusionPayload,
	buildSourcePayload,
	FUSION_SYSTEM_PROMPT,
	SOURCE_SYSTEM_PROMPT,
} from "./prompts";
import {
	CouncilAnalysisSchema,
	COUNCIL_ANALYSIS_JSON_SCHEMA,
} from "./schema";
import {
	appendRunEvent,
	getCouncilRun,
	putCouncilRun,
	setRunStatus,
} from "./store";
import type {
	CouncilAnalysis,
	CouncilRunRecord,
	CouncilRunStep,
	CouncilSourceResult,
} from "./types";

const responsesHandler = makeEndpointHandler({
	endpoint: "responses",
	schema: ResponsesSchema,
});

type InvokeResult = {
	ok: boolean;
	payload: any | null;
	text: string;
	latencyMs: number;
	inputTokens: number | null;
	outputTokens: number | null;
	error: string | null;
};

type AnalysisRunResult =
	| {
			ok: true;
			analysis: CouncilAnalysis;
			rawText: string;
			latencyMs: number;
			inputTokens: number | null;
			outputTokens: number | null;
	  }
	| {
			ok: false;
			error: string;
			rawText: string;
			latencyMs: number;
			inputTokens: number | null;
			outputTokens: number | null;
	  };

type AnalysisFailureResult = Extract<AnalysisRunResult, { ok: false }>;

function isAnalysisFailure(
	result: AnalysisRunResult,
): result is AnalysisFailureResult {
	return result.ok === false;
}

function extractText(payload: any): string {
	if (!payload || typeof payload !== "object") return "";
	if (typeof payload.output_text === "string" && payload.output_text.trim()) {
		return payload.output_text;
	}

	const parts: string[] = [];
	const outputItems = Array.isArray(payload.output)
		? payload.output
		: Array.isArray(payload.response?.output)
			? payload.response.output
			: [];

	for (const item of outputItems) {
		if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
		for (const contentPart of item.content) {
			if (typeof contentPart?.text === "string" && contentPart.text.trim()) {
				parts.push(contentPart.text.trim());
			}
		}
	}

	if (parts.length > 0) {
		return parts.join("\n\n");
	}

	const chatChoices = Array.isArray(payload.choices) ? payload.choices : [];
	for (const choice of chatChoices) {
		const content = choice?.message?.content;
		if (typeof content === "string" && content.trim()) {
			parts.push(content.trim());
		}
	}

	return parts.join("\n\n");
}

function extractUsage(payload: any): {
	inputTokens: number | null;
	outputTokens: number | null;
} {
	const usage = payload?.usage ?? payload?.response?.usage;
	if (!usage || typeof usage !== "object") {
		return { inputTokens: null, outputTokens: null };
	}

	const promptTokens = Number(
		usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0,
	);
	const completionTokens = Number(
		usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0,
	);

	return {
		inputTokens: Number.isFinite(promptTokens) ? promptTokens : null,
		outputTokens: Number.isFinite(completionTokens) ? completionTokens : null,
	};
}

function createStep(args: {
	stepType: CouncilRunStep["step_type"];
	stepOrder: number;
	modelId: string | null;
	status: CouncilRunStep["status"];
	latencyMs: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
	error: string | null;
	outputPreview: string | null;
}): CouncilRunStep {
	const nowIso = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		step_type: args.stepType,
		step_order: args.stepOrder,
		model_id: args.modelId,
		status: args.status,
		latency_ms: args.latencyMs,
		input_tokens: args.inputTokens,
		output_tokens: args.outputTokens,
		cost_usd: null,
		error: args.error,
		output_preview: args.outputPreview,
		created_at: nowIso,
		completed_at: nowIso,
	};
}

function previewText(text: string | null, maxChars = 700): string | null {
	if (!text) return null;
	const trimmed = text.trim();
	if (!trimmed) return null;
	return trimmed.length <= maxChars
		? trimmed
		: `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function extractJsonCandidate(text: string): string {
	const direct = text.trim();
	if (direct.startsWith("{") && direct.endsWith("}")) {
		return direct;
	}

	const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	const firstBrace = direct.indexOf("{");
	const lastBrace = direct.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		return direct.slice(firstBrace, lastBrace + 1);
	}

	return direct;
}

function tryParseAnalysis(text: string): CouncilAnalysis | null {
	const candidate = extractJsonCandidate(text);
	try {
		const parsed = JSON.parse(candidate);
		const validated = CouncilAnalysisSchema.safeParse(parsed);
		return validated.success ? validated.data : null;
	} catch {
		return null;
	}
}

async function invokeResponses(args: {
	authorizationHeader: string;
	body: Record<string, unknown>;
}): Promise<InvokeResult> {
	const startedAt = Date.now();
	const request = new Request("https://ai-stats.local/v1/responses", {
		method: "POST",
		headers: {
			Authorization: args.authorizationHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(args.body),
	});

	try {
		const response = await responsesHandler(request);
		const rawText = await response.text();
		let payload: any = null;
		try {
			payload = rawText ? JSON.parse(rawText) : null;
		} catch {
			payload = null;
		}

		const latencyMs = Date.now() - startedAt;
		const usage = extractUsage(payload);
		const text = extractText(payload);

		if (!response.ok) {
			const errorMessage =
				typeof payload?.error?.message === "string"
					? payload.error.message
					: typeof payload?.message === "string"
						? payload.message
						: rawText || `responses_failed_${response.status}`;
			return {
				ok: false,
				payload,
				text,
				latencyMs,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				error: errorMessage,
			};
		}

		return {
			ok: true,
			payload,
			text,
			latencyMs,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			error: null,
		};
	} catch (error: any) {
		return {
			ok: false,
			payload: null,
			text: "",
			latencyMs: Date.now() - startedAt,
			inputTokens: null,
			outputTokens: null,
			error: String(error?.message ?? error ?? "responses_execution_failed"),
		};
	}
}

async function runAnalysis(args: {
	run: CouncilRunRecord;
	authorizationHeader: string;
	sourceResults: CouncilSourceResult[];
}): Promise<AnalysisRunResult> {
	const analysisPayload = buildAnalysisPayload({
		prompt: args.run.original_prompt,
		sourceResults: args.sourceResults,
	});

	const baseBody: Record<string, unknown> = {
		model: args.run.analyser_model_id,
		stream: false,
		temperature: 0.1,
		max_output_tokens: 1300,
		reasoning: {
			effort: "low",
		},
		text: {
			format: {
				type: "json_schema",
				name: "council_analysis",
				strict: true,
				schema: COUNCIL_ANALYSIS_JSON_SCHEMA,
			},
		},
	};

	const firstAttempt = await invokeResponses({
		authorizationHeader: args.authorizationHeader,
		body: {
			...baseBody,
			input: [
				{
					role: "system",
					content: [{ type: "input_text", text: ANALYSIS_SYSTEM_PROMPT }],
				},
				{
					role: "user",
					content: [{ type: "input_text", text: analysisPayload }],
				},
			],
		},
	});

	if (firstAttempt.ok) {
		const parsed = tryParseAnalysis(firstAttempt.text);
		if (parsed) {
			return {
				ok: true,
				analysis: parsed,
				rawText: firstAttempt.text,
				latencyMs: firstAttempt.latencyMs,
				inputTokens: firstAttempt.inputTokens,
				outputTokens: firstAttempt.outputTokens,
			};
		}
	}

	const repairPrompt = `Return a valid JSON object that matches this schema exactly.
Do not include markdown or prose.

Schema:
${JSON.stringify(COUNCIL_ANALYSIS_JSON_SCHEMA)}

Candidate output:
${firstAttempt.text}`;

	const repairAttempt = await invokeResponses({
		authorizationHeader: args.authorizationHeader,
		body: {
			...baseBody,
			input: [
				{
					role: "system",
					content: [{ type: "input_text", text: "You repair JSON output." }],
				},
				{
					role: "user",
					content: [{ type: "input_text", text: repairPrompt }],
				},
			],
		},
	});

	if (repairAttempt.ok) {
		const repaired = tryParseAnalysis(repairAttempt.text);
		if (repaired) {
			return {
				ok: true,
				analysis: repaired,
				rawText: repairAttempt.text,
				latencyMs: firstAttempt.latencyMs + repairAttempt.latencyMs,
				inputTokens:
					(firstAttempt.inputTokens ?? 0) + (repairAttempt.inputTokens ?? 0),
				outputTokens:
					(firstAttempt.outputTokens ?? 0) + (repairAttempt.outputTokens ?? 0),
			};
		}
	}

	return {
		ok: false,
		error:
			firstAttempt.error ??
			repairAttempt.error ??
			"analysis_failed_to_match_schema",
		rawText: repairAttempt.text || firstAttempt.text,
		latencyMs: firstAttempt.latencyMs + repairAttempt.latencyMs,
		inputTokens:
			(firstAttempt.inputTokens ?? 0) + (repairAttempt.inputTokens ?? 0),
		outputTokens:
			(firstAttempt.outputTokens ?? 0) + (repairAttempt.outputTokens ?? 0),
	};
}

function recomputeTotals(run: CouncilRunRecord): CouncilRunRecord {
	let totalInput = 0;
	let totalOutput = 0;
	for (const step of run.steps) {
		totalInput += step.input_tokens ?? 0;
		totalOutput += step.output_tokens ?? 0;
	}
	return {
		...run,
		total_input_tokens: totalInput,
		total_output_tokens: totalOutput,
		total_cost_usd: null,
	};
}

export async function runCouncilOrchestration(args: {
	runId: string;
	authorizationHeader: string;
}) {
	const releaseRuntime = ensureRuntimeForBackground();
	try {
		let run = await getCouncilRun(args.runId);
		if (!run) return;

		run = await setRunStatus(run, "running_sources");
		run = await appendRunEvent(run, "sources.started", {
			source_model_count: run.source_model_ids.length,
		});

		const sourceRuns = await Promise.all(
			run.source_model_ids.map(async (modelId, index) => {
				const sourcePayload = buildSourcePayload({
					prompt: run.original_prompt,
					taskSpec: run.task_spec_json,
					evidencePack: null,
				});

				const result = await invokeResponses({
					authorizationHeader: args.authorizationHeader,
					body: {
						model: modelId,
						stream: false,
						temperature: run.config.temperature,
						max_output_tokens: run.config.max_source_output_tokens,
						reasoning: {
							effort: run.config.reasoning_effort,
						},
						input: [
							{
								role: "system",
								content: [
									{ type: "input_text", text: SOURCE_SYSTEM_PROMPT },
								],
							},
							{
								role: "user",
								content: [
									{ type: "input_text", text: sourcePayload },
								],
							},
						],
					},
				});

				const sourceResult: CouncilSourceResult = {
					child_index: index,
					model_id: modelId,
					status: result.ok ? "completed" : "failed",
					output_text: result.ok ? result.text : null,
					latency_ms: result.latencyMs,
					input_tokens: result.inputTokens,
					output_tokens: result.outputTokens,
					error: result.error,
				};

				return sourceResult;
			}),
		);

		const stepStart = run.steps.length + 1;
		const sourceSteps = sourceRuns.map((source, index) =>
			createStep({
				stepType: "source",
				stepOrder: stepStart + index,
				modelId: source.model_id,
				status: source.status === "completed" ? "completed" : "failed",
				latencyMs: source.latency_ms,
				inputTokens: source.input_tokens,
				outputTokens: source.output_tokens,
				error: source.error,
				outputPreview: previewText(source.output_text),
			}),
		);

		run = recomputeTotals({
			...run,
			source_results: sourceRuns,
			steps: [...run.steps, ...sourceSteps],
			updated_at: new Date().toISOString(),
		});
		await putCouncilRun(run);

		for (const source of sourceRuns) {
			run = await appendRunEvent(
				run,
				source.status === "completed" ? "source.completed" : "source.failed",
				{
					model_id: source.model_id,
					latency_ms: source.latency_ms,
					error: source.error,
				},
			);
		}

		const successfulSources = sourceRuns.filter(
			(result) => result.status === "completed" && Boolean(result.output_text),
		);

		if (successfulSources.length < 2) {
			run = await setRunStatus(run, "failed");
			run = await appendRunEvent(run, "run.failed", {
				reason: "insufficient_source_quorum",
			});
			run = {
				...run,
				error: "insufficient_source_quorum",
				updated_at: new Date().toISOString(),
			};
			await putCouncilRun(run);
			return;
		}

		run = await setRunStatus(run, "running_analysis");
		run = await appendRunEvent(run, "analysis.started");

		const analysisResult = await runAnalysis({
			run,
			authorizationHeader: args.authorizationHeader,
			sourceResults: successfulSources,
		});
		let analysisErrorForStep: string | null = null;
		if (isAnalysisFailure(analysisResult)) {
			analysisErrorForStep = analysisResult.error;
		}

		const analysisStep = createStep({
			stepType: "analysis",
			stepOrder: run.steps.length + 1,
			modelId: run.analyser_model_id,
			status: analysisResult.ok ? "completed" : "failed",
			latencyMs: analysisResult.latencyMs,
			inputTokens: analysisResult.inputTokens,
			outputTokens: analysisResult.outputTokens,
			error: analysisErrorForStep,
			outputPreview: previewText(analysisResult.rawText),
		});

		const resolvedAnalysis = analysisResult.ok ? analysisResult.analysis : null;
		run = recomputeTotals({
			...run,
			analysis_json: resolvedAnalysis,
			steps: [...run.steps, analysisStep],
			updated_at: new Date().toISOString(),
		});
		await putCouncilRun(run);

		if (isAnalysisFailure(analysisResult)) {
			const analysisError = analysisResult.error;
			run = await setRunStatus(run, "partial");
			run = await appendRunEvent(run, "analysis.failed", {
				error: analysisError,
			});
			run = await appendRunEvent(run, "run.partial", {
				reason: "analysis_failed",
			});
			run = {
				...run,
				error: analysisError,
				updated_at: new Date().toISOString(),
			};
			await putCouncilRun(run);
			return;
		}

		run = await appendRunEvent(run, "analysis.completed");
		run = await setRunStatus(run, "running_fusion");
		run = await appendRunEvent(run, "fusion.started");

		const fusionPayload = buildFusionPayload({
			prompt: run.original_prompt,
			taskSpec: run.task_spec_json,
			sourceResults: successfulSources,
			analysis: analysisResult.analysis,
			evidencePack: null,
		});

		const fusionResult = await invokeResponses({
			authorizationHeader: args.authorizationHeader,
			body: {
				model: run.fuser_model_id,
				stream: false,
				temperature: Math.max(0.2, Math.min(0.4, run.config.temperature)),
				max_output_tokens: run.config.max_fuser_output_tokens,
				reasoning: {
					effort: run.config.reasoning_effort,
				},
				input: [
					{
						role: "system",
						content: [{ type: "input_text", text: FUSION_SYSTEM_PROMPT }],
					},
					{
						role: "user",
						content: [{ type: "input_text", text: fusionPayload }],
					},
				],
			},
		});

		const fusionStep = createStep({
			stepType: "fusion",
			stepOrder: run.steps.length + 1,
			modelId: run.fuser_model_id,
			status: fusionResult.ok ? "completed" : "failed",
			latencyMs: fusionResult.latencyMs,
			inputTokens: fusionResult.inputTokens,
			outputTokens: fusionResult.outputTokens,
			error: fusionResult.error,
			outputPreview: previewText(fusionResult.text),
		});

		run = recomputeTotals({
			...run,
			final_answer_markdown: fusionResult.ok ? fusionResult.text : null,
			steps: [...run.steps, fusionStep],
			updated_at: new Date().toISOString(),
		});
		await putCouncilRun(run);

		if (!fusionResult.ok || !fusionResult.text.trim()) {
			run = await setRunStatus(run, "partial");
			run = await appendRunEvent(run, "run.partial", {
				reason: "fusion_failed",
				error: fusionResult.error,
			});
			run = {
				...run,
				error: fusionResult.error ?? "fusion_failed",
				updated_at: new Date().toISOString(),
			};
			await putCouncilRun(run);
			return;
		}

		run = await appendRunEvent(run, "fusion.completed");
		run = await setRunStatus(run, "completed");
		run = await appendRunEvent(run, "run.completed");
		run = {
			...run,
			error: null,
			updated_at: new Date().toISOString(),
		};
		await putCouncilRun(run);
	} catch (error: any) {
		const run = await getCouncilRun(args.runId);
		if (run) {
			const failed = await setRunStatus(run, "failed");
			const withEvent = await appendRunEvent(failed, "run.failed", {
				reason: "orchestrator_exception",
				error: String(error?.message ?? error),
			});
			await putCouncilRun({
				...withEvent,
				error: String(error?.message ?? error),
				updated_at: new Date().toISOString(),
			});
		}
	} finally {
		releaseRuntime();
	}
}
