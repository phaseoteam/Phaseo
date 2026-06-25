import { randomUUID } from "node:crypto";
import { captureAgentRunDevtools } from "../devtools.js";
import { AgentGatewayError, toAgentGatewayErrorDetails } from "../errors.js";
import type {
	AgentContinueOptions,
	AgentDefinition,
	AgentEvent,
	AgentEventHandler,
	AgentHumanPause,
	AgentMessage,
	AgentModelClient,
	AgentRunOptions,
	AgentRunRecord,
	AgentRunResult,
	AgentRuntimeContext,
	AgentModelRetryConfig,
	AgentStepRecord,
	AgentTool,
	AgentToolCall,
	AgentToolExecutionConfig,
} from "../types.js";

type AgentRunLease = {
	owner: string;
	acquiredAt: string;
	expiresAt: string;
};

type InternalCheckpointStore<TInput = unknown, TContext = unknown> = {
	createRun: (run: AgentRunRecord<TInput, TContext, unknown>) => Promise<void>;
	getRun: (runId: string) => Promise<AgentRunRecord<TInput, TContext, unknown> | null>;
	saveRun: (run: AgentRunRecord<TInput, TContext, unknown>) => Promise<void>;
	listRuns: (args?: {
		agentId?: string;
		statuses?: AgentRunRecord<TInput, TContext, unknown>["status"][];
		limit?: number;
	}) => Promise<AgentRunRecord<TInput, TContext, unknown>[]>;
	acquireRunLease: (args: {
		runId: string;
		owner: string;
		ttlSeconds: number;
	}) => Promise<{ acquired: boolean; lease: AgentRunLease | null }>;
	renewRunLease: (args: {
		runId: string;
		owner: string;
		ttlSeconds: number;
	}) => Promise<{ renewed: boolean; lease: AgentRunLease | null }>;
	releaseRunLease: (args: { runId: string; owner: string }) => Promise<boolean>;
	appendStep: (step: AgentStepRecord) => Promise<void>;
	saveStep: (step: AgentStepRecord) => Promise<void>;
	listSteps: (runId: string) => Promise<AgentStepRecord[]>;
};

type InternalResumeOptions<TContext = unknown> = {
	client: AgentModelClient<TContext>;
	store: InternalCheckpointStore<any, TContext>;
	context?: TContext;
	model?: string;
	preset?: string;
	maxSteps?: number;
	modelRetry?: AgentModelRetryConfig;
	toolExecution?: AgentToolExecutionConfig;
	signal?: AbortSignal;
	humanInput?: string;
	onEvent?: AgentEventHandler;
};

class EphemeralCheckpointStore<TInput = unknown, TContext = unknown>
	implements InternalCheckpointStore<TInput, TContext>
{
	private readonly runs = new Map<string, AgentRunRecord<TInput, TContext, unknown>>();
	private readonly steps = new Map<string, AgentStepRecord[]>();
	private readonly leases = new Map<string, { owner: string; acquiredAt: string; expiresAt: string }>();

	async createRun(run: AgentRunRecord<TInput, TContext, unknown>) {
		this.runs.set(run.id, structuredClone(run));
		this.steps.set(run.id, []);
	}

	async getRun(runId: string) {
		const run = this.runs.get(runId);
		return run ? structuredClone(run) : null;
	}

	async saveRun(run: AgentRunRecord<TInput, TContext, unknown>) {
		this.runs.set(run.id, structuredClone(run));
	}

	async listRuns(args?: {
		agentId?: string;
		statuses?: Array<AgentRunRecord<TInput, TContext, unknown>["status"]>;
		limit?: number;
	}) {
		const statuses = Array.isArray(args?.statuses) ? new Set(args.statuses) : null;
		const runs = Array.from(this.runs.values())
			.filter((run) => (args?.agentId ? run.agentId === args.agentId : true))
			.filter((run) => (statuses ? statuses.has(run.status) : true))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		const limited =
			typeof args?.limit === "number" && args.limit > 0
				? runs.slice(0, args.limit)
				: runs;
		return structuredClone(limited);
	}

	async acquireRunLease(args: { runId: string; owner: string; ttlSeconds: number }) {
		const now = Date.now();
		const existing = this.leases.get(args.runId);
		const existingExpiresAt = existing ? Date.parse(existing.expiresAt) : 0;
		if (
			existing &&
			existing.owner !== args.owner &&
			Number.isFinite(existingExpiresAt) &&
			existingExpiresAt > now
		) {
			return {
				acquired: false,
				lease: structuredClone(existing),
			};
		}

		const lease = {
			owner: args.owner,
			acquiredAt: new Date(now).toISOString(),
			expiresAt: new Date(now + Math.max(1, args.ttlSeconds) * 1_000).toISOString(),
		};
		this.leases.set(args.runId, structuredClone(lease));
		return {
			acquired: true,
			lease: structuredClone(lease),
		};
	}

	async renewRunLease(args: { runId: string; owner: string; ttlSeconds: number }) {
		const now = Date.now();
		const existing = this.leases.get(args.runId);
		const existingExpiresAt = existing ? Date.parse(existing.expiresAt) : 0;
		if (
			!existing ||
			existing.owner !== args.owner ||
			(!Number.isFinite(existingExpiresAt) || existingExpiresAt <= now)
		) {
			return {
				renewed: false,
				lease: existing ? structuredClone(existing) : null,
			};
		}

		const renewedLease = {
			owner: existing.owner,
			acquiredAt: existing.acquiredAt,
			expiresAt: new Date(now + Math.max(1, args.ttlSeconds) * 1_000).toISOString(),
		};
		this.leases.set(args.runId, structuredClone(renewedLease));
		return {
			renewed: true,
			lease: structuredClone(renewedLease),
		};
	}

	async releaseRunLease(args: { runId: string; owner: string }) {
		const existing = this.leases.get(args.runId);
		if (!existing || existing.owner !== args.owner) return false;
		this.leases.delete(args.runId);
		return true;
	}

	async appendStep(step: AgentStepRecord) {
		const existing = this.steps.get(step.runId) ?? [];
		existing.push(structuredClone(step));
		this.steps.set(step.runId, existing);
	}

	async saveStep(step: AgentStepRecord) {
		const existing = this.steps.get(step.runId) ?? [];
		const index = existing.findIndex(
			(entry) => entry.runId === step.runId && entry.index === step.index,
		);
		if (index >= 0) {
			existing[index] = structuredClone(step);
		} else {
			existing.push(structuredClone(step));
		}
		this.steps.set(step.runId, existing);
	}

	async listSteps(runId: string) {
		return structuredClone(this.steps.get(runId) ?? []);
	}
}

