package ai.stats.gen;

public final class Models {
	private Models() {}

	public static class ActivityEntry {
		public Double byok_usage_inference;
		public Integer completion_tokens;
		public String date;
		public String endpoint_id;
		public String model;
		public String model_permaslug;
		public Integer prompt_tokens;
		public String provider_name;
		public Integer reasoning_tokens;
		public Integer requests;
		public Double usage;
	}

	public static class ActivityResponse {
		public java.util.List<Object> data;
	}

	public static class AnalyticsAccessTokenRequiredResponse {
		public Object error;
		public Object ok;
	}

	public static class AnalyticsNotImplementedResponse {
		public String message;
		public Object ok;
		public Object status;
	}

	public static class AnthropicContentBlock {
		public Object cache_control;
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
		public Boolean echo_upstream_request;
		public Integer max_tokens;
		public java.util.List<Object> messages;
		public Boolean meta;
		public Object metadata;
		public String model;
		public Object provider;
		public Object provider_options;
		public Object reasoning;
		public String session_id;
		public java.util.List<String> stop_sequences;
		public Boolean stream;
		public Object system;
		public Double temperature;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Integer top_k;
		public Double top_p;
		public Boolean usage;
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

	public static class ApiKey {
		public String created_at;
		public String created_by;
		public Boolean disabled;
		public String expires_at;
		public String hash;
		public String id;
		public String label;
		public String last_used_at;
		public String name;
		public String prefix;
		public Object scopes;
		public Boolean soft_blocked;
		public String status;
		public String updated_at;
		public String workspace_id;
	}

	public static class ApiKeyCreateRequest {
		public Boolean disabled;
		public String expires_at;
		public Boolean include_byok_in_limit;
		public Double limit;
		public Object limit_reset;
		public String name;
		public Object scopes;
		public Boolean soft_blocked;
		public String workspace_id;
	}

	public static class ApiKeyListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class ApiKeyResponse {
		public Object data;
	}

	public static class ApiKeyScopeValue {
	}

	public static class ApiKeyUpdateRequest {
		public Boolean disabled;
		public String expires_at;
		public Boolean include_byok_in_limit;
		public Double limit;
		public Object limit_reset;
		public String name;
		public Object scopes;
		public Boolean soft_blocked;
	}

	public static class ApiKeyWithValue {
		public String created_at;
		public String created_by;
		public Boolean disabled;
		public String expires_at;
		public String hash;
		public String id;
		public String key;
		public String label;
		public String last_used_at;
		public String name;
		public String prefix;
		public Object scopes;
		public Boolean soft_blocked;
		public String status;
		public String updated_at;
		public String workspace_id;
	}

	public static class ApiKeyWithValueResponse {
		public Object data;
	}

	public static class AsyncJobWebSocketClientEvent {
		public Object type;
	}

	public static class AsyncJobWebSocketServerEvent {
		public Object data;
		public Object type;
	}

	public static class AsyncJobWebSocketUpgradeRequiredResponse {
		public Object error;
	}

	public static class AsyncWebhookDeliveryAttempt {
		public Integer attempt_number;
		public String delivered_at;
		public String delivery_key;
		public String error_message;
		public String event_type;
		public String id;
		public Integer max_attempts;
		public String next_retry_at;
		public String response_body_preview;
		public Integer response_status;
		public Object status;
		public String tried_at;
	}

	public static class AsyncWebhookDeliverySummary {
		public java.util.List<String> delivered_event_types;
		public Integer delivered_events;
		public String last_attempt_at;
		public Object last_attempt_status;
		public String last_delivered_at;
		public String last_error_message;
		public String last_failure_at;
		public Integer last_response_status;
		public String next_retry_at;
		public Integer pending_retries;
		public Integer total_attempts;
	}

	public static class AsyncWebhookPublicState {
		public java.util.List<Object> attempts;
		public Object delivery;
		public java.util.List<String> events;
		public Boolean has_secret;
		public String url;
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

