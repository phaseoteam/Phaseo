<?php
declare(strict_types=1);

namespace AIStats\Gen;

class ActivityEntry
{
	public $cost_cents;
	public $endpoint;
	public $latency_ms;
	public $model;
	public $provider;
	public $request_id;
	public $timestamp;
	public $usage;
}

class AnthropicContentBlock
{
	public $cache_control;
	public $content;
	public $id;
	public $image_url;
	public $input;
	public $input_audio;
	public $name;
	public $source;
	public $text;
	public $tool_use_id;
	public $type;
	public $video_url;
}

class AnthropicContentBlockDeltaEvent
{
	public $data;
	public $event;
}

class AnthropicContentBlockStartEvent
{
	public $data;
	public $event;
}

class AnthropicContentBlockStopEvent
{
	public $data;
	public $event;
}

class AnthropicMessage
{
	public $content;
	public $role;
}

class AnthropicMessageDeltaEvent
{
	public $data;
	public $event;
}

class AnthropicMessagesRequest
{
	public $debug;
	public $max_tokens;
	public $messages;
	public $meta;
	public $metadata;
	public $modalities;
	public $model;
	public $provider;
	public $stop_sequences;
	public $stream;
	public $system;
	public $temperature;
	public $tool_choice;
	public $tools;
	public $top_k;
	public $top_p;
}

class AnthropicMessagesResponse
{
	public $content;
	public $debug;
	public $id;
	public $meta;
	public $model;
	public $role;
	public $stop_reason;
	public $stop_sequence;
	public $type;
	public $usage;
}

class AnthropicMessagesStreamEvent { }

class AnthropicMessageStartEvent
{
	public $data;
	public $event;
}

class AnthropicMessageStopEvent
{
	public $data;
	public $event;
}

class AnthropicTool
{
	public $description;
	public $input_schema;
	public $name;
}

class AnthropicUsage
{
	public $cache_creation;
	public $cache_creation_input_tokens;
	public $cache_read_input_tokens;
	public $input_tokens;
	public $output_tokens;
	public $server_tool_use;
	public $service_tier;
}

class AudioContentPart
{
	public $input_audio;
	public $type;
}

class AudioSpeechRequest
{
	public $debug;
	public $format;
	public $input;
	public $model;
	public $provider;
	public $voice;
}

class AudioTranscriptionRequest
{
	public $audio_b64;
	public $audio_url;
	public $debug;
	public $language;
	public $model;
	public $provider;
}

class AudioTranscriptionResponse
{
	public $text;
}

class AudioTranslationRequest
{
	public $audio_b64;
	public $audio_url;
	public $debug;
	public $language;
	public $model;
	public $prompt;
	public $provider;
	public $temperature;
}

class AudioTranslationResponse
{
	public $text;
}

class BatchRequest
{
	public $completion_window;
	public $debug;
	public $endpoint;
	public $input_file_id;
	public $metadata;
	public $provider;
}

class BatchRequestCounts
{
	public $completed;
	public $failed;
	public $total;
}

class BatchResponse
{
	public $cancelled_at;
	public $cancelling_at;
	public $completed_at;
	public $completion_window;
	public $created_at;
	public $endpoint;
	public $error_file_id;
	public $errors;
	public $expired_at;
	public $expires_at;
	public $failed_at;
	public $finalizing_at;
	public $id;
	public $in_progress_at;
	public $input_file_id;
	public $metadata;
	public $object;
	public $output_file_id;
	public $request_counts;
	public $status;
}

class BenchmarkId { }

class CacheControl
{
	public $cache;
	public $ttl;
	public $type;
}

class ChatChoice
{
	public $finish_reason;
	public $index;
	public $logprobs;
	public $message;
}

