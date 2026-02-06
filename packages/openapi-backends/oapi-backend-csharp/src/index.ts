import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendCsharp: Backend = {
	id: "csharp",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "Client.cs", contents: renderClient() });
		files.push({ path: "Models.cs", contents: renderModels(ir.models) });
		files.push({ path: "Operations.cs", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendCsharp;

function renderClient(): string {
	return [
		"using System;",
		"using System.Collections.Generic;",
		"using System.Net.Http;",
		"using System.Text;",
		"using System.Text.Json;",
		"using System.Threading.Tasks;",
		"",
		"namespace AiStats.Gen;",
		"",
		"public sealed class Client",
		"{",
		"\tprivate readonly HttpClient _http;",
		"\tprivate readonly string _baseUrl;",
		"\tprivate readonly Dictionary<string, string> _headers;",
		"",
		"\tpublic Client(string baseUrl, HttpClient? httpClient = null, Dictionary<string, string>? headers = null)",
		"\t{",
		"\t\t_baseUrl = baseUrl.TrimEnd('/');",
		"\t\t_http = httpClient ?? new HttpClient();",
		"\t\t_headers = headers ?? new Dictionary<string, string>();",
		"\t}",
		"",
		"\tpublic async Task<T?> SendAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)",
		"\t{",
		"\t\tvar url = _baseUrl + path;",
		"\t\tif (query != null && query.Count > 0)",
		"\t\t{",
		"\t\t\tvar parts = new List<string>();",
		"\t\t\tforeach (var kvp in query)",
		"\t\t\t{",
		"\t\t\t\tparts.Add(Uri.EscapeDataString(kvp.Key) + \"=\" + Uri.EscapeDataString(kvp.Value));",
		"\t\t\t}",
		"\t\t\turl += \"?\" + string.Join(\"&\", parts);",
		"\t\t}",
		"\t\tvar request = new HttpRequestMessage(new HttpMethod(method), url);",
		"\t\tforeach (var kvp in _headers)",
		"\t\t{",
		"\t\t\trequest.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);",
		"\t\t}",
		"\t\tif (headers != null)",
		"\t\t{",
		"\t\t\tforeach (var kvp in headers)",
		"\t\t\t{",
		"\t\t\t\trequest.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);",
		"\t\t\t}",
		"\t\t}",
		"\t\tif (body != null)",
		"\t\t{",
		"\t\t\tvar json = JsonSerializer.Serialize(body);",
		"\t\t\trequest.Content = new StringContent(json, Encoding.UTF8, \"application/json\");",
		"\t\t}",
		"\t\tvar response = await _http.SendAsync(request).ConfigureAwait(false);",
		"\t\tresponse.EnsureSuccessStatusCode();",
		"\t\tvar raw = await response.Content.ReadAsStringAsync().ConfigureAwait(false);",
		"\t\tif (string.IsNullOrWhiteSpace(raw))",
		"\t\t{",
		"\t\t\treturn default;",
		"\t\t}",
		"\t\treturn JsonSerializer.Deserialize<T>(raw);",
		"\t}",
		"}",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = [
		"using System;",
		"using System.Collections.Generic;",
		"using System.Text.Json.Serialization;",
		"",
		"namespace AiStats.Gen;",
		""
	];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`public sealed class ${model.name}`, "{"]; 
		for (const field of fields) {
			const name = exportPropertyName(model.name, field);
			const type = renderFieldType(model.schema.properties[field], required.has(field));
			lines.push(`\t[JsonPropertyName("${field}")]`);
			lines.push(`\tpublic ${type} ${name} { get; set; }`);
			lines.push("");
		}
		lines.push("}");
		return lines.join("\n");
	}
	return `public sealed class ${model.name} { }`;
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"using System;",
		"using System.Collections.Generic;",
		"using System.Threading.Tasks;",
		"",
		"namespace AiStats.Gen;",
		"",
		"public static class Operations",
		"{"
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const returnType = csType(selectSuccessSchema(operation));
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`\tpublic static Task<${returnType}?> ${exportName(operation.operationId)}Async(`,
		"\t\tClient client,",
		"\t\tDictionary<string, string>? path = null,",
		"\t\tDictionary<string, string>? query = null,",
		"\t\tDictionary<string, string>? headers = null,",
		"\t\tobject? body = null",
		"\t)",
		"\t{",
		`\t\tvar resolvedPath = ${pathTemplate};`,
		`\t\treturn client.SendAsync<${returnType}>(\"${operation.method.toUpperCase()}\", resolvedPath, query, headers, body);`,
		"\t}",
		""
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `\"${path}\"`;
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = segment.slice(1, -1);
			return `(path != null && path.ContainsKey("${name}") ? path["${name}"] : "")`;
		}
		return `"${segment}"`;
	});
	return parts.join(" + ");
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

function renderFieldType(schema: IRSchema, required: boolean): string {
	const base = csType(schema);
	if (required) {
		return base;
	}
	if (base.endsWith("?")) {
		return base;
	}
	if (base == "string" || base == "object") {
		return `${base}?`;
	}
	return `${base}?`;
}

function csType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "int";
			if (schema.type === "number") return "double";
			return "string";
		case "literal":
			return "object";
		case "enum":
			return "string";
		case "array":
			return `List<${csType(schema.items)}>`;
		case "object":
			return "Dictionary<string, object>";
		case "union":
		case "intersection":
			return "object";
		case "ref":
			return schema.name;
		case "nullable":
			return csType(schema.inner) + "?";
		case "unknown":
		default:
			return "object";
	}
}

function exportName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ");
	const parts = cleaned.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "Value";
	return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function exportPropertyName(modelName: string, value: string): string {
	const name = exportName(value);
	if (name === modelName) {
		return `${name}Value`;
	}
	return name;
}
