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
		"namespace Phaseo\\Gen;",
		"",
		"class Response",
		"{",
		"\tpublic int $statusCode;",
		"\tpublic array $headers;",
		"\tpublic string $body;",
		"\tpublic function __construct(int $statusCode, array $headers, string $body) { $this->statusCode = $statusCode; $this->headers = $headers; $this->body = $body; }",
		"\tpublic function requestId(): ?string { return self::header($this->headers, \"x-request-id\") ?? self::header($this->headers, \"x-phaseo-request-id\"); }",
		"\tpublic function traceUrl(): ?string { $id = $this->requestId(); return $id === null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" . rawurlencode($id); }",
		"\tpublic static function header(array $headers, string $name): ?string { foreach ($headers as $key => $value) if (strcasecmp((string) $key, $name) === 0) return is_array($value) ? ($value[0] ?? null) : (string) $value; return null; }",
		"}",
		"",
		"class RequestException extends \\RuntimeException",
		"{",
		"\tprivate int $statusCode;",
		"\tprivate string $responseBody;",
		"\tprivate array $headers;",
		"\tprivate ?string $errorCode;",
		"",
		"\tpublic function __construct(int $statusCode, string $responseBody, array $headers = [], ?string $message = null)",
		"\t{",
		"\t\t$this->statusCode = $statusCode;",
		"\t\t$this->responseBody = $responseBody;",
		"\t\t$this->headers = $headers;",
		"\t\t$decoded = json_decode($responseBody, true);",
		"\t\t$error = is_array($decoded) ? ($decoded[\"error\"] ?? $decoded) : null;",
		"\t\t$this->errorCode = is_string($error) ? $error : (is_array($error) && is_string($error[\"code\"] ?? null) ? $error[\"code\"] : null);",
		"\t\t$trimmed = trim($responseBody);",
		"\t\tparent::__construct($message ?? ($trimmed === \"\" ? \"Request failed: {$statusCode}\" : \"Request failed: {$statusCode} {$trimmed}\"));",
		"\t}",
		"",
		"\tpublic function getStatusCode(): int",
		"\t{",
		"\t\treturn $this->statusCode;",
		"\t}",
		"",
		"\tpublic function getResponseBody(): string",
		"\t{",
		"\t\treturn $this->responseBody;",
		"\t}",
		"\tpublic function getHeaders(): array { return $this->headers; }",
		"\tpublic function getErrorCode(): ?string { return $this->errorCode; }",
		"\tpublic function getRequestId(): ?string { return Response::header($this->headers, \"x-request-id\") ?? Response::header($this->headers, \"x-phaseo-request-id\"); }",
		"\tpublic function getTraceUrl(): ?string { $id = $this->getRequestId(); return $id === null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" . rawurlencode($id); }",
		"\tpublic function getRetryAfter(): ?float { $value = Response::header($this->headers, \"retry-after\"); if ($value === null) return null; if (is_numeric($value)) return max(0.0, (float) $value); $timestamp = strtotime($value); return $timestamp === false ? null : max(0.0, $timestamp - time()); }",
		"}",
		"",
		"class Client",
		"{",
		"\tprivate string $baseUrl;",
		"\tprivate array $headers;",
		"\tprivate ?string $caBundlePath;",
		"\tprivate bool $verifyTls;",
		"\tprivate float $timeout;",
		"\tprivate int $maxRetries;",
		"\tprivate $onRequest = null;",
		"\tprivate $onResponse = null;",
		"\tprivate $onRetry = null;",
		"",
		"\tpublic function __construct(",
		"\t\tstring $baseUrl,",
		"\t\tarray $headers = [],",
		"\t\t?string $caBundlePath = null,",
		"\t\tbool $verifyTls = true,",
		"\t\tfloat $timeout = 60.0,",
		"\t\tint $maxRetries = 0",
		"\t)",
		"\t{",
		"\t\t$this->baseUrl = rtrim($baseUrl, \"/\");",
		"\t\t$this->headers = $headers;",
		"\t\t$this->verifyTls = $verifyTls;",
		"\t\t$this->caBundlePath = $this->resolveCaBundlePath($caBundlePath);",
		"\t\t$this->setTimeout($timeout);",
		"\t\t$this->setMaxRetries($maxRetries);",
		"\t}",
		"",
		"\tpublic function setTimeout(float $timeout): self { if (!is_finite($timeout) || $timeout <= 0) throw new \\InvalidArgumentException(\"timeout must be positive\"); $this->timeout = $timeout; return $this; }",
		"\tpublic function setMaxRetries(int $maxRetries): self { if ($maxRetries < 0 || $maxRetries > 10) throw new \\InvalidArgumentException(\"max retries must be between 0 and 10\"); $this->maxRetries = $maxRetries; return $this; }",
		"\tpublic function setHooks(?callable $onRequest, ?callable $onResponse, ?callable $onRetry): self { $this->onRequest = $onRequest; $this->onResponse = $onResponse; $this->onRetry = $onRetry; return $this; }",
		"",
		"\tpublic function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string",
		"\t{",
		"\t\treturn $this->requestWithResponse($method, $path, $query, $headers, $body, null)->body;",
		"\t}",
		"",
		"\tpublic function requestWithResponse(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null, ?array $options = null): Response",
		"\t{",
		"\t\t$url = $this->baseUrl . $path;",
		"\t\tif (!empty($query)) {",
		"\t\t\t$url .= \"?\" . http_build_query($query);",
		"\t\t}",
		"\t\t$method = strtoupper($method);",
		"\t\t$retries = (int) ($options[\"max_retries\"] ?? $this->maxRetries);",
		"\t\tif ($retries < 0 || $retries > 10) throw new \\InvalidArgumentException(\"max retries must be between 0 and 10\");",
		"\t\tif ($method !== \"GET\" && $method !== \"HEAD\") $retries = 0;",
		"\t\t$started = microtime(true);",
		"\t\tfor ($attempt = 0; ; $attempt++) {",
		"\t\t\t$ch = curl_init($url);",
		"\t\t\t$responseHeaders = [];",
		"\t\t\tcurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);",
		"\t\t\tcurl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);",
		"\t\t\tcurl_setopt($ch, CURLOPT_TIMEOUT_MS, (int) round(1000 * (float) ($options[\"timeout\"] ?? $this->timeout)));",
		"\t\t\tcurl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $this->verifyTls);",
		"\t\t\tcurl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $this->verifyTls ? 2 : 0);",
		"\t\t\tcurl_setopt($ch, CURLOPT_HEADERFUNCTION, static function ($curl, string $line) use (&$responseHeaders): int { $length = strlen($line); $parts = explode(\":\", $line, 2); if (count($parts) === 2) $responseHeaders[trim($parts[0])] = trim($parts[1]); return $length; });",
		"\t\t\tif ($this->verifyTls && $this->caBundlePath !== null) curl_setopt($ch, CURLOPT_CAINFO, $this->caBundlePath);",
		"\t\t\t$mergedHeaders = array_merge($this->headers, $headers ?? [], $options[\"headers\"] ?? []);",
		"\t\t\tif (is_string($options[\"idempotency_key\"] ?? null) && trim($options[\"idempotency_key\"]) !== \"\") $mergedHeaders[\"Idempotency-Key\"] = $options[\"idempotency_key\"];",
		"\t\t\t$headerLines = []; foreach ($mergedHeaders as $key => $value) $headerLines[] = $key . \": \" . $value;",
		"\t\t\tif ($body !== null) { $payload = json_encode($body, JSON_THROW_ON_ERROR); $headerLines[] = \"Content-Type: application/json\"; curl_setopt($ch, CURLOPT_POSTFIELDS, $payload); }",
		"\t\t\tif (!empty($headerLines)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headerLines);",
		"\t\t\t$event = [\"method\" => $method, \"url\" => $url, \"attempt\" => $attempt, \"idempotency_key\" => $options[\"idempotency_key\"] ?? null, \"started_at\" => microtime(true)];",
		"\t\t\tif ($this->onRequest !== null) ($this->onRequest)($event);",
		"\t\t\t$response = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $errno = curl_errno($ch); $error = curl_error($ch); curl_close($ch);",
		"\t\t\tif ($response === false) {",
		"\t\t\t\tif ($attempt < $retries) { $delay = min(0.25 * (2 ** $attempt), 5.0); if ($this->onRetry !== null) ($this->onRetry)($event + [\"delay\" => $delay, \"error\" => $error]); usleep((int) round($delay * 1000000)); continue; }",
		"\t\t\t\t$hint = $errno === 60 ? \" TLS verification failed. Configure curl.cainfo/openssl.cafile or set PHASEO_CA_BUNDLE to a valid CA bundle path.\" : \"\";",
		"\t\t\t\tthrow new \\RuntimeException(\"Request transport failed (cURL errno {$errno}): {$error}.{$hint}\");",
		"\t\t\t}",
		"\t\t\tif (in_array($status, [408, 429, 500, 502, 503, 504], true) && $attempt < $retries) { $delay = self::retryDelay($responseHeaders, $attempt); if ($this->onRetry !== null) ($this->onRetry)($event + [\"delay\" => $delay, \"status_code\" => $status]); usleep((int) round($delay * 1000000)); continue; }",
		"\t\t\t$result = new Response($status, $responseHeaders, (string) $response);",
		"\t\t\tif ($this->onResponse !== null) ($this->onResponse)($event + [\"status_code\" => $status, \"request_id\" => $result->requestId(), \"elapsed\" => microtime(true) - $started]);",
		"\t\t\tif ($status >= 400) throw new RequestException($status, (string) $response, $responseHeaders);",
		"\t\t\treturn $result;",
		"\t\t}",
		"\t}",
		"",
		"\tpublic function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)",
		"\t{",
		"\t\t$response = $this->requestRaw($method, $path, $query, $headers, $body);",
		"\t\tif ($response === \"\") {",
		"\t\t\treturn null;",
		"\t\t}",
		"\t\t$decoded = json_decode($response, true);",
		"\t\treturn $decoded === null ? $response : $decoded;",
		"\t}",
		"",
		"\tpublic function requestStream(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): \\Generator",
		"\t{",
		"\t\t$url = $this->baseUrl . $path;",
		"\t\tif (!empty($query)) $url .= \"?\" . http_build_query($query);",
		"\t\t$merged = array_merge($this->headers, $headers ?? [], [\"Accept\" => \"text/event-stream\"]);",
		"\t\t$lines = [];",
		"\t\tforeach ($merged as $key => $value) $lines[] = $key . \": \" . $value;",
		"\t\t$payload = $body === null ? null : json_encode($body, JSON_THROW_ON_ERROR);",
		"\t\tif ($payload !== null) $lines[] = \"Content-Type: application/json\";",
		"\t\t$options = [\"http\" => [\"method\" => strtoupper($method), \"header\" => implode(\"\\r\\n\", $lines), \"content\" => $payload ?? \"\", \"ignore_errors\" => true], \"ssl\" => [\"verify_peer\" => $this->verifyTls, \"verify_peer_name\" => $this->verifyTls]];",
		"\t\tif ($this->verifyTls && $this->caBundlePath !== null) $options[\"ssl\"][\"cafile\"] = $this->caBundlePath;",
		"\t\t$stream = @fopen($url, \"rb\", false, stream_context_create($options));",
		"\t\tif ($stream === false) throw new \\RuntimeException(\"Unable to open streaming response from {$url}\");",
		"\t\ttry {",
		"\t\t\t$metadata = stream_get_meta_data($stream);",
		"\t\t\t$statusLine = $metadata[\"wrapper_data\"][0] ?? \"\";",
		"\t\t\tif (preg_match('/\\s(\\d{3})\\s/', (string) $statusLine, $match) && ((int) $match[1]) >= 400) {",
		"\t\t\t\t$raw = stream_get_contents($stream);",
		"\t\t\t\tthrow new RequestException((int) $match[1], $raw === false ? \"\" : $raw);",
		"\t\t\t}",
		"\t\t\twhile (($line = fgets($stream)) !== false) yield rtrim($line, \"\\r\\n\");",
		"\t\t} finally { fclose($stream); }",
		"\t}",
		"",
		"\tprivate static function retryDelay(array $headers, int $attempt): float",
		"\t{",
		"\t\t$value = Response::header($headers, \"retry-after\");",
		"\t\tif ($value !== null && is_numeric($value)) return max(0.0, (float) $value);",
		"\t\tif ($value !== null && ($timestamp = strtotime($value)) !== false) return max(0.0, $timestamp - time());",
		"\t\treturn min(0.25 * (2 ** $attempt), 5.0);",
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
		"\t\t$envCandidate = getenv(\"PHASEO_CA_BUNDLE\");",
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
		"namespace Phaseo\\Gen;",
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
		"namespace Phaseo\\Gen;",
		""
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const isJsonl = operation.responses.some((response) => Number(response.status) >= 200 && Number(response.status) < 300 && response.contentType === "application/x-ndjson");
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`function ${operation.operationId}(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)`,
		"{",
		"\t$path = $path ?? [];",
		`\t$resolvedPath = ${pathTemplate};`,
		`\treturn $client->${isJsonl ? "requestRaw" : "request"}("${operation.method.toUpperCase()}", $resolvedPath, $query, $headers, $body);`,
		"}"
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return `"${escapePhpDoubleQuoted(path)}"`;
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = sanitizeIdentifier(segment.slice(1, -1));
			return 'rawurlencode((string)($path["' + name + '"] ?? ""))';
		}
		return `"${escapePhpDoubleQuoted(segment)}"`;
	});
	return parts.join(" . ");
}

function escapePhpDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/"/g, '\\"');
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
