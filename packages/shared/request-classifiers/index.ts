// Request classifiers: a workspace taxonomy that a chosen model applies to each
// finished request. Each dimension's answer is written onto the request as a
// label (key = dimension key), so classifier output filters and groups exactly
// like labels sent in the x-phaseo-metadata header.
//
// This is the one definition of a valid classifier and of the structured-output
// request the gateway sends for it. The gateway, the settings API and the
// settings page each use a generated copy (scripts/sync-request-classifiers.mjs),
// so validation and the request cannot drift apart. Keep it dependency-free.

export const MAX_CLASSIFIERS_PER_WORKSPACE = 5;
export const MAX_DIMENSIONS = 12;
export const MAX_VALUES_PER_DIMENSION = 50;
export const MAX_SCOPE_ENTRIES = 50;
export const MAX_INSTRUCTIONS_LENGTH = 8_000;
/** The value a dimension with allow_other answers when nothing in its list fits. */
export const OTHER_VALUE = "other";

const DIMENSION_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const VALUE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,199}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const SAMPLE_BY = ["request", "session"] as const;
export const INPUT_SCOPES = ["prompt", "prompt_and_response"] as const;
export type SampleBy = (typeof SAMPLE_BY)[number];
export type InputScope = (typeof INPUT_SCOPES)[number];

export type ClassifierValue = { value: string; description: string | null };
export type ClassifierDimension = {
	key: string;
	name: string;
	description: string | null;
	multiple: boolean;
	allow_other: boolean;
	values: ClassifierValue[];
};
export type ClassifierScope = { key_ids?: string[]; app_ids?: string[]; models?: string[] };

export type ClassifierRow = {
	id: string;
	workspace_id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	model: string;
	instructions: string;
	dimensions: ClassifierDimension[];
	sample_rate_bps: number;
	sample_by: SampleBy;
	input_scope: InputScope;
	scope: ClassifierScope;
	monthly_budget_nanos: number | string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

export const CLASSIFIER_COLUMNS = "id,workspace_id,name,description,enabled,model,instructions,dimensions,sample_rate_bps,sample_by,input_scope,scope,monthly_budget_nanos,created_by,created_at,updated_at";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
	return { ok: false, message };
}

function optionalText(value: unknown, field: string, max: number): Parsed<string | null> {
	if (value === undefined || value === null) return { ok: true, value: null };
	if (typeof value !== "string" || value.length > max || CONTROL_CHARACTER_PATTERN.test(value)) {
		return fail(`${field} must be a string of at most ${max} characters`);
	}
	return { ok: true, value: value.trim() || null };
}

function parseValue(raw: unknown, path: string): Parsed<ClassifierValue> {
	const entry = typeof raw === "string" ? { value: raw } : raw;
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail(`${path} must be an object with a value`);
	const record = entry as Record<string, unknown>;
	const value = typeof record.value === "string" ? record.value.trim() : "";
	if (!VALUE_PATTERN.test(value)) return fail(`${path}.value must be 1 to 64 letters, digits, or _ . : -`);
	const description = optionalText(record.description, `${path}.description`, 300);
	if (description.ok === false) return description;
	return { ok: true, value: { value, description: description.value } };
}

function parseDimension(raw: unknown, path: string): Parsed<ClassifierDimension> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(`${path} must be an object`);
	const record = raw as Record<string, unknown>;
	const key = typeof record.key === "string" ? record.key.trim() : "";
	if (!DIMENSION_KEY_PATTERN.test(key)) return fail(`${path}.key must be 1 to 64 letters, digits, or _ . : -`);
	const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : key;
	if (name.length > 100 || CONTROL_CHARACTER_PATTERN.test(name)) return fail(`${path}.name must be at most 100 characters`);
	const description = optionalText(record.description, `${path}.description`, 500);
	if (description.ok === false) return description;
	for (const flag of ["multiple", "allow_other"] as const) {
		if (record[flag] !== undefined && typeof record[flag] !== "boolean") return fail(`${path}.${flag} must be a boolean`);
	}
	const allowOther = record.allow_other === true;
	if (!Array.isArray(record.values)) return fail(`${path}.values must be an array`);
	const minValues = allowOther ? 1 : 2;
	if (record.values.length < minValues || record.values.length > MAX_VALUES_PER_DIMENSION) {
		return fail(`${path}.values must have ${minValues} to ${MAX_VALUES_PER_DIMENSION} entries`);
	}
	const values: ClassifierValue[] = [];
	const seen = new Set<string>();
	for (const [index, rawValue] of record.values.entries()) {
		const parsed = parseValue(rawValue, `${path}.values[${index}]`);
		if (parsed.ok === false) return parsed;
		const normalized = parsed.value.value.toLowerCase();
		if (seen.has(normalized)) return fail(`${path}.values has a duplicate value: ${parsed.value.value}`);
		if (allowOther && normalized === OTHER_VALUE) {
			return fail(`${path}.values cannot list "${OTHER_VALUE}" when allow_other is true; it is added automatically`);
		}
		seen.add(normalized);
		values.push(parsed.value);
	}
	return {
		ok: true,
		value: { key, name, description: description.value, multiple: record.multiple === true, allow_other: allowOther, values },
	};
}

