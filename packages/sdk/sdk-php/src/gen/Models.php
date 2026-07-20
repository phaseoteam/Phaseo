<?php
declare(strict_types=1);

namespace Phaseo\Gen;

class ActivityEntry
{
	/** @var float */
	public $byok_usage_inference;
	/** @var int */
	public $completion_tokens;
	/** @var string */
	public $date;
	/** @var string */
	public $endpoint_id;
	/** @var string */
	public $model;
	/** @var string */
	public $model_permaslug;
	/** @var int */
	public $prompt_tokens;
	/** @var string */
	public $provider_name;
	/** @var int */
	public $reasoning_tokens;
	/** @var int */
	public $requests;
	/** @var float */
	public $usage;
}

class ActivityResponse
{
	/** @var array */
	public $data;
}

class AnalyticsAccessTokenRequiredResponse
{
	/** @var string */
	public $error;
	/** @var string */
	public $ok;
}

class AnalyticsNotImplementedResponse
{
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
	/** @var string */
	public $status;
}

class AnthropicContentBlock
{
	/** @var array<string, mixed>|null */
	public $cache_control;
	/** @var string|null */
	public $content;
	/** @var string|null */
	public $id;
	/** @var array<string, mixed>|null */
	public $input;
	/** @var string|null */
	public $name;
	/** @var array<string, mixed>|null */
	public $source;
	/** @var string|null */
	public $text;
	/** @var string|null */
	public $tool_use_id;
	/** @var string|null */
	public $type;
}

class AnthropicMessage
{
	/** @var string|array */
	public $content;
	/** @var string */
	public $role;
}

class AnthropicMessagesRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var int */
	public $max_tokens;
	/** @var array */
	public $messages;
	/** @var bool|null */
	public $meta;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_options;
	/** @var array<string, mixed>|null */
	public $reasoning;
	/** @var string|null */
	public $session_id;
	/** @var array|null */
	public $stop_sequences;
	/** @var bool|null */
	public $stream;
	/** @var string|array|null */
	public $system;
	/** @var float|null */
	public $temperature;
	/** @var array<string, mixed>|string|null */
	public $tool_choice;
	/** @var array|null */
	public $tools;
	/** @var int|null */
	public $top_k;
	/** @var float|null */
	public $top_p;
	/** @var bool|null */
	public $usage;
}

class AnthropicMessagesResponse
{
	/** @var array|null */
	public $content;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $role;
	/** @var string|null */
	public $stop_reason;
	/** @var string|null */
	public $stop_sequence;
	/** @var string|null */
	public $type;
	/** @var array<string, mixed>|null */
	public $usage;
}

class AnthropicTool
{
	/** @var string|null */
	public $description;
	/** @var array<string, mixed>|null */
	public $input_schema;
	/** @var string */
	public $name;
}

class AnthropicUsage
{
	/** @var int|null */
	public $input_tokens;
	/** @var int|null */
	public $output_tokens;
}

class ApiKey
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var bool */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $hash;
	/** @var string */
	public $id;
	/** @var string|null */
	public $label;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|array */
	public $scopes;
	/** @var bool */
	public $soft_blocked;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class ApiKeyCreateRequest
{
	/** @var bool|null */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var bool|null */
	public $include_byok_in_limit;
	/** @var float|null */
	public $limit;
	/** @var string|null */
	public $limit_reset;
	/** @var string */
	public $name;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string|null */
	public $workspace_id;
}

class ApiKeyListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class ApiKeyResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ApiKeyScopeValue { }

class ApiKeyUpdateRequest
{
	/** @var bool|null */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var bool|null */
	public $include_byok_in_limit;
	/** @var float|null */
	public $limit;
	/** @var string|null */
	public $limit_reset;
	/** @var string|null */
	public $name;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
}

class ApiKeyWithValue
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var bool */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $hash;
	/** @var string */
	public $id;
	/** @var string */
	public $key;
	/** @var string|null */
	public $label;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|array */
	public $scopes;
	/** @var bool */
	public $soft_blocked;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class ApiKeyWithValueResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class AsyncJobWebSocketClientEvent
{
	/** @var string */
	public $type;
}

class AsyncJobWebSocketServerEvent
{
	/** @var array<string, mixed>|null */
	public $data;
	/** @var string */
	public $type;
}

class AsyncJobWebSocketUpgradeRequiredResponse
{
	/** @var array<string, mixed>|null */
	public $error;
}

class AsyncWebhookDeliveryAttempt
{
	/** @var int|null */
	public $attempt_number;
	/** @var string|null */
	public $delivered_at;
	/** @var string|null */
	public $delivery_key;
	/** @var string|null */
	public $error_message;
	/** @var string|null */
	public $event_type;
	/** @var string|null */
	public $id;
	/** @var int|null */
	public $max_attempts;
	/** @var string|null */
	public $next_retry_at;
	/** @var string|null */
	public $response_body_preview;
	/** @var int|null */
	public $response_status;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $tried_at;
}

class AsyncWebhookDeliverySummary
{
	/** @var array|null */
	public $delivered_event_types;
	/** @var int|null */
	public $delivered_events;
	/** @var string|null */
	public $last_attempt_at;
	/** @var string|null */
	public $last_attempt_status;
	/** @var string|null */
	public $last_delivered_at;
	/** @var string|null */
	public $last_error_message;
	/** @var string|null */
	public $last_failure_at;
	/** @var int|null */
	public $last_response_status;
	/** @var string|null */
	public $next_retry_at;
	/** @var int|null */
	public $pending_retries;
	/** @var int|null */
	public $total_attempts;
}

