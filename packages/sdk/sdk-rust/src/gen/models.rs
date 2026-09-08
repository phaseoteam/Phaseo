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
	pub ok: bool,
}

pub struct AnalyticsNotImplementedResponse {
	pub message: String,
	pub ok: bool,
	pub status: String,
}

pub struct AnalyticsResponse {
	pub data: Vec<HashMap<String, String>>,
	pub limit: i64,
	pub offset: i64,
	pub total_count: i64,
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
	pub r#async: Option<bool>,
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
	pub creator_user_id: Option<String>,
	pub disabled: bool,
	pub expires_at: Option<String>,
	pub hash: String,
	pub id: String,
	pub include_byok_in_limit: bool,
	pub label: Option<String>,
	pub last_used_at: Option<String>,
	pub limit: Option<f64>,
	pub limit_remaining: Option<f64>,
	pub limit_reset: Option<String>,
	pub limits: HashMap<String, String>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: String,
	pub soft_blocked: bool,
	pub status: Option<String>,
	pub updated_at: Option<String>,
	pub usage: f64,
	pub usage_daily: f64,
	pub usage_details: HashMap<String, String>,
	pub usage_monthly: f64,
	pub usage_weekly: f64,
	pub workspace_id: String,
}

pub struct ApiKeyCreateRequest {
	pub disabled: Option<bool>,
	pub expires_at: Option<Option<String>>,
	pub include_byok_in_limit: Option<bool>,
	pub limit: Option<Option<f64>>,
	pub limit_reset: Option<String>,
	pub limits: Option<HashMap<String, String>>,
	pub name: String,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
	pub workspace_id: Option<String>,
}

pub struct ApiKeyLimitBucket {
	pub cost: Option<f64>,
	pub requests: Option<i64>,
}

pub struct ApiKeyLimitInputBucket {
	pub cost: Option<Option<f64>>,
	pub requests: Option<Option<i64>>,
}

pub struct ApiKeyLimitInputWindows {
	pub daily: Option<HashMap<String, String>>,
	pub monthly: Option<HashMap<String, String>>,
	pub weekly: Option<HashMap<String, String>>,
}

pub struct ApiKeyLimitWindows {
	pub daily: HashMap<String, String>,
	pub monthly: HashMap<String, String>,
	pub weekly: HashMap<String, String>,
}

pub struct ApiKeyListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct ApiKeyResponse {
	pub data: HashMap<String, String>,
}

pub struct ApiKeyRotateRequest {
	pub name: Option<String>,
	pub previous_key_expires_at: Option<Option<String>>,
}

pub struct ApiKeyRotateResponse {
	pub data: HashMap<String, String>,
	pub previous_key_expires_at: Option<String>,
}

pub type ApiKeyScopeValue = JsonValue;

pub struct ApiKeyUpdateRequest {
	pub disabled: Option<bool>,
	pub expires_at: Option<Option<String>>,
	pub include_byok_in_limit: Option<bool>,
	pub limit: Option<Option<f64>>,
	pub limit_reset: Option<String>,
	pub limits: Option<HashMap<String, String>>,
	pub name: Option<String>,
	pub scopes: Option<String>,
	pub soft_blocked: Option<bool>,
}

pub struct ApiKeyUsageBucket {
	pub cost: f64,
	pub requests: i64,
}

pub struct ApiKeyUsageWindows {
	pub daily: HashMap<String, String>,
	pub monthly: HashMap<String, String>,
	pub total: HashMap<String, String>,
	pub weekly: HashMap<String, String>,
}

pub struct ApiKeyWithValue {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub creator_user_id: Option<String>,
	pub disabled: bool,
	pub expires_at: Option<String>,
	pub hash: String,
	pub id: String,
	pub include_byok_in_limit: bool,
	pub key: String,
	pub label: Option<String>,
	pub last_used_at: Option<String>,
	pub limit: Option<f64>,
	pub limit_remaining: Option<f64>,
	pub limit_reset: Option<String>,
	pub limits: HashMap<String, String>,
	pub name: Option<String>,
	pub prefix: Option<String>,
	pub scopes: String,
	pub soft_blocked: bool,
	pub status: Option<String>,
	pub updated_at: Option<String>,
	pub usage: f64,
	pub usage_daily: f64,
	pub usage_details: HashMap<String, String>,
	pub usage_monthly: f64,
	pub usage_weekly: f64,
	pub workspace_id: String,
}

pub struct ApiKeyWithValueResponse {
	pub data: HashMap<String, String>,
}

pub struct AsyncJobWebSocketClientEvent {
	pub r#type: String,
}

pub struct AsyncJobWebSocketServerEvent {
	pub data: Option<Option<String>>,
	pub r#type: String,
}

pub struct AsyncJobWebSocketUpgradeRequiredResponse {
	pub error: Option<HashMap<String, String>>,
}

pub struct AsyncWebhookDeliveryAttempt {
	pub attempt_number: Option<i64>,
	pub delivered_at: Option<Option<String>>,
	pub delivery_key: Option<String>,
	pub error_message: Option<Option<String>>,
	pub event_type: Option<String>,
	pub id: Option<String>,
	pub max_attempts: Option<i64>,
	pub next_retry_at: Option<Option<String>>,
	pub response_body_preview: Option<Option<String>>,
	pub response_status: Option<Option<i64>>,
	pub status: Option<String>,
	pub tried_at: Option<String>,
}

pub struct AsyncWebhookDeliverySummary {
	pub delivered_event_types: Option<Vec<String>>,
	pub delivered_events: Option<i64>,
	pub last_attempt_at: Option<Option<String>>,
	pub last_attempt_status: Option<Option<String>>,
	pub last_delivered_at: Option<Option<String>>,
	pub last_error_message: Option<Option<String>>,
	pub last_failure_at: Option<Option<String>>,
	pub last_response_status: Option<Option<i64>>,
	pub next_retry_at: Option<Option<String>>,
	pub pending_retries: Option<i64>,
	pub total_attempts: Option<i64>,
}

pub struct AsyncWebhookPublicState {
	pub attempts: Option<Vec<HashMap<String, String>>>,
	pub delivery: Option<HashMap<String, String>>,
	pub events: Option<Vec<String>>,
	pub has_secret: Option<bool>,
	pub url: Option<Option<String>>,
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
	pub chunking_strategy: Option<String>,
	pub known_speaker_names: Option<Vec<String>>,
	pub known_speaker_references: Option<Vec<String>>,
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
	pub cost_nanos: Option<Option<i64>>,
	pub cost_usd: Option<Option<f64>>,
	pub currency: Option<String>,
	pub estimated_nanos: Option<Option<i64>>,
	pub estimated_provider_cost: Option<Option<String>>,
	pub estimated_user_cost: Option<Option<String>>,
	pub estimation_sample_size: Option<Option<i64>>,
	pub estimation_total_rows: Option<Option<i64>>,
	pub estimation_truncated: Option<Option<bool>>,
	pub finalized_at: Option<Option<String>>,
	pub pricing_breakdown: Option<HashMap<String, String>>,
	pub reason: Option<String>,
	pub reservation_id: Option<Option<String>>,
	pub reservation_status: Option<Option<String>>,
	pub reserved_nanos: Option<Option<i64>>,
	pub settled_provider_cost: Option<Option<String>>,
	pub settled_user_cost: Option<Option<String>>,
	pub state: Option<String>,
	pub total_nanos: Option<Option<i64>>,
}

pub struct BatchListResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub first_id: Option<Option<String>>,
	pub has_more: Option<bool>,
	pub last_id: Option<Option<String>>,
	pub object: Option<String>,
}

pub struct BatchModelCapability {
	pub input_types: Option<Vec<String>>,
	pub model: Option<String>,
	pub name: Option<String>,
	pub output_types: Option<Vec<String>>,
	pub pricing: Option<HashMap<String, String>>,
	pub providers: Option<Vec<HashMap<String, String>>>,
	pub status: Option<String>,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_parameters_detail: Option<HashMap<String, String>>,
	pub supported_params: Option<Vec<String>>,
	pub supported_params_detail: Option<HashMap<String, String>>,
}

pub struct BatchModelProviderCapability {
	pub id: Option<String>,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_parameters_detail: Option<HashMap<String, String>>,
	pub supported_params: Option<Vec<String>>,
	pub supported_params_detail: Option<HashMap<String, String>>,
}

pub struct BatchModelsResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub object: Option<String>,
}

pub struct BatchProviderCapability {
	pub documentation_url: Option<String>,
	pub endpoints: Option<Vec<HashMap<String, String>>>,
	pub gateway_input_modes: Option<Vec<String>>,
	pub id: Option<String>,
	pub name: Option<String>,
	pub native_input_modes: Option<Vec<String>>,
	pub notes: Option<Option<String>>,
	pub status: Option<String>,
}

pub struct BatchRequest {
	pub completion_window: Option<String>,
	pub debug: Option<HashMap<String, String>>,
	pub endpoint: Option<String>,
	pub input_file_id: Option<String>,
	pub items: Option<Vec<HashMap<String, String>>>,
	pub max_tokens: Option<i64>,
	pub metadata: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub prompts: Option<Vec<String>>,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
	pub requests: Option<Vec<HashMap<String, String>>>,
	pub session_id: Option<String>,
	pub system: Option<String>,
	pub temperature: Option<f64>,
	pub webhook: Option<HashMap<String, String>>,
	pub webhook_endpoint_id: Option<String>,
}

pub struct BatchRequestCounts {
	pub completed: Option<i64>,
	pub failed: Option<i64>,
	pub total: Option<i64>,
}

