import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@ai-stats/oapi-core";

export const backendPhp: Backend = {
	id: "php",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "Client.php", contents: renderClient() });
		files.push({ path: "Models.php", contents: renderModels(ir.models) });
		files.push({ path: "Operations.php", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendPhp;

function renderClient(): string {
	return [
		"<?php",
		"declare(strict_types=1);",
		"",
		"namespace AIStats\\Gen;",
		"",
		"class Client",
		"{",
		"\tprivate string $baseUrl;",
		"\tprivate array $headers;",
		"",
		"\tpublic function __construct(string $baseUrl, array $headers = [])",
		"\t{",
		"\t\t$this->baseUrl = rtrim($baseUrl, \"/\");",
		"\t\t$this->headers = $headers;",
		"\t}",
		"",
		"\tpublic function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)",
		"\t{",
		"\t\t$url = $this->baseUrl . $path;",
		"\t\tif (!empty($query)) {",
		"\t\t\t$url .= \"?\" . http_build_query($query);",
		"\t\t}",
		"\t\t$ch = curl_init($url);",
		"\t\tcurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);",
		"\t\tcurl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));",
		"\t\t$mergedHeaders = array_merge($this->headers, $headers ?? []);",
		"\t\t$headerLines = [];",
		"\t\tforeach ($mergedHeaders as $key => $value) {",
		"\t\t\t$headerLines[] = $key . \": \" . $value;",
		"\t\t}",
		"\t\tif ($body !== null) {",
		"\t\t\t$payload = json_encode($body);",
		"\t\t\t$headerLines[] = \"Content-Type: application/json\";",
		"\t\t\tcurl_setopt($ch, CURLOPT_POSTFIELDS, $payload);",
		"\t\t}",
		"\t\tif (!empty($headerLines)) {",
		"\t\t\tcurl_setopt($ch, CURLOPT_HTTPHEADER, $headerLines);",
		"\t\t}",
		"\t\t$response = curl_exec($ch);",
		"\t\t$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);",
		"\t\tcurl_close($ch);",
		"\t\tif ($status >= 400) {",
		"\t\t\tthrow new \\RuntimeException(\"Request failed: {$status}\");",
		"\t\t}",
		"\t\tif ($response === false || $response === null || $response === \"\") {",
		"\t\t\treturn null;",
		"\t\t}",
		"\t\t$decoded = json_decode($response, true);",
		"\t\treturn $decoded === null ? $response : $decoded;",
		"\t}",
		"}",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = [
		"<?php",
		"declare(strict_types=1);",
		"",
		"namespace AIStats\\Gen;",
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
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`class ${model.name}`, "{"]; 
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			lines.push(`\tpublic $${name};`);
		}
		lines.push("}");
		return lines.join("\n");
	}
	return `class ${model.name} { }`;
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"<?php",
		"declare(strict_types=1);",
		"",
		"namespace AIStats\\Gen;",
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
		`function ${operation.operationId}(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)`,
		"{",
		"\t$path = $path ?? [];",
		`\t$resolvedPath = ${pathTemplate};`,
		`\treturn $client->request("${operation.method.toUpperCase()}", $resolvedPath, $query, $headers, $body);`,
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
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return '{$path["' + name + '"]}';
		}
		return segment.replace(/"/g, '\\"');
	});
	return `"${parts.join("")}"`;
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function _unusedType(_schema: IRSchema): string {
	return "mixed";
}
