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
	BenchmarkIdBirdSqlDev BenchmarkId = "bird-sql-(dev)"
	BenchmarkIdBixbench BenchmarkId = "bixbench"
	BenchmarkIdBlink BenchmarkId = "blink"
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
	BenchmarkIdCxr143condMacroF1 BenchmarkId = "cxr14-3cond-macro-f1"
	BenchmarkIdCybench BenchmarkId = "cybench"
	BenchmarkIdCybergym BenchmarkId = "cybergym"
	BenchmarkIdCybersecurityCtfs BenchmarkId = "cybersecurity-ctfs"
	BenchmarkIdDa2k BenchmarkId = "da-2k"
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
	BenchmarkIdFrontiermath BenchmarkId = "frontiermath"
	BenchmarkIdFrontiersciOlympiad BenchmarkId = "frontiersci-olympiad"
	BenchmarkIdFrontiersciResearch BenchmarkId = "frontiersci-research"
	BenchmarkIdFsc147Down BenchmarkId = "fsc-147-down"
	BenchmarkIdFullstackbenchEn BenchmarkId = "fullstackbench-en"
	BenchmarkIdFullstackbenchZh BenchmarkId = "fullstackbench-zh"
	BenchmarkIdFunctionalmath BenchmarkId = "functionalmath"
	BenchmarkIdGalileoAgent BenchmarkId = "galileo-agent"
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
	Provider *map[string]interface{} `json:"provider,omitempty"`
	ProviderOptions *map[string]interface{} `json:"provider_options,omitempty"`
	Reasoning *map[string]interface{} `json:"reasoning,omitempty"`
	ResponseFormat interface{} `json:"response_format,omitempty"`
	SafetyIdentifier *string `json:"safety_identifier,omitempty"`
	Seed *int `json:"seed,omitempty"`
	ServiceTier *string `json:"service_tier,omitempty"`
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
	Object *string `json:"object,omitempty"`
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

