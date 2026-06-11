use std::collections::HashMap;

pub type JsonValue = String;

pub struct ActivityEntry {
	pub byok_usage_inference: f64,
	pub completion_tokens: i64,
	pub date: String,
	pub endpoint_id: String,
	pub model: String,
	pub model_permaslug: String,
	pub prompt_tokens: i64,
	pub provider_name: String,
	pub reasoning_tokens: i64,
	pub requests: i64,
	pub usage: f64,
}

pub struct ActivityResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct AnalyticsAccessTokenRequiredResponse {
	pub error: String,
	pub ok: String,
}

pub struct AnalyticsNotImplementedResponse {
	pub message: String,
	pub ok: String,
	pub status: String,
}

pub struct AnthropicContentBlock {
	pub cache_control: Option<HashMap<String, String>>,
	pub content: Option<String>,
	pub id: Option<String>,
	pub input: Option<HashMap<String, String>>,
	pub name: Option<String>,
	pub source: Option<HashMap<String, String>>,
	pub text: Option<String>,
	pub tool_use_id: Option<String>,
	pub r#type: Option<String>,
}

pub struct AnthropicMessage {
	pub content: String,
	pub role: String,
}

pub struct AnthropicMessagesRequest {
	pub debug: Option<HashMap<String, String>>,
	pub echo_upstream_request: Option<bool>,
	pub max_tokens: i64,
	pub messages: Vec<HashMap<String, String>>,
	pub meta: Option<bool>,
	pub metadata: Option<HashMap<String, String>>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub session_id: Option<String>,
	pub stop_sequences: Option<Vec<String>>,
	pub stream: Option<bool>,
	pub system: Option<String>,
	pub temperature: Option<f64>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<String>>,
	pub top_k: Option<i64>,
	pub top_p: Option<f64>,
	pub usage: Option<bool>,
}

pub struct AnthropicMessagesResponse {
	pub content: Option<Vec<HashMap<String, String>>>,
	pub id: Option<String>,
	pub model: Option<String>,
	pub role: Option<String>,
	pub stop_reason: Option<String>,
	pub stop_sequence: Option<String>,
	pub r#type: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct AnthropicTool {
	pub description: Option<String>,
	pub input_schema: Option<HashMap<String, String>>,
	pub name: String,
}

pub struct AnthropicUsage {
	pub input_tokens: Option<i64>,
	pub output_tokens: Option<i64>,
}

pub struct ApiKey {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub disabled: bool,
	pub expires_at: Option<String>,
	pub hash: String,
	pub id: String,
	pub label: Option<String>,
	pub last_used_at: Option<String>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: String,
	pub soft_blocked: bool,
	pub status: Option<String>,
	pub updated_at: Option<String>,
	pub workspace_id: String,
}

pub struct ApiKeyCreateRequest {
	pub disabled: Option<bool>,
	pub expires_at: Option<Option<String>>,
	pub include_byok_in_limit: Option<bool>,
	pub limit: Option<Option<f64>>,
	pub limit_reset: Option<String>,
	pub name: String,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
	pub workspace_id: Option<String>,
}

pub struct ApiKeyListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct ApiKeyResponse {
	pub data: HashMap<String, String>,
}

pub type ApiKeyScopeValue = JsonValue;

pub struct ApiKeyUpdateRequest {
	pub disabled: Option<bool>,
	pub expires_at: Option<Option<String>>,
	pub include_byok_in_limit: Option<bool>,
	pub limit: Option<Option<f64>>,
	pub limit_reset: Option<String>,
	pub name: Option<String>,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
}

pub struct ApiKeyWithValue {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub disabled: bool,
	pub expires_at: Option<String>,
	pub hash: String,
	pub id: String,
	pub key: String,
	pub label: Option<String>,
	pub last_used_at: Option<String>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: String,
	pub soft_blocked: bool,
	pub status: Option<String>,
	pub updated_at: Option<String>,
	pub workspace_id: String,
}

pub struct ApiKeyWithValueResponse {
	pub data: HashMap<String, String>,
}

pub struct AudioContentPart {
	pub input_audio: HashMap<String, String>,
	pub r#type: String,
}

pub struct AudioSpeechRequest {
	pub format: Option<String>,
	pub input: String,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub voice: Option<String>,
}

