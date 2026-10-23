import { z } from "zod";

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/);
const finite = z.number().finite();
const scalar = z.union([z.string().max(2000), finite, z.boolean()]);
const unit = z.enum(["token", "image", "megapixel", "second", "character", "request", "search", "byte", "pixel"]);
const limit = z.strictObject({ value: finite.nonnegative(), unit: unit.optional() });

// Descriptors are declarations, never a mechanism for forwarding arbitrary parameters.
const descriptor: z.ZodType = z.lazy(() => z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("range"), min: finite, max: finite, default: finite.optional(), unit: unit.optional() }),
	z.strictObject({ type: z.literal("integer"), min: finite.int().optional(), max: finite.int().optional(), default: finite.int().optional(), unit: unit.optional() }),
	z.strictObject({ type: z.literal("boolean"), default: z.boolean().optional() }),
	z.strictObject({ type: z.literal("enum"), values: z.array(scalar).min(1).max(128), default: scalar.optional() }),
	z.strictObject({ type: z.literal("array"), items: descriptor, max_items: finite.int().nonnegative().max(100000).optional(), default: z.json().optional() }),
	z.strictObject({ type: z.literal("object"), properties: z.record(key, descriptor), default: z.json().optional() }),
	z.strictObject({ type: z.literal("unknown"), default: z.json().optional() }),
]));
const parameters = z.record(key, descriptor);
const predicate: z.ZodType = z.lazy(() => z.union([
	z.strictObject({ path: key, op: z.enum(["eq", "in", "gt", "gte", "lt", "lte"]), value: z.union([scalar, z.array(scalar).min(1).max(128)]) }),
	z.strictObject({ all: z.array(predicate).min(1).max(16) }),
	z.strictObject({ any: z.array(predicate).min(1).max(16) }),
	z.strictObject({ not: predicate }),
]));
const schedule = z.strictObject({
	utc_start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
	utc_end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
	utc_days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1).max(7).optional(),
});
const money = { price_nanos: z.number().int().safe().nonnegative(), unit_quantity: z.number().positive().finite() };
const price = z.strictObject({
	kind: z.enum(["input", "output", "cached_read", "cache_write", "reasoning", "request", "web_search"]),
	unit: unit.exclude(["byte", "pixel"]), ...money,
	cache_ttl_seconds: finite.int().positive().optional(), implicit: z.boolean().optional(),
	schedule: schedule.optional(),
	overrides: z.array(z.strictObject({ when: predicate, ...money })).max(32).optional(),
});
const capacity = z.strictObject({
	kind: z.enum(["input", "output", "cached_read", "request", "concurrency"]),
	unit: unit.exclude(["byte", "pixel"]), value: finite.positive(),
	per: z.enum(["minute", "hour", "day"]).optional(),
});
const mediaSource = z.array(z.enum(["url", "base64"])).min(1).max(2);
const mediaFormats = z.array(z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/).max(128)).min(1).max(64);
const mediaConstraints = {
	sources: mediaSource.optional(), formats: mediaFormats.optional(),
	max_content_size_bytes: limit.optional(), max_duration_seconds: limit.optional(),
};
const ioFields = {
	pricing: z.array(price).max(64).optional(), capacity: z.array(capacity).max(64).optional(),
	passthrough_parameters: parameters.optional(),
};
const input = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("text"), supported_inputs: z.strictObject({ max_context_length: limit.optional(), max_prompt_length: limit.optional() }).optional(), ...ioFields }),
	z.strictObject({ type: z.literal("image"), supported_inputs: z.strictObject({
		sources: mediaSource.optional(), formats: mediaFormats.optional(), max_content_size_bytes: limit.optional(),
		detail_levels: z.array(z.enum(["auto", "low", "high", "original"])).max(4).optional(),
		roles: z.array(z.enum(["reference", "first_frame", "last_frame"])).max(3).optional(), references: limit.optional(),
	}).optional(), ...ioFields }),
	z.strictObject({ type: z.literal("video"), supported_inputs: z.strictObject(mediaConstraints).optional(), ...ioFields }),
	z.strictObject({ type: z.literal("audio"), supported_inputs: z.strictObject(mediaConstraints).optional(), ...ioFields }),
	z.strictObject({ type: z.literal("file"), supported_inputs: z.strictObject({ sources: mediaSource.optional(), formats: mediaFormats.optional(), references: limit.optional(), max_content_size_bytes: limit.optional() }).optional(), ...ioFields }),
]);
const output = z.strictObject({
	type: z.enum(["text", "image", "video", "speech", "transcription", "embeddings", "rerank", "audio"]),
	supported_parameters: parameters, streaming: z.boolean().optional(), max_length: limit.optional(), ...ioFields,
});

