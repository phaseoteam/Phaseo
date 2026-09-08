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

class AnalyticsResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $limit;
	/** @var int */
	public $offset;
	/** @var int */
	public $total_count;
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
	/** @var bool|null */
	public $async;
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
	/** @var string|null */
	public $creator_user_id;
	/** @var bool */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $hash;
	/** @var string */
	public $id;
	/** @var bool */
	public $include_byok_in_limit;
	/** @var string|null */
	public $label;
	/** @var string|null */
	public $last_used_at;
	/** @var float|null */
	public $limit;
	/** @var float|null */
	public $limit_remaining;
	/** @var string|null */
	public $limit_reset;
	/** @var array<string, mixed> */
	public $limits;
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
	/** @var float */
	public $usage;
	/** @var float */
	public $usage_daily;
	/** @var array<string, mixed> */
	public $usage_details;
	/** @var float */
	public $usage_monthly;
	/** @var float */
	public $usage_weekly;
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
	/** @var array<string, mixed>|null */
	public $limits;
	/** @var string */
	public $name;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string|null */
	public $workspace_id;
}

class ApiKeyLimitBucket
{
	/** @var float|null */
	public $cost;
	/** @var int|null */
	public $requests;
}

class ApiKeyLimitInputBucket
{
	/** @var float|null */
	public $cost;
	/** @var int|null */
	public $requests;
}

class ApiKeyLimitInputWindows
{
	/** @var array<string, mixed>|null */
	public $daily;
	/** @var array<string, mixed>|null */
	public $monthly;
	/** @var array<string, mixed>|null */
	public $weekly;
}

