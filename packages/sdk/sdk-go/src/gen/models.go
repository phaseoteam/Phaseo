package gen

type ActivityEntry struct {
	ByokUsageInference float64 `json:"byok_usage_inference"`
	CompletionTokens int `json:"completion_tokens"`
	Date string `json:"date"`
	EndpointId string `json:"endpoint_id"`
	Model string `json:"model"`
	ModelPermaslug string `json:"model_permaslug"`
	PromptTokens int `json:"prompt_tokens"`
	ProviderName string `json:"provider_name"`
	ReasoningTokens int `json:"reasoning_tokens"`
	Requests int `json:"requests"`
	Usage float64 `json:"usage"`
}

type ActivityResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type AnalyticsAccessTokenRequiredResponse struct {
	Error string `json:"error"`
	Ok bool `json:"ok"`
}

type AnalyticsNotImplementedResponse struct {
	Message string `json:"message"`
	Ok bool `json:"ok"`
	Status string `json:"status"`
}

type AnalyticsResponse struct {
	Data []map[string]interface{} `json:"data"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	TotalCount int `json:"total_count"`
}

type AnthropicContentBlock struct {
	CacheControl *map[string]interface{} `json:"cache_control,omitempty"`
	Content *string `json:"content,omitempty"`
	Id *string `json:"id,omitempty"`
	Input *map[string]interface{} `json:"input,omitempty"`
	Name *string `json:"name,omitempty"`
	Source *map[string]interface{} `json:"source,omitempty"`
	Text *string `json:"text,omitempty"`
	ToolUseId *string `json:"tool_use_id,omitempty"`
	Type *string `json:"type,omitempty"`
}

type AnthropicMessage struct {
	Content interface{} `json:"content"`
	Role string `json:"role"`
}

type AnthropicMessagesRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	MaxTokens int `json:"max_tokens"`
	Messages []map[string]interface{} `json:"messages"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	StopSequences *[]string `json:"stop_sequences,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	System interface{} `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]interface{} `json:"tools,omitempty"`
	TopK *int `json:"top_k,omitempty"`
	TopP *float64 `json:"top_p,omitempty"`
	Usage *bool `json:"usage,omitempty"`
}

type AnthropicMessagesResponse struct {
	Content *[]map[string]interface{} `json:"content,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	Role *string `json:"role,omitempty"`
	StopReason *string `json:"stop_reason,omitempty"`
	StopSequence *string `json:"stop_sequence,omitempty"`
	Type *string `json:"type,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type AnthropicTool struct {
	Async *bool `json:"async,omitempty"`
	Description *string `json:"description,omitempty"`
	InputSchema *map[string]interface{} `json:"input_schema,omitempty"`
	Name string `json:"name"`
}

type AnthropicUsage struct {
	InputTokens *int `json:"input_tokens,omitempty"`
	OutputTokens *int `json:"output_tokens,omitempty"`
}

type ApiKey struct {
	CreatedAt *string `json:"created_at"`
	CreatedBy *string `json:"created_by"`
	CreatorUserId *string `json:"creator_user_id"`
	Disabled bool `json:"disabled"`
	ExpiresAt *string `json:"expires_at"`
	Hash string `json:"hash"`
	Id string `json:"id"`
	IncludeByokInLimit bool `json:"include_byok_in_limit"`
	Label *string `json:"label"`
	LastUsedAt *string `json:"last_used_at"`
	Limit *float64 `json:"limit"`
	LimitRemaining *float64 `json:"limit_remaining"`
	LimitReset *string `json:"limit_reset"`
	Limits map[string]interface{} `json:"limits"`
	Name *string `json:"name"`
	Prefix *string `json:"prefix"`
	Scopes interface{} `json:"scopes"`
	SoftBlocked bool `json:"soft_blocked"`
	Status *string `json:"status"`
	UpdatedAt *string `json:"updated_at"`
	Usage float64 `json:"usage"`
	UsageDaily float64 `json:"usage_daily"`
	UsageDetails map[string]interface{} `json:"usage_details"`
	UsageMonthly float64 `json:"usage_monthly"`
	UsageWeekly float64 `json:"usage_weekly"`
	WorkspaceId string `json:"workspace_id"`
}

type ApiKeyCreateRequest struct {
	Disabled *bool `json:"disabled,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	IncludeByokInLimit *bool `json:"include_byok_in_limit,omitempty"`
	Limit *float64 `json:"limit,omitempty"`
	LimitReset *string `json:"limit_reset,omitempty"`
	Limits *map[string]interface{} `json:"limits,omitempty"`
	Name string `json:"name"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	WorkspaceId *string `json:"workspace_id,omitempty"`
}

type ApiKeyLimitBucket struct {
	Cost *float64 `json:"cost"`
	Requests *int `json:"requests"`
}

type ApiKeyLimitInputBucket struct {
	Cost *float64 `json:"cost,omitempty"`
	Requests *int `json:"requests,omitempty"`
}

type ApiKeyLimitInputWindows struct {
	Daily *map[string]interface{} `json:"daily,omitempty"`
	Monthly *map[string]interface{} `json:"monthly,omitempty"`
	Weekly *map[string]interface{} `json:"weekly,omitempty"`
}

type ApiKeyLimitWindows struct {
	Daily map[string]interface{} `json:"daily"`
	Monthly map[string]interface{} `json:"monthly"`
	Weekly map[string]interface{} `json:"weekly"`
}

type ApiKeyListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type ApiKeyResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ApiKeyRotateRequest struct {
	Name *string `json:"name,omitempty"`
	PreviousKeyExpiresAt *string `json:"previous_key_expires_at,omitempty"`
}

type ApiKeyRotateResponse struct {
	Data map[string]interface{} `json:"data"`
	PreviousKeyExpiresAt *string `json:"previous_key_expires_at"`
}

type ApiKeyScopeValue = interface{}

type ApiKeyUpdateRequest struct {
	Disabled *bool `json:"disabled,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	IncludeByokInLimit *bool `json:"include_byok_in_limit,omitempty"`
	Limit *float64 `json:"limit,omitempty"`
	LimitReset *string `json:"limit_reset,omitempty"`
	Limits *map[string]interface{} `json:"limits,omitempty"`
	Name *string `json:"name,omitempty"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
}

type ApiKeyUsageBucket struct {
	Cost float64 `json:"cost"`
	Requests int `json:"requests"`
}

type ApiKeyUsageWindows struct {
	Daily map[string]interface{} `json:"daily"`
	Monthly map[string]interface{} `json:"monthly"`
	Total map[string]interface{} `json:"total"`
	Weekly map[string]interface{} `json:"weekly"`
}

type ApiKeyWithValue struct {
	CreatedAt *string `json:"created_at"`
	CreatedBy *string `json:"created_by"`
	CreatorUserId *string `json:"creator_user_id"`
	Disabled bool `json:"disabled"`
	ExpiresAt *string `json:"expires_at"`
	Hash string `json:"hash"`
	Id string `json:"id"`
	IncludeByokInLimit bool `json:"include_byok_in_limit"`
	Key string `json:"key"`
	Label *string `json:"label"`
	LastUsedAt *string `json:"last_used_at"`
	Limit *float64 `json:"limit"`
	LimitRemaining *float64 `json:"limit_remaining"`
	LimitReset *string `json:"limit_reset"`
	Limits map[string]interface{} `json:"limits"`
	Name *string `json:"name"`
	Prefix *string `json:"prefix"`
	Scopes interface{} `json:"scopes"`
	SoftBlocked bool `json:"soft_blocked"`
	Status *string `json:"status"`
	UpdatedAt *string `json:"updated_at"`
	Usage float64 `json:"usage"`
	UsageDaily float64 `json:"usage_daily"`
	UsageDetails map[string]interface{} `json:"usage_details"`
	UsageMonthly float64 `json:"usage_monthly"`
	UsageWeekly float64 `json:"usage_weekly"`
	WorkspaceId string `json:"workspace_id"`
}

type ApiKeyWithValueResponse struct {
	Data map[string]interface{} `json:"data"`
}

type AsyncJobWebSocketClientEvent struct {
	Type string `json:"type"`
}

type AsyncJobWebSocketServerEvent struct {
	Data *interface{} `json:"data,omitempty"`
	Type string `json:"type"`
}

type AsyncJobWebSocketUpgradeRequiredResponse struct {
	Error *map[string]interface{} `json:"error,omitempty"`
}

type AsyncWebhookDeliveryAttempt struct {
	AttemptNumber *int `json:"attempt_number,omitempty"`
	DeliveredAt *string `json:"delivered_at,omitempty"`
	DeliveryKey *string `json:"delivery_key,omitempty"`
	ErrorMessage *string `json:"error_message,omitempty"`
	EventType *string `json:"event_type,omitempty"`
	Id *string `json:"id,omitempty"`
	MaxAttempts *int `json:"max_attempts,omitempty"`
	NextRetryAt *string `json:"next_retry_at,omitempty"`
	ResponseBodyPreview *string `json:"response_body_preview,omitempty"`
	ResponseStatus *int `json:"response_status,omitempty"`
	Status *string `json:"status,omitempty"`
	TriedAt *string `json:"tried_at,omitempty"`
}

type AsyncWebhookDeliverySummary struct {
	DeliveredEventTypes *[]string `json:"delivered_event_types,omitempty"`
	DeliveredEvents *int `json:"delivered_events,omitempty"`
	LastAttemptAt *string `json:"last_attempt_at,omitempty"`
	LastAttemptStatus *string `json:"last_attempt_status,omitempty"`
	LastDeliveredAt *string `json:"last_delivered_at,omitempty"`
	LastErrorMessage *string `json:"last_error_message,omitempty"`
	LastFailureAt *string `json:"last_failure_at,omitempty"`
	LastResponseStatus *int `json:"last_response_status,omitempty"`
	NextRetryAt *string `json:"next_retry_at,omitempty"`
	PendingRetries *int `json:"pending_retries,omitempty"`
	TotalAttempts *int `json:"total_attempts,omitempty"`
}

type AsyncWebhookPublicState struct {
	Attempts *[]map[string]interface{} `json:"attempts,omitempty"`
	Delivery *map[string]interface{} `json:"delivery,omitempty"`
	Events *[]string `json:"events,omitempty"`
	HasSecret *bool `json:"has_secret,omitempty"`
	Url *string `json:"url,omitempty"`
}

type AudioContentPart struct {
	InputAudio map[string]interface{} `json:"input_audio"`
	Type string `json:"type"`
}

type AudioSpeechRequest struct {
	Format *string `json:"format,omitempty"`
	Input string `json:"input"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Voice *string `json:"voice,omitempty"`
}

type AudioTranscriptionRequest struct {
	AudioB64 *string `json:"audio_b64,omitempty"`
	AudioUrl *string `json:"audio_url,omitempty"`
	ChunkingStrategy interface{} `json:"chunking_strategy,omitempty"`
	KnownSpeakerNames *[]string `json:"known_speaker_names,omitempty"`
	KnownSpeakerReferences *[]string `json:"known_speaker_references,omitempty"`
	Language *string `json:"language,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
}

type AudioTranscriptionResponse struct {
	Text *string `json:"text,omitempty"`
}

type AudioTranslationRequest struct {
	AudioB64 *string `json:"audio_b64,omitempty"`
	AudioUrl *string `json:"audio_url,omitempty"`
	Language *string `json:"language,omitempty"`
	Model string `json:"model"`
	Prompt *string `json:"prompt,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
}

type AudioTranslationResponse struct {
	Text *string `json:"text,omitempty"`
}

type BatchBillingSummary struct {
	Billed *bool `json:"billed,omitempty"`
	Charged *bool `json:"charged,omitempty"`
	CostNanos *int `json:"cost_nanos,omitempty"`
	CostUsd *float64 `json:"cost_usd,omitempty"`
	Currency *string `json:"currency,omitempty"`
	EstimatedNanos *int `json:"estimated_nanos,omitempty"`
	EstimatedProviderCost *string `json:"estimated_provider_cost,omitempty"`
	EstimatedUserCost *string `json:"estimated_user_cost,omitempty"`
	EstimationSampleSize *int `json:"estimation_sample_size,omitempty"`
	EstimationTotalRows *int `json:"estimation_total_rows,omitempty"`
	EstimationTruncated *bool `json:"estimation_truncated,omitempty"`
	FinalizedAt *string `json:"finalized_at,omitempty"`
	PricingBreakdown *map[string]interface{} `json:"pricing_breakdown,omitempty"`
	Reason *string `json:"reason,omitempty"`
	ReservationId *string `json:"reservation_id,omitempty"`
	ReservationStatus *string `json:"reservation_status,omitempty"`
	ReservedNanos *int `json:"reserved_nanos,omitempty"`
	SettledProviderCost *string `json:"settled_provider_cost,omitempty"`
	SettledUserCost *string `json:"settled_user_cost,omitempty"`
	State *string `json:"state,omitempty"`
	TotalNanos *int `json:"total_nanos,omitempty"`
}

type BatchListResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	FirstId *string `json:"first_id,omitempty"`
	HasMore *bool `json:"has_more,omitempty"`
	LastId *string `json:"last_id,omitempty"`
	Object *string `json:"object,omitempty"`
}

type BatchModelCapability struct {
	InputTypes *[]string `json:"input_types,omitempty"`
	Model *string `json:"model,omitempty"`
	Name *string `json:"name,omitempty"`
	OutputTypes *[]string `json:"output_types,omitempty"`
	Pricing *map[string]interface{} `json:"pricing,omitempty"`
	Providers *[]map[string]interface{} `json:"providers,omitempty"`
	Status *string `json:"status,omitempty"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
	SupportedParams *[]string `json:"supported_params,omitempty"`
	SupportedParamsDetail *map[string]interface{} `json:"supported_params_detail,omitempty"`
}