	public static class BatchBillingSummary {
		public Boolean billed;
		public Boolean charged;
		public Integer cost_nanos;
		public Double cost_usd;
		public String currency;
		public Integer estimated_nanos;
		public String estimated_provider_cost;
		public String estimated_user_cost;
		public Integer estimation_sample_size;
		public Integer estimation_total_rows;
		public Boolean estimation_truncated;
		public String finalized_at;
		public Object pricing_breakdown;
		public String reason;
		public String reservation_id;
		public String reservation_status;
		public Integer reserved_nanos;
		public String settled_provider_cost;
		public String settled_user_cost;
		public Object state;
		public Integer total_nanos;
	}

	public static class BatchListResponse {
		public java.util.List<Object> data;
		public String first_id;
		public Boolean has_more;
		public String last_id;
		public String object;
	}

	public static class BatchModelCapability {
		public java.util.List<String> input_types;
		public String model;
		public String name;
		public java.util.List<String> output_types;
		public Object pricing;
		public java.util.List<Object> providers;
		public String status;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
		public java.util.List<String> supported_params;
		public Object supported_params_detail;
	}

	public static class BatchModelProviderCapability {
		public String id;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
		public java.util.List<String> supported_params;
		public Object supported_params_detail;
	}

	public static class BatchModelsResponse {
		public java.util.List<Object> data;
		public String object;
	}

	public static class BatchRequest {
		public String completion_window;
		public Object debug;
		public String endpoint;
		public String input_file_id;
		public Object metadata;
		public Object provider;
		public String session_id;
		public Object webhook;
	}

	public static class BatchRequestCounts {
		public Integer completed;
		public Integer failed;
		public Integer total;
	}

	public static class BatchResponse {
		public Object billing;
		public String cancel_url;
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
		public String finalized_at;
		public Integer finalizing_at;
		public String id;
		public Integer in_progress_at;
		public String input_file_id;
		public String last_webhook_dispatched_at;
		public Double last_webhook_progress;
		public String last_webhook_progress_at;
		public Object lifecycle_status;
		public Object metadata;
		public String native_batch_id;
		public String next_webhook_retry_at;
		public String object;
		public String output_file_id;
		public String polling_url;
		public java.util.List<Object> pricing_lines;
		public Integer progress;
		public String provider;
		public Object request_counts;
		public String request_id;
		public String session_id;
		public String status;
		public Object webhook;
		public String websocket_url;
	}

	public static class BenchmarkId {
	}

	public static class CacheControl {
		public String scope;
		public String ttl;
		public String type;
	}

	public static class ChatAudioOutputPart {
		public Object audio_url;
		public Object format;
		public String mime_type;
		public Object type;
	}

	public static class ChatChoice {
		public Object finish_reason;
		public Integer index;
		public Object message;
	}

	public static class ChatCompletionsRequest {
		public Object debug;
		public Boolean echo_upstream_request;
		public Double frequency_penalty;
		public Object image_config;
		public Object logit_bias;
		public Boolean logprobs;
		public Integer max_completion_tokens;
		public Integer max_tokens;
		public Integer max_tool_calls;
		public java.util.List<Object> messages;
		public Boolean meta;
		public Object metadata;
		public java.util.List<Object> modalities;
		public String model;
		public Boolean parallel_tool_calls;
		public Double presence_penalty;
		public String prompt_cache_key;
		public Object provider;
		public Object provider_options;
		public Object reasoning;
		public Object response_format;
		public String safety_identifier;
		public Integer seed;
		public Object service_tier;
		public String session_id;
		public Object stop;
		public Boolean store;
		public Boolean stream;
		public Object stream_options;
		public Double temperature;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Integer top_logprobs;
		public Double top_p;
		public Boolean usage;
		public String user;
		public String user_id;
	}

	public static class ChatCompletionsResponse {
		public java.util.List<Object> choices;
		public Integer created;
		public String id;
		public String model;
		public String nativeResponseId;
		public String object;
		public String provider;
		public Object usage;
	}

	public static class ChatImageOutputPart {
		public Object image_url;
		public String mime_type;
		public Object type;
	}

	public static class ChatMessage {
		public java.util.List<Object> audios;
		public Object content;
		public java.util.List<Object> images;
		public String name;
		public Object role;
		public String tool_call_id;
		public java.util.List<Object> tool_calls;
	}

	public static class CreditsResponse {
		public Object credits;
		public Object ok;
	}

