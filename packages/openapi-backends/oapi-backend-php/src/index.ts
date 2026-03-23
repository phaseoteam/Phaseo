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
		"\tprivate ?string $caBundlePath;",
		"\tprivate bool $verifyTls;",
		"",
		"\tpublic function __construct(",
		"\t\tstring $baseUrl,",
		"\t\tarray $headers = [],",
		"\t\t?string $caBundlePath = null,",
		"\t\tbool $verifyTls = true",
		"\t)",
		"\t{",
		"\t\t$this->baseUrl = rtrim($baseUrl, \"/\");",
		"\t\t$this->headers = $headers;",
		"\t\t$this->verifyTls = $verifyTls;",
		"\t\t$this->caBundlePath = $this->resolveCaBundlePath($caBundlePath);",
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
		"\t\tcurl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $this->verifyTls);",
		"\t\tcurl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $this->verifyTls ? 2 : 0);",
		"\t\tif ($this->verifyTls && $this->caBundlePath !== null) {",
		"\t\t\tcurl_setopt($ch, CURLOPT_CAINFO, $this->caBundlePath);",
		"\t\t}",
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
		"\t\t$errno = curl_errno($ch);",
		"\t\t$error = curl_error($ch);",
		"\t\tcurl_close($ch);",
		"\t\tif ($response === false) {",
		"\t\t\t$hint = $errno === 60",
		"\t\t\t\t? \" TLS verification failed. Configure curl.cainfo/openssl.cafile or set AI_STATS_CA_BUNDLE to a valid CA bundle path.\"",
		"\t\t\t\t: \"\";",
		"\t\t\tthrow new \\RuntimeException(\"Request transport failed (cURL errno {$errno}): {$error}.{$hint}\");",
		"\t\t}",
		"\t\tif ($status >= 400) {",
		"\t\t\tthrow new \\RuntimeException(\"Request failed: {$status}\");",
		"\t\t}",
		"\t\tif ($response === null || $response === \"\") {",
		"\t\t\treturn null;",
		"\t\t}",
		"\t\t$decoded = json_decode($response, true);",
		"\t\treturn $decoded === null ? $response : $decoded;",
		"\t}",
		"",
		"\tprivate function resolveCaBundlePath(?string $explicitPath): ?string",
		"\t{",
		"\t\tif ($explicitPath !== null) {",
		"\t\t\t$normalizedExplicit = trim($explicitPath);",
		"\t\t\tif ($normalizedExplicit === \"\" || !is_file($normalizedExplicit) || !is_readable($normalizedExplicit)) {",
		"\t\t\t\tthrow new \\InvalidArgumentException(\"Provided caBundlePath does not exist or is not readable: {$explicitPath}\");",
		"\t\t\t}",
		"\t\t\t$realPath = realpath($normalizedExplicit);",
		"\t\t\treturn $realPath !== false ? $realPath : $normalizedExplicit;",
		"\t\t}",
		"",
		"\t\t$candidates = [];",
		"\t\t$envCandidate = getenv(\"AI_STATS_CA_BUNDLE\");",
		"\t\tif (is_string($envCandidate) && trim($envCandidate) !== \"\") {",
		"\t\t\t$candidates[] = $envCandidate;",
		"\t\t}",
		"",
		"\t\t$curlIni = ini_get(\"curl.cainfo\");",
		"\t\tif (is_string($curlIni) && trim($curlIni) !== \"\") {",
		"\t\t\t$candidates[] = $curlIni;",
		"\t\t}",
		"",
		"\t\t$opensslIni = ini_get(\"openssl.cafile\");",
		"\t\tif (is_string($opensslIni) && trim($opensslIni) !== \"\") {",
		"\t\t\t$candidates[] = $opensslIni;",
		"\t\t}",
		"",
		"\t\t$sslCertFile = getenv(\"SSL_CERT_FILE\");",
		"\t\tif (is_string($sslCertFile) && trim($sslCertFile) !== \"\") {",
		"\t\t\t$candidates[] = $sslCertFile;",
		"\t\t}",
		"",
		"\t\t$candidates[] = dirname(__DIR__, 2) . \"/certs/cacert.pem\";",
		"",
		"\t\tforeach ($candidates as $candidate) {",
		"\t\t\t$normalized = trim((string) $candidate);",
		"\t\t\tif ($normalized === \"\") {",
		"\t\t\t\tcontinue;",
		"\t\t\t}",
		"\t\t\tif (is_file($normalized) && is_readable($normalized)) {",
		"\t\t\t\t$realPath = realpath($normalized);",
		"\t\t\t\treturn $realPath !== false ? $realPath : $normalized;",
		"\t\t\t}",
		"\t\t}",
		"",
		"\t\treturn null;",
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
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`class ${model.name}`, "{"]; 
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			const type = phpDocType(model.schema.properties[field], required.has(field));
			lines.push(`\t/** @var ${type} */`);
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

function phpDocType(schema: IRSchema, required: boolean): string {
	let type = phpBaseType(schema);
	if (!required && !type.includes("null")) {
		type = `${type}|null`;
	}
	return type;
}

function phpBaseType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "int";
			if (schema.type === "number") return "float";
			return "string";
		case "literal":
			return "mixed";
		case "enum":
			return "string";
		case "array":
			return "array";
		case "object":
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
			return "array<string, mixed>";
		case "union":
			return Array.from(new Set(schema.variants.map((variant) => phpBaseType(variant)))).join("|") || "mixed";
		case "intersection":
		case "unknown":
			return "mixed";
		case "ref":
			return schema.name;
		case "nullable": {
			const inner = phpBaseType(schema.inner);
			return inner.includes("null") ? inner : `${inner}|null`;
		}
		default:
			return "mixed";
	}
}

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
}

function _unusedType(_schema: IRSchema): string {
	return "mixed";
}
