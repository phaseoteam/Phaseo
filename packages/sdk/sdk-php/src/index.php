<?php
declare(strict_types=1);

// Thin wrapper around the in-house generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace AIStats\Sdk;

require_once __DIR__ . "/gen/Client.php";
require_once __DIR__ . "/gen/Models.php";
require_once __DIR__ . "/gen/Operations.php";
require_once __DIR__ . "/ModelIds.php";

use AIStats\Gen\Client as GenClient;
use RuntimeException;

class AsyncJobsResource
{
    public function __construct(private AIStats $parent)
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

class AIStats
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
        $this->basePath = rtrim($basePath, "/");
        $this->client = new GenClient(
            $this->basePath,
            ["Authorization" => "Bearer " . $apiKey],
            $caBundlePath,
            $verifyTls
        );
        $this->enableDeprecationWarnings = $enableDeprecationWarnings;
        $this->warningsAsErrors = $warningsAsErrors;
        $this->logger = $logger;
        $this->lifecycleResolver = $lifecycleResolver;
        $this->telemetryRecorder = new TelemetryRecorder($devtools, "2.0.3");
        $this->asyncJobs = new AsyncJobsResource($this);
    }

    public function rawClient(): GenClient
    {
        return $this->client;
    }

    public function asyncJobs(): AsyncJobsResource
    {
        return $this->asyncJobs;
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

    public function generateVideo(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.generations",
            $payload,
            true,
            fn () => \AIStats\Gen\createVideo($this->client, null, null, null, $payload)
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
            fn () => \AIStats\Gen\getVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function cancelVideo(string $videoId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.cancel",
            ["video_id" => $videoId],
            false,
            fn () => \AIStats\Gen\cancelVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function deleteVideo(string $videoId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.delete",
            ["video_id" => $videoId],
            false,
            fn () => \AIStats\Gen\deleteVideo($this->client, ["video_id" => $videoId])
        );
    }

    public function listVideoModels(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.models",
            null,
            false,
            fn () => \AIStats\Gen\listVideoModels($this->client)
        );
    }

    public function listVideos(array $query = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "video.list",
            $query,
            false,
            fn () => \AIStats\Gen\listVideos($this->client, null, $query)
        );
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

    public function cancelBatch(string $batchId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "batches.cancel",
            ["batch_id" => $batchId],
            false,
            fn () => \AIStats\Gen\cancelBatch($this->client, ["batch_id" => $batchId])
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

    public function listTeamModels(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "models.team",
            $params,
            false,
            fn () => \AIStats\Gen\listTeamModels($this->client, null, $params, null, null)
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
            fn () => \AIStats\Gen\getActivityAlias($this->client, null, $params, null, null)
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

    public function getGeneration(string $generationId): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "generations.retrieve",
            ["id" => $generationId],
            false,
            fn () => \AIStats\Gen\getGeneration($this->client, null, ["id" => $generationId], null, null)
        );
    }

    public function listEndpoints(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "endpoints.list",
            [],
            false,
            fn () => \AIStats\Gen\listEndpoints($this->client, null, null, null, null)
        );
    }

    public function listOrganisations(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "organisations.list",
            $params,
            false,
            fn () => \AIStats\Gen\listOrganisations($this->client, null, $params, null, null)
        );
    }

    public function listPricingModels(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "pricing.models",
            $params,
            false,
            fn () => \AIStats\Gen\listPricingModels($this->client, null, $params, null, null)
        );
    }

    public function calculatePricing(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "pricing.calculate",
            $payload,
            false,
            fn () => \AIStats\Gen\calculatePricing($this->client, null, null, null, $payload)
        );
    }

    public function listApiKeys(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.list",
            $params,
            false,
            fn () => \AIStats\Gen\listApiKeys($this->client, null, $params, null, null)
        );
    }

    public function createApiKey(array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.create",
            $payload,
            false,
            fn () => \AIStats\Gen\createApiKey($this->client, null, null, null, $payload)
        );
    }

    public function getApiKey(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.get",
            ["id" => $id],
            false,
            fn () => \AIStats\Gen\getApiKey($this->client, ["id" => $id], null, null, null)
        );
    }

    public function updateApiKey(string $id, array $payload): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.update",
            ["id" => $id, "body" => $payload],
            false,
            fn () => \AIStats\Gen\updateApiKey($this->client, ["id" => $id], null, null, $payload)
        );
    }

    public function deleteApiKey(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.keys.delete",
            ["id" => $id],
            false,
            fn () => \AIStats\Gen\deleteApiKey($this->client, ["id" => $id], null, null, null)
        );
    }

    public function listWorkspaces(array $params = []): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.list",
            $params,
            false,
            fn () => \AIStats\Gen\listWorkspaces($this->client, null, $params, null, null)
        );
    }

    public function getWorkspace(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.get",
            ["id" => $id],
            false,
            fn () => \AIStats\Gen\getWorkspace($this->client, ["id" => $id], null, null, null)
        );
    }

    public function createWorkspace(array $body): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.create",
            $body,
            false,
            fn () => \AIStats\Gen\createWorkspace($this->client, null, null, null, $body)
        );
    }

    public function updateWorkspace(string $id, array $body): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.update",
            array_merge(["id" => $id], $body),
            false,
            fn () => \AIStats\Gen\updateWorkspace($this->client, ["id" => $id], null, null, $body)
        );
    }

    public function deleteWorkspace(string $id): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "provisioning.workspaces.delete",
            ["id" => $id],
            false,
            fn () => \AIStats\Gen\deleteWorkspace($this->client, ["id" => $id], null, null, null)
        );
    }

    public function getCurrentApiKey(): mixed
    {
        return $this->withLifecycleAndTelemetry(
            "key.current",
            [],
            false,
            fn () => \AIStats\Gen\getCurrentApiKey($this->client, null, null, null, null)
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
            return $message ?? $fallback ?? sprintf('[ai-stats] Model "%s" is not active for inference.', $modelId);
        }

        $sourceStatus = $this->normalizeSourceStatus(isset($info["source_status"]) ? (string) $info["source_status"] : null) ?? "unknown";
        $replacementModelId = $this->asTrimmedString(isset($info["replacement_model_id"]) ? (string) $info["replacement_model_id"] : null);
        $replacement = $replacementModelId !== null ? sprintf(' Use "%s" instead.', $replacementModelId) : "";
        return sprintf(
            '[ai-stats] Model "%s" is not active for inference (status: %s).%s',
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
        if ($error instanceof \AIStats\Gen\RequestException) {
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
        if ($error instanceof \AIStats\Gen\RequestException) {
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
