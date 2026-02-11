import type { Backend, BackendContext, GeneratedFile, IR, IRModel, IROperation, IRSchema } from "@ai-stats/oapi-core";
import { format } from "prettier";

export const backendTs: Backend = {
	id: "ts",
	async generate(ir: IR, ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		const modelFiles = emitModels(ir.models);
		const clientFiles = emitClients(ir.operations);
		const indexFiles = emitIndexes(ir);

		for (const file of [...modelFiles, ...clientFiles, ...indexFiles]) {
			files.push({
				path: file.path,
				contents: await formatSource(file.contents)
			});
		}

		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendTs;

type RawFile = { path: string; contents: string };

function emitModels(models: IRModel[]): RawFile[] {
	const files: RawFile[] = [];
	const indexExports: string[] = [];

	for (const model of models) {
		const body = renderModel(model);
		files.push({
			path: `models/${model.name}.ts`,
			contents: body
		});
		indexExports.push(`export type { ${model.name} } from "./${model.name}.js";`);
	}

	files.push({
		path: "models/index.ts",
		contents: indexExports.join("\n") + (indexExports.length ? "\n" : "")
	});

	return files;
}

function emitClients(operations: IROperation[]): RawFile[] {
	const files: RawFile[] = [];
	const byTag = new Map<string, IROperation[]>();
	for (const operation of operations) {
		const tag = operation.tags[0] ?? "default";
		const group = byTag.get(tag) ?? [];
		group.push(operation);
		byTag.set(tag, group);
	}

	const indexExports: string[] = [];
	for (const [tag, ops] of Array.from(byTag.entries()).sort(([a], [b]) => a.localeCompare(b))) {
		const fileName = byTag.size === 1 ? "default" : toFileName(tag);
		const contents = [
			`import type { Client } from "../../runtime/client.js";`,
			"",
			...ops
				.sort((a, b) => a.operationId.localeCompare(b.operationId))
				.map((op) => renderOperation(op))
		].join("\n");
		files.push({
			path: `client/${fileName}.ts`,
			contents
		});
		indexExports.push(`export * from "./${fileName}.js";`);
	}

	files.push({
		path: "client/index.ts",
		contents: indexExports.join("\n") + (indexExports.length ? "\n" : "")
	});

	return files;
}

function emitIndexes(ir: IR): RawFile[] {
	const contents = [
		`export * as models from "./models/index.js";`,
		`export * as client from "./client/index.js";`
	].join("\n");
	return [{ path: "index.ts", contents: contents + "\n" }];
}

function renderModel(model: IRModel): string {
	const schema = model.schema;
	const lines: string[] = [];
	if (model.doc) {
		lines.push(renderJsDoc(model.doc));
	}
	if (schema.kind === "object") {
		lines.push(`export interface ${model.name} ${renderObjectType(schema)}`);
	} else {
		lines.push(`export type ${model.name} = ${tsType(schema)};`);
	}
	return lines.join("\n") + "\n";
}

function renderOperation(operation: IROperation): string {
	const lines: string[] = [];
	const paramsTypeName = `${capitalize(operation.operationId)}Params`;
	const responseType = tsType(selectSuccessSchema(operation));
	const pathParams = operation.params.filter((param) => param.in === "path");
	const queryParams = operation.params.filter((param) => param.in === "query");
	const headerParams = operation.params.filter((param) => param.in === "header");
	const bodySchema = operation.requestBody?.schema;

	const paramsType = renderOperationParamsType(
		paramsTypeName,
		pathParams,
		queryParams,
		headerParams,
		bodySchema
	);
	lines.push(paramsType);

	if (operation.doc) {
		lines.push(renderJsDoc(operation.doc));
	}

	lines.push(`export async function ${operation.operationId}(`);
	lines.push(`\tclient: Client,`);
	lines.push(`\targs: ${paramsTypeName} = {}`);
	lines.push(`): Promise<${responseType}> {`);
	lines.push(`\tconst { path, query, headers, body } = args;`);
	lines.push(`\tconst resolvedPath = ${renderPathTemplate(operation.path, pathParams)};`);
	lines.push(`\treturn client.request<${responseType}>({`);
	lines.push(`\t\tmethod: "${operation.method.toUpperCase()}",`);
	lines.push(`\t\tpath: resolvedPath,`);
	lines.push(`\t\tquery,`);
	lines.push(`\t\theaders,`);
	lines.push(`\t\tbody`);
	lines.push(`\t});`);
	lines.push(`}`);
	lines.push("");
	return lines.join("\n");
}

function renderOperationParamsType(
	typeName: string,
	pathParams: IROperation["params"],
	queryParams: IROperation["params"],
	headerParams: IROperation["params"],
	bodySchema?: IRSchema
): string {
	const fields: string[] = [];
	if (pathParams.length > 0) {
		fields.push(`path?: ${renderParamsObject(pathParams)};`);
	}
	if (queryParams.length > 0) {
		fields.push(`query?: ${renderParamsObject(queryParams)};`);
	}
	if (headerParams.length > 0) {
		fields.push(`headers?: ${renderParamsObject(headerParams)};`);
	}
	if (bodySchema) {
		fields.push(`body?: ${tsType(bodySchema)};`);
	}
	if (fields.length === 0) {
		return `export type ${typeName} = Record<string, never>;\n`;
	}
	return `export type ${typeName} = {\n\t${fields.join("\n\t")}\n};\n`;
}

function renderParamsObject(params: IROperation["params"]): string {
	const lines: string[] = ["{"]; 
	for (const param of params.sort((a, b) => a.name.localeCompare(b.name))) {
		const optional = param.required ? "" : "?";
		const name = renderPropertyName(param.name);
		lines.push(`\t${name}${optional}: ${tsType(param.schema)};`);
	}
	lines.push("}");
	return lines.join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = segment.slice(1, -1);
			return `\${encodeURIComponent(String(path?.${name}))}`;
		}
		return segment.replace(/`/g, "\\`").replace(/\$/g, "\\$");
	});
	return "`" + parts.join("") + "`";
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

function renderObjectType(schema: Extract<IRSchema, { kind: "object" }>): string {
	const lines: string[] = ["{"]; 
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	for (const key of keys) {
		const isRequired = schema.required.includes(key);
		const optional = isRequired ? "" : "?";
		lines.push(`\t${renderPropertyName(key)}${optional}: ${tsType(schema.properties[key])};`);
	}
	if (schema.additionalProperties) {
		const additional =
			schema.additionalProperties === true
				? "unknown"
				: schema.additionalProperties
					? tsType(schema.additionalProperties)
					: "unknown";
		lines.push(`\t[key: string]: ${additional};`);
	}
	lines.push("}");
	return lines.join("\n");
}

function tsType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			return schema.type === "integer" ? "number" : schema.type;
		case "literal":
			return JSON.stringify(schema.value);
		case "enum":
			return schema.values.map((value) => JSON.stringify(value)).join(" | ");
		case "array":
			return `${tsType(schema.items)}[]`;
		case "object":
			return renderObjectType(schema);
		case "union":
			return schema.variants.map(tsType).join(" | ");
		case "intersection":
			return schema.parts.map(tsType).join(" & ");
		case "ref":
			return schema.name;
		case "nullable":
			return `${tsType(schema.inner)} | null`;
		case "unknown":
			return "unknown";
		default:
			return "unknown";
	}
}

function renderPropertyName(name: string): string {
	return isIdentifier(name) ? name : JSON.stringify(name);
}

function isIdentifier(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function toFileName(tag: string): string {
	const normalized = tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "default";
}

function renderJsDoc(text: string): string {
	const lines = text.split(/\r?\n/);
	return ["/**", ...lines.map((line) => ` * ${line}`), " */"].join("\n");
}

function capitalize(value: string): string {
	return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

async function formatSource(source: string): Promise<string> {
	return format(source, { parser: "typescript" });
}
