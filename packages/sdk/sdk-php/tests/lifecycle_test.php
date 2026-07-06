<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function invoke_private(object $target, string $method, array $args = []): mixed
{
    $ref = new ReflectionClass($target);
    $fn = $ref->getMethod($method);
    $fn->setAccessible(true);
    return $fn->invokeArgs($target, $args);
}

$warnings = [];
$deprecatedClient = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: true,
    warningsAsErrors: false,
    logger: function (string $level, string $message, array $meta) use (&$warnings): void {
        if ($level === "warn") {
            $warnings[] = [$message, $meta];
        }
    },
    lifecycleResolver: function (string $modelId): array {
        return [
            "model_id" => $modelId,
            "status" => "deprecated",
            "retirement_date" => "2099-01-01T00:00:00Z",
            "replacement_model_id" => "provider/new-model",
            "message" => "[phaseo] Model \"{$modelId}\" is deprecated and scheduled for retirement on 2099-01-01T00:00:00Z. Use \"provider/new-model\" instead."
        ];
    }
);

$validation = $deprecatedClient->validateModel("provider/old-model");
assert_true($validation["ok"] === false, "expected validateModel to reject deprecated model");
assert_true(str_contains((string) $validation["reason"], "provider/new-model"), "expected replacement model in validation reason");

$threw = false;
try {
    invoke_private($deprecatedClient, "maybeWarnForPayload", [["model" => "provider/old-model"]]);
} catch (RuntimeException $e) {
    $threw = str_contains($e->getMessage(), "provider/new-model");
}
assert_true($threw, "expected inactive model preflight to throw before dispatch");
assert_true(count($warnings) === 0, "expected no warning callback when request is blocked");

$retiredClient = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: true,
    warningsAsErrors: false,
    lifecycleResolver: function (string $modelId): array {
        return [
            "model_id" => $modelId,
            "status" => "retired",
            "retirement_date" => "2020-01-01T00:00:00Z",
            "message" => "[phaseo] Model \"{$modelId}\" is retired as of 2020-01-01T00:00:00Z."
        ];
    }
);

$threw = false;
try {
    invoke_private($retiredClient, "maybeWarnForPayload", [["model" => "provider/retired-model"]]);
} catch (RuntimeException $e) {
    $threw = str_contains($e->getMessage(), "retired");
}
assert_true($threw, "expected retired model preflight to throw regardless of warning mode");

echo "php lifecycle tests ok" . PHP_EOL;
