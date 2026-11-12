// Purpose: Run one end-to-end case through the real endpoint handler and record everything it did.
// Why: Failover, error mapping, billing and audit only show up when before, execute and after run together.
// How: Configure fresh bindings, install the upstream script, call makeEndpointHandler's handler inside a request
//      scope that collects background work, read the whole client response, then drain the captures.

import { makeEndpointHandler } from "@pipeline/index";
import * as schemas from "@core/schemas";
import { clearRuntime, configureRuntime, getBindingsIfConfigured, runWithRequestScope, setWaitUntil, type GatewayBindings } from "@/runtime/env";
import * as health from "@pipeline/execute/health";
import * as healthCoordinator from "@pipeline/execute/health-coordinator";
import * as sticky from "@pipeline/execute/sticky-routing";
import * as byokFee from "@pipeline/pricing/byok-fee";
import * as customerLimits from "@core/customer-rate-limits";
import * as providerLimits from "@core/provider-rate-limits";
import * as lastUsed from "@core/last-used-throttle";
import * as sharedVersion from "@core/shared-version-cache";
import * as tieredCache from "@core/tiered-cache";
import { redactHeaders } from "../src/fetch-capture";
import { simulatorBindings } from "../src/env";
import { harnessState, resetCaptures } from "./state";
import { installScript } from "./upstream";
import { parseSse, sseMarker } from "./sse";
import type { CaseDef, ObservedCall, Observation } from "./types";

const SCHEMA_BY_ENDPOINT: Record<string, string> = {
	"chat.completions": "ChatCompletionsSchema",
	responses: "ResponsesSchema",
	messages: "AnthropicMessagesSchema",
	embeddings: "EmbeddingsSchema",
	"images.generations": "ImagesGenerationSchema",
	"images.edits": "ImagesEditSchema",
	"audio.speech": "AudioSpeechSchema",
	"audio.transcription": "AudioTranscriptionSchema",
	"audio.translations": "AudioTranslationSchema",
	moderations: "ModerationsSchema",
	rerank: "RerankSchema",
	ocr: "OcrSchema",
	parse: "ParseSchema",
	"video.generation": "VideoGenerationSchema",
	"music.generate": "MusicGenerateSchema",
};

const handlers = new Map<string, (req: Request) => Promise<Response>>();

function handlerFor(endpoint: string) {
	let handler = handlers.get(endpoint);
	if (handler) return handler;
	const schemaName = SCHEMA_BY_ENDPOINT[endpoint];
	const schema = (schemas as Record<string, unknown>)[schemaName];
	if (!schema) throw new Error(`e2e harness: @core/schemas no longer exports ${schemaName} for ${endpoint}`);
	handler = makeEndpointHandler({ endpoint: endpoint as any, schema });
	handlers.set(endpoint, handler);
	return handler;
}

/** Module-level caches that would otherwise leak breaker, sticky and quota state from one case into the next. */
const RESETS: Array<[string, Record<string, unknown>, string]> = [
	["@pipeline/execute/health", health, "resetHealthStateForTests"],
	["@pipeline/execute/health-coordinator", healthCoordinator, "resetCoordinatedHealthForTests"],
	["@pipeline/execute/sticky-routing", sticky, "resetStickyRoutingStateForTests"],
	["@pipeline/pricing/byok-fee", byokFee, "__resetByokAllowanceCacheForTests"],
	["@core/customer-rate-limits", customerLimits, "__resetCustomerQuotaStateForTests"],
	["@core/provider-rate-limits", providerLimits, "clearProviderRateLimitConfigCacheForTests"],
	["@core/last-used-throttle", lastUsed, "__resetLastUsedThrottleForTests"],
	["@core/shared-version-cache", sharedVersion, "__resetSharedVersionCacheForTests"],
	["@core/tiered-cache", tieredCache, "__resetTieredCacheForTests"],
];

export const missingResets: string[] = [];

function resetGatewayState() {
	for (const [name, mod, fn] of RESETS) {
		const reset = mod[fn];
		if (typeof reset === "function") (reset as () => void)();
		else if (!missingResets.includes(`${name}.${fn}`)) missingResets.push(`${name}.${fn}`);
	}
}

let kvGeneration = 0;

/**
 * A fresh in-memory KV per case. Provider health (breaker counters such as consecutive_failures) lives in
 * KV, and without a clean store a run of deliberately failing cases opens DeepInfra's breaker for every later
 * case. Writes made by work left over from an earlier case are refused and counted.
 */
