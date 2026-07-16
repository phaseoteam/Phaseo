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
	bool disabled;
	std::optional<std::string> expires_at;
	std::string hash;
	std::string id;
	std::optional<std::string> label;
	std::optional<std::string> last_used_at;
	std::optional<std::string> name;
	std::optional<std::string> prefix;
	std::any scopes;
	bool soft_blocked;
	std::optional<std::string> status;
	std::optional<std::string> updated_at;
	std::string workspace_id;
};

struct ApiKeyCreateRequest {
	std::optional<bool> disabled;
	std::optional<std::string> expires_at;
	std::optional<bool> include_byok_in_limit;
	std::optional<double> limit;
	std::any limit_reset;
	std::string name;
	std::any scopes;
	std::optional<bool> soft_blocked;
	std::string workspace_id;
};

struct ApiKeyListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct ApiKeyResponse {
	std::map<std::string, std::any> data;
};

using ApiKeyScopeValue = std::any;

struct ApiKeyUpdateRequest {
	std::optional<bool> disabled;
	std::optional<std::string> expires_at;
	std::optional<bool> include_byok_in_limit;
	std::optional<double> limit;
	std::any limit_reset;
	std::string name;
	std::any scopes;
	std::optional<bool> soft_blocked;
};

struct ApiKeyWithValue {
	std::optional<std::string> created_at;
	std::optional<std::string> created_by;
	bool disabled;
	std::optional<std::string> expires_at;
	std::string hash;
	std::string id;
	std::string key;
	std::optional<std::string> label;
	std::optional<std::string> last_used_at;
	std::optional<std::string> name;
	std::optional<std::string> prefix;
	std::any scopes;
	bool soft_blocked;
	std::optional<std::string> status;
	std::optional<std::string> updated_at;
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
	std::string endpoint;
	std::string input_file_id;
	std::vector<std::map<std::string, std::any>> items;
	std::optional<int> max_tokens;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::vector<std::string> prompts;
	std::map<std::string, std::any> provider;
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
	std::string method;
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
	std::string session_id;
	std::string status;
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
	std::map<std::string, std::any> function;
	std::any type;
};

struct GatewayDatetimeToolDefinition {
	std::map<std::string, std::any> parameters;
	std::string timezone;
	std::any type;
};

struct GatewayModelsResponse {
	std::any availability_mode;
	int limit;
	std::vector<std::map<std::string, std::any>> models;
	int offset;
	bool ok;
	std::any privacy_scope;
	int total;
};

struct GatewayWebFetchToolDefinition {
	std::optional<int> max_chars;
	std::map<std::string, std::any> parameters;
	std::any type;
};

struct GatewayWebSearchToolDefinition {
	std::optional<bool> include_highlights;
	std::optional<bool> include_text;
	std::optional<int> max_results;
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
	std::string response_format;
	std::string size;
	std::string style;
	std::string user;
};

struct ImagesGenerationResponse {
	std::optional<int> created;
	std::vector<std::map<std::string, std::any>> data;
};

struct InteractionContentBlock {
	std::string data;
	std::string mime_type;
	std::string text;
	std::any type;
	std::string uri;
};

struct InteractionResponse {
	std::optional<int> created;
	std::string id;
	std::string model;
	std::any object;
	std::string output_text;
	std::any status;
	std::vector<std::map<std::string, std::any>> steps;
	std::map<std::string, std::any> usage;
};

struct InteractionsRequest {
	std::optional<bool> background;
	std::string cached_content;
	std::map<std::string, std::any> debug;
	std::optional<bool> echo_upstream_request;
	std::map<std::string, std::any> generation_config;
	std::any input;
	std::optional<bool> meta;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::string previous_interaction_id;
	std::map<std::string, std::any> provider;
	std::any response_format;
	std::any response_modalities;
	std::any service_tier;
	std::string session_id;
	std::optional<bool> store;
	std::optional<bool> stream;
	std::any system_instruction;
	std::any tool_choice;
	std::vector<std::map<std::string, std::any>> tools;
};

