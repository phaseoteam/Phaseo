using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace AiStats.Gen;

public static class Operations
{
	public static Task<Dictionary<string, object>?> CalculatePricingAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/pricing/calculate";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateAnthropicMessageAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/messages";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateBatchAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateBatchAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateChatCompletionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/chat/completions";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateEmbeddingAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/embeddings";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateImageAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/images/generations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateImageEditAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/images/edits";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateModerationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/moderations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateOcrAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/ocr";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateProvisioningKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management/keys";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateProvisioningKeyAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/provisioning/keys";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateProvisioningKeyLegacyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateResponseAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/responses";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<object?> CreateSpeechAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audio/speech";
		return client.SendAsync<object>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateTranscriptionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audio/transcriptions";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateTranslationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audio/translations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateVideoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateVideoAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + (path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteProvisioningKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteProvisioningKeyAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/provisioning/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteVideoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteVideoAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GenerateMusicAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/music/generate";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GenerateMusicAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/music/generations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetActivityAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/activity";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetAnalyticsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/analytics";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetCreditsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/credits";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetGenerationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/generations";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetMusicGenerationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/music/generate/" + (path != null && path.ContainsKey("music_id") ? path["music_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetMusicGenerationAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/music/generations/" + (path != null && path.ContainsKey("music_id") ? path["music_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + (path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetProviderDerankStatusAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/health/providers/" + (path != null && path.ContainsKey("provider_id") ? path["provider_id"] : "") + "/derank";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetProvisioningKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetProvisioningKeyAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/provisioning/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetProvisioningKeyLegacyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/key";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetVideoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetVideoAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> GetVideoContentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> GetVideoContentAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> HealthzAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/health";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> InvalidateGatewayKeyCacheAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "") + "/invalidate";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListEndpointsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/endpoints";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListFilesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListOAuthClientsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListOrganisationsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/organisations";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListPricingModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/pricing/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListProvidersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/providers";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListProvisioningKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management/keys";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListProvisioningKeysAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/provisioning/keys";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListProvisioningKeysLegacyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RegenerateOAuthClientSecretAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + (path != null && path.ContainsKey("client_id") ? path["client_id"] : "") + "/regenerate-secret";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveBatchAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/" + (path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveBatchAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveFileAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + (path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateProvisioningKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateProvisioningKeyAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/provisioning/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UploadFileAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

}
