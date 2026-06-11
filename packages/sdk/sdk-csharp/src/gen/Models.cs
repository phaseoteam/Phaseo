using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AiStats.Gen;

public sealed class ActivityEntry
{
	[JsonPropertyName("byok_usage_inference")]
	public double ByokUsageInference { get; set; }

	[JsonPropertyName("completion_tokens")]
	public int CompletionTokens { get; set; }

	[JsonPropertyName("date")]
	public string Date { get; set; }

	[JsonPropertyName("endpoint_id")]
	public string EndpointId { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("model_permaslug")]
	public string ModelPermaslug { get; set; }

	[JsonPropertyName("prompt_tokens")]
	public int PromptTokens { get; set; }

	[JsonPropertyName("provider_name")]
	public string ProviderName { get; set; }

	[JsonPropertyName("reasoning_tokens")]
	public int ReasoningTokens { get; set; }

	[JsonPropertyName("requests")]
	public int Requests { get; set; }

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
	public string Ok { get; set; }

}

public sealed class AnalyticsNotImplementedResponse
{
	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

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
	public int MaxTokens { get; set; }

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
	public int? TopK { get; set; }

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
	public int? InputTokens { get; set; }

	[JsonPropertyName("output_tokens")]
	public int? OutputTokens { get; set; }

}

public sealed class ApiKey
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("disabled")]
	public bool Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("hash")]
	public string Hash { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("label")]
	public string? Label { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

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

	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

	[JsonPropertyName("workspace_id")]
	public string? WorkspaceId { get; set; }

}

public sealed class ApiKeyListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public int TotalCount { get; set; }

}

public sealed class ApiKeyResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

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

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("scopes")]
	public object? Scopes { get; set; }

	[JsonPropertyName("soft_blocked")]
	public bool? SoftBlocked { get; set; }

}

public sealed class ApiKeyWithValue
{
	[JsonPropertyName("created_at")]
	public string? CreatedAt { get; set; }

	[JsonPropertyName("created_by")]
	public string? CreatedBy { get; set; }

	[JsonPropertyName("disabled")]
	public bool Disabled { get; set; }

	[JsonPropertyName("expires_at")]
	public string? ExpiresAt { get; set; }

	[JsonPropertyName("hash")]
	public string Hash { get; set; }

	[JsonPropertyName("id")]
	public string Id { get; set; }

	[JsonPropertyName("key")]
	public string Key { get; set; }

	[JsonPropertyName("label")]
	public string? Label { get; set; }

	[JsonPropertyName("last_used_at")]
	public string? LastUsedAt { get; set; }

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

	[JsonPropertyName("workspace_id")]
	public string WorkspaceId { get; set; }

}

public sealed class ApiKeyWithValueResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

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
	public int? CostNanos { get; set; }

	[JsonPropertyName("cost_usd")]
	public double? CostUsd { get; set; }

	[JsonPropertyName("finalized_at")]
	public string? FinalizedAt { get; set; }

	[JsonPropertyName("pricing_breakdown")]
	public Dictionary<string, object>? PricingBreakdown { get; set; }

	[JsonPropertyName("reason")]
	public string? Reason { get; set; }

}

public sealed class BatchRequest
{
	[JsonPropertyName("completion_window")]
	public string? CompletionWindow { get; set; }

	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("endpoint")]
	public string Endpoint { get; set; }

	[JsonPropertyName("input_file_id")]
	public string InputFileId { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

}

public sealed class BatchRequestCounts
{
	[JsonPropertyName("completed")]
	public int? Completed { get; set; }

	[JsonPropertyName("failed")]
	public int? Failed { get; set; }

	[JsonPropertyName("total")]
	public int? Total { get; set; }

}

public sealed class BatchResponse
{
	[JsonPropertyName("billing")]
	public Dictionary<string, object>? Billing { get; set; }

	[JsonPropertyName("cancelled_at")]
	public int? CancelledAt { get; set; }

	[JsonPropertyName("cancelling_at")]
	public int? CancellingAt { get; set; }

	[JsonPropertyName("completed_at")]
	public int? CompletedAt { get; set; }

	[JsonPropertyName("completion_window")]
	public string? CompletionWindow { get; set; }

