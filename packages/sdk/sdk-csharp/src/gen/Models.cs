using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Phaseo.Gen;

public sealed class ActivityEntry
{
	[JsonPropertyName("byok_usage_inference")]
	public double ByokUsageInference { get; set; }

	[JsonPropertyName("completion_tokens")]
	public long CompletionTokens { get; set; }

	[JsonPropertyName("date")]
	public string Date { get; set; }

	[JsonPropertyName("endpoint_id")]
	public string EndpointId { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("model_permaslug")]
	public string ModelPermaslug { get; set; }

	[JsonPropertyName("prompt_tokens")]
	public long PromptTokens { get; set; }

	[JsonPropertyName("provider_name")]
	public string ProviderName { get; set; }

	[JsonPropertyName("reasoning_tokens")]
	public long ReasoningTokens { get; set; }

	[JsonPropertyName("requests")]
	public long Requests { get; set; }

	[JsonPropertyName("usage")]
	public double Usage { get; set; }

}

public sealed class ActivityResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class AnalyticsAccessTokenRequiredResponse
{
	[JsonPropertyName("error")]
	public string Error { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class AnalyticsNotImplementedResponse
{
	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

}

public sealed class AnalyticsResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class AnthropicContentBlock
{
	[JsonPropertyName("cache_control")]
	public Dictionary<string, object>? CacheControl { get; set; }

	[JsonPropertyName("content")]
	public string? Content { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("input")]
	public Dictionary<string, object>? Input { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("source")]
	public Dictionary<string, object>? Source { get; set; }

	[JsonPropertyName("text")]
	public string? Text { get; set; }

	[JsonPropertyName("tool_use_id")]
	public string? ToolUseId { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

}

public sealed class AnthropicMessage
{
	[JsonPropertyName("content")]
	public object Content { get; set; }

	[JsonPropertyName("role")]
	public string Role { get; set; }

}

public sealed class AnthropicMessagesRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("max_tokens")]
	public long MaxTokens { get; set; }

	[JsonPropertyName("messages")]
	public List<Dictionary<string, object>> Messages { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("stop_sequences")]
	public List<string>? StopSequences { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("system")]
	public object? System { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<object>? Tools { get; set; }

	[JsonPropertyName("top_k")]
	public long? TopK { get; set; }

	[JsonPropertyName("top_p")]
	public double? TopP { get; set; }

	[JsonPropertyName("usage")]
	public bool? Usage { get; set; }

}

public sealed class AnthropicMessagesResponse
{
	[JsonPropertyName("content")]
	public List<Dictionary<string, object>>? Content { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("stop_reason")]
	public string? StopReason { get; set; }

	[JsonPropertyName("stop_sequence")]
	public string? StopSequence { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class AnthropicTool
{
	[JsonPropertyName("async")]
	public bool? Async { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("input_schema")]
	public Dictionary<string, object>? InputSchema { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

}

public sealed class AnthropicUsage
{
	[JsonPropertyName("input_tokens")]
	public long? InputTokens { get; set; }

	[JsonPropertyName("output_tokens")]
	public long? OutputTokens { get; set; }

}

public sealed class ApiKey
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("creator_user_id")]
	public string? CreatorUserId { get; set; }

	[JsonPropertyName("disabled")]
	public bool Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("hash")]
	public string Hash { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("include_byok_in_limit")]
	public bool IncludeByokInLimit { get; set; }

	[JsonPropertyName("label")]
	public string? Label { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("limit")]
	public double? Limit { get; set; }

	[JsonPropertyName("limit_remaining")]
	public double? LimitRemaining { get; set; }

	[JsonPropertyName("limit_reset")]
	public string? LimitReset { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object> Limits { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public object Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("usage")]
	public double Usage { get; set; }

	[JsonPropertyName("usage_daily")]
	public double UsageDaily { get; set; }

	[JsonPropertyName("usage_details")]
	public Dictionary<string, object> UsageDetails { get; set; }

	[JsonPropertyName("usage_monthly")]
	public double UsageMonthly { get; set; }

	[JsonPropertyName("usage_weekly")]
	public double UsageWeekly { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ApiKeyCreateRequest
{
	[JsonPropertyName("disabled")]
	public bool? Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("include_byok_in_limit")]
	public bool? IncludeByokInLimit { get; set; }

	[JsonPropertyName("limit")]
	public double? Limit { get; set; }

	[JsonPropertyName("limit_reset")]
	public string? LimitReset { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object>? Limits { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("workspace_id")]
	public string? WorkspaceId { get; set; }

}

public sealed class ApiKeyLimitBucket
{
	[JsonPropertyName("cost")]
	public double? Cost { get; set; }

	[JsonPropertyName("requests")]
	public long? Requests { get; set; }

}

public sealed class ApiKeyLimitInputBucket
{
	[JsonPropertyName("cost")]
	public double? Cost { get; set; }

	[JsonPropertyName("requests")]
	public long? Requests { get; set; }

}

public sealed class ApiKeyLimitInputWindows
{
	[JsonPropertyName("daily")]
	public Dictionary<string, object>? Daily { get; set; }

	[JsonPropertyName("monthly")]
	public Dictionary<string, object>? Monthly { get; set; }

	[JsonPropertyName("weekly")]
	public Dictionary<string, object>? Weekly { get; set; }

}

public sealed class ApiKeyLimitWindows
{
	[JsonPropertyName("daily")]
	public Dictionary<string, object> Daily { get; set; }

	[JsonPropertyName("monthly")]
	public Dictionary<string, object> Monthly { get; set; }

	[JsonPropertyName("weekly")]
	public Dictionary<string, object> Weekly { get; set; }

}

public sealed class ApiKeyListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class ApiKeyResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ApiKeyRotateRequest
{
	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("previous_key_expires_at")]
	public string? PreviousKeyExpiresAt { get; set; }

}

public sealed class ApiKeyRotateResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

	[JsonPropertyName("previous_key_expires_at")]
	public string? PreviousKeyExpiresAt { get; set; }

}

public sealed class ApiKeyScopeValue { }

public sealed class ApiKeyUpdateRequest
{
	[JsonPropertyName("disabled")]
	public bool? Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("include_byok_in_limit")]
	public bool? IncludeByokInLimit { get; set; }

	[JsonPropertyName("limit")]
	public double? Limit { get; set; }

	[JsonPropertyName("limit_reset")]
	public string? LimitReset { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object>? Limits { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

}

public sealed class ApiKeyUsageBucket
{
	[JsonPropertyName("cost")]
	public double Cost { get; set; }

	[JsonPropertyName("requests")]
	public long Requests { get; set; }

}

public sealed class ApiKeyUsageWindows
{
	[JsonPropertyName("daily")]
	public Dictionary<string, object> Daily { get; set; }

	[JsonPropertyName("monthly")]
	public Dictionary<string, object> Monthly { get; set; }

	[JsonPropertyName("total")]
	public Dictionary<string, object> Total { get; set; }

	[JsonPropertyName("weekly")]
	public Dictionary<string, object> Weekly { get; set; }

}

public sealed class ApiKeyWithValue
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("creator_user_id")]
	public string? CreatorUserId { get; set; }

	[JsonPropertyName("disabled")]
	public bool Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("hash")]
	public string Hash { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("include_byok_in_limit")]
	public bool IncludeByokInLimit { get; set; }

	[JsonPropertyName("key")]
	public string Key { get; set; }

	[JsonPropertyName("label")]
	public string? Label { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("limit")]
	public double? Limit { get; set; }

	[JsonPropertyName("limit_remaining")]
	public double? LimitRemaining { get; set; }

	[JsonPropertyName("limit_reset")]
	public string? LimitReset { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object> Limits { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public object Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("usage")]
	public double Usage { get; set; }

	[JsonPropertyName("usage_daily")]
	public double UsageDaily { get; set; }

	[JsonPropertyName("usage_details")]
	public Dictionary<string, object> UsageDetails { get; set; }

	[JsonPropertyName("usage_monthly")]
	public double UsageMonthly { get; set; }

	[JsonPropertyName("usage_weekly")]
	public double UsageWeekly { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ApiKeyWithValueResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class AsyncJobWebSocketClientEvent
{
	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class AsyncJobWebSocketServerEvent
{
	[JsonPropertyName("data")]
	public object? Data { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class AsyncJobWebSocketUpgradeRequiredResponse
{
	[JsonPropertyName("error")]
	public Dictionary<string, object>? Error { get; set; }

}

public sealed class AsyncWebhookDeliveryAttempt
{
	[JsonPropertyName("attempt_number")]
	public long? AttemptNumber { get; set; }

	[JsonPropertyName("delivered_at")]
	public string? DeliveredAt { get; set; }

	[JsonPropertyName("delivery_key")]
	public string? DeliveryKey { get; set; }

	[JsonPropertyName("error_message")]
	public string? ErrorMessage { get; set; }

	[JsonPropertyName("event_type")]
	public string? EventType { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("max_attempts")]
	public long? MaxAttempts { get; set; }

	[JsonPropertyName("next_retry_at")]
	public string? NextRetryAt { get; set; }

	[JsonPropertyName("response_body_preview")]
	public string? ResponseBodyPreview { get; set; }

	[JsonPropertyName("response_status")]
	public long? ResponseStatus { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("tried_at")]
	public string? TriedAt { get; set; }

}

public sealed class AsyncWebhookDeliverySummary
{
	[JsonPropertyName("delivered_event_types")]
	public List<string>? DeliveredEventTypes { get; set; }

	[JsonPropertyName("delivered_events")]
	public long? DeliveredEvents { get; set; }

	[JsonPropertyName("last_attempt_at")]
	public string? LastAttemptAt { get; set; }

	[JsonPropertyName("last_attempt_status")]
	public string? LastAttemptStatus { get; set; }

	[JsonPropertyName("last_delivered_at")]
	public string? LastDeliveredAt { get; set; }

	[JsonPropertyName("last_error_message")]
	public string? LastErrorMessage { get; set; }

	[JsonPropertyName("last_failure_at")]
	public string? LastFailureAt { get; set; }

	[JsonPropertyName("last_response_status")]
	public long? LastResponseStatus { get; set; }

	[JsonPropertyName("next_retry_at")]
	public string? NextRetryAt { get; set; }

	[JsonPropertyName("pending_retries")]
	public long? PendingRetries { get; set; }

	[JsonPropertyName("total_attempts")]
	public long? TotalAttempts { get; set; }

}

public sealed class AsyncWebhookPublicState
{
	[JsonPropertyName("attempts")]
	public List<Dictionary<string, object>>? Attempts { get; set; }

	[JsonPropertyName("delivery")]
	public Dictionary<string, object>? Delivery { get; set; }

	[JsonPropertyName("events")]
	public List<string>? Events { get; set; }

	[JsonPropertyName("has_secret")]
	public bool? HasSecret { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class AudioContentPart
{
	[JsonPropertyName("input_audio")]
	public Dictionary<string, object> InputAudio { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class AudioSpeechRequest
{
	[JsonPropertyName("format")]
	public string? Format { get; set; }

	[JsonPropertyName("input")]
	public string Input { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("voice")]
	public string? Voice { get; set; }

}

public sealed class AudioTranscriptionRequest
{
	[JsonPropertyName("audio_b64")]
	public string? AudioB64 { get; set; }

	[JsonPropertyName("audio_url")]
	public string? AudioUrl { get; set; }

	[JsonPropertyName("chunking_strategy")]
	public object? ChunkingStrategy { get; set; }

	[JsonPropertyName("known_speaker_names")]
	public List<string>? KnownSpeakerNames { get; set; }

	[JsonPropertyName("known_speaker_references")]
	public List<string>? KnownSpeakerReferences { get; set; }

	[JsonPropertyName("language")]
	public string? Language { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

}

public sealed class AudioTranscriptionResponse
{
	[JsonPropertyName("text")]
	public string? Text { get; set; }

}

public sealed class AudioTranslationRequest
{
	[JsonPropertyName("audio_b64")]
	public string? AudioB64 { get; set; }

	[JsonPropertyName("audio_url")]
	public string? AudioUrl { get; set; }

	[JsonPropertyName("language")]
	public string? Language { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("prompt")]
	public string? Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

}

public sealed class AudioTranslationResponse
{
	[JsonPropertyName("text")]
	public string? Text { get; set; }

}

public sealed class BatchBillingSummary
{
	[JsonPropertyName("billed")]
	public bool? Billed { get; set; }

	[JsonPropertyName("charged")]
	public bool? Charged { get; set; }

	[JsonPropertyName("cost_nanos")]
	public long? CostNanos { get; set; }

	[JsonPropertyName("cost_usd")]
	public double? CostUsd { get; set; }

	[JsonPropertyName("currency")]
	public string? Currency { get; set; }

	[JsonPropertyName("estimated_nanos")]
	public long? EstimatedNanos { get; set; }

	[JsonPropertyName("estimated_provider_cost")]
	public string? EstimatedProviderCost { get; set; }

	[JsonPropertyName("estimated_user_cost")]
	public string? EstimatedUserCost { get; set; }

	[JsonPropertyName("estimation_sample_size")]
	public long? EstimationSampleSize { get; set; }

	[JsonPropertyName("estimation_total_rows")]
	public long? EstimationTotalRows { get; set; }

	[JsonPropertyName("estimation_truncated")]
	public bool? EstimationTruncated { get; set; }

	[JsonPropertyName("finalized_at")]
	public string? FinalizedAt { get; set; }

	[JsonPropertyName("pricing_breakdown")]
	public Dictionary<string, object>? PricingBreakdown { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

	[JsonPropertyName("reservation_id")]
	public string? ReservationId { get; set; }

	[JsonPropertyName("reservation_status")]
	public string? ReservationStatus { get; set; }

	[JsonPropertyName("reserved_nanos")]
	public long? ReservedNanos { get; set; }

	[JsonPropertyName("settled_provider_cost")]
	public string? SettledProviderCost { get; set; }

	[JsonPropertyName("settled_user_cost")]
	public string? SettledUserCost { get; set; }

	[JsonPropertyName("state")]
	public string? State { get; set; }

	[JsonPropertyName("total_nanos")]
	public long? TotalNanos { get; set; }

}

public sealed class BatchListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("first_id")]
	public string? FirstId { get; set; }

	[JsonPropertyName("has_more")]
	public bool? HasMore { get; set; }

	[JsonPropertyName("last_id")]
	public string? LastId { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class BatchModelCapability
{
	[JsonPropertyName("input_types")]
	public List<string>? InputTypes { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("output_types")]
	public List<string>? OutputTypes { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object>? Pricing { get; set; }

	[JsonPropertyName("providers")]
	public List<Dictionary<string, object>>? Providers { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("supported_parameters")]
	public List<string>? SupportedParameters { get; set; }

	[JsonPropertyName("supported_parameters_detail")]
	public Dictionary<string, object>? SupportedParametersDetail { get; set; }

	[JsonPropertyName("supported_params")]
	public List<string>? SupportedParams { get; set; }

	[JsonPropertyName("supported_params_detail")]
	public Dictionary<string, object>? SupportedParamsDetail { get; set; }

}

public sealed class BatchModelProviderCapability
{
	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("supported_parameters")]
	public List<string>? SupportedParameters { get; set; }

	[JsonPropertyName("supported_parameters_detail")]
	public Dictionary<string, object>? SupportedParametersDetail { get; set; }

	[JsonPropertyName("supported_params")]
	public List<string>? SupportedParams { get; set; }

	[JsonPropertyName("supported_params_detail")]
	public Dictionary<string, object>? SupportedParamsDetail { get; set; }

}

public sealed class BatchModelsResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class BatchProviderCapability
{
	[JsonPropertyName("documentation_url")]
	public string? DocumentationUrl { get; set; }

	[JsonPropertyName("endpoints")]
	public List<Dictionary<string, object>>? Endpoints { get; set; }

	[JsonPropertyName("gateway_input_modes")]
	public List<string>? GatewayInputModes { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("native_input_modes")]
	public List<string>? NativeInputModes { get; set; }

	[JsonPropertyName("notes")]
	public string? Notes { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class BatchRequest
{
	[JsonPropertyName("completion_window")]
	public string? CompletionWindow { get; set; }

	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("input_file_id")]
	public string? InputFileId { get; set; }

	[JsonPropertyName("items")]
	public List<Dictionary<string, object>>? Items { get; set; }

	[JsonPropertyName("max_tokens")]
	public long? MaxTokens { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("prompts")]
	public List<string>? Prompts { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("requests")]
	public List<Dictionary<string, object>>? Requests { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("system")]
	public string? System { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

	[JsonPropertyName("webhook_endpoint_id")]
	public string? WebhookEndpointId { get; set; }

}

public sealed class BatchRequestCounts
{
	[JsonPropertyName("completed")]
	public long? Completed { get; set; }

	[JsonPropertyName("failed")]
	public long? Failed { get; set; }

	[JsonPropertyName("total")]
	public long? Total { get; set; }

}

public sealed class BatchRequestItem
{
	[JsonPropertyName("body")]
	public Dictionary<string, object> Body { get; set; }

	[JsonPropertyName("custom_id")]
	public string? CustomId { get; set; }

	[JsonPropertyName("method")]
	public string? Method { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class BatchRequestRow
{
	[JsonPropertyName("completed_at")]
	public string? CompletedAt { get; set; }

	[JsonPropertyName("cost_nanos")]
	public long? CostNanos { get; set; }

	[JsonPropertyName("cost_usd")]
	public double? CostUsd { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("custom_id")]
	public string? CustomId { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("error_body")]
	public Dictionary<string, object>? ErrorBody { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("meta")]
	public Dictionary<string, object>? Meta { get; set; }

	[JsonPropertyName("method")]
	public string? Method { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("native_batch_id")]
	public string? NativeBatchId { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_body_hash")]
	public string? RequestBodyHash { get; set; }

	[JsonPropertyName("request_index")]
	public long? RequestIndex { get; set; }

	[JsonPropertyName("response_body")]
	public Dictionary<string, object>? ResponseBody { get; set; }

	[JsonPropertyName("response_status")]
	public long? ResponseStatus { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class BatchResponse
{
	[JsonPropertyName("billing")]
	public Dictionary<string, object>? Billing { get; set; }

	[JsonPropertyName("cancel_url")]
	public string? CancelUrl { get; set; }

	[JsonPropertyName("cancelled_at")]
	public long? CancelledAt { get; set; }

	[JsonPropertyName("cancelling_at")]
	public long? CancellingAt { get; set; }

	[JsonPropertyName("completed_at")]
	public long? CompletedAt { get; set; }

	[JsonPropertyName("completion_window")]
	public string? CompletionWindow { get; set; }

	[JsonPropertyName("created_at")]
	public long? CreatedAt { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("error_file_id")]
	public string? ErrorFileId { get; set; }

	[JsonPropertyName("errors")]
	public Dictionary<string, object>? Errors { get; set; }

	[JsonPropertyName("expired_at")]
	public long? ExpiredAt { get; set; }

	[JsonPropertyName("expires_at")]
	public long? ExpiresAt { get; set; }

	[JsonPropertyName("failed_at")]
	public long? FailedAt { get; set; }

	[JsonPropertyName("finalized_at")]
	public string? FinalizedAt { get; set; }

	[JsonPropertyName("finalizing_at")]
	public long? FinalizingAt { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("in_progress_at")]
	public long? InProgressAt { get; set; }

	[JsonPropertyName("input_file_id")]
	public string? InputFileId { get; set; }

	[JsonPropertyName("last_webhook_dispatched_at")]
	public string? LastWebhookDispatchedAt { get; set; }

	[JsonPropertyName("last_webhook_progress")]
	public double? LastWebhookProgress { get; set; }

	[JsonPropertyName("last_webhook_progress_at")]
	public string? LastWebhookProgressAt { get; set; }

	[JsonPropertyName("lifecycle_status")]
	public string? LifecycleStatus { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("native_batch_id")]
	public string? NativeBatchId { get; set; }

	[JsonPropertyName("next_webhook_retry_at")]
	public string? NextWebhookRetryAt { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output_file_id")]
	public string? OutputFileId { get; set; }

	[JsonPropertyName("polling_url")]
	public string? PollingUrl { get; set; }

	[JsonPropertyName("pricing_lines")]
	public List<Dictionary<string, object>>? PricingLines { get; set; }

	[JsonPropertyName("progress")]
	public long? Progress { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_counts")]
	public Dictionary<string, object>? RequestCounts { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("results_url")]
	public string? ResultsUrl { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

	[JsonPropertyName("websocket_url")]
	public string? WebsocketUrl { get; set; }

}

public sealed class BenchmarkId { }

public sealed class CacheControl
{
	[JsonPropertyName("scope")]
	public string? Scope { get; set; }

	[JsonPropertyName("ttl")]
	public string? Ttl { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

}

public sealed class ChatAudioOutputPart
{
	[JsonPropertyName("audio_url")]
	public Dictionary<string, object> AudioUrl { get; set; }

	[JsonPropertyName("format")]
	public string? Format { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ChatChoice
{
	[JsonPropertyName("finish_reason")]
	public string? FinishReason { get; set; }

	[JsonPropertyName("index")]
	public long? Index { get; set; }

	[JsonPropertyName("message")]
	public Dictionary<string, object>? Message { get; set; }

}

public sealed class ChatCompletionsRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("frequency_penalty")]
	public double? FrequencyPenalty { get; set; }

	[JsonPropertyName("image_config")]
	public Dictionary<string, object>? ImageConfig { get; set; }

	[JsonPropertyName("logit_bias")]
	public Dictionary<string, object>? LogitBias { get; set; }

	[JsonPropertyName("logprobs")]
	public bool? Logprobs { get; set; }

	[JsonPropertyName("max_completion_tokens")]
	public long? MaxCompletionTokens { get; set; }

	[JsonPropertyName("max_tokens")]
	public long? MaxTokens { get; set; }

	[JsonPropertyName("max_tool_calls")]
	public long? MaxToolCalls { get; set; }

	[JsonPropertyName("messages")]
	public List<Dictionary<string, object>> Messages { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("modalities")]
	public List<string>? Modalities { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("parallel_tool_calls")]
	public bool? ParallelToolCalls { get; set; }

	[JsonPropertyName("presence_penalty")]
	public double? PresencePenalty { get; set; }

	[JsonPropertyName("prompt_cache_key")]
	public string? PromptCacheKey { get; set; }

	[JsonPropertyName("provider")]
	public object? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("reasoning_effort")]
	public string? ReasoningEffort { get; set; }

	[JsonPropertyName("response_format")]
	public object? ResponseFormat { get; set; }

	[JsonPropertyName("safety_identifier")]
	public string? SafetyIdentifier { get; set; }

	[JsonPropertyName("seed")]
	public long? Seed { get; set; }

	[JsonPropertyName("service_tier")]
	public string? ServiceTier { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("stop")]
	public object? Stop { get; set; }

	[JsonPropertyName("store")]
	public bool? Store { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("stream_options")]
	public Dictionary<string, object>? StreamOptions { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<object>? Tools { get; set; }

	[JsonPropertyName("top_logprobs")]
	public long? TopLogprobs { get; set; }

	[JsonPropertyName("top_p")]
	public double? TopP { get; set; }

	[JsonPropertyName("usage")]
	public bool? Usage { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

	[JsonPropertyName("user_id")]
	public string? UserId { get; set; }

}

public sealed class ChatCompletionsResponse
{
	[JsonPropertyName("choices")]
	public List<Dictionary<string, object>>? Choices { get; set; }

	[JsonPropertyName("created")]
	public long? Created { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("nativeResponseId")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class ChatImageOutputPart
{
	[JsonPropertyName("image_url")]
	public Dictionary<string, object> ImageUrl { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ChatMessage
{
	[JsonPropertyName("audios")]
	public List<Dictionary<string, object>>? Audios { get; set; }

	[JsonPropertyName("content")]
	public object? Content { get; set; }

	[JsonPropertyName("images")]
	public List<Dictionary<string, object>>? Images { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("role")]
	public string Role { get; set; }

	[JsonPropertyName("tool_call_id")]
	public string? ToolCallId { get; set; }

	[JsonPropertyName("tool_calls")]
	public List<Dictionary<string, object>>? ToolCalls { get; set; }

}

public sealed class CreditsResponse
{
	[JsonPropertyName("credits")]
	public Dictionary<string, object> Credits { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class DataContributionCategories
{
}

public sealed class DataContributionClassifier
{
	[JsonPropertyName("categories")]
	public Dictionary<string, object> Categories { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("instructions")]
	public string Instructions { get; set; }

	[JsonPropertyName("kind")]
	public string Kind { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("sample_rate_bps")]
	public long SampleRateBps { get; set; }

	[JsonPropertyName("service_tier")]
	public string ServiceTier { get; set; }

	[JsonPropertyName("slug")]
	public string Slug { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class DataContributionClassifierCreateRequest
{
	[JsonPropertyName("categories")]
	public Dictionary<string, object> Categories { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("instructions")]
	public string Instructions { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("sampleRateBps")]
	public long? SampleRateBps { get; set; }

	[JsonPropertyName("serviceTier")]
	public string? ServiceTier { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

}

public sealed class DataContributionClassifierDeleteResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DataContributionClassifierInput
{
	[JsonPropertyName("categories")]
	public Dictionary<string, object>? Categories { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("instructions")]
	public string? Instructions { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("sampleRateBps")]
	public long? SampleRateBps { get; set; }

	[JsonPropertyName("serviceTier")]
	public string? ServiceTier { get; set; }

}

public sealed class DataContributionClassifierResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DataContributionClassifierUpdateRequest
{
	[JsonPropertyName("categories")]
	public Dictionary<string, object>? Categories { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("instructions")]
	public string? Instructions { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("sampleRateBps")]
	public long? SampleRateBps { get; set; }

	[JsonPropertyName("serviceTier")]
	public string? ServiceTier { get; set; }

}

public sealed class DataContributionConsentRequest
{
	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

}

public sealed class DataContributionConsentResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DataContributionOverviewResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DataModel
{
	[JsonPropertyName("deprecation_date")]
	public string? DeprecationDate { get; set; }

	[JsonPropertyName("hidden")]
	public bool? Hidden { get; set; }

	[JsonPropertyName("input_types")]
	public List<string>? InputTypes { get; set; }

	[JsonPropertyName("lifecycle")]
	public ModelLifecycle? Lifecycle { get; set; }

	[JsonPropertyName("model_id")]
	public string? ModelId { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("organisation")]
	public Dictionary<string, object>? Organisation { get; set; }

	[JsonPropertyName("output_types")]
	public List<string>? OutputTypes { get; set; }

	[JsonPropertyName("release_date")]
	public string? ReleaseDate { get; set; }

	[JsonPropertyName("retirement_date")]
	public string? RetirementDate { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class DataModelOrganisation { }

public sealed class DebugOptions
{
	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("return_upstream_request")]
	public bool? ReturnUpstreamRequest { get; set; }

	[JsonPropertyName("return_upstream_response")]
	public bool? ReturnUpstreamResponse { get; set; }

	[JsonPropertyName("trace")]
	public bool? Trace { get; set; }

	[JsonPropertyName("trace_level")]
	public string? TraceLevel { get; set; }

}

public sealed class DeletedResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

}

public sealed class DynamicRoute
{
	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("deployed_version")]
	public long? DeployedVersion { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("key_ids")]
	public List<string> KeyIds { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string Slug { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("version")]
	public long Version { get; set; }

	[JsonPropertyName("versions")]
	public List<Dictionary<string, object>> Versions { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class DynamicRouteAction
{
	[JsonPropertyName("allowFallbacks")]
	public bool? AllowFallbacks { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("modelFallbacks")]
	public List<string>? ModelFallbacks { get; set; }

	[JsonPropertyName("providerIgnore")]
	public List<string>? ProviderIgnore { get; set; }

	[JsonPropertyName("providerOnly")]
	public List<string>? ProviderOnly { get; set; }

	[JsonPropertyName("providerOrder")]
	public List<string>? ProviderOrder { get; set; }

	[JsonPropertyName("routingMode")]
	public string? RoutingMode { get; set; }

}

public sealed class DynamicRouteCondition
{
	[JsonPropertyName("field")]
	public string Field { get; set; }

	[JsonPropertyName("metadataKey")]
	public string? MetadataKey { get; set; }

	[JsonPropertyName("operator")]
	public string Operator { get; set; }

	[JsonPropertyName("value")]
	public string? Value { get; set; }

}

public sealed class DynamicRouteConfig
{
	[JsonPropertyName("cacheAwareRouting")]
	public bool? CacheAwareRouting { get; set; }

	[JsonPropertyName("defaultAction")]
	public Dictionary<string, object>? DefaultAction { get; set; }

	[JsonPropertyName("edges")]
	public List<Dictionary<string, object>>? Edges { get; set; }

	[JsonPropertyName("entryNodeId")]
	public string? EntryNodeId { get; set; }

	[JsonPropertyName("nodes")]
	public List<Dictionary<string, object>>? Nodes { get; set; }

	[JsonPropertyName("rules")]
	public List<Dictionary<string, object>>? Rules { get; set; }

	[JsonPropertyName("schemaVersion")]
	public string? SchemaVersion { get; set; }

	[JsonPropertyName("sessionAffinity")]
	public bool? SessionAffinity { get; set; }

}

public sealed class DynamicRouteCreateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class DynamicRouteDeleteResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DynamicRouteDeployResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DynamicRouteEdge
{
	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("source")]
	public string Source { get; set; }

	[JsonPropertyName("sourceHandle")]
	public string? SourceHandle { get; set; }

	[JsonPropertyName("target")]
	public string Target { get; set; }

}

public sealed class DynamicRouteKeysResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DynamicRouteKeysUpdateRequest
{
	[JsonPropertyName("key_ids")]
	public List<string> KeyIds { get; set; }

}

public sealed class DynamicRouteListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class DynamicRouteNode
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("position")]
	public Dictionary<string, object>? Position { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class DynamicRouteResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class DynamicRouteRule
{
	[JsonPropertyName("action")]
	public Dictionary<string, object> Action { get; set; }

	[JsonPropertyName("condition")]
	public Dictionary<string, object> Condition { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

}

public sealed class DynamicRouteUpdateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object>? Config { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class DynamicRouteVersion
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("version")]
	public long Version { get; set; }

}

public sealed class Embedding
{
	[JsonPropertyName("embedding")]
	public List<double>? EmbeddingValue { get; set; }

	[JsonPropertyName("index")]
	public long? Index { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class EmbeddingsMultimodalInput
{
	[JsonPropertyName("content")]
	public List<object> Content { get; set; }

}

public sealed class EmbeddingsRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("dimensions")]
	public long? Dimensions { get; set; }

	[JsonPropertyName("encoding_format")]
	public string? EncodingFormat { get; set; }

	[JsonPropertyName("input")]
	public object Input { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

}

public sealed class EmbeddingsResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class EndpointCatalogueEntry
{
	[JsonPropertyName("capability_id")]
	public string CapabilityId { get; set; }

	[JsonPropertyName("collection")]
	public string Collection { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("model_count")]
	public long ModelCount { get; set; }

	[JsonPropertyName("provider_count")]
	public long ProviderCount { get; set; }

	[JsonPropertyName("public_path")]
	public string PublicPath { get; set; }

}

public sealed class EndpointCatalogueResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("endpoints")]
	public List<string> Endpoints { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("sample_models")]
	public List<string> SampleModels { get; set; }

}

public sealed class ErrorFailureSampleItem
{
	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("retryable")]
	public bool? Retryable { get; set; }

	[JsonPropertyName("status")]
	public long? Status { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

	[JsonPropertyName("upstream_error_code")]
	public string? UpstreamErrorCode { get; set; }

	[JsonPropertyName("upstream_error_description")]
	public string? UpstreamErrorDescription { get; set; }

	[JsonPropertyName("upstream_error_message")]
	public string? UpstreamErrorMessage { get; set; }

	[JsonPropertyName("upstream_error_param")]
	public string? UpstreamErrorParam { get; set; }

	[JsonPropertyName("upstream_payload_preview")]
	public string? UpstreamPayloadPreview { get; set; }

}

public sealed class ErrorProviderCandidateDiagnostics
{
	[JsonPropertyName("candidateCount")]
	public long? CandidateCount { get; set; }

	[JsonPropertyName("droppedMissingAdapter")]
	public List<Dictionary<string, object>>? DroppedMissingAdapter { get; set; }

	[JsonPropertyName("droppedUnsupportedEndpoint")]
	public List<string>? DroppedUnsupportedEndpoint { get; set; }

	[JsonPropertyName("supportsEndpointCount")]
	public long? SupportsEndpointCount { get; set; }

	[JsonPropertyName("totalProviders")]
	public long? TotalProviders { get; set; }

}

public sealed class ErrorProviderEnablementDiagnostics
{
	[JsonPropertyName("capability")]
	public string? Capability { get; set; }

	[JsonPropertyName("dropped")]
	public List<Dictionary<string, object>>? Dropped { get; set; }

	[JsonPropertyName("providersAfter")]
	public List<string>? ProvidersAfter { get; set; }

	[JsonPropertyName("providersBefore")]
	public List<string>? ProvidersBefore { get; set; }

}

public sealed class ErrorProviderFailureDiagnostics
{
	[JsonPropertyName("category")]
	public string? Category { get; set; }

	[JsonPropertyName("hint")]
	public string? Hint { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

}

public sealed class ErrorResponse
{
	[JsonPropertyName("attempt_count")]
	public long? AttemptCount { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("details")]
	public List<Dictionary<string, object>>? Details { get; set; }

	[JsonPropertyName("error")]
	public object Error { get; set; }

	[JsonPropertyName("error_origin")]
	public string? ErrorOrigin { get; set; }

	[JsonPropertyName("error_type")]
	public string? ErrorType { get; set; }

	[JsonPropertyName("failed_providers")]
	public List<string>? FailedProviders { get; set; }

	[JsonPropertyName("failed_statuses")]
	public List<long>? FailedStatuses { get; set; }

	[JsonPropertyName("failure_sample")]
	public List<Dictionary<string, object>>? FailureSample { get; set; }

	[JsonPropertyName("generation_id")]
	public string? GenerationId { get; set; }

	[JsonPropertyName("message")]
	public string? Message { get; set; }

	[JsonPropertyName("missing_pricing_providers")]
	public List<string>? MissingPricingProviders { get; set; }

	[JsonPropertyName("ok")]
	public bool? Ok { get; set; }

	[JsonPropertyName("provider_candidate_diagnostics")]
	public Dictionary<string, object>? ProviderCandidateDiagnostics { get; set; }

	[JsonPropertyName("provider_enablement")]
	public Dictionary<string, object>? ProviderEnablement { get; set; }

	[JsonPropertyName("provider_failure_diagnostics")]
	public Dictionary<string, object>? ProviderFailureDiagnostics { get; set; }

	[JsonPropertyName("provider_payment_required_provider")]
	public string? ProviderPaymentRequiredProvider { get; set; }

	[JsonPropertyName("provider_payment_required_support_notice")]
	public string? ProviderPaymentRequiredSupportNotice { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

	[JsonPropertyName("routing_diagnostics")]
	public Dictionary<string, object>? RoutingDiagnostics { get; set; }

	[JsonPropertyName("status_code")]
	public long? StatusCode { get; set; }

	[JsonPropertyName("upstream_error")]
	public Dictionary<string, object>? UpstreamError { get; set; }

}

public sealed class ErrorRoutingDiagnostics
{
	[JsonPropertyName("filterStages")]
	public List<Dictionary<string, object>>? FilterStages { get; set; }

}

public sealed class ErrorUpstreamError
{
	[JsonPropertyName("code")]
	public string? Code { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("message")]
	public string? Message { get; set; }

	[JsonPropertyName("param")]
	public string? Param { get; set; }

}

public sealed class FileResponse
{
	[JsonPropertyName("bytes")]
	public long? Bytes { get; set; }

	[JsonPropertyName("created_at")]
	public long? CreatedAt { get; set; }

	[JsonPropertyName("filename")]
	public string? Filename { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("purpose")]
	public string? Purpose { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("status_details")]
	public Dictionary<string, object>? StatusDetails { get; set; }

}

public sealed class FileUploadRequest
{
	[JsonPropertyName("file")]
	public object File { get; set; }

	[JsonPropertyName("purpose")]
	public string Purpose { get; set; }

}

public sealed class FunctionToolDefinition
{
	[JsonPropertyName("async")]
	public bool? Async { get; set; }

	[JsonPropertyName("function")]
	public Dictionary<string, object> Function { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class FusionToolDefinition
{
	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayCapabilities
{
	[JsonPropertyName("endpoints")]
	public List<string>? Endpoints { get; set; }

	[JsonPropertyName("parameter_details")]
	public Dictionary<string, object> ParameterDetails { get; set; }

	[JsonPropertyName("parameters")]
	public List<string> Parameters { get; set; }

}

public sealed class GatewayCapabilityStatus { }

public sealed class GatewayDatetimeToolDefinition
{
	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("timezone")]
	public string? Timezone { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayFeedback
{
	[JsonPropertyName("comment")]
	public string? Comment { get; set; }

	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by_user_id")]
	public string? CreatedByUserId { get; set; }

	[JsonPropertyName("end_user_id")]
	public string? EndUserId { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object> Metadata { get; set; }

	[JsonPropertyName("metadata_dimensions")]
	public Dictionary<string, object> MetadataDimensions { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("rating")]
	public string? Rating { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

	[JsonPropertyName("reason_tags")]
	public List<string> ReasonTags { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("score")]
	public double? Score { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("source")]
	public string Source { get; set; }

	[JsonPropertyName("test_run_id")]
	public string? TestRunId { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class GatewayFeedbackCreateRequest
{
	[JsonPropertyName("comment")]
	public string? Comment { get; set; }

	[JsonPropertyName("end_user_id")]
	public string? EndUserId { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("metadata_dimensions")]
	public Dictionary<string, object>? MetadataDimensions { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("rating")]
	public string? Rating { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

	[JsonPropertyName("reason_tags")]
	public List<string>? ReasonTags { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("score")]
	public double? Score { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("source")]
	public string? Source { get; set; }

	[JsonPropertyName("test_run_id")]
	public string? TestRunId { get; set; }

}

public sealed class GatewayFeedbackListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class GatewayFeedbackResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class GatewayFeedbackSummaryResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("group_by")]
	public string GroupBy { get; set; }

}

public sealed class GatewayFeedbackSummaryRow
{
	[JsonPropertyName("average_score")]
	public double? AverageScore { get; set; }

	[JsonPropertyName("count")]
	public long Count { get; set; }

	[JsonPropertyName("last_feedback_at")]
	public string? LastFeedbackAt { get; set; }

	[JsonPropertyName("metadata_key")]
	public string? MetadataKey { get; set; }

	[JsonPropertyName("metadata_value")]
	public string? MetadataValue { get; set; }

	[JsonPropertyName("negative")]
	public long Negative { get; set; }

	[JsonPropertyName("partial")]
	public long Partial { get; set; }

	[JsonPropertyName("positive")]
	public long Positive { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("ratings")]
	public Dictionary<string, object> Ratings { get; set; }

	[JsonPropertyName("test_run_id")]
	public string? TestRunId { get; set; }

}

public sealed class GatewayModalities
{
	[JsonPropertyName("input")]
	public List<string> Input { get; set; }

	[JsonPropertyName("output")]
	public List<string> Output { get; set; }

}

public sealed class GatewayModelLifecycle
{
	[JsonPropertyName("deprecated_at")]
	public string? DeprecatedAt { get; set; }

	[JsonPropertyName("message")]
	public string? Message { get; set; }

	[JsonPropertyName("released_at")]
	public string? ReleasedAt { get; set; }

	[JsonPropertyName("replacement_id")]
	public string? ReplacementId { get; set; }

	[JsonPropertyName("retires_at")]
	public string? RetiresAt { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class GatewayModelLimits
{
	[JsonPropertyName("input_tokens")]
	public long? InputTokens { get; set; }

	[JsonPropertyName("output_tokens")]
	public long? OutputTokens { get; set; }

}

public sealed class GatewayModelOffer
{
	[JsonPropertyName("capabilities")]
	public Dictionary<string, object> Capabilities { get; set; }

	[JsonPropertyName("effective")]
	public Dictionary<string, object> Effective { get; set; }

	[JsonPropertyName("endpoints")]
	public List<string> Endpoints { get; set; }

	[JsonPropertyName("modalities")]
	public Dictionary<string, object> Modalities { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object> Pricing { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object> Provider { get; set; }

	[JsonPropertyName("routable")]
	public bool Routable { get; set; }

	[JsonPropertyName("routing")]
	public Dictionary<string, object> Routing { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("status_reason")]
	public string StatusReason { get; set; }

}

public sealed class GatewayModelOrganization { }

public sealed class GatewayModelsResponse
{
	[JsonPropertyName("availability_mode")]
	public string AvailabilityMode { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("models")]
	public List<Dictionary<string, object>> Models { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("total")]
	public long Total { get; set; }

}

public sealed class GatewayObservabilityEvent
{
	[JsonPropertyName("category")]
	public string Category { get; set; }

	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by_user_id")]
	public string? CreatedByUserId { get; set; }

	[JsonPropertyName("end_user_id")]
	public string? EndUserId { get; set; }

	[JsonPropertyName("event_name")]
	public string EventName { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object> Metadata { get; set; }

	[JsonPropertyName("metadata_dimensions")]
	public Dictionary<string, object> MetadataDimensions { get; set; }

	[JsonPropertyName("numeric_value")]
	public double? NumericValue { get; set; }

	[JsonPropertyName("occurred_at")]
	public string OccurredAt { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("source")]
	public string Source { get; set; }

	[JsonPropertyName("test_run_id")]
	public string? TestRunId { get; set; }

	[JsonPropertyName("value")]
	public object? Value { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class GatewayObservabilityEventCreateRequest
{
	[JsonPropertyName("category")]
	public string? Category { get; set; }

	[JsonPropertyName("end_user_id")]
	public string? EndUserId { get; set; }

	[JsonPropertyName("event_name")]
	public string EventName { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("metadata_dimensions")]
	public Dictionary<string, object>? MetadataDimensions { get; set; }

	[JsonPropertyName("numeric_value")]
	public double? NumericValue { get; set; }

	[JsonPropertyName("occurred_at")]
	public string? OccurredAt { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("source")]
	public string? Source { get; set; }

	[JsonPropertyName("test_run_id")]
	public string? TestRunId { get; set; }

	[JsonPropertyName("value")]
	public object? Value { get; set; }

}

public sealed class GatewayObservabilityEventListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class GatewayObservabilityEventResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class GatewayPricing
{
	[JsonPropertyName("meters")]
	public Dictionary<string, object> Meters { get; set; }

	[JsonPropertyName("pricing_plan")]
	public string PricingPlan { get; set; }

}

public sealed class GatewayPricingMeter { }

public sealed class GatewayProviderAvailabilityReason { }

public sealed class GatewayRequestLog
{
	[JsonPropertyName("auth_method")]
	public string? AuthMethod { get; set; }

	[JsonPropertyName("byok")]
	public bool? Byok { get; set; }

	[JsonPropertyName("canonical_model_id")]
	public string? CanonicalModelId { get; set; }

	[JsonPropertyName("cost_nanos")]
	public long? CostNanos { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("currency")]
	public string? Currency { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("error_code")]
	public string? ErrorCode { get; set; }

	[JsonPropertyName("finish_reason")]
	public string? FinishReason { get; set; }

	[JsonPropertyName("generation_ms")]
	public double? GenerationMs { get; set; }

	[JsonPropertyName("key_id")]
	public string? KeyId { get; set; }

	[JsonPropertyName("latency_ms")]
	public double? LatencyMs { get; set; }

	[JsonPropertyName("location")]
	public string? Location { get; set; }

	[JsonPropertyName("model_id")]
	public string? ModelId { get; set; }

	[JsonPropertyName("native_response_id")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("oauth_client_id")]
	public string? OauthClientId { get; set; }

	[JsonPropertyName("pricing_lines")]
	public List<Dictionary<string, object>>? PricingLines { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("requested_model_id")]
	public string? RequestedModelId { get; set; }

	[JsonPropertyName("routed_model_id")]
	public string? RoutedModelId { get; set; }

	[JsonPropertyName("status_code")]
	public long? StatusCode { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("success")]
	public bool? Success { get; set; }

	[JsonPropertyName("throughput")]
	public double? Throughput { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class GatewayRequestLogListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("from_time")]
	public string FromTime { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("to_time")]
	public string? ToTime { get; set; }

	[JsonPropertyName("total")]
	public long Total { get; set; }

}

public sealed class GatewayRequestLogResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class GatewayRoutingStatus { }

public sealed class GatewayWebFetchToolDefinition
{
	[JsonPropertyName("max_chars")]
	public long? MaxChars { get; set; }

	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayWebSearchToolDefinition
{
	[JsonPropertyName("engine")]
	public string? Engine { get; set; }

	[JsonPropertyName("include_highlights")]
	public bool? IncludeHighlights { get; set; }

	[JsonPropertyName("include_text")]
	public bool? IncludeText { get; set; }

	[JsonPropertyName("language")]
	public string? Language { get; set; }

	[JsonPropertyName("max_results")]
	public long? MaxResults { get; set; }

	[JsonPropertyName("page")]
	public long? Page { get; set; }

	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GenerationResponse
{
	[JsonPropertyName("app_id")]
	public string? AppId { get; set; }

	[JsonPropertyName("byok")]
	public bool? Byok { get; set; }

	[JsonPropertyName("cost_nanos")]
	public double? CostNanos { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("currency")]
	public string? Currency { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("error_code")]
	public string? ErrorCode { get; set; }

	[JsonPropertyName("error_message")]
	public string? ErrorMessage { get; set; }

	[JsonPropertyName("generation_ms")]
	public double? GenerationMs { get; set; }

	[JsonPropertyName("key_id")]
	public string? KeyId { get; set; }

	[JsonPropertyName("latency_ms")]
	public double? LatencyMs { get; set; }

	[JsonPropertyName("model_id")]
	public string? ModelId { get; set; }

	[JsonPropertyName("native_response_id")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("pricing_lines")]
	public List<Dictionary<string, object>>? PricingLines { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("replay_request")]
	public Dictionary<string, object>? ReplayRequest { get; set; }

	[JsonPropertyName("replay_supported")]
	public bool? ReplaySupported { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("status_code")]
	public double? StatusCode { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("success")]
	public bool? Success { get; set; }

	[JsonPropertyName("team_id")]
	public string? TeamId { get; set; }

	[JsonPropertyName("throughput")]
	public double? Throughput { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class Guardrail
{
	[JsonPropertyName("allowed_api_model_ids")]
	public List<string>? AllowedApiModelIds { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("daily_limit_cost_nanos")]
	public long? DailyLimitCostNanos { get; set; }

	[JsonPropertyName("daily_limit_requests")]
	public long? DailyLimitRequests { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("model_restriction_mode")]
	public string? ModelRestrictionMode { get; set; }

	[JsonPropertyName("monthly_limit_cost_nanos")]
	public long? MonthlyLimitCostNanos { get; set; }

	[JsonPropertyName("monthly_limit_requests")]
	public long? MonthlyLimitRequests { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_enable_free_may_publish_prompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacy_enable_free_may_train")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacy_enable_input_output_logging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacy_enable_paid_may_train")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacy_zdr_only")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("prompt_injection_action")]
	public string? PromptInjectionAction { get; set; }

	[JsonPropertyName("prompt_injection_enabled")]
	public bool? PromptInjectionEnabled { get; set; }

	[JsonPropertyName("provider_restriction_enforce_allowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("provider_restriction_mode")]
	public string? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("provider_restriction_provider_ids")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("sensitive_info_default_action")]
	public string? SensitiveInfoDefaultAction { get; set; }

	[JsonPropertyName("sensitive_info_enabled")]
	public bool? SensitiveInfoEnabled { get; set; }

	[JsonPropertyName("sensitive_info_rules")]
	public List<Dictionary<string, object>>? SensitiveInfoRules { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("weekly_limit_cost_nanos")]
	public long? WeeklyLimitCostNanos { get; set; }

	[JsonPropertyName("weekly_limit_requests")]
	public long? WeeklyLimitRequests { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class GuardrailBudgetInput
{
	[JsonPropertyName("dailyCostNanos")]
	public long? DailyCostNanos { get; set; }

	[JsonPropertyName("dailyRequests")]
	public long? DailyRequests { get; set; }

	[JsonPropertyName("monthlyCostNanos")]
	public long? MonthlyCostNanos { get; set; }

	[JsonPropertyName("monthlyRequests")]
	public long? MonthlyRequests { get; set; }

	[JsonPropertyName("weeklyCostNanos")]
	public long? WeeklyCostNanos { get; set; }

	[JsonPropertyName("weeklyRequests")]
	public long? WeeklyRequests { get; set; }

}

public sealed class GuardrailCreateRequest
{
	[JsonPropertyName("allowedApiModelIds")]
	public List<string>? AllowedApiModelIds { get; set; }

	[JsonPropertyName("budgets")]
	public Dictionary<string, object>? Budgets { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("modelRestrictionMode")]
	public string? ModelRestrictionMode { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacyEnableFreeMayPublishPrompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacyEnableFreeMayTrain")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacyEnableInputOutputLogging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacyEnablePaidMayTrain")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacyZdrOnly")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("promptInjectionAction")]
	public string? PromptInjectionAction { get; set; }

	[JsonPropertyName("promptInjectionEnabled")]
	public bool? PromptInjectionEnabled { get; set; }

	[JsonPropertyName("providerRestrictionEnforceAllowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("providerRestrictionMode")]
	public string? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("providerRestrictionProviderIds")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("sensitiveInfoDefaultAction")]
	public string? SensitiveInfoDefaultAction { get; set; }

	[JsonPropertyName("sensitiveInfoEnabled")]
	public bool? SensitiveInfoEnabled { get; set; }

	[JsonPropertyName("sensitiveInfoRules")]
	public List<Dictionary<string, object>>? SensitiveInfoRules { get; set; }

}

public sealed class GuardrailDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

}

public sealed class GuardrailDetailResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class GuardrailKeyAddResponse
{
	[JsonPropertyName("added_count")]
	public long AddedCount { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class GuardrailKeyAssignment
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("key_id")]
	public string KeyId { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class GuardrailKeyIdsReplaceRequest
{
	[JsonPropertyName("key_ids")]
	public List<string> KeyIds { get; set; }

}

public sealed class GuardrailKeyIdsRequest
{
	[JsonPropertyName("key_ids")]
	public List<string> KeyIds { get; set; }

}

public sealed class GuardrailKeyListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class GuardrailKeySetResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class GuardrailListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class GuardrailMemberAddResponse
{
	[JsonPropertyName("added_count")]
	public long AddedCount { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class GuardrailMemberAssignment
{
	[JsonPropertyName("display_name")]
	public string? DisplayName { get; set; }

	[JsonPropertyName("joined_at")]
	public string? JoinedAt { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("user_id")]
	public string UserId { get; set; }

}

public sealed class GuardrailMemberListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class GuardrailPolicyInput
{
	[JsonPropertyName("allowedApiModelIds")]
	public List<string>? AllowedApiModelIds { get; set; }

	[JsonPropertyName("budgets")]
	public Dictionary<string, object>? Budgets { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("modelRestrictionMode")]
	public string? ModelRestrictionMode { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacyEnableFreeMayPublishPrompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacyEnableFreeMayTrain")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacyEnableInputOutputLogging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacyEnablePaidMayTrain")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacyZdrOnly")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("promptInjectionAction")]
	public string? PromptInjectionAction { get; set; }

	[JsonPropertyName("promptInjectionEnabled")]
	public bool? PromptInjectionEnabled { get; set; }

	[JsonPropertyName("providerRestrictionEnforceAllowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("providerRestrictionMode")]
	public string? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("providerRestrictionProviderIds")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("sensitiveInfoDefaultAction")]
	public string? SensitiveInfoDefaultAction { get; set; }

	[JsonPropertyName("sensitiveInfoEnabled")]
	public bool? SensitiveInfoEnabled { get; set; }

	[JsonPropertyName("sensitiveInfoRules")]
	public List<Dictionary<string, object>>? SensitiveInfoRules { get; set; }

}

public sealed class GuardrailRemoveResponse
{
	[JsonPropertyName("removed_count")]
	public long RemovedCount { get; set; }

}

public sealed class GuardrailResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class GuardrailUpdateRequest
{
	[JsonPropertyName("allowedApiModelIds")]
	public List<string>? AllowedApiModelIds { get; set; }

	[JsonPropertyName("budgets")]
	public Dictionary<string, object>? Budgets { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("modelRestrictionMode")]
	public string? ModelRestrictionMode { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacyEnableFreeMayPublishPrompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacyEnableFreeMayTrain")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacyEnableInputOutputLogging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacyEnablePaidMayTrain")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacyZdrOnly")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("promptInjectionAction")]
	public string? PromptInjectionAction { get; set; }

	[JsonPropertyName("promptInjectionEnabled")]
	public bool? PromptInjectionEnabled { get; set; }

	[JsonPropertyName("providerRestrictionEnforceAllowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("providerRestrictionMode")]
	public string? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("providerRestrictionProviderIds")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("sensitiveInfoDefaultAction")]
	public string? SensitiveInfoDefaultAction { get; set; }

	[JsonPropertyName("sensitiveInfoEnabled")]
	public bool? SensitiveInfoEnabled { get; set; }

	[JsonPropertyName("sensitiveInfoRules")]
	public List<Dictionary<string, object>>? SensitiveInfoRules { get; set; }

}

public sealed class GuardrailUserIdsRequest
{
	[JsonPropertyName("user_ids")]
	public List<string> UserIds { get; set; }

}

public sealed class Image
{
	[JsonPropertyName("b64_json")]
	public string? B64Json { get; set; }

	[JsonPropertyName("revised_prompt")]
	public string? RevisedPrompt { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class ImageConfig
{
	[JsonPropertyName("aspect_ratio")]
	public string? AspectRatio { get; set; }

	[JsonPropertyName("font_inputs")]
	public List<Dictionary<string, object>>? FontInputs { get; set; }

	[JsonPropertyName("image_size")]
	public string? ImageSize { get; set; }

	[JsonPropertyName("include_rai_reason")]
	public bool? IncludeRaiReason { get; set; }

	[JsonPropertyName("reference_images")]
	public List<Dictionary<string, object>>? ReferenceImages { get; set; }

	[JsonPropertyName("super_resolution_references")]
	public List<string>? SuperResolutionReferences { get; set; }

}

public sealed class ImageContentPart
{
	[JsonPropertyName("image_url")]
	public Dictionary<string, object> ImageUrl { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ImageModerationInput
{
	[JsonPropertyName("image_url")]
	public Dictionary<string, object> ImageUrl { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ImagesEditRequest
{
	[JsonPropertyName("image")]
	public string Image { get; set; }

	[JsonPropertyName("mask")]
	public string? Mask { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("n")]
	public long? N { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("resolution")]
	public string? Resolution { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

	[JsonPropertyName("usage")]
	public bool? Usage { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

}

public sealed class ImagesEditResponse
{
	[JsonPropertyName("created")]
	public long? Created { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

}

public sealed class ImagesGenerationRequest
{
	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("n")]
	public long? N { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("quality")]
	public string? Quality { get; set; }

	[JsonPropertyName("resolution")]
	public string? Resolution { get; set; }

	[JsonPropertyName("response_format")]
	public string? ResponseFormat { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

	[JsonPropertyName("style")]
	public string? Style { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

}

public sealed class ImagesGenerationResponse
{
	[JsonPropertyName("created")]
	public long? Created { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

}

public sealed class InvalidRequestResponse
{
	[JsonPropertyName("error")]
	public string Error { get; set; }

	[JsonPropertyName("max_offset")]
	public long? MaxOffset { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class KeyInvalidateResponse
{
	[JsonPropertyName("key")]
	public Dictionary<string, object> Key { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class KnownModelId { }

public sealed class ListFilesResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class ManagementKeyCollectionResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class ManagementKeyCreateRequest
{
	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("team_id")]
	public string? TeamId { get; set; }

}

public sealed class ManagementKeyCreateResponse
{
	[JsonPropertyName("key")]
	public Dictionary<string, object> Key { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class ManagementKeyDeleteResponse
{
	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class ManagementKeyDetailResponse
{
	[JsonPropertyName("key")]
	public Dictionary<string, object> Key { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class ManagementKeyListResponse
{
	[JsonPropertyName("keys")]
	public List<Dictionary<string, object>> Keys { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("total")]
	public long Total { get; set; }

}

public sealed class ManagementKeyRuntime
{
	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("daily_limit_cost_nanos")]
	public long? DailyLimitCostNanos { get; set; }

	[JsonPropertyName("daily_limit_requests")]
	public long? DailyLimitRequests { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("monthly_limit_cost_nanos")]
	public long? MonthlyLimitCostNanos { get; set; }

	[JsonPropertyName("monthly_limit_requests")]
	public long? MonthlyLimitRequests { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("prefix")]
	public string Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public List<string> Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("weekly_limit_cost_nanos")]
	public long? WeeklyLimitCostNanos { get; set; }

	[JsonPropertyName("weekly_limit_requests")]
	public long? WeeklyLimitRequests { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ManagementKeyRuntimeCreated
{
	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("daily_limit_cost_nanos")]
	public long? DailyLimitCostNanos { get; set; }

	[JsonPropertyName("daily_limit_requests")]
	public long? DailyLimitRequests { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("key")]
	public string Key { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("monthly_limit_cost_nanos")]
	public long? MonthlyLimitCostNanos { get; set; }

	[JsonPropertyName("monthly_limit_requests")]
	public long? MonthlyLimitRequests { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("prefix")]
	public string Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public List<string> Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("weekly_limit_cost_nanos")]
	public long? WeeklyLimitCostNanos { get; set; }

	[JsonPropertyName("weekly_limit_requests")]
	public long? WeeklyLimitRequests { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ManagementKeyRuntimeCreateRequest
{
	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("paused")]
	public bool? Paused { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("template")]
	public string? Template { get; set; }

}

public sealed class ManagementKeyRuntimeCreateResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ManagementKeyRuntimeDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

}

public sealed class ManagementKeyRuntimeResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ManagementKeyRuntimeUpdateRequest
{
	[JsonPropertyName("dailyCostNanos")]
	public long? DailyCostNanos { get; set; }

	[JsonPropertyName("dailyRequests")]
	public long? DailyRequests { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("monthlyCostNanos")]
	public long? MonthlyCostNanos { get; set; }

	[JsonPropertyName("monthlyRequests")]
	public long? MonthlyRequests { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("paused")]
	public bool? Paused { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("softBlocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("template")]
	public string? Template { get; set; }

	[JsonPropertyName("weeklyCostNanos")]
	public long? WeeklyCostNanos { get; set; }

	[JsonPropertyName("weeklyRequests")]
	public long? WeeklyRequests { get; set; }

}

public sealed class ManagementKeyUpdateRequest
{
	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class ManagementKeyUpdateResponse
{
	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

}

public sealed class MessageContentPart { }

public sealed class Model
{
	[JsonPropertyName("aliases")]
	public List<string> Aliases { get; set; }

	[JsonPropertyName("availability")]
	public Dictionary<string, object> Availability { get; set; }

	[JsonPropertyName("base_model_id")]
	public string BaseModelId { get; set; }

	[JsonPropertyName("capabilities")]
	public Dictionary<string, object> Capabilities { get; set; }

	[JsonPropertyName("description")]
	public string Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("lifecycle")]
	public Dictionary<string, object> Lifecycle { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object> Limits { get; set; }

	[JsonPropertyName("modalities")]
	public Dictionary<string, object> Modalities { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("offers")]
	public List<Dictionary<string, object>> Offers { get; set; }

	[JsonPropertyName("organization")]
	public Dictionary<string, object>? Organization { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object> Pricing { get; set; }

	[JsonPropertyName("variant")]
	public string Variant { get; set; }

	[JsonPropertyName("variants")]
	public Dictionary<string, object> Variants { get; set; }

}

public sealed class ModelAvailability
{
	[JsonPropertyName("active_provider_count")]
	public long ActiveProviderCount { get; set; }

	[JsonPropertyName("coming_soon_provider_count")]
	public long ComingSoonProviderCount { get; set; }

	[JsonPropertyName("inactive_provider_count")]
	public long InactiveProviderCount { get; set; }

	[JsonPropertyName("provider_count")]
	public long ProviderCount { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

}

public sealed class ModelEndpointCapability
{
	[JsonPropertyName("capabilities")]
	public Dictionary<string, object> Capabilities { get; set; }

	[JsonPropertyName("capability_id")]
	public string CapabilityId { get; set; }

	[JsonPropertyName("collection")]
	public string Collection { get; set; }

	[JsonPropertyName("effective")]
	public Dictionary<string, object> Effective { get; set; }

	[JsonPropertyName("endpoint")]
	public string Endpoint { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("modalities")]
	public Dictionary<string, object> Modalities { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object> Pricing { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object> Provider { get; set; }

	[JsonPropertyName("public_path")]
	public string PublicPath { get; set; }

	[JsonPropertyName("routable")]
	public bool Routable { get; set; }

	[JsonPropertyName("routing")]
	public Dictionary<string, object> Routing { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("status_reason")]
	public string StatusReason { get; set; }

}

public sealed class ModelEndpointsResponse
{
	[JsonPropertyName("availability_mode")]
	public string AvailabilityMode { get; set; }

	[JsonPropertyName("description")]
	public string Description { get; set; }

	[JsonPropertyName("endpoints")]
	public List<Dictionary<string, object>> Endpoints { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("modalities")]
	public Dictionary<string, object> Modalities { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("organization")]
	public Dictionary<string, object>? Organization { get; set; }

}

public sealed class ModelId { }

public sealed class ModelLifecycle
{
	[JsonPropertyName("deprecation_date")]
	public string? DeprecationDate { get; set; }

	[JsonPropertyName("message")]
	public string? Message { get; set; }

	[JsonPropertyName("replacement_model_id")]
	public string? ReplacementModelId { get; set; }

	[JsonPropertyName("retirement_date")]
	public string? RetirementDate { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class ModelProviderAvailability
{
	[JsonPropertyName("api_provider_id")]
	public string ApiProviderId { get; set; }

	[JsonPropertyName("api_provider_name")]
	public string? ApiProviderName { get; set; }

	[JsonPropertyName("availability_reason")]
	public string AvailabilityReason { get; set; }

	[JsonPropertyName("availability_status")]
	public string AvailabilityStatus { get; set; }

	[JsonPropertyName("capability_status")]
	public string CapabilityStatus { get; set; }

	[JsonPropertyName("effective_from")]
	public string? EffectiveFrom { get; set; }

	[JsonPropertyName("effective_to")]
	public string? EffectiveTo { get; set; }

	[JsonPropertyName("endpoints")]
	public List<string> Endpoints { get; set; }

	[JsonPropertyName("input_modalities")]
	public List<string>? InputModalities { get; set; }

	[JsonPropertyName("is_active_gateway")]
	public bool IsActiveGateway { get; set; }

	[JsonPropertyName("model_routing_status")]
	public string ModelRoutingStatus { get; set; }

	[JsonPropertyName("output_modalities")]
	public List<string>? OutputModalities { get; set; }

	[JsonPropertyName("params")]
	public List<string> Params { get; set; }

	[JsonPropertyName("params_detail")]
	public Dictionary<string, object>? ParamsDetail { get; set; }

	[JsonPropertyName("provider_model_slug")]
	public string? ProviderModelSlug { get; set; }

	[JsonPropertyName("provider_routing_status")]
	public string ProviderRoutingStatus { get; set; }

	[JsonPropertyName("provider_status")]
	public string ProviderStatus { get; set; }

	[JsonPropertyName("supported_parameters")]
	public List<string>? SupportedParameters { get; set; }

	[JsonPropertyName("supported_parameters_detail")]
	public Dictionary<string, object>? SupportedParametersDetail { get; set; }

}

public sealed class ModerationCategories
{
	[JsonPropertyName("harassment")]
	public bool? Harassment { get; set; }

	[JsonPropertyName("harassment/threatening")]
	public bool? HarassmentThreatening { get; set; }

	[JsonPropertyName("hate")]
	public bool? Hate { get; set; }

	[JsonPropertyName("hate/threatening")]
	public bool? HateThreatening { get; set; }

	[JsonPropertyName("self-harm")]
	public bool? SelfHarm { get; set; }

	[JsonPropertyName("self-harm/instructions")]
	public bool? SelfHarmInstructions { get; set; }

	[JsonPropertyName("self-harm/intent")]
	public bool? SelfHarmIntent { get; set; }

	[JsonPropertyName("sexual")]
	public bool? Sexual { get; set; }

	[JsonPropertyName("sexual/minors")]
	public bool? SexualMinors { get; set; }

	[JsonPropertyName("violence")]
	public bool? Violence { get; set; }

	[JsonPropertyName("violence/graphic")]
	public bool? ViolenceGraphic { get; set; }

}

public sealed class ModerationCategoryScores
{
	[JsonPropertyName("harassment")]
	public double? Harassment { get; set; }

	[JsonPropertyName("harassment/threatening")]
	public double? HarassmentThreatening { get; set; }

	[JsonPropertyName("hate")]
	public double? Hate { get; set; }

	[JsonPropertyName("hate/threatening")]
	public double? HateThreatening { get; set; }

	[JsonPropertyName("self-harm")]
	public double? SelfHarm { get; set; }

	[JsonPropertyName("self-harm/instructions")]
	public double? SelfHarmInstructions { get; set; }

	[JsonPropertyName("self-harm/intent")]
	public double? SelfHarmIntent { get; set; }

	[JsonPropertyName("sexual")]
	public double? Sexual { get; set; }

	[JsonPropertyName("sexual/minors")]
	public double? SexualMinors { get; set; }

	[JsonPropertyName("violence")]
	public double? Violence { get; set; }

	[JsonPropertyName("violence/graphic")]
	public double? ViolenceGraphic { get; set; }

}

public sealed class ModerationResult
{
	[JsonPropertyName("categories")]
	public Dictionary<string, object>? Categories { get; set; }

	[JsonPropertyName("category_scores")]
	public Dictionary<string, object>? CategoryScores { get; set; }

	[JsonPropertyName("flagged")]
	public bool? Flagged { get; set; }

}

public sealed class ModerationsRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("input")]
	public object Input { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

}

public sealed class ModerationsResponse
{
	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("meta")]
	public Dictionary<string, object>? Meta { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("results")]
	public List<Dictionary<string, object>>? Results { get; set; }

}

public sealed class MusicGenerateRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("duration")]
	public long? Duration { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("elevenlabs")]
	public Dictionary<string, object>? Elevenlabs { get; set; }

	[JsonPropertyName("format")]
	public string? Format { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("prompt")]
	public string? Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("suno")]
	public Dictionary<string, object>? Suno { get; set; }

}

public sealed class MusicGenerateResponse
{
	[JsonPropertyName("audio_base64")]
	public string? AudioBase64 { get; set; }

	[JsonPropertyName("audio_url")]
	public string? AudioUrl { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("nativeResponseId")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("object")]
	public string Object { get; set; }

	[JsonPropertyName("output")]
	public List<Dictionary<string, object>>? Output { get; set; }

	[JsonPropertyName("provider")]
	public string Provider { get; set; }

	[JsonPropertyName("result")]
	public object? Result { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class NotImplementedResponse
{
	[JsonPropertyName("description")]
	public string Description { get; set; }

	[JsonPropertyName("error")]
	public string Error { get; set; }

	[JsonPropertyName("status_code")]
	public long StatusCode { get; set; }

}

public sealed class OAuthClient
{
	[JsonPropertyName("active_authorizations")]
	public long? ActiveAuthorizations { get; set; }

	[JsonPropertyName("allowed_scopes")]
	public List<string>? AllowedScopes { get; set; }

	[JsonPropertyName("client_id")]
	public string ClientId { get; set; }

	[JsonPropertyName("client_type")]
	public string ClientType { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("homepage_url")]
	public string? HomepageUrl { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("logo_url")]
	public string? LogoUrl { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_policy_url")]
	public string? PrivacyPolicyUrl { get; set; }

	[JsonPropertyName("redirect_uris")]
	public List<string> RedirectUris { get; set; }

	[JsonPropertyName("requests_last_30d")]
	public long? RequestsLast30d { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("terms_of_service_url")]
	public string? TermsOfServiceUrl { get; set; }

	[JsonPropertyName("total_authorizations")]
	public long? TotalAuthorizations { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class OAuthClientCreateRequest
{
	[JsonPropertyName("allowed_scopes")]
	public List<string>? AllowedScopes { get; set; }

	[JsonPropertyName("client_type")]
	public string? ClientType { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("homepage_url")]
	public string? HomepageUrl { get; set; }

	[JsonPropertyName("logo_url")]
	public string? LogoUrl { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_policy_url")]
	public string? PrivacyPolicyUrl { get; set; }

	[JsonPropertyName("redirect_uris")]
	public List<string> RedirectUris { get; set; }

	[JsonPropertyName("terms_of_service_url")]
	public string? TermsOfServiceUrl { get; set; }

}

public sealed class OAuthClientCreateResponse
{
	[JsonPropertyName("active_authorizations")]
	public long? ActiveAuthorizations { get; set; }

	[JsonPropertyName("allowed_scopes")]
	public List<string>? AllowedScopes { get; set; }

	[JsonPropertyName("client_id")]
	public string ClientId { get; set; }

	[JsonPropertyName("client_secret")]
	public string? ClientSecret { get; set; }

	[JsonPropertyName("client_type")]
	public string ClientType { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("homepage_url")]
	public string? HomepageUrl { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("logo_url")]
	public string? LogoUrl { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_policy_url")]
	public string? PrivacyPolicyUrl { get; set; }

	[JsonPropertyName("redirect_uris")]
	public List<string> RedirectUris { get; set; }

	[JsonPropertyName("requests_last_30d")]
	public long? RequestsLast30d { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("terms_of_service_url")]
	public string? TermsOfServiceUrl { get; set; }

	[JsonPropertyName("total_authorizations")]
	public long? TotalAuthorizations { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class OAuthClientDeleteResponse
{
	[JsonPropertyName("client_id")]
	public string ClientId { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

}

public sealed class OAuthClientInput
{
	[JsonPropertyName("allowed_scopes")]
	public List<string>? AllowedScopes { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("homepage_url")]
	public string? HomepageUrl { get; set; }

	[JsonPropertyName("logo_url")]
	public string? LogoUrl { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacy_policy_url")]
	public string? PrivacyPolicyUrl { get; set; }

	[JsonPropertyName("redirect_uris")]
	public List<string>? RedirectUris { get; set; }

	[JsonPropertyName("terms_of_service_url")]
	public string? TermsOfServiceUrl { get; set; }

}

public sealed class OAuthClientListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("pagination")]
	public Dictionary<string, object> Pagination { get; set; }

}

public sealed class OAuthClientSecretResponse
{
	[JsonPropertyName("client_id")]
	public string ClientId { get; set; }

	[JsonPropertyName("client_secret")]
	public string ClientSecret { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

}

public sealed class OAuthClientUpdateRequest
{
	[JsonPropertyName("allowed_scopes")]
	public List<string>? AllowedScopes { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("homepage_url")]
	public string? HomepageUrl { get; set; }

	[JsonPropertyName("logo_url")]
	public string? LogoUrl { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacy_policy_url")]
	public string? PrivacyPolicyUrl { get; set; }

	[JsonPropertyName("redirect_uris")]
	public List<string>? RedirectUris { get; set; }

	[JsonPropertyName("terms_of_service_url")]
	public string? TermsOfServiceUrl { get; set; }

}

public sealed class ObservabilityDestination
{
	[JsonPropertyName("configured")]
	public bool Configured { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("group_join")]
	public string GroupJoin { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("include_cost_metadata")]
	public bool? IncludeCostMetadata { get; set; }

	[JsonPropertyName("include_generation_metadata")]
	public bool? IncludeGenerationMetadata { get; set; }

	[JsonPropertyName("include_identity_metadata")]
	public bool? IncludeIdentityMetadata { get; set; }

	[JsonPropertyName("include_request_context")]
	public bool? IncludeRequestContext { get; set; }

	[JsonPropertyName("key_filters")]
	public List<Dictionary<string, object>> KeyFilters { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_mode")]
	public bool PrivacyMode { get; set; }

	[JsonPropertyName("rule_groups")]
	public List<Dictionary<string, object>> RuleGroups { get; set; }

	[JsonPropertyName("sampling_rate")]
	public double SamplingRate { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ObservabilityDestinationCreateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("group_join")]
	public string? GroupJoin { get; set; }

	[JsonPropertyName("include_cost_metadata")]
	public bool? IncludeCostMetadata { get; set; }

	[JsonPropertyName("include_generation_metadata")]
	public bool? IncludeGenerationMetadata { get; set; }

	[JsonPropertyName("include_identity_metadata")]
	public bool? IncludeIdentityMetadata { get; set; }

	[JsonPropertyName("include_request_context")]
	public bool? IncludeRequestContext { get; set; }

	[JsonPropertyName("key_filters")]
	public List<Dictionary<string, object>>? KeyFilters { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("privacy_mode")]
	public bool? PrivacyMode { get; set; }

	[JsonPropertyName("rule_groups")]
	public List<Dictionary<string, object>>? RuleGroups { get; set; }

	[JsonPropertyName("sampling_rate")]
	public double? SamplingRate { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ObservabilityDestinationListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class ObservabilityDestinationPolicyInput
{
	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("group_join")]
	public string? GroupJoin { get; set; }

	[JsonPropertyName("include_cost_metadata")]
	public bool? IncludeCostMetadata { get; set; }

	[JsonPropertyName("include_generation_metadata")]
	public bool? IncludeGenerationMetadata { get; set; }

	[JsonPropertyName("include_identity_metadata")]
	public bool? IncludeIdentityMetadata { get; set; }

	[JsonPropertyName("include_request_context")]
	public bool? IncludeRequestContext { get; set; }

	[JsonPropertyName("key_filters")]
	public List<Dictionary<string, object>>? KeyFilters { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacy_mode")]
	public bool? PrivacyMode { get; set; }

	[JsonPropertyName("rule_groups")]
	public List<Dictionary<string, object>>? RuleGroups { get; set; }

	[JsonPropertyName("sampling_rate")]
	public double? SamplingRate { get; set; }

}

public sealed class ObservabilityDestinationResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ObservabilityDestinationType { }

public sealed class ObservabilityDestinationUpdateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object>? Config { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("group_join")]
	public string? GroupJoin { get; set; }

	[JsonPropertyName("include_cost_metadata")]
	public bool? IncludeCostMetadata { get; set; }

	[JsonPropertyName("include_generation_metadata")]
	public bool? IncludeGenerationMetadata { get; set; }

	[JsonPropertyName("include_identity_metadata")]
	public bool? IncludeIdentityMetadata { get; set; }

	[JsonPropertyName("include_request_context")]
	public bool? IncludeRequestContext { get; set; }

	[JsonPropertyName("key_filters")]
	public List<Dictionary<string, object>>? KeyFilters { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("privacy_mode")]
	public bool? PrivacyMode { get; set; }

	[JsonPropertyName("rule_groups")]
	public List<Dictionary<string, object>>? RuleGroups { get; set; }

	[JsonPropertyName("sampling_rate")]
	public double? SamplingRate { get; set; }

}

public sealed class ObservabilityKeyFilter
{
	[JsonPropertyName("key_id")]
	public string KeyId { get; set; }

	[JsonPropertyName("mode")]
	public string Mode { get; set; }

}

public sealed class ObservabilityLoggingPolicy
{
	[JsonPropertyName("billing_status")]
	public string BillingStatus { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("grace_until")]
	public string? GraceUntil { get; set; }

	[JsonPropertyName("include_provider_payloads")]
	public bool IncludeProviderPayloads { get; set; }

	[JsonPropertyName("price_per_million_units_nanos")]
	public long PricePerMillionUnitsNanos { get; set; }

	[JsonPropertyName("retention_days")]
	public long RetentionDays { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ObservabilityLoggingPolicyResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ObservabilityLoggingPolicyUpdateRequest
{
	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("include_provider_payloads")]
	public bool? IncludeProviderPayloads { get; set; }

	[JsonPropertyName("retention_days")]
	public long? RetentionDays { get; set; }

}

public sealed class ObservabilityRule
{
	[JsonPropertyName("condition")]
	public string Condition { get; set; }

	[JsonPropertyName("field")]
	public string Field { get; set; }

	[JsonPropertyName("value")]
	public string? Value { get; set; }

}

public sealed class ObservabilityRuleGroup
{
	[JsonPropertyName("match")]
	public string Match { get; set; }

	[JsonPropertyName("rules")]
	public List<Dictionary<string, object>> Rules { get; set; }

}

public sealed class OcrRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("image")]
	public string Image { get; set; }

	[JsonPropertyName("language")]
	public string? Language { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

}

public sealed class OcrResponse
{
}

public sealed class OrganisationId { }

public sealed class OrganisationIdList { }

public sealed class ParseBlock { }

public sealed class ParseBoundingBox
{
	[JsonPropertyName("bottom_right_x")]
	public double BottomRightX { get; set; }

	[JsonPropertyName("bottom_right_y")]
	public double BottomRightY { get; set; }

	[JsonPropertyName("top_left_x")]
	public double TopLeftX { get; set; }

	[JsonPropertyName("top_left_y")]
	public double TopLeftY { get; set; }

}

public sealed class ParseImage
{
	[JsonPropertyName("bounding_box")]
	public Dictionary<string, object> BoundingBox { get; set; }

	[JsonPropertyName("bounding_box_normalized")]
	public Dictionary<string, object> BoundingBoxNormalized { get; set; }

	[JsonPropertyName("category")]
	public string Category { get; set; }

	[JsonPropertyName("description")]
	public string Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

}

public sealed class ParsePage { }

public sealed class ParseRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("document")]
	public Dictionary<string, object> Document { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("output_format")]
	public string? OutputFormat { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("routing")]
	public Dictionary<string, object>? Routing { get; set; }

}

public sealed class ParseResponse
{
	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("meta")]
	public Dictionary<string, object>? Meta { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("object")]
	public string Object { get; set; }

	[JsonPropertyName("pages")]
	public List<object> Pages { get; set; }

	[JsonPropertyName("provider")]
	public string Provider { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class Preset
{
	[JsonPropertyName("active_version_id")]
	public string? ActiveVersionId { get; set; }

	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string Slug { get; set; }

	[JsonPropertyName("source_preset_id")]
	public string? SourcePresetId { get; set; }

	[JsonPropertyName("source_preset_version_id")]
	public string? SourcePresetVersionId { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("upstream_version_id")]
	public string? UpstreamVersionId { get; set; }

	[JsonPropertyName("versioning_method")]
	public string VersioningMethod { get; set; }

	[JsonPropertyName("visibility")]
	public string Visibility { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class PresetConfig
{
}

public sealed class PresetCreateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object>? Config { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

	[JsonPropertyName("versioning_method")]
	public string? VersioningMethod { get; set; }

	[JsonPropertyName("visibility")]
	public string? Visibility { get; set; }

}

public sealed class PresetCreateResponse
{
	[JsonPropertyName("canonical_model")]
	public string CanonicalModel { get; set; }

	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetForkRequest
{
	[JsonPropertyName("source_version_id")]
	public string? SourceVersionId { get; set; }

}

public sealed class PresetListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class PresetPublisher
{
	[JsonPropertyName("handle")]
	public string? Handle { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class PresetPublisherResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetPublisherUpdateRequest
{
	[JsonPropertyName("handle")]
	public string Handle { get; set; }

}

public sealed class PresetResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetTestRun
{
	[JsonPropertyName("baseline_preset_id")]
	public string? BaselinePresetId { get; set; }

	[JsonPropertyName("completed_at")]
	public string? CompletedAt { get; set; }

	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by_user_id")]
	public string? CreatedByUserId { get; set; }

	[JsonPropertyName("dataset_name")]
	public string? DatasetName { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("started_at")]
	public string? StartedAt { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("summary")]
	public Dictionary<string, object> Summary { get; set; }

	[JsonPropertyName("updated_at")]
	public string UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class PresetTestRunCreateRequest
{
	[JsonPropertyName("baseline_preset_id")]
	public string? BaselinePresetId { get; set; }

	[JsonPropertyName("completed_at")]
	public string? CompletedAt { get; set; }

	[JsonPropertyName("config")]
	public Dictionary<string, object>? Config { get; set; }

	[JsonPropertyName("dataset_name")]
	public string? DatasetName { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("preset_id")]
	public string? PresetId { get; set; }

	[JsonPropertyName("started_at")]
	public string? StartedAt { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("summary")]
	public Dictionary<string, object>? Summary { get; set; }

}

public sealed class PresetTestRunDetailResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

	[JsonPropertyName("feedback_summary")]
	public Dictionary<string, object>? FeedbackSummary { get; set; }

}

public sealed class PresetTestRunListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class PresetTestRunResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetTestRunUpdateRequest
{
	[JsonPropertyName("completed_at")]
	public string? CompletedAt { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("started_at")]
	public string? StartedAt { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("summary")]
	public Dictionary<string, object>? Summary { get; set; }

}

public sealed class PresetUpdateRequest
{
	[JsonPropertyName("config")]
	public Dictionary<string, object>? Config { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("replace_config")]
	public bool? ReplaceConfig { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

	[JsonPropertyName("versioning_method")]
	public string? VersioningMethod { get; set; }

	[JsonPropertyName("visibility")]
	public string? Visibility { get; set; }

}

public sealed class PresetUpstreamApplyRequest
{
	[JsonPropertyName("version_id")]
	public string VersionId { get; set; }

}

public sealed class PresetUpstreamApplyResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetVersion
{
	[JsonPropertyName("config")]
	public Dictionary<string, object> Config { get; set; }

	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string CreatedBy { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("preset_id")]
	public string PresetId { get; set; }

	[JsonPropertyName("release_notes")]
	public string? ReleaseNotes { get; set; }

	[JsonPropertyName("slug")]
	public string Slug { get; set; }

	[JsonPropertyName("version_label")]
	public string VersionLabel { get; set; }

	[JsonPropertyName("version_number")]
	public long VersionNumber { get; set; }

	[JsonPropertyName("versioning_method")]
	public string VersioningMethod { get; set; }

	[JsonPropertyName("visibility")]
	public string Visibility { get; set; }

}

public sealed class PresetVersioningMethod { }

public sealed class PresetVersionListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class PresetVersionPublishRequest
{
	[JsonPropertyName("release_notes")]
	public string? ReleaseNotes { get; set; }

	[JsonPropertyName("version_label")]
	public string? VersionLabel { get; set; }

}

public sealed class PresetVersionResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PresetVisibility { }

public sealed class PrivateModel
{
	[JsonPropertyName("base_url")]
	public string BaseUrl { get; set; }

	[JsonPropertyName("catalog_model_id")]
	public string? CatalogModelId { get; set; }

	[JsonPropertyName("context_length")]
	public long? ContextLength { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("credential_prefix")]
	public string? CredentialPrefix { get; set; }

	[JsonPropertyName("credential_suffix")]
	public string? CredentialSuffix { get; set; }

	[JsonPropertyName("custom_provider_name")]
	public string? CustomProviderName { get; set; }

	[JsonPropertyName("custom_provider_url")]
	public string? CustomProviderUrl { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("host_provider_id")]
	public string? HostProviderId { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("input_modalities")]
	public List<string>? InputModalities { get; set; }

	[JsonPropertyName("local_slug")]
	public string? LocalSlug { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public long? MaxOutputTokens { get; set; }

	[JsonPropertyName("model_id")]
	public string ModelId { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("output_modalities")]
	public List<string>? OutputModalities { get; set; }

	[JsonPropertyName("routing_policy")]
	public string? RoutingPolicy { get; set; }

	[JsonPropertyName("supports_responses")]
	public bool SupportsResponses { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("upstream_model_id")]
	public string UpstreamModelId { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class PrivateModelCreateRequest
{
	[JsonPropertyName("base_url")]
	public string BaseUrl { get; set; }

	[JsonPropertyName("context_length")]
	public long? ContextLength { get; set; }

	[JsonPropertyName("credential")]
	public string Credential { get; set; }

	[JsonPropertyName("custom_provider_name")]
	public string? CustomProviderName { get; set; }

	[JsonPropertyName("custom_provider_url")]
	public string? CustomProviderUrl { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("host_provider_id")]
	public string? HostProviderId { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public long? MaxOutputTokens { get; set; }

	[JsonPropertyName("model_reference")]
	public string ModelReference { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("routing_policy")]
	public string? RoutingPolicy { get; set; }

	[JsonPropertyName("supports_responses")]
	public bool? SupportsResponses { get; set; }

	[JsonPropertyName("upstream_model_id")]
	public string UpstreamModelId { get; set; }

}

public sealed class PrivateModelDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

}

public sealed class PrivateModelListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class PrivateModelResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class PrivateModelUpdateRequest
{
	[JsonPropertyName("base_url")]
	public string? BaseUrl { get; set; }

	[JsonPropertyName("context_length")]
	public long? ContextLength { get; set; }

	[JsonPropertyName("credential")]
	public string? Credential { get; set; }

	[JsonPropertyName("custom_provider_name")]
	public string? CustomProviderName { get; set; }

	[JsonPropertyName("custom_provider_url")]
	public string? CustomProviderUrl { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("host_provider_id")]
	public string? HostProviderId { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public long? MaxOutputTokens { get; set; }

	[JsonPropertyName("model_reference")]
	public string? ModelReference { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("routing_policy")]
	public string? RoutingPolicy { get; set; }

	[JsonPropertyName("supports_responses")]
	public bool? SupportsResponses { get; set; }

	[JsonPropertyName("upstream_model_id")]
	public string? UpstreamModelId { get; set; }

}

public sealed class Provider
{
	[JsonPropertyName("api_provider_id")]
	public string? ApiProviderId { get; set; }

	[JsonPropertyName("api_provider_name")]
	public string? ApiProviderName { get; set; }

	[JsonPropertyName("country_code")]
	public string? CountryCode { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("link")]
	public string? Link { get; set; }

}

public sealed class ProviderCredential
{
	[JsonPropertyName("allowed_api_key_ids")]
	public List<string>? AllowedApiKeyIds { get; set; }

	[JsonPropertyName("allowed_model_slugs")]
	public List<string>? AllowedModelSlugs { get; set; }

	[JsonPropertyName("always_use")]
	public bool? AlwaysUse { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("disabled")]
	public bool Disabled { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("error_message")]
	public string? ErrorMessage { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("is_fallback")]
	public bool IsFallback { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("last_verified_at")]
	public string? LastVerifiedAt { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("provider_id")]
	public string ProviderId { get; set; }

	[JsonPropertyName("routing_mode")]
	public string RoutingMode { get; set; }

	[JsonPropertyName("sort_order")]
	public long SortOrder { get; set; }

	[JsonPropertyName("suffix")]
	public string? Suffix { get; set; }

	[JsonPropertyName("verification_status")]
	public string? VerificationStatus { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ProviderCredentialCreateRequest
{
	[JsonPropertyName("allowed_api_key_ids")]
	public List<string>? AllowedApiKeyIds { get; set; }

	[JsonPropertyName("allowed_models")]
	public List<string>? AllowedModels { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("key")]
	public string Key { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("provider")]
	public string Provider { get; set; }

	[JsonPropertyName("routing_mode")]
	public string? RoutingMode { get; set; }

}

public sealed class ProviderCredentialDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

}

public sealed class ProviderCredentialListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class ProviderCredentialReorderRequest
{
	[JsonPropertyName("key_ids")]
	public List<string> KeyIds { get; set; }

	[JsonPropertyName("provider")]
	public string Provider { get; set; }

	[JsonPropertyName("routing_mode")]
	public string RoutingMode { get; set; }

}

public sealed class ProviderCredentialReorderResponse
{
	[JsonPropertyName("reordered")]
	public bool Reordered { get; set; }

}

public sealed class ProviderCredentialResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class ProviderCredentialRoutingMode { }

public sealed class ProviderCredentialUpdateRequest
{
	[JsonPropertyName("allowed_api_key_ids")]
	public List<string>? AllowedApiKeyIds { get; set; }

	[JsonPropertyName("allowed_models")]
	public List<string>? AllowedModels { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("key")]
	public string? Key { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("routing_mode")]
	public string? RoutingMode { get; set; }

}

public sealed class ProviderOptions
{
	[JsonPropertyName("anthropic")]
	public Dictionary<string, object>? Anthropic { get; set; }

	[JsonPropertyName("google")]
	public Dictionary<string, object>? Google { get; set; }

	[JsonPropertyName("openai")]
	public Dictionary<string, object>? Openai { get; set; }

}

public sealed class ProviderRoutingOptions
{
	[JsonPropertyName("allow_fallbacks")]
	public bool? AllowFallbacks { get; set; }

	[JsonPropertyName("data_collection")]
	public string? DataCollection { get; set; }

	[JsonPropertyName("enforce_distillable_text")]
	public bool? EnforceDistillableText { get; set; }

	[JsonPropertyName("ignore")]
	public List<string>? Ignore { get; set; }

	[JsonPropertyName("include_alpha")]
	public bool? IncludeAlpha { get; set; }

	[JsonPropertyName("max_price")]
	public Dictionary<string, object>? MaxPrice { get; set; }

	[JsonPropertyName("only")]
	public List<string>? Only { get; set; }

	[JsonPropertyName("order")]
	public List<string>? Order { get; set; }

	[JsonPropertyName("preferred_max_latency")]
	public object? PreferredMaxLatency { get; set; }

	[JsonPropertyName("preferred_min_throughput")]
	public object? PreferredMinThroughput { get; set; }

	[JsonPropertyName("quantizations")]
	public List<string>? Quantizations { get; set; }

	[JsonPropertyName("require_parameters")]
	public bool? RequireParameters { get; set; }

	[JsonPropertyName("require_zero_data_retention")]
	public bool? RequireZeroDataRetention { get; set; }

	[JsonPropertyName("required_data_region")]
	public string? RequiredDataRegion { get; set; }

	[JsonPropertyName("required_execution_region")]
	public string? RequiredExecutionRegion { get; set; }

	[JsonPropertyName("sort")]
	public object? Sort { get; set; }

	[JsonPropertyName("zdr")]
	public bool? Zdr { get; set; }

}

public sealed class ProvisioningKey
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public string? Scopes { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class ProvisioningKeyDetail
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public string? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("team_id")]
	public string? TeamId { get; set; }

}

public sealed class ProvisioningKeyWithValue
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("key")]
	public string? Key { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("scopes")]
	public string? Scopes { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class ReasoningConfig
{
	[JsonPropertyName("effort")]
	public string? Effort { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("max_tokens")]
	public long? MaxTokens { get; set; }

	[JsonPropertyName("mode")]
	public string? Mode { get; set; }

	[JsonPropertyName("summary")]
	public string? Summary { get; set; }

}

public sealed class RerankDocument { }

public sealed class RerankRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("documents")]
	public object Documents { get; set; }

	[JsonPropertyName("max_chunks_per_doc")]
	public long? MaxChunksPerDoc { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("query")]
	public string Query { get; set; }

	[JsonPropertyName("rank_fields")]
	public List<string>? RankFields { get; set; }

	[JsonPropertyName("return_documents")]
	public bool? ReturnDocuments { get; set; }

	[JsonPropertyName("top_k")]
	public long? TopK { get; set; }

	[JsonPropertyName("top_n")]
	public long? TopN { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

}

public sealed class RerankResponse
{
	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("nativeResponseId")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("results")]
	public List<Dictionary<string, object>>? Results { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class RerankResult
{
	[JsonPropertyName("document")]
	public object? Document { get; set; }

	[JsonPropertyName("index")]
	public long? Index { get; set; }

	[JsonPropertyName("relevance_score")]
	public double? RelevanceScore { get; set; }

}

public sealed class ResponsesInputItem
{
	[JsonPropertyName("content")]
	public object? Content { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

}

public sealed class ResponsesOutputAudioPart
{
	[JsonPropertyName("audio_url")]
	public Dictionary<string, object>? AudioUrl { get; set; }

	[JsonPropertyName("b64_json")]
	public string? B64Json { get; set; }

	[JsonPropertyName("format")]
	public string? Format { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ResponsesOutputContentPart { }

public sealed class ResponsesOutputImagePart
{
	[JsonPropertyName("b64_json")]
	public string? B64Json { get; set; }

	[JsonPropertyName("image_url")]
	public Dictionary<string, object>? ImageUrl { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ResponsesOutputItem
{
	[JsonPropertyName("arguments")]
	public string? Arguments { get; set; }

	[JsonPropertyName("call_id")]
	public string? CallId { get; set; }

	[JsonPropertyName("content")]
	public List<object>? Content { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

}

public sealed class ResponsesOutputTextPart
{
	[JsonPropertyName("annotations")]
	public List<Dictionary<string, object>>? Annotations { get; set; }

	[JsonPropertyName("text")]
	public string Text { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ResponsesRequest
{
	[JsonPropertyName("background")]
	public bool? Background { get; set; }

	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("echo_upstream_request")]
	public bool? EchoUpstreamRequest { get; set; }

	[JsonPropertyName("image_config")]
	public Dictionary<string, object>? ImageConfig { get; set; }

	[JsonPropertyName("include")]
	public List<string>? Include { get; set; }

	[JsonPropertyName("input")]
	public object Input { get; set; }

	[JsonPropertyName("instructions")]
	public string? Instructions { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public long? MaxOutputTokens { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("modalities")]
	public List<string>? Modalities { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("parallel_tool_calls")]
	public bool? ParallelToolCalls { get; set; }

	[JsonPropertyName("previous_response_id")]
	public string? PreviousResponseId { get; set; }

	[JsonPropertyName("prompt_cache_key")]
	public string? PromptCacheKey { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("safety_identifier")]
	public string? SafetyIdentifier { get; set; }

	[JsonPropertyName("service_tier")]
	public string? ServiceTier { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("store")]
	public bool? Store { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("text")]
	public Dictionary<string, object>? Text { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<object>? Tools { get; set; }

	[JsonPropertyName("top_p")]
	public double? TopP { get; set; }

	[JsonPropertyName("truncation")]
	public string? Truncation { get; set; }

	[JsonPropertyName("usage")]
	public bool? Usage { get; set; }

	[JsonPropertyName("user")]
	public string? User { get; set; }

}

public sealed class ResponsesResponse
{
	[JsonPropertyName("content")]
	public List<Dictionary<string, object>>? Content { get; set; }

	[JsonPropertyName("cost_cents")]
	public long? CostCents { get; set; }

	[JsonPropertyName("cost_nanos")]
	public double? CostNanos { get; set; }

	[JsonPropertyName("created")]
	public long? Created { get; set; }

	[JsonPropertyName("currency")]
	public string? Currency { get; set; }

	[JsonPropertyName("finish_reason")]
	public string? FinishReason { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("meta")]
	public Dictionary<string, object>? Meta { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("nativeResponseId")]
	public string? NativeResponseId { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output")]
	public List<Dictionary<string, object>>? Output { get; set; }

	[JsonPropertyName("output_items")]
	public List<Dictionary<string, object>>? OutputItems { get; set; }

	[JsonPropertyName("pricing_lines")]
	public List<Dictionary<string, object>>? PricingLines { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("provider_id")]
	public string? ProviderId { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("stop_reason")]
	public string? StopReason { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class SearchModelsToolDefinition
{
	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ServerToolUsage
{
	[JsonPropertyName("advisor_requests")]
	public long? AdvisorRequests { get; set; }

	[JsonPropertyName("apply_patch_requests")]
	public long? ApplyPatchRequests { get; set; }

	[JsonPropertyName("datetime_requests")]
	public long? DatetimeRequests { get; set; }

	[JsonPropertyName("fusion_requests")]
	public long? FusionRequests { get; set; }

	[JsonPropertyName("image_generation_requests")]
	public long? ImageGenerationRequests { get; set; }

	[JsonPropertyName("search_models_requests")]
	public long? SearchModelsRequests { get; set; }

	[JsonPropertyName("subagent_requests")]
	public long? SubagentRequests { get; set; }

	[JsonPropertyName("web_fetch_requests")]
	public long? WebFetchRequests { get; set; }

	[JsonPropertyName("web_search_requests")]
	public long? WebSearchRequests { get; set; }

}

public sealed class SubagentToolDefinition
{
	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class SupportedParameterDetails
{
}

public sealed class TextContentPart
{
	[JsonPropertyName("text")]
	public string Text { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class TextGenerateTool { }

public sealed class TextModerationInput
{
	[JsonPropertyName("text")]
	public string Text { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class TextToolChoice { }

public sealed class ToolCall
{
	[JsonPropertyName("function")]
	public Dictionary<string, object> Function { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ToolCallContentPart
{
	[JsonPropertyName("function")]
	public Dictionary<string, object> Function { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class UpdatedResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class Usage
{
	[JsonPropertyName("completion_tokens")]
	public long? CompletionTokens { get; set; }

	[JsonPropertyName("prompt_tokens")]
	public long? PromptTokens { get; set; }

	[JsonPropertyName("server_tool_use")]
	public Dictionary<string, object>? ServerToolUse { get; set; }

	[JsonPropertyName("total_tokens")]
	public long? TotalTokens { get; set; }

}

public sealed class VideoBillingSummary
{
	[JsonPropertyName("billable")]
	public bool? Billable { get; set; }

	[JsonPropertyName("billed_at")]
	public string? BilledAt { get; set; }

	[JsonPropertyName("charge_reason")]
	public string? ChargeReason { get; set; }

	[JsonPropertyName("charged")]
	public bool? Charged { get; set; }

	[JsonPropertyName("currency")]
	public string? Currency { get; set; }

	[JsonPropertyName("estimated_nanos")]
	public long? EstimatedNanos { get; set; }

	[JsonPropertyName("estimated_provider_cost")]
	public string? EstimatedProviderCost { get; set; }

	[JsonPropertyName("estimated_user_cost")]
	public string? EstimatedUserCost { get; set; }

	[JsonPropertyName("reservation_id")]
	public string? ReservationId { get; set; }

	[JsonPropertyName("reservation_status")]
	public string? ReservationStatus { get; set; }

	[JsonPropertyName("reserved_nanos")]
	public long? ReservedNanos { get; set; }

	[JsonPropertyName("settled_provider_cost")]
	public string? SettledProviderCost { get; set; }

	[JsonPropertyName("settled_user_cost")]
	public string? SettledUserCost { get; set; }

	[JsonPropertyName("state")]
	public string? State { get; set; }

	[JsonPropertyName("total_nanos")]
	public long? TotalNanos { get; set; }

}

public sealed class VideoContentPart
{
	[JsonPropertyName("type")]
	public string Type { get; set; }

	[JsonPropertyName("video_url")]
	public string VideoUrl { get; set; }

}

public sealed class VideoDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool? Deleted { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class VideoGenerationRequest
{
	[JsonPropertyName("aspect_ratio")]
	public string? AspectRatio { get; set; }

	[JsonPropertyName("compression_quality")]
	public long? CompressionQuality { get; set; }

	[JsonPropertyName("duration")]
	public long? Duration { get; set; }

	[JsonPropertyName("enhance_prompt")]
	public bool? EnhancePrompt { get; set; }

	[JsonPropertyName("frame_images")]
	public List<Dictionary<string, object>>? FrameImages { get; set; }

	[JsonPropertyName("generate_audio")]
	public bool? GenerateAudio { get; set; }

	[JsonPropertyName("input_audio_duration")]
	public double? InputAudioDuration { get; set; }

	[JsonPropertyName("input_references")]
	public List<object>? InputReferences { get; set; }

	[JsonPropertyName("input_video_duration")]
	public double? InputVideoDuration { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("negative_prompt")]
	public string? NegativePrompt { get; set; }

	[JsonPropertyName("output")]
	public Dictionary<string, object>? Output { get; set; }

	[JsonPropertyName("person_generation")]
	public string? PersonGeneration { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("provider_params")]
	public Dictionary<string, object>? ProviderParams { get; set; }

	[JsonPropertyName("resize_mode")]
	public string? ResizeMode { get; set; }

	[JsonPropertyName("resolution")]
	public string? Resolution { get; set; }

	[JsonPropertyName("sample_count")]
	public long? SampleCount { get; set; }

	[JsonPropertyName("seed")]
	public long? Seed { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

}

public sealed class VideoGenerationResponse
{
	[JsonPropertyName("asset")]
	public Dictionary<string, object>? Asset { get; set; }

	[JsonPropertyName("audio")]
	public bool? Audio { get; set; }

	[JsonPropertyName("billing")]
	public Dictionary<string, object>? Billing { get; set; }

	[JsonPropertyName("cancel_url")]
	public string? CancelUrl { get; set; }

	[JsonPropertyName("completed_at")]
	public object? CompletedAt { get; set; }

	[JsonPropertyName("content_url")]
	public string? ContentUrl { get; set; }

	[JsonPropertyName("created_at")]
	public object? CreatedAt { get; set; }

	[JsonPropertyName("download_url")]
	public string? DownloadUrl { get; set; }

	[JsonPropertyName("error")]
	public object? Error { get; set; }

	[JsonPropertyName("expires_at")]
	public long? ExpiresAt { get; set; }

	[JsonPropertyName("generation_id")]
	public string? GenerationId { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("last_webhook_dispatched_at")]
	public string? LastWebhookDispatchedAt { get; set; }

	[JsonPropertyName("last_webhook_progress")]
	public double? LastWebhookProgress { get; set; }

	[JsonPropertyName("last_webhook_progress_at")]
	public string? LastWebhookProgressAt { get; set; }

	[JsonPropertyName("lifecycle_status")]
	public string? LifecycleStatus { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("native_video_id")]
	public string? NativeVideoId { get; set; }

	[JsonPropertyName("next_webhook_retry_at")]
	public string? NextWebhookRetryAt { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output_access")]
	public string? OutputAccess { get; set; }

	[JsonPropertyName("outputs")]
	public List<Dictionary<string, object>>? Outputs { get; set; }

	[JsonPropertyName("poll_after_seconds")]
	public long? PollAfterSeconds { get; set; }

	[JsonPropertyName("polling_url")]
	public string? PollingUrl { get; set; }

	[JsonPropertyName("progress")]
	public long? Progress { get; set; }

	[JsonPropertyName("progress_source")]
	public string? ProgressSource { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("seconds")]
	public double? Seconds { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

	[JsonPropertyName("started_at")]
	public object? StartedAt { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

	[JsonPropertyName("websocket_url")]
	public string? WebsocketUrl { get; set; }

}

public sealed class VideoInputReference { }

public sealed class VideoListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("first_id")]
	public string? FirstId { get; set; }

	[JsonPropertyName("has_more")]
	public bool? HasMore { get; set; }

	[JsonPropertyName("last_id")]
	public string? LastId { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class VideoModelCapability
{
	[JsonPropertyName("input_types")]
	public List<string>? InputTypes { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("output_types")]
	public List<string>? OutputTypes { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object>? Pricing { get; set; }

	[JsonPropertyName("providers")]
	public List<Dictionary<string, object>>? Providers { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("supported_parameters")]
	public List<string>? SupportedParameters { get; set; }

	[JsonPropertyName("supported_parameters_detail")]
	public Dictionary<string, object>? SupportedParametersDetail { get; set; }

	[JsonPropertyName("supported_params")]
	public List<string>? SupportedParams { get; set; }

	[JsonPropertyName("supported_params_detail")]
	public Dictionary<string, object>? SupportedParamsDetail { get; set; }

}

public sealed class VideoModelProviderCapability
{
	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("supported_parameters")]
	public List<string>? SupportedParameters { get; set; }

	[JsonPropertyName("supported_parameters_detail")]
	public Dictionary<string, object>? SupportedParametersDetail { get; set; }

	[JsonPropertyName("supported_params")]
	public List<string>? SupportedParams { get; set; }

	[JsonPropertyName("supported_params_detail")]
	public Dictionary<string, object>? SupportedParamsDetail { get; set; }

}

public sealed class VideoModelsResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class VideoOutput
{
	[JsonPropertyName("bytes_available")]
	public bool? BytesAvailable { get; set; }

	[JsonPropertyName("content_url")]
	public string? ContentUrl { get; set; }

	[JsonPropertyName("download_url")]
	public string? DownloadUrl { get; set; }

	[JsonPropertyName("expires_at")]
	public long? ExpiresAt { get; set; }

	[JsonPropertyName("index")]
	public long? Index { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

}

public sealed class VideoOutputConfig
{
	[JsonPropertyName("access")]
	public string? Access { get; set; }

}

public sealed class WebhookEndpoint
{
	[JsonPropertyName("createdAt")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("createdBy")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("deletedAt")]
	public string? DeletedAt { get; set; }

	[JsonPropertyName("events")]
	public List<string> Events { get; set; }

	[JsonPropertyName("hasSecret")]
	public bool HasSecret { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("updatedAt")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("url")]
	public string Url { get; set; }

	[JsonPropertyName("workspaceId")]
	public string WorkspaceId { get; set; }

}

public sealed class WebhookEndpointCreateRequest
{
	[JsonPropertyName("events")]
	public List<string>? Events { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("url")]
	public string Url { get; set; }

}

public sealed class WebhookEndpointDeleteResponse
{
	[JsonPropertyName("deleted")]
	public bool Deleted { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("object")]
	public string Object { get; set; }

}

public sealed class WebhookEndpointInput
{
	[JsonPropertyName("events")]
	public List<string>? Events { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class WebhookEndpointListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("object")]
	public string Object { get; set; }

}

public sealed class WebhookEndpointSecretResponse
{
	[JsonPropertyName("createdAt")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("createdBy")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("deletedAt")]
	public string? DeletedAt { get; set; }

	[JsonPropertyName("events")]
	public List<string> Events { get; set; }

	[JsonPropertyName("hasSecret")]
	public bool HasSecret { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("signing_secret")]
	public string SigningSecret { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("updatedAt")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("url")]
	public string Url { get; set; }

	[JsonPropertyName("workspaceId")]
	public string WorkspaceId { get; set; }

}

public sealed class WebhookEndpointUpdateRequest
{
	[JsonPropertyName("events")]
	public List<string>? Events { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class Workspace
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class WorkspaceActivityEntry
{
	[JsonPropertyName("cost_cents")]
	public double CostCents { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("latency_ms")]
	public long? LatencyMs { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("timestamp")]
	public string? Timestamp { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class WorkspaceActivityResponse
{
	[JsonPropertyName("activity")]
	public List<Dictionary<string, object>> Activity { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("period_days")]
	public long PeriodDays { get; set; }

	[JsonPropertyName("total")]
	public long Total { get; set; }

	[JsonPropertyName("total_cost_cents")]
	public double TotalCostCents { get; set; }

}

public sealed class WorkspaceApp
{
	[JsonPropertyName("app_key")]
	public string AppKey { get; set; }

	[JsonPropertyName("category")]
	public string? Category { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("docs_url")]
	public string? DocsUrl { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("image_url")]
	public string? ImageUrl { get; set; }

	[JsonPropertyName("is_active")]
	public bool IsActive { get; set; }

	[JsonPropertyName("is_managed")]
	public bool IsManaged { get; set; }

	[JsonPropertyName("is_public")]
	public bool IsPublic { get; set; }

	[JsonPropertyName("last_seen")]
	public string? LastSeen { get; set; }

	[JsonPropertyName("title")]
	public string Title { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class WorkspaceAppListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("limit")]
	public long Limit { get; set; }

	[JsonPropertyName("offset")]
	public long Offset { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class WorkspaceAppMergeRequest
{
	[JsonPropertyName("target_app_id")]
	public string TargetAppId { get; set; }

}

public sealed class WorkspaceAppMergeResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceAppResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceAppUpdateRequest
{
	[JsonPropertyName("category")]
	public string? Category { get; set; }

	[JsonPropertyName("docs_url")]
	public string? DocsUrl { get; set; }

	[JsonPropertyName("image_url")]
	public string? ImageUrl { get; set; }

	[JsonPropertyName("is_active")]
	public bool? IsActive { get; set; }

	[JsonPropertyName("is_public")]
	public bool? IsPublic { get; set; }

	[JsonPropertyName("title")]
	public string? Title { get; set; }

	[JsonPropertyName("url")]
	public string? Url { get; set; }

}

public sealed class WorkspaceAssignableRole { }

public sealed class WorkspaceAuditEvent
{
	[JsonPropertyName("action")]
	public string Action { get; set; }

	[JsonPropertyName("actor")]
	public Dictionary<string, object>? Actor { get; set; }

	[JsonPropertyName("actor_user_id")]
	public string? ActorUserId { get; set; }

	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object> Metadata { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("target_id")]
	public string TargetId { get; set; }

	[JsonPropertyName("target_name")]
	public string? TargetName { get; set; }

	[JsonPropertyName("target_type")]
	public string TargetType { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceAuditEventActor
{
	[JsonPropertyName("display_name")]
	public string? DisplayName { get; set; }

	[JsonPropertyName("email")]
	public string? Email { get; set; }

}

public sealed class WorkspaceAuditEventLimits
{
	[JsonPropertyName("dailyCostNanos")]
	public long? DailyCostNanos { get; set; }

	[JsonPropertyName("dailyRequests")]
	public long? DailyRequests { get; set; }

	[JsonPropertyName("monthlyCostNanos")]
	public long? MonthlyCostNanos { get; set; }

	[JsonPropertyName("monthlyRequests")]
	public long? MonthlyRequests { get; set; }

	[JsonPropertyName("softBlocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("weeklyCostNanos")]
	public long? WeeklyCostNanos { get; set; }

	[JsonPropertyName("weeklyRequests")]
	public long? WeeklyRequests { get; set; }

}

public sealed class WorkspaceAuditEventListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("has_more")]
	public bool HasMore { get; set; }

	[JsonPropertyName("next_cursor")]
	public string? NextCursor { get; set; }

}

public sealed class WorkspaceAuditEventMetadata
{
	[JsonPropertyName("accessTemplate")]
	public string? AccessTemplate { get; set; }

	[JsonPropertyName("changedFields")]
	public List<string>? ChangedFields { get; set; }

	[JsonPropertyName("expiresAt")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("limits")]
	public Dictionary<string, object>? Limits { get; set; }

	[JsonPropertyName("prefix")]
	public string? Prefix { get; set; }

	[JsonPropertyName("previousKeyExpiresAt")]
	public string? PreviousKeyExpiresAt { get; set; }

	[JsonPropertyName("replacementKeyId")]
	public string? ReplacementKeyId { get; set; }

	[JsonPropertyName("replacementKeyName")]
	public string? ReplacementKeyName { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class WorkspaceAutoTopUpSettings
{
	[JsonPropertyName("amount_nanos")]
	public long AmountNanos { get; set; }

	[JsonPropertyName("balance_threshold_nanos")]
	public long BalanceThresholdNanos { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("payment_method_id")]
	public string? PaymentMethodId { get; set; }

}

public sealed class WorkspaceAutoTopUpUpdate
{
	[JsonPropertyName("amount_nanos")]
	public long? AmountNanos { get; set; }

	[JsonPropertyName("balance_threshold_nanos")]
	public long? BalanceThresholdNanos { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("payment_method_id")]
	public string? PaymentMethodId { get; set; }

}

public sealed class WorkspaceBudget
{
	[JsonPropertyName("created_at")]
	public string CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("exceeded")]
	public bool Exceeded { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("interval")]
	public string Interval { get; set; }

	[JsonPropertyName("limit")]
	public double Limit { get; set; }

	[JsonPropertyName("limit_nanos")]
	public long LimitNanos { get; set; }

	[JsonPropertyName("remaining")]
	public double Remaining { get; set; }

	[JsonPropertyName("remaining_nanos")]
	public long RemainingNanos { get; set; }

	[JsonPropertyName("reset_at")]
	public string? ResetAt { get; set; }

	[JsonPropertyName("updated_at")]
	public string UpdatedAt { get; set; }

	[JsonPropertyName("usage")]
	public double Usage { get; set; }

	[JsonPropertyName("usage_nanos")]
	public long UsageNanos { get; set; }

	[JsonPropertyName("window_start")]
	public string? WindowStart { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceBudgetDeleteResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceBudgetInput
{
	[JsonPropertyName("interval")]
	public string Interval { get; set; }

	[JsonPropertyName("limit")]
	public double Limit { get; set; }

}

public sealed class WorkspaceBudgetInterval { }

public sealed class WorkspaceBudgetListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceBudgetResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceBudgetUpdateInput
{
	[JsonPropertyName("interval")]
	public string? Interval { get; set; }

	[JsonPropertyName("limit")]
	public double? Limit { get; set; }

}

public sealed class WorkspaceCreateRequest
{
	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

}

public sealed class WorkspaceDepartment
{
	[JsonPropertyName("color")]
	public string? Color { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("directory_name")]
	public string? DirectoryName { get; set; }

	[JsonPropertyName("icon")]
	public string? Icon { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("name_overridden")]
	public bool? NameOverridden { get; set; }

	[JsonPropertyName("source_id")]
	public string? SourceId { get; set; }

	[JsonPropertyName("source_type")]
	public string? SourceType { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class WorkspaceDepartmentCreateRequest
{
	[JsonPropertyName("color")]
	public string? Color { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("icon")]
	public string? Icon { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

}

public sealed class WorkspaceDepartmentInput
{
	[JsonPropertyName("color")]
	public string? Color { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("icon")]
	public string? Icon { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

}

public sealed class WorkspaceDepartmentListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceDepartmentMember
{
	[JsonPropertyName("department_id")]
	public string DepartmentId { get; set; }

	[JsonPropertyName("is_primary")]
	public bool IsPrimary { get; set; }

	[JsonPropertyName("position")]
	public string Position { get; set; }

	[JsonPropertyName("user_id")]
	public string UserId { get; set; }

}

public sealed class WorkspaceDepartmentMemberRequest
{
	[JsonPropertyName("position")]
	public string? Position { get; set; }

	[JsonPropertyName("primary")]
	public bool? Primary { get; set; }

}

public sealed class WorkspaceDepartmentMemberResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceDepartmentResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceDepartmentUpdateRequest
{
	[JsonPropertyName("color")]
	public string? Color { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("icon")]
	public string? Icon { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

}

public sealed class WorkspaceDirectoryMember
{
	[JsonPropertyName("access_source")]
	public string AccessSource { get; set; }

	[JsonPropertyName("department")]
	public Dictionary<string, object>? Department { get; set; }

	[JsonPropertyName("department_override_enabled")]
	public bool DepartmentOverrideEnabled { get; set; }

	[JsonPropertyName("department_override_id")]
	public string? DepartmentOverrideId { get; set; }

	[JsonPropertyName("department_source")]
	public string DepartmentSource { get; set; }

	[JsonPropertyName("directory_department")]
	public string? DirectoryDepartment { get; set; }

	[JsonPropertyName("display_name")]
	public string DisplayName { get; set; }

	[JsonPropertyName("effective_role")]
	public string EffectiveRole { get; set; }

	[JsonPropertyName("email")]
	public string? Email { get; set; }

	[JsonPropertyName("joined_at")]
	public string? JoinedAt { get; set; }

	[JsonPropertyName("role_override")]
	public string? RoleOverride { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("user_id")]
	public string UserId { get; set; }

	[JsonPropertyName("workspace_role")]
	public string WorkspaceRole { get; set; }

}

public sealed class WorkspaceDirectoryMemberUpdateRequest
{
	[JsonPropertyName("access_role")]
	public string? AccessRole { get; set; }

	[JsonPropertyName("department_id")]
	public string? DepartmentId { get; set; }

	[JsonPropertyName("department_mode")]
	public string? DepartmentMode { get; set; }

	[JsonPropertyName("department_position")]
	public string? DepartmentPosition { get; set; }

}

public sealed class WorkspaceDirectoryResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceGroupMapping
{
	[JsonPropertyName("access_role")]
	public string AccessRole { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("department_id")]
	public string DepartmentId { get; set; }

	[JsonPropertyName("department_position")]
	public string DepartmentPosition { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("scim_group_id")]
	public string ScimGroupId { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class WorkspaceGroupMappingCreateRequest
{
	[JsonPropertyName("access_role")]
	public string? AccessRole { get; set; }

	[JsonPropertyName("department_id")]
	public string DepartmentId { get; set; }

	[JsonPropertyName("department_position")]
	public string? DepartmentPosition { get; set; }

	[JsonPropertyName("scim_group_id")]
	public string ScimGroupId { get; set; }

}

public sealed class WorkspaceGroupMappingListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceGroupMappingResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceGroupMappingUpdateRequest
{
	[JsonPropertyName("access_role")]
	public string? AccessRole { get; set; }

	[JsonPropertyName("department_position")]
	public string? DepartmentPosition { get; set; }

}

public sealed class WorkspaceInvite
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("creator_user_id")]
	public string CreatorUserId { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("max_uses")]
	public long? MaxUses { get; set; }

	[JsonPropertyName("role")]
	public string Role { get; set; }

	[JsonPropertyName("token_preview")]
	public string? TokenPreview { get; set; }

	[JsonPropertyName("uses_count")]
	public long? UsesCount { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceInviteCreateRequest
{
	[JsonPropertyName("expires_in_days")]
	public long? ExpiresInDays { get; set; }

	[JsonPropertyName("max_uses")]
	public long? MaxUses { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

}

public sealed class WorkspaceInviteCreateResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

	[JsonPropertyName("token")]
	public string Token { get; set; }

}

public sealed class WorkspaceInviteListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class WorkspaceJoinRequest
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("decided_at")]
	public string? DecidedAt { get; set; }

	[JsonPropertyName("decided_by")]
	public string? DecidedBy { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("invite_id")]
	public string? InviteId { get; set; }

	[JsonPropertyName("requester_user_id")]
	public string RequesterUserId { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceJoinRequestListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class WorkspaceJoinRequestResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceJoinRequestStatus { }

public sealed class WorkspaceListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class WorkspaceLowBalanceEmailSettings
{
	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("threshold_usd")]
	public double ThresholdUsd { get; set; }

}

public sealed class WorkspaceLowBalanceEmailUpdate
{
	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("threshold_usd")]
	public double? ThresholdUsd { get; set; }

}

public sealed class WorkspaceMember
{
	[JsonPropertyName("display_name")]
	public string? DisplayName { get; set; }

	[JsonPropertyName("joined_at")]
	public string? JoinedAt { get; set; }

	[JsonPropertyName("role")]
	public string Role { get; set; }

	[JsonPropertyName("user_id")]
	public string UserId { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceMemberAddResponse
{
	[JsonPropertyName("added_count")]
	public long AddedCount { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceMemberBulkRequest
{
	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("user_ids")]
	public List<string> UserIds { get; set; }

}

public sealed class WorkspaceMemberListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public long TotalCount { get; set; }

}

public sealed class WorkspaceMemberRemoveRequest
{
	[JsonPropertyName("user_ids")]
	public List<string> UserIds { get; set; }

}

public sealed class WorkspaceMemberRemoveResponse
{
	[JsonPropertyName("removed_count")]
	public long RemovedCount { get; set; }

}

public sealed class WorkspaceMemberResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceMemberRoleUpdateRequest
{
	[JsonPropertyName("role")]
	public string Role { get; set; }

}

public sealed class WorkspaceNotificationDestination
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

	[JsonPropertyName("target_preview")]
	public string TargetPreview { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class WorkspaceNotificationDestinationCreateRequest
{
	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("target")]
	public string Target { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class WorkspaceNotificationDestinationListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceNotificationDestinationResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceNotificationDestinationTestRequest
{
	[JsonPropertyName("target")]
	public string Target { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class WorkspaceNotificationDestinationType { }

public sealed class WorkspaceNotificationEmailPreferences
{
	[JsonPropertyName("auto_top_up_failure")]
	public bool AutoTopUpFailure { get; set; }

	[JsonPropertyName("model_deprecation")]
	public bool ModelDeprecation { get; set; }

	[JsonPropertyName("payment_method_expiring")]
	public bool PaymentMethodExpiring { get; set; }

}

public sealed class WorkspaceNotificationEmailPreferencesUpdate
{
	[JsonPropertyName("auto_top_up_failure")]
	public bool? AutoTopUpFailure { get; set; }

	[JsonPropertyName("model_deprecation")]
	public bool? ModelDeprecation { get; set; }

	[JsonPropertyName("payment_method_expiring")]
	public bool? PaymentMethodExpiring { get; set; }

}

public sealed class WorkspaceNotificationEventKind { }

public sealed class WorkspaceNotificationRoute
{
	[JsonPropertyName("destination_ids")]
	public List<string> DestinationIds { get; set; }

	[JsonPropertyName("event_kind")]
	public string EventKind { get; set; }

}

public sealed class WorkspaceNotificationRouteMap
{
	[JsonPropertyName("auto_top_up_failed")]
	public List<string> AutoTopUpFailed { get; set; }

	[JsonPropertyName("low_balance")]
	public List<string> LowBalance { get; set; }

	[JsonPropertyName("model_deprecation")]
	public List<string> ModelDeprecation { get; set; }

	[JsonPropertyName("payment_method_expiring")]
	public List<string> PaymentMethodExpiring { get; set; }

}

public sealed class WorkspaceNotificationRouteResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceNotificationRoutesResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceNotificationRouteUpdateRequest
{
	[JsonPropertyName("destination_ids")]
	public List<string> DestinationIds { get; set; }

}

public sealed class WorkspaceNotificationSettings
{
	[JsonPropertyName("auto_top_up")]
	public Dictionary<string, object> AutoTopUp { get; set; }

	[JsonPropertyName("email_preferences")]
	public Dictionary<string, object> EmailPreferences { get; set; }

	[JsonPropertyName("low_balance_email")]
	public Dictionary<string, object> LowBalanceEmail { get; set; }

}

public sealed class WorkspaceNotificationSettingsResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceNotificationSettingsUpdateRequest
{
	[JsonPropertyName("auto_top_up")]
	public Dictionary<string, object>? AutoTopUp { get; set; }

	[JsonPropertyName("email_preferences")]
	public Dictionary<string, object>? EmailPreferences { get; set; }

	[JsonPropertyName("low_balance_email")]
	public Dictionary<string, object>? LowBalanceEmail { get; set; }

}

public sealed class WorkspaceNotificationTestResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceProviderRestrictionMode { }

public sealed class WorkspaceResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceRole { }

public sealed class WorkspaceRoutingMode { }

public sealed class WorkspaceScimAuditResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

}

public sealed class WorkspaceScimEndpoint
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

}

public sealed class WorkspaceScimEndpointResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceScimEvent
{
	[JsonPropertyName("action")]
	public string? Action { get; set; }

	[JsonPropertyName("correlation_id")]
	public string? CorrelationId { get; set; }

	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("detail")]
	public Dictionary<string, object>? Detail { get; set; }

	[JsonPropertyName("http_status")]
	public long? HttpStatus { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("outcome")]
	public string? Outcome { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("resource_id")]
	public string? ResourceId { get; set; }

	[JsonPropertyName("resource_type")]
	public string? ResourceType { get; set; }

	[JsonPropertyName("scim_type")]
	public string? ScimType { get; set; }

}

public sealed class WorkspaceScimResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceScimToken
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("label")]
	public string Label { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

	[JsonPropertyName("revoked_at")]
	public string? RevokedAt { get; set; }

	[JsonPropertyName("token_prefix")]
	public string TokenPrefix { get; set; }

}

public sealed class WorkspaceScimTokenCreateRequest
{
	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("label")]
	public string? Label { get; set; }

}

public sealed class WorkspaceScimTokenCreateResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceScimUpdateRequest
{
	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

}

public sealed class WorkspaceSettings
{
	[JsonPropertyName("alpha_channel_enabled")]
	public bool? AlphaChannelEnabled { get; set; }

	[JsonPropertyName("beta_channel_enabled")]
	public bool? BetaChannelEnabled { get; set; }

	[JsonPropertyName("byok_fallback_enabled")]
	public bool? ByokFallbackEnabled { get; set; }

	[JsonPropertyName("io_logging_enabled")]
	public bool? IoLoggingEnabled { get; set; }

	[JsonPropertyName("io_logging_include_provider_payloads")]
	public bool? IoLoggingIncludeProviderPayloads { get; set; }

	[JsonPropertyName("privacy_enable_free_may_publish_prompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacy_enable_free_may_train")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacy_enable_input_output_logging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacy_enable_paid_may_train")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacy_zdr_only")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("provider_restriction_enforce_allowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("provider_restriction_mode")]
	public object? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("provider_restriction_provider_ids")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("response_healing_enabled")]
	public bool? ResponseHealingEnabled { get; set; }

	[JsonPropertyName("response_healing_locked")]
	public bool? ResponseHealingLocked { get; set; }

	[JsonPropertyName("response_healing_mode")]
	public string? ResponseHealingMode { get; set; }

	[JsonPropertyName("routing_mode")]
	public object? RoutingMode { get; set; }

	[JsonPropertyName("updated_at")]
	public string? UpdatedAt { get; set; }

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class WorkspaceSettingsResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceSettingsUpdateRequest
{
	[JsonPropertyName("alpha_channel_enabled")]
	public bool? AlphaChannelEnabled { get; set; }

	[JsonPropertyName("beta_channel_enabled")]
	public bool? BetaChannelEnabled { get; set; }

	[JsonPropertyName("byok_fallback_enabled")]
	public bool? ByokFallbackEnabled { get; set; }

	[JsonPropertyName("io_logging_enabled")]
	public bool? IoLoggingEnabled { get; set; }

	[JsonPropertyName("io_logging_include_provider_payloads")]
	public bool? IoLoggingIncludeProviderPayloads { get; set; }

	[JsonPropertyName("privacy_enable_free_may_publish_prompts")]
	public bool? PrivacyEnableFreeMayPublishPrompts { get; set; }

	[JsonPropertyName("privacy_enable_free_may_train")]
	public bool? PrivacyEnableFreeMayTrain { get; set; }

	[JsonPropertyName("privacy_enable_input_output_logging")]
	public bool? PrivacyEnableInputOutputLogging { get; set; }

	[JsonPropertyName("privacy_enable_paid_may_train")]
	public bool? PrivacyEnablePaidMayTrain { get; set; }

	[JsonPropertyName("privacy_zdr_only")]
	public bool? PrivacyZdrOnly { get; set; }

	[JsonPropertyName("provider_restriction_enforce_allowed")]
	public bool? ProviderRestrictionEnforceAllowed { get; set; }

	[JsonPropertyName("provider_restriction_mode")]
	public string? ProviderRestrictionMode { get; set; }

	[JsonPropertyName("provider_restriction_provider_ids")]
	public List<string>? ProviderRestrictionProviderIds { get; set; }

	[JsonPropertyName("response_healing_enabled")]
	public bool? ResponseHealingEnabled { get; set; }

	[JsonPropertyName("response_healing_locked")]
	public bool? ResponseHealingLocked { get; set; }

	[JsonPropertyName("response_healing_mode")]
	public string? ResponseHealingMode { get; set; }

	[JsonPropertyName("routing_mode")]
	public string? RoutingMode { get; set; }

}

public sealed class WorkspaceSsoResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceSsoSettings
{
	[JsonPropertyName("domains")]
	public List<string> Domains { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("enforced")]
	public bool Enforced { get; set; }

	[JsonPropertyName("mode")]
	public string Mode { get; set; }

	[JsonPropertyName("provider_identifier")]
	public string? ProviderIdentifier { get; set; }

}

public sealed class WorkspaceSsoUpdateRequest
{
	[JsonPropertyName("domains")]
	public List<string>? Domains { get; set; }

	[JsonPropertyName("enabled")]
	public bool Enabled { get; set; }

	[JsonPropertyName("enforced")]
	public bool? Enforced { get; set; }

	[JsonPropertyName("mode")]
	public string Mode { get; set; }

	[JsonPropertyName("provider_identifier")]
	public string? ProviderIdentifier { get; set; }

}

public sealed class WorkspaceUpdateRequest
{
	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

}
