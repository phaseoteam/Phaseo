import type { AgentGatewayErrorDetails } from "./errors.js";
import type { AgentDevtoolsConfig } from "./devtools.js";

export type AgentToolCall = {
	id: string;
	name: string;
	input: unknown;
};

export type AgentMessage =
	| {
		role: "system" | "user";
		content: string;
	}
	| {
		role: "assistant";
		content: string;
		toolCalls?: AgentToolCall[];
	}
	| {
		role: "tool";
		content: string;
		toolCallId: string;
		name: string;
	};

export type AgentTool<TInput = unknown, TOutput = unknown, TContext = unknown> = {
	id: string;
	description?: string;
	parameters?: Record<string, unknown>;
	timeoutMs?: number;
	execute: (input: TInput, context: AgentRuntimeContext<TContext>) => Promise<TOutput> | TOutput;
};

export type AgentRuntimeContext<TContext = unknown> = {
	runId: string;
	agentId: string;
	stepIndex: number;
	context: TContext | undefined;
	signal?: AbortSignal;
};

export type AgentModelRequest<TContext = unknown> = {
	agentId: string;
	model?: string;
	instructions?: string;
	messages: AgentMessage[];
	tools: Array<Pick<AgentTool, "id" | "description" | "parameters">>;
	context: TContext | undefined;
	signal?: AbortSignal;
};

export type AgentModelResponse = {
	message: Extract<AgentMessage, { role: "assistant" }>;
	usage?: Record<string, unknown>;
	requestId?: string;
	nativeResponseId?: string | null;
	provider?: string;
	model?: string;
	responseMeta?: Record<string, unknown>;
};

export type AgentModelClient<TContext = unknown> = {
	generate: (request: AgentModelRequest<TContext>) => Promise<AgentModelResponse>;
};

export type AgentModelRetryConfig = {
	maxRetries?: number;
	backoffMs?: number;
};

export type AgentToolExecutionConfig = {
	toolConcurrency?: number;
};

export type AgentEvent =
	| {
			type: "run.started" | "run.completed" | "run.failed" | "run.cancelled";
			runId: string;
			agentId: string;
			timestamp: string;
			status: AgentRunStatus;
			output?: unknown;
			error?: string;
			errorDetails?: AgentGatewayErrorDetails;
	  }
	| {
			type: "run.resumed";
			runId: string;
			agentId: string;
			timestamp: string;
			status: AgentRunStatus;
			previousStatus: AgentRunStatus;
	  }
	| {
			type: "run.waiting_for_human";
			runId: string;
			agentId: string;
			timestamp: string;
			status: AgentRunStatus;
			stepIndex: number;
			pause: AgentHumanPause;
	  }
	| {
			type:
				| "step.started"
				| "step.completed"
				| "step.cancelled"
				| "step.failed"
				| "model.requested"
				| "model.failed"
				| "model.completed"
				| "checkpoint.saved";
			runId: string;
			agentId: string;
			timestamp: string;
			status: AgentRunStatus;
			stepIndex: number;
			attempt?: number;
			requestId?: string;
			nativeResponseId?: string | null;
			provider?: string;
			model?: string;
			usage?: Record<string, unknown>;
			responseMeta?: Record<string, unknown>;
			error?: string;
			errorDetails?: AgentGatewayErrorDetails;
	  }
	| {
			type: "tool.started" | "tool.completed" | "tool.failed";
			runId: string;
			agentId: string;
			timestamp: string;
			status: AgentRunStatus;
			stepIndex: number;
			toolCallId: string;
			toolName: string;
			output?: unknown;
			error?: string;
	  };

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

export type AgentHumanPause = {
	reason: string;
	payload?: unknown;
	requestedAt: string;
};

export type AgentHumanReviewRequest = {
	reason: string;
	payload?: unknown;
};

export type AgentHumanReviewContext<TInput = unknown, TContext = unknown, TOutput = unknown> = {
	runId: string;
	agentId: string;
	stepIndex: number;
	input: TInput;
	context: TContext | undefined;
	messages: AgentMessage[];
	response: AgentModelResponse;
	parsedOutput?: TOutput;
};

export type AgentDefinition<TInput = unknown, TOutput = unknown, TContext = unknown> = {
	id: string;
	model?: string;
	preset?: string;
	instructions?: string;
	tools?: AgentTool<any, any, TContext>[];
	maxSteps?: number;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	parseOutput?: (text: string) => TOutput;
	humanReview?: (
		context: AgentHumanReviewContext<TInput, TContext, TOutput>,
	) =>
		| AgentHumanReviewRequest
		| null
		| Promise<AgentHumanReviewRequest | null>;
};

export type AgentRunStatus =
	| "queued"
	| "running"
	| "waiting_for_tools"
	| "waiting_for_human"
	| "completed"
	| "failed"
	| "cancelled";

export type AgentStepStatus =
	| "pending"
	| "executing_model"
	| "executing_tools"
	| "checkpointed"
	| "cancelled"
	| "failed";

export type AgentRunRecord<TInput = unknown, TContext = unknown, TOutput = unknown> = {
	id: string;
	agentId: string;
	status: AgentRunStatus;
	input: TInput;
	context?: TContext;
	messages: AgentMessage[];
	result?: TOutput;
	error?: string;
	errorDetails?: AgentGatewayErrorDetails;
	pause?: AgentHumanPause | null;
	createdAt: string;
	updatedAt: string;
	stepCount: number;
};

export type AgentStepRecord = {
	runId: string;
	index: number;
	status: AgentStepStatus;
	requestId?: string;
	nativeResponseId?: string | null;
	provider?: string;
	model?: string;
	modelAttempts?: number;
	usage?: Record<string, unknown>;
	toolCalls?: AgentToolCall[];
	responseMeta?: Record<string, unknown>;
	error?: string;
	errorDetails?: AgentGatewayErrorDetails;
	createdAt: string;
	updatedAt: string;
};

export type AgentRunOptions<TInput = unknown, TContext = unknown> = {
	input: TInput;
	client: AgentModelClient<TContext>;
	context?: TContext;
	model?: string;
	preset?: string;
	maxSteps?: number;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	signal?: AbortSignal;
	onEvent?: AgentEventHandler;
	devtools?: Partial<AgentDevtoolsConfig>;
};

export type AgentContinueOptions<TInput = unknown, TOutput = unknown, TContext = unknown> = {
	run: AgentRunResult<TOutput, TInput, TContext>;
	client: AgentModelClient<TContext>;
	context?: TContext;
	model?: string;
	preset?: string;
	maxSteps?: number;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	signal?: AbortSignal;
	humanInput?: string;
	onEvent?: AgentEventHandler;
	devtools?: Partial<AgentDevtoolsConfig>;
};

export type AgentRunResult<TOutput = unknown, TInput = unknown, TContext = unknown> = {
	run: AgentRunRecord<TInput, TContext, TOutput>;
	steps: AgentStepRecord[];
	output: TOutput | undefined;
	messages: AgentMessage[];
};