function toPromptText(input: unknown): string {
	if (typeof input === "string") return input;
	return JSON.stringify(input, null, 2);
}

function toPresetModelAlias(preset: string | undefined): string | undefined {
	if (typeof preset !== "string") return undefined;
	const normalized = preset.trim().replace(/^@+/, "");
	return normalized.length > 0 ? `@${normalized}` : undefined;
}

function nowIso() {
	return new Date().toISOString();
}

function defaultStore<TInput, TContext>(): InternalCheckpointStore<TInput, TContext> {
	return new EphemeralCheckpointStore<TInput, TContext>();
}

const DEFAULT_LEASE_TTL_SECONDS = 300;
const DEFAULT_MODEL_RETRY_BACKOFF_MS = 250;

function resolveLeaseConfig() {
	return {
		owner: `lease:${randomUUID()}`,
		ttlSeconds: DEFAULT_LEASE_TTL_SECONDS,
	};
}

function resolveModelRetryConfig(args: {
	definition: AgentDefinition<any, any, any>;
	options: { modelRetry?: AgentModelRetryConfig };
}) {
	const config = args.options.modelRetry ?? args.definition.modelRetry;
	return {
		maxRetries:
			typeof config?.maxRetries === "number" && Number.isFinite(config.maxRetries)
				? Math.max(0, Math.floor(config.maxRetries))
				: 0,
		backoffMs:
			typeof config?.backoffMs === "number" && Number.isFinite(config.backoffMs)
				? Math.max(0, Math.floor(config.backoffMs))
				: DEFAULT_MODEL_RETRY_BACKOFF_MS,
	};
}

function resolveToolExecutionConfig(args: {
	definition: AgentDefinition<any, any, any>;
	options: { toolExecution?: AgentToolExecutionConfig };
}) {
	const concurrency = args.options.toolExecution?.toolConcurrency ??
		args.definition.toolExecution?.toolConcurrency;
	return {
		toolConcurrency:
			typeof concurrency === "number" && Number.isFinite(concurrency)
				? Math.max(1, Math.floor(concurrency))
				: 1,
	};
}

function resolveRequestedModelTarget<TInput, TOutput, TContext>(args: {
	definition: AgentDefinition<TInput, TOutput, TContext>;
	options: { model?: string; preset?: string };
}) {
	const explicitModel =
		typeof args.options.model === "string" && args.options.model.trim().length > 0
			? args.options.model.trim()
			: undefined;
	if (explicitModel) return explicitModel;

	const runPresetAlias = toPresetModelAlias(args.options.preset);
	if (runPresetAlias) return runPresetAlias;

	const definitionModel =
		typeof args.definition.model === "string" && args.definition.model.trim().length > 0
			? args.definition.model.trim()
			: undefined;
	if (definitionModel) return definitionModel;

	return toPresetModelAlias(args.definition.preset);
}

