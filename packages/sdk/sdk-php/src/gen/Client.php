<?php
declare(strict_types=1);

namespace Phaseo\Gen;

class RequestException extends \RuntimeException
{
	private int $statusCode;
	private string $responseBody;

	public function __construct(int $statusCode, string $responseBody, ?string $message = null)
	{
		$this->statusCode = $statusCode;
		$this->responseBody = $responseBody;
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
}

class Client
{
	private string $baseUrl;
	private array $headers;
	private ?string $caBundlePath;
	private bool $verifyTls;

	public function __construct(
		string $baseUrl,
		array $headers = [],
		?string $caBundlePath = null,
		bool $verifyTls = true
	)
	{
		$this->baseUrl = rtrim($baseUrl, "/");
		$this->headers = $headers;
		$this->verifyTls = $verifyTls;
		$this->caBundlePath = $this->resolveCaBundlePath($caBundlePath);
	}

	public function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string
	{
		$url = $this->baseUrl . $path;
		if (!empty($query)) {
			$url .= "?" . http_build_query($query);
		}
		$ch = curl_init($url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $this->verifyTls);
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $this->verifyTls ? 2 : 0);
		if ($this->verifyTls && $this->caBundlePath !== null) {
			curl_setopt($ch, CURLOPT_CAINFO, $this->caBundlePath);
		}
		$mergedHeaders = array_merge($this->headers, $headers ?? []);
		$headerLines = [];
		foreach ($mergedHeaders as $key => $value) {
			$headerLines[] = $key . ": " . $value;
		}
		if ($body !== null) {
			$payload = json_encode($body);
			$headerLines[] = "Content-Type: application/json";
			curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
		}
		if (!empty($headerLines)) {
			curl_setopt($ch, CURLOPT_HTTPHEADER, $headerLines);
		}
		$response = curl_exec($ch);
		$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
		$errno = curl_errno($ch);
		$error = curl_error($ch);
		curl_close($ch);
		if ($response === false) {
			$hint = $errno === 60
				? " TLS verification failed. Configure curl.cainfo/openssl.cafile or set PHASEO_CA_BUNDLE to a valid CA bundle path."
				: "";
			throw new \RuntimeException("Request transport failed (cURL errno {$errno}): {$error}.{$hint}");
		}
		if ($status >= 400) {
			throw new RequestException($status, (string) $response);
		}
		return (string) $response;
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