type BatchModelProviderCapability struct {
	Id *string `json:"id,omitempty"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
	SupportedParams *[]string `json:"supported_params,omitempty"`
	SupportedParamsDetail *map[string]interface{} `json:"supported_params_detail,omitempty"`
}

type BatchModelsResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Object *string `json:"object,omitempty"`
}

type BatchProviderCapability struct {
	DocumentationUrl *string `json:"documentation_url,omitempty"`
	Endpoints *[]map[string]interface{} `json:"endpoints,omitempty"`
	GatewayInputModes *[]string `json:"gateway_input_modes,omitempty"`
	Id *string `json:"id,omitempty"`
	Name *string `json:"name,omitempty"`
	NativeInputModes *[]string `json:"native_input_modes,omitempty"`
	Notes *string `json:"notes,omitempty"`
	Status *string `json:"status,omitempty"`
}

type BatchRequest struct {
	CompletionWindow *string `json:"completion_window,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	InputFileId *string `json:"input_file_id,omitempty"`
	Items *[]map[string]interface{} `json:"items,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model *string `json:"model,omitempty"`
	Prompts *[]string `json:"prompts,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Requests *[]map[string]interface{} `json:"requests,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	System *string `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
	WebhookEndpointId *string `json:"webhook_endpoint_id,omitempty"`
}

type BatchRequestCounts struct {
	Completed *int `json:"completed,omitempty"`
	Failed *int `json:"failed,omitempty"`
	Total *int `json:"total,omitempty"`
}

type BatchRequestItem struct {
	Body map[string]interface{} `json:"body"`
	CustomId *string `json:"custom_id,omitempty"`
	Method *string `json:"method,omitempty"`
	Url *string `json:"url,omitempty"`
}

type BatchRequestRow struct {
	CompletedAt *string `json:"completed_at,omitempty"`
	CostNanos *int `json:"cost_nanos,omitempty"`
	CostUsd *float64 `json:"cost_usd,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	CustomId *string `json:"custom_id,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	ErrorBody *map[string]interface{} `json:"error_body,omitempty"`
	Id *string `json:"id,omitempty"`
	Meta *map[string]interface{} `json:"meta,omitempty"`
	Method *string `json:"method,omitempty"`
	Model *string `json:"model,omitempty"`
	NativeBatchId *string `json:"native_batch_id,omitempty"`
	Provider *string `json:"provider,omitempty"`
	RequestBodyHash *string `json:"request_body_hash,omitempty"`
	RequestIndex *int `json:"request_index,omitempty"`
	ResponseBody *map[string]interface{} `json:"response_body,omitempty"`
	ResponseStatus *int `json:"response_status,omitempty"`
	Status *string `json:"status,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type BatchResponse struct {
	Billing *map[string]interface{} `json:"billing,omitempty"`
	CancelUrl *string `json:"cancel_url,omitempty"`
	CancelledAt *int `json:"cancelled_at,omitempty"`
	CancellingAt *int `json:"cancelling_at,omitempty"`
	CompletedAt *int `json:"completed_at,omitempty"`
	CompletionWindow *string `json:"completion_window,omitempty"`
	CreatedAt *int `json:"created_at,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	ErrorFileId *string `json:"error_file_id,omitempty"`
	Errors *map[string]interface{} `json:"errors,omitempty"`
	ExpiredAt *int `json:"expired_at,omitempty"`
	ExpiresAt *int `json:"expires_at,omitempty"`
	FailedAt *int `json:"failed_at,omitempty"`
	FinalizedAt *string `json:"finalized_at,omitempty"`
	FinalizingAt *int `json:"finalizing_at,omitempty"`
	Id *string `json:"id,omitempty"`
	InProgressAt *int `json:"in_progress_at,omitempty"`
	InputFileId *string `json:"input_file_id,omitempty"`
	LastWebhookDispatchedAt *string `json:"last_webhook_dispatched_at,omitempty"`
	LastWebhookProgress *float64 `json:"last_webhook_progress,omitempty"`
	LastWebhookProgressAt *string `json:"last_webhook_progress_at,omitempty"`
	LifecycleStatus *string `json:"lifecycle_status,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	NativeBatchId *string `json:"native_batch_id,omitempty"`
	NextWebhookRetryAt *string `json:"next_webhook_retry_at,omitempty"`
	Object *string `json:"object,omitempty"`
	OutputFileId *string `json:"output_file_id,omitempty"`
	PollingUrl *string `json:"polling_url,omitempty"`
	PricingLines *[]map[string]interface{} `json:"pricing_lines,omitempty"`
	Progress *int `json:"progress,omitempty"`
	Provider *string `json:"provider,omitempty"`
	RequestCounts *map[string]interface{} `json:"request_counts,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	ResultsUrl *string `json:"results_url,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Status *string `json:"status,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
	WebsocketUrl *string `json:"websocket_url,omitempty"`
}

type BenchmarkId string

const (
	BenchmarkId2BenchRetail BenchmarkId = "2-bench-retail"
	BenchmarkId2BenchTelecom BenchmarkId = "2-bench-telecom"
	BenchmarkIdAaBriefcase BenchmarkId = "aa-briefcase"
	BenchmarkIdAaIndex BenchmarkId = "aa-index"
	BenchmarkIdAaIntelligenceIndexV4 BenchmarkId = "aa-intelligence-index-v4"
	BenchmarkIdAaLcr BenchmarkId = "aa-lcr"
	BenchmarkIdAaOmniscience BenchmarkId = "aa-omniscience"
	BenchmarkIdAaT2vRank BenchmarkId = "aa-t2v-rank"
	BenchmarkIdAceBench BenchmarkId = "ace-bench"
	BenchmarkIdActivitynet BenchmarkId = "activitynet"
	BenchmarkIdAethercode BenchmarkId = "aethercode"
	BenchmarkIdAgentsLastExam BenchmarkId = "agents-last-exam"
	BenchmarkIdAgieval BenchmarkId = "agieval"
	BenchmarkIdAi2ReasoningChallengeArc BenchmarkId = "ai2-reasoning-challenge-(arc)"
	BenchmarkIdAi2Sciarena BenchmarkId = "ai2-sciarena"
	BenchmarkIdAi2d BenchmarkId = "ai2d"
	BenchmarkIdAidanbench BenchmarkId = "aidanbench"
	BenchmarkIdAider BenchmarkId = "aider"
	BenchmarkIdAiderPolyglot BenchmarkId = "aider-polyglot"
	BenchmarkIdAiderPolyglotEdit BenchmarkId = "aider-polyglot-edit"
	BenchmarkIdAime BenchmarkId = "aime"
	BenchmarkIdAime2024 BenchmarkId = "aime-2024"
	BenchmarkIdAime2025 BenchmarkId = "aime-2025"
	BenchmarkIdAime2026 BenchmarkId = "aime-2026"
	BenchmarkIdAinsteinBench BenchmarkId = "ainstein-bench"
	BenchmarkIdAitzEm BenchmarkId = "aitz-em"
	BenchmarkIdAlignbench BenchmarkId = "alignbench"
	BenchmarkIdAllAngles BenchmarkId = "all-angles"
	BenchmarkIdAlpacaeval20 BenchmarkId = "alpacaeval-2.0"
	BenchmarkIdAmc BenchmarkId = "amc"
	BenchmarkIdAmc202223 BenchmarkId = "amc-2022-23"
	BenchmarkIdAndroidControlHighEm BenchmarkId = "android-control-high-em"
	BenchmarkIdAndroidControlLowEm BenchmarkId = "android-control-low-em"
	BenchmarkIdAndroidworld BenchmarkId = "androidworld"
	BenchmarkIdAndroidworldSr BenchmarkId = "androidworld-sr"
	BenchmarkIdApex BenchmarkId = "apex"
	BenchmarkIdApexAgents BenchmarkId = "apex-agents"
	BenchmarkIdApexShortlist BenchmarkId = "apex-shortlist"
	BenchmarkIdArc BenchmarkId = "arc"
	BenchmarkIdArcAgi BenchmarkId = "arc-agi"
	BenchmarkIdArcAgi1 BenchmarkId = "arc-agi-1"
	BenchmarkIdArcAgi2 BenchmarkId = "arc-agi-2"
	BenchmarkIdArcAgi3 BenchmarkId = "arc-agi-3"
	BenchmarkIdArcC BenchmarkId = "arc-c"
	BenchmarkIdArcE BenchmarkId = "arc-e"
	BenchmarkIdArcagi1Image BenchmarkId = "arcagi1-image"
	BenchmarkIdArcagi2Image BenchmarkId = "arcagi2-image"
	BenchmarkIdArenaChatRank BenchmarkId = "arena-chat-rank"
	BenchmarkIdArenaHard BenchmarkId = "arena-hard"
	BenchmarkIdArenaHardV2 BenchmarkId = "arena-hard-v2"
	BenchmarkIdArenaSearchRank BenchmarkId = "arena-search-rank"
	BenchmarkIdArkitscenes BenchmarkId = "arkitscenes"
	BenchmarkIdArtifactsbench BenchmarkId = "artifactsbench"
	BenchmarkIdArtificialAnalysis BenchmarkId = "artificial-analysis"
	BenchmarkIdAttaq BenchmarkId = "attaq"
	BenchmarkIdAutologi BenchmarkId = "autologi"
	BenchmarkIdAutomationbench BenchmarkId = "automationbench"
	BenchmarkIdBabe BenchmarkId = "babe"
	BenchmarkIdBabyvision BenchmarkId = "babyvision"
	BenchmarkIdBabyvisionPython BenchmarkId = "babyvision-python"
	BenchmarkIdBalrogAi BenchmarkId = "balrog-ai"
	BenchmarkIdBbh BenchmarkId = "bbh"
	BenchmarkIdBcflv4 BenchmarkId = "bcflv4"
	BenchmarkIdBeam128k BenchmarkId = "beam128k"
	BenchmarkIdBeyondaime BenchmarkId = "beyondaime"
	BenchmarkIdBfcl BenchmarkId = "bfcl"
	BenchmarkIdBfclOverallFcV4 BenchmarkId = "bfcl-overall-fc-v4"
	BenchmarkIdBfclV2 BenchmarkId = "bfcl-v2"
	BenchmarkIdBfclV3 BenchmarkId = "bfcl-v3"
	BenchmarkIdBfclV3Multiturn BenchmarkId = "bfcl-v3-multiturn"
	BenchmarkIdBfclV4 BenchmarkId = "bfcl-v4"
	BenchmarkIdBigBench BenchmarkId = "big-bench"
	BenchmarkIdBigBenchExtraHard BenchmarkId = "big-bench-extra-hard"
	BenchmarkIdBigBenchHard BenchmarkId = "big-bench-hard"
	BenchmarkIdBigcodebench BenchmarkId = "bigcodebench"
	BenchmarkIdBiobench BenchmarkId = "biobench"
	BenchmarkIdBiolpBench BenchmarkId = "biolp-bench"
	BenchmarkIdBiomysterybench BenchmarkId = "biomysterybench"
	BenchmarkIdBirdSqlDev BenchmarkId = "bird-sql-(dev)"
	BenchmarkIdBixbench BenchmarkId = "bixbench"
	BenchmarkIdBlink BenchmarkId = "blink"
	BenchmarkIdBlueprintBench2 BenchmarkId = "blueprint-bench-2"
	BenchmarkIdBoolq BenchmarkId = "boolq"
	BenchmarkIdBrowsecomp BenchmarkId = "browsecomp"
	BenchmarkIdBrowsecompLong128k BenchmarkId = "browsecomp-long-128k"
	BenchmarkIdBrowsecompLong256k BenchmarkId = "browsecomp-long-256k"
	BenchmarkIdBrowsecompLongContext128k BenchmarkId = "browsecomp-long-context-128k"
	BenchmarkIdBrowsecompLongContext256k BenchmarkId = "browsecomp-long-context-256k"
	BenchmarkIdBrowsecompVl BenchmarkId = "browsecomp-vl"
	BenchmarkIdBrowsecompZh BenchmarkId = "browsecomp-zh"
	BenchmarkIdCEval BenchmarkId = "c-eval"
	BenchmarkIdCcBenchV2Backend BenchmarkId = "cc-bench-v2-backend"
	BenchmarkIdCcBenchV2Frontend BenchmarkId = "cc-bench-v2-frontend"
	BenchmarkIdCcBenchV2Repo BenchmarkId = "cc-bench-v2-repo"
	BenchmarkIdCcOcr BenchmarkId = "cc-ocr"
	BenchmarkIdCfeval BenchmarkId = "cfeval"
	BenchmarkIdCgbench BenchmarkId = "cgbench"
	BenchmarkIdCharadessta BenchmarkId = "charadessta"
	BenchmarkIdChartqa BenchmarkId = "chartqa"
	BenchmarkIdChartqapro BenchmarkId = "chartqapro"
	BenchmarkIdCharxivD BenchmarkId = "charxiv-d"
	BenchmarkIdCharxivDq BenchmarkId = "charxiv-dq"
	BenchmarkIdCharxivR BenchmarkId = "charxiv-r"
	BenchmarkIdCharxivReasoning BenchmarkId = "charxiv-reasoning"
	BenchmarkIdCharxivRq BenchmarkId = "charxiv-rq"
	BenchmarkIdCharxivRqPython BenchmarkId = "charxiv-rq-python"
	BenchmarkIdChestImagenomeAnatomyIou BenchmarkId = "chest-imagenome-anatomy-iou"
	BenchmarkIdChexpertCxrTop5MacroF1 BenchmarkId = "chexpert-cxr-top5-macro-f1"
	BenchmarkIdChineseSimpleqa BenchmarkId = "chinese-simpleqa"
	BenchmarkIdCiMemoriesCoverage BenchmarkId = "ci-memories-coverage"
	BenchmarkIdCiMemoriesViolationRate BenchmarkId = "ci-memories-violation-rate"
	BenchmarkIdClBench BenchmarkId = "cl-bench"
	BenchmarkIdClawEval BenchmarkId = "claw-eval"
	BenchmarkIdCloningscenarios BenchmarkId = "cloningscenarios"
	BenchmarkIdCluewsc BenchmarkId = "cluewsc"
	BenchmarkIdCmath BenchmarkId = "cmath"
	BenchmarkIdCmmlu BenchmarkId = "cmmlu"
	BenchmarkIdCnmo2024 BenchmarkId = "cnmo-2024"
	BenchmarkIdCodeforces BenchmarkId = "codeforces"
	BenchmarkIdCodeforcesNoTool BenchmarkId = "codeforces-no-tool"
	BenchmarkIdCodesimpleqa BenchmarkId = "codesimpleqa"
	BenchmarkIdCollie BenchmarkId = "collie"
	BenchmarkIdCommonVoice15 BenchmarkId = "common-voice-15"
	BenchmarkIdCommonsenseqa BenchmarkId = "commonsenseqa"
	BenchmarkIdComplexfuncbench BenchmarkId = "complexfuncbench"
	BenchmarkIdConfabulations BenchmarkId = "confabulations"
	BenchmarkIdContphy BenchmarkId = "contphy"
	BenchmarkIdCorpusqa1m BenchmarkId = "corpusqa-1m"
	BenchmarkIdCountbench BenchmarkId = "countbench"
	BenchmarkIdCovost2 BenchmarkId = "covost2"
	BenchmarkIdCovost2EnZh BenchmarkId = "covost2-en-zh"
	BenchmarkIdCreativeStoryWriting BenchmarkId = "creative-story-writing"
	BenchmarkIdCreativeWritingV3 BenchmarkId = "creative-writing-v3"
	BenchmarkIdCritpt BenchmarkId = "critpt"
	BenchmarkIdCrossvid BenchmarkId = "crossvid"
	BenchmarkIdCrperelation BenchmarkId = "crperelation"
	BenchmarkIdCruxO BenchmarkId = "crux-o"
	BenchmarkIdCruxevalO BenchmarkId = "cruxeval-o"
	BenchmarkIdCsimpleqa BenchmarkId = "csimpleqa"
	BenchmarkIdCtDataset1MacroAccuracy BenchmarkId = "ct-dataset-1-macro-accuracy"
	BenchmarkIdCtfChallengeTasks BenchmarkId = "ctf-challenge-tasks"
	BenchmarkIdCursorbench31 BenchmarkId = "cursorbench-3.1"
	BenchmarkIdCxr143condMacroF1 BenchmarkId = "cxr14-3cond-macro-f1"
	BenchmarkIdCybench BenchmarkId = "cybench"
	BenchmarkIdCybergym BenchmarkId = "cybergym"
	BenchmarkIdCybersecurityCtfs BenchmarkId = "cybersecurity-ctfs"
	BenchmarkIdDa2k BenchmarkId = "da-2k"
	BenchmarkIdDailyomni BenchmarkId = "dailyomni"
	BenchmarkIdDeckBench BenchmarkId = "deck-bench"
	BenchmarkIdDeepPlanning BenchmarkId = "deep-planning"
	BenchmarkIdDeepconsult BenchmarkId = "deepconsult"
	BenchmarkIdDeepplanningV11AvgAcc BenchmarkId = "deepplanning-v1.1-avg-acc"
	BenchmarkIdDeepplanningV11ShoppingCaseAcc BenchmarkId = "deepplanning-v1.1-shopping-case-acc"
	BenchmarkIdDeepplanningV11ShoppingMatchScore BenchmarkId = "deepplanning-v1.1-shopping-match-score"
	BenchmarkIdDeepplanningV11TravelCaseAcc BenchmarkId = "deepplanning-v1.1-travel-case-acc"
	BenchmarkIdDeepplanningV11TravelCompScore BenchmarkId = "deepplanning-v1.1-travel-comp-score"
	BenchmarkIdDeepplanningV11TravelCsScore BenchmarkId = "deepplanning-v1.1-travel-cs-score"
	BenchmarkIdDeepplanningV11TravelPsScore BenchmarkId = "deepplanning-v1.1-travel-ps-score"
	BenchmarkIdDeepresearchbench BenchmarkId = "deepresearchbench"
	BenchmarkIdDeepsearchqa BenchmarkId = "deepsearchqa"
	BenchmarkIdDeepswe BenchmarkId = "deepswe"
	BenchmarkIdDer2Bench BenchmarkId = "der-2-bench"
	BenchmarkIdDesign2code BenchmarkId = "design2code"
	BenchmarkIdDiscoX BenchmarkId = "disco-x"
	BenchmarkIdDocvqa BenchmarkId = "docvqa"
	BenchmarkIdDocvqatest BenchmarkId = "docvqatest"
	BenchmarkIdDrop BenchmarkId = "drop"
	BenchmarkIdDsArenaCode BenchmarkId = "ds-arena-code"
	BenchmarkIdDsFimEval BenchmarkId = "ds-fim-eval"
	BenchmarkIdDsbenchFullstack BenchmarkId = "dsbench-fullstack"
	BenchmarkIdDsbenchHard BenchmarkId = "dsbench-hard"
	BenchmarkIdDubesorLlm BenchmarkId = "dubesor-llm"
	BenchmarkIdDude BenchmarkId = "dude"
	BenchmarkIdDynamath BenchmarkId = "dynamath"
	BenchmarkIdEgoschema BenchmarkId = "egoschema"
	BenchmarkIdEgotempo BenchmarkId = "egotempo"
	BenchmarkIdEliminationGame BenchmarkId = "elimination-game"
	BenchmarkIdEmbspatialbench BenchmarkId = "embspatialbench"
	BenchmarkIdEmma BenchmarkId = "emma"
	BenchmarkIdEncycloK BenchmarkId = "encyclo-k"
	BenchmarkIdEqBench BenchmarkId = "eq-bench"
	BenchmarkIdEqbench BenchmarkId = "eqbench"
	BenchmarkIdErqa BenchmarkId = "erqa"
	BenchmarkIdEvalplus BenchmarkId = "evalplus"
	BenchmarkIdExpertSwe BenchmarkId = "expert-swe"
	BenchmarkIdExploitbenchCap BenchmarkId = "exploitbench-cap"
	BenchmarkIdEyepacsAccuracy BenchmarkId = "eyepacs-accuracy"
	BenchmarkIdFacts BenchmarkId = "facts"
	BenchmarkIdFactsBenchmarkSuite BenchmarkId = "facts-benchmark-suite"
	BenchmarkIdFactsGrounding BenchmarkId = "facts-grounding"
	BenchmarkIdFactsParametric BenchmarkId = "facts-parametric"
	BenchmarkIdFactscore BenchmarkId = "factscore"
	BenchmarkIdFactscoreHalluciationRate BenchmarkId = "factscore-halluciation-rate"
	BenchmarkIdFictionLiveBench BenchmarkId = "fiction-live-bench"
	BenchmarkIdFigqa BenchmarkId = "figqa"
	BenchmarkIdFinanceagentV11 BenchmarkId = "financeagent-v1.1"
	BenchmarkIdFinanceagentV2 BenchmarkId = "financeagent-v2"
	BenchmarkIdFinsearchcomp BenchmarkId = "finsearchcomp"
	BenchmarkIdFinsearchcompT2T3 BenchmarkId = "finsearchcomp-t2-t3"
	BenchmarkIdFinsearchcompT3 BenchmarkId = "finsearchcomp-t3"
	BenchmarkIdFlameVlmCode BenchmarkId = "flame-vlm-code"
	BenchmarkIdFlenqa BenchmarkId = "flenqa"
	BenchmarkIdFleurs BenchmarkId = "fleurs"
	BenchmarkIdFlteval BenchmarkId = "flteval"
	BenchmarkIdFltevalPass16 BenchmarkId = "flteval-pass-16"
	BenchmarkIdFltevalPass2 BenchmarkId = "flteval-pass-2"
	BenchmarkIdFltevalPass4 BenchmarkId = "flteval-pass-4"
	BenchmarkIdFltevalPass8 BenchmarkId = "flteval-pass-8"
	BenchmarkIdFrames BenchmarkId = "frames"
	BenchmarkIdFrontierMath BenchmarkId = "frontier-math"
	BenchmarkIdFrontierbenchV01 BenchmarkId = "frontierbench-v0.1"
	BenchmarkIdFrontiercode11Main BenchmarkId = "frontiercode-1.1-main"
	BenchmarkIdFrontiercodeDiamond BenchmarkId = "frontiercode-diamond"
	BenchmarkIdFrontiermath BenchmarkId = "frontiermath"
	BenchmarkIdFrontiersciOlympiad BenchmarkId = "frontiersci-olympiad"
	BenchmarkIdFrontiersciResearch BenchmarkId = "frontiersci-research"
	BenchmarkIdFrontierswe BenchmarkId = "frontierswe"
	BenchmarkIdFsc147Down BenchmarkId = "fsc-147-down"
	BenchmarkIdFullstackbenchEn BenchmarkId = "fullstackbench-en"
	BenchmarkIdFullstackbenchZh BenchmarkId = "fullstackbench-zh"
	BenchmarkIdFunctionalmath BenchmarkId = "functionalmath"
	BenchmarkIdGaia2 BenchmarkId = "gaia2"
	BenchmarkIdGalileoAgent BenchmarkId = "galileo-agent"
	BenchmarkIdGdpPdf BenchmarkId = "gdp-pdf"
	BenchmarkIdGdpvalAa BenchmarkId = "gdpval-aa"
	BenchmarkIdGdpvalMm BenchmarkId = "gdpval-mm"
	BenchmarkIdGenebench BenchmarkId = "genebench"
	BenchmarkIdGiantstepsTempo BenchmarkId = "giantsteps-tempo"
	BenchmarkIdGlobalMmluLite BenchmarkId = "global-mmlu-lite"
	BenchmarkIdGlobalPica BenchmarkId = "global-pica"
	BenchmarkIdGlobalPiqa BenchmarkId = "global-piqa"
	BenchmarkIdGovreport BenchmarkId = "govreport"
	BenchmarkIdGpqa BenchmarkId = "gpqa"
	BenchmarkIdGpqaDiamond BenchmarkId = "gpqa-diamond"
	BenchmarkIdGraphwalksBfs128k BenchmarkId = "graphwalks-bfs->128k"
	BenchmarkIdGraphwalksBfs1mF1 BenchmarkId = "graphwalks-bfs-1m-f1"
	BenchmarkIdGraphwalksBfs256kF1 BenchmarkId = "graphwalks-bfs-256k-f1"
	BenchmarkIdGraphwalksBfsLt128k BenchmarkId = "graphwalks-bfs-lt-128k"
	BenchmarkIdGraphwalksParents128k BenchmarkId = "graphwalks-parents->128k"
	BenchmarkIdGraphwalksParents1mF1 BenchmarkId = "graphwalks-parents-1m-f1"
	BenchmarkIdGraphwalksParents256kF1 BenchmarkId = "graphwalks-parents-256k-f1"
	BenchmarkIdGraphwalksParentsLt128k BenchmarkId = "graphwalks-parents-lt-128k"
	BenchmarkIdGsm8k BenchmarkId = "gsm8k"
	BenchmarkIdGsm8kChat BenchmarkId = "gsm8k-chat"
	BenchmarkIdHallusionBench BenchmarkId = "hallusion-bench"
	BenchmarkIdHallusionbench BenchmarkId = "hallusionbench"
	BenchmarkIdHealthbench BenchmarkId = "healthbench"
	BenchmarkIdHealthbenchConcensus BenchmarkId = "healthbench-concensus"
	BenchmarkIdHealthbenchHard BenchmarkId = "healthbench-hard"
	BenchmarkIdHealthbenchProfessional BenchmarkId = "healthbench-professional"
	BenchmarkIdHellaswag BenchmarkId = "hellaswag"
	BenchmarkIdHiddenmath BenchmarkId = "hiddenmath"
	BenchmarkIdHipho BenchmarkId = "hipho"
	BenchmarkIdHleNoToolTextOnly BenchmarkId = "hle-no-tool-text-only"
	BenchmarkIdHleText BenchmarkId = "hle-text"
	BenchmarkIdHleVerified BenchmarkId = "hle-verified"
	BenchmarkIdHleVl BenchmarkId = "hle-vl"
	BenchmarkIdHmmt2025 BenchmarkId = "hmmt-2025"
	BenchmarkIdHmmt2026Feb BenchmarkId = "hmmt-2026-feb"
	BenchmarkIdHmmtFeb2025 BenchmarkId = "hmmt-feb-2025"
	BenchmarkIdHmmtFeb2026 BenchmarkId = "hmmt-feb-2026"
	BenchmarkIdHmmtFeb26 BenchmarkId = "hmmt-feb-26"
	BenchmarkIdHmmtNov2025 BenchmarkId = "hmmt-nov-2025"
	BenchmarkIdHpct BenchmarkId = "hpct"
	BenchmarkIdHrBench4k BenchmarkId = "hr-bench-4k"
	BenchmarkIdHumaneval BenchmarkId = "humaneval"
	BenchmarkIdHumanevalAverage BenchmarkId = "humaneval-average"
	BenchmarkIdHumanevalMul BenchmarkId = "humaneval-mul"
	BenchmarkIdHumaneval2 BenchmarkId = "humaneval+"
	BenchmarkIdHumanevalfimAverage BenchmarkId = "humanevalfim-average"
	BenchmarkIdHumanitysLastExam BenchmarkId = "humanitys-last-exam"
	BenchmarkIdHumanitysLastExamTools BenchmarkId = "humanitys-last-exam-tools"
	BenchmarkIdHypersim BenchmarkId = "hypersim"
	BenchmarkIdIf BenchmarkId = "if"
	BenchmarkIdIfBench BenchmarkId = "if-bench"
	BenchmarkIdIfEval BenchmarkId = "if-eval"
	BenchmarkIdIfbench BenchmarkId = "ifbench"
	BenchmarkIdImagemining BenchmarkId = "imagemining"
	BenchmarkIdImoanswerbench BenchmarkId = "imoanswerbench"
	BenchmarkIdImoanswerbenchNoTool BenchmarkId = "imoanswerbench-no-tool"
	BenchmarkIdInclude BenchmarkId = "include"
	BenchmarkIdInfographicsqa BenchmarkId = "infographicsqa"
	BenchmarkIdInfovqa BenchmarkId = "infovqa"
	BenchmarkIdInfovqatest BenchmarkId = "infovqatest"
	BenchmarkIdInstructHumaneval BenchmarkId = "instruct-humaneval"
	BenchmarkIdIntergps BenchmarkId = "intergps"
	BenchmarkIdInternalApiInstructionFollowingHard BenchmarkId = "internal-api-instruction-following-(hard)"
	BenchmarkIdInverseIfeval BenchmarkId = "inverse-ifeval"
	BenchmarkIdInvestmentBankingModeling BenchmarkId = "investment-banking-modeling"
	BenchmarkIdIqBench BenchmarkId = "iq-bench"
	BenchmarkIdIvebenchConsistencyVsKlingO1 BenchmarkId = "ivebench-consistency-vs-kling-o1"
	BenchmarkIdIvebenchConsistencyVsRunwayAleph BenchmarkId = "ivebench-consistency-vs-runway-aleph"
	BenchmarkIdIvebenchInstructionFollowingVsKlingO1 BenchmarkId = "ivebench-instruction-following-vs-kling-o1"
	BenchmarkIdIvebenchInstructionFollowingVsRunwayAleph BenchmarkId = "ivebench-instruction-following-vs-runway-aleph"
	BenchmarkIdIvebenchOverallVsKlingO1 BenchmarkId = "ivebench-overall-vs-kling-o1"
	BenchmarkIdIvebenchOverallVsRunwayAleph BenchmarkId = "ivebench-overall-vs-runway-aleph"
	BenchmarkIdJobbench BenchmarkId = "jobbench"
	BenchmarkIdKimiCodeBench2 BenchmarkId = "kimi-code-bench-2"
	BenchmarkIdKorbench BenchmarkId = "korbench"
	BenchmarkIdLbppV2 BenchmarkId = "lbpp-(v2)"
	BenchmarkIdLegalAgentBenchmark BenchmarkId = "legal-agent-benchmark"
	BenchmarkIdLingoqa BenchmarkId = "lingoqa"
	BenchmarkIdLisanbench BenchmarkId = "lisanbench"
	BenchmarkIdLivebench BenchmarkId = "livebench"
	BenchmarkIdLivebench20241125 BenchmarkId = "livebench-20241125"
	BenchmarkIdLivecodebench BenchmarkId = "livecodebench"
	BenchmarkIdLivecodebenchCoding BenchmarkId = "livecodebench-coding"
	BenchmarkIdLivecodebenchPro BenchmarkId = "livecodebench-pro"
	BenchmarkIdLivecodebenchV5 BenchmarkId = "livecodebench-v5"
	BenchmarkIdLivecodebenchV52412252 BenchmarkId = "livecodebench-v5-24.12-25.2"
	BenchmarkIdLivecodebenchV6 BenchmarkId = "livecodebench-v6"
	BenchmarkIdLivecodebench0109 BenchmarkId = "livecodebench(01-09)"
	BenchmarkIdLivesports3k BenchmarkId = "livesports-3k"
	BenchmarkIdLmarenaText BenchmarkId = "lmarena-text"
	BenchmarkIdLmarenaWebdev BenchmarkId = "lmarena-webdev"
	BenchmarkIdLogicvista BenchmarkId = "logicvista"
	BenchmarkIdLongbenchV2 BenchmarkId = "longbench-v2"
	BenchmarkIdLongbenchV2128k BenchmarkId = "longbench-v2-128k"
	BenchmarkIdLongcodebench1m BenchmarkId = "longcodebench-1m"
	BenchmarkIdLongdocurl BenchmarkId = "longdocurl"
	BenchmarkIdLongfactConcepts BenchmarkId = "longfact-concepts"
	BenchmarkIdLongfactConceptsHallucinationRate BenchmarkId = "longfact-concepts-hallucination-rate"
	BenchmarkIdLongfactObjects BenchmarkId = "longfact-objects"
	BenchmarkIdLongfactObjectsHallucinationRate BenchmarkId = "longfact-objects-hallucination-rate"
	BenchmarkIdLongvideobench BenchmarkId = "longvideobench"
	BenchmarkIdLpfqa BenchmarkId = "lpfqa"
	BenchmarkIdLsat BenchmarkId = "lsat"
	BenchmarkIdLvbench BenchmarkId = "lvbench"
	BenchmarkIdMarsBench BenchmarkId = "mars-bench"
	BenchmarkIdMask BenchmarkId = "mask"
	BenchmarkIdMath BenchmarkId = "math"
	BenchmarkIdMath500 BenchmarkId = "math-500"
	BenchmarkIdMatharena BenchmarkId = "matharena"
	BenchmarkIdMatharenaApex BenchmarkId = "matharena-apex"
	BenchmarkIdMatharenaapex BenchmarkId = "matharenaapex"
	BenchmarkIdMatharenaapexShortlist BenchmarkId = "matharenaapex-shortlist"
	BenchmarkIdMathcanvas BenchmarkId = "mathcanvas"
	BenchmarkIdMathkangaroo BenchmarkId = "mathkangaroo"
	BenchmarkIdMathverseMini BenchmarkId = "mathverse-mini"
	BenchmarkIdMathvision BenchmarkId = "mathvision"
	BenchmarkIdMathvisionPython BenchmarkId = "mathvision-python"
	BenchmarkIdMathvista BenchmarkId = "mathvista"
	BenchmarkIdMathvistaMini BenchmarkId = "mathvista-mini"
	BenchmarkIdMaxife BenchmarkId = "maxife"
	BenchmarkIdMbct BenchmarkId = "mbct"
	BenchmarkIdMbpp BenchmarkId = "mbpp"
	BenchmarkIdMbppEvalplus BenchmarkId = "mbpp-evalplus"
	BenchmarkIdMbpp2 BenchmarkId = "mbpp+"
	BenchmarkIdMcBench BenchmarkId = "mc-bench"
	BenchmarkIdMcpMark BenchmarkId = "mcp-mark"
	BenchmarkIdMedxpertqa BenchmarkId = "medxpertqa"
	BenchmarkIdMedxpertqaAccuracy BenchmarkId = "medxpertqa-accuracy"
	BenchmarkIdMegaMlqa BenchmarkId = "mega-mlqa"
	BenchmarkIdMegaTydiQa BenchmarkId = "mega-tydi-qa"
	BenchmarkIdMegaUdpos BenchmarkId = "mega-udpos"
	BenchmarkIdMegaXcopa BenchmarkId = "mega-xcopa"
	BenchmarkIdMegaXstorycloze BenchmarkId = "mega-xstorycloze"
	BenchmarkIdMeld BenchmarkId = "meld"
	BenchmarkIdMetr BenchmarkId = "metr"
	BenchmarkIdMewc BenchmarkId = "mewc"
	BenchmarkIdMgsm BenchmarkId = "mgsm"
	BenchmarkIdMiabench BenchmarkId = "miabench"
	BenchmarkIdMimicCxrTop5MacroF1 BenchmarkId = "mimic-cxr-top5-macro-f1"
	BenchmarkIdMimoCodingBench BenchmarkId = "mimo-coding-bench"
	BenchmarkIdMinedojoVerified BenchmarkId = "minedojo-verified"
	BenchmarkIdMinerva BenchmarkId = "minerva"
	BenchmarkIdMisguidedAttention BenchmarkId = "misguided-attention"
	BenchmarkIdMleBench BenchmarkId = "mle-bench"
	BenchmarkIdMleBenchLite BenchmarkId = "mle-bench-lite"
	BenchmarkIdMlsBenchLite BenchmarkId = "mls-bench-lite"
	BenchmarkIdMlvu BenchmarkId = "mlvu"
	BenchmarkIdMlvuM BenchmarkId = "mlvu-m"
	BenchmarkIdMmBrowsecomp BenchmarkId = "mm-browsecomp"
	BenchmarkIdMmBrowsercomp BenchmarkId = "mm-browsercomp"
	BenchmarkIdMmClawbench BenchmarkId = "mm-clawbench"
	BenchmarkIdMmIfEval BenchmarkId = "mm-if-eval"
	BenchmarkIdMmMtBench BenchmarkId = "mm-mt-bench"
	BenchmarkIdMmau BenchmarkId = "mmau"
	BenchmarkIdMmauMusic BenchmarkId = "mmau-music"
	BenchmarkIdMmauSound BenchmarkId = "mmau-sound"
	BenchmarkIdMmauSpeech BenchmarkId = "mmau-speech"
	BenchmarkIdMmbench BenchmarkId = "mmbench"
	BenchmarkIdMmbenchTest BenchmarkId = "mmbench-test"
	BenchmarkIdMmbenchV11 BenchmarkId = "mmbench-v1.1"
	BenchmarkIdMmbenchVideo BenchmarkId = "mmbench-video"
	BenchmarkIdMme BenchmarkId = "mme"
	BenchmarkIdMmeCc BenchmarkId = "mme-cc"
	BenchmarkIdMmeRealworld BenchmarkId = "mme-realworld"
	BenchmarkIdMmlongbench BenchmarkId = "mmlongbench"
	BenchmarkIdMmlongbenchDoc BenchmarkId = "mmlongbench-doc"
	BenchmarkIdMmlu BenchmarkId = "mmlu"
	BenchmarkIdMmluChat BenchmarkId = "mmlu-chat"
	BenchmarkIdMmluFrench BenchmarkId = "mmlu-french"
	BenchmarkIdMmluMultilingual BenchmarkId = "mmlu-multilingual"
	BenchmarkIdMmluPro BenchmarkId = "mmlu-pro"
	BenchmarkIdMmluProx BenchmarkId = "mmlu-prox"
	BenchmarkIdMmluRedux BenchmarkId = "mmlu-redux"
	BenchmarkIdMmluRedux20 BenchmarkId = "mmlu-redux-2.0"
	BenchmarkIdMmluStem BenchmarkId = "mmlu-stem"
	BenchmarkIdMmmlu BenchmarkId = "mmmlu"
	BenchmarkIdMmmu BenchmarkId = "mmmu"
	BenchmarkIdMmmuVal BenchmarkId = "mmmu-(val)"
	BenchmarkIdMmmuValidation BenchmarkId = "mmmu-(validation)"
	BenchmarkIdMmmuPro BenchmarkId = "mmmu-pro"
	BenchmarkIdMmmuProPython BenchmarkId = "mmmu-pro-python"
	BenchmarkIdMmmuval BenchmarkId = "mmmuval"
	BenchmarkIdMmsearch BenchmarkId = "mmsearch"
	BenchmarkIdMmsearchPlus BenchmarkId = "mmsearch-plus"
	BenchmarkIdMmsibenchCircular BenchmarkId = "mmsibench-circular"
	BenchmarkIdMmstar BenchmarkId = "mmstar"
	BenchmarkIdMmtBench BenchmarkId = "mmt-bench"
	BenchmarkIdMmvet BenchmarkId = "mmvet"
	BenchmarkIdMmvetgpt4turbo BenchmarkId = "mmvetgpt4turbo"
	BenchmarkIdMmvu BenchmarkId = "mmvu"
	BenchmarkIdMobileminiwobSr BenchmarkId = "mobileminiwob++-sr"
	BenchmarkIdMorse500 BenchmarkId = "morse-500"
	BenchmarkIdMotionbench BenchmarkId = "motionbench"
	BenchmarkIdMrcr BenchmarkId = "mrcr"
	BenchmarkIdMrcr1m BenchmarkId = "mrcr-1m"
	BenchmarkIdMrcr1mPointwise BenchmarkId = "mrcr-1m-(pointwise)"
	BenchmarkIdMrcrV2 BenchmarkId = "mrcr-v2"
	BenchmarkIdMrcrV28Needle BenchmarkId = "mrcr-v2-(8-needle)"
	BenchmarkIdMrcrV28Needle2 BenchmarkId = "mrcr-v2-8-needle"
	BenchmarkIdMriDataset1MacroAccuracy BenchmarkId = "mri-dataset-1-macro-accuracy"
	BenchmarkIdMsCxrTMacroAccuracy BenchmarkId = "ms-cxr-t-macro-accuracy"
	BenchmarkIdMtBench BenchmarkId = "mt-bench"
	BenchmarkIdMtvqa BenchmarkId = "mtvqa"
	BenchmarkIdMuirbench BenchmarkId = "muirbench"
	BenchmarkIdMultiChallenge BenchmarkId = "multi-challenge"
	BenchmarkIdMultiIf BenchmarkId = "multi-if"
	BenchmarkIdMultiSweBench BenchmarkId = "multi-swe-bench"
	BenchmarkIdMultichallengeO3MiniGrader BenchmarkId = "multichallenge-(o3-mini-grader)"
	BenchmarkIdMultilf BenchmarkId = "multilf"
	BenchmarkIdMultilingualMmlu BenchmarkId = "multilingual-mmlu"
	BenchmarkIdMultiloko BenchmarkId = "multiloko"
	BenchmarkIdMultiplE BenchmarkId = "multipl-e"
	BenchmarkIdMusiccaps BenchmarkId = "musiccaps"
	BenchmarkIdMvbench BenchmarkId = "mvbench"
	BenchmarkIdNaturalQuestions BenchmarkId = "natural-questions"
	BenchmarkIdNatural2code BenchmarkId = "natural2code"
	BenchmarkIdNl2repo BenchmarkId = "nl2repo"
	BenchmarkIdNl2repoBench BenchmarkId = "nl2repo-bench"
	BenchmarkIdNl2repoPass1 BenchmarkId = "nl2repo-pass-1"
	BenchmarkIdNmos BenchmarkId = "nmos"
	BenchmarkIdNova63 BenchmarkId = "nova-63"
	BenchmarkIdNuscene BenchmarkId = "nuscene"
	BenchmarkIdNytConnections BenchmarkId = "nyt-connections"
	BenchmarkIdObjectron BenchmarkId = "objectron"
	BenchmarkIdOcrbench BenchmarkId = "ocrbench"
	BenchmarkIdOcrbenchV2 BenchmarkId = "ocrbench-v2"
	BenchmarkIdOcrbenchV2En BenchmarkId = "ocrbench-v2-(en)"
	BenchmarkIdOcrbenchV2Zh BenchmarkId = "ocrbench-v2-(zh)"
	BenchmarkIdOcrbenchv2 BenchmarkId = "ocrbenchv2"
	BenchmarkIdOctocodingbench BenchmarkId = "octocodingbench"
	BenchmarkIdOdinw BenchmarkId = "odinw"
	BenchmarkIdOdvbench BenchmarkId = "odvbench"
	BenchmarkIdOfficeqa BenchmarkId = "officeqa"
	BenchmarkIdOfficeqaPro BenchmarkId = "officeqa-pro"
	BenchmarkIdOjbench BenchmarkId = "ojbench"
	BenchmarkIdOjbenchCpp BenchmarkId = "ojbench-cpp"
	BenchmarkIdOlympiadbench BenchmarkId = "olympiadbench"
	BenchmarkIdOmnibench BenchmarkId = "omnibench"
	BenchmarkIdOmnibenchMusic BenchmarkId = "omnibench-music"
	BenchmarkIdOmnidocbench BenchmarkId = "omnidocbench"
	BenchmarkIdOmnidocbench15Down BenchmarkId = "omnidocbench-1-5-down"
	BenchmarkIdOmnidocbench15 BenchmarkId = "omnidocbench-1.5"
	BenchmarkIdOmnigaia BenchmarkId = "omnigaia"
	BenchmarkIdOmnimath BenchmarkId = "omnimath"
	BenchmarkIdOpenaiMrcr2Needle128k BenchmarkId = "openai-mrcr-2-needle-128k"
	BenchmarkIdOpenaiMrcr2Needle256k BenchmarkId = "openai-mrcr-2-needle-256k"
	BenchmarkIdOpenaiMrcr8Needle128k BenchmarkId = "openai-mrcr-8-needle-128k"
	BenchmarkIdOpenaiMrcr8Needle1m BenchmarkId = "openai-mrcr-8-needle-1m"
	BenchmarkIdOpenaiMrcrV28Needle BenchmarkId = "openai-mrcr-v2-8-needle"
	BenchmarkIdOpenaiMrcr2Needle128k2 BenchmarkId = "openai-mrcr:-2-needle-128k"
	BenchmarkIdOpenaiMrcr2Needle1m BenchmarkId = "openai-mrcr:-2-needle-1m"
	BenchmarkIdOpenbookqa BenchmarkId = "openbookqa"
	BenchmarkIdOpenrca BenchmarkId = "openrca"
	BenchmarkIdOsWorld BenchmarkId = "os-world"
	BenchmarkIdOsworld20 BenchmarkId = "osworld-2.0"
	BenchmarkIdOsworldG BenchmarkId = "osworld-g"
	BenchmarkIdOsworldVerified BenchmarkId = "osworld-verified"
	BenchmarkIdOvbench BenchmarkId = "ovbench"
	BenchmarkIdOvobench BenchmarkId = "ovobench"
	BenchmarkIdPaperbench BenchmarkId = "paperbench"
	BenchmarkIdPathmcqaAccuracy BenchmarkId = "pathmcqa-accuracy"
	BenchmarkIdPerceptionbench BenchmarkId = "perceptionbench"
	BenchmarkIdPerceptiontest BenchmarkId = "perceptiontest"
	BenchmarkIdPhibench BenchmarkId = "phibench"
	BenchmarkIdPhybench BenchmarkId = "phybench"
	BenchmarkIdPhysicsfinals BenchmarkId = "physicsfinals"
	BenchmarkIdPhyxOpenended BenchmarkId = "phyx-openended"
	BenchmarkIdPinchbench BenchmarkId = "pinchbench"
	BenchmarkIdPiqa BenchmarkId = "piqa"
	BenchmarkIdPmcVqa BenchmarkId = "pmc-vqa"
	BenchmarkIdPointBench BenchmarkId = "point-bench"
	BenchmarkIdPointgrounding BenchmarkId = "pointgrounding"
	BenchmarkIdPolymath BenchmarkId = "polymath"
	BenchmarkIdPolymathEn BenchmarkId = "polymath-en"
	BenchmarkIdPope BenchmarkId = "pope"
	BenchmarkIdPopqa BenchmarkId = "popqa"
	BenchmarkIdPosttrainBench BenchmarkId = "posttrain-bench"
	BenchmarkIdProcbench BenchmarkId = "procbench"
	BenchmarkIdProgramBench BenchmarkId = "program-bench"
	BenchmarkIdProtocolqa BenchmarkId = "protocolqa"
	BenchmarkIdProtocolqaPercentage BenchmarkId = "protocolqa-percentage"
	BenchmarkIdQasper BenchmarkId = "qasper"
	BenchmarkIdQmsum BenchmarkId = "qmsum"
	BenchmarkIdQvhighlights BenchmarkId = "qvhighlights"
	BenchmarkIdRealkie BenchmarkId = "realkie"
	BenchmarkIdRealworldqa BenchmarkId = "realworldqa"
	BenchmarkIdRefcocoAvg BenchmarkId = "refcoco-avg"
	BenchmarkIdRefspatialbench BenchmarkId = "refspatialbench"
	BenchmarkIdRepobench BenchmarkId = "repobench"
	BenchmarkIdRepoqa BenchmarkId = "repoqa"
	BenchmarkIdResearchrubrics BenchmarkId = "researchrubrics"
	BenchmarkIdRobospatialhome BenchmarkId = "robospatialhome"
	BenchmarkIdRuler BenchmarkId = "ruler"
	BenchmarkIdSatMath BenchmarkId = "sat-math"
	BenchmarkIdScaleMcpAtlas BenchmarkId = "scale-mcp-atlas"
	BenchmarkIdScaleMultichallenge BenchmarkId = "scale-multichallenge"
	BenchmarkIdScicode BenchmarkId = "scicode"
	BenchmarkIdScienceqa BenchmarkId = "scienceqa"
	BenchmarkIdScienceqaVisual BenchmarkId = "scienceqa-visual"
	BenchmarkIdScreenspot BenchmarkId = "screenspot"
	BenchmarkIdScreenspotPro BenchmarkId = "screenspot-pro"
	BenchmarkIdSeal0 BenchmarkId = "seal-0"
	BenchmarkIdSealMultichallenege BenchmarkId = "seal-multichallenege"
	BenchmarkIdSeccodebench BenchmarkId = "seccodebench"
	BenchmarkIdSfe BenchmarkId = "sfe"
	BenchmarkIdSifo BenchmarkId = "sifo"
	BenchmarkIdSifoMultiturn BenchmarkId = "sifo-multiturn"
	BenchmarkIdSimplebench BenchmarkId = "simplebench"
	BenchmarkIdSimpleqa BenchmarkId = "simpleqa"
	BenchmarkIdSimpleqaVerified BenchmarkId = "simpleqa-verified"
	BenchmarkIdSimplevqa BenchmarkId = "simplevqa"
	BenchmarkIdSirenAgentdojoAttackSuccessRate BenchmarkId = "siren-agentdojo-attack-success-rate"
	BenchmarkIdSirenAgentdojoUtility BenchmarkId = "siren-agentdojo-utility"
	BenchmarkIdSkillsbench BenchmarkId = "skillsbench"
	BenchmarkIdSlakeClosedAccuracy BenchmarkId = "slake-closed-accuracy"
	BenchmarkIdSlakeTokenizedF1 BenchmarkId = "slake-tokenized-f1"
	BenchmarkIdSlakevqa BenchmarkId = "slakevqa"
	BenchmarkIdSmolagentsLlm BenchmarkId = "smolagents-llm"
	BenchmarkIdSnakeBench BenchmarkId = "snake-bench"
	BenchmarkIdSocialIqa BenchmarkId = "social-iqa"
	BenchmarkIdSoloBench BenchmarkId = "solo-bench"
	BenchmarkIdSpider BenchmarkId = "spider"
	BenchmarkIdSpreadsheetbench2 BenchmarkId = "spreadsheetbench-2"
	BenchmarkIdSpreadsheetbenchVerified BenchmarkId = "spreadsheetbench-verified"
	BenchmarkIdSquality BenchmarkId = "squality"
	BenchmarkIdSummscreenfd BenchmarkId = "summscreenfd"
	BenchmarkIdSunrgbd BenchmarkId = "sunrgbd"
	BenchmarkIdSuperchemTextOnly BenchmarkId = "superchem-text-only"
	BenchmarkIdSuperglue BenchmarkId = "superglue"
	BenchmarkIdSupergpqa BenchmarkId = "supergpqa"
	BenchmarkIdSweBench BenchmarkId = "swe-bench"
	BenchmarkIdSweBenchLive BenchmarkId = "swe-bench-live"
	BenchmarkIdSweBenchMultilingual BenchmarkId = "swe-bench-multilingual"
	BenchmarkIdSweBenchMultimodal BenchmarkId = "swe-bench-multimodal"
	BenchmarkIdSweBenchPro BenchmarkId = "swe-bench-pro"
	BenchmarkIdSweEvo BenchmarkId = "swe-evo"
	BenchmarkIdSweLancer BenchmarkId = "swe-lancer"
	BenchmarkIdSweMarathon BenchmarkId = "swe-marathon"
	BenchmarkIdSwePerf BenchmarkId = "swe-perf"
	BenchmarkIdSweReview BenchmarkId = "swe-review"
	BenchmarkIdSwtBench BenchmarkId = "swt-bench"
	BenchmarkIdSymflowerCoding BenchmarkId = "symflower-coding"
	BenchmarkIdTau2Airline BenchmarkId = "tau-2-airline"
	BenchmarkIdTau2Bench BenchmarkId = "tau-2-bench"
	BenchmarkIdTau2Retail BenchmarkId = "tau-2-retail"
	BenchmarkIdTau2Telecom BenchmarkId = "tau-2-telecom"
	BenchmarkIdTauBench BenchmarkId = "tau-bench"
	BenchmarkIdTauBenchAirline BenchmarkId = "tau-bench-airline"
	BenchmarkIdTauBenchRetail BenchmarkId = "tau-bench-retail"
	BenchmarkIdTau2Airline2 BenchmarkId = "tau2-airline"
	BenchmarkIdTau3Bench BenchmarkId = "tau3-bench"
	BenchmarkIdTempcompass BenchmarkId = "tempcompass"
	BenchmarkIdTerminalBench BenchmarkId = "terminal-bench"
	BenchmarkIdTerminalBench20 BenchmarkId = "terminal-bench-2.0"
	BenchmarkIdTerminalBench21 BenchmarkId = "terminal-bench-2.1"
	BenchmarkIdTerminalBenchHard BenchmarkId = "terminal-bench-hard"
	BenchmarkIdTextvqa BenchmarkId = "textvqa"
	BenchmarkIdThematicGeneralisation BenchmarkId = "thematic-generalisation"
	BenchmarkIdTheoremqa BenchmarkId = "theoremqa"
	BenchmarkIdThinkingWithTracking BenchmarkId = "thinking-with-tracking"
	BenchmarkIdTirBench BenchmarkId = "tir-bench"
	BenchmarkIdTomato BenchmarkId = "tomato"
	BenchmarkIdToolDecathlon BenchmarkId = "tool-decathlon"
	BenchmarkIdToolathlon BenchmarkId = "toolathlon"
	BenchmarkIdTreebench BenchmarkId = "treebench"
	BenchmarkIdTriviaqa BenchmarkId = "triviaqa"
	BenchmarkIdTruthfulqa BenchmarkId = "truthfulqa"
	BenchmarkIdTvbench BenchmarkId = "tvbench"
	BenchmarkIdTydiqa BenchmarkId = "tydiqa"
	BenchmarkIdUniformBarExam BenchmarkId = "uniform-bar-exam"
	BenchmarkIdUsDermmcqaAccuracy BenchmarkId = "us-dermmcqa-accuracy"
	BenchmarkIdUsamo2025 BenchmarkId = "usamo-2025"
	BenchmarkIdUsamo2026 BenchmarkId = "usamo-2026"
	BenchmarkIdUsamo25 BenchmarkId = "usamo25"
	BenchmarkIdVStar BenchmarkId = "v-star"
	BenchmarkIdVcrEnEasy BenchmarkId = "vcr-en-easy"
	BenchmarkIdVct BenchmarkId = "vct"
	BenchmarkIdVctPercentage BenchmarkId = "vct-percentage"
	BenchmarkIdVendingBench2 BenchmarkId = "vending-bench-2"
	BenchmarkIdVibe BenchmarkId = "vibe"
	BenchmarkIdVibeAndroid BenchmarkId = "vibe-android"
	BenchmarkIdVibeBackend BenchmarkId = "vibe-backend"
	BenchmarkIdVibeEval BenchmarkId = "vibe-eval"
	BenchmarkIdVibeIos BenchmarkId = "vibe-ios"
	BenchmarkIdVibePro BenchmarkId = "vibe-pro"
	BenchmarkIdVibeSimulation BenchmarkId = "vibe-simulation"
	BenchmarkIdVibeWeb BenchmarkId = "vibe-web"
	BenchmarkIdVibeeval BenchmarkId = "vibeeval"
	BenchmarkIdVideoMme BenchmarkId = "video-mme"
	BenchmarkIdVideoMmmu BenchmarkId = "video-mmmu"
	BenchmarkIdVideoevalPro BenchmarkId = "videoeval-pro"
	BenchmarkIdVideoholmes BenchmarkId = "videoholmes"
	BenchmarkIdVideomme BenchmarkId = "videomme"
	BenchmarkIdVideommeWOSub BenchmarkId = "videomme-w-o-sub."
	BenchmarkIdVideommeWSub BenchmarkId = "videomme-w-sub."
	BenchmarkIdVideoreasonbench BenchmarkId = "videoreasonbench"
	BenchmarkIdVideosimpleqa BenchmarkId = "videosimpleqa"
	BenchmarkIdVisfactor BenchmarkId = "visfactor"
	BenchmarkIdVision2web BenchmarkId = "vision2web"
	BenchmarkIdVispeak BenchmarkId = "vispeak"
	BenchmarkIdVistraMetricx BenchmarkId = "vistra-metricx"
	BenchmarkIdVisulogic BenchmarkId = "visulogic"
	BenchmarkIdVitaBench BenchmarkId = "vita-bench"
	BenchmarkIdVitabench BenchmarkId = "vitabench"
	BenchmarkIdViverbench BenchmarkId = "viverbench"
	BenchmarkIdVlmsarebiased BenchmarkId = "vlmsarebiased"
	BenchmarkIdVlmsareblind BenchmarkId = "vlmsareblind"
	BenchmarkIdVocalsound BenchmarkId = "vocalsound"
	BenchmarkIdVoicebenchAvg BenchmarkId = "voicebench-avg"
	BenchmarkIdVpct BenchmarkId = "vpct"
	BenchmarkIdVqaRadClosedAccuracy BenchmarkId = "vqa-rad-closed-accuracy"
	BenchmarkIdVqaRadTokenizedF1 BenchmarkId = "vqa-rad-tokenized-f1"
	BenchmarkIdVqav2 BenchmarkId = "vqav2"
	BenchmarkIdVqav2Test BenchmarkId = "vqav2-(test)"
	BenchmarkIdWeMath BenchmarkId = "we-math"
	BenchmarkIdWebvoyager BenchmarkId = "webvoyager"
	BenchmarkIdWeirdml BenchmarkId = "weirdml"
	BenchmarkIdWideSearch BenchmarkId = "wide-search"
	BenchmarkIdWidesearch BenchmarkId = "widesearch"
	BenchmarkIdWildbench BenchmarkId = "wildbench"
	BenchmarkIdWildclawbench BenchmarkId = "wildclawbench"
	BenchmarkIdWinogrande BenchmarkId = "winogrande"
	BenchmarkIdWmdp BenchmarkId = "wmdp"
	BenchmarkIdWmdpBio BenchmarkId = "wmdp-bio"
	BenchmarkIdWmdpChem BenchmarkId = "wmdp-chem"
	BenchmarkIdWmt23 BenchmarkId = "wmt23"
	BenchmarkIdWmt24 BenchmarkId = "wmt24++"
	BenchmarkIdWmt24ppComet BenchmarkId = "wmt24pp-comet"
	BenchmarkIdWmt24ppMetricx BenchmarkId = "wmt24pp-metricx"
	BenchmarkIdWmt25Mqm BenchmarkId = "wmt25-mqm"
	BenchmarkIdWorldvqa BenchmarkId = "worldvqa"
	BenchmarkIdWritingbench BenchmarkId = "writingbench"
	BenchmarkIdWsiPathRouge BenchmarkId = "wsi-path-rouge"
	BenchmarkIdXlangAgent BenchmarkId = "xlang-agent"
	BenchmarkIdXlrsBenchMacro BenchmarkId = "xlrs-bench-macro"
	BenchmarkIdXlsumEnglish BenchmarkId = "xlsum-english"
	BenchmarkIdXstest BenchmarkId = "xstest"
	BenchmarkIdZclawbench BenchmarkId = "zclawbench"
	BenchmarkIdZebralogic BenchmarkId = "zebralogic"
	BenchmarkIdZerobench BenchmarkId = "zerobench"
	BenchmarkIdZerobenchMain BenchmarkId = "zerobench-main"
	BenchmarkIdZerobenchMainPython BenchmarkId = "zerobench-main-python"
	BenchmarkIdZerobenchSub BenchmarkId = "zerobench-sub"
)


type CacheControl struct {
	Scope *string `json:"scope,omitempty"`
	Ttl *string `json:"ttl,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ChatAudioOutputPart struct {
	AudioUrl map[string]interface{} `json:"audio_url"`
	Format *string `json:"format,omitempty"`
	MimeType *string `json:"mime_type,omitempty"`
	Type string `json:"type"`
}