/** Optional claims retained for review. Existing live capability/price fields remain authoritative. */
export const catalogDeclarationsSchema = z.strictObject({
	hugging_face_id: z.string().min(1).max(256).optional(),
	created_at: z.iso.datetime({ offset: true }).optional(),
	quantization: z.enum(["int4", "int8", "fp4", "mxfp4", "nvfp4", "fp6", "fp8", "mxfp8", "fp16", "bf16", "fp32"]).nullable().optional(),
	tokenizer: z.string().min(1).max(128).optional(),
	input_modalities: z.array(input).min(1).max(5).optional(),
	output_modalities: z.array(output).min(1).max(8).optional(),
	pricing: z.array(price).max(64).optional(), capacity: z.array(capacity).max(64).optional(),
	passthrough_parameters: parameters.optional(),
	datacenters: z.array(z.strictObject({ country_code: z.string().regex(/^[A-Z]{2}$/), region: z.string().min(1).max(128).optional() })).max(64).optional(),
	deployment_region: z.string().min(1).max(128).optional(),
	discount_to_user: finite.lt(1).optional(),
	is_free: z.boolean().optional(),
});
export type CatalogDeclarations = z.infer<typeof catalogDeclarationsSchema>;

// Rebase recursive references when embedding this schema in the feed's $defs.
function rebase(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(rebase);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
		name === "$ref" && typeof item === "string" && item.startsWith("#") ? `#/$defs/catalogDeclarations${item.slice(1)}` : rebase(item)]));
}
export const catalogDeclarationsJsonSchema = rebase(z.toJSONSchema(catalogDeclarationsSchema)) as Record<string, unknown>;

