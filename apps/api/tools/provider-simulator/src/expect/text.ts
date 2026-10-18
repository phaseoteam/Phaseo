// Purpose: Expected outcomes for the text surfaces, and the diff against what the simulator observed.
// Why: The simulator must say what should happen, with a cited source, not only what does happen.
// How: Reads expectations/*.json (gateway semantics, parameter targets, provider facts) and the provider specs,
//      then compares one observed request or response against them and returns classified Mismatch records.

import fs from "node:fs";
import path from "node:path";
import type { PriceCard } from "@pipeline/pricing/types";
import type { ClientScenario, Surface } from "../client-requests";
import type { Dialect, ResponseVariant, UsageProfile } from "../dialects";
import { USAGE, foldKey, isTraceableNumber, isTraceableString, leaves } from "../sentinels";
import { resolveSpec, requestSchema } from "../spec-registry";
import { enumValuesOf, topLevelProperties, typeOf, type Schema } from "../schema";
import type { ClientOutcome } from "../response-pipeline";
import type { FieldFate } from "../trace";
import { EXPECTATIONS_DIR } from "./allowlist";
import type { Mismatch, MismatchKind, Source } from "./types";

// ---------------------------------------------------------------------------
// Data.
// ---------------------------------------------------------------------------

type Target = {
	path?: string;
	paths?: string[];
	anywhere?: boolean;
	anywhereKey?: string;
	anywhereValue?: string;
	absent?: boolean;
	present?: boolean;
	hashed?: boolean;
	value?: unknown;
	/** Expected upstream value is this dotted path of the client value (e.g. "type" of a response_format). */
	valueFromClient?: string;
	/** Removing the parameter is fine when the client sent exactly this documented default. */
	defaultValue?: unknown;
	/** Restrict a path target to these providers; others expect the parameter removed. */
	onlyProviders?: string[];
};
type Concept = {
	source: Source;
	targets?: Partial<Record<Dialect, Target>>;
	valueMap?: Partial<Record<Dialect, Record<string, unknown>>>;
	gatewayOnly?: boolean;
	accepted?: boolean;
	note?: string;
};

function readJson(file: string) {
	return JSON.parse(fs.readFileSync(path.join(EXPECTATIONS_DIR, file), "utf8"));
}

let data: { params: { aliases: Record<string, string>; concepts: Record<string, Concept> }; gateway: any; sources: Record<string, Source> } | null = null;

export function expectationData() {
	if (data) return data;
	data = { params: readJson("params.json"), gateway: readJson("gateway.json"), sources: readJson("sources.json").sources };
	return data;
}

const providerFactsCache = new Map<string, any>();

export function providerFacts(provider: string): { operations: Record<string, { urlPattern: string; source: Source }>; auth: { headers: Record<string, string>; source: Source } | null } | null {
	if (providerFactsCache.has(provider)) return providerFactsCache.get(provider);
	const file = path.join(EXPECTATIONS_DIR, "providers", `${provider}.json`);
	let facts = null;
	if (fs.existsSync(file)) {
		const json = JSON.parse(fs.readFileSync(file, "utf8"));
		facts = {
			operations: { ...(json.generated?.operations ?? {}), ...(json.overrides?.operations ?? {}) },
			auth: json.overrides?.auth ?? json.generated?.auth ?? null,
		};
	}
	providerFactsCache.set(provider, facts);
	return facts;
}

