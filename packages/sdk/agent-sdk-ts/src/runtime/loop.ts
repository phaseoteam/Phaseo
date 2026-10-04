import { randomUUID } from "node:crypto";
import { captureAgentRunDevtools } from "../devtools.js";
import { AgentGatewayError, toAgentGatewayErrorDetails } from "../errors.js";
import { agentItemKey, responseItems, toolResultItem } from "../items.js";
import { parseAgentSchema } from "../schema.js";
import type {
	AgentContinueOptions, AgentDefinition, AgentDynamicValue, AgentEvent, AgentEventHandler, AgentItem,
	AgentHumanPause, AgentMessage, AgentModelClient, AgentModelRequest, AgentModelResponse,
	AgentModelRetryConfig, AgentNextTurnParams, AgentPendingToolCall, AgentRunOptions,
	AgentRunRecord, AgentRunResult, AgentRuntimeContext, AgentStateAccessor, AgentStepRecord,
	AgentStepResult, AgentStopWhen, AgentTool, AgentToolCall, AgentToolDecision,
	AgentToolExecutionConfig, AgentToolExecutionResult, AgentToolOutput, AgentTurnContext,
	AgentUsageSummary,
} from "../types.js";

type RuntimeOptions<TInput, TOutput, TContext> = {
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
	state?: AgentStateAccessor<TInput, TContext, TOutput>;
	streaming?: boolean;
	approveToolCalls?: Array<string | AgentToolDecision>;
	rejectToolCalls?: Array<string | AgentToolDecision>;
	approvals?: Array<string | AgentToolDecision>;
	rejections?: Array<string | AgentToolDecision>;
	toolOutputs?: AgentToolOutput[];
	humanInput?: string;
	humanMessages?: AgentMessage[];
};

const EMPTY_USAGE: AgentUsageSummary = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0 };
const DEFAULT_RETRY_BACKOFF = 250;

function nowIso() { return new Date().toISOString(); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function gatewayDetails(error: unknown) { return error instanceof AgentGatewayError ? toAgentGatewayErrorDetails(error) : undefined; }
function toPromptText(input: unknown) { return typeof input === "string" ? input : JSON.stringify(input, null, 2); }
function presetAlias(value?: string) { const normalized = value?.trim().replace(/^@+/, ""); return normalized ? `@${normalized}` : undefined; }

async function emit(handler: AgentEventHandler | undefined, event: AgentEvent) { await handler?.(event); }

function usageNumber(usage: Record<string, unknown> | undefined, ...keys: string[]) {
	for (const key of keys) { const value = usage?.[key]; if (typeof value === "number" && Number.isFinite(value)) return value; }
	return 0;
}

function normalizeUsage(response: AgentModelResponse): AgentUsageSummary {
	const usage = response.usage;
	const inputTokens = usageNumber(usage, "input_tokens", "prompt_tokens", "inputTokens", "promptTokens");
	const outputTokens = usageNumber(usage, "output_tokens", "completion_tokens", "outputTokens", "completionTokens");
	const cachedTokens = usageNumber(usage, "cached_tokens", "cache_read_input_tokens", "cachedTokens");
	const explicitTotal = usageNumber(usage, "total_tokens", "totalTokens");
	const cost = response.cost ?? usageNumber(usage, "cost", "total_cost", "totalCost");
	return { inputTokens, outputTokens, cachedTokens, totalTokens: explicitTotal || inputTokens + outputTokens, cost };
}

function addUsage(left: AgentUsageSummary, right: AgentUsageSummary): AgentUsageSummary {
	return {
		inputTokens: left.inputTokens + right.inputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cachedTokens: left.cachedTokens + right.cachedTokens,
		totalTokens: left.totalTokens + right.totalTokens,
		cost: left.cost + right.cost,
	};
}

function asDecisionMap(values: Array<string | AgentToolDecision> | undefined) {
	return new Map<string, AgentToolDecision>((values ?? []).map((value) => typeof value === "string" ? [value, { toolCallId: value }] : [value.toolCallId, value]));
}

async function resolveDynamic<T, TContext>(value: AgentDynamicValue<T, TContext> | undefined, context: AgentTurnContext<TContext>): Promise<T | undefined> {
	return typeof value === "function" ? await (value as (context: AgentTurnContext<TContext>) => T | Promise<T>)(context) : value;
}

function abortIfNeeded(signal?: AbortSignal) {
	if (signal?.aborted) throw signal.reason ?? new Error("Agent run cancelled");
}

async function sleep(ms: number, signal?: AbortSignal) {
	if (ms <= 0) return;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("Agent run cancelled")); };
		if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
	});
}