class ChatCompletionsRequest
{
	public $debug;
	public $frequency_penalty;
	public $logit_bias;
	public $logprobs;
	public $max_output_tokens;
	public $max_tool_calls;
	public $messages;
	public $meta;
	public $modalities;
	public $model;
	public $parallel_tool_calls;
	public $presence_penalty;
	public $provider;
	public $reasoning;
	public $response_format;
	public $seed;
	public $service_tier;
	public $stream;
	public $system;
	public $temperature;
	public $tool_choice;
	public $tools;
	public $top_k;
	public $top_logprobs;
	public $top_p;
	public $usage;
	public $user_id;
}

class ChatCompletionsResponse
{
	public $choices;
	public $created;
	public $debug;
	public $id;
	public $meta;
	public $model;
	public $nativeResponseId;
	public $object;
	public $service_tier;
	public $system_fingerprint;
	public $upstream_request;
	public $upstream_response;
	public $usage;
}

class ChatCompletionsStreamChoice
{
	public $delta;
	public $finish_reason;
	public $index;
	public $logprobs;
}

class ChatCompletionsStreamChunk
{
	public $choices;
	public $created;
	public $id;
	public $meta;
	public $model;
	public $nativeResponseId;
	public $object;
	public $service_tier;
	public $system_fingerprint;
	public $usage;
}

class ChatCompletionsStreamDelta
{
	public $content;
	public $reasoning_content;
	public $role;
	public $tool_calls;
}

class ChatCompletionsStreamEvent
{
	public $data;
	public $event;
}

class ChatMessage
{
	public $content;
	public $name;
	public $reasoning_content;
	public $role;
	public $tool_call_id;
	public $tool_calls;
}

class DebugOptions
{
	public $enabled;
	public $return_upstream_request;
	public $return_upstream_response;
	public $trace;
	public $trace_level;
}

class DebugResponse
{
	public $enabled;
	public $return_upstream_request;
	public $return_upstream_response;
	public $trace;
	public $trace_level;
}

class Embedding
{
	public $embedding;
	public $index;
	public $object;
}

class EmbeddingsRequest { }

class EmbeddingsResponse
{
	public $data;
	public $model;
	public $object;
	public $usage;
}

class ErrorResponse
{
	public $error;
	public $message;
	public $ok;
}

class FileResponse
{
	public $bytes;
	public $created_at;
	public $filename;
	public $id;
	public $object;
	public $purpose;
	public $status;
	public $status_details;
}

class FileUploadRequest
{
	public $file;
	public $purpose;
}

class GenerationResponse
{
	public $app_id;
	public $byok;
	public $cost_nanos;
	public $currency;
	public $endpoint;
	public $error_code;
	public $error_message;
	public $generation_ms;
	public $key_id;
	public $latency_ms;
	public $model_id;
	public $native_response_id;
	public $pricing_lines;
	public $provider;
	public $request_id;
	public $status_code;
	public $stream;
	public $success;
	public $team_id;
	public $throughput;
	public $usage;
}

class Image
{
	public $b64_json;
	public $revised_prompt;
	public $url;
}

class ImageContentPart
{
	public $image_url;
	public $type;
}

class ImageModerationInput
{
	public $image_url;
	public $type;
}

class ImagesEditRequest
{
	public $debug;
	public $image;
	public $mask;
	public $meta;
	public $model;
	public $n;
	public $prompt;
	public $provider;
	public $size;
	public $usage;
	public $user;
}

class ImagesEditResponse
{
	public $created;
	public $data;
}

class ImagesGenerationRequest
{
	public $debug;
	public $model;
	public $n;
	public $prompt;
	public $provider;
	public $quality;
	public $response_format;
	public $size;
	public $style;
	public $user;
}

class ImagesGenerationResponse
{
	public $created;
	public $data;
}

class InputImageContentPart
{
	public $image_url;
	public $type;
}

class InputTextContentPart
{
	public $cache_control;
	public $text;
	public $type;
}

class ListFilesResponse
{
	public $data;
	public $object;
}

class MessageContentPart { }

