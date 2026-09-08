using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Phaseo.Gen;

public static class Operations
{
	public static Task<Dictionary<string, object>?> AddGuardrailKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/keys/add";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> AddGuardrailMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members/add";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> AddWorkspaceMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members/add";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ApplyPresetUpstreamVersionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/upstream";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ApproveWorkspaceJoinRequestAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/join-requests/" + Uri.EscapeDataString(path != null && path.ContainsKey("request_id") ? path["request_id"] : "") + "/approve";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

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
		var resolvedPath = "/batches/" + Uri.EscapeDataString(path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "") + "/cancel";
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
		var resolvedPath = "/batch/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/cancel";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<object?> CancelVideoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/videos/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/cancel";
		return client.SendAsync<object>("POST", resolvedPath, query, headers, body);
	}

	public static Task<object?> CancelVideoAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/video/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/cancel";
		return client.SendAsync<object>("POST", resolvedPath, query, headers, body);
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

	public static Task<Dictionary<string, object>?> CreateDataContributionClassifierAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data-contribution/classifiers";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateDynamicRouteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes";
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

	public static Task<Dictionary<string, object>?> CreateGatewayFeedbackAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/feedback";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateGatewayObservabilityEventAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/events";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateGuardrailAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails";
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

	public static Task<Dictionary<string, object>?> CreateManagementKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management-keys";
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

	public static Task<Dictionary<string, object>?> CreateObservabilityDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/destinations";
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

	public static Task<Dictionary<string, object>?> CreateParseAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/parse";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreatePresetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreatePresetTestRunAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/preset-test-runs";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreatePrivateModelAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/private-models";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateProviderCredentialAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateRealtimeSessionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audio/realtime/sessions";
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
		var resolvedPath = "/videos/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/download_url";
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
		var resolvedPath = "/video/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/download_url";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWebhookEndpointAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints";
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

	public static Task<Dictionary<string, object>?> CreateWorkspaceBudgetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/budgets";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceDepartmentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceGroupMappingAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/group-mappings";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceInviteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/invites";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceNotificationDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/destinations";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> CreateWorkspaceScimTokenAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/scim/tokens";
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
		var resolvedPath = "/keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteDataContributionClassifierAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data-contribution/classifiers/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteDynamicRouteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteGuardrailAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteManagementKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management-keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + Uri.EscapeDataString(path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteObservabilityDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/destinations/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeletePresetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeletePrivateModelAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/private-models/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteProviderCredentialAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/videos/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
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
		var resolvedPath = "/video/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWebhookEndpointAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceBudgetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/budgets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceDepartmentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceDepartmentMemberAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments/" + Uri.EscapeDataString(path != null && path.ContainsKey("departmentId") ? path["departmentId"] : "") + "/members/" + Uri.EscapeDataString(path != null && path.ContainsKey("userId") ? path["userId"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceGroupMappingAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/group-mappings/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceInviteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/invites/" + Uri.EscapeDataString(path != null && path.ContainsKey("invite_id") ? path["invite_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeleteWorkspaceNotificationDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/destinations/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> DeployDynamicRouteVersionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/versions/" + Uri.EscapeDataString(path != null && path.ContainsKey("version") ? path["version"] : "") + "/deploy";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<string?> ExportAnalyticsCsvAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/analytics/export";
		return client.SendTextAsync("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> FinalizeRealtimeSessionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audio/realtime/sessions/" + Uri.EscapeDataString(path != null && path.ContainsKey("session_id") ? path["session_id"] : "") + "/finalize";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ForkPresetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/fork";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
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
		var resolvedPath = "/keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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

	public static Task<Dictionary<string, object>?> GetDataContributionSettingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data-contribution";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetDynamicRouteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetGatewayRequestLogAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/logs/" + Uri.EscapeDataString(path != null && path.ContainsKey("requestId") ? path["requestId"] : "");
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

	public static Task<Dictionary<string, object>?> GetGuardrailAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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

	public static Task<Dictionary<string, object>?> GetManagementKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management-keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/music/generate/" + Uri.EscapeDataString(path != null && path.ContainsKey("music_id") ? path["music_id"] : "");
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
		var resolvedPath = "/music/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("music_id") ? path["music_id"] : "");
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
		var resolvedPath = "/oauth-clients/" + Uri.EscapeDataString(path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetObservabilityDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/destinations/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetObservabilityLoggingPolicyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/logging-policy";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetPresetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetPresetPublisherAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/publisher";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetPresetTestRunAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/preset-test-runs/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetPrivateModelAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/private-models/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetProviderCredentialAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/health/providers/" + Uri.EscapeDataString(path != null && path.ContainsKey("provider_id") ? path["provider_id"] : "") + "/derank";
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
		var resolvedPath = "/videos/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
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
		var resolvedPath = "/video/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "");
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
		var resolvedPath = "/videos/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/content";
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
		var resolvedPath = "/video/generations/" + Uri.EscapeDataString(path != null && path.ContainsKey("video_id") ? path["video_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWebhookEndpointAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceBudgetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/budgets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceDirectoryAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/directory";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceNotificationSettingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/settings";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceScimAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/scim";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceSettingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/settings";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> GetWorkspaceSsoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/sso";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> InvalidateApiKeyCacheAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/invalidate";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
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
		var resolvedPath = "/batches/" + Uri.EscapeDataString(path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "") + "/requests";
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
		var resolvedPath = "/batch/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/requests";
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

	public static Task<Dictionary<string, object>?> ListDynamicRoutesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes";
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

	public static Task<Dictionary<string, object>?> ListGatewayFeedbackAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/feedback";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListGatewayObservabilityEventsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/events";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListGatewayRequestLogsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/logs";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListGuardrailKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/keys";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListGuardrailMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListGuardrailsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListManagementKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management-keys";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListModelEndpointsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/models/" + Uri.EscapeDataString(path != null && path.ContainsKey("author") ? path["author"] : "") + "/" + Uri.EscapeDataString(path != null && path.ContainsKey("slug") ? path["slug"] : "") + "/endpoints";
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

	public static Task<Dictionary<string, object>?> ListObservabilityDestinationsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/destinations";
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

	public static Task<Dictionary<string, object>?> ListPresetsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListPresetTestRunsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/preset-test-runs";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListPresetVersionsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/versions";
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

	public static Task<Dictionary<string, object>?> ListPrivateModelsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/private-models";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListProviderCredentialsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok";
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

	public static Task<Dictionary<string, object>?> ListWebhookEndpointsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceAppsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/apps";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceAuditEventsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/audit-events";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceBudgetsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/budgets";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceDepartmentsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceGroupMappingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/group-mappings";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceInvitesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/invites";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceJoinRequestsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/join-requests";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceNotificationDestinationsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/destinations";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ListWorkspaceNotificationRoutesAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/routes";
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

	public static Task<Dictionary<string, object>?> ListWorkspaceScimAuditEventsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/scim/audit";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> MergeWorkspaceAppAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/apps/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/merge";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> PublishPresetVersionAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/versions";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RegenerateOAuthClientSecretAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + Uri.EscapeDataString(path != null && path.ContainsKey("client_id") ? path["client_id"] : "") + "/regenerate-secret";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RejectWorkspaceJoinRequestAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/join-requests/" + Uri.EscapeDataString(path != null && path.ContainsKey("request_id") ? path["request_id"] : "") + "/reject";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RemoveGuardrailKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/keys/remove";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RemoveGuardrailMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members/remove";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RemoveWorkspaceMembersAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members/remove";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ReorderProviderCredentialsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok/reorder";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ReplaceDynamicRouteKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/keys";
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> ReplaceGuardrailKeysAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/keys";
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveBatchAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/" + Uri.EscapeDataString(path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "");
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
		var resolvedPath = "/batch/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/batches/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
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
		var resolvedPath = "/batch/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
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
		var resolvedPath = "/batches/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
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
		var resolvedPath = "/batch/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<string?> RetrieveBatchResultsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batches/" + Uri.EscapeDataString(path != null && path.ContainsKey("batch_id") ? path["batch_id"] : "") + "/results";
		return client.SendTextAsync("GET", resolvedPath, query, headers, body);
	}

	public static Task<string?> RetrieveBatchResultsAliasAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/batch/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/results";
		return client.SendTextAsync("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RetrieveFileAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "");
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
		var resolvedPath = "/files/" + Uri.EscapeDataString(path != null && path.ContainsKey("file_id") ? path["file_id"] : "") + "/content";
		return client.SendAsync<object>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RevokeWorkspaceScimTokenAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/scim/tokens/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("DELETE", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RotateApiKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/rotate";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> RotateWebhookEndpointSecretAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/rotate-secret";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> SetWorkspaceDepartmentMemberAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments/" + Uri.EscapeDataString(path != null && path.ContainsKey("departmentId") ? path["departmentId"] : "") + "/members/" + Uri.EscapeDataString(path != null && path.ContainsKey("userId") ? path["userId"] : "");
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> SummarizeGatewayFeedbackAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/feedback/summary";
		return client.SendAsync<Dictionary<string, object>>("GET", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> TestWorkspaceNotificationDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/destinations/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/test";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> TestWorkspaceNotificationDestinationConfigAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/destinations/test";
		return client.SendAsync<Dictionary<string, object>>("POST", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateApiKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateDataContributionClassifierAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data-contribution/classifiers/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateDataContributionConsentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/data-contribution/consent";
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateDynamicRouteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/routing/dynamic-routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateGuardrailAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/guardrails/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateManagementKeyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/management-keys/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateOAuthClientAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/oauth-clients/" + Uri.EscapeDataString(path != null && path.ContainsKey("client_id") ? path["client_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateObservabilityDestinationAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/destinations/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateObservabilityLoggingPolicyAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/observability/logging-policy";
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdatePresetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdatePresetPublisherAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/presets/publisher";
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdatePresetTestRunAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/preset-test-runs/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdatePrivateModelAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/private-models/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateProviderCredentialAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/byok/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWebhookEndpointAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/webhook-endpoints/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
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
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceAppAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/apps/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceBudgetAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/budgets/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceDepartmentAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/departments/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceDirectoryMemberAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/directory/members/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceGroupMappingAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/group-mappings/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceMemberRoleAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/workspaces/" + Uri.EscapeDataString(path != null && path.ContainsKey("id") ? path["id"] : "") + "/members/" + Uri.EscapeDataString(path != null && path.ContainsKey("user_id") ? path["user_id"] : "");
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceNotificationRouteAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/routes/" + Uri.EscapeDataString(path != null && path.ContainsKey("eventKind") ? path["eventKind"] : "");
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceNotificationSettingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/notifications/settings";
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceScimAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/scim";
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceSettingsAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/settings";
		return client.SendAsync<Dictionary<string, object>>("PATCH", resolvedPath, query, headers, body);
	}

	public static Task<Dictionary<string, object>?> UpdateWorkspaceSsoAsync(
		Client client,
		Dictionary<string, string>? path = null,
		Dictionary<string, string>? query = null,
		Dictionary<string, string>? headers = null,
		object? body = null
	)
	{
		var resolvedPath = "/identity/sso";
		return client.SendAsync<Dictionary<string, object>>("PUT", resolvedPath, query, headers, body);
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
