<?php
declare(strict_types=1);

// Thin wrapper around the in-house generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace AIStats\Sdk;

require_once __DIR__ . "/gen/Client.php";
require_once __DIR__ . "/gen/Models.php";
require_once __DIR__ . "/gen/Operations.php";

use AIStats\Gen\Client as GenClient;

class Client
{
    private GenClient $client;

    public function __construct(string $apiKey, string $basePath = "https://api.phaseo.app/v1")
    {
        $this->client = new GenClient(
            rtrim($basePath, "/"),
            ["Authorization" => "Bearer " . $apiKey]
        );
    }

    public function generateText(array $payload): mixed
    {
        return \AIStats\Gen\createChatCompletion($this->client, null, null, null, $payload);
    }

    public function generateResponse(array $payload): mixed
    {
        return \AIStats\Gen\createResponse($this->client, null, null, null, $payload);
    }

    public function generateImage(array $payload): mixed
    {
        return \AIStats\Gen\createImage($this->client, null, null, null, $payload);
    }

    public function generateImageEdit(array $payload): mixed
    {
        return \AIStats\Gen\createImageEdit($this->client, null, null, null, $payload);
    }

    public function generateEmbedding(array $payload): mixed
    {
        return \AIStats\Gen\createEmbedding($this->client, null, null, null, $payload);
    }

    public function generateModeration(array $payload): mixed
    {
        return \AIStats\Gen\createModeration($this->client, null, null, null, $payload);
    }

    public function generateTranscription(array $payload): mixed
    {
        return \AIStats\Gen\createTranscription($this->client, null, null, null, $payload);
    }

    public function generateTranslation(array $payload): mixed
    {
        return \AIStats\Gen\createTranslation($this->client, null, null, null, $payload);
    }

    public function listModels(array $params = []): mixed
    {
        return \AIStats\Gen\listModels($this->client, null, $params, null, null);
    }

    public function health(): mixed
    {
        return \AIStats\Gen\healthz($this->client);
    }
}