pub struct BatchRequestItem {
	pub body: HashMap<String, String>,
	pub custom_id: Option<String>,
	pub method: Option<String>,
	pub url: Option<String>,
}

pub struct BatchRequestRow {
	pub completed_at: Option<Option<String>>,
	pub cost_nanos: Option<Option<i64>>,
	pub cost_usd: Option<Option<f64>>,
	pub created_at: Option<Option<String>>,
	pub custom_id: Option<String>,
	pub endpoint: Option<Option<String>>,
	pub error_body: Option<Option<HashMap<String, String>>>,
	pub id: Option<String>,
	pub meta: Option<HashMap<String, String>>,
	pub method: Option<Option<String>>,
	pub model: Option<Option<String>>,
	pub native_batch_id: Option<Option<String>>,
	pub provider: Option<String>,
	pub request_body_hash: Option<Option<String>>,
	pub request_index: Option<i64>,
	pub response_body: Option<Option<HashMap<String, String>>>,
	pub response_status: Option<Option<i64>>,
	pub status: Option<String>,
	pub updated_at: Option<Option<String>>,
	pub usage: Option<Option<HashMap<String, String>>>,
}

pub struct BatchResponse {
	pub billing: Option<HashMap<String, String>>,
	pub cancel_url: Option<Option<String>>,
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
	pub finalized_at: Option<Option<String>>,
	pub finalizing_at: Option<i64>,
	pub id: Option<String>,
	pub in_progress_at: Option<i64>,
	pub input_file_id: Option<String>,
	pub last_webhook_dispatched_at: Option<Option<String>>,
	pub last_webhook_progress: Option<Option<f64>>,
	pub last_webhook_progress_at: Option<Option<String>>,
	pub lifecycle_status: Option<String>,
	pub metadata: Option<HashMap<String, String>>,
	pub native_batch_id: Option<Option<String>>,
	pub next_webhook_retry_at: Option<Option<String>>,
	pub object: Option<String>,
	pub output_file_id: Option<String>,
	pub polling_url: Option<String>,
	pub pricing_lines: Option<Vec<HashMap<String, String>>>,
	pub progress: Option<i64>,
	pub provider: Option<String>,
	pub request_counts: Option<HashMap<String, String>>,
	pub request_id: Option<String>,
	pub results_url: Option<Option<String>>,
	pub session_id: Option<String>,
	pub status: Option<String>,
	pub usage: Option<HashMap<String, String>>,
	pub webhook: Option<HashMap<String, String>>,
	pub websocket_url: Option<String>,
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
	pub provider: Option<String>,
	pub provider_options: Option<HashMap<String, String>>,
	pub reasoning: Option<HashMap<String, String>>,
	pub reasoning_effort: Option<String>,
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
	pub ok: bool,
}

pub struct DataContributionCategories {
}

pub struct DataContributionClassifier {
	pub categories: HashMap<String, String>,
	pub created_at: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub enabled: bool,
	pub id: String,
	pub instructions: String,
	pub kind: String,
	pub model: String,
	pub name: String,
	pub sample_rate_bps: i64,
	pub service_tier: String,
	pub slug: String,
	pub updated_at: Option<Option<String>>,
}

pub struct DataContributionClassifierCreateRequest {
	pub categories: HashMap<String, String>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub instructions: String,
	pub model: Option<String>,
	pub name: String,
	pub sampleRateBps: Option<i64>,
	pub serviceTier: Option<String>,
	pub slug: Option<String>,
}

pub struct DataContributionClassifierDeleteResponse {
	pub data: HashMap<String, String>,
}

pub struct DataContributionClassifierInput {
	pub categories: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub instructions: Option<String>,
	pub model: Option<String>,
	pub name: Option<String>,
	pub sampleRateBps: Option<i64>,
	pub serviceTier: Option<String>,
}

pub struct DataContributionClassifierResponse {
	pub data: HashMap<String, String>,
}

pub struct DataContributionClassifierUpdateRequest {
	pub categories: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub instructions: Option<String>,
	pub model: Option<String>,
	pub name: Option<String>,
	pub sampleRateBps: Option<i64>,
	pub serviceTier: Option<String>,
}

pub struct DataContributionConsentRequest {
	pub enabled: bool,
	pub reason: Option<String>,
}

pub struct DataContributionConsentResponse {
	pub data: HashMap<String, String>,
}

pub struct DataContributionOverviewResponse {
	pub data: HashMap<String, String>,
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
	pub deleted: bool,
}

pub struct DynamicRoute {
	pub config: HashMap<String, String>,
	pub created_at: Option<Option<String>>,
	pub deployed_version: Option<Option<i64>>,
	pub description: Option<Option<String>>,
	pub id: String,
	pub key_ids: Vec<String>,
	pub name: String,
	pub slug: String,
	pub status: String,
	pub updated_at: Option<Option<String>>,
	pub version: i64,
	pub versions: Vec<HashMap<String, String>>,
	pub workspace_id: String,
}

pub struct DynamicRouteAction {
	pub allowFallbacks: Option<bool>,
	pub model: Option<String>,
	pub modelFallbacks: Option<Vec<String>>,
	pub providerIgnore: Option<Vec<String>>,
	pub providerOnly: Option<Vec<String>>,
	pub providerOrder: Option<Vec<String>>,
	pub routingMode: Option<String>,
}

pub struct DynamicRouteCondition {
	pub field: String,
	pub metadataKey: Option<Option<String>>,
	pub operator: String,
	pub value: Option<Option<String>>,
}

pub struct DynamicRouteConfig {
	pub cacheAwareRouting: Option<bool>,
	pub defaultAction: Option<HashMap<String, String>>,
	pub edges: Option<Vec<HashMap<String, String>>>,
	pub entryNodeId: Option<Option<String>>,
	pub nodes: Option<Vec<HashMap<String, String>>>,
	pub rules: Option<Vec<HashMap<String, String>>>,
	pub schemaVersion: Option<String>,
	pub sessionAffinity: Option<bool>,
}

pub struct DynamicRouteCreateRequest {
	pub config: HashMap<String, String>,
	pub description: Option<Option<String>>,
	pub name: String,
	pub slug: Option<String>,
	pub status: Option<String>,
}

pub struct DynamicRouteDeleteResponse {
	pub data: HashMap<String, String>,
}

pub struct DynamicRouteDeployResponse {
	pub data: HashMap<String, String>,
}

pub struct DynamicRouteEdge {
	pub id: String,
	pub source: String,
	pub sourceHandle: Option<Option<String>>,
	pub target: String,
}

pub struct DynamicRouteKeysResponse {
	pub data: HashMap<String, String>,
}

pub struct DynamicRouteKeysUpdateRequest {
	pub key_ids: Vec<String>,
}

pub struct DynamicRouteListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct DynamicRouteNode {
	pub data: HashMap<String, String>,
	pub id: String,
	pub position: Option<Option<HashMap<String, String>>>,
	pub r#type: String,
}

pub struct DynamicRouteResponse {
	pub data: HashMap<String, String>,
}

pub struct DynamicRouteRule {
	pub action: HashMap<String, String>,
	pub condition: HashMap<String, String>,
	pub enabled: bool,
	pub id: String,
	pub name: String,
}

pub struct DynamicRouteUpdateRequest {
	pub config: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub name: Option<String>,
	pub status: Option<String>,
}