class AsyncWebhookPublicState
{
	/** @var array|null */
	public $attempts;
	/** @var array<string, mixed>|null */
	public $delivery;
	/** @var array|null */
	public $events;
	/** @var bool|null */
	public $has_secret;
	/** @var string|null */
	public $url;
}

class AudioContentPart
{
	/** @var array<string, mixed> */
	public $input_audio;
	/** @var string */
	public $type;
}

class AudioSpeechRequest
{
	/** @var string|null */
	public $format;
	/** @var string */
	public $input;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var string|null */
	public $voice;
}

class AudioTranscriptionRequest
{
	/** @var string|null */
	public $audio_b64;
	/** @var string|null */
	public $audio_url;
	/** @var string|null */
	public $language;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
}

class AudioTranscriptionResponse
{
	/** @var string|null */
	public $text;
}

class AudioTranslationRequest
{
	/** @var string|null */
	public $audio_b64;
	/** @var string|null */
	public $audio_url;
	/** @var string|null */
	public $language;
	/** @var string */
	public $model;
	/** @var string|null */
	public $prompt;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var float|null */
	public $temperature;
}

class AudioTranslationResponse
{
	/** @var string|null */
	public $text;
}

class BatchBillingSummary
{
	/** @var bool|null */
	public $billed;
	/** @var bool|null */
	public $charged;
	/** @var int|null */
	public $cost_nanos;
	/** @var float|null */
	public $cost_usd;
	/** @var string|null */
	public $currency;
	/** @var int|null */
	public $estimated_nanos;
	/** @var string|null */
	public $estimated_provider_cost;
	/** @var string|null */
	public $estimated_user_cost;
	/** @var int|null */
	public $estimation_sample_size;
	/** @var int|null */
	public $estimation_total_rows;
	/** @var bool|null */
	public $estimation_truncated;
	/** @var string|null */
	public $finalized_at;
	/** @var array<string, mixed>|null */
	public $pricing_breakdown;
	/** @var string|null */
	public $reason;
	/** @var string|null */
	public $reservation_id;
	/** @var string|null */
	public $reservation_status;
	/** @var int|null */
	public $reserved_nanos;
	/** @var string|null */
	public $settled_provider_cost;
	/** @var string|null */
	public $settled_user_cost;
	/** @var string|null */
	public $state;
	/** @var int|null */
	public $total_nanos;
}

class BatchListResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $first_id;
	/** @var bool|null */
	public $has_more;
	/** @var string|null */
	public $last_id;
	/** @var string|null */
	public $object;
}

class BatchModelCapability
{
	/** @var array|null */
	public $input_types;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $name;
	/** @var array|null */
	public $output_types;
	/** @var array<string, mixed>|null */
	public $pricing;
	/** @var array|null */
	public $providers;
	/** @var string|null */
	public $status;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
	/** @var array|null */
	public $supported_params;
	/** @var array<string, mixed>|null */
	public $supported_params_detail;
}

class BatchModelProviderCapability
{
	/** @var string|null */
	public $id;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
	/** @var array|null */
	public $supported_params;
	/** @var array<string, mixed>|null */
	public $supported_params_detail;
}

class BatchModelsResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $object;
}

class BatchProviderCapability
{
	/** @var string|null */
	public $documentation_url;
	/** @var array|null */
	public $gateway_input_modes;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $name;
	/** @var array|null */
	public $native_input_modes;
	/** @var string|null */
	public $notes;
	/** @var string|null */
	public $status;
}

class BatchRequest
{
	/** @var string|null */
	public $completion_window;
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var string|null */
	public $endpoint;
	/** @var string|null */
	public $input_file_id;
	/** @var array|null */
	public $items;
	/** @var int|null */
	public $max_tokens;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var string|null */
	public $model;
	/** @var array|null */
	public $prompts;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array|null */
	public $requests;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $system;
	/** @var float|null */
	public $temperature;
	/** @var array<string, mixed>|null */
	public $webhook;
	/** @var string|null */
	public $webhook_endpoint_id;
}

class BatchRequestCounts
{
	/** @var int|null */
	public $completed;
	/** @var int|null */
	public $failed;
	/** @var int|null */
	public $total;
}

class BatchRequestItem
{
	/** @var array<string, mixed> */
	public $body;
	/** @var string|null */
	public $custom_id;
	/** @var string|null */
	public $method;
	/** @var string|null */
	public $url;
}

class BatchRequestRow
{
	/** @var string|null */
	public $completed_at;
	/** @var int|null */
	public $cost_nanos;
	/** @var float|null */
	public $cost_usd;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $custom_id;
	/** @var string|null */
	public $endpoint;
	/** @var array<string, mixed>|null */
	public $error_body;
	/** @var string|null */
	public $id;
	/** @var array<string, mixed>|null */
	public $meta;
	/** @var string|null */
	public $method;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $native_batch_id;
	/** @var string|null */
	public $provider;
	/** @var string|null */
	public $request_body_hash;
	/** @var int|null */
	public $request_index;
	/** @var array<string, mixed>|null */
	public $response_body;
	/** @var int|null */
	public $response_status;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var array<string, mixed>|null */
	public $usage;
}

