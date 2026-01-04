import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendCpp: Backend = {
	id: "cpp",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "models.hpp", contents: renderModels(ir.models) });
		files.push({ path: "client.hpp", contents: renderClient() });
		files.push({ path: "operations.hpp", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendCpp;

function renderModels(models: IRModel[]): string {
	const lines: string[] = [
		"#pragma once",
		"#include <any>",
		"#include <map>",
		"#include <optional>",
		"#include <string>",
		"#include <vector>",
		"",
		"namespace ai_stats::gen {"
	];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	lines.push("} // namespace ai_stats::gen", "");
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`struct ${model.name} {`];
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			const type = renderFieldType(model.schema.properties[field], required.has(field));
			lines.push(`\t${type} ${name};`);
		}
		lines.push("};");
		return lines.join("\n");
	}
	return `using ${model.name} = std::any;`;
}

function renderClient(): string {
	return [
		"#pragma once",
		"#include <map>",
		"#include <string>",
		"",
		"namespace ai_stats::gen {",
		"",
		"struct Response {",
		"\tint status = 0;",
		"\tstd::string body;",
		"};",
		"",
		"class Transport {",
		"public:",
		"\tvirtual ~Transport() = default;",
		"\tvirtual Response request(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) = 0;",
		"};",
		"",
		"class Client {",
		"public:",
		"\tClient(std::string base_url, Transport* transport) : base_url_(std::move(base_url)), transport_(transport) {}",
		"\tvoid set_header(const std::string& key, const std::string& value) { headers_[key] = value; }",
		"\tResponse request(const std::string& method, const std::string& path, const std::string& body = \"\", const std::map<std::string, std::string>& headers = {}) {",
		"\t\tstd::map<std::string, std::string> merged = headers_;",
		"\t\tmerged.insert(headers.begin(), headers.end());",
		"\t\treturn transport_->request(method, base_url_ + path, body, merged);",
		"\t}",
		"",
		"private:",
		"\tstd::string base_url_;",
		"\tTransport* transport_;",
		"\tstd::map<std::string, std::string> headers_;",
		"};",
		"",
		"} // namespace ai_stats::gen",
		""
	].join("\n");
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"#pragma once",
		"#include <map>",
		"#include <string>",
		"#include \"client.hpp\"",
		"",
		"namespace ai_stats::gen {"
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	lines.push("} // namespace ai_stats::gen", "");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`inline Response ${exportName(operation.operationId)}(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = \"\") {`,
		`\tconst std::string resolved_path = ${pathTemplate};`,
		`\treturn client.request("${operation.method.toUpperCase()}", resolved_path, body);`,
		"}"
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `"${path}"`;
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = segment.slice(1, -1);
			return `(path.count("${name}") ? path.at("${name}") : std::string{})`;
		}
		return `"${segment}"`;
	});
	return parts.join(" + ");
}

function renderFieldType(schema: IRSchema, required: boolean): string {
	const base = cppType(schema);
	if (required || base.startsWith("std::")) {
		return base;
	}
	return `std::optional<${base}>`;
}

function cppType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "int";
			if (schema.type === "number") return "double";
			return "std::string";
		case "array":
			return `std::vector<${cppType(schema.items)}>`;
		case "object":
			return "std::map<std::string, std::any>";
		case "union":
		case "intersection":
		case "unknown":
		case "literal":
		case "enum":
			return "std::any";
		case "ref":
			return schema.name;
		case "nullable":
			return `std::optional<${cppType(schema.inner)}>`;
		default:
			return "std::any";
	}
}

function exportName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ");
	const parts = cleaned.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "Value";
	return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
