import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@phaseo/oapi-core";
import { splitPathTemplate } from "@phaseo/oapi-core";

export const backendPython: Backend = {
	id: "python",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		const modelTypes = createModelTypeResolver(ir.models);
		files.push({
			path: "__init__.py",
			contents: renderInit()
		});
		files.push({
			path: "models.py",
			contents: renderModels(ir.models, modelTypes)
		});
		files.push({
			path: "client.py",
			contents: renderClient()
		});
		files.push({
			path: "operations.py",
			contents: renderOperations(ir.operations, modelTypes)
		});
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendPython;

function renderInit(): string {
	return [
		"from .client import Client",
		"from .operations import *",
		"from .models import *",
		"",
		"__all__ = [",
		'\t"Client",',
		"\t*operations___all__,",
		"\t*models___all__,",
		"]",
		""
	].join("\n");
}

function renderModels(models: IRModel[], modelTypes: ModelTypeResolver): string {
	const lines: string[] = [
		"from __future__ import annotations",
		"",
		"from typing import Any, Dict, List, Optional, Union, Literal",
		"from typing_extensions import NotRequired, TypedDict",
		""
	];
	const exports: string[] = [];
	for (const model of models) {
		exports.push(model.name);
		lines.push(renderModel(model, modelTypes));
		lines.push("");
	}
	lines.push(`models___all__ = [${exports.map((name) => `"${name}"`).join(", ")}]`);
	lines.push("");
	return lines.join("\n");
}

function renderModel(model: IRModel, modelTypes: ModelTypeResolver): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		if (fields.some((field) => !isPythonClassFieldIdentifier(field))) {
			const lines: string[] = [`${model.name} = TypedDict(${JSON.stringify(model.name)}, {`];
			for (const field of fields) {
				const value = pyType(model.schema.properties[field], modelTypes, model.name, true);
				const annotation = required.has(field) ? value : `NotRequired[${value}]`;
				lines.push(`\t${JSON.stringify(field)}: ${annotation},`);
			}
			lines.push("})");
			return lines.join("\n");
		}
		const lines: string[] = [`class ${model.name}(TypedDict):`];
		if (fields.length === 0) {
			lines.push("\tpass");
			return lines.join("\n");
		}
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			const value = pyType(model.schema.properties[field], modelTypes, model.name);
			if (required.has(field)) {
				lines.push(`\t${name}: ${value}`);
			} else {
				lines.push(`\t${name}: NotRequired[${value}]`);
			}
		}
		return lines.join("\n");
	}
	return `${model.name} = ${pyType(model.schema, modelTypes, model.name, true)}`;
}

function renderClient(): string {
	return [
		"from __future__ import annotations",
		"",
		"import json",
		"import urllib.parse",
		"import urllib.request",
		"from typing import Any, Dict, Optional",
		"",
		"",
		"class Client:",
		"\tdef __init__(self, base_url: str, headers: Optional[Dict[str, str]] = None):",
		"\t\tself._base_url = base_url.rstrip('/')",
		"\t\tself._headers = headers or {}",
		"",
		"\tdef request(",
		"\t\tself,",
		"\t\tmethod: str,",
		"\t\tpath: str,",
		"\t\tquery: Optional[Dict[str, Any]] = None,",
		"\t\theaders: Optional[Dict[str, str]] = None,",
		"\t\tbody: Optional[Any] = None,",
		"\t) -> Any:",
		"\t\turl = f\"{self._base_url}{path}\"",
		"\t\tif query:",
		"\t\t\turl += \"?\" + urllib.parse.urlencode(query, doseq=True)",
		"\t\tpayload = None",
		"\t\trequest_headers = {\"Accept\": \"application/json\", **self._headers, **(headers or {})}",
		"\t\tif body is not None:",
		"\t\t\tpayload = json.dumps(body).encode(\"utf-8\")",
		"\t\t\trequest_headers[\"Content-Type\"] = \"application/json\"",
		"\t\treq = urllib.request.Request(url, data=payload, headers=request_headers, method=method.upper())",
		"\t\twith urllib.request.urlopen(req) as resp:",
		"\t\t\traw = resp.read().decode(\"utf-8\")",
		"\t\t\tif resp.headers.get_content_type() == \"application/x-ndjson\":",
		"\t\t\t\treturn raw",
		"\t\t\tif not raw:",
		"\t\t\t\treturn None",
		"\t\t\ttry:",
		"\t\t\t\treturn json.loads(raw)",
		"\t\t\texcept json.JSONDecodeError:",
		"\t\t\t\treturn raw",
		""
	].join("\n");
}

