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
	Ok string `json:"ok"`
}

type AnalyticsNotImplementedResponse struct {
	Message string `json:"message"`
	Ok string `json:"ok"`
	Status string `json:"status"`
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
	CacheControl *map[string]interface{} `json:"cache_control,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	EchoUpstreamRequest *bool `json:"echo_upstream_request,omitempty"`
	MaxTokens int `json:"max_tokens"`
	Messages []map[string]interface{} `json:"messages"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model string `json:"model"`
	PromptCacheRetention *string `json:"prompt_cache_retention,omitempty"`
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
	Disabled bool `json:"disabled"`
	ExpiresAt *string `json:"expires_at"`
	Hash string `json:"hash"`
	Id string `json:"id"`
	Label *string `json:"label"`
	LastUsedAt *string `json:"last_used_at"`
	Name *string `json:"name"`
	Prefix *string `json:"prefix"`
	Scopes interface{} `json:"scopes"`
	SoftBlocked bool `json:"soft_blocked"`
	Status *string `json:"status"`
	UpdatedAt *string `json:"updated_at"`
	WorkspaceId string `json:"workspace_id"`
}

type ApiKeyCreateRequest struct {
	Disabled *bool `json:"disabled,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	IncludeByokInLimit *bool `json:"include_byok_in_limit,omitempty"`
	Limit *float64 `json:"limit,omitempty"`
	LimitReset *string `json:"limit_reset,omitempty"`
	Name string `json:"name"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	WorkspaceId *string `json:"workspace_id,omitempty"`
}

type ApiKeyListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type ApiKeyResponse struct {
	Data map[string]interface{} `json:"data"`
}

type ApiKeyScopeValue = interface{}

type ApiKeyUpdateRequest struct {
	Disabled *bool `json:"disabled,omitempty"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	IncludeByokInLimit *bool `json:"include_byok_in_limit,omitempty"`
	Limit *float64 `json:"limit,omitempty"`
	LimitReset *string `json:"limit_reset,omitempty"`
	Name *string `json:"name,omitempty"`
	Scopes interface{} `json:"scopes,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
}

