package ai.stats.gen;

import java.io.IOException;
import java.util.Map;

public final class Operations {
	private Operations() {}

	public static Object calculatePricing(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/pricing/calculate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createAnthropicMessage(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/messages";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createChatCompletion(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/chat/completions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createEmbedding(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/embeddings";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createImage(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/images/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createImageEdit(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/images/edits";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createModeration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/moderations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createOcr(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/ocr";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createRerank(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/rerank";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createResponse(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/responses";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createSpeech(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/speech";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createTranscription(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/transcriptions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createTranslation(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/translations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoDownloadUrl(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/download_url";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoDownloadUrlAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/download_url";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object deleteApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("endpoint_id") ? path.get("endpoint_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object generateMusic(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object generateMusicAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object getActivity(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/activity";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getActivityAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/analytics";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getCredits(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/credits";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getCurrentApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/key";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getGeneration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/generations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getHealth(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getMusicGeneration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generate/" + (path != null && path.containsKey("music_id") ? path.get("music_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getMusicGenerationAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generations/" + (path != null && path.containsKey("music_id") ? path.get("music_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProviderDerankStatus(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health/providers/" + (path != null && path.containsKey("provider_id") ? path.get("provider_id") : "") + "/derank";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoContentAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("endpoint_id") ? path.get("endpoint_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listApiKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchCapabilities(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/capabilities";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchCapabilitiesAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/capabilities";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchRequests(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "") + "/requests";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchRequestsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/requests";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listDataModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listEndpoints(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listFiles(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/gateway/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listOrganisations(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/organisations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPricingModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/pricing/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listProviders(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/providers";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listTeamModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/gateway/models/me";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideoModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideoModelsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideos(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideosAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWebhookEndpoints(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaces(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object openResponsesWebSocket(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/responses/ws";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileContentAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveFileContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object rotateWebhookEndpointSecret(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("endpoint_id") ? path.get("endpoint_id") : "") + "/rotate-secret";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object updateApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("endpoint_id") ? path.get("endpoint_id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object uploadBatchFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object uploadBatchFileAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object uploadFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

}