/** Resolves `{kind: "ref"}` sources so reports show the real citation. */
export function resolveSource(source: Source): Source {
	if (source.kind !== "ref") return source;
	return expectationData().sources[source.ref] ?? { kind: "assumed", reason: `unknown source ref ${source.ref}` };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

export function getPath(obj: any, dotted: string): unknown {
	let node = obj;
	for (const part of dotted.split(".")) {
		if (node === null || node === undefined) return undefined;
		node = Array.isArray(node) && /^\d+$/.test(part) ? node[Number(part)] : node[part];
	}
	return node;
}

function hasPath(obj: any, dotted: string): boolean {
	return getPath(obj, dotted) !== undefined;
}

function valuePaths(body: any, value: unknown): string[] {
	const key = JSON.stringify(value);
	return leaves(body).filter((leaf) => JSON.stringify(leaf.value) === key).map((leaf) => leaf.path);
}

function keyAnywhere(body: any, key: string): boolean {
	return leaves(body).some((leaf) => new RegExp(`\\.${key}(\\.|\\[|$)`).test(leaf.path));
}

function jsonType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

type Ctx = Pick<Mismatch, "layer" | "provider" | "family" | "model" | "surface" | "mode" | "caseId">;

function mm(ctx: Ctx, kind: MismatchKind, pathName: string, expected: unknown, actual: unknown, source: Source, extra: Partial<Mismatch> = {}): Mismatch {
	return { ...ctx, kind, path: pathName, expected, actual, source: resolveSource(source), ...extra };
}

// ---------------------------------------------------------------------------
// Spec support for a target path.
// ---------------------------------------------------------------------------

type Support = { supported: boolean; source: Source; enumValues: unknown[] | null };

function schemaAtPath(provider: string, dialect: Dialect, dotted: string): { found: boolean | "unknown"; schema?: Schema; specKind: string; specId: string; specPath: string } | null {
	const spec = resolveSpec(provider, dialect);
	if (!spec) return null;
	let schema: Schema | undefined = requestSchema(spec, dialect);
	const specPath: string[] = [];
	for (const part of dotted.split(".")) {
		if (!schema) return { found: false, specKind: spec.entry.kind, specId: spec.file.id, specPath: specPath.join(".") };
		const resolved = spec.doc.resolve(schema) ?? {};
		if (/^\d+$/.test(part)) {
			schema = resolved.items ?? topLevelProperties(spec.doc, resolved).items;
			specPath.push("items");
			continue;
		}
		const props = topLevelProperties(spec.doc, resolved);
		if (!Object.keys(props).length) return { found: "unknown", schema: resolved, specKind: spec.entry.kind, specId: spec.file.id, specPath: specPath.join(".") };
		schema = props[part];
		specPath.push(`properties.${part}`);
		if (!schema) return { found: false, specKind: spec.entry.kind, specId: spec.file.id, specPath: specPath.join(".") };
	}
	return { found: true, schema, specKind: spec.entry.kind, specId: spec.file.id, specPath: specPath.join(".") };
}

function targetSupport(provider: string, dialect: Dialect, dotted: string): Support {
	const found = schemaAtPath(provider, dialect, dotted);
	if (!found) return { supported: true, source: { kind: "assumed", reason: `no spec for ${provider} ${dialect}; parameter assumed accepted` }, enumValues: null };
	const source: Source = found.specKind === "baseline"
		? { kind: "assumed", reason: `no ${provider} spec; OpenAI schema (${found.specId}) used as a stand-in at ${found.specPath || "$"}` }
		: { kind: "spec", spec: `specs/${found.specId}.json`, path: found.specPath || "$" };
	if (found.found === false) return { supported: false, source, enumValues: null };
	const enums = found.found === true && found.schema ? enumValuesOf(resolveSpecDoc(provider, dialect), found.schema) : null;
	return { supported: true, source, enumValues: enums && enums.length ? enums : null };
}

function resolveSpecDoc(provider: string, dialect: Dialect) {
	return resolveSpec(provider, dialect)!.doc;
}

// ---------------------------------------------------------------------------
// Request checks.
// ---------------------------------------------------------------------------

export type RequestCheckInput = {
	ctx: Ctx;
	provider: string;
	dialect: Dialect;
	scenario: ClientScenario;
	outcome: string;
	clientBody: any;
	upstream?: { url: string; method: string; headers: Record<string, string>; body: any; bodyText: string };
	baseBody?: any;
	fates?: FieldFate[];
	/** True when the scenario's parameter is documented in Phaseo's public spec. */
	documented?: boolean;
};

function conceptFor(scenario: ClientScenario): { name: string; concept: Concept } | null {
	if (!scenario.param) return null;
	const { aliases, concepts } = expectationData().params;
	const name = aliases[`${scenario.surface}.${scenario.param}`] ?? scenario.param;
	const concept = concepts[name];
	return concept ? { name, concept } : null;
}

export function checkUpstreamRequest(input: RequestCheckInput): Mismatch[] {
	const out: Mismatch[] = [];
	const { ctx, upstream, provider, dialect } = input;
	if (!upstream) return out;
	const facts = providerFacts(provider);
	// URL and documented operation.
	if (facts && Object.keys(facts.operations).length) {
		const op = facts.operations[dialect];
		if (!op) {
			const documented = Object.keys(facts.operations);
			out.push(mm(ctx, "wrong_value", "upstream.dialect", documented, dialect, facts.operations[documented[0]].source, { note: `${provider} documents ${documented.join(", ")}; the gateway used ${dialect}` }));
		} else if (!new RegExp(op.urlPattern).test(upstream.url)) {
			out.push(mm(ctx, "wrong_value", "upstream.url", op.urlPattern, upstream.url, op.source));
		}
	}
	if (upstream.method !== "POST") out.push(mm(ctx, "wrong_value", "upstream.method", "POST", upstream.method, { kind: "assumed", reason: "Every text generation operation is a POST." }));
	// Authentication headers.
	if (facts?.auth) {
		for (const [name, re] of Object.entries(facts.auth.headers)) {
			const actual = upstream.headers[name.toLowerCase()];
			if (actual === undefined) {
				const elsewhere = Object.keys(upstream.headers).find((key) => /authorization|api-key|x-goog-api-key/i.test(key));
				out.push(mm(ctx, elsewhere ? "renamed" : "dropped", `upstream.header.${name}`, re, elsewhere ? `header ${elsewhere}` : undefined, facts.auth.source));
			} else if (!new RegExp(re).test(actual.replace(/sim-[a-z0-9-]+/, "sim-key"))) {
				out.push(mm(ctx, "wrong_value", `upstream.header.${name}`, re, actual.startsWith("Bearer") ? "Bearer <key>" : actual.slice(0, 40), facts.auth.source));
			}
		}
	}
	return out;
}

/** Base request: every top-level upstream key must be structural, asked for by the client, or an allowed default. */
export function checkBaseBody(input: RequestCheckInput): Mismatch[] {
	const { ctx, upstream, dialect, provider } = input;
	if (!upstream?.body || typeof upstream.body !== "object") return [];
	const gateway = expectationData().gateway.baseBody;
	const allowed = new Set<string>(gateway[dialect]?.always ?? []);
	for (const key of gateway[dialect]?.ifSpecDefines ?? []) if (targetSupport(provider, dialect, key).supported) allowed.add(key);
	const clientKeys = new Set(Object.keys(input.clientBody ?? {}).map(foldKey));
	const { aliases, concepts } = expectationData().params;
	for (const key of Object.keys(input.clientBody ?? {})) {
		const concept = concepts[aliases[`${input.scenario.surface}.${key}`] ?? key];
		const target = concept?.targets?.[dialect];
		for (const targetPath of [target?.path, ...(target?.paths ?? [])]) if (targetPath) clientKeys.add(foldKey(targetPath.split(".")[0]));
	}
	const out: Mismatch[] = [];
	for (const [key, value] of Object.entries(upstream.body)) {
		if (allowed.has(key) || clientKeys.has(foldKey(key))) continue;
		const support = targetSupport(provider, dialect, key);
		out.push(mm(ctx, "invented", `upstream.body.$.${key}`, undefined, value, gateway.source, {
			note: support.supported ? "client did not ask for it" : "client did not ask for it, and the provider spec does not define it",
		}));
	}
	// Model: must be the route's provider model id.
	return out;
}

/** Parameter scenario: the parameter must land at its documented target with the expected value, or be absent. */
export function checkParam(input: RequestCheckInput): Mismatch[] {
	const { ctx, upstream, dialect, provider, scenario } = input;
	const found = conceptFor(scenario);
	const out: Mismatch[] = [];
	const clientValue = scenario.param ? input.clientBody?.[scenario.param] : undefined;
	if (scenario.documentedUnsupported) {
		// Our spec says the gateway rejects it with 400; reaching a provider is the defect.
		const source: Source = { kind: "spec", spec: "apps/docs/openapi/v1/openapi.yaml", path: `${scenario.surface} request property ${scenario.param}: "Not supported"` };
		if (!input.outcome.startsWith("rejected")) out.push(mm(ctx, "error_mapping", "client.status", 400, input.outcome, source, { note: `${scenario.param} is documented as not supported` }));
		return out;
	}
	if (input.outcome.startsWith("rejected")) {
		if (input.documented || found?.concept.accepted) {
			out.push(mm(ctx, "error_mapping", "client.status", 200, 400, found?.concept.source ?? { kind: "ref", ref: "phaseo-openapi-chat" }, { note: `documented parameter ${scenario.param} rejected before routing` }));
		}
		return out;
	}
	if (!found || !upstream?.body) return out;
	const { concept } = found;
	const body = upstream.body;
	const sentinelValues = leaves(clientValue).map((leaf) => leaf.value).filter((value) => isTraceableString(value) || isTraceableNumber(value));
	if (concept.gatewayOnly) {
		const key = scenario.param!;
		if (key in body && !(input.baseBody && JSON.stringify(input.baseBody[key]) === JSON.stringify(body[key]))) out.push(mm(ctx, "invented", `upstream.body.$.${key}`, undefined, body[key], concept.source, { note: "gateway-only parameter forwarded upstream" }));
		return out;
	}
	const target = concept.targets?.[dialect];
	if (!target) return out;
	if (target.absent) {
		const leaked = sentinelValues.flatMap((value) => valuePaths(body, value));
		const keyLeaked = scenario.param && scenario.param in body && !(input.baseBody && scenario.param in input.baseBody);
		if (leaked.length || keyLeaked) out.push(mm(ctx, "invented", `upstream.body.${leaked[0] ?? `$.${scenario.param}`}`, undefined, leaked.length ? getPath(body, leaked[0].replace(/^\$\./, "")) : body[scenario.param!], concept.source, { note: `${dialect} has no place for ${found.name}; it should be removed` }));
		return out;
	}
	if (target.anywhereKey) {
		if (!keyAnywhere(body, target.anywhereKey)) out.push(mm(ctx, "dropped", `upstream.body.**.${target.anywhereKey}`, "present", undefined, concept.source));
		return out;
	}
	if (target.anywhere) {
		const expected = target.value ?? clientValue;
		if (!valuePaths(body, expected).length) out.push(mm(ctx, "dropped", "upstream.body.**", expected, undefined, concept.source));
		return out;
	}
	const candidates = target.paths ?? (target.path ? [target.path] : []);
	if (!candidates.length) return out;
	// Provider support decides whether the parameter should be sent at all.
	const restricted = target.onlyProviders && !target.onlyProviders.includes(provider);
	const supports = candidates.map((candidate) => restricted
		? { supported: false, source: concept.source, enumValues: null }
		: targetSupport(provider, dialect, candidate));
	const supportedIndex = supports.findIndex((support) => support.supported);
	const mapped = concept.valueMap?.[dialect];
	let expected: unknown = target.value !== undefined ? target.value : clientValue;
	const mapKey = clientValue && typeof clientValue === "object" && typeof (clientValue as any).type === "string" ? (clientValue as any).type : clientValue;
	if (mapped && typeof mapKey === "string" && mapKey in mapped) expected = mapped[mapKey];
	if (target.valueFromClient) expected = getPath(clientValue, target.valueFromClient);
	const present = candidates.find((candidate) => hasPath(body, candidate));
	if (supportedIndex < 0) {
		if (present) out.push(mm(ctx, "invented", `upstream.body.$.${present}`, undefined, getPath(body, present), supports[0].source, { note: `the provider spec does not define ${present}; ${found.name} should be removed` }));
		else {
			const leaked = sentinelValues.flatMap((value) => valuePaths(body, value));
			if (leaked.length) out.push(mm(ctx, "invented", `upstream.body.${leaked[0]}`, undefined, "client value", supports[0].source, { note: `the provider spec does not define ${candidates.join(" or ")}` }));
		}
		return out;
	}
	const support = supports[supportedIndex];
	const enumValues = support.enumValues;
	if (enumValues && !target.present && !target.hashed && typeof expected !== "object" && !enumValues.includes(expected)) {
		// A value outside the provider's enum must not be sent; translating it to a documented value is fine.
		if (present && !enumValues.includes(getPath(body, present))) out.push(mm(ctx, "wrong_value", `upstream.body.$.${present}`, `one of ${JSON.stringify(enumValues.slice(0, 8))} or removed`, getPath(body, present), support.source));
		return out;
	}
	if (!present && target.defaultValue !== undefined && JSON.stringify(clientValue) === JSON.stringify(target.defaultValue)) return out;
	if (!present) {
		const elsewhere = sentinelValues.flatMap((value) => valuePaths(body, value));
		if (elsewhere.length) out.push(mm(ctx, "renamed", `upstream.body.$.${candidates[0]}`, expected, `at ${elsewhere[0]}`, support.source));
		else out.push(mm(ctx, "dropped", `upstream.body.$.${candidates[0]}`, target.present ? "present" : target.hashed ? "hash of workspace and key" : expected, undefined, concept.source, { note: support.source.kind === "spec" ? `provider spec defines it (${(support.source as any).path})` : undefined }));
		return out;
	}
	const actual = getPath(body, present);
	if (target.present) return out;
	if (target.hashed) {
		if (actual === clientValue) out.push(mm(ctx, "wrong_value", `upstream.body.$.${present}`, "hash of workspace and key", actual, concept.source));
		return out;
	}
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		const kind: MismatchKind = jsonType(actual) !== jsonType(expected) ? "wrong_type" : "wrong_value";
		out.push(mm(ctx, kind, `upstream.body.$.${present}`, expected, actual, concept.source));
	}
	return out;
}

