package ai.stats.gen;

public final class Models {
	private Models() {}

	public static class ActivityEntry {
		public Double cost_cents;
		public String endpoint;
		public Integer latency_ms;
		public String model;
		public String provider;
		public String request_id;
		public String timestamp;
		public Object usage;
	}

	public static class AnthropicContentBlock {
		public String content;
		public String id;
		public Object input;
		public String name;
		public Object source;
		public String text;
		public String tool_use_id;
		public Object type;
	}

	public static class AnthropicMessage {
		public Object content;
		public Object role;
	}

	public static class AnthropicMessagesRequest {
		public Object debug;
		public Integer max_tokens;
		public java.util.List<Object> messages;
		public Object metadata;
		public String model;
		public Object provider;
		public Boolean stream;
		public Object system;
		public Double temperature;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Integer top_k;
		public Double top_p;
	}

	public static class AnthropicMessagesResponse {
		public java.util.List<Object> content;
		public String id;
		public String model;
		public Object role;
		public String stop_reason;
		public String stop_sequence;
		public String type;
		public Object usage;
	}

	public static class AnthropicTool {
		public String description;
		public Object input_schema;
		public String name;
	}

	public static class AnthropicUsage {
		public Integer input_tokens;
		public Integer output_tokens;
	}

	public static class AudioContentPart {
		public Object input_audio;
		public Object type;
	}

	public static class AudioSpeechRequest {
		public Object format;
		public String input;
		public String model;
		public Object provider;
		public String voice;
	}

	public static class AudioTranscriptionRequest {
		public String audio_b64;
		public String audio_url;
		public String language;
		public String model;
		public Object provider;
	}

	public static class AudioTranscriptionResponse {
		public String text;
	}

	public static class AudioTranslationRequest {
		public String audio_b64;
		public String audio_url;
		public String language;
		public String model;
		public String prompt;
		public Object provider;
		public Double temperature;
	}

	public static class AudioTranslationResponse {
		public String text;
	}

	public static class BatchRequest {
		public String completion_window;
		public Object debug;
		public String endpoint;
		public String input_file_id;
		public Object metadata;
		public Object provider;
	}

	public static class BatchRequestCounts {
		public Integer completed;
		public Integer failed;
		public Integer total;
	}

	public static class BatchResponse {
		public Integer cancelled_at;
		public Integer cancelling_at;
		public Integer completed_at;
		public String completion_window;
		public Integer created_at;
		public String endpoint;
		public String error_file_id;
		public Object errors;
		public Integer expired_at;
		public Integer expires_at;
		public Integer failed_at;
		public Integer finalizing_at;
		public String id;
		public Integer in_progress_at;
		public String input_file_id;
		public Object metadata;
		public String object;
		public String output_file_id;
		public Object request_counts;
		public String status;
	}

	public static class BenchmarkId {
	}

	public static class ChatChoice {
		public Object finish_reason;
		public Integer index;
		public Object message;
	}

	public static class ChatCompletionsRequest {
		public Object debug;
		public Double frequency_penalty;
		public Object logit_bias;
		public Boolean logprobs;
		public Integer max_output_tokens;
		public Integer max_tool_calls;
		public java.util.List<Object> messages;
		public Boolean meta;
		public String model;
		public Boolean parallel_tool_calls;
		public Double presence_penalty;
		public Object provider;
		public Object reasoning;
		public Object response_format;
		public Integer seed;
		public Object service_tier;
		public Boolean stream;
		public String system;
		public Double temperature;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Integer top_k;
		public Integer top_logprobs;
		public Double top_p;
		public Boolean usage;
		public String user_id;
	}

	public static class ChatCompletionsResponse {
		public java.util.List<Object> choices;
		public Integer created;
		public String id;
		public String model;
		public String object;
		public Object usage;
	}

	public static class ChatMessage {
		public Object content;
		public String name;
		public Object role;
		public String tool_call_id;
		public java.util.List<Object> tool_calls;
	}

