<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;
use Phaseo\Sdk\WorkloadTokenException;
use Phaseo\Sdk\WorkloadTokens;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expect_throws(callable $action, string $class, string $contains, string $message): void
{
    try {
        $action();
    } catch (Throwable $error) {
        assert_true($error instanceof $class, $message . " (got " . get_class($error) . ": " . $error->getMessage() . ")");
        assert_true(str_contains($error->getMessage(), $contains), $message . " (message: " . $error->getMessage() . ")");
        return;
    }
    throw new RuntimeException($message . " (nothing thrown)");
}

function jwt_with_exp(int $exp): string
{
    return "header." . rtrim(strtr(base64_encode(json_encode(["exp" => $exp])), "+/", "-_"), "=") . ".sig";
}

/** @return list<array<string, mixed>> */
function read_log(string $log): array
{
    $lines = array_filter(explode("\n", (string) @file_get_contents($log)));
    return array_values(array_map(static fn ($line) => json_decode($line, true), $lines));
}

// Local server for the client tests: php -S with a router that records each request.
$log = tempnam(sys_get_temp_dir(), "phaseo-auth-");
$probe = stream_socket_server("tcp://127.0.0.1:0");
$port = (int) substr((string) stream_socket_get_name($probe, false), strrpos((string) stream_socket_get_name($probe, false), ":") + 1);
fclose($probe);
$server = proc_open(
    [PHP_BINARY, "-S", "127.0.0.1:{$port}", __DIR__ . "/fixtures/auth_server.php"],
    [0 => ["pipe", "r"], 1 => ["file", $log . ".out", "a"], 2 => ["file", $log . ".out", "a"]],
    $pipes,
    null,
    array_merge(getenv(), ["PHASEO_TEST_LOG" => $log])
);
assert_true(is_resource($server), "expected the local test server to start");

try {
    $ready = false;
    for ($i = 0; $i < 100 && !$ready; $i++) {
        $socket = @fsockopen("127.0.0.1", $port, $errno, $errstr, 0.1);
        if ($socket !== false) {
            fclose($socket);
            $ready = true;
        } else {
            usleep(50000);
        }
    }
    assert_true($ready, "expected the local test server to accept connections");
    $base = "http://127.0.0.1:{$port}/v1";
    file_put_contents($log, "");

    // Two requests with a provider send two different bearer tokens.
    $calls = 0;
    $client = new Phaseo(apiKey: function () use (&$calls): string {
        $calls++;
        return "  token-{$calls}  ";
    }, basePath: $base);
    $client->requestWithResponse("GET", "/echo");
    $client->requestWithResponse("GET", "/echo");
    $entries = read_log($log);
    assert_true(count($entries) === 2, "expected two requests");
    assert_true($entries[0]["authorization"] === "Bearer token-1", "expected first token, trimmed");
    assert_true($entries[1]["authorization"] === "Bearer token-2", "expected second token");

    // A retried request calls the provider again.
    file_put_contents($log, "");
    $calls = 0;
    $client->setMaxRetries(1);
    $response = $client->requestWithResponse("GET", "/flaky");
    $entries = read_log($log);
    assert_true($response->statusCode === 200, "expected the retry to succeed");
    assert_true(count($entries) === 2 && $calls === 2, "expected one retry and two provider calls");
    assert_true($entries[0]["authorization"] === "Bearer token-1" && $entries[1]["authorization"] === "Bearer token-2", "expected the retry to carry the new token");

    // A blank credential is an error and nothing is sent.
    file_put_contents($log, "");
    $blank = new Phaseo(apiKey: fn (): string => "   ", basePath: $base);
    expect_throws(fn () => $blank->requestWithResponse("GET", "/echo"), UnexpectedValueException::class, "empty credential", "expected blank credential error");
    $failing = new Phaseo(apiKey: function (): string {
        throw new LogicException("provider failed");
    }, basePath: $base);
    expect_throws(fn () => $failing->requestWithResponse("GET", "/echo"), LogicException::class, "provider failed", "expected provider errors to propagate");
    assert_true(read_log($log) === [], "expected no request after a blank or failing provider");

    // A per-request Authorization header wins and the provider isn't called.
    $calls = 0;
    $client->requestWithResponse("GET", "/echo", null, ["authorization" => "Bearer caller"]);
    $entries = read_log($log);
    assert_true($calls === 0, "expected the provider not to be called");
    assert_true(count($entries) === 1 && $entries[0]["authorization"] === "Bearer caller", "expected the caller's header");

    // Static keys and generated operations behave as before.
    file_put_contents($log, "");
    (new Phaseo(apiKey: "sk-static", basePath: $base))->health();
    assert_true(read_log($log)[0]["authorization"] === "Bearer sk-static", "expected the static key");

    // The credential never appears in debug output.
    assert_true(!str_contains(print_r($client->rawClient(), true), "token-"), "expected no credential in print_r output");

    // GitHub helper through the SDK's HTTP client against the local server.
    file_put_contents($log, "");
    $env = ["ACTIONS_ID_TOKEN_REQUEST_URL" => "http://127.0.0.1:{$port}/gh/token?api-version=2.0", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "request-token"];
    $provider = WorkloadTokens::githubActions(env: fn (string $name) => $env[$name] ?? null);
    $token = $provider();
    $entries = read_log($log);
    assert_true($token === jwt_with_exp(2000000000), "expected the token value");
    assert_true($entries[0]["uri"] === "/gh/token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app", "expected audience appended with &");
    assert_true($entries[0]["authorization"] === "bearer request-token", "expected the bearer request token");
} finally {
    proc_terminate($server);
    proc_close($server);
    @unlink($log);
    @unlink($log . ".out");
}