/** Content, tool and agent scenarios: every sentinel the client sent must arrive, unless a drop rule expects otherwise. */
const EXPECTED_DROPS: Array<{ dialects: Dialect[] | "*"; clientPath: RegExp; source: Source; reason: string; exceptProviders?: string[] }> = [
	{
		dialects: ["openai-chat", "openai-responses", "gemini", "gemini-interactions"],
		clientPath: /content\[\d+\]\.data$/,
		source: { kind: "ref", ref: "anthropic-thinking" },
		reason: "redacted_thinking is Claude state and is sent only to Claude",
	},
	{
		dialects: "*",
		clientPath: /file_id$/,
		exceptProviders: ["openai", "openai-eu", "azure"],
		source: { kind: "assumed", reason: "An OpenAI file id refers to OpenAI's file store; other providers cannot resolve it." },
		reason: "OpenAI file ids only reach OpenAI",
	},
	{
		dialects: "*",
		clientPath: /prompt_cache_key$/,
		source: { kind: "ref", ref: "phaseo-caching-forwarding" },
		reason: "sent as a hash, checked by the parameter scenario",
	},
	{
		dialects: "*",
		clientPath: /(reasoning_details\[\d+\]\.data|encrypted_content|\.signature|redacted_thinking.*\.data|\.thinking$|summary\[\d+\]\.text|reasoning_content)$/,
		source: { kind: "gateway-docs", page: "apps/docs/v1/api-reference/endpoint/chat-completions.mdx", note: "Reasoning state is opaque, records the provider and model, and is sent only to that family; unsealed or foreign state is dropped." },
		reason: "client-made reasoning state is not sealed by Phaseo, so it is dropped rather than replayed",
	},
	{
		dialects: ["gemini", "gemini-interactions"],
		clientPath: /(tool_calls\[\d+\]\.id|tool_call_id|tool_use_id|\.call_id|input\[\d+\]\.id|content\[\d+\]\.id)$/,
		source: { kind: "ref", ref: "gemini-function-calling" },
		reason: "Gemini pairs calls and responses by name and order; foreign call ids have no place",
	},
	{
		dialects: "*",
		clientPath: /input\[\d+\]\.id$|\]\.id$/,
		source: { kind: "assumed", reason: "Item ids of previous Responses output items identify stored items; with store=false upstream they are not needed." },
		reason: "item ids are not replayed",
	},
];

