// Purpose: Minimal OpenAPI schema handling for the provider simulator.
// Why: Validate captured upstream bodies and synthesise responses without a network or heavy validator.
// How: Resolves local $refs lazily, merges allOf, and reports unknown, mistyped and out-of-enum fields.

export type Schema = Record<string, any>;

export type SchemaDocument = {
	root: any;
	resolve: (schema: Schema | undefined) => Schema | undefined;
};

export function createSchemaDocument(root: any): SchemaDocument {
	const resolveRef = (ref: string): Schema | undefined => {
		if (!ref.startsWith("#/")) return undefined;
		let node = root;
		for (const raw of ref.slice(2).split("/")) {
			const part = raw.replace(/~1/g, "/").replace(/~0/g, "~");
			node = node?.[part];
			if (node === undefined) return undefined;
		}
		return node;
	};
	const resolve = (schema: Schema | undefined): Schema | undefined => {
		let current = schema;
		let guard = 0;
		while (current && typeof current === "object" && typeof current.$ref === "string" && guard < 32) {
			const target = resolveRef(current.$ref);
			const { $ref: _ref, ...rest } = current;
			current = target ? { ...target, ...rest } : undefined;
			guard += 1;
		}
		return current;
	};
	return { root, resolve };
}

function typesOf(schema: Schema): string[] {
	const out = new Set<string>();
	const t = schema.type;
	if (Array.isArray(t)) t.forEach((v) => out.add(v));
	else if (typeof t === "string") out.add(t);
	// nullable without a type (e.g. on an anyOf) allows null but does not restrict the other types.
	if (schema.nullable === true && out.size) out.add("null");
	if (schema.const === null) out.add("null");
	return Array.from(out);
}

function jsonType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (Number.isInteger(value)) return "integer";
	return typeof value;
}

function typeMatches(value: unknown, types: string[]): boolean {
	if (!types.length) return true;
	const actual = jsonType(value);
	if (types.includes(actual)) return true;
	if (actual === "integer" && types.includes("number")) return true;
	return false;
}

export type SchemaIssue = {
	path: string;
	kind: "unknown_field" | "type_mismatch" | "enum_mismatch" | "missing_required" | "no_variant_matched";
	detail: string;
};

type Flat = {
	properties: Record<string, Schema>;
	required: Set<string>;
	/** true only when the schema explicitly allows undeclared keys. */
	openObject: boolean;
	additionalSchema: Schema | null;
	variants: Schema[][];
	types: string[];
	enumValues: unknown[] | null;
	items: Schema | undefined;
};

/** Collects every property schema reachable through allOf, and the oneOf/anyOf variant lists. */
function flatten(doc: SchemaDocument, schema: Schema | undefined, depth = 0): Flat {
	const out: Flat = {
		properties: {},
		required: new Set(),
		openObject: false,
		additionalSchema: null,
		variants: [],
		types: [],
		enumValues: null,
		items: undefined,
	};
	const resolved = doc.resolve(schema);
	if (!resolved || depth > 12) return out;
	for (const [key, value] of Object.entries(resolved.properties ?? {})) out.properties[key] = value as Schema;
	for (const key of resolved.required ?? []) out.required.add(key);
	if (resolved.additionalProperties === true) out.openObject = true;
	else if (resolved.additionalProperties && typeof resolved.additionalProperties === "object") {
		if (Object.keys(resolved.additionalProperties).length === 0) out.openObject = true;
		else out.additionalSchema = resolved.additionalProperties;
	}
	out.types = typesOf(resolved);
	if (Array.isArray(resolved.enum)) out.enumValues = resolved.enum;
	if (resolved.const !== undefined) out.enumValues = [resolved.const];
	out.items = resolved.items;
	for (const part of resolved.allOf ?? []) {
		const inner = flatten(doc, part, depth + 1);
		Object.assign(out.properties, inner.properties);
		inner.required.forEach((key) => out.required.add(key));
		if (inner.openObject) out.openObject = true;
		if (inner.additionalSchema && !out.additionalSchema) out.additionalSchema = inner.additionalSchema;
		out.variants.push(...inner.variants);
		if (!out.types.length) out.types = inner.types;
		if (!out.enumValues && inner.enumValues) out.enumValues = inner.enumValues;
		if (!out.items && inner.items) out.items = inner.items;
	}
	const variants = (resolved.oneOf ?? resolved.anyOf) as Schema[] | undefined;
	if (Array.isArray(variants) && variants.length) out.variants.push(variants);
	return out;
}

