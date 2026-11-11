<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;
use Phaseo\Sdk\PhaseoFile;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeAudioClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        return "{\"text\":\"hello\",\"id\":\"file_123\"}";
    }
}

/** @return array<string, string> field name => value */
function form_fields(\Phaseo\Gen\MultipartBody $body): array
{
    $fields = [];
    foreach ($body->fields() as [$name, $value]) {
        $fields[$name] = $value;
    }
    return $fields;
}

function new_client(?string $basePath = null): Phaseo
{
    return new Phaseo(
        apiKey: "test",
        basePath: $basePath ?? "https://api.phaseo.app/v1",
        enableDeprecationWarnings: false,
        lifecycleResolver: static fn (string $modelId): ?array => null,
    );
}

$client = new_client();
$fake = new FakeAudioClient();
$prop = (new ReflectionClass($client))->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

// Transcription with a PhaseoFile: multipart with a file part and string fields.
$result = $client->generateTranscription([
    "model" => "openai/gpt-4o-transcribe",
    "file" => PhaseoFile::fromBytes("RIFFfakeaudio", "clip.mp3"),
    "language" => "en",
    "temperature" => 0.2,
    "stream" => false,
    "timestamp_granularities" => ["word", "segment"],
    "provider" => ["order" => ["openai"]],
]);
assert_true(($result["text"] ?? null) === "hello", "expected decoded transcription");
[$method, $path, $query, , $body] = $fake->calls[0];
assert_true($method === "POST" && $path === "/audio/transcriptions" && $query === null, "expected POST /audio/transcriptions");
assert_true($body instanceof \Phaseo\Gen\MultipartBody, "expected a multipart body for a file transcription");
assert_true(str_starts_with($body->contentType(), "multipart/form-data; boundary="), "expected multipart/form-data content type");
assert_true($body->files() === [["file", "RIFFfakeaudio", "clip.mp3", "audio/mpeg"]], "expected a file part named file");
assert_true(form_fields($body) === [
    "model" => "openai/gpt-4o-transcribe",
    "language" => "en",
    "temperature" => "0.2",
    "stream" => "false",
    "timestamp_granularities" => "[\"word\",\"segment\"]",
    "provider" => "{\"order\":[\"openai\"]}",
], "expected string form fields with JSON-encoded objects and lowercase bools");
$encoded = $body->encode();
assert_true(str_contains($encoded, "Content-Disposition: form-data; name=\"file\"; filename=\"clip.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\nRIFFfakeaudio\r\n"), "expected encoded file part");
assert_true(str_contains($encoded, "Content-Disposition: form-data; name=\"model\"\r\n\r\nopenai/gpt-4o-transcribe\r\n"), "expected encoded model field");

// Transcription with a local path in the legacy array payload: multipart.
$tmpDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . "phaseo-audio-" . bin2hex(random_bytes(4));
mkdir($tmpDir);
$audioPath = $tmpDir . DIRECTORY_SEPARATOR . "speech.wav";
file_put_contents($audioPath, "wavdata");
try {
    $client->generateTranscription(["model" => "openai/whisper-1", "file" => $audioPath]);
    $body = $fake->calls[1][4];
    assert_true($body instanceof \Phaseo\Gen\MultipartBody, "expected a local path to be sent as multipart");
    assert_true($body->files() === [["file", "wavdata", "speech.wav", "audio/wav"]], "expected file part read from disk");
    assert_true(form_fields($body) === ["model" => "openai/whisper-1"], "expected model field");
} finally {
    @unlink($audioPath);
    @rmdir($tmpDir);
}

// Transcription with only file_url stays JSON.
$client->createTranscription(["model" => "openai/whisper-1", "file_url" => "https://example.com/audio.mp3"]);
assert_true($fake->calls[2] === ["POST", "/audio/transcriptions", null, null, ["model" => "openai/whisper-1", "file_url" => "https://example.com/audio.mp3"]], "expected JSON transcription for file_url only");

// Translation from a stream with an explicit filename.
$stream = fopen("php://memory", "r+");
fwrite($stream, "oggdata");
rewind($stream);
$client->generateTranslation(["model" => "openai/whisper-1", "file" => $stream, "filename" => "voice.ogg", "prompt" => "Bonjour"]);
fclose($stream);
[$method, $path, , , $body] = $fake->calls[3];
assert_true($method === "POST" && $path === "/audio/translations", "expected POST /audio/translations");
assert_true($body instanceof \Phaseo\Gen\MultipartBody, "expected a multipart translation");
assert_true($body->files() === [["file", "oggdata", "voice.ogg", "audio/ogg"]], "expected stream file part");
assert_true(form_fields($body) === ["model" => "openai/whisper-1", "prompt" => "Bonjour"], "expected translation fields without filename");