class BatchResponse
{
	/** @var array<string, mixed>|null */
	public $billing;
	/** @var string|null */
	public $cancel_url;
	/** @var int|null */
	public $cancelled_at;
	/** @var int|null */
	public $cancelling_at;
	/** @var int|null */
	public $completed_at;
	/** @var string|null */
	public $completion_window;
	/** @var int|null */
	public $created_at;
	/** @var string|null */
	public $endpoint;
	/** @var string|null */
	public $error_file_id;
	/** @var array<string, mixed>|null */
	public $errors;
	/** @var int|null */
	public $expired_at;
	/** @var int|null */
	public $expires_at;
	/** @var int|null */
	public $failed_at;
	/** @var string|null */
	public $finalized_at;
	/** @var int|null */
	public $finalizing_at;
	/** @var string|null */
	public $id;
	/** @var int|null */
	public $in_progress_at;
	/** @var string|null */
	public $input_file_id;
	/** @var string|null */
	public $last_webhook_dispatched_at;
	/** @var float|null */
	public $last_webhook_progress;
	/** @var string|null */
	public $last_webhook_progress_at;
	/** @var string|null */
	public $lifecycle_status;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var string|null */
	public $native_batch_id;
	/** @var string|null */
	public $next_webhook_retry_at;
	/** @var string|null */
	public $object;
	/** @var string|null */
	public $output_file_id;
	/** @var string|null */
	public $polling_url;
	/** @var array|null */
	public $pricing_lines;
	/** @var int|null */
	public $progress;
	/** @var string|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $request_counts;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $webhook;
	/** @var string|null */
	public $websocket_url;
}

class BenchmarkId { }

class CacheControl
{
	/** @var string|null */
	public $scope;
	/** @var string|null */
	public $ttl;
	/** @var string|null */
	public $type;
}

class ChatAudioOutputPart
{
	/** @var array<string, mixed> */
	public $audio_url;
	/** @var string|null */
	public $format;
	/** @var string|null */
	public $mime_type;
	/** @var string */
	public $type;
}

class ChatChoice
{
	/** @var string|null */
	public $finish_reason;
	/** @var int|null */
	public $index;
	/** @var array<string, mixed>|null */
	public $message;
}

class ChatCompletionsRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var float|null */
	public $frequency_penalty;
	/** @var array<string, mixed>|null */
	public $image_config;
	/** @var array<string, mixed>|null */
	public $logit_bias;
	/** @var bool|null */
	public $logprobs;
	/** @var int|null */
	public $max_completion_tokens;
	/** @var int|null */
	public $max_tokens;
	/** @var int|null */
	public $max_tool_calls;
	/** @var array */
	public $messages;
	/** @var bool|null */
	public $meta;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var array|null */
	public $modalities;
	/** @var string */
	public $model;
	/** @var bool|null */
	public $parallel_tool_calls;
	/** @var float|null */
	public $presence_penalty;
	/** @var string|null */
	public $prompt_cache_key;
	/** @var string|array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_options;
	/** @var array<string, mixed>|null */
	public $reasoning;
	/** @var string|array<string, mixed>|null */
	public $response_format;
	/** @var string|null */
	public $safety_identifier;
	/** @var int|null */
	public $seed;
	/** @var string|null */
	public $service_tier;
	/** @var string|null */
	public $session_id;
	/** @var string|array|null */
	public $stop;
	/** @var bool|null */
	public $store;
	/** @var bool|null */
	public $stream;
	/** @var array<string, mixed>|null */
	public $stream_options;
	/** @var float|null */
	public $temperature;
	/** @var string|array<string, mixed>|null */
	public $tool_choice;
	/** @var array|null */
	public $tools;
	/** @var int|null */
	public $top_logprobs;
	/** @var float|null */
	public $top_p;
	/** @var bool|null */
	public $usage;
	/** @var string|null */
	public $user;
	/** @var string|null */
	public $user_id;
}

class ChatCompletionsResponse
{
	/** @var array|null */
	public $choices;
	/** @var int|null */
	public $created;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $nativeResponseId;
	/** @var string|null */
	public $object;
	/** @var string|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $usage;
}

class ChatImageOutputPart
{
	/** @var array<string, mixed> */
	public $image_url;
	/** @var string|null */
	public $mime_type;
	/** @var string */
	public $type;
}

class ChatMessage
{
	/** @var array|null */
	public $audios;
	/** @var string|array|null */
	public $content;
	/** @var array|null */
	public $images;
	/** @var string|null */
	public $name;
	/** @var string */
	public $role;
	/** @var string|null */
	public $tool_call_id;
	/** @var array|null */
	public $tool_calls;
}

class CreditsResponse
{
	/** @var array<string, mixed> */
	public $credits;
	/** @var string */
	public $ok;
}

class DataModel
{
	/** @var string|null */
	public $deprecation_date;
	/** @var bool|null */
	public $hidden;
	/** @var array|null */
	public $input_types;
	/** @var ModelLifecycle|null */
	public $lifecycle;
	/** @var string|null */
	public $model_id;
	/** @var string|null */
	public $name;
	/** @var array<string, mixed>|null */
	public $organisation;
	/** @var array|null */
	public $output_types;
	/** @var string|null */
	public $release_date;
	/** @var string|null */
	public $retirement_date;
	/** @var string|null */
	public $status;
}

class DataModelOrganisation { }

class DebugOptions
{
	/** @var bool|null */
	public $enabled;
	/** @var bool|null */
	public $return_upstream_request;
	/** @var bool|null */
	public $return_upstream_response;
	/** @var bool|null */
	public $trace;
	/** @var string|null */
	public $trace_level;
}

class DeletedResponse
{
	/** @var string */
	public $deleted;
}

class Embedding
{
	/** @var array|null */
	public $embedding;
	/** @var int|null */
	public $index;
	/** @var string|null */
	public $object;
}

class EmbeddingsMultimodalInput
{
	/** @var array */
	public $content;
}

class EmbeddingsRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var int|null */
	public $dimensions;
	/** @var string|null */
	public $encoding_format;
	/** @var string|array|array<string, mixed> */
	public $input;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_options;
	/** @var string|null */
	public $user;
}

class EmbeddingsResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $object;
	/** @var array<string, mixed>|null */
	public $usage;
}

class ErrorFailureSampleItem
{
	/** @var string|null */
	public $provider;
	/** @var bool|null */
	public $retryable;
	/** @var int|null */
	public $status;
	/** @var string|null */
	public $type;
	/** @var string|null */
	public $upstream_error_code;
	/** @var string|null */
	public $upstream_error_description;
	/** @var string|null */
	public $upstream_error_message;
	/** @var string|null */
	public $upstream_error_param;
	/** @var string|null */
	public $upstream_payload_preview;
}

class ErrorProviderCandidateDiagnostics
{
	/** @var int|null */
	public $candidateCount;
	/** @var array|null */
	public $droppedMissingAdapter;
	/** @var array|null */
	public $droppedUnsupportedEndpoint;
	/** @var int|null */
	public $supportsEndpointCount;
	/** @var int|null */
	public $totalProviders;
}

class ErrorProviderEnablementDiagnostics
{
	/** @var string|null */
	public $capability;
	/** @var array|null */
	public $dropped;
	/** @var array|null */
	public $providersAfter;
	/** @var array|null */
	public $providersBefore;
}

class ErrorProviderFailureDiagnostics
{
	/** @var string|null */
	public $category;
	/** @var string|null */
	public $hint;
	/** @var string|null */
	public $provider;
}

class ErrorResponse
{
	/** @var int|null */
	public $attempt_count;
	/** @var string|null */
	public $description;
	/** @var array|null */
	public $details;
	/** @var string|array<string, mixed> */
	public $error;
	/** @var string|null */
	public $error_origin;
	/** @var string|null */
	public $error_type;
	/** @var array|null */
	public $failed_providers;
	/** @var array|null */
	public $failed_statuses;
	/** @var array|null */
	public $failure_sample;
	/** @var string|null */
	public $generation_id;
	/** @var string|null */
	public $message;
	/** @var array|null */
	public $missing_pricing_providers;
	/** @var bool|null */
	public $ok;
	/** @var array<string, mixed>|null */
	public $provider_candidate_diagnostics;
	/** @var array<string, mixed>|null */
	public $provider_enablement;
	/** @var array<string, mixed>|null */
	public $provider_failure_diagnostics;
	/** @var string|null */
	public $provider_payment_required_provider;
	/** @var string|null */
	public $provider_payment_required_support_notice;
	/** @var string|null */
	public $reason;
	/** @var array<string, mixed>|null */
	public $routing_diagnostics;
	/** @var int|null */
	public $status_code;
	/** @var array<string, mixed>|null */
	public $upstream_error;
}

class ErrorRoutingDiagnostics
{
	/** @var array|null */
	public $filterStages;
}

class ErrorUpstreamError
{
	/** @var string|null */
	public $code;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $message;
	/** @var string|null */
	public $param;
}

class FileResponse
{
	/** @var int|null */
	public $bytes;
	/** @var int|null */
	public $created_at;
	/** @var string|null */
	public $filename;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $object;
	/** @var string|null */
	public $purpose;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $status_details;
}

class FileUploadRequest
{
	/** @var mixed */
	public $file;
	/** @var string */
	public $purpose;
}

class FunctionToolDefinition
{
	/** @var array<string, mixed> */
	public $function;
	/** @var string */
	public $type;
}

class GatewayDatetimeToolDefinition
{
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string|null */
	public $timezone;
	/** @var string */
	public $type;
}

class GatewayModelsResponse
{
	/** @var string */
	public $availability_mode;
	/** @var int */
	public $limit;
	/** @var array */
	public $models;
	/** @var int */
	public $offset;
	/** @var bool */
	public $ok;
	/** @var string */
	public $privacy_scope;
	/** @var int */
	public $total;
}

class GatewayWebFetchToolDefinition
{
	/** @var int|null */
	public $max_chars;
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string */
	public $type;
}

class GatewayWebSearchToolDefinition
{
	/** @var bool|null */
	public $include_highlights;
	/** @var bool|null */
	public $include_text;
	/** @var int|null */
	public $max_results;
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string */
	public $type;
}

class GenerationResponse
{
	/** @var string|null */
	public $app_id;
	/** @var bool|null */
	public $byok;
	/** @var float|null */
	public $cost_nanos;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $currency;
	/** @var string|null */
	public $endpoint;
	/** @var string|null */
	public $error_code;
	/** @var string|null */
	public $error_message;
	/** @var float|null */
	public $generation_ms;
	/** @var string|null */
	public $key_id;
	/** @var float|null */
	public $latency_ms;
	/** @var string|null */
	public $model_id;
	/** @var string|null */
	public $native_response_id;
	/** @var array|null */
	public $pricing_lines;
	/** @var string|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $replay_request;
	/** @var bool|null */
	public $replay_supported;
	/** @var string|null */
	public $request_id;
	/** @var float|null */
	public $status_code;
	/** @var bool|null */
	public $stream;
	/** @var bool|null */
	public $success;
	/** @var string|null */
	public $team_id;
	/** @var float|null */
	public $throughput;
	/** @var array<string, mixed>|null */
	public $usage;
}

class Image
{
	/** @var string|null */
	public $b64_json;
	/** @var string|null */
	public $revised_prompt;
	/** @var string|null */
	public $url;
}

