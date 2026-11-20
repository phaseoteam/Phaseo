<?php
declare(strict_types=1);

// Router for `php -S` used by audio_multipart_test.php. Echoes how PHP parsed the request so the
// test can check the SDK's multipart encoding against a real multipart parser.

$files = [];
foreach ($_FILES as $name => $file) {
    $files[$name] = [
        "name" => $file["name"],
        "type" => $file["type"],
        "error" => $file["error"],
        "content" => $file["error"] === UPLOAD_ERR_OK ? file_get_contents($file["tmp_name"]) : null,
    ];
}

header("Content-Type: application/json");
echo json_encode([
    "method" => $_SERVER["REQUEST_METHOD"],
    "uri" => $_SERVER["REQUEST_URI"],
    "content_type" => $_SERVER["CONTENT_TYPE"] ?? ($_SERVER["HTTP_CONTENT_TYPE"] ?? ""),
    "post" => $_POST,
    "files" => $files,
    "raw" => empty($_FILES) ? file_get_contents("php://input") : "",
]);
return true;
