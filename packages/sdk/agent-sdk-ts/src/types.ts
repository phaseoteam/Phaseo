import type { AgentGatewayErrorDetails } from "./errors.js";
import type { AgentDevtoolsConfig } from "./devtools.js";

export type MaybePromise<T> = T | Promise<T>;

export type AgentSchema<T = unknown> =
	| { parse: (value: unknown) => T }
	| { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } }
	| ((value: unknown) => T);

export type AgentToolCall = { id: string; name: string; input: unknown };

export type AgentItemBase = {
	id?: string;
	/** Original provider item, retained for provider-specific fields not represented by the portable contract. */
	rawProviderItem?: unknown;
};

export type AgentMessageItem = AgentItemBase & {
	type: "message";
	role: "assistant";
	content: string;
};

export type AgentReasoningItem = AgentItemBase & {
	type: "reasoning";
	text: string;
};

export type AgentToolCallItem = AgentItemBase & {
	type: "tool_call";
	toolCallId: string;
	name: string;
	input: unknown;
};

export type AgentToolResultItem = AgentItemBase & {
	type: "tool_result";
	toolCallId: string;
	name: string;
	output: unknown;
};

export type AgentErrorItem = AgentItemBase & {
	type: "error";
	message: string;
	code?: string;
	toolCallId?: string;
	toolName?: string;
};

export type AgentOutputItem<TOutput = unknown> = AgentItemBase & {
	type: "output";
	value: TOutput;
};

export type AgentItem<TOutput = unknown> =
	| AgentMessageItem
	| AgentReasoningItem
	| AgentToolCallItem
	| AgentToolResultItem
	| AgentErrorItem
	| AgentOutputItem<TOutput>;

export type AgentMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }
	| { role: "assistant"; content: string; toolCalls?: AgentToolCall[]; reasoning?: string }
	| { role: "tool"; content: string; toolCallId: string; name: string; isError?: boolean };

export type AgentTurnContext<TContext = unknown> = {
	numberOfTurns: number;
	stepIndex: number;
	messages: AgentMessage[];
	context: TContext | undefined;
	lastToolCall?: AgentToolCall;
};

export type AgentDynamicValue<T, TContext = unknown> =
	| T
	| ((context: AgentTurnContext<TContext>) => MaybePromise<T>);

export type AgentNextTurnParams<TContext = unknown> = Partial<{
	model: AgentDynamicValue<string | undefined, TContext>;
	instructions: AgentDynamicValue<string | undefined, TContext>;
	temperature: AgentDynamicValue<number | undefined, TContext>;
	maxOutputTokens: AgentDynamicValue<number | undefined, TContext>;
	topP: AgentDynamicValue<number | undefined, TContext>;
	tools: AgentDynamicValue<AgentTool<any, any, TContext>[], TContext>;
}>;

export type AgentToolProgressEvent = {
	type: "tool.preliminary_result";
	runId: string;
	agentId: string;
	stepIndex: number;
	toolCallId: string;
	toolName: string;
	result: unknown;
	timestamp: string;
};

export type AgentRuntimeContext<TContext = unknown> = {
	runId: string;
	agentId: string;
	stepIndex: number;
	context: TContext | undefined;
	signal?: AbortSignal;
	toolCall: AgentToolCall;
	emitProgress: (result: unknown) => MaybePromise<void>;
	setContext: (value: TContext) => void;
};

export type AgentToolApproval<TInput = unknown, TContext = unknown> =
	| boolean
	| ((input: TInput, context: AgentRuntimeContext<TContext>) => MaybePromise<boolean>);

export type AgentToolErrorPolicy = "fail-run" | "return-to-model";

export type AgentTool<TInput = unknown, TOutput = unknown, TContext = unknown> = {
	id: string;
	description?: string;
	parameters?: Record<string, unknown>;
	inputSchema?: AgentSchema<TInput>;
	outputSchema?: AgentSchema<TOutput>;
	eventSchema?: AgentSchema<unknown>;
	timeoutMs?: number;
	execute?: false | ((input: TInput, context: AgentRuntimeContext<TContext>) => MaybePromise<TOutput> | AsyncGenerator<unknown, TOutput, void>);
	requireApproval?: AgentToolApproval<TInput, TContext>;
	onToolCalled?: (input: TInput, context: AgentRuntimeContext<TContext>) => MaybePromise<TOutput | null>;
	onResponseReceived?: (rawResult: unknown, context: AgentRuntimeContext<TContext>) => MaybePromise<TOutput>;
	nextTurnParams?: AgentNextTurnParams<TContext>;
	onError?: AgentToolErrorPolicy;
};

export type AgentToolDescriptor = Pick<AgentTool, "id" | "description" | "parameters">;

