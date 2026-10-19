// Request classifiers: a workspace taxonomy that a chosen model applies to each
// finished request. Each dimension's answer is written onto the request as a
// label (key = dimension key), so classifier output filters and groups exactly
// like labels sent in the x-phaseo-metadata header.

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
	// A misspelt field would otherwise fall back to the defaults (full sampling, no budget).
	const unknown = Object.keys(body).find((field) => !CLASSIFIER_INPUT_FIELDS.has(field));
	if (unknown !== undefined) return fail(`Unknown field: ${unknown}`);
	const fields: ClassifierFields = {};
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