function serializeToolOutput(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }

function stepEventDetails(step: AgentStepRecord) {
	return { attempt: step.modelAttempts, requestId: step.requestId, nativeResponseId: step.nativeResponseId ?? null, provider: step.provider, model: step.model, usage: step.usage, responseMeta: step.responseMeta };
}

function buildResult<TInput, TOutput, TContext>(run: AgentRunRecord<TInput, TContext, TOutput>, steps: AgentStepRecord[], stepResults: AgentStepResult[]): AgentRunResult<TOutput, TInput, TContext> {
	const items = stepResults.flatMap((step) => [
		...(step.items ?? []),
		...step.toolResults.map(toolResultItem),
	]) as AgentItem<TOutput>[];
	if (run.result !== undefined) items.push({ type: "output", value: run.result });
	return { run, steps, stepResults, usage: run.usage, output: run.result, messages: run.messages, items };
}

async function persist<TInput, TOutput, TContext>(state: AgentStateAccessor<TInput, TContext, TOutput> | undefined, run: AgentRunRecord<TInput, TContext, TOutput>, steps: AgentStepRecord[], stepResults: AgentStepResult[]) {
	await state?.save(buildResult(run, steps, stepResults));
}

function toolParameters(tool: AgentTool<any, any, any>): Record<string, unknown> | undefined {
	if (tool.parameters) return tool.parameters;
	const schema = tool.inputSchema as any;
	if (schema && typeof schema.toJSONSchema === "function") return schema.toJSONSchema();
	return undefined;
}

function runtimeContext<TContext>(args: {
	run: AgentRunRecord<any, TContext, any>; stepIndex: number; context: TContext | undefined;
	call: AgentToolCall; signal?: AbortSignal; emitProgress: (value: unknown) => Promise<void>;
	setContext: (value: TContext) => void;
}): AgentRuntimeContext<TContext> {
	return { runId: args.run.id, agentId: args.run.agentId, stepIndex: args.stepIndex, context: args.context, signal: args.signal, toolCall: args.call, emitProgress: args.emitProgress, setContext: args.setContext };
}

async function executeWithTimeout<T>(operation: (signal?: AbortSignal) => Promise<T>, timeoutMs: number | undefined, parentSignal?: AbortSignal): Promise<T> {
	if (!timeoutMs || timeoutMs <= 0) return operation(parentSignal);
	const controller = new AbortController();
	const parentAbort = () => controller.abort(parentSignal?.reason);
	if (parentSignal?.aborted) controller.abort(parentSignal.reason); else parentSignal?.addEventListener("abort", parentAbort, { once: true });
	const timer = setTimeout(() => controller.abort(new Error(`Tool timed out after ${timeoutMs}ms`)), timeoutMs);
	try {
		return await Promise.race([
			operation(controller.signal),
			new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason ?? new Error(`Tool timed out after ${timeoutMs}ms`)), { once: true })),
		]);
	} finally { clearTimeout(timer); parentSignal?.removeEventListener("abort", parentAbort); }
}

async function consumeToolExecution<TOutput>(value: unknown, onProgress: (value: unknown) => Promise<void>): Promise<{ output: TOutput; preliminaryResults: unknown[] }> {
	if (!value || typeof (value as any)[Symbol.asyncIterator] !== "function") return { output: await value as TOutput, preliminaryResults: [] };
	const preliminaryResults: unknown[] = [];
	const iterator = (value as AsyncGenerator<unknown, TOutput, void>)[Symbol.asyncIterator]();
	while (true) {
		const item = await iterator.next();
		if (item.done) return { output: item.value, preliminaryResults };
		preliminaryResults.push(item.value);
		await onProgress(item.value);
	}
}

