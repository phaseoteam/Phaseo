package ai.stats.gen;

import java.io.IOException;
import java.util.Map;

public final class Operations {
	private Operations() {}

	public static Object calculatePricing(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/pricing/calculate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createAnthropicMessage(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/messages";
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

	public static Object createKeyPlaceholder(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createModeration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/moderations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createOcr(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/ocr";
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

	public static Object deleteOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteProvisioningKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteProvisioningKeyAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/provisioning/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
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

	public static Object getAnalytics(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/analytics";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object getCredits(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/credits";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getGeneration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/generations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getKeyPlaceholder(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/key";
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

	public static Object getOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProviderDerankStatus(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health/providers/" + (path != null && path.containsKey("provider_id") ? path.get("provider_id") : "") + "/derank";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProvisioningKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProvisioningKeyAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/provisioning/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
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

	public static Object healthz(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object invalidateGatewayKeyCache(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/invalidate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object listEndpointsPlaceholder(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listFiles(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listKeysPlaceholder(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listOAuthClients(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients";
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

	public static Object listProvisioningKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listProvisioningKeysAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/provisioning/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object regenerateOAuthClientSecret(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "") + "/regenerate-secret";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object root(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object updateOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateProvisioningKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateProvisioningKeyAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/provisioning/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object uploadFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

}