export function checkContentFates(input: RequestCheckInput): Mismatch[] {
	const { ctx, dialect, fates = [] } = input;
	const out: Mismatch[] = [];
	const seen = new Set<string>();
	for (const fate of fates) {
		const signature = `${fate.fate}|${fate.clientPath.replace(/[d+]/g, "[]")}`;
		if (seen.has(signature)) continue;
		seen.add(signature);
		if (fate.fate === "forwarded" || fate.fate === "renamed") continue;
		// Top-level parameters are judged by the parameter scenarios.
		if (!/^\$\.(messages|input|system|instructions|tools)\b/.test(fate.clientPath)) continue;
		// Tool arguments travel as a JSON string in the OpenAI dialects, and tool results may be strings.
		if (fate.fate === "stringified" && fate.upstreamPaths.length && fate.upstreamPaths.every((p) => /\.arguments$/.test(p))) continue;
		const rule = EXPECTED_DROPS.find((entry) => (entry.dialects === "*" || entry.dialects.includes(dialect)) && entry.clientPath.test(fate.clientPath) && !(entry.exceptProviders ?? []).includes(input.provider));
		if (rule && fate.fate === "dropped") continue;
		const source: Source = { kind: "assumed", reason: "Every value the client sends in content, tools or history must reach the provider in that provider's own shape unless a documented rule removes it." };
		if (fate.fate === "dropped") out.push(mm(ctx, "dropped", `upstream.body(client ${fate.clientPath.replace(/\[\d+\]/g, "[]")})`, fate.value, undefined, source));
		else if (fate.fate === "stringified") out.push(mm(ctx, "wrong_type", `upstream.body(client ${fate.clientPath.replace(/\[\d+\]/g, "[]")})`, "structured value", "embedded in a JSON string", source));
		else if (fate.fate === "changed") out.push(mm(ctx, "wrong_value", `upstream.body(client ${fate.clientPath.replace(/\[\d+\]/g, "[]")})`, fate.value, fate.upstreamPaths.join(" | "), source));
	}
	return out;
}