type ApiKeyWithValue struct {
	CreatedAt *string `json:"created_at"`
	CreatedBy *string `json:"created_by"`
	Disabled bool `json:"disabled"`
	ExpiresAt *string `json:"expires_at"`
	Hash string `json:"hash"`
	Id string `json:"id"`
	Key string `json:"key"`
	Label *string `json:"label"`
	LastUsedAt *string `json:"last_used_at"`
	Name *string `json:"name"`
	Prefix *string `json:"prefix"`
	Scopes interface{} `json:"scopes"`
	SoftBlocked bool `json:"soft_blocked"`
	Status *string `json:"status"`
	UpdatedAt *string `json:"updated_at"`
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

type BatchRequest struct {
	CompletionWindow *string `json:"completion_window,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Endpoint string `json:"endpoint"`
	InputFileId string `json:"input_file_id"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	SessionId *string `json:"session_id,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
}

type BatchRequestCounts struct {
	Completed *int `json:"completed,omitempty"`
	Failed *int `json:"failed,omitempty"`
	Total *int `json:"total,omitempty"`
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
	SessionId *string `json:"session_id,omitempty"`
	Status *string `json:"status,omitempty"`
	Webhook *map[string]interface{} `json:"webhook,omitempty"`
	WebsocketUrl *string `json:"websocket_url,omitempty"`
}

type BenchmarkId string

const (
	BenchmarkId2BenchRetail BenchmarkId = "2-bench-retail"
	BenchmarkId2BenchTelecom BenchmarkId = "2-bench-telecom"
	BenchmarkIdAaIndex BenchmarkId = "aa-index"
	BenchmarkIdAaIntelligenceIndexV4 BenchmarkId = "aa-intelligence-index-v4"
	BenchmarkIdAaLcr BenchmarkId = "aa-lcr"
	BenchmarkIdAaOmniscience BenchmarkId = "aa-omniscience"
	BenchmarkIdAaT2vRank BenchmarkId = "aa-t2v-rank"
	BenchmarkIdAceBench BenchmarkId = "ace-bench"
	BenchmarkIdActivitynet BenchmarkId = "activitynet"
	BenchmarkIdAethercode BenchmarkId = "aethercode"
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
	BenchmarkIdBalrogAi BenchmarkId = "balrog-ai"
	BenchmarkIdBbh BenchmarkId = "bbh"
	BenchmarkIdBcflv4 BenchmarkId = "bcflv4"
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
	BenchmarkIdChestImagenomeAnatomyIou BenchmarkId = "chest-imagenome-anatomy-iou"
	BenchmarkIdChexpertCxrTop5MacroF1 BenchmarkId = "chexpert-cxr-top5-macro-f1"
	BenchmarkIdChineseSimpleqa BenchmarkId = "chinese-simpleqa"
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
	BenchmarkIdFrontiercodeDiamond BenchmarkId = "frontiercode-diamond"
	BenchmarkIdFrontiermath BenchmarkId = "frontiermath"
	BenchmarkIdFrontiersciOlympiad BenchmarkId = "frontiersci-olympiad"
	BenchmarkIdFrontiersciResearch BenchmarkId = "frontiersci-research"
	BenchmarkIdFsc147Down BenchmarkId = "fsc-147-down"
	BenchmarkIdFullstackbenchEn BenchmarkId = "fullstackbench-en"
	BenchmarkIdFullstackbenchZh BenchmarkId = "fullstackbench-zh"
	BenchmarkIdFunctionalmath BenchmarkId = "functionalmath"
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
	BenchmarkIdHrBench4k BenchmarkId = "hr-bench-4k"
	BenchmarkIdHumaneval BenchmarkId = "humaneval"
	BenchmarkIdHumanevalAverage BenchmarkId = "humaneval-average"
	BenchmarkIdHumanevalMul BenchmarkId = "humaneval-mul"
	BenchmarkIdHumaneval2 BenchmarkId = "humaneval+"
	BenchmarkIdHumanevalfimAverage BenchmarkId = "humanevalfim-average"
	BenchmarkIdHumanitysLastExam BenchmarkId = "humanitys-last-exam"
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
	BenchmarkIdMathvista BenchmarkId = "mathvista"
	BenchmarkIdMathvistaMini BenchmarkId = "mathvista-mini"
	BenchmarkIdMaxife BenchmarkId = "maxife"
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
	BenchmarkIdOsworldG BenchmarkId = "osworld-g"
	BenchmarkIdOvbench BenchmarkId = "ovbench"
	BenchmarkIdOvobench BenchmarkId = "ovobench"
	BenchmarkIdPaperbench BenchmarkId = "paperbench"
	BenchmarkIdPathmcqaAccuracy BenchmarkId = "pathmcqa-accuracy"
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
	BenchmarkIdProcbench BenchmarkId = "procbench"
	BenchmarkIdProtocolqa BenchmarkId = "protocolqa"
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
	BenchmarkIdSkillsbench BenchmarkId = "skillsbench"
	BenchmarkIdSlakeClosedAccuracy BenchmarkId = "slake-closed-accuracy"
	BenchmarkIdSlakeTokenizedF1 BenchmarkId = "slake-tokenized-f1"
	BenchmarkIdSlakevqa BenchmarkId = "slakevqa"
	BenchmarkIdSmolagentsLlm BenchmarkId = "smolagents-llm"
	BenchmarkIdSnakeBench BenchmarkId = "snake-bench"
	BenchmarkIdSocialIqa BenchmarkId = "social-iqa"
	BenchmarkIdSoloBench BenchmarkId = "solo-bench"
	BenchmarkIdSpider BenchmarkId = "spider"
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
	BenchmarkIdWinogrande BenchmarkId = "winogrande"
	BenchmarkIdWmdp BenchmarkId = "wmdp"
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
	CacheControl *map[string]interface{} `json:"cache_control,omitempty"`
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
	PromptCacheRetention *string `json:"prompt_cache_retention,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
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
	Ok string `json:"ok"`
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
	Deleted string `json:"deleted"`
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
	Function map[string]interface{} `json:"function"`
	Type string `json:"type"`
}

type GatewayDatetimeToolDefinition struct {
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Timezone *string `json:"timezone,omitempty"`
	Type string `json:"type"`
}

type GatewayModelsResponse struct {
	AvailabilityMode string `json:"availability_mode"`
	Limit int `json:"limit"`
	Models []map[string]interface{} `json:"models"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	PrivacyScope string `json:"privacy_scope"`
	Total int `json:"total"`
}

type GatewayWebFetchToolDefinition struct {
	MaxChars *int `json:"max_chars,omitempty"`
	Parameters *map[string]interface{} `json:"parameters,omitempty"`
	Type string `json:"type"`
}

type GatewayWebSearchToolDefinition struct {
	IncludeHighlights *bool `json:"include_highlights,omitempty"`
	IncludeText *bool `json:"include_text,omitempty"`
	MaxResults *int `json:"max_results,omitempty"`
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
	Ok string `json:"ok"`
}

type KeyInvalidateResponse struct {
	CacheVersion map[string]interface{} `json:"cache_version"`
	Key map[string]interface{} `json:"key"`
	Message string `json:"message"`
	Ok string `json:"ok"`
}

type KnownModelId string

const (
	KnownModelIdAi21JambaLarge17 KnownModelId = "ai21/jamba-large-1.7"
	KnownModelIdAi21JambaMini2 KnownModelId = "ai21/jamba-mini-2"
	KnownModelIdAionLabsAion10 KnownModelId = "aion-labs/aion-1.0"
	KnownModelIdAionLabsAion10Mini KnownModelId = "aion-labs/aion-1.0-mini"
	KnownModelIdAionLabsAion20 KnownModelId = "aion-labs/aion-2.0"
	KnownModelIdAionLabsAion25 KnownModelId = "aion-labs/aion-2.5"
	KnownModelIdAionLabsAionRpLlama318b KnownModelId = "aion-labs/aion-rp-llama-3.1-8b"
	KnownModelIdAllenaiMolmo28b KnownModelId = "allenai/molmo-2-8b"
	KnownModelIdAllenaiOlmo3132b KnownModelId = "allenai/olmo-3.1-32b"
	KnownModelIdAnthropicClaudeFable5 KnownModelId = "anthropic/claude-fable-5"
	KnownModelIdAnthropicClaudeHaiku45 KnownModelId = "anthropic/claude-haiku-4.5"
	KnownModelIdAnthropicClaudeOpus41 KnownModelId = "anthropic/claude-opus-4.1"
	KnownModelIdAnthropicClaudeOpus45 KnownModelId = "anthropic/claude-opus-4.5"
	KnownModelIdAnthropicClaudeOpus46 KnownModelId = "anthropic/claude-opus-4.6"
	KnownModelIdAnthropicClaudeOpus47 KnownModelId = "anthropic/claude-opus-4.7"
	KnownModelIdAnthropicClaudeOpus47Fast KnownModelId = "anthropic/claude-opus-4.7-fast"
	KnownModelIdAnthropicClaudeOpus48 KnownModelId = "anthropic/claude-opus-4.8"
	KnownModelIdAnthropicClaudeSonnet45 KnownModelId = "anthropic/claude-sonnet-4.5"
	KnownModelIdAnthropicClaudeSonnet46 KnownModelId = "anthropic/claude-sonnet-4.6"
	KnownModelIdAnthropicClaudeSonnet5 KnownModelId = "anthropic/claude-sonnet-5"
	KnownModelIdArceeAiTrinityLarge KnownModelId = "arcee-ai/trinity-large"
	KnownModelIdArceeAiTrinityLargeThinking KnownModelId = "arcee-ai/trinity-large-thinking"
	KnownModelIdArceeAiTrinityMini KnownModelId = "arcee-ai/trinity-mini"
	KnownModelIdBaiduErnie4521bA3b KnownModelId = "baidu/ernie-4.5-21b-a3b"
	KnownModelIdBaiduErnie4521bA3bThinking KnownModelId = "baidu/ernie-4.5-21b-a3b-thinking"
	KnownModelIdBaiduErnie45300bA47b KnownModelId = "baidu/ernie-4.5-300b-a47b"
	KnownModelIdBaiduErnie45Vl28bA3b KnownModelId = "baidu/ernie-4.5-vl-28b-a3b"
	KnownModelIdBaiduErnie45Vl28bA3bThinking KnownModelId = "baidu/ernie-4.5-vl-28b-a3b-thinking"
	KnownModelIdBaiduErnie45Vl424bA47b KnownModelId = "baidu/ernie-4.5-vl-424b-a47b"
	KnownModelIdBlackForestLabsFlux1Schnell KnownModelId = "black-forest-labs/flux-1-schnell"
	KnownModelIdBytedanceSeed16 KnownModelId = "bytedance/seed-1.6"
	KnownModelIdBytedanceSeed16250915 KnownModelId = "bytedance/seed-1.6-250915"
	KnownModelIdBytedanceSeed16Flash KnownModelId = "bytedance/seed-1.6-flash"
	KnownModelIdBytedanceSeed16Flash250715 KnownModelId = "bytedance/seed-1.6-flash-250715"
	KnownModelIdBytedanceSeed18 KnownModelId = "bytedance/seed-1.8"
	KnownModelIdBytedanceSeed20Lite KnownModelId = "bytedance/seed-2.0-lite"
	KnownModelIdBytedanceSeed20Lite260428 KnownModelId = "bytedance/seed-2.0-lite-260428"
	KnownModelIdBytedanceSeed20Mini KnownModelId = "bytedance/seed-2.0-mini"
	KnownModelIdBytedanceSeed20Mini260428 KnownModelId = "bytedance/seed-2.0-mini-260428"
	KnownModelIdBytedanceSeed20Pro KnownModelId = "bytedance/seed-2.0-pro"
	KnownModelIdBytedanceSeedOss36bInstruct KnownModelId = "bytedance/seed-oss-36b-instruct"
	KnownModelIdBytedanceSeedTranslation KnownModelId = "bytedance/seed-translation"
	KnownModelIdBytedanceSeedance20 KnownModelId = "bytedance/seedance-2.0"
	KnownModelIdBytedanceSeedance20Fast KnownModelId = "bytedance/seedance-2.0-fast"
	KnownModelIdBytedanceSeedance20Mini260615 KnownModelId = "bytedance/seedance-2.0-mini-260615"
	KnownModelIdCrofaiGreg1Mini KnownModelId = "crofai/greg-1-mini"
	KnownModelIdCrofaiGreg2Super KnownModelId = "crofai/greg-2-super"
	KnownModelIdCrofaiGreg2Ultra KnownModelId = "crofai/greg-2-ultra"
	KnownModelIdCrofaiGregRp KnownModelId = "crofai/greg-rp"
	KnownModelIdDeepseekDeepseekOcr KnownModelId = "deepseek/deepseek-ocr"
	KnownModelIdDeepseekDeepseekOcr2 KnownModelId = "deepseek/deepseek-ocr-2"
	KnownModelIdDeepseekDeepseekProverV2671b KnownModelId = "deepseek/deepseek-prover-v2-671b"
	KnownModelIdDeepseekDeepseekR1 KnownModelId = "deepseek/deepseek-r1"
	KnownModelIdDeepseekDeepseekR10528 KnownModelId = "deepseek/deepseek-r1-0528"
	KnownModelIdDeepseekDeepseekR120250528 KnownModelId = "deepseek/deepseek-r1-2025-05-28"
	KnownModelIdDeepseekDeepseekR1Turbo KnownModelId = "deepseek/deepseek-r1-turbo"
	KnownModelIdDeepseekDeepseekV3 KnownModelId = "deepseek/deepseek-v3"
	KnownModelIdDeepseekDeepseekV30324 KnownModelId = "deepseek/deepseek-v3-0324"
	KnownModelIdDeepseekDeepseekV3Turbo KnownModelId = "deepseek/deepseek-v3-turbo"
	KnownModelIdDeepseekDeepseekV31 KnownModelId = "deepseek/deepseek-v3.1"
	KnownModelIdDeepseekDeepseekV31Terminus KnownModelId = "deepseek/deepseek-v3.1-terminus"
	KnownModelIdDeepseekDeepseekV32 KnownModelId = "deepseek/deepseek-v3.2"
	KnownModelIdDeepseekDeepseekV32Exp KnownModelId = "deepseek/deepseek-v3.2-exp"
	KnownModelIdDeepseekDeepseekV32Speciale KnownModelId = "deepseek/deepseek-v3.2-speciale"
	KnownModelIdDeepseekDeepseekV32Thinking KnownModelId = "deepseek/deepseek-v3.2-thinking"
	KnownModelIdDeepseekDeepseekV4Flash KnownModelId = "deepseek/deepseek-v4-flash"
	KnownModelIdDeepseekDeepseekV4Pro KnownModelId = "deepseek/deepseek-v4-pro"
	KnownModelIdDeepseekDeepseekV4ProLightning KnownModelId = "deepseek/deepseek-v4-pro-lightning"
	KnownModelIdElevenLabsElevenFlashV2 KnownModelId = "eleven-labs/eleven-flash-v2"
	KnownModelIdElevenLabsElevenFlashV25 KnownModelId = "eleven-labs/eleven-flash-v2.5"
	KnownModelIdElevenLabsElevenMonolingualV1 KnownModelId = "eleven-labs/eleven-monolingual-v1"
	KnownModelIdElevenLabsElevenMultilingualV1 KnownModelId = "eleven-labs/eleven-multilingual-v1"
	KnownModelIdElevenLabsElevenMultilingualV2 KnownModelId = "eleven-labs/eleven-multilingual-v2"
	KnownModelIdElevenLabsElevenTurboV2 KnownModelId = "eleven-labs/eleven-turbo-v2"
	KnownModelIdElevenLabsElevenTurboV25 KnownModelId = "eleven-labs/eleven-turbo-v2.5"
	KnownModelIdElevenLabsElevenV3 KnownModelId = "eleven-labs/eleven-v3"
	KnownModelIdEssentialAiRnj1 KnownModelId = "essential-ai/rnj-1"
	KnownModelIdGoogleGemini25Flash KnownModelId = "google/gemini-2.5-flash"
	KnownModelIdGoogleGemini25FlashLite KnownModelId = "google/gemini-2.5-flash-lite"
	KnownModelIdGoogleGemini25FlashLitePreview20250617 KnownModelId = "google/gemini-2.5-flash-lite-preview-2025-06-17"
	KnownModelIdGoogleGemini25FlashLitePreview20250925 KnownModelId = "google/gemini-2.5-flash-lite-preview-2025-09-25"
	KnownModelIdGoogleGemini25Pro KnownModelId = "google/gemini-2.5-pro"
	KnownModelIdGoogleGemini3FlashPreview KnownModelId = "google/gemini-3-flash-preview"
	KnownModelIdGoogleGemini3ProImage KnownModelId = "google/gemini-3-pro-image"
	KnownModelIdGoogleGemini31FlashImage KnownModelId = "google/gemini-3.1-flash-image"
	KnownModelIdGoogleGemini31FlashImagePreview KnownModelId = "google/gemini-3.1-flash-image-preview"
	KnownModelIdGoogleGemini31FlashLite KnownModelId = "google/gemini-3.1-flash-lite"
	KnownModelIdGoogleGemini31FlashLiteImage KnownModelId = "google/gemini-3.1-flash-lite-image"
	KnownModelIdGoogleGemini31FlashLitePreview KnownModelId = "google/gemini-3.1-flash-lite-preview"
	KnownModelIdGoogleGemini31FlashTtsPreview KnownModelId = "google/gemini-3.1-flash-tts-preview"
	KnownModelIdGoogleGemini31ProPreview KnownModelId = "google/gemini-3.1-pro-preview"
	KnownModelIdGoogleGemini31ProPreviewCustomtools KnownModelId = "google/gemini-3.1-pro-preview-customtools"
	KnownModelIdGoogleGemini35Flash KnownModelId = "google/gemini-3.5-flash"
	KnownModelIdGoogleGemini35Pro KnownModelId = "google/gemini-3.5-pro"
	KnownModelIdGoogleGeminiEmbedding001 KnownModelId = "google/gemini-embedding-001"
	KnownModelIdGoogleGeminiEmbedding2 KnownModelId = "google/gemini-embedding-2"
	KnownModelIdGoogleGeminiEmbedding2Preview KnownModelId = "google/gemini-embedding-2-preview"
	KnownModelIdGoogleGeminiRoboticsEr16Preview KnownModelId = "google/gemini-robotics-er-1.6-preview"
	KnownModelIdGoogleGemma327b KnownModelId = "google/gemma-3-27b"
	KnownModelIdGoogleGemma3nE4b KnownModelId = "google/gemma-3n-e4b"
	KnownModelIdGoogleGemma426bA4b KnownModelId = "google/gemma-4-26b-a4b"
	KnownModelIdGoogleGemma426bA4bFree KnownModelId = "google/gemma-4-26b-a4b:free"
	KnownModelIdGoogleGemma431b KnownModelId = "google/gemma-4-31b"
	KnownModelIdGoogleGemma431bIt KnownModelId = "google/gemma-4-31b-it"
	KnownModelIdGoogleGemma431bFree KnownModelId = "google/gemma-4-31b:free"
	KnownModelIdGoogleLyria3ClipPreview KnownModelId = "google/lyria-3-clip-preview"
	KnownModelIdGoogleLyria3ProPreview KnownModelId = "google/lyria-3-pro-preview"
	KnownModelIdGoogleVeo2 KnownModelId = "google/veo-2"
	KnownModelIdGoogleVeo31FastPreview KnownModelId = "google/veo-3.1-fast-preview"
	KnownModelIdGoogleVeo31LiteGeneratePreview KnownModelId = "google/veo-3.1-lite-generate-preview"
	KnownModelIdGoogleVeo31Preview KnownModelId = "google/veo-3.1-preview"
	KnownModelIdIbmGranite418b KnownModelId = "ibm/granite-4.1-8b"
	KnownModelIdInceptionMercury2 KnownModelId = "inception/mercury-2"
	KnownModelIdInceptionMercuryEdit2 KnownModelId = "inception/mercury-edit-2"
	KnownModelIdInclusionaiLing261t KnownModelId = "inclusionai/ling-2.6-1t"
	KnownModelIdInclusionaiLingFlash20 KnownModelId = "inclusionai/ling-flash-2.0"
	KnownModelIdInclusionaiRingFlash20 KnownModelId = "inclusionai/ring-flash-2.0"
	KnownModelIdInflectionInflection3Pi KnownModelId = "inflection/inflection-3-pi"
	KnownModelIdInflectionInflection3Productivity KnownModelId = "inflection/inflection-3-productivity"
	KnownModelIdKwaipilotKatCoderExp72b1010 KnownModelId = "kwaipilot/kat-coder-exp-72b-1010"
	KnownModelIdKwaipilotKatCoderPro KnownModelId = "kwaipilot/kat-coder-pro"
	KnownModelIdKwaipilotKatCoderProV1 KnownModelId = "kwaipilot/kat-coder-pro-v1"
	KnownModelIdKwaipilotKatCoderProV2 KnownModelId = "kwaipilot/kat-coder-pro-v2"
	KnownModelIdLiquidAiLfm224bA2b KnownModelId = "liquid-ai/lfm-2-24b-a2b"
	KnownModelIdMeituanLongcat20 KnownModelId = "meituan/longcat-2.0"
	KnownModelIdMetaLlama370b KnownModelId = "meta/llama-3-70b"
	KnownModelIdMetaLlama38b KnownModelId = "meta/llama-3-8b"
	KnownModelIdMetaLlama38bLite KnownModelId = "meta/llama-3-8b-lite"
	KnownModelIdMetaLlama3170b KnownModelId = "meta/llama-3.1-70b"
	KnownModelIdMetaLlama318b KnownModelId = "meta/llama-3.1-8b"
	KnownModelIdMetaLlama3211bVision KnownModelId = "meta/llama-3.2-11b-vision"
	KnownModelIdMetaLlama323b KnownModelId = "meta/llama-3.2-3b"
	KnownModelIdMetaLlama3370b KnownModelId = "meta/llama-3.3-70b"
	KnownModelIdMetaLlama4Maverick KnownModelId = "meta/llama-4-maverick"
	KnownModelIdMetaLlama4Scout KnownModelId = "meta/llama-4-scout"
	KnownModelIdMetaLlamaGuard412b KnownModelId = "meta/llama-guard-4-12b"
	KnownModelIdMetaLlamaPromptGuard222m KnownModelId = "meta/llama-prompt-guard-2-22m"
	KnownModelIdMetaLlamaPromptGuard286m KnownModelId = "meta/llama-prompt-guard-2-86m"
	KnownModelIdMicrosoftPhi4 KnownModelId = "microsoft/phi-4"
	KnownModelIdMicrosoftPhi4Mini KnownModelId = "microsoft/phi-4-mini"
	KnownModelIdMinimaxHailuo02 KnownModelId = "minimax/hailuo-02"
	KnownModelIdMinimaxHailuo23 KnownModelId = "minimax/hailuo-2.3"
	KnownModelIdMinimaxHailuo23Fast KnownModelId = "minimax/hailuo-2.3-fast"
	KnownModelIdMinimaxM2Her KnownModelId = "minimax/m2-her"
	KnownModelIdMinimaxMinimaxM180k KnownModelId = "minimax/minimax-m1-80k"
	KnownModelIdMinimaxMinimaxM2 KnownModelId = "minimax/minimax-m2"
	KnownModelIdMinimaxMinimaxM21 KnownModelId = "minimax/minimax-m2.1"
	KnownModelIdMinimaxMinimaxM25 KnownModelId = "minimax/minimax-m2.5"
	KnownModelIdMinimaxMinimaxM25Highspeed KnownModelId = "minimax/minimax-m2.5-highspeed"
	KnownModelIdMinimaxMinimaxM27 KnownModelId = "minimax/minimax-m2.7"
	KnownModelIdMinimaxMinimaxM3 KnownModelId = "minimax/minimax-m3"
	KnownModelIdMinimaxMusic26 KnownModelId = "minimax/music-2.6"
	KnownModelIdMinimaxMusic26Free KnownModelId = "minimax/music-2.6-free"
	KnownModelIdMistralCodestralEmbed KnownModelId = "mistral/codestral-embed"
	KnownModelIdMistralDevstral2 KnownModelId = "mistral/devstral-2"
	KnownModelIdMistralDevstralMedium10 KnownModelId = "mistral/devstral-medium-1.0"
	KnownModelIdMistralDevstralSmall11 KnownModelId = "mistral/devstral-small-1.1"
	KnownModelIdMistralLeanstral15Free KnownModelId = "mistral/leanstral-1.5:free"
	KnownModelIdMistralMagistralMedium12 KnownModelId = "mistral/magistral-medium-1.2"
	KnownModelIdMistralMinistral314b KnownModelId = "mistral/ministral-3-14b"
	KnownModelIdMistralMinistral33b KnownModelId = "mistral/ministral-3-3b"
	KnownModelIdMistralMinistral38b KnownModelId = "mistral/ministral-3-8b"
	KnownModelIdMistralMistralEmbed KnownModelId = "mistral/mistral-embed"
	KnownModelIdMistralMistralLarge21 KnownModelId = "mistral/mistral-large-2.1"
	KnownModelIdMistralMistralLarge3 KnownModelId = "mistral/mistral-large-3"
	KnownModelIdMistralMistralMedium30 KnownModelId = "mistral/mistral-medium-3.0"
	KnownModelIdMistralMistralMedium31 KnownModelId = "mistral/mistral-medium-3.1"
	KnownModelIdMistralMistralMedium35 KnownModelId = "mistral/mistral-medium-3.5"
	KnownModelIdMistralMistralModeration KnownModelId = "mistral/mistral-moderation"
	KnownModelIdMistralMistralModeration2 KnownModelId = "mistral/mistral-moderation-2"
	KnownModelIdMistralMistralNemo12b KnownModelId = "mistral/mistral-nemo-12b"
	KnownModelIdMistralMistralNemo2407 KnownModelId = "mistral/mistral-nemo-2407"
	KnownModelIdMistralMistralSmall24b2501 KnownModelId = "mistral/mistral-small-24b-2501"
	KnownModelIdMistralMistralSmall32 KnownModelId = "mistral/mistral-small-3.2"
	KnownModelIdMistralMistralSmall4 KnownModelId = "mistral/mistral-small-4"
	KnownModelIdMistralMixtral8x7b KnownModelId = "mistral/mixtral-8x7b"
	KnownModelIdMistralPixtralLarge KnownModelId = "mistral/pixtral-large"
	KnownModelIdMistralaiMistralNemo KnownModelId = "mistralai/mistral-nemo"
	KnownModelIdMoonshotaiKimiK2 KnownModelId = "moonshotai/kimi-k2"
	KnownModelIdMoonshotaiKimiK20905 KnownModelId = "moonshotai/kimi-k2-0905"
	KnownModelIdMoonshotaiKimiK2Instruct KnownModelId = "moonshotai/kimi-k2-instruct"
	KnownModelIdMoonshotaiKimiK2Instruct0905 KnownModelId = "moonshotai/kimi-k2-instruct-0905"
	KnownModelIdMoonshotaiKimiK2Thinking KnownModelId = "moonshotai/kimi-k2-thinking"
	KnownModelIdMoonshotaiKimiK25 KnownModelId = "moonshotai/kimi-k2.5"
	KnownModelIdMoonshotaiKimiK25Lightning KnownModelId = "moonshotai/kimi-k2.5-lightning"
	KnownModelIdMoonshotaiKimiK26 KnownModelId = "moonshotai/kimi-k2.6"
	KnownModelIdMoonshotaiKimiK27Code KnownModelId = "moonshotai/kimi-k2.7-code"
	KnownModelIdMoonshotaiMoonshotV1128k KnownModelId = "moonshotai/moonshot-v1-128k"
	KnownModelIdMoonshotaiMoonshotV1128kVisionPreview KnownModelId = "moonshotai/moonshot-v1-128k-vision-preview"
	KnownModelIdMoonshotaiMoonshotV132k KnownModelId = "moonshotai/moonshot-v1-32k"
	KnownModelIdMoonshotaiMoonshotV132kVisionPreview KnownModelId = "moonshotai/moonshot-v1-32k-vision-preview"
	KnownModelIdMoonshotaiMoonshotV18k KnownModelId = "moonshotai/moonshot-v1-8k"
	KnownModelIdMoonshotaiMoonshotV18kVisionPreview KnownModelId = "moonshotai/moonshot-v1-8k-vision-preview"
	KnownModelIdMorphMorphV3Fast KnownModelId = "morph/morph-v3-fast"
	KnownModelIdMorphMorphV3Large KnownModelId = "morph/morph-v3-large"
	KnownModelIdNexAgiDeepseekV31NexN1 KnownModelId = "nex-agi/deepseek-v3.1-nex-n1"
	KnownModelIdNexAgiNexN2Pro KnownModelId = "nex-agi/nex-n2-pro"
	KnownModelIdNousHermes3Llama31405b KnownModelId = "nous/hermes-3-llama-3.1-405b"
	KnownModelIdNousresearchHermes3Llama31405b KnownModelId = "nousresearch/hermes-3-llama-3.1-405b"
	KnownModelIdNousresearchHermes3Llama3170b KnownModelId = "nousresearch/hermes-3-llama-3.1-70b"
	KnownModelIdNousresearchHermes4405b KnownModelId = "nousresearch/hermes-4-405b"
	KnownModelIdNousresearchHermes470b KnownModelId = "nousresearch/hermes-4-70b"
	KnownModelIdNvidiaCosmos3SuperReasoner KnownModelId = "nvidia/cosmos3-super-reasoner"
	KnownModelIdNvidiaLlama31Nemotron70bInstruct KnownModelId = "nvidia/llama-3.1-nemotron-70b-instruct"
	KnownModelIdNvidiaLlama31NemotronUltra253b KnownModelId = "nvidia/llama-3.1-nemotron-ultra-253b"
	KnownModelIdNvidiaLlama33NemotronSuper49bV15 KnownModelId = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
	KnownModelIdNvidiaNemotron3Nano30bA3b KnownModelId = "nvidia/nemotron-3-nano-30b-a3b"
	KnownModelIdNvidiaNemotron3NanoOmni30bA3bReasoning KnownModelId = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
	KnownModelIdNvidiaNemotron3Super120bA12b KnownModelId = "nvidia/nemotron-3-super-120b-a12b"
	KnownModelIdNvidiaNemotron3Ultra550bA55b KnownModelId = "nvidia/nemotron-3-ultra-550b-a55b"
	KnownModelIdNvidiaNvidiaNemotron3Nano30bA3b KnownModelId = "nvidia/nvidia-nemotron-3-nano-30b-a3b"
	KnownModelIdNvidiaNvidiaNemotronNano12bV2Vl KnownModelId = "nvidia/nvidia-nemotron-nano-12b-v2-vl"
	KnownModelIdOpenaiBabbage002 KnownModelId = "openai/babbage-002"
	KnownModelIdOpenaiChatLatest KnownModelId = "openai/chat-latest"
	KnownModelIdOpenaiChatgpt4o KnownModelId = "openai/chatgpt-4o"
	KnownModelIdOpenaiComputerUsePreview KnownModelId = "openai/computer-use-preview"
	KnownModelIdOpenaiDavinci002 KnownModelId = "openai/davinci-002"
	KnownModelIdOpenaiGpt35Turbo16k KnownModelId = "openai/gpt-3.5-turbo-16k"
	KnownModelIdOpenaiGpt35Turbo20230321 KnownModelId = "openai/gpt-3.5-turbo-2023-03-21"
	KnownModelIdOpenaiGpt420230613 KnownModelId = "openai/gpt-4-2023-06-13"
	KnownModelIdOpenaiGpt4Turbo20230314 KnownModelId = "openai/gpt-4-turbo-2023-03-14"
	KnownModelIdOpenaiGpt4Turbo20231106 KnownModelId = "openai/gpt-4-turbo-2023-11-06"
	KnownModelIdOpenaiGpt4Turbo20240125 KnownModelId = "openai/gpt-4-turbo-2024-01-25"
	KnownModelIdOpenaiGpt41 KnownModelId = "openai/gpt-4.1"
	KnownModelIdOpenaiGpt41Mini KnownModelId = "openai/gpt-4.1-mini"
	KnownModelIdOpenaiGpt41Nano KnownModelId = "openai/gpt-4.1-nano"
	KnownModelIdOpenaiGpt4o20240513 KnownModelId = "openai/gpt-4o-2024-05-13"
	KnownModelIdOpenaiGpt4o20240806 KnownModelId = "openai/gpt-4o-2024-08-06"
	KnownModelIdOpenaiGpt4o20241120 KnownModelId = "openai/gpt-4o-2024-11-20"
	KnownModelIdOpenaiGpt4oMini KnownModelId = "openai/gpt-4o-mini"
	KnownModelIdOpenaiGpt4oMiniTranscribe KnownModelId = "openai/gpt-4o-mini-transcribe"
	KnownModelIdOpenaiGpt4oMiniTts KnownModelId = "openai/gpt-4o-mini-tts"
	KnownModelIdOpenaiGpt4oTranscribe KnownModelId = "openai/gpt-4o-transcribe"
	KnownModelIdOpenaiGpt5 KnownModelId = "openai/gpt-5"
	KnownModelIdOpenaiGpt5Chat KnownModelId = "openai/gpt-5-chat"
	KnownModelIdOpenaiGpt5Codex KnownModelId = "openai/gpt-5-codex"
	KnownModelIdOpenaiGpt5Mini KnownModelId = "openai/gpt-5-mini"
	KnownModelIdOpenaiGpt5Nano KnownModelId = "openai/gpt-5-nano"
	KnownModelIdOpenaiGpt5Pro KnownModelId = "openai/gpt-5-pro"
	KnownModelIdOpenaiGpt51 KnownModelId = "openai/gpt-5.1"
	KnownModelIdOpenaiGpt51Chat KnownModelId = "openai/gpt-5.1-chat"
	KnownModelIdOpenaiGpt51Codex KnownModelId = "openai/gpt-5.1-codex"
	KnownModelIdOpenaiGpt51CodexMax KnownModelId = "openai/gpt-5.1-codex-max"
	KnownModelIdOpenaiGpt51CodexMini KnownModelId = "openai/gpt-5.1-codex-mini"
	KnownModelIdOpenaiGpt52 KnownModelId = "openai/gpt-5.2"
	KnownModelIdOpenaiGpt52Chat KnownModelId = "openai/gpt-5.2-chat"
	KnownModelIdOpenaiGpt52Codex KnownModelId = "openai/gpt-5.2-codex"
	KnownModelIdOpenaiGpt52Pro KnownModelId = "openai/gpt-5.2-pro"
	KnownModelIdOpenaiGpt53Chat KnownModelId = "openai/gpt-5.3-chat"
	KnownModelIdOpenaiGpt53Codex KnownModelId = "openai/gpt-5.3-codex"
	KnownModelIdOpenaiGpt54 KnownModelId = "openai/gpt-5.4"
	KnownModelIdOpenaiGpt54Mini KnownModelId = "openai/gpt-5.4-mini"
	KnownModelIdOpenaiGpt54Nano KnownModelId = "openai/gpt-5.4-nano"
	KnownModelIdOpenaiGpt54Pro KnownModelId = "openai/gpt-5.4-pro"
	KnownModelIdOpenaiGpt55 KnownModelId = "openai/gpt-5.5"
	KnownModelIdOpenaiGpt55Pro KnownModelId = "openai/gpt-5.5-pro"
	KnownModelIdOpenaiGptImage1 KnownModelId = "openai/gpt-image-1"
	KnownModelIdOpenaiGptImage1Mini KnownModelId = "openai/gpt-image-1-mini"
	KnownModelIdOpenaiGptImage15 KnownModelId = "openai/gpt-image-1.5"
	KnownModelIdOpenaiGptImage2 KnownModelId = "openai/gpt-image-2"
	KnownModelIdOpenaiGptOss120b KnownModelId = "openai/gpt-oss-120b"
	KnownModelIdOpenaiGptOss20b KnownModelId = "openai/gpt-oss-20b"
	KnownModelIdOpenaiGptOssSafeguard20b KnownModelId = "openai/gpt-oss-safeguard-20b"
	KnownModelIdOpenaiO1 KnownModelId = "openai/o1"
	KnownModelIdOpenaiO1Mini KnownModelId = "openai/o1-mini"
	KnownModelIdOpenaiO1Pro KnownModelId = "openai/o1-pro"
	KnownModelIdOpenaiO3 KnownModelId = "openai/o3"
	KnownModelIdOpenaiO3DeepResearch KnownModelId = "openai/o3-deep-research"
	KnownModelIdOpenaiO3Mini KnownModelId = "openai/o3-mini"
	KnownModelIdOpenaiO3Pro KnownModelId = "openai/o3-pro"
	KnownModelIdOpenaiO4Mini KnownModelId = "openai/o4-mini"
	KnownModelIdOpenaiO4MiniDeepResearch KnownModelId = "openai/o4-mini-deep-research"
	KnownModelIdOpenaiOmniModeration KnownModelId = "openai/omni-moderation"
	KnownModelIdOpenaiSora2 KnownModelId = "openai/sora-2"
	KnownModelIdOpenaiSora2Pro KnownModelId = "openai/sora-2-pro"
	KnownModelIdOpenaiTextEmbedding3Large KnownModelId = "openai/text-embedding-3-large"
	KnownModelIdOpenaiTextEmbedding3Small KnownModelId = "openai/text-embedding-3-small"
	KnownModelIdOpenaiTextEmbeddingAda002 KnownModelId = "openai/text-embedding-ada-002"
	KnownModelIdOpenaiWhisper1 KnownModelId = "openai/whisper-1"
	KnownModelIdPoolsideLagunaM1Free KnownModelId = "poolside/laguna-m.1:free"
	KnownModelIdPoolsideLagunaXs2Free KnownModelId = "poolside/laguna-xs.2:free"
	KnownModelIdQwenQvqMax KnownModelId = "qwen/qvq-max"
	KnownModelIdQwenQwen36Plus KnownModelId = "qwen/qwen-3.6-plus"
	KnownModelIdQwenQwenFlash KnownModelId = "qwen/qwen-flash"
	KnownModelIdQwenQwenFlashCharacter KnownModelId = "qwen/qwen-flash-character"
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
	KnownModelIdQwenQwen3Coder KnownModelId = "qwen/qwen3-coder"
	KnownModelIdQwenQwen3Coder30bA3b KnownModelId = "qwen/qwen3-coder-30b-a3b"
	KnownModelIdQwenQwen3Coder480bA35b KnownModelId = "qwen/qwen3-coder-480b-a35b"
	KnownModelIdQwenQwen3CoderFlash KnownModelId = "qwen/qwen3-coder-flash"
	KnownModelIdQwenQwen3CoderNext KnownModelId = "qwen/qwen3-coder-next"
	KnownModelIdQwenQwen3CoderPlus20250722 KnownModelId = "qwen/qwen3-coder-plus-2025-07-22"
	KnownModelIdQwenQwen3CoderPlus20250923 KnownModelId = "qwen/qwen3-coder-plus-2025-09-23"
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
	KnownModelIdQwenQwen354b KnownModelId = "qwen/qwen3.5-4b"
	KnownModelIdQwenQwen359b KnownModelId = "qwen/qwen3.5-9b"
	KnownModelIdQwenQwen35Flash KnownModelId = "qwen/qwen3.5-flash"
	KnownModelIdQwenQwen35LivetranslateFlashRealtime20260519 KnownModelId = "qwen/qwen3.5-livetranslate-flash-realtime-2026-05-19"
	KnownModelIdQwenQwen35Plus KnownModelId = "qwen/qwen3.5-plus"
	KnownModelIdQwenQwen35Plus20260420 KnownModelId = "qwen/qwen3.5-plus-2026-04-20"
	KnownModelIdQwenQwen3627b KnownModelId = "qwen/qwen3.6-27b"
	KnownModelIdQwenQwen3635bA3b KnownModelId = "qwen/qwen3.6-35b-a3b"
	KnownModelIdQwenQwen36MaxPreview KnownModelId = "qwen/qwen3.6-max-preview"
	KnownModelIdQwenQwen36Plus2 KnownModelId = "qwen/qwen3.6-plus"
	KnownModelIdQwenQwen37Max KnownModelId = "qwen/qwen3.7-max"
	KnownModelIdQwenQwen37Max20260517 KnownModelId = "qwen/qwen3.7-max-2026-05-17"
	KnownModelIdQwenQwen37Plus KnownModelId = "qwen/qwen3.7-plus"
	KnownModelIdQwenQwen37Plus20260526 KnownModelId = "qwen/qwen3.7-plus-2026-05-26"
	KnownModelIdQwenQwq32b KnownModelId = "qwen/qwq-32b"
	KnownModelIdQwenQwqPlus KnownModelId = "qwen/qwq-plus"
	KnownModelIdQwenTextEmbeddingV3 KnownModelId = "qwen/text-embedding-v3"
	KnownModelIdQwenTextEmbeddingV4 KnownModelId = "qwen/text-embedding-v4"
	KnownModelIdQwenWan27T2v KnownModelId = "qwen/wan2.7-t2v"
	KnownModelIdStepfunStep35Flash KnownModelId = "stepfun/step-3.5-flash"
	KnownModelIdStepfunStep37Flash KnownModelId = "stepfun/step-3.7-flash"
	KnownModelIdTencentHunyuanA13bInstruct KnownModelId = "tencent/hunyuan-a13b-instruct"
	KnownModelIdTencentHy3Preview KnownModelId = "tencent/hy3-preview"
	KnownModelIdVeniceVeniceUncensored KnownModelId = "venice/venice-uncensored"
	KnownModelIdVeniceVeniceUncensored11 KnownModelId = "venice/venice-uncensored-1.1"
	KnownModelIdVoyageRerank1 KnownModelId = "voyage/rerank-1"
	KnownModelIdVoyageRerank2 KnownModelId = "voyage/rerank-2"
	KnownModelIdVoyageRerank2Lite KnownModelId = "voyage/rerank-2-lite"
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
	KnownModelIdXAiGrok420Beta0309 KnownModelId = "x-ai/grok-4.20-beta-0309"
	KnownModelIdXAiGrok420MultiAgentBeta0309 KnownModelId = "x-ai/grok-4.20-multi-agent-beta-0309"
	KnownModelIdXAiGrok43 KnownModelId = "x-ai/grok-4.3"
	KnownModelIdXAiGrokBuild01 KnownModelId = "x-ai/grok-build-0.1"
	KnownModelIdXAiGrokCodeFast1 KnownModelId = "x-ai/grok-code-fast-1"
	KnownModelIdXAiGrokImagineImage KnownModelId = "x-ai/grok-imagine-image"
	KnownModelIdXAiGrokImagineImageQuality KnownModelId = "x-ai/grok-imagine-image-quality"
	KnownModelIdXAiGrokImagineVideo KnownModelId = "x-ai/grok-imagine-video"
	KnownModelIdXAiGrokTts KnownModelId = "x-ai/grok-tts"
	KnownModelIdXiaomiMimoV2Flash KnownModelId = "xiaomi/mimo-v2-flash"
	KnownModelIdXiaomiMimoV25 KnownModelId = "xiaomi/mimo-v2.5"
	KnownModelIdXiaomiMimoV25Pro KnownModelId = "xiaomi/mimo-v2.5-pro"
	KnownModelIdXiaomiMimoV25TtsFree KnownModelId = "xiaomi/mimo-v2.5-tts:free"
	KnownModelIdZAiGlm432b KnownModelId = "z-ai/glm-4-32b"
	KnownModelIdZAiGlm47FlashFree KnownModelId = "z-ai/glm-4-7-flash:free"
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
	KnownModelIdZAiGlm5 KnownModelId = "z-ai/glm-5"
	KnownModelIdZAiGlm5Code KnownModelId = "z-ai/glm-5-code"
	KnownModelIdZAiGlm5Turbo KnownModelId = "z-ai/glm-5-turbo"
	KnownModelIdZAiGlm51 KnownModelId = "z-ai/glm-5.1"
	KnownModelIdZAiGlm52 KnownModelId = "z-ai/glm-5.2"
	KnownModelIdZAiGlm5vTurbo KnownModelId = "z-ai/glm-5v-turbo"
	KnownModelIdZaiOrgGlm45Air KnownModelId = "zai-org/glm-4.5-air"
	KnownModelIdZaiGlm5 KnownModelId = "zai/glm-5"
)


type ListFilesResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Object *string `json:"object,omitempty"`
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
	Ok string `json:"ok"`
}

type ManagementKeyDeleteResponse struct {
	Message string `json:"message"`
	Ok string `json:"ok"`
}

type ManagementKeyDetailResponse struct {
	Key map[string]interface{} `json:"key"`
	Ok string `json:"ok"`
}

type ManagementKeyListResponse struct {
	Keys []map[string]interface{} `json:"keys"`
	Limit int `json:"limit"`
	Offset int `json:"offset"`
	Ok string `json:"ok"`
	Total int `json:"total"`
}

type ManagementKeyUpdateRequest struct {
	Name *string `json:"name,omitempty"`
	SoftBlocked *bool `json:"soft_blocked,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ManagementKeyUpdateResponse struct {
	Message string `json:"message"`
	Ok string `json:"ok"`
}

type MessageContentPart = interface{}

type Model struct {
	Aliases *[]string `json:"aliases,omitempty"`
	Architecture *map[string]interface{} `json:"architecture,omitempty"`
	Availability *map[string]interface{} `json:"availability,omitempty"`
	CanonicalSlug *string `json:"canonical_slug,omitempty"`
	Created *int `json:"created,omitempty"`
	DeprecationDate *string `json:"deprecation_date,omitempty"`
	Description *string `json:"description,omitempty"`
	Endpoints *[]string `json:"endpoints,omitempty"`
	Id *string `json:"id,omitempty"`
	InputTypes *[]string `json:"input_types,omitempty"`
	Lifecycle *ModelLifecycle `json:"lifecycle,omitempty"`
	ModelId *string `json:"model_id,omitempty"`
	Name *string `json:"name,omitempty"`
	OrganisationColour *string `json:"organisation_colour,omitempty"`
	OrganisationId *string `json:"organisation_id,omitempty"`
	OrganisationName *string `json:"organisation_name,omitempty"`
	OutputTypes *[]string `json:"output_types,omitempty"`
	PerRequestLimits *map[string]interface{} `json:"per_request_limits,omitempty"`
	Pricing *map[string]interface{} `json:"pricing,omitempty"`
	PricingDetail *map[string]interface{} `json:"pricing_detail,omitempty"`
	Providers *[]map[string]interface{} `json:"providers,omitempty"`
	ReleaseDate *string `json:"release_date,omitempty"`
	RetirementDate *string `json:"retirement_date,omitempty"`
	Status *string `json:"status,omitempty"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
	SupportedParams *[]string `json:"supported_params,omitempty"`
	SupportedParamsDetail *map[string]interface{} `json:"supported_params_detail,omitempty"`
	TopProvider *map[string]interface{} `json:"top_provider,omitempty"`
	TopProviderId *string `json:"top_provider_id,omitempty"`
}

type ModelAvailability struct {
	ActiveProviderCount int `json:"active_provider_count"`
	InactiveProviderCount int `json:"inactive_provider_count"`
	ProviderCount int `json:"provider_count"`
	Status string `json:"status"`
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
	IsActiveGateway bool `json:"is_active_gateway"`
	ModelRoutingStatus string `json:"model_routing_status"`
	Params []string `json:"params"`
	ParamsDetail *map[string]interface{} `json:"params_detail,omitempty"`
	ProviderRoutingStatus string `json:"provider_routing_status"`
	ProviderStatus string `json:"provider_status"`
	SupportedParameters *[]string `json:"supported_parameters,omitempty"`
	SupportedParametersDetail *map[string]interface{} `json:"supported_parameters_detail,omitempty"`
}

type ModelsPrivacyScopeNotImplementedResponse struct {
	Code string `json:"code"`
	Error string `json:"error"`
	Message string `json:"message"`
	Ok string `json:"ok"`
	PrivacyScope string `json:"privacy_scope"`
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
}

type NotImplementedResponse struct {
	Description string `json:"description"`
	Error string `json:"error"`
	StatusCode int `json:"status_code"`
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
	OrganisationIdAllenai OrganisationId = "allenai"
	OrganisationIdAmazon OrganisationId = "amazon"
	OrganisationIdAnthropic OrganisationId = "anthropic"
	OrganisationIdArceeAi OrganisationId = "arcee-ai"
	OrganisationIdBaidu OrganisationId = "baidu"
	OrganisationIdBlackForestLabs OrganisationId = "black-forest-labs"
	OrganisationIdBytedance OrganisationId = "bytedance"
	OrganisationIdCohere OrganisationId = "cohere"
	OrganisationIdCursor OrganisationId = "cursor"
	OrganisationIdDeepseek OrganisationId = "deepseek"
	OrganisationIdElevenLabs OrganisationId = "eleven-labs"
	OrganisationIdEssentialAi OrganisationId = "essential-ai"
	OrganisationIdGithub OrganisationId = "github"
	OrganisationIdGoogle OrganisationId = "google"
	OrganisationIdIbm OrganisationId = "ibm"
	OrganisationIdInception OrganisationId = "inception"
	OrganisationIdInclusionai OrganisationId = "inclusionai"
	OrganisationIdKwaipilot OrganisationId = "kwaipilot"
	OrganisationIdLg OrganisationId = "lg"
	OrganisationIdLiquidAi OrganisationId = "liquid-ai"
	OrganisationIdMeituan OrganisationId = "meituan"
	OrganisationIdMeta OrganisationId = "meta"
	OrganisationIdMicrosoft OrganisationId = "microsoft"
	OrganisationIdMinimax OrganisationId = "minimax"
	OrganisationIdMistral OrganisationId = "mistral"
	OrganisationIdMoonshotai OrganisationId = "moonshotai"
	OrganisationIdNaverHyperclova OrganisationId = "naver-hyperclova"
	OrganisationIdNexAgi OrganisationId = "nex-agi"
	OrganisationIdNous OrganisationId = "nous"
	OrganisationIdNvidia OrganisationId = "nvidia"
	OrganisationIdOpenai OrganisationId = "openai"
	OrganisationIdPerplexity OrganisationId = "perplexity"
	OrganisationIdPoe OrganisationId = "poe"
	OrganisationIdPrimeIntellect OrganisationId = "prime-intellect"
	OrganisationIdQwen OrganisationId = "qwen"
	OrganisationIdRelace OrganisationId = "relace"
	OrganisationIdSourceful OrganisationId = "sourceful"
	OrganisationIdStepfun OrganisationId = "stepfun"
	OrganisationIdSuno OrganisationId = "suno"
	OrganisationIdUpstage OrganisationId = "upstage"
	OrganisationIdVercel OrganisationId = "vercel"
	OrganisationIdVoyage OrganisationId = "voyage"
	OrganisationIdWindsurf OrganisationId = "windsurf"
	OrganisationIdXAi OrganisationId = "x-ai"
	OrganisationIdXiaomi OrganisationId = "xiaomi"
	OrganisationIdZAi OrganisationId = "z-ai"
)


type OrganisationIdList = []string

type Provider struct {
	ApiProviderId *string `json:"api_provider_id,omitempty"`
	ApiProviderName *string `json:"api_provider_name,omitempty"`
	CountryCode *string `json:"country_code,omitempty"`
	Description *string `json:"description,omitempty"`
	Link *string `json:"link,omitempty"`
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

type RealtimeNotImplementedResponse struct {
	Error map[string]interface{} `json:"error"`
}

type ReasoningConfig struct {
	Effort *string `json:"effort,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
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
	CacheControl *map[string]interface{} `json:"cache_control,omitempty"`
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
	PromptCacheRetention *string `json:"prompt_cache_retention,omitempty"`
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
	Created *int `json:"created,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	Output *[]map[string]interface{} `json:"output,omitempty"`
	OutputItems *[]map[string]interface{} `json:"output_items,omitempty"`
	Role *string `json:"role,omitempty"`
	StopReason *string `json:"stop_reason,omitempty"`
	Type *string `json:"type,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type ResponsesWebSocketCreateEvent struct {
	Input interface{} `json:"input,omitempty"`
	Model string `json:"model"`
	PreviousResponseId *string `json:"previous_response_id,omitempty"`
	Store *bool `json:"store,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]map[string]interface{} `json:"tools,omitempty"`
	Type string `json:"type"`
}

type ResponsesWebSocketServerEvent struct {
	Error *map[string]interface{} `json:"error,omitempty"`
	Response *map[string]interface{} `json:"response,omitempty"`
	Status *int `json:"status,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ResponsesWebSocketUpgradeRequiredResponse struct {
	Error *map[string]interface{} `json:"error,omitempty"`
}

type ServerToolUsage struct {
	DatetimeRequests *int `json:"datetime_requests,omitempty"`
	WebFetchRequests *int `json:"web_fetch_requests,omitempty"`
	WebSearchRequests *int `json:"web_search_requests,omitempty"`
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
	GenerateAudio *bool `json:"generate_audio,omitempty"`
	InputReferences *[]map[string]interface{} `json:"input_references,omitempty"`
	Model string `json:"model"`
	NegativePrompt *string `json:"negative_prompt,omitempty"`
	Output *map[string]interface{} `json:"output,omitempty"`
	PersonGeneration *string `json:"person_generation,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
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

type VideoInputReference struct {
	ImageUrl *map[string]interface{} `json:"image_url,omitempty"`
	ReferenceType *string `json:"reference_type,omitempty"`
	Role *string `json:"role,omitempty"`
	Type string `json:"type"`
}

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

type Workspace struct {
	CreatedAt *string `json:"created_at"`
	CreatedBy *string `json:"created_by"`
	Id string `json:"id"`
	Name *string `json:"name"`
	Slug *string `json:"slug"`
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
	Ok string `json:"ok"`
	PeriodDays int `json:"period_days"`
	Total int `json:"total"`
	TotalCostCents float64 `json:"total_cost_cents"`
}

type WorkspaceCreateRequest struct {
	Name string `json:"name"`
	Slug *string `json:"slug,omitempty"`
}

type WorkspaceListResponse struct {
	Data []map[string]interface{} `json:"data"`
	TotalCount int `json:"total_count"`
}

type WorkspaceResponse struct {
	Data map[string]interface{} `json:"data"`
}

type WorkspaceUpdateRequest struct {
	Name *string `json:"name,omitempty"`
	Slug *string `json:"slug,omitempty"`
}