export function parseDimensions(raw: unknown): Parsed<ClassifierDimension[]> {
	if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DIMENSIONS) {
		return fail(`dimensions must be an array of 1 to ${MAX_DIMENSIONS} dimensions`);
	}
	const dimensions: ClassifierDimension[] = [];
	const keys = new Set<string>();
	for (const [index, entry] of raw.entries()) {
		const parsed = parseDimension(entry, `dimensions[${index}]`);
		if (parsed.ok === false) return parsed;
		if (keys.has(parsed.value.key)) return fail(`dimensions has a duplicate key: ${parsed.value.key}`);
		keys.add(parsed.value.key);
		dimensions.push(parsed.value);
	}
	return { ok: true, value: dimensions };
}

function parseIdList(raw: unknown, field: string): Parsed<string[] | undefined> {
	if (raw === undefined || raw === null) return { ok: true, value: undefined };
	if (!Array.isArray(raw) || raw.length > MAX_SCOPE_ENTRIES) return fail(`scope.${field} must be an array of at most ${MAX_SCOPE_ENTRIES} ids`);
	const ids = new Set<string>();
	for (const id of raw) {
		if (typeof id !== "string" || !UUID_PATTERN.test(id.trim())) return fail(`scope.${field} must contain only ids`);
		ids.add(id.trim().toLowerCase());
	}
	return { ok: true, value: ids.size ? [...ids] : undefined };
}

export function parseScope(raw: unknown): Parsed<ClassifierScope> {
	if (raw === undefined || raw === null) return { ok: true, value: {} };
	if (typeof raw !== "object" || Array.isArray(raw)) return fail("scope must be an object");
	const record = raw as Record<string, unknown>;
	const unknownKey = Object.keys(record).find((key) => !["key_ids", "app_ids", "models"].includes(key));
	if (unknownKey) return fail(`scope.${unknownKey} is not supported; use key_ids, app_ids, or models`);
	const keyIds = parseIdList(record.key_ids, "key_ids");
	if (keyIds.ok === false) return keyIds;
	const appIds = parseIdList(record.app_ids, "app_ids");
	if (appIds.ok === false) return appIds;
	let models: string[] | undefined;
	if (record.models !== undefined && record.models !== null) {
		if (!Array.isArray(record.models) || record.models.length > MAX_SCOPE_ENTRIES) {
			return fail(`scope.models must be an array of at most ${MAX_SCOPE_ENTRIES} model ids`);
		}
		const unique = new Set<string>();
		for (const model of record.models) {
			if (typeof model !== "string" || !MODEL_PATTERN.test(model.trim())) return fail("scope.models must contain only model ids");
			unique.add(model.trim());
		}
		models = unique.size ? [...unique] : undefined;
	}
	const scope: ClassifierScope = {};
	if (keyIds.value) scope.key_ids = keyIds.value;
	if (appIds.value) scope.app_ids = appIds.value;
	if (models) scope.models = models;
	return { ok: true, value: scope };
}

/** A sample rate between 0 (exclusive) and 1, stored as whole basis points. */
export function parseSampleRate(raw: unknown): Parsed<number> {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > 1) {
		return fail("sample_rate must be a number greater than 0 and at most 1");
	}
	const bps = Math.round(raw * 10_000);
	if (bps < 1) return fail("sample_rate must be at least 0.0001");
	return { ok: true, value: bps };
}

/** A positive USD amount, or null for no cap, stored in nanodollars. */
export function parseMonthlyBudget(raw: unknown): Parsed<number | null> {
	if (raw === null) return { ok: true, value: null };
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > 1_000_000) {
		return fail("monthly_budget_usd must be a positive number up to 1000000, or null");
	}
	return { ok: true, value: Math.round(raw * 1e9) };
}

export type ClassifierFields = Partial<Pick<ClassifierRow,
	"name" | "description" | "enabled" | "model" | "instructions" | "dimensions" | "sample_rate_bps" | "sample_by" | "input_scope" | "scope"
>> & { monthly_budget_nanos?: number | null };

const CLASSIFIER_INPUT_FIELDS = new Set([
	"name", "description", "enabled", "model", "instructions", "dimensions",
	"sample_rate", "sample_by", "input_scope", "scope", "monthly_budget_usd",
]);