pub struct AudioTranscriptionRequest {
	pub audio_b64: Option<String>,
	pub audio_url: Option<String>,
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
	pub language: Option<String>,
	pub model: String,
	pub prompt: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub temperature: Option<f64>,
}

pub struct AudioTranslationResponse {
	pub text: Option<String>,
}

pub struct BatchBillingSummary {
	pub billed: Option<bool>,
	pub charged: Option<bool>,
	pub cost_nanos: Option<i64>,
	pub cost_usd: Option<f64>,
	pub finalized_at: Option<String>,
	pub pricing_breakdown: Option<HashMap<String, String>>,
	pub reason: Option<String>,
}

pub struct BatchRequest {
	pub completion_window: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub endpoint: String,
	pub input_file_id: String,
	pub metadata: Option<HashMap<String, String>>,
	pub provider: Option<HashMap<String, String>>,
	pub session_id: Option<String>,
	pub webhook: Option<HashMap<String, String>>,
}

pub struct BatchRequestCounts {
	pub completed: Option<i64>,
	pub failed: Option<i64>,
	pub total: Option<i64>,
}

pub struct BatchResponse {
	pub billing: Option<HashMap<String, String>>,
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
	pub pricing_lines: Option<Vec<HashMap<String, String>>>,
	pub provider: Option<String>,
	pub request_counts: Option<HashMap<String, String>>,
	pub request_id: Option<String>,
	pub session_id: Option<String>,
	pub status: Option<String>,
	pub webhook: Option<HashMap<String, String>>,
}

pub type BenchmarkId = JsonValue;

pub struct CacheControl {
	pub scope: Option<String>,
	pub ttl: Option<String>,
	pub r#type: Option<String>,
}

pub struct ChatAudioOutputPart {
	pub audio_url: HashMap<String, String>,
	pub format: Option<String>,
	pub mime_type: Option<String>,
	pub r#type: String,
}

pub struct ChatChoice {
	pub finish_reason: Option<String>,
	pub index: Option<i64>,
	pub message: Option<HashMap<String, String>>,
}

pub struct ChatCompletionsRequest {
	pub debug: Option<HashMap<String, String>>,
	pub echo_upstream_request: Option<bool>,
	pub frequency_penalty: Option<f64>,
	pub image_config: Option<HashMap<String, String>>,
	pub logit_bias: Option<HashMap<String, String>>,
	pub logprobs: Option<bool>,
	pub max_completion_tokens: Option<i64>,
	pub max_tokens: Option<i64>,
	pub max_tool_calls: Option<i64>,
	pub messages: Vec<HashMap<String, String>>,
	pub meta: Option<bool>,
	pub metadata: Option<HashMap<String, String>>,
	pub modalities: Option<Vec<String>>,
	pub model: String,
	pub parallel_tool_calls: Option<bool>,
	pub presence_penalty: Option<f64>,
	pub prompt_cache_key: Option<Option<String>>,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub response_format: Option<String>,
	pub safety_identifier: Option<Option<String>>,
	pub seed: Option<i64>,
	pub service_tier: Option<String>,
	pub session_id: Option<String>,
	pub stop: Option<String>,
	pub store: Option<bool>,
	pub stream: Option<bool>,
	pub stream_options: Option<HashMap<String, String>>,
	pub temperature: Option<f64>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<String>>,
	pub top_logprobs: Option<i64>,
	pub top_p: Option<f64>,
	pub usage: Option<bool>,
	pub user: Option<String>,
	pub user_id: Option<String>,
}

