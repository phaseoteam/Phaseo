// Runs a workspace's request classifiers after a text request finishes and
// before its audit row is written, so the answers are stored as ordinary
// request labels in the first write (no later UPDATE, no analytics rebuild).
// This only ever runs in background work: both stream and non-stream success
// audits are dispatched after the response has been sent.
//
// Each classification is a normal gateway request made in-process with the
// caller's own credentials (Responses, or Decisions for decision models), so it is routed, billed, logged and privacy-checked
// (ZDR, BYOK) exactly like the workspace's other traffic. It is labelled
// phaseo.classifier=<id> so its spend can be filtered, is never classified
// itself, and does not count against the caller's rate limit policies.

import { isRequestClassifiersAccessEnabled } from "@core/feature-flags";
import { tieredRead } from "@core/tiered-cache";
import type { Endpoint, RequestLabel } from "@core/types";
import {
	CLASSIFIER_COLUMNS,
	CLASSIFIER_TEST_LABEL_KEY,
	buildClassifierRequest,
	classifierRequestFormat,
	loadClassifierModelCapabilities,
	parseClassifierAnswer,
	responseText,
	textOf,
	type ClassifierDimension,
	type ClassifierRequestFormat,
	type ClassifierRow,
} from "@core/request-classifiers";

// The request builders live with the shared classifier rules so the settings
// page can test a draft with exactly the request the gateway sends.
export { buildClassifierDecisionsBody, buildClassifierPrompt, buildClassifierRequest, buildClassifierRequestBody, buildClassifierSchema, classifierOutputTokens, classifierRequestFormat, parseClassifierAnswer, responseText } from "@core/request-classifiers";
import { dispatchBackground, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { RESERVED_CLASSIFIER_LABEL_KEY } from "../before/request-labels";
import type { PipelineContext } from "../before/types";
import { isStealthRequest } from "../stealth";
import { sanitizeDataContributionPayload } from "./data-contribution";
import { requestDataLimits, withRequestDataLimits } from "../requestRouting";

export const CLASSIFIER_LABEL_KEY = RESERVED_CLASSIFIER_LABEL_KEY;
const CLASSIFIABLE_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses", "messages"]);
const CONFIG_CACHE_FRESH_MS = 60_000;
const SPEND_CACHE_FRESH_MS = 60_000;
const MODEL_FORMAT_CACHE_FRESH_MS = 10 * 60_000;
/**
 * Many routes do not document their params, so a schema request can still be
 * refused, by the gateway or the provider. The request is our own, so a 400 or
 * 422 almost always means the schema: it is retried once as prompted JSON.
 */
const SCHEMA_REFUSED_STATUSES = new Set([400, 422]);
const SESSION_CACHE_TTL_SECONDS = 3_600;
/** Classification must leave the rest of the background audit plenty of time. */
const CLASSIFICATION_TIMEOUT_MS = 12_000;
const MAX_TURN_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 48_000;
const SPEND_RECORD_ATTEMPTS = 3;

export type ClassifierHandler = (request: Request) => Promise<Response>;
export type ClassifierHandlerFor = (path: "responses" | "decisions") => ClassifierHandler;
export type ClassifierCall = (request: { path: "responses" | "decisions"; body: Record<string, unknown> }, classifierId: string) => Promise<Response>;

export type ClassificationOutcome = {
	classifier_id: string;
	status: "classified" | "session_cache" | "failed" | "budget_reached";
	model: string;
	format?: ClassifierRequestFormat;
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
export function attachRequestClassifierCall(ctx: PipelineContext, req: Request, handler: ClassifierHandlerFor): void {
	if (classifierSubrequests.has(req)) {
		ctx.classifierSubrequest = true;
		return;
	}
	if (unclassifiedRequests.has(req)) return;
	const authorization = req.headers.get("authorization");
	if (!authorization) return;
	ctx.requestClassifierCall = ({ path, body }, classifierId) => {
		const request = new Request(`https://phaseo.local/v1/${path}`, {
			method: "POST",
			headers: {
				Authorization: authorization,
				"Content-Type": "application/json",
				"x-phaseo-metadata": JSON.stringify({ labels: [{ key: CLASSIFIER_LABEL_KEY, value: classifierId }] }),
			},
			// The classifier sees the request's content, so it goes only where the
			// request (or its preset) let that content go; if its model can't, the
			// call fails and the request stays unlabelled.
			body: JSON.stringify(withRequestDataLimits(body, ctx.contentDataLimits !== undefined ? ctx.contentDataLimits : requestDataLimits(ctx.body))),
		});
		classifierSubrequests.add(request);
		return handler(path)(request);
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

/** How to ask a classifier's model, from what its providers support. Falls back to a schema request, as before. */
async function modelRequestFormat(model: string): Promise<ClassifierRequestFormat> {
	try {
		return (await tieredRead<ClassifierRequestFormat>({
			key: `request-classifier-format:${model}`,
			loader: async () => classifierRequestFormat(await loadClassifierModelCapabilities(getSupabaseAdmin(), model)),
			l1FreshMs: MODEL_FORMAT_CACHE_FRESH_MS,
			l2: false,
			l3: false,
		})) ?? "json_schema";
	} catch {
		return "json_schema";
	}
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

/**
 * The call is already billed, so a lost write would let the classifier run past
 * its budget. Retries can double-count if a write committed but its reply was
 * lost; that only stops the classifier early, which is the safe direction.
 */
async function recordSpend(workspaceId: string, classifierId: string, costNanos: number) {
	let message = "";
	for (let attempt = 1; attempt <= SPEND_RECORD_ATTEMPTS; attempt++) {
		try {
			const { error } = await getSupabaseAdmin().rpc("record_request_classifier_spend", {
				p_workspace_id: workspaceId,
				p_classifier_id: classifierId,
				p_cost_nanos: Math.max(0, Math.round(costNanos)),
			});
			if (!error) return;
			message = error.message;
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		if (attempt < SPEND_RECORD_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
	}
	console.error("request_classifier_spend_record_failed", { workspaceId, classifierId, error: message });
}

/** Responses results carry an id; Decisions results a request_id. */
function responseId(payload: Record<string, any> | null): string | null {
	const id = payload?.id ?? payload?.request_id;
	return typeof id === "string" ? id : null;
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
	const base: Pick<ClassificationOutcome, "classifier_id" | "model" | "format"> = { classifier_id: classifier.id, model: classifier.model };

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
		let format = await modelRequestFormat(classifier.model);
		let response = await call(buildClassifierRequest(classifier, dimensions, transcript(), format), classifier.id);
		if (format === "json_schema" && SCHEMA_REFUSED_STATUSES.has(response.status)) {
			format = "json";
			response = await call(buildClassifierRequest(classifier, dimensions, transcript(), format), classifier.id);
		}
		base.format = format;
		const payload = await response.json().catch(() => null) as Record<string, any> | null;
		const costNanos = Number(payload?.cost_nanos ?? 0) || 0;
		if (response.ok) await recordSpend(ctx.workspaceId, classifier.id, costNanos);
		const labels = response.ok ? parseClassifierAnswer(payload, dimensions) : null;
		if (!labels) {
			console.warn("request_classifier_failed", { requestId: ctx.requestId, classifierId: classifier.id, status: response.status });
			return { ...base, status: "failed", labels: [], response_id: responseId(payload), cost_nanos: response.ok ? costNanos : null };
		}
		if (classifier.sample_by === "session" && sessionId) await writeSessionLabels(classifier, sessionId, labels);
		return { ...base, status: "classified", labels, response_id: responseId(payload), cost_nanos: costNanos };
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
	// A classifier test run from settings is itself a classification; do not classify it again.
	if ((ctx.meta.labels ?? []).some((label) => label.key === CLASSIFIER_TEST_LABEL_KEY)) return;
	try {
		const classifiers = await loadClassifiers(ctx.workspaceId);
		if (!classifiers.length) return;
		// Checked only once a workspace has classifiers, so other traffic never waits on Statsig.
		if (!(await isRequestClassifiersAccessEnabled({ workspaceId: ctx.workspaceId }))) return;
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
		const all = Promise.all(work);
		const settled = await Promise.race([all, timeout]);
		clearTimeout(timer);
		if (settled === "timeout") {
			// The log is written without these labels, but calls already sent are
			// billed: keep them alive so their own logging and spend still land.
			dispatchBackground(all);
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
