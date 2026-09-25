import { z } from "zod";

const MAX_MODELS = 1_000;
const MAX_PREVIEW_MODELS = 100;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_STRING_LENGTH = 2_000;
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/+@-]*$/i;
const CAPABILITY_ID = /^[a-z0-9][a-z0-9._/-]{1,127}$/i;

export type ProviderCatalogIssue = {
	path: string;
	message: string;
};

export type ProviderCatalogModelPreview = {
	id: string;
	name: string;
	description: string | null;
	providerModelSlug: string;
	inputModalities: string[];
	outputModalities: string[];
	contextLength: number | null;
	maxOutputTokens: number | null;
	availability: "ready" | "not_ready" | "degraded" | "deprecated" | "retired";
	availableFrom: string | null;
	deprecatedAt: string | null;
	shutdownAt: string | null;
	pricing: Array<{ meterKey: string; modality: string; direction: string | null; unit: string; unitQuantity: number; priceNanos: number; displayLabel: string; displayUnit: string }>;
	capabilities: Array<{
		id: string;
		parameters: string[];
	}>;
};

export const providerCatalogJsonSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://phaseo.app/schemas/provider-catalog.v1.json",
	title: "Phaseo provider catalog",
	type: "object",
	required: ["data"],
	additionalProperties: false,
	properties: {
		data: { type: "array", minItems: 1, maxItems: MAX_MODELS, items: { $ref: "#/$defs/model" } },
	},
	$defs: {
		capability: { oneOf: [{ type: "string" }, { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string" }, parameters: { type: "array", items: { type: "string" } } } }] },
		model: {
			type: "object", required: ["id", "capabilities"], additionalProperties: false,
			properties: {
				id: { type: "string", maxLength: MAX_STRING_LENGTH, pattern: MODEL_ID.source }, name: { type: "string", maxLength: MAX_STRING_LENGTH }, description: { type: ["string", "null"], maxLength: MAX_STRING_LENGTH },
				provider_model_slug: { type: "string", maxLength: MAX_STRING_LENGTH }, input_modalities: { type: "array", maxItems: 32, items: { type: "string" } }, output_modalities: { type: "array", maxItems: 32, items: { type: "string" } },
				context_length: { type: ["integer", "null"], minimum: 1 }, max_output_tokens: { type: ["integer", "null"], minimum: 1 },
				availability: { enum: ["ready", "not_ready", "degraded", "deprecated", "retired"] }, available_from: { type: ["string", "null"], format: "date-time", description: "RFC 3339 timestamp with an explicit timezone offset." }, deprecated_at: { type: ["string", "null"], format: "date-time" }, shutdown_at: { type: ["string", "null"], format: "date-time" },
				pricing: { type: "array", items: { type: "object", additionalProperties: false, required: ["meter_key", "modality", "unit", "unit_quantity", "price_nanos", "display_label", "display_unit"], properties: { meter_key: { type: "string" }, modality: { type: "string" }, direction: { type: "string" }, unit: { type: "string" }, unit_quantity: { type: "number", exclusiveMinimum: 0 }, price_nanos: { type: "number", minimum: 0 }, display_label: { type: "string" }, display_unit: { type: "string" } } } },
				capabilities: { type: "array", minItems: 1, items: { $ref: "#/$defs/capability" } },
			},
		},
	},
} as const;

export type ProviderCatalogPreview = {
	valid: boolean;
	modelCount: number;
	models: ProviderCatalogModelPreview[];
	allModels: ProviderCatalogModelPreview[];
	issues: ProviderCatalogIssue[];
	truncated: boolean;
};

export async function validateProviderCatalogPricingMeters(client: any, preview: ProviderCatalogPreview): Promise<ProviderCatalogPreview> {
	const submittedKeys = Array.from(new Set(preview.allModels.flatMap((model) => model.pricing.map((price) => price.meterKey))));
	if (!submittedKeys.length) return preview;
	const definitions = await client.from("v2_meter_definitions").select("meter_key").in("meter_key", submittedKeys).neq("status", "disabled");
	if (definitions.error) throw definitions.error;
	const allowed = new Set((definitions.data ?? []).map((row: { meter_key: string }) => String(row.meter_key)));
	const issues = [...preview.issues];
	for (const [modelIndex, model] of preview.allModels.entries()) {
		const seen = new Set<string>();
		for (const [priceIndex, price] of model.pricing.entries()) {
			const path = `data[${modelIndex}].pricing[${priceIndex}].meter_key`;
			if (seen.has(price.meterKey)) issues.push({ path, message: `Duplicate pricing meter: ${price.meterKey}.` });
			else if (!allowed.has(price.meterKey)) issues.push({ path, message: `Unknown pricing meter: ${price.meterKey}.` });
			seen.add(price.meterKey);
		}
	}
	return { ...preview, valid: preview.valid && issues.length === 0, issues: issues.slice(0, 100) };
}

const catalogUrlSchema = z.string().trim().url().refine((value) => {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !isPrivateHostname(url.hostname);
	} catch {
		return false;
	}
}, "Catalog URL must be an HTTPS URL on a public hostname.");

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function stringValue(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value.trim().slice(0, MAX_STRING_LENGTH) : fallback;
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(new Set(value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean)
		.slice(0, 32)));
}