function renderOperations(operations: IROperation[], modelTypes: ModelTypeResolver): string {
	const lines: string[] = [
		"from __future__ import annotations",
		"",
		"from typing import Any, Dict, Optional",
		"from .client import Client",
		"from . import models",
		""
	];
	const exports: string[] = [];
	for (const operation of operations) {
		exports.push(operation.operationId);
		lines.push(renderOperation(operation, modelTypes));
		lines.push("");
	}
	lines.push(`operations___all__ = [${exports.map((name) => `"${name}"`).join(", ")}]`);
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation, modelTypes: ModelTypeResolver): string {
	const returnType = pyType(selectSuccessSchema(operation), modelTypes, operation.operationId);
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`def ${operation.operationId}(`,
		"\tclient: Client,",
		"\t*,",
		"\tpath: Optional[Dict[str, Any]] = None,",
		"\tquery: Optional[Dict[str, Any]] = None,",
		"\theaders: Optional[Dict[str, str]] = None,",
		"\tbody: Optional[Any] = None,",
		`) -> ${returnType}:`,
		"\tpath = path or {}",
		`\tresolved_path = ${pathTemplate}`,
		`\treturn client.request("${operation.method.toUpperCase()}", resolved_path, query=query, headers=headers, body=body)`,
		""
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return `{path.get('${name}', '')}`;
		}
		return segment
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/{/g, "{{")
			.replace(/}/g, "}}");
	});
	return `f"${parts.join("")}"`;
}

function selectSuccessSchema(operation: IROperation): IRSchema {
	for (const response of operation.responses) {
		const status = Number(response.status);
		if (!Number.isNaN(status) && status >= 200 && status < 300) {
			return response.schema ?? { kind: "unknown" };
		}
	}
	return { kind: "unknown" };
}

type ModelTypeResolver = (schema: IRSchema, excludeModelName?: string) => string | undefined;

function createModelTypeResolver(models: IRModel[]): ModelTypeResolver {
	const namesBySchema = new Map<string, string[]>();
	const modelSchemas = new Map(models.map((model) => [model.name, model.schema]));
	for (const model of models) {
		if (model.schema.kind !== "object") continue;
		const signature = schemaSignature(model.schema, modelSchemas);
		const names = namesBySchema.get(signature) ?? [];
		names.push(model.name);
		namesBySchema.set(signature, names);
	}

	return (schema, excludeModelName) => {
		if (schema.kind !== "object") return undefined;
		const candidates = (namesBySchema.get(schemaSignature(schema, modelSchemas)) ?? []).filter(
			(name) => name !== excludeModelName
		);
		if (candidates.length === 1) return candidates[0];
		if (!excludeModelName || candidates.length === 0) return undefined;

		const contextTokens = modelNameTokens(excludeModelName);
		const ranked = candidates
			.map((name) => ({
				name,
				score: Array.from(modelNameTokens(name)).filter((token) => contextTokens.has(token)).length
			}))
			.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
		return ranked[0]?.score && ranked[0].score > (ranked[1]?.score ?? 0)
			? ranked[0].name
			: undefined;
	};
}