class Model
{
	public $aliases;
	public $deprecation_date;
	public $endpoints;
	public $input_types;
	public $model_id;
	public $name;
	public $organisation_colour;
	public $organisation_id;
	public $organisation_name;
	public $output_types;
	public $pricing;
	public $providers;
	public $release_date;
	public $retirement_date;
	public $status;
	public $supported_params;
	public $top_provider;
}

class ModelId { }

class ModelPricing
{
	public $meters;
	public $pricing_plan;
}

class ModelPricingMeter { }

class ModerationCategories
{
	public $harassment;
	public $harassment_threatening;
	public $hate;
	public $hate_threatening;
	public $self_harm;
	public $self_harm_instructions;
	public $self_harm_intent;
	public $sexual;
	public $sexual_minors;
	public $violence;
	public $violence_graphic;
}

class ModerationCategoryScores
{
	public $harassment;
	public $harassment_threatening;
	public $hate;
	public $hate_threatening;
	public $self_harm;
	public $self_harm_instructions;
	public $self_harm_intent;
	public $sexual;
	public $sexual_minors;
	public $violence;
	public $violence_graphic;
}

class ModerationResult
{
	public $categories;
	public $category_scores;
	public $flagged;
}

class ModerationsRequest
{
	public $debug;
	public $input;
	public $meta;
	public $model;
	public $provider;
}

class ModerationsResponse
{
	public $id;
	public $model;
	public $results;
}

class MusicGenerateRequest
{
	public $debug;
	public $duration;
	public $elevenlabs;
	public $format;
	public $model;
	public $prompt;
	public $provider;
	public $suno;
}

class MusicGenerateResponse
{
}

class OcrRequest
{
	public $debug;
	public $image;
	public $language;
	public $model;
	public $provider;
}

class OcrResponse
{
}

class OrganisationId { }

class OrganisationIdList { }

class PricingBreakdown
{
	public $currency;
	public $lines;
	public $total_cents;
	public $total_nanos;
	public $total_usd_str;
}

class Provider
{
	public $api_provider_id;
	public $api_provider_name;
	public $country_code;
	public $description;
	public $link;
}

class ProviderRoutingOptions
{
	public $ignore;
	public $only;
	public $order;
}

class ProvisioningKey
{
	public $created_at;
	public $id;
	public $last_used_at;
	public $name;
	public $prefix;
	public $scopes;
	public $status;
}

class ProvisioningKeyDetail
{
	public $created_at;
	public $created_by;
	public $id;
	public $last_used_at;
	public $name;
	public $prefix;
	public $scopes;
	public $soft_blocked;
	public $status;
	public $team_id;
}

class ProvisioningKeyWithValue
{
	public $created_at;
	public $id;
	public $key;
	public $name;
	public $prefix;
	public $scopes;
	public $status;
}

class ReasoningConfig
{
	public $effort;
	public $enabled;
	public $max_tokens;
	public $summary;
}

class ResponsesFunctionCallItem
{
	public $arguments;
	public $call_id;
	public $name;
	public $type;
}

class ResponsesFunctionCallOutputItem
{
	public $call_id;
	public $output;
	public $type;
}

class ResponsesInputAudioItem
{
	public $input_audio;
	public $type;
}

class ResponsesInputImageItem
{
	public $detail;
	public $image_url;
	public $type;
}

class ResponsesInputItem { }

class ResponsesInputTextItem
{
	public $cache_control;
	public $text;
	public $type;
}

class ResponsesInputVideoItem
{
	public $type;
	public $video_url;
}

class ResponsesMessageItem
{
	public $content;
	public $role;
	public $tool_call_id;
	public $tool_calls;
	public $type;
}

class ResponsesOutputContent
{
	public $annotations;
	public $b64_json;
	public $image_url;
	public $mime_type;
	public $text;
	public $type;
}

class ResponsesOutputItem
{
	public $arguments;
	public $call_id;
	public $content;
	public $id;
	public $name;
	public $role;
	public $status;
	public $type;
}

