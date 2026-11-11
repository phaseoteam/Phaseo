<?php
declare(strict_types=1);

// Thin wrapper around the in-house generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace Phaseo\Sdk;

require_once __DIR__ . "/gen/Client.php";
require_once __DIR__ . "/gen/Models.php";
require_once __DIR__ . "/gen/Operations.php";
require_once __DIR__ . "/ModelIds.php";
require_once __DIR__ . "/Workflows.php";
require_once __DIR__ . "/Realtime.php";
require_once __DIR__ . "/WorkloadTokens.php";

use Phaseo\Gen\Client as GenClient;
use Phaseo\Gen\MultipartBody;
use RuntimeException;

/**
 * A file sent as a multipart/form-data part (audio for transcription/translation, JSONL for batch uploads).
 * The gateway uses the filename extension to detect the audio format, so keep it accurate.
 */
final class PhaseoFile
{
    private const CONTENT_TYPES = [
        "flac" => "audio/flac",
        "mp3" => "audio/mpeg",
        "mp4" => "audio/mp4",
        "mpeg" => "audio/mpeg",
        "mpga" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "webm" => "audio/webm",
        "jsonl" => "application/jsonl",
        "json" => "application/json",
    ];

    public readonly string $content;
    public readonly string $filename;
    public readonly string $contentType;

    public function __construct(string $content, string $filename = "file", ?string $contentType = null)
    {
        $this->content = $content;
        $this->filename = trim($filename) === "" ? "file" : $filename;
        $this->contentType = ($contentType === null || trim($contentType) === "") ? self::guessContentType($this->filename) : $contentType;
    }

    public static function fromBytes(string $bytes, string $filename, ?string $contentType = null): self
    {
        return new self($bytes, $filename, $contentType);
    }

    public static function fromPath(string $path, ?string $contentType = null, ?string $filename = null): self
    {
        $content = @file_get_contents($path);
        if ($content === false) {
            throw new \InvalidArgumentException("Unable to read file: {$path}");
        }
        return new self($content, $filename ?? basename($path), $contentType);
    }

    /** @param resource $stream Read to the end so the body can be rebuilt on retries. */
    public static function fromStream($stream, ?string $filename = null, ?string $contentType = null): self
    {
        if (!is_resource($stream)) {
            throw new \InvalidArgumentException("fromStream expects a stream resource");
        }
        $content = stream_get_contents($stream);
        if ($content === false) {
            throw new \InvalidArgumentException("Unable to read stream");
        }
        $uri = stream_get_meta_data($stream)["uri"] ?? null;
        $name = $filename ?? (is_string($uri) && $uri !== "" && !str_starts_with($uri, "php://") ? basename($uri) : "file");
        return new self($content, $name, $contentType);
    }

    /**
     * Converts a payload "file" value: PhaseoFile, CURLFile, CURLStringFile, SplFileInfo, stream resource,
     * data: URL, or path to an existing file. Returns null for anything else (for example a remote URL).
     */
    public static function fromValue(mixed $value, ?string $filename = null, ?string $contentType = null): ?self
    {
        if ($value instanceof self) {
            return $value;
        }
        if ($value instanceof \CURLStringFile) {
            return new self($value->data, $filename ?? $value->postname, $contentType ?? $value->mime);
        }
        if ($value instanceof \CURLFile) {
            $postName = $value->getPostFilename();
            $mime = $value->getMimeType();
            return self::fromPath($value->getFilename(), $contentType ?? ($mime === "" ? null : $mime), $filename ?? ($postName === "" ? null : $postName));
        }
        if ($value instanceof \SplFileInfo) {
            return self::fromPath($value->getPathname(), $contentType, $filename);
        }
        if (is_resource($value) && get_resource_type($value) === "stream") {
            return self::fromStream($value, $filename, $contentType);
        }
        if (!is_string($value) || $value === "") {
            return null;
        }
        if (strncasecmp($value, "data:", 5) === 0) {
            $comma = strpos($value, ",");
            if ($comma === false) {
                return null;
            }
            $meta = substr($value, 5, $comma - 5);
            $data = substr($value, $comma + 1);
            $isBase64 = str_ends_with(strtolower($meta), ";base64");
            $mime = explode(";", $isBase64 ? substr($meta, 0, -7) : $meta)[0];
            $decoded = $isBase64 ? base64_decode($data, true) : rawurldecode($data);
            if ($decoded === false) {
                return null;
            }
            $resolvedMime = $contentType ?? ($mime === "" ? null : $mime);
            $extension = $resolvedMime === null ? false : array_search($resolvedMime, self::CONTENT_TYPES, true);
            return new self($decoded, $filename ?? ("file" . ($extension === false ? "" : "." . $extension)), $resolvedMime);
        }
        if (strlen($value) < 4096 && !str_contains($value, "\0") && !str_contains($value, "://") && is_file($value)) {
            return self::fromPath($value, $contentType, $filename);
        }
        return null;
    }

    private static function guessContentType(string $filename): string
    {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        return self::CONTENT_TYPES[$extension] ?? "application/octet-stream";
    }
}

/** @internal Builds multipart bodies for the audio and file upload helpers. */
final class MultipartRequests
{
    private const META_KEYS = ["filename", "file_name", "content_type", "file_content_type"];

    /** Returns a multipart body when $payload["file"] is file-like, otherwise null. */
    public static function tryBuild(array $payload): ?MultipartBody
    {
        if (!array_key_exists("file", $payload)) {
            return null;
        }
        $filename = self::stringField($payload, ["filename", "file_name"]);
        $contentType = self::stringField($payload, ["content_type", "file_content_type"]);
        $file = PhaseoFile::fromValue($payload["file"], $filename, $contentType);
        if ($file === null) {
            return null;
        }
        $form = new MultipartBody();
        $form->addFile("file", $file->content, $file->filename, $file->contentType);
        foreach ($payload as $key => $value) {
            $key = (string) $key;
            if ($key === "file" || in_array($key, self::META_KEYS, true)) {
                continue;
            }
            $encoded = self::encodeField($value);
            if ($encoded !== null) {
                $form->addField($key, $encoded);
            }
        }
        return $form;
    }

    /** A copy of the payload that is safe to hand to telemetry (no file bytes). */
    public static function redact(array $payload): array
    {
        if (array_key_exists("file", $payload)) {
            $payload["file"] = "[File]";
        }
        return $payload;
    }

    /** Form fields are strings: bools lowercase, objects and arrays as JSON. */
    public static function encodeField(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_bool($value)) {
            return $value ? "true" : "false";
        }
        if (is_string($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return json_encode($value, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        }
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function stringField(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (isset($payload[$key]) && is_string($payload[$key]) && trim($payload[$key]) !== "") {
                return $payload[$key];
            }
        }
        return null;
    }
}

class AsyncJobsResource
{
    public function __construct(private Phaseo $parent)
    {
    }

