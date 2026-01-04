import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendJava: Backend = {
	id: "java",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "Client.java", contents: renderClient() });
		files.push({ path: "Models.java", contents: renderModels(ir.models) });
		files.push({ path: "Operations.java", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendJava;

function renderClient(): string {
	return [
		"package ai.stats.gen;",
		"",
		"import java.io.IOException;",
		"import java.net.URI;",
		"import java.net.URLEncoder;",
		"import java.net.http.HttpClient;",
		"import java.net.http.HttpRequest;",
		"import java.net.http.HttpResponse;",
		"import java.nio.charset.StandardCharsets;",
		"import java.util.HashMap;",
		"import java.util.Map;",
		"",
		"public class Client {",
		"\tprivate final String baseUrl;",
		"\tprivate final HttpClient http;",
		"\tprivate final Map<String, String> headers;",
		"",
		"\tpublic Client(String baseUrl) {",
		"\t\tthis(baseUrl, HttpClient.newHttpClient(), new HashMap<>());",
		"\t}",
		"",
		"\tpublic Client(String baseUrl, HttpClient http, Map<String, String> headers) {",
		"\t\tthis.baseUrl = baseUrl.replaceAll(\"/+$\", \"\");",
		"\t\tthis.http = http;",
		"\t\tthis.headers = headers;",
		"\t}",
		"",
		"\tpublic String request(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {",
		"\t\tString url = baseUrl + path;",
		"\t\tif (query != null && !query.isEmpty()) {",
		"\t\t\tStringBuilder qs = new StringBuilder();",
		"\t\t\tfor (Map.Entry<String, String> entry : query.entrySet()) {",
		"\t\t\t\tif (qs.length() > 0) qs.append(\"&\");",
		"\t\t\t\tqs.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));",
		"\t\t\t\tqs.append(\"=\");",
		"\t\t\t\tqs.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));",
		"\t\t\t}",
		"\t\t\turl += \"?\" + qs;",
		"\t\t}",
		"\t\tHttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).method(method, body != null ? HttpRequest.BodyPublishers.ofString(body) : HttpRequest.BodyPublishers.noBody());",
		"\t\tfor (Map.Entry<String, String> entry : headers.entrySet()) {",
		"\t\t\tbuilder.header(entry.getKey(), entry.getValue());",
		"\t\t}",
		"\t\tif (extraHeaders != null) {",
		"\t\t\tfor (Map.Entry<String, String> entry : extraHeaders.entrySet()) {",
		"\t\t\t\tbuilder.header(entry.getKey(), entry.getValue());",
		"\t\t\t}",
		"\t\t}",
		"\t\tif (body != null) {",
		"\t\t\tbuilder.header(\"Content-Type\", \"application/json\");",
		"\t\t}",
		"\t\tHttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());",
		"\t\tif (response.statusCode() >= 400) {",
		"\t\t\tthrow new IOException(\"Request failed: \" + response.statusCode());",
		"\t\t}",
		"\t\treturn response.body();",
		"\t}",
		"}",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = ["package ai.stats.gen;", "", "public final class Models {", "\tprivate Models() {}", ""];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	const lines: string[] = [`\tpublic static class ${model.name} {`];
	if (model.schema.kind === "object") {
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			lines.push(`\t\tpublic ${javaType(model.schema.properties[field])} ${name};`);
		}
	}
	lines.push("\t}");
	return lines.join("\n");
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"package ai.stats.gen;",
		"",
		"import java.io.IOException;",
		"import java.util.Map;",
		"",
		"public final class Operations {",
		"\tprivate Operations() {}",
		""
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`\tpublic static Object ${operation.operationId}(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {`,
		`\t\tString resolvedPath = ${pathTemplate};`,
		`\t\treturn client.request("${operation.method.toUpperCase()}", resolvedPath, query, headers, body);`,
		"\t}"
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
			return `(path != null && path.containsKey("${name}") ? path.get("${name}") : "")`;
		}
		return `"${segment}"`;
	});
	return parts.join(" + ");
}

function javaType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "Boolean";
			if (schema.type === "integer") return "Integer";
			if (schema.type === "number") return "Double";
			return "String";
		case "array":
			return `java.util.List<${javaType(schema.items)}>`;
		case "object":
		case "union":
		case "intersection":
			return "Object";
		case "ref":
			return `Models.${schema.name}`;
		case "nullable":
			return javaType(schema.inner);
		case "enum":
		case "literal":
		case "unknown":
		default:
			return "Object";
	}
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
