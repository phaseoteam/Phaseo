<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/gen/Client.php";

use Phaseo\Gen\Client;
use Phaseo\Gen\RequestException;
use Phaseo\Gen\Response;

function assert_core(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$response = new Response(200, ["X-Request-Id" => "req_php_core"], "{\"ok\":true}");
assert_core($response->requestId() === "req_php_core", "expected response request id");
assert_core(str_ends_with((string) $response->traceUrl(), "req_php_core"), "expected trace URL");

$error = new RequestException(
    429,
    "{\"error\":{\"code\":\"rate_limit_exceeded\"}}",
    ["X-Request-Id" => "req_php_error", "Retry-After" => "1.5"]
);
assert_core($error->getErrorCode() === "rate_limit_exceeded", "expected structured error code");
assert_core($error->getRequestId() === "req_php_error", "expected error request id");
assert_core($error->getRetryAfter() === 1.5, "expected retry-after metadata");

$client = new Client("https://example.test");
$invalidRetries = false;
try {
    $client->setMaxRetries(11);
} catch (InvalidArgumentException) {
    $invalidRetries = true;
}
assert_core($invalidRetries, "expected retry validation");

echo "php core contract tests ok" . PHP_EOL;