    public function websocketUrl(
        string $kind,
        string $jobId,
        ?int $intervalMs = null,
        ?bool $closeOnTerminal = null
    ): string {
        return $this->parent->getAsyncJobWebSocketUrl($kind, $jobId, $intervalMs, $closeOnTerminal);
    }
}

class Phaseo
{
    private const ACTIVE_MODEL_SOURCE_STATUSES = ["active", "available"];
    private const INACTIVE_MODEL_SOURCE_STATUSES = [
        "deprecated",
        "retired",
        "withheld",
        "announced",
        "rumoured",
        "rumored",
        "unavailable",
        "disabled",
        "internal",
        "private",
        "removed",
        "sunset",
        "eol",
        "end_of_life",
        "end-of-life",
    ];

    private GenClient $client;
    private bool $enableDeprecationWarnings;
    private bool $warningsAsErrors;
    private $logger;
    private $lifecycleResolver;
    /** @var array<string, bool> */
    private array $warnedModels = [];
    /** @var array<string, array<string, mixed>|null> */
    private array $modelLifecycleCache = [];
    private TelemetryRecorder $telemetryRecorder;
    private string $basePath;
    private AsyncJobsResource $asyncJobs;
    private ?Realtime $realtime = null;

    public function __construct(
        string|callable|null $apiKey = null,
        string $basePath = "https://api.phaseo.app/v1",
        bool $enableDeprecationWarnings = true,
        bool $warningsAsErrors = false,
        ?callable $logger = null,
        ?callable $lifecycleResolver = null,
        ?string $caBundlePath = null,
        bool $verifyTls = true,
        ?array $devtools = null,
        string $clientSource = "phaseo-php",
        string $clientSourceVersion = "3.0.0"
    ) {
        // A callable apiKey (for example WorkloadTokens::githubActions()) is called before every
        // request and retry; a string is sent as-is.
        if (is_string($apiKey) || $apiKey === null) {
            $apiKey = $apiKey ?? getenv("PHASEO_API_KEY") ?: null;
            if (!$apiKey) {
                throw new \InvalidArgumentException("Missing API key. Pass apiKey or set PHASEO_API_KEY.");
            }
            $authorization = "Bearer " . $apiKey;
        } else {
            $authorization = new BearerCredential($apiKey);
        }
        $this->basePath = rtrim($basePath, "/");
        $this->client = new GenClient(
            $this->basePath,
            [
                "Authorization" => $authorization,
                "X-Phaseo-Client" => $clientSource,
                "X-Phaseo-Client-Version" => $clientSourceVersion,
            ],
            $caBundlePath,
            $verifyTls
        );
        $this->enableDeprecationWarnings = $enableDeprecationWarnings;
        $this->warningsAsErrors = $warningsAsErrors;
        $this->logger = $logger;
        $this->lifecycleResolver = $lifecycleResolver;
        $this->telemetryRecorder = new TelemetryRecorder($devtools, "3.0.0");
        $this->asyncJobs = new AsyncJobsResource($this);
    }

    public function rawClient(): GenClient
    {
        return $this->client;
    }

    public function setTimeout(float $timeout): self
    {
        $this->client->setTimeout($timeout);
        return $this;
    }

    public function setMaxRetries(int $maxRetries): self
    {
        $this->client->setMaxRetries($maxRetries);
        return $this;
    }

    public function setRequestHooks(?callable $onRequest, ?callable $onResponse, ?callable $onRetry): self
    {
        $this->client->setHooks($onRequest, $onResponse, $onRetry);
        return $this;
    }

    public function requestWithResponse(
        string $method,
        string $path,
        ?array $query = null,
        ?array $headers = null,
        mixed $body = null,
        ?array $options = null
    ): \Phaseo\Gen\Response {
        // An Authorization header given here replaces the client's own, whatever its casing.
        $headers = self::normalizeAuthorizationHeader($headers);
        if (isset($options["headers"])) {
            $options["headers"] = self::normalizeAuthorizationHeader($options["headers"]);
        }
        return $this->client->requestWithResponse($method, $path, $query, $headers, $body, $options);
    }

    private static function normalizeAuthorizationHeader(?array $headers): ?array
    {
        if ($headers === null) {
            return null;
        }
        $normalized = [];
        foreach ($headers as $name => $value) {
            $normalized[is_string($name) && strcasecmp($name, "Authorization") === 0 ? "Authorization" : $name] = $value;
        }
        return $normalized;
    }

    public function asyncJobs(): AsyncJobsResource
    {
        return $this->asyncJobs;
    }

    /** Realtime voice sessions (beta). Needs the optional phrity/websocket package. */
    public function realtime(): Realtime
    {
        return $this->realtime ??= new Realtime($this, $this->basePath);
    }

    /** @return array<string, mixed>|null */
    public function getModelDeprecationInfo(string $modelId): ?array
    {
        $normalizedModelId = $this->asTrimmedString($modelId);
        if ($normalizedModelId === null) {
            return null;
        }
        if (array_key_exists($normalizedModelId, $this->modelLifecycleCache)) {
            return $this->modelLifecycleCache[$normalizedModelId];
        }

        $resolved = $this->resolveModelLifecycle($normalizedModelId);
        $this->modelLifecycleCache[$normalizedModelId] = $resolved;
        return $resolved;
    }

    /** @return array{ok:bool,info:array<string,mixed>|null,reason?:string} */
    public function validateModel(string $modelId): array
    {
        $info = $this->getModelDeprecationInfo($modelId);
        if ($info === null) {
            return ["ok" => true, "info" => null];
        }
        if (!$this->isModelRequestableForInference($info)) {
            return [
                "ok" => false,
                "info" => $info,
                "reason" => $this->buildInactiveModelRequestMessage($info),
            ];
        }
        return ["ok" => true, "info" => $info];
    }

    public function generateText(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "chat.completions",
            $payload,
            true,
            fn () => \Phaseo\Gen\createChatCompletion($this->client, null, null, null, $payload)
        );
    }

    public function createChatCompletion(array $payload): mixed
    {
        return $this->generateText($payload);
    }

