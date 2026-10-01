<?php
declare(strict_types=1);

namespace Phaseo\Gen;

class Response
{
	public int $statusCode;
	public array $headers;
	public string $body;
	public function __construct(int $statusCode, array $headers, string $body) { $this->statusCode = $statusCode; $this->headers = $headers; $this->body = $body; }
	public function requestId(): ?string { return self::header($this->headers, "x-request-id") ?? self::header($this->headers, "x-phaseo-request-id"); }
	public function traceUrl(): ?string { $id = $this->requestId(); return $id === null ? null : "https://phaseo.app/settings/usage/logs/requests/" . rawurlencode($id); }
	public static function header(array $headers, string $name): ?string { foreach ($headers as $key => $value) if (strcasecmp((string) $key, $name) === 0) return is_array($value) ? ($value[0] ?? null) : (string) $value; return null; }
}

class RequestException extends \RuntimeException
{
	private int $statusCode;
	private string $responseBody;
	private array $headers;
	private ?string $errorCode;

	public function __construct(int $statusCode, string $responseBody, array $headers = [], ?string $message = null)
	{
		$this->statusCode = $statusCode;
		$this->responseBody = $responseBody;
		$this->headers = $headers;
		$decoded = json_decode($responseBody, true);
		$error = is_array($decoded) ? ($decoded["error"] ?? $decoded) : null;
		$this->errorCode = is_string($error) ? $error : (is_array($error) && is_string($error["code"] ?? null) ? $error["code"] : null);
		$trimmed = trim($responseBody);
		parent::__construct($message ?? ($trimmed === "" ? "Request failed: {$statusCode}" : "Request failed: {$statusCode} {$trimmed}"));
	}

	public function getStatusCode(): int
	{
		return $this->statusCode;
	}

	public function getResponseBody(): string
	{
		return $this->responseBody;
	}
	public function getHeaders(): array { return $this->headers; }
	public function getErrorCode(): ?string { return $this->errorCode; }
	public function getRequestId(): ?string { return Response::header($this->headers, "x-request-id") ?? Response::header($this->headers, "x-phaseo-request-id"); }
	public function getTraceUrl(): ?string { $id = $this->getRequestId(); return $id === null ? null : "https://phaseo.app/settings/usage/logs/requests/" . rawurlencode($id); }
	public function getRetryAfter(): ?float { $value = Response::header($this->headers, "retry-after"); if ($value === null) return null; if (is_numeric($value)) return max(0.0, (float) $value); $timestamp = strtotime($value); return $timestamp === false ? null : max(0.0, $timestamp - time()); }
}

class Client
{
	private string $baseUrl;
	private array $headers;
	private ?string $caBundlePath;
	private bool $verifyTls;
	private float $timeout;
	private int $maxRetries;
	private $onRequest = null;
	private $onResponse = null;
	private $onRetry = null;

	public function __construct(
		string $baseUrl,
		array $headers = [],
		?string $caBundlePath = null,
		bool $verifyTls = true,
		float $timeout = 60.0,
		int $maxRetries = 0
	)
	{
		$this->baseUrl = rtrim($baseUrl, "/");
		$this->headers = $headers;
		$this->verifyTls = $verifyTls;
		$this->caBundlePath = $this->resolveCaBundlePath($caBundlePath);
		$this->setTimeout($timeout);
		$this->setMaxRetries($maxRetries);
	}

	public function setTimeout(float $timeout): self { if (!is_finite($timeout) || $timeout <= 0) throw new \InvalidArgumentException("timeout must be positive"); $this->timeout = $timeout; return $this; }
	public function setMaxRetries(int $maxRetries): self { if ($maxRetries < 0 || $maxRetries > 10) throw new \InvalidArgumentException("max retries must be between 0 and 10"); $this->maxRetries = $maxRetries; return $this; }
	public function setHooks(?callable $onRequest, ?callable $onResponse, ?callable $onRetry): self { $this->onRequest = $onRequest; $this->onResponse = $onResponse; $this->onRetry = $onRetry; return $this; }

