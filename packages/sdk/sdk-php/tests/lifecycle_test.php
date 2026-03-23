<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use AIStats\Sdk\AIStats;

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
$deprecatedClient = new AIStats(
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
            "message" => "[ai-stats] Model \"{$modelId}\" is deprecated and scheduled for retirement on 2099-01-01T00:00:00Z. Use \"provider/new-model\" instead."
        ];
    }
);

invoke_private($deprecatedClient, "maybeWarnForModel", ["provider/old-model"]);
invoke_private($deprecatedClient, "maybeWarnForModel", ["provider/old-model"]);
assert_true(count($warnings) === 1, "expected warn-once behavior for deprecated model");
assert_true(str_contains($warnings[0][0], "provider/new-model"), "expected replacement model in warning message");

$retiredClient = new AIStats(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: true,
    warningsAsErrors: true,
    lifecycleResolver: function (string $modelId): array {
        return [
            "model_id" => $modelId,
            "status" => "retired",
            "retirement_date" => "2020-01-01T00:00:00Z",
            "message" => "[ai-stats] Model \"{$modelId}\" is retired as of 2020-01-01T00:00:00Z."
        ];
    }
);

$threw = false;
try {
    invoke_private($retiredClient, "maybeWarnForModel", ["provider/retired-model"]);
} catch (RuntimeException $e) {
    $threw = str_contains($e->getMessage(), "retired");
}
assert_true($threw, "expected warningsAsErrors to throw for retired model");

echo "php lifecycle tests ok" . PHP_EOL;