class ImageConfig
{
	/** @var string|null */
	public $aspect_ratio;
	/** @var array|null */
	public $font_inputs;
	/** @var string|null */
	public $image_size;
	/** @var bool|null */
	public $include_rai_reason;
	/** @var array|null */
	public $reference_images;
	/** @var array|null */
	public $super_resolution_references;
}

class ImageContentPart
{
	/** @var array<string, mixed> */
	public $image_url;
	/** @var string */
	public $type;
}

class ImageModerationInput
{
	/** @var array<string, mixed> */
	public $image_url;
	/** @var string */
	public $type;
}

class ImagesEditRequest
{
	/** @var string */
	public $image;
	/** @var string|null */
	public $mask;
	/** @var bool|null */
	public $meta;
	/** @var string */
	public $model;
	/** @var int|null */
	public $n;
	/** @var string */
	public $prompt;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var string|null */
	public $size;
	/** @var bool|null */
	public $usage;
	/** @var string|null */
	public $user;
}

class ImagesEditResponse
{
	/** @var int|null */
	public $created;
	/** @var array|null */
	public $data;
}

class ImagesGenerationRequest
{
	/** @var string */
	public $model;
	/** @var int|null */
	public $n;
	/** @var string */
	public $prompt;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var string|null */
	public $quality;
	/** @var string|null */
	public $response_format;
	/** @var string|null */
	public $size;
	/** @var string|null */
	public $style;
	/** @var string|null */
	public $user;
}

class ImagesGenerationResponse
{
	/** @var int|null */
	public $created;
	/** @var array|null */
	public $data;
}

class InteractionContentBlock
{
	/** @var string|null */
	public $data;
	/** @var string|null */
	public $mime_type;
	/** @var string|null */
	public $text;
	/** @var string */
	public $type;
	/** @var string|null */
	public $uri;
}

class InteractionResponse
{
	/** @var int|null */
	public $created;
	/** @var string */
	public $id;
	/** @var string */
	public $model;
	/** @var string */
	public $object;
	/** @var string|null */
	public $output_text;
	/** @var string */
	public $status;
	/** @var array */
	public $steps;
	/** @var array<string, mixed>|null */
	public $usage;
}

class InteractionsRequest
{
	/** @var bool|null */
	public $background;
	/** @var string|null */
	public $cached_content;
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var string|array<string, mixed>|null */
	public $environment;
	/** @var array<string, mixed>|null */
	public $generation_config;
	/** @var string|array|array<string, mixed> */
	public $input;
	/** @var array<string, mixed>|null */
	public $labels;
	/** @var bool|null */
	public $meta;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var string */
	public $model;
	/** @var string|null */
	public $previous_interaction_id;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|array|null */
	public $response_format;
	/** @var string|null */
	public $response_modalities;
	/** @var array|null */
	public $safety_settings;
	/** @var string|null */
	public $service_tier;
	/** @var string|null */
	public $session_id;
	/** @var bool|null */
	public $store;
	/** @var bool|null */
	public $stream;
	/** @var string|array|null */
	public $system_instruction;
	/** @var string|array<string, mixed>|null */
	public $tool_choice;
	/** @var array|null */
	public $tools;
}

class InteractionStep
{
	/** @var string|array<string, mixed>|null */
	public $arguments;
	/** @var string|null */
	public $call_id;
	/** @var string|array|null */
	public $content;
	/** @var string|null */
	public $id;
	/** @var bool|null */
	public $is_error;
	/** @var string|null */
	public $name;
	/** @var string|array<string, mixed>|null */
	public $result;
	/** @var string|null */
	public $signature;
	/** @var string|array<string, mixed>|null */
	public $summary;
	/** @var string */
	public $type;
}

class InvalidRequestResponse
{
	/** @var string */
	public $error;
	/** @var int|null */
	public $max_offset;
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
}

class KeyInvalidateResponse
{
	/** @var array<string, mixed> */
	public $cache_version;
	/** @var array<string, mixed> */
	public $key;
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
}

class KnownModelId { }

class ListFilesResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $object;
}

class ManagementKeyCreateRequest
{
	/** @var string|null */
	public $created_by;
	/** @var string */
	public $name;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $team_id;
}

class ManagementKeyCreateResponse
{
	/** @var array<string, mixed> */
	public $key;
	/** @var string */
	public $ok;
}

class ManagementKeyDeleteResponse
{
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
}

class ManagementKeyDetailResponse
{
	/** @var array<string, mixed> */
	public $key;
	/** @var string */
	public $ok;
}

class ManagementKeyListResponse
{
	/** @var array */
	public $keys;
	/** @var int */
	public $limit;
	/** @var int */
	public $offset;
	/** @var string */
	public $ok;
	/** @var int */
	public $total;
}

class ManagementKeyUpdateRequest
{
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string|null */
	public $status;
}

class ManagementKeyUpdateResponse
{
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
}

class MessageContentPart { }

class Model
{
	/** @var array|null */
	public $aliases;
	/** @var array<string, mixed>|null */
	public $architecture;
	/** @var array<string, mixed>|null */
	public $availability;
	/** @var string|null */
	public $canonical_slug;
	/** @var int|null */
	public $created;
	/** @var string|null */
	public $deprecation_date;
	/** @var string|null */
	public $description;
	/** @var array|null */
	public $endpoints;
	/** @var string|null */
	public $id;
	/** @var array|null */
	public $input_types;
	/** @var ModelLifecycle|null */
	public $lifecycle;
	/** @var string|null */
	public $model_id;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $organisation_colour;
	/** @var string|null */
	public $organisation_id;
	/** @var string|null */
	public $organisation_name;
	/** @var array|null */
	public $output_types;
	/** @var array<string, mixed>|null */
	public $per_request_limits;
	/** @var array<string, mixed>|null */
	public $pricing;
	/** @var array<string, mixed>|null */
	public $pricing_detail;
	/** @var array|null */
	public $providers;
	/** @var string|null */
	public $release_date;
	/** @var string|null */
	public $retirement_date;
	/** @var string|null */
	public $status;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
	/** @var array|null */
	public $supported_params;
	/** @var array<string, mixed>|null */
	public $supported_params_detail;
	/** @var array<string, mixed>|null */
	public $top_provider;
	/** @var string|null */
	public $top_provider_id;
}

