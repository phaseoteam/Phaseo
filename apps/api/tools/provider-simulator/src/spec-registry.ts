// Purpose: Offline access to provider API schemas cached in specs/.
// Why: Captured request bodies are validated against each provider's own contract without a network.
// How: specs/manifest.json maps a provider to a trimmed spec file (fetched by scripts/refresh-specs.ts)
//      or a hand-written schema from the provider's API reference; OpenAI-compatible providers without
//      either fall back to the OpenAI schema as a labelled baseline.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaDocument, integerLeafPaths, topLevelProperties, type Schema, type SchemaDocument } from "./schema";
import type { Dialect, UsageProfile } from "./dialects";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPECS_DIR = path.resolve(here, "../specs");

export type OperationKey = "chat" | "responses" | "messages" | "generateContent" | "interactions";

export const DIALECT_OPERATION: Partial<Record<Dialect, OperationKey>> = {
	"openai-chat": "chat",
	"openai-responses": "responses",
	"anthropic-messages": "messages",
	gemini: "generateContent",
	"gemini-interactions": "interactions",
};

export type SpecFile = {
	id: string;
	source: { url: string | null; docs?: string | null; fetchedAt: string | null; sha256?: string | null; handWritten: boolean; notes?: string };
	operations: Partial<Record<OperationKey, { request?: Schema; response?: Schema; usage?: Schema }>>;
	components?: { schemas?: Record<string, Schema> };
};

export type ManifestEntry = {
	/** Spec file id under specs/ (without .json). */
	spec: string;
	/** "own" = the provider's spec; "hand-written" = from its API reference; "baseline" = OpenAI schema stand-in. */
	kind: "own" | "hand-written" | "baseline";
	/** Usage fields the provider documents beyond the dialect default, set to sentinels in responses. */
	extraUsage?: Record<string, number>;
	/** OpenAI-dialect usage fields the provider documents (defaults to cached + reasoning). */
	usageProfile?: UsageProfile;
	notes?: string;
};

export type ResolvedSpec = {
	entry: ManifestEntry;
	file: SpecFile;
	doc: SchemaDocument;
};

let manifest: Record<string, ManifestEntry> | null = null;
const fileCache = new Map<string, SpecFile>();

export function loadManifest(): Record<string, ManifestEntry> {
	if (manifest) return manifest;
	const file = path.join(SPECS_DIR, "manifest.json");
	manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).providers ?? {} : {};
	return manifest!;
}

function loadSpecFile(id: string): SpecFile | null {
	if (fileCache.has(id)) return fileCache.get(id)!;
	const candidates = [path.join(SPECS_DIR, `${id}.json`), path.join(SPECS_DIR, "hand-written", `${id}.json`)];
	const found = candidates.find((candidate) => fs.existsSync(candidate));
	if (!found) return null;
	const parsed = JSON.parse(fs.readFileSync(found, "utf8")) as SpecFile;
	fileCache.set(id, parsed);
	return parsed;
}

/** Resolves the schema for a provider and dialect, falling back to the OpenAI baseline for OpenAI dialects. */
export function resolveSpec(providerId: string, dialect: Dialect): ResolvedSpec | null {
	const operation = DIALECT_OPERATION[dialect];
	if (!operation) return null;
	const entries = loadManifest();
	const entry = entries[providerId];
	const tryEntry = (candidate: ManifestEntry | undefined): ResolvedSpec | null => {
		if (!candidate) return null;
		const file = loadSpecFile(candidate.spec);
		if (!file?.operations?.[operation]?.request) return null;
		return { entry: candidate, file, doc: createSchemaDocument({ components: file.components ?? {}, operations: file.operations }) };
	};
	const own = tryEntry(entry);
	if (own) return own;
	// Native dialects have exactly one owner spec.
	const nativeOwner: Partial<Record<OperationKey, string>> = { messages: "anthropic", generateContent: "google-ai-studio", interactions: "google-ai-studio" };
	if (nativeOwner[operation] && nativeOwner[operation] !== providerId) {
		const owner = tryEntry(entries[nativeOwner[operation]!]);
		if (owner) return { ...owner, entry: { ...owner.entry, kind: "baseline", notes: `${nativeOwner[operation]} schema for the ${operation} dialect` } };
	}
	if (operation === "chat" || operation === "responses") {
		const baseline = tryEntry(entries.openai);
		if (baseline) return { ...baseline, entry: { spec: baseline.entry.spec, kind: "baseline", extraUsage: entry?.extraUsage, notes: "OpenAI schema as a stand-in; no provider spec cached" } };
	}
	return null;
}

export function requestSchema(spec: ResolvedSpec, dialect: Dialect): Schema | undefined {
	const operation = DIALECT_OPERATION[dialect];
	return operation ? spec.file.operations[operation]?.request : undefined;
}

export function responseSchema(spec: ResolvedSpec, dialect: Dialect): Schema | undefined {
	const operation = DIALECT_OPERATION[dialect];
	return operation ? spec.file.operations[operation]?.response : undefined;
}

export function usageProfileFor(providerId: string): UsageProfile | undefined {
	return derivedUsageProfile(providerId).profile;
}

export function extraUsageFor(providerId: string): Record<string, number> | undefined {
	return loadManifest()[providerId]?.extraUsage;
}

const USAGE_FIELD_FLAGS: Array<[RegExp, keyof UsageProfile]> = [
	[/(^|\.)prompt_tokens_details\.cached_tokens$|(^|\.)input_tokens_details\.cached_tokens$/, "nestedCached"],
	[/^cached_tokens$/, "topLevelCached"],
	[/prompt_cache_hit_tokens/, "deepseekCache"],
	[/cache_write_tokens|cache_creation_tokens|cache_creation_input_tokens/, "cacheWrite"],
	[/reasoning_tokens/, "reasoning"],
	[/audio_tokens/, "audio"],
	[/image_tokens/, "image"],
	[/prediction_tokens/, "prediction"],
];

function profileFromFields(fields: string[]): UsageProfile | undefined {
	const profile: UsageProfile = {};
	for (const field of fields) {
		for (const [pattern, flag] of USAGE_FIELD_FLAGS) if (pattern.test(field)) profile[flag] = true;
	}
	return Object.keys(profile).length ? profile : undefined;
}

/**
 * Usage fields a provider documents: an explicit manifest profile, else the usage schema of its own
 * spec, else the usage fields listed on its API reference. Undefined means "unknown" (common subset).
 */
export function derivedUsageProfile(providerId: string): { profile?: UsageProfile; source: string } {
	const entry = loadManifest()[providerId];
	if (entry?.usageProfile) return { profile: entry.usageProfile, source: "manifest" };
	if (entry?.kind === "own") {
		const file = loadSpecFile(entry.spec);
		const operation = file?.operations?.chat ?? file?.operations?.responses;
		if (file && operation?.response) {
			const doc = createSchemaDocument({ components: file.components ?? {}, operations: file.operations });
			const response = doc.resolve(operation.response);
			const usage = response ? topLevelUsageSchema(doc, response) : undefined;
			if (usage) {
				const fields = integerLeafPaths(doc, usage);
				const profile = profileFromFields(fields);
				if (profile) return { profile, source: `spec usage schema (${fields.length} integer fields)` };
			}
		}
	}
	const fields = (entry as any)?.usageFields as string[] | undefined;
	if (fields?.length) return { profile: profileFromFields(fields) ?? {}, source: "API reference usage fields" };
	return { profile: undefined, source: "undocumented" };
}

function topLevelUsageSchema(doc: SchemaDocument, response: Schema): Schema | undefined {
	const props = topLevelProperties(doc, response);
	return props.usage;
}
