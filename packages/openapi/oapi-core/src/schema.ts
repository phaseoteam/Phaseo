import type { OpenAPIV3 } from "openapi-types";
import type { DiagnosticCollector } from "./diagnostics.js";
import { pascalCaseModelName } from "./naming.js";
import type { IRSchema } from "./ir.js";

type SchemaContext = {
	diagnostics: DiagnosticCollector;
	pointer?: string;
};

export function toIRSchema(
	schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
	ctx: SchemaContext
): IRSchema {
	if (isRef(schema)) {
		return { kind: "ref", name: pascalCaseModelName(refName(schema.$ref)) };
	}

	const { schema: normalizedSchema, nullable } = normalizeNullable(schema);
	let ir = toIRSchemaInner(normalizedSchema, ctx);
	if (nullable) {
		ir = { kind: "nullable", inner: ir };
	}
	return ir;
}

function toIRSchemaInner(
	schema: OpenAPIV3.SchemaObject,
	ctx: SchemaContext
): IRSchema {
	if (schema.enum && schema.enum.length > 0) {
		return { kind: "enum", values: schema.enum as Array<string | number | boolean | null> };
	}

	if (schema.oneOf && schema.oneOf.length > 0) {
		return {
			kind: "union",
			variants: schema.oneOf.map((variant) =>
				toIRSchema(variant as OpenAPIV3.SchemaObject, ctx)
			)
		};
	}

	if (schema.anyOf && schema.anyOf.length > 0) {
		const objectWithRequiredConstraintAnyOf =
			isObjectLikeSchema(schema) &&
			schema.anyOf.every(
				(variant) => !isRef(variant) && isRequiredOnlySchema(variant as OpenAPIV3.SchemaObject)
			);
		if (objectWithRequiredConstraintAnyOf) {
			// Keep object shape and properties; IR cannot fully represent conditional required sets.
		} else {
		return {
			kind: "union",
			variants: schema.anyOf.map((variant) =>
				toIRSchema(variant as OpenAPIV3.SchemaObject, ctx)
			)
		};
		}
	}

	if (schema.allOf && schema.allOf.length > 0) {
		const flattened = flattenAllOf(schema, ctx);
		if (flattened) {
			return toIRSchemaInner(flattened, ctx);
		}
		return {
			kind: "intersection",
			parts: schema.allOf.map((part) =>
				toIRSchema(part as OpenAPIV3.SchemaObject, ctx)
			)
		};
	}

	if (schema.type === "object" || schema.properties || schema.additionalProperties) {
		const properties: Record<string, IRSchema> = {};
		for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
			properties[name] = toIRSchema(propSchema as OpenAPIV3.SchemaObject, {
				...ctx,
				pointer: ctx.pointer ? `${ctx.pointer}/properties/${name}` : undefined
			});
		}

		let additionalProperties: IRSchema | boolean | undefined;
		if (schema.additionalProperties === true) {
			additionalProperties = { kind: "unknown" };
		} else if (schema.additionalProperties === false) {
			additionalProperties = false;
		} else if (schema.additionalProperties) {
			additionalProperties = toIRSchema(
				schema.additionalProperties as OpenAPIV3.SchemaObject,
				{
					...ctx,
					pointer: ctx.pointer ? `${ctx.pointer}/additionalProperties` : undefined
				}
			);
		}

		return {
			kind: "object",
			properties,
			required: schema.required ?? [],
			additionalProperties
		};
	}

	if (schema.type === "array" && schema.items) {
		return {
			kind: "array",
			items: toIRSchema(schema.items as OpenAPIV3.SchemaObject, {
				...ctx,
				pointer: ctx.pointer ? `${ctx.pointer}/items` : undefined
			})
		};
	}

	if (isRequiredOnlySchema(schema)) {
		return {
			kind: "object",
			properties: {},
			required: schema.required ?? [],
			additionalProperties: undefined
		};
	}

	if (schema.type && typeof schema.type === "string") {
		if (schema.type === "string" && schema.format === "binary") {
			return { kind: "binary" };
		}
		if (schema.type === "string" || schema.type === "number" || schema.type === "boolean") {
			return { kind: "primitive", type: schema.type };
		}
		if (schema.type === "integer") {
			return { kind: "primitive", type: "integer" };
		}
	}

	if (Array.isArray(schema.type) && schema.type.length > 0) {
		const variants = schema.type.map((type) =>
			toIRSchemaInner({ ...schema, type }, ctx)
		);
		return { kind: "union", variants };
	}

	ctx.diagnostics.warn(
		"schema.unsupported",
		"Unsupported schema shape; falling back to unknown.",
		ctx.pointer
	);
	return { kind: "unknown" };
}