	public static class DebugOptions {
		public Boolean enabled;
		public Boolean return_upstream_request;
		public Boolean return_upstream_response;
		public Boolean trace;
		public Object trace_level;
	}

	public static class Embedding {
		public java.util.List<Double> embedding;
		public Integer index;
		public String object;
	}

	public static class EmbeddingsRequest {
	}

	public static class EmbeddingsResponse {
		public java.util.List<Object> data;
		public String model;
		public String object;
		public Object usage;
	}

	public static class ErrorResponse {
		public String error;
		public String message;
		public Boolean ok;
	}

	public static class FileResponse {
		public Integer bytes;
		public Integer created_at;
		public String filename;
		public String id;
		public String object;
		public String purpose;
		public String status;
		public Object status_details;
	}

	public static class FileUploadRequest {
		public Object file;
		public String purpose;
	}

	public static class GenerationResponse {
		public String app_id;
		public Boolean byok;
		public Double cost_nanos;
		public String currency;
		public String endpoint;
		public String error_code;
		public String error_message;
		public Double generation_ms;
		public String key_id;
		public Double latency_ms;
		public String model_id;
		public String native_response_id;
		public java.util.List<Object> pricing_lines;
		public String provider;
		public String request_id;
		public Double status_code;
		public Boolean stream;
		public Boolean success;
		public String team_id;
		public Double throughput;
		public Object usage;
	}

	public static class Image {
		public String b64_json;
		public String revised_prompt;
		public String url;
	}

	public static class ImageContentPart {
		public Object image_url;
		public Object type;
	}

	public static class ImageModerationInput {
		public Object image_url;
		public Object type;
	}

	public static class ImagesEditRequest {
		public String image;
		public String mask;
		public Boolean meta;
		public String model;
		public Integer n;
		public String prompt;
		public Object provider;
		public String size;
		public Boolean usage;
		public String user;
	}

	public static class ImagesEditResponse {
		public Integer created;
		public java.util.List<Object> data;
	}

	public static class ImagesGenerationRequest {
		public String model;
		public Integer n;
		public String prompt;
		public Object provider;
		public String quality;
		public String response_format;
		public String size;
		public String style;
		public String user;
	}

	public static class ImagesGenerationResponse {
		public Integer created;
		public java.util.List<Object> data;
	}

	public static class ListFilesResponse {
		public java.util.List<Object> data;
		public String object;
	}

	public static class MessageContentPart {
	}

	public static class Model {
		public java.util.List<String> aliases;
		public java.util.List<String> endpoints;
		public java.util.List<String> input_types;
		public String model_id;
		public String name;
		public String organisation_id;
		public java.util.List<String> output_types;
		public java.util.List<Object> providers;
		public String release_date;
		public String status;
	}

	public static class ModelId {
	}

	public static class ModerationCategories {
		public Boolean harassment;
		public Boolean harassment_threatening;
		public Boolean hate;
		public Boolean hate_threatening;
		public Boolean self_harm;
		public Boolean self_harm_instructions;
		public Boolean self_harm_intent;
		public Boolean sexual;
		public Boolean sexual_minors;
		public Boolean violence;
		public Boolean violence_graphic;
	}

	public static class ModerationCategoryScores {
		public Double harassment;
		public Double harassment_threatening;
		public Double hate;
		public Double hate_threatening;
		public Double self_harm;
		public Double self_harm_instructions;
		public Double self_harm_intent;
		public Double sexual;
		public Double sexual_minors;
		public Double violence;
		public Double violence_graphic;
	}

	public static class ModerationResult {
		public Object categories;
		public Object category_scores;
		public Boolean flagged;
	}

	public static class ModerationsRequest {
		public Object debug;
		public Object input;
		public Boolean meta;
		public String model;
		public Object provider;
	}

	public static class ModerationsResponse {
		public String id;
		public String model;
		public java.util.List<Object> results;
	}

