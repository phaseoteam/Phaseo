package gen

type ActivityEntry struct {
	CostCents *float64 `json:"cost_cents,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	LatencyMs *int `json:"latency_ms,omitempty"`
	Model *string `json:"model,omitempty"`
	Provider *string `json:"provider,omitempty"`
	RequestId *string `json:"request_id,omitempty"`
	Timestamp *string `json:"timestamp,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type AnthropicContentBlock struct {
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
	MaxTokens *int `json:"max_tokens,omitempty"`
	Messages []map[string]interface{} `json:"messages"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	System interface{} `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]map[string]interface{} `json:"tools,omitempty"`
	TopK *int `json:"top_k,omitempty"`
	TopP *float64 `json:"top_p,omitempty"`
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

type BatchRequest struct {
	CompletionWindow *string `json:"completion_window,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Endpoint string `json:"endpoint"`
	InputFileId string `json:"input_file_id"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
}

type BatchRequestCounts struct {
	Completed *int `json:"completed,omitempty"`
	Failed *int `json:"failed,omitempty"`
	Total *int `json:"total,omitempty"`
}

type BatchResponse struct {
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
	FinalizingAt *int `json:"finalizing_at,omitempty"`
	Id *string `json:"id,omitempty"`
	InProgressAt *int `json:"in_progress_at,omitempty"`
	InputFileId *string `json:"input_file_id,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Object *string `json:"object,omitempty"`
	OutputFileId *string `json:"output_file_id,omitempty"`
	RequestCounts *map[string]interface{} `json:"request_counts,omitempty"`
	Status *string `json:"status,omitempty"`
}

type BenchmarkId string

const (
	BenchmarkIdAceBench BenchmarkId = "ace-bench"
	BenchmarkIdAi2Sciarena BenchmarkId = "ai2-sciarena"
	BenchmarkIdAi2d BenchmarkId = "ai2d"
	BenchmarkIdAidanbench BenchmarkId = "aidanbench"
	BenchmarkIdAiderPolyglot BenchmarkId = "aider-polyglot"
	BenchmarkIdAime2024 BenchmarkId = "aime-2024"
	BenchmarkIdAime2025 BenchmarkId = "aime-2025"
	BenchmarkIdAmc BenchmarkId = "amc"
	BenchmarkIdArcAgi1 BenchmarkId = "arc-agi-1"
	BenchmarkIdArcAgi2 BenchmarkId = "arc-agi-2"
	BenchmarkIdArenaHard BenchmarkId = "arena-hard"
	BenchmarkIdAutologi BenchmarkId = "autologi"
	BenchmarkIdBalrogAi BenchmarkId = "balrog-ai"
	BenchmarkIdBfclOverallFcV4 BenchmarkId = "bfcl-overall-fc-v4"
	BenchmarkIdBigcodebench BenchmarkId = "bigcodebench"
	BenchmarkIdBrowsecomp BenchmarkId = "browsecomp"
	BenchmarkIdBrowsecompLongContext128k BenchmarkId = "browsecomp-long-context-128k"
	BenchmarkIdBrowsecompLongContext256k BenchmarkId = "browsecomp-long-context-256k"
	BenchmarkIdCEval BenchmarkId = "c-eval"
	BenchmarkIdChartqa BenchmarkId = "chartqa"
	BenchmarkIdCharxivReasoning BenchmarkId = "charxiv-reasoning"
	BenchmarkIdCnmo2024 BenchmarkId = "cnmo-2024"
	BenchmarkIdCodeforces BenchmarkId = "codeforces"
	BenchmarkIdCollie BenchmarkId = "collie"
	BenchmarkIdConfabulations BenchmarkId = "confabulations"
	BenchmarkIdCreativeStoryWriting BenchmarkId = "creative-story-writing"
	BenchmarkIdCsimpleqa BenchmarkId = "csimpleqa"
	BenchmarkIdDocvqa BenchmarkId = "docvqa"
	BenchmarkIdDubesorLlm BenchmarkId = "dubesor-llm"
	BenchmarkIdEliminationGame BenchmarkId = "elimination-game"
	BenchmarkIdEqbench BenchmarkId = "eqbench"
	BenchmarkIdErqa BenchmarkId = "erqa"
	BenchmarkIdEvalplus BenchmarkId = "evalplus"
	BenchmarkIdFacts BenchmarkId = "facts"
	BenchmarkIdFactsBenchmarkSuite BenchmarkId = "facts-benchmark-suite"
	BenchmarkIdFactscoreHalluciationRate BenchmarkId = "factscore-halluciation-rate"
	BenchmarkIdFictionLiveBench BenchmarkId = "fiction-live-bench"
	BenchmarkIdFrontierMath BenchmarkId = "frontier-math"
	BenchmarkIdGalileoAgent BenchmarkId = "galileo-agent"
	BenchmarkIdGlobalPica BenchmarkId = "global-pica"
	BenchmarkIdGpqa BenchmarkId = "gpqa"
	BenchmarkIdGpqaDiamond BenchmarkId = "gpqa-diamond"
	BenchmarkIdGraphwalksBfsLt128k BenchmarkId = "graphwalks-bfs-lt-128k"
	BenchmarkIdGraphwalksParentsLt128k BenchmarkId = "graphwalks-parents-lt-128k"
	BenchmarkIdGsm8k BenchmarkId = "gsm8k"
	BenchmarkIdHealthbench BenchmarkId = "healthbench"
	BenchmarkIdHealthbenchConcensus BenchmarkId = "healthbench-concensus"
	BenchmarkIdHealthbenchHard BenchmarkId = "healthbench-hard"
	BenchmarkIdHmmt2025 BenchmarkId = "hmmt-2025"
	BenchmarkIdHumaneval BenchmarkId = "humaneval"
	BenchmarkIdHumanitysLastExam BenchmarkId = "humanitys-last-exam"
	BenchmarkIdIfBench BenchmarkId = "if-bench"
	BenchmarkIdIfEval BenchmarkId = "if-eval"
	BenchmarkIdImoanswerbench BenchmarkId = "imoanswerbench"
	BenchmarkIdIqBench BenchmarkId = "iq-bench"
	BenchmarkIdLisanbench BenchmarkId = "lisanbench"
	BenchmarkIdLivebench BenchmarkId = "livebench"
	BenchmarkIdLivecodebench BenchmarkId = "livecodebench"
	BenchmarkIdLivecodebenchCoding BenchmarkId = "livecodebench-coding"
	BenchmarkIdLivecodebenchPro BenchmarkId = "livecodebench-pro"
	BenchmarkIdLivecodebenchV5 BenchmarkId = "livecodebench-v5"
	BenchmarkIdLivecodebenchV6 BenchmarkId = "livecodebench-v6"
	BenchmarkIdLmarenaText BenchmarkId = "lmarena-text"
	BenchmarkIdLmarenaWebdev BenchmarkId = "lmarena-webdev"
	BenchmarkIdLongcodebench1m BenchmarkId = "longcodebench-1m"
	BenchmarkIdLongfactConceptsHallucinationRate BenchmarkId = "longfact-concepts-hallucination-rate"
	BenchmarkIdLongfactObjectsHallucinationRate BenchmarkId = "longfact-objects-hallucination-rate"
	BenchmarkIdMath BenchmarkId = "math"
	BenchmarkIdMath500 BenchmarkId = "math-500"
	BenchmarkIdMatharena BenchmarkId = "matharena"
	BenchmarkIdMatharenaApex BenchmarkId = "matharena-apex"
	BenchmarkIdMathvista BenchmarkId = "mathvista"
	BenchmarkIdMcBench BenchmarkId = "mc-bench"
	BenchmarkIdMetr BenchmarkId = "metr"
	BenchmarkIdMisguidedAttention BenchmarkId = "misguided-attention"
	BenchmarkIdMleBench BenchmarkId = "mle-bench"
	BenchmarkIdMmMtBench BenchmarkId = "mm-mt-bench"
	BenchmarkIdMmlu BenchmarkId = "mmlu"
	BenchmarkIdMmluMultilingual BenchmarkId = "mmlu-multilingual"
	BenchmarkIdMmluPro BenchmarkId = "mmlu-pro"
	BenchmarkIdMmluRedux BenchmarkId = "mmlu-redux"
	BenchmarkIdMmluRedux20 BenchmarkId = "mmlu-redux-2.0"
	BenchmarkIdMmmlu BenchmarkId = "mmmlu"
	BenchmarkIdMmmu BenchmarkId = "mmmu"
	BenchmarkIdMmmuPro BenchmarkId = "mmmu-pro"
	BenchmarkIdMultiChallenge BenchmarkId = "multi-challenge"
	BenchmarkIdMultiPLE BenchmarkId = "multiPL-E"
	BenchmarkIdNytConnections BenchmarkId = "nyt-connections"
	BenchmarkIdOcrbenchV2 BenchmarkId = "ocrbench-v2"
	BenchmarkIdOjbench BenchmarkId = "ojbench"
	BenchmarkIdOmnidocbench15 BenchmarkId = "omnidocbench-1.5"
	BenchmarkIdOpenaiMrcr2Needle128k BenchmarkId = "openai-mrcr-2-needle-128k"
	BenchmarkIdOpenaiMrcr2Needle256k BenchmarkId = "openai-mrcr-2-needle-256k"
	BenchmarkIdOpenaiMrcr8Needle128k BenchmarkId = "openai-mrcr-8-needle-128k"
	BenchmarkIdOpenaiMrcr8Needle1m BenchmarkId = "openai-mrcr-8-needle-1m"
	BenchmarkIdOsWorld BenchmarkId = "os-world"
	BenchmarkIdPaperbench BenchmarkId = "paperbench"
	BenchmarkIdPhybench BenchmarkId = "phybench"
	BenchmarkIdPolymathEn BenchmarkId = "polymath-en"
	BenchmarkIdQvhighlights BenchmarkId = "qvhighlights"
	BenchmarkIdRealkie BenchmarkId = "realkie"
	BenchmarkIdScaleMcpAtlas BenchmarkId = "scale-mcp-atlas"
	BenchmarkIdScreenspot BenchmarkId = "screenspot"
	BenchmarkIdScreenspotPro BenchmarkId = "screenspot-pro"
	BenchmarkIdSealMultichallenege BenchmarkId = "seal-multichallenege"
	BenchmarkIdSimplebench BenchmarkId = "simplebench"
	BenchmarkIdSimpleqa BenchmarkId = "simpleqa"
	BenchmarkIdSmolagentsLlm BenchmarkId = "smolagents-llm"
	BenchmarkIdSnakeBench BenchmarkId = "snake-bench"
	BenchmarkIdSoloBench BenchmarkId = "solo-bench"
	BenchmarkIdSupergpqa BenchmarkId = "supergpqa"
	BenchmarkIdSweBench BenchmarkId = "swe-bench"
	BenchmarkIdSweBenchLive BenchmarkId = "swe-bench-live"
	BenchmarkIdSweBenchMultilingual BenchmarkId = "swe-bench-multilingual"
	BenchmarkIdSweBenchPro BenchmarkId = "swe-bench-pro"
	BenchmarkIdSweLancer BenchmarkId = "swe-lancer"
	BenchmarkIdSymflowerCoding BenchmarkId = "symflower-coding"
	BenchmarkIdTau2Airline BenchmarkId = "tau-2-airline"
	BenchmarkIdTau2Bench BenchmarkId = "tau-2-bench"
	BenchmarkIdTau2Retail BenchmarkId = "tau-2-retail"
	BenchmarkIdTau2Telecom BenchmarkId = "tau-2-telecom"
	BenchmarkIdTauBench BenchmarkId = "tau-bench"
	BenchmarkIdTauBenchAirline BenchmarkId = "tau-bench-airline"
	BenchmarkIdTauBenchRetail BenchmarkId = "tau-bench-retail"
	BenchmarkIdTerminalBench BenchmarkId = "terminal-bench"
	BenchmarkIdTerminalBench20 BenchmarkId = "terminal-bench-2.0"
	BenchmarkIdThematicGeneralisation BenchmarkId = "thematic-generalisation"
	BenchmarkIdTriviaqa BenchmarkId = "triviaqa"
	BenchmarkIdUsamo2025 BenchmarkId = "usamo-2025"
	BenchmarkIdVendingBench2 BenchmarkId = "vending-bench-2"
	BenchmarkIdVideoMmmu BenchmarkId = "video-mmmu"
	BenchmarkIdVideomme BenchmarkId = "videomme"
	BenchmarkIdWeirdml BenchmarkId = "weirdml"
	BenchmarkIdWildbench BenchmarkId = "wildbench"
	BenchmarkIdXlangAgent BenchmarkId = "xlang-agent"
	BenchmarkIdZebralogic BenchmarkId = "zebralogic"
)


type ChatChoice struct {
	FinishReason *string `json:"finish_reason,omitempty"`
	Index *int `json:"index,omitempty"`
	Message *map[string]interface{} `json:"message,omitempty"`
}

type ChatCompletionsRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	FrequencyPenalty *float64 `json:"frequency_penalty,omitempty"`
	LogitBias *map[string]interface{} `json:"logit_bias,omitempty"`
	Logprobs *bool `json:"logprobs,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	MaxToolCalls *int `json:"max_tool_calls,omitempty"`
	Messages []map[string]interface{} `json:"messages"`
	Meta *bool `json:"meta,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PresencePenalty *float64 `json:"presence_penalty,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	ResponseFormat interface{} `json:"response_format,omitempty"`
	Seed *int `json:"seed,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	System *string `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]map[string]interface{} `json:"tools,omitempty"`
	TopK *int `json:"top_k,omitempty"`
	TopLogprobs *int `json:"top_logprobs,omitempty"`
	TopP *float64 `json:"top_p,omitempty"`
	Usage *bool `json:"usage,omitempty"`
	UserId *string `json:"user_id,omitempty"`
}

