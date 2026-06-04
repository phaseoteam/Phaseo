import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentDefinition, AgentRunResult, AgentStepRecord } from "./types";

export type AgentDevtoolsConfig = {
	enabled?: boolean;
	directory?: string;
	flushIntervalMs?: number;
	maxQueueSize?: number;
	captureHeaders?: boolean;
	saveAssets?: boolean;
};

type AgentDevtoolsEntry = {
	id: string;
	type: "agent.run" | "agent.continue";
	timestamp: number;
	duration_ms: number;
	request: Record<string, unknown>;
	response: Record<string, unknown> | null;
	error: {
		message: string;
		code?: string;
		status?: number;
		stack?: string;
	} | null;
	metadata: {
		sdk: "typescript";
		sdk_version: string;
		stream: false;
		model?: string;
		provider?: string;
		request_id?: string;
		native_response_id?: string;
		agent_id?: string;
		run_id?: string;
		run_status?: string;
		step_count?: number;
		tool_count?: number;
	};
};

const AGENT_SDK_VERSION = "0.1.0";
const DEFAULT_DEVTOOLS_DIR = ".ai-stats-devtools";

export function createAgentDevtools(
	options: AgentDevtoolsConfig = {},
): Partial<AgentDevtoolsConfig> {
	return {
		enabled: true,
		...options,
	};
}

export function captureAgentRunDevtools<TInput, TOutput, TContext>(args: {
	type: "agent.run" | "agent.continue";
	definition: AgentDefinition<TInput, TOutput, TContext>;
	options: {
		input?: TInput;
		context?: TContext;
		model?: string;
		preset?: string;
		maxSteps?: number;
		devtools?: Partial<AgentDevtoolsConfig>;
	};
	startedAt: number;
	result?: AgentRunResult<TOutput, TInput, TContext>;
	error?: unknown;
	runId?: string;
}) {
	const config = resolveDevtoolsConfig(args.options.devtools);
	if (!config.enabled) return;

	const latestStep = findLatestStep(args.result?.steps);
	const entry: AgentDevtoolsEntry = {
		id: args.result?.run.id ?? args.runId ?? randomUUID(),
		type: args.type,
		timestamp: args.startedAt,
		duration_ms: Date.now() - args.startedAt,
		request: {
			agent_id: args.definition.id,
			input: args.options.input,
			context: args.options.context,
			model: args.options.model ?? args.definition.model,
			preset: args.options.preset ?? args.definition.preset,
			max_steps: args.options.maxSteps ?? args.definition.maxSteps,
			tool_count: args.definition.tools?.length ?? 0,
		},
		response: args.result
			? {
					run: args.result.run,
					steps: args.result.steps,
					output: args.result.output,
					messages: args.result.messages,
				}
			: null,
		error: args.error ? toDevtoolsError(args.error) : null,
		metadata: {
			sdk: "typescript",
			sdk_version: AGENT_SDK_VERSION,
			stream: false,
			model: latestStep?.model,
			provider: latestStep?.provider,
			request_id: latestStep?.requestId,
			native_response_id: latestStep?.nativeResponseId ?? undefined,
			agent_id: args.definition.id,
			run_id: args.result?.run.id ?? args.runId,
			run_status: args.result?.run.status,
			step_count: args.result?.steps.length,
			tool_count: countToolCalls(args.result?.steps),
		},
	};

	writeDevtoolsEntry(config.directory, entry);
}

function resolveDevtoolsConfig(config?: Partial<AgentDevtoolsConfig>) {
	const enabled =
		typeof config?.enabled === "boolean"
			? config.enabled
			: process.env.AI_STATS_DEVTOOLS === "true";
	return {
		enabled,
		directory: config?.directory ?? process.env.AI_STATS_DEVTOOLS_DIR ?? DEFAULT_DEVTOOLS_DIR,
	};
}

function writeDevtoolsEntry(directory: string, entry: AgentDevtoolsEntry) {
	fs.mkdirSync(path.join(directory, "assets", "images"), { recursive: true });
	fs.mkdirSync(path.join(directory, "assets", "audio"), { recursive: true });
	fs.mkdirSync(path.join(directory, "assets", "video"), { recursive: true });

	const metadataPath = path.join(directory, "metadata.json");
	if (!fs.existsSync(metadataPath)) {
		fs.writeFileSync(
			metadataPath,
			JSON.stringify(
				{
					session_id: randomUUID(),
					started_at: Date.now(),
					sdk: "typescript",
					sdk_version: AGENT_SDK_VERSION,
					platform: process.platform,
					node_version: process.version,
				},
				null,
				2,
			),
			"utf-8",
		);
	}

	fs.appendFileSync(path.join(directory, "generations.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
}

function findLatestStep(steps: AgentStepRecord[] | undefined) {
	if (!steps?.length) return undefined;
	return steps[steps.length - 1];
}

function countToolCalls(steps: AgentStepRecord[] | undefined) {
	if (!steps?.length) return 0;
	return steps.reduce((count, step) => count + (step.toolCalls?.length ?? 0), 0);
}

function toDevtoolsError(error: unknown) {
	return {
		message: error instanceof Error ? error.message : String(error),
		code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined,
		status:
			typeof (error as { status?: unknown })?.status === "number"
				? (error as { status: number }).status
				: undefined,
		stack: error instanceof Error ? error.stack : undefined,
	};
}