export type AgentModelRequest<TContext = unknown> = {
	agentId: string;
	model?: string;
	instructions?: string;
	messages: AgentMessage[];
	tools: AgentToolDescriptor[];
	context: TContext | undefined;
	signal?: AbortSignal;
	temperature?: number;
	maxOutputTokens?: number;
	topP?: number;
	stream?: boolean;
};

export type AgentModelResponse = {
	message: Extract<AgentMessage, { role: "assistant" }>;
	items?: AgentItem[];
	usage?: Record<string, unknown>;
	requestId?: string;
	nativeResponseId?: string | null;
	provider?: string;
	model?: string;
	finishReason?: string;
	cost?: number;
	warnings?: Array<{ type: string; message: string }>;
	responseMeta?: Record<string, unknown>;
};

export type AgentModelStreamEvent =
	| { type: "response.output_text.delta"; delta: string; raw?: unknown }
	| { type: "response.reasoning.delta"; delta: string; raw?: unknown }
	| { type: "response.item"; item: AgentItem; raw?: unknown }
	| { type: "response.completed"; response: AgentModelResponse; raw?: unknown }
	| { type: "response.event"; event: unknown };

export type AgentModelClient<TContext = unknown> = {
	generate: (request: AgentModelRequest<TContext>) => Promise<AgentModelResponse>;
	stream?: (request: AgentModelRequest<TContext>) => AsyncIterable<AgentModelStreamEvent>;
};

export type AgentModelRetryConfig = { maxRetries?: number; backoffMs?: number };
export type AgentToolExecutionConfig = { toolConcurrency?: number; onError?: AgentToolErrorPolicy };

export type AgentUsageSummary = {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	totalTokens: number;
	cost: number;
};

export type AgentToolExecutionResult = {
	toolCallId: string;
	toolName: string;
	result?: unknown;
	preliminaryResults?: unknown[];
	error?: string;
};

export type AgentStepResult = {
	stepIndex: number;
	text: string;
	reasoning?: string;
	toolCalls: AgentToolCall[];
	toolResults: AgentToolExecutionResult[];
	usage: AgentUsageSummary;
	finishReason?: string;
	warnings?: Array<{ type: string; message: string }>;
	items?: AgentItem[];
};

export type AgentStopConditionContext = { steps: AgentStepResult[]; usage: AgentUsageSummary; elapsedMs: number };
export type AgentStopCondition = (context: AgentStopConditionContext) => MaybePromise<boolean | string>;
export type AgentStopWhen = AgentStopCondition | AgentStopCondition[];

export type AgentPendingToolCall = {
	call: AgentToolCall;
	kind: "approval" | "hitl" | "manual";
	reason?: string;
};

export type AgentToolDecision = { toolCallId: string; reason?: string };
export type AgentToolOutput = { toolCallId: string; output: unknown };

export type AgentHumanPause = {
	reason: string;
	payload?: unknown;
	requestedAt: string;
	kind?: "human_review" | "tool_approval" | "hitl" | "manual_tool";
	pendingToolCalls?: AgentPendingToolCall[];
};

export type AgentHumanReviewRequest = { reason: string; payload?: unknown };
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
	model?: AgentDynamicValue<string, TContext>;
	models?: AgentDynamicValue<string[], TContext>;
	preset?: string;
	instructions?: AgentDynamicValue<string, TContext>;
	tools?: AgentTool<any, any, TContext>[];
	maxSteps?: number;
	stopWhen?: AgentStopWhen;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	temperature?: AgentDynamicValue<number, TContext>;
	maxOutputTokens?: AgentDynamicValue<number, TContext>;
	topP?: AgentDynamicValue<number, TContext>;
	parseOutput?: (text: string) => TOutput;
	outputSchema?: AgentSchema<TOutput>;
	requireApproval?: (call: AgentToolCall, context: AgentRuntimeContext<TContext>) => MaybePromise<boolean>;
	humanReview?: (context: AgentHumanReviewContext<TInput, TContext, TOutput>) => MaybePromise<AgentHumanReviewRequest | null>;
};

export type AgentRunStatus = "queued" | "running" | "waiting_for_tools" | "waiting_for_human" | "completed" | "stopped" | "failed" | "cancelled";
export type AgentStepStatus = "pending" | "executing_model" | "executing_tools" | "checkpointed" | "cancelled" | "failed";

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
	stopReason?: string | null;
	usage?: AgentUsageSummary;
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
	normalizedUsage?: AgentUsageSummary;
	toolCalls?: AgentToolCall[];
	toolResults?: AgentToolExecutionResult[];
	responseMeta?: Record<string, unknown>;
	finishReason?: string;
	warnings?: Array<{ type: string; message: string }>;
	error?: string;
	errorDetails?: AgentGatewayErrorDetails;
	createdAt: string;
	updatedAt: string;
};