// Upload: multipart to /batches/files, model/provider in the query string.
$client->uploadFile(["file" => PhaseoFile::fromBytes("{\"custom_id\":\"a\"}\n", "batch.jsonl"), "purpose" => "batch"], "openai/gpt-5-mini", "openai");
[$method, $path, $query, , $body] = $fake->calls[4];
assert_true($method === "POST" && $path === "/batches/files", "expected POST /batches/files");
assert_true($query === ["model" => "openai/gpt-5-mini", "provider" => "openai"], "expected model and provider query params");
assert_true($body instanceof \Phaseo\Gen\MultipartBody, "expected multipart upload");
assert_true($body->files() === [["file", "{\"custom_id\":\"a\"}\n", "batch.jsonl", "application/jsonl"]], "expected JSONL file part");
assert_true(form_fields($body) === ["purpose" => "batch"], "expected only purpose as a form field");

// Upload: model in the payload moves to the query string.
$client->uploadFile(["file" => "data:application/jsonl;base64,eyJhIjoxfQo=", "purpose" => "batch", "model" => "openai/gpt-5-mini"]);
[, $path, $query, , $body] = $fake->calls[5];
assert_true($path === "/batches/files" && $query === ["model" => "openai/gpt-5-mini"], "expected payload model in the query string");
assert_true(form_fields($body) === ["purpose" => "batch"], "expected model removed from form fields");

// Upload without a file fails before any request.
$callCount = count($fake->calls);
try {
    $client->uploadFile(["purpose" => "batch"]);
    throw new RuntimeException("expected InvalidArgumentException");
} catch (\InvalidArgumentException $error) {
    assert_true(count($fake->calls) === $callCount, "expected no request without a file");
}

// Real transport: send through cURL to php -S and let PHP's multipart parser read it back.
$probe = stream_socket_server("tcp://127.0.0.1:0");
$name = (string) stream_socket_get_name($probe, false);
$port = (int) substr($name, strrpos($name, ":") + 1);
fclose($probe);
$serverLog = tempnam(sys_get_temp_dir(), "phaseo-multipart-");
$server = proc_open(
    [PHP_BINARY, "-S", "127.0.0.1:{$port}", __DIR__ . "/fixtures/multipart_server.php"],
    [0 => ["pipe", "r"], 1 => ["file", $serverLog, "a"], 2 => ["file", $serverLog, "a"]],
    $pipes
);
assert_true(is_resource($server), "expected the local test server to start");
try {
    $ready = false;
    for ($i = 0; $i < 100 && !$ready; $i++) {
        $socket = @fsockopen("127.0.0.1", $port, $errno, $errstr, 0.1);
        if ($socket !== false) {
            fclose($socket);
            $ready = true;
        } else {
            usleep(50000);
        }
    }
    assert_true($ready, "expected the local test server to accept connections");
    $live = new_client("http://127.0.0.1:{$port}/v1");

    $echo = $live->generateTranslation(["model" => "openai/whisper-1", "file" => PhaseoFile::fromBytes("fakeflac", "a \"quoted\" name.flac"), "temperature" => 0]);
    assert_true($echo["uri"] === "/v1/audio/translations", "expected the translation path on the wire");
    assert_true(str_starts_with($echo["content_type"], "multipart/form-data; boundary="), "expected multipart content type on the wire");
    assert_true($echo["post"] === ["model" => "openai/whisper-1", "temperature" => "0"], "expected parsed form fields");
    assert_true(($echo["files"]["file"]["content"] ?? null) === "fakeflac", "expected parsed file part content");
    assert_true(($echo["files"]["file"]["type"] ?? null) === "audio/flac", "expected parsed file part content type");
    assert_true(str_ends_with((string) ($echo["files"]["file"]["name"] ?? ""), ".flac"), "expected the file extension to survive");

    $echo = $live->uploadFile(["file" => PhaseoFile::fromBytes("{\"a\":1}\n", "batch.jsonl"), "purpose" => "batch"], "openai/gpt-5-mini", "openai");
    assert_true($echo["uri"] === "/v1/batches/files?model=openai%2Fgpt-5-mini&provider=openai", "expected upload path and query on the wire");
    assert_true($echo["post"] === ["purpose" => "batch"], "expected purpose field on the wire");
    assert_true(($echo["files"]["file"]["name"] ?? null) === "batch.jsonl", "expected upload filename on the wire");

    $echo = $live->generateTranscription(["model" => "openai/whisper-1", "file_url" => "https://example.com/audio.mp3"]);
    assert_true($echo["content_type"] === "application/json", "expected JSON content type for file_url transcription");
    assert_true(json_decode($echo["raw"], true) === ["model" => "openai/whisper-1", "file_url" => "https://example.com/audio.mp3"], "expected JSON body for file_url transcription");
} finally {
    proc_terminate($server);
    proc_close($server);
    @unlink($serverLog);
}

echo "php audio multipart tests ok" . PHP_EOL;
