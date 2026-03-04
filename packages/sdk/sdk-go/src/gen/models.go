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
	ImageConfig *map[string]interface{} `json:"image_config,omitempty"`
	ImageConfig *map[string]interface{} `json:"imageConfig,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	Messages []map[string]interface{} `json:"messages"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Modalities *[]string `json:"modalities,omitempty"`
	Model string `json:"model"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ResponseModalities *[]string `json:"response_modalities,omitempty"`
	ResponseModalities *[]string `json:"responseModalities,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	System interface{} `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Thinking *map[string]interface{} `json:"thinking,omitempty"`
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
	BenchmarkIdApexAgents BenchmarkId = "apex-agents"
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
	BenchmarkIdGdpvalAa BenchmarkId = "gdpval-aa"
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
	BenchmarkIdScicode BenchmarkId = "scicode"
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
	ImageConfig *map[string]interface{} `json:"image_config,omitempty"`
	ImageConfig *map[string]interface{} `json:"imageConfig,omitempty"`
	LogitBias *map[string]interface{} `json:"logit_bias,omitempty"`
	Logprobs *bool `json:"logprobs,omitempty"`
	MaxCompletionTokens *int `json:"max_completion_tokens,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	MaxToolCalls *int `json:"max_tool_calls,omitempty"`
	Messages []map[string]interface{} `json:"messages"`
	Meta *bool `json:"meta,omitempty"`
	Modalities *[]string `json:"modalities,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PresencePenalty *float64 `json:"presence_penalty,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	ResponseFormat interface{} `json:"response_format,omitempty"`
	ResponseModalities *[]string `json:"response_modalities,omitempty"`
	ResponseModalities *[]string `json:"responseModalities,omitempty"`
	Seed *int `json:"seed,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	Speed *string `json:"speed,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	StreamOptions *map[string]interface{} `json:"stream_options,omitempty"`
	System *string `json:"system,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Thinking *map[string]interface{} `json:"thinking,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
	Tools *[]map[string]interface{} `json:"tools,omitempty"`
	TopK *int `json:"top_k,omitempty"`
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

