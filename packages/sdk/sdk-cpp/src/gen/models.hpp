#pragma once
#include <any>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace phaseo::gen {
struct ActivityEntry {
	double byok_usage_inference;
	int completion_tokens;
	std::string date;
	std::string endpoint_id;
	std::string model;
	std::string model_permaslug;
	int prompt_tokens;
	std::string provider_name;
	int reasoning_tokens;
	int requests;
	double usage;
};

struct ActivityResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct AnalyticsAccessTokenRequiredResponse {
	std::any error;
	std::any ok;
};

struct AnalyticsNotImplementedResponse {
	std::string message;
	std::any ok;
	std::any status;
};

struct AnalyticsResponse {
	std::vector<std::map<std::string, std::any>> data;
	int limit;
	int offset;
	int total_count;
};

struct AnthropicContentBlock {
	std::map<std::string, std::any> cache_control;
	std::string content;
	std::string id;
	std::map<std::string, std::any> input;
	std::string name;
	std::map<std::string, std::any> source;
	std::string text;
	std::string tool_use_id;
	std::any type;
};

struct AnthropicMessage {
	std::any content;
	std::any role;
};

struct AnthropicMessagesRequest {
	std::map<std::string, std::any> debug;
	std::optional<bool> echo_upstream_request;
	int max_tokens;
	std::vector<std::map<std::string, std::any>> messages;
	std::optional<bool> meta;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::map<std::string, std::any> reasoning;
	std::string session_id;
	std::vector<std::string> stop_sequences;
	std::optional<bool> stream;
	std::any system;
	std::optional<double> temperature;
	std::any tool_choice;
	std::vector<std::any> tools;
	std::optional<int> top_k;
	std::optional<double> top_p;
	std::optional<bool> usage;
};

struct AnthropicMessagesResponse {
	std::vector<std::map<std::string, std::any>> content;
	std::string id;
	std::string model;
	std::any role;
	std::string stop_reason;
	std::string stop_sequence;
	std::string type;
	std::map<std::string, std::any> usage;
};

struct AnthropicTool {
	std::optional<bool> async;
	std::string description;
	std::map<std::string, std::any> input_schema;
	std::string name;
};

struct AnthropicUsage {
	std::optional<int> input_tokens;
	std::optional<int> output_tokens;
};

struct ApiKey {
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::optional<std::string> creator_user_id;
	bool disabled;
	std::optional<std::string> expires_at;
	std::string hash;
	std::string id;
	bool include_byok_in_limit;
	std::optional<std::string> label;
	std::optional<std::string> last_used_at;
	std::optional<double> limit;
	std::optional<double> limit_remaining;
	std::optional<std::any> limit_reset;
	std::map<std::string, std::any> limits;
	std::optional<std::string> name;
	std::optional<std::string> prefix;
	std::any scopes;
	bool soft_blocked;
	std::optional<std::string> status;
	std::optional<std::string> updated_at;
	double usage;
	double usage_daily;
	std::map<std::string, std::any> usage_details;
	double usage_monthly;
	double usage_weekly;
	std::string workspace_id;
};

struct ApiKeyCreateRequest {
	std::optional<bool> disabled;
	std::optional<std::string> expires_at;
	std::optional<bool> include_byok_in_limit;
	std::optional<double> limit;
	std::any limit_reset;
	std::map<std::string, std::any> limits;
	std::string name;
	std::any scopes;
	std::optional<bool> soft_blocked;
	std::string workspace_id;
};

struct ApiKeyLimitBucket {
	std::optional<double> cost;
	std::optional<int> requests;
};

struct ApiKeyLimitInputBucket {
	std::optional<double> cost;
	std::optional<int> requests;
};

struct ApiKeyLimitInputWindows {
	std::map<std::string, std::any> daily;
	std::map<std::string, std::any> monthly;
	std::map<std::string, std::any> weekly;
};

struct ApiKeyLimitWindows {
	std::map<std::string, std::any> daily;
	std::map<std::string, std::any> monthly;
	std::map<std::string, std::any> weekly;
};

struct ApiKeyListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct ApiKeyResponse {
	std::map<std::string, std::any> data;
};

struct ApiKeyRotateRequest {
	std::string name;
	std::optional<std::string> previous_key_expires_at;
};

struct ApiKeyRotateResponse {
	std::map<std::string, std::any> data;
	std::optional<std::string> previous_key_expires_at;
};

using ApiKeyScopeValue = std::any;

struct ApiKeyUpdateRequest {
	std::optional<bool> disabled;
	std::optional<std::string> expires_at;
	std::optional<bool> include_byok_in_limit;
	std::optional<double> limit;
	std::any limit_reset;
	std::map<std::string, std::any> limits;
	std::string name;
	std::any scopes;
	std::optional<bool> soft_blocked;
};

struct ApiKeyUsageBucket {
	double cost;
	int requests;
};

struct ApiKeyUsageWindows {
	std::map<std::string, std::any> daily;
	std::map<std::string, std::any> monthly;
	std::map<std::string, std::any> total;
	std::map<std::string, std::any> weekly;
};

struct ApiKeyWithValue {
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::optional<std::string> creator_user_id;
	bool disabled;
	std::optional<std::string> expires_at;
	std::string hash;
	std::string id;
	bool include_byok_in_limit;
	std::string key;
	std::optional<std::string> label;
	std::optional<std::string> last_used_at;
	std::optional<double> limit;
	std::optional<double> limit_remaining;
	std::optional<std::any> limit_reset;
	std::map<std::string, std::any> limits;
	std::optional<std::string> name;
	std::optional<std::string> prefix;
	std::any scopes;
	bool soft_blocked;
	std::optional<std::string> status;
	std::optional<std::string> updated_at;
	double usage;
	double usage_daily;
	std::map<std::string, std::any> usage_details;
	double usage_monthly;
	double usage_weekly;
	std::string workspace_id;
};

struct ApiKeyWithValueResponse {
	std::map<std::string, std::any> data;
};

struct AsyncJobWebSocketClientEvent {
	std::any type;
};

struct AsyncJobWebSocketServerEvent {
	std::optional<std::any> data;
	std::any type;
};

struct AsyncJobWebSocketUpgradeRequiredResponse {
	std::map<std::string, std::any> error;
};

struct AsyncWebhookDeliveryAttempt {
	std::optional<int> attempt_number;
	std::optional<std::string> delivered_at;
	std::string delivery_key;
	std::optional<std::string> error_message;
	std::string event_type;
	std::string id;
	std::optional<int> max_attempts;
	std::optional<std::string> next_retry_at;
	std::optional<std::string> response_body_preview;
	std::optional<int> response_status;
	std::any status;
	std::string tried_at;
};

struct AsyncWebhookDeliverySummary {
	std::vector<std::string> delivered_event_types;
	std::optional<int> delivered_events;
	std::optional<std::string> last_attempt_at;
	std::optional<std::any> last_attempt_status;
	std::optional<std::string> last_delivered_at;
	std::optional<std::string> last_error_message;
	std::optional<std::string> last_failure_at;
	std::optional<int> last_response_status;
	std::optional<std::string> next_retry_at;
	std::optional<int> pending_retries;
	std::optional<int> total_attempts;
};

struct AsyncWebhookPublicState {
	std::vector<std::map<std::string, std::any>> attempts;
	std::map<std::string, std::any> delivery;
	std::vector<std::string> events;
	std::optional<bool> has_secret;
	std::optional<std::string> url;
};

struct AudioContentPart {
	std::map<std::string, std::any> input_audio;
	std::any type;
};

struct AudioSpeechRequest {
	std::any format;
	std::string input;
	std::string model;
	std::map<std::string, std::any> provider;
	std::string voice;
};

struct AudioTranscriptionRequest {
	std::string audio_b64;
	std::string audio_url;
	std::any chunking_strategy;
	std::vector<std::string> known_speaker_names;
	std::vector<std::string> known_speaker_references;
	std::string language;
	std::string model;
	std::map<std::string, std::any> provider;
};

struct AudioTranscriptionResponse {
	std::string text;
};

struct AudioTranslationRequest {
	std::string audio_b64;
	std::string audio_url;
	std::string language;
	std::string model;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::optional<double> temperature;
};

struct AudioTranslationResponse {
	std::string text;
};

struct BatchBillingSummary {
	std::optional<bool> billed;
	std::optional<bool> charged;
	std::optional<int> cost_nanos;
	std::optional<double> cost_usd;
	std::string currency;
	std::optional<int> estimated_nanos;
	std::optional<std::string> estimated_provider_cost;
	std::optional<std::string> estimated_user_cost;
	std::optional<int> estimation_sample_size;
	std::optional<int> estimation_total_rows;
	std::optional<bool> estimation_truncated;
	std::optional<std::string> finalized_at;
	std::map<std::string, std::any> pricing_breakdown;
	std::string reason;
	std::optional<std::string> reservation_id;
	std::optional<std::string> reservation_status;
	std::optional<int> reserved_nanos;
	std::optional<std::string> settled_provider_cost;
	std::optional<std::string> settled_user_cost;
	std::any state;
	std::optional<int> total_nanos;
};

struct BatchListResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::optional<std::string> first_id;
	std::optional<bool> has_more;
	std::optional<std::string> last_id;
	std::string object;
};

struct BatchModelCapability {
	std::vector<std::string> input_types;
	std::string model;
	std::string name;
	std::vector<std::string> output_types;
	std::map<std::string, std::any> pricing;
	std::vector<std::map<std::string, std::any>> providers;
	std::string status;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
	std::vector<std::string> supported_params;
	std::map<std::string, std::any> supported_params_detail;
};

struct BatchModelProviderCapability {
	std::string id;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
	std::vector<std::string> supported_params;
	std::map<std::string, std::any> supported_params_detail;
};

struct BatchModelsResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string object;
};

struct BatchProviderCapability {
	std::string documentation_url;
	std::vector<std::map<std::string, std::any>> endpoints;
	std::vector<std::any> gateway_input_modes;
	std::string id;
	std::string name;
	std::vector<std::any> native_input_modes;
	std::optional<std::string> notes;
	std::any status;
};

struct BatchRequest {
	std::string completion_window;
	std::map<std::string, std::any> debug;
	std::any endpoint;
	std::string input_file_id;
	std::vector<std::map<std::string, std::any>> items;
	std::optional<int> max_tokens;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::vector<std::string> prompts;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::vector<std::map<std::string, std::any>> requests;
	std::string session_id;
	std::string system;
	std::optional<double> temperature;
	std::map<std::string, std::any> webhook;
	std::string webhook_endpoint_id;
};

struct BatchRequestCounts {
	std::optional<int> completed;
	std::optional<int> failed;
	std::optional<int> total;
};

