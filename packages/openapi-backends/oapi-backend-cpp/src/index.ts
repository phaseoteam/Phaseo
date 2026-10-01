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
		"namespace phaseo::gen {"
	];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	lines.push("} // namespace phaseo::gen", "");
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
		"#include <algorithm>",
		"#include <chrono>",
		"#include <cctype>",
		"#include <functional>",
		"#include <map>",
		"#include <optional>",
		"#include <stdexcept>",
		"#include <string>",
		"#include <thread>",
		"",
		"namespace phaseo::gen {",
		"",
		"inline std::string encode_trace_id(const std::string& value) {",
		"\tstatic constexpr char hex[] = \"0123456789ABCDEF\";",
		"\tstd::string encoded;",
		"\tfor (unsigned char ch : value) {",
		"\t\tif (std::isalnum(ch) || ch == '-' || ch == '_' || ch == '.' || ch == '~') encoded.push_back(static_cast<char>(ch));",
		"\t\telse { encoded.push_back('%'); encoded.push_back(hex[ch >> 4]); encoded.push_back(hex[ch & 0x0F]); }",
		"\t}",
		"\treturn encoded;",
		"}",
		"",
		"struct Response {",
		"\tint status = 0;",
		"\tstd::map<std::string, std::string> headers;",
		"\tstd::string body;",
		"\tstd::optional<std::string> header(const std::string& name) const {",
		"\t\tfor (const auto& [key, value] : headers) {",
		"\t\t\tif (key.size() == name.size() && std::equal(key.begin(), key.end(), name.begin(), [](char a, char b) { return std::tolower(static_cast<unsigned char>(a)) == std::tolower(static_cast<unsigned char>(b)); })) return value;",
		"\t\t}",
		"\t\treturn std::nullopt;",
		"\t}",
		"\tstd::optional<std::string> request_id() const { auto value = header(\"x-request-id\"); return value ? value : header(\"request-id\"); }",
		"\tstd::optional<std::string> trace_url() const { auto id = request_id(); return id ? std::optional<std::string>(\"https://phaseo.app/settings/usage/logs/requests/\" + encode_trace_id(*id)) : std::nullopt; }",
		"};",
		"",
		"struct RequestOptions {",
		"\tstd::map<std::string, std::string> headers;",
		"\tstd::optional<long long> timeout_ms;",
		"\tstd::optional<unsigned int> max_retries;",
		"\tstd::optional<std::string> idempotency_key;",
		"};",
		"",
		"struct RequestEvent { std::string method; std::string path; unsigned int attempt = 0; };",
		"struct ResponseEvent { std::string method; std::string path; unsigned int attempt = 0; int status = 0; std::map<std::string, std::string> headers; };",
		"struct RetryEvent { std::string method; std::string path; unsigned int attempt = 0; int status = 0; std::chrono::milliseconds delay{0}; };",
		"",
		"class RequestError : public std::runtime_error {",
		"public:",
		"\texplicit RequestError(Response response) : std::runtime_error(\"Phaseo request failed: \" + std::to_string(response.status)), response_(std::move(response)) {}",
		"\tconst Response& response() const { return response_; }",
		"\tint status() const { return response_.status; }",
		"\tstd::optional<std::string> request_id() const { return response_.request_id(); }",
		"\tstd::optional<std::string> trace_url() const { return response_.trace_url(); }",
		"private:",
		"\tResponse response_;",
		"};",
		"",
		"class Transport {",
		"public:",
		"\tvirtual ~Transport() = default;",
		"\tvirtual Response request(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) = 0;",
		"\tvirtual Response request_with_options(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers, const RequestOptions& options) {",
		"\t\tauto merged = headers;",
		"\t\tfor (const auto& [key, value] : options.headers) merged[key] = value;",
		"\t\tif (options.idempotency_key) merged[\"Idempotency-Key\"] = *options.idempotency_key;",
		"\t\treturn request(method, url, body, merged);",
		"\t}",
		"};",
		"",
		"class Client {",
		"public:",
		"\tClient(std::string base_url, Transport* transport) : base_url_(std::move(base_url)), transport_(transport) {",
		"\t\theaders_[\"X-Phaseo-Client\"] = \"phaseo-cpp\";",
		"\t\theaders_[\"X-Phaseo-Client-Version\"] = \"1.0.2\";",
		"\t}",
		"\tvoid set_header(const std::string& key, const std::string& value) { headers_[key] = value; }",
		"\tvoid set_timeout(std::chrono::milliseconds timeout) { timeout_ = timeout; }",
		"\tvoid set_max_retries(unsigned int max_retries) { max_retries_ = max_retries; }",
		"\tvoid set_request_hooks(std::function<void(const RequestEvent&)> on_request, std::function<void(const ResponseEvent&)> on_response, std::function<void(const RetryEvent&)> on_retry) { on_request_ = std::move(on_request); on_response_ = std::move(on_response); on_retry_ = std::move(on_retry); }",
		"\tResponse request(const std::string& method, const std::string& path, const std::string& body = \"\", const std::map<std::string, std::string>& headers = {}) {",
		"\t\tRequestOptions options; options.headers = headers; return request_with_options(method, path, body, options);",
		"\t}",
		"\tResponse request_with_options(const std::string& method, const std::string& path, const std::string& body, RequestOptions options) {",
		"\t\tif (!options.timeout_ms) options.timeout_ms = timeout_.count();",
		"\t\tconst bool safe = method == \"GET\" || method == \"HEAD\" || method == \"get\" || method == \"head\";",
		"\t\tconst auto retries = safe ? options.max_retries.value_or(max_retries_) : 0;",
		"\t\tfor (unsigned int attempt = 0;; ++attempt) {",
		"\t\t\tif (on_request_) on_request_({method, path, attempt});",
		"\t\t\tauto response = transport_->request_with_options(method, base_url_ + path, body, headers_, options);",
		"\t\t\tconst bool retryable = response.status == 408 || response.status == 429 || response.status == 500 || response.status == 502 || response.status == 503 || response.status == 504;",
		"\t\t\tif (retryable && attempt < retries) {",
		"\t\t\t\tauto delay = std::chrono::milliseconds(250 * (1 << std::min(attempt, 5u)));",
		"\t\t\t\tif (auto retry_after = response.header(\"retry-after\")) { try { delay = std::chrono::milliseconds(static_cast<long long>(std::stod(*retry_after) * 1000)); } catch (...) {} }",
		"\t\t\t\tif (on_retry_) on_retry_({method, path, attempt + 1, response.status, delay});",
		"\t\t\t\tif (delay.count() > 0) std::this_thread::sleep_for(delay);",
		"\t\t\t\tcontinue;",
		"\t\t\t}",
		"\t\t\tif (on_response_) on_response_({method, path, attempt, response.status, response.headers});",
		"\t\t\treturn response;",
		"\t\t}",
		"\t}",
		"\tResponse request_checked(const std::string& method, const std::string& path, const std::string& body = \"\", RequestOptions options = {}) {",
		"\t\tauto response = request_with_options(method, path, body, std::move(options));",
		"\t\tif (response.status < 200 || response.status >= 300) throw RequestError(std::move(response));",
		"\t\treturn response;",
		"\t}",
		"",
		"private:",
		"\tstd::string base_url_;",
		"\tTransport* transport_;",
		"\tstd::map<std::string, std::string> headers_;",
		"\tstd::chrono::milliseconds timeout_{60000};",
		"\tunsigned int max_retries_ = 0;",
		"\tstd::function<void(const RequestEvent&)> on_request_;",
		"\tstd::function<void(const ResponseEvent&)> on_response_;",
		"\tstd::function<void(const RetryEvent&)> on_retry_;",
		"};",
		"",
		"} // namespace phaseo::gen",
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
		"namespace phaseo::gen {"
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	lines.push("} // namespace phaseo::gen", "");
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
		return JSON.stringify(path);
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = JSON.stringify(segment.slice(1, -1));
			return `(path.count(${name}) ? path.at(${name}) : std::string{})`;
		}
		return JSON.stringify(segment);
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
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
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

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
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