type DataModel struct {
	DeprecationDate *string `json:"deprecation_date,omitempty"`
	Hidden *bool `json:"hidden,omitempty"`
	InputTypes *[]string `json:"input_types,omitempty"`
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

type ImageConfig struct {
	AspectRatio *string `json:"aspect_ratio,omitempty"`
	AspectRatio *string `json:"aspectRatio,omitempty"`
	FontInputs *[]map[string]interface{} `json:"font_inputs,omitempty"`
	FontInputs *[]map[string]interface{} `json:"fontInputs,omitempty"`
	ImageSize *string `json:"image_size,omitempty"`
	ImageSize *string `json:"imageSize,omitempty"`
	IncludeRaiReason *bool `json:"include_rai_reason,omitempty"`
	IncludeRaiReason *bool `json:"includeRaiReason,omitempty"`
	ReferenceImages *[]map[string]interface{} `json:"reference_images,omitempty"`
	ReferenceImages *[]map[string]interface{} `json:"referenceImages,omitempty"`
	SuperResolutionReferences *[]string `json:"super_resolution_references,omitempty"`
	SuperResolutionReferences *[]string `json:"superResolutionReferences,omitempty"`
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
	ModelIdAi21Jamba23b20260108 ModelId = "ai21/jamba-2-3b-2026-01-08"
	ModelIdAi21Jamba2Mini20260108 ModelId = "ai21/jamba-2-mini-2026-01-08"
	ModelIdAi21JambaLarge1520240822 ModelId = "ai21/jamba-large-1-5-2024-08-22"
	ModelIdAi21JambaLarge1620250306 ModelId = "ai21/jamba-large-1-6-2025-03-06"
	ModelIdAi21JambaLarge1720250703 ModelId = "ai21/jamba-large-1-7-2025-07-03"
	ModelIdAi21JambaMini1520240822 ModelId = "ai21/jamba-mini-1-5-2024-08-22"
	ModelIdAi21JambaMini1620250306 ModelId = "ai21/jamba-mini-1-6-2025-03-06"
	ModelIdAi21JambaMini1720250703 ModelId = "ai21/jamba-mini-1-7-2025-07-03"
	ModelIdAi21JambaReasoning3b20251008 ModelId = "ai21/jamba-reasoning-3b-2025-10-08"
	ModelIdAionLabsAion1020250129 ModelId = "aion-labs/aion-1-0-2025-01-29"
	ModelIdAionLabsAion10Mini20250129 ModelId = "aion-labs/aion-1-0-mini-2025-01-29"
	ModelIdAionLabsAion2020251221 ModelId = "aion-labs/aion-2-0-2025-12-21"
	ModelIdAionLabsAionRpLlama318b20241130 ModelId = "aion-labs/aion-rp-llama-3-1-8b-2024-11-30"
	ModelIdAllenaiBolmo1b20251215 ModelId = "allenai/bolmo-1b-2025-12-15"
	ModelIdAllenaiBolmo7b20251215 ModelId = "allenai/bolmo-7b-2025-12-15"
	ModelIdAllenaiMolmo24b20251216 ModelId = "allenai/molmo-2-4b-2025-12-16"
	ModelIdAllenaiMolmo28b20251216 ModelId = "allenai/molmo-2-8b-2025-12-16"
	ModelIdAllenaiOlmo3132bInstruct20251212 ModelId = "allenai/olmo-3-1-32b-instruct-2025-12-12"
	ModelIdAllenaiOlmo3132bThink20251212 ModelId = "allenai/olmo-3-1-32b-think-2025-12-12"
	ModelIdAllenaiOlmo332bThink20251120 ModelId = "allenai/olmo-3-32b-think-2025-11-20"
	ModelIdAllenaiOlmo37bInstruct20251120 ModelId = "allenai/olmo-3-7b-instruct-2025-11-20"
	ModelIdAllenaiOlmo37bThink20251120 ModelId = "allenai/olmo-3-7b-think-2025-11-20"
	ModelIdAmazonNova2Lite20251202 ModelId = "amazon/nova-2-lite-2025-12-02"
	ModelIdAmazonNova2Omni20251202 ModelId = "amazon/nova-2-omni-2025-12-02"
	ModelIdAmazonNova2Pro20251202 ModelId = "amazon/nova-2-pro-2025-12-02"
	ModelIdAmazonNova2Sonic20251202 ModelId = "amazon/nova-2-sonic-2025-12-02"
	ModelIdAmazonNovaCanvas20241203 ModelId = "amazon/nova-canvas-2024-12-03"
	ModelIdAmazonNovaLite1020241204 ModelId = "amazon/nova-lite-1-0-2024-12-04"
	ModelIdAmazonNovaMicro1020241204 ModelId = "amazon/nova-micro-1-0-2024-12-04"
	ModelIdAmazonNovaMultimodalEmbeddings20251202 ModelId = "amazon/nova-multimodal-embeddings-2025-12-02"
	ModelIdAmazonNovaPremier20250430 ModelId = "amazon/nova-premier-2025-04-30"
	ModelIdAmazonNovaPro1020241204 ModelId = "amazon/nova-pro-1-0-2024-12-04"
	ModelIdAmazonNovaReel20241203 ModelId = "amazon/nova-reel-2024-12-03"
	ModelIdAmazonNovaSonic20250408 ModelId = "amazon/nova-sonic-2025-04-08"
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
	ModelIdAnthropicClaudeOpus4620260205 ModelId = "anthropic/claude-opus-4-6-2026-02-05"
	ModelIdAnthropicClaudeSonnet420250521 ModelId = "anthropic/claude-sonnet-4-2025-05-21"
	ModelIdAnthropicClaudeSonnet4520250929 ModelId = "anthropic/claude-sonnet-4-5-2025-09-29"
	ModelIdAnthropicClaudeSonnet4620260217 ModelId = "anthropic/claude-sonnet-4-6-2026-02-17"
	ModelIdArceeAiTrinityLarge20260127 ModelId = "arcee-ai/trinity-large-2026-01-27"
	ModelIdArceeAiTrinityMini20251201 ModelId = "arcee-ai/trinity-mini-2025-12-01"
	ModelIdArceeAiTrinityNanoPreview20251201 ModelId = "arcee-ai/trinity-nano-preview-2025-12-01"
	ModelIdBaiduErnie4521bA3b ModelId = "baidu/ernie-4-5-21b-a3b"
	ModelIdBaiduErnie4521bA3bThinking ModelId = "baidu/ernie-4-5-21b-a3b-thinking"
	ModelIdBaiduErnie45300bA47b ModelId = "baidu/ernie-4-5-300b-a47b"
	ModelIdBaiduErnie45Turbo ModelId = "baidu/ernie-4-5-turbo"
	ModelIdBaiduErnie45Vl28bA3b ModelId = "baidu/ernie-4-5-vl-28b-a3b"
	ModelIdBaiduErnie45Vl424bA47b ModelId = "baidu/ernie-4-5-vl-424b-a47b"
	ModelIdBaiduErnie500110 ModelId = "baidu/ernie-5-0-0110"
	ModelIdBaiduErnie5020260122 ModelId = "baidu/ernie-5-0-2026-01-22"
	ModelIdBaiduErnie50Preview1203 ModelId = "baidu/ernie-5-0-preview-1203"
	ModelIdBaiduErnie50Preview1220 ModelId = "baidu/ernie-5-0-preview-1220"
	ModelIdBaiduErnieX11 ModelId = "baidu/ernie-x1-1"
	ModelIdBaiduQianfanVl3b ModelId = "baidu/qianfan-vl-3b"
	ModelIdBaiduQianfanVl70b ModelId = "baidu/qianfan-vl-70b"
	ModelIdBaiduQianfanVl8b ModelId = "baidu/qianfan-vl-8b"
	ModelIdBlackForestLabsFlux2Dev20251125 ModelId = "black-forest-labs/flux-2-dev-2025-11-25"
	ModelIdBlackForestLabsFlux2Flex20251125 ModelId = "black-forest-labs/flux-2-flex-2025-11-25"
	ModelIdBlackForestLabsFlux2Klein4b20260115 ModelId = "black-forest-labs/flux-2-klein-4b-2026-01-15"
	ModelIdBlackForestLabsFlux2Klein9b20260115 ModelId = "black-forest-labs/flux-2-klein-9b-2026-01-15"
	ModelIdBlackForestLabsFlux2Max20251216 ModelId = "black-forest-labs/flux-2-max-2025-12-16"
	ModelIdBlackForestLabsFlux2Pro20251125 ModelId = "black-forest-labs/flux-2-pro-2025-11-25"
	ModelIdBytedanceSeed1620250625 ModelId = "bytedance/seed-1-6-2025-06-25"
	ModelIdBytedanceSeed16Flash20250625 ModelId = "bytedance/seed-1-6-flash-2025-06-25"
	ModelIdBytedanceSeed1820251218 ModelId = "bytedance/seed-1-8-2025-12-18"
	ModelIdBytedanceSeed20Lite20260214 ModelId = "bytedance/seed-2-0-lite-2026-02-14"
	ModelIdBytedanceSeed20Mini20260214 ModelId = "bytedance/seed-2-0-mini-2026-02-14"
	ModelIdBytedanceSeed20Pro20260214 ModelId = "bytedance/seed-2-0-pro-2026-02-14"
	ModelIdBytedanceSeedCoder8bInstruct ModelId = "bytedance/seed-coder-8b-instruct"
	ModelIdBytedanceSeedCoder8bReasoning ModelId = "bytedance/seed-coder-8b-reasoning"
	ModelIdBytedanceSeedOss36bInstruct ModelId = "bytedance/seed-oss-36b-instruct"
	ModelIdBytedanceSeedream4520251203 ModelId = "bytedance/seedream-4-5-2025-12-03"
	ModelIdCohereC4aiAyaExpanse32b ModelId = "cohere/c4ai-aya-expanse-32b"
	ModelIdCohereC4aiAyaExpanse8b ModelId = "cohere/c4ai-aya-expanse-8b"
	ModelIdCohereC4aiAyaVision32b20250304 ModelId = "cohere/c4ai-aya-vision-32b-2025-03-04"
	ModelIdCohereC4aiAyaVision8b20250304 ModelId = "cohere/c4ai-aya-vision-8b-2025-03-04"
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
	ModelIdCohereEmbedV420250415 ModelId = "cohere/embed-v4-2025-04-15"
	ModelIdCohereRerankMultilingualV3 ModelId = "cohere/rerank-multilingual-v3"
	ModelIdCohereRerankV3520241002 ModelId = "cohere/rerank-v3-5-2024-10-02"
	ModelIdCohereRerankV40Fast20251211 ModelId = "cohere/rerank-v4-0-fast-2025-12-11"
	ModelIdCohereRerankV40Pro20251211 ModelId = "cohere/rerank-v4-0-pro-2025-12-11"
	ModelIdCohereRerenkEnglishV3 ModelId = "cohere/rerenk-english-v3"
	ModelIdCursorComposer120251029 ModelId = "cursor/composer-1-2025-10-29"
	ModelIdCursorComposer1520260209 ModelId = "cursor/composer-1-5-2026-02-09"
	ModelIdDeepseekDeepseekCoderV220240614 ModelId = "deepseek/deepseek-coder-v2-2024-06-14"
	ModelIdDeepseekDeepseekCoderV220240724 ModelId = "deepseek/deepseek-coder-v2-2024-07-24"
	ModelIdDeepseekDeepseekOcr2 ModelId = "deepseek/deepseek-ocr-2"
	ModelIdDeepseekDeepseekOcr20251020 ModelId = "deepseek/deepseek-ocr-2025-10-20"
	ModelIdDeepseekDeepseekR120250120 ModelId = "deepseek/deepseek-r1-2025-01-20"
	ModelIdDeepseekDeepseekR120250528 ModelId = "deepseek/deepseek-r1-2025-05-28"
	ModelIdDeepseekDeepseekR1LitePreview20241120 ModelId = "deepseek/deepseek-r1-lite-preview-2024-11-20"
	ModelIdDeepseekDeepseekV220240517 ModelId = "deepseek/deepseek-v2-2024-05-17"
	ModelIdDeepseekDeepseekV220240628 ModelId = "deepseek/deepseek-v2-2024-06-28"
	ModelIdDeepseekDeepseekV2520240905 ModelId = "deepseek/deepseek-v2-5-2024-09-05"
	ModelIdDeepseekDeepseekV2520241210 ModelId = "deepseek/deepseek-v2-5-2024-12-10"
	ModelIdDeepseekDeepseekV3120250821 ModelId = "deepseek/deepseek-v3-1-2025-08-21"
	ModelIdDeepseekDeepseekV31Terminus20250922 ModelId = "deepseek/deepseek-v3-1-terminus-2025-09-22"
	ModelIdDeepseekDeepseekV3220251201 ModelId = "deepseek/deepseek-v3-2-2025-12-01"
	ModelIdDeepseekDeepseekV32Exp20250929 ModelId = "deepseek/deepseek-v3-2-exp-2025-09-29"
	ModelIdDeepseekDeepseekV32Speciale20251201 ModelId = "deepseek/deepseek-v3-2-speciale-2025-12-01"
	ModelIdDeepseekDeepseekV320241226 ModelId = "deepseek/deepseek-v3-2024-12-26"
	ModelIdDeepseekDeepseekV320250325 ModelId = "deepseek/deepseek-v3-2025-03-25"
	ModelIdDeepseekDeepseekV4 ModelId = "deepseek/deepseek-v4"
	ModelIdDeepseekDeepseekVl220241213 ModelId = "deepseek/deepseek-vl2-2024-12-13"
	ModelIdDeepseekDeepseekVl2Small20241213 ModelId = "deepseek/deepseek-vl2-small-2024-12-13"
	ModelIdDeepseekDeepseekVl2Tiny20241213 ModelId = "deepseek/deepseek-vl2-tiny-2024-12-13"
	ModelIdElevenLabsElevenEnglishStsV2 ModelId = "eleven-labs/eleven-english-sts-v2"
	ModelIdElevenLabsElevenFlashV2 ModelId = "eleven-labs/eleven-flash-v2"
	ModelIdElevenLabsElevenFlashV25 ModelId = "eleven-labs/eleven-flash-v2-5"
	ModelIdElevenLabsElevenMonolingualV1 ModelId = "eleven-labs/eleven-monolingual-v1"
	ModelIdElevenLabsElevenMultilingualStsV2 ModelId = "eleven-labs/eleven-multilingual-sts-v2"
	ModelIdElevenLabsElevenMultilingualTtvV2 ModelId = "eleven-labs/eleven-multilingual-ttv-v2"
	ModelIdElevenLabsElevenMultilingualV1 ModelId = "eleven-labs/eleven-multilingual-v1"
	ModelIdElevenLabsElevenMultilingualV2 ModelId = "eleven-labs/eleven-multilingual-v2"
	ModelIdElevenLabsElevenTtvV3 ModelId = "eleven-labs/eleven-ttv-v3"
	ModelIdElevenLabsElevenTurboV2 ModelId = "eleven-labs/eleven-turbo-v2"
	ModelIdElevenLabsElevenTurboV25 ModelId = "eleven-labs/eleven-turbo-v2-5"
	ModelIdElevenLabsElevenV3 ModelId = "eleven-labs/eleven-v3"
	ModelIdElevenLabsScribeV1 ModelId = "eleven-labs/scribe-v1"
	ModelIdElevenLabsScribeV220260109 ModelId = "eleven-labs/scribe-v2-2026-01-09"
	ModelIdElevenLabsScribeV2Realtime20251111 ModelId = "eleven-labs/scribe-v2-realtime-2025-11-11"
	ModelIdEssentialAiRnj120251206 ModelId = "essential-ai/rnj-1-2025-12-06"
	ModelIdGoogleChatBison20230501 ModelId = "google/chat-bison-2023-05-01"
	ModelIdGoogleCodeGecko20230501 ModelId = "google/code-gecko-2023-05-01"
	ModelIdGoogleEmbedding00120231213 ModelId = "google/embedding-001-2023-12-13"
	ModelIdGoogleGemini10Nano20231206 ModelId = "google/gemini-1-0-nano-2023-12-06"
	ModelIdGoogleGemini10Pro20231206 ModelId = "google/gemini-1-0-pro-2023-12-06"
	ModelIdGoogleGemini10ProVision00120240215 ModelId = "google/gemini-1-0-pro-vision-001-2024-02-15"
	ModelIdGoogleGemini10Ultra20231206 ModelId = "google/gemini-1-0-ultra-2023-12-06"
	ModelIdGoogleGemini15Flash00120240523 ModelId = "google/gemini-1-5-flash-001-2024-05-23"
	ModelIdGoogleGemini15Flash00220240924 ModelId = "google/gemini-1-5-flash-002-2024-09-24"
	ModelIdGoogleGemini15Flash8b20240315 ModelId = "google/gemini-1-5-flash-8b-2024-03-15"
	ModelIdGoogleGemini15Flash8bExp20240827 ModelId = "google/gemini-1-5-flash-8b-exp-2024-08-27"
	ModelIdGoogleGemini15Flash8bExp20240924 ModelId = "google/gemini-1-5-flash-8b-exp-2024-09-24"
	ModelIdGoogleGemini15FlashPreview20240514 ModelId = "google/gemini-1-5-flash-preview-2024-05-14"
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
	ModelIdGoogleGemini25FlashImage20251002 ModelId = "google/gemini-2-5-flash-image-2025-10-02"
	ModelIdGoogleGemini25FlashImagePreview20250825 ModelId = "google/gemini-2-5-flash-image-preview-2025-08-25"
	ModelIdGoogleGemini25FlashLitePreview20250617 ModelId = "google/gemini-2-5-flash-lite-preview-2025-06-17"
	ModelIdGoogleGemini25FlashLitePreview20250925 ModelId = "google/gemini-2-5-flash-lite-preview-2025-09-25"
	ModelIdGoogleGemini25FlashNativeAudioPreview ModelId = "google/gemini-2-5-flash-native-audio-preview"
	ModelIdGoogleGemini25FlashPreview20250417 ModelId = "google/gemini-2-5-flash-preview-2025-04-17"
	ModelIdGoogleGemini25FlashPreview20250520 ModelId = "google/gemini-2-5-flash-preview-2025-05-20"
	ModelIdGoogleGemini25FlashPreview20250925 ModelId = "google/gemini-2-5-flash-preview-2025-09-25"
	ModelIdGoogleGemini25FlashPreviewNativeAudioDialog ModelId = "google/gemini-2-5-flash-preview-native-audio-dialog"
	ModelIdGoogleGemini25FlashPreviewTts ModelId = "google/gemini-2-5-flash-preview-tts"
	ModelIdGoogleGemini25FlashPreviewTts20251210 ModelId = "google/gemini-2-5-flash-preview-tts-2025-12-10"
	ModelIdGoogleGemini25ProExperimental20250325 ModelId = "google/gemini-2-5-pro-experimental-2025-03-25"
	ModelIdGoogleGemini25ProPreview20250506 ModelId = "google/gemini-2-5-pro-preview-2025-05-06"
	ModelIdGoogleGemini25ProPreview20250605 ModelId = "google/gemini-2-5-pro-preview-2025-06-05"
	ModelIdGoogleGemini25ProPreviewTts ModelId = "google/gemini-2-5-pro-preview-tts"
	ModelIdGoogleGemini25ProPreviewTts20251210 ModelId = "google/gemini-2-5-pro-preview-tts-2025-12-10"
	ModelIdGoogleGemini31FlashImagePreview20260226 ModelId = "google/gemini-3-1-flash-image-preview-2026-02-26"
	ModelIdGoogleGemini31FlashLitePreview20260303 ModelId = "google/gemini-3-1-flash-lite-preview-2026-03-03"
	ModelIdGoogleGemini31ProPreview20260219 ModelId = "google/gemini-3-1-pro-preview-2026-02-19"
	ModelIdGoogleGemini3FlashPreview20251217 ModelId = "google/gemini-3-flash-preview-2025-12-17"
	ModelIdGoogleGemini3ProImagePreview20251120 ModelId = "google/gemini-3-pro-image-preview-2025-11-20"
	ModelIdGoogleGemini3ProPreview20251118 ModelId = "google/gemini-3-pro-preview-2025-11-18"
	ModelIdGoogleGeminiDiffusion ModelId = "google/gemini-diffusion"
	ModelIdGoogleGeminiEmbedding00120250520 ModelId = "google/gemini-embedding-001-2025-05-20"
	ModelIdGoogleGeminiEmbeddingExp030720250307 ModelId = "google/gemini-embedding-exp-0307-2025-03-07"
	ModelIdGoogleGeminiExp111420241114 ModelId = "google/gemini-exp-1114-2024-11-14"
	ModelIdGoogleGeminiExp112120241121 ModelId = "google/gemini-exp-1121-2024-11-21"
	ModelIdGoogleGeminiExp120620241206 ModelId = "google/gemini-exp-1206-2024-12-06"
	ModelIdGoogleGeminiLive25FlashPreview20250409 ModelId = "google/gemini-live-2-5-flash-preview-2025-04-09"
	ModelIdGoogleGeminiRoboticsEr15Preview20250925 ModelId = "google/gemini-robotics-er-1-5-preview-2025-09-25"
	ModelIdGoogleGemma12b20240221 ModelId = "google/gemma-1-2b-2024-02-21"
	ModelIdGoogleGemma17b20240221 ModelId = "google/gemma-1-7b-2024-02-21"
	ModelIdGoogleGemma227b20240627 ModelId = "google/gemma-2-27b-2024-06-27"
	ModelIdGoogleGemma22b20240731 ModelId = "google/gemma-2-2b-2024-07-31"
	ModelIdGoogleGemma29b20240627 ModelId = "google/gemma-2-9b-2024-06-27"
	ModelIdGoogleGemma312b20250312 ModelId = "google/gemma-3-12b-2025-03-12"
	ModelIdGoogleGemma31b20250312 ModelId = "google/gemma-3-1b-2025-03-12"
	ModelIdGoogleGemma327b20250312 ModelId = "google/gemma-3-27b-2025-03-12"
	ModelIdGoogleGemma34b20250312 ModelId = "google/gemma-3-4b-2025-03-12"
	ModelIdGoogleGemma3nE2b20250625 ModelId = "google/gemma-3n-e2b-2025-06-25"
	ModelIdGoogleGemma3nE4b20250625 ModelId = "google/gemma-3n-e4b-2025-06-25"
	ModelIdGoogleImageGeneration00220230817 ModelId = "google/image-generation-002-2023-08-17"
	ModelIdGoogleImageGeneration00520231122 ModelId = "google/image-generation-005-2023-11-22"
	ModelIdGoogleImageGeneration00620240327 ModelId = "google/image-generation-006-2024-03-27"
	ModelIdGoogleImageText20230607 ModelId = "google/image-text-2023-06-07"
	ModelIdGoogleImagen30Generate00120240731 ModelId = "google/imagen-3-0-generate-001-2024-07-31"
	ModelIdGoogleImagen30Generate00220250129 ModelId = "google/imagen-3-0-generate-002-2025-01-29"
	ModelIdGoogleImagen40FastGenerate00120250814 ModelId = "google/imagen-4-0-fast-generate-001-2025-08-14"
	ModelIdGoogleImagen40FastGeneratePreview20250611 ModelId = "google/imagen-4-0-fast-generate-preview-2025-06-11"
	ModelIdGoogleImagen40Generate00120250814 ModelId = "google/imagen-4-0-generate-001-2025-08-14"
	ModelIdGoogleImagen40GeneratePreview20250611 ModelId = "google/imagen-4-0-generate-preview-2025-06-11"
	ModelIdGoogleImagen40Preview20250520 ModelId = "google/imagen-4-0-preview-2025-05-20"
	ModelIdGoogleImagen40UltraGenerate00120250814 ModelId = "google/imagen-4-0-ultra-generate-001-2025-08-14"
	ModelIdGoogleImagen40UltraGeneratePreview20250611 ModelId = "google/imagen-4-0-ultra-generate-preview-2025-06-11"
	ModelIdGoogleImagen40UltraPreview20250520 ModelId = "google/imagen-4-0-ultra-preview-2025-05-20"
	ModelIdGoogleLearnlm15ProExperimental20241119 ModelId = "google/learnlm-1-5-pro-experimental-2024-11-19"
	ModelIdGoogleLearnlm20FlashExperimental20250417 ModelId = "google/learnlm-2-0-flash-experimental-2025-04-17"
	ModelIdGoogleLyria1 ModelId = "google/lyria-1"
	ModelIdGoogleLyria2 ModelId = "google/lyria-2"
	ModelIdGoogleLyria320260218 ModelId = "google/lyria-3-2026-02-18"
	ModelIdGoogleMedgemma154b20260113 ModelId = "google/medgemma-1-5-4b-2026-01-13"
	ModelIdGoogleMultimodalEmbedding00120240212 ModelId = "google/multimodal-embedding-001-2024-02-12"
	ModelIdGoogleTextBison20230501 ModelId = "google/text-bison-2023-05-01"
	ModelIdGoogleTextEmbedding00420240514 ModelId = "google/text-embedding-004-2024-05-14"
	ModelIdGoogleTextEmbedding00520241118 ModelId = "google/text-embedding-005-2024-11-18"
	ModelIdGoogleTextEmbeddingGecko00120230607 ModelId = "google/text-embedding-gecko-001-2023-06-07"
	ModelIdGoogleTextEmbeddingGecko00220231102 ModelId = "google/text-embedding-gecko-002-2023-11-02"
	ModelIdGoogleTextEmbeddingGecko00320231212 ModelId = "google/text-embedding-gecko-003-2023-12-12"
	ModelIdGoogleTextEmbeddingGeckoMultilingual00120231102 ModelId = "google/text-embedding-gecko-multilingual-001-2023-11-02"
	ModelIdGoogleTextMultilingualEmbedding00220240514 ModelId = "google/text-multilingual-embedding-002-2024-05-14"
	ModelIdGoogleTranslategemma12b20260115 ModelId = "google/translategemma-12b-2026-01-15"
	ModelIdGoogleTranslategemma27b20260115 ModelId = "google/translategemma-27b-2026-01-15"
	ModelIdGoogleTranslategemma4b20260115 ModelId = "google/translategemma-4b-2026-01-15"
	ModelIdGoogleVeo220250409 ModelId = "google/veo-2-2025-04-09"
	ModelIdGoogleVeo30FastGeneratePreview20250717 ModelId = "google/veo-3-0-fast-generate-preview-2025-07-17"
	ModelIdGoogleVeo30GeneratePreview20250717 ModelId = "google/veo-3-0-generate-preview-2025-07-17"
	ModelIdGoogleVeo31FastPreview20251015 ModelId = "google/veo-3-1-fast-preview-2025-10-15"
	ModelIdGoogleVeo31Preview20251015 ModelId = "google/veo-3-1-preview-2025-10-15"
	ModelIdGoogleVeo32 ModelId = "google/veo-3-2"
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
	ModelIdInceptionMercury220260224 ModelId = "inception/mercury-2-2026-02-24"
	ModelIdInclusionaiRing1t2520260212 ModelId = "inclusionai/ring-1t-2-5-2026-02-12"
	ModelIdLgExaone3020240807 ModelId = "lg/exaone-3-0-2024-08-07"
	ModelIdLgExaone3524b20241209 ModelId = "lg/exaone-3-5-2-4b-2024-12-09"
	ModelIdLgExaone3532b20241209 ModelId = "lg/exaone-3-5-32b-2024-12-09"
	ModelIdLgExaone3578b20241209 ModelId = "lg/exaone-3-5-7-8b-2024-12-09"
	ModelIdLgExaone4012b20250715 ModelId = "lg/exaone-4-0-1-2b-2025-07-15"
	ModelIdLgExaone4032b20250715 ModelId = "lg/exaone-4-0-32b-2025-07-15"
	ModelIdLgExaoneDeep24b20250318 ModelId = "lg/exaone-deep-2-4b-2025-03-18"
	ModelIdLgExaoneDeep32b20250318 ModelId = "lg/exaone-deep-32b-2025-03-18"
	ModelIdLgExaoneDeep78b20250318 ModelId = "lg/exaone-deep-7-8b-2025-03-18"
	ModelIdLgKExaone20251231 ModelId = "lg/k-exaone-2025-12-31"
	ModelIdLiquidAiLfm212b20250710 ModelId = "liquid-ai/lfm-2-1-2b-2025-07-10"
	ModelIdLiquidAiLfm226b20250923 ModelId = "liquid-ai/lfm-2-2-6b-2025-09-23"
	ModelIdLiquidAiLfm224bA2b20260224 ModelId = "liquid-ai/lfm-2-24b-a2b-2026-02-24"
	ModelIdLiquidAiLfm2350m20250710 ModelId = "liquid-ai/lfm-2-350m-2025-07-10"
	ModelIdLiquidAiLfm2512b20260106 ModelId = "liquid-ai/lfm-2-5-1-2b-2026-01-06"
	ModelIdLiquidAiLfm2512bJp20260106 ModelId = "liquid-ai/lfm-2-5-1-2b-jp-2026-01-06"
	ModelIdLiquidAiLfm2512bThinking20260120 ModelId = "liquid-ai/lfm-2-5-1-2b-thinking-2026-01-20"
	ModelIdLiquidAiLfm25Audio15b ModelId = "liquid-ai/lfm-2-5-audio-1-5b"
	ModelIdLiquidAiLfm25Vl16b ModelId = "liquid-ai/lfm-2-5-vl-1-6b"
	ModelIdLiquidAiLfm2700m20250710 ModelId = "liquid-ai/lfm-2-700m-2025-07-10"
	ModelIdLiquidAiLfm28bA1b20251007 ModelId = "liquid-ai/lfm-2-8b-a1b-2025-10-07"
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
	ModelIdMinimaxHailuo0220250618 ModelId = "minimax/hailuo-02-2025-06-18"
	ModelIdMinimaxHailuo2320251028 ModelId = "minimax/hailuo-2-3-2025-10-28"
	ModelIdMinimaxHailuo23Fast20251028 ModelId = "minimax/hailuo-2-3-fast-2025-10-28"
	ModelIdMinimaxI2v01Director20250211 ModelId = "minimax/i2v-01-director-2025-02-11"
	ModelIdMinimaxI2v01Live ModelId = "minimax/i2v-01-live"
	ModelIdMinimaxImage0120250215 ModelId = "minimax/image-01-2025-02-15"
	ModelIdMinimaxMinimaxM140k20250616 ModelId = "minimax/minimax-m1-40k-2025-06-16"
	ModelIdMinimaxMinimaxM180k20250616 ModelId = "minimax/minimax-m1-80k-2025-06-16"
	ModelIdMinimaxMinimaxM2120251223 ModelId = "minimax/minimax-m2-1-2025-12-23"
	ModelIdMinimaxMinimaxM220251027 ModelId = "minimax/minimax-m2-2025-10-27"
	ModelIdMinimaxMinimaxM2520260212 ModelId = "minimax/minimax-m2-5-2026-02-12"
	ModelIdMinimaxMinimaxM2Her20260124 ModelId = "minimax/minimax-m2-her-2026-01-24"
	ModelIdMinimaxMinimaxText0120250115 ModelId = "minimax/minimax-text-01-2025-01-15"
	ModelIdMinimaxMinimaxVl0120250115 ModelId = "minimax/minimax-vl-01-2025-01-15"
	ModelIdMinimaxMusic1520250620 ModelId = "minimax/music-1-5-2025-06-20"
	ModelIdMinimaxMusic2020251029 ModelId = "minimax/music-2-0-2025-10-29"
	ModelIdMinimaxMusic2520260116 ModelId = "minimax/music-2-5-2026-01-16"
	ModelIdMinimaxS2v01 ModelId = "minimax/s2v-01"
	ModelIdMinimaxSpeech01Hd ModelId = "minimax/speech-01-hd"
	ModelIdMinimaxSpeech01Turbo ModelId = "minimax/speech-01-turbo"
	ModelIdMinimaxSpeech02Hd20250402 ModelId = "minimax/speech-02-hd-2025-04-02"
	ModelIdMinimaxSpeech02Turbo20250402 ModelId = "minimax/speech-02-turbo-2025-04-02"
	ModelIdMinimaxSpeech25HdPreview20250806 ModelId = "minimax/speech-2-5-hd-preview-2025-08-06"
	ModelIdMinimaxSpeech25TurboPreview20250806 ModelId = "minimax/speech-2-5-turbo-preview-2025-08-06"
	ModelIdMinimaxSpeech2620251029 ModelId = "minimax/speech-2-6-2025-10-29"
	ModelIdMinimaxT2v01Director20250211 ModelId = "minimax/t2v-01-director-2025-02-11"
	ModelIdMistralCodestral20240529 ModelId = "mistral/codestral-2024-05-29"
	ModelIdMistralCodestral20250113 ModelId = "mistral/codestral-2025-01-13"
	ModelIdMistralCodestral20250730 ModelId = "mistral/codestral-2025-07-30"
	ModelIdMistralCodestralEmbed20250528 ModelId = "mistral/codestral-embed-2025-05-28"
	ModelIdMistralCodestralMamba7b20240716 ModelId = "mistral/codestral-mamba-7b-2024-07-16"
	ModelIdMistralDevstral2020251209 ModelId = "mistral/devstral-2-0-2025-12-09"
	ModelIdMistralDevstralMedium1020250710 ModelId = "mistral/devstral-medium-1-0-2025-07-10"
	ModelIdMistralDevstralSmall1020250521 ModelId = "mistral/devstral-small-1-0-2025-05-21"
	ModelIdMistralDevstralSmall1120250710 ModelId = "mistral/devstral-small-1-1-2025-07-10"
	ModelIdMistralDevstralSmall2020251209 ModelId = "mistral/devstral-small-2-0-2025-12-09"
	ModelIdMistralMagistralMedium1020250610 ModelId = "mistral/magistral-medium-1-0-2025-06-10"
	ModelIdMistralMagistralMedium1120250724 ModelId = "mistral/magistral-medium-1-1-2025-07-24"
	ModelIdMistralMagistralMedium1220250917 ModelId = "mistral/magistral-medium-1-2-2025-09-17"
	ModelIdMistralMagistralSmall1020250610 ModelId = "mistral/magistral-small-1-0-2025-06-10"
	ModelIdMistralMagistralSmall1120250724 ModelId = "mistral/magistral-small-1-1-2025-07-24"
	ModelIdMistralMagistralSmall1220250917 ModelId = "mistral/magistral-small-1-2-2025-09-17"
	ModelIdMistralMathstral7b20240716 ModelId = "mistral/mathstral-7b-2024-07-16"
	ModelIdMistralMinistral3014b20251202 ModelId = "mistral/ministral-3-0-14b-2025-12-02"
	ModelIdMistralMinistral303b20251202 ModelId = "mistral/ministral-3-0-3b-2025-12-02"
	ModelIdMistralMinistral308b20251202 ModelId = "mistral/ministral-3-0-8b-2025-12-02"
	ModelIdMistralMinistral3b20241009 ModelId = "mistral/ministral-3b-2024-10-09"
	ModelIdMistralMinistral8b20241009 ModelId = "mistral/ministral-8b-2024-10-09"
	ModelIdMistralMistral7b20230927 ModelId = "mistral/mistral-7b-2023-09-27"
	ModelIdMistralMistral7b20231211 ModelId = "mistral/mistral-7b-2023-12-11"
	ModelIdMistralMistral7b20240522 ModelId = "mistral/mistral-7b-2024-05-22"
	ModelIdMistralMistralEmbed20231211 ModelId = "mistral/mistral-embed-2023-12-11"
	ModelIdMistralMistralLarge1020240226 ModelId = "mistral/mistral-large-1-0-2024-02-26"
	ModelIdMistralMistralLarge2020240724 ModelId = "mistral/mistral-large-2-0-2024-07-24"
	ModelIdMistralMistralLarge2120241118 ModelId = "mistral/mistral-large-2-1-2024-11-18"
	ModelIdMistralMistralLarge3020251202 ModelId = "mistral/mistral-large-3-0-2025-12-02"
	ModelIdMistralMistralMedium1020231211 ModelId = "mistral/mistral-medium-1-0-2023-12-11"
	ModelIdMistralMistralMedium3020250507 ModelId = "mistral/mistral-medium-3-0-2025-05-07"
	ModelIdMistralMistralMedium3120250812 ModelId = "mistral/mistral-medium-3-1-2025-08-12"
	ModelIdMistralMistralModeration20241106 ModelId = "mistral/mistral-moderation-2024-11-06"
	ModelIdMistralMistralNemo12b20240718 ModelId = "mistral/mistral-nemo-12b-2024-07-18"
	ModelIdMistralMistralOcr220250522 ModelId = "mistral/mistral-ocr-2-2025-05-22"
	ModelIdMistralMistralOcr20250306 ModelId = "mistral/mistral-ocr-2025-03-06"
	ModelIdMistralMistralSaba20250217 ModelId = "mistral/mistral-saba-2025-02-17"
	ModelIdMistralMistralSmall1020240226 ModelId = "mistral/mistral-small-1-0-2024-02-26"
	ModelIdMistralMistralSmall2020240917 ModelId = "mistral/mistral-small-2-0-2024-09-17"
	ModelIdMistralMistralSmall3020250130 ModelId = "mistral/mistral-small-3-0-2025-01-30"
	ModelIdMistralMistralSmall3120250317 ModelId = "mistral/mistral-small-3-1-2025-03-17"
	ModelIdMistralMistralSmall3220250620 ModelId = "mistral/mistral-small-3-2-2025-06-20"
	ModelIdMistralMistralSmallCreative20251216 ModelId = "mistral/mistral-small-creative-2025-12-16"
	ModelIdMistralMixtral8x22b20240417 ModelId = "mistral/mixtral-8x22b-2024-04-17"
	ModelIdMistralMixtral8x7b20231211 ModelId = "mistral/mixtral-8x7b-2023-12-11"
	ModelIdMistralOcr320251218 ModelId = "mistral/ocr-3-2025-12-18"
	ModelIdMistralPixtral12b20240917 ModelId = "mistral/pixtral-12b-2024-09-17"
	ModelIdMistralPixtralLarge20241118 ModelId = "mistral/pixtral-large-2024-11-18"
	ModelIdMistralVoxtralMini20250715 ModelId = "mistral/voxtral-mini-2025-07-15"
	ModelIdMistralVoxtralMiniTranscribe220260204 ModelId = "mistral/voxtral-mini-transcribe-2-2026-02-04"
	ModelIdMistralVoxtralMiniTranscribe20250715 ModelId = "mistral/voxtral-mini-transcribe-2025-07-15"
	ModelIdMistralVoxtralSmall20250715 ModelId = "mistral/voxtral-small-2025-07-15"
	ModelIdMoonshotAiKimiK1520250120 ModelId = "moonshot-ai/kimi-k1-5-2025-01-20"
	ModelIdMoonshotAiKimiK220250711 ModelId = "moonshot-ai/kimi-k2-2025-07-11"
	ModelIdMoonshotAiKimiK220250905 ModelId = "moonshot-ai/kimi-k2-2025-09-05"
	ModelIdMoonshotAiKimiK2520260127 ModelId = "moonshot-ai/kimi-k2-5-2026-01-27"
	ModelIdMoonshotAiKimiK2Thinking20251106 ModelId = "moonshot-ai/kimi-k2-thinking-2025-11-06"
	ModelIdMoonshotAiKimiLinear48b20251030 ModelId = "moonshot-ai/kimi-linear-48b-2025-10-30"
	ModelIdMoonshotAiKimiVlA3b20250409 ModelId = "moonshot-ai/kimi-vl-a3b-2025-04-09"
	ModelIdMoonshotAiKimiVlA3bThinking20250409 ModelId = "moonshot-ai/kimi-vl-a3b-thinking-2025-04-09"
	ModelIdMoonshotAiKimiVlA3bThinking20250621 ModelId = "moonshot-ai/kimi-vl-a3b-thinking-2025-06-21"
	ModelIdNaverHyperclovaHyperclovaXSeedOmni8b20251229 ModelId = "naver-hyperclova/hyperclova-x-seed-omni-8b-2025-12-29"
	ModelIdNaverHyperclovaHyperclovaXSeedThink14b20250722 ModelId = "naver-hyperclova/hyperclova-x-seed-think-14b-2025-07-22"
	ModelIdNaverHyperclovaHyperclovaXSeedThink32b20251229 ModelId = "naver-hyperclova/hyperclova-x-seed-think-32b-2025-12-29"
	ModelIdNousHermes2Llama270b20240212 ModelId = "nous/hermes-2-llama-2-70b-2024-02-12"
	ModelIdNousHermes2ProLlama370b20240627 ModelId = "nous/hermes-2-pro-llama-3-70b-2024-06-27"
	ModelIdNousHermes2ProLlama38b20240501 ModelId = "nous/hermes-2-pro-llama-3-8b-2024-05-01"
	ModelIdNousHermes2ProMistral7b20240313 ModelId = "nous/hermes-2-pro-mistral-7b-2024-03-13"
	ModelIdNousHermes2ThetaLlama370b20240620 ModelId = "nous/hermes-2-theta-llama-3-70b-2024-06-20"
	ModelIdNousHermes2ThetaLlama38b20240515 ModelId = "nous/hermes-2-theta-llama-3-8b-2024-05-15"
	ModelIdNousHermes3Llama31405b20240815 ModelId = "nous/hermes-3-llama-3-1-405b-2024-08-15"
	ModelIdNousHermes3Llama3170b20240815 ModelId = "nous/hermes-3-llama-3-1-70b-2024-08-15"
	ModelIdNousHermes3Llama318b20240815 ModelId = "nous/hermes-3-llama-3-1-8b-2024-08-15"
	ModelIdNousHermes3Llama323b20241211 ModelId = "nous/hermes-3-llama-3-2-3b-2024-12-11"
	ModelIdNousHermes414b20250726 ModelId = "nous/hermes-4-14b-2025-07-26"
	ModelIdNousHermes4336b20251203 ModelId = "nous/hermes-4-3-36b-2025-12-03"
	ModelIdNousHermes4405b20250726 ModelId = "nous/hermes-4-405b-2025-07-26"
	ModelIdNousHermes470b20250726 ModelId = "nous/hermes-4-70b-2025-07-26"
	ModelIdNousNomos120251209 ModelId = "nous/nomos-1-2025-12-09"
	ModelIdNousNouscoder14b20260106 ModelId = "nous/nouscoder-14b-2026-01-06"
	ModelIdNvidiaLlama31Nemotron70bInstruct20241001 ModelId = "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
	ModelIdNvidiaLlama31NemotronNano4bV11 ModelId = "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
	ModelIdNvidiaLlama31NemotronNano8bV120250318 ModelId = "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
	ModelIdNvidiaLlama31NemotronUltra253bV120250407 ModelId = "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
	ModelIdNvidiaLlama33NemotronSuper49bV120250318 ModelId = "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
	ModelIdNvidiaLlama33NemotronSuper49bV15 ModelId = "nvidia/llama-3-3-nemotron-super-49b-v1-5"
	ModelIdNvidiaNemotronNano330bA3b20251215 ModelId = "nvidia/nemotron-nano-3-30b-a3b-2025-12-15"
	ModelIdNvidiaNvidiaNemotronNano12bV2 ModelId = "nvidia/nvidia-nemotron-nano-12b-v2"
	ModelIdNvidiaNvidiaNemotronNano9bV2 ModelId = "nvidia/nvidia-nemotron-nano-9b-v2"
	ModelIdNvidiaOpenreasoningNemotron15b ModelId = "nvidia/openreasoning-nemotron-1-5b"
	ModelIdNvidiaOpenreasoningNemotron14b ModelId = "nvidia/openreasoning-nemotron-14b"
	ModelIdNvidiaOpenreasoningNemotron32b ModelId = "nvidia/openreasoning-nemotron-32b"
	ModelIdNvidiaOpenreasoningNemotron7b ModelId = "nvidia/openreasoning-nemotron-7b"
	ModelIdOpenaiAda20200611 ModelId = "openai/ada-2020-06-11"
	ModelIdOpenaiBabbage00220230822 ModelId = "openai/babbage-002-2023-08-22"
	ModelIdOpenaiBabbage20200611 ModelId = "openai/babbage-2020-06-11"
	ModelIdOpenaiChatgpt4o20240513 ModelId = "openai/chatgpt-4o-2024-05-13"
	ModelIdOpenaiChatgptImageLatest20251216 ModelId = "openai/chatgpt-image-latest-2025-12-16"
	ModelIdOpenaiCodeCushman001 ModelId = "openai/code-cushman-001"
	ModelIdOpenaiCodeCushman002 ModelId = "openai/code-cushman-002"
	ModelIdOpenaiCodeDavinci001 ModelId = "openai/code-davinci-001"
	ModelIdOpenaiCodeDavinci002 ModelId = "openai/code-davinci-002"
	ModelIdOpenaiCodeDavinciEdit001 ModelId = "openai/code-davinci-edit-001"
	ModelIdOpenaiCodeSearchAdaCode001 ModelId = "openai/code-search-ada-code-001"
	ModelIdOpenaiCodeSearchAdaText001 ModelId = "openai/code-search-ada-text-001"
	ModelIdOpenaiCodeSearchBabbageCode001 ModelId = "openai/code-search-babbage-code-001"
	ModelIdOpenaiCodeSearchBabbageText001 ModelId = "openai/code-search-babbage-text-001"
	ModelIdOpenaiCodexMini20250516 ModelId = "openai/codex-mini-2025-05-16"
	ModelIdOpenaiComputerUsePreview20250311 ModelId = "openai/computer-use-preview-2025-03-11"
	ModelIdOpenaiCurie20200611 ModelId = "openai/curie-2020-06-11"
	ModelIdOpenaiDallE220220928 ModelId = "openai/dall-e-2-2022-09-28"
	ModelIdOpenaiDallE20210105 ModelId = "openai/dall-e-2021-01-05"
	ModelIdOpenaiDallE320231019 ModelId = "openai/dall-e-3-2023-10-19"
	ModelIdOpenaiDavinci00220230822 ModelId = "openai/davinci-002-2023-08-22"
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
	ModelIdOpenaiGpt4oMiniAudioPreview20241217 ModelId = "openai/gpt-4o-mini-audio-preview-2024-12-17"
	ModelIdOpenaiGpt4oMiniRealtimePreview20241217 ModelId = "openai/gpt-4o-mini-realtime-preview-2024-12-17"
	ModelIdOpenaiGpt4oMiniSearchPreview20250311 ModelId = "openai/gpt-4o-mini-search-preview-2025-03-11"
	ModelIdOpenaiGpt4oMiniTranscribe20250320 ModelId = "openai/gpt-4o-mini-transcribe-2025-03-20"
	ModelIdOpenaiGpt4oMiniTranscribe20251215 ModelId = "openai/gpt-4o-mini-transcribe-2025-12-15"
	ModelIdOpenaiGpt4oMiniTts20250320 ModelId = "openai/gpt-4o-mini-tts-2025-03-20"
	ModelIdOpenaiGpt4oMiniTts20251215 ModelId = "openai/gpt-4o-mini-tts-2025-12-15"
	ModelIdOpenaiGpt4oRealtimePreview20241001 ModelId = "openai/gpt-4o-realtime-preview-2024-10-01"
	ModelIdOpenaiGpt4oRealtimePreview20241217 ModelId = "openai/gpt-4o-realtime-preview-2024-12-17"
	ModelIdOpenaiGpt4oRealtimePreview20250603 ModelId = "openai/gpt-4o-realtime-preview-2025-06-03"
	ModelIdOpenaiGpt4oSearchPreview20250311 ModelId = "openai/gpt-4o-search-preview-2025-03-11"
	ModelIdOpenaiGpt4oTranscribe20250320 ModelId = "openai/gpt-4o-transcribe-2025-03-20"
	ModelIdOpenaiGpt4oTranscribeDiarize20251015 ModelId = "openai/gpt-4o-transcribe-diarize-2025-10-15"
	ModelIdOpenaiGpt5120251112 ModelId = "openai/gpt-5-1-2025-11-12"
	ModelIdOpenaiGpt51Chat20251113 ModelId = "openai/gpt-5-1-chat-2025-11-13"
	ModelIdOpenaiGpt51Codex20251113 ModelId = "openai/gpt-5-1-codex-2025-11-13"
	ModelIdOpenaiGpt51CodexMax20251119 ModelId = "openai/gpt-5-1-codex-max-2025-11-19"
	ModelIdOpenaiGpt51CodexMini20251113 ModelId = "openai/gpt-5-1-codex-mini-2025-11-13"
	ModelIdOpenaiGpt51Pro ModelId = "openai/gpt-5-1-pro"
	ModelIdOpenaiGpt5220251211 ModelId = "openai/gpt-5-2-2025-12-11"
	ModelIdOpenaiGpt52Chat20251211 ModelId = "openai/gpt-5-2-chat-2025-12-11"
	ModelIdOpenaiGpt52Codex20251218 ModelId = "openai/gpt-5-2-codex-2025-12-18"
	ModelIdOpenaiGpt52Mini ModelId = "openai/gpt-5-2-mini"
	ModelIdOpenaiGpt52Pro20251211 ModelId = "openai/gpt-5-2-pro-2025-12-11"
	ModelIdOpenaiGpt520250807 ModelId = "openai/gpt-5-2025-08-07"
	ModelIdOpenaiGpt53Chat20260303 ModelId = "openai/gpt-5-3-chat-2026-03-03"
	ModelIdOpenaiGpt53Codex20260205 ModelId = "openai/gpt-5-3-codex-2026-02-05"
	ModelIdOpenaiGpt53CodexSpark20260212 ModelId = "openai/gpt-5-3-codex-spark-2026-02-12"
	ModelIdOpenaiGpt54 ModelId = "openai/gpt-5-4"
	ModelIdOpenaiGpt5Chat20250807 ModelId = "openai/gpt-5-chat-2025-08-07"
	ModelIdOpenaiGpt5Codex20250915 ModelId = "openai/gpt-5-codex-2025-09-15"
	ModelIdOpenaiGpt5CodexMini20251107 ModelId = "openai/gpt-5-codex-mini-2025-11-07"
	ModelIdOpenaiGpt5Mini20250807 ModelId = "openai/gpt-5-mini-2025-08-07"
	ModelIdOpenaiGpt5Nano20250807 ModelId = "openai/gpt-5-nano-2025-08-07"
	ModelIdOpenaiGpt5Pro20250807 ModelId = "openai/gpt-5-pro-2025-08-07"
	ModelIdOpenaiGpt5SearchApi20251014 ModelId = "openai/gpt-5-search-api-2025-10-14"
	ModelIdOpenaiGptAudio1520260223 ModelId = "openai/gpt-audio-1-5-2026-02-23"
	ModelIdOpenaiGptAudio20250828 ModelId = "openai/gpt-audio-2025-08-28"
	ModelIdOpenaiGptAudioMini20251006 ModelId = "openai/gpt-audio-mini-2025-10-06"
	ModelIdOpenaiGptAudioMini20251215 ModelId = "openai/gpt-audio-mini-2025-12-15"
	ModelIdOpenaiGptImage120250423 ModelId = "openai/gpt-image-1-2025-04-23"
	ModelIdOpenaiGptImage1520251216 ModelId = "openai/gpt-image-1-5-2025-12-16"
	ModelIdOpenaiGptImage1Mini20251006 ModelId = "openai/gpt-image-1-mini-2025-10-06"
	ModelIdOpenaiGptOss120b20250805 ModelId = "openai/gpt-oss-120b-2025-08-05"
	ModelIdOpenaiGptOss20b20250805 ModelId = "openai/gpt-oss-20b-2025-08-05"
	ModelIdOpenaiGptOssSafeguard120b20251029 ModelId = "openai/gpt-oss-safeguard-120b-2025-10-29"
	ModelIdOpenaiGptOssSafeguard20b20251029 ModelId = "openai/gpt-oss-safeguard-20b-2025-10-29"
	ModelIdOpenaiGptRealtime1520260223 ModelId = "openai/gpt-realtime-1-5-2026-02-23"
	ModelIdOpenaiGptRealtime20250828 ModelId = "openai/gpt-realtime-2025-08-28"
	ModelIdOpenaiGptRealtimeMini20251006 ModelId = "openai/gpt-realtime-mini-2025-10-06"
	ModelIdOpenaiGptRealtimeMini20251215 ModelId = "openai/gpt-realtime-mini-2025-12-15"
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
	ModelIdOpenaiSora220251208 ModelId = "openai/sora-2-2025-12-08"
	ModelIdOpenaiSora2Pro20251003 ModelId = "openai/sora-2-pro-2025-10-03"
	ModelIdOpenaiTextAda001 ModelId = "openai/text-ada-001"
	ModelIdOpenaiTextBabbage001 ModelId = "openai/text-babbage-001"
	ModelIdOpenaiTextCurie001 ModelId = "openai/text-curie-001"
	ModelIdOpenaiTextDavinci001 ModelId = "openai/text-davinci-001"
	ModelIdOpenaiTextDavinci002 ModelId = "openai/text-davinci-002"
	ModelIdOpenaiTextDavinci003 ModelId = "openai/text-davinci-003"
	ModelIdOpenaiTextDavinciEdit001 ModelId = "openai/text-davinci-edit-001"
	ModelIdOpenaiTextEmbedding3Large20240125 ModelId = "openai/text-embedding-3-large-2024-01-25"
	ModelIdOpenaiTextEmbedding3Small20240125 ModelId = "openai/text-embedding-3-small-2024-01-25"
	ModelIdOpenaiTextEmbeddingAda00220221215 ModelId = "openai/text-embedding-ada-002-2022-12-15"
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
	ModelIdOpenaiTts120231106 ModelId = "openai/tts-1-2023-11-06"
	ModelIdOpenaiTts1Hd20231106 ModelId = "openai/tts-1-hd-2023-11-06"
	ModelIdOpenaiWhisper120230301 ModelId = "openai/whisper-1-2023-03-01"
	ModelIdPrimeIntellectIntellect3120260218 ModelId = "prime-intellect/intellect-3-1-2026-02-18"
	ModelIdPrimeIntellectIntellect320251126 ModelId = "prime-intellect/intellect-3-2025-11-26"
	ModelIdQwenCodeQwen157b ModelId = "qwen/code-qwen-1-5-7b"
	ModelIdQwenQvq72bPreview ModelId = "qwen/qvq-72b-preview"
	ModelIdQwenQwen1505b ModelId = "qwen/qwen-1-5-0-5b"
	ModelIdQwenQwen1518b ModelId = "qwen/qwen-1-5-1-8b"
	ModelIdQwenQwen15110b ModelId = "qwen/qwen-1-5-110b"
	ModelIdQwenQwen1514b ModelId = "qwen/qwen-1-5-14b"
	ModelIdQwenQwen1532b ModelId = "qwen/qwen-1-5-32b"
	ModelIdQwenQwen154b ModelId = "qwen/qwen-1-5-4b"
	ModelIdQwenQwen1572b ModelId = "qwen/qwen-1-5-72b"
	ModelIdQwenQwen157b ModelId = "qwen/qwen-1-5-7b"
	ModelIdQwenQwen15MoeA27b ModelId = "qwen/qwen-1-5-moe-a2-7b"
	ModelIdQwenQwen18b ModelId = "qwen/qwen-1-8b"
	ModelIdQwenQwen14b ModelId = "qwen/qwen-14b"
	ModelIdQwenQwen205b ModelId = "qwen/qwen-2-0-5b"
	ModelIdQwenQwen215b ModelId = "qwen/qwen-2-1-5b"
	ModelIdQwenQwen2505b ModelId = "qwen/qwen-2-5-0-5b"
	ModelIdQwenQwen2515b ModelId = "qwen/qwen-2-5-1-5b"
	ModelIdQwenQwen2514b ModelId = "qwen/qwen-2-5-14b"
	ModelIdQwenQwen2532b ModelId = "qwen/qwen-2-5-32b"
	ModelIdQwenQwen253b ModelId = "qwen/qwen-2-5-3b"
	ModelIdQwenQwen2572b ModelId = "qwen/qwen-2-5-72b"
	ModelIdQwenQwen257b ModelId = "qwen/qwen-2-5-7b"
	ModelIdQwenQwen25Coder05b ModelId = "qwen/qwen-2-5-coder-0-5b"
	ModelIdQwenQwen25Coder15b ModelId = "qwen/qwen-2-5-coder-1-5b"
	ModelIdQwenQwen25Coder14b ModelId = "qwen/qwen-2-5-coder-14b"
	ModelIdQwenQwen25Coder32bInstruct ModelId = "qwen/qwen-2-5-coder-32b-instruct"
	ModelIdQwenQwen25Coder3b ModelId = "qwen/qwen-2-5-coder-3b"
	ModelIdQwenQwen25Coder7b ModelId = "qwen/qwen-2-5-coder-7b"
	ModelIdQwenQwen25Math15b ModelId = "qwen/qwen-2-5-math-1-5b"
	ModelIdQwenQwen25Math72b ModelId = "qwen/qwen-2-5-math-72b"
	ModelIdQwenQwen25Math7b ModelId = "qwen/qwen-2-5-math-7b"
	ModelIdQwenQwen25Math7bPrm800k ModelId = "qwen/qwen-2-5-math-7b-prm800k"
	ModelIdQwenQwen25MathPrm72b ModelId = "qwen/qwen-2-5-math-prm-72b"
	ModelIdQwenQwen25MathPrm7b ModelId = "qwen/qwen-2-5-math-prm-7b"
	ModelIdQwenQwen25MathRm72b ModelId = "qwen/qwen-2-5-math-rm-72b"
	ModelIdQwenQwen25Omni3b ModelId = "qwen/qwen-2-5-omni-3b"
	ModelIdQwenQwen25Omni7b ModelId = "qwen/qwen-2-5-omni-7b"
	ModelIdQwenQwen25Vl32bInstruct ModelId = "qwen/qwen-2-5-vl-32b-instruct"
	ModelIdQwenQwen25Vl3bInstruct ModelId = "qwen/qwen-2-5-vl-3b-instruct"
	ModelIdQwenQwen25Vl72bInstruct ModelId = "qwen/qwen-2-5-vl-72b-instruct"
	ModelIdQwenQwen25Vl7bInstruct ModelId = "qwen/qwen-2-5-vl-7b-instruct"
	ModelIdQwenQwen272bInstruct ModelId = "qwen/qwen-2-72b-instruct"
	ModelIdQwenQwen27bInstruct ModelId = "qwen/qwen-2-7b-instruct"
	ModelIdQwenQwen2Audio7b ModelId = "qwen/qwen-2-audio-7b"
	ModelIdQwenQwen2Math15b ModelId = "qwen/qwen-2-math-1-5b"
	ModelIdQwenQwen2Math72b ModelId = "qwen/qwen-2-math-72b"
	ModelIdQwenQwen2Math7b ModelId = "qwen/qwen-2-math-7b"
	ModelIdQwenQwen2MathRm72b ModelId = "qwen/qwen-2-math-rm-72b"
	ModelIdQwenQwen2Vl2b ModelId = "qwen/qwen-2-vl-2b"
	ModelIdQwenQwen2Vl72b ModelId = "qwen/qwen-2-vl-72b"
	ModelIdQwenQwen2Vl7b ModelId = "qwen/qwen-2-vl-7b"
	ModelIdQwenQwen306b ModelId = "qwen/qwen-3-0-6b"
	ModelIdQwenQwen317b ModelId = "qwen/qwen-3-1-7b"
	ModelIdQwenQwen314b ModelId = "qwen/qwen-3-14b"
	ModelIdQwenQwen3235bA22b ModelId = "qwen/qwen-3-235b-a22b"
	ModelIdQwenQwen3235bA22bThinking2507 ModelId = "qwen/qwen-3-235b-a22b-thinking-2507"
	ModelIdQwenQwen330bA3b ModelId = "qwen/qwen-3-30b-a3b"
	ModelIdQwenQwen330bA3bInstruct2507 ModelId = "qwen/qwen-3-30b-a3b-instruct-2507"
	ModelIdQwenQwen330bA3bThinking2507 ModelId = "qwen/qwen-3-30b-a3b-thinking-2507"
	ModelIdQwenQwen332b ModelId = "qwen/qwen-3-32b"
	ModelIdQwenQwen34b ModelId = "qwen/qwen-3-4b"
	ModelIdQwenQwen34bInstruct2507 ModelId = "qwen/qwen-3-4b-instruct-2507"
	ModelIdQwenQwen34bSaferl ModelId = "qwen/qwen-3-4b-saferl"
	ModelIdQwenQwen34bThinking2507 ModelId = "qwen/qwen-3-4b-thinking-2507"
	ModelIdQwenQwen3508b20260302 ModelId = "qwen/qwen-3-5-0-8b-2026-03-02"
	ModelIdQwenQwen35122bA10b20260224 ModelId = "qwen/qwen-3-5-122b-a10b-2026-02-24"
	ModelIdQwenQwen3527b20260224 ModelId = "qwen/qwen-3-5-27b-2026-02-24"
	ModelIdQwenQwen352b20260302 ModelId = "qwen/qwen-3-5-2b-2026-03-02"
	ModelIdQwenQwen3535bA3b20260224 ModelId = "qwen/qwen-3-5-35b-a3b-2026-02-24"
	ModelIdQwenQwen35397bA17b20260216 ModelId = "qwen/qwen-3-5-397b-a17b-2026-02-16"
	ModelIdQwenQwen354b20260302 ModelId = "qwen/qwen-3-5-4b-2026-03-02"
	ModelIdQwenQwen359b20260302 ModelId = "qwen/qwen-3-5-9b-2026-03-02"
	ModelIdQwenQwen35Flash20260223 ModelId = "qwen/qwen-3-5-flash-2026-02-23"
	ModelIdQwenQwen35Plus20260216 ModelId = "qwen/qwen-3-5-plus-2026-02-16"
	ModelIdQwenQwen38b ModelId = "qwen/qwen-3-8b"
	ModelIdQwenQwen3A235A22bInstruct2507 ModelId = "qwen/qwen-3-a235-a22b-instruct-2507"
	ModelIdQwenQwen3Asr06b ModelId = "qwen/qwen-3-asr-0-6b"
	ModelIdQwenQwen3Asr17b ModelId = "qwen/qwen-3-asr-1-7b"
	ModelIdQwenQwen3Coder30bA3bInstruct ModelId = "qwen/qwen-3-coder-30b-a3b-instruct"
	ModelIdQwenQwen3Coder480bA35bInstruct ModelId = "qwen/qwen-3-coder-480b-a35b-instruct"
	ModelIdQwenQwen3CoderNext ModelId = "qwen/qwen-3-coder-next"
	ModelIdQwenQwen3Embedding06b ModelId = "qwen/qwen-3-embedding-0-6b"
	ModelIdQwenQwen3Embedding4b ModelId = "qwen/qwen-3-embedding-4b"
	ModelIdQwenQwen3Embedding8b ModelId = "qwen/qwen-3-embedding-8b"
	ModelIdQwenQwen3Forcedaligner06b ModelId = "qwen/qwen-3-forcedaligner-0-6b"
	ModelIdQwenQwen3GuardGen06b ModelId = "qwen/qwen-3-guard-gen-0-6b"
	ModelIdQwenQwen3GuardGen4b ModelId = "qwen/qwen-3-guard-gen-4b"
	ModelIdQwenQwen3GuardGen8b ModelId = "qwen/qwen-3-guard-gen-8b"
	ModelIdQwenQwen3GuardStream06b ModelId = "qwen/qwen-3-guard-stream-0-6b"
	ModelIdQwenQwen3GuardStream4b ModelId = "qwen/qwen-3-guard-stream-4b"
	ModelIdQwenQwen3GuardStream8b ModelId = "qwen/qwen-3-guard-stream-8b"
	ModelIdQwenQwen3MaxThinking20260126 ModelId = "qwen/qwen-3-max-thinking-2026-01-26"
	ModelIdQwenQwen3Next80bA3bInstruct ModelId = "qwen/qwen-3-next-80b-a3b-instruct"
	ModelIdQwenQwen3Next80bA3bThinking ModelId = "qwen/qwen-3-next-80b-a3b-thinking"
	ModelIdQwenQwen3Omni30bA3bCaptioner ModelId = "qwen/qwen-3-omni-30b-a3b-captioner"
	ModelIdQwenQwen3Omni30bA3bInstruct ModelId = "qwen/qwen-3-omni-30b-a3b-instruct"
	ModelIdQwenQwen3Omni30bA3bThinking ModelId = "qwen/qwen-3-omni-30b-a3b-thinking"
	ModelIdQwenQwen3OmniFlash ModelId = "qwen/qwen-3-omni-flash"
	ModelIdQwenQwen3Reranker06b ModelId = "qwen/qwen-3-reranker-0-6b"
	ModelIdQwenQwen3Reranker4b ModelId = "qwen/qwen-3-reranker-4b"
	ModelIdQwenQwen3Reranker8b ModelId = "qwen/qwen-3-reranker-8b"
	ModelIdQwenQwen3Tts ModelId = "qwen/qwen-3-tts"
	ModelIdQwenQwen3Tts12hz06bBase ModelId = "qwen/qwen-3-tts-12hz-0-6b-base"
	ModelIdQwenQwen3Tts12hz06bCustomvoice ModelId = "qwen/qwen-3-tts-12hz-0-6b-customvoice"
	ModelIdQwenQwen3Tts12hz17bBase ModelId = "qwen/qwen-3-tts-12hz-1-7b-base"
	ModelIdQwenQwen3Tts12hz17bVoicedesign ModelId = "qwen/qwen-3-tts-12hz-1-7b-voicedesign"
	ModelIdQwenQwen3TtsTokenizer12hz ModelId = "qwen/qwen-3-tts-tokenizer-12hz"
	ModelIdQwenQwen3Vl235bA22bInstruct ModelId = "qwen/qwen-3-vl-235b-a22b-instruct"
	ModelIdQwenQwen3Vl235bA22bThinking ModelId = "qwen/qwen-3-vl-235b-a22b-thinking"
	ModelIdQwenQwen3Vl2bInstruct ModelId = "qwen/qwen-3-vl-2b-instruct"
	ModelIdQwenQwen3Vl2bThinking ModelId = "qwen/qwen-3-vl-2b-thinking"
	ModelIdQwenQwen3Vl30bA3bInstruct ModelId = "qwen/qwen-3-vl-30b-a3b-instruct"
	ModelIdQwenQwen3Vl30bA3bThinking ModelId = "qwen/qwen-3-vl-30b-a3b-thinking"
	ModelIdQwenQwen3Vl32bInstruct ModelId = "qwen/qwen-3-vl-32b-instruct"
	ModelIdQwenQwen3Vl32bThinking ModelId = "qwen/qwen-3-vl-32b-thinking"
	ModelIdQwenQwen3Vl4bInstruct ModelId = "qwen/qwen-3-vl-4b-instruct"
	ModelIdQwenQwen3Vl4bThinking ModelId = "qwen/qwen-3-vl-4b-thinking"
	ModelIdQwenQwen3Vl8bInstruct ModelId = "qwen/qwen-3-vl-8b-instruct"
	ModelIdQwenQwen3Vl8bThinking ModelId = "qwen/qwen-3-vl-8b-thinking"
	ModelIdQwenQwen3VlEmbedding2b ModelId = "qwen/qwen-3-vl-embedding-2b"
	ModelIdQwenQwen3VlEmbedding8b ModelId = "qwen/qwen-3-vl-embedding-8b"
	ModelIdQwenQwen3VlReranker2b ModelId = "qwen/qwen-3-vl-reranker-2b"
	ModelIdQwenQwen3VlReranker8b ModelId = "qwen/qwen-3-vl-reranker-8b"
	ModelIdQwenQwen72b ModelId = "qwen/qwen-72b"
	ModelIdQwenQwen7b ModelId = "qwen/qwen-7b"
	ModelIdQwenQwenAudio ModelId = "qwen/qwen-audio"
	ModelIdQwenQwenAudioChat ModelId = "qwen/qwen-audio-chat"
	ModelIdQwenQwenImage ModelId = "qwen/qwen-image"
	ModelIdQwenQwenImage2512 ModelId = "qwen/qwen-image-2512"
	ModelIdQwenQwenImageEdit ModelId = "qwen/qwen-image-edit"
	ModelIdQwenQwenImageEdit2509 ModelId = "qwen/qwen-image-edit-2509"
	ModelIdQwenQwenImageEdit2511 ModelId = "qwen/qwen-image-edit-2511"
	ModelIdQwenQwenImageLayered ModelId = "qwen/qwen-image-layered"
	ModelIdQwenQwenVl ModelId = "qwen/qwen-vl"
	ModelIdQwenQwq32b ModelId = "qwen/qwq-32b"
	ModelIdQwenQwq32bPreview ModelId = "qwen/qwq-32b-preview"
	ModelIdQwenWorldpm72b ModelId = "qwen/worldpm-72b"
	ModelIdQwenWorldpm72bHelpsteer2 ModelId = "qwen/worldpm-72b-helpsteer2"
	ModelIdQwenWorldpm72bRlhflow ModelId = "qwen/worldpm-72b-rlhflow"
	ModelIdQwenWorldpm72bUltrafeedback ModelId = "qwen/worldpm-72b-ultrafeedback"
	ModelIdRelaceRelaceSearch ModelId = "relace/relace-search"
	ModelIdSourcefulRiverflowV2FastPreview ModelId = "sourceful/riverflow-v2-fast-preview"
	ModelIdSourcefulRiverflowV2MaxPreview ModelId = "sourceful/riverflow-v2-max-preview"
	ModelIdSourcefulRiverflowV2StandardPreview ModelId = "sourceful/riverflow-v2-standard-preview"
	ModelIdSunoSunoV3520240525 ModelId = "suno/suno-v3-5-2024-05-25"
	ModelIdSunoSunoV420241119 ModelId = "suno/suno-v4-2024-11-19"
	ModelIdSunoSunoV4520250501 ModelId = "suno/suno-v4-5-2025-05-01"
	ModelIdSunoSunoV45All20251027 ModelId = "suno/suno-v4-5-all-2025-10-27"
	ModelIdSunoSunoV4520250717 ModelId = "suno/suno-v4-5+-2025-07-17"
	ModelIdSunoSunoV520250923 ModelId = "suno/suno-v5-2025-09-23"
	ModelIdUpstageSolarPro ModelId = "upstage/solar-pro"
	ModelIdUpstageSolarPro220250710 ModelId = "upstage/solar-pro-2-2025-07-10"
	ModelIdUpstageSolarPro220250909 ModelId = "upstage/solar-pro-2-2025-09-09"
	ModelIdUpstageSolarPro220251215 ModelId = "upstage/solar-pro-2-2025-12-15"
	ModelIdUpstageSolarPro2Preview20250520 ModelId = "upstage/solar-pro-2-preview-2025-05-20"
	ModelIdUpstageSolarPro320260126 ModelId = "upstage/solar-pro-3-2026-01-26"
	ModelIdVercelV010Md ModelId = "vercel/v0-1-0-md"
	ModelIdVercelV015Lg ModelId = "vercel/v0-1-5-lg"
	ModelIdVercelV015Md ModelId = "vercel/v0-1-5-md"
	ModelIdVercelV015Sm ModelId = "vercel/v0-1-5-sm"
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
	ModelIdXAiGrokImagineImage20260129 ModelId = "x-ai/grok-imagine-image-2026-01-29"
	ModelIdXAiGrokImagineImagePro20260129 ModelId = "x-ai/grok-imagine-image-pro-2026-01-29"
	ModelIdXAiGrokImagineVideo20260129 ModelId = "x-ai/grok-imagine-video-2026-01-29"
	ModelIdXiaomiMimoV2Flash20251216 ModelId = "xiaomi/mimo-v2-flash-2025-12-16"
	ModelIdZAiGlm41v9b20250702 ModelId = "z-ai/glm-4-1v-9b-2025-07-02"
	ModelIdZAiGlm41vThinking9b20250702 ModelId = "z-ai/glm-4-1v-thinking-9b-2025-07-02"
	ModelIdZAiGlm432b20250415 ModelId = "z-ai/glm-4-32b-2025-04-15"
	ModelIdZAiGlm4520250728 ModelId = "z-ai/glm-4-5-2025-07-28"
	ModelIdZAiGlm45Air20250728 ModelId = "z-ai/glm-4-5-air-2025-07-28"
	ModelIdZAiGlm45AirX ModelId = "z-ai/glm-4-5-air-x"
	ModelIdZAiGlm45X ModelId = "z-ai/glm-4-5-x"
	ModelIdZAiGlm45v20250811 ModelId = "z-ai/glm-4-5v-2025-08-11"
	ModelIdZAiGlm4620250930 ModelId = "z-ai/glm-4-6-2025-09-30"
	ModelIdZAiGlm46v20251208 ModelId = "z-ai/glm-4-6v-2025-12-08"
	ModelIdZAiGlm46vFlash20251208 ModelId = "z-ai/glm-4-6v-flash-2025-12-08"
	ModelIdZAiGlm4720251222 ModelId = "z-ai/glm-4-7-2025-12-22"
	ModelIdZAiGlm47Flash20260119 ModelId = "z-ai/glm-4-7-flash-2026-01-19"
	ModelIdZAiGlm49b20240604 ModelId = "z-ai/glm-4-9b-2024-06-04"
	ModelIdZAiGlm49b20250414 ModelId = "z-ai/glm-4-9b-2025-04-14"
	ModelIdZAiGlm49bChat1m20241024 ModelId = "z-ai/glm-4-9b-chat-1m-2024-10-24"
	ModelIdZAiGlm49bChat20240604 ModelId = "z-ai/glm-4-9b-chat-2024-06-04"
	ModelIdZAiGlm4v9b ModelId = "z-ai/glm-4v-9b"
	ModelIdZAiGlm520260211 ModelId = "z-ai/glm-5-2026-02-11"
	ModelIdZAiGlm5Code ModelId = "z-ai/glm-5-code"
	ModelIdZAiGlmImage20260114 ModelId = "z-ai/glm-image-2026-01-14"
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

type NotImplementedResponse struct {
	Description *string `json:"description,omitempty"`
	Error *string `json:"error,omitempty"`
	StatusCode *int `json:"status_code,omitempty"`
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
	OrganisationIdGoogle OrganisationId = "google"
	OrganisationIdIbm OrganisationId = "ibm"
	OrganisationIdInception OrganisationId = "inception"
	OrganisationIdInclusionai OrganisationId = "inclusionai"
	OrganisationIdLg OrganisationId = "lg"
	OrganisationIdLiquidAi OrganisationId = "liquid-ai"
	OrganisationIdMeta OrganisationId = "meta"
	OrganisationIdMicrosoft OrganisationId = "microsoft"
	OrganisationIdMinimax OrganisationId = "minimax"
	OrganisationIdMistral OrganisationId = "mistral"
	OrganisationIdMoonshotAi OrganisationId = "moonshot-ai"
	OrganisationIdNaverHyperclova OrganisationId = "naver-hyperclova"
	OrganisationIdNous OrganisationId = "nous"
	OrganisationIdNvidia OrganisationId = "nvidia"
	OrganisationIdOpenai OrganisationId = "openai"
	OrganisationIdPerplexity OrganisationId = "perplexity"
	OrganisationIdPrimeIntellect OrganisationId = "prime-intellect"
	OrganisationIdQwen OrganisationId = "qwen"
	OrganisationIdRelace OrganisationId = "relace"
	OrganisationIdSourceful OrganisationId = "sourceful"
	OrganisationIdStepfun OrganisationId = "stepfun"
	OrganisationIdSuno OrganisationId = "suno"
	OrganisationIdUpstage OrganisationId = "upstage"
	OrganisationIdVercel OrganisationId = "vercel"
	OrganisationIdVoyage OrganisationId = "voyage"
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

type RealtimeNotImplementedResponse struct {
	Error *map[string]interface{} `json:"error,omitempty"`
}

type ReasoningConfig struct {
	Effort *string `json:"effort,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	IncludeThoughts *bool `json:"include_thoughts,omitempty"`
	IncludeThoughts *bool `json:"includeThoughts,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	Summary *string `json:"summary,omitempty"`
}

type ResponsesInputItem struct {
	Content interface{} `json:"content,omitempty"`
	Phase *string `json:"phase,omitempty"`
	Role *string `json:"role,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ResponsesOutputItem struct {
	Content *[]map[string]interface{} `json:"content,omitempty"`
	Phase *string `json:"phase,omitempty"`
	Role *string `json:"role,omitempty"`
	Type *string `json:"type,omitempty"`
}

type ResponsesRequest struct {
	Background *bool `json:"background,omitempty"`
	Conversation interface{} `json:"conversation,omitempty"`
	Debug *map[string]interface{} `json:"debug,omitempty"`
	ImageConfig *map[string]interface{} `json:"image_config,omitempty"`
	ImageConfig *map[string]interface{} `json:"imageConfig,omitempty"`
	Include *[]string `json:"include,omitempty"`
	Input interface{} `json:"input,omitempty"`
	InputItems *[]map[string]interface{} `json:"input_items,omitempty"`
	Instructions *string `json:"instructions,omitempty"`
	MaxCompletionTokens *int `json:"max_completion_tokens,omitempty"`
	MaxOutputTokens *int `json:"max_output_tokens,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	MaxToolCalls *int `json:"max_tool_calls,omitempty"`
	Meta *bool `json:"meta,omitempty"`
	Metadata *map[string]interface{} `json:"metadata,omitempty"`
	Modalities *[]string `json:"modalities,omitempty"`
	Model string `json:"model"`
	ParallelToolCalls *bool `json:"parallel_tool_calls,omitempty"`
	PreviousResponseId *string `json:"previous_response_id,omitempty"`
	Prompt *map[string]interface{} `json:"prompt,omitempty"`
	PromptCacheKey *string `json:"prompt_cache_key,omitempty"`
	PromptCacheRetention *string `json:"prompt_cache_retention,omitempty"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	ProviderOptions *map[string]interface{} `json:"providerOptions,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	ResponseModalities *[]string `json:"response_modalities,omitempty"`
	ResponseModalities *[]string `json:"responseModalities,omitempty"`
	SafetyIdentifier *string `json:"safety_identifier,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
	Speed *string `json:"speed,omitempty"`
	Store *bool `json:"store,omitempty"`
	Stream *bool `json:"stream,omitempty"`
	StreamOptions *map[string]interface{} `json:"stream_options,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Text *map[string]interface{} `json:"text,omitempty"`
	Thinking *map[string]interface{} `json:"thinking,omitempty"`
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

type TextContentPart struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

type TextModerationInput struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

type ThinkingConfig struct {
	BudgetTokens *int `json:"budget_tokens,omitempty"`
	BudgetTokens *int `json:"budgetTokens,omitempty"`
	Effort *string `json:"effort,omitempty"`
	Enabled *bool `json:"enabled,omitempty"`
	IncludeThoughts *bool `json:"include_thoughts,omitempty"`
	IncludeThoughts *bool `json:"includeThoughts,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
	MaxTokens *int `json:"maxTokens,omitempty"`
	Type *string `json:"type,omitempty"`
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
	EnhancePrompt *bool `json:"enhance_prompt,omitempty"`
	GenerateAudio *bool `json:"generate_audio,omitempty"`
	Input *map[string]interface{} `json:"input,omitempty"`
	InputImage interface{} `json:"input_image,omitempty"`
	InputLastFrame interface{} `json:"input_last_frame,omitempty"`
	InputReference *string `json:"input_reference,omitempty"`
	InputReferenceMimeType *string `json:"input_reference_mime_type,omitempty"`
	InputVideo interface{} `json:"input_video,omitempty"`
	LastFrame interface{} `json:"last_frame,omitempty"`
	Model string `json:"model"`
	NegativePrompt *string `json:"negative_prompt,omitempty"`
	NumberOfVideos *int `json:"number_of_videos,omitempty"`
	OutputStorageUri *string `json:"output_storage_uri,omitempty"`
	PersonGeneration *string `json:"person_generation,omitempty"`
	Prompt string `json:"prompt"`
	Provider *map[string]interface{} `json:"provider,omitempty"`
	Quality *string `json:"quality,omitempty"`
	Ratio *string `json:"ratio,omitempty"`
	ReferenceImages *[]map[string]interface{} `json:"reference_images,omitempty"`
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