type ErrorResponse struct {
	Description *string `json:"description,omitempty"`
	Error interface{} `json:"error"`
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
	Limit int `json:"limit"`
	Models []map[string]interface{} `json:"models"`
	Offset int `json:"offset"`
	Ok bool `json:"ok"`
	PrivacyScope string `json:"privacy_scope"`
	Total int `json:"total"`
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

type HealthCheckResponse struct {
	Status string `json:"status"`
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
	SupportedParams *[]string `json:"supported_params,omitempty"`
	TopProvider *map[string]interface{} `json:"top_provider,omitempty"`
	TopProviderId *string `json:"top_provider_id,omitempty"`
}

type ModelId string

const (
	ModelIdAi21Jamba23b ModelId = "ai21/jamba-2-3b"
	ModelIdAi21JambaLarge15 ModelId = "ai21/jamba-large-1.5"
	ModelIdAi21JambaLarge16 ModelId = "ai21/jamba-large-1.6"
	ModelIdAi21JambaLarge17 ModelId = "ai21/jamba-large-1.7"
	ModelIdAi21JambaMini15 ModelId = "ai21/jamba-mini-1.5"
	ModelIdAi21JambaMini16 ModelId = "ai21/jamba-mini-1.6"
	ModelIdAi21JambaMini17 ModelId = "ai21/jamba-mini-1.7"
	ModelIdAi21JambaMini2 ModelId = "ai21/jamba-mini-2"
	ModelIdAi21JambaReasoning3b ModelId = "ai21/jamba-reasoning-3b"
	ModelIdAionLabsAion10 ModelId = "aion-labs/aion-1.0"
	ModelIdAionLabsAion10Mini ModelId = "aion-labs/aion-1.0-mini"
	ModelIdAionLabsAion20 ModelId = "aion-labs/aion-2.0"
	ModelIdAionLabsAion25 ModelId = "aion-labs/aion-2.5"
	ModelIdAionLabsAionRpLlama318b ModelId = "aion-labs/aion-rp-llama-3.1-8b"
	ModelIdAllenaiBolmo1b ModelId = "allenai/bolmo-1b"
	ModelIdAllenaiBolmo7b ModelId = "allenai/bolmo-7b"
	ModelIdAllenaiMolmo24b ModelId = "allenai/molmo-2-4b"
	ModelIdAllenaiMolmo28b ModelId = "allenai/molmo-2-8b"
	ModelIdAllenaiOlmo332bThink ModelId = "allenai/olmo-3-32b-think"
	ModelIdAllenaiOlmo37bInstruct ModelId = "allenai/olmo-3-7b-instruct"
	ModelIdAllenaiOlmo37bThink ModelId = "allenai/olmo-3-7b-think"
	ModelIdAllenaiOlmo3132bInstruct ModelId = "allenai/olmo-3.1-32b-instruct"
	ModelIdAllenaiOlmo3132bThink ModelId = "allenai/olmo-3.1-32b-think"
	ModelIdAmazonNova2Lite ModelId = "amazon/nova-2-lite"
	ModelIdAmazonNova2Omni ModelId = "amazon/nova-2-omni"
	ModelIdAmazonNova2Pro ModelId = "amazon/nova-2-pro"
	ModelIdAmazonNova2Sonic ModelId = "amazon/nova-2-sonic"
	ModelIdAmazonNovaCanvas ModelId = "amazon/nova-canvas"
	ModelIdAmazonNovaLite10 ModelId = "amazon/nova-lite-1.0"
	ModelIdAmazonNovaMicro10 ModelId = "amazon/nova-micro-1.0"
	ModelIdAmazonNovaMultimodalEmbeddings ModelId = "amazon/nova-multimodal-embeddings"
	ModelIdAmazonNovaPremier ModelId = "amazon/nova-premier"
	ModelIdAmazonNovaPro10 ModelId = "amazon/nova-pro-1.0"
	ModelIdAmazonNovaReel ModelId = "amazon/nova-reel"
	ModelIdAmazonNovaSonic ModelId = "amazon/nova-sonic"
	ModelIdAnthropicClaude10 ModelId = "anthropic/claude-1.0"
	ModelIdAnthropicClaude11 ModelId = "anthropic/claude-1.1"
	ModelIdAnthropicClaude12 ModelId = "anthropic/claude-1.2"
	ModelIdAnthropicClaude13 ModelId = "anthropic/claude-1.3"
	ModelIdAnthropicClaude20 ModelId = "anthropic/claude-2.0"
	ModelIdAnthropicClaude21 ModelId = "anthropic/claude-2.1"
	ModelIdAnthropicClaude3Haiku ModelId = "anthropic/claude-3-haiku"
	ModelIdAnthropicClaude3Opus ModelId = "anthropic/claude-3-opus"
	ModelIdAnthropicClaude3Sonnet ModelId = "anthropic/claude-3-sonnet"
	ModelIdAnthropicClaude35Haiku ModelId = "anthropic/claude-3.5-haiku"
	ModelIdAnthropicClaude35Sonnet20240620 ModelId = "anthropic/claude-3.5-sonnet-2024-06-20"
	ModelIdAnthropicClaude35Sonnet20241022 ModelId = "anthropic/claude-3.5-sonnet-2024-10-22"
	ModelIdAnthropicClaude37Sonnet ModelId = "anthropic/claude-3.7-sonnet"
	ModelIdAnthropicClaudeHaiku45 ModelId = "anthropic/claude-haiku-4.5"
	ModelIdAnthropicClaudeInstant10 ModelId = "anthropic/claude-instant-1.0"
	ModelIdAnthropicClaudeInstant11 ModelId = "anthropic/claude-instant-1.1"
	ModelIdAnthropicClaudeInstant12 ModelId = "anthropic/claude-instant-1.2"
	ModelIdAnthropicClaudeMythosPreview ModelId = "anthropic/claude-mythos-preview"
	ModelIdAnthropicClaudeOpus4 ModelId = "anthropic/claude-opus-4"
	ModelIdAnthropicClaudeOpus41 ModelId = "anthropic/claude-opus-4.1"
	ModelIdAnthropicClaudeOpus45 ModelId = "anthropic/claude-opus-4.5"
	ModelIdAnthropicClaudeOpus46 ModelId = "anthropic/claude-opus-4.6"
	ModelIdAnthropicClaudeSonnet4 ModelId = "anthropic/claude-sonnet-4"
	ModelIdAnthropicClaudeSonnet45 ModelId = "anthropic/claude-sonnet-4.5"
	ModelIdAnthropicClaudeSonnet46 ModelId = "anthropic/claude-sonnet-4.6"
	ModelIdArceeAiTrinityLarge ModelId = "arcee-ai/trinity-large"
	ModelIdArceeAiTrinityLargeThinking ModelId = "arcee-ai/trinity-large-thinking"
	ModelIdArceeAiTrinityMini ModelId = "arcee-ai/trinity-mini"
	ModelIdArceeAiTrinityNanoPreview ModelId = "arcee-ai/trinity-nano-preview"
	ModelIdBaiduErnie4521bA3b ModelId = "baidu/ernie-4.5-21b-a3b"
	ModelIdBaiduErnie4521bA3bThinking ModelId = "baidu/ernie-4.5-21b-a3b-thinking"
	ModelIdBaiduErnie45300bA47b ModelId = "baidu/ernie-4.5-300b-a47b"
	ModelIdBaiduErnie45Turbo ModelId = "baidu/ernie-4.5-turbo"
	ModelIdBaiduErnie45Vl28bA3b ModelId = "baidu/ernie-4.5-vl-28b-a3b"
	ModelIdBaiduErnie45Vl424bA47b ModelId = "baidu/ernie-4.5-vl-424b-a47b"
	ModelIdBaiduErnie50 ModelId = "baidu/ernie-5.0"
	ModelIdBaiduErnie500110 ModelId = "baidu/ernie-5.0-0110"
	ModelIdBaiduErnie50Preview1203 ModelId = "baidu/ernie-5.0-preview-1203"
	ModelIdBaiduErnie50Preview1220 ModelId = "baidu/ernie-5.0-preview-1220"
	ModelIdBaiduErnieX11 ModelId = "baidu/ernie-x1.1"
	ModelIdBaiduQianfanVl3b ModelId = "baidu/qianfan-vl-3b"
	ModelIdBaiduQianfanVl70b ModelId = "baidu/qianfan-vl-70b"
	ModelIdBaiduQianfanVl8b ModelId = "baidu/qianfan-vl-8b"
	ModelIdBlackForestLabsFlux2Dev ModelId = "black-forest-labs/flux-2-dev"
	ModelIdBlackForestLabsFlux2Flex ModelId = "black-forest-labs/flux-2-flex"
	ModelIdBlackForestLabsFlux2Klein4b ModelId = "black-forest-labs/flux-2-klein-4b"
	ModelIdBlackForestLabsFlux2Klein9b ModelId = "black-forest-labs/flux-2-klein-9b"
	ModelIdBlackForestLabsFlux2Max ModelId = "black-forest-labs/flux-2-max"
	ModelIdBlackForestLabsFlux2Pro ModelId = "black-forest-labs/flux-2-pro"
	ModelIdBytedanceSeed1620250615 ModelId = "bytedance/seed-1.6-2025-06-15"
	ModelIdBytedanceSeed1620250915 ModelId = "bytedance/seed-1.6-2025-09-15"
	ModelIdBytedanceSeed16Flash20250615 ModelId = "bytedance/seed-1.6-flash-2025-06-15"
	ModelIdBytedanceSeed16Flash20250715 ModelId = "bytedance/seed-1.6-flash-2025-07-15"
	ModelIdBytedanceSeed18 ModelId = "bytedance/seed-1.8"
	ModelIdBytedanceSeed20Lite ModelId = "bytedance/seed-2.0-lite"
	ModelIdBytedanceSeed20Mini ModelId = "bytedance/seed-2.0-mini"
	ModelIdBytedanceSeed20Pro ModelId = "bytedance/seed-2.0-pro"
	ModelIdBytedanceSeedCoder8bInstruct ModelId = "bytedance/seed-coder-8b-instruct"
	ModelIdBytedanceSeedCoder8bReasoning ModelId = "bytedance/seed-coder-8b-reasoning"
	ModelIdBytedanceSeedOss36bInstruct ModelId = "bytedance/seed-oss-36b-instruct"
	ModelIdBytedanceSeedTranslation ModelId = "bytedance/seed-translation"
	ModelIdBytedanceSeedream45 ModelId = "bytedance/seedream-4.5"
	ModelIdCohereC4aiAyaExpanse32b ModelId = "cohere/c4ai-aya-expanse-32b"
	ModelIdCohereC4aiAyaExpanse8b ModelId = "cohere/c4ai-aya-expanse-8b"
	ModelIdCohereC4aiAyaVision32b ModelId = "cohere/c4ai-aya-vision-32b"
	ModelIdCohereC4aiAyaVision8b ModelId = "cohere/c4ai-aya-vision-8b"
	ModelIdCohereCommand ModelId = "cohere/command"
	ModelIdCohereCommandA ModelId = "cohere/command-a"
	ModelIdCohereCommandAReasoning ModelId = "cohere/command-a-reasoning"
	ModelIdCohereCommandATranslate ModelId = "cohere/command-a-translate"
	ModelIdCohereCommandAVision ModelId = "cohere/command-a-vision"
	ModelIdCohereCommandLight ModelId = "cohere/command-light"
	ModelIdCohereCommandR20240404 ModelId = "cohere/command-r--2024-04-04"
	ModelIdCohereCommandR20240830 ModelId = "cohere/command-r--2024-08-30"
	ModelIdCohereCommandR20240311 ModelId = "cohere/command-r-2024-03-11"
	ModelIdCohereCommandR202408302 ModelId = "cohere/command-r-2024-08-30"
	ModelIdCohereCommandR7b ModelId = "cohere/command-r-7b"
	ModelIdCohereEmbedEnglishLightV20 ModelId = "cohere/embed-english-light-v2.0"
	ModelIdCohereEmbedEnglishLightV3 ModelId = "cohere/embed-english-light-v3"
	ModelIdCohereEmbedEnglishV20 ModelId = "cohere/embed-english-v2.0"
	ModelIdCohereEmbedEnglishV3 ModelId = "cohere/embed-english-v3"
	ModelIdCohereEmbedMultilingualLightV3 ModelId = "cohere/embed-multilingual-light-v3"
	ModelIdCohereEmbedMultilingualV20 ModelId = "cohere/embed-multilingual-v2.0"
	ModelIdCohereEmbedMultilingualV3 ModelId = "cohere/embed-multilingual-v3"
	ModelIdCohereEmbedV4 ModelId = "cohere/embed-v4"
	ModelIdCohereRerankMultilingualV3 ModelId = "cohere/rerank-multilingual-v3"
	ModelIdCohereRerankV35 ModelId = "cohere/rerank-v3.5"
	ModelIdCohereRerankV40Fast ModelId = "cohere/rerank-v4.0-fast"
	ModelIdCohereRerankV40Pro ModelId = "cohere/rerank-v4.0-pro"
	ModelIdCohereRerenkEnglishV3 ModelId = "cohere/rerenk-english-v3"
	ModelIdCursorComposer1 ModelId = "cursor/composer-1"
	ModelIdCursorComposer15 ModelId = "cursor/composer-1.5"
	ModelIdDeepseekDeepseekCoderV220240614 ModelId = "deepseek/deepseek-coder-v2-2024-06-14"
	ModelIdDeepseekDeepseekCoderV220240727 ModelId = "deepseek/deepseek-coder-v2-2024-07-27"
	ModelIdDeepseekDeepseekOcr ModelId = "deepseek/deepseek-ocr"
	ModelIdDeepseekDeepseekOcr2 ModelId = "deepseek/deepseek-ocr-2"
	ModelIdDeepseekDeepseekR120250120 ModelId = "deepseek/deepseek-r1-2025-01-20"
	ModelIdDeepseekDeepseekR120250528 ModelId = "deepseek/deepseek-r1-2025-05-28"
	ModelIdDeepseekDeepseekR1LitePreview ModelId = "deepseek/deepseek-r1-lite-preview"
	ModelIdDeepseekDeepseekV220240517 ModelId = "deepseek/deepseek-v2-2024-05-17"
	ModelIdDeepseekDeepseekV220240628 ModelId = "deepseek/deepseek-v2-2024-06-28"
	ModelIdDeepseekDeepseekV2520240905 ModelId = "deepseek/deepseek-v2.5-2024-09-05"
	ModelIdDeepseekDeepseekV2520241210 ModelId = "deepseek/deepseek-v2.5-2024-12-10"
	ModelIdDeepseekDeepseekV320241226 ModelId = "deepseek/deepseek-v3-2024-12-26"
	ModelIdDeepseekDeepseekV320250324 ModelId = "deepseek/deepseek-v3-2025-03-24"
	ModelIdDeepseekDeepseekV31 ModelId = "deepseek/deepseek-v3.1"
	ModelIdDeepseekDeepseekV31Terminus ModelId = "deepseek/deepseek-v3.1-terminus"
	ModelIdDeepseekDeepseekV32 ModelId = "deepseek/deepseek-v3.2"
	ModelIdDeepseekDeepseekV32Exp ModelId = "deepseek/deepseek-v3.2-exp"
	ModelIdDeepseekDeepseekV32Speciale ModelId = "deepseek/deepseek-v3.2-speciale"
	ModelIdDeepseekDeepseekV4Flash ModelId = "deepseek/deepseek-v4-flash"
	ModelIdDeepseekDeepseekV4Pro ModelId = "deepseek/deepseek-v4-pro"
	ModelIdDeepseekDeepseekVl2 ModelId = "deepseek/deepseek-vl2"
	ModelIdDeepseekDeepseekVl2Small ModelId = "deepseek/deepseek-vl2-small"
	ModelIdDeepseekDeepseekVl2Tiny ModelId = "deepseek/deepseek-vl2-tiny"
	ModelIdElevenLabsElevenEnglishStsV2 ModelId = "eleven-labs/eleven-english-sts-v2"
	ModelIdElevenLabsElevenFlashV2 ModelId = "eleven-labs/eleven-flash-v2"
	ModelIdElevenLabsElevenFlashV25 ModelId = "eleven-labs/eleven-flash-v2.5"
	ModelIdElevenLabsElevenMonolingualV1 ModelId = "eleven-labs/eleven-monolingual-v1"
	ModelIdElevenLabsElevenMultilingualStsV2 ModelId = "eleven-labs/eleven-multilingual-sts-v2"
	ModelIdElevenLabsElevenMultilingualTtvV2 ModelId = "eleven-labs/eleven-multilingual-ttv-v2"
	ModelIdElevenLabsElevenMultilingualV1 ModelId = "eleven-labs/eleven-multilingual-v1"
	ModelIdElevenLabsElevenMultilingualV2 ModelId = "eleven-labs/eleven-multilingual-v2"
	ModelIdElevenLabsElevenTtvV3 ModelId = "eleven-labs/eleven-ttv-v3"
	ModelIdElevenLabsElevenTurboV2 ModelId = "eleven-labs/eleven-turbo-v2"
	ModelIdElevenLabsElevenTurboV25 ModelId = "eleven-labs/eleven-turbo-v2.5"
	ModelIdElevenLabsElevenV3 ModelId = "eleven-labs/eleven-v3"
	ModelIdElevenLabsScribeV1 ModelId = "eleven-labs/scribe-v1"
	ModelIdElevenLabsScribeV2 ModelId = "eleven-labs/scribe-v2"
	ModelIdElevenLabsScribeV2Realtime ModelId = "eleven-labs/scribe-v2-realtime"
	ModelIdEssentialAiRnj1 ModelId = "essential-ai/rnj-1"
	ModelIdGoogleChatBison ModelId = "google/chat-bison"
	ModelIdGoogleCodeGecko ModelId = "google/code-gecko"
	ModelIdGoogleEmbedding001 ModelId = "google/embedding-001"
	ModelIdGoogleGemini10Nano ModelId = "google/gemini-1.0-nano"
	ModelIdGoogleGemini10Pro ModelId = "google/gemini-1.0-pro"
	ModelIdGoogleGemini10ProVision001 ModelId = "google/gemini-1.0-pro-vision-001"
	ModelIdGoogleGemini10Ultra ModelId = "google/gemini-1.0-ultra"
	ModelIdGoogleGemini15Flash001 ModelId = "google/gemini-1.5-flash-001"
	ModelIdGoogleGemini15Flash002 ModelId = "google/gemini-1.5-flash-002"
	ModelIdGoogleGemini15Flash8b ModelId = "google/gemini-1.5-flash-8b"
	ModelIdGoogleGemini15Flash8bExp20240827 ModelId = "google/gemini-1.5-flash-8b-exp-2024-08-27"
	ModelIdGoogleGemini15Flash8bExp20240924 ModelId = "google/gemini-1.5-flash-8b-exp-2024-09-24"
	ModelIdGoogleGemini15FlashPreview20240514 ModelId = "google/gemini-1.5-flash-preview-2024-05-14"
	ModelIdGoogleGemini15Pro001 ModelId = "google/gemini-1.5-pro-001"
	ModelIdGoogleGemini15Pro002 ModelId = "google/gemini-1.5-pro-002"
	ModelIdGoogleGemini15ProExp20240801 ModelId = "google/gemini-1.5-pro-exp-2024-08-01"
	ModelIdGoogleGemini15ProExp20240827 ModelId = "google/gemini-1.5-pro-exp-2024-08-27"
	ModelIdGoogleGemini20Flash ModelId = "google/gemini-2.0-flash"
	ModelIdGoogleGemini20FlashExp ModelId = "google/gemini-2.0-flash-exp"
	ModelIdGoogleGemini20FlashExpImageGeneration ModelId = "google/gemini-2.0-flash-exp-image-generation"
	ModelIdGoogleGemini20FlashLite ModelId = "google/gemini-2.0-flash-lite"
	ModelIdGoogleGemini20FlashLive001 ModelId = "google/gemini-2.0-flash-live-001"
	ModelIdGoogleGemini20FlashPreviewImageGeneration ModelId = "google/gemini-2.0-flash-preview-image-generation"
	ModelIdGoogleGemini20FlashThinkingExp20241219 ModelId = "google/gemini-2.0-flash-thinking-exp-2024-12-19"
	ModelIdGoogleGemini20FlashThinkingExp20250121 ModelId = "google/gemini-2.0-flash-thinking-exp-2025-01-21"
	ModelIdGoogleGemini20ProExp ModelId = "google/gemini-2.0-pro-exp"
	ModelIdGoogleGemini25ComputerUsePreview ModelId = "google/gemini-2.5-computer-use-preview"
	ModelIdGoogleGemini25FlashExpNativeAudioThinkingDialog ModelId = "google/gemini-2.5-flash-exp-native-audio-thinking-dialog"
	ModelIdGoogleGemini25FlashImage ModelId = "google/gemini-2.5-flash-image"
	ModelIdGoogleGemini25FlashImagePreview ModelId = "google/gemini-2.5-flash-image-preview"
	ModelIdGoogleGemini25FlashLitePreview20250617 ModelId = "google/gemini-2.5-flash-lite-preview-2025-06-17"
	ModelIdGoogleGemini25FlashLitePreview20250925 ModelId = "google/gemini-2.5-flash-lite-preview-2025-09-25"
	ModelIdGoogleGemini25FlashNativeAudioPreview20250903 ModelId = "google/gemini-2.5-flash-native-audio-preview-2025-09-03"
	ModelIdGoogleGemini25FlashPreview20250417 ModelId = "google/gemini-2.5-flash-preview-2025-04-17"
	ModelIdGoogleGemini25FlashPreview20250520 ModelId = "google/gemini-2.5-flash-preview-2025-05-20"
	ModelIdGoogleGemini25FlashPreview20250925 ModelId = "google/gemini-2.5-flash-preview-2025-09-25"
	ModelIdGoogleGemini25FlashPreviewNativeAudioDialog ModelId = "google/gemini-2.5-flash-preview-native-audio-dialog"
	ModelIdGoogleGemini25FlashPreviewTts20250520 ModelId = "google/gemini-2.5-flash-preview-tts-2025-05-20"
	ModelIdGoogleGemini25FlashPreviewTts20251210 ModelId = "google/gemini-2.5-flash-preview-tts-2025-12-10"
	ModelIdGoogleGemini25ProExperimental20250325 ModelId = "google/gemini-2.5-pro-experimental-2025-03-25"
	ModelIdGoogleGemini25ProPreview20250506 ModelId = "google/gemini-2.5-pro-preview-2025-05-06"
	ModelIdGoogleGemini25ProPreview20250605 ModelId = "google/gemini-2.5-pro-preview-2025-06-05"
	ModelIdGoogleGemini25ProPreviewTts ModelId = "google/gemini-2.5-pro-preview-tts"
	ModelIdGoogleGemini25ProPreviewTts20250520 ModelId = "google/gemini-2.5-pro-preview-tts-2025-05-20"
	ModelIdGoogleGemini3FlashPreview ModelId = "google/gemini-3-flash-preview"
	ModelIdGoogleGemini3ProImagePreview ModelId = "google/gemini-3-pro-image-preview"
	ModelIdGoogleGemini3ProPreview ModelId = "google/gemini-3-pro-preview"
	ModelIdGoogleGemini31FlashImagePreview ModelId = "google/gemini-3.1-flash-image-preview"
	ModelIdGoogleGemini31FlashLitePreview ModelId = "google/gemini-3.1-flash-lite-preview"
	ModelIdGoogleGemini31FlashTtsPreview ModelId = "google/gemini-3.1-flash-tts-preview"
	ModelIdGoogleGemini31ProPreview ModelId = "google/gemini-3.1-pro-preview"
	ModelIdGoogleGemini31ProPreviewCustomtools ModelId = "google/gemini-3.1-pro-preview-customtools"
	ModelIdGoogleGeminiDiffusion ModelId = "google/gemini-diffusion"
	ModelIdGoogleGeminiEmbedding001 ModelId = "google/gemini-embedding-001"
	ModelIdGoogleGeminiEmbedding2Preview ModelId = "google/gemini-embedding-2-preview"
	ModelIdGoogleGeminiEmbeddingExp0307 ModelId = "google/gemini-embedding-exp-0307"
	ModelIdGoogleGeminiExp1114 ModelId = "google/gemini-exp-1114"
	ModelIdGoogleGeminiExp1121 ModelId = "google/gemini-exp-1121"
	ModelIdGoogleGeminiExp1206 ModelId = "google/gemini-exp-1206"
	ModelIdGoogleGeminiLive25FlashPreview ModelId = "google/gemini-live-2.5-flash-preview"
	ModelIdGoogleGeminiRoboticsEr15Preview ModelId = "google/gemini-robotics-er-1.5-preview"
	ModelIdGoogleGemma12b ModelId = "google/gemma-1-2b"
	ModelIdGoogleGemma17b ModelId = "google/gemma-1-7b"
	ModelIdGoogleGemma227b ModelId = "google/gemma-2-27b"
	ModelIdGoogleGemma22b ModelId = "google/gemma-2-2b"
	ModelIdGoogleGemma29b ModelId = "google/gemma-2-9b"
	ModelIdGoogleGemma312b ModelId = "google/gemma-3-12b"
	ModelIdGoogleGemma31b ModelId = "google/gemma-3-1b"
	ModelIdGoogleGemma327b ModelId = "google/gemma-3-27b"
	ModelIdGoogleGemma34b ModelId = "google/gemma-3-4b"
	ModelIdGoogleGemma3nE2b ModelId = "google/gemma-3n-e2b"
	ModelIdGoogleGemma3nE4b ModelId = "google/gemma-3n-e4b"
	ModelIdGoogleGemma426bA4b ModelId = "google/gemma-4-26b-a4b"
	ModelIdGoogleGemma431b ModelId = "google/gemma-4-31b"
	ModelIdGoogleImageGeneration002 ModelId = "google/image-generation-002"
	ModelIdGoogleImageGeneration005 ModelId = "google/image-generation-005"
	ModelIdGoogleImageGeneration006 ModelId = "google/image-generation-006"
	ModelIdGoogleImageText ModelId = "google/image-text"
	ModelIdGoogleImagen30Generate001 ModelId = "google/imagen-3.0-generate-001"
	ModelIdGoogleImagen30Generate002 ModelId = "google/imagen-3.0-generate-002"
	ModelIdGoogleImagen40FastGenerate001 ModelId = "google/imagen-4.0-fast-generate-001"
	ModelIdGoogleImagen40FastGeneratePreview ModelId = "google/imagen-4.0-fast-generate-preview"
	ModelIdGoogleImagen40Generate001 ModelId = "google/imagen-4.0-generate-001"
	ModelIdGoogleImagen40GeneratePreview ModelId = "google/imagen-4.0-generate-preview"
	ModelIdGoogleImagen40Preview ModelId = "google/imagen-4.0-preview"
	ModelIdGoogleImagen40UltraGenerate001 ModelId = "google/imagen-4.0-ultra-generate-001"
	ModelIdGoogleImagen40UltraGeneratePreview ModelId = "google/imagen-4.0-ultra-generate-preview"
	ModelIdGoogleImagen40UltraPreview ModelId = "google/imagen-4.0-ultra-preview"
	ModelIdGoogleLearnlm15ProExperimental ModelId = "google/learnlm-1.5-pro-experimental"
	ModelIdGoogleLearnlm20FlashExperimental ModelId = "google/learnlm-2.0-flash-experimental"
	ModelIdGoogleLyria1 ModelId = "google/lyria-1"
	ModelIdGoogleLyria2 ModelId = "google/lyria-2"
	ModelIdGoogleLyria3 ModelId = "google/lyria-3"
	ModelIdGoogleMedgemma154b ModelId = "google/medgemma-1.5-4b"
	ModelIdGoogleMultimodalEmbedding001 ModelId = "google/multimodal-embedding-001"
	ModelIdGoogleTextBison ModelId = "google/text-bison"
	ModelIdGoogleTextEmbedding004 ModelId = "google/text-embedding-004"
	ModelIdGoogleTextEmbedding005 ModelId = "google/text-embedding-005"
	ModelIdGoogleTextEmbeddingGecko001 ModelId = "google/text-embedding-gecko-001"
	ModelIdGoogleTextEmbeddingGecko002 ModelId = "google/text-embedding-gecko-002"
	ModelIdGoogleTextEmbeddingGecko003 ModelId = "google/text-embedding-gecko-003"
	ModelIdGoogleTextEmbeddingGeckoMultilingual001 ModelId = "google/text-embedding-gecko-multilingual-001"
	ModelIdGoogleTextMultilingualEmbedding002 ModelId = "google/text-multilingual-embedding-002"
	ModelIdGoogleTranslategemma12b ModelId = "google/translategemma-12b"
	ModelIdGoogleTranslategemma27b ModelId = "google/translategemma-27b"
	ModelIdGoogleTranslategemma4b ModelId = "google/translategemma-4b"
	ModelIdGoogleVeo2 ModelId = "google/veo-2"
	ModelIdGoogleVeo3 ModelId = "google/veo-3"
	ModelIdGoogleVeo3Fast ModelId = "google/veo-3-fast"
	ModelIdGoogleVeo30FastGeneratePreview ModelId = "google/veo-3.0-fast-generate-preview"
	ModelIdGoogleVeo30GeneratePreview ModelId = "google/veo-3.0-generate-preview"
	ModelIdGoogleVeo31FastPreview ModelId = "google/veo-3.1-fast-preview"
	ModelIdGoogleVeo31LitePreview ModelId = "google/veo-3.1-lite-preview"
	ModelIdGoogleVeo31Preview ModelId = "google/veo-3.1-preview"
	ModelIdGoogleVeo32 ModelId = "google/veo-3.2"
	ModelIdGoogleVeo4 ModelId = "google/veo-4"
	ModelIdIbmGranite20bCodeInstruct8k ModelId = "ibm/granite-20b-code-instruct-8k"
	ModelIdIbmGranite301bA400mInstruct ModelId = "ibm/granite-3.0-1b-a400m-instruct"
	ModelIdIbmGranite302bInstruct ModelId = "ibm/granite-3.0-2b-instruct"
	ModelIdIbmGranite303bA800mInstruct ModelId = "ibm/granite-3.0-3b-a800m-instruct"
	ModelIdIbmGranite308bInstruct ModelId = "ibm/granite-3.0-8b-instruct"
	ModelIdIbmGranite311bA400mInstruct ModelId = "ibm/granite-3.1-1b-a400m-instruct"
	ModelIdIbmGranite312bInstruct ModelId = "ibm/granite-3.1-2b-instruct"
	ModelIdIbmGranite313bA800mInstruct ModelId = "ibm/granite-3.1-3b-a800m-instruct"
	ModelIdIbmGranite318bInstruct ModelId = "ibm/granite-3.1-8b-instruct"
	ModelIdIbmGranite322bInstruct ModelId = "ibm/granite-3.2-2b-instruct"
	ModelIdIbmGranite328bInstruct ModelId = "ibm/granite-3.2-8b-instruct"
	ModelIdIbmGranite328bInstructPreview ModelId = "ibm/granite-3.2-8b-instruct-preview"
	ModelIdIbmGranite332bInstruct ModelId = "ibm/granite-3.3-2b-instruct"
	ModelIdIbmGranite338bInstruct ModelId = "ibm/granite-3.3-8b-instruct"
	ModelIdIbmGranite34bCodeInstruct8b ModelId = "ibm/granite-34b-code-instruct-8b"
	ModelIdIbmGranite3bCodeInstruct128k ModelId = "ibm/granite-3b-code-instruct-128k"
	ModelIdIbmGranite3bCodeInstruct2k ModelId = "ibm/granite-3b-code-instruct-2k"
	ModelIdIbmGranite40Micro ModelId = "ibm/granite-4.0-micro"
	ModelIdIbmGranite40Small ModelId = "ibm/granite-4.0-small"
	ModelIdIbmGranite40Tiny ModelId = "ibm/granite-4.0-tiny"
	ModelIdIbmGranite40TinyPreview ModelId = "ibm/granite-4.0-tiny-preview"
	ModelIdIbmGranite8bCodeInstruct128k ModelId = "ibm/granite-8b-code-instruct-128k"
	ModelIdIbmGranite8bCodeInstruct4k ModelId = "ibm/granite-8b-code-instruct-4k"
	ModelIdIbmGraniteEmbedding107mMultilingual ModelId = "ibm/granite-embedding-107m-multilingual"
	ModelIdIbmGraniteEmbedding125mEnglish ModelId = "ibm/granite-embedding-125m-english"
	ModelIdIbmGraniteEmbedding278mMultilingual ModelId = "ibm/granite-embedding-278m-multilingual"
	ModelIdIbmGraniteEmbedding30mEnglish ModelId = "ibm/granite-embedding-30m-english"
	ModelIdIbmGraniteEmbeddingEnglishR2 ModelId = "ibm/granite-embedding-english-r2"
	ModelIdIbmGraniteEmbeddingRerankerEnglishR2 ModelId = "ibm/granite-embedding-reranker-english-r2"
	ModelIdIbmGraniteEmbeddingSmallEnglishR2 ModelId = "ibm/granite-embedding-small-english-r2"
	ModelIdIbmGraniteGuardian302b ModelId = "ibm/granite-guardian-3.0-2b"
	ModelIdIbmGraniteGuardian308b ModelId = "ibm/granite-guardian-3.0-8b"
	ModelIdIbmGraniteGuardian312b ModelId = "ibm/granite-guardian-3.1-2b"
	ModelIdIbmGraniteGuardian318b ModelId = "ibm/granite-guardian-3.1-8b"
	ModelIdIbmGraniteGuardian325b ModelId = "ibm/granite-guardian-3.2-5b"
	ModelIdIbmGraniteGuardian338b ModelId = "ibm/granite-guardian-3.3-8b"
	ModelIdIbmGraniteSpeech328b ModelId = "ibm/granite-speech-3.2-8b"
	ModelIdIbmGraniteSpeech332b ModelId = "ibm/granite-speech-3.3-2b"
	ModelIdIbmGraniteSpeech338b ModelId = "ibm/granite-speech-3.3-8b"
	ModelIdIbmGraniteVision312bPreview ModelId = "ibm/granite-vision-3.1-2b-preview"
	ModelIdIbmGraniteVision322b ModelId = "ibm/granite-vision-3.2-2b"
	ModelIdIbmGraniteVision332b ModelId = "ibm/granite-vision-3.3-2b"
	ModelIdIbmGraniteVision332bEmbedding ModelId = "ibm/granite-vision-3.3-2b-embedding"
	ModelIdInceptionMercury2 ModelId = "inception/mercury-2"
	ModelIdInclusionaiRing1t25 ModelId = "inclusionai/ring-1t-2.5"
	ModelIdKwaipilotKatCoderExp72b1010 ModelId = "kwaipilot/kat-coder-exp-72b-1010"
	ModelIdKwaipilotKatCoderPro ModelId = "kwaipilot/kat-coder-pro"
	ModelIdKwaipilotKatCoderProV2 ModelId = "kwaipilot/kat-coder-pro-v2"
	ModelIdLgExaone30 ModelId = "lg/exaone-3.0"
	ModelIdLgExaone3524b ModelId = "lg/exaone-3.5-2.4b"
	ModelIdLgExaone3532b ModelId = "lg/exaone-3.5-32b"
	ModelIdLgExaone3578b ModelId = "lg/exaone-3.5-7.8b"
	ModelIdLgExaone4012b ModelId = "lg/exaone-4.0-1.2b"
	ModelIdLgExaone4032b ModelId = "lg/exaone-4.0-32b"
	ModelIdLgExaoneDeep24b ModelId = "lg/exaone-deep-2.4b"
	ModelIdLgExaoneDeep32b ModelId = "lg/exaone-deep-32b"
	ModelIdLgExaoneDeep78b ModelId = "lg/exaone-deep-7.8b"
	ModelIdLgKExaone ModelId = "lg/k-exaone"
	ModelIdLiquidAiLfm212b ModelId = "liquid-ai/lfm-2-1.2b"
	ModelIdLiquidAiLfm226b ModelId = "liquid-ai/lfm-2-2.6b"
	ModelIdLiquidAiLfm224bA2b ModelId = "liquid-ai/lfm-2-24b-a2b"
	ModelIdLiquidAiLfm2350m ModelId = "liquid-ai/lfm-2-350m"
	ModelIdLiquidAiLfm2700m ModelId = "liquid-ai/lfm-2-700m"
	ModelIdLiquidAiLfm28bA1b ModelId = "liquid-ai/lfm-2-8b-a1b"
	ModelIdLiquidAiLfm2512b ModelId = "liquid-ai/lfm-2.5-1.2b"
	ModelIdLiquidAiLfm2512bJp ModelId = "liquid-ai/lfm-2.5-1.2b-jp"
	ModelIdLiquidAiLfm2512bThinking ModelId = "liquid-ai/lfm-2.5-1.2b-thinking"
	ModelIdLiquidAiLfm25Audio15b ModelId = "liquid-ai/lfm-2.5-audio-1.5b"
	ModelIdLiquidAiLfm25Vl16b ModelId = "liquid-ai/lfm-2.5-vl-1.6b"
	ModelIdMeituanLongcatFlashCat ModelId = "meituan/longcat-flash-cat"
	ModelIdMetaLlama213bChat ModelId = "meta/llama-2-13b-chat"
	ModelIdMetaLlama270bChat ModelId = "meta/llama-2-70b-chat"
	ModelIdMetaLlama27bChat ModelId = "meta/llama-2-7b-chat"
	ModelIdMetaLlama370b ModelId = "meta/llama-3-70b"
	ModelIdMetaLlama38b ModelId = "meta/llama-3-8b"
	ModelIdMetaLlama31405b ModelId = "meta/llama-3.1-405b"
	ModelIdMetaLlama3170b ModelId = "meta/llama-3.1-70b"
	ModelIdMetaLlama318b ModelId = "meta/llama-3.1-8b"
	ModelIdMetaLlama3211bVision ModelId = "meta/llama-3.2-11b-vision"
	ModelIdMetaLlama321b ModelId = "meta/llama-3.2-1b"
	ModelIdMetaLlama323b ModelId = "meta/llama-3.2-3b"
	ModelIdMetaLlama3290bVision ModelId = "meta/llama-3.2-90b-vision"
	ModelIdMetaLlama3370b ModelId = "meta/llama-3.3-70b"
	ModelIdMetaLlama4Maverick ModelId = "meta/llama-4-maverick"
	ModelIdMetaLlama4Scout ModelId = "meta/llama-4-scout"
	ModelIdMicrosoftPhi1 ModelId = "microsoft/phi-1"
	ModelIdMicrosoftPhi15 ModelId = "microsoft/phi-1.5"
	ModelIdMicrosoftPhi2 ModelId = "microsoft/phi-2"
	ModelIdMicrosoftPhi3Medium128kInstruct ModelId = "microsoft/phi-3-medium-128k-instruct"
	ModelIdMicrosoftPhi3Medium4kInstruct ModelId = "microsoft/phi-3-medium-4k-instruct"
	ModelIdMicrosoftPhi3Mini128kInstruct ModelId = "microsoft/phi-3-mini-128k-instruct"
	ModelIdMicrosoftPhi3Small128kInstruct ModelId = "microsoft/phi-3-small-128k-instruct"
	ModelIdMicrosoftPhi3Small8kInstruct ModelId = "microsoft/phi-3-small-8k-instruct"
	ModelIdMicrosoftPhi3Vision128kInstruct ModelId = "microsoft/phi-3-vision-128k-instruct"
	ModelIdMicrosoftPhi35MiniInstruct ModelId = "microsoft/phi-3.5-mini-instruct"
	ModelIdMicrosoftPhi35MoeInstruct ModelId = "microsoft/phi-3.5-moe-instruct"
	ModelIdMicrosoftPhi35VisionInstruct ModelId = "microsoft/phi-3.5-vision-instruct"
	ModelIdMicrosoftPhi4 ModelId = "microsoft/phi-4"
	ModelIdMicrosoftPhi4Mini ModelId = "microsoft/phi-4-mini"
	ModelIdMicrosoftPhi4MiniFlashReasoning ModelId = "microsoft/phi-4-mini-flash-reasoning"
	ModelIdMicrosoftPhi4MiniReasoning ModelId = "microsoft/phi-4-mini-reasoning"
	ModelIdMicrosoftPhi4MultimodalInstruct ModelId = "microsoft/phi-4-multimodal-instruct"
	ModelIdMicrosoftPhi4Reasoning ModelId = "microsoft/phi-4-reasoning"
	ModelIdMicrosoftPhi4ReasoningPlus ModelId = "microsoft/phi-4-reasoning-plus"
	ModelIdMinimaxHailuo02 ModelId = "minimax/hailuo-02"
	ModelIdMinimaxHailuo23 ModelId = "minimax/hailuo-2.3"
	ModelIdMinimaxHailuo23Fast ModelId = "minimax/hailuo-2.3-fast"
	ModelIdMinimaxI2v01Director ModelId = "minimax/i2v-01-director"
	ModelIdMinimaxI2v01Live ModelId = "minimax/i2v-01-live"
	ModelIdMinimaxImage01 ModelId = "minimax/image-01"
	ModelIdMinimaxMinimaxM140k ModelId = "minimax/minimax-m1-40k"
	ModelIdMinimaxMinimaxM180k ModelId = "minimax/minimax-m1-80k"
	ModelIdMinimaxMinimaxM2 ModelId = "minimax/minimax-m2"
	ModelIdMinimaxMinimaxM2Her ModelId = "minimax/minimax-m2-her"
	ModelIdMinimaxMinimaxM21 ModelId = "minimax/minimax-m2.1"
	ModelIdMinimaxMinimaxM25 ModelId = "minimax/minimax-m2.5"
	ModelIdMinimaxMinimaxM27 ModelId = "minimax/minimax-m2.7"
	ModelIdMinimaxMinimaxText01 ModelId = "minimax/minimax-text-01"
	ModelIdMinimaxMinimaxVl01 ModelId = "minimax/minimax-vl-01"
	ModelIdMinimaxMusic15 ModelId = "minimax/music-1.5"
	ModelIdMinimaxMusic20 ModelId = "minimax/music-2.0"
	ModelIdMinimaxMusic25 ModelId = "minimax/music-2.5"
	ModelIdMinimaxMusic26 ModelId = "minimax/music-2.6"
	ModelIdMinimaxS2v01 ModelId = "minimax/s2v-01"
	ModelIdMinimaxSpeech01Hd ModelId = "minimax/speech-01-hd"
	ModelIdMinimaxSpeech01Turbo ModelId = "minimax/speech-01-turbo"
	ModelIdMinimaxSpeech02Hd ModelId = "minimax/speech-02-hd"
	ModelIdMinimaxSpeech02Turbo ModelId = "minimax/speech-02-turbo"
	ModelIdMinimaxSpeech25HdPreview ModelId = "minimax/speech-2.5-hd-preview"
	ModelIdMinimaxSpeech25TurboPreview ModelId = "minimax/speech-2.5-turbo-preview"
	ModelIdMinimaxSpeech26 ModelId = "minimax/speech-2.6"
	ModelIdMinimaxT2v01Director ModelId = "minimax/t2v-01-director"
	ModelIdMistralCodestral ModelId = "mistral/codestral"
	ModelIdMistralCodestral20240529 ModelId = "mistral/codestral-2024-05-29"
	ModelIdMistralCodestral20250113 ModelId = "mistral/codestral-2025-01-13"
	ModelIdMistralCodestralEmbed ModelId = "mistral/codestral-embed"
	ModelIdMistralCodestralMamba7b ModelId = "mistral/codestral-mamba-7b"
	ModelIdMistralDevstral20 ModelId = "mistral/devstral-2.0"
	ModelIdMistralDevstralMedium10 ModelId = "mistral/devstral-medium-1.0"
	ModelIdMistralDevstralSmall10 ModelId = "mistral/devstral-small-1.0"
	ModelIdMistralDevstralSmall11 ModelId = "mistral/devstral-small-1.1"
	ModelIdMistralDevstralSmall20 ModelId = "mistral/devstral-small-2.0"
	ModelIdMistralLeanstral ModelId = "mistral/leanstral"
	ModelIdMistralMagistralMedium10 ModelId = "mistral/magistral-medium-1.0"
	ModelIdMistralMagistralMedium11 ModelId = "mistral/magistral-medium-1.1"
	ModelIdMistralMagistralMedium12 ModelId = "mistral/magistral-medium-1.2"
	ModelIdMistralMagistralSmall10 ModelId = "mistral/magistral-small-1.0"
	ModelIdMistralMagistralSmall11 ModelId = "mistral/magistral-small-1.1"
	ModelIdMistralMagistralSmall12 ModelId = "mistral/magistral-small-1.2"
	ModelIdMistralMathstral7b ModelId = "mistral/mathstral-7b"
	ModelIdMistralMinistral3014b ModelId = "mistral/ministral-3.0-14b"
	ModelIdMistralMinistral303b ModelId = "mistral/ministral-3.0-3b"
	ModelIdMistralMinistral308b ModelId = "mistral/ministral-3.0-8b"
	ModelIdMistralMinistral3b ModelId = "mistral/ministral-3b"
	ModelIdMistralMinistral8b ModelId = "mistral/ministral-8b"
	ModelIdMistralMistral7b ModelId = "mistral/mistral-7b"
	ModelIdMistralMistral7b20230927 ModelId = "mistral/mistral-7b-2023-09-27"
	ModelIdMistralMistral7b20231211 ModelId = "mistral/mistral-7b-2023-12-11"
	ModelIdMistralMistralEmbed ModelId = "mistral/mistral-embed"
	ModelIdMistralMistralLarge10 ModelId = "mistral/mistral-large-1.0"
	ModelIdMistralMistralLarge20 ModelId = "mistral/mistral-large-2.0"
	ModelIdMistralMistralLarge21 ModelId = "mistral/mistral-large-2.1"
	ModelIdMistralMistralLarge30 ModelId = "mistral/mistral-large-3.0"
	ModelIdMistralMistralMedium10 ModelId = "mistral/mistral-medium-1.0"
	ModelIdMistralMistralMedium30 ModelId = "mistral/mistral-medium-3.0"
	ModelIdMistralMistralMedium31 ModelId = "mistral/mistral-medium-3.1"
	ModelIdMistralMistralModeration ModelId = "mistral/mistral-moderation"
	ModelIdMistralMistralModeration2 ModelId = "mistral/mistral-moderation-2"
	ModelIdMistralMistralNemo12b ModelId = "mistral/mistral-nemo-12b"
	ModelIdMistralMistralOcr ModelId = "mistral/mistral-ocr"
	ModelIdMistralMistralOcr2 ModelId = "mistral/mistral-ocr-2"
	ModelIdMistralMistralSaba ModelId = "mistral/mistral-saba"
	ModelIdMistralMistralSmall10 ModelId = "mistral/mistral-small-1.0"
	ModelIdMistralMistralSmall20 ModelId = "mistral/mistral-small-2.0"
	ModelIdMistralMistralSmall30 ModelId = "mistral/mistral-small-3.0"
	ModelIdMistralMistralSmall31 ModelId = "mistral/mistral-small-3.1"
	ModelIdMistralMistralSmall32 ModelId = "mistral/mistral-small-3.2"
	ModelIdMistralMistralSmall4 ModelId = "mistral/mistral-small-4"
	ModelIdMistralMistralSmallCreative ModelId = "mistral/mistral-small-creative"
	ModelIdMistralMixtral8x22b ModelId = "mistral/mixtral-8x22b"
	ModelIdMistralMixtral8x7b ModelId = "mistral/mixtral-8x7b"
	ModelIdMistralOcr3 ModelId = "mistral/ocr-3"
	ModelIdMistralPixtral12b ModelId = "mistral/pixtral-12b"
	ModelIdMistralPixtralLarge ModelId = "mistral/pixtral-large"
	ModelIdMistralVoxtralMini ModelId = "mistral/voxtral-mini"
	ModelIdMistralVoxtralMiniTranscribe ModelId = "mistral/voxtral-mini-transcribe"
	ModelIdMistralVoxtralMiniTranscribe2 ModelId = "mistral/voxtral-mini-transcribe-2"
	ModelIdMistralVoxtralSmall ModelId = "mistral/voxtral-small"
	ModelIdMoonshotaiKimiK15 ModelId = "moonshotai/kimi-k1.5"
	ModelIdMoonshotaiKimiK2 ModelId = "moonshotai/kimi-k2"
	ModelIdMoonshotaiKimiK220250711 ModelId = "moonshotai/kimi-k2-2025-07-11"
	ModelIdMoonshotaiKimiK2Thinking ModelId = "moonshotai/kimi-k2-thinking"
	ModelIdMoonshotaiKimiK25 ModelId = "moonshotai/kimi-k2.5"
	ModelIdMoonshotaiKimiK26 ModelId = "moonshotai/kimi-k2.6"
	ModelIdMoonshotaiKimiLinear48b ModelId = "moonshotai/kimi-linear-48b"
	ModelIdMoonshotaiKimiVlA3b ModelId = "moonshotai/kimi-vl-a3b"
	ModelIdMoonshotaiKimiVlA3bThinking ModelId = "moonshotai/kimi-vl-a3b-thinking"
	ModelIdMoonshotaiKimiVlA3bThinking20250409 ModelId = "moonshotai/kimi-vl-a3b-thinking-2025-04-09"
	ModelIdNaverHyperclovaHyperclovaXSeedOmni8b ModelId = "naver-hyperclova/hyperclova-x-seed-omni-8b"
	ModelIdNaverHyperclovaHyperclovaXSeedThink14b ModelId = "naver-hyperclova/hyperclova-x-seed-think-14b"
	ModelIdNaverHyperclovaHyperclovaXSeedThink32b ModelId = "naver-hyperclova/hyperclova-x-seed-think-32b"
	ModelIdNousHermes2Llama270b ModelId = "nous/hermes-2-llama-2-70b"
	ModelIdNousHermes2ProLlama370b ModelId = "nous/hermes-2-pro-llama-3-70b"
	ModelIdNousHermes2ProLlama38b ModelId = "nous/hermes-2-pro-llama-3-8b"
	ModelIdNousHermes2ProMistral7b ModelId = "nous/hermes-2-pro-mistral-7b"
	ModelIdNousHermes2ThetaLlama370b ModelId = "nous/hermes-2-theta-llama-3-70b"
	ModelIdNousHermes2ThetaLlama38b ModelId = "nous/hermes-2-theta-llama-3-8b"
	ModelIdNousHermes3Llama31405b ModelId = "nous/hermes-3-llama-3.1-405b"
	ModelIdNousHermes3Llama3170b ModelId = "nous/hermes-3-llama-3.1-70b"
	ModelIdNousHermes3Llama318b ModelId = "nous/hermes-3-llama-3.1-8b"
	ModelIdNousHermes3Llama323b ModelId = "nous/hermes-3-llama-3.2-3b"
	ModelIdNousHermes414b ModelId = "nous/hermes-4-14b"
	ModelIdNousHermes4405b ModelId = "nous/hermes-4-405b"
	ModelIdNousHermes470b ModelId = "nous/hermes-4-70b"
	ModelIdNousHermes4336b ModelId = "nous/hermes-4.3-36b"
	ModelIdNousNomos1 ModelId = "nous/nomos-1"
	ModelIdNousNouscoder14b ModelId = "nous/nouscoder-14b"
	ModelIdNvidiaLlama31Nemotron70bInstruct ModelId = "nvidia/llama-3.1-nemotron-70b-instruct"
	ModelIdNvidiaLlama31NemotronNano4bV11 ModelId = "nvidia/llama-3.1-nemotron-nano-4b-v1.1"
	ModelIdNvidiaLlama31NemotronNano8bV1 ModelId = "nvidia/llama-3.1-nemotron-nano-8b-v1"
	ModelIdNvidiaLlama31NemotronUltra253bV1 ModelId = "nvidia/llama-3.1-nemotron-ultra-253b-v1"
	ModelIdNvidiaLlama33NemotronSuper49bV1 ModelId = "nvidia/llama-3.3-nemotron-super-49b-v1"
	ModelIdNvidiaLlama33NemotronSuper49bV15 ModelId = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
	ModelIdNvidiaNemotron3Nano30bA3b ModelId = "nvidia/nemotron-3-nano-30b-a3b"
	ModelIdNvidiaNemotron3Super120bA12b ModelId = "nvidia/nemotron-3-super-120b-a12b"
	ModelIdNvidiaNvidiaNemotronNano12bV2 ModelId = "nvidia/nvidia-nemotron-nano-12b-v2"
	ModelIdNvidiaNvidiaNemotronNano9bV2 ModelId = "nvidia/nvidia-nemotron-nano-9b-v2"
	ModelIdNvidiaOpenreasoningNemotron15b ModelId = "nvidia/openreasoning-nemotron-1.5b"
	ModelIdNvidiaOpenreasoningNemotron14b ModelId = "nvidia/openreasoning-nemotron-14b"
	ModelIdNvidiaOpenreasoningNemotron32b ModelId = "nvidia/openreasoning-nemotron-32b"
	ModelIdNvidiaOpenreasoningNemotron7b ModelId = "nvidia/openreasoning-nemotron-7b"
	ModelIdOpenaiAda ModelId = "openai/ada"
	ModelIdOpenaiBabbage ModelId = "openai/babbage"
	ModelIdOpenaiBabbage002 ModelId = "openai/babbage-002"
	ModelIdOpenaiChatgpt4o ModelId = "openai/chatgpt-4o"
	ModelIdOpenaiChatgptImageLatest ModelId = "openai/chatgpt-image-latest"
	ModelIdOpenaiCodeCushman001 ModelId = "openai/code-cushman-001"
	ModelIdOpenaiCodeCushman002 ModelId = "openai/code-cushman-002"
	ModelIdOpenaiCodeDavinci001 ModelId = "openai/code-davinci-001"
	ModelIdOpenaiCodeDavinci002 ModelId = "openai/code-davinci-002"
	ModelIdOpenaiCodeDavinciEdit001 ModelId = "openai/code-davinci-edit-001"
	ModelIdOpenaiCodeSearchAdaCode001 ModelId = "openai/code-search-ada-code-001"
	ModelIdOpenaiCodeSearchAdaText001 ModelId = "openai/code-search-ada-text-001"
	ModelIdOpenaiCodeSearchBabbageCode001 ModelId = "openai/code-search-babbage-code-001"
	ModelIdOpenaiCodeSearchBabbageText001 ModelId = "openai/code-search-babbage-text-001"
	ModelIdOpenaiCodexMini ModelId = "openai/codex-mini"
	ModelIdOpenaiComputerUsePreview ModelId = "openai/computer-use-preview"
	ModelIdOpenaiCurie ModelId = "openai/curie"
	ModelIdOpenaiDallE ModelId = "openai/dall-e"
	ModelIdOpenaiDallE2 ModelId = "openai/dall-e-2"
	ModelIdOpenaiDallE3 ModelId = "openai/dall-e-3"
	ModelIdOpenaiDavinci ModelId = "openai/davinci"
	ModelIdOpenaiDavinci002 ModelId = "openai/davinci-002"
	ModelIdOpenaiGpt1 ModelId = "openai/gpt-1"
	ModelIdOpenaiGpt2 ModelId = "openai/gpt-2"
	ModelIdOpenaiGpt3 ModelId = "openai/gpt-3"
	ModelIdOpenaiGpt35Turbo0613 ModelId = "openai/gpt-3.5-turbo-0613"
	ModelIdOpenaiGpt35Turbo16k0613 ModelId = "openai/gpt-3.5-turbo-16k-0613"
	ModelIdOpenaiGpt35Turbo20231106 ModelId = "openai/gpt-3.5-turbo-2023-11-06"
	ModelIdOpenaiGpt35Turbo20240125 ModelId = "openai/gpt-3.5-turbo-2024-01-25"
	ModelIdOpenaiGpt35TurboInstruct ModelId = "openai/gpt-3.5-turbo-instruct"
	ModelIdOpenaiGpt4 ModelId = "openai/gpt-4"
	ModelIdOpenaiGpt420230314 ModelId = "openai/gpt-4-2023-03-14"
	ModelIdOpenaiGpt432k ModelId = "openai/gpt-4-32k"
	ModelIdOpenaiGpt432k0314 ModelId = "openai/gpt-4-32k-0314"
	ModelIdOpenaiGpt432k0613 ModelId = "openai/gpt-4-32k-0613"
	ModelIdOpenaiGpt4Turbo ModelId = "openai/gpt-4-turbo"
	ModelIdOpenaiGpt4Turbo20230314 ModelId = "openai/gpt-4-turbo-2023-03-14"
	ModelIdOpenaiGpt4Turbo20231106 ModelId = "openai/gpt-4-turbo-2023-11-06"
	ModelIdOpenaiGpt41 ModelId = "openai/gpt-4.1"
	ModelIdOpenaiGpt41Mini ModelId = "openai/gpt-4.1-mini"
	ModelIdOpenaiGpt41Nano ModelId = "openai/gpt-4.1-nano"
	ModelIdOpenaiGpt45 ModelId = "openai/gpt-4.5"
	ModelIdOpenaiGpt4o ModelId = "openai/gpt-4o"
	ModelIdOpenaiGpt4o20240513 ModelId = "openai/gpt-4o-2024-05-13"
	ModelIdOpenaiGpt4o20240806 ModelId = "openai/gpt-4o-2024-08-06"
	ModelIdOpenaiGpt4oAudio ModelId = "openai/gpt-4o-audio"
	ModelIdOpenaiGpt4oAudio20241001 ModelId = "openai/gpt-4o-audio-2024-10-01"
	ModelIdOpenaiGpt4oAudio20241217 ModelId = "openai/gpt-4o-audio-2024-12-17"
	ModelIdOpenaiGpt4oMini ModelId = "openai/gpt-4o-mini"
	ModelIdOpenaiGpt4oMiniAudioPreview ModelId = "openai/gpt-4o-mini-audio-preview"
	ModelIdOpenaiGpt4oMiniRealtimePreview ModelId = "openai/gpt-4o-mini-realtime-preview"
	ModelIdOpenaiGpt4oMiniSearchPreview ModelId = "openai/gpt-4o-mini-search-preview"
	ModelIdOpenaiGpt4oMiniTranscribe ModelId = "openai/gpt-4o-mini-transcribe"
	ModelIdOpenaiGpt4oMiniTranscribe20250320 ModelId = "openai/gpt-4o-mini-transcribe-2025-03-20"
	ModelIdOpenaiGpt4oMiniTts ModelId = "openai/gpt-4o-mini-tts"
	ModelIdOpenaiGpt4oMiniTts20250320 ModelId = "openai/gpt-4o-mini-tts-2025-03-20"
	ModelIdOpenaiGpt4oRealtimePreview ModelId = "openai/gpt-4o-realtime-preview"
	ModelIdOpenaiGpt4oRealtimePreview20241001 ModelId = "openai/gpt-4o-realtime-preview-2024-10-01"
	ModelIdOpenaiGpt4oRealtimePreview20241217 ModelId = "openai/gpt-4o-realtime-preview-2024-12-17"
	ModelIdOpenaiGpt4oSearchPreview ModelId = "openai/gpt-4o-search-preview"
	ModelIdOpenaiGpt4oTranscribe ModelId = "openai/gpt-4o-transcribe"
	ModelIdOpenaiGpt4oTranscribeDiarize ModelId = "openai/gpt-4o-transcribe-diarize"
	ModelIdOpenaiGpt5 ModelId = "openai/gpt-5"
	ModelIdOpenaiGpt5Chat ModelId = "openai/gpt-5-chat"
	ModelIdOpenaiGpt5Codex ModelId = "openai/gpt-5-codex"
	ModelIdOpenaiGpt5CodexMini ModelId = "openai/gpt-5-codex-mini"
	ModelIdOpenaiGpt5Mini ModelId = "openai/gpt-5-mini"
	ModelIdOpenaiGpt5Nano ModelId = "openai/gpt-5-nano"
	ModelIdOpenaiGpt5Pro ModelId = "openai/gpt-5-pro"
	ModelIdOpenaiGpt5SearchApi ModelId = "openai/gpt-5-search-api"
	ModelIdOpenaiGpt51 ModelId = "openai/gpt-5.1"
	ModelIdOpenaiGpt51Chat ModelId = "openai/gpt-5.1-chat"
	ModelIdOpenaiGpt51Codex ModelId = "openai/gpt-5.1-codex"
	ModelIdOpenaiGpt51CodexMax ModelId = "openai/gpt-5.1-codex-max"
	ModelIdOpenaiGpt51CodexMini ModelId = "openai/gpt-5.1-codex-mini"
	ModelIdOpenaiGpt51Pro ModelId = "openai/gpt-5.1-pro"
	ModelIdOpenaiGpt52 ModelId = "openai/gpt-5.2"
	ModelIdOpenaiGpt52Chat ModelId = "openai/gpt-5.2-chat"
	ModelIdOpenaiGpt52Codex ModelId = "openai/gpt-5.2-codex"
	ModelIdOpenaiGpt52Mini ModelId = "openai/gpt-5.2-mini"
	ModelIdOpenaiGpt52Pro ModelId = "openai/gpt-5.2-pro"
	ModelIdOpenaiGpt53Chat ModelId = "openai/gpt-5.3-chat"
	ModelIdOpenaiGpt53Codex ModelId = "openai/gpt-5.3-codex"
	ModelIdOpenaiGpt53CodexSpark ModelId = "openai/gpt-5.3-codex-spark"
	ModelIdOpenaiGpt54 ModelId = "openai/gpt-5.4"
	ModelIdOpenaiGpt54Mini ModelId = "openai/gpt-5.4-mini"
	ModelIdOpenaiGpt54Nano ModelId = "openai/gpt-5.4-nano"
	ModelIdOpenaiGpt54Pro ModelId = "openai/gpt-5.4-pro"
	ModelIdOpenaiGptAudio ModelId = "openai/gpt-audio"
	ModelIdOpenaiGptAudio15 ModelId = "openai/gpt-audio-1.5"
	ModelIdOpenaiGptAudioMini ModelId = "openai/gpt-audio-mini"
	ModelIdOpenaiGptAudioMini20251006 ModelId = "openai/gpt-audio-mini-2025-10-06"
	ModelIdOpenaiGptImage1 ModelId = "openai/gpt-image-1"
	ModelIdOpenaiGptImage1Mini ModelId = "openai/gpt-image-1-mini"
	ModelIdOpenaiGptImage15 ModelId = "openai/gpt-image-1.5"
	ModelIdOpenaiGptOss120b ModelId = "openai/gpt-oss-120b"
	ModelIdOpenaiGptOss20b ModelId = "openai/gpt-oss-20b"
	ModelIdOpenaiGptOssSafeguard120b ModelId = "openai/gpt-oss-safeguard-120b"
	ModelIdOpenaiGptOssSafeguard20b ModelId = "openai/gpt-oss-safeguard-20b"
	ModelIdOpenaiGptRealtime ModelId = "openai/gpt-realtime"
	ModelIdOpenaiGptRealtime15 ModelId = "openai/gpt-realtime-1.5"
	ModelIdOpenaiGptRealtimeMini ModelId = "openai/gpt-realtime-mini"
	ModelIdOpenaiGptRealtimeMini20251006 ModelId = "openai/gpt-realtime-mini-2025-10-06"
	ModelIdOpenaiO1 ModelId = "openai/o1"
	ModelIdOpenaiO1Mini ModelId = "openai/o1-mini"
	ModelIdOpenaiO1Preview ModelId = "openai/o1-preview"
	ModelIdOpenaiO1Pro ModelId = "openai/o1-pro"
	ModelIdOpenaiO3 ModelId = "openai/o3"
	ModelIdOpenaiO3DeepResearch ModelId = "openai/o3-deep-research"
	ModelIdOpenaiO3Mini ModelId = "openai/o3-mini"
	ModelIdOpenaiO3Preview ModelId = "openai/o3-preview"
	ModelIdOpenaiO3Pro ModelId = "openai/o3-pro"
	ModelIdOpenaiO4Mini ModelId = "openai/o4-mini"
	ModelIdOpenaiO4MiniDeepResearch ModelId = "openai/o4-mini-deep-research"
	ModelIdOpenaiOmniModeration ModelId = "openai/omni-moderation"
	ModelIdOpenaiSora1 ModelId = "openai/sora-1"
	ModelIdOpenaiSora2 ModelId = "openai/sora-2"
	ModelIdOpenaiSora220250930 ModelId = "openai/sora-2-2025-09-30"
	ModelIdOpenaiSora2Pro ModelId = "openai/sora-2-pro"
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
	ModelIdOpenaiWhisper3 ModelId = "openai/whisper-3"
	ModelIdOpenaiWhisper3Turbo ModelId = "openai/whisper-3-turbo"
	ModelIdPrimeIntellectIntellect3 ModelId = "prime-intellect/intellect-3"
	ModelIdPrimeIntellectIntellect31 ModelId = "prime-intellect/intellect-3.1"
	ModelIdQwenCodeQwen157b ModelId = "qwen/code-qwen-1.5-7b"
	ModelIdQwenQvq72bPreview ModelId = "qwen/qvq-72b-preview"
	ModelIdQwenQwen18b ModelId = "qwen/qwen-1.8b"
	ModelIdQwenQwen14b ModelId = "qwen/qwen-14b"
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
	ModelIdQwenQwen1505b ModelId = "qwen/qwen1.5-0.5b"
	ModelIdQwenQwen1518b ModelId = "qwen/qwen1.5-1.8b"
	ModelIdQwenQwen15110b ModelId = "qwen/qwen1.5-110b"
	ModelIdQwenQwen1514b ModelId = "qwen/qwen1.5-14b"
	ModelIdQwenQwen1532b ModelId = "qwen/qwen1.5-32b"
	ModelIdQwenQwen154b ModelId = "qwen/qwen1.5-4b"
	ModelIdQwenQwen1572b ModelId = "qwen/qwen1.5-72b"
	ModelIdQwenQwen157b ModelId = "qwen/qwen1.5-7b"
	ModelIdQwenQwen15MoeA27b ModelId = "qwen/qwen1.5-moe-a2.7b"
	ModelIdQwenQwen205b ModelId = "qwen/qwen2-0.5b"
	ModelIdQwenQwen215b ModelId = "qwen/qwen2-1.5b"
	ModelIdQwenQwen272b ModelId = "qwen/qwen2-72b"
	ModelIdQwenQwen27b ModelId = "qwen/qwen2-7b"
	ModelIdQwenQwen2Audio7b ModelId = "qwen/qwen2-audio-7b"
	ModelIdQwenQwen2Math15b ModelId = "qwen/qwen2-math-1.5b"
	ModelIdQwenQwen2Math72b ModelId = "qwen/qwen2-math-72b"
	ModelIdQwenQwen2Math7b ModelId = "qwen/qwen2-math-7b"
	ModelIdQwenQwen2MathRm72b ModelId = "qwen/qwen2-math-rm-72b"
	ModelIdQwenQwen2Vl2b ModelId = "qwen/qwen2-vl-2b"
	ModelIdQwenQwen2Vl72b ModelId = "qwen/qwen2-vl-72b"
	ModelIdQwenQwen2Vl7b ModelId = "qwen/qwen2-vl-7b"
	ModelIdQwenQwen2505b ModelId = "qwen/qwen2.5-0.5b"
	ModelIdQwenQwen2515b ModelId = "qwen/qwen2.5-1.5b"
	ModelIdQwenQwen2514b ModelId = "qwen/qwen2.5-14b"
	ModelIdQwenQwen2532b ModelId = "qwen/qwen2.5-32b"
	ModelIdQwenQwen253b ModelId = "qwen/qwen2.5-3b"
	ModelIdQwenQwen2572b ModelId = "qwen/qwen2.5-72b"
	ModelIdQwenQwen257b ModelId = "qwen/qwen2.5-7b"
	ModelIdQwenQwen25Coder05b ModelId = "qwen/qwen2.5-coder-0.5b"
	ModelIdQwenQwen25Coder15b ModelId = "qwen/qwen2.5-coder-1.5b"
	ModelIdQwenQwen25Coder14b ModelId = "qwen/qwen2.5-coder-14b"
	ModelIdQwenQwen25Coder32b ModelId = "qwen/qwen2.5-coder-32b"
	ModelIdQwenQwen25Coder3b ModelId = "qwen/qwen2.5-coder-3b"
	ModelIdQwenQwen25Coder7b ModelId = "qwen/qwen2.5-coder-7b"
	ModelIdQwenQwen25Math15b ModelId = "qwen/qwen2.5-math-1.5b"
	ModelIdQwenQwen25Math72b ModelId = "qwen/qwen2.5-math-72b"
	ModelIdQwenQwen25Math7b ModelId = "qwen/qwen2.5-math-7b"
	ModelIdQwenQwen25Math7bPrm800k ModelId = "qwen/qwen2.5-math-7b-prm800k"
	ModelIdQwenQwen25MathPrm72b ModelId = "qwen/qwen2.5-math-prm-72b"
	ModelIdQwenQwen25MathPrm7b ModelId = "qwen/qwen2.5-math-prm-7b"
	ModelIdQwenQwen25MathRm72b ModelId = "qwen/qwen2.5-math-rm-72b"
	ModelIdQwenQwen25Omni3b ModelId = "qwen/qwen2.5-omni-3b"
	ModelIdQwenQwen25Omni7b ModelId = "qwen/qwen2.5-omni-7b"
	ModelIdQwenQwen25Vl32b ModelId = "qwen/qwen2.5-vl-32b"
	ModelIdQwenQwen25Vl3b ModelId = "qwen/qwen2.5-vl-3b"
	ModelIdQwenQwen25Vl72b ModelId = "qwen/qwen2.5-vl-72b"
	ModelIdQwenQwen25Vl7b ModelId = "qwen/qwen2.5-vl-7b"
	ModelIdQwenQwen306b ModelId = "qwen/qwen3-0.6b"
	ModelIdQwenQwen317b ModelId = "qwen/qwen3-1.7b"
	ModelIdQwenQwen314b ModelId = "qwen/qwen3-14b"
	ModelIdQwenQwen3235bA22b ModelId = "qwen/qwen3-235b-a22b"
	ModelIdQwenQwen3235bA22b2507 ModelId = "qwen/qwen3-235b-a22b-2507"
	ModelIdQwenQwen3235bA22bThinking2507 ModelId = "qwen/qwen3-235b-a22b-thinking-2507"
	ModelIdQwenQwen330bA3b ModelId = "qwen/qwen3-30b-a3b"
	ModelIdQwenQwen330bA3bInstruct2507 ModelId = "qwen/qwen3-30b-a3b-instruct-2507"
	ModelIdQwenQwen330bA3bThinking2507 ModelId = "qwen/qwen3-30b-a3b-thinking-2507"
	ModelIdQwenQwen332b ModelId = "qwen/qwen3-32b"
	ModelIdQwenQwen34b ModelId = "qwen/qwen3-4b"
	ModelIdQwenQwen34bInstruct2507 ModelId = "qwen/qwen3-4b-instruct-2507"
	ModelIdQwenQwen34bSaferl ModelId = "qwen/qwen3-4b-saferl"
	ModelIdQwenQwen34bThinking2507 ModelId = "qwen/qwen3-4b-thinking-2507"
	ModelIdQwenQwen38b ModelId = "qwen/qwen3-8b"
	ModelIdQwenQwen3Asr06b ModelId = "qwen/qwen3-asr-0.6b"
	ModelIdQwenQwen3Asr17b ModelId = "qwen/qwen3-asr-1.7b"
	ModelIdQwenQwen3Coder30bA3b ModelId = "qwen/qwen3-coder-30b-a3b"
	ModelIdQwenQwen3Coder480bA35b ModelId = "qwen/qwen3-coder-480b-a35b"
	ModelIdQwenQwen3CoderNext ModelId = "qwen/qwen3-coder-next"
	ModelIdQwenQwen3Embedding06b ModelId = "qwen/qwen3-embedding-0.6b"
	ModelIdQwenQwen3Embedding4b ModelId = "qwen/qwen3-embedding-4b"
	ModelIdQwenQwen3Embedding8b ModelId = "qwen/qwen3-embedding-8b"
	ModelIdQwenQwen3Forcedaligner06b ModelId = "qwen/qwen3-forcedaligner-0.6b"
	ModelIdQwenQwen3GuardGen06b ModelId = "qwen/qwen3-guard-gen-0.6b"
	ModelIdQwenQwen3GuardGen4b ModelId = "qwen/qwen3-guard-gen-4b"
	ModelIdQwenQwen3GuardGen8b ModelId = "qwen/qwen3-guard-gen-8b"
	ModelIdQwenQwen3GuardStream06b ModelId = "qwen/qwen3-guard-stream-0.6b"
	ModelIdQwenQwen3GuardStream4b ModelId = "qwen/qwen3-guard-stream-4b"
	ModelIdQwenQwen3GuardStream8b ModelId = "qwen/qwen3-guard-stream-8b"
	ModelIdQwenQwen3MaxThinking ModelId = "qwen/qwen3-max-thinking"
	ModelIdQwenQwen3Next80bA3bInstruct ModelId = "qwen/qwen3-next-80b-a3b-instruct"
	ModelIdQwenQwen3Next80bA3bThinking ModelId = "qwen/qwen3-next-80b-a3b-thinking"
	ModelIdQwenQwen3Omni30bA3bCaptioner ModelId = "qwen/qwen3-omni-30b-a3b-captioner"
	ModelIdQwenQwen3Omni30bA3bInstruct ModelId = "qwen/qwen3-omni-30b-a3b-instruct"
	ModelIdQwenQwen3Omni30bA3bThinking ModelId = "qwen/qwen3-omni-30b-a3b-thinking"
	ModelIdQwenQwen3OmniFlash ModelId = "qwen/qwen3-omni-flash"
	ModelIdQwenQwen3OmniFlash20250915 ModelId = "qwen/qwen3-omni-flash-2025-09-15"
	ModelIdQwenQwen3Reranker06b ModelId = "qwen/qwen3-reranker-0.6b"
	ModelIdQwenQwen3Reranker4b ModelId = "qwen/qwen3-reranker-4b"
	ModelIdQwenQwen3Reranker8b ModelId = "qwen/qwen3-reranker-8b"
	ModelIdQwenQwen3Tts ModelId = "qwen/qwen3-tts"
	ModelIdQwenQwen3Tts12hz06bBase ModelId = "qwen/qwen3-tts-12hz-0.6b-base"
	ModelIdQwenQwen3Tts12hz06bCustomvoice ModelId = "qwen/qwen3-tts-12hz-0.6b-customvoice"
	ModelIdQwenQwen3Tts12hz17bBase ModelId = "qwen/qwen3-tts-12hz-1.7b-base"
	ModelIdQwenQwen3Tts12hz17bVoicedesign ModelId = "qwen/qwen3-tts-12hz-1.7b-voicedesign"
	ModelIdQwenQwen3Vl235bA22bInstruct ModelId = "qwen/qwen3-vl-235b-a22b-instruct"
	ModelIdQwenQwen3Vl235bA22bThinking ModelId = "qwen/qwen3-vl-235b-a22b-thinking"
	ModelIdQwenQwen3Vl2bInstruct ModelId = "qwen/qwen3-vl-2b-instruct"
	ModelIdQwenQwen3Vl2bThinking ModelId = "qwen/qwen3-vl-2b-thinking"
	ModelIdQwenQwen3Vl30bA3bInstruct ModelId = "qwen/qwen3-vl-30b-a3b-instruct"
	ModelIdQwenQwen3Vl30bA3bThinking ModelId = "qwen/qwen3-vl-30b-a3b-thinking"
	ModelIdQwenQwen3Vl32bInstruct ModelId = "qwen/qwen3-vl-32b-instruct"
	ModelIdQwenQwen3Vl32bThinking ModelId = "qwen/qwen3-vl-32b-thinking"
	ModelIdQwenQwen3Vl4bInstruct ModelId = "qwen/qwen3-vl-4b-instruct"
	ModelIdQwenQwen3Vl4bThinking ModelId = "qwen/qwen3-vl-4b-thinking"
	ModelIdQwenQwen3Vl8bInstruct ModelId = "qwen/qwen3-vl-8b-instruct"
	ModelIdQwenQwen3Vl8bThinking ModelId = "qwen/qwen3-vl-8b-thinking"
	ModelIdQwenQwen3VlEmbedding2b ModelId = "qwen/qwen3-vl-embedding-2b"
	ModelIdQwenQwen3VlEmbedding8b ModelId = "qwen/qwen3-vl-embedding-8b"
	ModelIdQwenQwen3VlReranker2b ModelId = "qwen/qwen3-vl-reranker-2b"
	ModelIdQwenQwen3VlReranker8b ModelId = "qwen/qwen3-vl-reranker-8b"
	ModelIdQwenQwen3508b ModelId = "qwen/qwen3.5-0.8b"
	ModelIdQwenQwen35122bA10b ModelId = "qwen/qwen3.5-122b-a10b"
	ModelIdQwenQwen3527b ModelId = "qwen/qwen3.5-27b"
	ModelIdQwenQwen352b ModelId = "qwen/qwen3.5-2b"
	ModelIdQwenQwen3535bA3b ModelId = "qwen/qwen3.5-35b-a3b"
	ModelIdQwenQwen35397bA17b ModelId = "qwen/qwen3.5-397b-a17b"
	ModelIdQwenQwen354b ModelId = "qwen/qwen3.5-4b"
	ModelIdQwenQwen359b ModelId = "qwen/qwen3.5-9b"
	ModelIdQwenQwen35Flash ModelId = "qwen/qwen3.5-flash"
	ModelIdQwenQwen35Plus ModelId = "qwen/qwen3.5-plus"
	ModelIdQwenQwen3635bA3b ModelId = "qwen/qwen3.6-35b-a3b"
	ModelIdQwenQwen36MaxPreview ModelId = "qwen/qwen3.6-max-preview"
	ModelIdQwenQwen36Plus ModelId = "qwen/qwen3.6-plus"
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
	ModelIdStepfunStep35Flash ModelId = "stepfun/step-3.5-flash"
	ModelIdSunoSunoV35 ModelId = "suno/suno-v3.5"
	ModelIdSunoSunoV4 ModelId = "suno/suno-v4"
	ModelIdSunoSunoV45 ModelId = "suno/suno-v4.5"
	ModelIdSunoSunoV452 ModelId = "suno/suno-v4.5-"
	ModelIdSunoSunoV45All ModelId = "suno/suno-v4.5-all"
	ModelIdSunoSunoV5 ModelId = "suno/suno-v5"
	ModelIdUpstageSolarPro ModelId = "upstage/solar-pro"
	ModelIdUpstageSolarPro2 ModelId = "upstage/solar-pro-2"
	ModelIdUpstageSolarPro220250710 ModelId = "upstage/solar-pro-2-2025-07-10"
	ModelIdUpstageSolarPro220250909 ModelId = "upstage/solar-pro-2-2025-09-09"
	ModelIdUpstageSolarPro2Preview ModelId = "upstage/solar-pro-2-preview"
	ModelIdUpstageSolarPro3 ModelId = "upstage/solar-pro-3"
	ModelIdVercelV010Md ModelId = "vercel/v0-1.0-md"
	ModelIdVercelV015Lg ModelId = "vercel/v0-1.5-lg"
	ModelIdVercelV015Md ModelId = "vercel/v0-1.5-md"
	ModelIdVercelV015Sm ModelId = "vercel/v0-1.5-sm"
	ModelIdVoyageRerank1 ModelId = "voyage/rerank-1"
	ModelIdVoyageRerank2 ModelId = "voyage/rerank-2"
	ModelIdVoyageRerank2Lite ModelId = "voyage/rerank-2-lite"
	ModelIdVoyageRerankLite1 ModelId = "voyage/rerank-lite-1"
	ModelIdVoyageVoyage01 ModelId = "voyage/voyage-01"
	ModelIdVoyageVoyage02 ModelId = "voyage/voyage-02"
	ModelIdVoyageVoyage2 ModelId = "voyage/voyage-2"
	ModelIdVoyageVoyage3 ModelId = "voyage/voyage-3"
	ModelIdVoyageVoyage3Large ModelId = "voyage/voyage-3-large"
	ModelIdVoyageVoyage3Lite ModelId = "voyage/voyage-3-lite"
	ModelIdVoyageVoyage35 ModelId = "voyage/voyage-3.5"
	ModelIdVoyageVoyage35Lite ModelId = "voyage/voyage-3.5-lite"
	ModelIdVoyageVoyage4 ModelId = "voyage/voyage-4"
	ModelIdVoyageVoyage4Large ModelId = "voyage/voyage-4-large"
	ModelIdVoyageVoyage4Lite ModelId = "voyage/voyage-4-lite"
	ModelIdVoyageVoyageCode2 ModelId = "voyage/voyage-code-2"
	ModelIdVoyageVoyageCode3 ModelId = "voyage/voyage-code-3"
	ModelIdVoyageVoyageContext3 ModelId = "voyage/voyage-context-3"
	ModelIdVoyageVoyageFinance2 ModelId = "voyage/voyage-finance-2"
	ModelIdVoyageVoyageLarge2 ModelId = "voyage/voyage-large-2"
	ModelIdVoyageVoyageLarge2Instruct ModelId = "voyage/voyage-large-2-instruct"
	ModelIdVoyageVoyageLaw2 ModelId = "voyage/voyage-law-2"
	ModelIdVoyageVoyageLite01 ModelId = "voyage/voyage-lite-01"
	ModelIdVoyageVoyageLite01Instruct ModelId = "voyage/voyage-lite-01-instruct"
	ModelIdVoyageVoyageLite02Instruct ModelId = "voyage/voyage-lite-02-instruct"
	ModelIdVoyageVoyageMultilingual2 ModelId = "voyage/voyage-multilingual-2"
	ModelIdVoyageVoyageMultimodal3 ModelId = "voyage/voyage-multimodal-3"
	ModelIdVoyageVoyageMultimodal35 ModelId = "voyage/voyage-multimodal-3.5"
	ModelIdXAiGrok0 ModelId = "x-ai/grok-0"
	ModelIdXAiGrok1 ModelId = "x-ai/grok-1"
	ModelIdXAiGrok15 ModelId = "x-ai/grok-1.5"
	ModelIdXAiGrok15v ModelId = "x-ai/grok-1.5v"
	ModelIdXAiGrok2 ModelId = "x-ai/grok-2"
	ModelIdXAiGrok2Image1212 ModelId = "x-ai/grok-2-image-1212"
	ModelIdXAiGrok2Mini ModelId = "x-ai/grok-2-mini"
	ModelIdXAiGrok2Vision1212 ModelId = "x-ai/grok-2-vision-1212"
	ModelIdXAiGrok3 ModelId = "x-ai/grok-3"
	ModelIdXAiGrok3Beta ModelId = "x-ai/grok-3-beta"
	ModelIdXAiGrok3Mini ModelId = "x-ai/grok-3-mini"
	ModelIdXAiGrok3MiniBeta ModelId = "x-ai/grok-3-mini-beta"
	ModelIdXAiGrok4 ModelId = "x-ai/grok-4"
	ModelIdXAiGrok4FastNonReasoning ModelId = "x-ai/grok-4-fast-non-reasoning"
	ModelIdXAiGrok4FastReasoning ModelId = "x-ai/grok-4-fast-reasoning"
	ModelIdXAiGrok4Heavy ModelId = "x-ai/grok-4-heavy"
	ModelIdXAiGrok41NonThinking ModelId = "x-ai/grok-4.1-non-thinking"
	ModelIdXAiGrok41Thinking ModelId = "x-ai/grok-4.1-thinking"
	ModelIdXAiGrok420 ModelId = "x-ai/grok-4.20"
	ModelIdXAiGrok420MultiAgentBeta ModelId = "x-ai/grok-4.20-multi-agent-beta"
	ModelIdXAiGrok43 ModelId = "x-ai/grok-4.3"
	ModelIdXAiGrokCodeFast1 ModelId = "x-ai/grok-code-fast-1"
	ModelIdXAiGrokImagineImage ModelId = "x-ai/grok-imagine-image"
	ModelIdXAiGrokImagineImagePro ModelId = "x-ai/grok-imagine-image-pro"
	ModelIdXAiGrokImagineVideo ModelId = "x-ai/grok-imagine-video"
	ModelIdXiaomiMimoV2Flash ModelId = "xiaomi/mimo-v2-flash"
	ModelIdXiaomiMimoV2Omni ModelId = "xiaomi/mimo-v2-omni"
	ModelIdXiaomiMimoV2Pro ModelId = "xiaomi/mimo-v2-pro"
	ModelIdXiaomiMimoV2Tts ModelId = "xiaomi/mimo-v2-tts"
	ModelIdZAiGlm432b ModelId = "z-ai/glm-4-32b"
	ModelIdZAiGlm49b ModelId = "z-ai/glm-4-9b"
	ModelIdZAiGlm49b20240604 ModelId = "z-ai/glm-4-9b-2024-06-04"
	ModelIdZAiGlm49bChat ModelId = "z-ai/glm-4-9b-chat"
	ModelIdZAiGlm49bChat1m ModelId = "z-ai/glm-4-9b-chat-1m"
	ModelIdZAiGlm41v9b ModelId = "z-ai/glm-4.1v-9b"
	ModelIdZAiGlm41vThinking9b ModelId = "z-ai/glm-4.1v-thinking-9b"
	ModelIdZAiGlm45 ModelId = "z-ai/glm-4.5"
	ModelIdZAiGlm45Air ModelId = "z-ai/glm-4.5-air"
	ModelIdZAiGlm45AirX ModelId = "z-ai/glm-4.5-air-x"
	ModelIdZAiGlm45X ModelId = "z-ai/glm-4.5-x"
	ModelIdZAiGlm45v ModelId = "z-ai/glm-4.5v"
	ModelIdZAiGlm46 ModelId = "z-ai/glm-4.6"
	ModelIdZAiGlm46v ModelId = "z-ai/glm-4.6v"
	ModelIdZAiGlm46vFlash ModelId = "z-ai/glm-4.6v-flash"
	ModelIdZAiGlm47 ModelId = "z-ai/glm-4.7"
	ModelIdZAiGlm47Flash ModelId = "z-ai/glm-4.7-flash"
	ModelIdZAiGlm4v9b ModelId = "z-ai/glm-4v-9b"
	ModelIdZAiGlm5 ModelId = "z-ai/glm-5"
	ModelIdZAiGlm5Code ModelId = "z-ai/glm-5-code"
	ModelIdZAiGlm5Turbo ModelId = "z-ai/glm-5-turbo"
	ModelIdZAiGlm51 ModelId = "z-ai/glm-5.1"
	ModelIdZAiGlm5vTurbo ModelId = "z-ai/glm-5v-turbo"
	ModelIdZAiGlmImage ModelId = "z-ai/glm-image"
)


type ModelLifecycle struct {
	DeprecationDate *string `json:"deprecation_date,omitempty"`
	Message *string `json:"message,omitempty"`
	ReplacementModelId *string `json:"replacement_model_id,omitempty"`
	RetirementDate *string `json:"retirement_date,omitempty"`
	Status *string `json:"status,omitempty"`
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

type ProviderOptions struct {
	Anthropic *map[string]interface{} `json:"anthropic,omitempty"`
	Google *map[string]interface{} `json:"google,omitempty"`
	Openai *map[string]interface{} `json:"openai,omitempty"`
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
	CompletedAt *interface{} `json:"completed_at,omitempty"`
	ContentUrl *string `json:"content_url,omitempty"`
	CreatedAt interface{} `json:"created_at,omitempty"`
	DownloadUrl *string `json:"download_url,omitempty"`
	Error *interface{} `json:"error,omitempty"`
	ExpiresAt *int `json:"expires_at,omitempty"`
	GenerationId *string `json:"generation_id,omitempty"`
	Id *string `json:"id,omitempty"`
	Model *string `json:"model,omitempty"`
	Object *string `json:"object,omitempty"`
	OutputAccess *string `json:"output_access,omitempty"`
	Outputs *[]map[string]interface{} `json:"outputs,omitempty"`
	PollAfterSeconds *int `json:"poll_after_seconds,omitempty"`
	PollingUrl *string `json:"polling_url,omitempty"`
	Progress *int `json:"progress,omitempty"`
	ProgressSource *string `json:"progress_source,omitempty"`
	Provider *string `json:"provider,omitempty"`
	Seconds *float64 `json:"seconds,omitempty"`
	Size *string `json:"size,omitempty"`
	StartedAt *interface{} `json:"started_at,omitempty"`
	Status *string `json:"status,omitempty"`
	Usage *map[string]interface{} `json:"usage,omitempty"`
}

type VideoInputReference struct {
	ImageUrl *map[string]interface{} `json:"image_url,omitempty"`
	ReferenceType *string `json:"reference_type,omitempty"`
	Role *string `json:"role,omitempty"`
	Type string `json:"type"`
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