struct InteractionStep {
	std::any arguments;
	std::string call_id;
	std::any content;
	std::string id;
	std::optional<bool> is_error;
	std::string name;
	std::any result;
	std::string signature;
	std::any summary;
	std::any type;
};

struct InvalidRequestResponse {
	std::string error;
	std::optional<int> max_offset;
	std::string message;
	std::any ok;
};

struct KeyInvalidateResponse {
	std::map<std::string, std::any> cache_version;
	std::map<std::string, std::any> key;
	std::string message;
	std::any ok;
};

using KnownModelId = std::any;

struct ListFilesResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string object;
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
	std::map<std::string, std::any> architecture;
	std::map<std::string, std::any> availability;
	std::string canonical_slug;
	std::optional<int> created;
	std::optional<std::string> deprecation_date;
	std::string description;
	std::vector<std::string> endpoints;
	std::string id;
	std::vector<std::string> input_types;
	std::optional<ModelLifecycle> lifecycle;
	std::string model_id;
	std::optional<std::string> name;
	std::optional<std::string> organisation_colour;
	std::optional<std::string> organisation_id;
	std::optional<std::string> organisation_name;
	std::vector<std::string> output_types;
	std::optional<std::map<std::string, std::any>> per_request_limits;
	std::map<std::string, std::any> pricing;
	std::map<std::string, std::any> pricing_detail;
	std::vector<std::map<std::string, std::any>> providers;
	std::optional<std::string> release_date;
	std::optional<std::string> retirement_date;
	std::optional<std::string> status;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
	std::vector<std::string> supported_params;
	std::map<std::string, std::any> supported_params_detail;
	std::map<std::string, std::any> top_provider;
	std::optional<std::string> top_provider_id;
};

struct ModelAvailability {
	int active_provider_count;
	int inactive_provider_count;
	int provider_count;
	std::any status;
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
	bool is_active_gateway;
	std::any model_routing_status;
	std::vector<std::string> params;
	std::map<std::string, std::any> params_detail;
	std::any provider_routing_status;
	std::any provider_status;
	std::vector<std::string> supported_parameters;
	std::map<std::string, std::any> supported_parameters_detail;
};

struct ModelsPrivacyScopeNotImplementedResponse {
	std::any code;
	std::any error;
	std::string message;
	std::any ok;
	std::any privacy_scope;
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
};

struct NotImplementedResponse {
	std::string description;
	std::string error;
	int status_code;
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

struct Provider {
	std::string api_provider_id;
	std::optional<std::string> api_provider_name;
	std::optional<std::string> country_code;
	std::optional<std::string> description;
	std::optional<std::string> link;
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
	std::optional<int> created;
	std::string id;
	std::string model;
	std::string object;
	std::vector<std::map<std::string, std::any>> output;
	std::vector<std::map<std::string, std::any>> output_items;
	std::string role;
	std::string stop_reason;
	std::string type;
	std::map<std::string, std::any> usage;
};

struct ServerToolUsage {
	std::optional<int> datetime_requests;
	std::optional<int> web_fetch_requests;
	std::optional<int> web_search_requests;
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
	std::optional<bool> generate_audio;
	std::vector<std::map<std::string, std::any>> input_references;
	std::string model;
	std::string negative_prompt;
	std::map<std::string, std::any> output;
	std::string person_generation;
	std::string prompt;
	std::map<std::string, std::any> provider;
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

struct VideoInputReference {
	std::map<std::string, std::any> image_url;
	std::string reference_type;
	std::any role;
	std::any type;
};

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

struct WorkspaceCreateRequest {
	std::string name;
	std::string slug;
};

struct WorkspaceListResponse {
	std::vector<std::map<std::string, std::any>> data;
	int total_count;
};

struct WorkspaceResponse {
	std::map<std::string, std::any> data;
};

struct WorkspaceUpdateRequest {
	std::string name;
	std::string slug;
};

} // namespace phaseo::gen