function positiveInteger(value: unknown): number | null {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isInteger(number) && number > 0 ? number : null;
}

const RFC3339_EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function timestamp(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim() || !RFC3339_EXPLICIT_TIMEZONE.test(value.trim())) return null;
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function isPrivateHostname(hostname: string): boolean {
	const host = hostname.trim().toLowerCase().replace(/[\[\]]/g, "");
	if (host.startsWith("::ffff:")) return isPrivateHostname(host.slice(7));
	if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
	if (host === "::" || host === "::1" || host === "0.0.0.0" || host === "169.254.169.254" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") || host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") || host.startsWith("::ffff:192.168.")) return true;
	const octets = host.split(".").map(Number);
	if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
		const [a, b] = octets;
		return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
	}
	return false;
}

async function assertPublicDns(hostname: string): Promise<void> {
	if (/^[a-f0-9:.]+$/i.test(hostname)) return;
	const addresses: string[] = [];
	for (const type of ["A", "AAAA"]) {
		const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5_000) });
		if (!response.ok) throw new Error("Could not verify the catalog hostname.");
		const payload = await response.json() as { Answer?: Array<{ type?: number; data?: string }> };
		for (const answer of payload.Answer ?? []) if ((answer.type === 1 || answer.type === 28) && answer.data) addresses.push(answer.data);
	}
	if (!addresses.length || addresses.some(isPrivateHostname)) throw new Error("Catalog hostname must resolve only to public addresses.");
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Catalog is larger than the 5 MB limit."); }
		chunks.push(value);
	}
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
	return output;
}

function modelEntries(payload: unknown): unknown[] {
	const body = asRecord(payload);
	if (Array.isArray(body?.data)) return body.data;
	return [];
}

function capabilityEntries(model: Record<string, unknown>): Array<Record<string, unknown>> {
	const values = Array.isArray(model.capabilities) ? model.capabilities : [];
	return values.flatMap((value) => {
		if (typeof value === "string") return [{ id: value }];
		const record = asRecord(value);
		return record ? [record] : [];
	});
}

function parametersForCapability(value: Record<string, unknown>): string[] {
	const supported = value.parameters;
	if (Array.isArray(supported)) return stringList(supported);
	const record = asRecord(supported);
	return record ? Object.keys(record).slice(0, 64).sort() : [];
}

