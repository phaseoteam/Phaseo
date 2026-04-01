<?php
declare(strict_types=1);

// Thin wrapper around the in-house generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace AIStats\Sdk;

require_once __DIR__ . "/gen/Client.php";
require_once __DIR__ . "/gen/Models.php";
require_once __DIR__ . "/gen/Operations.php";

use AIStats\Gen\Client as GenClient;
use RuntimeException;

class AIStats
{
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

    public function __construct(
        ?string $apiKey = null,
        string $basePath = "https://api.phaseo.app/v1",
        bool $enableDeprecationWarnings = true,
        bool $warningsAsErrors = false,
        ?callable $logger = null,
        ?callable $lifecycleResolver = null,
        ?string $caBundlePath = null,
        bool $verifyTls = true,
        ?array $devtools = null
    ) {
        $apiKey = $apiKey ?? getenv("AI_STATS_API_KEY") ?: null;
        if (!$apiKey) {
            throw new \InvalidArgumentException("Missing API key. Pass apiKey or set AI_STATS_API_KEY.");
        }
        $this->client = new GenClient(
            rtrim($basePath, "/"),
            ["Authorization" => "Bearer " . $apiKey],
            $caBundlePath,
            $verifyTls
        );
        $this->enableDeprecationWarnings = $enableDeprecationWarnings;
        $this->warningsAsErrors = $warningsAsErrors;
        $this->logger = $logger;
        $this->lifecycleResolver = $lifecycleResolver;
        $this->telemetryRecorder = new TelemetryRecorder($devtools, "1.1.1");
    }

    public function rawClient(): GenClient
    {
        return $this->client;
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
        if (($info["status"] ?? "active") === "retired") {
            return [
                "ok" => false,
                "info" => $info,
                "reason" => (string) ($info["message"] ?? sprintf('Model "%s" is retired.', $modelId)),
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
            fn () => \AIStats\Gen\createChatCompletion($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\createResponse($this->client, null, null, null, $payload)
        );
    }

    public function createResponse(array $payload): mixed
    {
        return $this->generateResponse($payload);
    }

    public function createAnthropicMessage(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "messages",
            $payload,
            true,
            fn () => \AIStats\Gen\createAnthropicMessage($this->client, null, null, null, $payload)
        );
    }

    public function generateImage(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "images.generations",
            $payload,
            true,
            fn () => \AIStats\Gen\createImage($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\createImageEdit($this->client, null, null, null, $payload)
        );
    }

    public function createImageEdit(array $payload): mixed
    {
        return $this->generateImageEdit($payload);
    }

    public function generateEmbedding(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "embeddings",
            $payload,
            true,
            fn () => \AIStats\Gen\createEmbedding($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\createModeration($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\createSpeech($this->client, null, null, null, $payload)
        );
    }

    public function generateTranscription(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "audio.transcriptions",
            $payload,
            true,
            fn () => \AIStats\Gen\createTranscription($this->client, null, null, null, $payload)
        );
    }

    public function createTranscription(array $payload): mixed
    {
        return $this->generateTranscription($payload);
    }

    public function generateTranslation(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "audio.translations",
            $payload,
            true,
            fn () => \AIStats\Gen\createTranslation($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\createBatch($this->client, null, null, null, $payload)
        );
    }

    public function retrieveBatch(string $batchId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "batches.retrieve",
            ["batch_id" => $batchId],
            false,
            fn () => \AIStats\Gen\retrieveBatch($this->client, ["batch_id" => $batchId])
        );
    }

    public function listFiles(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "files.list",
            $params,
            false,
            fn () => \AIStats\Gen\listFiles($this->client, null, $params, null, null)
        );
    }

    public function retrieveFile(string $fileId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "files.retrieve",
            ["file_id" => $fileId],
            false,
            fn () => \AIStats\Gen\retrieveFile($this->client, ["file_id" => $fileId])
        );
    }

    public function uploadFile(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "files.upload",
            $payload,
            false,
            fn () => \AIStats\Gen\uploadFile($this->client, null, null, null, $payload)
        );
    }

    public function listModels(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "models.list",
            $params,
            false,
            fn () => \AIStats\Gen\listModels($this->client, null, $params, null, null)
        );
    }

    public function listProviders(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "providers",
            $params,
            false,
            fn () => \AIStats\Gen\listProviders($this->client, null, $params, null, null)
        );
    }

    public function getAnalytics(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "analytics",
            $params,
            false,
            fn () => \AIStats\Gen\getAnalytics($this->client, null, $params, null, null)
        );
    }

    public function getCredits(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "credits",
            $params,
            false,
            fn () => \AIStats\Gen\getCredits($this->client, null, $params, null, null)
        );
    }

    public function getActivity(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "activity",
            $params,
            false,
            fn () => \AIStats\Gen\getActivity($this->client, null, $params, null, null)
        );
    }

    public function health(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "health",
            null,
            false,
            fn () => \AIStats\Gen\healthz($this->client)
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
        $this->maybeWarnForModel($modelId);
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
            $response = \AIStats\Gen\listDataModels(
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
            if ($this->asTrimmedString((string) ($modelData["model_id"] ?? "")) !== $modelId) {
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
            $fallbackModelId
        ) ?? $fallbackModelId;
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
                return sprintf('[ai-stats] Model "%s" is retired as of %s.%s', $modelId, $retirementDate, $replacement);
            }
            return sprintf('[ai-stats] Model "%s" is retired.%s', $modelId, $replacement);
        }
        if ($status === "deprecated") {
            if ($retirementDate !== null) {
                return sprintf(
                    '[ai-stats] Model "%s" is deprecated and scheduled for retirement on %s.%s',
                    $modelId,
                    $retirementDate,
                    $replacement
                );
            }
            if ($deprecationDate !== null) {
                return sprintf('[ai-stats] Model "%s" has been deprecated since %s.%s', $modelId, $deprecationDate, $replacement);
            }
            return sprintf('[ai-stats] Model "%s" is deprecated.%s', $modelId, $replacement);
        }
        return "";
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
        $directory = trim((string) ($config["directory"] ?? ".ai-stats-devtools"));
        if ($directory === "") {
            $directory = ".ai-stats-devtools";
        }

        $envEnabled = getenv("AI_STATS_DEVTOOLS");
        if ($envEnabled !== false && trim($envEnabled) !== "") {
            $enabled = in_array(strtolower(trim($envEnabled)), ["1", "true", "yes", "on"], true);
        }
        $envDirectory = getenv("AI_STATS_DEVTOOLS_DIR");
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

        [$model, $provider] = $this->extractModelProvider(null, $request);
        if ($model !== null) {
            $metadata["model"] = $model;
        }
        if ($provider !== null) {
            $metadata["provider"] = $provider;
        }

        $entry = [
            "id" => $this->newEntryId(),
            "type" => $endpoint,
            "timestamp" => $this->currentTimestampMs(),
            "duration_ms" => $durationMs,
            "request" => $this->normalizeJsonValue($request),
            "response" => null,
            "error" => ["message" => $error->getMessage()],
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
        $normalized = $this->normalizeJsonValue($value);
        return is_array($normalized) ? $normalized : null;
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
