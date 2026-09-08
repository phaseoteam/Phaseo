package app.phaseo.gen;

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

	public static class AnalyticsResponse {
		public java.util.List<Object> data;
		public Integer limit;
		public Integer offset;
		public Integer total_count;
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
		public Boolean async;
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
		public String creator_user_id;
		public Boolean disabled;
		public String expires_at;
		public String hash;
		public String id;
		public Boolean include_byok_in_limit;
		public String label;
		public String last_used_at;
		public Double limit;
		public Double limit_remaining;
		public Object limit_reset;
		public Object limits;
		public String name;
		public String prefix;
		public Object scopes;
		public Boolean soft_blocked;
		public String status;
		public String updated_at;
		public Double usage;
		public Double usage_daily;
		public Object usage_details;
		public Double usage_monthly;
		public Double usage_weekly;
		public String workspace_id;
	}

	public static class ApiKeyCreateRequest {
		public Boolean disabled;
		public String expires_at;
		public Boolean include_byok_in_limit;
		public Double limit;
		public Object limit_reset;
		public Object limits;
		public String name;
		public Object scopes;
		public Boolean soft_blocked;
		public String workspace_id;
	}

	public static class ApiKeyLimitBucket {
		public Double cost;
		public Integer requests;
	}

	public static class ApiKeyLimitInputBucket {
		public Double cost;
		public Integer requests;
	}

	public static class ApiKeyLimitInputWindows {
		public Object daily;
		public Object monthly;
		public Object weekly;
	}

	public static class ApiKeyLimitWindows {
		public Object daily;
		public Object monthly;
		public Object weekly;
	}

	public static class ApiKeyListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class ApiKeyResponse {
		public Object data;
	}

	public static class ApiKeyRotateRequest {
		public String name;
		public String previous_key_expires_at;
	}

	public static class ApiKeyRotateResponse {
		public Object data;
		public String previous_key_expires_at;
	}

	public static class ApiKeyScopeValue {
	}

	public static class ApiKeyUpdateRequest {
		public Boolean disabled;
		public String expires_at;
		public Boolean include_byok_in_limit;
		public Double limit;
		public Object limit_reset;
		public Object limits;
		public String name;
		public Object scopes;
		public Boolean soft_blocked;
	}

	public static class ApiKeyUsageBucket {
		public Double cost;
		public Integer requests;
	}

	public static class ApiKeyUsageWindows {
		public Object daily;
		public Object monthly;
		public Object total;
		public Object weekly;
	}

	public static class ApiKeyWithValue {
		public String created_at;
		public String created_by;
		public String creator_user_id;
		public Boolean disabled;
		public String expires_at;
		public String hash;
		public String id;
		public Boolean include_byok_in_limit;
		public String key;
		public String label;
		public String last_used_at;
		public Double limit;
		public Double limit_remaining;
		public Object limit_reset;
		public Object limits;
		public String name;
		public String prefix;
		public Object scopes;
		public Boolean soft_blocked;
		public String status;
		public String updated_at;
		public Double usage;
		public Double usage_daily;
		public Object usage_details;
		public Double usage_monthly;
		public Double usage_weekly;
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
		public Object chunking_strategy;
		public java.util.List<String> known_speaker_names;
		public java.util.List<String> known_speaker_references;
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

	public static class BatchProviderCapability {
		public String documentation_url;
		public java.util.List<Object> endpoints;
		public java.util.List<Object> gateway_input_modes;
		public String id;
		public String name;
		public java.util.List<Object> native_input_modes;
		public String notes;
		public Object status;
	}

	public static class BatchRequest {
		public String completion_window;
		public Object debug;
		public Object endpoint;
		public String input_file_id;
		public java.util.List<Object> items;
		public Integer max_tokens;
		public Object metadata;
		public String model;
		public java.util.List<String> prompts;
		public Object provider;
		public Object provider_options;
		public java.util.List<Object> requests;
		public String session_id;
		public String system;
		public Double temperature;
		public Object webhook;
		public String webhook_endpoint_id;
	}

	public static class BatchRequestCounts {
		public Integer completed;
		public Integer failed;
		public Integer total;
	}

	public static class BatchRequestItem {
		public Object body;
		public String custom_id;
		public Object method;
		public String url;
	}

	public static class BatchRequestRow {
		public String completed_at;
		public Integer cost_nanos;
		public Double cost_usd;
		public String created_at;
		public String custom_id;
		public String endpoint;
		public Object error_body;
		public String id;
		public Object meta;
		public String method;
		public String model;
		public String native_batch_id;
		public String provider;
		public String request_body_hash;
		public Integer request_index;
		public Object response_body;
		public Integer response_status;
		public String status;
		public String updated_at;
		public Object usage;
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
		public String results_url;
		public String session_id;
		public String status;
		public Object usage;
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
		public Object reasoning_effort;
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

	public static class DataContributionCategories {
	}

	public static class DataContributionClassifier {
		public Object categories;
		public String created_at;
		public String description;
		public Boolean enabled;
		public String id;
		public String instructions;
		public Object kind;
		public String model;
		public String name;
		public Integer sample_rate_bps;
		public Object service_tier;
		public String slug;
		public String updated_at;
	}

	public static class DataContributionClassifierCreateRequest {
		public Object categories;
		public String description;
		public Boolean enabled;
		public String instructions;
		public String model;
		public String name;
		public Integer sampleRateBps;
		public Object serviceTier;
		public String slug;
	}

	public static class DataContributionClassifierDeleteResponse {
		public Object data;
	}

	public static class DataContributionClassifierInput {
		public Object categories;
		public String description;
		public Boolean enabled;
		public String instructions;
		public String model;
		public String name;
		public Integer sampleRateBps;
		public Object serviceTier;
	}

	public static class DataContributionClassifierResponse {
		public Object data;
	}

	public static class DataContributionClassifierUpdateRequest {
		public Object categories;
		public String description;
		public Boolean enabled;
		public String instructions;
		public String model;
		public String name;
		public Integer sampleRateBps;
		public Object serviceTier;
	}

	public static class DataContributionConsentRequest {
		public Boolean enabled;
		public String reason;
	}

	public static class DataContributionConsentResponse {
		public Object data;
	}

	public static class DataContributionOverviewResponse {
		public Object data;
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

	public static class DynamicRoute {
		public Object config;
		public String created_at;
		public Integer deployed_version;
		public String description;
		public String id;
		public java.util.List<String> key_ids;
		public String name;
		public String slug;
		public Object status;
		public String updated_at;
		public Integer version;
		public java.util.List<Object> versions;
		public String workspace_id;
	}

	public static class DynamicRouteAction {
		public Boolean allowFallbacks;
		public String model;
		public java.util.List<String> modelFallbacks;
		public java.util.List<String> providerIgnore;
		public java.util.List<String> providerOnly;
		public java.util.List<String> providerOrder;
		public Object routingMode;
	}

	public static class DynamicRouteCondition {
		public Object field;
		public String metadataKey;
		public Object operator;
		public String value;
	}

	public static class DynamicRouteConfig {
		public Boolean cacheAwareRouting;
		public Object defaultAction;
		public java.util.List<Object> edges;
		public String entryNodeId;
		public java.util.List<Object> nodes;
		public java.util.List<Object> rules;
		public Object schemaVersion;
		public Boolean sessionAffinity;
	}

	public static class DynamicRouteCreateRequest {
		public Object config;
		public String description;
		public String name;
		public String slug;
		public Object status;
	}

	public static class DynamicRouteDeleteResponse {
		public Object data;
	}

	public static class DynamicRouteDeployResponse {
		public Object data;
	}

	public static class DynamicRouteEdge {
		public String id;
		public String source;
		public String sourceHandle;
		public String target;
	}

	public static class DynamicRouteKeysResponse {
		public Object data;
	}

	public static class DynamicRouteKeysUpdateRequest {
		public java.util.List<String> key_ids;
	}

	public static class DynamicRouteListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class DynamicRouteNode {
		public Object data;
		public String id;
		public Object position;
		public Object type;
	}

	public static class DynamicRouteResponse {
		public Object data;
	}

	public static class DynamicRouteRule {
		public Object action;
		public Object condition;
		public Boolean enabled;
		public String id;
		public String name;
	}

	public static class DynamicRouteUpdateRequest {
		public Object config;
		public String description;
		public String name;
		public Object status;
	}

	public static class DynamicRouteVersion {
		public String created_at;
		public String created_by;
		public Object status;
		public Integer version;
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

	public static class EndpointCatalogueEntry {
		public String capability_id;
		public String collection;
		public String id;
		public Integer model_count;
		public Integer provider_count;
		public String public_path;
	}

	public static class EndpointCatalogueResponse {
		public java.util.List<Object> data;
		public java.util.List<String> endpoints;
		public Object ok;
		public java.util.List<String> sample_models;
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
		public Boolean async;
		public Object function;
		public Object type;
	}

	public static class FusionToolDefinition {
		public Object parameters;
		public Object type;
	}

	public static class GatewayCapabilities {
		public java.util.List<String> endpoints;
		public Object parameter_details;
		public java.util.List<String> parameters;
	}

	public static class GatewayCapabilityStatus {
	}

	public static class GatewayDatetimeToolDefinition {
		public Object parameters;
		public String timezone;
		public Object type;
	}

	public static class GatewayFeedback {
		public String comment;
		public String created_at;
		public String created_by_user_id;
		public String end_user_id;
		public String id;
		public Object metadata;
		public Object metadata_dimensions;
		public String preset_id;
		public String rating;
		public String reason;
		public java.util.List<String> reason_tags;
		public String request_id;
		public Double score;
		public String session_id;
		public Object source;
		public String test_run_id;
		public String workspace_id;
	}

	public static class GatewayFeedbackCreateRequest {
		public String comment;
		public String end_user_id;
		public Object metadata;
		public Object metadata_dimensions;
		public String preset_id;
		public String rating;
		public String reason;
		public java.util.List<String> reason_tags;
		public String request_id;
		public Double score;
		public String session_id;
		public Object source;
		public String test_run_id;
	}

	public static class GatewayFeedbackListResponse {
		public java.util.List<Object> data;
	}

	public static class GatewayFeedbackResponse {
		public Object data;
	}

	public static class GatewayFeedbackSummaryResponse {
		public java.util.List<Object> data;
		public Object group_by;
	}

	public static class GatewayFeedbackSummaryRow {
		public Double average_score;
		public Integer count;
		public String last_feedback_at;
		public String metadata_key;
		public String metadata_value;
		public Integer negative;
		public Integer partial;
		public Integer positive;
		public String preset_id;
		public Object ratings;
		public String test_run_id;
	}

	public static class GatewayModalities {
		public java.util.List<String> input;
		public java.util.List<String> output;
	}

	public static class GatewayModelLifecycle {
		public String deprecated_at;
		public String message;
		public String released_at;
		public String replacement_id;
		public String retires_at;
		public Object status;
	}

	public static class GatewayModelLimits {
		public Integer input_tokens;
		public Integer output_tokens;
	}

	public static class GatewayModelOffer {
		public Object capabilities;
		public Object effective;
		public java.util.List<String> endpoints;
		public Object modalities;
		public String model;
		public Object pricing;
		public Object provider;
		public Boolean routable;
		public Object routing;
		public Object status;
		public Object status_reason;
	}

	public static class GatewayModelOrganization {
	}

	public static class GatewayModelsResponse {
		public Object availability_mode;
		public Integer limit;
		public java.util.List<Object> models;
		public Integer offset;
		public Boolean ok;
		public Integer total;
	}

	public static class GatewayObservabilityEvent {
		public Object category;
		public String created_at;
		public String created_by_user_id;
		public String end_user_id;
		public String event_name;
		public String id;
		public Object metadata;
		public Object metadata_dimensions;
		public Double numeric_value;
		public String occurred_at;
		public String preset_id;
		public String request_id;
		public String session_id;
		public Object source;
		public String test_run_id;
		public Object value;
		public String workspace_id;
	}

	public static class GatewayObservabilityEventCreateRequest {
		public Object category;
		public String end_user_id;
		public String event_name;
		public Object metadata;
		public Object metadata_dimensions;
		public Double numeric_value;
		public String occurred_at;
		public String preset_id;
		public String request_id;
		public String session_id;
		public Object source;
		public String test_run_id;
		public Object value;
	}

	public static class GatewayObservabilityEventListResponse {
		public java.util.List<Object> data;
	}

	public static class GatewayObservabilityEventResponse {
		public Object data;
	}

	public static class GatewayPricing {
		public Object meters;
		public Object pricing_plan;
	}

	public static class GatewayPricingMeter {
	}

	public static class GatewayProviderAvailabilityReason {
	}

	public static class GatewayRequestLog {
		public String auth_method;
		public Boolean byok;
		public String canonical_model_id;
		public Integer cost_nanos;
		public String created_at;
		public String currency;
		public String endpoint;
		public String error_code;
		public String finish_reason;
		public Double generation_ms;
		public String key_id;
		public Double latency_ms;
		public String location;
		public String model_id;
		public String native_response_id;
		public String oauth_client_id;
		public java.util.List<Object> pricing_lines;
		public String provider;
		public String request_id;
		public String requested_model_id;
		public String routed_model_id;
		public Integer status_code;
		public Boolean stream;
		public Boolean success;
		public Double throughput;
		public Object usage;
	}

	public static class GatewayRequestLogListResponse {
		public java.util.List<Object> data;
		public String from_time;
		public Integer limit;
		public Integer offset;
		public Object ok;
		public String to_time;
		public Integer total;
	}

	public static class GatewayRequestLogResponse {
		public Object data;
		public Object ok;
	}

	public static class GatewayRoutingStatus {
	}

	public static class GatewayWebFetchToolDefinition {
		public Integer max_chars;
		public Object parameters;
		public Object type;
	}

	public static class GatewayWebSearchToolDefinition {
		public Object engine;
		public Boolean include_highlights;
		public Boolean include_text;
		public String language;
		public Integer max_results;
		public Integer page;
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

	public static class Guardrail {
		public java.util.List<String> allowed_api_model_ids;
		public String created_at;
		public Integer daily_limit_cost_nanos;
		public Integer daily_limit_requests;
		public String description;
		public Boolean enabled;
		public String id;
		public Object model_restriction_mode;
		public Integer monthly_limit_cost_nanos;
		public Integer monthly_limit_requests;
		public String name;
		public Boolean privacy_enable_free_may_publish_prompts;
		public Boolean privacy_enable_free_may_train;
		public Boolean privacy_enable_input_output_logging;
		public Boolean privacy_enable_paid_may_train;
		public Boolean privacy_zdr_only;
		public Object prompt_injection_action;
		public Boolean prompt_injection_enabled;
		public Boolean provider_restriction_enforce_allowed;
		public Object provider_restriction_mode;
		public java.util.List<String> provider_restriction_provider_ids;
		public Object sensitive_info_default_action;
		public Boolean sensitive_info_enabled;
		public java.util.List<Object> sensitive_info_rules;
		public String updated_at;
		public Integer weekly_limit_cost_nanos;
		public Integer weekly_limit_requests;
		public String workspace_id;
	}

	public static class GuardrailBudgetInput {
		public Integer dailyCostNanos;
		public Integer dailyRequests;
		public Integer monthlyCostNanos;
		public Integer monthlyRequests;
		public Integer weeklyCostNanos;
		public Integer weeklyRequests;
	}

	public static class GuardrailCreateRequest {
		public java.util.List<String> allowedApiModelIds;
		public Object budgets;
		public String description;
		public Boolean enabled;
		public Object modelRestrictionMode;
		public String name;
		public Boolean privacyEnableFreeMayPublishPrompts;
		public Boolean privacyEnableFreeMayTrain;
		public Boolean privacyEnableInputOutputLogging;
		public Boolean privacyEnablePaidMayTrain;
		public Boolean privacyZdrOnly;
		public Object promptInjectionAction;
		public Boolean promptInjectionEnabled;
		public Boolean providerRestrictionEnforceAllowed;
		public Object providerRestrictionMode;
		public java.util.List<String> providerRestrictionProviderIds;
		public Object sensitiveInfoDefaultAction;
		public Boolean sensitiveInfoEnabled;
		public java.util.List<Object> sensitiveInfoRules;
	}

	public static class GuardrailDeleteResponse {
		public Object deleted;
	}

	public static class GuardrailDetailResponse {
		public Object data;
	}

	public static class GuardrailKeyAddResponse {
		public Integer added_count;
		public java.util.List<Object> data;
	}

	public static class GuardrailKeyAssignment {
		public String created_at;
		public String key_id;
		public String name;
		public String prefix;
		public String status;
	}

	public static class GuardrailKeyIdsReplaceRequest {
		public java.util.List<String> key_ids;
	}

	public static class GuardrailKeyIdsRequest {
		public java.util.List<String> key_ids;
	}

	public static class GuardrailKeyListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class GuardrailKeySetResponse {
		public Object data;
	}

	public static class GuardrailListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class GuardrailMemberAddResponse {
		public Integer added_count;
		public java.util.List<Object> data;
	}

	public static class GuardrailMemberAssignment {
		public String display_name;
		public String joined_at;
		public String role;
		public String user_id;
	}

	public static class GuardrailMemberListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class GuardrailPolicyInput {
		public java.util.List<String> allowedApiModelIds;
		public Object budgets;
		public String description;
		public Boolean enabled;
		public Object modelRestrictionMode;
		public String name;
		public Boolean privacyEnableFreeMayPublishPrompts;
		public Boolean privacyEnableFreeMayTrain;
		public Boolean privacyEnableInputOutputLogging;
		public Boolean privacyEnablePaidMayTrain;
		public Boolean privacyZdrOnly;
		public Object promptInjectionAction;
		public Boolean promptInjectionEnabled;
		public Boolean providerRestrictionEnforceAllowed;
		public Object providerRestrictionMode;
		public java.util.List<String> providerRestrictionProviderIds;
		public Object sensitiveInfoDefaultAction;
		public Boolean sensitiveInfoEnabled;
		public java.util.List<Object> sensitiveInfoRules;
	}

	public static class GuardrailRemoveResponse {
		public Integer removed_count;
	}

	public static class GuardrailResponse {
		public Object data;
	}

	public static class GuardrailUpdateRequest {
		public java.util.List<String> allowedApiModelIds;
		public Object budgets;
		public String description;
		public Boolean enabled;
		public Object modelRestrictionMode;
		public String name;
		public Boolean privacyEnableFreeMayPublishPrompts;
		public Boolean privacyEnableFreeMayTrain;
		public Boolean privacyEnableInputOutputLogging;
		public Boolean privacyEnablePaidMayTrain;
		public Boolean privacyZdrOnly;
		public Object promptInjectionAction;
		public Boolean promptInjectionEnabled;
		public Boolean providerRestrictionEnforceAllowed;
		public Object providerRestrictionMode;
		public java.util.List<String> providerRestrictionProviderIds;
		public Object sensitiveInfoDefaultAction;
		public Boolean sensitiveInfoEnabled;
		public java.util.List<Object> sensitiveInfoRules;
	}

	public static class GuardrailUserIdsRequest {
		public java.util.List<String> user_ids;
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
		public String resolution;
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
		public String resolution;
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

	public static class ManagementKeyCollectionResponse {
		public java.util.List<Object> data;
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

	public static class ManagementKeyRuntime {
		public String created_at;
		public String created_by;
		public Integer daily_limit_cost_nanos;
		public Integer daily_limit_requests;
		public String expires_at;
		public String id;
		public String last_used_at;
		public Integer monthly_limit_cost_nanos;
		public Integer monthly_limit_requests;
		public String name;
		public String prefix;
		public java.util.List<String> scopes;
		public Boolean soft_blocked;
		public Object status;
		public String updated_at;
		public Integer weekly_limit_cost_nanos;
		public Integer weekly_limit_requests;
		public String workspace_id;
	}

	public static class ManagementKeyRuntimeCreated {
		public String created_at;
		public String created_by;
		public Integer daily_limit_cost_nanos;
		public Integer daily_limit_requests;
		public String expires_at;
		public String id;
		public String key;
		public String last_used_at;
		public Integer monthly_limit_cost_nanos;
		public Integer monthly_limit_requests;
		public String name;
		public String prefix;
		public java.util.List<String> scopes;
		public Boolean soft_blocked;
		public Object status;
		public String updated_at;
		public Integer weekly_limit_cost_nanos;
		public Integer weekly_limit_requests;
		public String workspace_id;
	}

	public static class ManagementKeyRuntimeCreateRequest {
		public String expires_at;
		public String name;
		public Boolean paused;
		public Object scopes;
		public Object template;
	}

	public static class ManagementKeyRuntimeCreateResponse {
		public Object data;
	}

	public static class ManagementKeyRuntimeDeleteResponse {
		public Object deleted;
	}

	public static class ManagementKeyRuntimeResponse {
		public Object data;
	}

	public static class ManagementKeyRuntimeUpdateRequest {
		public Integer dailyCostNanos;
		public Integer dailyRequests;
		public String expires_at;
		public Integer monthlyCostNanos;
		public Integer monthlyRequests;
		public String name;
		public Boolean paused;
		public Object scopes;
		public Boolean softBlocked;
		public Object template;
		public Integer weeklyCostNanos;
		public Integer weeklyRequests;
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
		public Object availability;
		public String base_model_id;
		public Object capabilities;
		public String description;
		public String id;
		public Object lifecycle;
		public Object limits;
		public Object modalities;
		public String name;
		public java.util.List<Object> offers;
		public Object organization;
		public Object pricing;
		public String variant;
		public Object variants;
	}

	public static class ModelAvailability {
		public Integer active_provider_count;
		public Integer coming_soon_provider_count;
		public Integer inactive_provider_count;
		public Integer provider_count;
		public Object status;
	}

	public static class ModelEndpointCapability {
		public Object capabilities;
		public String capability_id;
		public Object collection;
		public Object effective;
		public String endpoint;
		public String id;
		public Object modalities;
		public String model;
		public Object pricing;
		public Object provider;
		public String public_path;
		public Boolean routable;
		public Object routing;
		public Object status;
		public Object status_reason;
	}

	public static class ModelEndpointsResponse {
		public Object availability_mode;
		public String description;
		public java.util.List<Object> endpoints;
		public String id;
		public Object modalities;
		public String name;
		public Object ok;
		public Object organization;
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
		public Object meta;
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
		public String audio_base64;
		public String audio_url;
		public String id;
		public String model;
		public String nativeResponseId;
		public Object object;
		public java.util.List<Object> output;
		public String provider;
		public Object result;
		public Object status;
		public Object usage;
	}

	public static class NotImplementedResponse {
		public String description;
		public String error;
		public Integer status_code;
	}

	public static class OAuthClient {
		public Integer active_authorizations;
		public java.util.List<String> allowed_scopes;
		public String client_id;
		public Object client_type;
		public String created_at;
		public String description;
		public String homepage_url;
		public String last_used_at;
		public String logo_url;
		public String name;
		public String privacy_policy_url;
		public java.util.List<String> redirect_uris;
		public Integer requests_last_30d;
		public String status;
		public String terms_of_service_url;
		public Integer total_authorizations;
		public String updated_at;
		public String workspace_id;
	}

	public static class OAuthClientCreateRequest {
		public java.util.List<String> allowed_scopes;
		public Object client_type;
		public String description;
		public String homepage_url;
		public String logo_url;
		public String name;
		public String privacy_policy_url;
		public java.util.List<String> redirect_uris;
		public String terms_of_service_url;
	}

	public static class OAuthClientCreateResponse {
		public Integer active_authorizations;
		public java.util.List<String> allowed_scopes;
		public String client_id;
		public String client_secret;
		public Object client_type;
		public String created_at;
		public String description;
		public String homepage_url;
		public String last_used_at;
		public String logo_url;
		public String name;
		public String privacy_policy_url;
		public java.util.List<String> redirect_uris;
		public Integer requests_last_30d;
		public String status;
		public String terms_of_service_url;
		public Integer total_authorizations;
		public String updated_at;
		public String workspace_id;
	}

	public static class OAuthClientDeleteResponse {
		public String client_id;
		public String message;
	}

	public static class OAuthClientInput {
		public java.util.List<String> allowed_scopes;
		public String description;
		public String homepage_url;
		public String logo_url;
		public String name;
		public String privacy_policy_url;
		public java.util.List<String> redirect_uris;
		public String terms_of_service_url;
	}

	public static class OAuthClientListResponse {
		public java.util.List<Object> data;
		public Object pagination;
	}

	public static class OAuthClientSecretResponse {
		public String client_id;
		public String client_secret;
		public String message;
	}

	public static class OAuthClientUpdateRequest {
		public java.util.List<String> allowed_scopes;
		public String description;
		public String homepage_url;
		public String logo_url;
		public String name;
		public String privacy_policy_url;
		public java.util.List<String> redirect_uris;
		public String terms_of_service_url;
	}

	public static class ObservabilityDestination {
		public Boolean configured;
		public String created_at;
		public Boolean enabled;
		public Object group_join;
		public String id;
		public Boolean include_cost_metadata;
		public Boolean include_generation_metadata;
		public Boolean include_identity_metadata;
		public Boolean include_request_context;
		public java.util.List<Object> key_filters;
		public String name;
		public Boolean privacy_mode;
		public java.util.List<Object> rule_groups;
		public Double sampling_rate;
		public Object type;
		public String updated_at;
		public String workspace_id;
	}

	public static class ObservabilityDestinationCreateRequest {
		public Object config;
		public Boolean enabled;
		public Object group_join;
		public Boolean include_cost_metadata;
		public Boolean include_generation_metadata;
		public Boolean include_identity_metadata;
		public Boolean include_request_context;
		public java.util.List<Object> key_filters;
		public String name;
		public Boolean privacy_mode;
		public java.util.List<Object> rule_groups;
		public Double sampling_rate;
		public Object type;
	}

	public static class ObservabilityDestinationListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class ObservabilityDestinationPolicyInput {
		public Boolean enabled;
		public Object group_join;
		public Boolean include_cost_metadata;
		public Boolean include_generation_metadata;
		public Boolean include_identity_metadata;
		public Boolean include_request_context;
		public java.util.List<Object> key_filters;
		public String name;
		public Boolean privacy_mode;
		public java.util.List<Object> rule_groups;
		public Double sampling_rate;
	}

	public static class ObservabilityDestinationResponse {
		public Object data;
	}

	public static class ObservabilityDestinationType {
	}

	public static class ObservabilityDestinationUpdateRequest {
		public Object config;
		public Boolean enabled;
		public Object group_join;
		public Boolean include_cost_metadata;
		public Boolean include_generation_metadata;
		public Boolean include_identity_metadata;
		public Boolean include_request_context;
		public java.util.List<Object> key_filters;
		public String name;
		public Boolean privacy_mode;
		public java.util.List<Object> rule_groups;
		public Double sampling_rate;
	}

	public static class ObservabilityKeyFilter {
		public String key_id;
		public Object mode;
	}

	public static class ObservabilityLoggingPolicy {
		public Object billing_status;
		public Boolean enabled;
		public String grace_until;
		public Boolean include_provider_payloads;
		public Integer price_per_million_units_nanos;
		public Integer retention_days;
		public String updated_at;
		public String workspace_id;
	}

	public static class ObservabilityLoggingPolicyResponse {
		public Object data;
	}

	public static class ObservabilityLoggingPolicyUpdateRequest {
		public Boolean enabled;
		public Boolean include_provider_payloads;
		public Integer retention_days;
	}

	public static class ObservabilityRule {
		public Object condition;
		public Object field;
		public String value;
	}

	public static class ObservabilityRuleGroup {
		public Object match;
		public java.util.List<Object> rules;
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

	public static class ParseBlock {
	}

	public static class ParseBoundingBox {
		public Double bottom_right_x;
		public Double bottom_right_y;
		public Double top_left_x;
		public Double top_left_y;
	}

	public static class ParseImage {
		public Object bounding_box;
		public Object bounding_box_normalized;
		public Object category;
		public String description;
		public String id;
	}

	public static class ParsePage {
	}

	public static class ParseRequest {
		public Object debug;
		public Object document;
		public Boolean echo_upstream_request;
		public String model;
		public Object output_format;
		public Object provider;
		public Object routing;
	}

	public static class ParseResponse {
		public String id;
		public Object meta;
		public String model;
		public Object object;
		public java.util.List<Object> pages;
		public String provider;
		public Object usage;
	}

	public static class Preset {
		public String active_version_id;
		public Object config;
		public String created_at;
		public String created_by;
		public String description;
		public String id;
		public String name;
		public String slug;
		public String source_preset_id;
		public String source_preset_version_id;
		public String updated_at;
		public String upstream_version_id;
		public Object versioning_method;
		public Object visibility;
		public String workspace_id;
	}

	public static class PresetConfig {
	}

	public static class PresetCreateRequest {
		public Object config;
		public String description;
		public String name;
		public String slug;
		public Object versioning_method;
		public Object visibility;
	}

	public static class PresetCreateResponse {
		public String canonical_model;
		public Object data;
	}

	public static class PresetForkRequest {
		public String source_version_id;
	}

	public static class PresetListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class PresetPublisher {
		public String handle;
		public String workspace_id;
	}

	public static class PresetPublisherResponse {
		public Object data;
	}

	public static class PresetPublisherUpdateRequest {
		public String handle;
	}

	public static class PresetResponse {
		public Object data;
	}

	public static class PresetTestRun {
		public String baseline_preset_id;
		public String completed_at;
		public Object config;
		public String created_at;
		public String created_by_user_id;
		public String dataset_name;
		public String description;
		public String id;
		public String name;
		public String preset_id;
		public String started_at;
		public Object status;
		public Object summary;
		public String updated_at;
		public String workspace_id;
	}

	public static class PresetTestRunCreateRequest {
		public String baseline_preset_id;
		public String completed_at;
		public Object config;
		public String dataset_name;
		public String description;
		public String name;
		public String preset_id;
		public String started_at;
		public Object status;
		public Object summary;
	}

	public static class PresetTestRunDetailResponse {
		public Object data;
		public Object feedback_summary;
	}

	public static class PresetTestRunListResponse {
		public java.util.List<Object> data;
	}

	public static class PresetTestRunResponse {
		public Object data;
	}

	public static class PresetTestRunUpdateRequest {
		public String completed_at;
		public String description;
		public String name;
		public String started_at;
		public Object status;
		public Object summary;
	}

	public static class PresetUpdateRequest {
		public Object config;
		public String description;
		public String name;
		public Boolean replace_config;
		public String slug;
		public Object versioning_method;
		public Object visibility;
	}

	public static class PresetUpstreamApplyRequest {
		public String version_id;
	}

	public static class PresetUpstreamApplyResponse {
		public Object data;
	}

	public static class PresetVersion {
		public Object config;
		public String created_at;
		public String created_by;
		public String description;
		public String id;
		public String name;
		public String preset_id;
		public String release_notes;
		public String slug;
		public String version_label;
		public Integer version_number;
		public Object versioning_method;
		public Object visibility;
	}

	public static class PresetVersioningMethod {
	}

	public static class PresetVersionListResponse {
		public java.util.List<Object> data;
	}

	public static class PresetVersionPublishRequest {
		public String release_notes;
		public String version_label;
	}

	public static class PresetVersionResponse {
		public Object data;
	}

	public static class PresetVisibility {
	}

	public static class PrivateModel {
		public String base_url;
		public String catalog_model_id;
		public Integer context_length;
		public String created_at;
		public String created_by;
		public String credential_prefix;
		public String credential_suffix;
		public String custom_provider_name;
		public String custom_provider_url;
		public String description;
		public Boolean enabled;
		public String host_provider_id;
		public String id;
		public java.util.List<String> input_modalities;
		public String local_slug;
		public Integer max_output_tokens;
		public String model_id;
		public String name;
		public java.util.List<String> output_modalities;
		public Object routing_policy;
		public Boolean supports_responses;
		public String updated_at;
		public String upstream_model_id;
		public String workspace_id;
	}

	public static class PrivateModelCreateRequest {
		public String base_url;
		public Integer context_length;
		public String credential;
		public String custom_provider_name;
		public String custom_provider_url;
		public String description;
		public Boolean enabled;
		public String host_provider_id;
		public Integer max_output_tokens;
		public String model_reference;
		public String name;
		public Object routing_policy;
		public Boolean supports_responses;
		public String upstream_model_id;
	}

	public static class PrivateModelDeleteResponse {
		public Boolean deleted;
	}

	public static class PrivateModelListResponse {
		public java.util.List<Object> data;
	}

	public static class PrivateModelResponse {
		public Object data;
	}

	public static class PrivateModelUpdateRequest {
		public String base_url;
		public Integer context_length;
		public String credential;
		public String custom_provider_name;
		public String custom_provider_url;
		public String description;
		public Boolean enabled;
		public String host_provider_id;
		public Integer max_output_tokens;
		public String model_reference;
		public String name;
		public Object routing_policy;
		public Boolean supports_responses;
		public String upstream_model_id;
	}

	public static class Provider {
		public String api_provider_id;
		public String api_provider_name;
		public String country_code;
		public String description;
		public String link;
	}

	public static class ProviderCredential {
		public java.util.List<String> allowed_api_key_ids;
		public java.util.List<String> allowed_model_slugs;
		public Boolean always_use;
		public String created_at;
		public String created_by;
		public Boolean disabled;
		public Boolean enabled;
		public String error_message;
		public String id;
		public Boolean is_fallback;
		public String last_used_at;
		public String last_verified_at;
		public String name;
		public String prefix;
		public String provider_id;
		public Object routing_mode;
		public Integer sort_order;
		public String suffix;
		public String verification_status;
		public String workspace_id;
	}

	public static class ProviderCredentialCreateRequest {
		public java.util.List<String> allowed_api_key_ids;
		public java.util.List<String> allowed_models;
		public Boolean enabled;
		public String key;
		public String name;
		public String provider;
		public Object routing_mode;
	}

	public static class ProviderCredentialDeleteResponse {
		public Boolean deleted;
	}

	public static class ProviderCredentialListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class ProviderCredentialReorderRequest {
		public java.util.List<String> key_ids;
		public String provider;
		public Object routing_mode;
	}

	public static class ProviderCredentialReorderResponse {
		public Boolean reordered;
	}

	public static class ProviderCredentialResponse {
		public Object data;
	}

	public static class ProviderCredentialRoutingMode {
	}

	public static class ProviderCredentialUpdateRequest {
		public java.util.List<String> allowed_api_key_ids;
		public java.util.List<String> allowed_models;
		public Boolean enabled;
		public String key;
		public String name;
		public Object routing_mode;
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

	public static class ReasoningConfig {
		public Object effort;
		public Boolean enabled;
		public Integer max_tokens;
		public Object mode;
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
		public Integer cost_cents;
		public Double cost_nanos;
		public Integer created;
		public String currency;
		public String finish_reason;
		public String id;
		public Object meta;
		public String model;
		public String nativeResponseId;
		public String object;
		public java.util.List<Object> output;
		public java.util.List<Object> output_items;
		public java.util.List<Object> pricing_lines;
		public String provider;
		public String provider_id;
		public String role;
		public Object status;
		public String stop_reason;
		public String type;
		public Object usage;
	}

	public static class SearchModelsToolDefinition {
		public Object parameters;
		public Object type;
	}

	public static class ServerToolUsage {
		public Integer advisor_requests;
		public Integer apply_patch_requests;
		public Integer datetime_requests;
		public Integer fusion_requests;
		public Integer image_generation_requests;
		public Integer search_models_requests;
		public Integer subagent_requests;
		public Integer web_fetch_requests;
		public Integer web_search_requests;
	}

	public static class SubagentToolDefinition {
		public Object parameters;
		public Object type;
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

	public static class UpdatedResponse {
		public Object data;
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
		public java.util.List<Object> frame_images;
		public Boolean generate_audio;
		public Double input_audio_duration;
		public java.util.List<Object> input_references;
		public Double input_video_duration;
		public String model;
		public String negative_prompt;
		public Object output;
		public String person_generation;
		public String prompt;
		public Object provider;
		public Object provider_options;
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

	public static class WebhookEndpoint {
		public String createdAt;
		public String createdBy;
		public String deletedAt;
		public java.util.List<String> events;
		public Boolean hasSecret;
		public String id;
		public String name;
		public Object status;
		public String updatedAt;
		public String url;
		public String workspaceId;
	}

	public static class WebhookEndpointCreateRequest {
		public java.util.List<String> events;
		public String name;
		public String url;
	}

	public static class WebhookEndpointDeleteResponse {
		public Object deleted;
		public String id;
		public Object object;
	}

	public static class WebhookEndpointInput {
		public java.util.List<String> events;
		public String name;
		public String url;
	}

	public static class WebhookEndpointListResponse {
		public java.util.List<Object> data;
		public Object object;
	}

	public static class WebhookEndpointSecretResponse {
		public String createdAt;
		public String createdBy;
		public String deletedAt;
		public java.util.List<String> events;
		public Boolean hasSecret;
		public String id;
		public String name;
		public String signing_secret;
		public Object status;
		public String updatedAt;
		public String url;
		public String workspaceId;
	}

	public static class WebhookEndpointUpdateRequest {
		public java.util.List<String> events;
		public String name;
		public Object status;
		public String url;
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

	public static class WorkspaceApp {
		public String app_key;
		public String category;
		public String created_at;
		public String docs_url;
		public String id;
		public String image_url;
		public Boolean is_active;
		public Boolean is_managed;
		public Boolean is_public;
		public String last_seen;
		public String title;
		public String url;
	}

	public static class WorkspaceAppListResponse {
		public java.util.List<Object> data;
		public Integer limit;
		public Integer offset;
		public Integer total_count;
	}

	public static class WorkspaceAppMergeRequest {
		public String target_app_id;
	}

	public static class WorkspaceAppMergeResponse {
		public Object data;
	}

	public static class WorkspaceAppResponse {
		public Object data;
	}

	public static class WorkspaceAppUpdateRequest {
		public String category;
		public String docs_url;
		public String image_url;
		public Boolean is_active;
		public Boolean is_public;
		public String title;
		public String url;
	}

	public static class WorkspaceAssignableRole {
	}

	public static class WorkspaceAuditEvent {
		public String action;
		public Object actor;
		public String actor_user_id;
		public String created_at;
		public String id;
		public Object metadata;
		public String request_id;
		public String target_id;
		public String target_name;
		public String target_type;
		public String workspace_id;
	}

	public static class WorkspaceAuditEventActor {
		public String display_name;
		public String email;
	}

	public static class WorkspaceAuditEventLimits {
		public Integer dailyCostNanos;
		public Integer dailyRequests;
		public Integer monthlyCostNanos;
		public Integer monthlyRequests;
		public Boolean softBlocked;
		public Integer weeklyCostNanos;
		public Integer weeklyRequests;
	}

	public static class WorkspaceAuditEventListResponse {
		public java.util.List<Object> data;
		public Boolean has_more;
		public String next_cursor;
	}

	public static class WorkspaceAuditEventMetadata {
		public String accessTemplate;
		public java.util.List<String> changedFields;
		public String expiresAt;
		public Object limits;
		public String prefix;
		public String previousKeyExpiresAt;
		public String replacementKeyId;
		public String replacementKeyName;
		public String status;
	}

	public static class WorkspaceAutoTopUpSettings {
		public Integer amount_nanos;
		public Integer balance_threshold_nanos;
		public Boolean enabled;
		public String payment_method_id;
	}

	public static class WorkspaceAutoTopUpUpdate {
		public Integer amount_nanos;
		public Integer balance_threshold_nanos;
		public Boolean enabled;
		public String payment_method_id;
	}

	public static class WorkspaceBudget {
		public String created_at;
		public String created_by;
		public Boolean exceeded;
		public String id;
		public Object interval;
		public Double limit;
		public Integer limit_nanos;
		public Double remaining;
		public Integer remaining_nanos;
		public String reset_at;
		public String updated_at;
		public Double usage;
		public Integer usage_nanos;
		public String window_start;
		public String workspace_id;
	}

	public static class WorkspaceBudgetDeleteResponse {
		public Object data;
	}

	public static class WorkspaceBudgetInput {
		public Object interval;
		public Double limit;
	}

	public static class WorkspaceBudgetInterval {
	}

	public static class WorkspaceBudgetListResponse {
		public java.util.List<Object> data;
	}

	public static class WorkspaceBudgetResponse {
		public Object data;
	}

	public static class WorkspaceBudgetUpdateInput {
		public Object interval;
		public Double limit;
	}

	public static class WorkspaceCreateRequest {
		public String name;
		public String slug;
	}

	public static class WorkspaceDepartment {
		public String color;
		public String created_at;
		public String description;
		public String directory_name;
		public String icon;
		public String id;
		public String name;
		public Boolean name_overridden;
		public String source_id;
		public Object source_type;
		public String updated_at;
	}

	public static class WorkspaceDepartmentCreateRequest {
		public Object color;
		public String description;
		public Object icon;
		public String name;
	}

	public static class WorkspaceDepartmentInput {
		public Object color;
		public String description;
		public Object icon;
		public String name;
	}

	public static class WorkspaceDepartmentListResponse {
		public java.util.List<Object> data;
	}

	public static class WorkspaceDepartmentMember {
		public String department_id;
		public Boolean is_primary;
		public Object position;
		public String user_id;
	}

	public static class WorkspaceDepartmentMemberRequest {
		public Object position;
		public Boolean primary;
	}

	public static class WorkspaceDepartmentMemberResponse {
		public Object data;
	}

	public static class WorkspaceDepartmentResponse {
		public Object data;
	}

	public static class WorkspaceDepartmentUpdateRequest {
		public Object color;
		public String description;
		public Object icon;
		public String name;
	}

	public static class WorkspaceDirectoryMember {
		public String access_source;
		public Object department;
		public Boolean department_override_enabled;
		public String department_override_id;
		public String department_source;
		public String directory_department;
		public String display_name;
		public Object effective_role;
		public String email;
		public String joined_at;
		public Object role_override;
		public Object status;
		public String user_id;
		public String workspace_role;
	}

	public static class WorkspaceDirectoryMemberUpdateRequest {
		public Object access_role;
		public String department_id;
		public Object department_mode;
		public Object department_position;
	}

	public static class WorkspaceDirectoryResponse {
		public Object data;
	}

	public static class WorkspaceGroupMapping {
		public Object access_role;
		public String created_at;
		public String department_id;
		public Object department_position;
		public String id;
		public String scim_group_id;
		public String updated_at;
	}

	public static class WorkspaceGroupMappingCreateRequest {
		public Object access_role;
		public String department_id;
		public Object department_position;
		public String scim_group_id;
	}

	public static class WorkspaceGroupMappingListResponse {
		public java.util.List<Object> data;
	}

	public static class WorkspaceGroupMappingResponse {
		public Object data;
	}

	public static class WorkspaceGroupMappingUpdateRequest {
		public Object access_role;
		public Object department_position;
	}

	public static class WorkspaceInvite {
		public String created_at;
		public String creator_user_id;
		public String expires_at;
		public String id;
		public Integer max_uses;
		public Object role;
		public String token_preview;
		public Integer uses_count;
		public String workspace_id;
	}

	public static class WorkspaceInviteCreateRequest {
		public Integer expires_in_days;
		public Integer max_uses;
		public Object role;
	}

	public static class WorkspaceInviteCreateResponse {
		public Object data;
		public String token;
	}

	public static class WorkspaceInviteListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class WorkspaceJoinRequest {
		public String created_at;
		public String decided_at;
		public String decided_by;
		public String id;
		public String invite_id;
		public String requester_user_id;
		public Object status;
		public String workspace_id;
	}

	public static class WorkspaceJoinRequestListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class WorkspaceJoinRequestResponse {
		public Object data;
	}

	public static class WorkspaceJoinRequestStatus {
	}

	public static class WorkspaceListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class WorkspaceLowBalanceEmailSettings {
		public Boolean enabled;
		public Double threshold_usd;
	}

	public static class WorkspaceLowBalanceEmailUpdate {
		public Boolean enabled;
		public Double threshold_usd;
	}

	public static class WorkspaceMember {
		public String display_name;
		public String joined_at;
		public Object role;
		public String user_id;
		public String workspace_id;
	}

	public static class WorkspaceMemberAddResponse {
		public Integer added_count;
		public java.util.List<Object> data;
	}

	public static class WorkspaceMemberBulkRequest {
		public Object role;
		public java.util.List<String> user_ids;
	}

	public static class WorkspaceMemberListResponse {
		public java.util.List<Object> data;
		public Integer total_count;
	}

	public static class WorkspaceMemberRemoveRequest {
		public java.util.List<String> user_ids;
	}

	public static class WorkspaceMemberRemoveResponse {
		public Integer removed_count;
	}

	public static class WorkspaceMemberResponse {
		public Object data;
	}

	public static class WorkspaceMemberRoleUpdateRequest {
		public Object role;
	}

	public static class WorkspaceNotificationDestination {
		public String created_at;
		public String id;
		public String name;
		public Object status;
		public String target_preview;
		public Object type;
		public String updated_at;
	}

	public static class WorkspaceNotificationDestinationCreateRequest {
		public String name;
		public String target;
		public Object type;
	}

	public static class WorkspaceNotificationDestinationListResponse {
		public java.util.List<Object> data;
	}

	public static class WorkspaceNotificationDestinationResponse {
		public Object data;
	}

	public static class WorkspaceNotificationDestinationTestRequest {
		public String target;
		public Object type;
	}

	public static class WorkspaceNotificationDestinationType {
	}

	public static class WorkspaceNotificationEmailPreferences {
		public Boolean auto_top_up_failure;
		public Boolean model_deprecation;
		public Boolean payment_method_expiring;
	}

	public static class WorkspaceNotificationEmailPreferencesUpdate {
		public Boolean auto_top_up_failure;
		public Boolean model_deprecation;
		public Boolean payment_method_expiring;
	}

	public static class WorkspaceNotificationEventKind {
	}

	public static class WorkspaceNotificationRoute {
		public java.util.List<String> destination_ids;
		public Object event_kind;
	}

	public static class WorkspaceNotificationRouteMap {
		public java.util.List<String> auto_top_up_failed;
		public java.util.List<String> low_balance;
		public java.util.List<String> model_deprecation;
		public java.util.List<String> payment_method_expiring;
	}

	public static class WorkspaceNotificationRouteResponse {
		public Object data;
	}

	public static class WorkspaceNotificationRoutesResponse {
		public Object data;
	}

	public static class WorkspaceNotificationRouteUpdateRequest {
		public java.util.List<String> destination_ids;
	}

	public static class WorkspaceNotificationSettings {
		public Object auto_top_up;
		public Object email_preferences;
		public Object low_balance_email;
	}

	public static class WorkspaceNotificationSettingsResponse {
		public Object data;
	}

	public static class WorkspaceNotificationSettingsUpdateRequest {
		public Object auto_top_up;
		public Object email_preferences;
		public Object low_balance_email;
	}

	public static class WorkspaceNotificationTestResponse {
		public Object data;
	}

	public static class WorkspaceProviderRestrictionMode {
	}

	public static class WorkspaceResponse {
		public Object data;
	}

	public static class WorkspaceRole {
	}

	public static class WorkspaceRoutingMode {
	}

	public static class WorkspaceScimAuditResponse {
		public java.util.List<Object> data;
	}

	public static class WorkspaceScimEndpoint {
		public String created_at;
		public Boolean enabled;
		public String id;
		public String updated_at;
	}

	public static class WorkspaceScimEndpointResponse {
		public Object data;
	}

	public static class WorkspaceScimEvent {
		public String action;
		public String correlation_id;
		public String created_at;
		public Object detail;
		public Integer http_status;
		public String id;
		public String outcome;
		public String request_id;
		public String resource_id;
		public String resource_type;
		public String scim_type;
	}

	public static class WorkspaceScimResponse {
		public Object data;
	}

	public static class WorkspaceScimToken {
		public String created_at;
		public String expires_at;
		public String id;
		public String label;
		public String last_used_at;
		public String revoked_at;
		public String token_prefix;
	}

	public static class WorkspaceScimTokenCreateRequest {
		public String expires_at;
		public String label;
	}

	public static class WorkspaceScimTokenCreateResponse {
		public Object data;
	}

	public static class WorkspaceScimUpdateRequest {
		public Boolean enabled;
	}

	public static class WorkspaceSettings {
		public Boolean alpha_channel_enabled;
		public Boolean beta_channel_enabled;
		public Boolean byok_fallback_enabled;
		public Boolean io_logging_enabled;
		public Boolean io_logging_include_provider_payloads;
		public Boolean privacy_enable_free_may_publish_prompts;
		public Boolean privacy_enable_free_may_train;
		public Boolean privacy_enable_input_output_logging;
		public Boolean privacy_enable_paid_may_train;
		public Boolean privacy_zdr_only;
		public Boolean provider_restriction_enforce_allowed;
		public Object provider_restriction_mode;
		public java.util.List<String> provider_restriction_provider_ids;
		public Boolean response_healing_enabled;
		public Boolean response_healing_locked;
		public Object response_healing_mode;
		public Object routing_mode;
		public String updated_at;
		public String workspace_id;
	}

	public static class WorkspaceSettingsResponse {
		public Object data;
	}

	public static class WorkspaceSettingsUpdateRequest {
		public Boolean alpha_channel_enabled;
		public Boolean beta_channel_enabled;
		public Boolean byok_fallback_enabled;
		public Boolean io_logging_enabled;
		public Boolean io_logging_include_provider_payloads;
		public Boolean privacy_enable_free_may_publish_prompts;
		public Boolean privacy_enable_free_may_train;
		public Boolean privacy_enable_input_output_logging;
		public Boolean privacy_enable_paid_may_train;
		public Boolean privacy_zdr_only;
		public Boolean provider_restriction_enforce_allowed;
		public Object provider_restriction_mode;
		public java.util.List<String> provider_restriction_provider_ids;
		public Boolean response_healing_enabled;
		public Boolean response_healing_locked;
		public Object response_healing_mode;
		public Object routing_mode;
	}

	public static class WorkspaceSsoResponse {
		public Object data;
	}

	public static class WorkspaceSsoSettings {
		public java.util.List<String> domains;
		public Boolean enabled;
		public Object enforced;
		public Object mode;
		public String provider_identifier;
	}

	public static class WorkspaceSsoUpdateRequest {
		public java.util.List<String> domains;
		public Boolean enabled;
		public Object enforced;
		public Object mode;
		public String provider_identifier;
	}

	public static class WorkspaceUpdateRequest {
		public String name;
		public String slug;
	}

}