class ResponsesRequest
{
	public $background;
	public $conversation;
	public $debug;
	public $include;
	public $input;
	public $input_items;
	public $instructions;
	public $max_output_tokens;
	public $max_tool_calls;
	public $max_tools_calls;
	public $messages;
	public $meta;
	public $metadata;
	public $modalities;
	public $model;
	public $parallel_tool_calls;
	public $previous_response_id;
	public $prompt;
	public $prompt_cache_key;
	public $prompt_cache_retention;
	public $provider;
	public $reasoning;
	public $safety_identifier;
	public $service_tier;
	public $store;
	public $stream;
	public $stream_options;
	public $temperature;
	public $text;
	public $tool_choice;
	public $tools;
	public $top_logprobs;
	public $top_p;
	public $truncation;
	public $user;
}

class ResponsesResponse
{
	public $background;
	public $completed_at;
	public $created_at;
	public $debug;
	public $error;
	public $frequency_penalty;
	public $id;
	public $incomplete_details;
	public $instructions;
	public $max_output_tokens;
	public $max_tool_calls;
	public $meta;
	public $metadata;
	public $model;
	public $nativeResponseId;
	public $object;
	public $output;
	public $parallel_tool_calls;
	public $presence_penalty;
	public $previous_response_id;
	public $prompt_cache_key;
	public $reasoning;
	public $safety_identifier;
	public $service_tier;
	public $status;
	public $store;
	public $temperature;
	public $text;
	public $tool_choice;
	public $tools;
	public $top_logprobs;
	public $top_p;
	public $truncation;
	public $upstream_request;
	public $upstream_response;
	public $usage;
	public $user;
}

class ResponsesStreamCompletedEvent
{
	public $data;
	public $event;
}

class ResponsesStreamCreatedEvent
{
	public $data;
	public $event;
}

class ResponsesStreamErrorEvent
{
	public $data;
	public $event;
}

class ResponsesStreamEvent { }

class ResponsesStreamFunctionCallArgumentsDeltaEvent
{
	public $data;
	public $event;
}

class ResponsesStreamFunctionCallArgumentsDoneEvent
{
	public $data;
	public $event;
}

class ResponsesStreamOutputTextDeltaEvent
{
	public $data;
	public $event;
}

class ResponsesStreamReasoningTextDeltaEvent
{
	public $data;
	public $event;
}

class TextContentPart
{
	public $cache_control;
	public $text;
	public $type;
}

class TextModerationInput
{
	public $text;
	public $type;
}

class ToolCall
{
	public $function;
	public $id;
	public $type;
}

class ToolCallContentPart
{
	public $function;
	public $id;
	public $type;
}

class Usage
{
	public $cached_read_text_tokens;
	public $cached_write_text_tokens;
	public $completion_tokens;
	public $completion_tokens_details;
	public $input_text_tokens;
	public $input_tokens;
	public $input_tokens_details;
	public $output_text_tokens;
	public $output_tokens;
	public $output_tokens_details;
	public $pricing;
	public $pricing_breakdown;
	public $prompt_tokens;
	public $prompt_tokens_details;
	public $reasoning_tokens;
	public $total_tokens;
}

class UsageDetails
{
	public $cached_tokens;
	public $input_audio;
	public $input_images;
	public $input_videos;
	public $output_audio;
	public $output_images;
	public $output_videos;
	public $reasoning_tokens;
}

class VideoContentPart
{
	public $type;
	public $video_url;
}

class VideoDeleteResponse
{
	public $deleted;
	public $id;
	public $object;
}

class VideoGenerationRequest
{
	public $aspect_ratio;
	public $debug;
	public $duration;
	public $duration_seconds;
	public $input_reference;
	public $input_reference_mime_type;
	public $model;
	public $negative_prompt;
	public $output_storage_uri;
	public $person_generation;
	public $prompt;
	public $provider;
	public $ratio;
	public $resolution;
	public $sample_count;
	public $seconds;
	public $seed;
	public $size;
}

class VideoGenerationResponse
{
	public $created;
	public $id;
	public $model;
	public $object;
	public $output;
	public $status;
}