class ModelAvailability
{
	/** @var int */
	public $active_provider_count;
	/** @var int */
	public $inactive_provider_count;
	/** @var int */
	public $provider_count;
	/** @var string */
	public $status;
}

class ModelId { }

class ModelLifecycle
{
	/** @var string|null */
	public $deprecation_date;
	/** @var string|null */
	public $message;
	/** @var string|null */
	public $replacement_model_id;
	/** @var string|null */
	public $retirement_date;
	/** @var string|null */
	public $status;
}

class ModelProviderAvailability
{
	/** @var string */
	public $api_provider_id;
	/** @var string|null */
	public $api_provider_name;
	/** @var string */
	public $availability_reason;
	/** @var string */
	public $availability_status;
	/** @var string */
	public $capability_status;
	/** @var string|null */
	public $effective_from;
	/** @var string|null */
	public $effective_to;
	/** @var array */
	public $endpoints;
	/** @var bool */
	public $is_active_gateway;
	/** @var string */
	public $model_routing_status;
	/** @var array */
	public $params;
	/** @var array<string, mixed>|null */
	public $params_detail;
	/** @var string */
	public $provider_routing_status;
	/** @var string */
	public $provider_status;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
}

class ModelsPrivacyScopeNotImplementedResponse
{
	/** @var string */
	public $code;
	/** @var string */
	public $error;
	/** @var string */
	public $message;
	/** @var string */
	public $ok;
	/** @var string */
	public $privacy_scope;
}

class ModerationCategories
{
	/** @var bool|null */
	public $harassment;
	/** @var bool|null */
	public $harassment_threatening;
	/** @var bool|null */
	public $hate;
	/** @var bool|null */
	public $hate_threatening;
	/** @var bool|null */
	public $self_harm;
	/** @var bool|null */
	public $self_harm_instructions;
	/** @var bool|null */
	public $self_harm_intent;
	/** @var bool|null */
	public $sexual;
	/** @var bool|null */
	public $sexual_minors;
	/** @var bool|null */
	public $violence;
	/** @var bool|null */
	public $violence_graphic;
}

class ModerationCategoryScores
{
	/** @var float|null */
	public $harassment;
	/** @var float|null */
	public $harassment_threatening;
	/** @var float|null */
	public $hate;
	/** @var float|null */
	public $hate_threatening;
	/** @var float|null */
	public $self_harm;
	/** @var float|null */
	public $self_harm_instructions;
	/** @var float|null */
	public $self_harm_intent;
	/** @var float|null */
	public $sexual;
	/** @var float|null */
	public $sexual_minors;
	/** @var float|null */
	public $violence;
	/** @var float|null */
	public $violence_graphic;
}

class ModerationResult
{
	/** @var array<string, mixed>|null */
	public $categories;
	/** @var array<string, mixed>|null */
	public $category_scores;
	/** @var bool|null */
	public $flagged;
}

class ModerationsRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var string|array */
	public $input;
	/** @var bool|null */
	public $meta;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
}

class ModerationsResponse
{
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $model;
	/** @var array|null */
	public $results;
}

class MusicGenerateRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var int|null */
	public $duration;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var array<string, mixed>|null */
	public $elevenlabs;
	/** @var string|null */
	public $format;
	/** @var string */
	public $model;
	/** @var string|null */
	public $prompt;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $suno;
}

class MusicGenerateResponse
{
}

class NotImplementedResponse
{
	/** @var string */
	public $description;
	/** @var string */
	public $error;
	/** @var int */
	public $status_code;
}

class OcrRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var string */
	public $image;
	/** @var string|null */
	public $language;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
}

class OcrResponse
{
}

class OrganisationId { }

class OrganisationIdList { }

class Provider
{
	/** @var string|null */
	public $api_provider_id;
	/** @var string|null */
	public $api_provider_name;
	/** @var string|null */
	public $country_code;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $link;
}

class ProviderOptions
{
	/** @var array<string, mixed>|null */
	public $anthropic;
	/** @var array<string, mixed>|null */
	public $google;
	/** @var array<string, mixed>|null */
	public $openai;
}

class ProviderRoutingOptions
{
	/** @var bool|null */
	public $allow_fallbacks;
	/** @var string|null */
	public $data_collection;
	/** @var bool|null */
	public $enforce_distillable_text;
	/** @var array|null */
	public $ignore;
	/** @var bool|null */
	public $include_alpha;
	/** @var array<string, mixed>|null */
	public $max_price;
	/** @var array|null */
	public $only;
	/** @var array|null */
	public $order;
	/** @var float|array<string, mixed>|null */
	public $preferred_max_latency;
	/** @var float|array<string, mixed>|null */
	public $preferred_min_throughput;
	/** @var array|null */
	public $quantizations;
	/** @var bool|null */
	public $require_parameters;
	/** @var bool|null */
	public $require_zero_data_retention;
	/** @var string|null */
	public $required_data_region;
	/** @var string|null */
	public $required_execution_region;
	/** @var string|array<string, mixed>|null */
	public $sort;
	/** @var bool|null */
	public $zdr;
}

