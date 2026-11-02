<?php
declare(strict_types=1);

// Router for `php -S` used by agent_loop_test.php: logs "<path> <Authorization>" to
// PHASEO_TEST_LOG and answers every request with a one-message Responses payload.

$authorization = "";
foreach (getallheaders() as $name => $value) {
    if (strcasecmp((string) $name, "Authorization") === 0) {
        $authorization = (string) $value;
    }
}
file_put_contents(getenv("PHASEO_TEST_LOG"), parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH) . " " . $authorization . "\n", FILE_APPEND);
header("Content-Type: application/json");
echo json_encode([
    "id" => "req_provider",
    "output" => [["type" => "message", "role" => "assistant", "content" => [["type" => "output_text", "text" => "ok"]]]],
]);
return true;