pub struct ChatCompletionsResponse {
	pub choices: Option<Vec<HashMap<String, String>>>,
	pub created: Option<i64>,
	pub id: Option<String>,
	pub model: Option<String>,
	pub nativeResponseId: Option<Option<String>>,
	pub object: Option<String>,
	pub provider: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ChatImageOutputPart {
	pub image_url: HashMap<String, String>,
	pub mime_type: Option<String>,
	pub r#type: String,
}

pub struct ChatMessage {
	pub audios: Option<Vec<HashMap<String, String>>>,
	pub content: Option<String>,
	pub images: Option<Vec<HashMap<String, String>>>,
	pub name: Option<String>,
	pub role: String,
	pub tool_call_id: Option<String>,
	pub tool_calls: Option<Vec<HashMap<String, String>>>,
}

pub struct CreditsResponse {
	pub credits: HashMap<String, String>,
	pub ok: String,
}

pub struct DataModel {
	pub deprecation_date: Option<Option<String>>,
	pub hidden: Option<bool>,
	pub input_types: Option<Vec<String>>,
	pub lifecycle: Option<ModelLifecycle>,
	pub model_id: Option<Option<String>>,
	pub name: Option<Option<String>>,
	pub organisation: Option<Option<HashMap<String, String>>>,
	pub output_types: Option<Vec<String>>,
	pub release_date: Option<Option<String>>,
	pub retirement_date: Option<Option<String>>,
	pub status: Option<Option<String>>,
}

pub type DataModelOrganisation = JsonValue;

pub struct DebugOptions {
	pub enabled: Option<bool>,
	pub return_upstream_request: Option<bool>,
	pub return_upstream_response: Option<bool>,
	pub trace: Option<bool>,
	pub trace_level: Option<String>,
}

pub struct DeletedResponse {
	pub deleted: String,
}

pub struct Embedding {
	pub embedding: Option<Vec<f64>>,
	pub index: Option<i64>,
	pub object: Option<String>,
}

pub struct EmbeddingsMultimodalInput {
	pub content: Vec<String>,
}

pub struct EmbeddingsRequest {
	pub debug: Option<HashMap<String, String>>,
	pub dimensions: Option<i64>,
	pub encoding_format: Option<String>,
	pub input: String,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub user: Option<String>,
}

pub struct EmbeddingsResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub model: Option<String>,
	pub object: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ErrorFailureSampleItem {
	pub provider: Option<Option<String>>,
	pub retryable: Option<Option<bool>>,
	pub status: Option<Option<i64>>,
	pub r#type: Option<Option<String>>,
	pub upstream_error_code: Option<Option<String>>,
	pub upstream_error_description: Option<Option<String>>,
	pub upstream_error_message: Option<Option<String>>,
	pub upstream_error_param: Option<Option<String>>,
	pub upstream_payload_preview: Option<Option<String>>,
}

pub struct ErrorProviderCandidateDiagnostics {
	pub candidateCount: Option<i64>,
	pub droppedMissingAdapter: Option<Vec<HashMap<String, String>>>,
	pub droppedUnsupportedEndpoint: Option<Vec<String>>,
	pub supportsEndpointCount: Option<i64>,
	pub totalProviders: Option<i64>,
}

pub struct ErrorProviderEnablementDiagnostics {
	pub capability: Option<String>,
	pub dropped: Option<Vec<HashMap<String, String>>>,
	pub providersAfter: Option<Vec<String>>,
	pub providersBefore: Option<Vec<String>>,
}

pub struct ErrorProviderFailureDiagnostics {
	pub category: Option<String>,
	pub hint: Option<String>,
	pub provider: Option<Option<String>>,
}

pub struct ErrorResponse {
	pub attempt_count: Option<i64>,
	pub description: Option<String>,
	pub details: Option<Vec<HashMap<String, String>>>,
	pub error: String,
	pub error_origin: Option<String>,
	pub error_type: Option<String>,
	pub failed_providers: Option<Vec<String>>,
	pub failed_statuses: Option<Vec<i64>>,
	pub failure_sample: Option<Vec<HashMap<String, String>>>,
	pub generation_id: Option<String>,
	pub message: Option<String>,
	pub missing_pricing_providers: Option<Vec<String>>,
	pub ok: Option<bool>,
	pub provider_candidate_diagnostics: Option<HashMap<String, String>>,
	pub provider_enablement: Option<HashMap<String, String>>,
	pub provider_failure_diagnostics: Option<HashMap<String, String>>,
	pub provider_payment_required_provider: Option<String>,
	pub provider_payment_required_support_notice: Option<String>,
	pub reason: Option<String>,
	pub routing_diagnostics: Option<HashMap<String, String>>,
	pub status_code: Option<i64>,
	pub upstream_error: Option<HashMap<String, String>>,
}

pub struct ErrorRoutingDiagnostics {
	pub filterStages: Option<Vec<HashMap<String, String>>>,
}

pub struct ErrorUpstreamError {
	pub code: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub message: Option<Option<String>>,
	pub param: Option<Option<String>>,
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

pub struct FunctionToolDefinition {
	pub function: HashMap<String, String>,
	pub r#type: String,
}

pub struct GatewayAdvisorToolDefinition {
	pub forward_transcript: Option<bool>,
	pub instructions: Option<String>,
	pub max_completion_tokens: Option<i64>,
	pub max_tokens: Option<i64>,
	pub max_uses: Option<i64>,
	pub model: Option<String>,
	pub name: Option<String>,
	pub parameters: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub temperature: Option<f64>,
	pub r#type: String,
}

pub struct GatewayApplyPatchToolDefinition {
	pub r#type: String,
}

pub struct GatewayDatetimeToolDefinition {
	pub parameters: Option<HashMap<String, String>>,
	pub timezone: Option<String>,
	pub r#type: String,
}

pub struct GatewayImageGenerationToolDefinition {
	pub aspect_ratio: Option<String>,
	pub background: Option<String>,
	pub description: Option<String>,
	pub model: Option<String>,
	pub moderation: Option<String>,
	pub output_compression: Option<i64>,
	pub output_format: Option<String>,
	pub parameters: Option<HashMap<String, String>>,
	pub prompt: Option<String>,
	pub quality: Option<String>,
	pub size: Option<String>,
	pub r#type: String,
}

pub struct GatewayModelsResponse {
	pub availability_mode: String,
	pub limit: i64,
	pub models: Vec<HashMap<String, String>>,
	pub offset: i64,
	pub ok: bool,
	pub privacy_scope: String,
	pub total: i64,
}

pub struct GatewayWebFetchToolDefinition {
	pub max_chars: Option<i64>,
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct GatewayWebSearchToolDefinition {
	pub include_highlights: Option<bool>,
	pub include_text: Option<bool>,
	pub max_results: Option<i64>,
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct GenerationResponse {
	pub app_id: Option<Option<String>>,
	pub byok: Option<bool>,
	pub cost_nanos: Option<f64>,
	pub created_at: Option<String>,
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
	pub replay_request: Option<Option<HashMap<String, String>>>,
	pub replay_supported: Option<bool>,
	pub request_id: Option<String>,
	pub status_code: Option<f64>,
	pub stream: Option<bool>,
	pub success: Option<bool>,
	pub team_id: Option<String>,
	pub throughput: Option<Option<f64>>,
	pub usage: Option<Option<HashMap<String, String>>>,
}

pub struct Image {
	pub b64_json: Option<String>,
	pub revised_prompt: Option<String>,
	pub url: Option<String>,
}

pub struct ImageConfig {
	pub aspect_ratio: Option<String>,
	pub font_inputs: Option<Vec<HashMap<String, String>>>,
	pub image_size: Option<String>,
	pub include_rai_reason: Option<bool>,
	pub reference_images: Option<Vec<HashMap<String, String>>>,
	pub super_resolution_references: Option<Vec<String>>,
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

pub struct InvalidRequestResponse {
	pub error: String,
	pub max_offset: Option<i64>,
	pub message: String,
	pub ok: String,
}

pub struct KeyInvalidateResponse {
	pub cache_version: HashMap<String, String>,
	pub key: HashMap<String, String>,
	pub message: String,
	pub ok: String,
}

pub type KnownModelId = JsonValue;

pub struct ListFilesResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub object: Option<String>,
}

pub struct ManagementKeyCreateRequest {
	pub created_by: Option<String>,
	pub name: String,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
	pub status: Option<String>,
	pub team_id: Option<String>,
}

pub struct ManagementKeyCreateResponse {
	pub key: HashMap<String, String>,
	pub ok: String,
}

pub struct ManagementKeyDeleteResponse {
	pub message: String,
	pub ok: String,
}

pub struct ManagementKeyDetailResponse {
	pub key: HashMap<String, String>,
	pub ok: String,
}

pub struct ManagementKeyListResponse {
	pub keys: Vec<HashMap<String, String>>,
	pub limit: i64,
	pub offset: i64,
	pub ok: String,
	pub total: i64,
}

pub struct ManagementKeyUpdateRequest {
	pub name: Option<String>,
	pub soft_blocked: Option<bool>,
	pub status: Option<String>,
}

pub struct ManagementKeyUpdateResponse {
	pub message: String,
	pub ok: String,
}

pub type MessageContentPart = JsonValue;

pub struct Model {
	pub aliases: Option<Vec<String>>,
	pub architecture: Option<HashMap<String, String>>,
	pub availability: Option<HashMap<String, String>>,
	pub canonical_slug: Option<String>,
	pub created: Option<Option<i64>>,
	pub deprecation_date: Option<Option<String>>,
	pub description: Option<String>,
	pub endpoints: Option<Vec<String>>,
	pub id: Option<String>,
	pub input_types: Option<Vec<String>>,
	pub lifecycle: Option<ModelLifecycle>,
	pub model_id: Option<String>,
	pub name: Option<Option<String>>,
	pub organisation_colour: Option<Option<String>>,
	pub organisation_id: Option<Option<String>>,
	pub organisation_name: Option<Option<String>>,
	pub output_types: Option<Vec<String>>,
	pub per_request_limits: Option<Option<HashMap<String, String>>>,
	pub pricing: Option<HashMap<String, String>>,
	pub pricing_detail: Option<HashMap<String, String>>,
	pub providers: Option<Vec<HashMap<String, String>>>,
	pub release_date: Option<Option<String>>,
	pub retirement_date: Option<Option<String>>,
	pub status: Option<Option<String>>,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_params: Option<Vec<String>>,
	pub top_provider: Option<HashMap<String, String>>,
	pub top_provider_id: Option<Option<String>>,
}

pub struct ModelAvailability {
	pub active_provider_count: i64,
	pub inactive_provider_count: i64,
	pub provider_count: i64,
	pub status: String,
}

pub type ModelId = JsonValue;

pub struct ModelLifecycle {
	pub deprecation_date: Option<Option<String>>,
	pub message: Option<Option<String>>,
	pub replacement_model_id: Option<Option<String>>,
	pub retirement_date: Option<Option<String>>,
	pub status: Option<Option<String>>,
}

pub struct ModelProviderAvailability {
	pub api_provider_id: String,
	pub api_provider_name: Option<Option<String>>,
	pub availability_reason: String,
	pub availability_status: String,
	pub capability_status: String,
	pub effective_from: Option<Option<String>>,
	pub effective_to: Option<Option<String>>,
	pub endpoints: Vec<String>,
	pub is_active_gateway: bool,
	pub model_routing_status: String,
	pub params: Vec<String>,
	pub provider_routing_status: String,
	pub provider_status: String,
}

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
	pub echo_upstream_request: Option<bool>,
	pub elevenlabs: Option<HashMap<String, String>>,
	pub format: Option<String>,
	pub model: String,
	pub prompt: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub suno: Option<HashMap<String, String>>,
}

pub struct MusicGenerateResponse {
}

pub struct NotImplementedResponse {
	pub description: String,
	pub error: String,
	pub status_code: i64,
}

pub struct OcrRequest {
	pub debug: Option<HashMap<String, String>>,
	pub echo_upstream_request: Option<bool>,
	pub image: String,
	pub language: Option<String>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
}

pub struct OcrResponse {
}

pub type OrganisationId = JsonValue;

pub type OrganisationIdList = JsonValue;

pub struct Provider {
	pub api_provider_id: Option<String>,
	pub api_provider_name: Option<Option<String>>,
	pub country_code: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub link: Option<Option<String>>,
}

pub struct ProviderOptions {
	pub anthropic: Option<HashMap<String, String>>,
	pub google: Option<HashMap<String, String>>,
	pub openai: Option<HashMap<String, String>>,
}

pub struct ProviderRoutingOptions {
	pub allow_fallbacks: Option<Option<bool>>,
	pub data_collection: Option<Option<String>>,
	pub enforce_distillable_text: Option<Option<bool>>,
	pub ignore: Option<Vec<String>>,
	pub include_alpha: Option<bool>,
	pub max_price: Option<HashMap<String, String>>,
	pub only: Option<Vec<String>>,
	pub order: Option<Vec<String>>,
	pub preferred_max_latency: Option<String>,
	pub preferred_min_throughput: Option<String>,
	pub quantizations: Option<Option<Vec<String>>>,
	pub require_parameters: Option<Option<bool>>,
	pub require_zero_data_retention: Option<Option<bool>>,
	pub required_data_region: Option<Option<String>>,
	pub required_execution_region: Option<Option<String>>,
	pub sort: Option<String>,
	pub zdr: Option<Option<bool>>,
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

pub struct RealtimeNotImplementedResponse {
	pub error: HashMap<String, String>,
}

pub struct ReasoningConfig {
	pub effort: Option<String>,
	pub enabled: Option<bool>,
	pub max_tokens: Option<i64>,
	pub summary: Option<String>,
}

pub type RerankDocument = JsonValue;

pub struct RerankRequest {
	pub debug: Option<HashMap<String, String>>,
	pub documents: String,
	pub max_chunks_per_doc: Option<i64>,
	pub metadata: Option<HashMap<String, String>>,
	pub model: String,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub query: String,
	pub rank_fields: Option<Vec<String>>,
	pub return_documents: Option<bool>,
	pub top_k: Option<i64>,
	pub top_n: Option<i64>,
	pub user: Option<String>,
}

pub struct RerankResponse {
	pub id: Option<String>,
	pub model: Option<String>,
	pub nativeResponseId: Option<Option<String>>,
	pub object: Option<String>,
	pub results: Option<Vec<HashMap<String, String>>>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct RerankResult {
	pub document: Option<String>,
	pub index: Option<i64>,
	pub relevance_score: Option<f64>,
}

pub struct ResponsesInputItem {
	pub content: Option<String>,
	pub role: Option<String>,
	pub r#type: Option<String>,
}

pub struct ResponsesOutputAudioPart {
	pub audio_url: Option<HashMap<String, String>>,
	pub b64_json: Option<String>,
	pub format: Option<String>,
	pub mime_type: Option<String>,
	pub r#type: String,
}

pub type ResponsesOutputContentPart = JsonValue;

pub struct ResponsesOutputImagePart {
	pub b64_json: Option<String>,
	pub image_url: Option<HashMap<String, String>>,
	pub mime_type: Option<String>,
	pub r#type: String,
}

pub struct ResponsesOutputItem {
	pub arguments: Option<String>,
	pub call_id: Option<String>,
	pub content: Option<Vec<String>>,
	pub name: Option<String>,
	pub role: Option<String>,
	pub r#type: Option<String>,
}

pub struct ResponsesOutputTextPart {
	pub annotations: Option<Vec<HashMap<String, String>>>,
	pub text: String,
	pub r#type: String,
}

pub struct ResponsesRequest {
	pub background: Option<bool>,
	pub debug: Option<HashMap<String, String>>,
	pub echo_upstream_request: Option<bool>,
	pub image_config: Option<HashMap<String, String>>,
	pub include: Option<Vec<String>>,
	pub input: String,
	pub instructions: Option<String>,
	pub max_output_tokens: Option<i64>,
	pub meta: Option<bool>,
	pub metadata: Option<HashMap<String, String>>,
	pub modalities: Option<Vec<String>>,
	pub model: String,
	pub parallel_tool_calls: Option<bool>,
	pub previous_response_id: Option<String>,
	pub prompt_cache_key: Option<Option<String>>,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub safety_identifier: Option<Option<String>>,
	pub service_tier: Option<String>,
	pub session_id: Option<String>,
	pub store: Option<bool>,
	pub stream: Option<bool>,
	pub temperature: Option<f64>,
	pub text: Option<HashMap<String, String>>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<String>>,
	pub top_p: Option<f64>,
	pub truncation: Option<String>,
	pub usage: Option<bool>,
	pub user: Option<String>,
}

pub struct ResponsesResponse {
	pub content: Option<Vec<HashMap<String, String>>>,
	pub created: Option<i64>,
	pub id: Option<String>,
	pub model: Option<String>,
	pub object: Option<String>,
	pub output: Option<Vec<HashMap<String, String>>>,
	pub output_items: Option<Vec<HashMap<String, String>>>,
	pub role: Option<String>,
	pub stop_reason: Option<String>,
	pub r#type: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct ResponsesWebSocketCreateEvent {
	pub input: Option<String>,
	pub model: String,
	pub previous_response_id: Option<Option<String>>,
	pub store: Option<bool>,
	pub tool_choice: Option<String>,
	pub tools: Option<Vec<HashMap<String, String>>>,
	pub r#type: String,
}

pub struct ResponsesWebSocketServerEvent {
	pub error: Option<HashMap<String, String>>,
	pub response: Option<HashMap<String, String>>,
	pub status: Option<i64>,
	pub r#type: Option<String>,
}

pub struct ResponsesWebSocketUpgradeRequiredResponse {
	pub error: Option<HashMap<String, String>>,
}

pub struct ServerToolUsage {
	pub advisor_requests: Option<i64>,
	pub apply_patch_requests: Option<i64>,
	pub datetime_requests: Option<i64>,
	pub image_generation_requests: Option<i64>,
	pub web_fetch_requests: Option<i64>,
	pub web_search_extra_results: Option<i64>,
	pub web_search_requests: Option<i64>,
	pub web_search_results: Option<i64>,
}

pub struct TextContentPart {
	pub text: String,
	pub r#type: String,
}

pub type TextGenerateTool = JsonValue;

pub struct TextModerationInput {
	pub text: String,
	pub r#type: String,
}

pub type TextToolChoice = JsonValue;

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
	pub completion_tokens: Option<i64>,
	pub prompt_tokens: Option<i64>,
	pub server_tool_use: Option<HashMap<String, String>>,
	pub total_tokens: Option<i64>,
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
	pub compression_quality: Option<i64>,
	pub duration: Option<i64>,
	pub enhance_prompt: Option<bool>,
	pub generate_audio: Option<bool>,
	pub input_references: Option<Vec<HashMap<String, String>>>,
	pub model: String,
	pub negative_prompt: Option<String>,
	pub output: Option<HashMap<String, String>>,
	pub person_generation: Option<String>,
	pub prompt: String,
	pub provider: Option<HashMap<String, String>>,
	pub provider_params: Option<HashMap<String, String>>,
	pub resize_mode: Option<String>,
	pub resolution: Option<String>,
	pub sample_count: Option<i64>,
	pub seed: Option<i64>,
	pub size: Option<String>,
	pub webhook: Option<HashMap<String, String>>,
}

pub struct VideoGenerationResponse {
	pub asset: Option<Option<HashMap<String, String>>>,
	pub audio: Option<bool>,
	pub billing: Option<HashMap<String, String>>,
	pub completed_at: Option<Option<String>>,
	pub content_url: Option<String>,
	pub created_at: Option<String>,
	pub download_url: Option<Option<String>>,
	pub error: Option<Option<String>>,
	pub expires_at: Option<Option<i64>>,
	pub generation_id: Option<Option<String>>,
	pub id: Option<String>,
	pub model: Option<String>,
	pub object: Option<String>,
	pub output_access: Option<String>,
	pub outputs: Option<Vec<HashMap<String, String>>>,
	pub poll_after_seconds: Option<i64>,
	pub polling_url: Option<String>,
	pub progress: Option<Option<i64>>,
	pub progress_source: Option<String>,
	pub provider: Option<String>,
	pub request_id: Option<String>,
	pub seconds: Option<f64>,
	pub session_id: Option<String>,
	pub size: Option<String>,
	pub started_at: Option<Option<String>>,
	pub status: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct VideoInputReference {
	pub image_url: Option<HashMap<String, String>>,
	pub reference_type: Option<String>,
	pub role: Option<String>,
	pub r#type: String,
}

pub struct VideoOutput {
	pub bytes_available: Option<bool>,
	pub content_url: Option<String>,
	pub download_url: Option<String>,
	pub expires_at: Option<i64>,
	pub index: Option<i64>,
	pub mime_type: Option<String>,
}

pub struct VideoOutputConfig {
	pub access: Option<String>,
}

pub struct Workspace {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub id: String,
	pub name: Option<String>,
	pub slug: Option<String>,
	pub updated_at: Option<String>,
}

pub struct WorkspaceActivityEntry {
	pub cost_cents: f64,
	pub endpoint: Option<String>,
	pub latency_ms: Option<i64>,
	pub model: Option<String>,
	pub provider: Option<String>,
	pub request_id: Option<String>,
	pub timestamp: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct WorkspaceActivityResponse {
	pub activity: Vec<HashMap<String, String>>,
	pub limit: i64,
	pub offset: i64,
	pub ok: String,
	pub period_days: i64,
	pub total: i64,
	pub total_cost_cents: f64,
}

pub struct WorkspaceCreateRequest {
	pub name: String,
	pub slug: Option<String>,
}

pub struct WorkspaceListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct WorkspaceResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceUpdateRequest {
	pub name: Option<String>,
	pub slug: Option<String>,
}