class ApiKeyLimitWindows
{
	/** @var array<string, mixed> */
	public $daily;
	/** @var array<string, mixed> */
	public $monthly;
	/** @var array<string, mixed> */
	public $weekly;
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

class ApiKeyRotateRequest
{
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $previous_key_expires_at;
}

class ApiKeyRotateResponse
{
	/** @var array<string, mixed> */
	public $data;
	/** @var string|null */
	public $previous_key_expires_at;
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
	/** @var array<string, mixed>|null */
	public $limits;
	/** @var string|null */
	public $name;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
}

class ApiKeyUsageBucket
{
	/** @var float */
	public $cost;
	/** @var int */
	public $requests;
}

class ApiKeyUsageWindows
{
	/** @var array<string, mixed> */
	public $daily;
	/** @var array<string, mixed> */
	public $monthly;
	/** @var array<string, mixed> */
	public $total;
	/** @var array<string, mixed> */
	public $weekly;
}

class ApiKeyWithValue
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string|null */
	public $creator_user_id;
	/** @var bool */
	public $disabled;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $hash;
	/** @var string */
	public $id;
	/** @var bool */
	public $include_byok_in_limit;
	/** @var string */
	public $key;
	/** @var string|null */
	public $label;
	/** @var string|null */
	public $last_used_at;
	/** @var float|null */
	public $limit;
	/** @var float|null */
	public $limit_remaining;
	/** @var string|null */
	public $limit_reset;
	/** @var array<string, mixed> */
	public $limits;
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
	/** @var float */
	public $usage;
	/** @var float */
	public $usage_daily;
	/** @var array<string, mixed> */
	public $usage_details;
	/** @var float */
	public $usage_monthly;
	/** @var float */
	public $usage_weekly;
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
	/** @var string|array<string, mixed>|null */
	public $chunking_strategy;
	/** @var array|null */
	public $known_speaker_names;
	/** @var array|null */
	public $known_speaker_references;
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
	public $endpoints;
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
	/** @var array<string, mixed>|null */
	public $provider_options;
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
	public $results_url;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $usage;
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
	/** @var string|null */
	public $reasoning_effort;
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

class DataContributionCategories
{
}

class DataContributionClassifier
{
	/** @var array<string, mixed> */
	public $categories;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $description;
	/** @var bool */
	public $enabled;
	/** @var string */
	public $id;
	/** @var string */
	public $instructions;
	/** @var string */
	public $kind;
	/** @var string */
	public $model;
	/** @var string */
	public $name;
	/** @var int */
	public $sample_rate_bps;
	/** @var string */
	public $service_tier;
	/** @var string */
	public $slug;
	/** @var string|null */
	public $updated_at;
}

class DataContributionClassifierCreateRequest
{
	/** @var array<string, mixed> */
	public $categories;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string */
	public $instructions;
	/** @var string|null */
	public $model;
	/** @var string */
	public $name;
	/** @var int|null */
	public $sampleRateBps;
	/** @var string|null */
	public $serviceTier;
	/** @var string|null */
	public $slug;
}

class DataContributionClassifierDeleteResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DataContributionClassifierInput
{
	/** @var array<string, mixed>|null */
	public $categories;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $instructions;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $name;
	/** @var int|null */
	public $sampleRateBps;
	/** @var string|null */
	public $serviceTier;
}

class DataContributionClassifierResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DataContributionClassifierUpdateRequest
{
	/** @var array<string, mixed>|null */
	public $categories;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $instructions;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $name;
	/** @var int|null */
	public $sampleRateBps;
	/** @var string|null */
	public $serviceTier;
}

class DataContributionConsentRequest
{
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $reason;
}

class DataContributionConsentResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DataContributionOverviewResponse
{
	/** @var array<string, mixed> */
	public $data;
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

class DynamicRoute
{
	/** @var array<string, mixed> */
	public $config;
	/** @var string|null */
	public $created_at;
	/** @var int|null */
	public $deployed_version;
	/** @var string|null */
	public $description;
	/** @var string */
	public $id;
	/** @var array */
	public $key_ids;
	/** @var string */
	public $name;
	/** @var string */
	public $slug;
	/** @var string */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var int */
	public $version;
	/** @var array */
	public $versions;
	/** @var string */
	public $workspace_id;
}

class DynamicRouteAction
{
	/** @var bool|null */
	public $allowFallbacks;
	/** @var string|null */
	public $model;
	/** @var array|null */
	public $modelFallbacks;
	/** @var array|null */
	public $providerIgnore;
	/** @var array|null */
	public $providerOnly;
	/** @var array|null */
	public $providerOrder;
	/** @var string|null */
	public $routingMode;
}

class DynamicRouteCondition
{
	/** @var string */
	public $field;
	/** @var string|null */
	public $metadataKey;
	/** @var string */
	public $operator;
	/** @var string|null */
	public $value;
}

class DynamicRouteConfig
{
	/** @var bool|null */
	public $cacheAwareRouting;
	/** @var array<string, mixed>|null */
	public $defaultAction;
	/** @var array|null */
	public $edges;
	/** @var string|null */
	public $entryNodeId;
	/** @var array|null */
	public $nodes;
	/** @var array|null */
	public $rules;
	/** @var string|null */
	public $schemaVersion;
	/** @var bool|null */
	public $sessionAffinity;
}

class DynamicRouteCreateRequest
{
	/** @var array<string, mixed> */
	public $config;
	/** @var string|null */
	public $description;
	/** @var string */
	public $name;
	/** @var string|null */
	public $slug;
	/** @var string|null */
	public $status;
}

class DynamicRouteDeleteResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DynamicRouteDeployResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DynamicRouteEdge
{
	/** @var string */
	public $id;
	/** @var string */
	public $source;
	/** @var string|null */
	public $sourceHandle;
	/** @var string */
	public $target;
}

class DynamicRouteKeysResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DynamicRouteKeysUpdateRequest
{
	/** @var array */
	public $key_ids;
}

class DynamicRouteListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class DynamicRouteNode
{
	/** @var array<string, mixed> */
	public $data;
	/** @var string */
	public $id;
	/** @var array<string, mixed>|null */
	public $position;
	/** @var string */
	public $type;
}

class DynamicRouteResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class DynamicRouteRule
{
	/** @var array<string, mixed> */
	public $action;
	/** @var array<string, mixed> */
	public $condition;
	/** @var bool */
	public $enabled;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
}

class DynamicRouteUpdateRequest
{
	/** @var array<string, mixed>|null */
	public $config;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $status;
}

class DynamicRouteVersion
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string */
	public $status;
	/** @var int */
	public $version;
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

class EndpointCatalogueEntry
{
	/** @var string */
	public $capability_id;
	/** @var string */
	public $collection;
	/** @var string */
	public $id;
	/** @var int */
	public $model_count;
	/** @var int */
	public $provider_count;
	/** @var string */
	public $public_path;
}

class EndpointCatalogueResponse
{
	/** @var array */
	public $data;
	/** @var array */
	public $endpoints;
	/** @var string */
	public $ok;
	/** @var array */
	public $sample_models;
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
	/** @var bool|null */
	public $async;
	/** @var array<string, mixed> */
	public $function;
	/** @var string */
	public $type;
}

class FusionToolDefinition
{
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string */
	public $type;
}

class GatewayCapabilities
{
	/** @var array|null */
	public $endpoints;
	/** @var array<string, mixed> */
	public $parameter_details;
	/** @var array */
	public $parameters;
}

class GatewayCapabilityStatus { }

class GatewayDatetimeToolDefinition
{
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string|null */
	public $timezone;
	/** @var string */
	public $type;
}

class GatewayFeedback
{
	/** @var string|null */
	public $comment;
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by_user_id;
	/** @var string|null */
	public $end_user_id;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $metadata;
	/** @var array<string, mixed> */
	public $metadata_dimensions;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $rating;
	/** @var string|null */
	public $reason;
	/** @var array */
	public $reason_tags;
	/** @var string|null */
	public $request_id;
	/** @var float|null */
	public $score;
	/** @var string|null */
	public $session_id;
	/** @var string */
	public $source;
	/** @var string|null */
	public $test_run_id;
	/** @var string */
	public $workspace_id;
}

class GatewayFeedbackCreateRequest
{
	/** @var string|null */
	public $comment;
	/** @var string|null */
	public $end_user_id;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var array<string, mixed>|null */
	public $metadata_dimensions;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $rating;
	/** @var string|null */
	public $reason;
	/** @var array|null */
	public $reason_tags;
	/** @var string|null */
	public $request_id;
	/** @var float|null */
	public $score;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $source;
	/** @var string|null */
	public $test_run_id;
}

class GatewayFeedbackListResponse
{
	/** @var array */
	public $data;
}

class GatewayFeedbackResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class GatewayFeedbackSummaryResponse
{
	/** @var array */
	public $data;
	/** @var string */
	public $group_by;
}

class GatewayFeedbackSummaryRow
{
	/** @var float|null */
	public $average_score;
	/** @var int */
	public $count;
	/** @var string|null */
	public $last_feedback_at;
	/** @var string|null */
	public $metadata_key;
	/** @var string|null */
	public $metadata_value;
	/** @var int */
	public $negative;
	/** @var int */
	public $partial;
	/** @var int */
	public $positive;
	/** @var string|null */
	public $preset_id;
	/** @var array<string, mixed> */
	public $ratings;
	/** @var string|null */
	public $test_run_id;
}

class GatewayModalities
{
	/** @var array */
	public $input;
	/** @var array */
	public $output;
}

class GatewayModelLifecycle
{
	/** @var string|null */
	public $deprecated_at;
	/** @var string|null */
	public $message;
	/** @var string|null */
	public $released_at;
	/** @var string|null */
	public $replacement_id;
	/** @var string|null */
	public $retires_at;
	/** @var string|null */
	public $status;
}

class GatewayModelLimits
{
	/** @var int|null */
	public $input_tokens;
	/** @var int|null */
	public $output_tokens;
}

class GatewayModelOffer
{
	/** @var array<string, mixed> */
	public $capabilities;
	/** @var array<string, mixed> */
	public $effective;
	/** @var array */
	public $endpoints;
	/** @var array<string, mixed> */
	public $modalities;
	/** @var string|null */
	public $model;
	/** @var array<string, mixed> */
	public $pricing;
	/** @var array<string, mixed> */
	public $provider;
	/** @var bool */
	public $routable;
	/** @var array<string, mixed> */
	public $routing;
	/** @var string */
	public $status;
	/** @var string */
	public $status_reason;
}

class GatewayModelOrganization { }

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
	/** @var int */
	public $total;
}

class GatewayObservabilityEvent
{
	/** @var string */
	public $category;
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by_user_id;
	/** @var string|null */
	public $end_user_id;
	/** @var string */
	public $event_name;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $metadata;
	/** @var array<string, mixed> */
	public $metadata_dimensions;
	/** @var float|null */
	public $numeric_value;
	/** @var string */
	public $occurred_at;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $session_id;
	/** @var string */
	public $source;
	/** @var string|null */
	public $test_run_id;
	/** @var mixed|null */
	public $value;
	/** @var string */
	public $workspace_id;
}

class GatewayObservabilityEventCreateRequest
{
	/** @var string|null */
	public $category;
	/** @var string|null */
	public $end_user_id;
	/** @var string */
	public $event_name;
	/** @var array<string, mixed>|null */
	public $metadata;
	/** @var array<string, mixed>|null */
	public $metadata_dimensions;
	/** @var float|null */
	public $numeric_value;
	/** @var string|null */
	public $occurred_at;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $session_id;
	/** @var string|null */
	public $source;
	/** @var string|null */
	public $test_run_id;
	/** @var mixed|null */
	public $value;
}

class GatewayObservabilityEventListResponse
{
	/** @var array */
	public $data;
}

class GatewayObservabilityEventResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class GatewayPricing
{
	/** @var array<string, mixed> */
	public $meters;
	/** @var string */
	public $pricing_plan;
}

class GatewayPricingMeter { }

class GatewayProviderAvailabilityReason { }

class GatewayRequestLog
{
	/** @var string|null */
	public $auth_method;
	/** @var bool|null */
	public $byok;
	/** @var string|null */
	public $canonical_model_id;
	/** @var int|null */
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
	public $finish_reason;
	/** @var float|null */
	public $generation_ms;
	/** @var string|null */
	public $key_id;
	/** @var float|null */
	public $latency_ms;
	/** @var string|null */
	public $location;
	/** @var string|null */
	public $model_id;
	/** @var string|null */
	public $native_response_id;
	/** @var string|null */
	public $oauth_client_id;
	/** @var array|null */
	public $pricing_lines;
	/** @var string|null */
	public $provider;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $requested_model_id;
	/** @var string|null */
	public $routed_model_id;
	/** @var int|null */
	public $status_code;
	/** @var bool|null */
	public $stream;
	/** @var bool|null */
	public $success;
	/** @var float|null */
	public $throughput;
	/** @var array<string, mixed>|null */
	public $usage;
}

class GatewayRequestLogListResponse
{
	/** @var array */
	public $data;
	/** @var string */
	public $from_time;
	/** @var int */
	public $limit;
	/** @var int */
	public $offset;
	/** @var string */
	public $ok;
	/** @var string|null */
	public $to_time;
	/** @var int */
	public $total;
}

class GatewayRequestLogResponse
{
	/** @var array<string, mixed> */
	public $data;
	/** @var string */
	public $ok;
}

class GatewayRoutingStatus { }

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
	/** @var string|null */
	public $engine;
	/** @var bool|null */
	public $include_highlights;
	/** @var bool|null */
	public $include_text;
	/** @var string|null */
	public $language;
	/** @var int|null */
	public $max_results;
	/** @var int|null */
	public $page;
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

class Guardrail
{
	/** @var array|null */
	public $allowed_api_model_ids;
	/** @var string|null */
	public $created_at;
	/** @var int|null */
	public $daily_limit_cost_nanos;
	/** @var int|null */
	public $daily_limit_requests;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string */
	public $id;
	/** @var string|null */
	public $model_restriction_mode;
	/** @var int|null */
	public $monthly_limit_cost_nanos;
	/** @var int|null */
	public $monthly_limit_requests;
	/** @var string */
	public $name;
	/** @var bool|null */
	public $privacy_enable_free_may_publish_prompts;
	/** @var bool|null */
	public $privacy_enable_free_may_train;
	/** @var bool|null */
	public $privacy_enable_input_output_logging;
	/** @var bool|null */
	public $privacy_enable_paid_may_train;
	/** @var bool|null */
	public $privacy_zdr_only;
	/** @var string|null */
	public $prompt_injection_action;
	/** @var bool|null */
	public $prompt_injection_enabled;
	/** @var bool|null */
	public $provider_restriction_enforce_allowed;
	/** @var string|null */
	public $provider_restriction_mode;
	/** @var array|null */
	public $provider_restriction_provider_ids;
	/** @var string|null */
	public $sensitive_info_default_action;
	/** @var bool|null */
	public $sensitive_info_enabled;
	/** @var array|null */
	public $sensitive_info_rules;
	/** @var string|null */
	public $updated_at;
	/** @var int|null */
	public $weekly_limit_cost_nanos;
	/** @var int|null */
	public $weekly_limit_requests;
	/** @var string */
	public $workspace_id;
}

class GuardrailBudgetInput
{
	/** @var int|null */
	public $dailyCostNanos;
	/** @var int|null */
	public $dailyRequests;
	/** @var int|null */
	public $monthlyCostNanos;
	/** @var int|null */
	public $monthlyRequests;
	/** @var int|null */
	public $weeklyCostNanos;
	/** @var int|null */
	public $weeklyRequests;
}

class GuardrailCreateRequest
{
	/** @var array|null */
	public $allowedApiModelIds;
	/** @var array<string, mixed>|null */
	public $budgets;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $modelRestrictionMode;
	/** @var string */
	public $name;
	/** @var bool|null */
	public $privacyEnableFreeMayPublishPrompts;
	/** @var bool|null */
	public $privacyEnableFreeMayTrain;
	/** @var bool|null */
	public $privacyEnableInputOutputLogging;
	/** @var bool|null */
	public $privacyEnablePaidMayTrain;
	/** @var bool|null */
	public $privacyZdrOnly;
	/** @var string|null */
	public $promptInjectionAction;
	/** @var bool|null */
	public $promptInjectionEnabled;
	/** @var bool|null */
	public $providerRestrictionEnforceAllowed;
	/** @var string|null */
	public $providerRestrictionMode;
	/** @var array|null */
	public $providerRestrictionProviderIds;
	/** @var string|null */
	public $sensitiveInfoDefaultAction;
	/** @var bool|null */
	public $sensitiveInfoEnabled;
	/** @var array|null */
	public $sensitiveInfoRules;
}

class GuardrailDeleteResponse
{
	/** @var string */
	public $deleted;
}

class GuardrailDetailResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class GuardrailKeyAddResponse
{
	/** @var int */
	public $added_count;
	/** @var array */
	public $data;
}

class GuardrailKeyAssignment
{
	/** @var string|null */
	public $created_at;
	/** @var string */
	public $key_id;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string|null */
	public $status;
}

class GuardrailKeyIdsReplaceRequest
{
	/** @var array */
	public $key_ids;
}

class GuardrailKeyIdsRequest
{
	/** @var array */
	public $key_ids;
}

class GuardrailKeyListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class GuardrailKeySetResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class GuardrailListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class GuardrailMemberAddResponse
{
	/** @var int */
	public $added_count;
	/** @var array */
	public $data;
}

class GuardrailMemberAssignment
{
	/** @var string|null */
	public $display_name;
	/** @var string|null */
	public $joined_at;
	/** @var string|null */
	public $role;
	/** @var string */
	public $user_id;
}

class GuardrailMemberListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class GuardrailPolicyInput
{
	/** @var array|null */
	public $allowedApiModelIds;
	/** @var array<string, mixed>|null */
	public $budgets;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $modelRestrictionMode;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $privacyEnableFreeMayPublishPrompts;
	/** @var bool|null */
	public $privacyEnableFreeMayTrain;
	/** @var bool|null */
	public $privacyEnableInputOutputLogging;
	/** @var bool|null */
	public $privacyEnablePaidMayTrain;
	/** @var bool|null */
	public $privacyZdrOnly;
	/** @var string|null */
	public $promptInjectionAction;
	/** @var bool|null */
	public $promptInjectionEnabled;
	/** @var bool|null */
	public $providerRestrictionEnforceAllowed;
	/** @var string|null */
	public $providerRestrictionMode;
	/** @var array|null */
	public $providerRestrictionProviderIds;
	/** @var string|null */
	public $sensitiveInfoDefaultAction;
	/** @var bool|null */
	public $sensitiveInfoEnabled;
	/** @var array|null */
	public $sensitiveInfoRules;
}

class GuardrailRemoveResponse
{
	/** @var int */
	public $removed_count;
}

class GuardrailResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class GuardrailUpdateRequest
{
	/** @var array|null */
	public $allowedApiModelIds;
	/** @var array<string, mixed>|null */
	public $budgets;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $modelRestrictionMode;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $privacyEnableFreeMayPublishPrompts;
	/** @var bool|null */
	public $privacyEnableFreeMayTrain;
	/** @var bool|null */
	public $privacyEnableInputOutputLogging;
	/** @var bool|null */
	public $privacyEnablePaidMayTrain;
	/** @var bool|null */
	public $privacyZdrOnly;
	/** @var string|null */
	public $promptInjectionAction;
	/** @var bool|null */
	public $promptInjectionEnabled;
	/** @var bool|null */
	public $providerRestrictionEnforceAllowed;
	/** @var string|null */
	public $providerRestrictionMode;
	/** @var array|null */
	public $providerRestrictionProviderIds;
	/** @var string|null */
	public $sensitiveInfoDefaultAction;
	/** @var bool|null */
	public $sensitiveInfoEnabled;
	/** @var array|null */
	public $sensitiveInfoRules;
}

class GuardrailUserIdsRequest
{
	/** @var array */
	public $user_ids;
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
	public $resolution;
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
	public $resolution;
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

class ManagementKeyCollectionResponse
{
	/** @var array */
	public $data;
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

class ManagementKeyRuntime
{
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var int|null */
	public $daily_limit_cost_nanos;
	/** @var int|null */
	public $daily_limit_requests;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $id;
	/** @var string|null */
	public $last_used_at;
	/** @var int|null */
	public $monthly_limit_cost_nanos;
	/** @var int|null */
	public $monthly_limit_requests;
	/** @var string */
	public $name;
	/** @var string */
	public $prefix;
	/** @var array */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var int|null */
	public $weekly_limit_cost_nanos;
	/** @var int|null */
	public $weekly_limit_requests;
	/** @var string */
	public $workspace_id;
}

class ManagementKeyRuntimeCreated
{
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var int|null */
	public $daily_limit_cost_nanos;
	/** @var int|null */
	public $daily_limit_requests;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $id;
	/** @var string */
	public $key;
	/** @var string|null */
	public $last_used_at;
	/** @var int|null */
	public $monthly_limit_cost_nanos;
	/** @var int|null */
	public $monthly_limit_requests;
	/** @var string */
	public $name;
	/** @var string */
	public $prefix;
	/** @var array */
	public $scopes;
	/** @var bool|null */
	public $soft_blocked;
	/** @var string */
	public $status;
	/** @var string|null */
	public $updated_at;
	/** @var int|null */
	public $weekly_limit_cost_nanos;
	/** @var int|null */
	public $weekly_limit_requests;
	/** @var string */
	public $workspace_id;
}

class ManagementKeyRuntimeCreateRequest
{
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $name;
	/** @var bool|null */
	public $paused;
	/** @var string|array|null */
	public $scopes;
	/** @var string|null */
	public $template;
}

class ManagementKeyRuntimeCreateResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ManagementKeyRuntimeDeleteResponse
{
	/** @var string */
	public $deleted;
}

class ManagementKeyRuntimeResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ManagementKeyRuntimeUpdateRequest
{
	/** @var int|null */
	public $dailyCostNanos;
	/** @var int|null */
	public $dailyRequests;
	/** @var string|null */
	public $expires_at;
	/** @var int|null */
	public $monthlyCostNanos;
	/** @var int|null */
	public $monthlyRequests;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $paused;
	/** @var string|array|null */
	public $scopes;
	/** @var bool|null */
	public $softBlocked;
	/** @var string|null */
	public $template;
	/** @var int|null */
	public $weeklyCostNanos;
	/** @var int|null */
	public $weeklyRequests;
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
	/** @var array */
	public $aliases;
	/** @var array<string, mixed> */
	public $availability;
	/** @var string */
	public $base_model_id;
	/** @var array<string, mixed> */
	public $capabilities;
	/** @var string */
	public $description;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $lifecycle;
	/** @var array<string, mixed> */
	public $limits;
	/** @var array<string, mixed> */
	public $modalities;
	/** @var string */
	public $name;
	/** @var array */
	public $offers;
	/** @var array<string, mixed>|null */
	public $organization;
	/** @var array<string, mixed> */
	public $pricing;
	/** @var string */
	public $variant;
	/** @var array<string, mixed> */
	public $variants;
}

class ModelAvailability
{
	/** @var int */
	public $active_provider_count;
	/** @var int */
	public $coming_soon_provider_count;
	/** @var int */
	public $inactive_provider_count;
	/** @var int */
	public $provider_count;
	/** @var string */
	public $status;
}

class ModelEndpointCapability
{
	/** @var array<string, mixed> */
	public $capabilities;
	/** @var string */
	public $capability_id;
	/** @var string */
	public $collection;
	/** @var array<string, mixed> */
	public $effective;
	/** @var string */
	public $endpoint;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $modalities;
	/** @var string|null */
	public $model;
	/** @var array<string, mixed> */
	public $pricing;
	/** @var array<string, mixed> */
	public $provider;
	/** @var string */
	public $public_path;
	/** @var bool */
	public $routable;
	/** @var array<string, mixed> */
	public $routing;
	/** @var string */
	public $status;
	/** @var string */
	public $status_reason;
}

class ModelEndpointsResponse
{
	/** @var string */
	public $availability_mode;
	/** @var string */
	public $description;
	/** @var array */
	public $endpoints;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $modalities;
	/** @var string */
	public $name;
	/** @var string */
	public $ok;
	/** @var array<string, mixed>|null */
	public $organization;
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
	/** @var array|null */
	public $input_modalities;
	/** @var bool */
	public $is_active_gateway;
	/** @var string */
	public $model_routing_status;
	/** @var array|null */
	public $output_modalities;
	/** @var array */
	public $params;
	/** @var array<string, mixed>|null */
	public $params_detail;
	/** @var string|null */
	public $provider_model_slug;
	/** @var string */
	public $provider_routing_status;
	/** @var string */
	public $provider_status;
	/** @var array|null */
	public $supported_parameters;
	/** @var array<string, mixed>|null */
	public $supported_parameters_detail;
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
	/** @var array<string, mixed>|null */
	public $meta;
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
	/** @var string|null */
	public $audio_base64;
	/** @var string|null */
	public $audio_url;
	/** @var string */
	public $id;
	/** @var string */
	public $model;
	/** @var string|null */
	public $nativeResponseId;
	/** @var string */
	public $object;
	/** @var array|null */
	public $output;
	/** @var string */
	public $provider;
	/** @var mixed|null */
	public $result;
	/** @var string */
	public $status;
	/** @var array<string, mixed>|null */
	public $usage;
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

class OAuthClient
{
	/** @var int|null */
	public $active_authorizations;
	/** @var array|null */
	public $allowed_scopes;
	/** @var string */
	public $client_id;
	/** @var string */
	public $client_type;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $homepage_url;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $logo_url;
	/** @var string */
	public $name;
	/** @var string|null */
	public $privacy_policy_url;
	/** @var array */
	public $redirect_uris;
	/** @var int|null */
	public $requests_last_30d;
	/** @var string */
	public $status;
	/** @var string|null */
	public $terms_of_service_url;
	/** @var int|null */
	public $total_authorizations;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class OAuthClientCreateRequest
{
	/** @var array|null */
	public $allowed_scopes;
	/** @var string|null */
	public $client_type;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $homepage_url;
	/** @var string|null */
	public $logo_url;
	/** @var string */
	public $name;
	/** @var string|null */
	public $privacy_policy_url;
	/** @var array */
	public $redirect_uris;
	/** @var string|null */
	public $terms_of_service_url;
}

class OAuthClientCreateResponse
{
	/** @var int|null */
	public $active_authorizations;
	/** @var array|null */
	public $allowed_scopes;
	/** @var string */
	public $client_id;
	/** @var string|null */
	public $client_secret;
	/** @var string */
	public $client_type;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $homepage_url;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $logo_url;
	/** @var string */
	public $name;
	/** @var string|null */
	public $privacy_policy_url;
	/** @var array */
	public $redirect_uris;
	/** @var int|null */
	public $requests_last_30d;
	/** @var string */
	public $status;
	/** @var string|null */
	public $terms_of_service_url;
	/** @var int|null */
	public $total_authorizations;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class OAuthClientDeleteResponse
{
	/** @var string */
	public $client_id;
	/** @var string */
	public $message;
}

class OAuthClientInput
{
	/** @var array|null */
	public $allowed_scopes;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $homepage_url;
	/** @var string|null */
	public $logo_url;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $privacy_policy_url;
	/** @var array|null */
	public $redirect_uris;
	/** @var string|null */
	public $terms_of_service_url;
}

class OAuthClientListResponse
{
	/** @var array */
	public $data;
	/** @var array<string, mixed> */
	public $pagination;
}

class OAuthClientSecretResponse
{
	/** @var string */
	public $client_id;
	/** @var string */
	public $client_secret;
	/** @var string */
	public $message;
}

class OAuthClientUpdateRequest
{
	/** @var array|null */
	public $allowed_scopes;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $homepage_url;
	/** @var string|null */
	public $logo_url;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $privacy_policy_url;
	/** @var array|null */
	public $redirect_uris;
	/** @var string|null */
	public $terms_of_service_url;
}

class ObservabilityDestination
{
	/** @var bool */
	public $configured;
	/** @var string|null */
	public $created_at;
	/** @var bool */
	public $enabled;
	/** @var string */
	public $group_join;
	/** @var string */
	public $id;
	/** @var bool|null */
	public $include_cost_metadata;
	/** @var bool|null */
	public $include_generation_metadata;
	/** @var bool|null */
	public $include_identity_metadata;
	/** @var bool|null */
	public $include_request_context;
	/** @var array */
	public $key_filters;
	/** @var string */
	public $name;
	/** @var bool */
	public $privacy_mode;
	/** @var array */
	public $rule_groups;
	/** @var float */
	public $sampling_rate;
	/** @var string */
	public $type;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class ObservabilityDestinationCreateRequest
{
	/** @var array<string, mixed> */
	public $config;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $group_join;
	/** @var bool|null */
	public $include_cost_metadata;
	/** @var bool|null */
	public $include_generation_metadata;
	/** @var bool|null */
	public $include_identity_metadata;
	/** @var bool|null */
	public $include_request_context;
	/** @var array|null */
	public $key_filters;
	/** @var string */
	public $name;
	/** @var bool|null */
	public $privacy_mode;
	/** @var array|null */
	public $rule_groups;
	/** @var float|null */
	public $sampling_rate;
	/** @var string */
	public $type;
}

class ObservabilityDestinationListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class ObservabilityDestinationPolicyInput
{
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $group_join;
	/** @var bool|null */
	public $include_cost_metadata;
	/** @var bool|null */
	public $include_generation_metadata;
	/** @var bool|null */
	public $include_identity_metadata;
	/** @var bool|null */
	public $include_request_context;
	/** @var array|null */
	public $key_filters;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $privacy_mode;
	/** @var array|null */
	public $rule_groups;
	/** @var float|null */
	public $sampling_rate;
}

class ObservabilityDestinationResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ObservabilityDestinationType { }

class ObservabilityDestinationUpdateRequest
{
	/** @var array<string, mixed>|null */
	public $config;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $group_join;
	/** @var bool|null */
	public $include_cost_metadata;
	/** @var bool|null */
	public $include_generation_metadata;
	/** @var bool|null */
	public $include_identity_metadata;
	/** @var bool|null */
	public $include_request_context;
	/** @var array|null */
	public $key_filters;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $privacy_mode;
	/** @var array|null */
	public $rule_groups;
	/** @var float|null */
	public $sampling_rate;
}

class ObservabilityKeyFilter
{
	/** @var string */
	public $key_id;
	/** @var string */
	public $mode;
}

class ObservabilityLoggingPolicy
{
	/** @var string */
	public $billing_status;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $grace_until;
	/** @var bool */
	public $include_provider_payloads;
	/** @var int */
	public $price_per_million_units_nanos;
	/** @var int */
	public $retention_days;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class ObservabilityLoggingPolicyResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ObservabilityLoggingPolicyUpdateRequest
{
	/** @var bool|null */
	public $enabled;
	/** @var bool|null */
	public $include_provider_payloads;
	/** @var int|null */
	public $retention_days;
}

class ObservabilityRule
{
	/** @var string */
	public $condition;
	/** @var string */
	public $field;
	/** @var string|null */
	public $value;
}

class ObservabilityRuleGroup
{
	/** @var string */
	public $match;
	/** @var array */
	public $rules;
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

class ParseBlock { }

class ParseBoundingBox
{
	/** @var float */
	public $bottom_right_x;
	/** @var float */
	public $bottom_right_y;
	/** @var float */
	public $top_left_x;
	/** @var float */
	public $top_left_y;
}

class ParseImage
{
	/** @var array<string, mixed> */
	public $bounding_box;
	/** @var array<string, mixed> */
	public $bounding_box_normalized;
	/** @var string */
	public $category;
	/** @var string */
	public $description;
	/** @var string */
	public $id;
}

class ParsePage { }

class ParseRequest
{
	/** @var array<string, mixed>|null */
	public $debug;
	/** @var array<string, mixed> */
	public $document;
	/** @var bool|null */
	public $echo_upstream_request;
	/** @var string */
	public $model;
	/** @var string|null */
	public $output_format;
	/** @var array<string, mixed>|null */
	public $provider;
	/** @var array<string, mixed>|null */
	public $routing;
}

class ParseResponse
{
	/** @var string */
	public $id;
	/** @var array<string, mixed>|null */
	public $meta;
	/** @var string */
	public $model;
	/** @var string */
	public $object;
	/** @var array */
	public $pages;
	/** @var string */
	public $provider;
	/** @var array<string, mixed>|null */
	public $usage;
}

class Preset
{
	/** @var string|null */
	public $active_version_id;
	/** @var array<string, mixed> */
	public $config;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string|null */
	public $description;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var string */
	public $slug;
	/** @var string|null */
	public $source_preset_id;
	/** @var string|null */
	public $source_preset_version_id;
	/** @var string|null */
	public $updated_at;
	/** @var string|null */
	public $upstream_version_id;
	/** @var string */
	public $versioning_method;
	/** @var string */
	public $visibility;
	/** @var string */
	public $workspace_id;
}

class PresetConfig
{
}

class PresetCreateRequest
{
	/** @var array<string, mixed>|null */
	public $config;
	/** @var string|null */
	public $description;
	/** @var string */
	public $name;
	/** @var string|null */
	public $slug;
	/** @var string|null */
	public $versioning_method;
	/** @var string|null */
	public $visibility;
}

class PresetCreateResponse
{
	/** @var string */
	public $canonical_model;
	/** @var array<string, mixed> */
	public $data;
}

class PresetForkRequest
{
	/** @var string|null */
	public $source_version_id;
}

class PresetListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class PresetPublisher
{
	/** @var string|null */
	public $handle;
	/** @var string */
	public $workspace_id;
}

class PresetPublisherResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PresetPublisherUpdateRequest
{
	/** @var string */
	public $handle;
}

class PresetResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PresetTestRun
{
	/** @var string|null */
	public $baseline_preset_id;
	/** @var string|null */
	public $completed_at;
	/** @var array<string, mixed> */
	public $config;
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by_user_id;
	/** @var string|null */
	public $dataset_name;
	/** @var string|null */
	public $description;
	/** @var string */
	public $id;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $started_at;
	/** @var string */
	public $status;
	/** @var array<string, mixed> */
	public $summary;
	/** @var string */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class PresetTestRunCreateRequest
{
	/** @var string|null */
	public $baseline_preset_id;
	/** @var string|null */
	public $completed_at;
	/** @var array<string, mixed>|null */
	public $config;
	/** @var string|null */
	public $dataset_name;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $preset_id;
	/** @var string|null */
	public $started_at;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $summary;
}

class PresetTestRunDetailResponse
{
	/** @var array<string, mixed> */
	public $data;
	/** @var array<string, mixed>|null */
	public $feedback_summary;
}

class PresetTestRunListResponse
{
	/** @var array */
	public $data;
}

class PresetTestRunResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PresetTestRunUpdateRequest
{
	/** @var string|null */
	public $completed_at;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $started_at;
	/** @var string|null */
	public $status;
	/** @var array<string, mixed>|null */
	public $summary;
}

class PresetUpdateRequest
{
	/** @var array<string, mixed>|null */
	public $config;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $name;
	/** @var bool|null */
	public $replace_config;
	/** @var string|null */
	public $slug;
	/** @var string|null */
	public $versioning_method;
	/** @var string|null */
	public $visibility;
}

class PresetUpstreamApplyRequest
{
	/** @var string */
	public $version_id;
}

class PresetUpstreamApplyResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PresetVersion
{
	/** @var array<string, mixed> */
	public $config;
	/** @var string */
	public $created_at;
	/** @var string */
	public $created_by;
	/** @var string|null */
	public $description;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var string */
	public $preset_id;
	/** @var string|null */
	public $release_notes;
	/** @var string */
	public $slug;
	/** @var string */
	public $version_label;
	/** @var int */
	public $version_number;
	/** @var string */
	public $versioning_method;
	/** @var string */
	public $visibility;
}

class PresetVersioningMethod { }

class PresetVersionListResponse
{
	/** @var array */
	public $data;
}

class PresetVersionPublishRequest
{
	/** @var string|null */
	public $release_notes;
	/** @var string|null */
	public $version_label;
}

class PresetVersionResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PresetVisibility { }

class PrivateModel
{
	/** @var string */
	public $base_url;
	/** @var string|null */
	public $catalog_model_id;
	/** @var int|null */
	public $context_length;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var string|null */
	public $credential_prefix;
	/** @var string|null */
	public $credential_suffix;
	/** @var string|null */
	public $custom_provider_name;
	/** @var string|null */
	public $custom_provider_url;
	/** @var string|null */
	public $description;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $host_provider_id;
	/** @var string */
	public $id;
	/** @var array|null */
	public $input_modalities;
	/** @var string|null */
	public $local_slug;
	/** @var int|null */
	public $max_output_tokens;
	/** @var string */
	public $model_id;
	/** @var string */
	public $name;
	/** @var array|null */
	public $output_modalities;
	/** @var string|null */
	public $routing_policy;
	/** @var bool */
	public $supports_responses;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $upstream_model_id;
	/** @var string */
	public $workspace_id;
}

class PrivateModelCreateRequest
{
	/** @var string */
	public $base_url;
	/** @var int|null */
	public $context_length;
	/** @var string */
	public $credential;
	/** @var string|null */
	public $custom_provider_name;
	/** @var string|null */
	public $custom_provider_url;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $host_provider_id;
	/** @var int|null */
	public $max_output_tokens;
	/** @var string */
	public $model_reference;
	/** @var string */
	public $name;
	/** @var string|null */
	public $routing_policy;
	/** @var bool|null */
	public $supports_responses;
	/** @var string */
	public $upstream_model_id;
}

class PrivateModelDeleteResponse
{
	/** @var bool */
	public $deleted;
}

class PrivateModelListResponse
{
	/** @var array */
	public $data;
}

class PrivateModelResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class PrivateModelUpdateRequest
{
	/** @var string|null */
	public $base_url;
	/** @var int|null */
	public $context_length;
	/** @var string|null */
	public $credential;
	/** @var string|null */
	public $custom_provider_name;
	/** @var string|null */
	public $custom_provider_url;
	/** @var string|null */
	public $description;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $host_provider_id;
	/** @var int|null */
	public $max_output_tokens;
	/** @var string|null */
	public $model_reference;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $routing_policy;
	/** @var bool|null */
	public $supports_responses;
	/** @var string|null */
	public $upstream_model_id;
}

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

class ProviderCredential
{
	/** @var array|null */
	public $allowed_api_key_ids;
	/** @var array|null */
	public $allowed_model_slugs;
	/** @var bool|null */
	public $always_use;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var bool */
	public $disabled;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $error_message;
	/** @var string */
	public $id;
	/** @var bool */
	public $is_fallback;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $last_verified_at;
	/** @var string */
	public $name;
	/** @var string|null */
	public $prefix;
	/** @var string */
	public $provider_id;
	/** @var string */
	public $routing_mode;
	/** @var int */
	public $sort_order;
	/** @var string|null */
	public $suffix;
	/** @var string|null */
	public $verification_status;
	/** @var string */
	public $workspace_id;
}

class ProviderCredentialCreateRequest
{
	/** @var array|null */
	public $allowed_api_key_ids;
	/** @var array|null */
	public $allowed_models;
	/** @var bool|null */
	public $enabled;
	/** @var string */
	public $key;
	/** @var string */
	public $name;
	/** @var string */
	public $provider;
	/** @var string|null */
	public $routing_mode;
}

class ProviderCredentialDeleteResponse
{
	/** @var bool */
	public $deleted;
}

class ProviderCredentialListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class ProviderCredentialReorderRequest
{
	/** @var array */
	public $key_ids;
	/** @var string */
	public $provider;
	/** @var string */
	public $routing_mode;
}

class ProviderCredentialReorderResponse
{
	/** @var bool */
	public $reordered;
}

class ProviderCredentialResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class ProviderCredentialRoutingMode { }

class ProviderCredentialUpdateRequest
{
	/** @var array|null */
	public $allowed_api_key_ids;
	/** @var array|null */
	public $allowed_models;
	/** @var bool|null */
	public $enabled;
	/** @var string|null */
	public $key;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $routing_mode;
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
	public $cost_cents;
	/** @var float|null */
	public $cost_nanos;
	/** @var int|null */
	public $created;
	/** @var string|null */
	public $currency;
	/** @var string|null */
	public $finish_reason;
	/** @var string|null */
	public $id;
	/** @var array<string, mixed>|null */
	public $meta;
	/** @var string|null */
	public $model;
	/** @var string|null */
	public $nativeResponseId;
	/** @var string|null */
	public $object;
	/** @var array|null */
	public $output;
	/** @var array|null */
	public $output_items;
	/** @var array|null */
	public $pricing_lines;
	/** @var string|null */
	public $provider;
	/** @var string|null */
	public $provider_id;
	/** @var string|null */
	public $role;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $stop_reason;
	/** @var string|null */
	public $type;
	/** @var array<string, mixed>|null */
	public $usage;
}

class SearchModelsToolDefinition
{
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string */
	public $type;
}

class ServerToolUsage
{
	/** @var int|null */
	public $advisor_requests;
	/** @var int|null */
	public $apply_patch_requests;
	/** @var int|null */
	public $datetime_requests;
	/** @var int|null */
	public $fusion_requests;
	/** @var int|null */
	public $image_generation_requests;
	/** @var int|null */
	public $search_models_requests;
	/** @var int|null */
	public $subagent_requests;
	/** @var int|null */
	public $web_fetch_requests;
	/** @var int|null */
	public $web_search_requests;
}

class SubagentToolDefinition
{
	/** @var array<string, mixed>|null */
	public $parameters;
	/** @var string */
	public $type;
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

class UpdatedResponse
{
	/** @var array<string, mixed> */
	public $data;
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
	/** @var array|null */
	public $frame_images;
	/** @var bool|null */
	public $generate_audio;
	/** @var float|null */
	public $input_audio_duration;
	/** @var array|null */
	public $input_references;
	/** @var float|null */
	public $input_video_duration;
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
	public $provider_options;
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

class VideoInputReference { }

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

class WebhookEndpoint
{
	/** @var string|null */
	public $createdAt;
	/** @var string|null */
	public $createdBy;
	/** @var string|null */
	public $deletedAt;
	/** @var array */
	public $events;
	/** @var bool */
	public $hasSecret;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var string */
	public $status;
	/** @var string|null */
	public $updatedAt;
	/** @var string */
	public $url;
	/** @var string */
	public $workspaceId;
}

class WebhookEndpointCreateRequest
{
	/** @var array|null */
	public $events;
	/** @var string|null */
	public $name;
	/** @var string */
	public $url;
}

class WebhookEndpointDeleteResponse
{
	/** @var string */
	public $deleted;
	/** @var string */
	public $id;
	/** @var string */
	public $object;
}

class WebhookEndpointInput
{
	/** @var array|null */
	public $events;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $url;
}

class WebhookEndpointListResponse
{
	/** @var array */
	public $data;
	/** @var string */
	public $object;
}

class WebhookEndpointSecretResponse
{
	/** @var string|null */
	public $createdAt;
	/** @var string|null */
	public $createdBy;
	/** @var string|null */
	public $deletedAt;
	/** @var array */
	public $events;
	/** @var bool */
	public $hasSecret;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var string */
	public $signing_secret;
	/** @var string */
	public $status;
	/** @var string|null */
	public $updatedAt;
	/** @var string */
	public $url;
	/** @var string */
	public $workspaceId;
}

class WebhookEndpointUpdateRequest
{
	/** @var array|null */
	public $events;
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $status;
	/** @var string|null */
	public $url;
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

class WorkspaceApp
{
	/** @var string */
	public $app_key;
	/** @var string|null */
	public $category;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $docs_url;
	/** @var string */
	public $id;
	/** @var string|null */
	public $image_url;
	/** @var bool */
	public $is_active;
	/** @var bool */
	public $is_managed;
	/** @var bool */
	public $is_public;
	/** @var string|null */
	public $last_seen;
	/** @var string */
	public $title;
	/** @var string|null */
	public $url;
}

class WorkspaceAppListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $limit;
	/** @var int */
	public $offset;
	/** @var int */
	public $total_count;
}

class WorkspaceAppMergeRequest
{
	/** @var string */
	public $target_app_id;
}

class WorkspaceAppMergeResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceAppResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceAppUpdateRequest
{
	/** @var string|null */
	public $category;
	/** @var string|null */
	public $docs_url;
	/** @var string|null */
	public $image_url;
	/** @var bool|null */
	public $is_active;
	/** @var bool|null */
	public $is_public;
	/** @var string|null */
	public $title;
	/** @var string|null */
	public $url;
}

class WorkspaceAssignableRole { }

class WorkspaceAuditEvent
{
	/** @var string */
	public $action;
	/** @var array<string, mixed>|null */
	public $actor;
	/** @var string|null */
	public $actor_user_id;
	/** @var string */
	public $created_at;
	/** @var string */
	public $id;
	/** @var array<string, mixed> */
	public $metadata;
	/** @var string|null */
	public $request_id;
	/** @var string */
	public $target_id;
	/** @var string|null */
	public $target_name;
	/** @var string */
	public $target_type;
	/** @var string */
	public $workspace_id;
}

class WorkspaceAuditEventActor
{
	/** @var string|null */
	public $display_name;
	/** @var string|null */
	public $email;
}

class WorkspaceAuditEventLimits
{
	/** @var int|null */
	public $dailyCostNanos;
	/** @var int|null */
	public $dailyRequests;
	/** @var int|null */
	public $monthlyCostNanos;
	/** @var int|null */
	public $monthlyRequests;
	/** @var bool|null */
	public $softBlocked;
	/** @var int|null */
	public $weeklyCostNanos;
	/** @var int|null */
	public $weeklyRequests;
}

class WorkspaceAuditEventListResponse
{
	/** @var array */
	public $data;
	/** @var bool */
	public $has_more;
	/** @var string|null */
	public $next_cursor;
}

class WorkspaceAuditEventMetadata
{
	/** @var string|null */
	public $accessTemplate;
	/** @var array|null */
	public $changedFields;
	/** @var string|null */
	public $expiresAt;
	/** @var array<string, mixed>|null */
	public $limits;
	/** @var string|null */
	public $prefix;
	/** @var string|null */
	public $previousKeyExpiresAt;
	/** @var string|null */
	public $replacementKeyId;
	/** @var string|null */
	public $replacementKeyName;
	/** @var string|null */
	public $status;
}

class WorkspaceAutoTopUpSettings
{
	/** @var int */
	public $amount_nanos;
	/** @var int */
	public $balance_threshold_nanos;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $payment_method_id;
}

class WorkspaceAutoTopUpUpdate
{
	/** @var int|null */
	public $amount_nanos;
	/** @var int|null */
	public $balance_threshold_nanos;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $payment_method_id;
}

class WorkspaceBudget
{
	/** @var string */
	public $created_at;
	/** @var string|null */
	public $created_by;
	/** @var bool */
	public $exceeded;
	/** @var string */
	public $id;
	/** @var string */
	public $interval;
	/** @var float */
	public $limit;
	/** @var int */
	public $limit_nanos;
	/** @var float */
	public $remaining;
	/** @var int */
	public $remaining_nanos;
	/** @var string|null */
	public $reset_at;
	/** @var string */
	public $updated_at;
	/** @var float */
	public $usage;
	/** @var int */
	public $usage_nanos;
	/** @var string|null */
	public $window_start;
	/** @var string */
	public $workspace_id;
}

class WorkspaceBudgetDeleteResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceBudgetInput
{
	/** @var string */
	public $interval;
	/** @var float */
	public $limit;
}

class WorkspaceBudgetInterval { }

class WorkspaceBudgetListResponse
{
	/** @var array */
	public $data;
}

class WorkspaceBudgetResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceBudgetUpdateInput
{
	/** @var string|null */
	public $interval;
	/** @var float|null */
	public $limit;
}

class WorkspaceCreateRequest
{
	/** @var string */
	public $name;
	/** @var string|null */
	public $slug;
}

class WorkspaceDepartment
{
	/** @var string|null */
	public $color;
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $directory_name;
	/** @var string|null */
	public $icon;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var bool|null */
	public $name_overridden;
	/** @var string|null */
	public $source_id;
	/** @var string|null */
	public $source_type;
	/** @var string|null */
	public $updated_at;
}

class WorkspaceDepartmentCreateRequest
{
	/** @var string|null */
	public $color;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $icon;
	/** @var string */
	public $name;
}

class WorkspaceDepartmentInput
{
	/** @var string|null */
	public $color;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $icon;
	/** @var string|null */
	public $name;
}

class WorkspaceDepartmentListResponse
{
	/** @var array */
	public $data;
}

class WorkspaceDepartmentMember
{
	/** @var string */
	public $department_id;
	/** @var bool */
	public $is_primary;
	/** @var string */
	public $position;
	/** @var string */
	public $user_id;
}

class WorkspaceDepartmentMemberRequest
{
	/** @var string|null */
	public $position;
	/** @var bool|null */
	public $primary;
}

class WorkspaceDepartmentMemberResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceDepartmentResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceDepartmentUpdateRequest
{
	/** @var string|null */
	public $color;
	/** @var string|null */
	public $description;
	/** @var string|null */
	public $icon;
	/** @var string|null */
	public $name;
}

class WorkspaceDirectoryMember
{
	/** @var string */
	public $access_source;
	/** @var array<string, mixed>|null */
	public $department;
	/** @var bool */
	public $department_override_enabled;
	/** @var string|null */
	public $department_override_id;
	/** @var string */
	public $department_source;
	/** @var string|null */
	public $directory_department;
	/** @var string */
	public $display_name;
	/** @var string */
	public $effective_role;
	/** @var string|null */
	public $email;
	/** @var string|null */
	public $joined_at;
	/** @var string|null */
	public $role_override;
	/** @var string */
	public $status;
	/** @var string */
	public $user_id;
	/** @var string */
	public $workspace_role;
}

class WorkspaceDirectoryMemberUpdateRequest
{
	/** @var string|null */
	public $access_role;
	/** @var string|null */
	public $department_id;
	/** @var string|null */
	public $department_mode;
	/** @var string|null */
	public $department_position;
}

class WorkspaceDirectoryResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceGroupMapping
{
	/** @var string */
	public $access_role;
	/** @var string|null */
	public $created_at;
	/** @var string */
	public $department_id;
	/** @var string */
	public $department_position;
	/** @var string */
	public $id;
	/** @var string */
	public $scim_group_id;
	/** @var string|null */
	public $updated_at;
}

class WorkspaceGroupMappingCreateRequest
{
	/** @var string|null */
	public $access_role;
	/** @var string */
	public $department_id;
	/** @var string|null */
	public $department_position;
	/** @var string */
	public $scim_group_id;
}

class WorkspaceGroupMappingListResponse
{
	/** @var array */
	public $data;
}

class WorkspaceGroupMappingResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceGroupMappingUpdateRequest
{
	/** @var string|null */
	public $access_role;
	/** @var string|null */
	public $department_position;
}

class WorkspaceInvite
{
	/** @var string|null */
	public $created_at;
	/** @var string */
	public $creator_user_id;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $id;
	/** @var int|null */
	public $max_uses;
	/** @var string */
	public $role;
	/** @var string|null */
	public $token_preview;
	/** @var int|null */
	public $uses_count;
	/** @var string */
	public $workspace_id;
}

class WorkspaceInviteCreateRequest
{
	/** @var int|null */
	public $expires_in_days;
	/** @var int|null */
	public $max_uses;
	/** @var string|null */
	public $role;
}

class WorkspaceInviteCreateResponse
{
	/** @var array<string, mixed> */
	public $data;
	/** @var string */
	public $token;
}

class WorkspaceInviteListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class WorkspaceJoinRequest
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $decided_at;
	/** @var string|null */
	public $decided_by;
	/** @var string */
	public $id;
	/** @var string|null */
	public $invite_id;
	/** @var string */
	public $requester_user_id;
	/** @var string */
	public $status;
	/** @var string */
	public $workspace_id;
}

class WorkspaceJoinRequestListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class WorkspaceJoinRequestResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceJoinRequestStatus { }

class WorkspaceListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class WorkspaceLowBalanceEmailSettings
{
	/** @var bool */
	public $enabled;
	/** @var float */
	public $threshold_usd;
}

class WorkspaceLowBalanceEmailUpdate
{
	/** @var bool */
	public $enabled;
	/** @var float|null */
	public $threshold_usd;
}

class WorkspaceMember
{
	/** @var string|null */
	public $display_name;
	/** @var string|null */
	public $joined_at;
	/** @var string */
	public $role;
	/** @var string */
	public $user_id;
	/** @var string */
	public $workspace_id;
}

class WorkspaceMemberAddResponse
{
	/** @var int */
	public $added_count;
	/** @var array */
	public $data;
}

class WorkspaceMemberBulkRequest
{
	/** @var string|null */
	public $role;
	/** @var array */
	public $user_ids;
}

class WorkspaceMemberListResponse
{
	/** @var array */
	public $data;
	/** @var int */
	public $total_count;
}

class WorkspaceMemberRemoveRequest
{
	/** @var array */
	public $user_ids;
}

class WorkspaceMemberRemoveResponse
{
	/** @var int */
	public $removed_count;
}

class WorkspaceMemberResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceMemberRoleUpdateRequest
{
	/** @var string */
	public $role;
}

class WorkspaceNotificationDestination
{
	/** @var string|null */
	public $created_at;
	/** @var string */
	public $id;
	/** @var string */
	public $name;
	/** @var string */
	public $status;
	/** @var string */
	public $target_preview;
	/** @var string */
	public $type;
	/** @var string|null */
	public $updated_at;
}

class WorkspaceNotificationDestinationCreateRequest
{
	/** @var string */
	public $name;
	/** @var string */
	public $target;
	/** @var string */
	public $type;
}

class WorkspaceNotificationDestinationListResponse
{
	/** @var array */
	public $data;
}

class WorkspaceNotificationDestinationResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceNotificationDestinationTestRequest
{
	/** @var string */
	public $target;
	/** @var string */
	public $type;
}

class WorkspaceNotificationDestinationType { }

class WorkspaceNotificationEmailPreferences
{
	/** @var bool */
	public $auto_top_up_failure;
	/** @var bool */
	public $model_deprecation;
	/** @var bool */
	public $payment_method_expiring;
}

class WorkspaceNotificationEmailPreferencesUpdate
{
	/** @var bool|null */
	public $auto_top_up_failure;
	/** @var bool|null */
	public $model_deprecation;
	/** @var bool|null */
	public $payment_method_expiring;
}

class WorkspaceNotificationEventKind { }

class WorkspaceNotificationRoute
{
	/** @var array */
	public $destination_ids;
	/** @var string */
	public $event_kind;
}

class WorkspaceNotificationRouteMap
{
	/** @var array */
	public $auto_top_up_failed;
	/** @var array */
	public $low_balance;
	/** @var array */
	public $model_deprecation;
	/** @var array */
	public $payment_method_expiring;
}

class WorkspaceNotificationRouteResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceNotificationRoutesResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceNotificationRouteUpdateRequest
{
	/** @var array */
	public $destination_ids;
}

class WorkspaceNotificationSettings
{
	/** @var array<string, mixed> */
	public $auto_top_up;
	/** @var array<string, mixed> */
	public $email_preferences;
	/** @var array<string, mixed> */
	public $low_balance_email;
}

class WorkspaceNotificationSettingsResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceNotificationSettingsUpdateRequest
{
	/** @var array<string, mixed>|null */
	public $auto_top_up;
	/** @var array<string, mixed>|null */
	public $email_preferences;
	/** @var array<string, mixed>|null */
	public $low_balance_email;
}

class WorkspaceNotificationTestResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceProviderRestrictionMode { }

class WorkspaceResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceRole { }

class WorkspaceRoutingMode { }

class WorkspaceScimAuditResponse
{
	/** @var array */
	public $data;
}

class WorkspaceScimEndpoint
{
	/** @var string|null */
	public $created_at;
	/** @var bool */
	public $enabled;
	/** @var string */
	public $id;
	/** @var string|null */
	public $updated_at;
}

class WorkspaceScimEndpointResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceScimEvent
{
	/** @var string|null */
	public $action;
	/** @var string|null */
	public $correlation_id;
	/** @var string|null */
	public $created_at;
	/** @var array<string, mixed>|null */
	public $detail;
	/** @var int|null */
	public $http_status;
	/** @var string|null */
	public $id;
	/** @var string|null */
	public $outcome;
	/** @var string|null */
	public $request_id;
	/** @var string|null */
	public $resource_id;
	/** @var string|null */
	public $resource_type;
	/** @var string|null */
	public $scim_type;
}

class WorkspaceScimResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceScimToken
{
	/** @var string|null */
	public $created_at;
	/** @var string|null */
	public $expires_at;
	/** @var string */
	public $id;
	/** @var string */
	public $label;
	/** @var string|null */
	public $last_used_at;
	/** @var string|null */
	public $revoked_at;
	/** @var string */
	public $token_prefix;
}

class WorkspaceScimTokenCreateRequest
{
	/** @var string|null */
	public $expires_at;
	/** @var string|null */
	public $label;
}

class WorkspaceScimTokenCreateResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceScimUpdateRequest
{
	/** @var bool */
	public $enabled;
}

class WorkspaceSettings
{
	/** @var bool|null */
	public $alpha_channel_enabled;
	/** @var bool|null */
	public $beta_channel_enabled;
	/** @var bool|null */
	public $byok_fallback_enabled;
	/** @var bool|null */
	public $io_logging_enabled;
	/** @var bool|null */
	public $io_logging_include_provider_payloads;
	/** @var bool|null */
	public $privacy_enable_free_may_publish_prompts;
	/** @var bool|null */
	public $privacy_enable_free_may_train;
	/** @var bool|null */
	public $privacy_enable_input_output_logging;
	/** @var bool|null */
	public $privacy_enable_paid_may_train;
	/** @var bool|null */
	public $privacy_zdr_only;
	/** @var bool|null */
	public $provider_restriction_enforce_allowed;
	/** @var mixed|null */
	public $provider_restriction_mode;
	/** @var array|null */
	public $provider_restriction_provider_ids;
	/** @var bool|null */
	public $response_healing_enabled;
	/** @var bool|null */
	public $response_healing_locked;
	/** @var string|null */
	public $response_healing_mode;
	/** @var mixed|null */
	public $routing_mode;
	/** @var string|null */
	public $updated_at;
	/** @var string */
	public $workspace_id;
}

class WorkspaceSettingsResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceSettingsUpdateRequest
{
	/** @var bool|null */
	public $alpha_channel_enabled;
	/** @var bool|null */
	public $beta_channel_enabled;
	/** @var bool|null */
	public $byok_fallback_enabled;
	/** @var bool|null */
	public $io_logging_enabled;
	/** @var bool|null */
	public $io_logging_include_provider_payloads;
	/** @var bool|null */
	public $privacy_enable_free_may_publish_prompts;
	/** @var bool|null */
	public $privacy_enable_free_may_train;
	/** @var bool|null */
	public $privacy_enable_input_output_logging;
	/** @var bool|null */
	public $privacy_enable_paid_may_train;
	/** @var bool|null */
	public $privacy_zdr_only;
	/** @var bool|null */
	public $provider_restriction_enforce_allowed;
	/** @var string|null */
	public $provider_restriction_mode;
	/** @var array|null */
	public $provider_restriction_provider_ids;
	/** @var bool|null */
	public $response_healing_enabled;
	/** @var bool|null */
	public $response_healing_locked;
	/** @var string|null */
	public $response_healing_mode;
	/** @var string|null */
	public $routing_mode;
}

class WorkspaceSsoResponse
{
	/** @var array<string, mixed> */
	public $data;
}

class WorkspaceSsoSettings
{
	/** @var array */
	public $domains;
	/** @var bool */
	public $enabled;
	/** @var string */
	public $enforced;
	/** @var string */
	public $mode;
	/** @var string|null */
	public $provider_identifier;
}

class WorkspaceSsoUpdateRequest
{
	/** @var array|null */
	public $domains;
	/** @var bool */
	public $enabled;
	/** @var string|null */
	public $enforced;
	/** @var string */
	public $mode;
	/** @var string|null */
	public $provider_identifier;
}

class WorkspaceUpdateRequest
{
	/** @var string|null */
	public $name;
	/** @var string|null */
	public $slug;
}