type ChatChoice struct {
	FinishReason *string `json:"finish_reason,omitempty"`
	Index *int `json:"index,omitempty"`
	Message *map[string]interface{} `json:"message,omitempty"`
}

type ChatCompletionsRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	FrequencyPenalty *float64 `json:"frequency_penalty,omitempty"`
	ImageConfig *map[string]interface{} `json:"image_config,omitempty"`
	LogitBias *map[string]interface{} `json:"logit_bias,omitempty"`
	Logprobs *bool `json:"logprobs,omitempty"`
	MaxCompletionTokens *int `json:"max_completion_tokens,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	MaxToolCalls *int `json:"max_tool_calls,omitempty"`
	Messages []map[string]interface{} `json:"messages"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Modalities *[]string `json:"modalities,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PresencePenalty *float64 `json:"presence_penalty,omitempty"`
	PromptCacheKey *string `json:"prompt_cache_key,omitempty"`
	Provider interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	ReasoningEffort *string `json:"reasoning_effort,omitempty"`
	ResponseFormat interface{} `json:"response_format,omitempty"`
	SafetyIdentifier *string `json:"safety_identifier,omitempty"`
	Seed *int `json:"seed,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Stop interface{} `json:"stop,omitempty"`
	Store *bool `json:"store,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	StreamOptions *map[string]interface{} `json:"stream_options,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]interface{} `json:"tools,omitempty"`
	TopLogprobs *int `json:"top_logprobs,omitempty"`
	TopP *float64 `json:"top_p,omitempty"`
	Usage *bool `json:"usage,omitempty"`
	User *string `json:"user,omitempty"`
	UserId *string `json:"user_id,omitempty"`
}

type ChatCompletionsResponse struct {
	Choices *[]map[string]interface{} `json:"choices,omitempty"`
	Created *int `json:"created,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	NativeResponseId *string `json:"nativeResponseId,omitempty"`
	Object *string `json:"object,omitempty"`
	Provider *string `json:"provider,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type ChatImageOutputPart struct {
	ImageUrl map[string]interface{} `json:"image_url"`
	MimeType *string `json:"mime_type,omitempty"`
	Type string `json:"type"`
}

type ChatMessage struct {
	Audios *[]map[string]interface{} `json:"audios,omitempty"`
	Content interface{} `json:"content,omitempty"`
	Images *[]map[string]interface{} `json:"images,omitempty"`
	Name *string `json:"name,omitempty"`
	Role string `json:"role"`
	ToolCallId *string `json:"tool_call_id,omitempty"`
	ToolCalls *[]map[string]interface{} `json:"tool_calls,omitempty"`
}

type CreditsResponse struct {
	Credits map[string]interface{} `json:"credits"`
	Ok bool `json:"ok"`
}

type DataContributionCategories struct {
}

type DataContributionClassifier struct {
	Categories map[string]interface{} `json:"categories"`
	CreatedAt *string `json:"created_at,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled bool `json:"enabled"`
	Id string `json:"id"`
	Instructions string `json:"instructions"`
	Kind string `json:"kind"`
	Model string `json:"model"`
	Name string `json:"name"`
	SampleRateBps int `json:"sample_rate_bps"`
	ServiceTier string `json:"service_tier"`
	Slug string `json:"slug"`
	UpdatedAt *string `json:"updated_at,omitempty"`
}

type DataContributionClassifierCreateRequest struct {
	Categories map[string]interface{} `json:"categories"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Instructions string `json:"instructions"`
	Model *string `json:"model,omitempty"`
	Name string `json:"name"`
	SampleRateBps *int `json:"sampleRateBps,omitempty"`
	ServiceTier *string `json:"serviceTier,omitempty"`
	Slug *string `json:"slug,omitempty"`
}

type DataContributionClassifierDeleteResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DataContributionClassifierInput struct {
	Categories *map[string]interface{} `json:"categories,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Instructions *string `json:"instructions,omitempty"`
	Model *string `json:"model,omitempty"`
	Name *string `json:"name,omitempty"`
	SampleRateBps *int `json:"sampleRateBps,omitempty"`
	ServiceTier *string `json:"serviceTier,omitempty"`
}

type DataContributionClassifierResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DataContributionClassifierUpdateRequest struct {
	Categories *map[string]interface{} `json:"categories,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Instructions *string `json:"instructions,omitempty"`
	Model *string `json:"model,omitempty"`
	Name *string `json:"name,omitempty"`
	SampleRateBps *int `json:"sampleRateBps,omitempty"`
	ServiceTier *string `json:"serviceTier,omitempty"`
}

type DataContributionConsentRequest struct {
	Enabled bool `json:"enabled"`
	Reason *string `json:"reason,omitempty"`
}

type DataContributionConsentResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DataContributionOverviewResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DataModel struct {
	DeprecationDate *string `json:"deprecation_date,omitempty"`
	Hidden *bool `json:"hidden,omitempty"`
	InputTypes *[]string `json:"input_types,omitempty"`
	Lifecycle *ModelLifecycle `json:"lifecycle,omitempty"`
	ModelId *string `json:"model_id,omitempty"`
	Name *string `json:"name,omitempty"`
	Organisation *map[string]interface{} `json:"organisation,omitempty"`
	OutputTypes *[]string `json:"output_types,omitempty"`
	ReleaseDate *string `json:"release_date,omitempty"`
	RetirementDate *string `json:"retirement_date,omitempty"`
	Status *string `json:"status,omitempty"`
}

type DataModelOrganisation = *map[string]interface{}

type DebugOptions struct {
	Enabled *bool `json:"enabled,omitempty"`
	ReturnUpstreamRequest *bool `json:"return_upstream_request,omitempty"`
	ReturnUpstreamResponse *bool `json:"return_upstream_response,omitempty"`
	Trace *bool `json:"trace,omitempty"`
	TraceLevel *string `json:"trace_level,omitempty"`
}

type DeletedResponse struct {
	Deleted bool `json:"deleted"`
}

type DynamicRoute struct {
	Config map[string]interface{} `json:"config"`
	CreatedAt *string `json:"created_at,omitempty"`
	DeployedVersion *int `json:"deployed_version,omitempty"`
	Description *string `json:"description,omitempty"`
	Id string `json:"id"`
	KeyIds []string `json:"key_ids"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Status string `json:"status"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	Version int `json:"version"`
	Versions []map[string]interface{} `json:"versions"`
	WorkspaceId string `json:"workspace_id"`
}

type DynamicRouteAction struct {
	AllowFallbacks *bool `json:"allowFallbacks,omitempty"`
	Model *string `json:"model,omitempty"`
	ModelFallbacks *[]string `json:"modelFallbacks,omitempty"`
	ProviderIgnore *[]string `json:"providerIgnore,omitempty"`
	ProviderOnly *[]string `json:"providerOnly,omitempty"`
	ProviderOrder *[]string `json:"providerOrder,omitempty"`
	RoutingMode *string `json:"routingMode,omitempty"`
}

type DynamicRouteCondition struct {
	Field string `json:"field"`
	MetadataKey *string `json:"metadataKey,omitempty"`
	Operator string `json:"operator"`
	Value *string `json:"value,omitempty"`
}

type DynamicRouteConfig struct {
	CacheAwareRouting *bool `json:"cacheAwareRouting,omitempty"`
	DefaultAction *map[string]interface{} `json:"defaultAction,omitempty"`
	Edges *[]map[string]interface{} `json:"edges,omitempty"`
	EntryNodeId *string `json:"entryNodeId,omitempty"`
	Nodes *[]map[string]interface{} `json:"nodes,omitempty"`
	Rules *[]map[string]interface{} `json:"rules,omitempty"`
	SchemaVersion *string `json:"schemaVersion,omitempty"`
	SessionAffinity *bool `json:"sessionAffinity,omitempty"`
}

type DynamicRouteCreateRequest struct {
	Config map[string]interface{} `json:"config"`
	Description *string `json:"description,omitempty"`
	Name string `json:"name"`
	Slug *string `json:"slug,omitempty"`
	Status *string `json:"status,omitempty"`
}

type DynamicRouteDeleteResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DynamicRouteDeployResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DynamicRouteEdge struct {
	Id string `json:"id"`
	Source string `json:"source"`
	SourceHandle *string `json:"sourceHandle,omitempty"`
	Target string `json:"target"`
}

type DynamicRouteKeysResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DynamicRouteKeysUpdateRequest struct {
	KeyIds []string `json:"key_ids"`
}

type DynamicRouteListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type DynamicRouteNode struct {
	Data map[string]interface{} `json:"data"`
	Id string `json:"id"`
	Position *map[string]interface{} `json:"position,omitempty"`
	Type string `json:"type"`
}

type DynamicRouteResponse struct {
	Data map[string]interface{} `json:"data"`
}

type DynamicRouteRule struct {
	Action map[string]interface{} `json:"action"`
	Condition map[string]interface{} `json:"condition"`
	Enabled bool `json:"enabled"`
	Id string `json:"id"`
	Name string `json:"name"`
}

type DynamicRouteUpdateRequest struct {
	Config *map[string]interface{} `json:"config,omitempty"`
	Description *string `json:"description,omitempty"`
	Name *string `json:"name,omitempty"`
	Status *string `json:"status,omitempty"`
}

type DynamicRouteVersion struct {
	CreatedAt *string `json:"created_at,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	Status string `json:"status"`
	Version int `json:"version"`
}

type Embedding struct {
	Embedding *[]float64 `json:"embedding,omitempty"`
	Index *int `json:"index,omitempty"`
	Object *string `json:"object,omitempty"`
}

type EmbeddingsMultimodalInput struct {
	Content []interface{} `json:"content"`
}

type EmbeddingsRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Dimensions *int `json:"dimensions,omitempty"`
	EncodingFormat *string `json:"encoding_format,omitempty"`
	Input interface{} `json:"input"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	User *string `json:"user,omitempty"`
}

type EmbeddingsResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type EndpointCatalogueEntry struct {
	CapabilityId string `json:"capability_id"`
	Collection string `json:"collection"`
	Id string `json:"id"`
	ModelCount int `json:"model_count"`
	ProviderCount int `json:"provider_count"`
	PublicPath string `json:"public_path"`
}

type EndpointCatalogueResponse struct {
	Data []map[string]interface{} `json:"data"`
	Endpoints []string `json:"endpoints"`
	Ok bool `json:"ok"`
	SampleModels []string `json:"sample_models"`
}

type ErrorFailureSampleItem struct {
	Provider *string `json:"provider,omitempty"`
	Retryable *bool `json:"retryable,omitempty"`
	Status *int `json:"status,omitempty"`
	Type *string `json:"type,omitempty"`
	UpstreamErrorCode *string `json:"upstream_error_code,omitempty"`
	UpstreamErrorDescription *string `json:"upstream_error_description,omitempty"`
	UpstreamErrorMessage *string `json:"upstream_error_message,omitempty"`
	UpstreamErrorParam *string `json:"upstream_error_param,omitempty"`
	UpstreamPayloadPreview *string `json:"upstream_payload_preview,omitempty"`
}

type ErrorProviderCandidateDiagnostics struct {
	CandidateCount *int `json:"candidateCount,omitempty"`
	DroppedMissingAdapter *[]map[string]interface{} `json:"droppedMissingAdapter,omitempty"`
	DroppedUnsupportedEndpoint *[]string `json:"droppedUnsupportedEndpoint,omitempty"`
	SupportsEndpointCount *int `json:"supportsEndpointCount,omitempty"`
	TotalProviders *int `json:"totalProviders,omitempty"`
}

type ErrorProviderEnablementDiagnostics struct {
	Capability *string `json:"capability,omitempty"`
	Dropped *[]map[string]interface{} `json:"dropped,omitempty"`
	ProvidersAfter *[]string `json:"providersAfter,omitempty"`
	ProvidersBefore *[]string `json:"providersBefore,omitempty"`
}

type ErrorProviderFailureDiagnostics struct {
	Category *string `json:"category,omitempty"`
	Hint *string `json:"hint,omitempty"`
	Provider *string `json:"provider,omitempty"`
}

type ErrorResponse struct {
	AttemptCount *int `json:"attempt_count,omitempty"`
	Description *string `json:"description,omitempty"`
	Details *[]map[string]interface{} `json:"details,omitempty"`
	Error interface{} `json:"error"`
	ErrorOrigin *string `json:"error_origin,omitempty"`
	ErrorType *string `json:"error_type,omitempty"`
	FailedProviders *[]string `json:"failed_providers,omitempty"`
	FailedStatuses *[]int `json:"failed_statuses,omitempty"`
	FailureSample *[]map[string]interface{} `json:"failure_sample,omitempty"`
	GenerationId *string `json:"generation_id,omitempty"`
	Message *string `json:"message,omitempty"`
	MissingPricingProviders *[]string `json:"missing_pricing_providers,omitempty"`
	Ok *bool `json:"ok,omitempty"`
	ProviderCandidateDiagnostics *map[string]interface{} `json:"provider_candidate_diagnostics,omitempty"`
	ProviderEnablement *map[string]interface{} `json:"provider_enablement,omitempty"`
	ProviderFailureDiagnostics *map[string]interface{} `json:"provider_failure_diagnostics,omitempty"`
	ProviderPaymentRequiredProvider *string `json:"provider_payment_required_provider,omitempty"`
	ProviderPaymentRequiredSupportNotice *string `json:"provider_payment_required_support_notice,omitempty"`
	Reason *string `json:"reason,omitempty"`
	RoutingDiagnostics *map[string]interface{} `json:"routing_diagnostics,omitempty"`
	StatusCode *int `json:"status_code,omitempty"`
	UpstreamError *map[string]interface{} `json:"upstream_error,omitempty"`
}

type ErrorRoutingDiagnostics struct {
	FilterStages *[]map[string]interface{} `json:"filterStages,omitempty"`
}

type ErrorUpstreamError struct {
	Code *string `json:"code,omitempty"`
	Description *string `json:"description,omitempty"`
	Message *string `json:"message,omitempty"`
	Param *string `json:"param,omitempty"`
}

type FileResponse struct {
	Bytes *int `json:"bytes,omitempty"`
	CreatedAt *int `json:"created_at,omitempty"`
	Filename *string `json:"filename,omitempty"`
	Id *string `json:"id,omitempty"`
	Object *string `json:"object,omitempty"`
	Purpose *string `json:"purpose,omitempty"`
	Status *string `json:"status,omitempty"`
	StatusDetails *map[string]interface{} `json:"status_details,omitempty"`
}

type FileUploadRequest struct {
	File interface{} `json:"file"`
	Purpose string `json:"purpose"`
}

type FunctionToolDefinition struct {
	Async *bool `json:"async,omitempty"`
	Function map[string]interface{} `json:"function"`
	Type string `json:"type"`
}