    public function generateResponse(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "responses",
            $payload,
            true,
            fn () => \Phaseo\Gen\createResponse($this->client, null, null, null, $payload)
        );
    }

    public function createResponse(array $payload): mixed
    {
        return $this->generateResponse($payload);
    }

	public function streamResponse(array $payload): iterable
	{
		$payload["stream"]=true;return $this->client->requestStream("POST","/responses",body:$payload);
	}

    public function createAnthropicMessage(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "messages",
            $payload,
            true,
            fn () => \Phaseo\Gen\createAnthropicMessage($this->client, null, null, null, $payload)
        );
    }

    public function generateImage(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "images.generations",
            $payload,
            true,
            fn () => \Phaseo\Gen\createImage($this->client, null, null, null, $payload)
        );
    }

    public function createImage(array $payload): mixed
    {
        return $this->generateImage($payload);
    }

    public function generateImageEdit(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "images.edits",
            $payload,
            true,
            fn () => \Phaseo\Gen\createImageEdit($this->client, null, null, null, $payload)
        );
    }

    public function createImageEdit(array $payload): mixed
    {
        return $this->generateImageEdit($payload);
    }

    public function generateVideo(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.generations",
            $payload,
            true,
            fn () => \Phaseo\Gen\createVideo($this->client, null, null, null, $payload)
        );
    }

    public function createVideo(array $payload): mixed
    {
        return $this->generateVideo($payload);
    }

    public function getVideo(string $videoId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.retrieve",
            ["video_id" => $videoId],
            false,
            fn () => \Phaseo\Gen\getVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function cancelVideo(string $videoId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.cancel",
            ["video_id" => $videoId],
            false,
            fn () => \Phaseo\Gen\cancelVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function deleteVideo(string $videoId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.delete",
            ["video_id" => $videoId],
            false,
            fn () => \Phaseo\Gen\deleteVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function listVideoModels(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.models",
            null,
            false,
            fn () => \Phaseo\Gen\listVideoModels($this->client)
        );
    }

    public function listVideos(array $query = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.list",
            $query,
            false,
            fn () => \Phaseo\Gen\listVideos($this->client, null, $query)
        );
    }

    public function generateEmbedding(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "embeddings",
            $payload,
            true,
            fn () => \Phaseo\Gen\createEmbedding($this->client, null, null, null, $payload)
        );
    }

    public function createEmbedding(array $payload): mixed
    {
        return $this->generateEmbedding($payload);
    }

    public function generateModeration(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "moderations",
            $payload,
            true,
            fn () => \Phaseo\Gen\createModeration($this->client, null, null, null, $payload)
        );
    }

    public function createModeration(array $payload): mixed
    {
        return $this->generateModeration($payload);
    }

    public function createSpeech(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "audio.speech",
            $payload,
            true,
            fn () => \Phaseo\Gen\createSpeech($this->client, null, null, null, $payload)
        );
    }

    /**
     * Transcribes audio. When $payload["file"] is a PhaseoFile, CURLFile, SplFileInfo, stream resource,
     * data: URL or local path, the request is sent as multipart/form-data; payloads that only carry
     * file_url, file_id or s3_presigned_url are sent as JSON.
     */
    public function generateTranscription(array $payload): mixed
    {
        $form = MultipartRequests::tryBuild($payload);
        return $this->withLifecycleAndTelemetry(
            "audio.transcriptions",
            $form === null ? $payload : MultipartRequests::redact($payload),
            true,
            fn () => \Phaseo\Gen\createTranscription($this->client, null, null, null, $form ?? $payload)
        );
    }

    public function createTranscription(array $payload): mixed
    {
        return $this->generateTranscription($payload);
    }

    /**
     * Translates audio to English. The gateway requires a multipart "file" part, so $payload["file"] should be a
     * PhaseoFile, CURLFile, SplFileInfo, stream resource, data: URL or local path.
     */
    public function generateTranslation(array $payload): mixed
    {
        $form = MultipartRequests::tryBuild($payload);
        return $this->withLifecycleAndTelemetry(
            "audio.translations",
            $form === null ? $payload : MultipartRequests::redact($payload),
            true,
            fn () => \Phaseo\Gen\createTranslation($this->client, null, null, null, $form ?? $payload)
        );
    }

    public function createTranslation(array $payload): mixed
    {
        return $this->generateTranslation($payload);
    }

    public function createBatch(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "batches.create",
            $payload,
            true,
            fn () => \Phaseo\Gen\createBatch($this->client, null, null, null, $payload)
        );
    }

    public function retrieveBatch(string $batchId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "batches.retrieve",
            ["batch_id" => $batchId],
            false,
            fn () => \Phaseo\Gen\retrieveBatch($this->client, ["batch_id" => $batchId])
        );
    }

    public function cancelBatch(string $batchId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "batches.cancel",
            ["batch_id" => $batchId],
            false,
            fn () => \Phaseo\Gen\cancelBatch($this->client, ["batch_id" => $batchId])
        );
    }

    public function getAsyncJobWebSocketUrl(
        string $kind,
        string $jobId,
        ?int $intervalMs = null,
        ?bool $closeOnTerminal = null
    ): string {
        $normalizedKind = trim($kind);
        $normalizedJobId = trim($jobId);
        if ($normalizedKind === "") {
            throw new \InvalidArgumentException("kind is required");
        }
        if ($normalizedJobId === "") {
            throw new \InvalidArgumentException("jobId is required");
        }

        $parts = parse_url($this->basePath);
        $scheme = ($parts["scheme"] ?? "https") === "https" ? "wss" : "ws";
        $host = $parts["host"] ?? "";
        $port = isset($parts["port"]) ? ":" . $parts["port"] : "";
        $path = rtrim((string) ($parts["path"] ?? ""), "/");
        $url = $scheme . "://" . $host . $port . $path . "/async/" . rawurlencode($normalizedKind) . "/" . rawurlencode($normalizedJobId) . "/ws";

        $query = [];
        if ($intervalMs !== null) {
            $query["interval_ms"] = (string) $intervalMs;
        }
        if ($closeOnTerminal !== null) {
            $query["close_on_terminal"] = $closeOnTerminal ? "true" : "false";
        }
        if ($query !== []) {
            $url .= "?" . http_build_query($query);
        }

        return $url;
    }

    public function getBatchWebSocketUrl(
        string $batchId,
        ?int $intervalMs = null,
        ?bool $closeOnTerminal = null
    ): string {
        return $this->getAsyncJobWebSocketUrl("batch", $batchId, $intervalMs, $closeOnTerminal);
    }

    public function getVideoWebSocketUrl(
        string $videoId,
        ?int $intervalMs = null,
        ?bool $closeOnTerminal = null
    ): string {
        return $this->getAsyncJobWebSocketUrl("video", $videoId, $intervalMs, $closeOnTerminal);
    }

    public function listFiles(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "files.list",
            $params,
            false,
            fn () => \Phaseo\Gen\listFiles($this->client, null, $params, null, null)
        );
    }

    public function retrieveFile(string $fileId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "files.retrieve",
            ["file_id" => $fileId],
            false,
            fn () => \Phaseo\Gen\retrieveFile($this->client, ["file_id" => $fileId])
        );
    }

    public function retrieveFileContent(string $fileId): string
    {
        return $this->withLifecycleAndTelemetry(
            "files.content",
            ["file_id" => $fileId],
            false,
            fn (): string => $this->client->requestRaw("GET", "/files/" . rawurlencode($fileId) . "/content", null, null, null)
        );
    }

    public function retrieveVideoContent(string $videoId): string
    {
        return $this->withLifecycleAndTelemetry(
            "video.content",
            ["video_id" => $videoId],
            false,
            fn (): string => $this->client->requestRaw("GET", "/videos/" . rawurlencode($videoId) . "/content", null, null, null)
        );
    }

    public function getVideoDownloadUrl(string $videoId, array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.download_url",
            ["video_id" => $videoId, "body" => $params],
            false,
            fn () => $this->client->request("POST", "/videos/" . rawurlencode($videoId) . "/download_url", null, null, $params)
        );
    }

    /**
     * Uploads a batch input file as multipart/form-data to POST /batches/files. $payload["file"] must be a
     * PhaseoFile, CURLFile, SplFileInfo, stream resource, data: URL or local path; other entries (purpose, ...)
     * become form fields. model and provider (arguments or payload entries) are sent as query parameters.
     */
    public function uploadFile(array $payload, ?string $model = null, ?string $provider = null): mixed
    {
        $model ??= isset($payload["model"]) && is_string($payload["model"]) && trim($payload["model"]) !== "" ? $payload["model"] : null;
        $provider ??= isset($payload["provider"]) && is_string($payload["provider"]) && trim($payload["provider"]) !== "" ? $payload["provider"] : null;
        unset($payload["model"], $payload["provider"]);
        $form = MultipartRequests::tryBuild($payload);
        if ($form === null) {
            throw new \InvalidArgumentException('uploadFile requires $payload["file"] to be a PhaseoFile, CURLFile, SplFileInfo, stream resource, data: URL or path to an existing file.');
        }
        $query = array_filter(["model" => $model, "provider" => $provider], static fn ($value) => $value !== null && $value !== "");
        return $this->withLifecycleAndTelemetry(
            "files.upload",
            MultipartRequests::redact($payload) + $query,
            false,
            fn () => $this->client->request("POST", "/batches/files", $query === [] ? null : $query, null, $form)
        );
    }

    public function listModels(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "models.list",
            $params,
            false,
            fn () => \Phaseo\Gen\listModels($this->client, null, $params, null, null)
        );
    }

    /** @return array<string, mixed> */
    public function getModelEndpointCapabilities(string $modelId, array $params = []): array
    {
        $parts = explode("/", trim($modelId), 2);
        if (count($parts) !== 2 || $parts[0] === "" || $parts[1] === "") {
            throw new \InvalidArgumentException("model ID must use author/slug format");
        }
        return $this->withLifecycleAndTelemetry(
            "models.capabilities",
            ["model_id" => $modelId, "query" => $params],
            false,
            fn () => \Phaseo\Gen\listModelEndpoints(
                $this->client,
                ["author" => $parts[0], "slug" => $parts[1]],
                $params,
                null,
                null
            )
        );
    }

    /** @return array<string, mixed> */
    public function checkModelParameters(string $modelId, array $values, array $options = []): array
    {
        return self::checkParameterSupport($this->getModelEndpointCapabilities($modelId), $values, $options);
    }

    /** @return array<string, mixed> */
    public function preflightRequest(array $request, array $options = []): array
    {
        $modelId = trim((string) ($request['model'] ?? ''));
        if ($modelId === '') throw new \InvalidArgumentException('preflight requires request model');
        $structural = array_fill_keys(['model', 'input', 'messages', 'prompt', 'contents', 'provider', 'providers', 'routing', 'metadata', 'session_id', 'app', 'webhook', 'idempotency_key'], true);
        $values = array_filter($request, static fn ($value, $name) => $value !== null && !isset($structural[$name]), ARRAY_FILTER_USE_BOTH);
        $support = $this->checkModelParameters($modelId, $values, $options);
        return ['ok' => (bool) ($support['ok'] ?? false), 'model_id' => $modelId, 'checked_parameters' => $values, 'parameter_support' => $support];
    }

    /** Build a UI-friendly report from live model endpoint metadata. */
    public static function checkParameterSupport(array $model, array $values, array $options = []): array
    {
        $providers = isset($options["provider"])
            ? array_fill_keys((array) $options["provider"], true)
            : null;
        $routes = array_values(array_filter($model["endpoints"] ?? [], static function ($route) use ($options, $providers): bool {
            if (!is_array($route) || ($route["routable"] ?? null) !== true || ($route["status"] ?? null) !== "active") return false;
            $provider = $route["provider"]["id"] ?? "";
            if ($providers !== null && !isset($providers[$provider])) return false;
            if (empty($options["endpoint"])) return true;
            $requested = preg_replace('#^/?(?:v1/)?#', '', (string) $options["endpoint"]);
            $publicPath = preg_replace('#^/?(?:v1/)?#', '', (string) ($route["public_path"] ?? ""));
            return in_array($requested, [$route["endpoint"] ?? null, $route["capability_id"] ?? null, $publicPath], true);
        }));
        $parameters = [];
        foreach ($values as $name => $value) {
            $supportedBy = $acceptedBy = $unsupportedBy = $constraints = $valueIssues = [];
            $knownRoutes = 0;
            foreach ($routes as $route) {
                $ref = self::parameterRouteReference($route);
                $advertised = $route["capabilities"]["parameters"] ?? null;
                if (!is_array($advertised)) { $unsupportedBy[] = $ref; continue; }
                $knownRoutes++;
                $detail = $route["capabilities"]["parameter_details"][$name] ?? [];
                $supports = in_array($name, $advertised, true) || ($detail["supported"] ?? null) === true;
                if (!$supports || ($detail["supported"] ?? null) === false) { $unsupportedBy[] = $ref; continue; }
                $supportedBy[] = $ref;
                if ($detail !== []) $constraints[] = ["route" => $ref, "detail" => $detail];
                $issues = self::parameterValueIssues((string) $name, $value, $detail);
                if ($issues === []) $acceptedBy[] = $ref; else $valueIssues = [...$valueIssues, ...$issues];
            }
            $status = count($routes) === 0 || $knownRoutes === 0 ? "unknown"
                : (count($supportedBy) === 0 ? "unsupported"
                : (count($supportedBy) === count($routes) ? "supported" : "partial"));
            $issues = $status === "unsupported" ? ["{$name} is not supported by any matching active route"]
                : (count($supportedBy) > 0 && count($acceptedBy) === 0 ? array_values(array_unique($valueIssues)) : []);
            $parameters[] = [
                "name" => (string) $name,
                "value" => $value,
                "status" => $status,
                "supported_by" => $supportedBy,
                "accepted_by" => $acceptedBy,
                "unsupported_by" => $unsupportedBy,
                "constraints" => $constraints,
                "issues" => $issues,
            ];
        }
        $matchingRoutes = array_values(array_map([self::class, "parameterRouteReference"], array_filter($routes, static function ($route) use ($parameters): bool {
            $id = self::parameterRouteReference($route)["id"];
            foreach ($parameters as $parameter) if (!in_array($id, array_column($parameter["accepted_by"], "id"), true)) return false;
            return true;
        })));
        $issues = [];
        if ($routes === []) $issues[] = "No active routable model endpoints matched the filters";
        elseif ($matchingRoutes === [] && $parameters !== []) $issues[] = "No active route supports all requested parameter values together";
        foreach ($parameters as $parameter) $issues = [...$issues, ...$parameter["issues"]];
        return ["ok" => $routes !== [] && $matchingRoutes !== [], "model_id" => $model["id"] ?? "unknown", "route_count" => count($routes), "matching_routes" => $matchingRoutes, "parameters" => $parameters, "issues" => array_values(array_unique($issues))];
    }

    /** @return array<string, string> */
    private static function parameterRouteReference(array $route): array
    {
        $provider = $route["provider"]["id"] ?? "unknown";
        $endpoint = $route["endpoint"] ?? $route["capability_id"] ?? "unknown";
        return ["id" => $route["id"] ?? "{$provider}:{$endpoint}", "provider" => $provider, "endpoint" => $endpoint, "public_path" => $route["public_path"] ?? $endpoint];
    }

    /** @return list<string> */
    private static function parameterValueIssues(string $name, mixed $value, array $detail): array
    {
        $issues = [];
        if (($detail["supported"] ?? null) === false) $issues[] = "{$name} is unsupported";
        $allowed = $detail["values"] ?? $detail["enum"] ?? null;
        if (is_array($allowed) && !in_array($value, $allowed, true)) $issues[] = "{$name} must be one of: " . implode(", ", array_map("strval", $allowed));
        if (is_int($value) || is_float($value)) {
            if (!is_finite((float) $value)) $issues[] = "{$name} must be finite";
            if (isset($detail["minimum"]) && $value < $detail["minimum"]) $issues[] = "{$name} must be at least {$detail['minimum']}";
            if (isset($detail["maximum"]) && $value > $detail["maximum"]) $issues[] = "{$name} must be at most {$detail['maximum']}";
            if (($detail["step"] ?? 0) > 0) { $steps = ($value - ($detail["minimum"] ?? 0)) / $detail["step"]; if (abs($steps - round($steps)) > 1e-8) $issues[] = "{$name} must use steps of {$detail['step']}"; }
        }
        return $issues;
    }

    public function listProviders(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "providers",
            $params,
            false,
            fn () => \Phaseo\Gen\listProviders($this->client, null, $params, null, null)
        );
    }

    public function getAnalytics(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "analytics",
            $params,
            false,
            fn () => \Phaseo\Gen\getActivityAlias($this->client, null, $params, null, null)
        );
    }

    public function getCredits(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "credits",
            $params,
            false,
            fn () => \Phaseo\Gen\getCredits($this->client, null, $params, null, null)
        );
    }

    public function getActivity(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "activity",
            $params,
            false,
            fn () => \Phaseo\Gen\getActivity($this->client, null, $params, null, null)
        );
    }

    public function getGeneration(string $generationId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "generations.retrieve",
            ["id" => $generationId],
            false,
            fn () => \Phaseo\Gen\getGeneration($this->client, null, ["id" => $generationId], null, null)
        );
    }

    public function listEndpoints(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "endpoints.list",
            [],
            false,
            fn () => \Phaseo\Gen\listEndpoints($this->client, null, null, null, null)
        );
    }

    public function listOrganisations(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "organisations.list",
            $params,
            false,
            fn () => \Phaseo\Gen\listOrganisations($this->client, null, $params, null, null)
        );
    }

    public function listPricingModels(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "pricing.models",
            $params,
            false,
            fn () => \Phaseo\Gen\listPricingModels($this->client, null, $params, null, null)
        );
    }

    public function calculatePricing(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "pricing.calculate",
            $payload,
            false,
            fn () => \Phaseo\Gen\calculatePricing($this->client, null, null, null, $payload)
        );
    }

    public function listApiKeys(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.list",
            $params,
            false,
            fn () => \Phaseo\Gen\listApiKeys($this->client, null, $params, null, null)
        );
    }

    public function createApiKey(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.create",
            $payload,
            false,
            fn () => \Phaseo\Gen\createApiKey($this->client, null, null, null, $payload)
        );
    }

    public function getApiKey(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.get",
            ["id" => $id],
            false,
            fn () => \Phaseo\Gen\getApiKey($this->client, ["id" => $id], null, null, null)
        );
    }

    public function updateApiKey(string $id, array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.update",
            ["id" => $id, "body" => $payload],
            false,
            fn () => \Phaseo\Gen\updateApiKey($this->client, ["id" => $id], null, null, $payload)
        );
    }

    public function deleteApiKey(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.delete",
            ["id" => $id],
            false,
            fn () => \Phaseo\Gen\deleteApiKey($this->client, ["id" => $id], null, null, null)
        );
    }

    public function listWorkspaces(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.list",
            $params,
            false,
            fn () => \Phaseo\Gen\listWorkspaces($this->client, null, $params, null, null)
        );
    }

    public function getWorkspace(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.get",
            ["id" => $id],
            false,
            fn () => \Phaseo\Gen\getWorkspace($this->client, ["id" => $id], null, null, null)
        );
    }

    public function createWorkspace(array $body): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.create",
            $body,
            false,
            fn () => \Phaseo\Gen\createWorkspace($this->client, null, null, null, $body)
        );
    }

    public function updateWorkspace(string $id, array $body): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.update",
            array_merge(["id" => $id], $body),
            false,
            fn () => \Phaseo\Gen\updateWorkspace($this->client, ["id" => $id], null, null, $body)
        );
    }

    public function deleteWorkspace(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.delete",
            ["id" => $id],
            false,
            fn () => \Phaseo\Gen\deleteWorkspace($this->client, ["id" => $id], null, null, null)
        );
    }

    public function getCurrentApiKey(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "key.current",
            [],
            false,
            fn () => \Phaseo\Gen\getCurrentApiKey($this->client, null, null, null, null)
        );
    }

    public function health(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "health",
            null,
            false,
            fn () => $this->client->request("GET", "/health", null, null, null)
        );
    }

    public function healthz(): mixed
    {
        return $this->health();
    }

    private function maybeWarnForPayload(mixed $payload): void
    {
        $modelId = $this->extractModelIdFromPayload($payload);
        if ($modelId === null) {
            return;
        }
        $this->ensureModelRequestable($modelId);
        $this->maybeWarnForModel($modelId);
    }

    private function ensureModelRequestable(string $modelId): void
    {
        $normalizedModelId = $this->asTrimmedString($modelId);
        if ($normalizedModelId === null) {
            return;
        }

        $lifecycle = $this->getModelDeprecationInfo($normalizedModelId);
        if ($lifecycle === null) {
            return;
        }

        if ($this->isModelRequestableForInference($lifecycle)) {
            return;
        }

        throw new RuntimeException($this->buildInactiveModelRequestMessage($lifecycle));
    }

    private function withLifecycleAndTelemetry(string $endpoint, mixed $payload, bool $checkLifecycle, callable $operation): mixed
    {
        $start = microtime(true);
        try {
            if ($checkLifecycle) {
                $this->maybeWarnForPayload($payload);
            }
            $response = $operation();
            $durationMs = (int) floor((microtime(true) - $start) * 1000);
            $this->telemetryRecorder->captureSuccess($endpoint, $payload, $response, $durationMs);
            return $response;
        } catch (\Throwable $error) {
            $durationMs = (int) floor((microtime(true) - $start) * 1000);
            $this->telemetryRecorder->captureError($endpoint, $payload, $error, $durationMs);
            throw $error;
        }
    }

    private function maybeWarnForModel(string $modelId): void
    {
        if (!$this->enableDeprecationWarnings) {
            return;
        }
        $normalizedModelId = $this->asTrimmedString($modelId);
        if ($normalizedModelId === null) {
            return;
        }

        $lifecycle = $this->getModelDeprecationInfo($normalizedModelId);
        if ($lifecycle === null || ($lifecycle["status"] ?? "active") === "active") {
            return;
        }

        $message = $this->asTrimmedString((string) ($lifecycle["message"] ?? "")) ??
            $this->buildLifecycleMessage(
                (string) ($lifecycle["status"] ?? "active"),
                (string) ($lifecycle["model_id"] ?? $normalizedModelId),
                isset($lifecycle["deprecation_date"]) ? (string) $lifecycle["deprecation_date"] : null,
                isset($lifecycle["retirement_date"]) ? (string) $lifecycle["retirement_date"] : null,
                isset($lifecycle["replacement_model_id"]) ? (string) $lifecycle["replacement_model_id"] : null
            );

        if ($this->warningsAsErrors) {
            throw new RuntimeException($message);
        }

        if (isset($this->warnedModels[$normalizedModelId])) {
            return;
        }
        $this->warnedModels[$normalizedModelId] = true;

        $meta = [
            "model_id" => $lifecycle["model_id"] ?? $normalizedModelId,
            "status" => $lifecycle["status"] ?? null,
            "deprecation_date" => $lifecycle["deprecation_date"] ?? null,
            "retirement_date" => $lifecycle["retirement_date"] ?? null,
            "replacement_model_id" => $lifecycle["replacement_model_id"] ?? null,
        ];
        if (is_callable($this->logger)) {
            ($this->logger)("warn", $message, $meta);
            return;
        }
        trigger_error($message, E_USER_WARNING);
    }

    /** @return array<string,mixed>|null */
    private function resolveModelLifecycle(string $modelId): ?array
    {
        if (is_callable($this->lifecycleResolver)) {
            $resolved = ($this->lifecycleResolver)($modelId);
            return is_array($resolved) ? $resolved : null;
        }
        return $this->fetchModelLifecycle($modelId);
    }

    /** @return array<string,mixed>|null */
    private function fetchModelLifecycle(string $modelId): ?array
    {
        try {
            $response = \Phaseo\Gen\listModels(
                $this->client,
                null,
                ["model_id" => $modelId, "limit" => "1"],
                null,
                null
            );
        } catch (\Throwable) {
            return null;
        }

        $decoded = $this->normalizeToArray($response);
        if (!is_array($decoded)) {
            return null;
        }
        $models = $decoded["models"] ?? null;
        if (!is_array($models)) {
            return null;
        }

        foreach ($models as $model) {
            $modelData = $this->normalizeToArray($model);
            if (!is_array($modelData)) {
                continue;
            }
            $candidateId = $this->firstNonEmpty(
                $this->asTrimmedString((string) ($modelData["model_id"] ?? "")),
                $this->asTrimmedString((string) ($modelData["id"] ?? ""))
            );
            if ($candidateId !== $modelId) {
                continue;
            }
            return $this->toModelLifecycleInfo($modelData, $modelId);
        }

        return null;
    }

    /** @param array<string,mixed> $model @return array<string,mixed> */
    private function toModelLifecycleInfo(array $model, string $fallbackModelId): array
    {
        $lifecycle = $this->normalizeToArray($model["lifecycle"] ?? null) ?? [];
        $modelId = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($model["model_id"] ?? "")),
            $this->asTrimmedString((string) ($model["id"] ?? "")),
            $fallbackModelId
        ) ?? $fallbackModelId;
        $sourceStatus = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($model["status"] ?? "")),
            $this->asTrimmedString((string) ($lifecycle["status"] ?? ""))
        );
        $deprecationDate = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($lifecycle["deprecation_date"] ?? "")),
            $this->asTrimmedString((string) ($model["deprecation_date"] ?? ""))
        );
        $retirementDate = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($lifecycle["retirement_date"] ?? "")),
            $this->asTrimmedString((string) ($model["retirement_date"] ?? ""))
        );
        $status = $this->normalizeLifecycleStatus(
            $this->firstNonEmpty(
                $this->asTrimmedString((string) ($lifecycle["status"] ?? "")),
                $this->asTrimmedString((string) ($model["status"] ?? ""))
            ),
            $deprecationDate,
            $retirementDate
        );
        $replacementModelId = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($lifecycle["replacement_model_id"] ?? ""))
        );
        $message = $this->firstNonEmpty(
            $this->asTrimmedString((string) ($lifecycle["message"] ?? "")),
            $this->buildLifecycleMessage($status, $modelId, $deprecationDate, $retirementDate, $replacementModelId)
        );

        return [
            "model_id" => $modelId,
            "status" => $status,
            "source_status" => $sourceStatus,
            "deprecation_date" => $deprecationDate,
            "retirement_date" => $retirementDate,
            "replacement_model_id" => $replacementModelId,
            "message" => $message,
        ];
    }

    private function normalizeLifecycleStatus(?string $status, ?string $deprecationDate, ?string $retirementDate): string
    {
        $normalized = strtolower((string) ($status ?? ""));
        if (in_array($normalized, ["active", "deprecated", "retired"], true)) {
            return $normalized;
        }
        $now = time();

        $retirementTs = $this->parseIsoTimestamp($retirementDate);
        if ($retirementTs !== null && $retirementTs <= $now) {
            return "retired";
        }
        $deprecationTs = $this->parseIsoTimestamp($deprecationDate);
        if ($deprecationTs !== null && $deprecationTs <= $now) {
            return "deprecated";
        }
        return "active";
    }

    private function parseIsoTimestamp(?string $value): ?int
    {
        $trimmed = $this->asTrimmedString($value);
        if ($trimmed === null) {
            return null;
        }
        $ts = strtotime($trimmed);
        return $ts === false ? null : $ts;
    }

    private function buildLifecycleMessage(
        string $status,
        string $modelId,
        ?string $deprecationDate,
        ?string $retirementDate,
        ?string $replacementModelId
    ): string {
        $replacement = $replacementModelId ? sprintf(' Use "%s" instead.', $replacementModelId) : "";
        if ($status === "retired") {
            if ($retirementDate !== null) {
                return sprintf('[phaseo] Model "%s" is retired as of %s.%s', $modelId, $retirementDate, $replacement);
            }
            return sprintf('[phaseo] Model "%s" is retired.%s', $modelId, $replacement);
        }
        if ($status === "deprecated") {
            if ($retirementDate !== null) {
                return sprintf(
                    '[phaseo] Model "%s" is deprecated and scheduled for retirement on %s.%s',
                    $modelId,
                    $retirementDate,
                    $replacement
                );
            }
            if ($deprecationDate !== null) {
                return sprintf('[phaseo] Model "%s" has been deprecated since %s.%s', $modelId, $deprecationDate, $replacement);
            }
            return sprintf('[phaseo] Model "%s" is deprecated.%s', $modelId, $replacement);
        }
        return "";
    }

    private function normalizeSourceStatus(?string $status): ?string
    {
        $normalized = $this->asTrimmedString($status);
        return $normalized !== null ? strtolower($normalized) : null;
    }

    /** @param array<string,mixed> $info */
    private function isModelRequestableForInference(array $info): bool
    {
        if (($info["status"] ?? "active") !== "active") {
            return false;
        }

        $sourceStatus = $this->normalizeSourceStatus(isset($info["source_status"]) ? (string) $info["source_status"] : null);
        if ($sourceStatus === null) {
            return true;
        }
        if (in_array($sourceStatus, self::ACTIVE_MODEL_SOURCE_STATUSES, true)) {
            return true;
        }
        if (in_array($sourceStatus, self::INACTIVE_MODEL_SOURCE_STATUSES, true)) {
            return false;
        }
        return false;
    }

    /** @param array<string,mixed> $info */
    private function buildInactiveModelRequestMessage(array $info): string
    {
        $status = (string) ($info["status"] ?? "active");
        $modelId = (string) ($info["model_id"] ?? "unknown-model");
        if ($status !== "active") {
            $fallback = $this->buildLifecycleMessage(
                $status,
                $modelId,
                isset($info["deprecation_date"]) ? (string) $info["deprecation_date"] : null,
                isset($info["retirement_date"]) ? (string) $info["retirement_date"] : null,
                isset($info["replacement_model_id"]) ? (string) $info["replacement_model_id"] : null
            );
            $message = $this->asTrimmedString(isset($info["message"]) ? (string) $info["message"] : null);
            return $message ?? $fallback ?? sprintf('[phaseo] Model "%s" is not active for inference.', $modelId);
        }

        $sourceStatus = $this->normalizeSourceStatus(isset($info["source_status"]) ? (string) $info["source_status"] : null) ?? "unknown";
        $replacementModelId = $this->asTrimmedString(isset($info["replacement_model_id"]) ? (string) $info["replacement_model_id"] : null);
        $replacement = $replacementModelId !== null ? sprintf(' Use "%s" instead.', $replacementModelId) : "";
        return sprintf(
            '[phaseo] Model "%s" is not active for inference (status: %s).%s',
            $modelId,
            $sourceStatus,
            $replacement
        );
    }

    private function extractModelIdFromPayload(mixed $payload): ?string
    {
        $decoded = $this->normalizeToArray($payload);
        if (!is_array($decoded)) {
            return null;
        }
        return $this->asTrimmedString((string) ($decoded["model"] ?? ""));
    }

    /** @return array<string,mixed>|null */
    private function normalizeToArray(mixed $value): ?array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : null;
        }
        if (is_object($value)) {
            $encoded = json_encode($value, JSON_INVALID_UTF8_SUBSTITUTE);
            if ($encoded === false) {
                return null;
            }
            $decoded = json_decode($encoded, true);
            return is_array($decoded) ? $decoded : null;
        }
        return null;
    }

    private function asTrimmedString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);
        return $trimmed === "" ? null : $trimmed;
    }

    private function firstNonEmpty(?string ...$values): ?string
    {
        foreach ($values as $value) {
            $trimmed = $this->asTrimmedString($value);
            if ($trimmed !== null) {
                return $trimmed;
            }
        }
        return null;
    }
}

