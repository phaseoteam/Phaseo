import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentDefinition, AgentRunResult, AgentStepRecord } from "./types.js";

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
		type?: string;
		code?: string;
		status?: number;
		status_code?: number;
		stack?: string;
		request_id?: string;
		generation_id?: string;
		error_type?: string;
		error_origin?: string;
		retryable?: boolean;
		action?: string;
		docs_url?: string;
		support_url?: string;
		retry_after_seconds?: number;
		details?: unknown;
	} | null;
	metadata: {
		sdk: "typescript";
		sdk_version: string;
		stream: false;
		model?: string;
		provider?: string;
		request_id?: string;
		generation_id?: string;
		native_response_id?: string;
		error_code?: string;
		error_type?: string;
		error_origin?: string;
		retryable?: boolean;
		action?: string;
		docs_url?: string;
		support_url?: string;
		retry_after_seconds?: number;
		agent_id?: string;
		run_id?: string;
		run_status?: string;
		step_count?: number;
		tool_count?: number;
	};
};

const AGENT_SDK_VERSION = "0.3.0";
const DEFAULT_DEVTOOLS_DIR = ".phaseo-devtools";

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
	const devtoolsError = args.error ? toDevtoolsError(args.error) : null;
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
		error: devtoolsError,
		metadata: {
			sdk: "typescript",
			sdk_version: AGENT_SDK_VERSION,
			stream: false,
			model: latestStep?.model,
			provider: latestStep?.provider,
			request_id: latestStep?.requestId ?? devtoolsError?.request_id,
			generation_id: devtoolsError?.generation_id,
			native_response_id: latestStep?.nativeResponseId ?? undefined,
			error_code: devtoolsError?.code,
			error_type: devtoolsError?.error_type,
			error_origin: devtoolsError?.error_origin,
			retryable: devtoolsError?.retryable,
			action: devtoolsError?.action,
			docs_url: devtoolsError?.docs_url,
			support_url: devtoolsError?.support_url,
			retry_after_seconds: devtoolsError?.retry_after_seconds,
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
			: process.env.PHASEO_DEVTOOLS === "true";
	return {
		enabled,
		directory: config?.directory ?? process.env.PHASEO_DEVTOOLS_DIR ?? DEFAULT_DEVTOOLS_DIR,
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
	const gateway = isRecord(error) && error.name === "AgentGatewayError" ? error : null;
	return {
		message: error instanceof Error ? error.message : String(error),
		type: error instanceof Error ? error.name : undefined,
		code:
			readString(gateway?.code) ??
			(typeof (error as { code?: unknown })?.code === "string"
				? (error as { code: string }).code
				: undefined),
		status:
			typeof (error as { status?: unknown })?.status === "number"
				? (error as { status: number }).status
				: undefined,
		status_code:
			typeof (error as { status?: unknown })?.status === "number"
				? (error as { status: number }).status
				: undefined,
		request_id: readString(gateway?.requestId),
		generation_id: readString(gateway?.generationId),
		error_type: readString(gateway?.errorType),
		error_origin: readString(gateway?.errorOrigin),
		retryable: typeof gateway?.retryable === "boolean" ? gateway.retryable : undefined,
		action: readString(gateway?.action),
		docs_url: readString(gateway?.docsUrl),
		support_url: readString(gateway?.supportUrl),
		retry_after_seconds:
			typeof gateway?.retryAfterSeconds === "number" ? gateway.retryAfterSeconds : undefined,
		details: gateway?.details,
		stack: error instanceof Error ? error.stack : undefined,
	};
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
