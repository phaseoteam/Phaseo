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
		'\t"context"',
		'\t"encoding/json"',
		'\t"fmt"',
		'\t"io"',
		'\t"net/http"',
		'\t"net/url"',
		'\t"strconv"',
		'\t"strings"',
		'\t"time"',
		")",
		"",
		"type RequestOptions struct {",
		"\tContext        context.Context",
		"\tHeaders        map[string]string",
		"\tTimeout        time.Duration",
		"\tMaxRetries     *int",
		"\tIdempotencyKey string",
		"}",
		"",
		"type RequestEvent struct {",
		"\tMethod         string",
		"\tURL            string",
		"\tAttempt        int",
		"\tIdempotencyKey string",
		"\tStartedAt      time.Time",
		"}",
		"",
		"type ResponseEvent struct {",
		"\tRequestEvent",
		"\tStatusCode int",
		"\tRequestID  string",
		"\tElapsed    time.Duration",
		"}",
		"",
		"type RetryEvent struct {",
		"\tRequestEvent",
		"\tStatusCode int",
		"\tDelay      time.Duration",
		"\tErr        error",
		"}",
		"",
		"type Response struct {",
		"\tStatusCode int",
		"\tStatus     string",
		"\tHeaders    http.Header",
		"\tBody       []byte",
		"}",
		"",
		"func (r *Response) RequestID() string {",
		"\tif r == nil {",
		"\t\treturn \"\"",
		"\t}",
		"\tif value := r.Headers.Get(\"X-Request-Id\"); value != \"\" {",
		"\t\treturn value",
		"\t}",
		"\treturn r.Headers.Get(\"X-Phaseo-Request-Id\")",
		"}",
		"",
		"func (r *Response) TraceURL() string {",
		"\tif id := r.RequestID(); id != \"\" {",
		"\t\treturn \"https://phaseo.app/settings/usage/logs/requests/\" + url.PathEscape(id)",
		"\t}",
		"\treturn \"\"",
		"}",
		"",
		"type Client struct {",
		"\tBaseURL    string",
		"\tHTTPClient *http.Client",
		"\tHeaders    map[string]string",
		"\tTimeout    time.Duration",
		"\tMaxRetries int",
		"\tOnRequest  func(RequestEvent)",
		"\tOnResponse func(ResponseEvent)",
		"\tOnRetry    func(RetryEvent)",
		"}",
		"",
		"type HTTPError struct {",
		"\tStatusCode int",
		"\tStatus     string",
		"\tHeaders    http.Header",
		"\tBody       []byte",
		"\tCode       string",
		"}",
		"",
		"func (e *HTTPError) Error() string {",
		"\tif e == nil {",
		'\t\treturn \"http error\"',
		"\t}",
		'\tif text := strings.TrimSpace(string(e.Body)); text != \"\" {',
		'\t\treturn fmt.Sprintf(\"request failed: %s: %s\", e.Status, text)',
		"\t}",
		'\treturn fmt.Sprintf(\"request failed: %s\", e.Status)',
		"}",
		"",
		"func (e *HTTPError) RequestID() string {",
		"\tif e == nil {",
		"\t\treturn \"\"",
		"\t}",
		"\tif value := e.Headers.Get(\"X-Request-Id\"); value != \"\" {",
		"\t\treturn value",
		"\t}",
		"\treturn e.Headers.Get(\"X-Phaseo-Request-Id\")",
		"}",
		"",
		"func (e *HTTPError) TraceURL() string {",
		"\tif id := e.RequestID(); id != \"\" {",
		"\t\treturn \"https://phaseo.app/settings/usage/logs/requests/\" + url.PathEscape(id)",
		"\t}",
		"\treturn \"\"",
		"}",
		"",
		"func NewClient(baseURL string) *Client {",
		"\treturn &Client{",
		"\t\tBaseURL:    strings.TrimRight(baseURL, \"/\"),",
		"\t\tHTTPClient: http.DefaultClient,",
		"\t\tHeaders:    map[string]string{},",
		"\t\tTimeout:    60 * time.Second,",
		"\t}",
		"}",
		"",
		"func (c *Client) Request(method string, path string, query map[string]string, headers map[string]string, body any) ([]byte, error) {",
		"\tresponse, err := c.RequestWithOptions(method, path, query, body, &RequestOptions{Headers: headers})",
		"\tif err != nil {",
		"\t\treturn nil, err",
		"\t}",
		"\treturn response.Body, nil",
		"}",
		"",
		"func (c *Client) RequestWithOptions(method string, path string, query map[string]string, body any, options *RequestOptions) (*Response, error) {",
		"\tif options == nil {",
		"\t\toptions = &RequestOptions{}",
		"\t}",
		"\tmethod = strings.ToUpper(method)",
		"\tendpoint := c.BaseURL + path",
		"\tif len(query) > 0 {",
		"\t\tvalues := url.Values{}",
		"\t\tfor key, value := range query {",
		"\t\t\tvalues.Set(key, value)",
		"\t\t}",
		"\t\tendpoint += \"?\" + values.Encode()",
		"\t}",
		"\tvar bodyBytes []byte",
		"\tif body != nil {",
		"\t\tdata, err := json.Marshal(body)",
		"\t\tif err != nil {",
		"\t\t\treturn nil, err",
		"\t\t}",
		"\t\tbodyBytes = data",
		"\t}",
		"\tctx := options.Context",
		"\tif ctx == nil {",
		"\t\tctx = context.Background()",
		"\t}",
		"\ttimeout := options.Timeout",
		"\tif timeout == 0 {",
		"\t\ttimeout = c.Timeout",
		"\t}",
		"\tif timeout < 0 {",
		"\t\treturn nil, fmt.Errorf(\"timeout must be non-negative\")",
		"\t}",
		"\tif timeout > 0 {",
		"\t\tvar cancel context.CancelFunc",
		"\t\tctx, cancel = context.WithTimeout(ctx, timeout)",
		"\t\tdefer cancel()",
		"\t}",
		"\tretries := c.MaxRetries",
		"\tif options.MaxRetries != nil {",
		"\t\tretries = *options.MaxRetries",
		"\t}",
		"\tif retries < 0 || retries > 10 {",
		"\t\treturn nil, fmt.Errorf(\"max retries must be between 0 and 10\")",
		"\t}",
		"\tif method != http.MethodGet && method != http.MethodHead {",
		"\t\tretries = 0",
		"\t}",
		"\tstarted := time.Now()",
		"\tfor attempt := 0; ; attempt++ {",
		"\t\treq, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(bodyBytes))",
		"\t\tif err != nil {",
		"\t\t\treturn nil, err",
		"\t\t}",
		"\t\tfor key, value := range c.Headers {",
		"\t\t\treq.Header.Set(key, value)",
		"\t\t}",
		"\t\tfor key, value := range options.Headers {",
		"\t\t\treq.Header.Set(key, value)",
		"\t\t}",
		"\t\tif options.IdempotencyKey != \"\" {",
		"\t\t\treq.Header.Set(\"Idempotency-Key\", options.IdempotencyKey)",
		"\t\t}",
		"\t\tif body != nil {",
		"\t\t\treq.Header.Set(\"Content-Type\", \"application/json\")",
		"\t\t}",
		"\t\tevent := RequestEvent{Method: method, URL: endpoint, Attempt: attempt, IdempotencyKey: options.IdempotencyKey, StartedAt: time.Now()}",
		"\t\tif c.OnRequest != nil {",
		"\t\t\tc.OnRequest(event)",
		"\t\t}",
		"\t\tresp, err := c.HTTPClient.Do(req)",
		"\t\tif err != nil {",
		"\t\t\tif attempt >= retries {",
		"\t\t\t\treturn nil, err",
		"\t\t\t}",
		"\t\t\tdelay := backoff(attempt)",
		"\t\t\tif c.OnRetry != nil {",
		"\t\t\t\tc.OnRetry(RetryEvent{RequestEvent: event, Delay: delay, Err: err})",
		"\t\t\t}",
		"\t\t\tif err := wait(ctx, delay); err != nil {",
		"\t\t\t\treturn nil, err",
		"\t\t\t}",
		"\t\t\tcontinue",
		"\t\t}",
		"\t\tdata, readErr := io.ReadAll(resp.Body)",
		"\t\t_ = resp.Body.Close()",
		"\t\tif readErr != nil {",
		"\t\t\treturn nil, readErr",
		"\t\t}",
		"\t\tresponse := &Response{StatusCode: resp.StatusCode, Status: resp.Status, Headers: resp.Header.Clone(), Body: data}",
		"\t\tif retryableStatus(resp.StatusCode) && attempt < retries {",
		"\t\t\tdelay := retryDelay(resp.Header.Get(\"Retry-After\"), attempt)",
		"\t\t\tif c.OnRetry != nil {",
		"\t\t\t\tc.OnRetry(RetryEvent{RequestEvent: event, StatusCode: resp.StatusCode, Delay: delay})",
		"\t\t\t}",
		"\t\t\tif err := wait(ctx, delay); err != nil {",
		"\t\t\t\treturn nil, err",
		"\t\t\t}",
		"\t\t\tcontinue",
		"\t\t}",
		"\t\tif c.OnResponse != nil {",
		"\t\t\tc.OnResponse(ResponseEvent{RequestEvent: event, StatusCode: resp.StatusCode, RequestID: response.RequestID(), Elapsed: time.Since(started)})",
		"\t\t}",
		"\t\tif resp.StatusCode >= 400 {",
		"\t\t\treturn nil, &HTTPError{StatusCode: resp.StatusCode, Status: resp.Status, Headers: resp.Header.Clone(), Body: data, Code: errorCode(data)}",
		"\t\t}",
		"\t\treturn response, nil",
		"\t}",
		"}",
		"",
		"func DecodeJSON[T any](data []byte, out *T) error {",
		"\tif len(data) == 0 {",
		"\t\treturn nil",
		"\t}",
		"\treturn json.Unmarshal(data, out)",
		"}",
		"",
		"func errorCode(data []byte) string {",
		"\tvar body map[string]any",
		"\tif json.Unmarshal(data, &body) != nil {",
		"\t\treturn \"\"",
		"\t}",
		"\tif value, ok := body[\"code\"].(string); ok {",
		"\t\treturn value",
		"\t}",
		"\tif value, ok := body[\"error\"].(string); ok {",
		"\t\treturn value",
		"\t}",
		"\tif value, ok := body[\"error\"].(map[string]any); ok {",
		"\t\tif code, ok := value[\"code\"].(string); ok {",
		"\t\t\treturn code",
		"\t\t}",
		"\t}",
		"\treturn \"\"",
		"}",
		"",
		"func retryableStatus(status int) bool {",
		"\treturn status == 408 || status == 429 || status == 500 || status == 502 || status == 503 || status == 504",
		"}",
		"func backoff(attempt int) time.Duration {",
		"\tdelay := 250 * time.Millisecond * time.Duration(1<<attempt)",
		"\tif delay > 5*time.Second {",
		"\t\treturn 5 * time.Second",
		"\t}",
		"\treturn delay",
		"}",
		"func retryDelay(value string, attempt int) time.Duration {",
		"\tif seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds >= 0 {",
		"\t\treturn time.Duration(seconds * float64(time.Second))",
		"\t}",
		"\tif at, err := http.ParseTime(value); err == nil {",
		"\t\tif delay := time.Until(at); delay > 0 {",
		"\t\t\treturn delay",
		"\t\t}",
		"\t\treturn 0",
		"\t}",
		"\treturn backoff(attempt)",
		"}",
		"func wait(ctx context.Context, delay time.Duration) error {",
		"\ttimer := time.NewTimer(delay)",
		"\tdefer timer.Stop()",
		"\tselect {",
		"\tcase <-timer.C:",
		"\t\treturn nil",
		"\tcase <-ctx.Done():",
		"\t\treturn ctx.Err()",
		"\t}",
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
	const successResponse = selectSuccessResponse(operation);
	const returnType = goType(successResponse.schema ?? { kind: "unknown" });
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
		...(successResponse.kind === "text"
			? ["\treturn string(data), nil"]
			: [
				`\tvar out ${returnType}`,
				"\tif err := DecodeJSON(data, &out); err != nil {",
				`\t\tvar zero ${returnType}`,
				"\t\treturn zero, err",
				"\t}",
				"\treturn out, nil",
			]),
		"}"
	].join("\n");
}

function selectSuccessResponse(operation: IROperation): IROperation["responses"][number] {
	return operation.responses.find((response) => {
		const status = Number(response.status);
		return !Number.isNaN(status) && status >= 200 && status < 300;
	}) ?? { status: "default", schema: { kind: "unknown" } };
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = JSON.stringify(segment.slice(1, -1));
			return `url.PathEscape(path[${name}])`;
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
			return schema.values.filter((value) => value !== null).every((value) => typeof value === "boolean") ? "bool" : "string";
		case "array":
			return `[]${goType(schema.items)}`;
		case "object":
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
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