final class Devtools
{
    /** @return array{enabled:bool,directory:?string,capture_headers:bool,save_assets:bool} */
    public static function create(
        bool $enabled = true,
        ?string $directory = null,
        bool $captureHeaders = false,
        bool $saveAssets = true
    ): array {
        return [
            "enabled" => $enabled,
            "directory" => $directory,
            "capture_headers" => $captureHeaders,
            "save_assets" => $saveAssets,
        ];
    }
}

final class TelemetryRecorder
{
    private bool $enabled;
    private string $directory;
    private bool $captureHeaders;
    private bool $saveAssets;
    private string $sdkVersion;

    /** @param array<string,mixed>|null $config */
    public function __construct(?array $config, string $sdkVersion)
    {
        $enabled = (bool) ($config["enabled"] ?? false);
        $directory = trim((string) ($config["directory"] ?? ".phaseo-devtools"));
        if ($directory === "") {
            $directory = ".phaseo-devtools";
        }

        $envEnabled = getenv("PHASEO_DEVTOOLS");
        if ($envEnabled !== false && trim($envEnabled) !== "") {
            $enabled = in_array(strtolower(trim($envEnabled)), ["1", "true", "yes", "on"], true);
        }
        $envDirectory = getenv("PHASEO_DEVTOOLS_DIR");
        if ($envDirectory !== false && trim($envDirectory) !== "") {
            $directory = trim($envDirectory);
        }

        $this->enabled = $enabled;
        $this->directory = $directory;
        $this->captureHeaders = (bool) ($config["capture_headers"] ?? false);
        $this->saveAssets = (bool) ($config["save_assets"] ?? true);
        $this->sdkVersion = $sdkVersion;

        if ($this->enabled) {
            $this->ensureLayout();
            $this->writeMetadataIfMissing();
        }
    }