type SchemaWithTypeArray = Omit<OpenAPIV3.SchemaObject, "type"> & {
	type?: OpenAPIV3.NonArraySchemaObjectType | "array" | (OpenAPIV3.NonArraySchemaObjectType | "array")[];
};

function normalizeNullable(schema: OpenAPIV3.SchemaObject): {
	schema: OpenAPIV3.SchemaObject;
	nullable: boolean;
} {
	let nullable = Boolean(schema.nullable);
	let normalized: SchemaWithTypeArray = { ...schema };
	if (Array.isArray(schema.type)) {
		const types = schema.type.filter((type) => type !== "null");
		if (types.length !== schema.type.length) {
			nullable = true;
		}
		if (types.length === 1) {
			normalized = { ...normalized, type: types[0] as OpenAPIV3.NonArraySchemaObjectType };
		} else {
			normalized = { ...normalized, type: types as SchemaWithTypeArray["type"] };
		}
	}
	if (normalized.nullable) {
		normalized = { ...normalized, nullable: undefined };
	}
	return { schema: normalized as OpenAPIV3.SchemaObject, nullable };
}

function isRef(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): schema is OpenAPIV3.ReferenceObject {
	return "$ref" in schema;
}

function flattenAllOf(
	schema: OpenAPIV3.SchemaObject,
	ctx: SchemaContext
): OpenAPIV3.SchemaObject | null {
	if (!schema.allOf || schema.allOf.length === 0) {
		return null;
	}
	const parts = schema.allOf.map((item) => item as OpenAPIV3.SchemaObject);
	const isObjectPart = (part: OpenAPIV3.SchemaObject) =>
		part.type === "object" || Boolean(part.properties) || Boolean(part.additionalProperties);

	if (!parts.every(isObjectPart)) {
		return null;
	}

	const mergedProperties: Record<string, OpenAPIV3.SchemaObject> = {};
	const required = new Set<string>();
	let additionalProperties: OpenAPIV3.SchemaObject | boolean | undefined;

	for (const part of parts) {
		for (const [name, prop] of Object.entries(part.properties ?? {})) {
			mergedProperties[name] = prop as OpenAPIV3.SchemaObject;
		}
		for (const name of part.required ?? []) {
			required.add(name);
		}
		if (part.additionalProperties !== undefined) {
			if (additionalProperties !== undefined && additionalProperties !== part.additionalProperties) {
				ctx.diagnostics.warn(
					"schema.allOf.additionalProperties",
					"Conflicting additionalProperties in allOf; using the last value.",
					ctx.pointer
				);
			}
			additionalProperties = part.additionalProperties as OpenAPIV3.SchemaObject | boolean;
		}
	}

	return {
		type: "object",
		properties: mergedProperties,
		required: Array.from(required),
		additionalProperties
	};
}

function refName(ref: string): string {
	const parts = ref.split("/");
	return parts[parts.length - 1] ?? ref;
}

function isObjectLikeSchema(schema: OpenAPIV3.SchemaObject): boolean {
	return schema.type === "object" || Boolean(schema.properties) || Boolean(schema.additionalProperties);
}

function isRequiredOnlySchema(schema: OpenAPIV3.SchemaObject): boolean {
	const hasRequired = Array.isArray(schema.required) && schema.required.length > 0;
	const hasType = Boolean(schema.type);
	const hasProperties = Boolean(schema.properties);
	const hasAdditionalProperties = schema.additionalProperties !== undefined;
	const hasCombinators =
		Boolean(schema.oneOf?.length) || Boolean(schema.anyOf?.length) || Boolean(schema.allOf?.length);
	const hasEnum = Boolean(schema.enum?.length);
	return hasRequired && !hasType && !hasProperties && !hasAdditionalProperties && !hasCombinators && !hasEnum;
}
