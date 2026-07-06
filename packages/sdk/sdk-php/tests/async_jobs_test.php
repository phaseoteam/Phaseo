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

$client = new Phaseo(apiKey: "test", enableDeprecationWarnings: false);

assert_true(
    $client->asyncJobs()->websocketUrl("video", "video 123", 1500, false) ===
        "wss://api.phaseo.ai/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
    "expected async jobs resource websocket URL"
);

echo "php async jobs tests ok" . PHP_EOL;