    public function captureSuccess(string $endpoint, mixed $request, mixed $response, int $durationMs): void
    {
        if (!$this->enabled) {
            return;
        }

        $metadata = [
            "sdk" => "php",
            "sdk_version" => $this->sdkVersion,
            "stream" => false,
        ];

        $usage = $this->extractUsage($response);
        if ($usage !== null) {
            $metadata["usage"] = $usage;
        }

        [$model, $provider] = $this->extractModelProvider($response, $request);
        if ($model !== null) {
            $metadata["model"] = $model;
        }
        if ($provider !== null) {
            $metadata["provider"] = $provider;
        }
        $this->enrichMetadataFromResponse($metadata, $this->normalizeToArray($response));
        if (!$this->captureHeaders) {
            unset($metadata["headers"]);
        }

        $entry = [
            "id" => $this->newEntryId(),
            "type" => $endpoint,
            "timestamp" => $this->currentTimestampMs(),
            "duration_ms" => $durationMs,
            "request" => $this->normalizeJsonValue($request),
            "response" => $this->normalizeJsonValue($response),
            "error" => null,
            "metadata" => $metadata,
        ];
        $this->appendEntry($entry);
    }

    public function captureError(string $endpoint, mixed $request, \Throwable $error, int $durationMs): void
    {
        if (!$this->enabled) {
            return;
        }

        $metadata = [
            "sdk" => "php",
            "sdk_version" => $this->sdkVersion,
            "stream" => false,
        ];
        $errorResponse = $this->extractErrorResponse($error);

        [$model, $provider] = $this->extractModelProvider(null, $request);
        if ($model !== null) {
            $metadata["model"] = $model;
        }
        if ($provider !== null) {
            $metadata["provider"] = $provider;
        }
        $this->enrichMetadataFromResponse($metadata, $errorResponse);
        $statusCode = $this->extractErrorStatusCode($error);

        $entry = [
            "id" => $this->newEntryId(),
            "type" => $endpoint,
            "timestamp" => $this->currentTimestampMs(),
            "duration_ms" => $durationMs,
            "request" => $this->normalizeJsonValue($request),
            "response" => $this->normalizeJsonValue($errorResponse),
            "error" => array_filter([
                "message" => $error->getMessage(),
                "status_code" => $statusCode,
            ], static fn ($value) => $value !== null),
            "metadata" => $metadata,
        ];
        $this->appendEntry($entry);
    }