// ---------------------------------------------------------------------------
// Response checks.
// ---------------------------------------------------------------------------

export type UsageExpectation = { totalInput: number; read?: number; write?: number; write5m?: number; write1h?: number; output: number; reasoning?: number };

/** Upstream usage semantics, from the sentinel "max" usage the simulator sends. */
export function expectedUsage(dialect: Dialect, profile: UsageProfile): UsageExpectation {
	switch (dialect) {
		case "anthropic-messages":
			return {
				totalInput: USAGE.input + USAGE.cachedRead + USAGE.cacheWrite5m + USAGE.cacheWrite1h,
				read: USAGE.cachedRead,
				write: USAGE.cacheWrite5m + USAGE.cacheWrite1h,
				write5m: USAGE.cacheWrite5m,
				write1h: USAGE.cacheWrite1h,
				output: USAGE.output,
			};
		case "gemini":
		case "gemini-interactions":
			return { totalInput: USAGE.input + USAGE.toolUsePrompt, read: USAGE.cachedRead, output: USAGE.output, reasoning: USAGE.reasoning };
		default: {
			const reportsRead = Boolean(profile.nestedCached || profile.topLevelCached || profile.deepseekCache);
			return {
				totalInput: USAGE.input,
				read: reportsRead ? USAGE.cachedRead : undefined,
				write: profile.cacheWrite ? USAGE.cacheWrite : undefined,
				output: USAGE.output,
				reasoning: profile.reasoning ? USAGE.reasoning : undefined,
			};
		}
	}
}

function clientUsage(outcome: ClientOutcome): any {
	if (outcome.mode === "buffered") return outcome.clientJson?.usage ?? null;
	if (outcome.surface === "messages") {
		const start = outcome.frames.find((frame) => frame?.type === "message_start")?.message?.usage ?? {};
		const deltas = outcome.frames.filter((frame) => frame?.type === "message_delta").map((frame) => frame.usage ?? {});
		return Object.assign({}, start, ...deltas);
	}
	if (outcome.surface === "responses") {
		const terminal = [...outcome.frames].reverse().find((frame) => /^response\.(completed|incomplete|failed)$/.test(frame?.type ?? ""));
		return terminal?.response?.usage ?? null;
	}
	return outcome.clientUsage;
}

export function checkClientUsage(ctx: Ctx, outcome: ClientOutcome, expected: UsageExpectation): Mismatch[] {
	const gateway = expectationData().gateway.usage;
	const fields = gateway[outcome.surface];
	const usage = clientUsage(outcome);
	const source: Source = gateway.source;
	const out: Mismatch[] = [];
	if (!usage) {
		out.push(mm(ctx, "dropped", "client.usage", "usage object", undefined, source));
		return out;
	}
	const totalCache = (expected.read ?? 0) + (expected.write ?? 0);
	const want: Array<[string, number | undefined]> = [
		[fields.input, fields.inputIncludesCache ? expected.totalInput : expected.totalInput - totalCache],
		[fields.cachedRead, expected.read],
		[fields.cacheWrite, expected.write],
		[fields.output, expected.output],
	];
	if (fields.reasoning) want.push([fields.reasoning, expected.reasoning]);
	if (fields.cacheWrite5m && expected.write5m !== undefined) want.push([fields.cacheWrite5m, expected.write5m], [fields.cacheWrite1h, expected.write1h]);
	for (const [field, value] of want) {
		if (value === undefined || value === 0) continue;
		const actual = getPath(usage, field);
		if (actual === undefined || actual === null) out.push(mm(ctx, "dropped", `client.usage.${field}`, value, actual, source));
		else if (typeof actual !== "number") out.push(mm(ctx, "wrong_type", `client.usage.${field}`, value, actual, source));
		else if (actual !== value) out.push(mm(ctx, "wrong_value", `client.usage.${field}`, value, actual, source, { delta: { tokens: actual - value } }));
	}
	return out;
}

// --- Billing --------------------------------------------------------------------

type Rate = { perToken: number; meter: string; fallback?: string };

function standardRule(card: PriceCard, meter: string) {
	const rules = card.rules.filter((rule) => rule.meter === meter && (rule.pricing_plan ?? "standard") === "standard");
	const plain = rules.filter((rule) => !Array.isArray(rule.match) || rule.match.length === 0);
	if (plain.length) return { rule: plain.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))[0], conditional: false };
	return rules.length ? { rule: undefined, conditional: true } : { rule: undefined, conditional: false };
}

function perToken(rule: any): number {
	return Number(rule.price_per_unit) / Number(rule.unit_size || 1);
}

export type BillingExpectation = {
	lines: Record<"uncachedInput" | "read" | "write5m" | "write1h" | "write" | "output" | "reasoning", { tokens: number; rate?: Rate }>;
	skipped?: string;
};

