using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AiStats.Gen;

public sealed class ActivityEntry
{
	[JsonPropertyName("cost_cents")]
	public double? CostCents { get; set; }

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

public sealed class AnthropicContentBlock
{
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

	[JsonPropertyName("max_tokens")]
	public int? MaxTokens { get; set; }

	[JsonPropertyName("messages")]
	public List<Dictionary<string, object>> Messages { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("system")]
	public object? System { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<Dictionary<string, object>>? Tools { get; set; }

	[JsonPropertyName("top_k")]
	public int? TopK { get; set; }

	[JsonPropertyName("top_p")]
	public double? TopP { get; set; }

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

	[JsonPropertyName("request_counts")]
	public Dictionary<string, object>? RequestCounts { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class BenchmarkId { }

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

	[JsonPropertyName("frequency_penalty")]
	public double? FrequencyPenalty { get; set; }

	[JsonPropertyName("logit_bias")]
	public Dictionary<string, object>? LogitBias { get; set; }

	[JsonPropertyName("logprobs")]
	public bool? Logprobs { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public int? MaxOutputTokens { get; set; }

	[JsonPropertyName("max_tool_calls")]
	public int? MaxToolCalls { get; set; }

	[JsonPropertyName("messages")]
	public List<Dictionary<string, object>> Messages { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("parallel_tool_calls")]
	public bool? ParallelToolCalls { get; set; }

	[JsonPropertyName("presence_penalty")]
	public double? PresencePenalty { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("response_format")]
	public object? ResponseFormat { get; set; }

	[JsonPropertyName("seed")]
	public int? Seed { get; set; }

	[JsonPropertyName("service_tier")]
	public string? ServiceTier { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("system")]
	public string? System { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<Dictionary<string, object>>? Tools { get; set; }

	[JsonPropertyName("top_k")]
	public int? TopK { get; set; }

	[JsonPropertyName("top_logprobs")]
	public int? TopLogprobs { get; set; }

	[JsonPropertyName("top_p")]
	public double? TopP { get; set; }

	[JsonPropertyName("usage")]
	public bool? Usage { get; set; }

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

	[JsonPropertyName("object")]
	public string? Object { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class ChatMessage
{
	[JsonPropertyName("content")]
	public object? Content { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("role")]
	public string Role { get; set; }

	[JsonPropertyName("tool_call_id")]
	public string? ToolCallId { get; set; }

	[JsonPropertyName("tool_calls")]
	public List<Dictionary<string, object>>? ToolCalls { get; set; }

}

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

public sealed class Embedding
{
	[JsonPropertyName("embedding")]
	public List<double>? EmbeddingValue { get; set; }

	[JsonPropertyName("index")]
	public int? Index { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class EmbeddingsRequest
{
	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("dimensions")]
	public int? Dimensions { get; set; }

	[JsonPropertyName("embedding_options")]
	public Dictionary<string, object>? EmbeddingOptions { get; set; }

	[JsonPropertyName("encoding_format")]
	public string? EncodingFormat { get; set; }

	[JsonPropertyName("input")]
	public object? Input { get; set; }

	[JsonPropertyName("inputs")]
	public object? Inputs { get; set; }

	[JsonPropertyName("model")]
	public string? Model { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

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

public sealed class ErrorResponse
{
	[JsonPropertyName("error")]
	public string? Error { get; set; }

	[JsonPropertyName("message")]
	public string? Message { get; set; }

	[JsonPropertyName("ok")]
	public bool? Ok { get; set; }

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

public sealed class GenerationResponse
{
	[JsonPropertyName("app_id")]
	public string? AppId { get; set; }

	[JsonPropertyName("byok")]
	public bool? Byok { get; set; }

	[JsonPropertyName("cost_nanos")]
	public double? CostNanos { get; set; }

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

public sealed class ListFilesResponse
{
	[JsonPropertyName("data")]
	public List<Dictionary<string, object>>? Data { get; set; }

	[JsonPropertyName("object")]
	public string? Object { get; set; }

}

public sealed class MessageContentPart { }

public sealed class Model
{
	[JsonPropertyName("aliases")]
	public List<string>? Aliases { get; set; }

	[JsonPropertyName("endpoints")]
	public List<string>? Endpoints { get; set; }

	[JsonPropertyName("input_types")]
	public List<string>? InputTypes { get; set; }

	[JsonPropertyName("model_id")]
	public string? ModelId { get; set; }

	[JsonPropertyName("name")]
	public string? Name { get; set; }

	[JsonPropertyName("organisation_id")]
	public string? OrganisationId { get; set; }

	[JsonPropertyName("output_types")]
	public List<string>? OutputTypes { get; set; }

	[JsonPropertyName("providers")]
	public List<Dictionary<string, object>>? Providers { get; set; }

	[JsonPropertyName("release_date")]
	public string? ReleaseDate { get; set; }

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}

public sealed class ModelId { }

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

public sealed class ProviderRoutingOptions
{
	[JsonPropertyName("ignore")]
	public List<string>? Ignore { get; set; }

	[JsonPropertyName("include_alpha")]
	public bool? IncludeAlpha { get; set; }

	[JsonPropertyName("only")]
	public List<string>? Only { get; set; }

	[JsonPropertyName("order")]
	public List<string>? Order { get; set; }

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

	[JsonPropertyName("summary")]
	public string? Summary { get; set; }

}

public sealed class ResponsesRequest
{
	[JsonPropertyName("background")]
	public bool? Background { get; set; }

	[JsonPropertyName("conversation")]
	public object? Conversation { get; set; }

	[JsonPropertyName("debug")]
	public Dictionary<string, object>? Debug { get; set; }

	[JsonPropertyName("include")]
	public List<string>? Include { get; set; }

	[JsonPropertyName("input")]
	public Dictionary<string, object>? Input { get; set; }

	[JsonPropertyName("input_items")]
	public List<Dictionary<string, object>>? InputItems { get; set; }

	[JsonPropertyName("instructions")]
	public string? Instructions { get; set; }

	[JsonPropertyName("max_output_tokens")]
	public int? MaxOutputTokens { get; set; }

	[JsonPropertyName("max_tool_calls")]
	public int? MaxToolCalls { get; set; }

	[JsonPropertyName("meta")]
	public bool? Meta { get; set; }

	[JsonPropertyName("metadata")]
	public Dictionary<string, object>? Metadata { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("parallel_tool_calls")]
	public bool? ParallelToolCalls { get; set; }

	[JsonPropertyName("previous_response_id")]
	public string? PreviousResponseId { get; set; }

	[JsonPropertyName("prompt")]
	public Dictionary<string, object>? Prompt { get; set; }

	[JsonPropertyName("prompt_cache_key")]
	public string? PromptCacheKey { get; set; }

	[JsonPropertyName("prompt_cache_retention")]
	public string? PromptCacheRetention { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("reasoning")]
	public Dictionary<string, object>? Reasoning { get; set; }

	[JsonPropertyName("safety_identifier")]
	public string? SafetyIdentifier { get; set; }

	[JsonPropertyName("service_tier")]
	public string? ServiceTier { get; set; }

	[JsonPropertyName("store")]
	public bool? Store { get; set; }

	[JsonPropertyName("stream")]
	public bool? Stream { get; set; }

	[JsonPropertyName("stream_options")]
	public Dictionary<string, object>? StreamOptions { get; set; }

	[JsonPropertyName("temperature")]
	public double? Temperature { get; set; }

	[JsonPropertyName("text")]
	public Dictionary<string, object>? Text { get; set; }

	[JsonPropertyName("tool_choice")]
	public object? ToolChoice { get; set; }

	[JsonPropertyName("tools")]
	public List<Dictionary<string, object>>? Tools { get; set; }

	[JsonPropertyName("top_logprobs")]
	public int? TopLogprobs { get; set; }

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

	[JsonPropertyName("role")]
	public string? Role { get; set; }

	[JsonPropertyName("stop_reason")]
	public string? StopReason { get; set; }

	[JsonPropertyName("type")]
	public string? Type { get; set; }

	[JsonPropertyName("usage")]
	public Dictionary<string, object>? Usage { get; set; }

}

public sealed class TextContentPart
{
	[JsonPropertyName("text")]
	public string Text { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

public sealed class TextModerationInput
{
	[JsonPropertyName("text")]
	public string Text { get; set; }

	[JsonPropertyName("type")]
	public string Type { get; set; }

}

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

	[JsonPropertyName("duration")]
	public int? Duration { get; set; }

	[JsonPropertyName("duration_seconds")]
	public int? DurationSeconds { get; set; }

	[JsonPropertyName("input_reference")]
	public string? InputReference { get; set; }

	[JsonPropertyName("input_reference_mime_type")]
	public string? InputReferenceMimeType { get; set; }

	[JsonPropertyName("model")]
	public string Model { get; set; }

	[JsonPropertyName("negative_prompt")]
	public string? NegativePrompt { get; set; }

	[JsonPropertyName("output_storage_uri")]
	public string? OutputStorageUri { get; set; }

	[JsonPropertyName("person_generation")]
	public string? PersonGeneration { get; set; }

	[JsonPropertyName("prompt")]
	public string Prompt { get; set; }

	[JsonPropertyName("provider")]
	public Dictionary<string, object>? Provider { get; set; }

	[JsonPropertyName("ratio")]
	public string? Ratio { get; set; }

	[JsonPropertyName("resolution")]
	public string? Resolution { get; set; }

	[JsonPropertyName("sample_count")]
	public int? SampleCount { get; set; }

	[JsonPropertyName("seconds")]
	public object? Seconds { get; set; }

	[JsonPropertyName("seed")]
	public int? Seed { get; set; }

	[JsonPropertyName("size")]
	public string? Size { get; set; }

}

public sealed class VideoGenerationResponse
{
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

	[JsonPropertyName("status")]
	public string? Status { get; set; }

}