const MAX_ISSUES = 200;

function variantPropertyNames(doc: SchemaDocument, variants: Schema[][], depth = 0): Set<string> {
	const out = new Set<string>();
	if (depth > 6) return out;
	for (const list of variants) {
		for (const variant of list) {
			const inner = flatten(doc, variant);
			Object.keys(inner.properties).forEach((key) => out.add(key));
			variantPropertyNames(doc, inner.variants, depth + 1).forEach((key) => out.add(key));
		}
	}
	return out;
}

function dedupe(issues: SchemaIssue[]): SchemaIssue[] {
	const seen = new Set<string>();
	const out: SchemaIssue[] = [];
	for (const issue of issues) {
		const key = `${issue.path}|${issue.kind}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(issue);
	}
	issues.length = 0;
	issues.push(...out.slice(0, MAX_ISSUES));
	return issues;
}

/**
 * Validates a value. Undeclared keys on an object with declared properties are
 * reported as unknown unless the schema explicitly opens the object: a provider
 * that does not document a field may reject it.
 */
export function validateAgainstSchema(
	doc: SchemaDocument,
	schema: Schema | undefined,
	value: unknown,
	path = "$",
	issues: SchemaIssue[] = [],
	depth = 0,
	inheritedKeys: Set<string> = new Set(),
): SchemaIssue[] {
	if (!schema || issues.length >= MAX_ISSUES || depth > 40) return issues;
	const shape = flatten(doc, schema);

	const resolvedSelf = doc.resolve(schema);
	if (value === null && (shape.types.includes("null") || shape.types.length === 0 || resolvedSelf?.nullable === true)) return issues;

	const ownKeys = new Set([...inheritedKeys, ...Object.keys(shape.properties)]);
	for (const rawList of shape.variants) {
		// Pick branches by a "type" discriminator when the value has one, as providers do.
		const discriminator = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).type : undefined;
		let variantList = rawList;
		if (typeof discriminator === "string") {
			const typed = rawList.map((variant) => ({ variant, allowed: enumValuesOf(doc, flatten(doc, variant).properties.type) }));
			if (typed.some((entry) => entry.allowed)) {
				const matching = typed.filter((entry) => entry.allowed?.includes(discriminator)).map((entry) => entry.variant);
				if (!matching.length) {
					const allowed = Array.from(new Set(typed.flatMap((entry) => entry.allowed ?? [])));
					issues.push({ path: `${path}.type`, kind: "enum_mismatch", detail: `${JSON.stringify(discriminator)} not in [${allowed.slice(0, 16).map((v) => JSON.stringify(v)).join(", ")}]` });
					continue;
				}
				variantList = matching;
			}
		}
		const scored = variantList.map((variant) => ({
			variant,
			local: validateAgainstSchema(doc, variant, value, path, [], depth + 1, ownKeys),
		}));
		const exact = scored.find((entry) => entry.local.length === 0);
		if (!exact) {
			// Report the closest variant so the issue names concrete fields.
			const best = scored
				.filter((entry) => !entry.local.some((issue) => issue.path === path && issue.kind === "type_mismatch"))
				.sort((a, b) => a.local.length - b.local.length)[0];
			if (best) issues.push(...best.local);
			else issues.push({ path, kind: "no_variant_matched", detail: `value of type ${jsonType(value)} matches none of ${variantList.length} variants` });
		}
	}

	if (shape.types.length && !typeMatches(value, shape.types)) {
		issues.push({ path, kind: "type_mismatch", detail: `expected ${shape.types.join("|")}, got ${jsonType(value)}` });
		return dedupe(issues);
	}
	if (shape.enumValues && !shape.enumValues.some((candidate) => candidate === value)) {
		if (!(value === null && shape.types.includes("null"))) {
			issues.push({ path, kind: "enum_mismatch", detail: `${JSON.stringify(value)} not in [${shape.enumValues.slice(0, 12).map((v) => JSON.stringify(v)).join(", ")}]` });
		}
	}

	if (value && typeof value === "object" && !Array.isArray(value)) {
		const hasShape = Object.keys(shape.properties).length > 0;
		const variantKeys = shape.variants.length ? variantPropertyNames(doc, shape.variants) : new Set<string>();
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			const childSchema = shape.properties[key];
			if (childSchema) {
				validateAgainstSchema(doc, childSchema, child, `${path}.${key}`, issues, depth + 1);
			} else if (shape.additionalSchema) {
				validateAgainstSchema(doc, shape.additionalSchema, child, `${path}.${key}`, issues, depth + 1);
			} else if (hasShape && !shape.openObject && !inheritedKeys.has(key) && !variantKeys.has(key)) {
				issues.push({ path: `${path}.${key}`, kind: "unknown_field", detail: "not defined by the provider schema" });
			}
		}
		if (hasShape) {
			for (const key of shape.required) {
				if (!(key in (value as Record<string, unknown>))) {
					issues.push({ path: `${path}.${key}`, kind: "missing_required", detail: "required by the provider schema" });
				}
			}
		}
	}
	if (Array.isArray(value) && shape.items) {
		value.forEach((item, index) => validateAgainstSchema(doc, shape.items, item, `${path}[${index}]`, issues, depth + 1));
	}
	return dedupe(issues);
}

/** Every integer leaf path under a schema, used to synthesise usage objects. */
export function integerLeafPaths(doc: SchemaDocument, schema: Schema | undefined, prefix = "", depth = 0, seen: Set<Schema> = new Set()): string[] {
	const resolved = doc.resolve(schema);
	if (!resolved || depth > 6 || seen.has(resolved)) return [];
	const nextSeen = new Set(seen).add(resolved);
	const shape = flatten(doc, resolved);
	const out: string[] = [];
	if (shape.types.includes("integer") || (shape.types.includes("number") && /token|count/i.test(prefix))) {
		out.push(prefix);
	}
	for (const [key, child] of Object.entries(shape.properties)) {
		out.push(...integerLeafPaths(doc, child, prefix ? `${prefix}.${key}` : key, depth + 1, nextSeen));
	}
	for (const variantList of shape.variants) {
		for (const variant of variantList) out.push(...integerLeafPaths(doc, variant, prefix, depth + 1, nextSeen));
	}
	return Array.from(new Set(out.filter(Boolean)));
}

/** Top-level documented property names of a request schema. */
export function topLevelProperties(doc: SchemaDocument, schema: Schema | undefined): Record<string, Schema> {
	const shape = flatten(doc, schema);
	const props = { ...shape.properties };
	for (const variantList of shape.variants) {
		for (const variant of variantList) Object.assign(props, flatten(doc, variant).properties);
	}
	return props;
}

export function enumValuesOf(doc: SchemaDocument, schema: Schema | undefined, depth = 0): unknown[] | null {
	const shape = flatten(doc, schema);
	if (shape.enumValues) return shape.enumValues;
	if (depth > 4) return null;
	const merged: unknown[] = [];
	for (const variantList of shape.variants) {
		for (const variant of variantList) {
			const inner = enumValuesOf(doc, variant, depth + 1);
			if (inner) merged.push(...inner);
		}
	}
	return merged.length ? Array.from(new Set(merged)) : null;
}

export function typeOf(doc: SchemaDocument, schema: Schema | undefined): string[] {
	return flatten(doc, schema).types;
}