export function normalizeProviderCatalog(payload: unknown): ProviderCatalogPreview {
	const entries = modelEntries(payload);
	const issues: ProviderCatalogIssue[] = [];
	const body = asRecord(payload);
	if (!body || Object.keys(body).some((key) => key !== "data")) issues.push({ path: "$", message: "Catalog must be an object containing only the data array." });
	if (entries.length === 0) {
		issues.push({ path: "data", message: "Expected a non-empty array in data, models, or the response body." });
		return { valid: false, modelCount: 0, models: [], allModels: [], issues, truncated: false };
	}
	if (entries.length > MAX_MODELS) {
		issues.push({ path: "data", message: `Catalog contains ${entries.length} models; the limit is ${MAX_MODELS}.` });
	}

	const seen = new Set<string>();
	const models: ProviderCatalogModelPreview[] = [];
	for (const [index, raw] of entries.slice(0, MAX_MODELS).entries()) {
		const model = asRecord(raw);
		if (!model) {
			issues.push({ path: `data[${index}]`, message: "Each model must be an object." });
			continue;
		}
		const allowedModelKeys = new Set(["id", "name", "description", "provider_model_slug", "input_modalities", "output_modalities", "context_length", "max_output_tokens", "availability", "available_from", "deprecated_at", "shutdown_at", "capabilities", "pricing"]);
		const unknownModelKey = Object.keys(model).find((key) => !allowedModelKeys.has(key));
		if (unknownModelKey) { issues.push({ path: `data[${index}].${unknownModelKey}`, message: "Unknown model field." }); continue; }
		if (["id", "name", "description", "provider_model_slug"].some((key) => typeof model[key] === "string" && String(model[key]).length > MAX_STRING_LENGTH)) { issues.push({ path: `data[${index}]`, message: `Model strings must not exceed ${MAX_STRING_LENGTH} characters.` }); continue; }
		for (const key of ["name", "description", "provider_model_slug"] as const) if (model[key] !== undefined && !(key === "description" && model[key] === null) && typeof model[key] !== "string") issues.push({ path: `data[${index}].${key}`, message: "Expected a string." });
		for (const key of ["context_length", "max_output_tokens"] as const) if (model[key] != null && positiveInteger(model[key]) === null) issues.push({ path: `data[${index}].${key}`, message: "Expected a positive integer." });
		if (issues.some((issue) => issue.path.startsWith(`data[${index}].`) && ["Expected a string.", "Expected a positive integer."].includes(issue.message))) continue;
		const id = stringValue(model.id ?? model.model_id ?? model.model);
		if (!MODEL_ID.test(id)) {
			issues.push({ path: `data[${index}].id`, message: "Model id must use the publisher/model format." });
			continue;
		}
		if (seen.has(id.toLowerCase())) {
			issues.push({ path: `data[${index}].id`, message: `Duplicate model id: ${id}.` });
			continue;
		}
		seen.add(id.toLowerCase());

		const rawCapabilities = capabilityEntries(model);
		const capabilities = rawCapabilities.flatMap((value, capabilityIndex) => {
			if (Object.keys(value).some((key) => !["id", "parameters"].includes(key))) {
				issues.push({ path: `data[${index}].capabilities[${capabilityIndex}]`, message: "Capability contains an unknown field." });
				return [];
			}
			const capabilityId = stringValue(value.id);
			if (!CAPABILITY_ID.test(capabilityId)) {
				issues.push({ path: `data[${index}].capabilities[${capabilityIndex}]`, message: "Capability id is required and must be a simple endpoint identifier." });
				return [];
			}
			if (value.parameters !== undefined && (!Array.isArray(value.parameters) || value.parameters.some((parameter) => typeof parameter !== "string"))) {
				issues.push({ path: `data[${index}].capabilities[${capabilityIndex}].parameters`, message: "Expected an array of strings." });
				return [];
			}
			return [{ id: capabilityId, parameters: parametersForCapability(value) }];
		});
		if (capabilities.length === 0) {
			issues.push({ path: `data[${index}].capabilities`, message: "At least one capability or endpoint is required." });
			continue;
		}

		if (model.input_modalities !== undefined && (!Array.isArray(model.input_modalities) || model.input_modalities.some((value) => typeof value !== "string"))) { issues.push({ path: `data[${index}].input_modalities`, message: "Expected an array of strings." }); continue; }
		if (model.output_modalities !== undefined && (!Array.isArray(model.output_modalities) || model.output_modalities.some((value) => typeof value !== "string"))) { issues.push({ path: `data[${index}].output_modalities`, message: "Expected an array of strings." }); continue; }
		const inputModalities = stringList(model.input_modalities);
		const outputModalities = stringList(model.output_modalities);
		const availability = model.availability === undefined ? "ready" : String(model.availability);
		if (!["ready", "not_ready", "degraded", "deprecated", "retired"].includes(availability)) { issues.push({ path: `data[${index}].availability`, message: "Invalid availability value." }); continue; }
		const availableFrom = timestamp(model.available_from);
		const deprecatedAt = timestamp(model.deprecated_at);
		const shutdownAt = timestamp(model.shutdown_at);
		for (const [key, rawValue, normalized] of [["available_from", model.available_from, availableFrom], ["deprecated_at", model.deprecated_at, deprecatedAt], ["shutdown_at", model.shutdown_at, shutdownAt]] as const) {
			if (rawValue != null && normalized === null) issues.push({ path: `data[${index}].${key}`, message: "Expected an ISO 8601 timestamp with an explicit timezone (Z or ±HH:MM)." });
		}
		if ((availableFrom && deprecatedAt && deprecatedAt <= availableFrom) || (deprecatedAt && shutdownAt && shutdownAt <= deprecatedAt) || (availableFrom && shutdownAt && shutdownAt <= availableFrom)) { issues.push({ path: `data[${index}]`, message: "Lifecycle timestamps must be in chronological order." }); continue; }
		if (issues.some((issue) => issue.path.startsWith(`data[${index}].`) && issue.message.includes("timestamp"))) continue;
		const pricing = Array.isArray(model.pricing) ? model.pricing.flatMap((rawPrice, priceIndex) => {
			const price = asRecord(rawPrice);
			const allowed = ["meter_key", "modality", "direction", "unit", "unit_quantity", "price_nanos", "display_label", "display_unit"];
			if (!price || Object.keys(price).some((key) => !allowed.includes(key))) { issues.push({ path: `data[${index}].pricing[${priceIndex}]`, message: "Invalid pricing meter." }); return []; }
			const unitQuantity = Number(price.unit_quantity);
			const priceNanos = Number(price.price_nanos);
			const meterKey = stringValue(price.meter_key).toLowerCase();
			if (!/^[a-z0-9][a-z0-9._:-]*$/.test(meterKey) || !Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(priceNanos) || priceNanos < 0 || !["modality", "unit", "display_label", "display_unit"].every((key) => typeof price[key] === "string" && String(price[key]).trim())) { issues.push({ path: `data[${index}].pricing[${priceIndex}]`, message: "Pricing meter fields are invalid." }); return []; }
			return [{ meterKey, modality: stringValue(price.modality), direction: stringValue(price.direction) || null, unit: stringValue(price.unit), unitQuantity, priceNanos, displayLabel: stringValue(price.display_label), displayUnit: stringValue(price.display_unit) }];
		}) : [];
		if (model.pricing !== undefined && !Array.isArray(model.pricing)) { issues.push({ path: `data[${index}].pricing`, message: "Expected an array of pricing meters." }); continue; }
		models.push({
			id,
			name: stringValue(model.name, id),
			description: stringValue(model.description) || null,
			providerModelSlug: stringValue(model.provider_model_slug, id),
			inputModalities: inputModalities.length ? inputModalities : ["text"],
			outputModalities: outputModalities.length ? outputModalities : ["text"],
			contextLength: positiveInteger(model.context_length),
			maxOutputTokens: positiveInteger(model.max_output_tokens),
			availability: availability as ProviderCatalogModelPreview["availability"],
			availableFrom, deprecatedAt, shutdownAt, pricing,
			capabilities,
		});
	}

	return {
		valid: issues.length === 0 && models.length > 0,
		modelCount: entries.length,
		models: models.slice(0, MAX_PREVIEW_MODELS),
		allModels: models,
		issues: issues.slice(0, 100),
		truncated: models.length > MAX_PREVIEW_MODELS,
	};
}

