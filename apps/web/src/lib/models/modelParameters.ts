// Generated from packages/shared/model-parameters/index.ts by scripts/sync-model-parameters.mjs. Do not edit.
// Purpose: One shape for the request parameters a model route accepts.
// Why: v2_route_capabilities.params grew dozens of spellings for the same facts
//      (values, enum, supported_values, supported_efforts; default, default_value;
//      min, provider_min, gateway_min; maps_to, upstream_parameter, provider_param;
//      values_by_size and conditions written only as notes). Every reader parsed them
//      differently. This normaliser reads every stored spelling and returns one
//      shape, which the models API returns as `parameter_specs` and the web
//      playground reads for its options.
// How: normalizeParameterSpecs(params) takes the stored params in any of their
//      container forms. Conditions are kept on the parameter they restrict, as
//      `when` rules; resolveParameterSpec applies them for a selection, and
//      parameterOptions lists what a picker can offer.
// Copied into apps by scripts/sync-model-parameters.mjs; edit only this file.

export type ParameterValue = string | number | boolean;

export type ParameterType =
	| "string"
	| "integer"
	| "number"
	| "boolean"
	| "array"
	| "object"
	| "file";

/** One allowed value with optional display details (voices, presets). */
export type ParameterOption = {
	value: ParameterValue;
	label?: string;
	description?: string;
	[key: string]: unknown;
};

/**
 * A condition on other parameters: when every listed parameter has one of the
 * listed values, the rule's fields replace the parameter's own. A rule with
 * `supported: false` means the parameter cannot be sent in that case.
 */
export type ParameterRule = {
	if: Record<string, ParameterValue[]>;
	values?: ParameterValue[];
	min?: number;
	max?: number;
	step?: number;
	default?: ParameterValue;
	supported?: boolean;
	message?: string;
};

export type ParameterDimensions = {
	min?: number;
	max?: number;
	multiple_of?: number;
	max_width?: number;
	max_height?: number;
	min_pixels?: number;
	max_pixels?: number;
	max_aspect_ratio?: string;
	aspect_ratios?: string[];
};

export type ParameterSpec = {
	supported: boolean;
	/** A list means the parameter accepts any of these types. */
	type?: ParameterType | ParameterType[];
	/** For file parameters: what kind of file (image, audio, video). */
	media?: "image" | "audio" | "video";
	/** The only values accepted. */
	values?: ParameterValue[];
	/** Values with display details, in the same order as `values`. */
	options?: ParameterOption[];
	min?: number;
	max?: number;
	step?: number;
	multiple_of?: number;
	/** What Phaseo sends when the request leaves the parameter out. */
	default?: ParameterValue;
	/** What the provider does when the parameter is left out. */
	provider_default?: ParameterValue;
	required?: boolean;
	/** The parameter is always on and cannot be turned off. */
	always_on?: boolean;
	/** Other request fields accepted for this parameter. */
	aliases?: string[];
	/** This parameter is an alias of another one. */
	alias_of?: string;
	/** The field name the provider uses. */
	upstream_name?: string;
	/** The provider's spelling of each entry in `values`, in the same order. */
	upstream_values?: ParameterValue[];
	/** Other parameters that must be sent with this one. */
	requires?: string[];
	min_length?: number;
	max_length?: number;
	max_tokens?: number;
	min_items?: number;
	max_items?: number;
	item_types?: string[];
	formats?: string[];
	max_file_size_bytes?: number;
	format?: string;
	dimensions?: ParameterDimensions;
	/** Sub-fields of an object parameter. */
	properties?: Record<string, ParameterSpec>;
	when?: ParameterRule[];
	/** How the gateway supports it (native, emulated, …) when the catalogue says. */
	support_level?: string;
	notes?: string;
	source?: { url?: string; verified_at?: string };
	/** Stored keys this version does not map yet, kept as they are. */
	extra?: Record<string, unknown>;
};

export type ParameterSpecs = Record<string, ParameterSpec>;

export type ParameterSelection = Record<string, unknown>;