class ProvisioningKey
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|null */
	public $scopes;
	/** @var string|null */
	public $status;
}

class ProvisioningKeyDetail
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $team_id;
}

class ProvisioningKeyWithValue
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $key;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|null */
	public $scopes;
	/** @var string|null */
	public $status;
}

class ReasoningConfig
{
	/** @var string|null */
	public $effort;
	/** @var bool|null */
	public $enabled;
	/** @var int|null */
	public $max_tokens;
	/** @var string|null */
	public $mode;
	/** @var string|null */
	public $summary;
}

class RerankDocument { }

class RerankRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var array */
	public $documents;
	/** @var int|null */
	public $max_chunks_per_doc;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var string */
	public $model;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_options;
	/** @var string */
	public $query;
	/** @var array|null */
	public $rank_fields;
	/** @var bool|null */
	public $return_documents;
	/** @var int|null */
	public $top_k;
	/** @var int|null */
	public $top_n;
	/** @var string|null */
	public $user;
}

class RerankResponse
{
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $nativeResponseId;
	/** @var string|null */
	public $object;
	/** @var array|null */
	public $results;
	/** @var array<string, mixed>|null */
	public $usage;
}

class RerankResult
{
	/** @var string|array<string, mixed>|null */
	public $document;
	/** @var int|null */
	public $index;
	/** @var float|null */
	public $relevance_score;
}

class ResponsesInputItem
{
	/** @var string|array|array<string, mixed>|null */
	public $content;
	/** @var string|null */
	public $role;
	/** @var string|null */
	public $type;
}

class ResponsesOutputAudioPart
{
	/** @var array<string, mixed>|null */
	public $audio_url;
	/** @var string|null */
	public $b64_json;
	/** @var string|null */
	public $format;
	/** @var string|null */
	public $mime_type;
	/** @var string */
	public $type;
}

class ResponsesOutputContentPart { }

class ResponsesOutputImagePart
{
	/** @var string|null */
	public $b64_json;
	/** @var array<string, mixed>|null */
	public $image_url;
	/** @var string|null */
	public $mime_type;
	/** @var string */
	public $type;
}

class ResponsesOutputItem
{
	/** @var string|null */
	public $arguments;
	/** @var string|null */
	public $call_id;
	/** @var array|null */
	public $content;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $role;
	/** @var string|null */
	public $type;
}

class ResponsesOutputTextPart
{
	/** @var array|null */
	public $annotations;
	/** @var string */
	public $text;
	/** @var string */
	public $type;
}

class ResponsesRequest
{
	/** @var bool|null */
	public $background;
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var array<string, mixed>|null */
	public $image_config;
	/** @var array|null */
	public $include;
	/** @var string|array|array<string, mixed> */
	public $input;
	/** @var string|null */
	public $instructions;
	/** @var int|null */
	public $max_output_tokens;
	/** @var bool|null */
	public $meta;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var array|null */
	public $modalities;
	/** @var string */
	public $model;
	/** @var bool|null */
	public $parallel_tool_calls;
	/** @var string|null */
	public $previous_response_id;
	/** @var string|null */
	public $prompt_cache_key;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_options;
	/** @var array<string, mixed>|null */
	public $reasoning;
	/** @var string|null */
	public $safety_identifier;
	/** @var string|null */
	public $service_tier;
	/** @var string|null */
	public $session_id;
	/** @var bool|null */
	public $store;
	/** @var bool|null */
	public $stream;
	/** @var float|null */
	public $temperature;
	/** @var array<string, mixed>|null */
	public $text;
	/** @var string|array<string, mixed>|null */
	public $tool_choice;
	/** @var array|null */
	public $tools;
	/** @var float|null */
	public $top_p;
	/** @var string|null */
	public $truncation;
	/** @var bool|null */
	public $usage;
	/** @var string|null */
	public $user;
}

class ResponsesResponse
{
	/** @var array|null */
	public $content;
	/** @var int|null */
	public $created;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $object;
	/** @var array|null */
	public $output;
	/** @var array|null */
	public $output_items;
	/** @var string|null */
	public $role;
	/** @var string|null */
	public $stop_reason;
	/** @var string|null */
	public $type;
	/** @var array<string, mixed>|null */
	public $usage;
}

class ServerToolUsage
{
	/** @var int|null */
	public $datetime_requests;
	/** @var int|null */
	public $web_fetch_requests;
	/** @var int|null */
	public $web_search_requests;
}

class SupportedParameterDetails
{
}

class TextContentPart
{
	/** @var string */
	public $text;
	/** @var string */
	public $type;
}

class TextGenerateTool { }

class TextModerationInput
{
	/** @var string */
	public $text;
	/** @var string */
	public $type;
}

class TextToolChoice { }

class ToolCall
{
	/** @var array<string, mixed> */
	public $function;
	/** @var string */
	public $id;
	/** @var string */
	public $type;
}

class ToolCallContentPart
{
	/** @var array<string, mixed> */
	public $function;
	/** @var string */
	public $id;
	/** @var string */
	public $type;
}

class Usage
{
	/** @var int|null */
	public $completion_tokens;
	/** @var int|null */
	public $prompt_tokens;
	/** @var array<string, mixed>|null */
	public $server_tool_use;
	/** @var int|null */
	public $total_tokens;
}