async function executeOneTool<TContext>(args: {
	tool: AgentTool<any, any, TContext>; call: AgentToolCall; run: AgentRunRecord<any, TContext, any>;
	stepIndex: number; context: TContext | undefined; signal?: AbortSignal; handler?: AgentEventHandler;
	defaultErrorPolicy: "fail-run" | "return-to-model"; suppliedOutput?: unknown; useSuppliedOutput?: boolean; emitItems?: boolean;
}): Promise<{ message: AgentMessage; result: AgentToolExecutionResult; nextTurnParams?: AgentNextTurnParams<TContext>; context?: TContext }> {
	let currentContext = args.context;
	const progress: unknown[] = [];
	const emitProgress = async (raw: unknown) => {
		const value = parseAgentSchema(args.tool.eventSchema, raw, "tool_event");
		progress.push(value);
		await emit(args.handler, { type: "tool.preliminary_result", runId: args.run.id, agentId: args.run.agentId, stepIndex: args.stepIndex, toolCallId: args.call.id, toolName: args.call.name, result: value, timestamp: nowIso() });
	};
	const context = (signal?: AbortSignal) => runtimeContext({ run: args.run, stepIndex: args.stepIndex, context: currentContext, call: args.call, signal, emitProgress, setContext: (value) => { currentContext = value; } });
	await emit(args.handler, { type: "tool.started", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), status: args.run.status, stepIndex: args.stepIndex, toolCallId: args.call.id, toolName: args.call.name });
	try {
		const input = parseAgentSchema(args.tool.inputSchema, args.call.input, "tool_input");
		let output: unknown;
		let generatedProgress: unknown[] = [];
		if (args.useSuppliedOutput) {
			output = args.tool.onResponseReceived ? await args.tool.onResponseReceived(args.suppliedOutput, context(args.signal)) : args.suppliedOutput;
		} else {
			const execute = args.tool.execute;
			if (execute === false || !execute) throw new Error(`Tool ${args.call.name} requires manual output`);
			const consumed = await executeWithTimeout(async (signal) => consumeToolExecution(execute(input, context(signal)), emitProgress), args.tool.timeoutMs, args.signal);
			output = consumed.output; generatedProgress = consumed.preliminaryResults;
		}
		output = parseAgentSchema(args.tool.outputSchema, output, "tool_output");
		const preliminaryResults = progress.length ? progress : generatedProgress;
		await emit(args.handler, { type: "tool.completed", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), status: args.run.status, stepIndex: args.stepIndex, toolCallId: args.call.id, toolName: args.call.name, output });
		if (args.emitItems) await emit(args.handler, { type: "response.item", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.stepIndex, item: { type: "tool_result", toolCallId: args.call.id, name: args.tool.id, output } });
		return {
			message: { role: "tool", name: args.tool.id, toolCallId: args.call.id, content: serializeToolOutput(output) },
			result: { toolCallId: args.call.id, toolName: args.tool.id, result: output, preliminaryResults },
			nextTurnParams: args.tool.nextTurnParams,
			context: currentContext,
		};
	} catch (error) {
		const message = errorMessage(error);
		await emit(args.handler, { type: "tool.failed", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), status: args.run.status, stepIndex: args.stepIndex, toolCallId: args.call.id, toolName: args.call.name, error: message });
		if ((args.tool.onError ?? args.defaultErrorPolicy) === "return-to-model") {
			if (args.emitItems) await emit(args.handler, { type: "response.item", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.stepIndex, item: { type: "error", message, toolCallId: args.call.id, toolName: args.tool.id } });
			return { message: { role: "tool", name: args.tool.id, toolCallId: args.call.id, content: JSON.stringify({ error: message }), isError: true }, result: { toolCallId: args.call.id, toolName: args.tool.id, error: message }, context: currentContext };
		}
		throw error;
	}
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, execute: (value: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(values.length); let next = 0;
	await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, values.length)) }, async () => {
		while (true) { const index = next++; if (index >= values.length) return; results[index] = await execute(values[index], index); }
	}));
	return results;
}

async function applyNextTurnParams<TContext>(params: Array<{ config?: AgentNextTurnParams<TContext>; input: unknown; call: AgentToolCall }>, current: {
	model?: string; instructions?: string; temperature?: number; maxOutputTokens?: number; topP?: number; tools: AgentTool<any, any, TContext>[];
}, turn: AgentTurnContext<TContext>) {
	for (const entry of params) {
		if (!entry.config) continue;
		const contextual = { ...turn, lastToolCall: entry.call };
		for (const key of ["model", "instructions", "temperature", "maxOutputTokens", "topP", "tools"] as const) {
			const value = await resolveDynamic(entry.config[key] as any, contextual);
			if (value !== undefined) (current as any)[key] = value;
		}
	}
}