	[JsonPropertyName("created_at")]
	public int? CreatedAt { get; set; }

	[JsonPropertyName("endpoint")]
	public string? Endpoint { get; set; }

	[JsonPropertyName("error_file_id")]
	public string? ErrorFileId { get; set; }

	[JsonPropertyName("errors")]
	public Dictionary<string, object>? Errors { get; set; }

	[JsonPropertyName("expired_at")]
	public int? ExpiredAt { get; set; }

	[JsonPropertyName("expires_at")]
	public int? ExpiresAt { get; set; }

	[JsonPropertyName("failed_at")]
	public int? FailedAt { get; set; }

	[JsonPropertyName("finalizing_at")]
	public int? FinalizingAt { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("in_progress_at")]
	public int? InProgressAt { get; set; }

	[JsonPropertyName("input_file_id")]
	public string? InputFileId { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output_file_id")]
	public string? OutputFileId { get; set; }

	[JsonPropertyName("pricing_lines")]
	public List<Dictionary<string, object>>? PricingLines { get; set; }

	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("request_counts")]
	public Dictionary<string, object>? RequestCounts { get; set; }

	[JsonPropertyName("request_id")]
	public string? RequestId { get; set; }

	[JsonPropertyName("session_id")]
	public string? SessionId { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

	[JsonPropertyName("webhook")]
	public Dictionary<string, object>? Webhook { get; set; }

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
	public int? Index { get; set; }

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
	public int? MaxCompletionTokens { get; set; }

	[JsonPropertyName("max_tokens")]
	public int? MaxTokens { get; set; }

	[JsonPropertyName("max_tool_calls")]
	public int? MaxToolCalls { get; set; }

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
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("provider_options")]
	public Dictionary<string, object>? ProviderOptions { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("response_format")]
	public object? ResponseFormat { get; set; }

	[JsonPropertyName("safety_identifier")]
	public string? SafetyIdentifier { get; set; }

	[JsonPropertyName("seed")]
	public int? Seed { get; set; }

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
	public int? TopLogprobs { get; set; }

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
	public int? Created { get; set; }

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
	public string Ok { get; set; }

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
	public string Deleted { get; set; }

}

public sealed class Embedding
{
	[JsonPropertyName("embedding")]
	public List<double>? EmbeddingValue { get; set; }

	[JsonPropertyName("index")]
	public int? Index { get; set; }

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
	public int? Dimensions { get; set; }

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

public sealed class ErrorFailureSampleItem
{
	[JsonPropertyName("provider")]
	public string? Provider { get; set; }

	[JsonPropertyName("retryable")]
	public bool? Retryable { get; set; }

	[JsonPropertyName("status")]
	public int? Status { get; set; }

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
	public int? CandidateCount { get; set; }

	[JsonPropertyName("droppedMissingAdapter")]
	public List<Dictionary<string, object>>? DroppedMissingAdapter { get; set; }

	[JsonPropertyName("droppedUnsupportedEndpoint")]
	public List<string>? DroppedUnsupportedEndpoint { get; set; }

	[JsonPropertyName("supportsEndpointCount")]
	public int? SupportsEndpointCount { get; set; }

	[JsonPropertyName("totalProviders")]
	public int? TotalProviders { get; set; }

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
	public int? AttemptCount { get; set; }

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
	public List<int>? FailedStatuses { get; set; }

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
	public int? StatusCode { get; set; }

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
	public int? Bytes { get; set; }

