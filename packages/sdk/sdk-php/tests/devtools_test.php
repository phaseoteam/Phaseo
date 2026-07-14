<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;
use Phaseo\Sdk\Devtools;

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

$tmpDir = sys_get_temp_dir() . "/phaseo-devtools-php-" . bin2hex(random_bytes(4));
@mkdir($tmpDir, 0777, true);

try {
    $client = new Phaseo(
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
                    "request_id" => "req_php_1",
                    "session_id" => "session_php_chat_1",
                    "upstream_request_id" => "upstream_php_chat_1",
                    "pricing_lines" => [
                        ["provider" => "openai", "cost_usd" => 0.0025],
                    ],
                    "latency_ms" => 120,
                    "generation_ms" => 340,
                    "provider_attempts" => [
                        ["provider" => "openai", "status_code" => 200, "duration_ms" => 460],
                    ],
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
    assert_true(($entry["metadata"]["request_id"] ?? null) === "req_php_1", "expected request_id metadata");
    assert_true(($entry["metadata"]["session_id"] ?? null) === "session_php_chat_1", "expected session_id metadata");
    assert_true(($entry["metadata"]["upstream_request_id"] ?? null) === "upstream_php_chat_1", "expected upstream_request_id metadata");
    assert_true((($entry["metadata"]["pricing_lines"][0]["provider"] ?? null) === "openai"), "expected pricing lines metadata");
    assert_true(($entry["metadata"]["provider_attempts"][0]["provider"] ?? null) === "openai", "expected provider attempts metadata");
    $timestamp = $entry["timestamp"] ?? null;
    assert_true(is_int($timestamp) || is_float($timestamp), "expected numeric timestamp in telemetry entry");
    assert_true((float) $timestamp > 1000000000000, "expected millisecond epoch timestamp in telemetry entry");

    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "batches.create",
            [
                "input_file_id" => "file_php_1",
                "endpoint" => "/v1/responses",
                "completion_window" => "24h",
                "session_id" => "session_php_batch_1",
                "webhook" => ["url" => "https://example.com/hooks/batch"],
            ],
            false,
            function (): array {
                return [
                    "id" => "batch_php_1",
                    "object" => "batch",
                    "status" => "completed",
                    "endpoint" => "/v1/responses",
                    "provider" => "openai",
                    "request_id" => "req_php_batch_1",
                    "session_id" => "session_php_batch_1",
                    "pricing_lines" => [
                        ["dimension" => "batch_requests", "units" => 2],
                    ],
                    "request_counts" => [
                        "total" => 2,
                        "completed" => 1,
                        "failed" => 1,
                    ],
                    "billing" => [
                        "charged" => true,
                        "cost_usd" => 0.0025,
                    ],
                ];
            }
        ]
    );

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    assert_true(count($lines) >= 2, "expected second telemetry line for batch case");
    $batchEntry = json_decode($lines[1], true);
    assert_true(($batchEntry["type"] ?? null) === "batches.create", "expected batch telemetry type");
    assert_true(($batchEntry["request"]["session_id"] ?? null) === "session_php_batch_1", "expected request session_id");
    assert_true(($batchEntry["request"]["webhook"]["url"] ?? null) === "https://example.com/hooks/batch", "expected request webhook");
    assert_true(($batchEntry["metadata"]["provider"] ?? null) === "openai", "expected batch provider metadata");
    assert_true(($batchEntry["metadata"]["session_id"] ?? null) === "session_php_batch_1", "expected batch session_id metadata");
    assert_true(($batchEntry["metadata"]["request_counts"]["total"] ?? null) === 2, "expected batch request_counts metadata");
    assert_true(($batchEntry["metadata"]["billing"]["charged"] ?? null) === true, "expected batch billing metadata");

    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "generations.retrieve",
            ["id" => "gen_php_1"],
            false,
            function (): array {
                return [
                    "id" => "gen_php_1",
                    "provider" => "openai",
                    "request_id" => "req_php_generation_1",
                    "session_id" => "session_php_generation_1",
                    "status_code" => 200,
                ];
            }
        ]
    );

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    assert_true(count($lines) >= 3, "expected third telemetry line for generation lookup case");
    $generationEntry = json_decode($lines[2], true);
    assert_true(($generationEntry["type"] ?? null) === "generations.retrieve", "expected generation telemetry type");
    assert_true(($generationEntry["request"]["id"] ?? null) === "gen_php_1", "expected generation lookup request id");
    assert_true(($generationEntry["metadata"]["request_id"] ?? null) === "req_php_generation_1", "expected generation request_id metadata");
    assert_true(($generationEntry["metadata"]["session_id"] ?? null) === "session_php_generation_1", "expected generation session_id metadata");
    assert_true(($generationEntry["metadata"]["provider"] ?? null) === "openai", "expected generation provider metadata");

    $healthResponse = invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "health",
            null,
            false,
            function (): array {
                return [
                    "status" => "ok",
                    "timestamp" => "2026-05-05T12:00:00.000Z",
                ];
            }
        ]
    );
    assert_true(($healthResponse["status"] ?? null) === "ok", "expected health response payload");

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    assert_true(count($lines) >= 4, "expected fourth telemetry line for health case");
    $healthEntry = json_decode($lines[3], true);
    assert_true(($healthEntry["type"] ?? null) === "health", "expected health telemetry type");
    assert_true(($healthEntry["response"]["status"] ?? null) === "ok", "expected health response metadata");

    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "video.generations",
            ["model" => "google/veo-3", "prompt" => "orbital reveal"],
            false,
            function (): array {
                return [
                    "id" => "video_php_1",
                    "object" => "video",
                    "status" => "queued",
                    "provider" => "google",
                    "model" => "google/veo-3",
                    "request_id" => "req_php_video_1",
                    "session_id" => "session_php_video_1",
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "video.retrieve",
            ["video_id" => "video_php_1"],
            false,
            function (): array {
                return [
                    "id" => "video_php_1",
                    "object" => "video",
                    "status" => "completed",
                    "provider" => "google",
                    "model" => "google/veo-3",
                    "request_id" => "req_php_video_2",
                    "session_id" => "session_php_video_2",
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "video.cancel",
            ["video_id" => "video_php_1"],
            false,
            function (): array {
                return [
                    "id" => "video_php_1",
                    "object" => "video",
                    "status" => "cancelled",
                    "provider" => "google",
                    "model" => "google/veo-3",
                    "request_id" => "req_php_video_3",
                    "session_id" => "session_php_video_3",
                ];
            }
        ]
    );

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    assert_true(count($lines) >= 7, "expected seventh telemetry line for video lifecycle cases");
    $videoCreateEntry = json_decode($lines[4], true);
    assert_true(($videoCreateEntry["type"] ?? null) === "video.generations", "expected video create telemetry type");
    assert_true(($videoCreateEntry["metadata"]["request_id"] ?? null) === "req_php_video_1", "expected video create request_id metadata");
    $videoRetrieveEntry = json_decode($lines[5], true);
    assert_true(($videoRetrieveEntry["type"] ?? null) === "video.retrieve", "expected video retrieve telemetry type");
    assert_true(($videoRetrieveEntry["request"]["video_id"] ?? null) === "video_php_1", "expected video retrieve request payload");
    assert_true(($videoRetrieveEntry["metadata"]["session_id"] ?? null) === "session_php_video_2", "expected video retrieve session_id metadata");
    $videoCancelEntry = json_decode($lines[6], true);
    assert_true(($videoCancelEntry["type"] ?? null) === "video.cancel", "expected video cancel telemetry type");
    assert_true(($videoCancelEntry["metadata"]["request_id"] ?? null) === "req_php_video_3", "expected video cancel request_id metadata");

    try {
        invoke_private(
            $client,
            "withLifecycleAndTelemetry",
            [
                "responses",
                ["model" => "openai/gpt-5-nano", "input" => "hi"],
                false,
                function (): never {
                    throw new \Phaseo\Gen\RequestException(
                        429,
                        json_encode([
                            "request_id" => "req_php_err_1",
                            "provider_attempts" => [
                                ["provider" => "openrouter", "status_code" => 429, "duration_ms" => 612],
                            ],
                        ], JSON_UNESCAPED_SLASHES)
                    );
                }
            ]
        );
        throw new RuntimeException("expected RequestException to be thrown");
    } catch (\Phaseo\Gen\RequestException $error) {
        assert_true($error->getStatusCode() === 429, "expected RequestException status code");
    }

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    assert_true(count($lines) >= 8, "expected eighth telemetry line for error case");
    $errorEntry = json_decode($lines[count($lines) - 1], true);
    assert_true(($errorEntry["response"]["request_id"] ?? null) === "req_php_err_1", "expected error response payload to be recorded");
    assert_true(($errorEntry["metadata"]["request_id"] ?? null) === "req_php_err_1", "expected error metadata request id");
    assert_true(($errorEntry["error"]["status_code"] ?? null) === 429, "expected error status code to be recorded");

    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "models.list",
            ["limit" => "2"],
            false,
            function (): array {
                return [
                    "models" => [
                        ["model_id" => "openai/gpt-5-mini"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "providers",
            ["limit" => "2"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["slug" => "openai"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "credits",
            ["team_id" => "team_123"],
            false,
            function (): array {
                return [
                    "credits" => [
                        "remaining" => 42,
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "activity",
            ["days" => "30"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["date" => "2026-05-01", "requests" => 12],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "analytics",
            ["date" => "2026-05-01"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["endpoint_id" => "responses", "requests" => 9],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "endpoints.list",
            [],
            false,
            function (): array {
                return [
                    "data" => [
                        ["id" => "responses"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "organisations.list",
            ["limit" => "2", "offset" => "3"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["id" => "org_php_1"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "pricing.models",
            ["provider" => "openai"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["model_id" => "openai/gpt-5-mini"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "pricing.calculate",
            [
                "provider" => "openai",
                "model" => "openai/gpt-5-mini",
                "endpoint" => "responses",
            ],
            false,
            function (): array {
                return [
                    "pricing" => [
                        "currency" => "USD",
                        "total_cost_usd" => 0.0031,
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "provisioning.keys.list",
            ["disabled" => "true", "limit" => "2"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["id" => "key_php_1"],
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "key.current",
            [],
            false,
            function (): array {
                return [
                    "data" => [
                        "id" => "key_php_current_1",
                        "status" => "active",
                    ],
                ];
            }
        ]
    );
    invoke_private(
        $client,
        "withLifecycleAndTelemetry",
        [
            "provisioning.workspaces.list",
            ["limit" => "2"],
            false,
            function (): array {
                return [
                    "data" => [
                        ["id" => "ws_php_1"],
                    ],
                ];
            }
        ]
    );

    $lines = array_values(array_filter(array_map("trim", explode(PHP_EOL, (string) file_get_contents($generationsPath)))));
    $controlPlaneEntries = array_slice($lines, -12);
    $expectedTypes = [
        "models.list",
        "providers",
        "credits",
        "activity",
        "analytics",
        "endpoints.list",
        "organisations.list",
        "pricing.models",
        "pricing.calculate",
        "provisioning.keys.list",
        "key.current",
        "provisioning.workspaces.list",
    ];
    foreach ($expectedTypes as $index => $expectedType) {
        $entry = json_decode($controlPlaneEntries[$index], true);
        assert_true(($entry["type"] ?? null) === $expectedType, "expected control-plane telemetry type {$expectedType}");
    }

    $analyticsEntry = json_decode($controlPlaneEntries[4], true);
    assert_true(($analyticsEntry["response"]["data"][0]["endpoint_id"] ?? null) === "responses", "expected analytics response payload");
    $pricingEntry = json_decode($controlPlaneEntries[8], true);
    assert_true(($pricingEntry["response"]["pricing"]["currency"] ?? null) === "USD", "expected pricing calculation payload");
    $currentKeyEntry = json_decode($controlPlaneEntries[10], true);
    assert_true(($currentKeyEntry["response"]["data"]["id"] ?? null) === "key_php_current_1", "expected current key payload");
    $workspacesEntry = json_decode($controlPlaneEntries[11], true);
    assert_true(($workspacesEntry["response"]["data"][0]["id"] ?? null) === "ws_php_1", "expected workspace list payload");

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
