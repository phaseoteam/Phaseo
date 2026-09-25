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

export const backendRust: Backend = {
	id: "rust",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "lib.rs", contents: renderLib() });
		files.push({ path: "models.rs", contents: renderModels(ir.models) });
		files.push({ path: "client.rs", contents: renderClient() });
		files.push({ path: "operations.rs", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendRust;

function renderLib(): string {
	return [
		"pub mod client;",
		"pub mod models;",
		"pub mod operations;",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = [
		"use std::collections::HashMap;",
		"",
		"pub type JsonValue = String;",
		"",
		"pub enum StringOrStringArray {",
		"\tString(String),",
		"\tArray(Vec<String>),",
		"}",
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
		const lines: string[] = [`pub struct ${model.name} {`];
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			const type = renderFieldType(
				model.schema.properties[field],
				required.has(field),
				model.name === "ImagesEditRequest" && field === "image"
			);
			lines.push(`\tpub ${name}: ${type},`);
		}
		lines.push("}");
		return lines.join("\n");
	}
	return `pub type ${model.name} = JsonValue;`;
}

function renderClient(): string {
	return [
		"use std::collections::HashMap;",
		"use url::form_urlencoded;",
		"",
		"#[derive(Debug)]",
		"pub struct Response {",
		"\tpub status: u16,",
		"\tpub headers: HashMap<String, String>,",
		"\tpub body: String,",
		"}",
		"",
		"impl Response {",
		"\tpub fn request_id(&self) -> Option<&str> {",
		"\t\tself.headers.get(\"x-request-id\").or_else(|| self.headers.get(\"request-id\")).map(String::as_str)",
		"\t}",
		"",
		"\tpub fn trace_url(&self) -> Option<String> {",
		"\t\tself.request_id().map(|id| format!(\"https://phaseo.app/settings/usage/logs/requests/{}\", form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>()))",
		"\t}",
		"}",
		"",
		"#[derive(Clone, Debug, Default)]",
		"pub struct RequestOptions {",
		"\tpub headers: HashMap<String, String>,",
		"\tpub timeout_ms: Option<u64>,",
		"\tpub max_retries: Option<u32>,",
		"\tpub idempotency_key: Option<String>,",
		"}",
		"",
		"pub trait Transport {",
		"\tfn request(",
		"\t\t&self,",
		"\t\tmethod: &str,",
		"\t\turl: &str,",
		"\t\tbody: Option<&str>,",
		"\t\theaders: &HashMap<String, String>,",
		"\t) -> Result<Response, String>;",
		"",
		"\tfn request_with_options(",
		"\t\t&self,",
		"\t\tmethod: &str,",
		"\t\turl: &str,",
		"\t\tbody: Option<&str>,",
		"\t\theaders: &HashMap<String, String>,",
		"\t\toptions: &RequestOptions,",
		"\t) -> Result<Response, String> {",
		"\t\tlet mut merged_headers = headers.clone();",
		"\t\tmerged_headers.extend(options.headers.clone());",
		"\t\tif let Some(key) = &options.idempotency_key {",
		"\t\t\tmerged_headers.insert(\"Idempotency-Key\".to_string(), key.clone());",
		"\t\t}",
		"\t\tself.request(method, url, body, &merged_headers)",
		"\t}",
		"}",
		"",
		"pub struct Client<T: Transport> {",
		"\tpub base_url: String,",
		"\tpub headers: HashMap<String, String>,",
		"\tpub transport: T,",
		"}",
		"",
		"impl<T: Transport> Client<T> {",
		"\tpub fn new(base_url: String, transport: T) -> Self {",
		"\t\tSelf {",
		"\t\t\tbase_url: base_url.trim_end_matches('/').to_string(),",
		"\t\t\theaders: HashMap::new(),",
		"\t\t\ttransport,",
		"\t\t}",
		"\t}",
		"",
		"\tpub fn request(&self, method: &str, path: &str, body: Option<&str>) -> Result<Response, String> {",
		"\t\tlet url = format!(\"{}{}\", self.base_url, path);",
		"\t\tself.transport.request(method, &url, body, &self.headers)",
		"\t}",
		"",
		"\tpub fn request_with_options(&self, method: &str, path: &str, body: Option<&str>, options: &RequestOptions) -> Result<Response, String> {",
		"\t\tlet url = format!(\"{}{}\", self.base_url, path);",
		"\t\tself.transport.request_with_options(method, &url, body, &self.headers, options)",
		"\t}",
		"}",
		""
	].join("\n");
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"use std::collections::HashMap;",
		"use crate::client::{Client, Response, Transport};",
		"",
		"pub fn no_query() -> HashMap<String, String> {",
		"\tHashMap::new()",
		"}",
		""
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`pub fn ${sanitizeIdentifier(operation.operationId)}<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {`,
		`\tlet resolved_path = ${pathTemplate};`,
		`\tclient.request("${operation.method.toUpperCase()}", &resolved_path, body)`,
		"}"
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `String::from(${JSON.stringify(path)})`;
	}
	const segments = splitPathTemplate(path);
	const formatParts: string[] = [];
	const args: string[] = [];
	for (const segment of segments) {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = JSON.stringify(segment.slice(1, -1));
			formatParts.push("{}");
			args.push(`path.get(${name}).cloned().unwrap_or_default()`);
		} else {
			const escaped = segment
				.replace(/\\/g, "\\\\")
				.replace(/"/g, '\\"')
				.replace(/{/g, "{{")
				.replace(/}/g, "}}");
			formatParts.push(escaped);
		}
	}
	const formatString = formatParts.join("");
	return args.length === 0
		? `String::from(${JSON.stringify(path)})`
		: `format!("${formatString}", ${args.join(", ")})`;
}

function renderFieldType(schema: IRSchema, required: boolean, stringOrStringArray = false): string {
	const base = stringOrStringArray ? "StringOrStringArray" : rustType(schema);
	if (required) {
		return base;
	}
	return `Option<${base}>`;
}

function rustType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "i64";
			if (schema.type === "number") return "f64";
			return "String";
		case "array":
			return `Vec<${rustType(schema.items)}>`;
		case "object":
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
			return "HashMap<String, String>";
		case "enum":
			return schema.values.filter((value) => value !== null).every((value) => typeof value === "boolean") ? "bool" : "String";
		case "union":
			return "String";
		case "intersection":
		case "unknown":
		case "literal":
			return "String";
		case "ref":
			return schema.name;
		case "nullable":
			return `Option<${rustType(schema.inner)}>`;
		default:
			return "String";
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
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return rustIdentifier(name);
	}
	return rustIdentifier(name.replace(/[^a-zA-Z0-9_]/g, "_"));
}

function rustIdentifier(name: string): string {
	const reserved = new Set([
		"as", "break", "const", "continue", "crate", "else", "enum", "extern",
		"false", "fn", "for", "if", "impl", "in", "let", "loop", "match",
		"mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static",
		"struct", "super", "trait", "true", "type", "unsafe", "use", "where",
		"while", "async", "await", "dyn"
	]);
	if (reserved.has(name)) {
		return `r#${name}`;
	}
	return name;
}
