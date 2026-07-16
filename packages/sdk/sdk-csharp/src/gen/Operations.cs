using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Phaseo.Gen;

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

	public static Task<Dictionary<string, object>?> CancelBatchAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/" + (path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "") + "/cancel";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CancelBatchAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/" + (path != null && path.ContainsKey("id") ? path["id"] : "") + "/cancel";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CancelVideoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/cancel";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CancelVideoAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/cancel";
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

	public static Task<Dictionary<string, object>?> CreateApiKeyAsync(
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

	public static Task<Dictionary<string, object>?> CreateInteractionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/interactions";
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

	public static Task<Dictionary<string, object>?> CreateRerankAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/rerank";
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

	public static Task<Dictionary<string, object>?> CreateVideoDownloadUrlAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/download_url";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateVideoDownloadUrlAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + (path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/download_url";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteApiKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
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

	public static Task<Dictionary<string, object>?> DeleteWorkspaceAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
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

	public static Task<Dictionary<string, object>?> GetActivityAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/analytics";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetApiKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
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

	public static Task<Dictionary<string, object>?> GetCurrentApiKeyAsync(
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

	public static Task<Dictionary<string, object>?> GetHealthAsync(
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

	public static Task<Dictionary<string, object>?> GetWorkspaceAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListApiKeysAsync(
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

	public static Task<Dictionary<string, object>?> ListBatchCapabilitiesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/capabilities";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchCapabilitiesAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/capabilities";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchesAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> ListBatchFilesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/files";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> ListBatchFilesAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/files";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchModelsAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchRequestsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/" + (path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "") + "/requests";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListBatchRequestsAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/" + (path != null && path.ContainsKey("id") ? path["id"] : "") + "/requests";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListDataModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
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

	public static Task<object?> ListFilesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
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

	public static Task<Dictionary<string, object>?> ListTeamModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/models/me";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListVideoModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListVideoModelsAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListVideosAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListVideosAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspacesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> OpenAsyncJobWebSocketAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/async/" + (path != null && path.ContainsKey("kind") ? path["kind"] : "") + "/" + (path != null && path.ContainsKey("id") ? path["id"] : "") + "/ws";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
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

	public static Task<Dictionary<string, object>?> RetrieveBatchFileAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveBatchFileAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> RetrieveBatchFileContentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<object?> RetrieveBatchFileContentAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
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

	public static Task<object?> RetrieveFileContentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files/" + (path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateApiKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + (path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UploadBatchFileAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/files";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UploadBatchFileAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/files";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
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