struct BatchRequestItem {
	std::map<std::string, std::any> body;
	std::string custom_id;
	std::any method;
	std::string url;
};

struct BatchRequestRow {
	std::optional<std::string> completed_at;
	std::optional<int> cost_nanos;
	std::optional<double> cost_usd;
	std::optional<std::string> created_at;
	std::string custom_id;
	std::optional<std::string> endpoint;
	std::optional<std::map<std::string, std::any>> error_body;
	std::string id;
	std::map<std::string, std::any> meta;
	std::optional<std::string> method;
	std::optional<std::string> model;
	std::optional<std::string> native_batch_id;
	std::string provider;
	std::optional<std::string> request_body_hash;
	std::optional<int> request_index;
	std::optional<std::map<std::string, std::any>> response_body;
	std::optional<int> response_status;
	std::string status;
	std::optional<std::string> updated_at;
	std::optional<std::map<std::string, std::any>> usage;
};

struct BatchResponse {
	std::map<std::string, std::any> billing;
	std::optional<std::string> cancel_url;
	std::optional<int> cancelled_at;
	std::optional<int> cancelling_at;
	std::optional<int> completed_at;
	std::string completion_window;
	std::optional<int> created_at;
	std::string endpoint;
	std::string error_file_id;
	std::map<std::string, std::any> errors;
	std::optional<int> expired_at;
	std::optional<int> expires_at;
	std::optional<int> failed_at;
	std::optional<std::string> finalized_at;
	std::optional<int> finalizing_at;
	std::string id;
	std::optional<int> in_progress_at;
	std::string input_file_id;
	std::optional<std::string> last_webhook_dispatched_at;
	std::optional<double> last_webhook_progress;
	std::optional<std::string> last_webhook_progress_at;
	std::any lifecycle_status;
	std::map<std::string, std::any> metadata;
	std::optional<std::string> native_batch_id;
	std::optional<std::string> next_webhook_retry_at;
	std::string object;
	std::string output_file_id;
	std::string polling_url;
	std::vector<std::map<std::string, std::any>> pricing_lines;
	std::optional<int> progress;
	std::string provider;
	std::map<std::string, std::any> request_counts;
	std::string request_id;
	std::optional<std::string> results_url;
	std::string session_id;
	std::string status;
	std::map<std::string, std::any> usage;
	std::map<std::string, std::any> webhook;
	std::string websocket_url;
};

using BenchmarkId = std::any;

struct CacheControl {
	std::string scope;
	std::string ttl;
	std::string type;
};

struct ChatAudioOutputPart {
	std::map<std::string, std::any> audio_url;
	std::any format;
	std::string mime_type;
	std::any type;
};

struct ChatChoice {
	std::any finish_reason;
	std::optional<int> index;
	std::map<std::string, std::any> message;
};

struct ChatCompletionsRequest {
	std::map<std::string, std::any> debug;
	std::optional<bool> echo_upstream_request;
	std::optional<double> frequency_penalty;
	std::map<std::string, std::any> image_config;
	std::map<std::string, std::any> logit_bias;
	std::optional<bool> logprobs;
	std::optional<int> max_completion_tokens;
	std::optional<int> max_tokens;
	std::optional<int> max_tool_calls;
	std::vector<std::map<std::string, std::any>> messages;
	std::optional<bool> meta;
	std::map<std::string, std::any> metadata;
	std::vector<std::any> modalities;
	std::string model;
	std::optional<bool> parallel_tool_calls;
	std::optional<double> presence_penalty;
	std::optional<std::string> prompt_cache_key;
	std::any provider;
	std::map<std::string, std::any> provider_options;
	std::map<std::string, std::any> reasoning;
	std::any reasoning_effort;
	std::any response_format;
	std::optional<std::string> safety_identifier;
	std::optional<int> seed;
	std::any service_tier;
	std::string session_id;
	std::any stop;
	std::optional<bool> store;
	std::optional<bool> stream;
	std::map<std::string, std::any> stream_options;
	std::optional<double> temperature;
	std::any tool_choice;
	std::vector<std::any> tools;
	std::optional<int> top_logprobs;
	std::optional<double> top_p;
	std::optional<bool> usage;
	std::string user;
	std::string user_id;
};

struct ChatCompletionsResponse {
	std::vector<std::map<std::string, std::any>> choices;
	std::optional<int> created;
	std::string id;
	std::string model;
	std::optional<std::string> nativeResponseId;
	std::string object;
	std::string provider;
	std::map<std::string, std::any> usage;
};

struct ChatImageOutputPart {
	std::map<std::string, std::any> image_url;
	std::string mime_type;
	std::any type;
};

struct ChatMessage {
	std::vector<std::map<std::string, std::any>> audios;
	std::any content;
	std::vector<std::map<std::string, std::any>> images;
	std::string name;
	std::any role;
	std::string tool_call_id;
	std::vector<std::map<std::string, std::any>> tool_calls;
};

struct CreditsResponse {
	std::map<std::string, std::any> credits;
	std::any ok;
};

struct DataContributionCategories {
};

struct DataContributionClassifier {
	std::map<std::string, std::any> categories;
	std::optional<std::string> created_at;
	std::optional<std::string> description;
	bool enabled;
	std::string id;
	std::string instructions;
	std::any kind;
	std::string model;
	std::string name;
	int sample_rate_bps;
	std::any service_tier;
	std::string slug;
	std::optional<std::string> updated_at;
};

struct DataContributionClassifierCreateRequest {
	std::map<std::string, std::any> categories;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::string instructions;
	std::string model;
	std::string name;
	std::optional<int> sampleRateBps;
	std::any serviceTier;
	std::string slug;
};

struct DataContributionClassifierDeleteResponse {
	std::map<std::string, std::any> data;
};

struct DataContributionClassifierInput {
	std::map<std::string, std::any> categories;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::string instructions;
	std::string model;
	std::string name;
	std::optional<int> sampleRateBps;
	std::any serviceTier;
};

struct DataContributionClassifierResponse {
	std::map<std::string, std::any> data;
};

struct DataContributionClassifierUpdateRequest {
	std::map<std::string, std::any> categories;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::string instructions;
	std::string model;
	std::string name;
	std::optional<int> sampleRateBps;
	std::any serviceTier;
};

struct DataContributionConsentRequest {
	bool enabled;
	std::string reason;
};

struct DataContributionConsentResponse {
	std::map<std::string, std::any> data;
};

struct DataContributionOverviewResponse {
	std::map<std::string, std::any> data;
};

struct DataModel {
	std::optional<std::string> deprecation_date;
	std::optional<bool> hidden;
	std::vector<std::string> input_types;
	std::optional<ModelLifecycle> lifecycle;
	std::optional<std::string> model_id;
	std::optional<std::string> name;
	std::optional<std::map<std::string, std::any>> organisation;
	std::vector<std::string> output_types;
	std::optional<std::string> release_date;
	std::optional<std::string> retirement_date;
	std::optional<std::string> status;
};

using DataModelOrganisation = std::any;

struct DebugOptions {
	std::optional<bool> enabled;
	std::optional<bool> return_upstream_request;
	std::optional<bool> return_upstream_response;
	std::optional<bool> trace;
	std::any trace_level;
};

struct DeletedResponse {
	std::any deleted;
};

struct DynamicRoute {
	std::map<std::string, std::any> config;
	std::optional<std::string> created_at;
	std::optional<int> deployed_version;
	std::optional<std::string> description;
	std::string id;
	std::vector<std::string> key_ids;
	std::string name;
	std::string slug;
	std::any status;
	std::optional<std::string> updated_at;
	int version;
	std::vector<std::map<std::string, std::any>> versions;
	std::string workspace_id;
};

struct DynamicRouteAction {
	std::optional<bool> allowFallbacks;
	std::string model;
	std::vector<std::string> modelFallbacks;
	std::vector<std::string> providerIgnore;
	std::vector<std::string> providerOnly;
	std::vector<std::string> providerOrder;
	std::any routingMode;
};

struct DynamicRouteCondition {
	std::any field;
	std::optional<std::string> metadataKey;
	std::any operator;
	std::optional<std::string> value;
};

struct DynamicRouteConfig {
	std::optional<bool> cacheAwareRouting;
	std::map<std::string, std::any> defaultAction;
	std::vector<std::map<std::string, std::any>> edges;
	std::optional<std::string> entryNodeId;
	std::vector<std::map<std::string, std::any>> nodes;
	std::vector<std::map<std::string, std::any>> rules;
	std::any schemaVersion;
	std::optional<bool> sessionAffinity;
};

struct DynamicRouteCreateRequest {
	std::map<std::string, std::any> config;
	std::optional<std::string> description;
	std::string name;
	std::string slug;
	std::any status;
};

struct DynamicRouteDeleteResponse {
	std::map<std::string, std::any> data;
};

struct DynamicRouteDeployResponse {
	std::map<std::string, std::any> data;
};

struct DynamicRouteEdge {
	std::string id;
	std::string source;
	std::optional<std::string> sourceHandle;
	std::string target;
};

struct DynamicRouteKeysResponse {
	std::map<std::string, std::any> data;
};

struct DynamicRouteKeysUpdateRequest {
	std::vector<std::string> key_ids;
};

struct DynamicRouteListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct DynamicRouteNode {
	std::map<std::string, std::any> data;
	std::string id;
	std::optional<std::map<std::string, std::any>> position;
	std::any type;
};

struct DynamicRouteResponse {
	std::map<std::string, std::any> data;
};

struct DynamicRouteRule {
	std::map<std::string, std::any> action;
	std::map<std::string, std::any> condition;
	bool enabled;
	std::string id;
	std::string name;
};

struct DynamicRouteUpdateRequest {
	std::map<std::string, std::any> config;
	std::optional<std::string> description;
	std::string name;
	std::any status;
};

struct DynamicRouteVersion {
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::any status;
	int version;
};

struct Embedding {
	std::vector<double> embedding;
	std::optional<int> index;
	std::string object;
};

struct EmbeddingsMultimodalInput {
	std::vector<std::any> content;
};

struct EmbeddingsRequest {
	std::map<std::string, std::any> debug;
	std::optional<int> dimensions;
	std::any encoding_format;
	std::any input;
	std::string model;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::string user;
};

struct EmbeddingsResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string model;
	std::string object;
	std::map<std::string, std::any> usage;
};

struct EndpointCatalogueEntry {
	std::string capability_id;
	std::string collection;
	std::string id;
	int model_count;
	int provider_count;
	std::string public_path;
};

struct EndpointCatalogueResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::vector<std::string> endpoints;
	std::any ok;
	std::vector<std::string> sample_models;
};

