using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AiStats.Gen;

// Lightweight facade over the generated SDK for common endpoints.
// Generate the SDK with: `pnpm oapi:gen`

namespace AiStatsSdk
{
    public class Client
    {
        private readonly AiStats.Gen.Client _client;

        public ChatResource Chat { get; }
        public ResponsesResource Responses { get; }
        public MessagesResource Messages { get; }
        public ImagesResource Images { get; }
        public AudioResource Audio { get; }
        public ModerationsResource Moderations { get; }
        public BatchesResource Batches { get; }
        public FilesResource Files { get; }
        public ModelsResource Models { get; }

        public Client(string apiKey, string basePath = "https://api.phaseo.app/v1")
        {
            _client = new AiStats.Gen.Client(basePath, headers: new Dictionary<string, string>
            {
                ["Authorization"] = $"Bearer {apiKey}"
            });

            Chat = new ChatResource(_client);
            Responses = new ResponsesResource(_client);
            Messages = new MessagesResource(_client);
            Images = new ImagesResource(_client);
            Audio = new AudioResource(_client);
            Moderations = new ModerationsResource(_client);
            Batches = new BatchesResource(_client);
            Files = new FilesResource(_client);
            Models = new ModelsResource(_client);
        }

        public Task<Dictionary<string, object>?> GenerateText(object request)
        {
            return Chat.Completions.Create(request);
        }

        public Task<Dictionary<string, object>?> GenerateResponse(object request)
        {
            return Responses.Create(request);
        }

        public Task<Dictionary<string, object>?> GetHealth()
        {
            return Operations.HealthAsync(_client);
        }
    }

    public sealed class ChatResource
    {
        public ChatCompletionsResource Completions { get; }

        public ChatResource(AiStats.Gen.Client client)
        {
            Completions = new ChatCompletionsResource(client);
        }
    }

    public sealed class ChatCompletionsResource
    {
        private readonly AiStats.Gen.Client _client;

        public ChatCompletionsResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateChatCompletionAsync(_client, body: payload);
        }
    }

    public sealed class ResponsesResource
    {
        private readonly AiStats.Gen.Client _client;

        public ResponsesResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateResponseAsync(_client, body: payload);
        }
    }

    public sealed class MessagesResource
    {
        private readonly AiStats.Gen.Client _client;

        public MessagesResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateAnthropicMessageAsync(_client, body: payload);
        }
    }

    public sealed class ImagesResource
    {
        private readonly AiStats.Gen.Client _client;

        public ImagesResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Generate(object payload)
        {
            return Operations.CreateImageAsync(_client, body: payload);
        }

        public Task<Dictionary<string, object>?> Edit(object payload)
        {
            return Operations.CreateImageEditAsync(_client, body: payload);
        }
    }

    public sealed class AudioResource
    {
        public AudioSpeechResource Speech { get; }
        public AudioTranscriptionsResource Transcriptions { get; }
        public AudioTranslationsResource Translations { get; }

        public AudioResource(AiStats.Gen.Client client)
        {
            Speech = new AudioSpeechResource(client);
            Transcriptions = new AudioTranscriptionsResource(client);
            Translations = new AudioTranslationsResource(client);
        }
    }

    public sealed class AudioSpeechResource
    {
        private readonly AiStats.Gen.Client _client;

        public AudioSpeechResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateSpeechAsync(_client, body: payload);
        }
    }

    public sealed class AudioTranscriptionsResource
    {
        private readonly AiStats.Gen.Client _client;

        public AudioTranscriptionsResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateTranscriptionAsync(_client, body: payload);
        }
    }

    public sealed class AudioTranslationsResource
    {
        private readonly AiStats.Gen.Client _client;

        public AudioTranslationsResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateTranslationAsync(_client, body: payload);
        }
    }

    public sealed class ModerationsResource
    {
        private readonly AiStats.Gen.Client _client;

        public ModerationsResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateModerationAsync(_client, body: payload);
        }
    }

    public sealed class BatchesResource
    {
        private readonly AiStats.Gen.Client _client;

        public BatchesResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> Create(object payload)
        {
            return Operations.CreateBatchAsync(_client, body: payload);
        }

        public Task<Dictionary<string, object>?> Retrieve(string batchId)
        {
            return Operations.RetrieveBatchAsync(_client, path: new Dictionary<string, string> { ["batch_id"] = batchId });
        }
    }

    public sealed class FilesResource
    {
        private readonly AiStats.Gen.Client _client;

        public FilesResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> List()
        {
            return Operations.ListFilesAsync(_client);
        }

        public Task<Dictionary<string, object>?> Retrieve(string fileId)
        {
            return Operations.RetrieveFileAsync(_client, path: new Dictionary<string, string> { ["file_id"] = fileId });
        }
    }

    public sealed class ModelsResource
    {
        private readonly AiStats.Gen.Client _client;

        public ModelsResource(AiStats.Gen.Client client)
        {
            _client = client;
        }

        public Task<Dictionary<string, object>?> List(Dictionary<string, string>? query = null)
        {
            return Operations.ListModelsAsync(_client, query: query);
        }
    }
}