	public static class DataModel {
		public String deprecation_date;
		public Boolean hidden;
		public java.util.List<String> input_types;
		public Models.ModelLifecycle lifecycle;
		public String model_id;
		public String name;
		public Object organisation;
		public java.util.List<String> output_types;
		public String release_date;
		public String retirement_date;
		public String status;
	}

	public static class DataModelOrganisation {
	}

	public static class DebugOptions {
		public Boolean enabled;
		public Boolean return_upstream_request;
		public Boolean return_upstream_response;
		public Boolean trace;
		public Object trace_level;
	}

	public static class DeletedResponse {
		public Object deleted;
	}

	public static class Embedding {
		public java.util.List<Double> embedding;
		public Integer index;
		public String object;
	}

	public static class EmbeddingsMultimodalInput {
		public java.util.List<Object> content;
	}

	public static class EmbeddingsRequest {
		public Object debug;
		public Integer dimensions;
		public Object encoding_format;
		public Object input;
		public String model;
		public Object provider;
		public Object provider_options;
		public String user;
	}

	public static class EmbeddingsResponse {
		public java.util.List<Object> data;
		public String model;
		public String object;
		public Object usage;
	}

	public static class ErrorFailureSampleItem {
		public String provider;
		public Boolean retryable;
		public Integer status;
		public String type;
		public String upstream_error_code;
		public String upstream_error_description;
		public String upstream_error_message;
		public String upstream_error_param;
		public String upstream_payload_preview;
	}

	public static class ErrorProviderCandidateDiagnostics {
		public Integer candidateCount;
		public java.util.List<Object> droppedMissingAdapter;
		public java.util.List<String> droppedUnsupportedEndpoint;
		public Integer supportsEndpointCount;
		public Integer totalProviders;
	}

	public static class ErrorProviderEnablementDiagnostics {
		public String capability;
		public java.util.List<Object> dropped;
		public java.util.List<String> providersAfter;
		public java.util.List<String> providersBefore;
	}

	public static class ErrorProviderFailureDiagnostics {
		public Object category;
		public String hint;
		public String provider;
	}

	public static class ErrorResponse {
		public Integer attempt_count;
		public String description;
		public java.util.List<Object> details;
		public Object error;
		public Object error_origin;
		public Object error_type;
		public java.util.List<String> failed_providers;
		public java.util.List<Integer> failed_statuses;
		public java.util.List<Object> failure_sample;
		public String generation_id;
		public String message;
		public java.util.List<String> missing_pricing_providers;
		public Boolean ok;
		public Object provider_candidate_diagnostics;
		public Object provider_enablement;
		public Object provider_failure_diagnostics;
		public String provider_payment_required_provider;
		public String provider_payment_required_support_notice;
		public String reason;
		public Object routing_diagnostics;
		public Integer status_code;
		public Object upstream_error;
	}

	public static class ErrorRoutingDiagnostics {
		public java.util.List<Object> filterStages;
	}

	public static class ErrorUpstreamError {
		public String code;
		public String description;
		public String message;
		public String param;
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

	public static class FunctionToolDefinition {
		public Object function;
		public Object type;
	}

	public static class GatewayDatetimeToolDefinition {
		public Object parameters;
		public String timezone;
		public Object type;
	}

	public static class GatewayModelsResponse {
		public Object availability_mode;
		public Object collection;
		public Integer limit;
		public java.util.List<Object> models;
		public Integer offset;
		public Boolean ok;
		public Object privacy_scope;
		public Integer total;
	}

	public static class GatewayWebFetchToolDefinition {
		public Integer max_chars;
		public Object parameters;
		public Object type;
	}

	public static class GatewayWebSearchToolDefinition {
		public Boolean include_highlights;
		public Boolean include_text;
		public Integer max_results;
		public Object parameters;
		public Object type;
	}

	public static class GenerationResponse {
		public String app_id;
		public Boolean byok;
		public Double cost_nanos;
		public String created_at;
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
		public Object replay_request;
		public Boolean replay_supported;
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

	public static class ImageConfig {
		public String aspect_ratio;
		public java.util.List<Object> font_inputs;
		public Object image_size;
		public Boolean include_rai_reason;
		public java.util.List<Object> reference_images;
		public java.util.List<String> super_resolution_references;
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