struct ErrorFailureSampleItem {
	std::optional<std::string> provider;
	std::optional<bool> retryable;
	std::optional<int> status;
	std::optional<std::string> type;
	std::optional<std::string> upstream_error_code;
	std::optional<std::string> upstream_error_description;
	std::optional<std::string> upstream_error_message;
	std::optional<std::string> upstream_error_param;
	std::optional<std::string> upstream_payload_preview;
};

struct ErrorProviderCandidateDiagnostics {
	std::optional<int> candidateCount;
	std::vector<std::map<std::string, std::any>> droppedMissingAdapter;
	std::vector<std::string> droppedUnsupportedEndpoint;
	std::optional<int> supportsEndpointCount;
	std::optional<int> totalProviders;
};

struct ErrorProviderEnablementDiagnostics {
	std::string capability;
	std::vector<std::map<std::string, std::any>> dropped;
	std::vector<std::string> providersAfter;
	std::vector<std::string> providersBefore;
};

struct ErrorProviderFailureDiagnostics {
	std::any category;
	std::string hint;
	std::optional<std::string> provider;
};

struct ErrorResponse {
	std::optional<int> attempt_count;
	std::string description;
	std::vector<std::map<std::string, std::any>> details;
	std::any error;
	std::any error_origin;
	std::any error_type;
	std::vector<std::string> failed_providers;
	std::vector<int> failed_statuses;
	std::vector<std::map<std::string, std::any>> failure_sample;
	std::string generation_id;
	std::string message;
	std::vector<std::string> missing_pricing_providers;
	std::optional<bool> ok;
	std::map<std::string, std::any> provider_candidate_diagnostics;
	std::map<std::string, std::any> provider_enablement;
	std::map<std::string, std::any> provider_failure_diagnostics;
	std::string provider_payment_required_provider;
	std::string provider_payment_required_support_notice;
	std::string reason;
	std::map<std::string, std::any> routing_diagnostics;
	std::optional<int> status_code;
	std::map<std::string, std::any> upstream_error;
};

struct ErrorRoutingDiagnostics {
	std::vector<std::map<std::string, std::any>> filterStages;
};

struct ErrorUpstreamError {
	std::optional<std::string> code;
	std::optional<std::string> description;
	std::optional<std::string> message;
	std::optional<std::string> param;
};

struct FileResponse {
	std::optional<int> bytes;
	std::optional<int> created_at;
	std::string filename;
	std::string id;
	std::string object;
	std::string purpose;
	std::string status;
	std::map<std::string, std::any> status_details;
};

struct FileUploadRequest {
	std::any file;
	std::string purpose;
};

struct FunctionToolDefinition {
	std::optional<bool> async;
	std::map<std::string, std::any> function;
	std::any type;
};

struct FusionToolDefinition {
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct GatewayCapabilities {
	std::vector<std::string> endpoints;
	std::map<std::string, std::any> parameter_details;
	std::vector<std::string> parameters;
};

using GatewayCapabilityStatus = std::any;

struct GatewayDatetimeToolDefinition {
	std::map<std::string, std::any> parameters;
	std::string timezone;
	std::any type;
};

struct GatewayFeedback {
	std::optional<std::string> comment;
	std::string created_at;
	std::optional<std::string> created_by_user_id;
	std::optional<std::string> end_user_id;
	std::string id;
	std::map<std::string, std::any> metadata;
	std::map<std::string, std::any> metadata_dimensions;
	std::optional<std::string> preset_id;
	std::optional<std::string> rating;
	std::optional<std::string> reason;
	std::vector<std::string> reason_tags;
	std::optional<std::string> request_id;
	std::optional<double> score;
	std::optional<std::string> session_id;
	std::any source;
	std::optional<std::string> test_run_id;
	std::string workspace_id;
};

struct GatewayFeedbackCreateRequest {
	std::string comment;
	std::string end_user_id;
	std::map<std::string, std::any> metadata;
	std::map<std::string, std::any> metadata_dimensions;
	std::string preset_id;
	std::string rating;
	std::string reason;
	std::vector<std::string> reason_tags;
	std::string request_id;
	std::optional<double> score;
	std::string session_id;
	std::any source;
	std::string test_run_id;
};

struct GatewayFeedbackListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct GatewayFeedbackResponse {
	std::map<std::string, std::any> data;
};

struct GatewayFeedbackSummaryResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::any group_by;
};

struct GatewayFeedbackSummaryRow {
	std::optional<double> average_score;
	int count;
	std::optional<std::string> last_feedback_at;
	std::string metadata_key;
	std::optional<std::string> metadata_value;
	int negative;
	int partial;
	int positive;
	std::optional<std::string> preset_id;
	std::map<std::string, std::any> ratings;
	std::optional<std::string> test_run_id;
};

struct GatewayModalities {
	std::vector<std::string> input;
	std::vector<std::string> output;
};

struct GatewayModelLifecycle {
	std::optional<std::string> deprecated_at;
	std::optional<std::string> message;
	std::optional<std::string> released_at;
	std::optional<std::string> replacement_id;
	std::optional<std::string> retires_at;
	std::optional<std::any> status;
};

struct GatewayModelLimits {
	std::optional<int> input_tokens;
	std::optional<int> output_tokens;
};

struct GatewayModelOffer {
	std::map<std::string, std::any> capabilities;
	std::map<std::string, std::any> effective;
	std::vector<std::string> endpoints;
	std::map<std::string, std::any> modalities;
	std::optional<std::string> model;
	std::map<std::string, std::any> pricing;
	std::map<std::string, std::any> provider;
	bool routable;
	std::map<std::string, std::any> routing;
	std::any status;
	std::any status_reason;
};

using GatewayModelOrganization = std::any;

struct GatewayModelsResponse {
	std::any availability_mode;
	int limit;
	std::vector<std::map<std::string, std::any>> models;
	int offset;
	bool ok;
	int total;
};

struct GatewayObservabilityEvent {
	std::any category;
	std::string created_at;
	std::optional<std::string> created_by_user_id;
	std::optional<std::string> end_user_id;
	std::string event_name;
	std::string id;
	std::map<std::string, std::any> metadata;
	std::map<std::string, std::any> metadata_dimensions;
	std::optional<double> numeric_value;
	std::string occurred_at;
	std::optional<std::string> preset_id;
	std::optional<std::string> request_id;
	std::optional<std::string> session_id;
	std::any source;
	std::optional<std::string> test_run_id;
	std::optional<std::any> value;
	std::string workspace_id;
};

struct GatewayObservabilityEventCreateRequest {
	std::any category;
	std::string end_user_id;
	std::string event_name;
	std::map<std::string, std::any> metadata;
	std::map<std::string, std::any> metadata_dimensions;
	std::optional<double> numeric_value;
	std::string occurred_at;
	std::string preset_id;
	std::string request_id;
	std::string session_id;
	std::any source;
	std::string test_run_id;
	std::any value;
};

struct GatewayObservabilityEventListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct GatewayObservabilityEventResponse {
	std::map<std::string, std::any> data;
};

struct GatewayPricing {
	std::map<std::string, std::any> meters;
	std::any pricing_plan;
};

using GatewayPricingMeter = std::any;

using GatewayProviderAvailabilityReason = std::any;

struct GatewayRequestLog {
	std::optional<std::string> auth_method;
	std::optional<bool> byok;
	std::optional<std::string> canonical_model_id;
	std::optional<int> cost_nanos;
	std::string created_at;
	std::optional<std::string> currency;
	std::optional<std::string> endpoint;
	std::optional<std::string> error_code;
	std::optional<std::string> finish_reason;
	std::optional<double> generation_ms;
	std::optional<std::string> key_id;
	std::optional<double> latency_ms;
	std::optional<std::string> location;
	std::optional<std::string> model_id;
	std::optional<std::string> native_response_id;
	std::optional<std::string> oauth_client_id;
	std::optional<std::vector<std::map<std::string, std::any>>> pricing_lines;
	std::optional<std::string> provider;
	std::string request_id;
	std::optional<std::string> requested_model_id;
	std::optional<std::string> routed_model_id;
	std::optional<int> status_code;
	std::optional<bool> stream;
	std::optional<bool> success;
	std::optional<double> throughput;
	std::optional<std::map<std::string, std::any>> usage;
};

struct GatewayRequestLogListResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string from_time;
	int limit;
	int offset;
	std::any ok;
	std::optional<std::string> to_time;
	int total;
};

struct GatewayRequestLogResponse {
	std::map<std::string, std::any> data;
	std::any ok;
};

using GatewayRoutingStatus = std::any;