export function validateCatalogUrl(value: unknown): { ok: true; url: string } | { ok: false; message: string } {
	const result = catalogUrlSchema.safeParse(value);
	return result.success ? { ok: true, url: result.data } : { ok: false, message: result.error.issues[0]?.message ?? "Enter a valid HTTPS catalog URL." };
}

type CatalogFetchResult = { preview: ProviderCatalogPreview; sha256: string; etag: string | null; lastModified: string | null; notModified: false };
type ConditionalCatalogFetchResult = CatalogFetchResult | { notModified: true; etag: string | null; lastModified: string | null };
export function fetchAndValidateProviderCatalog(url: string, fetcher?: typeof fetch): Promise<CatalogFetchResult>;
export function fetchAndValidateProviderCatalog(url: string, fetcher: typeof fetch, validators: { etag?: string | null; lastModified?: string | null }): Promise<ConditionalCatalogFetchResult>;
export async function fetchAndValidateProviderCatalog(url: string, fetcher: typeof fetch = fetch, validators?: { etag?: string | null; lastModified?: string | null }): Promise<ConditionalCatalogFetchResult> {
	const parsed = validateCatalogUrl(url);
	if (parsed.ok === false) throw new Error(parsed.message);
	if (fetcher === fetch) await assertPublicDns(new URL(parsed.url).hostname);
	const response = await fetcher(parsed.url, {
		method: "GET",
		headers: { accept: "application/json", ...(validators?.etag ? { "if-none-match": validators.etag } : {}), ...(validators?.lastModified ? { "if-modified-since": validators.lastModified } : {}) },
		redirect: "manual",
		signal: AbortSignal.timeout(15_000),
	});
	if (response.status === 304) return { notModified: true, etag: response.headers.get("etag") ?? validators?.etag ?? null, lastModified: response.headers.get("last-modified") ?? validators?.lastModified ?? null };
	if (response.status >= 300 && response.status < 400) throw new Error("Catalog URL must not redirect.");
	if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}.`);
	const contentLength = Number(response.headers.get("content-length") ?? 0);
	if (contentLength > MAX_BODY_BYTES) throw new Error("Catalog is larger than the 5 MB limit.");
	const bytes = await readLimitedBody(response);
	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("Catalog did not return valid JSON.");
	}
	const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
	const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return { preview: normalizeProviderCatalog(payload), sha256, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), notModified: false };
}

export function sameOrSubdomain(hostname: string, parent: string): boolean {
	const child = hostname.toLowerCase().replace(/^www\./, "");
	const root = parent.toLowerCase().replace(/^www\./, "");
	return child === root || child.endsWith(`.${root}`);
}

export { MAX_PREVIEW_MODELS };
