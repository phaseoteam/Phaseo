using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace AiStats.Gen;

public static class Operations
{
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

	public static Task<Dictionary<string, object>?> GetGenerationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/generation";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> HealthzAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/healthz";
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

	public static Task<Dictionary<string, object>?> RootAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
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
