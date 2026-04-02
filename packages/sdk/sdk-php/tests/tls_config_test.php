<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/gen/Client.php";

use AIStats\Gen\Client;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function read_private(object $target, string $property): mixed
{
    $ref = new ReflectionClass($target);
    $prop = $ref->getProperty($property);
    $prop->setAccessible(true);
    return $prop->getValue($target);
}

$tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . "aistats-php-sdk-tests";
if (!is_dir($tempDir)) {
    mkdir($tempDir, 0777, true);
}
$tempCa = $tempDir . DIRECTORY_SEPARATOR . "ca.pem";
file_put_contents($tempCa, "dummy");

putenv("AI_STATS_CA_BUNDLE=" . $tempCa);
$clientFromEnv = new Client("https://api.phaseo.app/v1");
$resolvedEnv = read_private($clientFromEnv, "caBundlePath");
assert_true(is_string($resolvedEnv) && $resolvedEnv !== "", "expected CA bundle resolved from AI_STATS_CA_BUNDLE");
assert_true(str_ends_with(str_replace("\\", "/", $resolvedEnv), "/ca.pem"), "expected resolved CA path to end with ca.pem");

$clientExplicit = new Client("https://api.phaseo.app/v1", [], $tempCa, false);
assert_true(read_private($clientExplicit, "verifyTls") === false, "expected verifyTls false when explicitly disabled");

$invalidThrows = false;
try {
    new Client("https://api.phaseo.app/v1", [], $tempDir . DIRECTORY_SEPARATOR . "missing-ca.pem");
} catch (InvalidArgumentException $e) {
    $invalidThrows = str_contains($e->getMessage(), "caBundlePath");
}
assert_true($invalidThrows, "expected invalid explicit caBundlePath to throw");

putenv("AI_STATS_CA_BUNDLE");
@unlink($tempCa);
@rmdir($tempDir);

echo "php tls config tests ok" . PHP_EOL;
