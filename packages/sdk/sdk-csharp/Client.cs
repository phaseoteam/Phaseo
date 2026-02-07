using System.Net.Http.Headers;
using AiStatsSdk.Client;
using AiStatsSdk.Api;
using AiStatsSdk.Model;

// Lightweight facade over the generated SDK for common endpoints.
// Generate the SDK with: `pnpm openapi:gen:csharp`

namespace AiStatsSdk
{
    public class Client
    {
        private readonly ModelsApi _modelsApi;
        private readonly CompletionsApi _completionsApi;
        private readonly ResponsesApi _responsesApi;
        private readonly AudioApi _audioApi;
        private readonly BatchApi _batchApi;
        private readonly FilesApi _filesApi;
        private readonly AnalyticsApi _analyticsApi;
        private readonly ImagesApi _imagesApi;
        private readonly VideoApi _videoApi;
        private readonly ModerationsApi _moderationsApi;

        public Client(string apiKey, string basePath = "https://api.phaseo.app/v1")
        {
            var config = new Configuration { BasePath = basePath };
            config.DefaultHeaders["Authorization"] = $"Bearer {apiKey}";
            var httpClient = new HttpClient { BaseAddress = new Uri(basePath) };
            _modelsApi = new ModelsApi(httpClient, config);
            _completionsApi = new CompletionsApi(httpClient, config);
            _responsesApi = new ResponsesApi(httpClient, config);
            _audioApi = new AudioApi(httpClient, config);
            _batchApi = new BatchApi(httpClient, config);
            _filesApi = new FilesApi(httpClient, config);
            _analyticsApi = new AnalyticsApi(httpClient, config);
            _imagesApi = new ImagesApi(httpClient, config);
            _videoApi = new VideoApi(httpClient, config);
            _moderationsApi = new ModerationsApi(httpClient, config);
        }

        public ModelListResponse GetModels(
            string? provider = null,
            int? limit = null,
            int? offset = null,
            string? organisation = null)
        {
            return _modelsApi.ModelsGet(provider, limit, offset, organisation);
        }

        public ImagesApi ImagesApi => _imagesApi;
        public AudioApi AudioApi => _audioApi;
        public VideoApi VideoApi => _videoApi;
        public ModerationsApi ModerationsApi => _moderationsApi;

        public ChatCompletionsResponse GenerateText(ChatCompletionsRequest request)
        {
            return _completionsApi.CreateChatCompletion(new CreateChatCompletionRequest(request));
        }

        public ResponsesResponse GenerateResponse(ResponsesRequest request)
        {
            return _responsesApi.CreateResponse(new CreateResponseRequest(request));
        }

        public BatchResponse CreateBatch(BatchRequest request)
        {
            return _batchApi.BatchesPost(new BatchesPostRequest(request));
        }

        public BatchResponse GetBatch(string batchId)
        {
            return _batchApi.BatchesBatchIdGet(batchId);
        }

        public FileListResponse ListFiles()
        {
            return _filesApi.FilesGet();
        }

        public FileObject GetFile(string fileId)
        {
            return _filesApi.FilesFileIdGet(fileId);
        }

        public HealthzGet200Response GetHealth()
        {
            return _analyticsApi.HealthzGet();
        }
    }
}
