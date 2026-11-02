<?php
declare(strict_types=1);

// Per-request credentials for trusted workloads.
// `apiKey` may be a callable that returns the credential for each request: an API key, or a
// short-lived token such as a GitHub Actions or Vercel OIDC token. It is called before every
// request and retry, so it can refresh tokens; cache inside it if fetching a token is expensive.

namespace Phaseo\Sdk;

use Phaseo\Gen\Client as GenClient;
use Phaseo\Gen\RequestException;

/**
 * Authorization header value that asks the provider for a credential each time the client
 * renders its headers, which the generated client does once per attempt.
 *
 * @internal
 */
final class BearerCredential implements \Stringable
{
    /** @var callable */
    private $provider;

    public function __construct(callable $provider)
    {
        $this->provider = $provider;
    }

    public function __toString(): string
    {
        return "Bearer " . self::resolve($this->provider);
    }

    /** Calls the provider and returns its trimmed credential; throws when it is blank. */
    public static function resolve(callable $provider): string
    {
        $value = $provider();
        if ($value !== null && !is_string($value) && !$value instanceof \Stringable) {
            throw new \UnexpectedValueException("The apiKey callable must return a string credential.");
        }
        $credential = trim((string) $value);
        if ($credential === "") {
            throw new \UnexpectedValueException("The apiKey callable returned an empty credential.");
        }
        return $credential;
    }

    public function __debugInfo(): array
    {
        return [];
    }

    public function __serialize(): array
    {
        throw new \LogicException("Credential providers cannot be serialized.");
    }
}

/** A trusted-workload token could not be fetched. Messages never include tokens. */
final class WorkloadTokenException extends \RuntimeException
{
}

/**
 * Credential providers for trusted workloads (beta). Pass the result as `apiKey`:
 * `new Phaseo(apiKey: WorkloadTokens::githubActions())`.
 *
 * Both helpers accept test hooks:
 * - `$http`: fn(string $method, string $url, array $headers, ?array $jsonBody): array{0:int,1:string}
 *   returning the status code and response body. Defaults to the SDK's cURL client with a
 *   10-second timeout.
 * - `$env`: fn(string $name): ?string. Defaults to getenv().
 * - `$clock`: fn(): int|float returning Unix seconds. Defaults to time().
 */
final class WorkloadTokens
{
    public const DEFAULT_AUDIENCE = "https://api.phaseo.app";
    public const VERCEL_EXCHANGE_URL = "https://oidc.vercel.com/~token";
    private const TIMEOUT_SECONDS = 10.0;
    private const REFRESH_MARGIN_SECONDS = 60;

    /**
     * Fetches a GitHub Actions OIDC token for Phaseo and reuses it until 60 seconds before it
     * expires. The job needs `permissions: id-token: write`.
     *
     * @return \Closure(): string
     */
    public static function githubActions(
        string $audience = self::DEFAULT_AUDIENCE,
        ?callable $http = null,
        ?callable $env = null,
        ?callable $clock = null
    ): \Closure {
        $audience = self::audience($audience);
        $http ??= [self::class, "send"];
        $env ??= [self::class, "getenv"];
        $clock ??= "time";
        $cache = null;

        return static function () use ($audience, $http, $env, $clock, &$cache): string {
            if ($cache !== null && $clock() < $cache["expires_at"] - self::REFRESH_MARGIN_SECONDS) {
                return $cache["token"];
            }
            $requestUrl = trim((string) ($env("ACTIONS_ID_TOKEN_REQUEST_URL") ?? ""));
            $requestToken = trim((string) ($env("ACTIONS_ID_TOKEN_REQUEST_TOKEN") ?? ""));
            if ($requestUrl === "" || $requestToken === "") {
                throw new WorkloadTokenException(
                    "GitHub Actions OIDC token is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set; give the job `permissions: id-token: write`."
                );
            }
            $url = $requestUrl . (str_contains($requestUrl, "?") ? "&" : "?") . "audience=" . rawurlencode($audience);
            [$status, $body] = $http("GET", $url, ["Authorization" => "bearer " . $requestToken, "Accept" => "application/json"], null);
            if ($status < 200 || $status > 299) {
                throw new WorkloadTokenException("GitHub Actions OIDC token request failed with status {$status}.");
            }
            $decoded = json_decode((string) $body, true);
            $token = is_array($decoded) && is_string($decoded["value"] ?? null) ? trim($decoded["value"]) : "";
            if ($token === "") {
                throw new WorkloadTokenException("GitHub Actions OIDC token response has no value.");
            }
            $expiresAt = self::jwtExpiry($token);
            $cache = $expiresAt === null ? null : ["token" => $token, "expires_at" => $expiresAt];
            return $token;
        };
    }