pub struct DynamicRouteVersion {
	pub created_at: Option<Option<String>>,
	pub created_by: Option<Option<String>>,
	pub status: String,
	pub version: i64,
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

pub struct EndpointCatalogueEntry {
	pub capability_id: String,
	pub collection: String,
	pub id: String,
	pub model_count: i64,
	pub provider_count: i64,
	pub public_path: String,
}

pub struct EndpointCatalogueResponse {
	pub data: Vec<HashMap<String, String>>,
	pub endpoints: Vec<String>,
	pub ok: bool,
	pub sample_models: Vec<String>,
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
	pub r#async: Option<bool>,
	pub function: HashMap<String, String>,
	pub r#type: String,
}

pub struct FusionToolDefinition {
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct GatewayCapabilities {
	pub endpoints: Option<Vec<String>>,
	pub parameter_details: HashMap<String, String>,
	pub parameters: Vec<String>,
}

pub type GatewayCapabilityStatus = JsonValue;

pub struct GatewayDatetimeToolDefinition {
	pub parameters: Option<HashMap<String, String>>,
	pub timezone: Option<String>,
	pub r#type: String,
}

pub struct GatewayFeedback {
	pub comment: Option<String>,
	pub created_at: String,
	pub created_by_user_id: Option<String>,
	pub end_user_id: Option<String>,
	pub id: String,
	pub metadata: HashMap<String, String>,
	pub metadata_dimensions: HashMap<String, String>,
	pub preset_id: Option<String>,
	pub rating: Option<String>,
	pub reason: Option<String>,
	pub reason_tags: Vec<String>,
	pub request_id: Option<String>,
	pub score: Option<f64>,
	pub session_id: Option<String>,
	pub source: String,
	pub test_run_id: Option<String>,
	pub workspace_id: String,
}

pub struct GatewayFeedbackCreateRequest {
	pub comment: Option<String>,
	pub end_user_id: Option<String>,
	pub metadata: Option<HashMap<String, String>>,
	pub metadata_dimensions: Option<HashMap<String, String>>,
	pub preset_id: Option<String>,
	pub rating: Option<String>,
	pub reason: Option<String>,
	pub reason_tags: Option<Vec<String>>,
	pub request_id: Option<String>,
	pub score: Option<f64>,
	pub session_id: Option<String>,
	pub source: Option<String>,
	pub test_run_id: Option<String>,
}

pub struct GatewayFeedbackListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct GatewayFeedbackResponse {
	pub data: HashMap<String, String>,
}

pub struct GatewayFeedbackSummaryResponse {
	pub data: Vec<HashMap<String, String>>,
	pub group_by: String,
}

pub struct GatewayFeedbackSummaryRow {
	pub average_score: Option<f64>,
	pub count: i64,
	pub last_feedback_at: Option<String>,
	pub metadata_key: Option<String>,
	pub metadata_value: Option<Option<String>>,
	pub negative: i64,
	pub partial: i64,
	pub positive: i64,
	pub preset_id: Option<Option<String>>,
	pub ratings: HashMap<String, String>,
	pub test_run_id: Option<Option<String>>,
}

pub struct GatewayModalities {
	pub input: Vec<String>,
	pub output: Vec<String>,
}

pub struct GatewayModelLifecycle {
	pub deprecated_at: Option<String>,
	pub message: Option<String>,
	pub released_at: Option<String>,
	pub replacement_id: Option<String>,
	pub retires_at: Option<String>,
	pub status: Option<String>,
}

pub struct GatewayModelLimits {
	pub input_tokens: Option<i64>,
	pub output_tokens: Option<i64>,
}

pub struct GatewayModelOffer {
	pub capabilities: HashMap<String, String>,
	pub effective: HashMap<String, String>,
	pub endpoints: Vec<String>,
	pub modalities: HashMap<String, String>,
	pub model: Option<String>,
	pub pricing: HashMap<String, String>,
	pub provider: HashMap<String, String>,
	pub routable: bool,
	pub routing: HashMap<String, String>,
	pub status: String,
	pub status_reason: String,
}

pub type GatewayModelOrganization = JsonValue;

pub struct GatewayModelsResponse {
	pub availability_mode: String,
	pub limit: i64,
	pub models: Vec<HashMap<String, String>>,
	pub offset: i64,
	pub ok: bool,
	pub total: i64,
}

pub struct GatewayObservabilityEvent {
	pub category: String,
	pub created_at: String,
	pub created_by_user_id: Option<String>,
	pub end_user_id: Option<String>,
	pub event_name: String,
	pub id: String,
	pub metadata: HashMap<String, String>,
	pub metadata_dimensions: HashMap<String, String>,
	pub numeric_value: Option<f64>,
	pub occurred_at: String,
	pub preset_id: Option<String>,
	pub request_id: Option<String>,
	pub session_id: Option<String>,
	pub source: String,
	pub test_run_id: Option<String>,
	pub value: Option<String>,
	pub workspace_id: String,
}

pub struct GatewayObservabilityEventCreateRequest {
	pub category: Option<String>,
	pub end_user_id: Option<String>,
	pub event_name: String,
	pub metadata: Option<HashMap<String, String>>,
	pub metadata_dimensions: Option<HashMap<String, String>>,
	pub numeric_value: Option<f64>,
	pub occurred_at: Option<String>,
	pub preset_id: Option<String>,
	pub request_id: Option<String>,
	pub session_id: Option<String>,
	pub source: Option<String>,
	pub test_run_id: Option<String>,
	pub value: Option<String>,
}

pub struct GatewayObservabilityEventListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct GatewayObservabilityEventResponse {
	pub data: HashMap<String, String>,
}

pub struct GatewayPricing {
	pub meters: HashMap<String, String>,
	pub pricing_plan: String,
}

pub type GatewayPricingMeter = JsonValue;

pub type GatewayProviderAvailabilityReason = JsonValue;

pub struct GatewayRequestLog {
	pub auth_method: Option<Option<String>>,
	pub byok: Option<Option<bool>>,
	pub canonical_model_id: Option<Option<String>>,
	pub cost_nanos: Option<Option<i64>>,
	pub created_at: Option<String>,
	pub currency: Option<Option<String>>,
	pub endpoint: Option<Option<String>>,
	pub error_code: Option<Option<String>>,
	pub finish_reason: Option<Option<String>>,
	pub generation_ms: Option<Option<f64>>,
	pub key_id: Option<Option<String>>,
	pub latency_ms: Option<Option<f64>>,
	pub location: Option<Option<String>>,
	pub model_id: Option<Option<String>>,
	pub native_response_id: Option<Option<String>>,
	pub oauth_client_id: Option<Option<String>>,
	pub pricing_lines: Option<Option<Vec<HashMap<String, String>>>>,
	pub provider: Option<Option<String>>,
	pub request_id: Option<String>,
	pub requested_model_id: Option<Option<String>>,
	pub routed_model_id: Option<Option<String>>,
	pub status_code: Option<Option<i64>>,
	pub stream: Option<Option<bool>>,
	pub success: Option<Option<bool>>,
	pub throughput: Option<Option<f64>>,
	pub usage: Option<Option<HashMap<String, String>>>,
}

pub struct GatewayRequestLogListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub from_time: String,
	pub limit: i64,
	pub offset: i64,
	pub ok: bool,
	pub to_time: Option<String>,
	pub total: i64,
}

pub struct GatewayRequestLogResponse {
	pub data: HashMap<String, String>,
	pub ok: bool,
}

pub type GatewayRoutingStatus = JsonValue;

pub struct GatewayWebFetchToolDefinition {
	pub max_chars: Option<i64>,
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct GatewayWebSearchToolDefinition {
	pub engine: Option<String>,
	pub include_highlights: Option<bool>,
	pub include_text: Option<bool>,
	pub language: Option<String>,
	pub max_results: Option<i64>,
	pub page: Option<i64>,
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

pub struct Guardrail {
	pub allowed_api_model_ids: Option<Option<Vec<String>>>,
	pub created_at: Option<Option<String>>,
	pub daily_limit_cost_nanos: Option<Option<i64>>,
	pub daily_limit_requests: Option<Option<i64>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<Option<bool>>,
	pub id: String,
	pub model_restriction_mode: Option<Option<String>>,
	pub monthly_limit_cost_nanos: Option<Option<i64>>,
	pub monthly_limit_requests: Option<Option<i64>>,
	pub name: String,
	pub privacy_enable_free_may_publish_prompts: Option<Option<bool>>,
	pub privacy_enable_free_may_train: Option<Option<bool>>,
	pub privacy_enable_input_output_logging: Option<Option<bool>>,
	pub privacy_enable_paid_may_train: Option<Option<bool>>,
	pub privacy_zdr_only: Option<Option<bool>>,
	pub prompt_injection_action: Option<Option<String>>,
	pub prompt_injection_enabled: Option<Option<bool>>,
	pub provider_restriction_enforce_allowed: Option<Option<bool>>,
	pub provider_restriction_mode: Option<Option<String>>,
	pub provider_restriction_provider_ids: Option<Option<Vec<String>>>,
	pub sensitive_info_default_action: Option<Option<String>>,
	pub sensitive_info_enabled: Option<Option<bool>>,
	pub sensitive_info_rules: Option<Option<Vec<HashMap<String, String>>>>,
	pub updated_at: Option<Option<String>>,
	pub weekly_limit_cost_nanos: Option<Option<i64>>,
	pub weekly_limit_requests: Option<Option<i64>>,
	pub workspace_id: String,
}

pub struct GuardrailBudgetInput {
	pub dailyCostNanos: Option<Option<i64>>,
	pub dailyRequests: Option<Option<i64>>,
	pub monthlyCostNanos: Option<Option<i64>>,
	pub monthlyRequests: Option<Option<i64>>,
	pub weeklyCostNanos: Option<Option<i64>>,
	pub weeklyRequests: Option<Option<i64>>,
}

pub struct GuardrailCreateRequest {
	pub allowedApiModelIds: Option<Vec<String>>,
	pub budgets: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub modelRestrictionMode: Option<String>,
	pub name: String,
	pub privacyEnableFreeMayPublishPrompts: Option<Option<bool>>,
	pub privacyEnableFreeMayTrain: Option<Option<bool>>,
	pub privacyEnableInputOutputLogging: Option<Option<bool>>,
	pub privacyEnablePaidMayTrain: Option<Option<bool>>,
	pub privacyZdrOnly: Option<Option<bool>>,
	pub promptInjectionAction: Option<String>,
	pub promptInjectionEnabled: Option<bool>,
	pub providerRestrictionEnforceAllowed: Option<bool>,
	pub providerRestrictionMode: Option<String>,
	pub providerRestrictionProviderIds: Option<Vec<String>>,
	pub sensitiveInfoDefaultAction: Option<String>,
	pub sensitiveInfoEnabled: Option<bool>,
	pub sensitiveInfoRules: Option<Vec<HashMap<String, String>>>,
}

pub struct GuardrailDeleteResponse {
	pub deleted: bool,
}

pub struct GuardrailDetailResponse {
	pub data: HashMap<String, String>,
}

pub struct GuardrailKeyAddResponse {
	pub added_count: i64,
	pub data: Vec<HashMap<String, String>>,
}

pub struct GuardrailKeyAssignment {
	pub created_at: Option<Option<String>>,
	pub key_id: String,
	pub name: Option<Option<String>>,
	pub prefix: Option<Option<String>>,
	pub status: Option<Option<String>>,
}

pub struct GuardrailKeyIdsReplaceRequest {
	pub key_ids: Vec<String>,
}

pub struct GuardrailKeyIdsRequest {
	pub key_ids: Vec<String>,
}

pub struct GuardrailKeyListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct GuardrailKeySetResponse {
	pub data: HashMap<String, String>,
}

pub struct GuardrailListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct GuardrailMemberAddResponse {
	pub added_count: i64,
	pub data: Vec<HashMap<String, String>>,
}

pub struct GuardrailMemberAssignment {
	pub display_name: Option<Option<String>>,
	pub joined_at: Option<Option<String>>,
	pub role: Option<Option<String>>,
	pub user_id: String,
}

pub struct GuardrailMemberListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct GuardrailPolicyInput {
	pub allowedApiModelIds: Option<Vec<String>>,
	pub budgets: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub modelRestrictionMode: Option<String>,
	pub name: Option<String>,
	pub privacyEnableFreeMayPublishPrompts: Option<Option<bool>>,
	pub privacyEnableFreeMayTrain: Option<Option<bool>>,
	pub privacyEnableInputOutputLogging: Option<Option<bool>>,
	pub privacyEnablePaidMayTrain: Option<Option<bool>>,
	pub privacyZdrOnly: Option<Option<bool>>,
	pub promptInjectionAction: Option<String>,
	pub promptInjectionEnabled: Option<bool>,
	pub providerRestrictionEnforceAllowed: Option<bool>,
	pub providerRestrictionMode: Option<String>,
	pub providerRestrictionProviderIds: Option<Vec<String>>,
	pub sensitiveInfoDefaultAction: Option<String>,
	pub sensitiveInfoEnabled: Option<bool>,
	pub sensitiveInfoRules: Option<Vec<HashMap<String, String>>>,
}

pub struct GuardrailRemoveResponse {
	pub removed_count: i64,
}

pub struct GuardrailResponse {
	pub data: HashMap<String, String>,
}

pub struct GuardrailUpdateRequest {
	pub allowedApiModelIds: Option<Vec<String>>,
	pub budgets: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub modelRestrictionMode: Option<String>,
	pub name: Option<String>,
	pub privacyEnableFreeMayPublishPrompts: Option<Option<bool>>,
	pub privacyEnableFreeMayTrain: Option<Option<bool>>,
	pub privacyEnableInputOutputLogging: Option<Option<bool>>,
	pub privacyEnablePaidMayTrain: Option<Option<bool>>,
	pub privacyZdrOnly: Option<Option<bool>>,
	pub promptInjectionAction: Option<String>,
	pub promptInjectionEnabled: Option<bool>,
	pub providerRestrictionEnforceAllowed: Option<bool>,
	pub providerRestrictionMode: Option<String>,
	pub providerRestrictionProviderIds: Option<Vec<String>>,
	pub sensitiveInfoDefaultAction: Option<String>,
	pub sensitiveInfoEnabled: Option<bool>,
	pub sensitiveInfoRules: Option<Vec<HashMap<String, String>>>,
}

pub struct GuardrailUserIdsRequest {
	pub user_ids: Vec<String>,
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
	pub resolution: Option<String>,
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
	pub resolution: Option<String>,
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
	pub ok: bool,
}

pub struct KeyInvalidateResponse {
	pub key: HashMap<String, String>,
	pub message: String,
	pub ok: bool,
}

pub type KnownModelId = JsonValue;

pub struct ListFilesResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub object: Option<String>,
}

pub struct ManagementKeyCollectionResponse {
	pub data: Vec<HashMap<String, String>>,
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
	pub ok: bool,
}

pub struct ManagementKeyDeleteResponse {
	pub message: String,
	pub ok: bool,
}

pub struct ManagementKeyDetailResponse {
	pub key: HashMap<String, String>,
	pub ok: bool,
}

pub struct ManagementKeyListResponse {
	pub keys: Vec<HashMap<String, String>>,
	pub limit: i64,
	pub offset: i64,
	pub ok: bool,
	pub total: i64,
}

pub struct ManagementKeyRuntime {
	pub created_at: String,
	pub created_by: Option<Option<String>>,
	pub daily_limit_cost_nanos: Option<Option<i64>>,
	pub daily_limit_requests: Option<Option<i64>>,
	pub expires_at: Option<Option<String>>,
	pub id: String,
	pub last_used_at: Option<Option<String>>,
	pub monthly_limit_cost_nanos: Option<Option<i64>>,
	pub monthly_limit_requests: Option<Option<i64>>,
	pub name: String,
	pub prefix: String,
	pub scopes: Vec<String>,
	pub soft_blocked: Option<Option<bool>>,
	pub status: String,
	pub updated_at: Option<Option<String>>,
	pub weekly_limit_cost_nanos: Option<Option<i64>>,
	pub weekly_limit_requests: Option<Option<i64>>,
	pub workspace_id: String,
}

pub struct ManagementKeyRuntimeCreated {
	pub created_at: String,
	pub created_by: Option<Option<String>>,
	pub daily_limit_cost_nanos: Option<Option<i64>>,
	pub daily_limit_requests: Option<Option<i64>>,
	pub expires_at: Option<Option<String>>,
	pub id: String,
	pub key: String,
	pub last_used_at: Option<Option<String>>,
	pub monthly_limit_cost_nanos: Option<Option<i64>>,
	pub monthly_limit_requests: Option<Option<i64>>,
	pub name: String,
	pub prefix: String,
	pub scopes: Vec<String>,
	pub soft_blocked: Option<Option<bool>>,
	pub status: String,
	pub updated_at: Option<Option<String>>,
	pub weekly_limit_cost_nanos: Option<Option<i64>>,
	pub weekly_limit_requests: Option<Option<i64>>,
	pub workspace_id: String,
}

pub struct ManagementKeyRuntimeCreateRequest {
	pub expires_at: Option<Option<String>>,
	pub name: String,
	pub paused: Option<bool>,
	pub scopes: Option<String>,
	pub template: Option<String>,
}

pub struct ManagementKeyRuntimeCreateResponse {
	pub data: HashMap<String, String>,
}

pub struct ManagementKeyRuntimeDeleteResponse {
	pub deleted: bool,
}

pub struct ManagementKeyRuntimeResponse {
	pub data: HashMap<String, String>,
}

pub struct ManagementKeyRuntimeUpdateRequest {
	pub dailyCostNanos: Option<Option<i64>>,
	pub dailyRequests: Option<Option<i64>>,
	pub expires_at: Option<Option<String>>,
	pub monthlyCostNanos: Option<Option<i64>>,
	pub monthlyRequests: Option<Option<i64>>,
	pub name: Option<String>,
	pub paused: Option<bool>,
	pub scopes: Option<String>,
	pub softBlocked: Option<bool>,
	pub template: Option<String>,
	pub weeklyCostNanos: Option<Option<i64>>,
	pub weeklyRequests: Option<Option<i64>>,
}

pub struct ManagementKeyUpdateRequest {
	pub name: Option<String>,
	pub soft_blocked: Option<bool>,
	pub status: Option<String>,
}

pub struct ManagementKeyUpdateResponse {
	pub message: String,
	pub ok: bool,
}

pub type MessageContentPart = JsonValue;

pub struct Model {
	pub aliases: Vec<String>,
	pub availability: HashMap<String, String>,
	pub base_model_id: String,
	pub capabilities: HashMap<String, String>,
	pub description: String,
	pub id: String,
	pub lifecycle: HashMap<String, String>,
	pub limits: HashMap<String, String>,
	pub modalities: HashMap<String, String>,
	pub name: String,
	pub offers: Vec<HashMap<String, String>>,
	pub organization: Option<HashMap<String, String>>,
	pub pricing: HashMap<String, String>,
	pub variant: String,
	pub variants: HashMap<String, String>,
}

pub struct ModelAvailability {
	pub active_provider_count: i64,
	pub coming_soon_provider_count: i64,
	pub inactive_provider_count: i64,
	pub provider_count: i64,
	pub status: String,
}

pub struct ModelEndpointCapability {
	pub capabilities: HashMap<String, String>,
	pub capability_id: String,
	pub collection: String,
	pub effective: HashMap<String, String>,
	pub endpoint: String,
	pub id: String,
	pub modalities: HashMap<String, String>,
	pub model: Option<String>,
	pub pricing: HashMap<String, String>,
	pub provider: HashMap<String, String>,
	pub public_path: String,
	pub routable: bool,
	pub routing: HashMap<String, String>,
	pub status: String,
	pub status_reason: String,
}

pub struct ModelEndpointsResponse {
	pub availability_mode: String,
	pub description: String,
	pub endpoints: Vec<HashMap<String, String>>,
	pub id: String,
	pub modalities: HashMap<String, String>,
	pub name: String,
	pub ok: bool,
	pub organization: Option<HashMap<String, String>>,
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
	pub input_modalities: Option<Vec<String>>,
	pub is_active_gateway: bool,
	pub model_routing_status: String,
	pub output_modalities: Option<Vec<String>>,
	pub params: Vec<String>,
	pub params_detail: Option<HashMap<String, String>>,
	pub provider_model_slug: Option<Option<String>>,
	pub provider_routing_status: String,
	pub provider_status: String,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_parameters_detail: Option<HashMap<String, String>>,
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
	pub meta: Option<HashMap<String, String>>,
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
	pub audio_base64: Option<String>,
	pub audio_url: Option<String>,
	pub id: String,
	pub model: String,
	pub nativeResponseId: Option<Option<String>>,
	pub object: String,
	pub output: Option<Vec<HashMap<String, String>>>,
	pub provider: String,
	pub result: Option<String>,
	pub status: String,
	pub usage: Option<HashMap<String, String>>,
}

pub struct NotImplementedResponse {
	pub description: String,
	pub error: String,
	pub status_code: i64,
}

pub struct OAuthClient {
	pub active_authorizations: Option<i64>,
	pub allowed_scopes: Option<Vec<String>>,
	pub client_id: String,
	pub client_type: String,
	pub created_at: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub homepage_url: Option<Option<String>>,
	pub last_used_at: Option<Option<String>>,
	pub logo_url: Option<Option<String>>,
	pub name: String,
	pub privacy_policy_url: Option<Option<String>>,
	pub redirect_uris: Vec<String>,
	pub requests_last_30d: Option<i64>,
	pub status: String,
	pub terms_of_service_url: Option<Option<String>>,
	pub total_authorizations: Option<i64>,
	pub updated_at: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct OAuthClientCreateRequest {
	pub allowed_scopes: Option<Vec<String>>,
	pub client_type: Option<String>,
	pub description: Option<String>,
	pub homepage_url: Option<String>,
	pub logo_url: Option<String>,
	pub name: String,
	pub privacy_policy_url: Option<String>,
	pub redirect_uris: Vec<String>,
	pub terms_of_service_url: Option<String>,
}

pub struct OAuthClientCreateResponse {
	pub active_authorizations: Option<i64>,
	pub allowed_scopes: Option<Vec<String>>,
	pub client_id: String,
	pub client_secret: Option<Option<String>>,
	pub client_type: String,
	pub created_at: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub homepage_url: Option<Option<String>>,
	pub last_used_at: Option<Option<String>>,
	pub logo_url: Option<Option<String>>,
	pub name: String,
	pub privacy_policy_url: Option<Option<String>>,
	pub redirect_uris: Vec<String>,
	pub requests_last_30d: Option<i64>,
	pub status: String,
	pub terms_of_service_url: Option<Option<String>>,
	pub total_authorizations: Option<i64>,
	pub updated_at: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct OAuthClientDeleteResponse {
	pub client_id: String,
	pub message: String,
}

pub struct OAuthClientInput {
	pub allowed_scopes: Option<Vec<String>>,
	pub description: Option<String>,
	pub homepage_url: Option<String>,
	pub logo_url: Option<String>,
	pub name: Option<String>,
	pub privacy_policy_url: Option<String>,
	pub redirect_uris: Option<Vec<String>>,
	pub terms_of_service_url: Option<String>,
}

pub struct OAuthClientListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub pagination: HashMap<String, String>,
}

pub struct OAuthClientSecretResponse {
	pub client_id: String,
	pub client_secret: String,
	pub message: String,
}

pub struct OAuthClientUpdateRequest {
	pub allowed_scopes: Option<Vec<String>>,
	pub description: Option<String>,
	pub homepage_url: Option<String>,
	pub logo_url: Option<String>,
	pub name: Option<String>,
	pub privacy_policy_url: Option<String>,
	pub redirect_uris: Option<Vec<String>>,
	pub terms_of_service_url: Option<String>,
}

pub struct ObservabilityDestination {
	pub configured: bool,
	pub created_at: Option<Option<String>>,
	pub enabled: bool,
	pub group_join: String,
	pub id: String,
	pub include_cost_metadata: Option<bool>,
	pub include_generation_metadata: Option<bool>,
	pub include_identity_metadata: Option<bool>,
	pub include_request_context: Option<bool>,
	pub key_filters: Vec<HashMap<String, String>>,
	pub name: String,
	pub privacy_mode: bool,
	pub rule_groups: Vec<HashMap<String, String>>,
	pub sampling_rate: f64,
	pub r#type: String,
	pub updated_at: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct ObservabilityDestinationCreateRequest {
	pub config: HashMap<String, String>,
	pub enabled: Option<bool>,
	pub group_join: Option<String>,
	pub include_cost_metadata: Option<bool>,
	pub include_generation_metadata: Option<bool>,
	pub include_identity_metadata: Option<bool>,
	pub include_request_context: Option<bool>,
	pub key_filters: Option<Vec<HashMap<String, String>>>,
	pub name: String,
	pub privacy_mode: Option<bool>,
	pub rule_groups: Option<Vec<HashMap<String, String>>>,
	pub sampling_rate: Option<f64>,
	pub r#type: String,
}

pub struct ObservabilityDestinationListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct ObservabilityDestinationPolicyInput {
	pub enabled: Option<bool>,
	pub group_join: Option<String>,
	pub include_cost_metadata: Option<bool>,
	pub include_generation_metadata: Option<bool>,
	pub include_identity_metadata: Option<bool>,
	pub include_request_context: Option<bool>,
	pub key_filters: Option<Vec<HashMap<String, String>>>,
	pub name: Option<String>,
	pub privacy_mode: Option<bool>,
	pub rule_groups: Option<Vec<HashMap<String, String>>>,
	pub sampling_rate: Option<f64>,
}

pub struct ObservabilityDestinationResponse {
	pub data: HashMap<String, String>,
}

pub type ObservabilityDestinationType = JsonValue;

pub struct ObservabilityDestinationUpdateRequest {
	pub config: Option<HashMap<String, String>>,
	pub enabled: Option<bool>,
	pub group_join: Option<String>,
	pub include_cost_metadata: Option<bool>,
	pub include_generation_metadata: Option<bool>,
	pub include_identity_metadata: Option<bool>,
	pub include_request_context: Option<bool>,
	pub key_filters: Option<Vec<HashMap<String, String>>>,
	pub name: Option<String>,
	pub privacy_mode: Option<bool>,
	pub rule_groups: Option<Vec<HashMap<String, String>>>,
	pub sampling_rate: Option<f64>,
}

pub struct ObservabilityKeyFilter {
	pub key_id: String,
	pub mode: String,
}

pub struct ObservabilityLoggingPolicy {
	pub billing_status: String,
	pub enabled: bool,
	pub grace_until: Option<Option<String>>,
	pub include_provider_payloads: bool,
	pub price_per_million_units_nanos: i64,
	pub retention_days: i64,
	pub updated_at: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct ObservabilityLoggingPolicyResponse {
	pub data: HashMap<String, String>,
}

pub struct ObservabilityLoggingPolicyUpdateRequest {
	pub enabled: Option<bool>,
	pub include_provider_payloads: Option<bool>,
	pub retention_days: Option<i64>,
}

pub struct ObservabilityRule {
	pub condition: String,
	pub field: String,
	pub value: Option<Option<String>>,
}

pub struct ObservabilityRuleGroup {
	pub r#match: String,
	pub rules: Vec<HashMap<String, String>>,
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

pub type ParseBlock = JsonValue;

pub struct ParseBoundingBox {
	pub bottom_right_x: f64,
	pub bottom_right_y: f64,
	pub top_left_x: f64,
	pub top_left_y: f64,
}

pub struct ParseImage {
	pub bounding_box: HashMap<String, String>,
	pub bounding_box_normalized: HashMap<String, String>,
	pub category: String,
	pub description: String,
	pub id: String,
}

pub type ParsePage = JsonValue;

pub struct ParseRequest {
	pub debug: Option<HashMap<String, String>>,
	pub document: HashMap<String, String>,
	pub echo_upstream_request: Option<bool>,
	pub model: String,
	pub output_format: Option<String>,
	pub provider: Option<HashMap<String, String>>,
	pub routing: Option<HashMap<String, String>>,
}

pub struct ParseResponse {
	pub id: String,
	pub meta: Option<HashMap<String, String>>,
	pub model: String,
	pub object: String,
	pub pages: Vec<String>,
	pub provider: String,
	pub usage: Option<HashMap<String, String>>,
}

pub struct Preset {
	pub active_version_id: Option<Option<String>>,
	pub config: HashMap<String, String>,
	pub created_at: Option<Option<String>>,
	pub created_by: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub id: String,
	pub name: String,
	pub slug: String,
	pub source_preset_id: Option<Option<String>>,
	pub source_preset_version_id: Option<Option<String>>,
	pub updated_at: Option<Option<String>>,
	pub upstream_version_id: Option<Option<String>>,
	pub versioning_method: String,
	pub visibility: String,
	pub workspace_id: String,
}

pub struct PresetConfig {
}

pub struct PresetCreateRequest {
	pub config: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub name: String,
	pub slug: Option<String>,
	pub versioning_method: Option<String>,
	pub visibility: Option<String>,
}

pub struct PresetCreateResponse {
	pub canonical_model: String,
	pub data: HashMap<String, String>,
}

pub struct PresetForkRequest {
	pub source_version_id: Option<String>,
}

pub struct PresetListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct PresetPublisher {
	pub handle: Option<String>,
	pub workspace_id: String,
}

pub struct PresetPublisherResponse {
	pub data: HashMap<String, String>,
}

pub struct PresetPublisherUpdateRequest {
	pub handle: String,
}

pub struct PresetResponse {
	pub data: HashMap<String, String>,
}

pub struct PresetTestRun {
	pub baseline_preset_id: Option<String>,
	pub completed_at: Option<String>,
	pub config: HashMap<String, String>,
	pub created_at: String,
	pub created_by_user_id: Option<String>,
	pub dataset_name: Option<String>,
	pub description: Option<String>,
	pub id: String,
	pub name: Option<String>,
	pub preset_id: Option<String>,
	pub started_at: Option<String>,
	pub status: String,
	pub summary: HashMap<String, String>,
	pub updated_at: String,
	pub workspace_id: String,
}

pub struct PresetTestRunCreateRequest {
	pub baseline_preset_id: Option<String>,
	pub completed_at: Option<String>,
	pub config: Option<HashMap<String, String>>,
	pub dataset_name: Option<String>,
	pub description: Option<String>,
	pub name: Option<String>,
	pub preset_id: Option<String>,
	pub started_at: Option<String>,
	pub status: Option<String>,
	pub summary: Option<HashMap<String, String>>,
}

pub struct PresetTestRunDetailResponse {
	pub data: HashMap<String, String>,
	pub feedback_summary: Option<HashMap<String, String>>,
}

pub struct PresetTestRunListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct PresetTestRunResponse {
	pub data: HashMap<String, String>,
}

pub struct PresetTestRunUpdateRequest {
	pub completed_at: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub name: Option<Option<String>>,
	pub started_at: Option<Option<String>>,
	pub status: Option<String>,
	pub summary: Option<HashMap<String, String>>,
}

pub struct PresetUpdateRequest {
	pub config: Option<HashMap<String, String>>,
	pub description: Option<Option<String>>,
	pub name: Option<String>,
	pub replace_config: Option<bool>,
	pub slug: Option<String>,
	pub versioning_method: Option<String>,
	pub visibility: Option<String>,
}

pub struct PresetUpstreamApplyRequest {
	pub version_id: String,
}

pub struct PresetUpstreamApplyResponse {
	pub data: HashMap<String, String>,
}

pub struct PresetVersion {
	pub config: HashMap<String, String>,
	pub created_at: String,
	pub created_by: String,
	pub description: Option<Option<String>>,
	pub id: String,
	pub name: String,
	pub preset_id: String,
	pub release_notes: Option<Option<String>>,
	pub slug: String,
	pub version_label: String,
	pub version_number: i64,
	pub versioning_method: String,
	pub visibility: String,
}

pub type PresetVersioningMethod = JsonValue;

pub struct PresetVersionListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct PresetVersionPublishRequest {
	pub release_notes: Option<String>,
	pub version_label: Option<String>,
}

pub struct PresetVersionResponse {
	pub data: HashMap<String, String>,
}

pub type PresetVisibility = JsonValue;

pub struct PrivateModel {
	pub base_url: String,
	pub catalog_model_id: Option<Option<String>>,
	pub context_length: Option<Option<i64>>,
	pub created_at: Option<Option<String>>,
	pub created_by: Option<Option<String>>,
	pub credential_prefix: Option<Option<String>>,
	pub credential_suffix: Option<Option<String>>,
	pub custom_provider_name: Option<Option<String>>,
	pub custom_provider_url: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub enabled: bool,
	pub host_provider_id: Option<Option<String>>,
	pub id: String,
	pub input_modalities: Option<Vec<String>>,
	pub local_slug: Option<String>,
	pub max_output_tokens: Option<Option<i64>>,
	pub model_id: String,
	pub name: String,
	pub output_modalities: Option<Vec<String>>,
	pub routing_policy: Option<String>,
	pub supports_responses: bool,
	pub updated_at: Option<Option<String>>,
	pub upstream_model_id: String,
	pub workspace_id: String,
}

pub struct PrivateModelCreateRequest {
	pub base_url: String,
	pub context_length: Option<Option<i64>>,
	pub credential: String,
	pub custom_provider_name: Option<Option<String>>,
	pub custom_provider_url: Option<Option<String>>,
	pub description: Option<String>,
	pub enabled: Option<bool>,
	pub host_provider_id: Option<Option<String>>,
	pub max_output_tokens: Option<Option<i64>>,
	pub model_reference: String,
	pub name: String,
	pub routing_policy: Option<String>,
	pub supports_responses: Option<bool>,
	pub upstream_model_id: String,
}

pub struct PrivateModelDeleteResponse {
	pub deleted: bool,
}

pub struct PrivateModelListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct PrivateModelResponse {
	pub data: HashMap<String, String>,
}

pub struct PrivateModelUpdateRequest {
	pub base_url: Option<String>,
	pub context_length: Option<Option<i64>>,
	pub credential: Option<String>,
	pub custom_provider_name: Option<Option<String>>,
	pub custom_provider_url: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub enabled: Option<bool>,
	pub host_provider_id: Option<Option<String>>,
	pub max_output_tokens: Option<Option<i64>>,
	pub model_reference: Option<String>,
	pub name: Option<String>,
	pub routing_policy: Option<String>,
	pub supports_responses: Option<bool>,
	pub upstream_model_id: Option<String>,
}

pub struct Provider {
	pub api_provider_id: Option<String>,
	pub api_provider_name: Option<Option<String>>,
	pub country_code: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub link: Option<Option<String>>,
}

pub struct ProviderCredential {
	pub allowed_api_key_ids: Option<Vec<String>>,
	pub allowed_model_slugs: Option<Vec<String>>,
	pub always_use: Option<bool>,
	pub created_at: Option<Option<String>>,
	pub created_by: Option<Option<String>>,
	pub disabled: bool,
	pub enabled: bool,
	pub error_message: Option<Option<String>>,
	pub id: String,
	pub is_fallback: bool,
	pub last_used_at: Option<Option<String>>,
	pub last_verified_at: Option<Option<String>>,
	pub name: String,
	pub prefix: Option<Option<String>>,
	pub provider_id: String,
	pub routing_mode: String,
	pub sort_order: i64,
	pub suffix: Option<Option<String>>,
	pub verification_status: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct ProviderCredentialCreateRequest {
	pub allowed_api_key_ids: Option<Vec<String>>,
	pub allowed_models: Option<Vec<String>>,
	pub enabled: Option<bool>,
	pub key: String,
	pub name: String,
	pub provider: String,
	pub routing_mode: Option<String>,
}

pub struct ProviderCredentialDeleteResponse {
	pub deleted: bool,
}

pub struct ProviderCredentialListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct ProviderCredentialReorderRequest {
	pub key_ids: Vec<String>,
	pub provider: String,
	pub routing_mode: String,
}

pub struct ProviderCredentialReorderResponse {
	pub reordered: bool,
}

pub struct ProviderCredentialResponse {
	pub data: HashMap<String, String>,
}

pub type ProviderCredentialRoutingMode = JsonValue;

pub struct ProviderCredentialUpdateRequest {
	pub allowed_api_key_ids: Option<Vec<String>>,
	pub allowed_models: Option<Vec<String>>,
	pub enabled: Option<bool>,
	pub key: Option<String>,
	pub name: Option<String>,
	pub routing_mode: Option<String>,
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

pub struct ReasoningConfig {
	pub effort: Option<String>,
	pub enabled: Option<bool>,
	pub max_tokens: Option<i64>,
	pub mode: Option<String>,
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
	pub cost_cents: Option<i64>,
	pub cost_nanos: Option<f64>,
	pub created: Option<i64>,
	pub currency: Option<String>,
	pub finish_reason: Option<Option<String>>,
	pub id: Option<String>,
	pub meta: Option<HashMap<String, String>>,
	pub model: Option<String>,
	pub nativeResponseId: Option<Option<String>>,
	pub object: Option<String>,
	pub output: Option<Vec<HashMap<String, String>>>,
	pub output_items: Option<Vec<HashMap<String, String>>>,
	pub pricing_lines: Option<Vec<HashMap<String, String>>>,
	pub provider: Option<String>,
	pub provider_id: Option<String>,
	pub role: Option<String>,
	pub status: Option<String>,
	pub stop_reason: Option<String>,
	pub r#type: Option<String>,
	pub usage: Option<HashMap<String, String>>,
}

pub struct SearchModelsToolDefinition {
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct ServerToolUsage {
	pub advisor_requests: Option<i64>,
	pub apply_patch_requests: Option<i64>,
	pub datetime_requests: Option<i64>,
	pub fusion_requests: Option<i64>,
	pub image_generation_requests: Option<i64>,
	pub search_models_requests: Option<i64>,
	pub subagent_requests: Option<i64>,
	pub web_fetch_requests: Option<i64>,
	pub web_search_requests: Option<i64>,
}

pub struct SubagentToolDefinition {
	pub parameters: Option<HashMap<String, String>>,
	pub r#type: String,
}

pub struct SupportedParameterDetails {
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

pub struct UpdatedResponse {
	pub data: HashMap<String, String>,
}

pub struct Usage {
	pub completion_tokens: Option<i64>,
	pub prompt_tokens: Option<i64>,
	pub server_tool_use: Option<HashMap<String, String>>,
	pub total_tokens: Option<i64>,
}

pub struct VideoBillingSummary {
	pub billable: Option<bool>,
	pub billed_at: Option<String>,
	pub charge_reason: Option<Option<String>>,
	pub charged: Option<Option<bool>>,
	pub currency: Option<String>,
	pub estimated_nanos: Option<Option<i64>>,
	pub estimated_provider_cost: Option<Option<String>>,
	pub estimated_user_cost: Option<Option<String>>,
	pub reservation_id: Option<Option<String>>,
	pub reservation_status: Option<Option<String>>,
	pub reserved_nanos: Option<Option<i64>>,
	pub settled_provider_cost: Option<Option<String>>,
	pub settled_user_cost: Option<Option<String>>,
	pub state: Option<String>,
	pub total_nanos: Option<Option<i64>>,
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
	pub frame_images: Option<Vec<HashMap<String, String>>>,
	pub generate_audio: Option<bool>,
	pub input_audio_duration: Option<f64>,
	pub input_references: Option<Vec<String>>,
	pub input_video_duration: Option<f64>,
	pub model: String,
	pub negative_prompt: Option<String>,
	pub output: Option<HashMap<String, String>>,
	pub person_generation: Option<String>,
	pub prompt: String,
	pub provider: Option<HashMap<String, String>>,
	pub provider_options: Option<HashMap<String, String>>,
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
	pub cancel_url: Option<Option<String>>,
	pub completed_at: Option<Option<String>>,
	pub content_url: Option<String>,
	pub created_at: Option<String>,
	pub download_url: Option<Option<String>>,
	pub error: Option<Option<String>>,
	pub expires_at: Option<Option<i64>>,
	pub generation_id: Option<Option<String>>,
	pub id: Option<String>,
	pub last_webhook_dispatched_at: Option<Option<String>>,
	pub last_webhook_progress: Option<Option<f64>>,
	pub last_webhook_progress_at: Option<Option<String>>,
	pub lifecycle_status: Option<String>,
	pub model: Option<String>,
	pub native_video_id: Option<Option<String>>,
	pub next_webhook_retry_at: Option<Option<String>>,
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
	pub webhook: Option<HashMap<String, String>>,
	pub websocket_url: Option<String>,
}

pub type VideoInputReference = JsonValue;

pub struct VideoListResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub first_id: Option<Option<String>>,
	pub has_more: Option<bool>,
	pub last_id: Option<Option<String>>,
	pub object: Option<String>,
}

pub struct VideoModelCapability {
	pub input_types: Option<Vec<String>>,
	pub model: Option<String>,
	pub name: Option<String>,
	pub output_types: Option<Vec<String>>,
	pub pricing: Option<HashMap<String, String>>,
	pub providers: Option<Vec<HashMap<String, String>>>,
	pub status: Option<String>,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_parameters_detail: Option<HashMap<String, String>>,
	pub supported_params: Option<Vec<String>>,
	pub supported_params_detail: Option<HashMap<String, String>>,
}

pub struct VideoModelProviderCapability {
	pub id: Option<String>,
	pub supported_parameters: Option<Vec<String>>,
	pub supported_parameters_detail: Option<HashMap<String, String>>,
	pub supported_params: Option<Vec<String>>,
	pub supported_params_detail: Option<HashMap<String, String>>,
}

pub struct VideoModelsResponse {
	pub data: Option<Vec<HashMap<String, String>>>,
	pub object: Option<String>,
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

pub struct WebhookEndpoint {
	pub createdAt: Option<Option<String>>,
	pub createdBy: Option<Option<String>>,
	pub deletedAt: Option<Option<String>>,
	pub events: Vec<String>,
	pub hasSecret: bool,
	pub id: String,
	pub name: String,
	pub status: String,
	pub updatedAt: Option<Option<String>>,
	pub url: String,
	pub workspaceId: String,
}

pub struct WebhookEndpointCreateRequest {
	pub events: Option<Vec<String>>,
	pub name: Option<String>,
	pub url: String,
}

pub struct WebhookEndpointDeleteResponse {
	pub deleted: bool,
	pub id: String,
	pub object: String,
}

pub struct WebhookEndpointInput {
	pub events: Option<Vec<String>>,
	pub name: Option<String>,
	pub url: Option<String>,
}

pub struct WebhookEndpointListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub object: String,
}

pub struct WebhookEndpointSecretResponse {
	pub createdAt: Option<Option<String>>,
	pub createdBy: Option<Option<String>>,
	pub deletedAt: Option<Option<String>>,
	pub events: Vec<String>,
	pub hasSecret: bool,
	pub id: String,
	pub name: String,
	pub signing_secret: String,
	pub status: String,
	pub updatedAt: Option<Option<String>>,
	pub url: String,
	pub workspaceId: String,
}

pub struct WebhookEndpointUpdateRequest {
	pub events: Option<Vec<String>>,
	pub name: Option<String>,
	pub status: Option<String>,
	pub url: Option<String>,
}

pub struct Workspace {
	pub created_at: Option<String>,
	pub created_by: Option<String>,
	pub id: String,
	pub name: Option<String>,
	pub slug: Option<Option<String>>,
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
	pub ok: bool,
	pub period_days: i64,
	pub total: i64,
	pub total_cost_cents: f64,
}

pub struct WorkspaceApp {
	pub app_key: String,
	pub category: Option<String>,
	pub created_at: Option<String>,
	pub docs_url: Option<String>,
	pub id: String,
	pub image_url: Option<String>,
	pub is_active: bool,
	pub is_managed: bool,
	pub is_public: bool,
	pub last_seen: Option<String>,
	pub title: String,
	pub url: Option<String>,
}

pub struct WorkspaceAppListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub limit: i64,
	pub offset: i64,
	pub total_count: i64,
}

pub struct WorkspaceAppMergeRequest {
	pub target_app_id: String,
}

pub struct WorkspaceAppMergeResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceAppResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceAppUpdateRequest {
	pub category: Option<Option<String>>,
	pub docs_url: Option<Option<String>>,
	pub image_url: Option<Option<String>>,
	pub is_active: Option<bool>,
	pub is_public: Option<bool>,
	pub title: Option<String>,
	pub url: Option<Option<String>>,
}

pub type WorkspaceAssignableRole = JsonValue;

pub struct WorkspaceAuditEvent {
	pub action: String,
	pub actor: Option<Option<HashMap<String, String>>>,
	pub actor_user_id: Option<Option<String>>,
	pub created_at: String,
	pub id: String,
	pub metadata: HashMap<String, String>,
	pub request_id: Option<Option<String>>,
	pub target_id: String,
	pub target_name: Option<Option<String>>,
	pub target_type: String,
	pub workspace_id: String,
}

pub struct WorkspaceAuditEventActor {
	pub display_name: Option<Option<String>>,
	pub email: Option<Option<String>>,
}

pub struct WorkspaceAuditEventLimits {
	pub dailyCostNanos: Option<i64>,
	pub dailyRequests: Option<i64>,
	pub monthlyCostNanos: Option<i64>,
	pub monthlyRequests: Option<i64>,
	pub softBlocked: Option<bool>,
	pub weeklyCostNanos: Option<i64>,
	pub weeklyRequests: Option<i64>,
}

pub struct WorkspaceAuditEventListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub has_more: bool,
	pub next_cursor: Option<Option<String>>,
}

pub struct WorkspaceAuditEventMetadata {
	pub accessTemplate: Option<String>,
	pub changedFields: Option<Vec<String>>,
	pub expiresAt: Option<Option<String>>,
	pub limits: Option<HashMap<String, String>>,
	pub prefix: Option<Option<String>>,
	pub previousKeyExpiresAt: Option<Option<String>>,
	pub replacementKeyId: Option<String>,
	pub replacementKeyName: Option<String>,
	pub status: Option<String>,
}

pub struct WorkspaceAutoTopUpSettings {
	pub amount_nanos: i64,
	pub balance_threshold_nanos: i64,
	pub enabled: bool,
	pub payment_method_id: Option<String>,
}

pub struct WorkspaceAutoTopUpUpdate {
	pub amount_nanos: Option<i64>,
	pub balance_threshold_nanos: Option<i64>,
	pub enabled: bool,
	pub payment_method_id: Option<Option<String>>,
}

pub struct WorkspaceBudget {
	pub created_at: String,
	pub created_by: Option<Option<String>>,
	pub exceeded: bool,
	pub id: String,
	pub interval: String,
	pub limit: f64,
	pub limit_nanos: i64,
	pub remaining: f64,
	pub remaining_nanos: i64,
	pub reset_at: Option<Option<String>>,
	pub updated_at: String,
	pub usage: f64,
	pub usage_nanos: i64,
	pub window_start: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct WorkspaceBudgetDeleteResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceBudgetInput {
	pub interval: String,
	pub limit: f64,
}

pub type WorkspaceBudgetInterval = JsonValue;

pub struct WorkspaceBudgetListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceBudgetResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceBudgetUpdateInput {
	pub interval: Option<String>,
	pub limit: Option<f64>,
}

pub struct WorkspaceCreateRequest {
	pub name: String,
	pub slug: Option<String>,
}

pub struct WorkspaceDepartment {
	pub color: Option<String>,
	pub created_at: Option<Option<String>>,
	pub description: Option<Option<String>>,
	pub directory_name: Option<Option<String>>,
	pub icon: Option<String>,
	pub id: String,
	pub name: String,
	pub name_overridden: Option<bool>,
	pub source_id: Option<Option<String>>,
	pub source_type: Option<String>,
	pub updated_at: Option<Option<String>>,
}

pub struct WorkspaceDepartmentCreateRequest {
	pub color: Option<String>,
	pub description: Option<Option<String>>,
	pub icon: Option<String>,
	pub name: String,
}

pub struct WorkspaceDepartmentInput {
	pub color: Option<String>,
	pub description: Option<Option<String>>,
	pub icon: Option<String>,
	pub name: Option<String>,
}

pub struct WorkspaceDepartmentListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceDepartmentMember {
	pub department_id: String,
	pub is_primary: bool,
	pub position: String,
	pub user_id: String,
}

pub struct WorkspaceDepartmentMemberRequest {
	pub position: Option<String>,
	pub primary: Option<bool>,
}

pub struct WorkspaceDepartmentMemberResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceDepartmentResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceDepartmentUpdateRequest {
	pub color: Option<String>,
	pub description: Option<Option<String>>,
	pub icon: Option<String>,
	pub name: Option<String>,
}

pub struct WorkspaceDirectoryMember {
	pub access_source: String,
	pub department: Option<HashMap<String, String>>,
	pub department_override_enabled: bool,
	pub department_override_id: Option<String>,
	pub department_source: String,
	pub directory_department: Option<Option<String>>,
	pub display_name: String,
	pub effective_role: String,
	pub email: Option<Option<String>>,
	pub joined_at: Option<Option<String>>,
	pub role_override: Option<String>,
	pub status: String,
	pub user_id: String,
	pub workspace_role: String,
}

pub struct WorkspaceDirectoryMemberUpdateRequest {
	pub access_role: Option<Option<String>>,
	pub department_id: Option<Option<String>>,
	pub department_mode: Option<String>,
	pub department_position: Option<String>,
}

pub struct WorkspaceDirectoryResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceGroupMapping {
	pub access_role: String,
	pub created_at: Option<Option<String>>,
	pub department_id: String,
	pub department_position: String,
	pub id: String,
	pub scim_group_id: String,
	pub updated_at: Option<Option<String>>,
}

pub struct WorkspaceGroupMappingCreateRequest {
	pub access_role: Option<String>,
	pub department_id: String,
	pub department_position: Option<String>,
	pub scim_group_id: String,
}

pub struct WorkspaceGroupMappingListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceGroupMappingResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceGroupMappingUpdateRequest {
	pub access_role: Option<String>,
	pub department_position: Option<String>,
}

pub struct WorkspaceInvite {
	pub created_at: Option<String>,
	pub creator_user_id: String,
	pub expires_at: Option<Option<String>>,
	pub id: String,
	pub max_uses: Option<Option<i64>>,
	pub role: String,
	pub token_preview: Option<Option<String>>,
	pub uses_count: Option<i64>,
	pub workspace_id: String,
}

pub struct WorkspaceInviteCreateRequest {
	pub expires_in_days: Option<i64>,
	pub max_uses: Option<Option<i64>>,
	pub role: Option<String>,
}

pub struct WorkspaceInviteCreateResponse {
	pub data: HashMap<String, String>,
	pub token: String,
}

pub struct WorkspaceInviteListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct WorkspaceJoinRequest {
	pub created_at: Option<String>,
	pub decided_at: Option<Option<String>>,
	pub decided_by: Option<Option<String>>,
	pub id: String,
	pub invite_id: Option<Option<String>>,
	pub requester_user_id: String,
	pub status: String,
	pub workspace_id: String,
}

pub struct WorkspaceJoinRequestListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct WorkspaceJoinRequestResponse {
	pub data: HashMap<String, String>,
}

pub type WorkspaceJoinRequestStatus = JsonValue;

pub struct WorkspaceListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct WorkspaceLowBalanceEmailSettings {
	pub enabled: bool,
	pub threshold_usd: f64,
}

pub struct WorkspaceLowBalanceEmailUpdate {
	pub enabled: bool,
	pub threshold_usd: Option<f64>,
}

pub struct WorkspaceMember {
	pub display_name: Option<Option<String>>,
	pub joined_at: Option<Option<String>>,
	pub role: String,
	pub user_id: String,
	pub workspace_id: String,
}

pub struct WorkspaceMemberAddResponse {
	pub added_count: i64,
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceMemberBulkRequest {
	pub role: Option<String>,
	pub user_ids: Vec<String>,
}

pub struct WorkspaceMemberListResponse {
	pub data: Vec<HashMap<String, String>>,
	pub total_count: i64,
}

pub struct WorkspaceMemberRemoveRequest {
	pub user_ids: Vec<String>,
}

pub struct WorkspaceMemberRemoveResponse {
	pub removed_count: i64,
}

pub struct WorkspaceMemberResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceMemberRoleUpdateRequest {
	pub role: String,
}

pub struct WorkspaceNotificationDestination {
	pub created_at: Option<Option<String>>,
	pub id: String,
	pub name: String,
	pub status: String,
	pub target_preview: String,
	pub r#type: String,
	pub updated_at: Option<Option<String>>,
}

pub struct WorkspaceNotificationDestinationCreateRequest {
	pub name: String,
	pub target: String,
	pub r#type: String,
}

pub struct WorkspaceNotificationDestinationListResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceNotificationDestinationResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceNotificationDestinationTestRequest {
	pub target: String,
	pub r#type: String,
}

pub type WorkspaceNotificationDestinationType = JsonValue;

pub struct WorkspaceNotificationEmailPreferences {
	pub auto_top_up_failure: bool,
	pub model_deprecation: bool,
	pub payment_method_expiring: bool,
}

pub struct WorkspaceNotificationEmailPreferencesUpdate {
	pub auto_top_up_failure: Option<bool>,
	pub model_deprecation: Option<bool>,
	pub payment_method_expiring: Option<bool>,
}

pub type WorkspaceNotificationEventKind = JsonValue;

pub struct WorkspaceNotificationRoute {
	pub destination_ids: Vec<String>,
	pub event_kind: String,
}

pub struct WorkspaceNotificationRouteMap {
	pub auto_top_up_failed: Vec<String>,
	pub low_balance: Vec<String>,
	pub model_deprecation: Vec<String>,
	pub payment_method_expiring: Vec<String>,
}

pub struct WorkspaceNotificationRouteResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceNotificationRoutesResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceNotificationRouteUpdateRequest {
	pub destination_ids: Vec<String>,
}

pub struct WorkspaceNotificationSettings {
	pub auto_top_up: HashMap<String, String>,
	pub email_preferences: HashMap<String, String>,
	pub low_balance_email: HashMap<String, String>,
}

pub struct WorkspaceNotificationSettingsResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceNotificationSettingsUpdateRequest {
	pub auto_top_up: Option<HashMap<String, String>>,
	pub email_preferences: Option<HashMap<String, String>>,
	pub low_balance_email: Option<HashMap<String, String>>,
}

pub struct WorkspaceNotificationTestResponse {
	pub data: HashMap<String, String>,
}

pub type WorkspaceProviderRestrictionMode = JsonValue;

pub struct WorkspaceResponse {
	pub data: HashMap<String, String>,
}

pub type WorkspaceRole = JsonValue;

pub type WorkspaceRoutingMode = JsonValue;

pub struct WorkspaceScimAuditResponse {
	pub data: Vec<HashMap<String, String>>,
}

pub struct WorkspaceScimEndpoint {
	pub created_at: Option<Option<String>>,
	pub enabled: bool,
	pub id: String,
	pub updated_at: Option<Option<String>>,
}

pub struct WorkspaceScimEndpointResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceScimEvent {
	pub action: Option<String>,
	pub correlation_id: Option<Option<String>>,
	pub created_at: Option<String>,
	pub detail: Option<Option<HashMap<String, String>>>,
	pub http_status: Option<i64>,
	pub id: Option<String>,
	pub outcome: Option<String>,
	pub request_id: Option<Option<String>>,
	pub resource_id: Option<Option<String>>,
	pub resource_type: Option<Option<String>>,
	pub scim_type: Option<Option<String>>,
}

pub struct WorkspaceScimResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceScimToken {
	pub created_at: Option<Option<String>>,
	pub expires_at: Option<Option<String>>,
	pub id: String,
	pub label: String,
	pub last_used_at: Option<Option<String>>,
	pub revoked_at: Option<Option<String>>,
	pub token_prefix: String,
}

pub struct WorkspaceScimTokenCreateRequest {
	pub expires_at: Option<Option<String>>,
	pub label: Option<String>,
}

pub struct WorkspaceScimTokenCreateResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceScimUpdateRequest {
	pub enabled: bool,
}

pub struct WorkspaceSettings {
	pub alpha_channel_enabled: Option<Option<bool>>,
	pub beta_channel_enabled: Option<Option<bool>>,
	pub byok_fallback_enabled: Option<Option<bool>>,
	pub io_logging_enabled: Option<Option<bool>>,
	pub io_logging_include_provider_payloads: Option<Option<bool>>,
	pub privacy_enable_free_may_publish_prompts: Option<Option<bool>>,
	pub privacy_enable_free_may_train: Option<Option<bool>>,
	pub privacy_enable_input_output_logging: Option<Option<bool>>,
	pub privacy_enable_paid_may_train: Option<Option<bool>>,
	pub privacy_zdr_only: Option<Option<bool>>,
	pub provider_restriction_enforce_allowed: Option<Option<bool>>,
	pub provider_restriction_mode: Option<Option<String>>,
	pub provider_restriction_provider_ids: Option<Option<Vec<String>>>,
	pub response_healing_enabled: Option<Option<bool>>,
	pub response_healing_locked: Option<Option<bool>>,
	pub response_healing_mode: Option<Option<String>>,
	pub routing_mode: Option<Option<String>>,
	pub updated_at: Option<Option<String>>,
	pub workspace_id: String,
}

pub struct WorkspaceSettingsResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceSettingsUpdateRequest {
	pub alpha_channel_enabled: Option<bool>,
	pub beta_channel_enabled: Option<bool>,
	pub byok_fallback_enabled: Option<bool>,
	pub io_logging_enabled: Option<bool>,
	pub io_logging_include_provider_payloads: Option<bool>,
	pub privacy_enable_free_may_publish_prompts: Option<bool>,
	pub privacy_enable_free_may_train: Option<bool>,
	pub privacy_enable_input_output_logging: Option<bool>,
	pub privacy_enable_paid_may_train: Option<bool>,
	pub privacy_zdr_only: Option<bool>,
	pub provider_restriction_enforce_allowed: Option<bool>,
	pub provider_restriction_mode: Option<String>,
	pub provider_restriction_provider_ids: Option<Vec<String>>,
	pub response_healing_enabled: Option<bool>,
	pub response_healing_locked: Option<bool>,
	pub response_healing_mode: Option<String>,
	pub routing_mode: Option<String>,
}

pub struct WorkspaceSsoResponse {
	pub data: HashMap<String, String>,
}

pub struct WorkspaceSsoSettings {
	pub domains: Vec<String>,
	pub enabled: bool,
	pub enforced: bool,
	pub mode: String,
	pub provider_identifier: Option<String>,
}

pub struct WorkspaceSsoUpdateRequest {
	pub domains: Option<Vec<String>>,
	pub enabled: bool,
	pub enforced: Option<bool>,
	pub mode: String,
	pub provider_identifier: Option<Option<String>>,
}

pub struct WorkspaceUpdateRequest {
	pub name: Option<String>,
	pub slug: Option<String>,
}