struct GatewayWebFetchToolDefinition {
	std::optional<int> max_chars;
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct GatewayWebSearchToolDefinition {
	std::any engine;
	std::optional<bool> include_highlights;
	std::optional<bool> include_text;
	std::string language;
	std::optional<int> max_results;
	std::optional<int> page;
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct GenerationResponse {
	std::optional<std::string> app_id;
	std::optional<bool> byok;
	std::optional<double> cost_nanos;
	std::string created_at;
	std::string currency;
	std::string endpoint;
	std::optional<std::string> error_code;
	std::optional<std::string> error_message;
	std::optional<double> generation_ms;
	std::string key_id;
	std::optional<double> latency_ms;
	std::string model_id;
	std::optional<std::string> native_response_id;
	std::vector<std::map<std::string, std::any>> pricing_lines;
	std::string provider;
	std::optional<std::map<std::string, std::any>> replay_request;
	std::optional<bool> replay_supported;
	std::string request_id;
	std::optional<double> status_code;
	std::optional<bool> stream;
	std::optional<bool> success;
	std::string team_id;
	std::optional<double> throughput;
	std::optional<std::map<std::string, std::any>> usage;
};

struct Guardrail {
	std::optional<std::vector<std::string>> allowed_api_model_ids;
	std::optional<std::string> created_at;
	std::optional<int> daily_limit_cost_nanos;
	std::optional<int> daily_limit_requests;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::string id;
	std::optional<std::any> model_restriction_mode;
	std::optional<int> monthly_limit_cost_nanos;
	std::optional<int> monthly_limit_requests;
	std::string name;
	std::optional<bool> privacy_enable_free_may_publish_prompts;
	std::optional<bool> privacy_enable_free_may_train;
	std::optional<bool> privacy_enable_input_output_logging;
	std::optional<bool> privacy_enable_paid_may_train;
	std::optional<bool> privacy_zdr_only;
	std::optional<std::any> prompt_injection_action;
	std::optional<bool> prompt_injection_enabled;
	std::optional<bool> provider_restriction_enforce_allowed;
	std::optional<std::any> provider_restriction_mode;
	std::optional<std::vector<std::string>> provider_restriction_provider_ids;
	std::optional<std::any> sensitive_info_default_action;
	std::optional<bool> sensitive_info_enabled;
	std::optional<std::vector<std::map<std::string, std::any>>> sensitive_info_rules;
	std::optional<std::string> updated_at;
	std::optional<int> weekly_limit_cost_nanos;
	std::optional<int> weekly_limit_requests;
	std::string workspace_id;
};

struct GuardrailBudgetInput {
	std::optional<int> dailyCostNanos;
	std::optional<int> dailyRequests;
	std::optional<int> monthlyCostNanos;
	std::optional<int> monthlyRequests;
	std::optional<int> weeklyCostNanos;
	std::optional<int> weeklyRequests;
};

struct GuardrailCreateRequest {
	std::vector<std::string> allowedApiModelIds;
	std::map<std::string, std::any> budgets;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::any modelRestrictionMode;
	std::string name;
	std::optional<bool> privacyEnableFreeMayPublishPrompts;
	std::optional<bool> privacyEnableFreeMayTrain;
	std::optional<bool> privacyEnableInputOutputLogging;
	std::optional<bool> privacyEnablePaidMayTrain;
	std::optional<bool> privacyZdrOnly;
	std::any promptInjectionAction;
	std::optional<bool> promptInjectionEnabled;
	std::optional<bool> providerRestrictionEnforceAllowed;
	std::any providerRestrictionMode;
	std::vector<std::string> providerRestrictionProviderIds;
	std::any sensitiveInfoDefaultAction;
	std::optional<bool> sensitiveInfoEnabled;
	std::vector<std::map<std::string, std::any>> sensitiveInfoRules;
};

struct GuardrailDeleteResponse {
	std::any deleted;
};

struct GuardrailDetailResponse {
	std::map<std::string, std::any> data;
};

struct GuardrailKeyAddResponse {
	int added_count;
	std::vector<std::map<std::string, std::any>> data;
};

struct GuardrailKeyAssignment {
	std::optional<std::string> created_at;
	std::string key_id;
	std::optional<std::string> name;
	std::optional<std::string> prefix;
	std::optional<std::string> status;
};

struct GuardrailKeyIdsReplaceRequest {
	std::vector<std::string> key_ids;
};

struct GuardrailKeyIdsRequest {
	std::vector<std::string> key_ids;
};

struct GuardrailKeyListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct GuardrailKeySetResponse {
	std::map<std::string, std::any> data;
};

struct GuardrailListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct GuardrailMemberAddResponse {
	int added_count;
	std::vector<std::map<std::string, std::any>> data;
};

struct GuardrailMemberAssignment {
	std::optional<std::string> display_name;
	std::optional<std::string> joined_at;
	std::optional<std::string> role;
	std::string user_id;
};

struct GuardrailMemberListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct GuardrailPolicyInput {
	std::vector<std::string> allowedApiModelIds;
	std::map<std::string, std::any> budgets;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::any modelRestrictionMode;
	std::string name;
	std::optional<bool> privacyEnableFreeMayPublishPrompts;
	std::optional<bool> privacyEnableFreeMayTrain;
	std::optional<bool> privacyEnableInputOutputLogging;
	std::optional<bool> privacyEnablePaidMayTrain;
	std::optional<bool> privacyZdrOnly;
	std::any promptInjectionAction;
	std::optional<bool> promptInjectionEnabled;
	std::optional<bool> providerRestrictionEnforceAllowed;
	std::any providerRestrictionMode;
	std::vector<std::string> providerRestrictionProviderIds;
	std::any sensitiveInfoDefaultAction;
	std::optional<bool> sensitiveInfoEnabled;
	std::vector<std::map<std::string, std::any>> sensitiveInfoRules;
};

struct GuardrailRemoveResponse {
	int removed_count;
};

struct GuardrailResponse {
	std::map<std::string, std::any> data;
};

struct GuardrailUpdateRequest {
	std::vector<std::string> allowedApiModelIds;
	std::map<std::string, std::any> budgets;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::any modelRestrictionMode;
	std::string name;
	std::optional<bool> privacyEnableFreeMayPublishPrompts;
	std::optional<bool> privacyEnableFreeMayTrain;
	std::optional<bool> privacyEnableInputOutputLogging;
	std::optional<bool> privacyEnablePaidMayTrain;
	std::optional<bool> privacyZdrOnly;
	std::any promptInjectionAction;
	std::optional<bool> promptInjectionEnabled;
	std::optional<bool> providerRestrictionEnforceAllowed;
	std::any providerRestrictionMode;
	std::vector<std::string> providerRestrictionProviderIds;
	std::any sensitiveInfoDefaultAction;
	std::optional<bool> sensitiveInfoEnabled;
	std::vector<std::map<std::string, std::any>> sensitiveInfoRules;
};

struct GuardrailUserIdsRequest {
	std::vector<std::string> user_ids;
};

struct Image {
	std::string b64_json;
	std::string revised_prompt;
	std::string url;
};

struct ImageConfig {
	std::string aspect_ratio;
	std::vector<std::map<std::string, std::any>> font_inputs;
	std::any image_size;
	std::optional<bool> include_rai_reason;
	std::vector<std::map<std::string, std::any>> reference_images;
	std::vector<std::string> super_resolution_references;
};

struct ImageContentPart {
	std::map<std::string, std::any> image_url;
	std::any type;
};

struct ImageModerationInput {
	std::map<std::string, std::any> image_url;
	std::any type;
};

struct ImagesEditRequest {
	std::string image;
	std::string mask;
	std::optional<bool> meta;
	std::string model;
	std::optional<int> n;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::string resolution;
	std::string size;
	std::optional<bool> usage;
	std::string user;
};

struct ImagesEditResponse {
	std::optional<int> created;
	std::vector<std::map<std::string, std::any>> data;
};

struct ImagesGenerationRequest {
	std::string model;
	std::optional<int> n;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::string quality;
	std::string resolution;
	std::string response_format;
	std::string size;
	std::string style;
	std::string user;
};

struct ImagesGenerationResponse {
	std::optional<int> created;
	std::vector<std::map<std::string, std::any>> data;
};

struct InvalidRequestResponse {
	std::string error;
	std::optional<int> max_offset;
	std::string message;
	std::any ok;
};

struct KeyInvalidateResponse {
	std::map<std::string, std::any> key;
	std::string message;
	std::any ok;
};

using KnownModelId = std::any;

struct ListFilesResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string object;
};

struct ManagementKeyCollectionResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct ManagementKeyCreateRequest {
	std::string created_by;
	std::string name;
	std::any scopes;
	std::optional<bool> soft_blocked;
	std::any status;
	std::string team_id;
};

struct ManagementKeyCreateResponse {
	std::map<std::string, std::any> key;
	std::any ok;
};

struct ManagementKeyDeleteResponse {
	std::string message;
	std::any ok;
};

struct ManagementKeyDetailResponse {
	std::map<std::string, std::any> key;
	std::any ok;
};

struct ManagementKeyListResponse {
	std::vector<std::map<std::string, std::any>> keys;
	int limit;
	int offset;
	std::any ok;
	int total;
};

struct ManagementKeyRuntime {
	std::string created_at;
	std::optional<std::string> created_by;
	std::optional<int> daily_limit_cost_nanos;
	std::optional<int> daily_limit_requests;
	std::optional<std::string> expires_at;
	std::string id;
	std::optional<std::string> last_used_at;
	std::optional<int> monthly_limit_cost_nanos;
	std::optional<int> monthly_limit_requests;
	std::string name;
	std::string prefix;
	std::vector<std::string> scopes;
	std::optional<bool> soft_blocked;
	std::any status;
	std::optional<std::string> updated_at;
	std::optional<int> weekly_limit_cost_nanos;
	std::optional<int> weekly_limit_requests;
	std::string workspace_id;
};

struct ManagementKeyRuntimeCreated {
	std::string created_at;
	std::optional<std::string> created_by;
	std::optional<int> daily_limit_cost_nanos;
	std::optional<int> daily_limit_requests;
	std::optional<std::string> expires_at;
	std::string id;
	std::string key;
	std::optional<std::string> last_used_at;
	std::optional<int> monthly_limit_cost_nanos;
	std::optional<int> monthly_limit_requests;
	std::string name;
	std::string prefix;
	std::vector<std::string> scopes;
	std::optional<bool> soft_blocked;
	std::any status;
	std::optional<std::string> updated_at;
	std::optional<int> weekly_limit_cost_nanos;
	std::optional<int> weekly_limit_requests;
	std::string workspace_id;
};

struct ManagementKeyRuntimeCreateRequest {
	std::optional<std::string> expires_at;
	std::string name;
	std::optional<bool> paused;
	std::any scopes;
	std::any template;
};

struct ManagementKeyRuntimeCreateResponse {
	std::map<std::string, std::any> data;
};

struct ManagementKeyRuntimeDeleteResponse {
	std::any deleted;
};

struct ManagementKeyRuntimeResponse {
	std::map<std::string, std::any> data;
};

struct ManagementKeyRuntimeUpdateRequest {
	std::optional<int> dailyCostNanos;
	std::optional<int> dailyRequests;
	std::optional<std::string> expires_at;
	std::optional<int> monthlyCostNanos;
	std::optional<int> monthlyRequests;
	std::string name;
	std::optional<bool> paused;
	std::any scopes;
	std::optional<bool> softBlocked;
	std::any template;
	std::optional<int> weeklyCostNanos;
	std::optional<int> weeklyRequests;
};

struct ManagementKeyUpdateRequest {
	std::string name;
	std::optional<bool> soft_blocked;
	std::any status;
};

struct ManagementKeyUpdateResponse {
	std::string message;
	std::any ok;
};

using MessageContentPart = std::any;

struct Model {
	std::vector<std::string> aliases;
	std::map<std::string, std::any> availability;
	std::string base_model_id;
	std::map<std::string, std::any> capabilities;
	std::string description;
	std::string id;
	std::map<std::string, std::any> lifecycle;
	std::map<std::string, std::any> limits;
	std::map<std::string, std::any> modalities;
	std::string name;
	std::vector<std::map<std::string, std::any>> offers;
	std::optional<std::map<std::string, std::any>> organization;
	std::map<std::string, std::any> pricing;
	std::string variant;
	std::map<std::string, std::any> variants;
};

struct ModelAvailability {
	int active_provider_count;
	int coming_soon_provider_count;
	int inactive_provider_count;
	int provider_count;
	std::any status;
};

struct ModelEndpointCapability {
	std::map<std::string, std::any> capabilities;
	std::string capability_id;
	std::any collection;
	std::map<std::string, std::any> effective;
	std::string endpoint;
	std::string id;
	std::map<std::string, std::any> modalities;
	std::optional<std::string> model;
	std::map<std::string, std::any> pricing;
	std::map<std::string, std::any> provider;
	std::string public_path;
	bool routable;
	std::map<std::string, std::any> routing;
	std::any status;
	std::any status_reason;
};

struct ModelEndpointsResponse {
	std::any availability_mode;
	std::string description;
	std::vector<std::map<std::string, std::any>> endpoints;
	std::string id;
	std::map<std::string, std::any> modalities;
	std::string name;
	std::any ok;
	std::optional<std::map<std::string, std::any>> organization;
};

using ModelId = std::any;

struct ModelLifecycle {
	std::optional<std::string> deprecation_date;
	std::optional<std::string> message;
	std::optional<std::string> replacement_model_id;
	std::optional<std::string> retirement_date;
	std::optional<std::any> status;
};

struct ModelProviderAvailability {
	std::string api_provider_id;
	std::optional<std::string> api_provider_name;
	std::any availability_reason;
	std::any availability_status;
	std::any capability_status;
	std::optional<std::string> effective_from;
	std::optional<std::string> effective_to;
	std::vector<std::string> endpoints;
	std::vector<std::string> input_modalities;
	bool is_active_gateway;
	std::any model_routing_status;
	std::vector<std::string> output_modalities;
	std::vector<std::string> params;
	std::map<std::string, std::any> params_detail;
	std::optional<std::string> provider_model_slug;
	std::any provider_routing_status;
	std::any provider_status;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
};

struct ModerationCategories {
	std::optional<bool> harassment;
	std::optional<bool> harassment_threatening;
	std::optional<bool> hate;
	std::optional<bool> hate_threatening;
	std::optional<bool> self_harm;
	std::optional<bool> self_harm_instructions;
	std::optional<bool> self_harm_intent;
	std::optional<bool> sexual;
	std::optional<bool> sexual_minors;
	std::optional<bool> violence;
	std::optional<bool> violence_graphic;
};

struct ModerationCategoryScores {
	std::optional<double> harassment;
	std::optional<double> harassment_threatening;
	std::optional<double> hate;
	std::optional<double> hate_threatening;
	std::optional<double> self_harm;
	std::optional<double> self_harm_instructions;
	std::optional<double> self_harm_intent;
	std::optional<double> sexual;
	std::optional<double> sexual_minors;
	std::optional<double> violence;
	std::optional<double> violence_graphic;
};

struct ModerationResult {
	std::map<std::string, std::any> categories;
	std::map<std::string, std::any> category_scores;
	std::optional<bool> flagged;
};

struct ModerationsRequest {
	std::map<std::string, std::any> debug;
	std::any input;
	std::optional<bool> meta;
	std::string model;
	std::map<std::string, std::any> provider;
};

struct ModerationsResponse {
	std::string id;
	std::map<std::string, std::any> meta;
	std::string model;
	std::vector<std::map<std::string, std::any>> results;
};

struct MusicGenerateRequest {
	std::map<std::string, std::any> debug;
	std::optional<int> duration;
	std::optional<bool> echo_upstream_request;
	std::map<std::string, std::any> elevenlabs;
	std::any format;
	std::string model;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> suno;
};

struct MusicGenerateResponse {
	std::string audio_base64;
	std::string audio_url;
	std::string id;
	std::string model;
	std::optional<std::string> nativeResponseId;
	std::any object;
	std::vector<std::map<std::string, std::any>> output;
	std::string provider;
	std::any result;
	std::any status;
	std::map<std::string, std::any> usage;
};

struct NotImplementedResponse {
	std::string description;
	std::string error;
	int status_code;
};

struct OAuthClient {
	std::optional<int> active_authorizations;
	std::vector<std::string> allowed_scopes;
	std::string client_id;
	std::any client_type;
	std::optional<std::string> created_at;
	std::optional<std::string> description;
	std::optional<std::string> homepage_url;
	std::optional<std::string> last_used_at;
	std::optional<std::string> logo_url;
	std::string name;
	std::optional<std::string> privacy_policy_url;
	std::vector<std::string> redirect_uris;
	std::optional<int> requests_last_30d;
	std::string status;
	std::optional<std::string> terms_of_service_url;
	std::optional<int> total_authorizations;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct OAuthClientCreateRequest {
	std::vector<std::string> allowed_scopes;
	std::any client_type;
	std::string description;
	std::string homepage_url;
	std::string logo_url;
	std::string name;
	std::string privacy_policy_url;
	std::vector<std::string> redirect_uris;
	std::string terms_of_service_url;
};

struct OAuthClientCreateResponse {
	std::optional<int> active_authorizations;
	std::vector<std::string> allowed_scopes;
	std::string client_id;
	std::optional<std::string> client_secret;
	std::any client_type;
	std::optional<std::string> created_at;
	std::optional<std::string> description;
	std::optional<std::string> homepage_url;
	std::optional<std::string> last_used_at;
	std::optional<std::string> logo_url;
	std::string name;
	std::optional<std::string> privacy_policy_url;
	std::vector<std::string> redirect_uris;
	std::optional<int> requests_last_30d;
	std::string status;
	std::optional<std::string> terms_of_service_url;
	std::optional<int> total_authorizations;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct OAuthClientDeleteResponse {
	std::string client_id;
	std::string message;
};

struct OAuthClientInput {
	std::vector<std::string> allowed_scopes;
	std::string description;
	std::string homepage_url;
	std::string logo_url;
	std::string name;
	std::string privacy_policy_url;
	std::vector<std::string> redirect_uris;
	std::string terms_of_service_url;
};

struct OAuthClientListResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::map<std::string, std::any> pagination;
};

struct OAuthClientSecretResponse {
	std::string client_id;
	std::string client_secret;
	std::string message;
};

struct OAuthClientUpdateRequest {
	std::vector<std::string> allowed_scopes;
	std::string description;
	std::string homepage_url;
	std::string logo_url;
	std::string name;
	std::string privacy_policy_url;
	std::vector<std::string> redirect_uris;
	std::string terms_of_service_url;
};

struct ObservabilityDestination {
	bool configured;
	std::optional<std::string> created_at;
	bool enabled;
	std::any group_join;
	std::string id;
	std::optional<bool> include_cost_metadata;
	std::optional<bool> include_generation_metadata;
	std::optional<bool> include_identity_metadata;
	std::optional<bool> include_request_context;
	std::vector<std::map<std::string, std::any>> key_filters;
	std::string name;
	bool privacy_mode;
	std::vector<std::map<std::string, std::any>> rule_groups;
	double sampling_rate;
	std::any type;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct ObservabilityDestinationCreateRequest {
	std::map<std::string, std::any> config;
	std::optional<bool> enabled;
	std::any group_join;
	std::optional<bool> include_cost_metadata;
	std::optional<bool> include_generation_metadata;
	std::optional<bool> include_identity_metadata;
	std::optional<bool> include_request_context;
	std::vector<std::map<std::string, std::any>> key_filters;
	std::string name;
	std::optional<bool> privacy_mode;
	std::vector<std::map<std::string, std::any>> rule_groups;
	std::optional<double> sampling_rate;
	std::any type;
};

struct ObservabilityDestinationListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct ObservabilityDestinationPolicyInput {
	std::optional<bool> enabled;
	std::any group_join;
	std::optional<bool> include_cost_metadata;
	std::optional<bool> include_generation_metadata;
	std::optional<bool> include_identity_metadata;
	std::optional<bool> include_request_context;
	std::vector<std::map<std::string, std::any>> key_filters;
	std::string name;
	std::optional<bool> privacy_mode;
	std::vector<std::map<std::string, std::any>> rule_groups;
	std::optional<double> sampling_rate;
};

struct ObservabilityDestinationResponse {
	std::map<std::string, std::any> data;
};

using ObservabilityDestinationType = std::any;

struct ObservabilityDestinationUpdateRequest {
	std::map<std::string, std::any> config;
	std::optional<bool> enabled;
	std::any group_join;
	std::optional<bool> include_cost_metadata;
	std::optional<bool> include_generation_metadata;
	std::optional<bool> include_identity_metadata;
	std::optional<bool> include_request_context;
	std::vector<std::map<std::string, std::any>> key_filters;
	std::string name;
	std::optional<bool> privacy_mode;
	std::vector<std::map<std::string, std::any>> rule_groups;
	std::optional<double> sampling_rate;
};

struct ObservabilityKeyFilter {
	std::string key_id;
	std::any mode;
};

struct ObservabilityLoggingPolicy {
	std::any billing_status;
	bool enabled;
	std::optional<std::string> grace_until;
	bool include_provider_payloads;
	int price_per_million_units_nanos;
	int retention_days;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct ObservabilityLoggingPolicyResponse {
	std::map<std::string, std::any> data;
};

struct ObservabilityLoggingPolicyUpdateRequest {
	std::optional<bool> enabled;
	std::optional<bool> include_provider_payloads;
	std::optional<int> retention_days;
};

struct ObservabilityRule {
	std::any condition;
	std::any field;
	std::optional<std::string> value;
};

struct ObservabilityRuleGroup {
	std::any match;
	std::vector<std::map<std::string, std::any>> rules;
};

struct OcrRequest {
	std::map<std::string, std::any> debug;
	std::optional<bool> echo_upstream_request;
	std::string image;
	std::string language;
	std::string model;
	std::map<std::string, std::any> provider;
};

struct OcrResponse {
};

using OrganisationId = std::any;

using OrganisationIdList = std::any;

using ParseBlock = std::any;

struct ParseBoundingBox {
	double bottom_right_x;
	double bottom_right_y;
	double top_left_x;
	double top_left_y;
};

struct ParseImage {
	std::map<std::string, std::any> bounding_box;
	std::map<std::string, std::any> bounding_box_normalized;
	std::any category;
	std::string description;
	std::string id;
};

using ParsePage = std::any;

struct ParseRequest {
	std::map<std::string, std::any> debug;
	std::map<std::string, std::any> document;
	std::optional<bool> echo_upstream_request;
	std::string model;
	std::any output_format;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> routing;
};

struct ParseResponse {
	std::string id;
	std::map<std::string, std::any> meta;
	std::string model;
	std::any object;
	std::vector<std::any> pages;
	std::string provider;
	std::map<std::string, std::any> usage;
};

struct Preset {
	std::optional<std::string> active_version_id;
	std::map<std::string, std::any> config;
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::optional<std::string> description;
	std::string id;
	std::string name;
	std::string slug;
	std::optional<std::string> source_preset_id;
	std::optional<std::string> source_preset_version_id;
	std::optional<std::string> updated_at;
	std::optional<std::string> upstream_version_id;
	std::any versioning_method;
	std::any visibility;
	std::string workspace_id;
};

struct PresetConfig {
};

struct PresetCreateRequest {
	std::map<std::string, std::any> config;
	std::optional<std::string> description;
	std::string name;
	std::string slug;
	std::any versioning_method;
	std::any visibility;
};

struct PresetCreateResponse {
	std::string canonical_model;
	std::map<std::string, std::any> data;
};

struct PresetForkRequest {
	std::string source_version_id;
};

struct PresetListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct PresetPublisher {
	std::optional<std::string> handle;
	std::string workspace_id;
};

struct PresetPublisherResponse {
	std::map<std::string, std::any> data;
};

struct PresetPublisherUpdateRequest {
	std::string handle;
};

struct PresetResponse {
	std::map<std::string, std::any> data;
};

struct PresetTestRun {
	std::optional<std::string> baseline_preset_id;
	std::optional<std::string> completed_at;
	std::map<std::string, std::any> config;
	std::string created_at;
	std::optional<std::string> created_by_user_id;
	std::optional<std::string> dataset_name;
	std::optional<std::string> description;
	std::string id;
	std::optional<std::string> name;
	std::optional<std::string> preset_id;
	std::optional<std::string> started_at;
	std::any status;
	std::map<std::string, std::any> summary;
	std::string updated_at;
	std::string workspace_id;
};

struct PresetTestRunCreateRequest {
	std::string baseline_preset_id;
	std::string completed_at;
	std::map<std::string, std::any> config;
	std::string dataset_name;
	std::string description;
	std::string name;
	std::string preset_id;
	std::string started_at;
	std::any status;
	std::map<std::string, std::any> summary;
};

struct PresetTestRunDetailResponse {
	std::map<std::string, std::any> data;
	std::optional<std::map<std::string, std::any>> feedback_summary;
};

struct PresetTestRunListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct PresetTestRunResponse {
	std::map<std::string, std::any> data;
};

struct PresetTestRunUpdateRequest {
	std::optional<std::string> completed_at;
	std::optional<std::string> description;
	std::optional<std::string> name;
	std::optional<std::string> started_at;
	std::any status;
	std::map<std::string, std::any> summary;
};

struct PresetUpdateRequest {
	std::map<std::string, std::any> config;
	std::optional<std::string> description;
	std::string name;
	std::optional<bool> replace_config;
	std::string slug;
	std::any versioning_method;
	std::any visibility;
};

struct PresetUpstreamApplyRequest {
	std::string version_id;
};

struct PresetUpstreamApplyResponse {
	std::map<std::string, std::any> data;
};

struct PresetVersion {
	std::map<std::string, std::any> config;
	std::string created_at;
	std::string created_by;
	std::optional<std::string> description;
	std::string id;
	std::string name;
	std::string preset_id;
	std::optional<std::string> release_notes;
	std::string slug;
	std::string version_label;
	int version_number;
	std::any versioning_method;
	std::any visibility;
};

using PresetVersioningMethod = std::any;

struct PresetVersionListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct PresetVersionPublishRequest {
	std::string release_notes;
	std::string version_label;
};

struct PresetVersionResponse {
	std::map<std::string, std::any> data;
};

using PresetVisibility = std::any;

struct PrivateModel {
	std::string base_url;
	std::optional<std::string> catalog_model_id;
	std::optional<int> context_length;
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::optional<std::string> credential_prefix;
	std::optional<std::string> credential_suffix;
	std::optional<std::string> custom_provider_name;
	std::optional<std::string> custom_provider_url;
	std::optional<std::string> description;
	bool enabled;
	std::optional<std::string> host_provider_id;
	std::string id;
	std::vector<std::string> input_modalities;
	std::string local_slug;
	std::optional<int> max_output_tokens;
	std::string model_id;
	std::string name;
	std::vector<std::string> output_modalities;
	std::any routing_policy;
	bool supports_responses;
	std::optional<std::string> updated_at;
	std::string upstream_model_id;
	std::string workspace_id;
};

struct PrivateModelCreateRequest {
	std::string base_url;
	std::optional<int> context_length;
	std::string credential;
	std::optional<std::string> custom_provider_name;
	std::optional<std::string> custom_provider_url;
	std::string description;
	std::optional<bool> enabled;
	std::optional<std::string> host_provider_id;
	std::optional<int> max_output_tokens;
	std::string model_reference;
	std::string name;
	std::any routing_policy;
	std::optional<bool> supports_responses;
	std::string upstream_model_id;
};

struct PrivateModelDeleteResponse {
	bool deleted;
};

struct PrivateModelListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct PrivateModelResponse {
	std::map<std::string, std::any> data;
};

struct PrivateModelUpdateRequest {
	std::string base_url;
	std::optional<int> context_length;
	std::string credential;
	std::optional<std::string> custom_provider_name;
	std::optional<std::string> custom_provider_url;
	std::optional<std::string> description;
	std::optional<bool> enabled;
	std::optional<std::string> host_provider_id;
	std::optional<int> max_output_tokens;
	std::string model_reference;
	std::string name;
	std::any routing_policy;
	std::optional<bool> supports_responses;
	std::string upstream_model_id;
};

struct Provider {
	std::string api_provider_id;
	std::optional<std::string> api_provider_name;
	std::optional<std::string> country_code;
	std::optional<std::string> description;
	std::optional<std::string> link;
};

struct ProviderCredential {
	std::vector<std::string> allowed_api_key_ids;
	std::vector<std::string> allowed_model_slugs;
	std::optional<bool> always_use;
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	bool disabled;
	bool enabled;
	std::optional<std::string> error_message;
	std::string id;
	bool is_fallback;
	std::optional<std::string> last_used_at;
	std::optional<std::string> last_verified_at;
	std::string name;
	std::optional<std::string> prefix;
	std::string provider_id;
	std::any routing_mode;
	int sort_order;
	std::optional<std::string> suffix;
	std::optional<std::string> verification_status;
	std::string workspace_id;
};

struct ProviderCredentialCreateRequest {
	std::vector<std::string> allowed_api_key_ids;
	std::vector<std::string> allowed_models;
	std::optional<bool> enabled;
	std::string key;
	std::string name;
	std::string provider;
	std::any routing_mode;
};

struct ProviderCredentialDeleteResponse {
	bool deleted;
};

struct ProviderCredentialListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct ProviderCredentialReorderRequest {
	std::vector<std::string> key_ids;
	std::string provider;
	std::any routing_mode;
};

struct ProviderCredentialReorderResponse {
	bool reordered;
};

struct ProviderCredentialResponse {
	std::map<std::string, std::any> data;
};

using ProviderCredentialRoutingMode = std::any;

struct ProviderCredentialUpdateRequest {
	std::vector<std::string> allowed_api_key_ids;
	std::vector<std::string> allowed_models;
	std::optional<bool> enabled;
	std::string key;
	std::string name;
	std::any routing_mode;
};

struct ProviderOptions {
	std::map<std::string, std::any> anthropic;
	std::map<std::string, std::any> google;
	std::map<std::string, std::any> openai;
};

struct ProviderRoutingOptions {
	std::optional<bool> allow_fallbacks;
	std::optional<std::any> data_collection;
	std::optional<bool> enforce_distillable_text;
	std::vector<std::string> ignore;
	std::optional<bool> include_alpha;
	std::map<std::string, std::any> max_price;
	std::vector<std::string> only;
	std::vector<std::string> order;
	std::any preferred_max_latency;
	std::any preferred_min_throughput;
	std::optional<std::vector<std::string>> quantizations;
	std::optional<bool> require_parameters;
	std::optional<bool> require_zero_data_retention;
	std::optional<std::string> required_data_region;
	std::optional<std::string> required_execution_region;
	std::any sort;
	std::optional<bool> zdr;
};

struct ProvisioningKey {
	std::string created_at;
	std::string id;
	std::optional<std::string> last_used_at;
	std::string name;
	std::string prefix;
	std::string scopes;
	std::any status;
};

struct ProvisioningKeyDetail {
	std::string created_at;
	std::string created_by;
	std::string id;
	std::optional<std::string> last_used_at;
	std::string name;
	std::string prefix;
	std::string scopes;
	std::optional<bool> soft_blocked;
	std::any status;
	std::string team_id;
};

struct ProvisioningKeyWithValue {
	std::string created_at;
	std::string id;
	std::string key;
	std::string name;
	std::string prefix;
	std::string scopes;
	std::any status;
};

struct ReasoningConfig {
	std::any effort;
	std::optional<bool> enabled;
	std::optional<int> max_tokens;
	std::any mode;
	std::any summary;
};

using RerankDocument = std::any;

struct RerankRequest {
	std::map<std::string, std::any> debug;
	std::any documents;
	std::optional<int> max_chunks_per_doc;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::string query;
	std::vector<std::string> rank_fields;
	std::optional<bool> return_documents;
	std::optional<int> top_k;
	std::optional<int> top_n;
	std::string user;
};

struct RerankResponse {
	std::string id;
	std::string model;
	std::optional<std::string> nativeResponseId;
	std::string object;
	std::vector<std::map<std::string, std::any>> results;
	std::map<std::string, std::any> usage;
};

struct RerankResult {
	std::any document;
	std::optional<int> index;
	std::optional<double> relevance_score;
};

struct ResponsesInputItem {
	std::any content;
	std::any role;
	std::string type;
};

struct ResponsesOutputAudioPart {
	std::map<std::string, std::any> audio_url;
	std::string b64_json;
	std::any format;
	std::string mime_type;
	std::any type;
};

using ResponsesOutputContentPart = std::any;

struct ResponsesOutputImagePart {
	std::string b64_json;
	std::map<std::string, std::any> image_url;
	std::string mime_type;
	std::any type;
};

struct ResponsesOutputItem {
	std::string arguments;
	std::string call_id;
	std::vector<std::any> content;
	std::string name;
	std::string role;
	std::string type;
};

struct ResponsesOutputTextPart {
	std::vector<std::map<std::string, std::any>> annotations;
	std::string text;
	std::any type;
};

struct ResponsesRequest {
	std::optional<bool> background;
	std::map<std::string, std::any> debug;
	std::optional<bool> echo_upstream_request;
	std::map<std::string, std::any> image_config;
	std::vector<std::string> include;
	std::any input;
	std::string instructions;
	std::optional<int> max_output_tokens;
	std::optional<bool> meta;
	std::map<std::string, std::any> metadata;
	std::vector<std::any> modalities;
	std::string model;
	std::optional<bool> parallel_tool_calls;
	std::string previous_response_id;
	std::optional<std::string> prompt_cache_key;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::map<std::string, std::any> reasoning;
	std::optional<std::string> safety_identifier;
	std::any service_tier;
	std::string session_id;
	std::optional<bool> store;
	std::optional<bool> stream;
	std::optional<double> temperature;
	std::map<std::string, std::any> text;
	std::any tool_choice;
	std::vector<std::any> tools;
	std::optional<double> top_p;
	std::any truncation;
	std::optional<bool> usage;
	std::string user;
};

struct ResponsesResponse {
	std::vector<std::map<std::string, std::any>> content;
	std::optional<int> cost_cents;
	std::optional<double> cost_nanos;
	std::optional<int> created;
	std::string currency;
	std::optional<std::string> finish_reason;
	std::string id;
	std::map<std::string, std::any> meta;
	std::string model;
	std::optional<std::string> nativeResponseId;
	std::string object;
	std::vector<std::map<std::string, std::any>> output;
	std::vector<std::map<std::string, std::any>> output_items;
	std::vector<std::map<std::string, std::any>> pricing_lines;
	std::string provider;
	std::string provider_id;
	std::string role;
	std::any status;
	std::string stop_reason;
	std::string type;
	std::map<std::string, std::any> usage;
};

struct SearchModelsToolDefinition {
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct ServerToolUsage {
	std::optional<int> advisor_requests;
	std::optional<int> apply_patch_requests;
	std::optional<int> datetime_requests;
	std::optional<int> fusion_requests;
	std::optional<int> image_generation_requests;
	std::optional<int> search_models_requests;
	std::optional<int> subagent_requests;
	std::optional<int> web_fetch_requests;
	std::optional<int> web_search_requests;
};

struct SubagentToolDefinition {
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct SupportedParameterDetails {
};

struct TextContentPart {
	std::string text;
	std::any type;
};

using TextGenerateTool = std::any;

struct TextModerationInput {
	std::string text;
	std::any type;
};

using TextToolChoice = std::any;

struct ToolCall {
	std::map<std::string, std::any> function;
	std::string id;
	std::any type;
};

struct ToolCallContentPart {
	std::map<std::string, std::any> function;
	std::string id;
	std::any type;
};

struct UpdatedResponse {
	std::map<std::string, std::any> data;
};

struct Usage {
	std::optional<int> completion_tokens;
	std::optional<int> prompt_tokens;
	std::map<std::string, std::any> server_tool_use;
	std::optional<int> total_tokens;
};

struct VideoBillingSummary {
	std::optional<bool> billable;
	std::string billed_at;
	std::optional<std::string> charge_reason;
	std::optional<bool> charged;
	std::string currency;
	std::optional<int> estimated_nanos;
	std::optional<std::string> estimated_provider_cost;
	std::optional<std::string> estimated_user_cost;
	std::optional<std::string> reservation_id;
	std::optional<std::string> reservation_status;
	std::optional<int> reserved_nanos;
	std::optional<std::string> settled_provider_cost;
	std::optional<std::string> settled_user_cost;
	std::any state;
	std::optional<int> total_nanos;
};

struct VideoContentPart {
	std::any type;
	std::string video_url;
};

struct VideoDeleteResponse {
	std::optional<bool> deleted;
	std::string id;
	std::string object;
};

struct VideoGenerationRequest {
	std::string aspect_ratio;
	std::optional<int> compression_quality;
	std::optional<int> duration;
	std::optional<bool> enhance_prompt;
	std::vector<std::map<std::string, std::any>> frame_images;
	std::optional<bool> generate_audio;
	std::optional<double> input_audio_duration;
	std::vector<std::any> input_references;
	std::optional<double> input_video_duration;
	std::string model;
	std::string negative_prompt;
	std::map<std::string, std::any> output;
	std::string person_generation;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> provider_options;
	std::map<std::string, std::any> provider_params;
	std::string resize_mode;
	std::string resolution;
	std::optional<int> sample_count;
	std::optional<int> seed;
	std::string size;
	std::map<std::string, std::any> webhook;
};

struct VideoGenerationResponse {
	std::optional<std::map<std::string, std::any>> asset;
	std::optional<bool> audio;
	std::map<std::string, std::any> billing;
	std::optional<std::string> cancel_url;
	std::optional<std::any> completed_at;
	std::string content_url;
	std::any created_at;
	std::optional<std::string> download_url;
	std::optional<std::any> error;
	std::optional<int> expires_at;
	std::optional<std::string> generation_id;
	std::string id;
	std::optional<std::string> last_webhook_dispatched_at;
	std::optional<double> last_webhook_progress;
	std::optional<std::string> last_webhook_progress_at;
	std::any lifecycle_status;
	std::string model;
	std::optional<std::string> native_video_id;
	std::optional<std::string> next_webhook_retry_at;
	std::string object;
	std::any output_access;
	std::vector<std::map<std::string, std::any>> outputs;
	std::optional<int> poll_after_seconds;
	std::string polling_url;
	std::optional<int> progress;
	std::string progress_source;
	std::string provider;
	std::string request_id;
	std::optional<double> seconds;
	std::string session_id;
	std::string size;
	std::optional<std::any> started_at;
	std::any status;
	std::map<std::string, std::any> usage;
	std::map<std::string, std::any> webhook;
	std::string websocket_url;
};

using VideoInputReference = std::any;

struct VideoListResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::optional<std::string> first_id;
	std::optional<bool> has_more;
	std::optional<std::string> last_id;
	std::string object;
};

struct VideoModelCapability {
	std::vector<std::string> input_types;
	std::string model;
	std::string name;
	std::vector<std::string> output_types;
	std::map<std::string, std::any> pricing;
	std::vector<std::map<std::string, std::any>> providers;
	std::string status;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
	std::vector<std::string> supported_params;
	std::map<std::string, std::any> supported_params_detail;
};

struct VideoModelProviderCapability {
	std::string id;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
	std::vector<std::string> supported_params;
	std::map<std::string, std::any> supported_params_detail;
};

struct VideoModelsResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string object;
};

struct VideoOutput {
	std::optional<bool> bytes_available;
	std::string content_url;
	std::string download_url;
	std::optional<int> expires_at;
	std::optional<int> index;
	std::string mime_type;
};

struct VideoOutputConfig {
	std::any access;
};

struct WebhookEndpoint {
	std::optional<std::string> createdAt;
	std::optional<std::string> createdBy;
	std::optional<std::string> deletedAt;
	std::vector<std::string> events;
	bool hasSecret;
	std::string id;
	std::string name;
	std::any status;
	std::optional<std::string> updatedAt;
	std::string url;
	std::string workspaceId;
};

struct WebhookEndpointCreateRequest {
	std::vector<std::string> events;
	std::string name;
	std::string url;
};

struct WebhookEndpointDeleteResponse {
	std::any deleted;
	std::string id;
	std::any object;
};

struct WebhookEndpointInput {
	std::vector<std::string> events;
	std::string name;
	std::string url;
};

struct WebhookEndpointListResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::any object;
};

struct WebhookEndpointSecretResponse {
	std::optional<std::string> createdAt;
	std::optional<std::string> createdBy;
	std::optional<std::string> deletedAt;
	std::vector<std::string> events;
	bool hasSecret;
	std::string id;
	std::string name;
	std::string signing_secret;
	std::any status;
	std::optional<std::string> updatedAt;
	std::string url;
	std::string workspaceId;
};

struct WebhookEndpointUpdateRequest {
	std::vector<std::string> events;
	std::string name;
	std::any status;
	std::string url;
};

struct Workspace {
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	std::string id;
	std::optional<std::string> name;
	std::optional<std::string> slug;
	std::optional<std::string> updated_at;
};

struct WorkspaceActivityEntry {
	double cost_cents;
	std::optional<std::string> endpoint;
	std::optional<int> latency_ms;
	std::optional<std::string> model;
	std::optional<std::string> provider;
	std::optional<std::string> request_id;
	std::optional<std::string> timestamp;
	std::optional<std::map<std::string, std::any>> usage;
};

struct WorkspaceActivityResponse {
	std::vector<std::map<std::string, std::any>> activity;
	int limit;
	int offset;
	std::any ok;
	int period_days;
	int total;
	double total_cost_cents;
};

struct WorkspaceApp {
	std::string app_key;
	std::optional<std::string> category;
	std::optional<std::string> created_at;
	std::optional<std::string> docs_url;
	std::string id;
	std::optional<std::string> image_url;
	bool is_active;
	bool is_managed;
	bool is_public;
	std::optional<std::string> last_seen;
	std::string title;
	std::optional<std::string> url;
};

struct WorkspaceAppListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int limit;
	int offset;
	int total_count;
};

struct WorkspaceAppMergeRequest {
	std::string target_app_id;
};

struct WorkspaceAppMergeResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceAppResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceAppUpdateRequest {
	std::optional<std::string> category;
	std::optional<std::string> docs_url;
	std::optional<std::string> image_url;
	std::optional<bool> is_active;
	std::optional<bool> is_public;
	std::string title;
	std::optional<std::string> url;
};

using WorkspaceAssignableRole = std::any;

struct WorkspaceAuditEvent {
	std::string action;
	std::optional<std::map<std::string, std::any>> actor;
	std::optional<std::string> actor_user_id;
	std::string created_at;
	std::string id;
	std::map<std::string, std::any> metadata;
	std::optional<std::string> request_id;
	std::string target_id;
	std::optional<std::string> target_name;
	std::string target_type;
	std::string workspace_id;
};

struct WorkspaceAuditEventActor {
	std::optional<std::string> display_name;
	std::optional<std::string> email;
};

struct WorkspaceAuditEventLimits {
	std::optional<int> dailyCostNanos;
	std::optional<int> dailyRequests;
	std::optional<int> monthlyCostNanos;
	std::optional<int> monthlyRequests;
	std::optional<bool> softBlocked;
	std::optional<int> weeklyCostNanos;
	std::optional<int> weeklyRequests;
};

struct WorkspaceAuditEventListResponse {
	std::vector<std::map<std::string, std::any>> data;
	bool has_more;
	std::optional<std::string> next_cursor;
};

struct WorkspaceAuditEventMetadata {
	std::string accessTemplate;
	std::vector<std::string> changedFields;
	std::optional<std::string> expiresAt;
	std::map<std::string, std::any> limits;
	std::optional<std::string> prefix;
	std::optional<std::string> previousKeyExpiresAt;
	std::string replacementKeyId;
	std::string replacementKeyName;
	std::string status;
};

struct WorkspaceAutoTopUpSettings {
	int amount_nanos;
	int balance_threshold_nanos;
	bool enabled;
	std::optional<std::string> payment_method_id;
};

struct WorkspaceAutoTopUpUpdate {
	std::optional<int> amount_nanos;
	std::optional<int> balance_threshold_nanos;
	bool enabled;
	std::optional<std::string> payment_method_id;
};

struct WorkspaceBudget {
	std::string created_at;
	std::optional<std::string> created_by;
	bool exceeded;
	std::string id;
	std::any interval;
	double limit;
	int limit_nanos;
	double remaining;
	int remaining_nanos;
	std::optional<std::string> reset_at;
	std::string updated_at;
	double usage;
	int usage_nanos;
	std::optional<std::string> window_start;
	std::string workspace_id;
};

struct WorkspaceBudgetDeleteResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceBudgetInput {
	std::any interval;
	double limit;
};

using WorkspaceBudgetInterval = std::any;

struct WorkspaceBudgetListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceBudgetResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceBudgetUpdateInput {
	std::any interval;
	std::optional<double> limit;
};

struct WorkspaceCreateRequest {
	std::string name;
	std::string slug;
};

struct WorkspaceDepartment {
	std::string color;
	std::optional<std::string> created_at;
	std::optional<std::string> description;
	std::optional<std::string> directory_name;
	std::string icon;
	std::string id;
	std::string name;
	std::optional<bool> name_overridden;
	std::optional<std::string> source_id;
	std::any source_type;
	std::optional<std::string> updated_at;
};

struct WorkspaceDepartmentCreateRequest {
	std::any color;
	std::optional<std::string> description;
	std::any icon;
	std::string name;
};

struct WorkspaceDepartmentInput {
	std::any color;
	std::optional<std::string> description;
	std::any icon;
	std::string name;
};

struct WorkspaceDepartmentListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceDepartmentMember {
	std::string department_id;
	bool is_primary;
	std::any position;
	std::string user_id;
};

struct WorkspaceDepartmentMemberRequest {
	std::any position;
	std::optional<bool> primary;
};

struct WorkspaceDepartmentMemberResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceDepartmentResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceDepartmentUpdateRequest {
	std::any color;
	std::optional<std::string> description;
	std::any icon;
	std::string name;
};

struct WorkspaceDirectoryMember {
	std::string access_source;
	std::optional<std::map<std::string, std::any>> department;
	bool department_override_enabled;
	std::optional<std::string> department_override_id;
	std::string department_source;
	std::optional<std::string> directory_department;
	std::string display_name;
	std::any effective_role;
	std::optional<std::string> email;
	std::optional<std::string> joined_at;
	std::optional<std::any> role_override;
	std::any status;
	std::string user_id;
	std::string workspace_role;
};

struct WorkspaceDirectoryMemberUpdateRequest {
	std::optional<std::any> access_role;
	std::optional<std::string> department_id;
	std::any department_mode;
	std::any department_position;
};

struct WorkspaceDirectoryResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceGroupMapping {
	std::any access_role;
	std::optional<std::string> created_at;
	std::string department_id;
	std::any department_position;
	std::string id;
	std::string scim_group_id;
	std::optional<std::string> updated_at;
};

struct WorkspaceGroupMappingCreateRequest {
	std::any access_role;
	std::string department_id;
	std::any department_position;
	std::string scim_group_id;
};

struct WorkspaceGroupMappingListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceGroupMappingResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceGroupMappingUpdateRequest {
	std::any access_role;
	std::any department_position;
};

struct WorkspaceInvite {
	std::string created_at;
	std::string creator_user_id;
	std::optional<std::string> expires_at;
	std::string id;
	std::optional<int> max_uses;
	std::any role;
	std::optional<std::string> token_preview;
	std::optional<int> uses_count;
	std::string workspace_id;
};

struct WorkspaceInviteCreateRequest {
	std::optional<int> expires_in_days;
	std::optional<int> max_uses;
	std::any role;
};

struct WorkspaceInviteCreateResponse {
	std::map<std::string, std::any> data;
	std::string token;
};

struct WorkspaceInviteListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct WorkspaceJoinRequest {
	std::string created_at;
	std::optional<std::string> decided_at;
	std::optional<std::string> decided_by;
	std::string id;
	std::optional<std::string> invite_id;
	std::string requester_user_id;
	std::any status;
	std::string workspace_id;
};

struct WorkspaceJoinRequestListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct WorkspaceJoinRequestResponse {
	std::map<std::string, std::any> data;
};

using WorkspaceJoinRequestStatus = std::any;

struct WorkspaceListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct WorkspaceLowBalanceEmailSettings {
	bool enabled;
	double threshold_usd;
};

struct WorkspaceLowBalanceEmailUpdate {
	bool enabled;
	std::optional<double> threshold_usd;
};

struct WorkspaceMember {
	std::optional<std::string> display_name;
	std::optional<std::string> joined_at;
	std::any role;
	std::string user_id;
	std::string workspace_id;
};

struct WorkspaceMemberAddResponse {
	int added_count;
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceMemberBulkRequest {
	std::any role;
	std::vector<std::string> user_ids;
};

struct WorkspaceMemberListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct WorkspaceMemberRemoveRequest {
	std::vector<std::string> user_ids;
};

struct WorkspaceMemberRemoveResponse {
	int removed_count;
};

struct WorkspaceMemberResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceMemberRoleUpdateRequest {
	std::any role;
};

struct WorkspaceNotificationDestination {
	std::optional<std::string> created_at;
	std::string id;
	std::string name;
	std::any status;
	std::string target_preview;
	std::any type;
	std::optional<std::string> updated_at;
};

struct WorkspaceNotificationDestinationCreateRequest {
	std::string name;
	std::string target;
	std::any type;
};

struct WorkspaceNotificationDestinationListResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceNotificationDestinationResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceNotificationDestinationTestRequest {
	std::string target;
	std::any type;
};

using WorkspaceNotificationDestinationType = std::any;

struct WorkspaceNotificationEmailPreferences {
	bool auto_top_up_failure;
	bool model_deprecation;
	bool payment_method_expiring;
};

struct WorkspaceNotificationEmailPreferencesUpdate {
	std::optional<bool> auto_top_up_failure;
	std::optional<bool> model_deprecation;
	std::optional<bool> payment_method_expiring;
};

using WorkspaceNotificationEventKind = std::any;

struct WorkspaceNotificationRoute {
	std::vector<std::string> destination_ids;
	std::any event_kind;
};

struct WorkspaceNotificationRouteMap {
	std::vector<std::string> auto_top_up_failed;
	std::vector<std::string> low_balance;
	std::vector<std::string> model_deprecation;
	std::vector<std::string> payment_method_expiring;
};

struct WorkspaceNotificationRouteResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceNotificationRoutesResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceNotificationRouteUpdateRequest {
	std::vector<std::string> destination_ids;
};

struct WorkspaceNotificationSettings {
	std::map<std::string, std::any> auto_top_up;
	std::map<std::string, std::any> email_preferences;
	std::map<std::string, std::any> low_balance_email;
};

struct WorkspaceNotificationSettingsResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceNotificationSettingsUpdateRequest {
	std::map<std::string, std::any> auto_top_up;
	std::map<std::string, std::any> email_preferences;
	std::map<std::string, std::any> low_balance_email;
};

struct WorkspaceNotificationTestResponse {
	std::map<std::string, std::any> data;
};

using WorkspaceProviderRestrictionMode = std::any;

struct WorkspaceResponse {
	std::map<std::string, std::any> data;
};

using WorkspaceRole = std::any;

using WorkspaceRoutingMode = std::any;

struct WorkspaceScimAuditResponse {
	std::vector<std::map<std::string, std::any>> data;
};

struct WorkspaceScimEndpoint {
	std::optional<std::string> created_at;
	bool enabled;
	std::string id;
	std::optional<std::string> updated_at;
};

struct WorkspaceScimEndpointResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceScimEvent {
	std::string action;
	std::optional<std::string> correlation_id;
	std::string created_at;
	std::optional<std::map<std::string, std::any>> detail;
	std::optional<int> http_status;
	std::string id;
	std::string outcome;
	std::optional<std::string> request_id;
	std::optional<std::string> resource_id;
	std::optional<std::string> resource_type;
	std::optional<std::string> scim_type;
};

struct WorkspaceScimResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceScimToken {
	std::optional<std::string> created_at;
	std::optional<std::string> expires_at;
	std::string id;
	std::string label;
	std::optional<std::string> last_used_at;
	std::optional<std::string> revoked_at;
	std::string token_prefix;
};

struct WorkspaceScimTokenCreateRequest {
	std::optional<std::string> expires_at;
	std::string label;
};

struct WorkspaceScimTokenCreateResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceScimUpdateRequest {
	bool enabled;
};

struct WorkspaceSettings {
	std::optional<bool> alpha_channel_enabled;
	std::optional<bool> beta_channel_enabled;
	std::optional<bool> byok_fallback_enabled;
	std::optional<bool> io_logging_enabled;
	std::optional<bool> io_logging_include_provider_payloads;
	std::optional<bool> privacy_enable_free_may_publish_prompts;
	std::optional<bool> privacy_enable_free_may_train;
	std::optional<bool> privacy_enable_input_output_logging;
	std::optional<bool> privacy_enable_paid_may_train;
	std::optional<bool> privacy_zdr_only;
	std::optional<bool> provider_restriction_enforce_allowed;
	std::optional<std::any> provider_restriction_mode;
	std::optional<std::vector<std::string>> provider_restriction_provider_ids;
	std::optional<bool> response_healing_enabled;
	std::optional<bool> response_healing_locked;
	std::optional<std::any> response_healing_mode;
	std::optional<std::any> routing_mode;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct WorkspaceSettingsResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceSettingsUpdateRequest {
	std::optional<bool> alpha_channel_enabled;
	std::optional<bool> beta_channel_enabled;
	std::optional<bool> byok_fallback_enabled;
	std::optional<bool> io_logging_enabled;
	std::optional<bool> io_logging_include_provider_payloads;
	std::optional<bool> privacy_enable_free_may_publish_prompts;
	std::optional<bool> privacy_enable_free_may_train;
	std::optional<bool> privacy_enable_input_output_logging;
	std::optional<bool> privacy_enable_paid_may_train;
	std::optional<bool> privacy_zdr_only;
	std::optional<bool> provider_restriction_enforce_allowed;
	std::any provider_restriction_mode;
	std::vector<std::string> provider_restriction_provider_ids;
	std::optional<bool> response_healing_enabled;
	std::optional<bool> response_healing_locked;
	std::any response_healing_mode;
	std::any routing_mode;
};

struct WorkspaceSsoResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceSsoSettings {
	std::vector<std::string> domains;
	bool enabled;
	std::any enforced;
	std::any mode;
	std::optional<std::string> provider_identifier;
};

struct WorkspaceSsoUpdateRequest {
	std::vector<std::string> domains;
	bool enabled;
	std::any enforced;
	std::any mode;
	std::optional<std::string> provider_identifier;
};

struct WorkspaceUpdateRequest {
	std::string name;
	std::string slug;
};

} // namespace phaseo::gen
