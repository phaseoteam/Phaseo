import type { IR, IRObjectSchema, IRSchema } from "./ir.js";

export function canonicalSortIR(ir: IR): IR {
	return {
		...ir,
		models: [...ir.models]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((model) => ({
				...model,
				schema: sortSchema(model.schema)
			})),
		operations: [...ir.operations]
			.sort((a, b) => a.operationId.localeCompare(b.operationId))
			.map((operation) => ({
				...operation,
				params: [...operation.params]
					.sort((a, b) => {
						if (a.in !== b.in) {
							return a.in.localeCompare(b.in);
						}
						return a.name.localeCompare(b.name);
					})
					.map((param) => ({
						...param,
						schema: sortSchema(param.schema)
					})),
				requestBody: operation.requestBody
					? {
							...operation.requestBody,
							schema: sortSchema(operation.requestBody.schema)
						}
					: undefined,
				responses: [...operation.responses]
					.sort((a, b) => compareStatus(a.status, b.status))
					.map((response) => ({
						...response,
						schema: response.schema ? sortSchema(response.schema) : undefined
					}))
			}))
	};
}

function compareStatus(a: string, b: string): number {
	if (a === "default" && b !== "default") return 1;
	if (b === "default" && a !== "default") return -1;
	const aNum = Number(a);
	const bNum = Number(b);
	if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
		return aNum - bNum;
	}
	return a.localeCompare(b);
}

function sortSchema(schema: IRSchema): IRSchema {
	switch (schema.kind) {
		case "array":
			return { ...schema, items: sortSchema(schema.items) };
		case "object":
			return sortObjectSchema(schema);
		case "union":
			return { ...schema, variants: schema.variants.map(sortSchema) };
		case "intersection":
			return { ...schema, parts: schema.parts.map(sortSchema) };
		case "nullable":
			return { ...schema, inner: sortSchema(schema.inner) };
		default:
			return schema;
	}
}

function sortObjectSchema(schema: IRObjectSchema): IRObjectSchema {
	const sortedProperties: Record<string, IRSchema> = {};
	for (const key of Object.keys(schema.properties).sort((a, b) => a.localeCompare(b))) {
		sortedProperties[key] = sortSchema(schema.properties[key]);
	}
	const required = [...schema.required].sort((a, b) => a.localeCompare(b));
	return {
		...schema,
		properties: sortedProperties,
		required
	};
}