export function writeMultiplier(provider: string, ttl: "5m" | "1h" | "any", model: string): number {
	const table = expectationData().gateway.billing.fallbackWriteMultiplier;
	if (/claude|anthropic/.test(model)) return ttl === "1h" ? table["anthropic-1h"] : table["anthropic-5m"];
	if (/kimi-k3/.test(model)) return ttl === "1h" ? table["kimi-1h"] : table["kimi-5m"];
	return table[provider] ?? table.default;
}

export function expectedBilling(provider: string, model: string, card: PriceCard | null, usage: UsageExpectation, dialect: Dialect): BillingExpectation | null {
	if (!card) return null;
	const input = standardRule(card, "input_text_tokens");
	const output = standardRule(card, "output_text_tokens");
	if (!input.rule || !output.rule) return { lines: {} as any, skipped: input.conditional || output.conditional ? "conditional (tiered) input/output rules" : "no standard input/output rule" };
	const inputRate = perToken(input.rule);
	const rateFor = (meter: string, fallbackRate: number, fallbackNote: string): Rate => {
		const found = standardRule(card, meter);
		return found.rule ? { perToken: perToken(found.rule), meter } : { perToken: fallbackRate, meter, fallback: fallbackNote };
	};
	const write = usage.write ?? 0;
	const split = usage.write5m !== undefined;
	const lines: BillingExpectation["lines"] = {
		uncachedInput: { tokens: usage.totalInput - (usage.read ?? 0) - write, rate: { perToken: inputRate, meter: "input_text_tokens" } },
		read: { tokens: usage.read ?? 0, rate: rateFor("cached_read_text_tokens", inputRate, "input_rate") },
		write5m: { tokens: split ? usage.write5m! : 0, rate: rateFor("cached_write_text_tokens_5m", inputRate * writeMultiplier(provider, "5m", model), "input_rate x 5m multiplier") },
		write1h: { tokens: split ? usage.write1h! : 0, rate: rateFor("cached_write_text_tokens_1h", inputRate * writeMultiplier(provider, "1h", model), "input_rate x 1h multiplier") },
		write: { tokens: split ? 0 : write, rate: rateFor("cached_write_text_tokens", inputRate * writeMultiplier(provider, "any", model), "input_rate x multiplier") },
		output: { tokens: usage.output - (standardRule(card, "output_reasoning_tokens").rule ? usage.reasoning ?? 0 : 0), rate: { perToken: perToken(output.rule), meter: "output_text_tokens" } },
		reasoning: { tokens: standardRule(card, "output_reasoning_tokens").rule ? usage.reasoning ?? 0 : 0, rate: rateFor("output_reasoning_tokens", perToken(output.rule), "output_rate") },
	};
	// Split write rules fall back to the aggregate write rule before the input-rate fallback.
	if (split) {
		const aggregate = standardRule(card, "cached_write_text_tokens").rule;
		for (const key of ["write5m", "write1h"] as const) if (lines[key].rate?.fallback && aggregate) lines[key].rate = { perToken: perToken(aggregate), meter: "cached_write_text_tokens" };
	}
	void dialect;
	return { lines };
}

function actualBillingByCategory(lines: Array<{ meter: string; quantity: number; nanos: number }>) {
	const out: Record<string, { tokens: number; nanos: number }> = {};
	const add = (key: string, line: { quantity: number; nanos: number }) => {
		out[key] ??= { tokens: 0, nanos: 0 };
		out[key].tokens += line.quantity;
		out[key].nanos += line.nanos;
	};
	for (const line of lines) {
		const meter = line.meter;
		if (meter === "cached_write_text_tokens_5m") add("write5m", line);
		else if (meter === "cached_write_text_tokens_1h") add("write1h", line);
		else if (meter.startsWith("cached_write")) add("write", line);
		else if (meter.startsWith("cached_read") || meter === "implicit_cached_input_text_tokens") add("read", line);
		else if (meter === "output_reasoning_tokens") add("reasoning", line);
		else if (meter.startsWith("output")) add("output", line);
		else if (meter.startsWith("input")) add("uncachedInput", line);
	}
	return out;
}

export function checkBilling(ctx: Ctx, expected: BillingExpectation | null, actual: { ok: boolean; error?: string; lines?: Array<{ meter: string; quantity: number; nanos: number }> } | null | undefined, billedUsage: boolean): Mismatch[] {
	if (!expected || expected.skipped) return [];
	const source = expectationData().gateway.billing.source;
	const tolerance = expectationData().gateway.billing.toleranceNanos;
	const out: Mismatch[] = [];
	const lines = actual && actual.ok ? actual.lines ?? [] : [];
	const byCategory = actualBillingByCategory(lines);
	// Splits may legitimately be billed through the aggregate; compare writes as one total when split rules are absent.
	for (const [category, line] of Object.entries(expected.lines)) {
		const expectedNanos = Math.round(line.tokens * (line.rate?.perToken ?? 0) * 1e9);
		const got = byCategory[category] ?? { tokens: 0, nanos: 0 };
		const deltaTokens = got.tokens - line.tokens;
		const deltaNanos = got.nanos - expectedNanos;
		if (Math.abs(deltaNanos) <= tolerance && deltaTokens === 0) continue;
		if (line.tokens === 0 && got.tokens === 0) continue;
		const kind: MismatchKind = deltaNanos > tolerance || (deltaNanos === 0 && deltaTokens > 0) ? "billing_over" : "billing_under";
		const reason = !actual ? "no usage reached billing" : actual.ok ? undefined : `pricing threw ${actual.error}`;
		out.push(mm(ctx, kind, `billing.${category}`, { tokens: line.tokens, nanos: expectedNanos, meter: line.rate?.meter, fallback: line.rate?.fallback }, { tokens: got.tokens, nanos: got.nanos }, source, {
			delta: { nanos: deltaNanos, tokens: deltaTokens, meter: line.rate?.meter },
			note: reason ?? (billedUsage ? undefined : "no usage reached billing"),
		}));
	}
	return collapseMeterMoves(ctx, out, tolerance, source);
}