	public static class InvalidRequestResponse {
		public String error;
		public Integer max_offset;
		public String message;
		public Object ok;
	}

	public static class KeyInvalidateResponse {
		public Object cache_version;
		public Object key;
		public String message;
		public Object ok;
	}

	public static class KnownModelId {
	}

	public static class ListFilesResponse {
		public java.util.List<Object> data;
		public String object;
	}

	public static class ManagementKeyCreateRequest {
		public String created_by;
		public String name;
		public Object scopes;
		public Boolean soft_blocked;
		public Object status;
		public String team_id;
	}

	public static class ManagementKeyCreateResponse {
		public Object key;
		public Object ok;
	}

	public static class ManagementKeyDeleteResponse {
		public String message;
		public Object ok;
	}

	public static class ManagementKeyDetailResponse {
		public Object key;
		public Object ok;
	}

	public static class ManagementKeyListResponse {
		public java.util.List<Object> keys;
		public Integer limit;
		public Integer offset;
		public Object ok;
		public Integer total;
	}

	public static class ManagementKeyUpdateRequest {
		public String name;
		public Boolean soft_blocked;
		public Object status;
	}

	public static class ManagementKeyUpdateResponse {
		public String message;
		public Object ok;
	}

	public static class MessageContentPart {
	}

	public static class Model {
		public java.util.List<String> aliases;
		public Object architecture;
		public Object availability;
		public String canonical_slug;
		public Integer created;
		public String deprecation_date;
		public String description;
		public java.util.List<String> endpoints;
		public String id;
		public java.util.List<String> input_types;
		public Models.ModelLifecycle lifecycle;
		public Object links;
		public String model_id;
		public String name;
		public String organisation_colour;
		public String organisation_id;
		public String organisation_name;
		public java.util.List<String> output_types;
		public Object per_request_limits;
		public Object pricing;
		public Object pricing_detail;
		public java.util.List<Object> providers;
		public String release_date;
		public String retirement_date;
		public String status;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
		public java.util.List<String> supported_params;
		public Object supported_params_detail;
		public Object top_provider;
		public String top_provider_id;
	}

	public static class ModelAvailability {
		public Integer active_provider_count;
		public Integer inactive_provider_count;
		public Integer provider_count;
		public Object status;
	}

	public static class ModelEndpointCapability {
		public String availability_reason;
		public String availability_status;
		public String capability_id;
		public String capability_status;
		public Object collection;
		public String effective_from;
		public String effective_to;
		public String endpoint;
		public String id;
		public java.util.List<String> input_modalities;
		public Boolean is_active_gateway;
		public String model_routing_status;
		public java.util.List<String> output_modalities;
		public java.util.List<String> params;
		public Object params_detail;
		public Object pricing;
		public Object pricing_detail;
		public String provider_id;
		public String provider_model_slug;
		public String provider_name;
		public String provider_routing_status;
		public String provider_status;
		public String public_path;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
	}

	public static class ModelEndpointsResponse {
		public Object architecture;
		public Object availability_mode;
		public String canonical_slug;
		public Integer created;
		public String description;
		public java.util.List<Object> endpoints;
		public String id;
		public String model_id;
		public String name;
		public Boolean ok;
	}

	public static class ModelId {
	}

	public static class ModelLifecycle {
		public String deprecation_date;
		public String message;
		public String replacement_model_id;
		public String retirement_date;
		public Object status;
	}

	public static class ModelProviderAvailability {
		public String api_provider_id;
		public String api_provider_name;
		public Object availability_reason;
		public Object availability_status;
		public Object capability_status;
		public String effective_from;
		public String effective_to;
		public java.util.List<String> endpoints;
		public java.util.List<String> input_modalities;
		public Boolean is_active_gateway;
		public Object model_routing_status;
		public java.util.List<String> output_modalities;
		public java.util.List<String> params;
		public Object params_detail;
		public String provider_model_slug;
		public Object provider_routing_status;
		public Object provider_status;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
	}

	public static class ModelsPrivacyScopeNotImplementedResponse {
		public Object code;
		public Object error;
		public String message;
		public Object ok;
		public Object privacy_scope;
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