class VideoBillingSummary
{
	/** @var bool|null */
	public $billable;
	/** @var string|null */
	public $billed_at;
	/** @var string|null */
	public $charge_reason;
	/** @var bool|null */
	public $charged;
	/** @var string|null */
	public $currency;
	/** @var int|null */
	public $estimated_nanos;
	/** @var string|null */
	public $estimated_provider_cost;
	/** @var string|null */
	public $estimated_user_cost;
	/** @var string|null */
	public $reservation_id;
	/** @var string|null */
	public $reservation_status;
	/** @var int|null */
	public $reserved_nanos;
	/** @var string|null */
	public $settled_provider_cost;
	/** @var string|null */
	public $settled_user_cost;
	/** @var string|null */
	public $state;
	/** @var int|null */
	public $total_nanos;
}

class VideoContentPart
{
	/** @var string */
	public $type;
	/** @var string */
	public $video_url;
}

class VideoDeleteResponse
{
	/** @var bool|null */
	public $deleted;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $object;
}

class VideoGenerationRequest
{
	/** @var string|null */
	public $aspect_ratio;
	/** @var int|null */
	public $compression_quality;
	/** @var int|null */
	public $duration;
	/** @var bool|null */
	public $enhance_prompt;
	/** @var bool|null */
	public $generate_audio;
	/** @var array|null */
	public $input_references;
	/** @var string */
	public $model;
	/** @var string|null */
	public $negative_prompt;
	/** @var array<string, mixed>|null */
	public $output;
	/** @var string|null */
	public $person_generation;
	/** @var string */
	public $prompt;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $provider_params;
	/** @var string|null */
	public $resize_mode;
	/** @var string|null */
	public $resolution;
	/** @var int|null */
	public $sample_count;
	/** @var int|null */
	public $seed;
	/** @var string|null */
	public $size;
	/** @var array<string, mixed>|null */
	public $webhook;
}

class VideoGenerationResponse
{
	/** @var array<string, mixed>|null */
	public $asset;
	/** @var bool|null */
	public $audio;
	/** @var array<string, mixed>|null */
	public $billing;
	/** @var string|null */
	public $cancel_url;
	/** @var int|string|null */
	public $completed_at;
	/** @var string|null */
	public $content_url;
	/** @var int|string|null */
	public $created_at;
	/** @var string|null */
	public $download_url;
	/** @var mixed|null */
	public $error;
	/** @var int|null */
	public $expires_at;
	/** @var string|null */
	public $generation_id;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $last_webhook_dispatched_at;
	/** @var float|null */
	public $last_webhook_progress;
	/** @var string|null */
	public $last_webhook_progress_at;
	/** @var string|null */
	public $lifecycle_status;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $native_video_id;
	/** @var string|null */
	public $next_webhook_retry_at;
	/** @var string|null */
	public $object;
	/** @var string|null */
	public $output_access;
	/** @var array|null */
	public $outputs;
	/** @var int|null */
	public $poll_after_seconds;
	/** @var string|null */
	public $polling_url;
	/** @var int|null */
	public $progress;
	/** @var string|null */
	public $progress_source;
	/** @var string|null */
	public $provider;
	/** @var string|null */
	public $request_id;
	/** @var float|null */
	public $seconds;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $size;
	/** @var int|string|null */
	public $started_at;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $usage;
	/** @var array<string, mixed>|null */
	public $webhook;
	/** @var string|null */
	public $websocket_url;
}

class VideoInputReference
{
	/** @var array<string, mixed>|null */
	public $image_url;
	/** @var string|null */
	public $reference_type;
	/** @var string|null */
	public $role;
	/** @var string */
	public $type;
}

class VideoListResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $first_id;
	/** @var bool|null */
	public $has_more;
	/** @var string|null */
	public $last_id;
	/** @var string|null */
	public $object;
}

class VideoModelCapability
{
	/** @var array|null */
	public $input_types;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $name;
	/** @var array|null */
	public $output_types;
	/** @var array<string, mixed>|null */
	public $pricing;
	/** @var array|null */
	public $providers;
	/** @var string|null */
	public $status;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
	/** @var array|null */
	public $supported_params;
	/** @var array<string, mixed>|null */
	public $supported_params_detail;
}

class VideoModelProviderCapability
{
	/** @var string|null */
	public $id;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
	/** @var array|null */
	public $supported_params;
	/** @var array<string, mixed>|null */
	public $supported_params_detail;
}

class VideoModelsResponse
{
	/** @var array|null */
	public $data;
	/** @var string|null */
	public $object;
}

class VideoOutput
{
	/** @var bool|null */
	public $bytes_available;
	/** @var string|null */
	public $content_url;
	/** @var string|null */
	public $download_url;
	/** @var int|null */
	public $expires_at;
	/** @var int|null */
	public $index;
	/** @var string|null */
	public $mime_type;
}

class VideoOutputConfig
{
	/** @var string|null */
	public $access;
}

class Workspace
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string */
	public $id;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $slug;
	/** @var string|null */
	public $updated_at;
}

class WorkspaceActivityEntry
{
	/** @var float */
	public $cost_cents;
	/** @var string|null */
	public $endpoint;
	/** @var int|null */
	public $latency_ms;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $provider;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $timestamp;
	/** @var array<string, mixed>|null */
	public $usage;
}

class WorkspaceActivityResponse
{
	/** @var array */
	public $activity;
	/** @var int */
	public $limit;
	/** @var int */
	public $offset;
	/** @var string */
	public $ok;
	/** @var int */
	public $period_days;
	/** @var int */
	public $total;
	/** @var float */
	public $total_cost_cents;
}

class WorkspaceCreateRequest
{
	/** @var string */
	public $name;
	/** @var string|null */
	public $slug;
}

class WorkspaceListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class WorkspaceResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceUpdateRequest
{
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $slug;
}