// GitHub helper with an injected transport: caching until near exp, then refetch.
$now = 1_000_000;
$requests = [];
$exp = $now + 600;
$http = function (string $method, string $url, array $headers, ?array $body) use (&$requests, &$exp): array {
    $requests[] = [$method, $url, $headers, $body];
    return [200, json_encode(["value" => jwt_with_exp($exp)])];
};
$env = ["ACTIONS_ID_TOKEN_REQUEST_URL" => "https://token.actions.example/x", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "rt"];
$provider = WorkloadTokens::githubActions(audience: "https://aud.example", http: $http, env: fn ($name) => $env[$name] ?? null, clock: function () use (&$now) {
    return $now;
});
$first = $provider();
assert_true($requests[0][0] === "GET" && $requests[0][1] === "https://token.actions.example/x?audience=https%3A%2F%2Faud.example", "expected ? separator and custom audience");
assert_true($requests[0][2]["Authorization"] === "bearer rt", "expected lowercase bearer");
$now += 500;
assert_true($provider() === $first && count($requests) === 1, "expected the cached token before exp - 60s");
$now += 50;
$exp = $now + 600;
assert_true($provider() !== $first && count($requests) === 2, "expected a refetch within 60s of exp");
$noExp = WorkloadTokens::githubActions(http: fn () => [200, json_encode(["value" => "opaque"])], env: fn ($name) => $env[$name] ?? null);
$noExp();
expect_throws(fn () => WorkloadTokens::githubActions(http: fn () => [403, "{}"], env: fn ($name) => $env[$name] ?? null)(), WorkloadTokenException::class, "403", "expected status in the error");
expect_throws(fn () => WorkloadTokens::githubActions(http: fn () => [200, "{}"], env: fn ($name) => $env[$name] ?? null)(), WorkloadTokenException::class, "no value", "expected missing value error");
expect_throws(fn () => WorkloadTokens::githubActions(env: fn () => null)(), WorkloadTokenException::class, "id-token: write", "expected the permissions hint");

// Vercel helper: posts token + aud, reads the file then env source, caches until near expiry.
$now = 2_000_000;
$requests = [];
$exchange = function (string $method, string $url, array $headers, ?array $body) use (&$requests, &$now): array {
    $requests[] = [$method, $url, $headers, $body];
    return [200, json_encode(["token" => "phaseo-" . count($requests), "expiry" => $now + 300])];
};
$tokenFile = tempnam(sys_get_temp_dir(), "phaseo-vercel-");
file_put_contents($tokenFile, "  file-token\n");
$vercelEnv = ["VERCEL_OIDC_TOKEN_FILE" => $tokenFile, "VERCEL_OIDC_TOKEN" => "env-token"];
$clock = function () use (&$now) {
    return $now;
};
$provider = WorkloadTokens::vercel(http: $exchange, env: fn ($name) => $vercelEnv[$name] ?? null, clock: $clock);
assert_true($provider() === "phaseo-1", "expected the exchanged token");
assert_true($requests[0][0] === "POST" && $requests[0][1] === "https://oidc.vercel.com/~token", "expected the exchange URL");
assert_true($requests[0][3] === ["token" => "file-token", "aud" => "https://api.phaseo.app"], "expected token + aud body from the file");
assert_true($requests[0][2]["Content-Type"] === "application/json" && $requests[0][2]["Accept"] === "application/json", "expected JSON headers");
$now += 200;
assert_true($provider() === "phaseo-1" && count($requests) === 1, "expected the cached exchange");
$now += 50;
assert_true($provider() === "phaseo-2" && count($requests) === 2, "expected a new exchange within 60s of expiry");
unlink($tokenFile);
unset($vercelEnv["VERCEL_OIDC_TOKEN_FILE"]);
WorkloadTokens::vercel(http: $exchange, env: fn ($name) => $vercelEnv[$name] ?? null, clock: $clock)();
assert_true(end($requests)[3]["token"] === "env-token", "expected VERCEL_OIDC_TOKEN when there is no file");
WorkloadTokens::vercel(token: fn () => "header-token", http: $exchange, env: fn () => null, clock: $clock)();
assert_true(end($requests)[3]["token"] === "header-token", "expected the token callable");
expect_throws(fn () => WorkloadTokens::vercel(http: fn () => [400, json_encode(["error" => "invalid audience"])], env: fn ($name) => $vercelEnv[$name] ?? null)(), WorkloadTokenException::class, "status 400: invalid audience", "expected the error body message");
expect_throws(fn () => WorkloadTokens::vercel(http: fn () => [200, "{}"], env: fn ($name) => $vercelEnv[$name] ?? null)(), WorkloadTokenException::class, "no token", "expected missing token error");
expect_throws(fn () => WorkloadTokens::vercel(env: fn () => null)(), WorkloadTokenException::class, "VERCEL_OIDC_TOKEN", "expected the missing source error");

echo "php workload token tests ok" . PHP_EOL;