	public static class NotImplementedResponse {
		public String description;
		public String error;
		public Integer status_code;
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

	public static class ProviderOptions {
		public Object anthropic;
		public Object google;
		public Object openai;
	}

	public static class ProviderRoutingOptions {
		public Boolean allow_fallbacks;
		public Object data_collection;
		public Boolean enforce_distillable_text;
		public java.util.List<String> ignore;
		public Boolean include_alpha;
		public Object max_price;
		public java.util.List<String> only;
		public java.util.List<String> order;
		public Object preferred_max_latency;
		public Object preferred_min_throughput;
		public java.util.List<String> quantizations;
		public Boolean require_parameters;
		public Boolean require_zero_data_retention;
		public String required_data_region;
		public String required_execution_region;
		public Object sort;
		public Boolean zdr;
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

	public static class RealtimeNotImplementedResponse {
		public Object error;
	}

	public static class ReasoningConfig {
		public Object effort;
		public Boolean enabled;
		public Integer max_tokens;
		public Object summary;
	}

	public static class RerankDocument {
	}

	public static class RerankRequest {
		public Object debug;
		public Object documents;
		public Integer max_chunks_per_doc;
		public Object metadata;
		public String model;
		public Object provider;
		public Object provider_options;
		public String query;
		public java.util.List<String> rank_fields;
		public Boolean return_documents;
		public Integer top_k;
		public Integer top_n;
		public String user;
	}

	public static class RerankResponse {
		public String id;
		public String model;
		public String nativeResponseId;
		public String object;
		public java.util.List<Object> results;
		public Object usage;
	}

	public static class RerankResult {
		public Object document;
		public Integer index;
		public Double relevance_score;
	}

	public static class ResponsesInputItem {
		public Object content;
		public Object role;
		public String type;
	}

	public static class ResponsesOutputAudioPart {
		public Object audio_url;
		public String b64_json;
		public Object format;
		public String mime_type;
		public Object type;
	}

	public static class ResponsesOutputContentPart {
	}

	public static class ResponsesOutputImagePart {
		public String b64_json;
		public Object image_url;
		public String mime_type;
		public Object type;
	}

	public static class ResponsesOutputItem {
		public String arguments;
		public String call_id;
		public java.util.List<Object> content;
		public String name;
		public String role;
		public String type;
	}

	public static class ResponsesOutputTextPart {
		public java.util.List<Object> annotations;
		public String text;
		public Object type;
	}

	public static class ResponsesRequest {
		public Boolean background;
		public Object debug;
		public Boolean echo_upstream_request;
		public Object image_config;
		public java.util.List<String> include;
		public Object input;
		public String instructions;
		public Integer max_output_tokens;
		public Boolean meta;
		public Object metadata;
		public java.util.List<Object> modalities;
		public String model;
		public Boolean parallel_tool_calls;
		public String previous_response_id;
		public String prompt_cache_key;
		public Object provider;
		public Object provider_options;
		public Object reasoning;
		public String safety_identifier;
		public Object service_tier;
		public String session_id;
		public Boolean store;
		public Boolean stream;
		public Double temperature;
		public Object text;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Double top_p;
		public Object truncation;
		public Boolean usage;
		public String user;
	}

	public static class ResponsesResponse {
		public java.util.List<Object> content;
		public Integer created;
		public String id;
		public String model;
		public String object;
		public java.util.List<Object> output;
		public java.util.List<Object> output_items;
		public String role;
		public String stop_reason;
		public String type;
		public Object usage;
	}

	public static class ResponsesWebSocketCreateEvent {
		public Object input;
		public String model;
		public String previous_response_id;
		public Boolean store;
		public Object tool_choice;
		public java.util.List<Object> tools;
		public Object type;
	}

	public static class ResponsesWebSocketServerEvent {
		public Object error;
		public Object response;
		public Integer status;
		public String type;
	}

	public static class ResponsesWebSocketUpgradeRequiredResponse {
		public Object error;
	}

	public static class ServerToolUsage {
		public Integer datetime_requests;
		public Integer web_fetch_requests;
		public Integer web_search_requests;
	}