type ChatCompletionsResponse struct {
	Choices *[]map[string]interface{} `json:"choices,omitempty"`
	Created *int `json:"created,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type ChatMessage struct {
	Content interface{} `json:"content,omitempty"`
	Name *string `json:"name,omitempty"`
	Role string `json:"role"`
	ToolCallId *string `json:"tool_call_id,omitempty"`
	ToolCalls *[]map[string]interface{} `json:"tool_calls,omitempty"`
}

type DebugOptions struct {
	Enabled *bool `json:"enabled,omitempty"`
	ReturnUpstreamRequest *bool `json:"return_upstream_request,omitempty"`
	ReturnUpstreamResponse *bool `json:"return_upstream_response,omitempty"`
	Trace *bool `json:"trace,omitempty"`
	TraceLevel *string `json:"trace_level,omitempty"`
}

type Embedding struct {
	Embedding *[]float64 `json:"embedding,omitempty"`
	Index *int `json:"index,omitempty"`
	Object *string `json:"object,omitempty"`
}

type EmbeddingsRequest struct {
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Dimensions *int `json:"dimensions,omitempty"`
	EmbeddingOptions *map[string]interface{} `json:"embedding_options,omitempty"`
	EncodingFormat *string `json:"encoding_format,omitempty"`
	Input interface{} `json:"input,omitempty"`
	Inputs interface{} `json:"inputs,omitempty"`
	Model *string `json:"model,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	User *string `json:"user,omitempty"`
}

type EmbeddingsResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type ErrorResponse struct {
	Error *string `json:"error,omitempty"`
	Message *string `json:"message,omitempty"`
	Ok *bool `json:"ok,omitempty"`
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

type GenerationResponse struct {
	AppId *string `json:"app_id,omitempty"`
	Byok *bool `json:"byok,omitempty"`
	CostNanos *float64 `json:"cost_nanos,omitempty"`
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

type ListFilesResponse struct {
	Data *[]map[string]interface{} `json:"data,omitempty"`
	Object *string `json:"object,omitempty"`
}

type MessageContentPart = interface{}

type Model struct {
	Aliases *[]string `json:"aliases,omitempty"`
	Endpoints *[]string `json:"endpoints,omitempty"`
	InputTypes *[]string `json:"input_types,omitempty"`
	ModelId *string `json:"model_id,omitempty"`
	Name *string `json:"name,omitempty"`
	OrganisationId *string `json:"organisation_id,omitempty"`
	OutputTypes *[]string `json:"output_types,omitempty"`
	Providers *[]map[string]interface{} `json:"providers,omitempty"`
	ReleaseDate *string `json:"release_date,omitempty"`
	Status *string `json:"status,omitempty"`
}

type ModelId string

const (
	ModelIdAi21JambaLarge1520240822 ModelId = "ai21/jamba-large-1-5-2024-08-22"
	ModelIdAi21JambaLarge1620250306 ModelId = "ai21/jamba-large-1-6-2025-03-06"
	ModelIdAi21JambaLarge1720250703 ModelId = "ai21/jamba-large-1-7-2025-07-03"
	ModelIdAi21JambaMini1520240822 ModelId = "ai21/jamba-mini-1-5-2024-08-22"
	ModelIdAi21JambaMini1620250306 ModelId = "ai21/jamba-mini-1-6-2025-03-06"
	ModelIdAi21JambaMini1720250703 ModelId = "ai21/jamba-mini-1-7-2025-07-03"
	ModelIdAi21JambaReasoning3b20251008 ModelId = "ai21/jamba-reasoning-3b-2025-10-08"
	ModelIdAmazonNova2Lite20251202 ModelId = "amazon/nova-2-lite-2025-12-02"
	ModelIdAmazonNova2Omni20251202 ModelId = "amazon/nova-2-omni-2025-12-02"
	ModelIdAmazonNova2Pro20251202 ModelId = "amazon/nova-2-pro-2025-12-02"
	ModelIdAmazonNova2Sonic20251202 ModelId = "amazon/nova-2-sonic-2025-12-02"
	ModelIdAmazonNovaCanvas ModelId = "amazon/nova-canvas"
	ModelIdAmazonNovaLite1020241204 ModelId = "amazon/nova-lite-1-0-2024-12-04"
	ModelIdAmazonNovaMicro1020241204 ModelId = "amazon/nova-micro-1-0-2024-12-04"
	ModelIdAmazonNovaMultimodalEmbeddings20251202 ModelId = "amazon/nova-multimodal-embeddings-2025-12-02"
	ModelIdAmazonNovaPremier20250430 ModelId = "amazon/nova-premier-2025-04-30"
	ModelIdAmazonNovaPro1020241204 ModelId = "amazon/nova-pro-1-0-2024-12-04"
	ModelIdAmazonNovaReel ModelId = "amazon/nova-reel"
	ModelIdAmazonNovaSonic ModelId = "amazon/nova-sonic"
	ModelIdAnthropicClaude1020230314 ModelId = "anthropic/claude-1-0-2023-03-14"
	ModelIdAnthropicClaude11 ModelId = "anthropic/claude-1-1"
	ModelIdAnthropicClaude12 ModelId = "anthropic/claude-1-2"
	ModelIdAnthropicClaude13 ModelId = "anthropic/claude-1-3"
	ModelIdAnthropicClaude2020230712 ModelId = "anthropic/claude-2-0-2023-07-12"
	ModelIdAnthropicClaude2120231122 ModelId = "anthropic/claude-2-1-2023-11-22"
	ModelIdAnthropicClaude35Haiku20241104 ModelId = "anthropic/claude-3-5-haiku-2024-11-04"
	ModelIdAnthropicClaude35Sonnet20240621 ModelId = "anthropic/claude-3-5-sonnet-2024-06-21"
	ModelIdAnthropicClaude35Sonnet20241022 ModelId = "anthropic/claude-3-5-sonnet-2024-10-22"
	ModelIdAnthropicClaude37Sonnet20250224 ModelId = "anthropic/claude-3-7-sonnet-2025-02-24"
	ModelIdAnthropicClaude3Haiku20240313 ModelId = "anthropic/claude-3-haiku-2024-03-13"
	ModelIdAnthropicClaude3Opus20240304 ModelId = "anthropic/claude-3-opus-2024-03-04"
	ModelIdAnthropicClaude3Sonnet20240304 ModelId = "anthropic/claude-3-sonnet-2024-03-04"
	ModelIdAnthropicClaudeHaiku4520251015 ModelId = "anthropic/claude-haiku-4-5-2025-10-15"
	ModelIdAnthropicClaudeInstant1020230314 ModelId = "anthropic/claude-instant-1-0-2023-03-14"
	ModelIdAnthropicClaudeInstant11 ModelId = "anthropic/claude-instant-1-1"
	ModelIdAnthropicClaudeInstant1220230809 ModelId = "anthropic/claude-instant-1-2-2023-08-09"
	ModelIdAnthropicClaudeOpus4120250805 ModelId = "anthropic/claude-opus-4-1-2025-08-05"
	ModelIdAnthropicClaudeOpus420250521 ModelId = "anthropic/claude-opus-4-2025-05-21"
	ModelIdAnthropicClaudeOpus4520251124 ModelId = "anthropic/claude-opus-4-5-2025-11-24"
	ModelIdAnthropicClaudeSonnet420250521 ModelId = "anthropic/claude-sonnet-4-2025-05-21"
	ModelIdAnthropicClaudeSonnet4520250929 ModelId = "anthropic/claude-sonnet-4-5-2025-09-29"
	ModelIdBaiduErnie4521bA3b ModelId = "baidu/ernie-4-5-21b-a3b"
	ModelIdBaiduErnie4521bA3bThinking ModelId = "baidu/ernie-4-5-21b-a3b-thinking"
	ModelIdBaiduErnie45300bA47b ModelId = "baidu/ernie-4-5-300b-a47b"
	ModelIdBaiduErnie45Vl28bA3b ModelId = "baidu/ernie-4-5-vl-28b-a3b"
	ModelIdBaiduErnie45Vl424bA47b ModelId = "baidu/ernie-4-5-vl-424b-a47b"
	ModelIdBaiduQianfanVl3b ModelId = "baidu/qianfan-vl-3b"
	ModelIdBaiduQianfanVl70b ModelId = "baidu/qianfan-vl-70b"
	ModelIdBaiduQianfanVl8b ModelId = "baidu/qianfan-vl-8b"
	ModelIdBytedanceSeedCoder8bInstruct ModelId = "bytedance/seed-coder-8b-instruct"
	ModelIdBytedanceSeedCoder8bReasoning ModelId = "bytedance/seed-coder-8b-reasoning"
	ModelIdBytedanceSeedOss36bInstruct ModelId = "bytedance/seed-oss-36b-instruct"
	ModelIdCohereC4aiAyaExpanse32b ModelId = "cohere/c4ai-aya-expanse-32b"
	ModelIdCohereC4aiAyaExpanse8b ModelId = "cohere/c4ai-aya-expanse-8b"
	ModelIdCohereC4aiAyaVision32b ModelId = "cohere/c4ai-aya-vision-32b"
	ModelIdCohereC4aiAyaVision8b ModelId = "cohere/c4ai-aya-vision-8b"
	ModelIdCohereCommand ModelId = "cohere/command"
	ModelIdCohereCommandA20250313 ModelId = "cohere/command-a-2025-03-13"
	ModelIdCohereCommandAReasoning20250821 ModelId = "cohere/command-a-reasoning-2025-08-21"
	ModelIdCohereCommandATranslate20250828 ModelId = "cohere/command-a-translate-2025-08-28"
	ModelIdCohereCommandAVision20250731 ModelId = "cohere/command-a-vision-2025-07-31"
	ModelIdCohereCommandLight ModelId = "cohere/command-light"
	ModelIdCohereCommandR20240311 ModelId = "cohere/command-r-2024-03-11"
	ModelIdCohereCommandR20240830 ModelId = "cohere/command-r-2024-08-30"
	ModelIdCohereCommandR7b20241213 ModelId = "cohere/command-r-7b-2024-12-13"
	ModelIdCohereCommandR20240404 ModelId = "cohere/command-r+-2024-04-04"
	ModelIdCohereCommandR202408302 ModelId = "cohere/command-r+-2024-08-30"
	ModelIdCohereEmbedEnglishLightV20 ModelId = "cohere/embed-english-light-v2-0"
	ModelIdCohereEmbedEnglishLightV3 ModelId = "cohere/embed-english-light-v3"
	ModelIdCohereEmbedEnglishV20 ModelId = "cohere/embed-english-v2-0"
	ModelIdCohereEmbedEnglishV3 ModelId = "cohere/embed-english-v3"
	ModelIdCohereEmbedMultilingualLightV3 ModelId = "cohere/embed-multilingual-light-v3"
	ModelIdCohereEmbedMultilingualV20 ModelId = "cohere/embed-multilingual-v2-0"
	ModelIdCohereEmbedMultilingualV3 ModelId = "cohere/embed-multilingual-v3"
	ModelIdCohereEmbedV4 ModelId = "cohere/embed-v4"
	ModelIdCohereRerankMultilingualV3 ModelId = "cohere/rerank-multilingual-v3"
	ModelIdCohereRerankV35 ModelId = "cohere/rerank-v3-5"
	ModelIdCohereRerenkEnglishV3 ModelId = "cohere/rerenk-english-v3"
	ModelIdDeepseekDeepseekCoderV220240614 ModelId = "deepseek/deepseek-coder-v2-2024-06-14"
	ModelIdDeepseekDeepseekCoderV220240724 ModelId = "deepseek/deepseek-coder-v2-2024-07-24"
	ModelIdDeepseekDeepseekOcr20251020 ModelId = "deepseek/deepseek-ocr-2025-10-20"
	ModelIdDeepseekDeepseekR120250120 ModelId = "deepseek/deepseek-r1-2025-01-20"
	ModelIdDeepseekDeepseekR120250528 ModelId = "deepseek/deepseek-r1-2025-05-28"
	ModelIdDeepseekDeepseekR1LitePreview ModelId = "deepseek/deepseek-r1-lite-preview"
	ModelIdDeepseekDeepseekV220240517 ModelId = "deepseek/deepseek-v2-2024-05-17"
	ModelIdDeepseekDeepseekV220240628 ModelId = "deepseek/deepseek-v2-2024-06-28"
	ModelIdDeepseekDeepseekV25 ModelId = "deepseek/deepseek-v2-5"
	ModelIdDeepseekDeepseekV2520240508 ModelId = "deepseek/deepseek-v2-5-2024-05-08"
	ModelIdDeepseekDeepseekV31 ModelId = "deepseek/deepseek-v3-1"
	ModelIdDeepseekDeepseekV31Terminus20250922 ModelId = "deepseek/deepseek-v3-1-terminus-2025-09-22"
	ModelIdDeepseekDeepseekV3220251201 ModelId = "deepseek/deepseek-v3-2-2025-12-01"
	ModelIdDeepseekDeepseekV32Exp20250929 ModelId = "deepseek/deepseek-v3-2-exp-2025-09-29"
	ModelIdDeepseekDeepseekV32Speciale20251201 ModelId = "deepseek/deepseek-v3-2-speciale-2025-12-01"
	ModelIdDeepseekDeepseekV320241225 ModelId = "deepseek/deepseek-v3-2024-12-25"
	ModelIdDeepseekDeepseekV320250325 ModelId = "deepseek/deepseek-v3-2025-03-25"
	ModelIdDeepseekDeepseekVl220241213 ModelId = "deepseek/deepseek-vl2-2024-12-13"
	ModelIdDeepseekDeepseekVl2Small20241213 ModelId = "deepseek/deepseek-vl2-small-2024-12-13"
	ModelIdDeepseekDeepseekVl2Tiny20241213 ModelId = "deepseek/deepseek-vl2-tiny-2024-12-13"
	ModelIdEssentialAiRnj120251206 ModelId = "essential-ai/rnj-1-2025-12-06"
	ModelIdGoogleChatBison ModelId = "google/chat-bison"
	ModelIdGoogleCodeGecko ModelId = "google/code-gecko"
	ModelIdGoogleEmbedding00120231213 ModelId = "google/embedding-001-2023-12-13"
	ModelIdGoogleGemini10Nano20231206 ModelId = "google/gemini-1-0-nano-2023-12-06"
	ModelIdGoogleGemini10Pro20231206 ModelId = "google/gemini-1-0-pro-2023-12-06"
	ModelIdGoogleGemini10ProVision001 ModelId = "google/gemini-1-0-pro-vision-001"
	ModelIdGoogleGemini10Ultra20231206 ModelId = "google/gemini-1-0-ultra-2023-12-06"
	ModelIdGoogleGemini15Flash00120240523 ModelId = "google/gemini-1-5-flash-001-2024-05-23"
	ModelIdGoogleGemini15Flash00220240924 ModelId = "google/gemini-1-5-flash-002-2024-09-24"
	ModelIdGoogleGemini15Flash8b20240315 ModelId = "google/gemini-1-5-flash-8b-2024-03-15"
	ModelIdGoogleGemini15Flash8bExp20240827 ModelId = "google/gemini-1-5-flash-8b-exp-2024-08-27"
	ModelIdGoogleGemini15Flash8bExp20240924 ModelId = "google/gemini-1-5-flash-8b-exp-2024-09-24"
	ModelIdGoogleGemini15Pro00120240523 ModelId = "google/gemini-1-5-pro-001-2024-05-23"
	ModelIdGoogleGemini15Pro00220240924 ModelId = "google/gemini-1-5-pro-002-2024-09-24"
	ModelIdGoogleGemini15ProExp20240801 ModelId = "google/gemini-1-5-pro-exp-2024-08-01"
	ModelIdGoogleGemini15ProExp20240827 ModelId = "google/gemini-1-5-pro-exp-2024-08-27"
	ModelIdGoogleGemini20Flash20250205 ModelId = "google/gemini-2-0-flash-2025-02-05"
	ModelIdGoogleGemini20FlashExp ModelId = "google/gemini-2-0-flash-exp"
	ModelIdGoogleGemini20FlashExpImageGeneration ModelId = "google/gemini-2-0-flash-exp-image-generation"
	ModelIdGoogleGemini20FlashLite20250205 ModelId = "google/gemini-2-0-flash-lite-2025-02-05"
	ModelIdGoogleGemini20FlashLive00120250409 ModelId = "google/gemini-2-0-flash-live-001-2025-04-09"
	ModelIdGoogleGemini20FlashPreviewImageGeneration20250507 ModelId = "google/gemini-2-0-flash-preview-image-generation-2025-05-07"
	ModelIdGoogleGemini20FlashThinkingExp20241219 ModelId = "google/gemini-2-0-flash-thinking-exp-2024-12-19"
	ModelIdGoogleGemini20FlashThinkingExp20250121 ModelId = "google/gemini-2-0-flash-thinking-exp-2025-01-21"
	ModelIdGoogleGemini20ProExp20250205 ModelId = "google/gemini-2-0-pro-exp-2025-02-05"
	ModelIdGoogleGemini25ComputerUsePreview20251007 ModelId = "google/gemini-2-5-computer-use-preview-2025-10-07"
	ModelIdGoogleGemini25FlashExpNativeAudioThinkingDialog ModelId = "google/gemini-2-5-flash-exp-native-audio-thinking-dialog"
	ModelIdGoogleGemini25FlashImagePreview ModelId = "google/gemini-2-5-flash-image-preview"
	ModelIdGoogleGemini25FlashLitePreview20250617 ModelId = "google/gemini-2-5-flash-lite-preview-2025-06-17"
	ModelIdGoogleGemini25FlashLitePreview20250925 ModelId = "google/gemini-2-5-flash-lite-preview-2025-09-25"
	ModelIdGoogleGemini25FlashNativeAudioPreview ModelId = "google/gemini-2-5-flash-native-audio-preview"
	ModelIdGoogleGemini25FlashPreview20250417 ModelId = "google/gemini-2-5-flash-preview-2025-04-17"
	ModelIdGoogleGemini25FlashPreview20250520 ModelId = "google/gemini-2-5-flash-preview-2025-05-20"
	ModelIdGoogleGemini25FlashPreview20250925 ModelId = "google/gemini-2-5-flash-preview-2025-09-25"
	ModelIdGoogleGemini25FlashPreviewNativeAudioDialog ModelId = "google/gemini-2-5-flash-preview-native-audio-dialog"
	ModelIdGoogleGemini25FlashPreviewTts ModelId = "google/gemini-2-5-flash-preview-tts"
	ModelIdGoogleGemini25FlashPreviewTts20251210 ModelId = "google/gemini-2-5-flash-preview-tts-2025-12-10"
	ModelIdGoogleGemini25ProExperimental ModelId = "google/gemini-2-5-pro-experimental"
	ModelIdGoogleGemini25ProPreview20250506 ModelId = "google/gemini-2-5-pro-preview-2025-05-06"
	ModelIdGoogleGemini25ProPreview20250605 ModelId = "google/gemini-2-5-pro-preview-2025-06-05"
	ModelIdGoogleGemini25ProPreviewTts ModelId = "google/gemini-2-5-pro-preview-tts"
	ModelIdGoogleGemini25ProPreviewTts20251210 ModelId = "google/gemini-2-5-pro-preview-tts-2025-12-10"
	ModelIdGoogleGemini30Flash ModelId = "google/gemini-3-0-flash"
	ModelIdGoogleGemini30FlashLite ModelId = "google/gemini-3-0-flash-lite"
	ModelIdGoogleGemini30ProPreview20251118 ModelId = "google/gemini-3-0-pro-preview-2025-11-18"
	ModelIdGoogleGemini3FlashImage ModelId = "google/gemini-3-flash-image"
	ModelIdGoogleGemini3ProImagePreview20251120 ModelId = "google/gemini-3-pro-image-preview-2025-11-20"
	ModelIdGoogleGeminiDiffusion ModelId = "google/gemini-diffusion"
	ModelIdGoogleGeminiEmbedding00120250520 ModelId = "google/gemini-embedding-001-2025-05-20"
	ModelIdGoogleGeminiEmbeddingExp030720250307 ModelId = "google/gemini-embedding-exp-0307-2025-03-07"
	ModelIdGoogleGeminiExp111420241114 ModelId = "google/gemini-exp-1114-2024-11-14"
	ModelIdGoogleGeminiExp112120241121 ModelId = "google/gemini-exp-1121-2024-11-21"
	ModelIdGoogleGeminiExp1206 ModelId = "google/gemini-exp-1206"
	ModelIdGoogleGeminiLive25FlashPreview20250409 ModelId = "google/gemini-live-2-5-flash-preview-2025-04-09"
	ModelIdGoogleGeminiRoboticsEr15Preview ModelId = "google/gemini-robotics-er-1-5-preview"
	ModelIdGoogleGemma12b20240221 ModelId = "google/gemma-1-2b-2024-02-21"
	ModelIdGoogleGemma17b20240221 ModelId = "google/gemma-1-7b-2024-02-21"
	ModelIdGoogleGemma227b20240627 ModelId = "google/gemma-2-27b-2024-06-27"
	ModelIdGoogleGemma22b20240731 ModelId = "google/gemma-2-2b-2024-07-31"
	ModelIdGoogleGemma29b20240627 ModelId = "google/gemma-2-9b-2024-06-27"
	ModelIdGoogleGemma312b20250312 ModelId = "google/gemma-3-12b-2025-03-12"
	ModelIdGoogleGemma31b20250312 ModelId = "google/gemma-3-1b-2025-03-12"
	ModelIdGoogleGemma327b20250312 ModelId = "google/gemma-3-27b-2025-03-12"
	ModelIdGoogleGemma34b20250312 ModelId = "google/gemma-3-4b-2025-03-12"
	ModelIdGoogleGemma3nE2b ModelId = "google/gemma-3n-e2b"
	ModelIdGoogleGemma3nE4b20250520 ModelId = "google/gemma-3n-e4b-2025-05-20"
	ModelIdGoogleImageGeneration002 ModelId = "google/image-generation-002"
	ModelIdGoogleImageGeneration005 ModelId = "google/image-generation-005"
	ModelIdGoogleImageGeneration006 ModelId = "google/image-generation-006"
	ModelIdGoogleImageText ModelId = "google/image-text"
	ModelIdGoogleImagen30Generate001 ModelId = "google/imagen-3-0-generate-001"
	ModelIdGoogleImagen30Generate00220250206 ModelId = "google/imagen-3-0-generate-002-2025-02-06"
	ModelIdGoogleImagen40FastGenerate001 ModelId = "google/imagen-4-0-fast-generate-001"
	ModelIdGoogleImagen40Generate00120250814 ModelId = "google/imagen-4-0-generate-001-2025-08-14"
	ModelIdGoogleImagen40UltraGenerate00120250814 ModelId = "google/imagen-4-0-ultra-generate-001-2025-08-14"
	ModelIdGoogleImagen4Preview ModelId = "google/imagen-4-preview"
	ModelIdGoogleImagen4UltraPreview20250814 ModelId = "google/imagen-4-ultra-preview-2025-08-14"
	ModelIdGoogleLearnlm15ProExperimental ModelId = "google/learnlm-1-5-pro-experimental"
	ModelIdGoogleLearnlm20FlashExperimental ModelId = "google/learnlm-2-0-flash-experimental"
	ModelIdGoogleMultimodalEmbedding001 ModelId = "google/multimodal-embedding-001"
	ModelIdGoogleTextBison ModelId = "google/text-bison"
	ModelIdGoogleTextEmbedding004 ModelId = "google/text-embedding-004"
	ModelIdGoogleTextEmbedding005 ModelId = "google/text-embedding-005"
	ModelIdGoogleTextEmbeddingGecko00120231213 ModelId = "google/text-embedding-gecko-001-2023-12-13"
	ModelIdGoogleTextEmbeddingGecko002 ModelId = "google/text-embedding-gecko-002"
	ModelIdGoogleTextEmbeddingGecko003 ModelId = "google/text-embedding-gecko-003"
	ModelIdGoogleTextEmbeddingGeckoMultilingual001 ModelId = "google/text-embedding-gecko-multilingual-001"
	ModelIdGoogleTextMultilingualEmbedding002 ModelId = "google/text-multilingual-embedding-002"
	ModelIdGoogleVeo220250409 ModelId = "google/veo-2-2025-04-09"
	ModelIdGoogleVeo30FastGeneratePreview20250717 ModelId = "google/veo-3-0-fast-generate-preview-2025-07-17"
	ModelIdGoogleVeo30GeneratePreview20250717 ModelId = "google/veo-3-0-generate-preview-2025-07-17"
	ModelIdGoogleVeo31FastPreview20251015 ModelId = "google/veo-3-1-fast-preview-2025-10-15"
	ModelIdGoogleVeo31Preview20251015 ModelId = "google/veo-3-1-preview-2025-10-15"
	ModelIdGoogleVeo320250909 ModelId = "google/veo-3-2025-09-09"
	ModelIdGoogleVeo3Fast20250909 ModelId = "google/veo-3-fast-2025-09-09"
	ModelIdGoogleVeo4 ModelId = "google/veo-4"
	ModelIdIbmGranite20bCodeInstruct8k ModelId = "ibm/granite-20b-code-instruct-8k"
	ModelIdIbmGranite301bA400mInstruct ModelId = "ibm/granite-3-0-1b-a400m-instruct"
	ModelIdIbmGranite302bInstruct ModelId = "ibm/granite-3-0-2b-instruct"
	ModelIdIbmGranite303bA800mInstruct ModelId = "ibm/granite-3-0-3b-a800m-instruct"
	ModelIdIbmGranite308bInstruct ModelId = "ibm/granite-3-0-8b-instruct"
	ModelIdIbmGranite311bA400mInstruct ModelId = "ibm/granite-3-1-1b-a400m-instruct"
	ModelIdIbmGranite312bInstruct ModelId = "ibm/granite-3-1-2b-instruct"
	ModelIdIbmGranite313bA800mInstruct ModelId = "ibm/granite-3-1-3b-a800m-instruct"
	ModelIdIbmGranite318bInstruct ModelId = "ibm/granite-3-1-8b-instruct"
	ModelIdIbmGranite322bInstruct ModelId = "ibm/granite-3-2-2b-instruct"
	ModelIdIbmGranite328bInstruct ModelId = "ibm/granite-3-2-8b-instruct"
	ModelIdIbmGranite328bInstructPreview ModelId = "ibm/granite-3-2-8b-instruct-preview"
	ModelIdIbmGranite332bInstruct20250416 ModelId = "ibm/granite-3-3-2b-instruct-2025-04-16"
	ModelIdIbmGranite338bInstruct20250416 ModelId = "ibm/granite-3-3-8b-instruct-2025-04-16"
	ModelIdIbmGranite34bCodeInstruct8b ModelId = "ibm/granite-34b-code-instruct-8b"
	ModelIdIbmGranite3bCodeInstruct128k ModelId = "ibm/granite-3b-code-instruct-128k"
	ModelIdIbmGranite3bCodeInstruct2k ModelId = "ibm/granite-3b-code-instruct-2k"
	ModelIdIbmGranite40Micro20251002 ModelId = "ibm/granite-4-0-micro-2025-10-02"
	ModelIdIbmGranite40Small20251002 ModelId = "ibm/granite-4-0-small-2025-10-02"
	ModelIdIbmGranite40Tiny20251002 ModelId = "ibm/granite-4-0-tiny-2025-10-02"
	ModelIdIbmGranite40TinyPreview20250502 ModelId = "ibm/granite-4-0-tiny-preview-2025-05-02"
	ModelIdIbmGranite8bCodeInstruct128k ModelId = "ibm/granite-8b-code-instruct-128k"
	ModelIdIbmGranite8bCodeInstruct4k ModelId = "ibm/granite-8b-code-instruct-4k"
	ModelIdIbmGraniteEmbedding107mMultilingual ModelId = "ibm/granite-embedding-107m-multilingual"
	ModelIdIbmGraniteEmbedding125mEnglish ModelId = "ibm/granite-embedding-125m-english"
	ModelIdIbmGraniteEmbedding278mMultilingual ModelId = "ibm/granite-embedding-278m-multilingual"
	ModelIdIbmGraniteEmbedding30mEnglish ModelId = "ibm/granite-embedding-30m-english"
	ModelIdIbmGraniteEmbeddingEnglishR2 ModelId = "ibm/granite-embedding-english-r2"
	ModelIdIbmGraniteEmbeddingRerankerEnglishR2 ModelId = "ibm/granite-embedding-reranker-english-r2"
	ModelIdIbmGraniteEmbeddingSmallEnglishR2 ModelId = "ibm/granite-embedding-small-english-r2"
	ModelIdIbmGraniteGuardian302b ModelId = "ibm/granite-guardian-3-0-2b"
	ModelIdIbmGraniteGuardian308b ModelId = "ibm/granite-guardian-3-0-8b"
	ModelIdIbmGraniteGuardian312b ModelId = "ibm/granite-guardian-3-1-2b"
	ModelIdIbmGraniteGuardian318b ModelId = "ibm/granite-guardian-3-1-8b"
	ModelIdIbmGraniteGuardian325b ModelId = "ibm/granite-guardian-3-2-5b"
	ModelIdIbmGraniteGuardian338b ModelId = "ibm/granite-guardian-3-3-8b"
	ModelIdIbmGraniteSpeech328b ModelId = "ibm/granite-speech-3-2-8b"
	ModelIdIbmGraniteSpeech332b ModelId = "ibm/granite-speech-3-3-2b"
	ModelIdIbmGraniteSpeech338b ModelId = "ibm/granite-speech-3-3-8b"
	ModelIdIbmGraniteVision312bPreview ModelId = "ibm/granite-vision-3-1-2b-preview"
	ModelIdIbmGraniteVision322b ModelId = "ibm/granite-vision-3-2-2b"
	ModelIdIbmGraniteVision332b ModelId = "ibm/granite-vision-3-3-2b"
	ModelIdIbmGraniteVision332bEmbedding ModelId = "ibm/granite-vision-3-3-2b-embedding"
	ModelIdLgExaone3020240807 ModelId = "lg/exaone-3-0-2024-08-07"
	ModelIdLgExaone3524b20241209 ModelId = "lg/exaone-3-5-2-4b-2024-12-09"
	ModelIdLgExaone3532b20241209 ModelId = "lg/exaone-3-5-32b-2024-12-09"
	ModelIdLgExaone3578b20241209 ModelId = "lg/exaone-3-5-7-8b-2024-12-09"
	ModelIdLgExaone4012b20250715 ModelId = "lg/exaone-4-0-1-2b-2025-07-15"
	ModelIdLgExaone4032b20250715 ModelId = "lg/exaone-4-0-32b-2025-07-15"
	ModelIdLgExaoneDeep24b20250318 ModelId = "lg/exaone-deep-2-4b-2025-03-18"
	ModelIdLgExaoneDeep32b20250318 ModelId = "lg/exaone-deep-32b-2025-03-18"
	ModelIdLgExaoneDeep78b20250318 ModelId = "lg/exaone-deep-7-8b-2025-03-18"
	ModelIdMetaLlama213bChat20230620 ModelId = "meta/llama-2-13b-chat-2023-06-20"
	ModelIdMetaLlama270bChat20230620 ModelId = "meta/llama-2-70b-chat-2023-06-20"
	ModelIdMetaLlama27bChat ModelId = "meta/llama-2-7b-chat"
	ModelIdMetaLlama31405bInstruct20240723 ModelId = "meta/llama-3-1-405b-instruct-2024-07-23"
	ModelIdMetaLlama3170bInstruct20240723 ModelId = "meta/llama-3-1-70b-instruct-2024-07-23"
	ModelIdMetaLlama318bInstruct20240723 ModelId = "meta/llama-3-1-8b-instruct-2024-07-23"
	ModelIdMetaLlama3211bVisionInstruct ModelId = "meta/llama-3-2-11b-vision-instruct"
	ModelIdMetaLlama321bInstruct20240925 ModelId = "meta/llama-3-2-1b-instruct-2024-09-25"
	ModelIdMetaLlama323bInstruct20240925 ModelId = "meta/llama-3-2-3b-instruct-2024-09-25"
	ModelIdMetaLlama3290bVisionInstruct ModelId = "meta/llama-3-2-90b-vision-instruct"
	ModelIdMetaLlama3370bInstruct20241206 ModelId = "meta/llama-3-3-70b-instruct-2024-12-06"
	ModelIdMetaLlama370bInstruct20240418 ModelId = "meta/llama-3-70b-instruct-2024-04-18"
	ModelIdMetaLlama38bInstruct20240418 ModelId = "meta/llama-3-8b-instruct-2024-04-18"
	ModelIdMetaLlama4Maverick20250405 ModelId = "meta/llama-4-maverick-2025-04-05"
	ModelIdMetaLlama4Scout20250405 ModelId = "meta/llama-4-scout-2025-04-05"
	ModelIdMicrosoftPhi1 ModelId = "microsoft/phi-1"
	ModelIdMicrosoftPhi15 ModelId = "microsoft/phi-1-5"
	ModelIdMicrosoftPhi2 ModelId = "microsoft/phi-2"
	ModelIdMicrosoftPhi35MiniInstruct20240823 ModelId = "microsoft/phi-3-5-mini-instruct-2024-08-23"
	ModelIdMicrosoftPhi35MoeInstruct20240823 ModelId = "microsoft/phi-3-5-moe-instruct-2024-08-23"
	ModelIdMicrosoftPhi35VisionInstruct20240823 ModelId = "microsoft/phi-3-5-vision-instruct-2024-08-23"
	ModelIdMicrosoftPhi3Medium128kInstruct ModelId = "microsoft/phi-3-medium-128k-instruct"
	ModelIdMicrosoftPhi3Medium4kInstruct ModelId = "microsoft/phi-3-medium-4k-instruct"
	ModelIdMicrosoftPhi3Mini128kInstruct ModelId = "microsoft/phi-3-mini-128k-instruct"
	ModelIdMicrosoftPhi3Small128kInstruct ModelId = "microsoft/phi-3-small-128k-instruct"
	ModelIdMicrosoftPhi3Small8kInstruct ModelId = "microsoft/phi-3-small-8k-instruct"
	ModelIdMicrosoftPhi3Vision128kInstruct ModelId = "microsoft/phi-3-vision-128k-instruct"
	ModelIdMicrosoftPhi420241212 ModelId = "microsoft/phi-4-2024-12-12"
	ModelIdMicrosoftPhi4Mini20250201 ModelId = "microsoft/phi-4-mini-2025-02-01"
	ModelIdMicrosoftPhi4MiniFlashReasoning ModelId = "microsoft/phi-4-mini-flash-reasoning"
	ModelIdMicrosoftPhi4MiniReasoning20250430 ModelId = "microsoft/phi-4-mini-reasoning-2025-04-30"
	ModelIdMicrosoftPhi4MultimodalInstruct20250201 ModelId = "microsoft/phi-4-multimodal-instruct-2025-02-01"
	ModelIdMicrosoftPhi4Reasoning20250430 ModelId = "microsoft/phi-4-reasoning-2025-04-30"
	ModelIdMicrosoftPhi4ReasoningPlus20250430 ModelId = "microsoft/phi-4-reasoning-plus-2025-04-30"
	ModelIdMinimaxHailuo02 ModelId = "minimax/hailuo-02"
	ModelIdMinimaxI2v01Director ModelId = "minimax/i2v-01-director"
	ModelIdMinimaxI2v01Live ModelId = "minimax/i2v-01-live"
	ModelIdMinimaxImage01 ModelId = "minimax/image-01"
	ModelIdMinimaxMinimaxM120250616 ModelId = "minimax/minimax-m1-2025-06-16"
	ModelIdMinimaxMinimaxM140k ModelId = "minimax/minimax-m1-40k"
	ModelIdMinimaxMinimaxM21 ModelId = "minimax/minimax-m2-1"
	ModelIdMinimaxMinimaxM220251027 ModelId = "minimax/minimax-m2-2025-10-27"
	ModelIdMinimaxMinimaxText01 ModelId = "minimax/minimax-text-01"
	ModelIdMinimaxMinimaxVl01 ModelId = "minimax/minimax-vl-01"
	ModelIdMinimaxMusic15 ModelId = "minimax/music-1-5"
	ModelIdMinimaxS2v01 ModelId = "minimax/s2v-01"
	ModelIdMinimaxSpeech01Hd ModelId = "minimax/speech-01-hd"
	ModelIdMinimaxSpeech01Turbo ModelId = "minimax/speech-01-turbo"
	ModelIdMinimaxSpeech02Hd ModelId = "minimax/speech-02-hd"
	ModelIdMinimaxSpeech02Turbo ModelId = "minimax/speech-02-turbo"
	ModelIdMinimaxSpeech25HdPreview ModelId = "minimax/speech-2-5-hd-preview"
	ModelIdMinimaxSpeech25TurboPreview ModelId = "minimax/speech-2-5-turbo-preview"
	ModelIdMinimaxT2v01Director ModelId = "minimax/t2v-01-director"
	ModelIdMistralCodestral22b20240529 ModelId = "mistral/codestral-22b-2024-05-29"
	ModelIdMistralCodestral2405 ModelId = "mistral/codestral-2405"
	ModelIdMistralCodestral2501 ModelId = "mistral/codestral-2501"
	ModelIdMistralCodestral2508 ModelId = "mistral/codestral-2508"
	ModelIdMistralCodestralEmbed ModelId = "mistral/codestral-embed"
	ModelIdMistralDevstral220251209 ModelId = "mistral/devstral-2-2025-12-09"
	ModelIdMistralDevstralMedium1120250710 ModelId = "mistral/devstral-medium-1-1-2025-07-10"
	ModelIdMistralDevstralSmall ModelId = "mistral/devstral-small"
	ModelIdMistralDevstralSmall1120250710 ModelId = "mistral/devstral-small-1-1-2025-07-10"
	ModelIdMistralDevstralSmall220251209 ModelId = "mistral/devstral-small-2-2025-12-09"
	ModelIdMistralMagistralMedium20250610 ModelId = "mistral/magistral-medium-2025-06-10"
	ModelIdMistralMagistralMedium2507 ModelId = "mistral/magistral-medium-2507"
	ModelIdMistralMagistralMedium2509 ModelId = "mistral/magistral-medium-2509"
	ModelIdMistralMagistralSmall20250610 ModelId = "mistral/magistral-small-2025-06-10"
	ModelIdMistralMagistralSmall2507 ModelId = "mistral/magistral-small-2507"
	ModelIdMistralMagistralSmall2509 ModelId = "mistral/magistral-small-2509"
	ModelIdMistralMambaCodestral7b ModelId = "mistral/mamba-codestral-7b"
	ModelIdMistralMathstral7b ModelId = "mistral/mathstral-7b"
	ModelIdMistralMinistral314b20251202 ModelId = "mistral/ministral-3-14b-2025-12-02"
	ModelIdMistralMinistral33b20251202 ModelId = "mistral/ministral-3-3b-2025-12-02"
	ModelIdMistralMinistral38b20251202 ModelId = "mistral/ministral-3-8b-2025-12-02"
	ModelIdMistralMinistral3b2410 ModelId = "mistral/ministral-3b-2410"
	ModelIdMistralMinistral8b2410 ModelId = "mistral/ministral-8b-2410"
	ModelIdMistralMinistral8bInstruct20241016 ModelId = "mistral/ministral-8b-instruct-2024-10-16"
	ModelIdMistralMistral7b ModelId = "mistral/mistral-7b"
	ModelIdMistralMistralEmbed ModelId = "mistral/mistral-embed"
	ModelIdMistralMistralLarge220240724 ModelId = "mistral/mistral-large-2-2024-07-24"
	ModelIdMistralMistralLarge2402 ModelId = "mistral/mistral-large-2402"
	ModelIdMistralMistralLarge2407 ModelId = "mistral/mistral-large-2407"
	ModelIdMistralMistralLarge2411 ModelId = "mistral/mistral-large-2411"
	ModelIdMistralMistralLarge3675b20251202 ModelId = "mistral/mistral-large-3-675b-2025-12-02"
	ModelIdMistralMistralMedium2312 ModelId = "mistral/mistral-medium-2312"
	ModelIdMistralMistralMedium2505 ModelId = "mistral/mistral-medium-2505"
	ModelIdMistralMistralMedium2508 ModelId = "mistral/mistral-medium-2508"
	ModelIdMistralMistralModeration2411 ModelId = "mistral/mistral-moderation-2411"
	ModelIdMistralMistralNemoInstruct20240718 ModelId = "mistral/mistral-nemo-instruct-2024-07-18"
	ModelIdMistralMistralOcr2503 ModelId = "mistral/mistral-ocr-2503"
	ModelIdMistralMistralOcr2505 ModelId = "mistral/mistral-ocr-2505"
	ModelIdMistralMistralSaba2502 ModelId = "mistral/mistral-saba-2502"
	ModelIdMistralMistralSmall20240917 ModelId = "mistral/mistral-small-2024-09-17"
	ModelIdMistralMistralSmall2402 ModelId = "mistral/mistral-small-2402"
	ModelIdMistralMistralSmall2407 ModelId = "mistral/mistral-small-2407"
	ModelIdMistralMistralSmall2501 ModelId = "mistral/mistral-small-2501"
	ModelIdMistralMistralSmall2503 ModelId = "mistral/mistral-small-2503"
	ModelIdMistralMistralSmall2506 ModelId = "mistral/mistral-small-2506"
	ModelIdMistralMistralSmall3124bBase20250317 ModelId = "mistral/mistral-small-3-1-24b-base-2025-03-17"
	ModelIdMistralMistralSmall3124bInstruct20250317 ModelId = "mistral/mistral-small-3-1-24b-instruct-2025-03-17"
	ModelIdMistralMistralSmall3220250620 ModelId = "mistral/mistral-small-3-2-2025-06-20"
	ModelIdMistralMistralSmall324bBase20250130 ModelId = "mistral/mistral-small-3-24b-base-2025-01-30"
	ModelIdMistralMistralSmall324bInstruct20250130 ModelId = "mistral/mistral-small-3-24b-instruct-2025-01-30"
	ModelIdMistralMixtral8x22b ModelId = "mistral/mixtral-8x22b"
	ModelIdMistralMixtral8x7b ModelId = "mistral/mixtral-8x7b"
	ModelIdMistralOpenCodestralMamba ModelId = "mistral/open-codestral-mamba"
	ModelIdMistralOpenMistral7b ModelId = "mistral/open-mistral-7b"
	ModelIdMistralOpenMistralNemo ModelId = "mistral/open-mistral-nemo"
	ModelIdMistralOpenMixtral8x22b ModelId = "mistral/open-mixtral-8x22b"
	ModelIdMistralOpenMixtral8x7b ModelId = "mistral/open-mixtral-8x7b"
	ModelIdMistralPixtral12bBase20240917 ModelId = "mistral/pixtral-12b-base-2024-09-17"
	ModelIdMistralPixtralLarge20241118 ModelId = "mistral/pixtral-large-2024-11-18"
	ModelIdMistralPixtralLarge2411 ModelId = "mistral/pixtral-large-2411"
	ModelIdMistralVoxtralMini2507 ModelId = "mistral/voxtral-mini-2507"
	ModelIdMistralVoxtralSmall2507 ModelId = "mistral/voxtral-small-2507"
	ModelIdMoonshotaiKimiK1520250120 ModelId = "moonshotai/kimi-k1-5-2025-01-20"
	ModelIdMoonshotaiKimiK2Base20250711 ModelId = "moonshotai/kimi-k2-base-2025-07-11"
	ModelIdMoonshotaiKimiK2Instruct0905 ModelId = "moonshotai/kimi-k2-instruct-0905"
	ModelIdMoonshotaiKimiK2Instruct20250711 ModelId = "moonshotai/kimi-k2-instruct-2025-07-11"
	ModelIdMoonshotaiKimiK2Thinking20251106 ModelId = "moonshotai/kimi-k2-thinking-2025-11-06"
	ModelIdMoonshotaiKimiVlA3bInstruct ModelId = "moonshotai/kimi-vl-a3b-instruct"
	ModelIdMoonshotaiKimiVlA3bThinking ModelId = "moonshotai/kimi-vl-a3b-thinking"
	ModelIdMoonshotaiKimiVlA3bThinking2506 ModelId = "moonshotai/kimi-vl-a3b-thinking-2506"
	ModelIdNousHermes2ProLlama370b ModelId = "nous/hermes-2-pro-llama-3-70b"
	ModelIdNousHermes2ProLlama38b ModelId = "nous/hermes-2-pro-llama-3-8b"
	ModelIdNousHermes2ProMistral7b ModelId = "nous/hermes-2-pro-mistral-7b"
	ModelIdNousHermes2ThetaLlama370b ModelId = "nous/hermes-2-theta-llama-3-70b"
	ModelIdNousHermes2ThetaLlama38b ModelId = "nous/hermes-2-theta-llama-3-8b"
	ModelIdNousHermes3Llama31405b ModelId = "nous/hermes-3-llama-3-1-405b"
	ModelIdNousHermes3Llama3170b ModelId = "nous/hermes-3-llama-3-1-70b"
	ModelIdNousHermes3Llama318b ModelId = "nous/hermes-3-llama-3-1-8b"
	ModelIdNousHermes3Llama323b ModelId = "nous/hermes-3-llama-3-2-3b"
	ModelIdNousHermes414b ModelId = "nous/hermes-4-14b"
	ModelIdNousHermes4336b20251203 ModelId = "nous/hermes-4-3-36b-2025-12-03"
	ModelIdNousHermes4405b ModelId = "nous/hermes-4-405b"
	ModelIdNousHermes470b ModelId = "nous/hermes-4-70b"
	ModelIdNousNomos120251209 ModelId = "nous/nomos-1-2025-12-09"
	ModelIdNvidiaLlama31Nemotron70bInstruct20241001 ModelId = "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
	ModelIdNvidiaLlama31NemotronNano4bV11 ModelId = "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
	ModelIdNvidiaLlama31NemotronNano8bV120250318 ModelId = "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
	ModelIdNvidiaLlama31NemotronUltra253bV120250407 ModelId = "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
	ModelIdNvidiaLlama33NemotronSuper49bV120250318 ModelId = "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
	ModelIdNvidiaLlama33NemotronSuper49bV15 ModelId = "nvidia/llama-3-3-nemotron-super-49b-v1-5"
	ModelIdNvidiaNemotronNano330bA3b ModelId = "nvidia/nemotron-nano-3-30b-a3b"
	ModelIdNvidiaNvidiaNemotronNano12bV2 ModelId = "nvidia/nvidia-nemotron-nano-12b-v2"
	ModelIdNvidiaNvidiaNemotronNano9bV2 ModelId = "nvidia/nvidia-nemotron-nano-9b-v2"
	ModelIdNvidiaOpenreasoningNemotron15b ModelId = "nvidia/openreasoning-nemotron-1-5b"
	ModelIdNvidiaOpenreasoningNemotron14b ModelId = "nvidia/openreasoning-nemotron-14b"
	ModelIdNvidiaOpenreasoningNemotron32b ModelId = "nvidia/openreasoning-nemotron-32b"
	ModelIdNvidiaOpenreasoningNemotron7b ModelId = "nvidia/openreasoning-nemotron-7b"
	ModelIdOpenaiAda20200611 ModelId = "openai/ada-2020-06-11"
	ModelIdOpenaiBabbage002 ModelId = "openai/babbage-002"
	ModelIdOpenaiBabbage20200611 ModelId = "openai/babbage-2020-06-11"
	ModelIdOpenaiChatgpt4o ModelId = "openai/chatgpt-4o"
	ModelIdOpenaiCodeCushman001 ModelId = "openai/code-cushman-001"
	ModelIdOpenaiCodeCushman002 ModelId = "openai/code-cushman-002"
	ModelIdOpenaiCodeDavinci001 ModelId = "openai/code-davinci-001"
	ModelIdOpenaiCodeDavinci002 ModelId = "openai/code-davinci-002"
	ModelIdOpenaiCodeDavinciEdit001 ModelId = "openai/code-davinci-edit-001"
	ModelIdOpenaiCodeSearchAdaCode001 ModelId = "openai/code-search-ada-code-001"
	ModelIdOpenaiCodeSearchBabbageCode001 ModelId = "openai/code-search-babbage-code-001"
	ModelIdOpenaiCodeSearchBabbageText001 ModelId = "openai/code-search-babbage-text-001"
	ModelIdOpenaiCodesSearchAdaText001 ModelId = "openai/codes-search-ada-text-001"
	ModelIdOpenaiCodexMini20250516 ModelId = "openai/codex-mini-2025-05-16"
	ModelIdOpenaiComputerUsePreview ModelId = "openai/computer-use-preview"
	ModelIdOpenaiCurie20200611 ModelId = "openai/curie-2020-06-11"
	ModelIdOpenaiDallE220220928 ModelId = "openai/dall-e-2-2022-09-28"
	ModelIdOpenaiDallE320231019 ModelId = "openai/dall-e-3-2023-10-19"
	ModelIdOpenaiDavinci002 ModelId = "openai/davinci-002"
	ModelIdOpenaiDavinci20200611 ModelId = "openai/davinci-2020-06-11"
	ModelIdOpenaiGpt120180611 ModelId = "openai/gpt-1-2018-06-11"
	ModelIdOpenaiGpt220191105 ModelId = "openai/gpt-2-2019-11-05"
	ModelIdOpenaiGpt320200611 ModelId = "openai/gpt-3-2020-06-11"
	ModelIdOpenaiGpt35Turbo0613 ModelId = "openai/gpt-3-5-turbo-0613"
	ModelIdOpenaiGpt35Turbo16k061320230613 ModelId = "openai/gpt-3-5-turbo-16k-0613-2023-06-13"
	ModelIdOpenaiGpt35Turbo20230321 ModelId = "openai/gpt-3-5-turbo-2023-03-21"
	ModelIdOpenaiGpt35Turbo20230928 ModelId = "openai/gpt-3-5-turbo-2023-09-28"
	ModelIdOpenaiGpt35Turbo20231106 ModelId = "openai/gpt-3-5-turbo-2023-11-06"
	ModelIdOpenaiGpt4120250414 ModelId = "openai/gpt-4-1-2025-04-14"
	ModelIdOpenaiGpt41Mini20250414 ModelId = "openai/gpt-4-1-mini-2025-04-14"
	ModelIdOpenaiGpt41Nano20250414 ModelId = "openai/gpt-4-1-nano-2025-04-14"
	ModelIdOpenaiGpt420230314 ModelId = "openai/gpt-4-2023-03-14"
	ModelIdOpenaiGpt420230613 ModelId = "openai/gpt-4-2023-06-13"
	ModelIdOpenaiGpt432k ModelId = "openai/gpt-4-32k"
	ModelIdOpenaiGpt432k0314 ModelId = "openai/gpt-4-32k-0314"
	ModelIdOpenaiGpt432k0613 ModelId = "openai/gpt-4-32k-0613"
	ModelIdOpenaiGpt4520250227 ModelId = "openai/gpt-4-5-2025-02-27"
	ModelIdOpenaiGpt4Turbo20230314 ModelId = "openai/gpt-4-turbo-2023-03-14"
	ModelIdOpenaiGpt4Turbo20231106 ModelId = "openai/gpt-4-turbo-2023-11-06"
	ModelIdOpenaiGpt4Turbo20240125 ModelId = "openai/gpt-4-turbo-2024-01-25"
	ModelIdOpenaiGpt4o20240513 ModelId = "openai/gpt-4o-2024-05-13"
	ModelIdOpenaiGpt4o20240806 ModelId = "openai/gpt-4o-2024-08-06"
	ModelIdOpenaiGpt4o20241120 ModelId = "openai/gpt-4o-2024-11-20"
	ModelIdOpenaiGpt4oAudio20241001 ModelId = "openai/gpt-4o-audio-2024-10-01"
	ModelIdOpenaiGpt4oAudio20241217 ModelId = "openai/gpt-4o-audio-2024-12-17"
	ModelIdOpenaiGpt4oAudio20250603 ModelId = "openai/gpt-4o-audio-2025-06-03"
	ModelIdOpenaiGpt4oMini20240718 ModelId = "openai/gpt-4o-mini-2024-07-18"
	ModelIdOpenaiGpt4oMiniAudioPreview ModelId = "openai/gpt-4o-mini-audio-preview"
	ModelIdOpenaiGpt4oMiniRealtimePreview ModelId = "openai/gpt-4o-mini-realtime-preview"
	ModelIdOpenaiGpt4oMiniSearchPreview ModelId = "openai/gpt-4o-mini-search-preview"
	ModelIdOpenaiGpt4oMiniTranscribe ModelId = "openai/gpt-4o-mini-transcribe"
	ModelIdOpenaiGpt4oMiniTts ModelId = "openai/gpt-4o-mini-tts"
	ModelIdOpenaiGpt4oRealtimePreview20241001 ModelId = "openai/gpt-4o-realtime-preview-2024-10-01"
	ModelIdOpenaiGpt4oRealtimePreview20241217 ModelId = "openai/gpt-4o-realtime-preview-2024-12-17"
	ModelIdOpenaiGpt4oRealtimePreview20250603 ModelId = "openai/gpt-4o-realtime-preview-2025-06-03"
	ModelIdOpenaiGpt4oSearchPreview ModelId = "openai/gpt-4o-search-preview"
	ModelIdOpenaiGpt4oTranscribe ModelId = "openai/gpt-4o-transcribe"
	ModelIdOpenaiGpt4oTranscribeDiarize20251015 ModelId = "openai/gpt-4o-transcribe-diarize-2025-10-15"
	ModelIdOpenaiGpt5120251112 ModelId = "openai/gpt-5-1-2025-11-12"
	ModelIdOpenaiGpt51Chat20251113 ModelId = "openai/gpt-5-1-chat-2025-11-13"
	ModelIdOpenaiGpt51Codex20251113 ModelId = "openai/gpt-5-1-codex-2025-11-13"
	ModelIdOpenaiGpt51CodexMax20251119 ModelId = "openai/gpt-5-1-codex-max-2025-11-19"
	ModelIdOpenaiGpt51CodexMini20251113 ModelId = "openai/gpt-5-1-codex-mini-2025-11-13"
	ModelIdOpenaiGpt51Pro ModelId = "openai/gpt-5-1-pro"
	ModelIdOpenaiGpt5220251211 ModelId = "openai/gpt-5-2-2025-12-11"
	ModelIdOpenaiGpt52Chat20251211 ModelId = "openai/gpt-5-2-chat-2025-12-11"
	ModelIdOpenaiGpt52Pro20251211 ModelId = "openai/gpt-5-2-pro-2025-12-11"
	ModelIdOpenaiGpt520250807 ModelId = "openai/gpt-5-2025-08-07"
	ModelIdOpenaiGpt5Chat20250807 ModelId = "openai/gpt-5-chat-2025-08-07"
	ModelIdOpenaiGpt5Codex20250915 ModelId = "openai/gpt-5-codex-2025-09-15"
	ModelIdOpenaiGpt5CodexMini20251107 ModelId = "openai/gpt-5-codex-mini-2025-11-07"
	ModelIdOpenaiGpt5Mini20250807 ModelId = "openai/gpt-5-mini-2025-08-07"
	ModelIdOpenaiGpt5Nano20250807 ModelId = "openai/gpt-5-nano-2025-08-07"
	ModelIdOpenaiGpt5Pro20250807 ModelId = "openai/gpt-5-pro-2025-08-07"
	ModelIdOpenaiGpt5SearchApi20251014 ModelId = "openai/gpt-5-search-api-2025-10-14"
	ModelIdOpenaiGpt6 ModelId = "openai/gpt-6"
	ModelIdOpenaiGpt6Mini ModelId = "openai/gpt-6-mini"
	ModelIdOpenaiGpt6Nano ModelId = "openai/gpt-6-nano"
	ModelIdOpenaiGpt6Pro ModelId = "openai/gpt-6-pro"
	ModelIdOpenaiGptAudio ModelId = "openai/gpt-audio"
	ModelIdOpenaiGptAudioMini20251006 ModelId = "openai/gpt-audio-mini-2025-10-06"
	ModelIdOpenaiGptImage1 ModelId = "openai/gpt-image-1"
	ModelIdOpenaiGptImage1Mini20251006 ModelId = "openai/gpt-image-1-mini-2025-10-06"
	ModelIdOpenaiGptOss120b20250805 ModelId = "openai/gpt-oss-120b-2025-08-05"
	ModelIdOpenaiGptOss20b20250805 ModelId = "openai/gpt-oss-20b-2025-08-05"
	ModelIdOpenaiGptOssSafeguard120b20251029 ModelId = "openai/gpt-oss-safeguard-120b-2025-10-29"
	ModelIdOpenaiGptOssSafeguard20b20251029 ModelId = "openai/gpt-oss-safeguard-20b-2025-10-29"
	ModelIdOpenaiGptRealtime ModelId = "openai/gpt-realtime"
	ModelIdOpenaiGptRealtimeMini20251006 ModelId = "openai/gpt-realtime-mini-2025-10-06"
	ModelIdOpenaiO120241217 ModelId = "openai/o1-2024-12-17"
	ModelIdOpenaiO1Mini20240912 ModelId = "openai/o1-mini-2024-09-12"
	ModelIdOpenaiO1Preview20240912 ModelId = "openai/o1-preview-2024-09-12"
	ModelIdOpenaiO1Pro20250319 ModelId = "openai/o1-pro-2025-03-19"
	ModelIdOpenaiO320250416 ModelId = "openai/o3-2025-04-16"
	ModelIdOpenaiO3DeepResearch20250626 ModelId = "openai/o3-deep-research-2025-06-26"
	ModelIdOpenaiO3Mini20250130 ModelId = "openai/o3-mini-2025-01-30"
	ModelIdOpenaiO3Preview ModelId = "openai/o3-preview"
	ModelIdOpenaiO3Pro20250610 ModelId = "openai/o3-pro-2025-06-10"
	ModelIdOpenaiO4Mini20250416 ModelId = "openai/o4-mini-2025-04-16"
	ModelIdOpenaiO4MiniDeepResearch20250626 ModelId = "openai/o4-mini-deep-research-2025-06-26"
	ModelIdOpenaiOmniModeration20240926 ModelId = "openai/omni-moderation-2024-09-26"
	ModelIdOpenaiSora120241209 ModelId = "openai/sora-1-2024-12-09"
	ModelIdOpenaiSora220250930 ModelId = "openai/sora-2-2025-09-30"
	ModelIdOpenaiSora2Pro20251003 ModelId = "openai/sora-2-pro-2025-10-03"
	ModelIdOpenaiTextAda001 ModelId = "openai/text-ada-001"
	ModelIdOpenaiTextBabbage001 ModelId = "openai/text-babbage-001"
	ModelIdOpenaiTextCurie001 ModelId = "openai/text-curie-001"
	ModelIdOpenaiTextDavinci001 ModelId = "openai/text-davinci-001"
	ModelIdOpenaiTextDavinci002 ModelId = "openai/text-davinci-002"
	ModelIdOpenaiTextDavinci003 ModelId = "openai/text-davinci-003"
	ModelIdOpenaiTextDavinciEdit001 ModelId = "openai/text-davinci-edit-001"
	ModelIdOpenaiTextEmbedding3Large ModelId = "openai/text-embedding-3-large"
	ModelIdOpenaiTextEmbedding3Small ModelId = "openai/text-embedding-3-small"
	ModelIdOpenaiTextEmbeddingAda002 ModelId = "openai/text-embedding-ada-002"
	ModelIdOpenaiTextModeration007 ModelId = "openai/text-moderation-007"
	ModelIdOpenaiTextSearchAdaDoc001 ModelId = "openai/text-search-ada-doc-001"
	ModelIdOpenaiTextSearchAdaQuery001 ModelId = "openai/text-search-ada-query-001"
	ModelIdOpenaiTextSearchBabbageDoc001 ModelId = "openai/text-search-babbage-doc-001"
	ModelIdOpenaiTextSearchBabbageQuery001 ModelId = "openai/text-search-babbage-query-001"
	ModelIdOpenaiTextSearchCurieDoc001 ModelId = "openai/text-search-curie-doc-001"
	ModelIdOpenaiTextSearchCurieQuery001 ModelId = "openai/text-search-curie-query-001"
	ModelIdOpenaiTextSearchDavinciDoc001 ModelId = "openai/text-search-davinci-doc-001"
	ModelIdOpenaiTextSearchDavinciQuery001 ModelId = "openai/text-search-davinci-query-001"
	ModelIdOpenaiTextSimilarityAda001 ModelId = "openai/text-similarity-ada-001"
	ModelIdOpenaiTextSimilarityBabbage001 ModelId = "openai/text-similarity-babbage-001"
	ModelIdOpenaiTextSimilarityCurie001 ModelId = "openai/text-similarity-curie-001"
	ModelIdOpenaiTextSimilarityDavinci001 ModelId = "openai/text-similarity-davinci-001"
	ModelIdOpenaiTts1 ModelId = "openai/tts-1"
	ModelIdOpenaiTts1Hd ModelId = "openai/tts-1-hd"
	ModelIdOpenaiWhisper1 ModelId = "openai/whisper-1"
	ModelIdQwenQvq72bPreview20241225 ModelId = "qwen/qvq-72b-preview-2024-12-25"
	ModelIdQwenQwen3OmniFlash20251208 ModelId = "qwen/qwen-3-omni-flash-2025-12-08"
	ModelIdQwenQwen3Tts20251205 ModelId = "qwen/qwen-3-tts-2025-12-05"
	ModelIdQwenQwen2514bInstruct20240919 ModelId = "qwen/qwen2-5-14b-instruct-2024-09-19"
	ModelIdQwenQwen2532bInstruct20240919 ModelId = "qwen/qwen2-5-32b-instruct-2024-09-19"
	ModelIdQwenQwen2572bInstruct20240919 ModelId = "qwen/qwen2-5-72b-instruct-2024-09-19"
	ModelIdQwenQwen257bInstruct20240919 ModelId = "qwen/qwen2-5-7b-instruct-2024-09-19"
	ModelIdQwenQwen25Coder32bInstruct20240919 ModelId = "qwen/qwen2-5-coder-32b-instruct-2024-09-19"
	ModelIdQwenQwen25Coder7bInstruct20240919 ModelId = "qwen/qwen2-5-coder-7b-instruct-2024-09-19"
	ModelIdQwenQwen25Omni7b20250327 ModelId = "qwen/qwen2-5-omni-7b-2025-03-27"
	ModelIdQwenQwen25Vl32bInstruct20250228 ModelId = "qwen/qwen2-5-vl-32b-instruct-2025-02-28"
	ModelIdQwenQwen25Vl72bInstruct20250126 ModelId = "qwen/qwen2-5-vl-72b-instruct-2025-01-26"
	ModelIdQwenQwen25Vl7bInstruct20250126 ModelId = "qwen/qwen2-5-vl-7b-instruct-2025-01-26"
	ModelIdQwenQwen272bInstruct20240723 ModelId = "qwen/qwen2-72b-instruct-2024-07-23"
	ModelIdQwenQwen27bInstruct20240723 ModelId = "qwen/qwen2-7b-instruct-2024-07-23"
	ModelIdQwenQwen2Vl72bInstruct20240829 ModelId = "qwen/qwen2-vl-72b-instruct-2024-08-29"
	ModelIdQwenQwen3235bA22b20250429 ModelId = "qwen/qwen3-235b-a22b-2025-04-29"
	ModelIdQwenQwen3235bA22bThinking250720250725 ModelId = "qwen/qwen3-235b-a22b-thinking-2507-2025-07-25"
	ModelIdQwenQwen330bA3b20250429 ModelId = "qwen/qwen3-30b-a3b-2025-04-29"
	ModelIdQwenQwen332b20250429 ModelId = "qwen/qwen3-32b-2025-04-29"
	ModelIdQwenQwen3A235A22bInstruct250720250721 ModelId = "qwen/qwen3-a235-a22b-instruct-2507-2025-07-21"
	ModelIdQwenQwen3Coder480bA35bInstruct20250722 ModelId = "qwen/qwen3-coder-480b-a35b-instruct-2025-07-22"
	ModelIdQwenQwq32b20250305 ModelId = "qwen/qwq-32b-2025-03-05"
	ModelIdQwenQwq32bPreview20241128 ModelId = "qwen/qwq-32b-preview-2024-11-28"
	ModelIdSunoSunoV35 ModelId = "suno/suno-v3-5"
	ModelIdSunoSunoV4 ModelId = "suno/suno-v4"
	ModelIdSunoSunoV45 ModelId = "suno/suno-v4-5"
	ModelIdSunoSunoV452 ModelId = "suno/suno-v4-5+"
	ModelIdSunoSunoV5 ModelId = "suno/suno-v5"
	ModelIdXAiGrok0 ModelId = "x-ai/grok-0"
	ModelIdXAiGrok1 ModelId = "x-ai/grok-1"
	ModelIdXAiGrok1520240328 ModelId = "x-ai/grok-1-5-2024-03-28"
	ModelIdXAiGrok15v20240412 ModelId = "x-ai/grok-1-5v-2024-04-12"
	ModelIdXAiGrok220240813 ModelId = "x-ai/grok-2-2024-08-13"
	ModelIdXAiGrok2Image1212 ModelId = "x-ai/grok-2-image-1212"
	ModelIdXAiGrok2Mini20240813 ModelId = "x-ai/grok-2-mini-2024-08-13"
	ModelIdXAiGrok2Vision1212 ModelId = "x-ai/grok-2-vision-1212"
	ModelIdXAiGrok320250418 ModelId = "x-ai/grok-3-2025-04-18"
	ModelIdXAiGrok3Beta20250219 ModelId = "x-ai/grok-3-beta-2025-02-19"
	ModelIdXAiGrok3Mini20250418 ModelId = "x-ai/grok-3-mini-2025-04-18"
	ModelIdXAiGrok3MiniBeta20250219 ModelId = "x-ai/grok-3-mini-beta-2025-02-19"
	ModelIdXAiGrok41NonThinking20251117 ModelId = "x-ai/grok-4-1-non-thinking-2025-11-17"
	ModelIdXAiGrok41Thinking20251117 ModelId = "x-ai/grok-4-1-thinking-2025-11-17"
	ModelIdXAiGrok42 ModelId = "x-ai/grok-4-2"
	ModelIdXAiGrok420250710 ModelId = "x-ai/grok-4-2025-07-10"
	ModelIdXAiGrok4FastNonReasoning20250920 ModelId = "x-ai/grok-4-fast-non-reasoning-2025-09-20"
	ModelIdXAiGrok4FastReasoning20250920 ModelId = "x-ai/grok-4-fast-reasoning-2025-09-20"
	ModelIdXAiGrok4Heavy20250710 ModelId = "x-ai/grok-4-heavy-2025-07-10"
	ModelIdXAiGrokCodeFast120250828 ModelId = "x-ai/grok-code-fast-1-2025-08-28"
	ModelIdZAiGlm41v9b ModelId = "z-ai/glm-4-1v-9b"
	ModelIdZAiGlm41vThinking9b ModelId = "z-ai/glm-4-1v-thinking-9b"
	ModelIdZAiGlm432b0414 ModelId = "z-ai/glm-4-32b-0414"
	ModelIdZAiGlm45 ModelId = "z-ai/glm-4-5"
	ModelIdZAiGlm45Air ModelId = "z-ai/glm-4-5-air"
	ModelIdZAiGlm45v ModelId = "z-ai/glm-4-5v"
	ModelIdZAiGlm4620250930 ModelId = "z-ai/glm-4-6-2025-09-30"
	ModelIdZAiGlm46v20251208 ModelId = "z-ai/glm-4-6v-2025-12-08"
	ModelIdZAiGlm46vFlash20251208 ModelId = "z-ai/glm-4-6v-flash-2025-12-08"
	ModelIdZAiGlm49b ModelId = "z-ai/glm-4-9b"
	ModelIdZAiGlm49b0414 ModelId = "z-ai/glm-4-9b-0414"
	ModelIdZAiGlm49bChat ModelId = "z-ai/glm-4-9b-chat"
	ModelIdZAiGlm49bChat1m ModelId = "z-ai/glm-4-9b-chat-1m"
	ModelIdZAiGlm4v9b ModelId = "z-ai/glm-4v-9b"
)


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
	OrganisationIdAmazon OrganisationId = "amazon"
	OrganisationIdAnthropic OrganisationId = "anthropic"
	OrganisationIdBaidu OrganisationId = "baidu"
	OrganisationIdBlackForestLabs OrganisationId = "black-forest-labs"
	OrganisationIdBytedance OrganisationId = "bytedance"
	OrganisationIdCohere OrganisationId = "cohere"
	OrganisationIdDeepseek OrganisationId = "deepseek"
	OrganisationIdElevenLabs OrganisationId = "eleven-labs"
	OrganisationIdEssentialAi OrganisationId = "essential-ai"
	OrganisationIdGoogle OrganisationId = "google"
	OrganisationIdIbm OrganisationId = "ibm"
	OrganisationIdInclusionai OrganisationId = "inclusionai"
	OrganisationIdLg OrganisationId = "lg"
	OrganisationIdMeta OrganisationId = "meta"
	OrganisationIdMicrosoft OrganisationId = "microsoft"
	OrganisationIdMinimax OrganisationId = "minimax"
	OrganisationIdMistral OrganisationId = "mistral"
	OrganisationIdMoonshotai OrganisationId = "moonshotai"
	OrganisationIdNous OrganisationId = "nous"
	OrganisationIdNvidia OrganisationId = "nvidia"
	OrganisationIdOpenai OrganisationId = "openai"
	OrganisationIdPerplexity OrganisationId = "perplexity"
	OrganisationIdQwen OrganisationId = "qwen"
	OrganisationIdSuno OrganisationId = "suno"
	OrganisationIdXAi OrganisationId = "x-ai"
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

type ProviderRoutingOptions struct {
	Ignore *[]string `json:"ignore,omitempty"`
	IncludeAlpha *bool `json:"include_alpha,omitempty"`
	Only *[]string `json:"only,omitempty"`
	Order *[]string `json:"order,omitempty"`
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
	Summary *string `json:"summary,omitempty"`
}

type ResponsesRequest struct {
	Background *bool `json:"background,omitempty"`
	Conversation interface{} `json:"conversation,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	Include *[]string `json:"include,omitempty"`
	Input *map[string]interface{} `json:"input,omitempty"`
	InputItems *[]map[string]interface{} `json:"input_items,omitempty"`
	Instructions *string `json:"instructions,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	MaxToolCalls *int `json:"max_tool_calls,omitempty"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PreviousResponseId *string `json:"previous_response_id,omitempty"`
	Prompt *map[string]interface{} `json:"prompt,omitempty"`
	PromptCacheKey *string `json:"prompt_cache_key,omitempty"`
	PromptCacheRetention *string `json:"prompt_cache_retention,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	SafetyIdentifier *string `json:"safety_identifier,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	Store *bool `json:"store,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	StreamOptions *map[string]interface{} `json:"stream_options,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Text *map[string]interface{} `json:"text,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]map[string]interface{} `json:"tools,omitempty"`
	TopLogprobs *int `json:"top_logprobs,omitempty"`
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
	Role *string `json:"role,omitempty"`
	StopReason *string `json:"stop_reason,omitempty"`
	Type *string `json:"type,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type TextContentPart struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

type TextModerationInput struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

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
	TotalTokens *int `json:"total_tokens,omitempty"`
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
	Duration *int `json:"duration,omitempty"`
	DurationSeconds *int `json:"duration_seconds,omitempty"`
	InputReference *string `json:"input_reference,omitempty"`
	InputReferenceMimeType *string `json:"input_reference_mime_type,omitempty"`
	Model string `json:"model"`
	NegativePrompt *string `json:"negative_prompt,omitempty"`
	OutputStorageUri *string `json:"output_storage_uri,omitempty"`
	PersonGeneration *string `json:"person_generation,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Ratio *string `json:"ratio,omitempty"`
	Resolution *string `json:"resolution,omitempty"`
	SampleCount *int `json:"sample_count,omitempty"`
	Seconds interface{} `json:"seconds,omitempty"`
	Seed *int `json:"seed,omitempty"`
	Size *string `json:"size,omitempty"`
}

type VideoGenerationResponse struct {
	Created *int `json:"created,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	Output *[]map[string]interface{} `json:"output,omitempty"`
	Status *string `json:"status,omitempty"`
}
