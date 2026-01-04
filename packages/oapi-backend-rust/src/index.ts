import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

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
			const type = renderFieldType(model.schema.properties[field], required.has(field));
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
		"",
		"#[derive(Debug)]",
		"pub struct Response {",
		"\tpub status: u16,",
		"\tpub body: String,",
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
		return `String::from("${path}")`;
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = segment.slice(1, -1);
			return `path.get("${name}").cloned().unwrap_or_default()`;
		}
		return `String::from("${segment}")`;
	});
	return parts.join(" + ");
}

function renderFieldType(schema: IRSchema, required: boolean): string {
	const base = rustType(schema);
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
			return "HashMap<String, String>";
		case "union":
		case "intersection":
		case "unknown":
		case "literal":
		case "enum":
			return "String";
		case "ref":
			return schema.name;
		case "nullable":
			return `Option<${rustType(schema.inner)}>`;
		default:
			return "String";
	}
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
