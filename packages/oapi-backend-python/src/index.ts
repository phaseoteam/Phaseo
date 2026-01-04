import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendPython: Backend = {
	id: "python",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({
			path: "__init__.py",
			contents: renderInit()
		});
		files.push({
			path: "models.py",
			contents: renderModels(ir.models)
		});
		files.push({
			path: "client.py",
			contents: renderClient()
		});
		files.push({
			path: "operations.py",
			contents: renderOperations(ir.operations)
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

function renderModels(models: IRModel[]): string {
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
		lines.push(renderModel(model));
		lines.push("");
	}
	lines.push(`models___all__ = [${exports.map((name) => `"${name}"`).join(", ")}]`);
	lines.push("");
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`class ${model.name}(TypedDict):`];
		if (fields.length === 0) {
			lines.push("\tpass");
			return lines.join("\n");
		}
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			const value = pyType(model.schema.properties[field]);
			if (required.has(field)) {
				lines.push(`\t${name}: ${value}`);
			} else {
				lines.push(`\t${name}: NotRequired[${value}]`);
			}
		}
		return lines.join("\n");
	}
	return `${model.name} = ${pyType(model.schema)}`;
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
		"\t\t\tif not raw:",
		"\t\t\t\treturn None",
		"\t\t\ttry:",
		"\t\t\t\treturn json.loads(raw)",
		"\t\t\texcept json.JSONDecodeError:",
		"\t\t\t\treturn raw",
		""
	].join("\n");
}

function renderOperations(operations: IROperation[]): string {
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
		lines.push(renderOperation(operation));
		lines.push("");
	}
	lines.push(`operations___all__ = [${exports.map((name) => `"${name}"`).join(", ")}]`);
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const returnType = pyType(selectSuccessSchema(operation));
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
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return `{path.get("${name}", "")}`;
		}
		return segment.replace(/"/g, '\\"');
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

function pyType(schema: IRSchema): string {
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
			return `List[${pyType(schema.items)}]`;
		case "object":
			return "Dict[str, Any]";
		case "union":
			return `Union[${schema.variants.map(pyType).join(", ")}]`;
		case "intersection":
			return "Any";
		case "ref":
			return schema.name;
		case "nullable":
			return `Optional[${pyType(schema.inner)}]`;
		case "unknown":
		default:
			return "Any";
	}
}

function sanitizeIdentifier(name: string): string {
	if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^A-Za-z0-9_]/g, "_");
}