const TYPES = new Set<ParameterType>(["string", "integer", "number", "boolean", "array", "object", "file"]);
const MEDIA = new Set(["image", "audio", "video"]);
/** Keys of one object that describe a sub-field rather than the field itself. */
const NESTED_KEYS = new Set(["effort", "enabled", "ttl", "mode", "include_usage"]);
/** Keys read into other fields, or dropped because they only identify the entry. */
const CONSUMED_KEYS = new Set([
	"supported", "type", "values", "enum", "options", "supported_values", "allowed_values", "supported_efforts",
	"value_schema", "min", "max", "range", "step", "provider_min", "provider_max", "gateway_min", "gateway_max",
	"multiple_of", "default", "default_value", "default_effort", "default_voice", "provider_default",
	"required", "mandatory", "always_on", "aliases", "alias_for", "maps_to", "upstream_parameter", "provider_param",
	"provider_values", "requires", "min_length", "max_length", "max_tokens", "min_items", "max_items",
	"gateway_max_items", "item_types", "formats", "max_file_size_mb", "max_bytes", "format",
	"dimension_min", "dimension_max", "dimension_multiple_of", "max_width", "max_height", "min_pixels",
	"max_pixels", "max_aspect_ratio", "aspect_ratio_values", "properties", "when", "values_by_size",
	"support_level", "notes", "source_url", "verified_at", "verified_on", "param_id", "name", "id",
	// Added by the catalogue when it merges providers; internal ids, not part of the spec.
	"providers",
	...NESTED_KEYS,
]);
/** Range sizes parameterOptions will spell out as a list. */
export const MAX_RANGE_OPTIONS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
	return undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isValue(value: unknown): value is ParameterValue {
	return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function stringList(value: unknown): string[] | undefined {
	const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
	const out = Array.from(new Set(list.map(text).filter((entry): entry is string => Boolean(entry))));
	return out.length ? out : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
	return values.find((value) => value !== undefined);
}

/** Values plus display details from a list of strings, numbers or objects. */
function readValueList(list: unknown): { values: ParameterValue[]; options?: ParameterOption[] } | undefined {
	if (!Array.isArray(list)) return undefined;
	const values: ParameterValue[] = [];
	const options: ParameterOption[] = [];
	let rich = false;
	const seen = new Set<string>();
	for (const entry of list) {
		let option: ParameterOption | null = null;
		if (isValue(entry)) option = { value: entry };
		else if (isRecord(entry)) {
			const value = [entry.value, entry.id, entry.voice_id, entry.voiceId, entry.name].find(isValue);
			if (value !== undefined) {
				const { value: _v, id: _i, voice_id: _vi, voiceId: _vI, ...rest } = entry;
				const label = text(entry.label) ?? (entry.name !== value ? text(entry.name) : undefined);
				option = { ...rest, value, ...(label ? { label } : {}) };
				delete option.name;
				if (label) option.label = label;
				rich = true;
			}
		}
		if (!option) continue;
		const key = `${typeof option.value}:${String(option.value)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		values.push(option.value);
		options.push(option);
	}
	if (!values.length) return undefined;
	return rich ? { values, options } : { values };
}

function inferType(values: ParameterValue[]): ParameterType | undefined {
	if (values.every((value) => typeof value === "boolean")) return "boolean";
	if (values.every((value) => typeof value === "number")) {
		return values.every((value) => Number.isInteger(value)) ? "integer" : "number";
	}
	if (values.every((value) => typeof value === "string")) return "string";
	return undefined;
}

function readType(raw: unknown, values: ParameterValue[] | undefined): Pick<ParameterSpec, "type" | "media"> {
	const name = text(raw)?.toLowerCase();
	const inferred = values ? inferType(values) : undefined;
	if (!name || name === "enum") return inferred ? { type: inferred } : {};
	const parts = name.split("_or_");
	const types: ParameterType[] = [];
	let media: ParameterSpec["media"];
	for (const part of parts) {
		if (MEDIA.has(part)) {
			media = part as ParameterSpec["media"];
			types.push("file");
		} else if (TYPES.has(part as ParameterType)) types.push(part as ParameterType);
	}
	if (!types.length) return inferred ? { type: inferred } : {};
	const unique = Array.from(new Set(types));
	// A whole-number list stored as "number" is an integer parameter.
	const type = unique.length === 1 && unique[0] === "number" && inferred === "integer" ? "integer" : unique;
	return { type: Array.isArray(type) && type.length === 1 ? type[0] : type, ...(media ? { media } : {}) };
}

function readSource(raw: Record<string, unknown>): ParameterSpec["source"] {
	const url = text(raw.source_url);
	const verified = text(raw.verified_at) ?? text(raw.verified_on);
	if (!url && !verified) return undefined;
	return { ...(url ? { url } : {}), ...(verified ? { verified_at: verified } : {}) };
}

function readDimensions(raw: Record<string, unknown>): ParameterDimensions | undefined {
	const dimensions: ParameterDimensions = {};
	const set = <K extends keyof ParameterDimensions>(key: K, value: ParameterDimensions[K] | undefined) => {
		if (value !== undefined) dimensions[key] = value;
	};
	set("min", finite(raw.dimension_min));
	set("max", finite(raw.dimension_max));
	set("multiple_of", finite(raw.dimension_multiple_of));
	set("max_width", finite(raw.max_width));
	set("max_height", finite(raw.max_height));
	set("min_pixels", finite(raw.min_pixels));
	set("max_pixels", finite(raw.max_pixels));
	set("max_aspect_ratio", text(raw.max_aspect_ratio));
	set("aspect_ratios", stringList(raw.aspect_ratio_values));
	return Object.keys(dimensions).length ? dimensions : undefined;
}

function readRules(raw: Record<string, unknown>): ParameterRule[] | undefined {
	const rules: ParameterRule[] = [];
	if (Array.isArray(raw.when)) {
		for (const entry of raw.when) {
			if (!isRecord(entry) || !isRecord(entry.if)) continue;
			const conditions: Record<string, ParameterValue[]> = {};
			for (const [name, value] of Object.entries(entry.if)) {
				const list = (Array.isArray(value) ? value : [value]).filter(isValue);
				if (list.length) conditions[name] = list;
			}
			if (!Object.keys(conditions).length) continue;
			const rule: ParameterRule = { if: conditions };
			const values = readValueList(entry.values)?.values;
			if (values) rule.values = values;
			for (const key of ["min", "max", "step"] as const) {
				const value = finite(entry[key]);
				if (value !== undefined) rule[key] = value;
			}
			if (isValue(entry.default)) rule.default = entry.default;
			if (typeof entry.supported === "boolean") rule.supported = entry.supported;
			const message = text(entry.message);
			if (message) rule.message = message;
			rules.push(rule);
		}
	}
	// Legacy: { "values_by_size": { "1080p": [8] } } on a duration.
	if (isRecord(raw.values_by_size)) {
		for (const [size, list] of Object.entries(raw.values_by_size)) {
			const values = readValueList(list)?.values;
			if (values) rules.push({ if: { size: [size] }, values });
		}
	}
	return rules.length ? rules : undefined;
}

/** Normalises one stored parameter description (any spelling) to a ParameterSpec. */
export function normalizeParameterSpec(raw: unknown): ParameterSpec {
	if (typeof raw === "boolean") return { supported: raw };
	if (Array.isArray(raw)) {
		const list = readValueList(raw);
		return { supported: true, ...(list ?? {}), ...(list ? readType(undefined, list.values) : {}) };
	}
	if (!isRecord(raw)) return { supported: true };
	const schema = isRecord(raw.value_schema) ? raw.value_schema : {};
	const list =
		readValueList(raw.values) ??
		readValueList(raw.enum) ??
		readValueList(raw.options) ??
		readValueList(raw.supported_values) ??
		readValueList(raw.allowed_values) ??
		readValueList(raw.supported_efforts) ??
		readValueList(schema.enum) ??
		readValueList(schema.values);
	const spec: ParameterSpec = {
		supported: raw.supported === false || text(raw.support_level) === "unsupported" ? false : true,
		...readType(raw.type ?? schema.type, list?.values),
	};
	if (list) {
		spec.values = list.values;
		if (list.options) spec.options = list.options;
	}
	// Legacy: { "range": [0, 2] }.
	const range = Array.isArray(raw.range) && raw.range.length === 2 ? raw.range : [];
	const min = firstDefined(finite(raw.gateway_min), finite(raw.min), finite(range[0]), finite(raw.provider_min));
	const max = firstDefined(finite(raw.gateway_max), finite(raw.max), finite(range[1]), finite(raw.provider_max));
	if (min !== undefined) spec.min = min;
	if (max !== undefined) spec.max = max;
	const step = finite(raw.step);
	if (step !== undefined && step > 0) spec.step = step;
	const multipleOf = finite(raw.multiple_of);
	if (multipleOf !== undefined) spec.multiple_of = multipleOf;
	const defaultValue = [raw.default, raw.default_value, raw.default_effort, raw.default_voice, schema.default].find(isValue);
	if (defaultValue !== undefined) spec.default = defaultValue;
	if (isValue(raw.provider_default)) spec.provider_default = raw.provider_default;
	if (raw.required === true || raw.mandatory === true) spec.required = true;
	else if (raw.required === false) spec.required = false;
	if (raw.always_on === true) spec.always_on = true;
	const aliases = stringList(raw.aliases);
	if (aliases) spec.aliases = aliases;
	const aliasOf = text(raw.alias_for);
	if (aliasOf) spec.alias_of = aliasOf;
	const upstream = text(raw.maps_to) ?? text(raw.upstream_parameter) ?? text(raw.provider_param);
	if (upstream) spec.upstream_name = upstream;
	const upstreamValues = readValueList(raw.provider_values)?.values;
	if (upstreamValues) spec.upstream_values = upstreamValues;
	const requires = stringList(raw.requires);
	if (requires) spec.requires = requires;
	for (const key of ["min_length", "max_length", "max_tokens", "min_items"] as const) {
		const value = finite(raw[key]);
		if (value !== undefined) spec[key] = value;
	}
	const maxItems = firstDefined(finite(raw.gateway_max_items), finite(raw.max_items));
	if (maxItems !== undefined) spec.max_items = maxItems;
	const itemTypes = stringList(raw.item_types);
	if (itemTypes) spec.item_types = itemTypes;
	const formats = stringList(raw.formats);
	if (formats) spec.formats = formats;
	const megabytes = finite(raw.max_file_size_mb);
	const bytes = firstDefined(finite(raw.max_bytes), megabytes === undefined ? undefined : megabytes * 1024 * 1024);
	if (bytes !== undefined) spec.max_file_size_bytes = bytes;
	const format = text(raw.format);
	if (format) spec.format = format;
	const dimensions = readDimensions(raw);
	if (dimensions) spec.dimensions = dimensions;
	const properties: ParameterSpecs = {};
	if (isRecord(raw.properties)) {
		for (const [name, value] of Object.entries(raw.properties)) properties[name] = normalizeParameterSpec(value);
	}
	for (const key of NESTED_KEYS) {
		if (isRecord(raw[key])) properties[key] = normalizeParameterSpec(raw[key]);
	}
	if (Object.keys(properties).length) spec.properties = properties;
	const rules = readRules(raw);
	if (rules) spec.when = rules;
	const supportLevel = text(raw.support_level);
	if (supportLevel) spec.support_level = supportLevel;
	const notes = text(raw.notes);
	if (notes) spec.notes = notes;
	const source = readSource(raw);
	if (source) spec.source = source;
	const extra = Object.fromEntries(Object.entries(raw).filter(([key, value]) => !CONSUMED_KEYS.has(key) && value != null));
	if (Object.keys(extra).length) spec.extra = extra;
	return spec;
}

function mergeSpecs(current: ParameterSpec | undefined, next: ParameterSpec): ParameterSpec {
	if (!current) return next;
	// A bare name from a list adds nothing to a detailed description.
	if (Object.keys(next).length === 1 && next.supported) return current;
	if (Object.keys(current).length === 1 && current.supported) return next;
	return { ...current, ...next };
}

/**
 * Every stored container form, normalised: a map of name to description, a
 * list of names, a list of descriptions keyed by param_id (or name, id), and a
 * `request.allowlist` / `params` list of names.
 */
export function normalizeParameterSpecs(params: unknown): ParameterSpecs {
	const out: ParameterSpecs = {};
	const add = (name: unknown, raw: unknown) => {
		const key = text(name);
		if (!key) return;
		out[key] = mergeSpecs(out[key], normalizeParameterSpec(raw));
	};
	if (typeof params === "string") {
		add(params, true);
		return out;
	}
	if (Array.isArray(params)) {
		for (const entry of params) {
			if (typeof entry === "string") add(entry, true);
			else if (isRecord(entry)) add(entry.param_id ?? entry.name ?? entry.id, entry);
		}
		return out;
	}
	if (!isRecord(params)) return out;
	for (const [name, raw] of Object.entries(params)) {
		if (name === "request" && isRecord(raw)) {
			for (const listed of stringList(raw.allowlist ?? raw.params) ?? []) add(listed, true);
			continue;
		}
		if (name === "params" && Array.isArray(raw)) {
			for (const listed of stringList(raw) ?? []) add(listed, true);
			continue;
		}
		// A map whose keys are list positions ("0", "1", …) is a list that was
		// merged into an object: a string is a name, anything else lost its name.
		if (/^\d+$/.test(name)) {
			if (typeof raw === "string") add(raw, true);
			else if (isRecord(raw)) add(raw.param_id ?? raw.name ?? raw.id, raw);
			continue;
		}
		add(isRecord(raw) ? (raw.param_id ?? name) : name, raw);
	}
	return out;
}

function matchesValue(selected: unknown, allowed: ParameterValue[]): boolean {
	if (selected === undefined || selected === null) return false;
	const wanted = String(selected).toLowerCase();
	return allowed.some((value) => String(value).toLowerCase() === wanted);
}

/**
 * The value a rule sees for a parameter: the selection's (under its name or an
 * alias), else the parameter's default, else what the provider does by default.
 */
function selectedValue(specs: ParameterSpecs | undefined, selection: ParameterSelection, name: string): unknown {
	if (name in selection) return selection[name];
	for (const [key, value] of Object.entries(selection)) {
		if (specs?.[key]?.aliases?.includes(name)) return value;
		if (specs?.[name]?.aliases?.includes(key)) return value;
	}
	return specs?.[name]?.default ?? specs?.[name]?.provider_default;
}

/**
 * The spec with every `when` rule that matches the selection applied, last
 * match winning. `specs` resolves aliases in the selection (resolution for size)
 * and supplies defaults for parameters the selection leaves out.
 */
export function resolveParameterSpec(
	spec: ParameterSpec,
	selection: ParameterSelection = {},
	specs?: ParameterSpecs,
): ParameterSpec {
	if (!spec.when?.length) return spec;
	let resolved: ParameterSpec = { ...spec };
	for (const rule of spec.when) {
		const applies = Object.entries(rule.if).every(([name, allowed]) =>
			matchesValue(selectedValue(specs, selection, name), allowed));
		if (!applies) continue;
		const { if: _if, message: _message, ...fields } = rule;
		resolved = { ...resolved, ...fields };
		if (fields.values) {
			const wanted = new Set(fields.values.map((value) => `${typeof value}:${String(value)}`));
			if (resolved.options) resolved.options = resolved.options.filter((option) => wanted.has(`${typeof option.value}:${String(option.value)}`));
			if (resolved.options && !resolved.options.length) delete resolved.options;
		}
	}
	return resolved;
}

/**
 * What a picker can offer: the listed values with their details, or a numeric
 * range spelled out (up to MAX_RANGE_OPTIONS entries). Empty when the
 * parameter is free-form or the range is open or too large.
 */
export function parameterOptions(spec: ParameterSpec | undefined): ParameterOption[] {
	if (!spec || !spec.supported) return [];
	if (spec.values?.length) {
		const byValue = new Map((spec.options ?? []).map((option) => [`${typeof option.value}:${String(option.value)}`, option]));
		return spec.values.map((value) => byValue.get(`${typeof value}:${String(value)}`) ?? { value });
	}
	if (spec.min === undefined || spec.max === undefined || spec.max < spec.min) return [];
	const step = spec.step ?? spec.multiple_of ?? 1;
	if ((spec.max - spec.min) / step + 1 > MAX_RANGE_OPTIONS) return [];
	const options: ParameterOption[] = [];
	for (let value = spec.min; value <= spec.max + 1e-9; value += step) {
		options.push({ value: Math.round(value * 1000) / 1000 });
	}
	return options;
}
