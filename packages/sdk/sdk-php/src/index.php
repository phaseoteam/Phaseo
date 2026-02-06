<?php
// Thin wrapper around the generated PHP SDK.
// Regenerate with: `pnpm openapi:gen:php`

namespace AIStats\Sdk;

class Client
{
    private \AIStats\Gen\Client $client;
    public ChatResource $chat;
    public ResponsesResource $responses;
    public MessagesResource $messages;
    public ImagesResource $images;
    public AudioResource $audio;
    public ModerationsResource $moderations;
    public BatchesResource $batches;
    public FilesResource $files;
    public ModelsResource $models;

    public function __construct(string $apiKey, string $basePath = 'https://api.phaseo.app/v1')
    {
        $host = rtrim($basePath, '/');
        $this->client = new \AIStats\Gen\Client($host, [
            "Authorization" => "Bearer {$apiKey}"
        ]);
        $this->chat = new ChatResource($this->client);
        $this->responses = new ResponsesResource($this->client);
        $this->messages = new MessagesResource($this->client);
        $this->images = new ImagesResource($this->client);
        $this->audio = new AudioResource($this->client);
        $this->moderations = new ModerationsResource($this->client);
        $this->batches = new BatchesResource($this->client);
        $this->files = new FilesResource($this->client);
        $this->models = new ModelsResource($this->client);
    }

    /**
     * Chat completions.
     */
    public function generateText(array $payload)
    {
        return $this->chat->completions->create($payload);
    }

    /**
     * Responses API.
     */
    public function generateResponse(array $payload)
    {
        return $this->responses->create($payload);
    }

    public function generateImage(array $payload)
    {
        return $this->images->generate($payload);
    }

    public function generateImageEdit(array $payload)
    {
        return $this->images->edit($payload);
    }

    public function generateEmbedding(array $payload)
    {
        return \AIStats\Gen\createEmbedding($this->client, null, null, null, $payload);
    }

    public function generateModeration(array $payload)
    {
        return $this->moderations->create($payload);
    }

    public function generateTranscription(array $payload)
    {
        return $this->audio->transcriptions->create($payload);
    }

    public function generateTranslation(array $payload)
    {
        return $this->audio->translations->create($payload);
    }

    public function listModels(array $params = [])
    {
        return $this->models->list($params);
    }
}

class ChatCompletionsResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createChatCompletion($this->client, null, null, null, $payload);
    }
}

class ChatResource
{
    public ChatCompletionsResource $completions;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->completions = new ChatCompletionsResource($client);
    }
}

class ResponsesResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createResponse($this->client, null, null, null, $payload);
    }
}

class MessagesResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createAnthropicMessage($this->client, null, null, null, $payload);
    }
}

class ImagesResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function generate(array $payload)
    {
        return \AIStats\Gen\createImage($this->client, null, null, null, $payload);
    }

    public function edit(array $payload)
    {
        return \AIStats\Gen\createImageEdit($this->client, null, null, null, $payload);
    }
}

class AudioSpeechResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createSpeech($this->client, null, null, null, $payload);
    }
}

class AudioTranscriptionsResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createTranscription($this->client, null, null, null, $payload);
    }
}

class AudioTranslationsResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createTranslation($this->client, null, null, null, $payload);
    }
}

class AudioResource
{
    public AudioSpeechResource $speech;
    public AudioTranscriptionsResource $transcriptions;
    public AudioTranslationsResource $translations;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->speech = new AudioSpeechResource($client);
        $this->transcriptions = new AudioTranscriptionsResource($client);
        $this->translations = new AudioTranslationsResource($client);
    }
}

class ModerationsResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createModeration($this->client, null, null, null, $payload);
    }
}

class BatchesResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function create(array $payload)
    {
        return \AIStats\Gen\createBatch($this->client, null, null, null, $payload);
    }

    public function retrieve(string $batchId)
    {
        return \AIStats\Gen\retrieveBatch($this->client, ["batch_id" => $batchId], null, null, null);
    }
}

class FilesResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function list()
    {
        return \AIStats\Gen\listFiles($this->client);
    }

    public function retrieve(string $fileId)
    {
        return \AIStats\Gen\retrieveFile($this->client, ["file_id" => $fileId], null, null, null);
    }
}

class ModelsResource
{
    private \AIStats\Gen\Client $client;

    public function __construct(\AIStats\Gen\Client $client)
    {
        $this->client = $client;
    }

    public function list(array $params = [])
    {
        return \AIStats\Gen\listModels($this->client, null, $params);
    }
}
