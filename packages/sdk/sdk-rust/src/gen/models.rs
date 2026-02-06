use std::collections::HashMap;

pub type JsonValue = String;

pub struct ActivityEntry {
	pub cost_cents: Option<f64>,
	pub endpoint: Option<String>,
	pub latency_ms: Option<i64>,
	pub model: Option<String>,
	pub provider: Option<String>,
	pub request_id: Option<String>,
	pub timestamp: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct AnthropicContentBlock {
	pub cache_control: Option<HashMap<String, String>>,
	pub content: Option<String>,
	pub id: Option<String>,
	pub image_url: Option<String>,
	pub input: Option<HashMap<String, String>>,
	pub input_audio: Option<HashMap<String, String>>,
	pub name: Option<String>,
	pub source: Option<HashMap<String, String>>,
	pub text: Option<String>,
	pub tool_use_id: Option<String>,
	pub r#type: Option<String>,
	pub video_url: Option<String>,
}

pub struct AnthropicContentBlockDeltaEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicContentBlockStartEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicContentBlockStopEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicMessage {
	pub content: String,
	pub role: String,
}

pub struct AnthropicMessageDeltaEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicMessagesRequest {
	pub debug: Option<HashMap<String, String>>,
	pub max_tokens: i64,
	pub messages: Vec<HashMap<String, String>>,
	pub meta: Option<bool>,
	pub metadata: Option<HashMap<String, String>>,
	pub modalities: Option<Vec<String>>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub stop_sequences: Option<Vec<String>>,
	pub stream: Option<bool>,
	pub system: Option<String>,
	pub temperature: Option<f64>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<HashMap<String, String>>>,
	pub top_k: Option<i64>,
	pub top_p: Option<f64>,
}

pub struct AnthropicMessagesResponse {
	pub content: Option<Vec<HashMap<String, String>>>,
	pub debug: Option<HashMap<String, String>>,
	pub id: Option<String>,
	pub meta: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub role: Option<String>,
	pub stop_reason: Option<String>,
	pub stop_sequence: Option<String>,
	pub r#type: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub type AnthropicMessagesStreamEvent = JsonValue;

pub struct AnthropicMessageStartEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicMessageStopEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct AnthropicTool {
	pub description: Option<String>,
	pub input_schema: Option<HashMap<String, String>>,
	pub name: String,
}

pub struct AnthropicUsage {
	pub cache_creation: Option<HashMap<String, String>>,
	pub cache_creation_input_tokens: Option<i64>,
	pub cache_read_input_tokens: Option<i64>,
	pub input_tokens: Option<i64>,
	pub output_tokens: Option<i64>,
	pub server_tool_use: Option<bool>,
	pub service_tier: Option<String>,
}

pub struct AudioContentPart {
	pub input_audio: HashMap<String, String>,
	pub r#type: String,
}

pub struct AudioSpeechRequest {
	pub debug: Option<HashMap<String, String>>,
	pub format: Option<String>,
	pub input: String,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub voice: Option<String>,
}

pub struct AudioTranscriptionRequest {
	pub audio_b64: Option<String>,
	pub audio_url: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub language: Option<String>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
}

pub struct AudioTranscriptionResponse {
	pub text: Option<String>,
}

pub struct AudioTranslationRequest {
	pub audio_b64: Option<String>,
	pub audio_url: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub language: Option<String>,
	pub model: String,
	pub prompt: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub temperature: Option<f64>,
}

pub struct AudioTranslationResponse {
	pub text: Option<String>,
}

pub struct BatchRequest {
	pub completion_window: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub endpoint: String,
	pub input_file_id: String,
	pub metadata: Option<HashMap<String, String>>,
	pub provider: Option<HashMap<String, String>>,
}

pub struct BatchRequestCounts {
	pub completed: Option<i64>,
	pub failed: Option<i64>,
	pub total: Option<i64>,
}

pub struct BatchResponse {
	pub cancelled_at: Option<i64>,
	pub cancelling_at: Option<i64>,
	pub completed_at: Option<i64>,
	pub completion_window: Option<String>,
	pub created_at: Option<i64>,
	pub endpoint: Option<String>,
	pub error_file_id: Option<String>,
	pub errors: Option<HashMap<String, String>>,
	pub expired_at: Option<i64>,
	pub expires_at: Option<i64>,
	pub failed_at: Option<i64>,
	pub finalizing_at: Option<i64>,
	pub id: Option<String>,
	pub in_progress_at: Option<i64>,
	pub input_file_id: Option<String>,
	pub metadata: Option<HashMap<String, String>>,
	pub object: Option<String>,
	pub output_file_id: Option<String>,
	pub request_counts: Option<HashMap<String, String>>,
	pub status: Option<String>,
}

pub type BenchmarkId = JsonValue;

pub struct CacheControl {
	pub cache: Option<HashMap<String, String>>,
	pub ttl: Option<String>,
	pub r#type: Option<String>,
}

pub struct ChatChoice {
	pub finish_reason: Option<String>,
	pub index: Option<i64>,
	pub logprobs: Option<HashMap<String, String>>,
	pub message: Option<HashMap<String, String>>,
}

pub struct ChatCompletionsRequest {
	pub debug: Option<HashMap<String, String>>,
	pub frequency_penalty: Option<f64>,
	pub logit_bias: Option<HashMap<String, String>>,
	pub logprobs: Option<bool>,
	pub max_output_tokens: Option<i64>,
	pub max_tool_calls: Option<i64>,
	pub messages: Vec<HashMap<String, String>>,
	pub meta: Option<bool>,
	pub modalities: Option<Vec<String>>,
	pub model: String,
	pub parallel_tool_calls: Option<bool>,
	pub presence_penalty: Option<f64>,
	pub provider: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub response_format: Option<String>,
	pub seed: Option<i64>,
	pub service_tier: Option<String>,
	pub stream: Option<bool>,
	pub system: Option<String>,
	pub temperature: Option<f64>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<HashMap<String, String>>>,
	pub top_k: Option<i64>,
	pub top_logprobs: Option<i64>,
	pub top_p: Option<f64>,
	pub usage: Option<bool>,
	pub user_id: Option<String>,
}

pub struct ChatCompletionsResponse {
	pub choices: Option<Vec<HashMap<String, String>>>,
	pub created: Option<i64>,
	pub debug: Option<HashMap<String, String>>,
	pub id: Option<String>,
	pub meta: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub nativeResponseId: Option<String>,
	pub object: Option<String>,
	pub service_tier: Option<String>,
	pub system_fingerprint: Option<String>,
	pub upstream_request: Option<String>,
	pub upstream_response: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ChatCompletionsStreamChoice {
	pub delta: Option<HashMap<String, String>>,
	pub finish_reason: Option<String>,
	pub index: Option<i64>,
	pub logprobs: Option<HashMap<String, String>>,
}

pub struct ChatCompletionsStreamChunk {
	pub choices: Option<Vec<HashMap<String, String>>>,
	pub created: Option<i64>,
	pub id: Option<String>,
	pub meta: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub nativeResponseId: Option<String>,
	pub object: Option<String>,
	pub service_tier: Option<String>,
	pub system_fingerprint: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ChatCompletionsStreamDelta {
	pub content: Option<String>,
	pub reasoning_content: Option<String>,
	pub role: Option<String>,
	pub tool_calls: Option<Vec<HashMap<String, String>>>,
}

pub struct ChatCompletionsStreamEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<Option<String>>,
}

pub struct ChatMessage {
	pub content: Option<String>,
	pub name: Option<String>,
	pub reasoning_content: Option<String>,
	pub role: String,
	pub tool_call_id: Option<String>,
	pub tool_calls: Option<Vec<HashMap<String, String>>>,
}

pub struct DebugOptions {
	pub enabled: Option<bool>,
	pub return_upstream_request: Option<bool>,
	pub return_upstream_response: Option<bool>,
	pub trace: Option<bool>,
	pub trace_level: Option<String>,
}

pub struct DebugResponse {
	pub enabled: Option<bool>,
	pub return_upstream_request: Option<bool>,
	pub return_upstream_response: Option<bool>,
	pub trace: Option<Vec<HashMap<String, String>>>,
	pub trace_level: Option<String>,
}

pub struct Embedding {
	pub embedding: Option<Vec<f64>>,
	pub index: Option<i64>,
	pub object: Option<String>,
}

pub type EmbeddingsRequest = JsonValue;

pub struct EmbeddingsResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub model: Option<String>,
	pub object: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ErrorResponse {
	pub error: Option<String>,
	pub message: Option<String>,
	pub ok: Option<bool>,
}

pub struct FileResponse {
	pub bytes: Option<i64>,
	pub created_at: Option<i64>,
	pub filename: Option<String>,
	pub id: Option<String>,
	pub object: Option<String>,
	pub purpose: Option<String>,
	pub status: Option<String>,
	pub status_details: Option<HashMap<String, String>>,
}

pub struct FileUploadRequest {
	pub file: String,
	pub purpose: String,
}

pub struct GenerationResponse {
	pub app_id: Option<Option<String>>,
	pub byok: Option<bool>,
	pub cost_nanos: Option<f64>,
	pub currency: Option<String>,
	pub endpoint: Option<String>,
	pub error_code: Option<Option<String>>,
	pub error_message: Option<Option<String>>,
	pub generation_ms: Option<f64>,
	pub key_id: Option<String>,
	pub latency_ms: Option<f64>,
	pub model_id: Option<String>,
	pub native_response_id: Option<Option<String>>,
	pub pricing_lines: Option<Vec<HashMap<String, String>>>,
	pub provider: Option<String>,
	pub request_id: Option<String>,
	pub status_code: Option<f64>,
	pub stream: Option<bool>,
	pub success: Option<bool>,
	pub team_id: Option<String>,
	pub throughput: Option<Option<f64>>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct Image {
	pub b64_json: Option<String>,
	pub revised_prompt: Option<String>,
	pub url: Option<String>,
}

pub struct ImageContentPart {
	pub image_url: HashMap<String, String>,
	pub r#type: String,
}

pub struct ImageModerationInput {
	pub image_url: HashMap<String, String>,
	pub r#type: String,
}

pub struct ImagesEditRequest {
	pub debug: Option<HashMap<String, String>>,
	pub image: String,
	pub mask: Option<String>,
	pub meta: Option<bool>,
	pub model: String,
	pub n: Option<i64>,
	pub prompt: String,
	pub provider: Option<HashMap<String, String>>,
	pub size: Option<String>,
	pub usage: Option<bool>,
	pub user: Option<String>,
}

pub struct ImagesEditResponse {
	pub created: Option<i64>,
	pub data: Option<Vec<HashMap<String, String>>>,
}

pub struct ImagesGenerationRequest {
	pub debug: Option<HashMap<String, String>>,
	pub model: String,
	pub n: Option<i64>,
	pub prompt: String,
	pub provider: Option<HashMap<String, String>>,
	pub quality: Option<String>,
	pub response_format: Option<String>,
	pub size: Option<String>,
	pub style: Option<String>,
	pub user: Option<String>,
}

pub struct ImagesGenerationResponse {
	pub created: Option<i64>,
	pub data: Option<Vec<HashMap<String, String>>>,
}

pub struct InputImageContentPart {
	pub image_url: String,
	pub r#type: String,
}

pub struct InputTextContentPart {
	pub cache_control: Option<HashMap<String, String>>,
	pub text: String,
	pub r#type: String,
}

pub struct ListFilesResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub object: Option<String>,
}

pub type MessageContentPart = JsonValue;

pub struct Model {
	pub aliases: Option<Vec<String>>,
	pub deprecation_date: Option<Option<String>>,
	pub endpoints: Option<Vec<String>>,
	pub input_types: Option<Vec<String>>,
	pub model_id: Option<String>,
	pub name: Option<Option<String>>,
	pub organisation_colour: Option<Option<String>>,
	pub organisation_id: Option<Option<String>>,
	pub organisation_name: Option<Option<String>>,
	pub output_types: Option<Vec<String>>,
	pub pricing: Option<HashMap<String, String>>,
	pub providers: Option<Vec<HashMap<String, String>>>,
	pub release_date: Option<Option<String>>,
	pub retirement_date: Option<Option<String>>,
	pub status: Option<Option<String>>,
	pub supported_params: Option<Vec<String>>,
	pub top_provider: Option<Option<String>>,
}

pub type ModelId = JsonValue;

pub struct ModelPricing {
	pub meters: Option<HashMap<String, String>>,
	pub pricing_plan: Option<String>,
}

pub type ModelPricingMeter = JsonValue;

pub struct ModerationCategories {
	pub harassment: Option<bool>,
	pub harassment_threatening: Option<bool>,
	pub hate: Option<bool>,
	pub hate_threatening: Option<bool>,
	pub self_harm: Option<bool>,
	pub self_harm_instructions: Option<bool>,
	pub self_harm_intent: Option<bool>,
	pub sexual: Option<bool>,
	pub sexual_minors: Option<bool>,
	pub violence: Option<bool>,
	pub violence_graphic: Option<bool>,
}

pub struct ModerationCategoryScores {
	pub harassment: Option<f64>,
	pub harassment_threatening: Option<f64>,
	pub hate: Option<f64>,
	pub hate_threatening: Option<f64>,
	pub self_harm: Option<f64>,
	pub self_harm_instructions: Option<f64>,
	pub self_harm_intent: Option<f64>,
	pub sexual: Option<f64>,
	pub sexual_minors: Option<f64>,
	pub violence: Option<f64>,
	pub violence_graphic: Option<f64>,
}

pub struct ModerationResult {
	pub categories: Option<HashMap<String, String>>,
	pub category_scores: Option<HashMap<String, String>>,
	pub flagged: Option<bool>,
}

pub struct ModerationsRequest {
	pub debug: Option<HashMap<String, String>>,
	pub input: String,
	pub meta: Option<bool>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
}

pub struct ModerationsResponse {
	pub id: Option<String>,
	pub model: Option<String>,
	pub results: Option<Vec<HashMap<String, String>>>,
}

pub struct MusicGenerateRequest {
	pub debug: Option<HashMap<String, String>>,
	pub duration: Option<i64>,
	pub elevenlabs: Option<HashMap<String, String>>,
	pub format: Option<String>,
	pub model: String,
	pub prompt: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub suno: Option<HashMap<String, String>>,
}

pub struct MusicGenerateResponse {
}

pub struct OcrRequest {
	pub debug: Option<HashMap<String, String>>,
	pub image: String,
	pub language: Option<String>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
}

pub struct OcrResponse {
}

pub type OrganisationId = JsonValue;

pub type OrganisationIdList = JsonValue;

pub struct PricingBreakdown {
	pub currency: Option<String>,
	pub lines: Option<Vec<HashMap<String, String>>>,
	pub total_cents: Option<i64>,
	pub total_nanos: Option<i64>,
	pub total_usd_str: Option<String>,
}

pub struct Provider {
	pub api_provider_id: Option<String>,
	pub api_provider_name: Option<Option<String>>,
	pub country_code: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub link: Option<Option<String>>,
}

pub struct ProviderRoutingOptions {
	pub ignore: Option<Vec<String>>,
	pub only: Option<Vec<String>>,
	pub order: Option<Vec<String>>,
}

pub struct ProvisioningKey {
	pub created_at: Option<String>,
	pub id: Option<String>,
	pub last_used_at: Option<Option<String>>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: Option<String>,
	pub status: Option<String>,
}

pub struct ProvisioningKeyDetail {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub id: Option<String>,
	pub last_used_at: Option<Option<String>>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
	pub status: Option<String>,
	pub team_id: Option<String>,
}

pub struct ProvisioningKeyWithValue {
	pub created_at: Option<String>,
	pub id: Option<String>,
	pub key: Option<String>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: Option<String>,
	pub status: Option<String>,
}

pub struct ReasoningConfig {
	pub effort: Option<String>,
	pub enabled: Option<bool>,
	pub max_tokens: Option<i64>,
	pub summary: Option<String>,
}

pub struct ResponsesFunctionCallItem {
	pub arguments: String,
	pub call_id: Option<String>,
	pub name: String,
	pub r#type: String,
}

pub struct ResponsesFunctionCallOutputItem {
	pub call_id: String,
	pub output: String,
	pub r#type: String,
}

pub struct ResponsesInputAudioItem {
	pub input_audio: HashMap<String, String>,
	pub r#type: String,
}

pub struct ResponsesInputImageItem {
	pub detail: Option<String>,
	pub image_url: String,
	pub r#type: String,
}

pub type ResponsesInputItem = JsonValue;

pub struct ResponsesInputTextItem {
	pub cache_control: Option<HashMap<String, String>>,
	pub text: String,
	pub r#type: String,
}

pub struct ResponsesInputVideoItem {
	pub r#type: String,
	pub video_url: String,
}

pub struct ResponsesMessageItem {
	pub content: String,
	pub role: String,
	pub tool_call_id: Option<String>,
	pub tool_calls: Option<Vec<HashMap<String, String>>>,
	pub r#type: String,
}

pub struct ResponsesOutputContent {
	pub annotations: Option<Vec<HashMap<String, String>>>,
	pub b64_json: Option<String>,
	pub image_url: Option<HashMap<String, String>>,
	pub mime_type: Option<String>,
	pub text: Option<String>,
	pub r#type: Option<String>,
}

pub struct ResponsesOutputItem {
	pub arguments: Option<String>,
	pub call_id: Option<String>,
	pub content: Option<Vec<HashMap<String, String>>>,
	pub id: Option<String>,
	pub name: Option<String>,
	pub role: Option<String>,
	pub status: Option<String>,
	pub r#type: Option<String>,
}

pub struct ResponsesRequest {
	pub background: Option<bool>,
	pub conversation: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub include: Option<Vec<String>>,
	pub input: Option<String>,
	pub input_items: Option<Vec<String>>,
	pub instructions: Option<String>,
	pub max_output_tokens: Option<i64>,
	pub max_tool_calls: Option<i64>,
	pub max_tools_calls: Option<i64>,
	pub messages: Option<Vec<HashMap<String, String>>>,
	pub meta: Option<bool>,
	pub metadata: Option<HashMap<String, String>>,
	pub modalities: Option<Vec<String>>,
	pub model: String,
	pub parallel_tool_calls: Option<bool>,
	pub previous_response_id: Option<String>,
	pub prompt: Option<HashMap<String, String>>,
	pub prompt_cache_key: Option<String>,
	pub prompt_cache_retention: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub safety_identifier: Option<String>,
	pub service_tier: Option<String>,
	pub store: Option<bool>,
	pub stream: Option<bool>,
	pub stream_options: Option<HashMap<String, String>>,
	pub temperature: Option<f64>,
	pub text: Option<HashMap<String, String>>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<HashMap<String, String>>>,
	pub top_logprobs: Option<i64>,
	pub top_p: Option<f64>,
	pub truncation: Option<String>,
	pub user: Option<String>,
}

pub struct ResponsesResponse {
	pub background: Option<Option<bool>>,
	pub completed_at: Option<Option<i64>>,
	pub created_at: Option<i64>,
	pub debug: Option<HashMap<String, String>>,
	pub error: Option<Option<HashMap<String, String>>>,
	pub frequency_penalty: Option<Option<f64>>,
	pub id: Option<String>,
	pub incomplete_details: Option<Option<HashMap<String, String>>>,
	pub instructions: Option<Option<String>>,
	pub max_output_tokens: Option<Option<i64>>,
	pub max_tool_calls: Option<Option<i64>>,
	pub meta: Option<HashMap<String, String>>,
	pub metadata: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub nativeResponseId: Option<String>,
	pub object: Option<String>,
	pub output: Option<Vec<HashMap<String, String>>>,
	pub parallel_tool_calls: Option<bool>,
	pub presence_penalty: Option<Option<f64>>,
	pub previous_response_id: Option<Option<String>>,
	pub prompt_cache_key: Option<Option<String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub safety_identifier: Option<Option<String>>,
	pub service_tier: Option<Option<String>>,
	pub status: Option<String>,
	pub store: Option<Option<bool>>,
	pub temperature: Option<Option<f64>>,
	pub text: Option<Option<HashMap<String, String>>>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<HashMap<String, String>>>,
	pub top_logprobs: Option<Option<i64>>,
	pub top_p: Option<Option<f64>>,
	pub truncation: Option<String>,
	pub upstream_request: Option<String>,
	pub upstream_response: Option<String>,
	pub usage: Option<HashMap<String, String>>,
	pub user: Option<Option<String>>,
}

pub struct ResponsesStreamCompletedEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct ResponsesStreamCreatedEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct ResponsesStreamErrorEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub type ResponsesStreamEvent = JsonValue;

pub struct ResponsesStreamFunctionCallArgumentsDeltaEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct ResponsesStreamFunctionCallArgumentsDoneEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct ResponsesStreamOutputTextDeltaEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct ResponsesStreamReasoningTextDeltaEvent {
	pub data: Option<HashMap<String, String>>,
	pub event: Option<String>,
}

pub struct TextContentPart {
	pub cache_control: Option<HashMap<String, String>>,
	pub text: String,
	pub r#type: String,
}

pub struct TextModerationInput {
	pub text: String,
	pub r#type: String,
}

pub struct ToolCall {
	pub function: HashMap<String, String>,
	pub id: String,
	pub r#type: String,
}

pub struct ToolCallContentPart {
	pub function: HashMap<String, String>,
	pub id: String,
	pub r#type: String,
}

pub struct Usage {
	pub cached_read_text_tokens: Option<i64>,
	pub cached_write_text_tokens: Option<i64>,
	pub completion_tokens: Option<i64>,
	pub completion_tokens_details: Option<HashMap<String, String>>,
	pub input_text_tokens: Option<i64>,
	pub input_tokens: Option<i64>,
	pub input_tokens_details: Option<HashMap<String, String>>,
	pub output_text_tokens: Option<i64>,
	pub output_tokens: Option<i64>,
	pub output_tokens_details: Option<HashMap<String, String>>,
	pub pricing: Option<HashMap<String, String>>,
	pub pricing_breakdown: Option<HashMap<String, String>>,
	pub prompt_tokens: Option<i64>,
	pub prompt_tokens_details: Option<HashMap<String, String>>,
	pub reasoning_tokens: Option<i64>,
	pub total_tokens: Option<i64>,
}

pub struct UsageDetails {
	pub cached_tokens: Option<i64>,
	pub input_audio: Option<i64>,
	pub input_images: Option<i64>,
	pub input_videos: Option<i64>,
	pub output_audio: Option<i64>,
	pub output_images: Option<i64>,
	pub output_videos: Option<i64>,
	pub reasoning_tokens: Option<i64>,
}

pub struct VideoContentPart {
	pub r#type: String,
	pub video_url: String,
}

pub struct VideoDeleteResponse {
	pub deleted: Option<bool>,
	pub id: Option<String>,
	pub object: Option<String>,
}

pub struct VideoGenerationRequest {
	pub aspect_ratio: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub duration: Option<i64>,
	pub duration_seconds: Option<i64>,
	pub input_reference: Option<String>,
	pub input_reference_mime_type: Option<String>,
	pub model: String,
	pub negative_prompt: Option<String>,
	pub output_storage_uri: Option<String>,
	pub person_generation: Option<String>,
	pub prompt: String,
	pub provider: Option<HashMap<String, String>>,
	pub ratio: Option<String>,
	pub resolution: Option<String>,
	pub sample_count: Option<i64>,
	pub seconds: Option<String>,
	pub seed: Option<i64>,
	pub size: Option<String>,
}

pub struct VideoGenerationResponse {
	pub created: Option<i64>,
	pub id: Option<String>,
	pub model: Option<String>,
	pub object: Option<String>,
	pub output: Option<Vec<HashMap<String, String>>>,
	pub status: Option<String>,
}