function caseKv(generation: number, stale: string[]): KVNamespace {
	const store = new Map<string, string>();
	return {
		async get(key: string, type?: unknown) {
			const value = store.get(key);
			if (value === undefined) return null;
			const kind = typeof type === "string" ? type : (type as { type?: string } | undefined)?.type;
			return kind === "json" ? JSON.parse(value) : value;
		},
		async put(key: string, value: string) {
			if (generation !== kvGeneration) {
				stale.push(key);
				return;
			}
			store.set(key, typeof value === "string" ? value : String(value));
		},
		async delete(key: string) {
			store.delete(key);
		},
		async list() {
			return { keys: [], list_complete: true, cacheStatus: null };
		},
	} as unknown as KVNamespace;
}

export const staleKvWrites: string[] = [];

function configureBindings(overrides: Record<string, string> | undefined) {
	while (getBindingsIfConfigured()) clearRuntime();
	kvGeneration += 1;
	configureRuntime({
		...(simulatorBindings() as unknown as Record<string, unknown>),
		GATEWAY_CACHE: caseKv(kvGeneration, staleKvWrites),
		...(overrides ?? {}),
	} as unknown as GatewayBindings);
}

export const CLIENT_KEY = "sim-phaseo-client-key-e2e";

function buildRequest(def: CaseDef): Request {
	const url = `https://api.phaseo.app${def.path}`;
	const headers: Record<string, string> = { authorization: `Bearer ${CLIENT_KEY}`, "user-agent": "phaseo-provider-simulator-e2e" };
	if (typeof def.body === "function") {
		return new Request(url, { method: "POST", headers, body: def.body() });
	}
	headers["content-type"] = "application/json";
	return new Request(url, { method: "POST", headers, body: JSON.stringify(def.body) });
}

const KNOWN_AUTH_HEADERS = ["authorization", "x-api-key", "api-key", "x-goog-api-key", "x-key"];

function authLabel(headers: Record<string, string>, byokKeys: Map<string, string>): string {
	for (const name of KNOWN_AUTH_HEADERS) {
		const value = headers[name];
		if (!value) continue;
		const token = value.replace(/^Bearer\s+/i, "").trim();
		const byok = byokKeys.get(token);
		if (byok) return `byok:${byok}`;
		if (token === "sim-access-token") return "oauth";
		if (token.startsWith("sim-")) return "managed";
		return "other";
	}
	return "none";
}

function trimBody(body: unknown, text: string | null): unknown {
	if (body !== null && body !== undefined) {
		const serialised = JSON.stringify(body);
		return serialised.length > 6_000 ? { __truncated: true, preview: serialised.slice(0, 6_000) } : body;
	}
	if (!text) return null;
	return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
}

async function readClient(response: Response) {
	const contentType = response.headers.get("content-type") ?? "";
	const headers = Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
	const buffer = new Uint8Array(await response.arrayBuffer());
	const text = /json|event-stream|text\//i.test(contentType) ? new TextDecoder().decode(buffer) : null;
	let body: unknown = null;
	let sse: Observation["client"]["sse"] = null;
	if (contentType.includes("text/event-stream") && text !== null) {
		sse = parseSse(text);
	} else if (text !== null) {
		try {
			body = JSON.parse(text);
		} catch {
			body = text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
		}
	}
	return { status: response.status, headers, contentType, body, sse, sseTypes: sse ? sse.map(sseMarker) : null, bytes: buffer.length };
}

async function drain(pending: Promise<unknown>[], deadlineMs: number) {
	const deadline = Date.now() + deadlineMs;
	while (pending.length) {
		const batch = pending.splice(0);
		const remaining = deadline - Date.now();
		if (remaining <= 0) return false;
		await Promise.race([Promise.allSettled(batch), new Promise((resolve) => setTimeout(resolve, remaining))]);
	}
	// Give stream finalisers that schedule work on the next tick a chance to register it.
	await new Promise((resolve) => setTimeout(resolve, 20));
	if (pending.length) return drain(pending, Math.max(0, deadline - Date.now()));
	return true;
}

