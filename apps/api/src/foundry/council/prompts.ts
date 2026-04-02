import type {
	CouncilAnalysis,
	CouncilSourceResult,
	CouncilTaskSpec,
} from "./types";

export const SOURCE_SYSTEM_PROMPT = `You are an independent source model in a multi-model workflow.

Answer the user's question directly and thoroughly.

Rules:
- Work independently and do not mention other models.
- Cover the full task, not just the easiest part.
- State uncertainty explicitly when needed.
- Do not invent facts, citations, or evidence.
- Include important caveats, trade-offs, and edge cases.
- Avoid meta-commentary about the workflow.`;

export const ANALYSIS_SYSTEM_PROMPT = `You are the analysis stage in a multi-model workflow.

Your task is to compare multiple source model responses to the same question.

Do not answer the original question.
Do not synthesise a final response.

Return only a JSON object that follows the schema exactly.

Rules:
- Be faithful to the actual responses.
- Do not invent consensus or disagreement.
- Do not assume majority agreement means correctness.
- Treat omission as omission, not disagreement.
- Prefer concise, high-signal observations.`;

export const FUSION_SYSTEM_PROMPT = `You are the fusion stage in a multi-model workflow.

Write one final answer to the user's original question.

Rules:
- Use the structured analysis as a planning input.
- Build on the strongest supported points.
- Preserve genuinely valuable unique insights.
- Resolve key differences where possible and say so clearly.
- If an issue cannot be resolved confidently, state the uncertainty.
- Do not mention the models or the workflow.
- Do not invent support, citations, or evidence.
- Produce one coherent Markdown answer.`;

export function buildTaskType(prompt: string): CouncilTaskSpec["task_type"] {
	const p = prompt.toLowerCase();
	if (p.includes("how") || p.includes("strategy") || p.includes("pricing")) {
		return "strategy";
	}
	if (
		p.includes("build") ||
		p.includes("implement") ||
		p.includes("code") ||
		p.includes("architecture")
	) {
		return "implementation";
	}
	if (p.includes("compare") || p.includes("evaluate")) {
		return "analysis";
	}
	return "general";
}

export function buildTaskSpec(prompt: string): CouncilTaskSpec {
	return {
		original_prompt: prompt,
		task_type: buildTaskType(prompt),
		instructions: [
			"Answer directly and comprehensively",
			"State uncertainty explicitly",
			"Cover trade-offs, not just one recommendation",
		],
		format_preferences: {
			style: "markdown",
			depth: "detailed",
		},
	};
}

export function buildSourcePayload(args: {
	prompt: string;
	taskSpec: CouncilTaskSpec;
	evidencePack: string | null;
}): string {
	const evidenceBlock = args.evidencePack
		? `## Evidence Pack\n${args.evidencePack}\n\n`
		: "";

	return `## Original Question
${args.prompt}

## Task Specification
${JSON.stringify(args.taskSpec, null, 2)}

${evidenceBlock}## Output Requirements
- Answer directly
- Be comprehensive
- Use Markdown`;
}

export function buildAnalysisPayload(args: {
	prompt: string;
	sourceResults: CouncilSourceResult[];
}): string {
	const blocks = args.sourceResults
		.map((result, index) => {
			const label = `source_${index + 1}`;
			return `### ${label}\n${result.output_text ?? "[no output]"}`;
		})
		.join("\n\n");

	return `## Original Question
${args.prompt}

## Individual Model Responses
${blocks}

## Instructions
Compare these responses across the requested dimensions only.
Return JSON only.`;
}

export function buildFusionPayload(args: {
	prompt: string;
	taskSpec: CouncilTaskSpec;
	sourceResults: CouncilSourceResult[];
	analysis: CouncilAnalysis;
	evidencePack: string | null;
}): string {
	const sources = args.sourceResults
		.map((result, index) => {
			const label = `source_${index + 1}`;
			return `### ${label}\n${result.output_text ?? "[no output]"}`;
		})
		.join("\n\n");
	const evidenceBlock = args.evidencePack
		? `## Evidence Pack\n${args.evidencePack}\n\n`
		: "";

	return `## Original Question
${args.prompt}

## Task Specification
${JSON.stringify(args.taskSpec, null, 2)}

## Individual Model Responses
${sources}

## Pre-Synthesis Analysis
${JSON.stringify(args.analysis, null, 2)}

${evidenceBlock}## Instructions
Write a single, comprehensive answer.
You must address:
- all agreement points that matter
- every material key difference
- all partial coverage items
- every unique insight worth preserving
- every blind spot, either by addressing it or calling it out as unresolved

Return only the final answer in Markdown.`;
}