function startLeaseHeartbeat<TInput, TContext>(args: {
	store: InternalCheckpointStore<TInput, TContext>;
	runId: string;
	owner: string;
	ttlSeconds: number;
}) {
	const intervalMs = Math.max(250, Math.floor(args.ttlSeconds * 1000 * 0.5));
	let stopped = false;
	let renewing = false;
	let failure: Error | null = null;

	const tick = async () => {
		if (stopped || renewing || failure) return;
		renewing = true;
		try {
			const result = await args.store.renewRunLease({
				runId: args.runId,
				owner: args.owner,
				ttlSeconds: args.ttlSeconds,
			});
			if (!result.renewed) {
				failure = new Error(
					`Run ${args.runId} lease could not be renewed${result.lease?.owner ? `; currently owned by ${result.lease.owner}` : ""}`,
				);
			}
		} catch (error) {
			failure = error instanceof Error ? error : new Error(String(error));
		} finally {
			renewing = false;
		}
	};

	const timer = setInterval(() => {
		void tick();
	}, intervalMs);

	return {
		stop() {
			stopped = true;
			clearInterval(timer);
		},
		throwIfFailed() {
			if (failure) throw failure;
		},
	};
}

async function emitEvent(handler: AgentEventHandler | undefined, event: AgentEvent) {
	if (!handler) return;
	await handler(event);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function toPersistedErrorDetails(error: unknown) {
	return error instanceof AgentGatewayError ? toAgentGatewayErrorDetails(error) : undefined;
}

async function sleepWithSignal(delayMs: number, signal?: AbortSignal) {
	if (delayMs <= 0) return;
	await new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("Aborted"));
			return;
		}

		const timer = setTimeout(() => {
			if (signal) signal.removeEventListener("abort", onAbort);
			resolve();
		}, delayMs);

		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			reject(signal?.reason ?? new Error("Aborted"));
		};

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function buildPauseRecord(request: {
	reason: string;
	payload?: unknown;
}): AgentHumanPause {
	return {
		reason: request.reason,
		payload: request.payload,
		requestedAt: nowIso(),
	};
}

