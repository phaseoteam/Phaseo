<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use AIStats\Sdk\AIStats;
use AIStats\Sdk\Devtools;

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

$tmpDir = sys_get_temp_dir() . "/ai-stats-devtools-php-" . bin2hex(random_bytes(4));
@mkdir($tmpDir, 0777, true);

try {
    $client = new AIStats(
        apiKey: "test",
        basePath: "https://api.phaseo.app/v1",
        enableDeprecationWarnings: false,
        devtools: Devtools::create(enabled: true, directory: $tmpDir)
    );

    $result = invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "responses",
            ["model" => "openai/gpt-5-nano", "input" => "hi"],
            false,
            function (): array {
                return [
                    "id" => "resp_1",
                    "model" => "openai/gpt-5-nano",
                    "usage" => [
                        "input_tokens" => 2,
                        "output_tokens" => 1,
                        "total_tokens" => 3,
                    ],
                ];
            }
        ]
    );

    assert_true(($result["id"] ?? null) === "resp_1", "expected operation result passthrough");

    $generationsPath = $tmpDir . "/generations.jsonl";
    $metadataPath = $tmpDir . "/metadata.json";

    assert_true(is_file($generationsPath), "expected generations.jsonl to be written");
    assert_true(is_file($metadataPath), "expected metadata.json to be written");

    $content = (string) file_get_contents($generationsPath);
    assert_true(str_contains($content, "\"type\":\"responses\""), "expected responses telemetry entry");
    assert_true(str_contains($content, "\"sdk\":\"php\""), "expected php sdk metadata");

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, $content))));
    assert_true(count($lines) >= 1, "expected at least one telemetry line");
    $entry = json_decode($lines[0], true);
    assert_true(is_array($entry), "expected first telemetry line to be valid JSON object");
    $timestamp = $entry["timestamp"] ?? null;
    assert_true(is_int($timestamp) || is_float($timestamp), "expected numeric timestamp in telemetry entry");
    assert_true((float) $timestamp > 1000000000000, "expected millisecond epoch timestamp in telemetry entry");

    $metadataJson = json_decode((string) file_get_contents($metadataPath), true);
    assert_true(is_array($metadataJson), "expected metadata.json to be valid JSON object");
    $startedAt = $metadataJson["started_at"] ?? null;
    assert_true(is_int($startedAt) || is_float($startedAt), "expected numeric started_at in metadata");
    assert_true((float) $startedAt > 1000000000000, "expected millisecond epoch started_at in metadata");

    echo "php devtools tests ok" . PHP_EOL;
} finally {
    if (is_dir($tmpDir)) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }
        @rmdir($tmpDir);
    }
}
