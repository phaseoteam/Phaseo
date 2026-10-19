// Runs a workspace's request classifiers after a text request finishes and
// before its audit row is written, so the answers are stored as ordinary
// request labels in the first write (no later UPDATE, no analytics rebuild).
// This only ever runs in background work: both stream and non-stream success
// audits are dispatched after the response has been sent.
//
// Each classification is a normal gateway request made in-process with the
// caller's own credentials, so it is routed, billed, logged and privacy-checked
// (ZDR, BYOK) exactly like the workspace's other traffic. It is labelled
// phaseo.classifier=<id> so its spend can be filtered, is never classified
// itself, and does not count against the caller's rate limit policies.

import { tieredRead } from "@core/tiered-cache";
import type { Endpoint, RequestLabel } from "@core/types";
import {
	CLASSIFIER_COLUMNS,
	OTHER_VALUE,
	type ClassifierDimension,
	type ClassifierRow,
} from "@core/request-classifiers";
import { getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { RESERVED_CLASSIFIER_LABEL_KEY } from "../before/request-labels";
import type { PipelineContext } from "../before/types";
import { isStealthRequest } from "../stealth";
import { sanitizeDataContributionPayload } from "./data-contribution";

export const CLASSIFIER_LABEL_KEY = RESERVED_CLASSIFIER_LABEL_KEY;
const CLASSIFIABLE_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses", "messages"]);
const CONFIG_CACHE_FRESH_MS = 60_000;
const SPEND_CACHE_FRESH_MS = 60_000;
const SESSION_CACHE_TTL_SECONDS = 3_600;
/** Classification must leave the rest of the background audit plenty of time. */
const CLASSIFICATION_TIMEOUT_MS = 12_000;
const MAX_TURN_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 48_000;
const MAX_OUTPUT_TOKENS_PER_DIMENSION = 60;

export type ClassifierHandler = (request: Request) => Promise<Response>;
export type ClassifierCall = (body: Record<string, unknown>, classifierId: string) => Promise<Response>;

export type ClassificationOutcome = {
	classifier_id: string;
	status: "classified" | "session_cache" | "failed" | "budget_reached";
	model: string;
	labels: Array<RequestLabel & { confidence: number | null }>;
	response_id?: string | null;
	cost_nanos?: number | null;
};

// Classifier calls are marked by object identity, which a client cannot forge
// with headers.
const classifierSubrequests = new WeakSet<Request>();
const unclassifiedRequests = new WeakSet<Request>();

/** Other in-process gateway calls (the auto-router's) are not classified either; unlike classifier calls they keep normal rate limits. */
export function excludeFromRequestClassification(request: Request): Request {
	unclassifiedRequests.add(request);
	return request;
}

/** True for the gateway's own classifier calls; callers cannot forge this. */
export function isClassifierSubrequest(req: Request): boolean {
	return classifierSubrequests.has(req);
}

/**
 * Lets the success audit classify this request with the caller's credentials,
 * or marks the context as a classifier call so it is not classified again.
 */
export function attachRequestClassifierCall(ctx: PipelineContext, req: Request, handler: () => ClassifierHandler): void {
	if (classifierSubrequests.has(req)) {
		ctx.classifierSubrequest = true;
		return;
	}
	if (unclassifiedRequests.has(req)) return;
	const authorization = req.headers.get("authorization");
	if (!authorization) return;
	ctx.requestClassifierCall = (body, classifierId) => {
		const request = new Request("https://phaseo.local/v1/responses", {
			method: "POST",
			headers: {
				Authorization: authorization,
				"Content-Type": "application/json",
				"x-phaseo-metadata": JSON.stringify({ labels: [{ key: CLASSIFIER_LABEL_KEY, value: classifierId }] }),
			},
			body: JSON.stringify(body),
		});
		classifierSubrequests.add(request);
		return handler()(request);
	};
}

async function loadClassifiers(workspaceId: string): Promise<ClassifierRow[]> {
	return (await tieredRead<ClassifierRow[]>({
		key: `request-classifiers:${workspaceId}`,
		loader: async () => {
			const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").select(CLASSIFIER_COLUMNS)
				.eq("workspace_id", workspaceId).eq("enabled", true)
				.order("created_at", { ascending: true }).order("id", { ascending: true });
			if (error) throw new Error(`request_classifiers_load_failed:${error.message}`);
			return (data ?? []) as ClassifierRow[];
		},
		l1FreshMs: CONFIG_CACHE_FRESH_MS,
		l2: false,
		l3: false,
	})) ?? [];
}

function currentMonth(now = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** This month's spend per classifier, for budgets. Up to a minute stale, so a budget can overshoot slightly. */
async function monthSpend(workspaceId: string): Promise<Map<string, number>> {
	const month = currentMonth();
	const rows = await tieredRead<Array<{ classifier_id: string; cost_nanos: number | string }>>({
		key: `request-classifier-spend:${workspaceId}:${month}`,
		loader: async () => {
			const { data, error } = await getSupabaseAdmin().from("workspace_request_classifier_spend_monthly")
				.select("classifier_id,cost_nanos").eq("workspace_id", workspaceId).eq("month", month);
			if (error) throw new Error(`request_classifier_spend_load_failed:${error.message}`);
			return data ?? [];
		},
		l1FreshMs: SPEND_CACHE_FRESH_MS,
		l2: false,
		l3: false,
	});
	return new Map((rows ?? []).map((row) => [row.classifier_id, Number(row.cost_nanos) || 0]));
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A stable 0–9999 bucket, so the same request or session always samples the same way. */
export async function sampleBucket(seed: string): Promise<number> {
	return Number.parseInt((await sha256Hex(seed)).slice(0, 8), 16) % 10_000;
}

function inScope(classifier: ClassifierRow, ctx: PipelineContext): boolean {
	const scope = classifier.scope ?? {};
	const keyId = ctx.meta.apiKeyId ?? ctx.keyId ?? null;
	if (scope.key_ids?.length && !(keyId && scope.key_ids.includes(keyId))) return false;
	if (scope.app_ids?.length && !(ctx.meta.appId && scope.app_ids.includes(ctx.meta.appId))) return false;
	if (scope.models?.length) {
		const models = [ctx.requestedModel, ctx.model].filter((model): model is string => typeof model === "string");
		if (!models.some((model) => scope.models!.includes(model))) return false;
	}
	return true;
}

/** Dimensions the caller has not already labelled: caller labels always win. */
export function pendingDimensions(classifier: ClassifierRow, labels: RequestLabel[]): ClassifierDimension[] {
	const taken = new Set(labels.map((label) => label.key));
	return (classifier.dimensions ?? []).filter((dimension) => !taken.has(dimension.key));
}

// ---- Transcript ---------------------------------------------------------------

function clip(text: string, max = MAX_TURN_CHARS): string {
	return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (typeof part === "string") parts.push(part);
		else if (part && typeof part === "object") {
			const record = part as Record<string, unknown>;
			if (typeof record.text === "string") parts.push(record.text);
			else if (record.type === "image_url" || record.type === "input_image" || record.type === "image") parts.push("[image]");
			else if (record.type === "input_file" || record.type === "file" || record.type === "document") parts.push("[file]");
			else if (record.type === "input_audio") parts.push("[audio]");
		}
	}
	return parts.join("\n");
}

function toolNames(tools: unknown): string[] {
	if (!Array.isArray(tools)) return [];
	return tools.map((tool) => {
		const record = (tool ?? {}) as Record<string, any>;
		return String(record.function?.name ?? record.name ?? record.type ?? "").trim();
	}).filter(Boolean);
}

/** One labelled line per turn across Chat Completions, Responses and Messages request shapes. */
export function buildTranscriptTurns(payload: unknown): string[] {
	const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, any>;
	const turns: string[] = [];
	const push = (role: string, text: string) => {
		const trimmed = text.trim();
		if (trimmed) turns.push(`${role}: ${clip(trimmed)}`);
	};
	const tools = toolNames(body.tools);
	if (tools.length) turns.push(`TOOLS: ${tools.join(", ")}`);
	if (typeof body.system === "string" || Array.isArray(body.system)) push("SYSTEM", textOf(body.system));
	if (typeof body.instructions === "string") push("SYSTEM", body.instructions);

	const messages = Array.isArray(body.messages) ? body.messages : [];
	const input = typeof body.input === "string" ? [{ role: "user", content: body.input }] : Array.isArray(body.input) ? body.input : [];
	for (const item of [...messages, ...input]) {
		const record = (item ?? {}) as Record<string, any>;
		if (record.type === "function_call") { push("TOOL_CALL", String(record.name ?? "")); continue; }
		if (record.type === "function_call_output") { push("TOOL_RESULT", textOf(record.output)); continue; }
		const role = String(record.role ?? "user").toLowerCase();
		const label = role === "assistant" ? "ASSISTANT" : role === "system" || role === "developer" ? "SYSTEM" : role === "tool" ? "TOOL_RESULT" : "USER";
		if (Array.isArray(record.content)) {
			const text: string[] = [];
			for (const part of record.content) {
				const block = (part ?? {}) as Record<string, any>;
				if (block.type === "tool_use") push("TOOL_CALL", String(block.name ?? ""));
				else if (block.type === "tool_result") push("TOOL_RESULT", textOf(block.content));
				else text.push(textOf([block]));
			}
			push(label, text.join("\n"));
		} else {
			push(label, textOf(record.content));
		}
		for (const call of Array.isArray(record.tool_calls) ? record.tool_calls : []) push("TOOL_CALL", String(call?.function?.name ?? ""));
	}
	if (typeof body.prompt === "string") push("USER", body.prompt);
	return turns;
}

/** The generated text of a Chat Completions, Responses or Messages result. */
export function responseText(response: unknown): string {
	const body = (response && typeof response === "object" ? response : {}) as Record<string, any>;
	if (typeof body.output_text === "string") return body.output_text;
	const parts: string[] = [];
	for (const item of Array.isArray(body.output) ? body.output : []) {
		if (item?.type === "function_call") parts.push(`[tool call: ${item.name ?? ""}]`);
		else parts.push(textOf(item?.content));
	}
	for (const choice of Array.isArray(body.choices) ? body.choices : []) parts.push(textOf(choice?.message?.content));
	if (Array.isArray(body.content)) parts.push(textOf(body.content));
	return parts.filter(Boolean).join("\n");
}

/** Keeps the start and end of very long conversations, then redacts secrets. */
export function buildTranscript(payload: unknown, response: unknown | null): string {
	const turns = buildTranscriptTurns(payload);
	if (response != null) {
		const text = responseText(response).trim();
		if (text) turns.push(`RESPONSE: ${clip(text)}`);
	}
	let transcript = turns.join("\n\n");
	if (transcript.length > MAX_TRANSCRIPT_CHARS) {
		const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
		transcript = `${transcript.slice(0, half)}\n\n...[earlier turns omitted]...\n\n${transcript.slice(-half)}`;
	}
	return String(sanitizeDataContributionPayload(transcript).value ?? "");
}

// ---- Classifier request -------------------------------------------------------

function allowedValues(dimension: ClassifierDimension): string[] {
	const values = dimension.values.map((entry) => entry.value);
	return dimension.allow_other ? [...values, OTHER_VALUE] : values;
}

/** Dimension keys can contain characters some providers reject in property names, so the schema uses d0, d1, ... */
export function buildClassifierSchema(dimensions: ClassifierDimension[]): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	dimensions.forEach((dimension, index) => {
		const value = { type: "string", enum: allowedValues(dimension) };
		properties[`d${index}`] = {
			type: "object",
			properties: {
				value: dimension.multiple ? { type: "array", items: value } : value,
				confidence: { type: "number" },
			},
			required: ["value", "confidence"],
			additionalProperties: false,
		};
	});
	return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function buildClassifierPrompt(classifier: ClassifierRow, dimensions: ClassifierDimension[]): string {
	const lines = [
		"You label requests sent to an AI model. Read the transcript and answer every dimension below.",
		"Pick only from the listed values. Judge what the request is for, not whether it was answered well.",
		"Give confidence from 0 to 1 for each answer.",
		"",
	];
	dimensions.forEach((dimension, index) => {
		lines.push(`d${index}: ${dimension.name}${dimension.description ? ` - ${dimension.description}` : ""}`);
		lines.push(dimension.multiple ? "  Choose every value that applies (at least one)." : "  Choose exactly one value.");
		for (const entry of dimension.values) lines.push(`  - ${entry.value}${entry.description ? `: ${entry.description}` : ""}`);
		if (dimension.allow_other) lines.push(`  - ${OTHER_VALUE}: none of the values above fit`);
	});
	if (classifier.instructions?.trim()) lines.push("", "Additional instructions from the workspace:", classifier.instructions.trim());
	return lines.join("\n");
}

export function buildClassifierRequestBody(classifier: ClassifierRow, dimensions: ClassifierDimension[], transcript: string): Record<string, unknown> {
	return {
		model: classifier.model,
		stream: false,
		store: false,
		temperature: 0,
		max_output_tokens: 64 + dimensions.length * MAX_OUTPUT_TOKENS_PER_DIMENSION,
		text: {
			format: { type: "json_schema", name: "request_classification", strict: true, schema: buildClassifierSchema(dimensions) },
		},
		input: [
			{ role: "system", content: [{ type: "input_text", text: buildClassifierPrompt(classifier, dimensions) }] },
			{ role: "user", content: [{ type: "input_text", text: `<transcript>\n${transcript}\n</transcript>` }] },
		],
	};
}

/** Validates the model's answer against the taxonomy; anything outside it is dropped. */
export function parseClassifierAnswer(payload: unknown, dimensions: ClassifierDimension[]): Array<RequestLabel & { confidence: number | null }> | null {
	const text = responseText(payload).trim();
	if (!text) return null;
	let parsed: Record<string, any>;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const labels: Array<RequestLabel & { confidence: number | null }> = [];
	dimensions.forEach((dimension, index) => {
		const answer = parsed[`d${index}`];
		if (!answer || typeof answer !== "object") return;
		const allowed = new Map(allowedValues(dimension).map((value) => [value.toLowerCase(), value]));
		const raw: unknown[] = Array.isArray(answer.value) ? answer.value : [answer.value];
		const values = [...new Set(raw
			.map((value) => typeof value === "string" ? allowed.get(value.trim().toLowerCase()) : undefined)
			.filter((value): value is string => Boolean(value)))];
		const chosen = dimension.multiple ? values : values.slice(0, 1);
		const confidence = Number(answer.confidence);
		for (const value of chosen) {
			labels.push({ key: dimension.key, value, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null });
		}
	});
	return labels;
}

// ---- Session reuse ------------------------------------------------------------

function sessionCache(): Cache | null {
	return typeof caches !== "undefined" && (caches as any).default ? (caches as any).default as Cache : null;
}

/** Per-colo cache of a session's answers, keyed by classifier version so edits take effect. */
async function sessionCacheKey(classifier: ClassifierRow, sessionId: string): Promise<Request> {
	const version = await sha256Hex(`${classifier.id}:${classifier.updated_at}:${sessionId}`);
	return new Request(`https://request-classifier-cache.phaseo.internal/${version}`);
}

async function readSessionLabels(classifier: ClassifierRow, sessionId: string) {
	const cache = sessionCache();
	if (!cache) return null;
	try {
		const hit = await cache.match(await sessionCacheKey(classifier, sessionId));
		return hit ? await hit.json() as Array<RequestLabel & { confidence: number | null }> : null;
	} catch {
		return null;
	}
}

async function writeSessionLabels(classifier: ClassifierRow, sessionId: string, labels: Array<RequestLabel & { confidence: number | null }>) {
	const cache = sessionCache();
	if (!cache) return;
	try {
		await cache.put(await sessionCacheKey(classifier, sessionId), new Response(JSON.stringify(labels), {
			headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${SESSION_CACHE_TTL_SECONDS}` },
		}));
	} catch {
		// Losing the cache only costs another classification.
	}
}

// ---- Orchestration ------------------------------------------------------------

/**
 * Caller labels always win. When two classifiers answer the same key, the one
 * created first (outcomes are in creation order) owns it. A multi-value
 * dimension adds one label per value under the same key.
 */
export function mergeClassifierLabels(existing: RequestLabel[], outcomes: ClassificationOutcome[]): RequestLabel[] {
	const callerKeys = new Set(existing.map((label) => label.key));
	const owners = new Map<string, string>();
	const added: RequestLabel[] = [];
	for (const outcome of outcomes) {
		for (const label of outcome.labels) {
			if (callerKeys.has(label.key)) continue;
			const owner = owners.get(label.key);
			if (owner && owner !== outcome.classifier_id) continue;
			owners.set(label.key, outcome.classifier_id);
			if (!added.some((entry) => entry.key === label.key && entry.value === label.value)) {
				added.push({ key: label.key, value: label.value });
			}
		}
	}
	return [...existing, ...added];
}

async function recordSpend(workspaceId: string, classifierId: string, costNanos: number) {
	const { error } = await getSupabaseAdmin().rpc("record_request_classifier_spend", {
		p_workspace_id: workspaceId,
		p_classifier_id: classifierId,
		p_cost_nanos: Math.max(0, Math.round(costNanos)),
	});
	if (error) console.warn("request_classifier_spend_record_failed", { workspaceId, classifierId, error: error.message });
}

async function classifyOne(
	ctx: PipelineContext,
	call: ClassifierCall,
	classifier: ClassifierRow,
	dimensions: ClassifierDimension[],
	transcript: () => string,
	spend: () => Promise<Map<string, number>>,
): Promise<ClassificationOutcome | null> {
	const sessionId = ctx.meta.sessionId?.trim() || null;
	const seed = classifier.sample_by === "session" && sessionId ? `session:${sessionId}` : `request:${ctx.requestId}`;
	if (await sampleBucket(`${classifier.id}:${seed}`) >= classifier.sample_rate_bps) return null;
	const base = { classifier_id: classifier.id, model: classifier.model };

	if (classifier.sample_by === "session" && sessionId) {
		const cached = await readSessionLabels(classifier, sessionId);
		if (cached) {
			const keys = new Set(dimensions.map((dimension) => dimension.key));
			return { ...base, status: "session_cache", labels: cached.filter((label) => keys.has(label.key)) };
		}
	}
	if (classifier.monthly_budget_nanos != null) {
		const spent = (await spend()).get(classifier.id) ?? 0;
		if (spent >= Number(classifier.monthly_budget_nanos)) return { ...base, status: "budget_reached", labels: [] };
	}

	try {
		const response = await call(buildClassifierRequestBody(classifier, dimensions, transcript()), classifier.id);
		const payload = await response.json().catch(() => null) as Record<string, any> | null;
		const costNanos = Number(payload?.cost_nanos ?? 0) || 0;
		if (response.ok) await recordSpend(ctx.workspaceId, classifier.id, costNanos);
		const labels = response.ok ? parseClassifierAnswer(payload, dimensions) : null;
		if (!labels) {
			console.warn("request_classifier_failed", { requestId: ctx.requestId, classifierId: classifier.id, status: response.status });
			return { ...base, status: "failed", labels: [], response_id: payload?.id ?? null, cost_nanos: response.ok ? costNanos : null };
		}
		if (classifier.sample_by === "session" && sessionId) await writeSessionLabels(classifier, sessionId, labels);
		return { ...base, status: "classified", labels, response_id: typeof payload?.id === "string" ? payload.id : null, cost_nanos: costNanos };
	} catch (error) {
		console.warn("request_classifier_failed", { requestId: ctx.requestId, classifierId: classifier.id, error: error instanceof Error ? error.message : String(error) });
		return { ...base, status: "failed", labels: [] };
	}
}

/**
 * Classifies a finished request and adds the answers to ctx.meta.labels, with
 * the outcome per classifier in ctx.requestClassifications. Never throws; a
 * slow or failing classifier just leaves its dimensions unlabelled.
 */
export async function applyRequestClassifiers(ctx: PipelineContext, gatewayResponse: unknown): Promise<void> {
	const call = ctx.requestClassifierCall;
	if (!call || ctx.classifierSubrequest || ctx.testingMode || !CLASSIFIABLE_ENDPOINTS.has(ctx.endpoint) || isStealthRequest(ctx)) return;
	if (getBindingsIfConfigured()?.REQUEST_CLASSIFIERS_ENABLED === "false") return;
	try {
		const classifiers = await loadClassifiers(ctx.workspaceId);
		if (!classifiers.length) return;
		const existing = ctx.meta.labels ?? [];
		const transcriptCache: { prompt?: string; full?: string } = {};
		let spendPromise: Promise<Map<string, number>> | null = null;
		const spend = () => (spendPromise ??= monthSpend(ctx.workspaceId).catch(() => new Map()));
		const work = classifiers.map((classifier) => {
			const dimensions = pendingDimensions(classifier, existing);
			if (!dimensions.length || !inScope(classifier, ctx)) return Promise.resolve(null);
			const withResponse = classifier.input_scope === "prompt_and_response";
			const transcript = () => withResponse
				? (transcriptCache.full ??= buildTranscript(ctx.rawBody ?? ctx.body, gatewayResponse ?? null))
				: (transcriptCache.prompt ??= buildTranscript(ctx.rawBody ?? ctx.body, null));
			return classifyOne(ctx, call, classifier, dimensions, transcript, spend);
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), CLASSIFICATION_TIMEOUT_MS); });
		const settled = await Promise.race([Promise.all(work), timeout]);
		clearTimeout(timer);
		if (settled === "timeout") {
			console.warn("request_classifier_timeout", { requestId: ctx.requestId, workspaceId: ctx.workspaceId });
			return;
		}
		const outcomes = settled.filter((outcome): outcome is ClassificationOutcome => Boolean(outcome));
		if (!outcomes.length) return;
		ctx.meta.labels = mergeClassifierLabels(existing, outcomes);
		ctx.requestClassifications = outcomes;
	} catch (error) {
		console.warn("request_classifiers_unavailable", { requestId: ctx.requestId, error: error instanceof Error ? error.message : String(error) });
	}
}