type FusionToolDefinition struct {
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type GatewayCapabilities struct {
	Endpoints *[]string `json:"endpoints,omitempty"`
	ParameterDetails map[string]interface{} `json:"parameter_details"`
	Parameters []string `json:"parameters"`
}

type GatewayCapabilityStatus string

const (
	GatewayCapabilityStatusActive GatewayCapabilityStatus = "active"
	GatewayCapabilityStatusComingSoon GatewayCapabilityStatus = "coming_soon"
	GatewayCapabilityStatusDerankedLvl1 GatewayCapabilityStatus = "deranked_lvl1"
	GatewayCapabilityStatusDerankedLvl2 GatewayCapabilityStatus = "deranked_lvl2"
	GatewayCapabilityStatusDerankedLvl3 GatewayCapabilityStatus = "deranked_lvl3"
	GatewayCapabilityStatusDisabled GatewayCapabilityStatus = "disabled"
	GatewayCapabilityStatusInternalTesting GatewayCapabilityStatus = "internal_testing"
)


type GatewayDatetimeToolDefinition struct {
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Timezone *string `json:"timezone,omitempty"`
	Type string `json:"type"`
}

type GatewayFeedback struct {
	Comment *string `json:"comment"`
	CreatedAt string `json:"created_at"`
	CreatedByUserId *string `json:"created_by_user_id"`
	EndUserId *string `json:"end_user_id"`
	Id string `json:"id"`
	Metadata map[string]interface{} `json:"metadata"`
	MetadataDimensions map[string]interface{} `json:"metadata_dimensions"`
	PresetId *string `json:"preset_id"`
	Rating *string `json:"rating"`
	Reason *string `json:"reason"`
	ReasonTags []string `json:"reason_tags"`
	RequestId *string `json:"request_id"`
	Score *float64 `json:"score"`
	SessionId *string `json:"session_id"`
	Source string `json:"source"`
	TestRunId *string `json:"test_run_id"`
	WorkspaceId string `json:"workspace_id"`
}

type GatewayFeedbackCreateRequest struct {
	Comment *string `json:"comment,omitempty"`
	EndUserId *string `json:"end_user_id,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	MetadataDimensions *map[string]interface{} `json:"metadata_dimensions,omitempty"`
	PresetId *string `json:"preset_id,omitempty"`
	Rating *string `json:"rating,omitempty"`
	Reason *string `json:"reason,omitempty"`
	ReasonTags *[]string `json:"reason_tags,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	Score *float64 `json:"score,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Source *string `json:"source,omitempty"`
	TestRunId *string `json:"test_run_id,omitempty"`
}

type GatewayFeedbackListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type GatewayFeedbackResponse struct {
	Data map[string]interface{} `json:"data"`
}

type GatewayFeedbackSummaryResponse struct {
	Data []map[string]interface{} `json:"data"`
	GroupBy string `json:"group_by"`
}

type GatewayFeedbackSummaryRow struct {
	AverageScore *float64 `json:"average_score"`
	Count int `json:"count"`
	LastFeedbackAt *string `json:"last_feedback_at"`
	MetadataKey *string `json:"metadata_key,omitempty"`
	MetadataValue *string `json:"metadata_value,omitempty"`
	Negative int `json:"negative"`
	Partial int `json:"partial"`
	Positive int `json:"positive"`
	PresetId *string `json:"preset_id,omitempty"`
	Ratings map[string]interface{} `json:"ratings"`
	TestRunId *string `json:"test_run_id,omitempty"`
}

type GatewayModalities struct {
	Input []string `json:"input"`
	Output []string `json:"output"`
}

type GatewayModelLifecycle struct {
	DeprecatedAt *string `json:"deprecated_at"`
	Message *string `json:"message"`
	ReleasedAt *string `json:"released_at"`
	ReplacementId *string `json:"replacement_id"`
	RetiresAt *string `json:"retires_at"`
	Status *string `json:"status"`
}

type GatewayModelLimits struct {
	InputTokens *int `json:"input_tokens"`
	OutputTokens *int `json:"output_tokens"`
}

type GatewayModelOffer struct {
	Capabilities map[string]interface{} `json:"capabilities"`
	Effective map[string]interface{} `json:"effective"`
	Endpoints []string `json:"endpoints"`
	Modalities map[string]interface{} `json:"modalities"`
	Model *string `json:"model"`
	Pricing map[string]interface{} `json:"pricing"`
	Provider map[string]interface{} `json:"provider"`
	Routable bool `json:"routable"`
	Routing map[string]interface{} `json:"routing"`
	Status string `json:"status"`
	StatusReason string `json:"status_reason"`
}

type GatewayModelOrganization = *map[string]interface{}

type GatewayModelsResponse struct {
	AvailabilityMode string `json:"availability_mode"`
	Limit int `json:"limit"`
	Models []map[string]interface{} `json:"models"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	Total int `json:"total"`
}

type GatewayObservabilityEvent struct {
	Category string `json:"category"`
	CreatedAt string `json:"created_at"`
	CreatedByUserId *string `json:"created_by_user_id"`
	EndUserId *string `json:"end_user_id"`
	EventName string `json:"event_name"`
	Id string `json:"id"`
	Metadata map[string]interface{} `json:"metadata"`
	MetadataDimensions map[string]interface{} `json:"metadata_dimensions"`
	NumericValue *float64 `json:"numeric_value"`
	OccurredAt string `json:"occurred_at"`
	PresetId *string `json:"preset_id"`
	RequestId *string `json:"request_id"`
	SessionId *string `json:"session_id"`
	Source string `json:"source"`
	TestRunId *string `json:"test_run_id"`
	Value *interface{} `json:"value"`
	WorkspaceId string `json:"workspace_id"`
}

type GatewayObservabilityEventCreateRequest struct {
	Category *string `json:"category,omitempty"`
	EndUserId *string `json:"end_user_id,omitempty"`
	EventName string `json:"event_name"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	MetadataDimensions *map[string]interface{} `json:"metadata_dimensions,omitempty"`
	NumericValue *float64 `json:"numeric_value,omitempty"`
	OccurredAt *string `json:"occurred_at,omitempty"`
	PresetId *string `json:"preset_id,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Source *string `json:"source,omitempty"`
	TestRunId *string `json:"test_run_id,omitempty"`
	Value interface{} `json:"value,omitempty"`
}

type GatewayObservabilityEventListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type GatewayObservabilityEventResponse struct {
	Data map[string]interface{} `json:"data"`
}

type GatewayPricing struct {
	Meters map[string]interface{} `json:"meters"`
	PricingPlan string `json:"pricing_plan"`
}

type GatewayPricingMeter = *map[string]interface{}

type GatewayProviderAvailabilityReason string

const (
	GatewayProviderAvailabilityReasonActive GatewayProviderAvailabilityReason = "active"
	GatewayProviderAvailabilityReasonPreviewOnly GatewayProviderAvailabilityReason = "preview_only"
	GatewayProviderAvailabilityReasonGated GatewayProviderAvailabilityReason = "gated"
	GatewayProviderAvailabilityReasonAccessLimited GatewayProviderAvailabilityReason = "access_limited"
	GatewayProviderAvailabilityReasonRegionLimited GatewayProviderAvailabilityReason = "region_limited"
	GatewayProviderAvailabilityReasonProjectLimited GatewayProviderAvailabilityReason = "project_limited"
	GatewayProviderAvailabilityReasonPaused GatewayProviderAvailabilityReason = "paused"
	GatewayProviderAvailabilityReasonSoftBlocked GatewayProviderAvailabilityReason = "soft_blocked"
	GatewayProviderAvailabilityReasonDerankedLvl1 GatewayProviderAvailabilityReason = "deranked_lvl1"
	GatewayProviderAvailabilityReasonDerankedLvl2 GatewayProviderAvailabilityReason = "deranked_lvl2"
	GatewayProviderAvailabilityReasonDerankedLvl3 GatewayProviderAvailabilityReason = "deranked_lvl3"
	GatewayProviderAvailabilityReasonInternalTesting GatewayProviderAvailabilityReason = "internal_testing"
	GatewayProviderAvailabilityReasonScheduled GatewayProviderAvailabilityReason = "scheduled"
	GatewayProviderAvailabilityReasonComingSoon GatewayProviderAvailabilityReason = "coming_soon"
	GatewayProviderAvailabilityReasonProviderDisabled GatewayProviderAvailabilityReason = "provider_disabled"
	GatewayProviderAvailabilityReasonModelDisabled GatewayProviderAvailabilityReason = "model_disabled"
	GatewayProviderAvailabilityReasonCapabilityDisabled GatewayProviderAvailabilityReason = "capability_disabled"
	GatewayProviderAvailabilityReasonProviderNotReady GatewayProviderAvailabilityReason = "provider_not_ready"
	GatewayProviderAvailabilityReasonProviderInactive GatewayProviderAvailabilityReason = "provider_inactive"
	GatewayProviderAvailabilityReasonInactive GatewayProviderAvailabilityReason = "inactive"
	GatewayProviderAvailabilityReasonRetired GatewayProviderAvailabilityReason = "retired"
)


type GatewayRequestLog struct {
	AuthMethod *string `json:"auth_method,omitempty"`
	Byok *bool `json:"byok,omitempty"`
	CanonicalModelId *string `json:"canonical_model_id,omitempty"`
	CostNanos *int `json:"cost_nanos,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	Currency *string `json:"currency,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	ErrorCode *string `json:"error_code,omitempty"`
	FinishReason *string `json:"finish_reason,omitempty"`
	GenerationMs *float64 `json:"generation_ms,omitempty"`
	KeyId *string `json:"key_id,omitempty"`
	LatencyMs *float64 `json:"latency_ms,omitempty"`
	Location *string `json:"location,omitempty"`
	ModelId *string `json:"model_id,omitempty"`
	NativeResponseId *string `json:"native_response_id,omitempty"`
	OauthClientId *string `json:"oauth_client_id,omitempty"`
	PricingLines *[]map[string]interface{} `json:"pricing_lines,omitempty"`
	Provider *string `json:"provider,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	RequestedModelId *string `json:"requested_model_id,omitempty"`
	RoutedModelId *string `json:"routed_model_id,omitempty"`
	StatusCode *int `json:"status_code,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	Success *bool `json:"success,omitempty"`
	Throughput *float64 `json:"throughput,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type GatewayRequestLogListResponse struct {
	Data []map[string]interface{} `json:"data"`
	FromTime string `json:"from_time"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	ToTime *string `json:"to_time"`
	Total int `json:"total"`
}

type GatewayRequestLogResponse struct {
	Data map[string]interface{} `json:"data"`
	Ok bool `json:"ok"`
}

type GatewayRoutingStatus string

const (
	GatewayRoutingStatusActive GatewayRoutingStatus = "active"
	GatewayRoutingStatusDerankedLvl1 GatewayRoutingStatus = "deranked_lvl1"
	GatewayRoutingStatusDerankedLvl2 GatewayRoutingStatus = "deranked_lvl2"
	GatewayRoutingStatusDerankedLvl3 GatewayRoutingStatus = "deranked_lvl3"
	GatewayRoutingStatusDisabled GatewayRoutingStatus = "disabled"
)


type GatewayWebFetchToolDefinition struct {
	MaxChars *int `json:"max_chars,omitempty"`
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type GatewayWebSearchToolDefinition struct {
	Engine *string `json:"engine,omitempty"`
	IncludeHighlights *bool `json:"include_highlights,omitempty"`
	IncludeText *bool `json:"include_text,omitempty"`
	Language *string `json:"language,omitempty"`
	MaxResults *int `json:"max_results,omitempty"`
	Page *int `json:"page,omitempty"`
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type GenerationResponse struct {
	AppId *string `json:"app_id,omitempty"`
	Byok *bool `json:"byok,omitempty"`
	CostNanos *float64 `json:"cost_nanos,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	Currency *string `json:"currency,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	ErrorCode *string `json:"error_code,omitempty"`
	ErrorMessage *string `json:"error_message,omitempty"`
	GenerationMs *float64 `json:"generation_ms,omitempty"`
	KeyId *string `json:"key_id,omitempty"`
	LatencyMs *float64 `json:"latency_ms,omitempty"`
	ModelId *string `json:"model_id,omitempty"`
	NativeResponseId *string `json:"native_response_id,omitempty"`
	PricingLines *[]map[string]interface{} `json:"pricing_lines,omitempty"`
	Provider *string `json:"provider,omitempty"`
	ReplayRequest *map[string]interface{} `json:"replay_request,omitempty"`
	ReplaySupported *bool `json:"replay_supported,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	StatusCode *float64 `json:"status_code,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	Success *bool `json:"success,omitempty"`
	TeamId *string `json:"team_id,omitempty"`
	Throughput *float64 `json:"throughput,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type Guardrail struct {
	AllowedApiModelIds *[]string `json:"allowed_api_model_ids,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	DailyLimitCostNanos *int `json:"daily_limit_cost_nanos,omitempty"`
	DailyLimitRequests *int `json:"daily_limit_requests,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Id string `json:"id"`
	ModelRestrictionMode *string `json:"model_restriction_mode,omitempty"`
	MonthlyLimitCostNanos *int `json:"monthly_limit_cost_nanos,omitempty"`
	MonthlyLimitRequests *int `json:"monthly_limit_requests,omitempty"`
	Name string `json:"name"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacy_enable_free_may_publish_prompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacy_enable_free_may_train,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacy_enable_input_output_logging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacy_enable_paid_may_train,omitempty"`
	PrivacyZdrOnly *bool `json:"privacy_zdr_only,omitempty"`
	PromptInjectionAction *string `json:"prompt_injection_action,omitempty"`
	PromptInjectionEnabled *bool `json:"prompt_injection_enabled,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"provider_restriction_enforce_allowed,omitempty"`
	ProviderRestrictionMode *string `json:"provider_restriction_mode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"provider_restriction_provider_ids,omitempty"`
	SensitiveInfoDefaultAction *string `json:"sensitive_info_default_action,omitempty"`
	SensitiveInfoEnabled *bool `json:"sensitive_info_enabled,omitempty"`
	SensitiveInfoRules *[]map[string]interface{} `json:"sensitive_info_rules,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WeeklyLimitCostNanos *int `json:"weekly_limit_cost_nanos,omitempty"`
	WeeklyLimitRequests *int `json:"weekly_limit_requests,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type GuardrailBudgetInput struct {
	DailyCostNanos *int `json:"dailyCostNanos,omitempty"`
	DailyRequests *int `json:"dailyRequests,omitempty"`
	MonthlyCostNanos *int `json:"monthlyCostNanos,omitempty"`
	MonthlyRequests *int `json:"monthlyRequests,omitempty"`
	WeeklyCostNanos *int `json:"weeklyCostNanos,omitempty"`
	WeeklyRequests *int `json:"weeklyRequests,omitempty"`
}

type GuardrailCreateRequest struct {
	AllowedApiModelIds *[]string `json:"allowedApiModelIds,omitempty"`
	Budgets *map[string]interface{} `json:"budgets,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	ModelRestrictionMode *string `json:"modelRestrictionMode,omitempty"`
	Name string `json:"name"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacyEnableFreeMayPublishPrompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacyEnableFreeMayTrain,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacyEnableInputOutputLogging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacyEnablePaidMayTrain,omitempty"`
	PrivacyZdrOnly *bool `json:"privacyZdrOnly,omitempty"`
	PromptInjectionAction *string `json:"promptInjectionAction,omitempty"`
	PromptInjectionEnabled *bool `json:"promptInjectionEnabled,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"providerRestrictionEnforceAllowed,omitempty"`
	ProviderRestrictionMode *string `json:"providerRestrictionMode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"providerRestrictionProviderIds,omitempty"`
	SensitiveInfoDefaultAction *string `json:"sensitiveInfoDefaultAction,omitempty"`
	SensitiveInfoEnabled *bool `json:"sensitiveInfoEnabled,omitempty"`
	SensitiveInfoRules *[]map[string]interface{} `json:"sensitiveInfoRules,omitempty"`
}

type GuardrailDeleteResponse struct {
	Deleted bool `json:"deleted"`
}

type GuardrailDetailResponse struct {
	Data map[string]interface{} `json:"data"`
}

type GuardrailKeyAddResponse struct {
	AddedCount int `json:"added_count"`
	Data []map[string]interface{} `json:"data"`
}

type GuardrailKeyAssignment struct {
	CreatedAt *string `json:"created_at,omitempty"`
	KeyId string `json:"key_id"`
	Name *string `json:"name,omitempty"`
	Prefix *string `json:"prefix,omitempty"`
	Status *string `json:"status,omitempty"`
}

type GuardrailKeyIdsReplaceRequest struct {
	KeyIds []string `json:"key_ids"`
}

type GuardrailKeyIdsRequest struct {
	KeyIds []string `json:"key_ids"`
}

type GuardrailKeyListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type GuardrailKeySetResponse struct {
	Data map[string]interface{} `json:"data"`
}

type GuardrailListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type GuardrailMemberAddResponse struct {
	AddedCount int `json:"added_count"`
	Data []map[string]interface{} `json:"data"`
}

type GuardrailMemberAssignment struct {
	DisplayName *string `json:"display_name,omitempty"`
	JoinedAt *string `json:"joined_at,omitempty"`
	Role *string `json:"role,omitempty"`
	UserId string `json:"user_id"`
}

type GuardrailMemberListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type GuardrailPolicyInput struct {
	AllowedApiModelIds *[]string `json:"allowedApiModelIds,omitempty"`
	Budgets *map[string]interface{} `json:"budgets,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	ModelRestrictionMode *string `json:"modelRestrictionMode,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacyEnableFreeMayPublishPrompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacyEnableFreeMayTrain,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacyEnableInputOutputLogging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacyEnablePaidMayTrain,omitempty"`
	PrivacyZdrOnly *bool `json:"privacyZdrOnly,omitempty"`
	PromptInjectionAction *string `json:"promptInjectionAction,omitempty"`
	PromptInjectionEnabled *bool `json:"promptInjectionEnabled,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"providerRestrictionEnforceAllowed,omitempty"`
	ProviderRestrictionMode *string `json:"providerRestrictionMode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"providerRestrictionProviderIds,omitempty"`
	SensitiveInfoDefaultAction *string `json:"sensitiveInfoDefaultAction,omitempty"`
	SensitiveInfoEnabled *bool `json:"sensitiveInfoEnabled,omitempty"`
	SensitiveInfoRules *[]map[string]interface{} `json:"sensitiveInfoRules,omitempty"`
}

type GuardrailRemoveResponse struct {
	RemovedCount int `json:"removed_count"`
}

type GuardrailResponse struct {
	Data map[string]interface{} `json:"data"`
}

type GuardrailUpdateRequest struct {
	AllowedApiModelIds *[]string `json:"allowedApiModelIds,omitempty"`
	Budgets *map[string]interface{} `json:"budgets,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	ModelRestrictionMode *string `json:"modelRestrictionMode,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacyEnableFreeMayPublishPrompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacyEnableFreeMayTrain,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacyEnableInputOutputLogging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacyEnablePaidMayTrain,omitempty"`
	PrivacyZdrOnly *bool `json:"privacyZdrOnly,omitempty"`
	PromptInjectionAction *string `json:"promptInjectionAction,omitempty"`
	PromptInjectionEnabled *bool `json:"promptInjectionEnabled,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"providerRestrictionEnforceAllowed,omitempty"`
	ProviderRestrictionMode *string `json:"providerRestrictionMode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"providerRestrictionProviderIds,omitempty"`
	SensitiveInfoDefaultAction *string `json:"sensitiveInfoDefaultAction,omitempty"`
	SensitiveInfoEnabled *bool `json:"sensitiveInfoEnabled,omitempty"`
	SensitiveInfoRules *[]map[string]interface{} `json:"sensitiveInfoRules,omitempty"`
}

type GuardrailUserIdsRequest struct {
	UserIds []string `json:"user_ids"`
}

type Image struct {
	B64Json *string `json:"b64_json,omitempty"`
	RevisedPrompt *string `json:"revised_prompt,omitempty"`
	Url *string `json:"url,omitempty"`
}

type ImageConfig struct {
	AspectRatio *string `json:"aspect_ratio,omitempty"`
	FontInputs *[]map[string]interface{} `json:"font_inputs,omitempty"`
	ImageSize *string `json:"image_size,omitempty"`
	IncludeRaiReason *bool `json:"include_rai_reason,omitempty"`
	ReferenceImages *[]map[string]interface{} `json:"reference_images,omitempty"`
	SuperResolutionReferences *[]string `json:"super_resolution_references,omitempty"`
}

type ImageContentPart struct {
	ImageUrl map[string]interface{} `json:"image_url"`
	Type string `json:"type"`
}

type ImageModerationInput struct {
	ImageUrl map[string]interface{} `json:"image_url"`
	Type string `json:"type"`
}

type ImagesEditRequest struct {
	Image string `json:"image"`
	Mask *string `json:"mask,omitempty"`
	Meta *bool `json:"meta,omitempty"`
	Model string `json:"model"`
	N *int `json:"n,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Resolution *string `json:"resolution,omitempty"`
	Size *string `json:"size,omitempty"`
	Usage *bool `json:"usage,omitempty"`
	User *string `json:"user,omitempty"`
}

type ImagesEditResponse struct {
	Created *int `json:"created,omitempty"`
	Data *[]map[string]interface{} `json:"data,omitempty"`
}

type ImagesGenerationRequest struct {
	Model string `json:"model"`
	N *int `json:"n,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Quality *string `json:"quality,omitempty"`
	Resolution *string `json:"resolution,omitempty"`
	ResponseFormat *string `json:"response_format,omitempty"`
	Size *string `json:"size,omitempty"`
	Style *string `json:"style,omitempty"`
	User *string `json:"user,omitempty"`
}

type ImagesGenerationResponse struct {
	Created *int `json:"created,omitempty"`
	Data *[]map[string]interface{} `json:"data,omitempty"`
}

type InvalidRequestResponse struct {
	Error string `json:"error"`
	MaxOffset *int `json:"max_offset,omitempty"`
	Message string `json:"message"`
	Ok bool `json:"ok"`
}

type KeyInvalidateResponse struct {
	Key map[string]interface{} `json:"key"`
	Message string `json:"message"`
	Ok bool `json:"ok"`
}

type KnownModelId string

const (
	KnownModelIdAi21Jamba15Large KnownModelId = "ai21/jamba-1.5-large"
	KnownModelIdAi21Jamba15Mini KnownModelId = "ai21/jamba-1.5-mini"
	KnownModelIdAionLabsAion20 KnownModelId = "aion-labs/aion-2.0"
	KnownModelIdAionLabsAion30 KnownModelId = "aion-labs/aion-3.0"
	KnownModelIdAionLabsAion30Mini KnownModelId = "aion-labs/aion-3.0-mini"
	KnownModelIdAionLabsAionRpLlama318b KnownModelId = "aion-labs/aion-rp-llama-3.1-8b"
	KnownModelIdAllenaiMolmo28b KnownModelId = "allenai/molmo-2-8b"
	KnownModelIdAmazonNova2Lite KnownModelId = "amazon/nova-2-lite"
	KnownModelIdAmazonNovaLite10 KnownModelId = "amazon/nova-lite-1.0"
	KnownModelIdAmazonNovaMicro10 KnownModelId = "amazon/nova-micro-1.0"
	KnownModelIdAmazonNovaPremier KnownModelId = "amazon/nova-premier"
	KnownModelIdAmazonNovaPro10 KnownModelId = "amazon/nova-pro-1.0"
	KnownModelIdAnthropicClaude3Haiku KnownModelId = "anthropic/claude-3-haiku"
	KnownModelIdAnthropicClaude35Haiku KnownModelId = "anthropic/claude-3.5-haiku"
	KnownModelIdAnthropicClaude37Sonnet KnownModelId = "anthropic/claude-3.7-sonnet"
	KnownModelIdAnthropicClaudeFable5 KnownModelId = "anthropic/claude-fable-5"
	KnownModelIdAnthropicClaudeFable51 KnownModelId = "anthropic/claude-fable-5.1"
	KnownModelIdAnthropicClaudeHaiku45 KnownModelId = "anthropic/claude-haiku-4.5"
	KnownModelIdAnthropicClaudeOpus4 KnownModelId = "anthropic/claude-opus-4"
	KnownModelIdAnthropicClaudeOpus41 KnownModelId = "anthropic/claude-opus-4.1"
	KnownModelIdAnthropicClaudeOpus45 KnownModelId = "anthropic/claude-opus-4.5"
	KnownModelIdAnthropicClaudeOpus46 KnownModelId = "anthropic/claude-opus-4.6"
	KnownModelIdAnthropicClaudeOpus47 KnownModelId = "anthropic/claude-opus-4.7"
	KnownModelIdAnthropicClaudeOpus48 KnownModelId = "anthropic/claude-opus-4.8"
	KnownModelIdAnthropicClaudeOpus5 KnownModelId = "anthropic/claude-opus-5"
	KnownModelIdAnthropicClaudeSonnet4 KnownModelId = "anthropic/claude-sonnet-4"
	KnownModelIdAnthropicClaudeSonnet45 KnownModelId = "anthropic/claude-sonnet-4.5"
	KnownModelIdAnthropicClaudeSonnet46 KnownModelId = "anthropic/claude-sonnet-4.6"
	KnownModelIdAnthropicClaudeSonnet5 KnownModelId = "anthropic/claude-sonnet-5"
	KnownModelIdArceeAiTrinityLarge KnownModelId = "arcee-ai/trinity-large"
	KnownModelIdArceeAiTrinityLargeThinking KnownModelId = "arcee-ai/trinity-large-thinking"
	KnownModelIdArceeAiTrinityMini KnownModelId = "arcee-ai/trinity-mini"
	KnownModelIdBaaiBgeM3 KnownModelId = "baai/bge-m3"
	KnownModelIdBaaiBgeRerankerV2M3 KnownModelId = "baai/bge-reranker-v2-m3"
	KnownModelIdBaiduCobuddy KnownModelId = "baidu/cobuddy"
	KnownModelIdBaiduErnie45300bA47b KnownModelId = "baidu/ernie-4.5-300b-a47b"
	KnownModelIdBaiduErnie45Vl424bA47b KnownModelId = "baidu/ernie-4.5-vl-424b-a47b"
	KnownModelIdBlackForestLabsFlux1Dev KnownModelId = "black-forest-labs/flux-1-dev"
	KnownModelIdBlackForestLabsFlux1Schnell KnownModelId = "black-forest-labs/flux-1-schnell"
	KnownModelIdBytedanceSeed16 KnownModelId = "bytedance/seed-1.6"
	KnownModelIdBytedanceSeed1620251015 KnownModelId = "bytedance/seed-1.6-2025-10-15"
	KnownModelIdBytedanceSeed16250915 KnownModelId = "bytedance/seed-1.6-250915"
	KnownModelIdBytedanceSeed16Flash KnownModelId = "bytedance/seed-1.6-flash"
	KnownModelIdBytedanceSeed16Flash20250828 KnownModelId = "bytedance/seed-1.6-flash-2025-08-28"
	KnownModelIdBytedanceSeed16Flash250715 KnownModelId = "bytedance/seed-1.6-flash-250715"
	KnownModelIdBytedanceSeed18 KnownModelId = "bytedance/seed-1.8"
	KnownModelIdBytedanceSeed1820251228 KnownModelId = "bytedance/seed-1.8-2025-12-28"
	KnownModelIdBytedanceSeed20CodePreview20260215 KnownModelId = "bytedance/seed-2.0-code-preview-2026-02-15"
	KnownModelIdBytedanceSeed20Lite KnownModelId = "bytedance/seed-2.0-lite"
	KnownModelIdBytedanceSeed20Lite20260428 KnownModelId = "bytedance/seed-2.0-lite-2026-04-28"
	KnownModelIdBytedanceSeed20Lite260428 KnownModelId = "bytedance/seed-2.0-lite-260428"
	KnownModelIdBytedanceSeed20Mini KnownModelId = "bytedance/seed-2.0-mini"
	KnownModelIdBytedanceSeed20Mini20260428 KnownModelId = "bytedance/seed-2.0-mini-2026-04-28"
	KnownModelIdBytedanceSeed20Mini260428 KnownModelId = "bytedance/seed-2.0-mini-260428"
	KnownModelIdBytedanceSeed20Pro KnownModelId = "bytedance/seed-2.0-pro"
	KnownModelIdBytedanceSeed21Turbo KnownModelId = "bytedance/seed-2.1-turbo"
	KnownModelIdBytedanceSeedOss36bInstruct KnownModelId = "bytedance/seed-oss-36b-instruct"
	KnownModelIdBytedanceSeedTranslation KnownModelId = "bytedance/seed-translation"
	KnownModelIdBytedanceSeedance20 KnownModelId = "bytedance/seedance-2.0"
	KnownModelIdBytedanceSeedance20Fast KnownModelId = "bytedance/seedance-2.0-fast"
	KnownModelIdBytedanceSeedance20Mini260615 KnownModelId = "bytedance/seedance-2.0-mini-260615"
	KnownModelIdBytedanceSeedream50Pro KnownModelId = "bytedance/seedream-5.0-pro"
	KnownModelIdCohereCommandA KnownModelId = "cohere/command-a"
	KnownModelIdCohereCommandR KnownModelId = "cohere/command-r"
	KnownModelIdCohereCommandRPlus KnownModelId = "cohere/command-r-plus"
	KnownModelIdCohereCommandR7b KnownModelId = "cohere/command-r7b"
	KnownModelIdCohereEmbedEnglishV3 KnownModelId = "cohere/embed-english-v3"
	KnownModelIdCohereEmbedMultilingualV3 KnownModelId = "cohere/embed-multilingual-v3"
	KnownModelIdCohereEmbedV4 KnownModelId = "cohere/embed-v4"
	KnownModelIdCohereParseV50 KnownModelId = "cohere/parse-v5.0"
	KnownModelIdCohereRerankV35 KnownModelId = "cohere/rerank-v3.5"
	KnownModelIdCohereRerankV40Fast KnownModelId = "cohere/rerank-v4.0-fast"
	KnownModelIdCohereRerankV40Pro KnownModelId = "cohere/rerank-v4.0-pro"
	KnownModelIdCrofaiGreg1Mini KnownModelId = "crofai/greg-1-mini"
	KnownModelIdCrofaiGreg2Super KnownModelId = "crofai/greg-2-super"
	KnownModelIdCrofaiGreg2Ultra KnownModelId = "crofai/greg-2-ultra"
	KnownModelIdCrofaiGregRp KnownModelId = "crofai/greg-rp"
	KnownModelIdDeepseekDeepseekOcr KnownModelId = "deepseek/deepseek-ocr"
	KnownModelIdDeepseekDeepseekOcr2 KnownModelId = "deepseek/deepseek-ocr-2"
	KnownModelIdDeepseekDeepseekR1 KnownModelId = "deepseek/deepseek-r1"
	KnownModelIdDeepseekDeepseekR10528 KnownModelId = "deepseek/deepseek-r1-0528"
	KnownModelIdDeepseekDeepseekR120250528 KnownModelId = "deepseek/deepseek-r1-2025-05-28"
	KnownModelIdDeepseekDeepseekR1DistillLlama70b KnownModelId = "deepseek/deepseek-r1-distill-llama-70b"
	KnownModelIdDeepseekDeepseekR1Turbo KnownModelId = "deepseek/deepseek-r1-turbo"
	KnownModelIdDeepseekDeepseekV3 KnownModelId = "deepseek/deepseek-v3"
	KnownModelIdDeepseekDeepseekV30324 KnownModelId = "deepseek/deepseek-v3-0324"
	KnownModelIdDeepseekDeepseekV3Turbo KnownModelId = "deepseek/deepseek-v3-turbo"
	KnownModelIdDeepseekDeepseekV31 KnownModelId = "deepseek/deepseek-v3.1"
	KnownModelIdDeepseekDeepseekV31Terminus KnownModelId = "deepseek/deepseek-v3.1-terminus"
	KnownModelIdDeepseekDeepseekV32 KnownModelId = "deepseek/deepseek-v3.2"
	KnownModelIdDeepseekDeepseekV32Exp KnownModelId = "deepseek/deepseek-v3.2-exp"
	KnownModelIdDeepseekDeepseekV4Flash KnownModelId = "deepseek/deepseek-v4-flash"
	KnownModelIdDeepseekDeepseekV4Flash0731 KnownModelId = "deepseek/deepseek-v4-flash-0731"
	KnownModelIdDeepseekDeepseekV4FlashVisionExp KnownModelId = "deepseek/deepseek-v4-flash-vision-exp"
	KnownModelIdDeepseekDeepseekV4Pro KnownModelId = "deepseek/deepseek-v4-pro"
	KnownModelIdDeepseekDeepseekV4Pro0813 KnownModelId = "deepseek/deepseek-v4-pro-0813"
	KnownModelIdElevenLabsElevenFlashV2 KnownModelId = "eleven-labs/eleven-flash-v2"
	KnownModelIdElevenLabsElevenFlashV25 KnownModelId = "eleven-labs/eleven-flash-v2.5"
	KnownModelIdElevenLabsElevenMultilingualV2 KnownModelId = "eleven-labs/eleven-multilingual-v2"
	KnownModelIdElevenLabsElevenTurboV2 KnownModelId = "eleven-labs/eleven-turbo-v2"
	KnownModelIdElevenLabsElevenTurboV25 KnownModelId = "eleven-labs/eleven-turbo-v2.5"
	KnownModelIdElevenLabsElevenV3 KnownModelId = "eleven-labs/eleven-v3"
	KnownModelIdElevenLabsMusic KnownModelId = "eleven-labs/music"
	KnownModelIdElevenLabsScribeV2 KnownModelId = "eleven-labs/scribe-v2"
	KnownModelIdEssentialAiRnj1 KnownModelId = "essential-ai/rnj-1"
	KnownModelIdGoogleGemini25Flash KnownModelId = "google/gemini-2.5-flash"
	KnownModelIdGoogleGemini25FlashImage KnownModelId = "google/gemini-2.5-flash-image"
	KnownModelIdGoogleGemini25FlashLite KnownModelId = "google/gemini-2.5-flash-lite"
	KnownModelIdGoogleGemini25Pro KnownModelId = "google/gemini-2.5-pro"
	KnownModelIdGoogleGemini3FlashPreview KnownModelId = "google/gemini-3-flash-preview"
	KnownModelIdGoogleGemini3ProImage KnownModelId = "google/gemini-3-pro-image"
	KnownModelIdGoogleGemini31FlashImage KnownModelId = "google/gemini-3.1-flash-image"
	KnownModelIdGoogleGemini31FlashLite KnownModelId = "google/gemini-3.1-flash-lite"
	KnownModelIdGoogleGemini31FlashLiteImage KnownModelId = "google/gemini-3.1-flash-lite-image"
	KnownModelIdGoogleGemini31FlashLivePreview KnownModelId = "google/gemini-3.1-flash-live-preview"
	KnownModelIdGoogleGemini31FlashTtsPreview KnownModelId = "google/gemini-3.1-flash-tts-preview"
	KnownModelIdGoogleGemini31ProPreview KnownModelId = "google/gemini-3.1-pro-preview"
	KnownModelIdGoogleGemini31ProPreviewCustomtools KnownModelId = "google/gemini-3.1-pro-preview-customtools"
	KnownModelIdGoogleGemini35Flash KnownModelId = "google/gemini-3.5-flash"
	KnownModelIdGoogleGemini35FlashLite KnownModelId = "google/gemini-3.5-flash-lite"
	KnownModelIdGoogleGemini36Flash KnownModelId = "google/gemini-3.6-flash"
	KnownModelIdGoogleGemini37Flash KnownModelId = "google/gemini-3.7-flash"
	KnownModelIdGoogleGemini38Flash KnownModelId = "google/gemini-3.8-flash"
	KnownModelIdGoogleGeminiEmbedding001 KnownModelId = "google/gemini-embedding-001"
	KnownModelIdGoogleGeminiEmbedding2 KnownModelId = "google/gemini-embedding-2"
	KnownModelIdGoogleGeminiRoboticsEr2Preview KnownModelId = "google/gemini-robotics-er-2-preview"
	KnownModelIdGoogleGemma312b KnownModelId = "google/gemma-3-12b"
	KnownModelIdGoogleGemma327b KnownModelId = "google/gemma-3-27b"
	KnownModelIdGoogleGemma34b KnownModelId = "google/gemma-3-4b"
	KnownModelIdGoogleGemma412b KnownModelId = "google/gemma-4-12b"
	KnownModelIdGoogleGemma426bA4b KnownModelId = "google/gemma-4-26b-a4b"
	KnownModelIdGoogleGemma426bA4bFree KnownModelId = "google/gemma-4-26b-a4b:free"
	KnownModelIdGoogleGemma431b KnownModelId = "google/gemma-4-31b"
	KnownModelIdGoogleGemma431bIt KnownModelId = "google/gemma-4-31b-it"
	KnownModelIdGoogleGemma431bFree KnownModelId = "google/gemma-4-31b:free"
	KnownModelIdGoogleImagen40Preview KnownModelId = "google/imagen-4.0-preview"
	KnownModelIdGoogleLyria3ClipPreview KnownModelId = "google/lyria-3-clip-preview"
	KnownModelIdGoogleLyria3ProPreview KnownModelId = "google/lyria-3-pro-preview"
	KnownModelIdGoogleVeo31 KnownModelId = "google/veo-3.1"
	KnownModelIdGoogleVeo31Fast KnownModelId = "google/veo-3.1-fast"
	KnownModelIdGoogleVeo31FastPreview KnownModelId = "google/veo-3.1-fast-preview"
	KnownModelIdGoogleVeo31LitePreview KnownModelId = "google/veo-3.1-lite-preview"
	KnownModelIdGoogleVeo31Preview KnownModelId = "google/veo-3.1-preview"
	KnownModelIdIbmGranite418b KnownModelId = "ibm/granite-4.1-8b"
	KnownModelIdIbmGranite4230b KnownModelId = "ibm/granite-4.2-30b"
	KnownModelIdIbmGranite423b KnownModelId = "ibm/granite-4.2-3b"
	KnownModelIdIbmGranite428b KnownModelId = "ibm/granite-4.2-8b"
	KnownModelIdInceptionMercury2 KnownModelId = "inception/mercury-2"
	KnownModelIdInceptionMercuryEdit2 KnownModelId = "inception/mercury-edit-2"
	KnownModelIdInclusionaiLing261t KnownModelId = "inclusionai/ling-2.6-1t"
	KnownModelIdInclusionaiLing26Flash KnownModelId = "inclusionai/ling-2.6-flash"
	KnownModelIdInclusionaiLing30Flash KnownModelId = "inclusionai/ling-3.0-flash"
	KnownModelIdInclusionaiLing30FlashFin KnownModelId = "inclusionai/ling-3.0-flash-fin"
	KnownModelIdInclusionaiLing30FlashSante KnownModelId = "inclusionai/ling-3.0-flash-sante"
	KnownModelIdInclusionaiLing30FlashVl KnownModelId = "inclusionai/ling-3.0-flash-vl"
	KnownModelIdInclusionaiLingFlash20 KnownModelId = "inclusionai/ling-flash-2.0"
	KnownModelIdInclusionaiRing261t KnownModelId = "inclusionai/ring-2.6-1t"
	KnownModelIdInclusionaiRingFlash20 KnownModelId = "inclusionai/ring-flash-2.0"
	KnownModelIdInflectionInflection3Pi KnownModelId = "inflection/inflection-3-pi"
	KnownModelIdInflectionInflection3Productivity KnownModelId = "inflection/inflection-3-productivity"
	KnownModelIdJetbrainsMellum212bA25b KnownModelId = "jetbrains/mellum2-12b-a2.5b"
	KnownModelIdKwaipilotKatCoderAirV25 KnownModelId = "kwaipilot/kat-coder-air-v2.5"
	KnownModelIdKwaipilotKatCoderPro KnownModelId = "kwaipilot/kat-coder-pro"
	KnownModelIdKwaipilotKatCoderProV2 KnownModelId = "kwaipilot/kat-coder-pro-v2"
	KnownModelIdKwaipilotKatCoderProV25 KnownModelId = "kwaipilot/kat-coder-pro-v2.5"
	KnownModelIdLiquidAiLfm224bA2b KnownModelId = "liquid-ai/lfm-2-24b-a2b"
	KnownModelIdLiquidAiLfm258bA1b KnownModelId = "liquid-ai/lfm-2.5-8b-a1b"
	KnownModelIdLtx23Fast KnownModelId = "ltx-2-3-fast"
	KnownModelIdLtx23Pro KnownModelId = "ltx-2-3-pro"
	KnownModelIdLtx25Fast KnownModelId = "ltx-2-5-fast"
	KnownModelIdLtx25Pro KnownModelId = "ltx-2-5-pro"
	KnownModelIdMeituanLongcat20 KnownModelId = "meituan/longcat-2.0"
	KnownModelIdMetaLlama3170b KnownModelId = "meta/llama-3.1-70b"
	KnownModelIdMetaLlama318b KnownModelId = "meta/llama-3.1-8b"
	KnownModelIdMetaLlama323b KnownModelId = "meta/llama-3.2-3b"
	KnownModelIdMetaLlama3370b KnownModelId = "meta/llama-3.3-70b"
	KnownModelIdMetaLlama4Maverick KnownModelId = "meta/llama-4-maverick"
	KnownModelIdMetaLlama4Scout KnownModelId = "meta/llama-4-scout"
	KnownModelIdMetaLlamaGuard412b KnownModelId = "meta/llama-guard-4-12b"
	KnownModelIdMetaLlamaPromptGuard222m KnownModelId = "meta/llama-prompt-guard-2-22m"
	KnownModelIdMetaLlamaPromptGuard286m KnownModelId = "meta/llama-prompt-guard-2-86m"
	KnownModelIdMetaMuseGlimmer30b KnownModelId = "meta/muse-glimmer-30b"
	KnownModelIdMetaMuseImage10 KnownModelId = "meta/muse-image-1.0"
	KnownModelIdMetaMuseSpark12 KnownModelId = "meta/muse-spark-1.2"
	KnownModelIdMetaMuseSpark12Contributor KnownModelId = "meta/muse-spark-1.2-contributor"
	KnownModelIdMetaMuseSpark13 KnownModelId = "meta/muse-spark-1.3"
	KnownModelIdMetaMuseSpark13Contributor KnownModelId = "meta/muse-spark-1.3-contributor"
	KnownModelIdMetaMuseVoiceTranscribe10 KnownModelId = "meta/muse-voice-transcribe-1.0"
	KnownModelIdMicrosoftPhi4 KnownModelId = "microsoft/phi-4"
	KnownModelIdMicrosoftWizardlm28x22b KnownModelId = "microsoft/wizardlm-2-8x22b"
	KnownModelIdMindaiMacaronV1Tall KnownModelId = "mindai/macaron-v1-tall"
	KnownModelIdMindaiMacaronV1Venti KnownModelId = "mindai/macaron-v1-venti"
	KnownModelIdMinimaxH3 KnownModelId = "minimax/h3"
	KnownModelIdMinimaxHailuo02 KnownModelId = "minimax/hailuo-02"
	KnownModelIdMinimaxHailuo23 KnownModelId = "minimax/hailuo-2.3"
	KnownModelIdMinimaxHailuo23Fast KnownModelId = "minimax/hailuo-2.3-fast"
	KnownModelIdMinimaxImage01 KnownModelId = "minimax/image-01"
	KnownModelIdMinimaxM2Her KnownModelId = "minimax/m2-her"
	KnownModelIdMinimaxMinimaxM180k KnownModelId = "minimax/minimax-m1-80k"
	KnownModelIdMinimaxMinimaxM2 KnownModelId = "minimax/minimax-m2"
	KnownModelIdMinimaxMinimaxM21 KnownModelId = "minimax/minimax-m2.1"
	KnownModelIdMinimaxMinimaxM25 KnownModelId = "minimax/minimax-m2.5"
	KnownModelIdMinimaxMinimaxM25Highspeed KnownModelId = "minimax/minimax-m2.5-highspeed"
	KnownModelIdMinimaxMinimaxM27 KnownModelId = "minimax/minimax-m2.7"
	KnownModelIdMinimaxMinimaxM3 KnownModelId = "minimax/minimax-m3"
	KnownModelIdMinimaxMusic26 KnownModelId = "minimax/music-2.6"
	KnownModelIdMinimaxMusic30 KnownModelId = "minimax/music-3.0"
	KnownModelIdMinimaxSpeech26Hd KnownModelId = "minimax/speech-2.6-hd"
	KnownModelIdMinimaxSpeech26Turbo KnownModelId = "minimax/speech-2.6-turbo"
	KnownModelIdMinimaxSpeech28Hd KnownModelId = "minimax/speech-2.8-hd"
	KnownModelIdMinimaxSpeech28Turbo KnownModelId = "minimax/speech-2.8-turbo"
	KnownModelIdMistralCodestral KnownModelId = "mistral/codestral"
	KnownModelIdMistralCodestralEmbed KnownModelId = "mistral/codestral-embed"
	KnownModelIdMistralDevstral2 KnownModelId = "mistral/devstral-2"
	KnownModelIdMistralDevstral20 KnownModelId = "mistral/devstral-2.0"
	KnownModelIdMistralDevstralMedium10 KnownModelId = "mistral/devstral-medium-1.0"
	KnownModelIdMistralDevstralSmall11 KnownModelId = "mistral/devstral-small-1.1"
	KnownModelIdMistralLeanstral15Free KnownModelId = "mistral/leanstral-1.5:free"
	KnownModelIdMistralMagistralMedium12 KnownModelId = "mistral/magistral-medium-1.2"
	KnownModelIdMistralMagistralSmall12 KnownModelId = "mistral/magistral-small-1.2"
	KnownModelIdMistralMinistral314b KnownModelId = "mistral/ministral-3-14b"
	KnownModelIdMistralMinistral33b KnownModelId = "mistral/ministral-3-3b"
	KnownModelIdMistralMinistral38b KnownModelId = "mistral/ministral-3-8b"
	KnownModelIdMistralMinistral3014b KnownModelId = "mistral/ministral-3.0-14b"
	KnownModelIdMistralMinistral303b KnownModelId = "mistral/ministral-3.0-3b"
	KnownModelIdMistralMinistral308b KnownModelId = "mistral/ministral-3.0-8b"
	KnownModelIdMistralMistralEmbed KnownModelId = "mistral/mistral-embed"
	KnownModelIdMistralMistralLarge21 KnownModelId = "mistral/mistral-large-2.1"
	KnownModelIdMistralMistralLarge3 KnownModelId = "mistral/mistral-large-3"
	KnownModelIdMistralMistralLarge30 KnownModelId = "mistral/mistral-large-3.0"
	KnownModelIdMistralMistralMedium30 KnownModelId = "mistral/mistral-medium-3.0"
	KnownModelIdMistralMistralMedium31 KnownModelId = "mistral/mistral-medium-3.1"
	KnownModelIdMistralMistralMedium35 KnownModelId = "mistral/mistral-medium-3.5"
	KnownModelIdMistralMistralModeration2 KnownModelId = "mistral/mistral-moderation-2"
	KnownModelIdMistralMistralNemo KnownModelId = "mistral/mistral-nemo"
	KnownModelIdMistralMistralNemo12b KnownModelId = "mistral/mistral-nemo-12b"
	KnownModelIdMistralMistralNemo2407 KnownModelId = "mistral/mistral-nemo-2407"
	KnownModelIdMistralMistralSmall24b2501 KnownModelId = "mistral/mistral-small-24b-2501"
	KnownModelIdMistralMistralSmall32 KnownModelId = "mistral/mistral-small-3.2"
	KnownModelIdMistralMistralSmall4 KnownModelId = "mistral/mistral-small-4"
	KnownModelIdMistralOcr3 KnownModelId = "mistral/ocr-3"
	KnownModelIdMistralOcr4 KnownModelId = "mistral/ocr-4"
	KnownModelIdMistralOcr41 KnownModelId = "mistral/ocr-4.1"
	KnownModelIdMistralPixtralLarge KnownModelId = "mistral/pixtral-large"
	KnownModelIdMistralVoxtralMini KnownModelId = "mistral/voxtral-mini"
	KnownModelIdMistralVoxtralMiniTranscribe2 KnownModelId = "mistral/voxtral-mini-transcribe-2"
	KnownModelIdMistralVoxtralSmall KnownModelId = "mistral/voxtral-small"
	KnownModelIdMoonshotaiKimiK2 KnownModelId = "moonshotai/kimi-k2"
	KnownModelIdMoonshotaiKimiK20905 KnownModelId = "moonshotai/kimi-k2-0905"
	KnownModelIdMoonshotaiKimiK2Thinking KnownModelId = "moonshotai/kimi-k2-thinking"
	KnownModelIdMoonshotaiKimiK25 KnownModelId = "moonshotai/kimi-k2.5"
	KnownModelIdMoonshotaiKimiK26 KnownModelId = "moonshotai/kimi-k2.6"
	KnownModelIdMoonshotaiKimiK27Code KnownModelId = "moonshotai/kimi-k2.7-code"
	KnownModelIdMoonshotaiKimiK3 KnownModelId = "moonshotai/kimi-k3"
	KnownModelIdMoonshotaiKimiK3Fast KnownModelId = "moonshotai/kimi-k3-fast"
	KnownModelIdMorphMorphCompactor KnownModelId = "morph/morph-compactor"
	KnownModelIdMorphMorphV3Fast KnownModelId = "morph/morph-v3-fast"
	KnownModelIdMorphMorphV3Large KnownModelId = "morph/morph-v3-large"
	KnownModelIdMorphMorphWarpGrepV21 KnownModelId = "morph/morph-warp-grep-v2.1"
	KnownModelIdNexAgiDeepseekV31NexN1 KnownModelId = "nex-agi/deepseek-v3.1-nex-n1"
	KnownModelIdNousHermes3Llama31405b KnownModelId = "nous/hermes-3-llama-3.1-405b"
	KnownModelIdNousresearchHermes3Llama3170b KnownModelId = "nousresearch/hermes-3-llama-3.1-70b"
	KnownModelIdNousresearchHermes4405b KnownModelId = "nousresearch/hermes-4-405b"
	KnownModelIdNvidiaNemotron3Nano30bA3b KnownModelId = "nvidia/nemotron-3-nano-30b-a3b"
	KnownModelIdNvidiaNemotron3Super120bA12b KnownModelId = "nvidia/nemotron-3-super-120b-a12b"
	KnownModelIdNvidiaNemotron3Ultra550bA55b KnownModelId = "nvidia/nemotron-3-ultra-550b-a55b"
	KnownModelIdNvidiaNemotron35Lightning KnownModelId = "nvidia/nemotron-3.5-lightning"
	KnownModelIdNvidiaNemotronNano9bV2 KnownModelId = "nvidia/nemotron-nano-9b-v2"
	KnownModelIdNvidiaNvidiaNemotron3Nano30bA3b KnownModelId = "nvidia/nvidia-nemotron-3-nano-30b-a3b"
	KnownModelIdNvidiaNvidiaNemotronNano12bV2Vl KnownModelId = "nvidia/nvidia-nemotron-nano-12b-v2-vl"
	KnownModelIdOpenaiBabbage002 KnownModelId = "openai/babbage-002"
	KnownModelIdOpenaiChatLatest KnownModelId = "openai/chat-latest"
	KnownModelIdOpenaiChatgpt4o KnownModelId = "openai/chatgpt-4o"
	KnownModelIdOpenaiDavinci002 KnownModelId = "openai/davinci-002"
	KnownModelIdOpenaiGpt35Turbo16k KnownModelId = "openai/gpt-3.5-turbo-16k"
	KnownModelIdOpenaiGpt35Turbo20230321 KnownModelId = "openai/gpt-3.5-turbo-2023-03-21"
	KnownModelIdOpenaiGpt420230613 KnownModelId = "openai/gpt-4-2023-06-13"
	KnownModelIdOpenaiGpt41 KnownModelId = "openai/gpt-4.1"
	KnownModelIdOpenaiGpt41Mini KnownModelId = "openai/gpt-4.1-mini"
	KnownModelIdOpenaiGpt41Nano KnownModelId = "openai/gpt-4.1-nano"
	KnownModelIdOpenaiGpt4o KnownModelId = "openai/gpt-4o"
	KnownModelIdOpenaiGpt4o20240513 KnownModelId = "openai/gpt-4o-2024-05-13"
	KnownModelIdOpenaiGpt4o20240806 KnownModelId = "openai/gpt-4o-2024-08-06"
	KnownModelIdOpenaiGpt4o20241120 KnownModelId = "openai/gpt-4o-2024-11-20"
	KnownModelIdOpenaiGpt4oMini KnownModelId = "openai/gpt-4o-mini"
	KnownModelIdOpenaiGpt4oMiniTranscribe KnownModelId = "openai/gpt-4o-mini-transcribe"
	KnownModelIdOpenaiGpt4oMiniTts KnownModelId = "openai/gpt-4o-mini-tts"
	KnownModelIdOpenaiGpt4oTranscribe KnownModelId = "openai/gpt-4o-transcribe"
	KnownModelIdOpenaiGpt5 KnownModelId = "openai/gpt-5"
	KnownModelIdOpenaiGpt5Mini KnownModelId = "openai/gpt-5-mini"
	KnownModelIdOpenaiGpt5Nano KnownModelId = "openai/gpt-5-nano"
	KnownModelIdOpenaiGpt5Pro KnownModelId = "openai/gpt-5-pro"
	KnownModelIdOpenaiGpt51 KnownModelId = "openai/gpt-5.1"
	KnownModelIdOpenaiGpt52 KnownModelId = "openai/gpt-5.2"
	KnownModelIdOpenaiGpt52Codex KnownModelId = "openai/gpt-5.2-codex"
	KnownModelIdOpenaiGpt52Pro KnownModelId = "openai/gpt-5.2-pro"
	KnownModelIdOpenaiGpt53Codex KnownModelId = "openai/gpt-5.3-codex"
	KnownModelIdOpenaiGpt54 KnownModelId = "openai/gpt-5.4"
	KnownModelIdOpenaiGpt54Mini KnownModelId = "openai/gpt-5.4-mini"
	KnownModelIdOpenaiGpt54Nano KnownModelId = "openai/gpt-5.4-nano"
	KnownModelIdOpenaiGpt54Pro KnownModelId = "openai/gpt-5.4-pro"
	KnownModelIdOpenaiGpt55 KnownModelId = "openai/gpt-5.5"
	KnownModelIdOpenaiGpt55Pro KnownModelId = "openai/gpt-5.5-pro"
	KnownModelIdOpenaiGpt56Luna KnownModelId = "openai/gpt-5.6-luna"
	KnownModelIdOpenaiGpt56LunaPro KnownModelId = "openai/gpt-5.6-luna-pro"
	KnownModelIdOpenaiGpt56Sol KnownModelId = "openai/gpt-5.6-sol"
	KnownModelIdOpenaiGpt56SolPro KnownModelId = "openai/gpt-5.6-sol-pro"
	KnownModelIdOpenaiGpt56Terra KnownModelId = "openai/gpt-5.6-terra"
	KnownModelIdOpenaiGpt56TerraPro KnownModelId = "openai/gpt-5.6-terra-pro"
	KnownModelIdOpenaiGpt6Astra KnownModelId = "openai/gpt-6-astra"
	KnownModelIdOpenaiGpt6AstraPro KnownModelId = "openai/gpt-6-astra-pro"
	KnownModelIdOpenaiGptImage1 KnownModelId = "openai/gpt-image-1"
	KnownModelIdOpenaiGptImage1Mini KnownModelId = "openai/gpt-image-1-mini"
	KnownModelIdOpenaiGptImage15 KnownModelId = "openai/gpt-image-1.5"
	KnownModelIdOpenaiGptImage2 KnownModelId = "openai/gpt-image-2"
	KnownModelIdOpenaiGptOss120b KnownModelId = "openai/gpt-oss-120b"
	KnownModelIdOpenaiGptOss20b KnownModelId = "openai/gpt-oss-20b"
	KnownModelIdOpenaiGptOssSafeguard120b KnownModelId = "openai/gpt-oss-safeguard-120b"
	KnownModelIdOpenaiGptOssSafeguard20b KnownModelId = "openai/gpt-oss-safeguard-20b"
	KnownModelIdOpenaiGptRealtime KnownModelId = "openai/gpt-realtime"
	KnownModelIdOpenaiGptRealtime15 KnownModelId = "openai/gpt-realtime-1.5"
	KnownModelIdOpenaiGptRealtime2 KnownModelId = "openai/gpt-realtime-2"
	KnownModelIdOpenaiGptTranscribe KnownModelId = "openai/gpt-transcribe"
	KnownModelIdOpenaiO1 KnownModelId = "openai/o1"
	KnownModelIdOpenaiO1Mini KnownModelId = "openai/o1-mini"
	KnownModelIdOpenaiO1Pro KnownModelId = "openai/o1-pro"
	KnownModelIdOpenaiO3 KnownModelId = "openai/o3"
	KnownModelIdOpenaiO3Mini KnownModelId = "openai/o3-mini"
	KnownModelIdOpenaiO3Pro KnownModelId = "openai/o3-pro"
	KnownModelIdOpenaiO4Mini KnownModelId = "openai/o4-mini"
	KnownModelIdOpenaiOmniModeration KnownModelId = "openai/omni-moderation"
	KnownModelIdOpenaiSora2 KnownModelId = "openai/sora-2"
	KnownModelIdOpenaiSora2Pro KnownModelId = "openai/sora-2-pro"
	KnownModelIdOpenaiTextEmbedding3Large KnownModelId = "openai/text-embedding-3-large"
	KnownModelIdOpenaiTextEmbedding3Small KnownModelId = "openai/text-embedding-3-small"
	KnownModelIdOpenaiTextEmbeddingAda002 KnownModelId = "openai/text-embedding-ada-002"
	KnownModelIdOpenaiWhisper1 KnownModelId = "openai/whisper-1"
	KnownModelIdOpenaiWhisperLargeV3 KnownModelId = "openai/whisper-large-v3"
	KnownModelIdOpenaiWhisperLargeV3Turbo KnownModelId = "openai/whisper-large-v3-turbo"
	KnownModelIdPerplexityPplxEmbedV106b KnownModelId = "perplexity/pplx-embed-v1-0.6b"
	KnownModelIdPerplexityPplxEmbedV14b KnownModelId = "perplexity/pplx-embed-v1-4b"
	KnownModelIdPhaseoAuto KnownModelId = "phaseo/auto"
	KnownModelIdPhaseoFree KnownModelId = "phaseo/free"
	KnownModelIdPoolsideLagunaM1Free KnownModelId = "poolside/laguna-m.1:free"
	KnownModelIdPoolsideLagunaS21Free KnownModelId = "poolside/laguna-s-2.1:free"
	KnownModelIdPoolsideLagunaXs21Free KnownModelId = "poolside/laguna-xs-2.1:free"
	KnownModelIdQwenQvqMax KnownModelId = "qwen/qvq-max"
	KnownModelIdQwenQwenFlash KnownModelId = "qwen/qwen-flash"
	KnownModelIdQwenQwenFlashCharacter KnownModelId = "qwen/qwen-flash-character"
	KnownModelIdQwenQwenImage KnownModelId = "qwen/qwen-image"
	KnownModelIdQwenQwenMax KnownModelId = "qwen/qwen-max"
	KnownModelIdQwenQwenMtFlash KnownModelId = "qwen/qwen-mt-flash"
	KnownModelIdQwenQwenMtLite KnownModelId = "qwen/qwen-mt-lite"
	KnownModelIdQwenQwenMtPlus KnownModelId = "qwen/qwen-mt-plus"
	KnownModelIdQwenQwenMtTurbo KnownModelId = "qwen/qwen-mt-turbo"
	KnownModelIdQwenQwenPlus20250125 KnownModelId = "qwen/qwen-plus-2025-01-25"
	KnownModelIdQwenQwenPlus20250428 KnownModelId = "qwen/qwen-plus-2025-04-28"
	KnownModelIdQwenQwenPlus20250714 KnownModelId = "qwen/qwen-plus-2025-07-14"
	KnownModelIdQwenQwenPlus20250728 KnownModelId = "qwen/qwen-plus-2025-07-28"
	KnownModelIdQwenQwenPlus20250911 KnownModelId = "qwen/qwen-plus-2025-09-11"
	KnownModelIdQwenQwenPlus20251201 KnownModelId = "qwen/qwen-plus-2025-12-01"
	KnownModelIdQwenQwenPlusCharacter KnownModelId = "qwen/qwen-plus-character"
	KnownModelIdQwenQwenTurbo20241101 KnownModelId = "qwen/qwen-turbo-2024-11-01"
	KnownModelIdQwenQwenTurbo20250428 KnownModelId = "qwen/qwen-turbo-2025-04-28"
	KnownModelIdQwenQwenVlMax20250408 KnownModelId = "qwen/qwen-vl-max-2025-04-08"
	KnownModelIdQwenQwenVlMax20250813 KnownModelId = "qwen/qwen-vl-max-2025-08-13"
	KnownModelIdQwenQwenVlPlus20250125 KnownModelId = "qwen/qwen-vl-plus-2025-01-25"
	KnownModelIdQwenQwenVlPlus20250507 KnownModelId = "qwen/qwen-vl-plus-2025-05-07"
	KnownModelIdQwenQwenVlPlus20250815 KnownModelId = "qwen/qwen-vl-plus-2025-08-15"
	KnownModelIdQwenQwen2514b KnownModelId = "qwen/qwen2.5-14b"
	KnownModelIdQwenQwen2514b1m KnownModelId = "qwen/qwen2.5-14b-1m"
	KnownModelIdQwenQwen2532b KnownModelId = "qwen/qwen2.5-32b"
	KnownModelIdQwenQwen2572b KnownModelId = "qwen/qwen2.5-72b"
	KnownModelIdQwenQwen257b KnownModelId = "qwen/qwen2.5-7b"
	KnownModelIdQwenQwen257b1m KnownModelId = "qwen/qwen2.5-7b-1m"
	KnownModelIdQwenQwen25Coder7b KnownModelId = "qwen/qwen2.5-coder-7b"
	KnownModelIdQwenQwen25Vl32b KnownModelId = "qwen/qwen2.5-vl-32b"
	KnownModelIdQwenQwen25Vl32bInstruct KnownModelId = "qwen/qwen2.5-vl-32b-instruct"
	KnownModelIdQwenQwen25Vl72b KnownModelId = "qwen/qwen2.5-vl-72b"
	KnownModelIdQwenQwen25Vl72bInstruct KnownModelId = "qwen/qwen2.5-vl-72b-instruct"
	KnownModelIdQwenQwen25Vl7b KnownModelId = "qwen/qwen2.5-vl-7b"
	KnownModelIdQwenQwen306b KnownModelId = "qwen/qwen3-0.6b"
	KnownModelIdQwenQwen317b KnownModelId = "qwen/qwen3-1.7b"
	KnownModelIdQwenQwen314b KnownModelId = "qwen/qwen3-14b"
	KnownModelIdQwenQwen3235bA22b KnownModelId = "qwen/qwen3-235b-a22b"
	KnownModelIdQwenQwen3235bA22b2507 KnownModelId = "qwen/qwen3-235b-a22b-2507"
	KnownModelIdQwenQwen3235bA22bInstruct2507 KnownModelId = "qwen/qwen3-235b-a22b-instruct-2507"
	KnownModelIdQwenQwen3235bA22bThinking2507 KnownModelId = "qwen/qwen3-235b-a22b-thinking-2507"
	KnownModelIdQwenQwen330bA3b KnownModelId = "qwen/qwen3-30b-a3b"
	KnownModelIdQwenQwen330bA3b2507 KnownModelId = "qwen/qwen3-30b-a3b-2507"
	KnownModelIdQwenQwen330bA3bInstruct2507 KnownModelId = "qwen/qwen3-30b-a3b-instruct-2507"
	KnownModelIdQwenQwen330bA3bThinking2507 KnownModelId = "qwen/qwen3-30b-a3b-thinking-2507"
	KnownModelIdQwenQwen332b KnownModelId = "qwen/qwen3-32b"
	KnownModelIdQwenQwen34b KnownModelId = "qwen/qwen3-4b"
	KnownModelIdQwenQwen38b KnownModelId = "qwen/qwen3-8b"
	KnownModelIdQwenQwen3Coder30bA3b KnownModelId = "qwen/qwen3-coder-30b-a3b"
	KnownModelIdQwenQwen3Coder480bA35b KnownModelId = "qwen/qwen3-coder-480b-a35b"
	KnownModelIdQwenQwen3CoderFlash KnownModelId = "qwen/qwen3-coder-flash"
	KnownModelIdQwenQwen3CoderNext KnownModelId = "qwen/qwen3-coder-next"
	KnownModelIdQwenQwen3CoderPlus20250722 KnownModelId = "qwen/qwen3-coder-plus-2025-07-22"
	KnownModelIdQwenQwen3CoderPlus20250923 KnownModelId = "qwen/qwen3-coder-plus-2025-09-23"
	KnownModelIdQwenQwen3Embedding06b KnownModelId = "qwen/qwen3-embedding-0.6b"
	KnownModelIdQwenQwen3Embedding8b KnownModelId = "qwen/qwen3-embedding-8b"
	KnownModelIdQwenQwen3Max KnownModelId = "qwen/qwen3-max"
	KnownModelIdQwenQwen3Max20250923 KnownModelId = "qwen/qwen3-max-2025-09-23"
	KnownModelIdQwenQwen3Max20260123 KnownModelId = "qwen/qwen3-max-2026-01-23"
	KnownModelIdQwenQwen3MaxPreview KnownModelId = "qwen/qwen3-max-preview"
	KnownModelIdQwenQwen3MaxThinking KnownModelId = "qwen/qwen3-max-thinking"
	KnownModelIdQwenQwen3Next80b KnownModelId = "qwen/qwen3-next-80b"
	KnownModelIdQwenQwen3Next80bA3b KnownModelId = "qwen/qwen3-next-80b-a3b"
	KnownModelIdQwenQwen3Next80bA3bInstruct KnownModelId = "qwen/qwen3-next-80b-a3b-instruct"
	KnownModelIdQwenQwen3Next80bA3bThinking KnownModelId = "qwen/qwen3-next-80b-a3b-thinking"
	KnownModelIdQwenQwen3Omni30bA3b KnownModelId = "qwen/qwen3-omni-30b-a3b"
	KnownModelIdQwenQwen3Omni30bA3bThinking KnownModelId = "qwen/qwen3-omni-30b-a3b-thinking"
	KnownModelIdQwenQwen3Reranker KnownModelId = "qwen/qwen3-reranker"
	KnownModelIdQwenQwen3Vl235bA22b KnownModelId = "qwen/qwen3-vl-235b-a22b"
	KnownModelIdQwenQwen3Vl235bA22bInstruct KnownModelId = "qwen/qwen3-vl-235b-a22b-instruct"
	KnownModelIdQwenQwen3Vl235bA22bThinking KnownModelId = "qwen/qwen3-vl-235b-a22b-thinking"
	KnownModelIdQwenQwen3Vl30bA3b KnownModelId = "qwen/qwen3-vl-30b-a3b"
	KnownModelIdQwenQwen3Vl30bA3bInstruct KnownModelId = "qwen/qwen3-vl-30b-a3b-instruct"
	KnownModelIdQwenQwen3Vl30bA3bThinking KnownModelId = "qwen/qwen3-vl-30b-a3b-thinking"
	KnownModelIdQwenQwen3Vl32bInstruct KnownModelId = "qwen/qwen3-vl-32b-instruct"
	KnownModelIdQwenQwen3Vl32bThinking KnownModelId = "qwen/qwen3-vl-32b-thinking"
	KnownModelIdQwenQwen3Vl8b KnownModelId = "qwen/qwen3-vl-8b"
	KnownModelIdQwenQwen3Vl8bInstruct KnownModelId = "qwen/qwen3-vl-8b-instruct"
	KnownModelIdQwenQwen3VlFlash20251015 KnownModelId = "qwen/qwen3-vl-flash-2025-10-15"
	KnownModelIdQwenQwen3VlFlash20260122 KnownModelId = "qwen/qwen3-vl-flash-2026-01-22"
	KnownModelIdQwenQwen3VlPlus20250923 KnownModelId = "qwen/qwen3-vl-plus-2025-09-23"
	KnownModelIdQwenQwen3VlPlus20251219 KnownModelId = "qwen/qwen3-vl-plus-2025-12-19"
	KnownModelIdQwenQwen35122bA10b KnownModelId = "qwen/qwen3.5-122b-a10b"
	KnownModelIdQwenQwen3527b KnownModelId = "qwen/qwen3.5-27b"
	KnownModelIdQwenQwen3535bA3b KnownModelId = "qwen/qwen3.5-35b-a3b"
	KnownModelIdQwenQwen35397bA17b KnownModelId = "qwen/qwen3.5-397b-a17b"
	KnownModelIdQwenQwen359b KnownModelId = "qwen/qwen3.5-9b"
	KnownModelIdQwenQwen35Flash KnownModelId = "qwen/qwen3.5-flash"
	KnownModelIdQwenQwen35LivetranslateFlashRealtime20260519 KnownModelId = "qwen/qwen3.5-livetranslate-flash-realtime-2026-05-19"
	KnownModelIdQwenQwen35Plus KnownModelId = "qwen/qwen3.5-plus"
	KnownModelIdQwenQwen35Plus20260420 KnownModelId = "qwen/qwen3.5-plus-2026-04-20"
	KnownModelIdQwenQwen3627b KnownModelId = "qwen/qwen3.6-27b"
	KnownModelIdQwenQwen3635bA3b KnownModelId = "qwen/qwen3.6-35b-a3b"
	KnownModelIdQwenQwen36Flash KnownModelId = "qwen/qwen3.6-flash"
	KnownModelIdQwenQwen36MaxPreview KnownModelId = "qwen/qwen3.6-max-preview"
	KnownModelIdQwenQwen36Plus KnownModelId = "qwen/qwen3.6-plus"
	KnownModelIdQwenQwen37Max KnownModelId = "qwen/qwen3.7-max"
	KnownModelIdQwenQwen37Max20260517 KnownModelId = "qwen/qwen3.7-max-2026-05-17"
	KnownModelIdQwenQwen37Plus KnownModelId = "qwen/qwen3.7-plus"
	KnownModelIdQwenQwen37Plus20260526 KnownModelId = "qwen/qwen3.7-plus-2026-05-26"
	KnownModelIdQwenQwen3824tA95b KnownModelId = "qwen/qwen3.8-2.4t-a95b"
	KnownModelIdQwenQwen3827b KnownModelId = "qwen/qwen3.8-27b"
	KnownModelIdQwenQwen38Flash KnownModelId = "qwen/qwen3.8-flash"
	KnownModelIdQwenQwen38Max KnownModelId = "qwen/qwen3.8-max"
	KnownModelIdQwenQwen38Max0902 KnownModelId = "qwen/qwen3.8-max-0902"
	KnownModelIdQwenQwq32b KnownModelId = "qwen/qwq-32b"
	KnownModelIdQwenQwqPlus KnownModelId = "qwen/qwq-plus"
	KnownModelIdQwenTextEmbeddingV3 KnownModelId = "qwen/text-embedding-v3"
	KnownModelIdQwenTextEmbeddingV4 KnownModelId = "qwen/text-embedding-v4"
	KnownModelIdQwenWan27T2v KnownModelId = "qwen/wan2.7-t2v"
	KnownModelIdQwenWan30Video KnownModelId = "qwen/wan3.0-video"
	KnownModelIdQwenWan30VideoPrime KnownModelId = "qwen/wan3.0-video-prime"
	KnownModelIdRekaEdge KnownModelId = "reka-edge"
	KnownModelIdRekaEdge2603 KnownModelId = "reka-edge-2603"
	KnownModelIdRekaFlash KnownModelId = "reka-flash"
	KnownModelIdRekaFlashResearch KnownModelId = "reka-flash-research"
	KnownModelIdRelaceRelaceSearch KnownModelId = "relace/relace-search"
	KnownModelIdSakanaFuguUltra KnownModelId = "sakana/fugu-ultra"
	KnownModelIdSakanaNamazu KnownModelId = "sakana/namazu"
	KnownModelIdSpacexAiGrok420 KnownModelId = "spacex-ai/grok-4.20"
	KnownModelIdSpacexAiGrok420MultiAgentBeta KnownModelId = "spacex-ai/grok-4.20-multi-agent-beta"
	KnownModelIdSpacexAiGrok420MultiAgentBeta0309 KnownModelId = "spacex-ai/grok-4.20-multi-agent-beta-0309"
	KnownModelIdSpacexAiGrok43 KnownModelId = "spacex-ai/grok-4.3"
	KnownModelIdSpacexAiGrok45 KnownModelId = "spacex-ai/grok-4.5"
	KnownModelIdSpacexAiGrok46 KnownModelId = "spacex-ai/grok-4.6"
	KnownModelIdSpacexAiGrokBuild01 KnownModelId = "spacex-ai/grok-build-0.1"
	KnownModelIdSpacexAiGrokImagineImage KnownModelId = "spacex-ai/grok-imagine-image"
	KnownModelIdSpacexAiGrokImagineImage20 KnownModelId = "spacex-ai/grok-imagine-image-2.0"
	KnownModelIdSpacexAiGrokTranscribe KnownModelId = "spacex-ai/grok-transcribe"
	KnownModelIdSpacexAiGrokTts KnownModelId = "spacex-ai/grok-tts"
	KnownModelIdStepfunStep35Flash KnownModelId = "stepfun/step-3.5-flash"
	KnownModelIdStepfunStep37Flash KnownModelId = "stepfun/step-3.7-flash"
	KnownModelIdTencentHunyuanA13bInstruct KnownModelId = "tencent/hunyuan-a13b-instruct"
	KnownModelIdTencentHy3 KnownModelId = "tencent/hy3"
	KnownModelIdTencentHy3Preview KnownModelId = "tencent/hy3-preview"
	KnownModelIdTencentHy3Free KnownModelId = "tencent/hy3:free"
	KnownModelIdTencentHy4Preview KnownModelId = "tencent/hy4-preview"
	KnownModelIdThinkingMachinesInkling KnownModelId = "thinking-machines/inkling"
	KnownModelIdThinkingMachinesInklingSmall KnownModelId = "thinking-machines/inkling-small"
	KnownModelIdUpstageSolarEmbedding1LargePassage KnownModelId = "upstage/solar-embedding-1-large-passage"
	KnownModelIdUpstageSolarEmbedding1LargeQuery KnownModelId = "upstage/solar-embedding-1-large-query"
	KnownModelIdUpstageSolarEmbedding2Passage KnownModelId = "upstage/solar-embedding-2-passage"
	KnownModelIdUpstageSolarEmbedding2Query KnownModelId = "upstage/solar-embedding-2-query"
	KnownModelIdUpstageSolarMini KnownModelId = "upstage/solar-mini"
	KnownModelIdUpstageSolarPro2 KnownModelId = "upstage/solar-pro-2"
	KnownModelIdUpstageSolarPro3 KnownModelId = "upstage/solar-pro-3"
	KnownModelIdUpstageSolarPro4 KnownModelId = "upstage/solar-pro-4"
	KnownModelIdVeniceGemma4Uncensored KnownModelId = "venice/gemma-4-uncensored"
	KnownModelIdVeniceVeniceRolePlayUncensored KnownModelId = "venice/venice-role-play-uncensored"
	KnownModelIdVeniceVeniceUncensored12 KnownModelId = "venice/venice-uncensored-1.2"
	KnownModelIdVoyageRerank1 KnownModelId = "voyage/rerank-1"
	KnownModelIdVoyageRerank2 KnownModelId = "voyage/rerank-2"
	KnownModelIdVoyageRerank2Lite KnownModelId = "voyage/rerank-2-lite"
	KnownModelIdVoyageRerank25 KnownModelId = "voyage/rerank-2.5"
	KnownModelIdVoyageRerank25Lite KnownModelId = "voyage/rerank-2.5-lite"
	KnownModelIdVoyageRerankLite1 KnownModelId = "voyage/rerank-lite-1"
	KnownModelIdVoyageVoyage01 KnownModelId = "voyage/voyage-01"
	KnownModelIdVoyageVoyage02 KnownModelId = "voyage/voyage-02"
	KnownModelIdVoyageVoyage2 KnownModelId = "voyage/voyage-2"
	KnownModelIdVoyageVoyage3 KnownModelId = "voyage/voyage-3"
	KnownModelIdVoyageVoyage3Large KnownModelId = "voyage/voyage-3-large"
	KnownModelIdVoyageVoyage3Lite KnownModelId = "voyage/voyage-3-lite"
	KnownModelIdVoyageVoyage35 KnownModelId = "voyage/voyage-3.5"
	KnownModelIdVoyageVoyage35Lite KnownModelId = "voyage/voyage-3.5-lite"
	KnownModelIdVoyageVoyage4 KnownModelId = "voyage/voyage-4"
	KnownModelIdVoyageVoyage4Large KnownModelId = "voyage/voyage-4-large"
	KnownModelIdVoyageVoyage4Lite KnownModelId = "voyage/voyage-4-lite"
	KnownModelIdVoyageVoyageCode2 KnownModelId = "voyage/voyage-code-2"
	KnownModelIdVoyageVoyageCode3 KnownModelId = "voyage/voyage-code-3"
	KnownModelIdVoyageVoyageCode4 KnownModelId = "voyage/voyage-code-4"
	KnownModelIdVoyageVoyageContext3 KnownModelId = "voyage/voyage-context-3"
	KnownModelIdVoyageVoyageFinance2 KnownModelId = "voyage/voyage-finance-2"
	KnownModelIdVoyageVoyageLarge2 KnownModelId = "voyage/voyage-large-2"
	KnownModelIdVoyageVoyageLarge2Instruct KnownModelId = "voyage/voyage-large-2-instruct"
	KnownModelIdVoyageVoyageLaw2 KnownModelId = "voyage/voyage-law-2"
	KnownModelIdVoyageVoyageLite01 KnownModelId = "voyage/voyage-lite-01"
	KnownModelIdVoyageVoyageLite01Instruct KnownModelId = "voyage/voyage-lite-01-instruct"
	KnownModelIdVoyageVoyageLite02Instruct KnownModelId = "voyage/voyage-lite-02-instruct"
	KnownModelIdVoyageVoyageMultilingual2 KnownModelId = "voyage/voyage-multilingual-2"
	KnownModelIdVoyageVoyageMultimodal3 KnownModelId = "voyage/voyage-multimodal-3"
	KnownModelIdVoyageVoyageMultimodal35 KnownModelId = "voyage/voyage-multimodal-3.5"
	KnownModelIdXiaomiMimoV25 KnownModelId = "xiaomi/mimo-v2.5"
	KnownModelIdXiaomiMimoV25Asr KnownModelId = "xiaomi/mimo-v2.5-asr"
	KnownModelIdXiaomiMimoV25Pro KnownModelId = "xiaomi/mimo-v2.5-pro"
	KnownModelIdXiaomiMimoV25ProUltraspeed KnownModelId = "xiaomi/mimo-v2.5-pro-ultraspeed"
	KnownModelIdXiaomiMimoV25TtsVoicecloneFree KnownModelId = "xiaomi/mimo-v2.5-tts-voiceclone:free"
	KnownModelIdXiaomiMimoV25TtsVoicedesignFree KnownModelId = "xiaomi/mimo-v2.5-tts-voicedesign:free"
	KnownModelIdXiaomiMimoV25TtsFree KnownModelId = "xiaomi/mimo-v2.5-tts:free"
	KnownModelIdZAiAutoglmPhone9bMultilingual KnownModelId = "z-ai/autoglm-phone-9b-multilingual"
	KnownModelIdZAiGlm432b KnownModelId = "z-ai/glm-4-32b"
	KnownModelIdZAiGlm45 KnownModelId = "z-ai/glm-4.5"
	KnownModelIdZAiGlm45Air KnownModelId = "z-ai/glm-4.5-air"
	KnownModelIdZAiGlm45AirX KnownModelId = "z-ai/glm-4.5-air-x"
	KnownModelIdZAiGlm45X KnownModelId = "z-ai/glm-4.5-x"
	KnownModelIdZAiGlm45v KnownModelId = "z-ai/glm-4.5v"
	KnownModelIdZAiGlm46 KnownModelId = "z-ai/glm-4.6"
	KnownModelIdZAiGlm46v KnownModelId = "z-ai/glm-4.6v"
	KnownModelIdZAiGlm46vFlash KnownModelId = "z-ai/glm-4.6v-flash"
	KnownModelIdZAiGlm47 KnownModelId = "z-ai/glm-4.7"
	KnownModelIdZAiGlm47Flash KnownModelId = "z-ai/glm-4.7-flash"
	KnownModelIdZAiGlm47FlashHeretic KnownModelId = "z-ai/glm-4.7-flash-heretic"
	KnownModelIdZAiGlm5 KnownModelId = "z-ai/glm-5"
	KnownModelIdZAiGlm5Turbo KnownModelId = "z-ai/glm-5-turbo"
	KnownModelIdZAiGlm51 KnownModelId = "z-ai/glm-5.1"
	KnownModelIdZAiGlm52 KnownModelId = "z-ai/glm-5.2"
	KnownModelIdZAiGlm53 KnownModelId = "z-ai/glm-5.3"
	KnownModelIdZAiGlm53Flash KnownModelId = "z-ai/glm-5.3-flash"
	KnownModelIdZAiGlm5vTurbo KnownModelId = "z-ai/glm-5v-turbo"
	KnownModelIdZaiOrgGlm45Air KnownModelId = "zai-org/glm-4.5-air"
	KnownModelIdZaiGlm5 KnownModelId = "zai/glm-5"
)


type ListFilesResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Object *string `json:"object,omitempty"`
}

type ManagementKeyCollectionResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type ManagementKeyCreateRequest struct {
	CreatedBy *string `json:"created_by,omitempty"`
	Name string `json:"name"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status *string `json:"status,omitempty"`
	TeamId *string `json:"team_id,omitempty"`
}

type ManagementKeyCreateResponse struct {
	Key map[string]interface{} `json:"key"`
	Ok bool `json:"ok"`
}

type ManagementKeyDeleteResponse struct {
	Message string `json:"message"`
	Ok bool `json:"ok"`
}

type ManagementKeyDetailResponse struct {
	Key map[string]interface{} `json:"key"`
	Ok bool `json:"ok"`
}

type ManagementKeyListResponse struct {
	Keys []map[string]interface{} `json:"keys"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	Total int `json:"total"`
}

type ManagementKeyRuntime struct {
	CreatedAt string `json:"created_at"`
	CreatedBy *string `json:"created_by,omitempty"`
	DailyLimitCostNanos *int `json:"daily_limit_cost_nanos,omitempty"`
	DailyLimitRequests *int `json:"daily_limit_requests,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	Id string `json:"id"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	MonthlyLimitCostNanos *int `json:"monthly_limit_cost_nanos,omitempty"`
	MonthlyLimitRequests *int `json:"monthly_limit_requests,omitempty"`
	Name string `json:"name"`
	Prefix string `json:"prefix"`
	Scopes []string `json:"scopes"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status string `json:"status"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WeeklyLimitCostNanos *int `json:"weekly_limit_cost_nanos,omitempty"`
	WeeklyLimitRequests *int `json:"weekly_limit_requests,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type ManagementKeyRuntimeCreated struct {
	CreatedAt string `json:"created_at"`
	CreatedBy *string `json:"created_by,omitempty"`
	DailyLimitCostNanos *int `json:"daily_limit_cost_nanos,omitempty"`
	DailyLimitRequests *int `json:"daily_limit_requests,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	Id string `json:"id"`
	Key string `json:"key"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	MonthlyLimitCostNanos *int `json:"monthly_limit_cost_nanos,omitempty"`
	MonthlyLimitRequests *int `json:"monthly_limit_requests,omitempty"`
	Name string `json:"name"`
	Prefix string `json:"prefix"`
	Scopes []string `json:"scopes"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status string `json:"status"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WeeklyLimitCostNanos *int `json:"weekly_limit_cost_nanos,omitempty"`
	WeeklyLimitRequests *int `json:"weekly_limit_requests,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type ManagementKeyRuntimeCreateRequest struct {
	ExpiresAt *string `json:"expires_at,omitempty"`
	Name string `json:"name"`
	Paused *bool `json:"paused,omitempty"`
	Scopes interface{} `json:"scopes,omitempty"`
	Template *string `json:"template,omitempty"`
}

type ManagementKeyRuntimeCreateResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ManagementKeyRuntimeDeleteResponse struct {
	Deleted bool `json:"deleted"`
}

type ManagementKeyRuntimeResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ManagementKeyRuntimeUpdateRequest struct {
	DailyCostNanos *int `json:"dailyCostNanos,omitempty"`
	DailyRequests *int `json:"dailyRequests,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	MonthlyCostNanos *int `json:"monthlyCostNanos,omitempty"`
	MonthlyRequests *int `json:"monthlyRequests,omitempty"`
	Name *string `json:"name,omitempty"`
	Paused *bool `json:"paused,omitempty"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"softBlocked,omitempty"`
	Template *string `json:"template,omitempty"`
	WeeklyCostNanos *int `json:"weeklyCostNanos,omitempty"`
	WeeklyRequests *int `json:"weeklyRequests,omitempty"`
}

type ManagementKeyUpdateRequest struct {
	Name *string `json:"name,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ManagementKeyUpdateResponse struct {
	Message string `json:"message"`
	Ok bool `json:"ok"`
}

type MessageContentPart = interface{}

type Model struct {
	Aliases []string `json:"aliases"`
	Availability map[string]interface{} `json:"availability"`
	BaseModelId string `json:"base_model_id"`
	Capabilities map[string]interface{} `json:"capabilities"`
	Description string `json:"description"`
	Id string `json:"id"`
	Lifecycle map[string]interface{} `json:"lifecycle"`
	Limits map[string]interface{} `json:"limits"`
	Modalities map[string]interface{} `json:"modalities"`
	Name string `json:"name"`
	Offers []map[string]interface{} `json:"offers"`
	Organization *map[string]interface{} `json:"organization"`
	Pricing map[string]interface{} `json:"pricing"`
	Variant string `json:"variant"`
	Variants map[string]interface{} `json:"variants"`
}

type ModelAvailability struct {
	ActiveProviderCount int `json:"active_provider_count"`
	ComingSoonProviderCount int `json:"coming_soon_provider_count"`
	InactiveProviderCount int `json:"inactive_provider_count"`
	ProviderCount int `json:"provider_count"`
	Status string `json:"status"`
}

type ModelEndpointCapability struct {
	Capabilities map[string]interface{} `json:"capabilities"`
	CapabilityId string `json:"capability_id"`
	Collection string `json:"collection"`
	Effective map[string]interface{} `json:"effective"`
	Endpoint string `json:"endpoint"`
	Id string `json:"id"`
	Modalities map[string]interface{} `json:"modalities"`
	Model *string `json:"model"`
	Pricing map[string]interface{} `json:"pricing"`
	Provider map[string]interface{} `json:"provider"`
	PublicPath string `json:"public_path"`
	Routable bool `json:"routable"`
	Routing map[string]interface{} `json:"routing"`
	Status string `json:"status"`
	StatusReason string `json:"status_reason"`
}

type ModelEndpointsResponse struct {
	AvailabilityMode string `json:"availability_mode"`
	Description string `json:"description"`
	Endpoints []map[string]interface{} `json:"endpoints"`
	Id string `json:"id"`
	Modalities map[string]interface{} `json:"modalities"`
	Name string `json:"name"`
	Ok bool `json:"ok"`
	Organization *map[string]interface{} `json:"organization"`
}

type ModelId = string

type ModelLifecycle struct {
	DeprecationDate *string `json:"deprecation_date,omitempty"`
	Message *string `json:"message,omitempty"`
	ReplacementModelId *string `json:"replacement_model_id,omitempty"`
	RetirementDate *string `json:"retirement_date,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ModelProviderAvailability struct {
	ApiProviderId string `json:"api_provider_id"`
	ApiProviderName *string `json:"api_provider_name,omitempty"`
	AvailabilityReason string `json:"availability_reason"`
	AvailabilityStatus string `json:"availability_status"`
	CapabilityStatus string `json:"capability_status"`
	EffectiveFrom *string `json:"effective_from,omitempty"`
	EffectiveTo *string `json:"effective_to,omitempty"`
	Endpoints []string `json:"endpoints"`
	InputModalities *[]string `json:"input_modalities,omitempty"`
	IsActiveGateway bool `json:"is_active_gateway"`
	ModelRoutingStatus string `json:"model_routing_status"`
	OutputModalities *[]string `json:"output_modalities,omitempty"`
	Params []string `json:"params"`
	ParamsDetail *map[string]interface{} `json:"params_detail,omitempty"`
	ProviderModelSlug *string `json:"provider_model_slug,omitempty"`
	ProviderRoutingStatus string `json:"provider_routing_status"`
	ProviderStatus string `json:"provider_status"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
}

type ModerationCategories struct {
	Harassment *bool `json:"harassment,omitempty"`
	HarassmentThreatening *bool `json:"harassment/threatening,omitempty"`
	Hate *bool `json:"hate,omitempty"`
	HateThreatening *bool `json:"hate/threatening,omitempty"`
	SelfHarm *bool `json:"self-harm,omitempty"`
	SelfHarmInstructions *bool `json:"self-harm/instructions,omitempty"`
	SelfHarmIntent *bool `json:"self-harm/intent,omitempty"`
	Sexual *bool `json:"sexual,omitempty"`
	SexualMinors *bool `json:"sexual/minors,omitempty"`
	Violence *bool `json:"violence,omitempty"`
	ViolenceGraphic *bool `json:"violence/graphic,omitempty"`
}

type ModerationCategoryScores struct {
	Harassment *float64 `json:"harassment,omitempty"`
	HarassmentThreatening *float64 `json:"harassment/threatening,omitempty"`
	Hate *float64 `json:"hate,omitempty"`
	HateThreatening *float64 `json:"hate/threatening,omitempty"`
	SelfHarm *float64 `json:"self-harm,omitempty"`
	SelfHarmInstructions *float64 `json:"self-harm/instructions,omitempty"`
	SelfHarmIntent *float64 `json:"self-harm/intent,omitempty"`
	Sexual *float64 `json:"sexual,omitempty"`
	SexualMinors *float64 `json:"sexual/minors,omitempty"`
	Violence *float64 `json:"violence,omitempty"`
	ViolenceGraphic *float64 `json:"violence/graphic,omitempty"`
}

type ModerationResult struct {
	Categories *map[string]interface{} `json:"categories,omitempty"`
	CategoryScores *map[string]interface{} `json:"category_scores,omitempty"`
	Flagged *bool `json:"flagged,omitempty"`
}

type ModerationsRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Input interface{} `json:"input"`
	Meta *bool `json:"meta,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
}

type ModerationsResponse struct {
	Id *string `json:"id,omitempty"`
	Meta *map[string]interface{} `json:"meta,omitempty"`
	Model *string `json:"model,omitempty"`
	Results *[]map[string]interface{} `json:"results,omitempty"`
}

type MusicGenerateRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Duration *int `json:"duration,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	Elevenlabs *map[string]interface{} `json:"elevenlabs,omitempty"`
	Format *string `json:"format,omitempty"`
	Model string `json:"model"`
	Prompt *string `json:"prompt,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Suno *map[string]interface{} `json:"suno,omitempty"`
}

type MusicGenerateResponse struct {
	AudioBase64 *string `json:"audio_base64,omitempty"`
	AudioUrl *string `json:"audio_url,omitempty"`
	Id string `json:"id"`
	Model string `json:"model"`
	NativeResponseId *string `json:"nativeResponseId,omitempty"`
	Object string `json:"object"`
	Output *[]map[string]interface{} `json:"output,omitempty"`
	Provider string `json:"provider"`
	Result interface{} `json:"result,omitempty"`
	Status string `json:"status"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type NotImplementedResponse struct {
	Description string `json:"description"`
	Error string `json:"error"`
	StatusCode int `json:"status_code"`
}

type OAuthClient struct {
	ActiveAuthorizations *int `json:"active_authorizations,omitempty"`
	AllowedScopes *[]string `json:"allowed_scopes,omitempty"`
	ClientId string `json:"client_id"`
	ClientType string `json:"client_type"`
	CreatedAt *string `json:"created_at,omitempty"`
	Description *string `json:"description,omitempty"`
	HomepageUrl *string `json:"homepage_url,omitempty"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	LogoUrl *string `json:"logo_url,omitempty"`
	Name string `json:"name"`
	PrivacyPolicyUrl *string `json:"privacy_policy_url,omitempty"`
	RedirectUris []string `json:"redirect_uris"`
	RequestsLast30d *int `json:"requests_last_30d,omitempty"`
	Status string `json:"status"`
	TermsOfServiceUrl *string `json:"terms_of_service_url,omitempty"`
	TotalAuthorizations *int `json:"total_authorizations,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type OAuthClientCreateRequest struct {
	AllowedScopes *[]string `json:"allowed_scopes,omitempty"`
	ClientType *string `json:"client_type,omitempty"`
	Description *string `json:"description,omitempty"`
	HomepageUrl *string `json:"homepage_url,omitempty"`
	LogoUrl *string `json:"logo_url,omitempty"`
	Name string `json:"name"`
	PrivacyPolicyUrl *string `json:"privacy_policy_url,omitempty"`
	RedirectUris []string `json:"redirect_uris"`
	TermsOfServiceUrl *string `json:"terms_of_service_url,omitempty"`
}

type OAuthClientCreateResponse struct {
	ActiveAuthorizations *int `json:"active_authorizations,omitempty"`
	AllowedScopes *[]string `json:"allowed_scopes,omitempty"`
	ClientId string `json:"client_id"`
	ClientSecret *string `json:"client_secret,omitempty"`
	ClientType string `json:"client_type"`
	CreatedAt *string `json:"created_at,omitempty"`
	Description *string `json:"description,omitempty"`
	HomepageUrl *string `json:"homepage_url,omitempty"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	LogoUrl *string `json:"logo_url,omitempty"`
	Name string `json:"name"`
	PrivacyPolicyUrl *string `json:"privacy_policy_url,omitempty"`
	RedirectUris []string `json:"redirect_uris"`
	RequestsLast30d *int `json:"requests_last_30d,omitempty"`
	Status string `json:"status"`
	TermsOfServiceUrl *string `json:"terms_of_service_url,omitempty"`
	TotalAuthorizations *int `json:"total_authorizations,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type OAuthClientDeleteResponse struct {
	ClientId string `json:"client_id"`
	Message string `json:"message"`
}

type OAuthClientInput struct {
	AllowedScopes *[]string `json:"allowed_scopes,omitempty"`
	Description *string `json:"description,omitempty"`
	HomepageUrl *string `json:"homepage_url,omitempty"`
	LogoUrl *string `json:"logo_url,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyPolicyUrl *string `json:"privacy_policy_url,omitempty"`
	RedirectUris *[]string `json:"redirect_uris,omitempty"`
	TermsOfServiceUrl *string `json:"terms_of_service_url,omitempty"`
}

type OAuthClientListResponse struct {
	Data []map[string]interface{} `json:"data"`
	Pagination map[string]interface{} `json:"pagination"`
}

type OAuthClientSecretResponse struct {
	ClientId string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Message string `json:"message"`
}

type OAuthClientUpdateRequest struct {
	AllowedScopes *[]string `json:"allowed_scopes,omitempty"`
	Description *string `json:"description,omitempty"`
	HomepageUrl *string `json:"homepage_url,omitempty"`
	LogoUrl *string `json:"logo_url,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyPolicyUrl *string `json:"privacy_policy_url,omitempty"`
	RedirectUris *[]string `json:"redirect_uris,omitempty"`
	TermsOfServiceUrl *string `json:"terms_of_service_url,omitempty"`
}

type ObservabilityDestination struct {
	Configured bool `json:"configured"`
	CreatedAt *string `json:"created_at,omitempty"`
	Enabled bool `json:"enabled"`
	GroupJoin string `json:"group_join"`
	Id string `json:"id"`
	IncludeCostMetadata *bool `json:"include_cost_metadata,omitempty"`
	IncludeGenerationMetadata *bool `json:"include_generation_metadata,omitempty"`
	IncludeIdentityMetadata *bool `json:"include_identity_metadata,omitempty"`
	IncludeRequestContext *bool `json:"include_request_context,omitempty"`
	KeyFilters []map[string]interface{} `json:"key_filters"`
	Name string `json:"name"`
	PrivacyMode bool `json:"privacy_mode"`
	RuleGroups []map[string]interface{} `json:"rule_groups"`
	SamplingRate float64 `json:"sampling_rate"`
	Type string `json:"type"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type ObservabilityDestinationCreateRequest struct {
	Config map[string]interface{} `json:"config"`
	Enabled *bool `json:"enabled,omitempty"`
	GroupJoin *string `json:"group_join,omitempty"`
	IncludeCostMetadata *bool `json:"include_cost_metadata,omitempty"`
	IncludeGenerationMetadata *bool `json:"include_generation_metadata,omitempty"`
	IncludeIdentityMetadata *bool `json:"include_identity_metadata,omitempty"`
	IncludeRequestContext *bool `json:"include_request_context,omitempty"`
	KeyFilters *[]map[string]interface{} `json:"key_filters,omitempty"`
	Name string `json:"name"`
	PrivacyMode *bool `json:"privacy_mode,omitempty"`
	RuleGroups *[]map[string]interface{} `json:"rule_groups,omitempty"`
	SamplingRate *float64 `json:"sampling_rate,omitempty"`
	Type string `json:"type"`
}

type ObservabilityDestinationListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type ObservabilityDestinationPolicyInput struct {
	Enabled *bool `json:"enabled,omitempty"`
	GroupJoin *string `json:"group_join,omitempty"`
	IncludeCostMetadata *bool `json:"include_cost_metadata,omitempty"`
	IncludeGenerationMetadata *bool `json:"include_generation_metadata,omitempty"`
	IncludeIdentityMetadata *bool `json:"include_identity_metadata,omitempty"`
	IncludeRequestContext *bool `json:"include_request_context,omitempty"`
	KeyFilters *[]map[string]interface{} `json:"key_filters,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyMode *bool `json:"privacy_mode,omitempty"`
	RuleGroups *[]map[string]interface{} `json:"rule_groups,omitempty"`
	SamplingRate *float64 `json:"sampling_rate,omitempty"`
}

type ObservabilityDestinationResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ObservabilityDestinationType string

const (
	ObservabilityDestinationTypeOtelCollector ObservabilityDestinationType = "otel_collector"
	ObservabilityDestinationTypeWebhook ObservabilityDestinationType = "webhook"
)


type ObservabilityDestinationUpdateRequest struct {
	Config *map[string]interface{} `json:"config,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	GroupJoin *string `json:"group_join,omitempty"`
	IncludeCostMetadata *bool `json:"include_cost_metadata,omitempty"`
	IncludeGenerationMetadata *bool `json:"include_generation_metadata,omitempty"`
	IncludeIdentityMetadata *bool `json:"include_identity_metadata,omitempty"`
	IncludeRequestContext *bool `json:"include_request_context,omitempty"`
	KeyFilters *[]map[string]interface{} `json:"key_filters,omitempty"`
	Name *string `json:"name,omitempty"`
	PrivacyMode *bool `json:"privacy_mode,omitempty"`
	RuleGroups *[]map[string]interface{} `json:"rule_groups,omitempty"`
	SamplingRate *float64 `json:"sampling_rate,omitempty"`
}

type ObservabilityKeyFilter struct {
	KeyId string `json:"key_id"`
	Mode string `json:"mode"`
}

type ObservabilityLoggingPolicy struct {
	BillingStatus string `json:"billing_status"`
	Enabled bool `json:"enabled"`
	GraceUntil *string `json:"grace_until,omitempty"`
	IncludeProviderPayloads bool `json:"include_provider_payloads"`
	PricePerMillionUnitsNanos int `json:"price_per_million_units_nanos"`
	RetentionDays int `json:"retention_days"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type ObservabilityLoggingPolicyResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ObservabilityLoggingPolicyUpdateRequest struct {
	Enabled *bool `json:"enabled,omitempty"`
	IncludeProviderPayloads *bool `json:"include_provider_payloads,omitempty"`
	RetentionDays *int `json:"retention_days,omitempty"`
}

type ObservabilityRule struct {
	Condition string `json:"condition"`
	Field string `json:"field"`
	Value *string `json:"value,omitempty"`
}

type ObservabilityRuleGroup struct {
	Match string `json:"match"`
	Rules []map[string]interface{} `json:"rules"`
}

type OcrRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	Image string `json:"image"`
	Language *string `json:"language,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
}

type OcrResponse struct {
}

type OrganisationId string

const (
	OrganisationIdAi21 OrganisationId = "ai21"
	OrganisationIdAionLabs OrganisationId = "aion-labs"
	OrganisationIdAlibaba OrganisationId = "alibaba"
	OrganisationIdAllenai OrganisationId = "allenai"
	OrganisationIdAmazon OrganisationId = "amazon"
	OrganisationIdAnthropic OrganisationId = "anthropic"
	OrganisationIdArceeAi OrganisationId = "arcee-ai"
	OrganisationIdBaai OrganisationId = "baai"
	OrganisationIdBaidu OrganisationId = "baidu"
	OrganisationIdBlackForestLabs OrganisationId = "black-forest-labs"
	OrganisationIdBytedance OrganisationId = "bytedance"
	OrganisationIdCohere OrganisationId = "cohere"
	OrganisationIdCrofai OrganisationId = "crofai"
	OrganisationIdCursor OrganisationId = "cursor"
	OrganisationIdDeepseek OrganisationId = "deepseek"
	OrganisationIdElevenLabs OrganisationId = "eleven-labs"
	OrganisationIdEssentialAi OrganisationId = "essential-ai"
	OrganisationIdGithub OrganisationId = "github"
	OrganisationIdGoogle OrganisationId = "google"
	OrganisationIdHexgrad OrganisationId = "hexgrad"
	OrganisationIdIbm OrganisationId = "ibm"
	OrganisationIdInception OrganisationId = "inception"
	OrganisationIdInclusionai OrganisationId = "inclusionai"
	OrganisationIdInflection OrganisationId = "inflection"
	OrganisationIdJetbrains OrganisationId = "jetbrains"
	OrganisationIdKwaipilot OrganisationId = "kwaipilot"
	OrganisationIdLg OrganisationId = "lg"
	OrganisationIdLightricks OrganisationId = "lightricks"
	OrganisationIdLiquidAi OrganisationId = "liquid-ai"
	OrganisationIdMeituan OrganisationId = "meituan"
	OrganisationIdMeta OrganisationId = "meta"
	OrganisationIdMicrosoft OrganisationId = "microsoft"
	OrganisationIdMindai OrganisationId = "mindai"
	OrganisationIdMinimax OrganisationId = "minimax"
	OrganisationIdMistral OrganisationId = "mistral"
	OrganisationIdMoonshotai OrganisationId = "moonshotai"
	OrganisationIdMorph OrganisationId = "morph"
	OrganisationIdNaverHyperclova OrganisationId = "naver-hyperclova"
	OrganisationIdNexAgi OrganisationId = "nex-agi"
	OrganisationIdNous OrganisationId = "nous"
	OrganisationIdNvidia OrganisationId = "nvidia"
	OrganisationIdOpenai OrganisationId = "openai"
	OrganisationIdPerplexity OrganisationId = "perplexity"
	OrganisationIdPoe OrganisationId = "poe"
	OrganisationIdPoolside OrganisationId = "poolside"
	OrganisationIdPrimeIntellect OrganisationId = "prime-intellect"
	OrganisationIdQwen OrganisationId = "qwen"
	OrganisationIdReka OrganisationId = "reka"
	OrganisationIdRelace OrganisationId = "relace"
	OrganisationIdRunway OrganisationId = "runway"
	OrganisationIdSakana OrganisationId = "sakana"
	OrganisationIdSourceful OrganisationId = "sourceful"
	OrganisationIdSpacexAi OrganisationId = "spacex-ai"
	OrganisationIdStabilityAi OrganisationId = "stability-ai"
	OrganisationIdStealth OrganisationId = "stealth"
	OrganisationIdStepfun OrganisationId = "stepfun"
	OrganisationIdSuno OrganisationId = "suno"
	OrganisationIdTencent OrganisationId = "tencent"
	OrganisationIdThinkingMachines OrganisationId = "thinking-machines"
	OrganisationIdUpstage OrganisationId = "upstage"
	OrganisationIdVenice OrganisationId = "venice"
	OrganisationIdVercel OrganisationId = "vercel"
	OrganisationIdVoyage OrganisationId = "voyage"
	OrganisationIdWindsurf OrganisationId = "windsurf"
	OrganisationIdXiaomi OrganisationId = "xiaomi"
	OrganisationIdZAi OrganisationId = "z-ai"
)


type OrganisationIdList = []string

type ParseBlock = interface{}

type ParseBoundingBox struct {
	BottomRightX float64 `json:"bottom_right_x"`
	BottomRightY float64 `json:"bottom_right_y"`
	TopLeftX float64 `json:"top_left_x"`
	TopLeftY float64 `json:"top_left_y"`
}

type ParseImage struct {
	BoundingBox map[string]interface{} `json:"bounding_box"`
	BoundingBoxNormalized map[string]interface{} `json:"bounding_box_normalized"`
	Category string `json:"category"`
	Description string `json:"description"`
	Id string `json:"id"`
}

type ParsePage = interface{}

type ParseRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Document map[string]interface{} `json:"document"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	Model string `json:"model"`
	OutputFormat *string `json:"output_format,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Routing *map[string]interface{} `json:"routing,omitempty"`
}

type ParseResponse struct {
	Id string `json:"id"`
	Meta *map[string]interface{} `json:"meta,omitempty"`
	Model string `json:"model"`
	Object string `json:"object"`
	Pages []interface{} `json:"pages"`
	Provider string `json:"provider"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type Preset struct {
	ActiveVersionId *string `json:"active_version_id,omitempty"`
	Config map[string]interface{} `json:"config"`
	CreatedAt *string `json:"created_at,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	Description *string `json:"description,omitempty"`
	Id string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	SourcePresetId *string `json:"source_preset_id,omitempty"`
	SourcePresetVersionId *string `json:"source_preset_version_id,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	UpstreamVersionId *string `json:"upstream_version_id,omitempty"`
	VersioningMethod string `json:"versioning_method"`
	Visibility string `json:"visibility"`
	WorkspaceId string `json:"workspace_id"`
}

type PresetConfig struct {
}

type PresetCreateRequest struct {
	Config *map[string]interface{} `json:"config,omitempty"`
	Description *string `json:"description,omitempty"`
	Name string `json:"name"`
	Slug *string `json:"slug,omitempty"`
	VersioningMethod *string `json:"versioning_method,omitempty"`
	Visibility *string `json:"visibility,omitempty"`
}

type PresetCreateResponse struct {
	CanonicalModel string `json:"canonical_model"`
	Data map[string]interface{} `json:"data"`
}

type PresetForkRequest struct {
	SourceVersionId *string `json:"source_version_id,omitempty"`
}

type PresetListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type PresetPublisher struct {
	Handle *string `json:"handle"`
	WorkspaceId string `json:"workspace_id"`
}

type PresetPublisherResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PresetPublisherUpdateRequest struct {
	Handle string `json:"handle"`
}

type PresetResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PresetTestRun struct {
	BaselinePresetId *string `json:"baseline_preset_id"`
	CompletedAt *string `json:"completed_at"`
	Config map[string]interface{} `json:"config"`
	CreatedAt string `json:"created_at"`
	CreatedByUserId *string `json:"created_by_user_id"`
	DatasetName *string `json:"dataset_name"`
	Description *string `json:"description"`
	Id string `json:"id"`
	Name *string `json:"name"`
	PresetId *string `json:"preset_id"`
	StartedAt *string `json:"started_at"`
	Status string `json:"status"`
	Summary map[string]interface{} `json:"summary"`
	UpdatedAt string `json:"updated_at"`
	WorkspaceId string `json:"workspace_id"`
}

type PresetTestRunCreateRequest struct {
	BaselinePresetId *string `json:"baseline_preset_id,omitempty"`
	CompletedAt *string `json:"completed_at,omitempty"`
	Config *map[string]interface{} `json:"config,omitempty"`
	DatasetName *string `json:"dataset_name,omitempty"`
	Description *string `json:"description,omitempty"`
	Name *string `json:"name,omitempty"`
	PresetId *string `json:"preset_id,omitempty"`
	StartedAt *string `json:"started_at,omitempty"`
	Status *string `json:"status,omitempty"`
	Summary *map[string]interface{} `json:"summary,omitempty"`
}

type PresetTestRunDetailResponse struct {
	Data map[string]interface{} `json:"data"`
	FeedbackSummary *map[string]interface{} `json:"feedback_summary"`
}

type PresetTestRunListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type PresetTestRunResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PresetTestRunUpdateRequest struct {
	CompletedAt *string `json:"completed_at,omitempty"`
	Description *string `json:"description,omitempty"`
	Name *string `json:"name,omitempty"`
	StartedAt *string `json:"started_at,omitempty"`
	Status *string `json:"status,omitempty"`
	Summary *map[string]interface{} `json:"summary,omitempty"`
}

type PresetUpdateRequest struct {
	Config *map[string]interface{} `json:"config,omitempty"`
	Description *string `json:"description,omitempty"`
	Name *string `json:"name,omitempty"`
	ReplaceConfig *bool `json:"replace_config,omitempty"`
	Slug *string `json:"slug,omitempty"`
	VersioningMethod *string `json:"versioning_method,omitempty"`
	Visibility *string `json:"visibility,omitempty"`
}

type PresetUpstreamApplyRequest struct {
	VersionId string `json:"version_id"`
}

type PresetUpstreamApplyResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PresetVersion struct {
	Config map[string]interface{} `json:"config"`
	CreatedAt string `json:"created_at"`
	CreatedBy string `json:"created_by"`
	Description *string `json:"description,omitempty"`
	Id string `json:"id"`
	Name string `json:"name"`
	PresetId string `json:"preset_id"`
	ReleaseNotes *string `json:"release_notes,omitempty"`
	Slug string `json:"slug"`
	VersionLabel string `json:"version_label"`
	VersionNumber int `json:"version_number"`
	VersioningMethod string `json:"versioning_method"`
	Visibility string `json:"visibility"`
}

type PresetVersioningMethod string

const (
	PresetVersioningMethodSequential PresetVersioningMethod = "sequential"
	PresetVersioningMethodSemver PresetVersioningMethod = "semver"
	PresetVersioningMethodDate PresetVersioningMethod = "date"
)


type PresetVersionListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type PresetVersionPublishRequest struct {
	ReleaseNotes *string `json:"release_notes,omitempty"`
	VersionLabel *string `json:"version_label,omitempty"`
}

type PresetVersionResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PresetVisibility string

const (
	PresetVisibilityPrivate PresetVisibility = "private"
	PresetVisibilityTeam PresetVisibility = "team"
	PresetVisibilityPublic PresetVisibility = "public"
)


type PrivateModel struct {
	BaseUrl string `json:"base_url"`
	CatalogModelId *string `json:"catalog_model_id,omitempty"`
	ContextLength *int `json:"context_length,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	CredentialPrefix *string `json:"credential_prefix,omitempty"`
	CredentialSuffix *string `json:"credential_suffix,omitempty"`
	CustomProviderName *string `json:"custom_provider_name,omitempty"`
	CustomProviderUrl *string `json:"custom_provider_url,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled bool `json:"enabled"`
	HostProviderId *string `json:"host_provider_id,omitempty"`
	Id string `json:"id"`
	InputModalities *[]string `json:"input_modalities,omitempty"`
	LocalSlug *string `json:"local_slug,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	ModelId string `json:"model_id"`
	Name string `json:"name"`
	OutputModalities *[]string `json:"output_modalities,omitempty"`
	RoutingPolicy *string `json:"routing_policy,omitempty"`
	SupportsResponses bool `json:"supports_responses"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	UpstreamModelId string `json:"upstream_model_id"`
	WorkspaceId string `json:"workspace_id"`
}

type PrivateModelCreateRequest struct {
	BaseUrl string `json:"base_url"`
	ContextLength *int `json:"context_length,omitempty"`
	Credential string `json:"credential"`
	CustomProviderName *string `json:"custom_provider_name,omitempty"`
	CustomProviderUrl *string `json:"custom_provider_url,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	HostProviderId *string `json:"host_provider_id,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	ModelReference string `json:"model_reference"`
	Name string `json:"name"`
	RoutingPolicy *string `json:"routing_policy,omitempty"`
	SupportsResponses *bool `json:"supports_responses,omitempty"`
	UpstreamModelId string `json:"upstream_model_id"`
}

type PrivateModelDeleteResponse struct {
	Deleted bool `json:"deleted"`
}

type PrivateModelListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type PrivateModelResponse struct {
	Data map[string]interface{} `json:"data"`
}

type PrivateModelUpdateRequest struct {
	BaseUrl *string `json:"base_url,omitempty"`
	ContextLength *int `json:"context_length,omitempty"`
	Credential *string `json:"credential,omitempty"`
	CustomProviderName *string `json:"custom_provider_name,omitempty"`
	CustomProviderUrl *string `json:"custom_provider_url,omitempty"`
	Description *string `json:"description,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	HostProviderId *string `json:"host_provider_id,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	ModelReference *string `json:"model_reference,omitempty"`
	Name *string `json:"name,omitempty"`
	RoutingPolicy *string `json:"routing_policy,omitempty"`
	SupportsResponses *bool `json:"supports_responses,omitempty"`
	UpstreamModelId *string `json:"upstream_model_id,omitempty"`
}

type Provider struct {
	ApiProviderId *string `json:"api_provider_id,omitempty"`
	ApiProviderName *string `json:"api_provider_name,omitempty"`
	CountryCode *string `json:"country_code,omitempty"`
	Description *string `json:"description,omitempty"`
	Link *string `json:"link,omitempty"`
}

type ProviderCredential struct {
	AllowedApiKeyIds *[]string `json:"allowed_api_key_ids,omitempty"`
	AllowedModelSlugs *[]string `json:"allowed_model_slugs,omitempty"`
	AlwaysUse *bool `json:"always_use,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	Disabled bool `json:"disabled"`
	Enabled bool `json:"enabled"`
	ErrorMessage *string `json:"error_message,omitempty"`
	Id string `json:"id"`
	IsFallback bool `json:"is_fallback"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	LastVerifiedAt *string `json:"last_verified_at,omitempty"`
	Name string `json:"name"`
	Prefix *string `json:"prefix,omitempty"`
	ProviderId string `json:"provider_id"`
	RoutingMode string `json:"routing_mode"`
	SortOrder int `json:"sort_order"`
	Suffix *string `json:"suffix,omitempty"`
	VerificationStatus *string `json:"verification_status,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type ProviderCredentialCreateRequest struct {
	AllowedApiKeyIds *[]string `json:"allowed_api_key_ids,omitempty"`
	AllowedModels *[]string `json:"allowed_models,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Key string `json:"key"`
	Name string `json:"name"`
	Provider string `json:"provider"`
	RoutingMode *string `json:"routing_mode,omitempty"`
}

type ProviderCredentialDeleteResponse struct {
	Deleted bool `json:"deleted"`
}

type ProviderCredentialListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type ProviderCredentialReorderRequest struct {
	KeyIds []string `json:"key_ids"`
	Provider string `json:"provider"`
	RoutingMode string `json:"routing_mode"`
}

type ProviderCredentialReorderResponse struct {
	Reordered bool `json:"reordered"`
}

type ProviderCredentialResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ProviderCredentialRoutingMode string

const (
	ProviderCredentialRoutingModePriority ProviderCredentialRoutingMode = "priority"
	ProviderCredentialRoutingModeFallback ProviderCredentialRoutingMode = "fallback"
)


type ProviderCredentialUpdateRequest struct {
	AllowedApiKeyIds *[]string `json:"allowed_api_key_ids,omitempty"`
	AllowedModels *[]string `json:"allowed_models,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	Key *string `json:"key,omitempty"`
	Name *string `json:"name,omitempty"`
	RoutingMode *string `json:"routing_mode,omitempty"`
}

type ProviderOptions struct {
	Anthropic *map[string]interface{} `json:"anthropic,omitempty"`
	Google *map[string]interface{} `json:"google,omitempty"`
	Openai *map[string]interface{} `json:"openai,omitempty"`
}

type ProviderRoutingOptions struct {
	AllowFallbacks *bool `json:"allow_fallbacks,omitempty"`
	DataCollection *string `json:"data_collection,omitempty"`
	EnforceDistillableText *bool `json:"enforce_distillable_text,omitempty"`
	Ignore *[]string `json:"ignore,omitempty"`
	IncludeAlpha *bool `json:"include_alpha,omitempty"`
	MaxPrice *map[string]interface{} `json:"max_price,omitempty"`
	Only *[]string `json:"only,omitempty"`
	Order *[]string `json:"order,omitempty"`
	PreferredMaxLatency interface{} `json:"preferred_max_latency,omitempty"`
	PreferredMinThroughput interface{} `json:"preferred_min_throughput,omitempty"`
	Quantizations *[]string `json:"quantizations,omitempty"`
	RequireParameters *bool `json:"require_parameters,omitempty"`
	RequireZeroDataRetention *bool `json:"require_zero_data_retention,omitempty"`
	RequiredDataRegion *string `json:"required_data_region,omitempty"`
	RequiredExecutionRegion *string `json:"required_execution_region,omitempty"`
	Sort interface{} `json:"sort,omitempty"`
	Zdr *bool `json:"zdr,omitempty"`
}

type ProvisioningKey struct {
	CreatedAt *string `json:"created_at,omitempty"`
	Id *string `json:"id,omitempty"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	Name *string `json:"name,omitempty"`
	Prefix *string `json:"prefix,omitempty"`
	Scopes *string `json:"scopes,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ProvisioningKeyDetail struct {
	CreatedAt *string `json:"created_at,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	Id *string `json:"id,omitempty"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	Name *string `json:"name,omitempty"`
	Prefix *string `json:"prefix,omitempty"`
	Scopes *string `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status *string `json:"status,omitempty"`
	TeamId *string `json:"team_id,omitempty"`
}

type ProvisioningKeyWithValue struct {
	CreatedAt *string `json:"created_at,omitempty"`
	Id *string `json:"id,omitempty"`
	Key *string `json:"key,omitempty"`
	Name *string `json:"name,omitempty"`
	Prefix *string `json:"prefix,omitempty"`
	Scopes *string `json:"scopes,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ReasoningConfig struct {
	Effort *string `json:"effort,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	Mode *string `json:"mode,omitempty"`
	Summary *string `json:"summary,omitempty"`
}

type RerankDocument = interface{}

type RerankRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Documents interface{} `json:"documents"`
	MaxChunksPerDoc *int `json:"max_chunks_per_doc,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Query string `json:"query"`
	RankFields *[]string `json:"rank_fields,omitempty"`
	ReturnDocuments *bool `json:"return_documents,omitempty"`
	TopK *int `json:"top_k,omitempty"`
	TopN *int `json:"top_n,omitempty"`
	User *string `json:"user,omitempty"`
}

type RerankResponse struct {
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	NativeResponseId *string `json:"nativeResponseId,omitempty"`
	Object *string `json:"object,omitempty"`
	Results *[]map[string]interface{} `json:"results,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type RerankResult struct {
	Document interface{} `json:"document,omitempty"`
	Index *int `json:"index,omitempty"`
	RelevanceScore *float64 `json:"relevance_score,omitempty"`
}

type ResponsesInputItem struct {
	Content interface{} `json:"content,omitempty"`
	Role *string `json:"role,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ResponsesOutputAudioPart struct {
	AudioUrl *map[string]interface{} `json:"audio_url,omitempty"`
	B64Json *string `json:"b64_json,omitempty"`
	Format *string `json:"format,omitempty"`
	MimeType *string `json:"mime_type,omitempty"`
	Type string `json:"type"`
}

type ResponsesOutputContentPart = interface{}

type ResponsesOutputImagePart struct {
	B64Json *string `json:"b64_json,omitempty"`
	ImageUrl *map[string]interface{} `json:"image_url,omitempty"`
	MimeType *string `json:"mime_type,omitempty"`
	Type string `json:"type"`
}

type ResponsesOutputItem struct {
	Arguments *string `json:"arguments,omitempty"`
	CallId *string `json:"call_id,omitempty"`
	Content *[]interface{} `json:"content,omitempty"`
	Name *string `json:"name,omitempty"`
	Role *string `json:"role,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ResponsesOutputTextPart struct {
	Annotations *[]map[string]interface{} `json:"annotations,omitempty"`
	Text string `json:"text"`
	Type string `json:"type"`
}

type ResponsesRequest struct {
	Background *bool `json:"background,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	ImageConfig *map[string]interface{} `json:"image_config,omitempty"`
	Include *[]string `json:"include,omitempty"`
	Input interface{} `json:"input"`
	Instructions *string `json:"instructions,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Modalities *[]string `json:"modalities,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PreviousResponseId *string `json:"previous_response_id,omitempty"`
	PromptCacheKey *string `json:"prompt_cache_key,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	SafetyIdentifier *string `json:"safety_identifier,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Store *bool `json:"store,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Text *map[string]interface{} `json:"text,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]interface{} `json:"tools,omitempty"`
	TopP *float64 `json:"top_p,omitempty"`
	Truncation *string `json:"truncation,omitempty"`
	Usage *bool `json:"usage,omitempty"`
	User *string `json:"user,omitempty"`
}

type ResponsesResponse struct {
	Content *[]map[string]interface{} `json:"content,omitempty"`
	CostCents *int `json:"cost_cents,omitempty"`
	CostNanos *float64 `json:"cost_nanos,omitempty"`
	Created *int `json:"created,omitempty"`
	Currency *string `json:"currency,omitempty"`
	FinishReason *string `json:"finish_reason,omitempty"`
	Id *string `json:"id,omitempty"`
	Meta *map[string]interface{} `json:"meta,omitempty"`
	Model *string `json:"model,omitempty"`
	NativeResponseId *string `json:"nativeResponseId,omitempty"`
	Object *string `json:"object,omitempty"`
	Output *[]map[string]interface{} `json:"output,omitempty"`
	OutputItems *[]map[string]interface{} `json:"output_items,omitempty"`
	PricingLines *[]map[string]interface{} `json:"pricing_lines,omitempty"`
	Provider *string `json:"provider,omitempty"`
	ProviderId *string `json:"provider_id,omitempty"`
	Role *string `json:"role,omitempty"`
	Status *string `json:"status,omitempty"`
	StopReason *string `json:"stop_reason,omitempty"`
	Type *string `json:"type,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type SearchModelsToolDefinition struct {
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type ServerToolUsage struct {
	AdvisorRequests *int `json:"advisor_requests,omitempty"`
	ApplyPatchRequests *int `json:"apply_patch_requests,omitempty"`
	DatetimeRequests *int `json:"datetime_requests,omitempty"`
	FusionRequests *int `json:"fusion_requests,omitempty"`
	ImageGenerationRequests *int `json:"image_generation_requests,omitempty"`
	SearchModelsRequests *int `json:"search_models_requests,omitempty"`
	SubagentRequests *int `json:"subagent_requests,omitempty"`
	WebFetchRequests *int `json:"web_fetch_requests,omitempty"`
	WebSearchRequests *int `json:"web_search_requests,omitempty"`
}

type SubagentToolDefinition struct {
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type SupportedParameterDetails struct {
}

type TextContentPart struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

type TextGenerateTool = interface{}

type TextModerationInput struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

type TextToolChoice = interface{}

type ToolCall struct {
	Function map[string]interface{} `json:"function"`
	Id string `json:"id"`
	Type string `json:"type"`
}

type ToolCallContentPart struct {
	Function map[string]interface{} `json:"function"`
	Id string `json:"id"`
	Type string `json:"type"`
}

type UpdatedResponse struct {
	Data map[string]interface{} `json:"data"`
}

type Usage struct {
	CompletionTokens *int `json:"completion_tokens,omitempty"`
	PromptTokens *int `json:"prompt_tokens,omitempty"`
	ServerToolUse *map[string]interface{} `json:"server_tool_use,omitempty"`
	TotalTokens *int `json:"total_tokens,omitempty"`
}

type VideoBillingSummary struct {
	Billable *bool `json:"billable,omitempty"`
	BilledAt *string `json:"billed_at,omitempty"`
	ChargeReason *string `json:"charge_reason,omitempty"`
	Charged *bool `json:"charged,omitempty"`
	Currency *string `json:"currency,omitempty"`
	EstimatedNanos *int `json:"estimated_nanos,omitempty"`
	EstimatedProviderCost *string `json:"estimated_provider_cost,omitempty"`
	EstimatedUserCost *string `json:"estimated_user_cost,omitempty"`
	ReservationId *string `json:"reservation_id,omitempty"`
	ReservationStatus *string `json:"reservation_status,omitempty"`
	ReservedNanos *int `json:"reserved_nanos,omitempty"`
	SettledProviderCost *string `json:"settled_provider_cost,omitempty"`
	SettledUserCost *string `json:"settled_user_cost,omitempty"`
	State *string `json:"state,omitempty"`
	TotalNanos *int `json:"total_nanos,omitempty"`
}

type VideoContentPart struct {
	Type string `json:"type"`
	VideoUrl string `json:"video_url"`
}

type VideoDeleteResponse struct {
	Deleted *bool `json:"deleted,omitempty"`
	Id *string `json:"id,omitempty"`
	Object *string `json:"object,omitempty"`
}

type VideoGenerationRequest struct {
	AspectRatio *string `json:"aspect_ratio,omitempty"`
	CompressionQuality *int `json:"compression_quality,omitempty"`
	Duration *int `json:"duration,omitempty"`
	EnhancePrompt *bool `json:"enhance_prompt,omitempty"`
	FrameImages *[]map[string]interface{} `json:"frame_images,omitempty"`
	GenerateAudio *bool `json:"generate_audio,omitempty"`
	InputAudioDuration *float64 `json:"input_audio_duration,omitempty"`
	InputReferences *[]interface{} `json:"input_references,omitempty"`
	InputVideoDuration *float64 `json:"input_video_duration,omitempty"`
	Model string `json:"model"`
	NegativePrompt *string `json:"negative_prompt,omitempty"`
	Output *map[string]interface{} `json:"output,omitempty"`
	PersonGeneration *string `json:"person_generation,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	ProviderParams *map[string]interface{} `json:"provider_params,omitempty"`
	ResizeMode *string `json:"resize_mode,omitempty"`
	Resolution *string `json:"resolution,omitempty"`
	SampleCount *int `json:"sample_count,omitempty"`
	Seed *int `json:"seed,omitempty"`
	Size *string `json:"size,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
}

type VideoGenerationResponse struct {
	Asset *map[string]interface{} `json:"asset,omitempty"`
	Audio *bool `json:"audio,omitempty"`
	Billing *map[string]interface{} `json:"billing,omitempty"`
	CancelUrl *string `json:"cancel_url,omitempty"`
	CompletedAt *interface{} `json:"completed_at,omitempty"`
	ContentUrl *string `json:"content_url,omitempty"`
	CreatedAt interface{} `json:"created_at,omitempty"`
	DownloadUrl *string `json:"download_url,omitempty"`
	Error *interface{} `json:"error,omitempty"`
	ExpiresAt *int `json:"expires_at,omitempty"`
	GenerationId *string `json:"generation_id,omitempty"`
	Id *string `json:"id,omitempty"`
	LastWebhookDispatchedAt *string `json:"last_webhook_dispatched_at,omitempty"`
	LastWebhookProgress *float64 `json:"last_webhook_progress,omitempty"`
	LastWebhookProgressAt *string `json:"last_webhook_progress_at,omitempty"`
	LifecycleStatus *string `json:"lifecycle_status,omitempty"`
	Model *string `json:"model,omitempty"`
	NativeVideoId *string `json:"native_video_id,omitempty"`
	NextWebhookRetryAt *string `json:"next_webhook_retry_at,omitempty"`
	Object *string `json:"object,omitempty"`
	OutputAccess *string `json:"output_access,omitempty"`
	Outputs *[]map[string]interface{} `json:"outputs,omitempty"`
	PollAfterSeconds *int `json:"poll_after_seconds,omitempty"`
	PollingUrl *string `json:"polling_url,omitempty"`
	Progress *int `json:"progress,omitempty"`
	ProgressSource *string `json:"progress_source,omitempty"`
	Provider *string `json:"provider,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	Seconds *float64 `json:"seconds,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Size *string `json:"size,omitempty"`
	StartedAt *interface{} `json:"started_at,omitempty"`
	Status *string `json:"status,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
	WebsocketUrl *string `json:"websocket_url,omitempty"`
}

type VideoInputReference = interface{}

type VideoListResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	FirstId *string `json:"first_id,omitempty"`
	HasMore *bool `json:"has_more,omitempty"`
	LastId *string `json:"last_id,omitempty"`
	Object *string `json:"object,omitempty"`
}

type VideoModelCapability struct {
	InputTypes *[]string `json:"input_types,omitempty"`
	Model *string `json:"model,omitempty"`
	Name *string `json:"name,omitempty"`
	OutputTypes *[]string `json:"output_types,omitempty"`
	Pricing *map[string]interface{} `json:"pricing,omitempty"`
	Providers *[]map[string]interface{} `json:"providers,omitempty"`
	Status *string `json:"status,omitempty"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
	SupportedParams *[]string `json:"supported_params,omitempty"`
	SupportedParamsDetail *map[string]interface{} `json:"supported_params_detail,omitempty"`
}

type VideoModelProviderCapability struct {
	Id *string `json:"id,omitempty"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
	SupportedParams *[]string `json:"supported_params,omitempty"`
	SupportedParamsDetail *map[string]interface{} `json:"supported_params_detail,omitempty"`
}

type VideoModelsResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Object *string `json:"object,omitempty"`
}

type VideoOutput struct {
	BytesAvailable *bool `json:"bytes_available,omitempty"`
	ContentUrl *string `json:"content_url,omitempty"`
	DownloadUrl *string `json:"download_url,omitempty"`
	ExpiresAt *int `json:"expires_at,omitempty"`
	Index *int `json:"index,omitempty"`
	MimeType *string `json:"mime_type,omitempty"`
}

type VideoOutputConfig struct {
	Access *string `json:"access,omitempty"`
}

type WebhookEndpoint struct {
	CreatedAt *string `json:"createdAt,omitempty"`
	CreatedBy *string `json:"createdBy,omitempty"`
	DeletedAt *string `json:"deletedAt,omitempty"`
	Events []string `json:"events"`
	HasSecret bool `json:"hasSecret"`
	Id string `json:"id"`
	Name string `json:"name"`
	Status string `json:"status"`
	UpdatedAt *string `json:"updatedAt,omitempty"`
	Url string `json:"url"`
	WorkspaceId string `json:"workspaceId"`
}

type WebhookEndpointCreateRequest struct {
	Events *[]string `json:"events,omitempty"`
	Name *string `json:"name,omitempty"`
	Url string `json:"url"`
}

type WebhookEndpointDeleteResponse struct {
	Deleted bool `json:"deleted"`
	Id string `json:"id"`
	Object string `json:"object"`
}

type WebhookEndpointInput struct {
	Events *[]string `json:"events,omitempty"`
	Name *string `json:"name,omitempty"`
	Url *string `json:"url,omitempty"`
}

type WebhookEndpointListResponse struct {
	Data []map[string]interface{} `json:"data"`
	Object string `json:"object"`
}

type WebhookEndpointSecretResponse struct {
	CreatedAt *string `json:"createdAt,omitempty"`
	CreatedBy *string `json:"createdBy,omitempty"`
	DeletedAt *string `json:"deletedAt,omitempty"`
	Events []string `json:"events"`
	HasSecret bool `json:"hasSecret"`
	Id string `json:"id"`
	Name string `json:"name"`
	SigningSecret string `json:"signing_secret"`
	Status string `json:"status"`
	UpdatedAt *string `json:"updatedAt,omitempty"`
	Url string `json:"url"`
	WorkspaceId string `json:"workspaceId"`
}

type WebhookEndpointUpdateRequest struct {
	Events *[]string `json:"events,omitempty"`
	Name *string `json:"name,omitempty"`
	Status *string `json:"status,omitempty"`
	Url *string `json:"url,omitempty"`
}

type Workspace struct {
	CreatedAt *string `json:"created_at"`
	CreatedBy *string `json:"created_by"`
	Id string `json:"id"`
	Name *string `json:"name"`
	Slug *string `json:"slug,omitempty"`
	UpdatedAt *string `json:"updated_at"`
}

type WorkspaceActivityEntry struct {
	CostCents float64 `json:"cost_cents"`
	Endpoint *string `json:"endpoint"`
	LatencyMs *int `json:"latency_ms"`
	Model *string `json:"model"`
	Provider *string `json:"provider"`
	RequestId *string `json:"request_id"`
	Timestamp *string `json:"timestamp"`
	Usage *map[string]interface{} `json:"usage"`
}

type WorkspaceActivityResponse struct {
	Activity []map[string]interface{} `json:"activity"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	PeriodDays int `json:"period_days"`
	Total int `json:"total"`
	TotalCostCents float64 `json:"total_cost_cents"`
}

type WorkspaceApp struct {
	AppKey string `json:"app_key"`
	Category *string `json:"category"`
	CreatedAt *string `json:"created_at"`
	DocsUrl *string `json:"docs_url"`
	Id string `json:"id"`
	ImageUrl *string `json:"image_url"`
	IsActive bool `json:"is_active"`
	IsManaged bool `json:"is_managed"`
	IsPublic bool `json:"is_public"`
	LastSeen *string `json:"last_seen"`
	Title string `json:"title"`
	Url *string `json:"url"`
}

type WorkspaceAppListResponse struct {
	Data []map[string]interface{} `json:"data"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	TotalCount int `json:"total_count"`
}

type WorkspaceAppMergeRequest struct {
	TargetAppId string `json:"target_app_id"`
}

type WorkspaceAppMergeResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceAppResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceAppUpdateRequest struct {
	Category *string `json:"category,omitempty"`
	DocsUrl *string `json:"docs_url,omitempty"`
	ImageUrl *string `json:"image_url,omitempty"`
	IsActive *bool `json:"is_active,omitempty"`
	IsPublic *bool `json:"is_public,omitempty"`
	Title *string `json:"title,omitempty"`
	Url *string `json:"url,omitempty"`
}

type WorkspaceAssignableRole string

const (
	WorkspaceAssignableRoleAdmin WorkspaceAssignableRole = "admin"
	WorkspaceAssignableRoleMember WorkspaceAssignableRole = "member"
)


type WorkspaceAuditEvent struct {
	Action string `json:"action"`
	Actor *map[string]interface{} `json:"actor,omitempty"`
	ActorUserId *string `json:"actor_user_id,omitempty"`
	CreatedAt string `json:"created_at"`
	Id string `json:"id"`
	Metadata map[string]interface{} `json:"metadata"`
	RequestId *string `json:"request_id,omitempty"`
	TargetId string `json:"target_id"`
	TargetName *string `json:"target_name,omitempty"`
	TargetType string `json:"target_type"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceAuditEventActor struct {
	DisplayName *string `json:"display_name,omitempty"`
	Email *string `json:"email,omitempty"`
}

type WorkspaceAuditEventLimits struct {
	DailyCostNanos *int `json:"dailyCostNanos,omitempty"`
	DailyRequests *int `json:"dailyRequests,omitempty"`
	MonthlyCostNanos *int `json:"monthlyCostNanos,omitempty"`
	MonthlyRequests *int `json:"monthlyRequests,omitempty"`
	SoftBlocked *bool `json:"softBlocked,omitempty"`
	WeeklyCostNanos *int `json:"weeklyCostNanos,omitempty"`
	WeeklyRequests *int `json:"weeklyRequests,omitempty"`
}

type WorkspaceAuditEventListResponse struct {
	Data []map[string]interface{} `json:"data"`
	HasMore bool `json:"has_more"`
	NextCursor *string `json:"next_cursor,omitempty"`
}

type WorkspaceAuditEventMetadata struct {
	AccessTemplate *string `json:"accessTemplate,omitempty"`
	ChangedFields *[]string `json:"changedFields,omitempty"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
	Limits *map[string]interface{} `json:"limits,omitempty"`
	Prefix *string `json:"prefix,omitempty"`
	PreviousKeyExpiresAt *string `json:"previousKeyExpiresAt,omitempty"`
	ReplacementKeyId *string `json:"replacementKeyId,omitempty"`
	ReplacementKeyName *string `json:"replacementKeyName,omitempty"`
	Status *string `json:"status,omitempty"`
}

type WorkspaceAutoTopUpSettings struct {
	AmountNanos int `json:"amount_nanos"`
	BalanceThresholdNanos int `json:"balance_threshold_nanos"`
	Enabled bool `json:"enabled"`
	PaymentMethodId *string `json:"payment_method_id"`
}

type WorkspaceAutoTopUpUpdate struct {
	AmountNanos *int `json:"amount_nanos,omitempty"`
	BalanceThresholdNanos *int `json:"balance_threshold_nanos,omitempty"`
	Enabled bool `json:"enabled"`
	PaymentMethodId *string `json:"payment_method_id,omitempty"`
}

type WorkspaceBudget struct {
	CreatedAt string `json:"created_at"`
	CreatedBy *string `json:"created_by,omitempty"`
	Exceeded bool `json:"exceeded"`
	Id string `json:"id"`
	Interval string `json:"interval"`
	Limit float64 `json:"limit"`
	LimitNanos int `json:"limit_nanos"`
	Remaining float64 `json:"remaining"`
	RemainingNanos int `json:"remaining_nanos"`
	ResetAt *string `json:"reset_at,omitempty"`
	UpdatedAt string `json:"updated_at"`
	Usage float64 `json:"usage"`
	UsageNanos int `json:"usage_nanos"`
	WindowStart *string `json:"window_start,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceBudgetDeleteResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceBudgetInput struct {
	Interval string `json:"interval"`
	Limit float64 `json:"limit"`
}

type WorkspaceBudgetInterval string

const (
	WorkspaceBudgetIntervalDaily WorkspaceBudgetInterval = "daily"
	WorkspaceBudgetIntervalWeekly WorkspaceBudgetInterval = "weekly"
	WorkspaceBudgetIntervalMonthly WorkspaceBudgetInterval = "monthly"
	WorkspaceBudgetIntervalLifetime WorkspaceBudgetInterval = "lifetime"
)


type WorkspaceBudgetListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceBudgetResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceBudgetUpdateInput struct {
	Interval *string `json:"interval,omitempty"`
	Limit *float64 `json:"limit,omitempty"`
}

type WorkspaceCreateRequest struct {
	Name string `json:"name"`
	Slug *string `json:"slug,omitempty"`
}

type WorkspaceDepartment struct {
	Color *string `json:"color,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	Description *string `json:"description,omitempty"`
	DirectoryName *string `json:"directory_name,omitempty"`
	Icon *string `json:"icon,omitempty"`
	Id string `json:"id"`
	Name string `json:"name"`
	NameOverridden *bool `json:"name_overridden,omitempty"`
	SourceId *string `json:"source_id,omitempty"`
	SourceType *string `json:"source_type,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
}

type WorkspaceDepartmentCreateRequest struct {
	Color *string `json:"color,omitempty"`
	Description *string `json:"description,omitempty"`
	Icon *string `json:"icon,omitempty"`
	Name string `json:"name"`
}

type WorkspaceDepartmentInput struct {
	Color *string `json:"color,omitempty"`
	Description *string `json:"description,omitempty"`
	Icon *string `json:"icon,omitempty"`
	Name *string `json:"name,omitempty"`
}

type WorkspaceDepartmentListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceDepartmentMember struct {
	DepartmentId string `json:"department_id"`
	IsPrimary bool `json:"is_primary"`
	Position string `json:"position"`
	UserId string `json:"user_id"`
}

type WorkspaceDepartmentMemberRequest struct {
	Position *string `json:"position,omitempty"`
	Primary *bool `json:"primary,omitempty"`
}

type WorkspaceDepartmentMemberResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceDepartmentResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceDepartmentUpdateRequest struct {
	Color *string `json:"color,omitempty"`
	Description *string `json:"description,omitempty"`
	Icon *string `json:"icon,omitempty"`
	Name *string `json:"name,omitempty"`
}

type WorkspaceDirectoryMember struct {
	AccessSource string `json:"access_source"`
	Department *map[string]interface{} `json:"department"`
	DepartmentOverrideEnabled bool `json:"department_override_enabled"`
	DepartmentOverrideId *string `json:"department_override_id"`
	DepartmentSource string `json:"department_source"`
	DirectoryDepartment *string `json:"directory_department,omitempty"`
	DisplayName string `json:"display_name"`
	EffectiveRole string `json:"effective_role"`
	Email *string `json:"email,omitempty"`
	JoinedAt *string `json:"joined_at,omitempty"`
	RoleOverride *string `json:"role_override"`
	Status string `json:"status"`
	UserId string `json:"user_id"`
	WorkspaceRole string `json:"workspace_role"`
}

type WorkspaceDirectoryMemberUpdateRequest struct {
	AccessRole *string `json:"access_role,omitempty"`
	DepartmentId *string `json:"department_id,omitempty"`
	DepartmentMode *string `json:"department_mode,omitempty"`
	DepartmentPosition *string `json:"department_position,omitempty"`
}

type WorkspaceDirectoryResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceGroupMapping struct {
	AccessRole string `json:"access_role"`
	CreatedAt *string `json:"created_at,omitempty"`
	DepartmentId string `json:"department_id"`
	DepartmentPosition string `json:"department_position"`
	Id string `json:"id"`
	ScimGroupId string `json:"scim_group_id"`
	UpdatedAt *string `json:"updated_at,omitempty"`
}

type WorkspaceGroupMappingCreateRequest struct {
	AccessRole *string `json:"access_role,omitempty"`
	DepartmentId string `json:"department_id"`
	DepartmentPosition *string `json:"department_position,omitempty"`
	ScimGroupId string `json:"scim_group_id"`
}

type WorkspaceGroupMappingListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceGroupMappingResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceGroupMappingUpdateRequest struct {
	AccessRole *string `json:"access_role,omitempty"`
	DepartmentPosition *string `json:"department_position,omitempty"`
}

type WorkspaceInvite struct {
	CreatedAt *string `json:"created_at,omitempty"`
	CreatorUserId string `json:"creator_user_id"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	Id string `json:"id"`
	MaxUses *int `json:"max_uses,omitempty"`
	Role string `json:"role"`
	TokenPreview *string `json:"token_preview,omitempty"`
	UsesCount *int `json:"uses_count,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceInviteCreateRequest struct {
	ExpiresInDays *int `json:"expires_in_days,omitempty"`
	MaxUses *int `json:"max_uses,omitempty"`
	Role *string `json:"role,omitempty"`
}

type WorkspaceInviteCreateResponse struct {
	Data map[string]interface{} `json:"data"`
	Token string `json:"token"`
}

type WorkspaceInviteListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type WorkspaceJoinRequest struct {
	CreatedAt *string `json:"created_at,omitempty"`
	DecidedAt *string `json:"decided_at,omitempty"`
	DecidedBy *string `json:"decided_by,omitempty"`
	Id string `json:"id"`
	InviteId *string `json:"invite_id,omitempty"`
	RequesterUserId string `json:"requester_user_id"`
	Status string `json:"status"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceJoinRequestListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type WorkspaceJoinRequestResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceJoinRequestStatus string

const (
	WorkspaceJoinRequestStatusPending WorkspaceJoinRequestStatus = "pending"
	WorkspaceJoinRequestStatusApproved WorkspaceJoinRequestStatus = "approved"
	WorkspaceJoinRequestStatusDenied WorkspaceJoinRequestStatus = "denied"
)


type WorkspaceListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type WorkspaceLowBalanceEmailSettings struct {
	Enabled bool `json:"enabled"`
	ThresholdUsd float64 `json:"threshold_usd"`
}

type WorkspaceLowBalanceEmailUpdate struct {
	Enabled bool `json:"enabled"`
	ThresholdUsd *float64 `json:"threshold_usd,omitempty"`
}

type WorkspaceMember struct {
	DisplayName *string `json:"display_name,omitempty"`
	JoinedAt *string `json:"joined_at,omitempty"`
	Role string `json:"role"`
	UserId string `json:"user_id"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceMemberAddResponse struct {
	AddedCount int `json:"added_count"`
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceMemberBulkRequest struct {
	Role *string `json:"role,omitempty"`
	UserIds []string `json:"user_ids"`
}

type WorkspaceMemberListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type WorkspaceMemberRemoveRequest struct {
	UserIds []string `json:"user_ids"`
}

type WorkspaceMemberRemoveResponse struct {
	RemovedCount int `json:"removed_count"`
}

type WorkspaceMemberResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceMemberRoleUpdateRequest struct {
	Role string `json:"role"`
}

type WorkspaceNotificationDestination struct {
	CreatedAt *string `json:"created_at,omitempty"`
	Id string `json:"id"`
	Name string `json:"name"`
	Status string `json:"status"`
	TargetPreview string `json:"target_preview"`
	Type string `json:"type"`
	UpdatedAt *string `json:"updated_at,omitempty"`
}

type WorkspaceNotificationDestinationCreateRequest struct {
	Name string `json:"name"`
	Target string `json:"target"`
	Type string `json:"type"`
}

type WorkspaceNotificationDestinationListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceNotificationDestinationResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceNotificationDestinationTestRequest struct {
	Target string `json:"target"`
	Type string `json:"type"`
}

type WorkspaceNotificationDestinationType string

const (
	WorkspaceNotificationDestinationTypeEmail WorkspaceNotificationDestinationType = "email"
	WorkspaceNotificationDestinationTypeDiscord WorkspaceNotificationDestinationType = "discord"
	WorkspaceNotificationDestinationTypeDiscordWebhook WorkspaceNotificationDestinationType = "discord_webhook"
	WorkspaceNotificationDestinationTypeSlack WorkspaceNotificationDestinationType = "slack"
	WorkspaceNotificationDestinationTypeMicrosoftTeams WorkspaceNotificationDestinationType = "microsoft_teams"
	WorkspaceNotificationDestinationTypeCustomWebhook WorkspaceNotificationDestinationType = "custom_webhook"
)


type WorkspaceNotificationEmailPreferences struct {
	AutoTopUpFailure bool `json:"auto_top_up_failure"`
	ModelDeprecation bool `json:"model_deprecation"`
	PaymentMethodExpiring bool `json:"payment_method_expiring"`
}

type WorkspaceNotificationEmailPreferencesUpdate struct {
	AutoTopUpFailure *bool `json:"auto_top_up_failure,omitempty"`
	ModelDeprecation *bool `json:"model_deprecation,omitempty"`
	PaymentMethodExpiring *bool `json:"payment_method_expiring,omitempty"`
}

type WorkspaceNotificationEventKind string

const (
	WorkspaceNotificationEventKindLowBalance WorkspaceNotificationEventKind = "low_balance"
	WorkspaceNotificationEventKindAutoTopUpFailed WorkspaceNotificationEventKind = "auto_top_up_failed"
	WorkspaceNotificationEventKindPaymentMethodExpiring WorkspaceNotificationEventKind = "payment_method_expiring"
	WorkspaceNotificationEventKindModelDeprecation WorkspaceNotificationEventKind = "model_deprecation"
)


type WorkspaceNotificationRoute struct {
	DestinationIds []string `json:"destination_ids"`
	EventKind string `json:"event_kind"`
}

type WorkspaceNotificationRouteMap struct {
	AutoTopUpFailed []string `json:"auto_top_up_failed"`
	LowBalance []string `json:"low_balance"`
	ModelDeprecation []string `json:"model_deprecation"`
	PaymentMethodExpiring []string `json:"payment_method_expiring"`
}

type WorkspaceNotificationRouteResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceNotificationRoutesResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceNotificationRouteUpdateRequest struct {
	DestinationIds []string `json:"destination_ids"`
}

type WorkspaceNotificationSettings struct {
	AutoTopUp map[string]interface{} `json:"auto_top_up"`
	EmailPreferences map[string]interface{} `json:"email_preferences"`
	LowBalanceEmail map[string]interface{} `json:"low_balance_email"`
}

type WorkspaceNotificationSettingsResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceNotificationSettingsUpdateRequest struct {
	AutoTopUp *map[string]interface{} `json:"auto_top_up,omitempty"`
	EmailPreferences *map[string]interface{} `json:"email_preferences,omitempty"`
	LowBalanceEmail *map[string]interface{} `json:"low_balance_email,omitempty"`
}

type WorkspaceNotificationTestResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceProviderRestrictionMode string

const (
	WorkspaceProviderRestrictionModeNone WorkspaceProviderRestrictionMode = "none"
	WorkspaceProviderRestrictionModeAllowlist WorkspaceProviderRestrictionMode = "allowlist"
	WorkspaceProviderRestrictionModeBlocklist WorkspaceProviderRestrictionMode = "blocklist"
)


type WorkspaceResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceRole string

const (
	WorkspaceRoleOwner WorkspaceRole = "owner"
	WorkspaceRoleAdmin WorkspaceRole = "admin"
	WorkspaceRoleMember WorkspaceRole = "member"
)


type WorkspaceRoutingMode string

const (
	WorkspaceRoutingModeBalanced WorkspaceRoutingMode = "balanced"
	WorkspaceRoutingModePrice WorkspaceRoutingMode = "price"
	WorkspaceRoutingModeLatency WorkspaceRoutingMode = "latency"
	WorkspaceRoutingModeThroughput WorkspaceRoutingMode = "throughput"
)


type WorkspaceScimAuditResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type WorkspaceScimEndpoint struct {
	CreatedAt *string `json:"created_at,omitempty"`
	Enabled bool `json:"enabled"`
	Id string `json:"id"`
	UpdatedAt *string `json:"updated_at,omitempty"`
}

type WorkspaceScimEndpointResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceScimEvent struct {
	Action *string `json:"action,omitempty"`
	CorrelationId *string `json:"correlation_id,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
	Detail *map[string]interface{} `json:"detail,omitempty"`
	HttpStatus *int `json:"http_status,omitempty"`
	Id *string `json:"id,omitempty"`
	Outcome *string `json:"outcome,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	ResourceId *string `json:"resource_id,omitempty"`
	ResourceType *string `json:"resource_type,omitempty"`
	ScimType *string `json:"scim_type,omitempty"`
}

type WorkspaceScimResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceScimToken struct {
	CreatedAt *string `json:"created_at,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	Id string `json:"id"`
	Label string `json:"label"`
	LastUsedAt *string `json:"last_used_at,omitempty"`
	RevokedAt *string `json:"revoked_at,omitempty"`
	TokenPrefix string `json:"token_prefix"`
}

type WorkspaceScimTokenCreateRequest struct {
	ExpiresAt *string `json:"expires_at,omitempty"`
	Label *string `json:"label,omitempty"`
}

type WorkspaceScimTokenCreateResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceScimUpdateRequest struct {
	Enabled bool `json:"enabled"`
}

type WorkspaceSettings struct {
	AlphaChannelEnabled *bool `json:"alpha_channel_enabled,omitempty"`
	BetaChannelEnabled *bool `json:"beta_channel_enabled,omitempty"`
	ByokFallbackEnabled *bool `json:"byok_fallback_enabled,omitempty"`
	IoLoggingEnabled *bool `json:"io_logging_enabled,omitempty"`
	IoLoggingIncludeProviderPayloads *bool `json:"io_logging_include_provider_payloads,omitempty"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacy_enable_free_may_publish_prompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacy_enable_free_may_train,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacy_enable_input_output_logging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacy_enable_paid_may_train,omitempty"`
	PrivacyZdrOnly *bool `json:"privacy_zdr_only,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"provider_restriction_enforce_allowed,omitempty"`
	ProviderRestrictionMode *interface{} `json:"provider_restriction_mode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"provider_restriction_provider_ids,omitempty"`
	ResponseHealingEnabled *bool `json:"response_healing_enabled,omitempty"`
	ResponseHealingLocked *bool `json:"response_healing_locked,omitempty"`
	ResponseHealingMode *string `json:"response_healing_mode,omitempty"`
	RoutingMode *interface{} `json:"routing_mode,omitempty"`
	UpdatedAt *string `json:"updated_at,omitempty"`
	WorkspaceId string `json:"workspace_id"`
}

type WorkspaceSettingsResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceSettingsUpdateRequest struct {
	AlphaChannelEnabled *bool `json:"alpha_channel_enabled,omitempty"`
	BetaChannelEnabled *bool `json:"beta_channel_enabled,omitempty"`
	ByokFallbackEnabled *bool `json:"byok_fallback_enabled,omitempty"`
	IoLoggingEnabled *bool `json:"io_logging_enabled,omitempty"`
	IoLoggingIncludeProviderPayloads *bool `json:"io_logging_include_provider_payloads,omitempty"`
	PrivacyEnableFreeMayPublishPrompts *bool `json:"privacy_enable_free_may_publish_prompts,omitempty"`
	PrivacyEnableFreeMayTrain *bool `json:"privacy_enable_free_may_train,omitempty"`
	PrivacyEnableInputOutputLogging *bool `json:"privacy_enable_input_output_logging,omitempty"`
	PrivacyEnablePaidMayTrain *bool `json:"privacy_enable_paid_may_train,omitempty"`
	PrivacyZdrOnly *bool `json:"privacy_zdr_only,omitempty"`
	ProviderRestrictionEnforceAllowed *bool `json:"provider_restriction_enforce_allowed,omitempty"`
	ProviderRestrictionMode *string `json:"provider_restriction_mode,omitempty"`
	ProviderRestrictionProviderIds *[]string `json:"provider_restriction_provider_ids,omitempty"`
	ResponseHealingEnabled *bool `json:"response_healing_enabled,omitempty"`
	ResponseHealingLocked *bool `json:"response_healing_locked,omitempty"`
	ResponseHealingMode *string `json:"response_healing_mode,omitempty"`
	RoutingMode *string `json:"routing_mode,omitempty"`
}

type WorkspaceSsoResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceSsoSettings struct {
	Domains []string `json:"domains"`
	Enabled bool `json:"enabled"`
	Enforced bool `json:"enforced"`
	Mode string `json:"mode"`
	ProviderIdentifier *string `json:"provider_identifier"`
}

type WorkspaceSsoUpdateRequest struct {
	Domains *[]string `json:"domains,omitempty"`
	Enabled bool `json:"enabled"`
	Enforced *bool `json:"enforced,omitempty"`
	Mode string `json:"mode"`
	ProviderIdentifier *string `json:"provider_identifier,omitempty"`
}

type WorkspaceUpdateRequest struct {
	Name *string `json:"name,omitempty"`
	Slug *string `json:"slug,omitempty"`
}