export function parseCatalogDeclarations(value: unknown) {
	// Guard recursive schema traversal before Zod sees untrusted descriptors/predicates.
	const pending: Array<[unknown, number]> = [[value, 0]];
	let nodes = 0;
	while (pending.length) {
		const [item, depth] = pending.pop()!;
		if (++nodes > 10000 || depth > 16) return { declarations: undefined, issues: [{ path: "", message: "Declaration exceeds the nesting or size limit." }] };
		if (item && typeof item === "object") for (const child of Object.values(item)) pending.push([child, depth + 1]);
	}
	const parsed = catalogDeclarationsSchema.safeParse(value);
	if (!parsed.success) return {
		declarations: undefined, issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
	};
	const issues: Array<{ path: string; message: string }> = [];
	const inspect = (item: unknown, path: string) => {
		if (!item || typeof item !== "object") return;
		const entry = item as Record<string, any>;
		if (Object.keys(entry).length > 128) issues.push({ path, message: "Too many declaration fields." });
		if (["range", "integer"].includes(entry.type)) {
			if (entry.min != null && entry.max != null && entry.min > entry.max) issues.push({ path, message: "Minimum must not exceed maximum." });
			if (entry.default != null && ((entry.min != null && entry.default < entry.min) || (entry.max != null && entry.default > entry.max))) issues.push({ path, message: "Default is outside the declared range." });
		}
		if (entry.type === "enum" && entry.default !== undefined && !entry.values.includes(entry.default)) issues.push({ path, message: "Default is not one of the enum values." });
		if (entry.op === "in" && !Array.isArray(entry.value)) issues.push({ path, message: "Membership conditions require a list." });
		if (["gt", "gte", "lt", "lte"].includes(entry.op) && typeof entry.value !== "number") issues.push({ path, message: "Ordered conditions require a numeric value." });
		if (entry.kind === "concurrency" && (entry.unit !== "request" || entry.per !== undefined || !Number.isInteger(entry.value))) issues.push({ path, message: "Concurrency is an integer number of requests without a time window." });
		if (entry.value !== undefined && entry.kind !== undefined && entry.kind !== "concurrency" && !entry.per) issues.push({ path, message: "Throughput capacity requires a time window." });
		if (entry.schedule && entry.schedule.utc_start === entry.schedule.utc_end) issues.push({ path, message: "A pricing window must have distinct start and end times." });
		for (const [name, child] of Object.entries(entry)) inspect(child, `${path}.${name}`);
	};
	inspect(parsed.data, "");
	const scoped = (scope: { pricing?: z.infer<typeof price>[]; capacity?: z.infer<typeof capacity>[] }, direction: "input" | "output" | "request", path: string) => {
		const priceKeys = new Set<string>();
		for (const [index, item] of (scope.pricing ?? []).entries()) {
			const allowed = direction === "input" ? ["input", "cached_read", "cache_write"] : direction === "output" ? ["output", "reasoning"] : ["request", "web_search"];
			if (!allowed.includes(item.kind) || (direction === "input" && ["request", "search"].includes(item.unit))
				|| (direction === "output" && item.unit === "search") || (item.kind === "web_search" && item.unit !== "search") || (item.kind === "request" && item.unit !== "request")) issues.push({ path: `${path}.pricing.${index}`, message: "Price kind or unit does not belong to this scope." });
			if ((item.cache_ttl_seconds !== undefined || item.implicit !== undefined) && !["cached_read", "cache_write"].includes(item.kind)) issues.push({ path: `${path}.pricing.${index}`, message: "Cache qualifiers require a cache price." });
			const identity = JSON.stringify([item.kind, item.unit, item.cache_ttl_seconds ?? null, item.implicit ?? null, item.schedule ?? null]);
			if (priceKeys.has(identity)) issues.push({ path: `${path}.pricing.${index}`, message: "Duplicate price declaration." });
			priceKeys.add(identity);
		}
		const capacityKeys = new Set<string>();
		for (const [index, item] of (scope.capacity ?? []).entries()) {
			const allowed = direction === "input" ? ["input", "cached_read"] : direction === "output" ? ["output", "concurrency"] : ["request", "concurrency"];
			if (!allowed.includes(item.kind)) issues.push({ path: `${path}.capacity.${index}`, message: "Capacity kind does not belong to this scope." });
			if (item.kind === "request" && item.unit !== "request") issues.push({ path: `${path}.capacity.${index}`, message: "Request capacity uses request units." });
			const identity = JSON.stringify([item.kind, item.unit, item.per ?? null]);
			if (capacityKeys.has(identity)) issues.push({ path: `${path}.capacity.${index}`, message: "Duplicate capacity declaration." });
			capacityKeys.add(identity);
		}
	};
	scoped(parsed.data, "request", "");
	for (const [direction, modalities] of [["input", parsed.data.input_modalities], ["output", parsed.data.output_modalities]] as const) {
		const seen = new Set<string>();
		for (const [index, modality] of (modalities ?? []).entries()) {
			if (seen.has(modality.type)) issues.push({ path: `${direction}_modalities.${index}`, message: "Duplicate modality declaration." });
			seen.add(modality.type);
			scoped(modality, direction, `${direction}_modalities.${index}`);
		}
	}
	return { declarations: issues.length ? undefined : parsed.data, issues };
}
