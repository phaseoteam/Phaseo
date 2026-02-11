<?php
declare(strict_types=1);

namespace AIStats\Gen;

class Client
{
	private string $baseUrl;
	private array $headers;

	public function __construct(string $baseUrl, array $headers = [])
	{
		$this->baseUrl = rtrim($baseUrl, "/");
		$this->headers = $headers;
	}

	public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
	{
		$url = $this->baseUrl . $path;
		if (!empty($query)) {
			$url .= "?" . http_build_query($query);
		}
		$ch = curl_init($url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
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
		curl_close($ch);
		if ($status >= 400) {
			throw new \RuntimeException("Request failed: {$status}");
		}
		if ($response === false || $response === null || $response === "") {
			return null;
		}
		$decoded = json_decode($response, true);
		return $decoded === null ? $response : $decoded;
	}
}