    /** @param array<string,mixed> $entry */
    private function appendEntry(array $entry): void
    {
        $this->ensureLayout();
        $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line === false) {
            return;
        }
        file_put_contents($this->directory . "/generations.jsonl", $line . PHP_EOL, FILE_APPEND);
    }

    private function ensureLayout(): void
    {
        if (!is_dir($this->directory)) {
            @mkdir($this->directory, 0777, true);
        }
        if ($this->saveAssets) {
            @mkdir($this->directory . "/assets/images", 0777, true);
            @mkdir($this->directory . "/assets/audio", 0777, true);
            @mkdir($this->directory . "/assets/video", 0777, true);
        }
    }

    private function writeMetadataIfMissing(): void
    {
        $metadataFile = $this->directory . "/metadata.json";
        if (is_file($metadataFile)) {
            return;
        }
        $metadata = [
            "session_id" => $this->newEntryId(),
            "started_at" => $this->currentTimestampMs(),
            "sdk" => "php",
            "sdk_version" => $this->sdkVersion,
            "platform" => PHP_OS_FAMILY,
            "php_version" => PHP_VERSION,
        ];
        $encoded = json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($encoded !== false) {
            file_put_contents($metadataFile, $encoded);
        }
    }

    private function extractUsage(mixed $response): ?array
    {
        $payload = $this->normalizeToArray($response);
        if (!is_array($payload)) {
            return null;
        }
        $usage = $payload["usage"] ?? null;
        if (!is_array($usage)) {
            return null;
        }

        $prompt = $usage["prompt_tokens"] ?? $usage["input_tokens"] ?? null;
        $completion = $usage["completion_tokens"] ?? $usage["output_tokens"] ?? null;
        $total = $usage["total_tokens"] ?? null;

        $out = [];
        if ($prompt !== null) {
            $out["prompt_tokens"] = $prompt;
        }
        if ($completion !== null) {
            $out["completion_tokens"] = $completion;
        }
        if ($total !== null) {
            $out["total_tokens"] = $total;
        }
        return $out === [] ? null : $out;
    }

    /** @return array{0:?string,1:?string} */
    private function extractModelProvider(mixed $response, mixed $request): array
    {
        $responsePayload = $this->normalizeToArray($response) ?? [];
        $requestPayload = $this->normalizeToArray($request) ?? [];

        $model = $this->asTrimmedString(isset($responsePayload["model"]) ? (string) $responsePayload["model"] : null);
        if ($model === null) {
            $model = $this->asTrimmedString(isset($requestPayload["model"]) ? (string) $requestPayload["model"] : null);
        }
        $provider = $this->asTrimmedString(isset($responsePayload["provider"]) ? (string) $responsePayload["provider"] : null);
        return [$model, $provider];
    }

    private function normalizeJsonValue(mixed $value): mixed
    {
        $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($encoded === false) {
            return is_scalar($value) ? $value : get_debug_type($value);
        }
        return json_decode($encoded, true);
    }

    /** @return array<string,mixed>|null */
    private function normalizeToArray(mixed $value): ?array
    {
        if (is_string($value) && trim($value) !== "") {
            try {
                $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
                return is_array($decoded) ? $decoded : null;
            } catch (\JsonException) {
            }
        }
        $normalized = $this->normalizeJsonValue($value);
        return is_array($normalized) ? $normalized : null;
    }

    /** @return array<string,mixed>|null */
    private function extractErrorResponse(\Throwable $error): ?array
    {
        if ($error instanceof \Phaseo\Gen\RequestException) {
            $parsed = $this->normalizeToArray($error->getResponseBody());
            if (is_array($parsed)) {
                return $parsed;
            }

            $fallback = [
                "status_code" => $error->getStatusCode(),
            ];
            $body = $this->asTrimmedString($error->getResponseBody());
            if ($body !== null) {
                $fallback["error"] = $body;
            }
            return $fallback;
        }

        if (property_exists($error, "response")) {
            $response = $error->response;
            if (is_array($response)) {
                return $response;
            }
            $normalized = $this->normalizeToArray($response);
            if (is_array($normalized)) {
                return $normalized;
            }
        }

        if (property_exists($error, "body")) {
            $normalized = $this->normalizeToArray($error->body);
            if (is_array($normalized)) {
                return $normalized;
            }
        }

        return null;
    }

    private function extractErrorStatusCode(\Throwable $error): ?int
    {
        if ($error instanceof \Phaseo\Gen\RequestException) {
            return $error->getStatusCode();
        }
        if (property_exists($error, "statusCode") && is_int($error->statusCode)) {
            return $error->statusCode;
        }
        return null;
    }

    /** @param array<string,mixed>|null $payload */
    private function enrichMetadataFromResponse(array &$metadata, ?array $payload): void
    {
        if (!is_array($payload)) {
            return;
        }

        foreach ([
            "request_id",
            "session_id",
            "upstream_request_id",
            "native_response_id",
            "status_code",
            "latency_ms",
            "generation_ms",
            "throughput",
            "provider_attempts",
            "pricing_lines",
            "request_counts",
            "billing",
        ] as $key) {
            if (array_key_exists($key, $payload) && $payload[$key] !== null) {
                $metadata[$key] = $payload[$key];
            }
        }

        $finishReason = $payload["finish_reason"] ?? $payload["stop_reason"] ?? null;
        if ($finishReason !== null) {
            $metadata["finish_reason"] = $finishReason;
        }
    }

    private function asTrimmedString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);
        return $trimmed === "" ? null : $trimmed;
    }

    private function newEntryId(): string
    {
        try {
            return $this->currentTimestampMsString() . "-" . bin2hex(random_bytes(4));
        } catch (\Throwable) {
            return uniqid($this->currentTimestampMsString() . "-", true);
        }
    }

    private function currentTimestampMs(): float
    {
        return floor(microtime(true) * 1000);
    }

    private function currentTimestampMsString(): string
    {
        return number_format($this->currentTimestampMs(), 0, "", "");
    }
}
