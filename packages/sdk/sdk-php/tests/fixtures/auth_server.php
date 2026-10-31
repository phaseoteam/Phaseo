<?php
declare(strict_types=1);

// Router for `php -S` used by workload_tokens_test.php. Appends each request to the JSON-lines
// log named by PHASEO_TEST_LOG and answers by path.

$log = getenv("PHASEO_TEST_LOG");
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$headers = function_exists("getallheaders") ? getallheaders() : [];
$authorization = "";
foreach ($headers as $name => $value) {
    if (strcasecmp((string) $name, "Authorization") === 0) {
        $authorization = (string) $value;
    }
}
$entry = [
    "method" => $_SERVER["REQUEST_METHOD"],
    "uri" => $_SERVER["REQUEST_URI"],
    "authorization" => $authorization,
    "body" => file_get_contents("php://input"),
];
file_put_contents($log, json_encode($entry) . "\n", FILE_APPEND);
$count = 0;
foreach (array_filter(explode("\n", (string) file_get_contents($log))) as $line) {
    if (parse_url((string) (json_decode($line, true)["uri"] ?? ""), PHP_URL_PATH) === $path) {
        $count++;
    }
}

header("Content-Type: application/json");
if ($path === "/v1/flaky" && $count === 1) {
    http_response_code(503);
    header("Retry-After: 0");
    echo json_encode(["error" => "try again"]);
    return true;
}
if ($path === "/gh/token") {
    $payload = rtrim(strtr(base64_encode(json_encode(["exp" => 2000000000])), "+/", "-_"), "=");
    echo json_encode(["value" => "header.{$payload}.sig"]);
    return true;
}
echo json_encode(["ok" => true, "authorization" => $authorization]);
return true;
