<?php
// Thin wrapper around the generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace AIStats\Sdk;

use AIStats\Sdk\Api\DefaultApi;
use AIStats\Sdk\Configuration;
use AIStats\Sdk\Model\ResponsesResponse;
use AIStats\Sdk\Model\ChatCompletionsResponse;
use AIStats\Sdk\Model\ImagesGenerationResponse;
use AIStats\Sdk\Model\ImagesEditResponse;
use AIStats\Sdk\Model\EmbeddingsResponse;
use AIStats\Sdk\Model\ModerationsResponse;
use AIStats\Sdk\Model\AudioTranscriptionResponse;
use AIStats\Sdk\Model\AudioTranslationResponse;
use AIStats\Sdk\Model\ListModels200Response;

class Client
{
    private DefaultApi $api;

    public function __construct(string $apiKey, string $basePath = 'https://api.phaseo.app/v1')
    {
        $host = rtrim($basePath, '/');
        $config = Configuration::getDefaultConfiguration()
            ->setHost($host)
            ->setApiKey('GatewayAuth', 'Bearer ' . $apiKey);

        $this->api = new DefaultApi(null, $config);
    }

    /**
     * Chat completions.
     */
    public function generateText(array $payload): ChatCompletionsResponse
    {
        return $this->api->createChatCompletion($payload);
    }

    /**
     * Responses API.
     */
    public function generateResponse(array $payload): ResponsesResponse
    {
        return $this->api->createResponse($payload);
    }

    public function generateImage(array $payload): ImagesGenerationResponse
    {
        return $this->api->createImage($payload);
    }

    public function generateImageEdit(array $payload): ImagesEditResponse
    {
        $model = $payload['model'] ?? null;
        $image = $payload['image'] ?? null;
        $prompt = $payload['prompt'] ?? null;
        $mask = $payload['mask'] ?? null;
        $size = $payload['size'] ?? null;
        $n = $payload['n'] ?? null;
        $user = $payload['user'] ?? null;
        $meta = $payload['meta'] ?? null;
        $usage = $payload['usage'] ?? null;

        return $this->api->createImageEdit($model, $image, $prompt, $mask, $size, $n, $user, $meta, $usage);
    }

    public function generateEmbedding(array $payload): EmbeddingsResponse
    {
        return $this->api->createEmbedding($payload);
    }

    public function generateModeration(array $payload): ModerationsResponse
    {
        return $this->api->createModeration($payload);
    }

    public function generateTranscription(array $payload): AudioTranscriptionResponse
    {
        return $this->api->createTranscription($payload['model'] ?? null, $payload['audioUrl'] ?? null, $payload['audioB64'] ?? null, $payload['language'] ?? null);
    }

    public function generateTranslation(array $payload): AudioTranslationResponse
    {
        return $this->api->createTranslation($payload['model'] ?? null, $payload['audioUrl'] ?? null, $payload['audioB64'] ?? null, $payload['language'] ?? null, $payload['prompt'] ?? null, $payload['temperature'] ?? null);
    }

    public function listModels(array $params = []): ListModels200Response
    {
        return $this->api->listModels(
            $params['endpoints'] ?? null,
            $params['organisation'] ?? null,
            $params['input_types'] ?? null,
            $params['output_types'] ?? null,
            $params['params'] ?? null,
            $params['limit'] ?? 50,
            $params['offset'] ?? 0
        );
    }
}