export type AgentStateAccessor<TInput = unknown, TContext = unknown, TOutput = unknown> = {
	load: (runId: string) => Promise<AgentRunResult<TOutput, TInput, TContext> | null>;
	save: (result: AgentRunResult<TOutput, TInput, TContext>) => Promise<void>;
};

export type AgentEvent =
	| { type: "run.started" | "run.completed" | "run.stopped" | "run.failed" | "run.cancelled"; runId: string; agentId: string; timestamp: string; status: AgentRunStatus; output?: unknown; stopReason?: string; error?: string; errorDetails?: AgentGatewayErrorDetails }
	| { type: "run.resumed"; runId: string; agentId: string; timestamp: string; status: AgentRunStatus; previousStatus: AgentRunStatus }
	| { type: "run.waiting_for_human"; runId: string; agentId: string; timestamp: string; status: AgentRunStatus; stepIndex: number; pause: AgentHumanPause }
	| { type: "step.started" | "step.completed" | "step.cancelled" | "step.failed" | "model.requested" | "model.failed" | "model.completed" | "checkpoint.saved"; runId: string; agentId: string; timestamp: string; status: AgentRunStatus; stepIndex: number; attempt?: number; requestId?: string; nativeResponseId?: string | null; provider?: string; model?: string; usage?: Record<string, unknown>; responseMeta?: Record<string, unknown>; error?: string; errorDetails?: AgentGatewayErrorDetails }
	| { type: "tool.started" | "tool.completed" | "tool.failed"; runId: string; agentId: string; timestamp: string; status: AgentRunStatus; stepIndex: number; toolCallId: string; toolName: string; output?: unknown; error?: string }
	| AgentToolProgressEvent
	| { type: "response.output_text.delta" | "response.reasoning.delta"; runId: string; agentId: string; timestamp: string; stepIndex: number; delta: string }
	| { type: "response.item"; runId: string; agentId: string; timestamp: string; stepIndex: number; item: AgentItem };

export type AgentEventHandler = (event: AgentEvent) => MaybePromise<void>;

export type AgentRunOptions<TInput = unknown, TContext = unknown, TOutput = unknown> = {
	input: TInput;
	/** Conversation messages used instead of coercing input into a single user message. */
	messages?: AgentMessage[];
	client: AgentModelClient<TContext>;
	context?: TContext;
	model?: AgentDynamicValue<string, TContext>;
	models?: AgentDynamicValue<string[], TContext>;
	preset?: string;
	maxSteps?: number;
	stopWhen?: AgentStopWhen;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	temperature?: AgentDynamicValue<number, TContext>;
	maxOutputTokens?: AgentDynamicValue<number, TContext>;
	topP?: AgentDynamicValue<number, TContext>;
	signal?: AbortSignal;
	onEvent?: AgentEventHandler;
	devtools?: Partial<AgentDevtoolsConfig>;
	state?: AgentStateAccessor<TInput, TContext, TOutput>;
};

export type AgentContinueOptions<TInput = unknown, TOutput = unknown, TContext = unknown> = Omit<AgentRunOptions<TInput, TContext, TOutput>, "input" | "messages"> & {
	run?: AgentRunResult<TOutput, TInput, TContext>;
	runId?: string;
	humanInput?: string;
	/** Structured follow-up messages appended after pending tool results. */
	humanMessages?: AgentMessage[];
	approveToolCalls?: Array<string | AgentToolDecision>;
	rejectToolCalls?: Array<string | AgentToolDecision>;
	/** Concise aliases for approveToolCalls and rejectToolCalls. */
	approvals?: Array<string | AgentToolDecision>;
	rejections?: Array<string | AgentToolDecision>;
	toolOutputs?: AgentToolOutput[];
};

export type AgentRunResult<TOutput = unknown, TInput = unknown, TContext = unknown> = {
	run: AgentRunRecord<TInput, TContext, TOutput>;
	steps: AgentStepRecord[];
	stepResults?: AgentStepResult[];
	usage?: AgentUsageSummary;
	output: TOutput | undefined;
	messages: AgentMessage[];
	items: AgentItem<TOutput>[];
};

export type AgentStreamEvent = AgentEvent | { type: "result"; result: AgentRunResult };

export interface AgentStreamResult<TOutput = unknown, TInput = unknown, TContext = unknown> extends PromiseLike<AgentRunResult<TOutput, TInput, TContext>> {
	getResult(): Promise<AgentRunResult<TOutput, TInput, TContext>>;
	getText(): Promise<string>;
	getTextStream(): AsyncIterable<string>;
	getReasoningStream(): AsyncIterable<string>;
	getItemsStream(): AsyncIterable<AgentItem<TOutput>>;
	getToolStream(): AsyncIterable<AgentEvent>;
	getFullStream(): AsyncIterable<AgentStreamEvent>;
	cancel(reason?: unknown): Promise<void>;
}