	[JsonPropertyName("created_at")]
	public int? CreatedAt { get; set; }

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
	[JsonPropertyName("function")]
	public Dictionary<string, object> Function { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayAdvisorToolDefinition
{
	[JsonPropertyName("forward_transcript")]
	public bool? ForwardTranscript { get; set; }

	[JsonPropertyName("instructions")]
	public string? Instructions { get; set; }

	[JsonPropertyName("max_completion_tokens")]
	public int? MaxCompletionTokens { get; set; }

	[JsonPropertyName("max_tokens")]
	public int? MaxTokens { get; set; }

	[JsonPropertyName("max_uses")]
	public int? MaxUses { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayApplyPatchToolDefinition
{
	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayDatetimeToolDefinition
{
	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("timezone")]
	public string? Timezone { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayImageGenerationToolDefinition
{
	[JsonPropertyName("aspect_ratio")]
	public string? AspectRatio { get; set; }

	[JsonPropertyName("background")]
	public string? Background { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("moderation")]
	public string? Moderation { get; set; }

	[JsonPropertyName("output_compression")]
	public int? OutputCompression { get; set; }

	[JsonPropertyName("output_format")]
	public string? OutputFormat { get; set; }

	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("prompt")]
	public string? Prompt { get; set; }

	[JsonPropertyName("quality")]
	public string? Quality { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayModelsResponse
{
	[JsonPropertyName("availability_mode")]
	public string AvailabilityMode { get; set; }

	[JsonPropertyName("limit")]
	public int Limit { get; set; }

	[JsonPropertyName("models")]
	public List<Dictionary<string, object>> Models { get; set; }

	[JsonPropertyName("offset")]
	public int Offset { get; set; }

	[JsonPropertyName("ok")]
	public bool Ok { get; set; }

	[JsonPropertyName("privacy_scope")]
	public string PrivacyScope { get; set; }

	[JsonPropertyName("total")]
	public int Total { get; set; }

}

public sealed class GatewayWebFetchToolDefinition
{
	[JsonPropertyName("max_chars")]
	public int? MaxChars { get; set; }

	[JsonPropertyName("parameters")]
	public Dictionary<string, object>? Parameters { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class GatewayWebSearchToolDefinition
{
	[JsonPropertyName("include_highlights")]
	public bool? IncludeHighlights { get; set; }

	[JsonPropertyName("include_text")]
	public bool? IncludeText { get; set; }

	[JsonPropertyName("max_results")]
	public int? MaxResults { get; set; }

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
	public int? N { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

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
	public int? Created { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

}

public sealed class ImagesGenerationRequest
{
	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("n")]
	public int? N { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("quality")]
	public string? Quality { get; set; }

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
	public int? Created { get; set; }

	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

}

public sealed class InvalidRequestResponse
{
	[JsonPropertyName("error")]
	public string Error { get; set; }

	[JsonPropertyName("max_offset")]
	public int? MaxOffset { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

}

public sealed class KeyInvalidateResponse
{
	[JsonPropertyName("cache_version")]
	public Dictionary<string, object> CacheVersion { get; set; }

	[JsonPropertyName("key")]
	public Dictionary<string, object> Key { get; set; }

	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

}

public sealed class KnownModelId { }

public sealed class ListFilesResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

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
	public string Ok { get; set; }

}

public sealed class ManagementKeyDeleteResponse
{
	[JsonPropertyName("message")]
	public string Message { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

}

public sealed class ManagementKeyDetailResponse
{
	[JsonPropertyName("key")]
	public Dictionary<string, object> Key { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

}

public sealed class ManagementKeyListResponse
{
	[JsonPropertyName("keys")]
	public List<Dictionary<string, object>> Keys { get; set; }

	[JsonPropertyName("limit")]
	public int Limit { get; set; }

	[JsonPropertyName("offset")]
	public int Offset { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

	[JsonPropertyName("total")]
	public int Total { get; set; }

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
	public string Ok { get; set; }

}

public sealed class MessageContentPart { }

public sealed class Model
{
	[JsonPropertyName("aliases")]
	public List<string>? Aliases { get; set; }

	[JsonPropertyName("architecture")]
	public Dictionary<string, object>? Architecture { get; set; }

	[JsonPropertyName("availability")]
	public Dictionary<string, object>? Availability { get; set; }

	[JsonPropertyName("canonical_slug")]
	public string? CanonicalSlug { get; set; }

	[JsonPropertyName("created")]
	public int? Created { get; set; }

	[JsonPropertyName("deprecation_date")]
	public string? DeprecationDate { get; set; }

	[JsonPropertyName("description")]
	public string? Description { get; set; }

	[JsonPropertyName("endpoints")]
	public List<string>? Endpoints { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("input_types")]
	public List<string>? InputTypes { get; set; }

	[JsonPropertyName("lifecycle")]
	public ModelLifecycle? Lifecycle { get; set; }

	[JsonPropertyName("model_id")]
	public string? ModelId { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("organisation_colour")]
	public string? OrganisationColour { get; set; }

	[JsonPropertyName("organisation_id")]
	public string? OrganisationId { get; set; }

	[JsonPropertyName("organisation_name")]
	public string? OrganisationName { get; set; }

	[JsonPropertyName("output_types")]
	public List<string>? OutputTypes { get; set; }

	[JsonPropertyName("per_request_limits")]
	public Dictionary<string, object>? PerRequestLimits { get; set; }

	[JsonPropertyName("pricing")]
	public Dictionary<string, object>? Pricing { get; set; }

	[JsonPropertyName("pricing_detail")]
	public Dictionary<string, object>? PricingDetail { get; set; }

	[JsonPropertyName("providers")]
	public List<Dictionary<string, object>>? Providers { get; set; }

	[JsonPropertyName("release_date")]
	public string? ReleaseDate { get; set; }

	[JsonPropertyName("retirement_date")]
	public string? RetirementDate { get; set; }

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

	[JsonPropertyName("top_provider")]
	public Dictionary<string, object>? TopProvider { get; set; }

	[JsonPropertyName("top_provider_id")]
	public string? TopProviderId { get; set; }

}

public sealed class ModelAvailability
{
	[JsonPropertyName("active_provider_count")]
	public int ActiveProviderCount { get; set; }

	[JsonPropertyName("inactive_provider_count")]
	public int InactiveProviderCount { get; set; }

	[JsonPropertyName("provider_count")]
	public int ProviderCount { get; set; }

	[JsonPropertyName("status")]
	public string Status { get; set; }

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

	[JsonPropertyName("is_active_gateway")]
	public bool IsActiveGateway { get; set; }

	[JsonPropertyName("model_routing_status")]
	public string ModelRoutingStatus { get; set; }

	[JsonPropertyName("params")]
	public List<string> Params { get; set; }

	[JsonPropertyName("params_detail")]
	public Dictionary<string, object>? ParamsDetail { get; set; }

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
	public int? Duration { get; set; }

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
}

public sealed class NotImplementedResponse
{
	[JsonPropertyName("description")]
	public string Description { get; set; }

	[JsonPropertyName("error")]
	public string Error { get; set; }

	[JsonPropertyName("status_code")]
	public int StatusCode { get; set; }

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

public sealed class RealtimeNotImplementedResponse
{
	[JsonPropertyName("error")]
	public Dictionary<string, object> Error { get; set; }

}

public sealed class ReasoningConfig
{
	[JsonPropertyName("effort")]
	public string? Effort { get; set; }

	[JsonPropertyName("enabled")]
	public bool? Enabled { get; set; }

	[JsonPropertyName("max_tokens")]
	public int? MaxTokens { get; set; }

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
	public int? MaxChunksPerDoc { get; set; }

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
	public int? TopK { get; set; }

	[JsonPropertyName("top_n")]
	public int? TopN { get; set; }

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
	public int? Index { get; set; }

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
	public int? MaxOutputTokens { get; set; }

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

	[JsonPropertyName("created")]
	public int? Created { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output")]
	public List<Dictionary<string, object>>? Output { get; set; }

	[JsonPropertyName("output_items")]
	public List<Dictionary<string, object>>? OutputItems { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("stop_reason")]
	public string? StopReason { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class ResponsesWebSocketCreateEvent
{
	[JsonPropertyName("input")]
	public object? Input { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("previous_response_id")]
	public string? PreviousResponseId { get; set; }

	[JsonPropertyName("store")]
	public bool? Store { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<Dictionary<string, object>>? Tools { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class ResponsesWebSocketServerEvent
{
	[JsonPropertyName("error")]
	public Dictionary<string, object>? Error { get; set; }

	[JsonPropertyName("response")]
	public Dictionary<string, object>? Response { get; set; }

	[JsonPropertyName("status")]
	public int? Status { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

}

public sealed class ResponsesWebSocketUpgradeRequiredResponse
{
	[JsonPropertyName("error")]
	public Dictionary<string, object>? Error { get; set; }

}

public sealed class ServerToolUsage
{
	[JsonPropertyName("advisor_requests")]
	public int? AdvisorRequests { get; set; }

	[JsonPropertyName("apply_patch_requests")]
	public int? ApplyPatchRequests { get; set; }

	[JsonPropertyName("datetime_requests")]
	public int? DatetimeRequests { get; set; }

	[JsonPropertyName("image_generation_requests")]
	public int? ImageGenerationRequests { get; set; }

	[JsonPropertyName("web_fetch_requests")]
	public int? WebFetchRequests { get; set; }

	[JsonPropertyName("web_search_extra_results")]
	public int? WebSearchExtraResults { get; set; }

	[JsonPropertyName("web_search_requests")]
	public int? WebSearchRequests { get; set; }

	[JsonPropertyName("web_search_results")]
	public int? WebSearchResults { get; set; }

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

public sealed class Usage
{
	[JsonPropertyName("completion_tokens")]
	public int? CompletionTokens { get; set; }

	[JsonPropertyName("prompt_tokens")]
	public int? PromptTokens { get; set; }

	[JsonPropertyName("server_tool_use")]
	public Dictionary<string, object>? ServerToolUse { get; set; }

	[JsonPropertyName("total_tokens")]
	public int? TotalTokens { get; set; }

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
	public int? CompressionQuality { get; set; }

	[JsonPropertyName("duration")]
	public int? Duration { get; set; }

	[JsonPropertyName("enhance_prompt")]
	public bool? EnhancePrompt { get; set; }

	[JsonPropertyName("generate_audio")]
	public bool? GenerateAudio { get; set; }

	[JsonPropertyName("input_references")]
	public List<Dictionary<string, object>>? InputReferences { get; set; }

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

	[JsonPropertyName("provider_params")]
	public Dictionary<string, object>? ProviderParams { get; set; }

	[JsonPropertyName("resize_mode")]
	public string? ResizeMode { get; set; }

	[JsonPropertyName("resolution")]
	public string? Resolution { get; set; }

	[JsonPropertyName("sample_count")]
	public int? SampleCount { get; set; }

	[JsonPropertyName("seed")]
	public int? Seed { get; set; }

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
	public int? ExpiresAt { get; set; }

	[JsonPropertyName("generation_id")]
	public string? GenerationId { get; set; }

	[JsonPropertyName("id")]
	public string? Id { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("output_access")]
	public string? OutputAccess { get; set; }

	[JsonPropertyName("outputs")]
	public List<Dictionary<string, object>>? Outputs { get; set; }

	[JsonPropertyName("poll_after_seconds")]
	public int? PollAfterSeconds { get; set; }

	[JsonPropertyName("polling_url")]
	public string? PollingUrl { get; set; }

	[JsonPropertyName("progress")]
	public int? Progress { get; set; }

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

}

public sealed class VideoInputReference
{
	[JsonPropertyName("image_url")]
	public Dictionary<string, object>? ImageUrl { get; set; }

	[JsonPropertyName("reference_type")]
	public string? ReferenceType { get; set; }

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

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
	public int? ExpiresAt { get; set; }

	[JsonPropertyName("index")]
	public int? Index { get; set; }

	[JsonPropertyName("mime_type")]
	public string? MimeType { get; set; }

}

public sealed class VideoOutputConfig
{
	[JsonPropertyName("access")]
	public string? Access { get; set; }

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
	public int? LatencyMs { get; set; }

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
	public int Limit { get; set; }

	[JsonPropertyName("offset")]
	public int Offset { get; set; }

	[JsonPropertyName("ok")]
	public string Ok { get; set; }

	[JsonPropertyName("period_days")]
	public int PeriodDays { get; set; }

	[JsonPropertyName("total")]
	public int Total { get; set; }

	[JsonPropertyName("total_cost_cents")]
	public double TotalCostCents { get; set; }

}

public sealed class WorkspaceCreateRequest
{
	[JsonPropertyName("name")]
	public string Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

}

public sealed class WorkspaceListResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>> Data { get; set; }

	[JsonPropertyName("total_count")]
	public int TotalCount { get; set; }

}

public sealed class WorkspaceResponse
{
	[JsonPropertyName("data")]
	public Dictionary<string, object> Data { get; set; }

}

public sealed class WorkspaceUpdateRequest
{
	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("slug")]
	public string? Slug { get; set; }

}