/** Categories that can carry the same tokens under different meters (a TTL split, or reasoning inside output). */
const RELATED_METERS = [["write", "write5m", "write1h"], ["output", "reasoning"]];

/** Tokens moved between related meters with the same total charge are a meter label, not a billing error. */
function collapseMeterMoves(ctx: Ctx, mismatches: Mismatch[], tolerance: number, source: Source): Mismatch[] {
	let out = mismatches;
	for (const group of RELATED_METERS) {
		const moved = out.filter((entry) => group.includes(entry.path.replace(/^billing\./, "")));
		if (moved.length < 2) continue;
		const tokens = moved.reduce((sum, entry) => sum + (entry.delta?.tokens ?? 0), 0);
		const nanos = moved.reduce((sum, entry) => sum + (entry.delta?.nanos ?? 0), 0);
		if (tokens !== 0 || Math.abs(nanos) > tolerance * moved.length) continue;
		out = out.filter((entry) => !moved.includes(entry));
		const meters = (pick: "expected" | "actual") => Object.fromEntries(moved.map((entry) => [entry.path.replace(/^billing\./, ""), (entry[pick] as any)?.tokens ?? 0]));
		out.push(mm(ctx, "renamed", `billing.${group[0]}.meter`, meters("expected"), meters("actual"), source, { note: "same tokens and charge, billed under a different meter" }));
	}
	return out;
}

// --- Content surfaced to the client ----------------------------------------------

export type SurfacedInput = { ctx: Ctx; outcome: ClientOutcome; dialect: Dialect; variant: ResponseVariant };

/** Providers whose Responses API returns encrypted reasoning (apps/docs/v1/api-reference/endpoint/responses.mdx). */
export const ENCRYPTED_REASONING_PROVIDERS = ["openai", "openai-eu", "azure", "spacex-ai"];

/** Whether the upstream returns reasoning state Phaseo must carry to the client. */
export function upstreamReturnsState(provider: string, dialect: Dialect): boolean {
	if (dialect === "openai-responses") return ENCRYPTED_REASONING_PROVIDERS.includes(provider);
	return dialect === "anthropic-messages" || dialect === "gemini" || dialect === "gemini-interactions";
}

function hasText(outcome: ClientOutcome, needle: string) {
	return outcome.clientText.includes(needle);
}

function reasoningStatePresent(outcome: ClientOutcome): boolean {
	const text = outcome.clientText;
	if (outcome.surface === "chat") return /"reasoning_details"\s*:\s*\[[^\]]*"(signature|data)"\s*:\s*"[^"]+"/.test(text);
	if (outcome.surface === "responses") return /"encrypted_content"\s*:\s*"[^"]+"/.test(text);
	return /"signature"\s*:\s*"[^"]+"/.test(text) || /signature_delta/.test(text);
}

export function checkSurfaced(input: SurfacedInput): Mismatch[] {
	const { ctx, outcome, dialect, variant } = input;
	const surfaced = expectationData().gateway.surfaced;
	const out: Mismatch[] = [];
	const s = outcome.surface;
	if (variant.text && !hasText(outcome, "SIM-UPSTREAM-TEXT-0001")) out.push(mm(ctx, "dropped", "client.text", variant.text, undefined, surfaced.text.source));
	for (const call of variant.toolCalls ?? []) {
		if (!hasText(outcome, call.id)) out.push(mm(ctx, "dropped", "client.tool_call.id", call.id, undefined, surfaced.toolCallIds.source));
		const sentinel = Object.values(call.arguments).find((value) => typeof value === "string") as string | undefined;
		if (sentinel && !hasText(outcome, sentinel)) out.push(mm(ctx, "dropped", "client.tool_call.arguments", sentinel, undefined, surfaced.toolArguments.source));
	}
	if (variant.reasoning) {
		if (!hasText(outcome, "SIM-UPSTREAM-REASONING-0001")) out.push(mm(ctx, "dropped", "client.reasoning.text", variant.reasoning.text, undefined, surfaced.reasoningText[s]));
		const upstreamHasState = upstreamReturnsState(ctx.provider, dialect);
		if (upstreamHasState && !reasoningStatePresent(outcome)) out.push(mm(ctx, "dropped", "client.reasoning.state", "signature / encrypted reasoning", undefined, surfaced.reasoningState[s], { note: `upstream ${dialect} returned reasoning state` }));
		if (dialect === "anthropic-messages" && variant.reasoning.redacted && s === "messages" && !hasText(outcome, variant.reasoning.redacted)) {
			out.push(mm(ctx, "dropped", "client.reasoning.redacted_thinking", variant.reasoning.redacted, undefined, surfaced.reasoningState.messages));
		}
	}
	if (variant.annotations && !hasText(outcome, "https://sim.example/cite-0001")) out.push(mm(ctx, "dropped", "client.citations", "https://sim.example/cite-0001", undefined, surfaced.citations[s]));
	if (variant.refusal && !hasText(outcome, "SIM-UPSTREAM-REFUSAL-0001")) out.push(mm(ctx, "dropped", "client.refusal", variant.refusal, undefined, surfaced.refusal[s]));
	return out;
}