function createToolAbortContext(args: {
	parentSignal?: AbortSignal;
	timeoutMs?: number;
	toolName: string;
}) {
	const timeoutMs =
		typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
			? Math.floor(args.timeoutMs)
			: null;
	if (!args.parentSignal && timeoutMs == null) {
		return {
			signal: args.parentSignal,
			cleanup: () => {},
		};
	}

	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | null = null;
	const onAbort = () => {
		controller.abort(args.parentSignal?.reason);
	};

	if (args.parentSignal) {
		if (args.parentSignal.aborted) {
			controller.abort(args.parentSignal.reason);
		} else {
			args.parentSignal.addEventListener("abort", onAbort, { once: true });
		}
	}

	if (timeoutMs != null) {
		timer = setTimeout(() => {
			controller.abort(new Error(`Tool ${args.toolName} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			if (timer) clearTimeout(timer);
			if (args.parentSignal) {
				args.parentSignal.removeEventListener("abort", onAbort);
			}
		},
	};
}

async function executeToolWithTimeout<TContext>(args: {
	tool: AgentTool<any, any, TContext>;
	call: AgentToolCall;
	runtimeContext: AgentRuntimeContext<TContext>;
}) {
	const abortContext = createToolAbortContext({
		parentSignal: args.runtimeContext.signal,
		timeoutMs: args.tool.timeoutMs,
		toolName: args.call.name,
	});

	try {
		const maybePromise = Promise.resolve(
			args.tool.execute(args.call.input, {
				...args.runtimeContext,
				signal: abortContext.signal,
			}),
		);
		if (args.tool.timeoutMs == null || args.tool.timeoutMs <= 0) {
			return await maybePromise;
		}

		const timeoutMessage = `Tool ${args.call.name} timed out after ${Math.floor(args.tool.timeoutMs)}ms`;
		const timeoutPromise = new Promise<never>((_, reject) => {
			abortContext.signal?.addEventListener(
				"abort",
				() => {
					reject(abortContext.signal?.reason ?? new Error(timeoutMessage));
				},
				{ once: true },
			);
		});

		return await Promise.race([maybePromise, timeoutPromise]);
	} finally {
		abortContext.cleanup();
	}
}

function buildRunResult<TInput, TOutput, TContext>(args: {
	run: AgentRunRecord<TInput, TContext, TOutput>;
	steps: AgentStepRecord[];
}): AgentRunResult<TOutput, TInput, TContext> {
	return {
		run: args.run,
		steps: args.steps,
		output: args.run.result as TOutput | undefined,
		messages: args.run.messages,
	};
}

class ObservedRunCancellationError<TInput = unknown, TContext = unknown> extends Error {
	constructor(
		public readonly run: AgentRunRecord<TInput, TContext, unknown>,
	) {
		super(run.error || `Run ${run.id} was cancelled`);
		this.name = "ObservedRunCancellationError";
	}
}

async function throwIfRunCancelled<TInput, TOutput, TContext>(args: {
	store: InternalCheckpointStore<TInput, TContext>;
	runId: string;
	definition: AgentDefinition<TInput, TOutput, TContext>;
	onEvent?: AgentEventHandler;
	activeStep: AgentStepRecord | null;
}) {
	const latestRun = await args.store.getRun(args.runId);
	if (!latestRun || latestRun.status !== "cancelled") return;

	if (
		args.activeStep &&
		args.activeStep.status !== "checkpointed" &&
		args.activeStep.status !== "failed" &&
		args.activeStep.status !== "cancelled"
	) {
		args.activeStep.status = "cancelled";
		args.activeStep.error = latestRun.error || "Cancelled";
		args.activeStep.errorDetails = undefined;
		args.activeStep.updatedAt = nowIso();
		await args.store.saveStep(args.activeStep);
		await emitEvent(args.onEvent, {
			type: "step.cancelled",
			runId: args.runId,
			agentId: args.definition.id,
			timestamp: nowIso(),
			status: latestRun.status,
			stepIndex: args.activeStep.index,
			attempt: args.activeStep.modelAttempts,
			requestId: args.activeStep.requestId,
			nativeResponseId: args.activeStep.nativeResponseId ?? null,
			provider: args.activeStep.provider,
			model: args.activeStep.model,
			usage: args.activeStep.usage,
			responseMeta: args.activeStep.responseMeta,
			error: args.activeStep.error,
		});
	}

	await emitEvent(args.onEvent, {
		type: "run.cancelled",
		runId: args.runId,
		agentId: args.definition.id,
		timestamp: nowIso(),
		status: latestRun.status,
		error: latestRun.error,
	});

	throw new ObservedRunCancellationError(latestRun);
}

async function executeToolCalls<TContext>(
	toolCalls: AgentToolCall[],
	tools: AgentTool<any, any, TContext>[],
	runtimeContext: AgentRuntimeContext<TContext>,
	toolExecution: AgentToolExecutionConfig | undefined,
	emit?: AgentEventHandler,
	runStatus?: "running" | "waiting_for_tools" | "waiting_for_human" | "completed" | "failed" | "queued" | "cancelled",
): Promise<AgentMessage[]> {
	const { toolConcurrency } = resolveToolExecutionConfig({
		definition: { id: runtimeContext.agentId, toolExecution },
		options: { toolExecution },
	});
	const messages = new Array<AgentMessage>(toolCalls.length);

	const runOneTool = async (call: AgentToolCall, index: number) => {
		const tool = tools.find((entry) => entry.id === call.name);
		if (!tool) {
			await emitEvent(emit, {
				type: "tool.failed",
				runId: runtimeContext.runId,
				agentId: runtimeContext.agentId,
				timestamp: nowIso(),
				status: runStatus ?? "running",
				stepIndex: runtimeContext.stepIndex,
				toolCallId: call.id,
				toolName: call.name,
				error: `Tool not found: ${call.name}`,
			});
			throw new Error(`Tool not found: ${call.name}`);
		}
		await emitEvent(emit, {
			type: "tool.started",
			runId: runtimeContext.runId,
			agentId: runtimeContext.agentId,
			timestamp: nowIso(),
			status: runStatus ?? "running",
			stepIndex: runtimeContext.stepIndex,
			toolCallId: call.id,
			toolName: call.name,
		});
		let output: unknown;
		try {
			output = await executeToolWithTimeout({
				tool,
				call,
				runtimeContext,
			});
		} catch (error) {
			await emitEvent(emit, {
				type: "tool.failed",
				runId: runtimeContext.runId,
				agentId: runtimeContext.agentId,
				timestamp: nowIso(),
				status: runStatus ?? "running",
				stepIndex: runtimeContext.stepIndex,
				toolCallId: call.id,
				toolName: call.name,
				error: toErrorMessage(error),
			});
			throw error;
		}
		await emitEvent(emit, {
			type: "tool.completed",
			runId: runtimeContext.runId,
			agentId: runtimeContext.agentId,
			timestamp: nowIso(),
			status: runStatus ?? "running",
			stepIndex: runtimeContext.stepIndex,
			toolCallId: call.id,
			toolName: call.name,
			output,
		});
		messages[index] = {
			role: "tool",
			name: call.name,
			toolCallId: call.id,
			content: typeof output === "string" ? output : JSON.stringify(output, null, 2),
		};
	};

	if (toolConcurrency <= 1 || toolCalls.length <= 1) {
		for (const [index, call] of toolCalls.entries()) {
			await runOneTool(call, index);
		}
		return messages;
	}

	let nextIndex = 0;
	const workerCount = Math.min(toolConcurrency, toolCalls.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < toolCalls.length) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				await runOneTool(toolCalls[currentIndex], currentIndex);
			}
		}),
	);

	return messages;
}

async function generateModelResponseWithRetries<TInput, TContext>(args: {
	definition: Pick<
		AgentDefinition<TInput, unknown, TContext>,
		"id" | "model" | "instructions" | "modelRetry"
	>;
	run: AgentRunRecord<TInput, TContext, unknown>;
	options: InternalResumeOptions<TContext>;
	step: AgentStepRecord;
	stepIndex: number;
	tools: AgentTool<any, any, TContext>[];
	leaseHeartbeat: ReturnType<typeof startLeaseHeartbeat>;
}) {
	const retryConfig = resolveModelRetryConfig({
		definition: args.definition,
		options: args.options,
	});
	const totalAttempts = retryConfig.maxRetries + 1;
	const modelTarget = resolveRequestedModelTarget({
		definition: args.definition,
		options: args.options,
	});

	for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
		args.step.modelAttempts = attempt;
		await emitEvent(args.options.onEvent, {
			type: "model.requested",
			runId: args.run.id,
			agentId: args.definition.id,
			timestamp: nowIso(),
			status: args.run.status,
			stepIndex: args.stepIndex,
			attempt,
			model: modelTarget,
		});

		try {
			const response = await args.options.client.generate({
				agentId: args.definition.id,
				model: modelTarget,
				instructions: args.definition.instructions,
				messages: args.run.messages,
				tools: args.tools.map((tool) => ({
					id: tool.id,
					description: tool.description,
					parameters: tool.parameters,
				})),
				context: args.options.context,
				signal: args.options.signal,
			});
			args.leaseHeartbeat.throwIfFailed();
			return response;
		} catch (error) {
			args.leaseHeartbeat.throwIfFailed();
			if (attempt >= totalAttempts) {
				await emitEvent(args.options.onEvent, {
					type: "model.failed",
					runId: args.run.id,
					agentId: args.definition.id,
					timestamp: nowIso(),
					status: args.run.status,
					stepIndex: args.stepIndex,
					attempt,
					model: modelTarget,
					error: toErrorMessage(error),
					errorDetails: toPersistedErrorDetails(error),
				});
				throw error;
			}
			const backoffMs = retryConfig.backoffMs * attempt;
			await sleepWithSignal(backoffMs, args.options.signal);
			args.leaseHeartbeat.throwIfFailed();
		}
	}

	throw new Error("Unreachable model retry state");
}

async function resumeAgentInternal<TInput, TOutput, TContext>(
	definition: AgentDefinition<TInput, TOutput, TContext>,
	runId: string,
	options: InternalResumeOptions<TContext>,
	emitRunResumedEvent: boolean,
): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const store = options.store;
	const run = await store.getRun(runId);
	if (!run) {
		throw new Error(`Run not found: ${runId}`);
	}
	if (run.status === "completed") {
		const steps = await store.listSteps(runId);
		return buildRunResult({
			run: run as AgentRunRecord<TInput, TContext, TOutput>,
			steps,
		});
	}
	if (run.status === "cancelled") {
		throw new Error(run.error || `Run ${runId} was cancelled`);
	}

	const leaseConfig = resolveLeaseConfig();
	const leaseResult = await store.acquireRunLease({
		runId,
		owner: leaseConfig.owner,
		ttlSeconds: leaseConfig.ttlSeconds,
	});
	if (!leaseResult.acquired) {
		throw new Error(
			`Run ${runId} is already leased by ${leaseResult.lease?.owner ?? "another worker"}`,
		);
	}
	const leaseHeartbeat = startLeaseHeartbeat({
		store,
		runId,
		owner: leaseConfig.owner,
		ttlSeconds: leaseConfig.ttlSeconds,
	});
	let activeStep: AgentStepRecord | null = null;

	try {
		const previousStatus = run.status;
		if (run.status === "waiting_for_human" && !options.humanInput) {
			throw new Error(
				`Run ${runId} is waiting for human input${run.pause?.reason ? `: ${run.pause.reason}` : ""}`,
			);
		}

		if (options.humanInput) {
			run.messages.push({ role: "user", content: options.humanInput });
			run.pause = null;
		}

		run.status = "running";
		run.updatedAt = nowIso();
		await store.saveRun(run);
		if (emitRunResumedEvent) {
			await emitEvent(options.onEvent, {
				type: "run.resumed",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				previousStatus,
			});
		}

		const tools = definition.tools ?? [];
		const maxSteps = options.maxSteps ?? definition.maxSteps ?? 12;
		const steps = await store.listSteps(runId);

		for (let stepIndex = run.stepCount; stepIndex < maxSteps; stepIndex += 1) {
			await throwIfRunCancelled({
				store,
				runId,
				definition,
				onEvent: options.onEvent,
				activeStep,
			});
			leaseHeartbeat.throwIfFailed();

			const step: AgentStepRecord = {
				runId,
				index: stepIndex,
				status: "executing_model",
				createdAt: nowIso(),
				updatedAt: nowIso(),
			};
			activeStep = step;
			await store.appendStep(step);
			await emitEvent(options.onEvent, {
				type: "step.started",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				stepIndex,
			});
			const response = await generateModelResponseWithRetries({
				definition,
				run,
				options,
				step,
				stepIndex,
				tools,
				leaseHeartbeat,
			});
			await throwIfRunCancelled({
				store,
				runId,
				definition,
				onEvent: options.onEvent,
				activeStep,
			});

			run.messages.push(response.message);
			run.stepCount = stepIndex + 1;
			run.updatedAt = nowIso();

			step.requestId = response.requestId;
			step.nativeResponseId = response.nativeResponseId ?? null;
			step.provider = response.provider;
			step.model =
				response.model ??
				resolveRequestedModelTarget({
					definition,
					options,
				});
			step.usage = response.usage;
			step.toolCalls = response.message.toolCalls;
			step.responseMeta = response.responseMeta;
			await emitEvent(options.onEvent, {
				type: "model.completed",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				stepIndex,
				attempt: step.modelAttempts,
				requestId: response.requestId,
				nativeResponseId: response.nativeResponseId ?? null,
				provider: response.provider,
				model:
					response.model ??
					resolveRequestedModelTarget({
						definition,
						options,
					}),
				usage: response.usage,
				responseMeta: response.responseMeta,
			});
			await throwIfRunCancelled({
				store,
				runId,
				definition,
				onEvent: options.onEvent,
				activeStep,
			});

			const parsedOutput =
				!response.message.toolCalls?.length && definition.parseOutput
					? definition.parseOutput(response.message.content)
					: undefined;
			if (definition.humanReview) {
				const pauseRequest = await definition.humanReview({
					runId,
					agentId: definition.id,
					stepIndex,
					input: run.input,
					context: options.context,
					messages: [...run.messages],
					response,
					parsedOutput,
				});
				await throwIfRunCancelled({
					store,
					runId,
					definition,
					onEvent: options.onEvent,
					activeStep,
				});
				if (pauseRequest) {
					run.status = "waiting_for_human";
					run.pause = buildPauseRecord(pauseRequest);
					run.updatedAt = nowIso();
					await store.saveRun(run);

					step.status = "checkpointed";
					step.updatedAt = nowIso();
					await store.saveStep(step);
					await store.saveRun(run);
					await emitEvent(options.onEvent, {
						type: "step.completed",
						runId,
						agentId: definition.id,
						timestamp: nowIso(),
						status: run.status,
						stepIndex,
						attempt: step.modelAttempts,
						requestId: response.requestId,
						nativeResponseId: response.nativeResponseId ?? null,
						provider: response.provider,
						model:
							response.model ??
							resolveRequestedModelTarget({
								definition,
								options,
							}),
						usage: response.usage,
						responseMeta: response.responseMeta,
					});
					await emitEvent(options.onEvent, {
						type: "checkpoint.saved",
						runId,
						agentId: definition.id,
						timestamp: nowIso(),
						status: run.status,
						stepIndex,
						requestId: response.requestId,
						nativeResponseId: response.nativeResponseId ?? null,
						provider: response.provider,
						model:
							response.model ??
							resolveRequestedModelTarget({
								definition,
								options,
							}),
						usage: response.usage,
						responseMeta: response.responseMeta,
					});
					await emitEvent(options.onEvent, {
						type: "run.waiting_for_human",
						runId,
						agentId: definition.id,
						timestamp: nowIso(),
						status: run.status,
						stepIndex,
						pause: run.pause!,
					});

					return buildRunResult({
						run: run as AgentRunRecord<TInput, TContext, TOutput>,
						steps: await store.listSteps(runId),
					});
				}
			}

			if (Array.isArray(response.message.toolCalls) && response.message.toolCalls.length > 0) {
				step.status = "executing_tools";
				step.updatedAt = nowIso();

				const toolMessages = await executeToolCalls(
					response.message.toolCalls,
					tools,
					{
						runId,
						agentId: definition.id,
						stepIndex,
						context: options.context,
						signal: options.signal,
					},
					options.toolExecution ?? definition.toolExecution,
					options.onEvent,
					run.status,
				);
				leaseHeartbeat.throwIfFailed();
				run.messages.push(...toolMessages);
				await throwIfRunCancelled({
					store,
					runId,
					definition,
					onEvent: options.onEvent,
					activeStep,
				});
				run.status = "waiting_for_tools";
				run.updatedAt = nowIso();
				await store.saveRun(run);

				step.status = "checkpointed";
				step.updatedAt = nowIso();
				await store.saveStep(step);
				await store.saveRun(run);
				await emitEvent(options.onEvent, {
					type: "step.completed",
					runId,
					agentId: definition.id,
					timestamp: nowIso(),
					status: run.status,
					stepIndex,
					attempt: step.modelAttempts,
					requestId: response.requestId,
					nativeResponseId: response.nativeResponseId ?? null,
					provider: response.provider,
					model:
						response.model ??
						resolveRequestedModelTarget({
							definition,
							options,
						}),
					usage: response.usage,
					responseMeta: response.responseMeta,
				});
				await emitEvent(options.onEvent, {
					type: "checkpoint.saved",
					runId,
					agentId: definition.id,
					timestamp: nowIso(),
					status: run.status,
					stepIndex,
					requestId: response.requestId,
					nativeResponseId: response.nativeResponseId ?? null,
					provider: response.provider,
					model:
						response.model ??
						resolveRequestedModelTarget({
							definition,
							options,
						}),
					usage: response.usage,
					responseMeta: response.responseMeta,
				});
				activeStep = null;
				continue;
			}

			const outputText = response.message.content;
			const output =
				parsedOutput !== undefined
					? parsedOutput
					: definition.parseOutput
						? definition.parseOutput(outputText)
						: (outputText as TOutput);

			run.result = output;
			run.status = "completed";
			run.pause = null;
			run.updatedAt = nowIso();
			await store.saveRun(run);

			step.status = "checkpointed";
			step.updatedAt = nowIso();
			await store.saveStep(step);
			await store.saveRun(run);
			await emitEvent(options.onEvent, {
				type: "step.completed",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				stepIndex,
				attempt: step.modelAttempts,
				requestId: response.requestId,
				nativeResponseId: response.nativeResponseId ?? null,
				provider: response.provider,
				model:
					response.model ??
					resolveRequestedModelTarget({
						definition,
						options,
					}),
				usage: response.usage,
				responseMeta: response.responseMeta,
			});
			await emitEvent(options.onEvent, {
				type: "checkpoint.saved",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				stepIndex,
				requestId: response.requestId,
				nativeResponseId: response.nativeResponseId ?? null,
				provider: response.provider,
				model:
					response.model ??
					resolveRequestedModelTarget({
						definition,
						options,
					}),
				usage: response.usage,
				responseMeta: response.responseMeta,
			});
			await emitEvent(options.onEvent, {
				type: "run.completed",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				output,
			});

			return buildRunResult({
				run: run as AgentRunRecord<TInput, TContext, TOutput>,
				steps: await store.listSteps(runId),
			});
		}

		run.status = "failed";
		run.error = `Max steps exceeded (${maxSteps})`;
		run.errorDetails = undefined;
		run.updatedAt = nowIso();
		await store.saveRun(run);
		await emitEvent(options.onEvent, {
			type: "run.failed",
			runId,
			agentId: definition.id,
			timestamp: nowIso(),
			status: run.status,
			error: run.error,
			errorDetails: run.errorDetails,
		});
		throw new Error(run.error);
	} catch (error) {
		if (error instanceof ObservedRunCancellationError) {
			return buildRunResult({
				run: error.run as AgentRunRecord<TInput, TContext, TOutput>,
				steps: await store.listSteps(runId),
			});
		}
		const latestRun = await store.getRun(runId);
		const latestStatus = latestRun?.status;
		if (
			latestStatus !== "completed" &&
			latestStatus !== "cancelled" &&
			latestStatus !== "failed"
		) {
			const failureMessage = toErrorMessage(error);
			const errorDetails = toPersistedErrorDetails(error);
			if (activeStep && activeStep.status !== "checkpointed" && activeStep.status !== "failed") {
				activeStep.status = "failed";
				activeStep.error = failureMessage;
				activeStep.errorDetails = errorDetails;
				activeStep.updatedAt = nowIso();
				await store.saveStep(activeStep);
				await emitEvent(options.onEvent, {
					type: "step.failed",
					runId,
					agentId: definition.id,
					timestamp: nowIso(),
					status: "failed",
					stepIndex: activeStep.index,
					attempt: activeStep.modelAttempts,
					requestId: activeStep.requestId,
					nativeResponseId: activeStep.nativeResponseId ?? null,
					provider: activeStep.provider,
					model: activeStep.model,
					usage: activeStep.usage,
					error: failureMessage,
					errorDetails,
				});
			}
			run.status = "failed";
			run.error = failureMessage;
			run.errorDetails = errorDetails;
			run.updatedAt = nowIso();
			await store.saveRun(run);
			await emitEvent(options.onEvent, {
				type: "run.failed",
				runId,
				agentId: definition.id,
				timestamp: nowIso(),
				status: run.status,
				error: failureMessage,
				errorDetails,
			});
		}
		throw error;
	} finally {
		leaseHeartbeat.stop();
		await store.releaseRunLease({
			runId,
			owner: leaseConfig.owner,
		});
	}
}

export async function runAgent<TInput, TOutput, TContext>(
	definition: AgentDefinition<TInput, TOutput, TContext>,
	options: AgentRunOptions<TInput, TContext>,
): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const startedAt = Date.now();
	const runId = randomUUID();
	const createdAt = nowIso();
	const store = defaultStore<TInput, TContext>();
	const messages: AgentMessage[] = [];

	if (definition.instructions) {
		messages.push({ role: "system", content: definition.instructions });
	}
	messages.push({ role: "user", content: toPromptText(options.input) });

	const run: AgentRunRecord<TInput, TContext, TOutput> = {
		id: runId,
		agentId: definition.id,
		status: "queued",
		input: options.input,
		context: options.context,
		messages,
		pause: null,
		createdAt,
		updatedAt: createdAt,
		stepCount: 0,
	};

	await store.createRun(run);
	await emitEvent(options.onEvent, {
		type: "run.started",
		runId,
		agentId: definition.id,
		timestamp: nowIso(),
		status: run.status,
	});

	try {
		const result = await resumeAgentInternal(
			definition,
			runId,
			{
				client: options.client,
				store,
				context: options.context,
				model: options.model,
				preset: options.preset,
				maxSteps: options.maxSteps,
				modelRetry: options.modelRetry,
				toolExecution: options.toolExecution,
				signal: options.signal,
				onEvent: options.onEvent,
			},
			false,
		);
		captureAgentRunDevtools({
			type: "agent.run",
			definition,
			options,
			startedAt,
			result,
			runId,
		});
		return result;
	} catch (error) {
		captureAgentRunDevtools({
			type: "agent.run",
			definition,
			options,
			startedAt,
			error,
			runId,
		});
		throw error;
	}
}

export async function continueAgent<TInput, TOutput, TContext>(
	definition: AgentDefinition<TInput, TOutput, TContext>,
	options: AgentContinueOptions<TInput, TOutput, TContext>,
): Promise<AgentRunResult<TOutput, TInput, TContext>> {
	const startedAt = Date.now();
	if (options.run.run.agentId !== definition.id) {
		throw new Error(
			`Cannot continue run ${options.run.run.id} with agent ${definition.id}; it belongs to ${options.run.run.agentId}`,
		);
	}

	const store = defaultStore<TInput, TContext>();
	await store.createRun(options.run.run as AgentRunRecord<TInput, TContext, unknown>);
	for (const step of options.run.steps) {
		await store.appendStep(step);
	}

	const captureOptions = {
		input: options.run.run.input,
		context:
			options.context === undefined
				? (options.run.run.context as TContext | undefined)
				: options.context,
		model: options.model,
		preset: options.preset,
		maxSteps: options.maxSteps,
		devtools: options.devtools,
	};

	try {
		const result = await resumeAgentInternal(
			definition,
			options.run.run.id,
			{
				client: options.client,
				store,
				context:
					options.context === undefined
						? (options.run.run.context as TContext | undefined)
						: options.context,
				model: options.model,
				preset: options.preset,
				maxSteps: options.maxSteps,
				modelRetry: options.modelRetry,
				toolExecution: options.toolExecution,
				signal: options.signal,
				humanInput: options.humanInput,
				onEvent: options.onEvent,
			},
			true,
		);
		captureAgentRunDevtools({
			type: "agent.continue",
			definition,
			options: captureOptions,
			startedAt,
			result,
			runId: options.run.run.id,
		});
		return result;
	} catch (error) {
		captureAgentRunDevtools({
			type: "agent.continue",
			definition,
			options: captureOptions,
			startedAt,
			error,
			runId: options.run.run.id,
		});
		throw error;
	}
}