export async function runCase(def: CaseDef): Promise<Observation> {
	const started = Date.now();
	const captures = resetCaptures();
	harnessState.current = {
		caseId: def.id,
		workspaceId: "ws_sim_e2e_0001",
		apiKeyId: "key_sim_e2e_0001",
		routesByModel: def.routesByModel,
		capability: def.capability,
		teamSettings: def.teamSettings ?? {},
		preset: def.preset ?? null,
		presetModel: def.presetModel ?? null,
		dynamicRoute: def.dynamicRoute ?? null,
		byokMonthlyCount: def.byokMonthlyCount ?? 1,
	};
	configureBindings(def.bindings);
	resetGatewayState();
	installScript(def.upstream);

	const byokKeys = new Map<string, string>();
	for (const routes of Object.values(def.routesByModel)) for (const route of routes) for (const key of route.byok ?? []) byokKeys.set(key.key, key.id);

	const pending: Promise<unknown>[] = [];
	const collect = (promise: Promise<unknown>) => { pending.push(promise.catch(() => undefined)); };
	const disposeWaitUntil = setWaitUntil(collect);
	let client: Awaited<ReturnType<typeof readClient>> | null = null;
	let error: string | null = null;
	try {
		const handler = handlerFor(def.endpoint);
		const request = buildRequest(def);
		const run = runWithRequestScope(collect, async () => {
			const response = await handler(request);
			return await readClient(response);
		});
		client = await Promise.race([
			run,
			new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("case timed out after 30 s")), 30_000)),
		]);
		const drained = await drain(pending, 15_000);
		if (!drained) captures.harnessNotes.push("background work did not settle within 15 s");
	} catch (caught) {
		error = caught instanceof Error ? `${caught.message}\n${(caught.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(caught);
	} finally {
		disposeWaitUntil();
		harnessState.current = null;
	}

	const providerCalls = captures.calls.filter((call) => call.classification === "provider");
	const calls: ObservedCall[] = providerCalls.map((call) => ({
		provider: call.provider,
		url: call.url.replace(/[?].*$/, ""),
		method: call.method,
		headers: redactHeaders(call.headers),
		auth: authLabel(call.headers, byokKeys),
		body: trimBody(call.bodyJson, call.bodyText),
		outcome: call.outcome,
	}));
	const success = captures.audits.filter((audit) => audit.kind === "success");
	const lastSuccess = success.at(-1) ?? null;
	const meters: Record<string, number> = {};
	for (const line of lastSuccess?.pricingLines ?? []) meters[line.meter] = (meters[line.meter] ?? 0) + line.quantity;
	const attempts = (captures.audits.at(-1)?.providerAttempts ?? []).map((attempt) => ({
		attempt_number: attempt.attempt_number,
		provider: attempt.provider,
		outcome: attempt.outcome,
		status: attempt.status ?? null,
		key_source: attempt.key_source ?? null,
		credential_phase: attempt.credential_phase ?? null,
		upstream_error_code: attempt.upstream_error_code ?? null,
	}));

	const routes = Object.values(def.routesByModel).flat().map((route) => `${route.providerId}:${route.apiModelId}`);
	return {
		caseId: def.id,
		group: def.group,
		family: def.family,
		surface: def.surface,
		mode: def.mode,
		model: typeof def.body === "function" ? Object.keys(def.routesByModel)[0] : String((def.body as any).model ?? Object.keys(def.routesByModel)[0]),
		routes,
		client: client ?? { status: 0, headers: {}, contentType: "", body: null, sse: null, sseTypes: null, bytes: 0 },
		upstream: { calls, providers: calls.map((call) => call.provider ?? "unknown"), count: calls.length },
		side: {
			supabase: captures.calls.filter((call) => call.outcome === "supabase").map((call) => `${call.method} ${new URL(call.url).pathname}`),
			blocked: captures.calls.filter((call) => call.classification === "blocked").map((call) => `${call.method} ${call.url.replace(/[?].*$/, "")}`),
			other: captures.calls.filter((call) => call.outcome === "side").map((call) => `${call.method} ${call.url.replace(/[?].*$/, "")}`),
		},
		billing: {
			charges: captures.charges.map((charge) => charge.costNanos),
			chargeCount: captures.charges.length,
			chargeNanos: captures.charges.reduce((sum, charge) => sum + charge.costNanos, 0),
			successAudits: success.length,
			failureAudits: captures.audits.length - success.length,
			servedProvider: lastSuccess?.provider ?? null,
			byok: lastSuccess?.byok ?? null,
			auditTotalNanos: lastSuccess?.totalNanos ?? null,
			meters,
			lines: (lastSuccess?.pricingLines ?? []).map((line) => ({ meter: line.meter, quantity: line.quantity, lineNanos: line.lineNanos })),
			byokBilling: lastSuccess?.byokBilling ?? null,
			reservations: captures.reservations,
		},
		audits: captures.audits.map((audit) => ({ kind: audit.kind, provider: audit.provider, statusCode: audit.statusCode, errorCode: audit.errorCode, errorMessage: audit.errorMessage, stage: audit.stage })),
		attempts,
		harness: { error, notes: captures.harnessNotes, durationMs: Date.now() - started },
	};
}