async function generateResponse<TContext>(args: {
	client: AgentModelClient<TContext>; request: AgentModelRequest<TContext>; retry: AgentModelRetryConfig | undefined;
	run: AgentRunRecord<any, TContext, any>; step: AgentStepRecord; handler?: AgentEventHandler; streaming: boolean;
}): Promise<AgentModelResponse> {
	const maxRetries = Math.max(0, Math.floor(args.retry?.maxRetries ?? 0));
	const backoff = Math.max(0, Math.floor(args.retry?.backoffMs ?? DEFAULT_RETRY_BACKOFF));
	for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
		args.step.modelAttempts = attempt;
		await emit(args.handler, { type: "model.requested", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), status: args.run.status, stepIndex: args.step.index, attempt, model: args.request.model });
		try {
			let response: AgentModelResponse;
			if (args.streaming && args.client.stream) {
				let text = ""; let reasoning = ""; let completed: AgentModelResponse | undefined; const streamedItems: AgentItem[] = []; const streamedItemKeys = new Set<string>();
				for await (const event of args.client.stream({ ...args.request, stream: true })) {
					if (event.type === "response.output_text.delta") { text += event.delta; await emit(args.handler, { type: event.type, runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.step.index, delta: event.delta }); }
					else if (event.type === "response.reasoning.delta") { reasoning += event.delta; await emit(args.handler, { type: event.type, runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.step.index, delta: event.delta }); }
					else if (event.type === "response.item") {
						const key = agentItemKey(event.item);
						if (!streamedItemKeys.has(key)) { streamedItemKeys.add(key); streamedItems.push(event.item); await emit(args.handler, { type: "response.item", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.step.index, item: event.item }); }
					}
					else if (event.type === "response.completed") completed = event.response;
				}
				response = completed ?? { message: { role: "assistant", content: text, reasoning } };
				if (!response.message.content && text) response.message.content = text;
				const completedItems = responseItems(response);
				for (const item of completedItems) {
					const key = agentItemKey(item);
					if (!streamedItemKeys.has(key)) { streamedItemKeys.add(key); streamedItems.push(item); await emit(args.handler, { type: "response.item", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), stepIndex: args.step.index, item }); }
				}
				response.items = streamedItems;
			} else {
				response = await args.client.generate(args.request);
				response.items = responseItems(response);
			}
			return response;
		} catch (error) {
			if (attempt > maxRetries) {
				await emit(args.handler, { type: "model.failed", runId: args.run.id, agentId: args.run.agentId, timestamp: nowIso(), status: args.run.status, stepIndex: args.step.index, attempt, model: args.request.model, error: errorMessage(error), errorDetails: gatewayDetails(error) });
				throw error;
			}
			await sleep(backoff * attempt, args.request.signal);
		}
	}
	throw new Error("Unreachable model retry state");
}

async function stopReason(stopWhen: AgentStopWhen | undefined, context: Parameters<Exclude<AgentStopWhen, any[]>>[0]): Promise<string | undefined> {
	if (!stopWhen) return undefined;
	for (const condition of Array.isArray(stopWhen) ? stopWhen : [stopWhen]) {
		const result = await condition(context);
		if (result) return typeof result === "string" ? result : condition.name || "custom_condition";
	}
	return undefined;
}

