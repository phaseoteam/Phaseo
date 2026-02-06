import type { OpenAPIV3 } from "openapi-types";
import type { Diagnostic, DiagnosticCollector } from "./diagnostics.js";
import { createDiagnosticCollector } from "./diagnostics.js";
import type { IR, IRModel, IROperation, IRParam, IRResponse, IRSchema } from "./ir.js";
import { deriveOperationId, ensureUniqueName, camelCaseOperationName, pascalCaseModelName } from "./naming.js";
import { toIRSchema } from "./schema.js";
import { canonicalSortIR } from "./sorting.js";

export type BuildOptions = {
	defaultTag?: string;
};

export function buildIR(
	doc: OpenAPIV3.Document,
	options: BuildOptions = {}
): { ir: IR; diagnostics: Diagnostic[] } {
	const diagnosticsCollector = createDiagnosticCollector();
	const diagnostics = diagnosticsCollector.diagnostics;
	const info = {
		title: doc.info?.title ?? "API",
		version: doc.info?.version ?? "0.0.0"
	};

	const models = buildModels(doc, diagnosticsCollector);
	const operations = buildOperations(doc, diagnosticsCollector, options);

	const ir: IR = {
		version: 1,
		info,
		models,
		operations
	};

	return { ir: canonicalSortIR(ir), diagnostics };
}

function buildModels(
	doc: OpenAPIV3.Document,
	diagnostics: DiagnosticCollector
): IRModel[] {
	const models: IRModel[] = [];
	const schemas = doc.components?.schemas ?? {};
	const usedNames = new Set<string>();

	for (const rawName of Object.keys(schemas).sort((a, b) => a.localeCompare(b))) {
		const schema = schemas[rawName] as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
		const name = ensureUniqueName(pascalCaseModelName(rawName), usedNames);
		const pointer = `#/components/schemas/${rawName}`;
		const irSchema = toIRSchema(schema, { diagnostics, pointer });
		models.push({
			name,
			schema: irSchema,
			doc: (schema as OpenAPIV3.SchemaObject).description,
			sourcePointer: pointer
		});
	}

	return models;
}

function buildOperations(
	doc: OpenAPIV3.Document,
	diagnostics: DiagnosticCollector,
	options: BuildOptions
): IROperation[] {
	const operations: IROperation[] = [];
	const usedNames = new Set<string>();
	const defaultTag = options.defaultTag ?? "default";

	for (const path of Object.keys(doc.paths ?? {}).sort((a, b) => a.localeCompare(b))) {
		const pathItem = (doc.paths ?? {})[path] as OpenAPIV3.PathItemObject;
		const item = pathItem as OpenAPIV3.PathItemObject;
		const sharedParameters = (item.parameters ?? []) as OpenAPIV3.ParameterObject[];
		for (const method of ["get", "post", "put", "patch", "delete"] as const) {
			const operation = item[method];
			if (!operation) {
				continue;
			}
			const rawOperationId =
				operation.operationId ?? deriveOperationId(method, path);
			const operationId = ensureUniqueName(
				camelCaseOperationName(rawOperationId),
				usedNames
			);
			const tag = operation.tags?.[0] ?? defaultTag;
			const params = buildParams(
				sharedParameters,
				(operation.parameters ?? []) as OpenAPIV3.ParameterObject[],
				diagnostics,
				path
			);
			const requestBody = buildRequestBody(
				operation.requestBody as OpenAPIV3.RequestBodyObject | undefined,
				diagnostics,
				path
			);
			const responses = buildResponses(operation.responses, diagnostics, path);

			operations.push({
				operationId,
				method,
				path,
				tags: [tag],
				params,
				requestBody,
				responses,
				doc: operation.description ?? operation.summary,
				sourcePointer: `#/paths/${path}/${method}`
			});
		}
	}

	return operations;
}

function buildParams(
	pathParams: OpenAPIV3.ParameterObject[],
	operationParams: OpenAPIV3.ParameterObject[],
	diagnostics: DiagnosticCollector,
	path: string
): IRParam[] {
	const params: IRParam[] = [];
	const merged = [...pathParams, ...operationParams];
	for (const param of merged) {
		const location = param.in;
		if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") {
			diagnostics.warn(
				"parameter.unsupported",
				`Unsupported parameter location "${location}".`,
				`#/paths/${path}/parameters/${param.name}`
			);
			continue;
		}
		if (!param.schema) {
			diagnostics.warn(
				"parameter.schema.missing",
				`Parameter "${param.name}" has no schema; using unknown.`,
				`#/paths/${path}/parameters/${param.name}`
			);
		}
		const schema = param.schema
			? toIRSchema(param.schema as OpenAPIV3.SchemaObject, { diagnostics })
			: ({ kind: "unknown" } satisfies IRSchema);
		params.push({
			name: param.name,
			in: location,
			required: param.required ?? location === "path",
			schema,
			doc: param.description
		});
	}
	return params;
}

function buildRequestBody(
	requestBody: OpenAPIV3.RequestBodyObject | undefined,
	diagnostics: DiagnosticCollector,
	path: string
): IROperation["requestBody"] {
	if (!requestBody) {
		return undefined;
	}
	const contentTypes = Object.keys(requestBody.content ?? {});
	const jsonType = contentTypes.find(
		(type) => type === "application/json" || type.endsWith("+json")
	);
	if (!jsonType) {
		diagnostics.warn(
			"requestBody.content.unsupported",
			"Request body does not include JSON content type.",
			`#/paths/${path}/requestBody`
		);
		return undefined;
	}
	const schema = requestBody.content?.[jsonType]?.schema;
	if (!schema) {
		diagnostics.warn(
			"requestBody.schema.missing",
			"Request body schema missing; using unknown.",
			`#/paths/${path}/requestBody`
		);
		return {
			schema: { kind: "unknown" },
			contentType: jsonType,
			doc: requestBody.description
		};
	}
	return {
		schema: toIRSchema(schema as OpenAPIV3.SchemaObject, { diagnostics }),
		contentType: jsonType,
		doc: requestBody.description
	};
}

function buildResponses(
	responses: OpenAPIV3.ResponsesObject | undefined,
	diagnostics: DiagnosticCollector,
	path: string
): IRResponse[] {
	if (!responses) {
		return [];
	}
	const results: IRResponse[] = [];
	for (const [status, response] of Object.entries(responses)) {
		const responseObject = response as OpenAPIV3.ResponseObject;
		const contentTypes = Object.keys(responseObject.content ?? {});
		const jsonType = contentTypes.find(
			(type) => type === "application/json" || type.endsWith("+json")
		);
		let schema: IRSchema | undefined;
		if (jsonType) {
			const responseSchema = responseObject.content?.[jsonType]?.schema;
			if (responseSchema) {
				schema = toIRSchema(responseSchema as OpenAPIV3.SchemaObject, { diagnostics });
			} else {
				diagnostics.warn(
					"response.schema.missing",
					`Response ${status} has no schema; using unknown.`,
					`#/paths/${path}/responses/${status}`
				);
				schema = { kind: "unknown" };
			}
		}
		results.push({
			status,
			schema,
			isDefault: status === "default",
			contentType: jsonType,
			doc: responseObject.description
		});
	}
	return results;
}