export function parseClassifierFields(body: Record<string, unknown>): Parsed<ClassifierFields> {
	const fields: ClassifierFields = {};
	// A misspelt field would otherwise fall back to the defaults (full sampling, no budget).
	const unknown = Object.keys(body).find((field) => !CLASSIFIER_INPUT_FIELDS.has(field));
	if (unknown !== undefined) return fail(`Unknown field: ${unknown}`);
	if (body.name !== undefined) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name.length < 1 || name.length > 100 || CONTROL_CHARACTER_PATTERN.test(name)) return fail("name must be 1 to 100 characters");
		fields.name = name;
	}
	if (body.description !== undefined) {
		const description = optionalText(body.description, "description", 500);
		if (description.ok === false) return description;
		fields.description = description.value;
	}
	if (body.enabled !== undefined) {
		if (typeof body.enabled !== "boolean") return fail("enabled must be a boolean");
		fields.enabled = body.enabled;
	}
	if (body.model !== undefined) {
		const model = typeof body.model === "string" ? body.model.trim() : "";
		if (!MODEL_PATTERN.test(model)) return fail("model must be a model id, for example google/gemini-2.5-flash-lite");
		fields.model = model;
	}
	if (body.instructions !== undefined) {
		if (body.instructions !== null && (typeof body.instructions !== "string" || body.instructions.length > MAX_INSTRUCTIONS_LENGTH)) {
			return fail(`instructions must be a string of at most ${MAX_INSTRUCTIONS_LENGTH} characters`);
		}
		fields.instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
	}
	if (body.dimensions !== undefined) {
		const dimensions = parseDimensions(body.dimensions);
		if (dimensions.ok === false) return dimensions;
		fields.dimensions = dimensions.value;
	}
	if (body.sample_rate !== undefined) {
		const rate = parseSampleRate(body.sample_rate);
		if (rate.ok === false) return rate;
		fields.sample_rate_bps = rate.value;
	}
	if (body.sample_by !== undefined) {
		if (!SAMPLE_BY.includes(body.sample_by as SampleBy)) return fail(`sample_by must be one of: ${SAMPLE_BY.join(", ")}`);
		fields.sample_by = body.sample_by as SampleBy;
	}
	if (body.input_scope !== undefined) {
		if (!INPUT_SCOPES.includes(body.input_scope as InputScope)) return fail(`input_scope must be one of: ${INPUT_SCOPES.join(", ")}`);
		fields.input_scope = body.input_scope as InputScope;
	}
	if (body.scope !== undefined) {
		const scope = parseScope(body.scope);
		if (scope.ok === false) return scope;
		fields.scope = scope.value;
	}
	if (body.monthly_budget_usd !== undefined) {
		const budget = parseMonthlyBudget(body.monthly_budget_usd);
		if (budget.ok === false) return budget;
		fields.monthly_budget_nanos = budget.value;
	}
	return { ok: true, value: fields };
}

export function formatClassifier(row: ClassifierRow) {
	const budgetNanos = row.monthly_budget_nanos == null ? null : Number(row.monthly_budget_nanos);
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: row.name,
		description: row.description ?? null,
		enabled: Boolean(row.enabled),
		model: row.model,
		instructions: row.instructions ?? "",
		dimensions: Array.isArray(row.dimensions) ? row.dimensions : [],
		sample_rate: Number(row.sample_rate_bps) / 10_000,
		sample_by: row.sample_by,
		input_scope: row.input_scope,
		scope: row.scope && typeof row.scope === "object" ? row.scope : {},
		monthly_budget_usd: budgetNanos == null ? null : budgetNanos / 1e9,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

// ---- Classifier request ---------------------------------------------------------

/** Room for a dimension's key, confidence and JSON punctuation. */
const OUTPUT_TOKENS_PER_DIMENSION = 40;

export type ClassifierLabel = { key: string; value: string; confidence: number | null };
/** The parts of a classifier its request depends on, so an unsaved draft can be tested too. */
export type ClassifierRequestConfig = { model: string; instructions?: string | null };

/** Text of a Chat Completions, Responses or Messages content value. */
export function textOf(content: unknown): string {
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

/** The values a dimension can answer, including "other" when allow_other is set. */
export function allowedValues(dimension: ClassifierDimension): string[] {
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

export function buildClassifierPrompt(classifier: { instructions?: string | null }, dimensions: ClassifierDimension[]): string {
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

/** The Responses request body for one classification. */
/** Enough output for the longest valid answer: every value of a multi-value dimension, about 3 characters per token. */
export function classifierOutputTokens(dimensions: ClassifierDimension[]): number {
	return 64 + dimensions.reduce((total, dimension) => {
		const values = allowedValues(dimension);
		const answer = dimension.multiple
			? values.reduce((sum, value) => sum + Math.ceil(value.length / 3) + 2, 0)
			: Math.ceil(Math.max(...values.map((value) => value.length)) / 3) + 2;
		return total + OUTPUT_TOKENS_PER_DIMENSION + answer;
	}, 0);
}

export function buildClassifierRequestBody(classifier: ClassifierRequestConfig, dimensions: ClassifierDimension[], transcript: string): Record<string, unknown> {
	return {
		model: classifier.model,
		stream: false,
		store: false,
		temperature: 0,
		max_output_tokens: classifierOutputTokens(dimensions),
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
export function parseClassifierAnswer(payload: unknown, dimensions: ClassifierDimension[]): ClassifierLabel[] | null {
	const text = responseText(payload).trim();
	if (!text) return null;
	let parsed: Record<string, any>;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const labels: ClassifierLabel[] = [];
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