	public static class MusicGenerateRequest {
		public Object debug;
		public Integer duration;
		public Boolean echo_upstream_request;
		public Object elevenlabs;
		public Object format;
		public String model;
		public String prompt;
		public Object provider;
		public Object suno;
	}

	public static class MusicGenerateResponse {
	}

	public static class OcrRequest {
		public Object debug;
		public Boolean echo_upstream_request;
		public String image;
		public String language;
		public String model;
		public Object provider;
	}

	public static class OcrResponse {
	}

	public static class OrganisationId {
	}

	public static class OrganisationIdList {
	}

	public static class Provider {
		public String api_provider_id;
		public String api_provider_name;
		public String country_code;
		public String description;
		public String link;
	}

	public static class ProviderRoutingOptions {
		public java.util.List<String> ignore;
		public Boolean include_alpha;
		public java.util.List<String> only;
		public java.util.List<String> order;
	}

	public static class ProvisioningKey {
		public String created_at;
		public String id;
		public String last_used_at;
		public String name;
		public String prefix;
		public String scopes;
		public Object status;
	}

	public static class ProvisioningKeyDetail {
		public String created_at;
		public String created_by;
		public String id;
		public String last_used_at;
		public String name;
		public String prefix;
		public String scopes;
		public Boolean soft_blocked;
		public Object status;
		public String team_id;
	}

	public static class ProvisioningKeyWithValue {
		public String created_at;
		public String id;
		public String key;
		public String name;
		public String prefix;
		public String scopes;
		public Object status;
	}

	public static class ReasoningConfig {
		public Object effort;
		public Object summary;
	}

	public static class ResponsesRequest {
		public Boolean background;
		public Object conversation;
		public Object debug;
		public java.util.List<String> include;
		public Object input;
		public java.util.List<Object> input_items;
		public String instructions;
		public Integer max_output_tokens;
		public Integer max_tool_calls;
		public Boolean meta;
		public Object metadata;
		public String model;
		public Boolean parallel_tool_calls;
		public String previous_response_id;
		public Object prompt;
		public String prompt_cache_key;
		public String prompt_cache_retention;
		public Object provider;
		public Object reasoning;
		public String safety_identifier;
		public String service_tier;
		public Boolean store;
		public Boolean stream;
		public Object stream_options;
		public Double temperature;
		public Object text;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Integer top_logprobs;
		public Double top_p;
		public String truncation;
		public Boolean usage;
		public String user;
	}

	public static class ResponsesResponse {
		public java.util.List<Object> content;
		public Integer created;
		public String id;
		public String model;
		public String object;
		public String role;
		public String stop_reason;
		public String type;
		public Object usage;
	}

	public static class TextContentPart {
		public String text;
		public Object type;
	}

	public static class TextModerationInput {
		public String text;
		public Object type;
	}

	public static class ToolCall {
		public Object function;
		public String id;
		public Object type;
	}

	public static class ToolCallContentPart {
		public Object function;
		public String id;
		public Object type;
	}

	public static class Usage {
		public Integer completion_tokens;
		public Integer prompt_tokens;
		public Integer total_tokens;
	}

	public static class VideoContentPart {
		public Object type;
		public String video_url;
	}

	public static class VideoDeleteResponse {
		public Boolean deleted;
		public String id;
		public String object;
	}

	public static class VideoGenerationRequest {
		public String aspect_ratio;
		public Integer duration;
		public Integer duration_seconds;
		public String input_reference;
		public String input_reference_mime_type;
		public String model;
		public String negative_prompt;
		public String output_storage_uri;
		public String person_generation;
		public String prompt;
		public Object provider;
		public String ratio;
		public String resolution;
		public Integer sample_count;
		public Object seconds;
		public Integer seed;
		public String size;
	}

	public static class VideoGenerationResponse {
		public Integer created;
		public String id;
		public String model;
		public String object;
		public java.util.List<Object> output;
		public String status;
	}

}