	public function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string
	{
		return $this->requestWithResponse($method, $path, $query, $headers, $body, null)->body;
	}

	public function requestWithResponse(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null, ?array $options = null): Response
	{
		$url = $this->baseUrl . $path;
		if (!empty($query)) {
			$url .= "?" . http_build_query($query);
		}
		$method = strtoupper($method);
		$retries = (int) ($options["max_retries"] ?? $this->maxRetries);
		if ($retries < 0 || $retries > 10) throw new \InvalidArgumentException("max retries must be between 0 and 10");
		if ($method !== "GET" && $method !== "HEAD") $retries = 0;
		$started = microtime(true);
		for ($attempt = 0; ; $attempt++) {
			$ch = curl_init($url);
			$responseHeaders = [];
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
			curl_setopt($ch, CURLOPT_TIMEOUT_MS, (int) round(1000 * (float) ($options["timeout"] ?? $this->timeout)));
			curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $this->verifyTls);
			curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $this->verifyTls ? 2 : 0);
			curl_setopt($ch, CURLOPT_HEADERFUNCTION, static function ($curl, string $line) use (&$responseHeaders): int { $length = strlen($line); $parts = explode(":", $line, 2); if (count($parts) === 2) $responseHeaders[trim($parts[0])] = trim($parts[1]); return $length; });
			if ($this->verifyTls && $this->caBundlePath !== null) curl_setopt($ch, CURLOPT_CAINFO, $this->caBundlePath);
			$mergedHeaders = array_merge($this->headers, $headers ?? [], $options["headers"] ?? []);
			if (is_string($options["idempotency_key"] ?? null) && trim($options["idempotency_key"]) !== "") $mergedHeaders["Idempotency-Key"] = $options["idempotency_key"];
			$headerLines = []; foreach ($mergedHeaders as $key => $value) $headerLines[] = $key . ": " . $value;
			if ($body !== null) { $payload = json_encode($body, JSON_THROW_ON_ERROR); $headerLines[] = "Content-Type: application/json"; curl_setopt($ch, CURLOPT_POSTFIELDS, $payload); }
			if (!empty($headerLines)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headerLines);
			$event = ["method" => $method, "url" => $url, "attempt" => $attempt, "idempotency_key" => $options["idempotency_key"] ?? null, "started_at" => microtime(true)];
			if ($this->onRequest !== null) ($this->onRequest)($event);
			$response = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $errno = curl_errno($ch); $error = curl_error($ch); curl_close($ch);
			if ($response === false) {
				if ($attempt < $retries) { $delay = min(0.25 * (2 ** $attempt), 5.0); if ($this->onRetry !== null) ($this->onRetry)($event + ["delay" => $delay, "error" => $error]); usleep((int) round($delay * 1000000)); continue; }
				$hint = $errno === 60 ? " TLS verification failed. Configure curl.cainfo/openssl.cafile or set PHASEO_CA_BUNDLE to a valid CA bundle path." : "";
				throw new \RuntimeException("Request transport failed (cURL errno {$errno}): {$error}.{$hint}");
			}
			if (in_array($status, [408, 429, 500, 502, 503, 504], true) && $attempt < $retries) { $delay = self::retryDelay($responseHeaders, $attempt); if ($this->onRetry !== null) ($this->onRetry)($event + ["delay" => $delay, "status_code" => $status]); usleep((int) round($delay * 1000000)); continue; }
			$result = new Response($status, $responseHeaders, (string) $response);
			if ($this->onResponse !== null) ($this->onResponse)($event + ["status_code" => $status, "request_id" => $result->requestId(), "elapsed" => microtime(true) - $started]);
			if ($status >= 400) throw new RequestException($status, (string) $response, $responseHeaders);
			return $result;
		}
	}

	public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
	{
		$response = $this->requestRaw($method, $path, $query, $headers, $body);
		if ($response === "") {
			return null;
		}
		$decoded = json_decode($response, true);
		return $decoded === null ? $response : $decoded;
	}

	public function requestStream(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): \Generator
	{
		$url = $this->baseUrl . $path;
		if (!empty($query)) $url .= "?" . http_build_query($query);
		$merged = array_merge($this->headers, $headers ?? [], ["Accept" => "text/event-stream"]);
		$lines = [];
		foreach ($merged as $key => $value) $lines[] = $key . ": " . $value;
		$payload = $body === null ? null : json_encode($body, JSON_THROW_ON_ERROR);
		if ($payload !== null) $lines[] = "Content-Type: application/json";
		$options = ["http" => ["method" => strtoupper($method), "header" => implode("\r\n", $lines), "content" => $payload ?? "", "ignore_errors" => true], "ssl" => ["verify_peer" => $this->verifyTls, "verify_peer_name" => $this->verifyTls]];
		if ($this->verifyTls && $this->caBundlePath !== null) $options["ssl"]["cafile"] = $this->caBundlePath;
		$stream = @fopen($url, "rb", false, stream_context_create($options));
		if ($stream === false) throw new \RuntimeException("Unable to open streaming response from {$url}");
		try {
			$metadata = stream_get_meta_data($stream);
			$statusLine = $metadata["wrapper_data"][0] ?? "";
			if (preg_match('/\s(\d{3})\s/', (string) $statusLine, $match) && ((int) $match[1]) >= 400) {
				$raw = stream_get_contents($stream);
				throw new RequestException((int) $match[1], $raw === false ? "" : $raw);
			}
			while (($line = fgets($stream)) !== false) yield rtrim($line, "\r\n");
		} finally { fclose($stream); }
	}

	private static function retryDelay(array $headers, int $attempt): float
	{
		$value = Response::header($headers, "retry-after");
		if ($value !== null && is_numeric($value)) return max(0.0, (float) $value);
		if ($value !== null && ($timestamp = strtotime($value)) !== false) return max(0.0, $timestamp - time());
		return min(0.25 * (2 ** $attempt), 5.0);
	}

	private function resolveCaBundlePath(?string $explicitPath): ?string
	{
		if ($explicitPath !== null) {
			$normalizedExplicit = trim($explicitPath);
			if ($normalizedExplicit === "" || !is_file($normalizedExplicit) || !is_readable($normalizedExplicit)) {
				throw new \InvalidArgumentException("Provided caBundlePath does not exist or is not readable: {$explicitPath}");
			}
			$realPath = realpath($normalizedExplicit);
			return $realPath !== false ? $realPath : $normalizedExplicit;
		}

		$candidates = [];
		$envCandidate = getenv("PHASEO_CA_BUNDLE");
		if (is_string($envCandidate) && trim($envCandidate) !== "") {
			$candidates[] = $envCandidate;
		}

		$curlIni = ini_get("curl.cainfo");
		if (is_string($curlIni) && trim($curlIni) !== "") {
			$candidates[] = $curlIni;
		}

		$opensslIni = ini_get("openssl.cafile");
		if (is_string($opensslIni) && trim($opensslIni) !== "") {
			$candidates[] = $opensslIni;
		}

		$sslCertFile = getenv("SSL_CERT_FILE");
		if (is_string($sslCertFile) && trim($sslCertFile) !== "") {
			$candidates[] = $sslCertFile;
		}

		$candidates[] = dirname(__DIR__, 2) . "/certs/cacert.pem";

		foreach ($candidates as $candidate) {
			$normalized = trim((string) $candidate);
			if ($normalized === "") {
				continue;
			}
			if (is_file($normalized) && is_readable($normalized)) {
				$realPath = realpath($normalized);
				return $realPath !== false ? $realPath : $normalized;
			}
		}

		return null;
	}
}
