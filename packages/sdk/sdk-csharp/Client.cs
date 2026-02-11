using System.Collections.Generic;
using System.Threading.Tasks;
using AiStats.Gen;

namespace AiStatsSdk
{
    // Lightweight facade over the in-house generated SDK.
    // Regenerate with: `pnpm openapi:gen:csharp`
    public sealed class Client
    {
        private readonly AiStats.Gen.Client _client;

        public Client(string apiKey, string basePath = "https://api.phaseo.app/v1")
        {
            var headers = new Dictionary<string, string> { { "Authorization", $"Bearer {apiKey}" } };
            _client = new AiStats.Gen.Client(basePath, headers: headers);
        }

        public Task<Dictionary<string, object>?> GenerateText(Dictionary<string, object> request)
        {
            return Operations.CreateChatCompletionAsync(_client, body: request);
        }

        public Task<Dictionary<string, object>?> GenerateResponse(Dictionary<string, object> request)
        {
            return Operations.CreateResponseAsync(_client, body: request);
        }

        public Task<Dictionary<string, object>?> GenerateImage(Dictionary<string, object> request)
        {
            return Operations.CreateImageAsync(_client, body: request);
        }

        public Task<Dictionary<string, object>?> GenerateModeration(Dictionary<string, object> request)
        {
            return Operations.CreateModerationAsync(_client, body: request);
        }

        public Task<Dictionary<string, object>?> ListModels(Dictionary<string, string>? query = null)
        {
            return Operations.ListModelsAsync(_client, query: query);
        }

        public Task<Dictionary<string, object>?> Health()
        {
            return Operations.HealthzAsync(_client);
        }
    }
}