export function checkFinish(ctx: Ctx, surface: Surface, finish: string | null | undefined, semantic: string, dialect?: Dialect): Mismatch[] {
	const gateway = expectationData().gateway.finish;
	const base: string[] | undefined = gateway[surface]?.[semantic];
	if (!base) return [];
	// Values a surface can only reach for some upstream dialects (gateway.json finish.byDialect).
	const expected = [...base];
	for (const rule of gateway.byDialect?.rules ?? []) {
		if (rule.surface !== surface || !dialect) continue;
		if (rule.dialects && !rule.dialects.includes(dialect)) continue;
		if (rule.exceptDialects?.includes(dialect)) continue;
		expected.push(...(rule.accept?.[semantic] ?? []));
	}
	if (expected.includes(String(finish))) return [];
	return [mm(ctx, finish === null || finish === undefined ? "dropped" : "wrong_value", "client.finish", expected, finish, gateway.sources[surface], { note: `upstream finish: ${semantic}` })];
}

export function checkMidStream(ctx: Ctx, outcome: ClientOutcome, finish: string | null | undefined): Mismatch[] {
	const source = expectationData().gateway.midStream.source;
	const surfaced = /SIM-ERROR-MID-STREAM|"type"\s*:\s*"error"|"status"\s*:\s*"failed"|"object"\s*:\s*"error"|"error"\s*:\s*\{/.test(outcome.clientText) || Boolean(outcome.materialiseError);
	const success = new Set(["stop", "length", "tool_calls", "end_turn", "max_tokens", "tool_use", "completed", "stop_sequence"]);
	const out: Mismatch[] = [];
	if (!surfaced) out.push(mm(ctx, "error_mapping", "client.error", "error event or error status", "no error surfaced", source));
	if (success.has(String(finish))) out.push(mm(ctx, "error_mapping", "client.finish", "no successful terminal event", finish, source));
	return out;
}

// --- Stream grammar ----------------------------------------------------------

export function checkStreamOrder(ctx: Ctx, outcome: ClientOutcome): Mismatch[] {
	if (outcome.mode !== "stream") return [];
	const grammar = expectationData().gateway.streamGrammar[outcome.surface];
	const out: Mismatch[] = [];
	const frames = outcome.frames;
	const types: string[] = frames.map((frame) => String(frame?.type ?? frame?.object ?? "?"));
	const fail = (rule: string, actual: unknown) => out.push(mm(ctx, "stream_order", `client.stream`, rule, actual, grammar.source));
	if (outcome.surface === "chat") {
		const foreign = frames.filter((frame) => frame?.object && frame.object !== "chat.completion.chunk");
		if (foreign.length) fail("every data frame is a chat.completion.chunk", foreign.map((frame) => frame.object).slice(0, 3));
		const finishes = frames.flatMap((frame) => (frame?.choices ?? []).map((choice: any) => choice?.finish_reason).filter((value: unknown) => value !== null && value !== undefined));
		if (finishes.length !== 1) fail("exactly one finish_reason across chunks", finishes);
		if (!outcome.sawDone) fail("[DONE] is the last frame", "missing [DONE]");
	} else if (outcome.surface === "responses") {
		if (types[0] !== "response.created") fail("response.created first", types[0]);
		const terminalIndexes = types.map((type, index) => (/^response\.(completed|incomplete|failed)$/.test(type) ? index : -1)).filter((index) => index >= 0);
		if (terminalIndexes.length !== 1 || terminalIndexes[0] !== types.length - 1) fail("one terminal event, last", types.slice(-3));
		const added = new Set<number>();
		for (const frame of frames) {
			if (frame?.type === "response.output_item.added") added.add(frame.output_index);
			if (/\.delta$/.test(frame?.type ?? "") && typeof frame.output_index === "number" && !added.has(frame.output_index)) {
				fail("output_item.added before deltas of that item", frame.type);
				break;
			}
		}
		const seqs = frames.map((frame) => frame?.sequence_number).filter((value) => typeof value === "number");
		if (seqs.some((value, index) => index > 0 && value <= seqs[index - 1])) fail("sequence_number strictly increasing", seqs.slice(0, 6));
	} else {
		if (types[0] !== "message_start") fail("message_start first", types[0]);
		if (types[types.length - 1] !== "message_stop") fail("message_stop last", types[types.length - 1]);
		let open: number | null = null;
		for (const frame of frames) {
			if (frame?.type === "content_block_start") {
				if (open !== null) { fail("blocks do not interleave", `start ${frame.index} while ${open} open`); break; }
				open = frame.index;
			} else if (frame?.type === "content_block_delta" && frame.index !== open) { fail("deltas belong to the open block", `delta ${frame.index} while ${open} open`); break; }
			else if (frame?.type === "content_block_stop") open = null;
		}
		const lastStop = types.lastIndexOf("content_block_stop");
		const delta = types.indexOf("message_delta");
		if (delta >= 0 && lastStop > delta) fail("message_delta after the last content_block_stop", { message_delta: delta, last_block_stop: lastStop });
	}
	return out;
}