function modelNameTokens(name: string): Set<string> {
	const tokens: string[] = [];
	let tokenStart = 0;

	const isUpper = (character: string | undefined) =>
		character !== undefined && character >= "A" && character <= "Z";
	const isLower = (character: string | undefined) =>
		character !== undefined && character >= "a" && character <= "z";
	const isDigit = (character: string | undefined) =>
		character !== undefined && character >= "0" && character <= "9";
	const isAlphaNumeric = (character: string | undefined) =>
		isUpper(character) || isLower(character) || isDigit(character);
	const pushToken = (end: number) => {
		if (end > tokenStart) tokens.push(name.slice(tokenStart, end));
	};

	for (let index = 0; index < name.length; index += 1) {
		const current = name[index];
		const previous = name[index - 1];
		const next = name[index + 1];

		if (!isAlphaNumeric(current)) {
			pushToken(index);
			tokenStart = index + 1;
			continue;
		}

		if (
			index > tokenStart &&
			(isDigit(current) !== isDigit(previous) ||
				(isUpper(current) && isLower(previous)) ||
				(isUpper(current) && isUpper(previous) && isLower(next)))
		) {
			pushToken(index);
			tokenStart = index;
		}
	}

	pushToken(name.length);
	return new Set(tokens.length > 0 ? tokens : [name]);
}

function schemaSignature(schema: IRSchema, modelSchemas: Map<string, IRSchema>): string {
	return JSON.stringify(canonicalSchemaValue(schema, modelSchemas, new Set()));
}

function canonicalSchemaValue(
	value: unknown,
	modelSchemas: Map<string, IRSchema>,
	resolvingRefs: Set<string>
): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalSchemaValue(item, modelSchemas, resolvingRefs));
	}
	if (!value || typeof value !== "object") return value;

	const record = value as Record<string, unknown>;
	if (record.kind === "ref" && typeof record.name === "string") {
		const target = modelSchemas.get(record.name);
		if (target && !resolvingRefs.has(record.name)) {
			const nextRefs = new Set(resolvingRefs);
			nextRefs.add(record.name);
			return canonicalSchemaValue(target, modelSchemas, nextRefs);
		}
	}

	return Object.fromEntries(
		Object.entries(record)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, canonicalSchemaValue(item, modelSchemas, resolvingRefs)])
	);
}

function pyType(
	schema: IRSchema,
	modelTypes: ModelTypeResolver,
	excludeModelName?: string,
	quoteModelReferences = false
): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "int";
			if (schema.type === "number") return "float";
			return "str";
		case "literal":
			return JSON.stringify(schema.value);
		case "enum":
			return `Literal[${schema.values.map((value) => JSON.stringify(value)).join(", ")}]`;
		case "array":
			return `List[${pyType(schema.items, modelTypes, excludeModelName, quoteModelReferences)}]`;
		case "object":
			{
				const modelType = modelTypes(schema, excludeModelName);
				if (modelType) return quoteModelReferences ? JSON.stringify(modelType) : modelType;
			}
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
			return "Dict[str, Any]";
		case "union":
			return `Union[${schema.variants
				.map((variant) =>
					pyType(variant, modelTypes, excludeModelName, quoteModelReferences)
				)
				.join(", ")}]`;
		case "intersection":
			return "Any";
		case "ref":
			return quoteModelReferences ? JSON.stringify(schema.name) : schema.name;
		case "nullable":
			return `Optional[${pyType(
				schema.inner,
				modelTypes,
				excludeModelName,
				quoteModelReferences
			)}]`;
		case "unknown":
		default:
			return "Any";
	}
}

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
}

function sanitizeIdentifier(name: string): string {
	const sanitized = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
		? name
		: name.replace(/[^A-Za-z0-9_]/g, "_");
	return PYTHON_KEYWORDS.has(sanitized) ? `${sanitized}_` : sanitized;
}

const PYTHON_KEYWORDS = new Set([
	"False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
	"continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
	"if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return",
	"try", "while", "with", "yield"
]);

function isPythonClassFieldIdentifier(name: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !PYTHON_KEYWORDS.has(name);
}
