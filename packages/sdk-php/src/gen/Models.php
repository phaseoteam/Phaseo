<?php
declare(strict_types=1);

namespace AIStats\Gen;

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
	public $voice;
}

class AudioTranscriptionRequest
{
	public $audio_b64;
	public $audio_url;
	public $language;
	public $model;
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
	public $temperature;
}

class AudioTranslationResponse
{
	public $text;
}

class BatchRequest
{
	public $completion_window;
	public $endpoint;
	public $input_file_id;
	public $metadata;
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

class Embedding
{
	public $embedding;
	public $index;
	public $object;
}

class EmbeddingsRequest
{
	public $dimensions;
	public $encoding_format;
	public $input;
	public $model;
	public $user;
}

class EmbeddingsResponse
{
	public $data;
	public $model;
	public $object;
	public $usage;
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
	public $input;
	public $meta;
	public $model;
}

class ModerationsResponse
{
	public $id;
	public $model;
	public $results;
}

class OrganisationId { }

class OrganisationIdList { }

class ReasoningConfig
{
	public $effort;
	public $summary;
}

class ResponsesRequest
{
	public $background;
	public $conversation;
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

class VideoGenerationRequest
{
	public $duration;
	public $model;
	public $prompt;
	public $ratio;
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
