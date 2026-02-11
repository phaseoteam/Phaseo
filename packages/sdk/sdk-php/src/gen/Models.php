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
	public $content;
	public $id;
	public $input;
	public $name;
	public $source;
	public $text;
	public $tool_use_id;
	public $type;
}

class AnthropicMessage
{
	public $content;
	public $role;
}

class AnthropicMessagesRequest
{
	public $debug;
	public $max_tokens;
	public $messages;
	public $metadata;
	public $model;
	public $provider;
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
	public $id;
	public $model;
	public $role;
	public $stop_reason;
	public $stop_sequence;
	public $type;
	public $usage;
}

class AnthropicTool
{
	public $description;
	public $input_schema;
	public $name;
}

class AnthropicUsage
{
	public $input_tokens;
	public $output_tokens;
}

class AudioContentPart
{
	public $input_audio;
	public $type;
}

class AudioSpeechRequest
{
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

class ChatChoice
{
	public $finish_reason;
	public $index;
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
	public $id;
	public $model;
	public $object;
	public $usage;
}

class ChatMessage
{
	public $content;
	public $name;
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

class Embedding
{
	public $embedding;
	public $index;
	public $object;
}

class EmbeddingsRequest
{
	public $debug;
	public $dimensions;
	public $embedding_options;
	public $encoding_format;
	public $input;
	public $inputs;
	public $model;
	public $provider;
	public $user;
}

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

class ListFilesResponse
{
	public $data;
	public $object;
}

class MessageContentPart { }

class Model
{
	public $aliases;
	public $endpoints;
	public $input_types;
	public $model_id;
	public $name;
	public $organisation_id;
	public $output_types;
	public $providers;
	public $release_date;
	public $status;
}

class ModelId { }

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
	public $echo_upstream_request;
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
	public $echo_upstream_request;
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
	public $include_alpha;
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
	public $summary;
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
	public $meta;
	public $metadata;
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
	public $usage;
	public $user;
}

class ResponsesResponse
{
	public $content;
	public $created;
	public $id;
	public $model;
	public $object;
	public $role;
	public $stop_reason;
	public $type;
	public $usage;
}

class TextContentPart
{
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
	public $completion_tokens;
	public $prompt_tokens;
	public $total_tokens;
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
