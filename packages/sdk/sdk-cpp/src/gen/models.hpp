#pragma once
#include <any>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace ai_stats::gen {
struct ActivityEntry {
	std::optional<double> cost_cents;
	std::string endpoint;
	std::optional<int> latency_ms;
	std::string model;
	std::string provider;
	std::string request_id;
	std::string timestamp;
	std::map<std::string, std::any> usage;
};

struct AnthropicContentBlock {
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
	std::optional<int> max_tokens;
	std::vector<std::map<std::string, std::any>> messages;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::map<std::string, std::any> provider;
	std::optional<bool> stream;
	std::any system;
	std::optional<double> temperature;
	std::any tool_choice;
	std::vector<std::map<std::string, std::any>> tools;
	std::optional<int> top_k;
	std::optional<double> top_p;
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

struct BatchRequest {
	std::string completion_window;
	std::map<std::string, std::any> debug;
	std::string endpoint;
	std::string input_file_id;
	std::map<std::string, std::any> metadata;
	std::map<std::string, std::any> provider;
};

struct BatchRequestCounts {
	std::optional<int> completed;
	std::optional<int> failed;
	std::optional<int> total;
};

struct BatchResponse {
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
	std::optional<int> finalizing_at;
	std::string id;
	std::optional<int> in_progress_at;
	std::string input_file_id;
	std::map<std::string, std::any> metadata;
	std::string object;
	std::string output_file_id;
	std::map<std::string, std::any> request_counts;
	std::string status;
};

using BenchmarkId = std::any;

struct ChatChoice {
	std::any finish_reason;
	std::optional<int> index;
	std::map<std::string, std::any> message;
};

struct ChatCompletionsRequest {
	std::map<std::string, std::any> debug;
	std::optional<double> frequency_penalty;
	std::map<std::string, std::any> logit_bias;
	std::optional<bool> logprobs;
	std::optional<int> max_output_tokens;
	std::optional<int> max_tool_calls;
	std::vector<std::map<std::string, std::any>> messages;
	std::optional<bool> meta;
	std::string model;
	std::optional<bool> parallel_tool_calls;
	std::optional<double> presence_penalty;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> reasoning;
	std::any response_format;
	std::optional<int> seed;
	std::any service_tier;
	std::optional<bool> stream;
	std::string system;
	std::optional<double> temperature;
	std::any tool_choice;
	std::vector<std::map<std::string, std::any>> tools;
	std::optional<int> top_k;
	std::optional<int> top_logprobs;
	std::optional<double> top_p;
	std::optional<bool> usage;
	std::string user_id;
};

struct ChatCompletionsResponse {
	std::vector<std::map<std::string, std::any>> choices;
	std::optional<int> created;
	std::string id;
	std::string model;
	std::string object;
	std::map<std::string, std::any> usage;
};

struct ChatMessage {
	std::any content;
	std::string name;
	std::any role;
	std::string tool_call_id;
	std::vector<std::map<std::string, std::any>> tool_calls;
};

struct DebugOptions {
	std::optional<bool> enabled;
	std::optional<bool> return_upstream_request;
	std::optional<bool> return_upstream_response;
	std::optional<bool> trace;
	std::any trace_level;
};

struct Embedding {
	std::vector<double> embedding;
	std::optional<int> index;
	std::string object;
};

using EmbeddingsRequest = std::any;

struct EmbeddingsResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string model;
	std::string object;
	std::map<std::string, std::any> usage;
};

struct ErrorResponse {
	std::string error;
	std::string message;
	std::optional<bool> ok;
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

struct GenerationResponse {
	std::optional<std::string> app_id;
	std::optional<bool> byok;
	std::optional<double> cost_nanos;
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

struct ListFilesResponse {
	std::vector<std::map<std::string, std::any>> data;
	std::string object;
};

using MessageContentPart = std::any;

struct Model {
	std::vector<std::string> aliases;
	std::vector<std::string> endpoints;
	std::vector<std::string> input_types;
	std::string model_id;
	std::string name;
	std::string organisation_id;
	std::vector<std::string> output_types;
	std::vector<std::map<std::string, std::any>> providers;
	std::string release_date;
	std::string status;
};

using ModelId = std::any;

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

struct ProviderRoutingOptions {
	std::vector<std::string> ignore;
	std::optional<bool> include_alpha;
	std::vector<std::string> only;
	std::vector<std::string> order;
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
	std::any summary;
};

struct ResponsesRequest {
	std::optional<bool> background;
	std::any conversation;
	std::map<std::string, std::any> debug;
	std::vector<std::string> include;
	std::map<std::string, std::any> input;
	std::vector<std::map<std::string, std::any>> input_items;
	std::string instructions;
	std::optional<int> max_output_tokens;
	std::optional<int> max_tool_calls;
	std::optional<bool> meta;
	std::map<std::string, std::any> metadata;
	std::string model;
	std::optional<bool> parallel_tool_calls;
	std::string previous_response_id;
	std::map<std::string, std::any> prompt;
	std::string prompt_cache_key;
	std::string prompt_cache_retention;
	std::map<std::string, std::any> provider;
	std::map<std::string, std::any> reasoning;
	std::string safety_identifier;
	std::string service_tier;
	std::optional<bool> store;
	std::optional<bool> stream;
	std::map<std::string, std::any> stream_options;
	std::optional<double> temperature;
	std::map<std::string, std::any> text;
	std::any tool_choice;
	std::vector<std::map<std::string, std::any>> tools;
	std::optional<int> top_logprobs;
	std::optional<double> top_p;
	std::string truncation;
	std::optional<bool> usage;
	std::string user;
};

struct ResponsesResponse {
	std::vector<std::map<std::string, std::any>> content;
	std::optional<int> created;
	std::string id;
	std::string model;
	std::string object;
	std::string role;
	std::string stop_reason;
	std::string type;
	std::map<std::string, std::any> usage;
};

struct TextContentPart {
	std::string text;
	std::any type;
};

struct TextModerationInput {
	std::string text;
	std::any type;
};

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
	std::optional<int> total_tokens;
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
	std::optional<int> duration;
	std::optional<int> duration_seconds;
	std::string input_reference;
	std::string input_reference_mime_type;
	std::string model;
	std::string negative_prompt;
	std::string output_storage_uri;
	std::string person_generation;
	std::string prompt;
	std::map<std::string, std::any> provider;
	std::string ratio;
	std::string resolution;
	std::optional<int> sample_count;
	std::any seconds;
	std::optional<int> seed;
	std::string size;
};

struct VideoGenerationResponse {
	std::optional<int> created;
	std::string id;
	std::string model;
	std::string object;
	std::vector<std::map<std::string, std::any>> output;
	std::string status;
};

} // namespace ai_stats::gen
