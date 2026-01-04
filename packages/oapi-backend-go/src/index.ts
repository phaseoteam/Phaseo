import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendGo: Backend = {
	id: "go",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "doc.go", contents: renderDoc() });
		files.push({ path: "models.go", contents: renderModels(ir.models) });
		files.push({ path: "client.go", contents: renderClient() });
		files.push({ path: "operations.go", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendGo;

function renderDoc(): string {
	return ["package gen", ""].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = ["package gen", ""];
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
		const lines: string[] = [`type ${model.name} struct {`];
		for (const field of fields) {
			const fieldName = exportName(field);
			const fieldType = renderFieldType(model.schema.properties[field], required.has(field));
			const tag = required.has(field) ? `json:"${field}"` : `json:"${field},omitempty"`;
			lines.push(`\t${fieldName} ${fieldType} \`${tag}\``);
		}
		lines.push("}");
		return lines.join("\n");
	}
	if (model.schema.kind === "enum" && model.schema.values.every((value) => typeof value === "string")) {
		const enumName = model.name;
		const seenValues = new Set<string>();
		const usedNames = new Set<string>();
		const consts = model.schema.values
			.map((value) => String(value))
			.filter((value) => {
				if (seenValues.has(value)) return false;
				seenValues.add(value);
				return true;
			})
			.map((value) => {
				const baseName = `${enumName}${exportName(value)}`;
				let name = baseName;
				let suffix = 1;
				while (usedNames.has(name)) {
					suffix += 1;
					name = `${baseName}${suffix}`;
				}
				usedNames.add(name);
				return `${name} ${enumName} = "${value}"`;
			})
			.join("\n");
		return [`type ${enumName} string`, "", "const (", `\t${consts.replace(/\n/g, "\n\t")}`, ")", ""].join("\n");
	}
	return `type ${model.name} = ${goType(model.schema)}`;
}

function renderClient(): string {
	return [
		"package gen",
		"",
		"import (",
		'\t"bytes"',
		'\t"encoding/json"',
		'\t"fmt"',
		'\t"io"',
		'\t"net/http"',
		'\t"net/url"',
		'\t"strings"',
		")",
		"",
		"type Client struct {",
		"\tBaseURL    string",
		"\tHTTPClient *http.Client",
		"\tHeaders    map[string]string",
		"}",
		"",
		"func NewClient(baseURL string) *Client {",
		"\treturn &Client{",
		"\t\tBaseURL:    strings.TrimRight(baseURL, \"/\"),",
		"\t\tHTTPClient: http.DefaultClient,",
		"\t\tHeaders:    map[string]string{},",
		"\t}",
		"}",
		"",
		"func (c *Client) Request(method string, path string, query map[string]string, headers map[string]string, body any) ([]byte, error) {",
		"\tendpoint := c.BaseURL + path",
		"\tif len(query) > 0 {",
		"\t\tvalues := url.Values{}",
		"\t\tfor key, value := range query {",
		"\t\t\tvalues.Set(key, value)",
		"\t\t}",
		"\t\tendpoint += \"?\" + values.Encode()",
		"\t}",
		"\tvar payload io.Reader",
		"\tif body != nil {",
		"\t\tdata, err := json.Marshal(body)",
		"\t\tif err != nil {",
		"\t\t\treturn nil, err",
		"\t\t}",
		"\t\tpayload = bytes.NewBuffer(data)",
		"\t}",
		"\treq, err := http.NewRequest(method, endpoint, payload)",
		"\tif err != nil {",
		"\t\treturn nil, err",
		"\t}",
		"\tfor key, value := range c.Headers {",
		"\t\treq.Header.Set(key, value)",
		"\t}",
		"\tfor key, value := range headers {",
		"\t\treq.Header.Set(key, value)",
		"\t}",
		"\tif body != nil {",
		"\t\treq.Header.Set(\"Content-Type\", \"application/json\")",
		"\t}",
		"\tresp, err := c.HTTPClient.Do(req)",
		"\tif err != nil {",
		"\t\treturn nil, err",
		"\t}",
		"\tdefer resp.Body.Close()",
		"\tif resp.StatusCode >= 400 {",
		"\t\treturn nil, fmt.Errorf(\"request failed: %s\", resp.Status)",
		"\t}",
		"\treturn io.ReadAll(resp.Body)",
		"}",
		"",
		"func DecodeJSON[T any](data []byte, out *T) error {",
		"\tif len(data) == 0 {",
		"\t\treturn nil",
		"\t}",
		"\treturn json.Unmarshal(data, out)",
		"}",
		""
	].join("\n");
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = ["package gen", "", 'import "net/url"', ""];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const returnType = goType(selectSuccessSchema(operation));
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`func ${exportName(operation.operationId)}(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (${returnType}, error) {`,
		`\tresolvedPath := ${pathTemplate}`,
		`\tdata, err := client.Request("${operation.method.toUpperCase()}", resolvedPath, query, headers, body)`,
		"\tif err != nil {",
		`\t\tvar zero ${returnType}`,
		"\t\treturn zero, err",
		"\t}",
		`\tvar out ${returnType}`,
		"\tif err := DecodeJSON(data, &out); err != nil {",
		`\t\tvar zero ${returnType}`,
		"\t\treturn zero, err",
		"\t}",
		"\treturn out, nil",
		"}"
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = path.split(/({[^}]+})/g).filter(Boolean);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = segment.slice(1, -1);
			return `url.PathEscape(path["${name}"])`;
		}
		return JSON.stringify(segment);
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
	const base = goType(schema);
	if (required || base === "interface{}") {
		return base;
	}
	if (base.startsWith("*")) {
		return base;
	}
	return `*${base}`;
}

function goType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "int";
			if (schema.type === "number") return "float64";
			return "string";
		case "literal":
			return "interface{}";
		case "enum":
			return "string";
		case "array":
			return `[]${goType(schema.items)}`;
		case "object":
			return "map[string]interface{}";
		case "union":
		case "intersection":
			return "interface{}";
		case "ref":
			return schema.name;
		case "nullable":
			return `*${goType(schema.inner)}`;
		case "unknown":
		default:
			return "interface{}";
	}
}

function exportName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ");
	const parts = cleaned.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "Value";
	return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}