	public static class SupportedParameterDetails {
	}

	public static class TextContentPart {
		public String text;
		public Object type;
	}

	public static class TextGenerateTool {
	}

	public static class TextModerationInput {
		public String text;
		public Object type;
	}

	public static class TextToolChoice {
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
		public Object server_tool_use;
		public Integer total_tokens;
	}

	public static class VideoBillingSummary {
		public Boolean billable;
		public String billed_at;
		public String charge_reason;
		public Boolean charged;
		public String currency;
		public Integer estimated_nanos;
		public String estimated_provider_cost;
		public String estimated_user_cost;
		public String reservation_id;
		public String reservation_status;
		public Integer reserved_nanos;
		public String settled_provider_cost;
		public String settled_user_cost;
		public Object state;
		public Integer total_nanos;
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
		public Integer compression_quality;
		public Integer duration;
		public Boolean enhance_prompt;
		public Boolean generate_audio;
		public java.util.List<Object> input_references;
		public String model;
		public String negative_prompt;
		public Object output;
		public String person_generation;
		public String prompt;
		public Object provider;
		public Object provider_params;
		public String resize_mode;
		public String resolution;
		public Integer sample_count;
		public Integer seed;
		public String size;
		public Object webhook;
	}

	public static class VideoGenerationResponse {
		public Object asset;
		public Boolean audio;
		public Object billing;
		public String cancel_url;
		public Object completed_at;
		public String content_url;
		public Object created_at;
		public String download_url;
		public Object error;
		public Integer expires_at;
		public String generation_id;
		public String id;
		public String last_webhook_dispatched_at;
		public Double last_webhook_progress;
		public String last_webhook_progress_at;
		public Object lifecycle_status;
		public String model;
		public String native_video_id;
		public String next_webhook_retry_at;
		public String object;
		public Object output_access;
		public java.util.List<Object> outputs;
		public Integer poll_after_seconds;
		public String polling_url;
		public Integer progress;
		public String progress_source;
		public String provider;
		public String request_id;
		public Double seconds;
		public String session_id;
		public String size;
		public Object started_at;
		public Object status;
		public Object usage;
		public Object webhook;
		public String websocket_url;
	}

	public static class VideoInputReference {
		public Object image_url;
		public String reference_type;
		public Object role;
		public Object type;
	}

	public static class VideoListResponse {
		public java.util.List<Object> data;
		public String first_id;
		public Boolean has_more;
		public String last_id;
		public String object;
	}

	public static class VideoModelCapability {
		public java.util.List<String> input_types;
		public String model;
		public String name;
		public java.util.List<String> output_types;
		public Object pricing;
		public java.util.List<Object> providers;
		public String status;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
		public java.util.List<String> supported_params;
		public Object supported_params_detail;
	}

	public static class VideoModelProviderCapability {
		public String id;
		public java.util.List<String> supported_parameters;
		public Object supported_parameters_detail;
		public java.util.List<String> supported_params;
		public Object supported_params_detail;
	}

	public static class VideoModelsResponse {
		public java.util.List<Object> data;
		public String object;
	}

	public static class VideoOutput {
		public Boolean bytes_available;
		public String content_url;
		public String download_url;
		public Integer expires_at;
		public Integer index;
		public String mime_type;
	}

	public static class VideoOutputConfig {
		public Object access;
	}

	public static class Workspace {
		public String created_at;
		public String created_by;
		public String id;
		public String name;
		public String slug;
		public String updated_at;
	}

	public static class WorkspaceActivityEntry {
		public Double cost_cents;
		public String endpoint;
		public Integer latency_ms;
		public String model;
		public String provider;
		public String request_id;
		public String timestamp;
		public Object usage;
	}

	public static class WorkspaceActivityResponse {
		public java.util.List<Object> activity;
		public Integer limit;
		public Integer offset;
		public Object ok;
		public Integer period_days;
		public Integer total;
		public Double total_cost_cents;
	}

	public static class WorkspaceCreateRequest {
		public String name;
		public String slug;
	}

	public static class WorkspaceListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class WorkspaceResponse {
		public Object data;
	}

	public static class WorkspaceUpdateRequest {
		public String name;
		public String slug;
	}

}