async function executeLoop<TInput, TOutput, TContext>(definition: AgentDefinition<TInput, TOutput, TContext>, initial: AgentRunResult<TOutput, TInput, TContext>, options: RuntimeOptions<TInput, TOutput, TContext>, resumed: boolean): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const run = initial.run; const steps = [...initial.steps]; const stepResults = [...(initial.stepResults ?? [])];
	const startedAt = Date.parse(run.createdAt) || Date.now();
	let currentContext = options.context === undefined ? run.context : options.context;
	let tools = [...(definition.tools ?? [])];
	let dynamic = { model: undefined as string | undefined, instructions: undefined as string | undefined, temperature: undefined as number | undefined, maxOutputTokens: undefined as number | undefined, topP: undefined as number | undefined, tools };
	let nextTurn = { model: undefined as string | undefined, instructions: undefined as string | undefined, temperature: undefined as number | undefined, maxOutputTokens: undefined as number | undefined, topP: undefined as number | undefined, tools: undefined as AgentTool<any, any, TContext>[] | undefined };
	const maxSteps = options.maxSteps ?? definition.maxSteps ?? 12;
	const concurrency = Math.max(1, Math.floor(options.toolExecution?.toolConcurrency ?? definition.toolExecution?.toolConcurrency ?? 1));
	const defaultErrorPolicy = options.toolExecution?.onError ?? definition.toolExecution?.onError ?? "fail-run";

	const save = async () => { run.context = currentContext; run.usage = stepResults.reduce((sum, step) => addUsage(sum, step.usage), { ...EMPTY_USAGE }); await persist(options.state, run, steps, stepResults); };
	try {
		if (resumed) {
			const previousStatus = run.status;
			if (run.status === "waiting_for_human" && run.pause?.pendingToolCalls?.length) {
				const approved = asDecisionMap(options.approveToolCalls ?? options.approvals); const rejected = asDecisionMap(options.rejectToolCalls ?? options.rejections); const outputs = new Map((options.toolOutputs ?? []).map((entry) => [entry.toolCallId, entry.output]));
				const pending = run.pause.pendingToolCalls;
				const admitted = pending.map((entry) => {
					const tool = tools.find((candidate) => candidate.id === entry.call.name);
					if (!tool) throw new Error(`Tool not found: ${entry.call.name}`);
					const rejection = rejected.has(entry.call.id) ? rejected.get(entry.call.id)?.reason ?? "Tool call rejected by human" : undefined;
					if (rejection === undefined) {
						if (entry.kind === "approval" && !approved.has(entry.call.id)) throw new Error(`Missing approval decision for tool call ${entry.call.id}`);
						if ((entry.kind === "manual" || entry.kind === "hitl") && !outputs.has(entry.call.id)) throw new Error(`Missing output for tool call ${entry.call.id}`);
					}
					return { entry, tool, rejection };
				});
				const executions = await mapConcurrent(admitted, concurrency, async ({ entry, tool, rejection }) => {
					const execution = rejection !== undefined
						? { message: { role: "tool", name: tool.id, toolCallId: entry.call.id, content: JSON.stringify({ error: rejection }), isError: true } as AgentMessage, context: currentContext, nextTurnParams: undefined }
						: await executeOneTool({ tool, call: entry.call, run, stepIndex: Math.max(0, run.stepCount - 1), context: currentContext, signal: options.signal, handler: options.onEvent, defaultErrorPolicy, suppliedOutput: outputs.get(entry.call.id), useSuppliedOutput: outputs.has(entry.call.id), emitItems: options.streaming });
					if (concurrency === 1) currentContext = execution.context;
					return { ...execution, rejection, call: entry.call, input: entry.call.input };
				});
				for (const execution of executions) { run.messages.push(execution.message); if (execution.rejection === undefined) currentContext = execution.context; await applyNextTurnParams([{ config: execution.nextTurnParams, input: execution.input, call: execution.call }], nextTurn as any, { numberOfTurns: run.stepCount, stepIndex: Math.max(0, run.stepCount - 1), messages: run.messages, context: currentContext }); }
				run.pause = null;
			} else if (run.status === "waiting_for_human" && !(options.humanMessages !== undefined ? options.humanMessages.length : options.humanInput)) throw new Error(`Run ${run.id} is waiting for human input`);
			if (options.humanMessages !== undefined) run.messages.push(...structuredClone(options.humanMessages));
			else if (options.humanInput) run.messages.push({ role: "user", content: options.humanInput });
			run.status = "running"; run.updatedAt = nowIso();
			await emit(options.onEvent, { type: "run.resumed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, previousStatus });
		} else run.status = "running";

		while (run.stepCount < maxSteps) {
			abortIfNeeded(options.signal);
			const stepIndex = run.stepCount;
			const turn: AgentTurnContext<TContext> = { numberOfTurns: stepIndex + 1, stepIndex, messages: run.messages, context: currentContext };
			dynamic.model = await resolveDynamic(options.model ?? definition.model, turn) ?? presetAlias(options.preset ?? definition.preset);
			const fallbackModels = await resolveDynamic(options.models ?? definition.models, turn);
			if (!dynamic.model && fallbackModels?.length) dynamic.model = fallbackModels[0];
			dynamic.instructions = await resolveDynamic(definition.instructions, turn);
			dynamic.temperature = await resolveDynamic(options.temperature ?? definition.temperature, turn);
			dynamic.maxOutputTokens = await resolveDynamic(options.maxOutputTokens ?? definition.maxOutputTokens, turn);
			dynamic.topP = await resolveDynamic(options.topP ?? definition.topP, turn);
			if (nextTurn.model !== undefined) dynamic.model = nextTurn.model;
			if (nextTurn.instructions !== undefined) dynamic.instructions = nextTurn.instructions;
			if (nextTurn.temperature !== undefined) dynamic.temperature = nextTurn.temperature;
			if (nextTurn.maxOutputTokens !== undefined) dynamic.maxOutputTokens = nextTurn.maxOutputTokens;
			if (nextTurn.topP !== undefined) dynamic.topP = nextTurn.topP;
			if (nextTurn.tools !== undefined) dynamic.tools = nextTurn.tools;
			tools = dynamic.tools;
			nextTurn = { model: undefined, instructions: undefined, temperature: undefined, maxOutputTokens: undefined, topP: undefined, tools: undefined };

			const step: AgentStepRecord = { runId: run.id, index: stepIndex, status: "executing_model", createdAt: nowIso(), updatedAt: nowIso() };
			steps.push(step);
			await emit(options.onEvent, { type: "step.started", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex });
			const request: AgentModelRequest<TContext> = { agentId: run.agentId, model: dynamic.model, instructions: dynamic.instructions, messages: structuredClone(run.messages), tools: tools.map((tool) => ({ id: tool.id, description: tool.description, parameters: toolParameters(tool) })), context: currentContext, signal: options.signal, temperature: dynamic.temperature, maxOutputTokens: dynamic.maxOutputTokens, topP: dynamic.topP, stream: options.streaming };
			const response = await generateResponse({ client: options.client, request, retry: options.modelRetry ?? definition.modelRetry, run, step, handler: options.onEvent, streaming: options.streaming ?? false });
			run.messages.push(response.message); run.stepCount++; run.updatedAt = nowIso();
			const normalized = normalizeUsage(response);
			Object.assign(step, { requestId: response.requestId, nativeResponseId: response.nativeResponseId ?? null, provider: response.provider, model: response.model ?? dynamic.model, usage: response.usage, normalizedUsage: normalized, toolCalls: response.message.toolCalls ?? [], responseMeta: response.responseMeta, finishReason: response.finishReason, warnings: response.warnings });
			await emit(options.onEvent, { type: "model.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, attempt: step.modelAttempts, requestId: response.requestId, nativeResponseId: response.nativeResponseId ?? null, provider: response.provider, model: step.model, usage: response.usage, responseMeta: response.responseMeta });

			const calls = response.message.toolCalls ?? [];
			const toolResults: AgentToolExecutionResult[] = [];
			const nextParams: Array<{ config?: AgentNextTurnParams<TContext>; input: unknown; call: AgentToolCall }> = [];
			const autoCalls: Array<{ call: AgentToolCall; tool: AgentTool<any, any, TContext>; prefetched?: unknown }> = [];
			const pending: AgentPendingToolCall[] = [];
			for (const call of calls) {
				const tool = tools.find((candidate) => candidate.id === call.name);
				if (!tool) throw new Error(`Tool not found: ${call.name}`);
				const parsedInput = parseAgentSchema(tool.inputSchema, call.input, "tool_input"); call.input = parsedInput;
				const ctx = runtimeContext({ run, stepIndex, context: currentContext, call, signal: options.signal, emitProgress: async () => {}, setContext: (value) => { currentContext = value; } });
				if (tool.onToolCalled) {
					const result = await tool.onToolCalled(parsedInput, ctx);
					if (result === null) pending.push({ call, kind: "hitl", reason: "Tool requires human input" });
					else autoCalls.push({ call, tool: { ...tool, execute: async () => result } });
					continue;
				}
				const callApproval = definition.requireApproval ? await definition.requireApproval(call, ctx) : undefined;
				const toolApproval = typeof tool.requireApproval === "function" ? await tool.requireApproval(parsedInput, ctx) : tool.requireApproval;
				if (callApproval ?? toolApproval) pending.push({ call, kind: "approval", reason: "Tool requires approval" });
				else if (tool.execute === false || !tool.execute) pending.push({ call, kind: "manual", reason: "Tool requires manual execution" });
				else autoCalls.push({ call, tool });
			}

			if (autoCalls.length) {
				run.status = "waiting_for_tools"; step.status = "executing_tools";
				const executed = await mapConcurrent(autoCalls, concurrency, async ({ call, tool }) => {
					const execution = await executeOneTool({ tool, call, run, stepIndex, context: currentContext, signal: options.signal, handler: options.onEvent, defaultErrorPolicy, emitItems: options.streaming });
					if (concurrency === 1) currentContext = execution.context;
					return { ...execution, call, input: call.input };
				});
				for (const item of executed) { run.messages.push(item.message); toolResults.push(item.result); currentContext = item.context; nextParams.push({ config: item.nextTurnParams, input: item.input, call: item.call }); }
				await applyNextTurnParams(nextParams, nextTurn as any, { ...turn, messages: run.messages, context: currentContext });
			}

			const stepResult: AgentStepResult = { stepIndex, text: response.message.content, reasoning: response.message.reasoning, toolCalls: calls, toolResults, usage: normalized, finishReason: response.finishReason, warnings: response.warnings, items: response.items };
			stepResults.push(stepResult); step.toolResults = toolResults;

			if (pending.length) {
				run.status = "waiting_for_human";
				const kinds = new Set(pending.map((entry) => entry.kind));
				const kind: AgentHumanPause["kind"] = kinds.has("approval") ? "tool_approval" : kinds.has("hitl") ? "hitl" : "manual_tool";
				run.pause = { reason: "Pending tool calls require input", payload: { toolCalls: pending }, requestedAt: nowIso(), kind, pendingToolCalls: pending };
				step.status = "checkpointed"; step.updatedAt = nowIso(); await save();
				await emit(options.onEvent, { type: "step.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, attempt: step.modelAttempts, requestId: step.requestId, model: step.model, usage: step.usage });
				await emit(options.onEvent, { type: "checkpoint.saved", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, ...stepEventDetails(step) });
				await emit(options.onEvent, { type: "run.waiting_for_human", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, pause: run.pause });
				return buildResult(run, steps, stepResults);
			}

			const legacyParsed = !calls.length && definition.parseOutput ? definition.parseOutput(response.message.content) : undefined;
			if (definition.humanReview) {
				const review = await definition.humanReview({ runId: run.id, agentId: run.agentId, stepIndex, input: run.input, context: currentContext, messages: [...run.messages], response, parsedOutput: legacyParsed });
				if (review) {
					run.status = "waiting_for_human"; run.pause = { reason: review.reason, payload: review.payload, requestedAt: nowIso(), kind: "human_review" };
					step.status = "checkpointed"; step.updatedAt = nowIso(); await save();
					await emit(options.onEvent, { type: "step.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex });
					await emit(options.onEvent, { type: "checkpoint.saved", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, ...stepEventDetails(step) });
					await emit(options.onEvent, { type: "run.waiting_for_human", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, pause: run.pause });
					return buildResult(run, steps, stepResults);
				}
			}

			const reason = await stopReason(options.stopWhen ?? definition.stopWhen, { steps: stepResults, usage: stepResults.reduce((sum, item) => addUsage(sum, item.usage), { ...EMPTY_USAGE }), elapsedMs: Date.now() - startedAt });
			step.status = "checkpointed"; step.updatedAt = nowIso();
			if (reason) {
				run.status = "stopped"; run.stopReason = reason; run.result = (legacyParsed ?? response.message.content) as TOutput; await save();
				if (options.streaming) await emit(options.onEvent, { type: "response.item", runId: run.id, agentId: run.agentId, timestamp: nowIso(), stepIndex, item: { type: "output", value: run.result } });
				await emit(options.onEvent, { type: "step.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex });
				await emit(options.onEvent, { type: "run.stopped", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stopReason: reason, output: run.result });
				return buildResult(run, steps, stepResults);
			}

			if (calls.length) { await save(); await emit(options.onEvent, { type: "step.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, ...stepEventDetails(step) }); await emit(options.onEvent, { type: "checkpoint.saved", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, ...stepEventDetails(step) }); continue; }

			let output = legacyParsed ?? response.message.content as unknown as TOutput;
			output = parseAgentSchema(definition.outputSchema, output, "agent_output");
			run.result = output; run.status = "completed"; run.pause = null; await save();
			if (options.streaming) await emit(options.onEvent, { type: "response.item", runId: run.id, agentId: run.agentId, timestamp: nowIso(), stepIndex, item: { type: "output", value: output } });
			await emit(options.onEvent, { type: "step.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, attempt: step.modelAttempts, requestId: step.requestId, model: step.model, usage: step.usage });
			await emit(options.onEvent, { type: "checkpoint.saved", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, stepIndex, ...stepEventDetails(step) });
			await emit(options.onEvent, { type: "run.completed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, output });
			return buildResult(run, steps, stepResults);
		}
		throw new Error(`Max steps exceeded (${maxSteps})`);
	} catch (error) {
		const cancelled = options.signal?.aborted;
		const step = steps.at(-1);
		if (step && step.status !== "checkpointed") { step.status = cancelled ? "cancelled" : "failed"; step.error = errorMessage(error); step.errorDetails = gatewayDetails(error); step.updatedAt = nowIso(); await emit(options.onEvent, { type: cancelled ? "step.cancelled" : "step.failed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: cancelled ? "cancelled" : "failed", stepIndex: step.index, attempt: step.modelAttempts, requestId: step.requestId, model: step.model, error: step.error, errorDetails: step.errorDetails }); }
		run.status = cancelled ? "cancelled" : "failed"; run.error = errorMessage(error); run.errorDetails = gatewayDetails(error); run.updatedAt = nowIso(); await save();
		if (options.streaming) await emit(options.onEvent, { type: "response.item", runId: run.id, agentId: run.agentId, timestamp: nowIso(), stepIndex: step?.index ?? Math.max(0, run.stepCount - 1), item: { type: "error", message: run.error } });
		await emit(options.onEvent, { type: cancelled ? "run.cancelled" : "run.failed", runId: run.id, agentId: run.agentId, timestamp: nowIso(), status: run.status, error: run.error, errorDetails: run.errorDetails });
		if (cancelled) return buildResult(run, steps, stepResults);
		throw error;
	}
}

export async function runAgent<TInput, TOutput, TContext>(definition: AgentDefinition<TInput, TOutput, TContext>, options: AgentRunOptions<TInput, TContext, TOutput> & { streaming?: boolean }): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const startedAt = Date.now(); const createdAt = nowIso(); const runId = randomUUID();
	const run: AgentRunRecord<TInput, TContext, TOutput> = { id: runId, agentId: definition.id, status: "queued", input: options.input, context: options.context, messages: [], pause: null, stopReason: null, usage: { ...EMPTY_USAGE }, createdAt, updatedAt: createdAt, stepCount: 0 };
	const staticInstructions = typeof definition.instructions === "string" ? definition.instructions : undefined;
	if (staticInstructions) run.messages.push({ role: "system", content: staticInstructions });
	if (options.messages !== undefined) run.messages.push(...structuredClone(options.messages));
	else run.messages.push({ role: "user", content: toPromptText(options.input) });
	const initial = buildResult(run, [], []);
	await options.state?.save(initial);
	await emit(options.onEvent, { type: "run.started", runId, agentId: definition.id, timestamp: nowIso(), status: run.status });
	try {
		const result = await executeLoop(definition, initial, options, false);
		captureAgentRunDevtools({ type: "agent.run", definition: definition as any, options: options as any, startedAt, result, runId });
		return result;
	} catch (error) {
		captureAgentRunDevtools({ type: "agent.run", definition: definition as any, options: options as any, startedAt, error, runId });
		throw error;
	}
}

export async function continueAgent<TInput, TOutput, TContext>(definition: AgentDefinition<TInput, TOutput, TContext>, options: AgentContinueOptions<TInput, TOutput, TContext> & { streaming?: boolean }): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const startedAt = Date.now();
	const source = options.run ?? (options.runId && options.state ? await options.state.load(options.runId) : null);
	if (!source) throw new Error("A run or a state accessor with runId is required");
	if (source.run.agentId !== definition.id) throw new Error(`Cannot continue run ${source.run.id} with agent ${definition.id}; it belongs to ${source.run.agentId}`);
	try {
		const result = await executeLoop(definition, structuredClone(source), options, true);
		captureAgentRunDevtools({ type: "agent.continue", definition: definition as any, options: { input: source.run.input, ...options } as any, startedAt, result, runId: source.run.id });
		return result;
	} catch (error) {
		captureAgentRunDevtools({ type: "agent.continue", definition: definition as any, options: { input: source.run.input, ...options } as any, startedAt, error, runId: source.run.id });
		throw error;
	}
}