    /**
     * Exchanges the deployment's Vercel OIDC token for one issued to Phaseo and reuses it until
     * 60 seconds before it expires. The source token is `$token` (a string, or a callable such
     * as one returning the request's `x-vercel-oidc-token` header), then the file named by
     * VERCEL_OIDC_TOKEN_FILE, then VERCEL_OIDC_TOKEN.
     *
     * @param string|callable|null $token
     * @return \Closure(): string
     */
    public static function vercel(
        string|callable|null $token = null,
        string $audience = self::DEFAULT_AUDIENCE,
        ?callable $http = null,
        ?callable $env = null,
        ?callable $clock = null,
        string $exchangeUrl = self::VERCEL_EXCHANGE_URL
    ): \Closure {
        $audience = self::audience($audience);
        $http ??= [self::class, "send"];
        $env ??= [self::class, "getenv"];
        $clock ??= "time";
        $cache = null;

        return static function () use ($token, $audience, $http, $env, $clock, $exchangeUrl, &$cache): string {
            $source = self::vercelSourceToken($token, $env);
            $cacheKey = $audience . "\0" . $source;
            if ($cache !== null && $cache["key"] === $cacheKey && $clock() < $cache["expires_at"] - self::REFRESH_MARGIN_SECONDS) {
                return $cache["token"];
            }
            [$status, $body] = $http(
                "POST",
                $exchangeUrl,
                ["Content-Type" => "application/json", "Accept" => "application/json"],
                ["token" => $source, "aud" => $audience]
            );
            $decoded = json_decode((string) $body, true);
            $decoded = is_array($decoded) ? $decoded : [];
            if ($status < 200 || $status > 299) {
                $error = $decoded["error"] ?? null;
                $message = is_string($error) ? trim($error) : (is_array($error) && is_string($error["message"] ?? null) ? trim($error["message"]) : "");
                throw new WorkloadTokenException(
                    "Vercel OIDC token exchange failed with status {$status}" . ($message === "" ? "." : ": {$message}")
                );
            }
            $exchanged = is_string($decoded["token"] ?? null) ? trim($decoded["token"]) : "";
            if ($exchanged === "") {
                throw new WorkloadTokenException("Vercel OIDC token exchange response has no token.");
            }
            $expiry = $decoded["expiry"] ?? null;
            $expiresAt = is_numeric($expiry) && (float) $expiry > 0 ? (float) $expiry : self::jwtExpiry($exchanged);
            $cache = $expiresAt === null ? null : ["key" => $cacheKey, "token" => $exchanged, "expires_at" => $expiresAt];
            return $exchanged;
        };
    }

    /** Reads the JWT `exp` claim (Unix seconds) without checking the signature. */
    public static function jwtExpiry(string $token): ?float
    {
        $parts = explode(".", $token);
        if (count($parts) < 2) {
            return null;
        }
        $payload = base64_decode(strtr(rtrim($parts[1], "="), "-_", "+/"), true);
        $claims = $payload === false ? null : json_decode($payload, true);
        $exp = is_array($claims) ? ($claims["exp"] ?? null) : null;
        return is_numeric($exp) && (float) $exp > 0 ? (float) $exp : null;
    }

    private static function vercelSourceToken(mixed $token, callable $env): string
    {
        if (is_callable($token) && !is_string($token)) {
            $value = trim((string) ($token() ?? ""));
            if ($value === "") {
                throw new WorkloadTokenException("The Vercel OIDC token callable returned an empty token.");
            }
            return $value;
        }
        if (is_string($token) && trim($token) !== "") {
            return trim($token);
        }
        $path = trim((string) ($env("VERCEL_OIDC_TOKEN_FILE") ?? ""));
        if ($path !== "") {
            $contents = @file_get_contents($path);
            if ($contents === false) {
                throw new WorkloadTokenException("Unable to read VERCEL_OIDC_TOKEN_FILE.");
            }
            if (trim($contents) !== "") {
                return trim($contents);
            }
        }
        $value = trim((string) ($env("VERCEL_OIDC_TOKEN") ?? ""));
        if ($value !== "") {
            return $value;
        }
        throw new WorkloadTokenException(
            "No Vercel OIDC token: pass a token or callable (for example the x-vercel-oidc-token request header), or set VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN."
        );
    }

    private static function audience(string $audience): string
    {
        $audience = trim($audience);
        return $audience === "" ? self::DEFAULT_AUDIENCE : $audience;
    }

    /** @internal */
    public static function getenv(string $name): ?string
    {
        $value = getenv($name);
        return is_string($value) ? $value : null;
    }

    /**
     * Sends one request with the SDK's cURL client (and its CA bundle settings).
     *
     * @internal
     * @return array{0:int,1:string}
     */
    public static function send(string $method, string $url, array $headers, ?array $jsonBody): array
    {
        if ($jsonBody !== null) {
            // The client adds Content-Type: application/json itself whenever there is a body.
            $headers = array_filter($headers, static fn ($name): bool => strcasecmp((string) $name, "Content-Type") !== 0, ARRAY_FILTER_USE_KEY);
        }
        $client = (new GenClient($url, $headers))->setTimeout(self::TIMEOUT_SECONDS);
        try {
            $response = $client->requestWithResponse($method, "", null, null, $jsonBody);
            return [$response->statusCode, $response->body];
        } catch (RequestException $error) {
            return [$error->getStatusCode(), $error->getResponseBody()];
        }
    }
}
