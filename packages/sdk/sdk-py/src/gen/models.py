from __future__ import annotations

from typing import Any, Dict, List, Optional, Union, Literal
from typing_extensions import NotRequired, TypedDict

class ActivityEntry(TypedDict):
	byok_usage_inference: float
	completion_tokens: int
	date: str
	endpoint_id: str
	model: str
	model_permaslug: str
	prompt_tokens: int
	provider_name: str
	reasoning_tokens: int
	requests: int
	usage: float

class ActivityResponse(TypedDict):
	data: List[ActivityEntry]

class AnalyticsAccessTokenRequiredResponse(TypedDict):
	error: Literal["access_token_required"]
	ok: Literal[false]

class AnalyticsNotImplementedResponse(TypedDict):
	message: str
	ok: Literal[true]
	status: Literal["not_implemented"]

class AnalyticsResponse(TypedDict):
	data: List[ActivityEntry]
	limit: int
	offset: int
	total_count: int

class AnthropicContentBlock(TypedDict):
	cache_control: NotRequired[CacheControl]
	content: NotRequired[str]
	id: NotRequired[str]
	input: NotRequired[Dict[str, Any]]
	name: NotRequired[str]
	source: NotRequired[Dict[str, Any]]
	text: NotRequired[str]
	tool_use_id: NotRequired[str]
	type: NotRequired[Literal["text", "image", "tool_use", "tool_result"]]

class AnthropicMessage(TypedDict):
	content: Union[str, List[AnthropicContentBlock]]
	role: Literal["user", "assistant"]

class AnthropicMessagesRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	echo_upstream_request: NotRequired[bool]
	max_tokens: int
	messages: List[AnthropicMessage]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[ProviderOptions]
	reasoning: NotRequired[ReasoningConfig]
	session_id: NotRequired[str]
	stop_sequences: NotRequired[List[str]]
	stream: NotRequired[bool]
	system: NotRequired[Union[str, List[Dict[str, Any]]]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[Dict[str, Any], str]]
	tools: NotRequired[List[Union[AnthropicTool, GatewayDatetimeToolDefinition, GatewayWebSearchToolDefinition, GatewayWebFetchToolDefinition, SubagentToolDefinition, FusionToolDefinition, SearchModelsToolDefinition]]]
	top_k: NotRequired[int]
	top_p: NotRequired[float]
	usage: NotRequired[bool]

class AnthropicMessagesResponse(TypedDict):
	content: NotRequired[List[AnthropicContentBlock]]
	id: NotRequired[str]
	model: NotRequired[str]
	role: NotRequired[Literal["assistant"]]
	stop_reason: NotRequired[str]
	stop_sequence: NotRequired[str]
	type: NotRequired[str]
	usage: NotRequired[AnthropicUsage]

AnthropicTool = TypedDict("AnthropicTool", {
	"async": NotRequired[bool],
	"description": NotRequired[str],
	"input_schema": NotRequired[Dict[str, Any]],
	"name": str,
})

class AnthropicUsage(TypedDict):
	input_tokens: NotRequired[int]
	output_tokens: NotRequired[int]

class ApiKey(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	creator_user_id: Optional[str]
	disabled: bool
	expires_at: Optional[str]
	hash: str
	id: str
	include_byok_in_limit: bool
	label: Optional[str]
	last_used_at: Optional[str]
	limit: Optional[float]
	limit_remaining: Optional[float]
	limit_reset: Optional[Literal["daily", "weekly", "monthly"]]
	limits: ApiKeyLimitWindows
	name: Optional[str]
	prefix: Optional[str]
	scopes: Union[str, List[str]]
	soft_blocked: bool
	status: Optional[str]
	updated_at: Optional[str]
	usage: float
	usage_daily: float
	usage_details: ApiKeyUsageWindows
	usage_monthly: float
	usage_weekly: float
	workspace_id: str

class ApiKeyCreateRequest(TypedDict):
	disabled: NotRequired[bool]
	expires_at: NotRequired[Optional[str]]
	include_byok_in_limit: NotRequired[bool]
	limit: NotRequired[Optional[float]]
	limit_reset: NotRequired[Literal["daily", "weekly", "monthly"]]
	limits: NotRequired[ApiKeyLimitInputWindows]
	name: str
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]
	workspace_id: NotRequired[str]

class ApiKeyLimitBucket(TypedDict):
	cost: Optional[float]
	requests: Optional[int]

class ApiKeyLimitInputBucket(TypedDict):
	cost: NotRequired[Optional[float]]
	requests: NotRequired[Optional[int]]

class ApiKeyLimitInputWindows(TypedDict):
	daily: NotRequired[ApiKeyLimitInputBucket]
	monthly: NotRequired[ApiKeyLimitInputBucket]
	weekly: NotRequired[ApiKeyLimitInputBucket]

class ApiKeyLimitWindows(TypedDict):
	daily: ApiKeyLimitBucket
	monthly: ApiKeyLimitBucket
	weekly: ApiKeyLimitBucket

class ApiKeyListResponse(TypedDict):
	data: List[ApiKey]
	total_count: int

class ApiKeyResponse(TypedDict):
	data: ApiKey

class ApiKeyRotateRequest(TypedDict):
	name: NotRequired[str]
	previous_key_expires_at: NotRequired[Optional[str]]

class ApiKeyRotateResponse(TypedDict):
	data: ApiKeyWithValue
	previous_key_expires_at: Optional[str]

ApiKeyScopeValue = Union[str, List[str]]

class ApiKeyUpdateRequest(TypedDict):
	disabled: NotRequired[bool]
	expires_at: NotRequired[Optional[str]]
	include_byok_in_limit: NotRequired[bool]
	limit: NotRequired[Optional[float]]
	limit_reset: NotRequired[Literal["daily", "weekly", "monthly"]]
	limits: NotRequired[ApiKeyLimitInputWindows]
	name: NotRequired[str]
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]

class ApiKeyUsageBucket(TypedDict):
	cost: float
	requests: int

class ApiKeyUsageWindows(TypedDict):
	daily: ApiKeyUsageBucket
	monthly: ApiKeyUsageBucket
	total: ApiKeyUsageBucket
	weekly: ApiKeyUsageBucket

class ApiKeyWithValue(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	creator_user_id: Optional[str]
	disabled: bool
	expires_at: Optional[str]
	hash: str
	id: str
	include_byok_in_limit: bool
	key: str
	label: Optional[str]
	last_used_at: Optional[str]
	limit: Optional[float]
	limit_remaining: Optional[float]
	limit_reset: Optional[Literal["daily", "weekly", "monthly"]]
	limits: ApiKeyLimitWindows
	name: Optional[str]
	prefix: Optional[str]
	scopes: Union[str, List[str]]
	soft_blocked: bool
	status: Optional[str]
	updated_at: Optional[str]
	usage: float
	usage_daily: float
	usage_details: ApiKeyUsageWindows
	usage_monthly: float
	usage_weekly: float
	workspace_id: str

class ApiKeyWithValueResponse(TypedDict):
	data: ApiKeyWithValue

class AsyncJobWebSocketClientEvent(TypedDict):
	type: Literal["ping", "refresh"]

class AsyncJobWebSocketServerEvent(TypedDict):
	data: NotRequired[Optional[Union[VideoGenerationResponse, BatchResponse, Dict[str, Any]]]]
	type: Literal["job.snapshot", "job.updated", "job.deleted", "pong"]

class AsyncJobWebSocketUpgradeRequiredResponse(TypedDict):
	error: NotRequired[Dict[str, Any]]

class AsyncWebhookDeliveryAttempt(TypedDict):
	attempt_number: NotRequired[int]
	delivered_at: NotRequired[Optional[str]]
	delivery_key: NotRequired[str]
	error_message: NotRequired[Optional[str]]
	event_type: NotRequired[str]
	id: NotRequired[str]
	max_attempts: NotRequired[int]
	next_retry_at: NotRequired[Optional[str]]
	response_body_preview: NotRequired[Optional[str]]
	response_status: NotRequired[Optional[int]]
	status: NotRequired[Literal["delivered", "scheduled_retry", "failed_permanently"]]
	tried_at: NotRequired[str]

class AsyncWebhookDeliverySummary(TypedDict):
	delivered_event_types: NotRequired[List[str]]
	delivered_events: NotRequired[int]
	last_attempt_at: NotRequired[Optional[str]]
	last_attempt_status: NotRequired[Optional[Literal["delivered", "scheduled_retry", "failed_permanently"]]]
	last_delivered_at: NotRequired[Optional[str]]
	last_error_message: NotRequired[Optional[str]]
	last_failure_at: NotRequired[Optional[str]]
	last_response_status: NotRequired[Optional[int]]
	next_retry_at: NotRequired[Optional[str]]
	pending_retries: NotRequired[int]
	total_attempts: NotRequired[int]

class AsyncWebhookPublicState(TypedDict):
	attempts: NotRequired[List[AsyncWebhookDeliveryAttempt]]
	delivery: NotRequired[AsyncWebhookDeliverySummary]
	events: NotRequired[List[str]]
	has_secret: NotRequired[bool]
	url: NotRequired[Optional[str]]

class AudioContentPart(TypedDict):
	input_audio: Dict[str, Any]
	type: Literal["input_audio"]

class AudioSpeechRequest(TypedDict):
	format: NotRequired[Literal["mp3", "wav", "ogg", "aac"]]
	input: str
	model: str
	provider: NotRequired[ProviderRoutingOptions]
	voice: NotRequired[str]

class AudioTranscriptionRequest(TypedDict):
	audio_b64: NotRequired[str]
	audio_url: NotRequired[str]
	chunking_strategy: NotRequired[Union[Literal["auto"], Dict[str, Any]]]
	known_speaker_names: NotRequired[List[str]]
	known_speaker_references: NotRequired[List[str]]
	language: NotRequired[str]
	model: str
	provider: NotRequired[ProviderRoutingOptions]

class AudioTranscriptionResponse(TypedDict):
	text: NotRequired[str]

class AudioTranslationRequest(TypedDict):
	audio_b64: NotRequired[str]
	audio_url: NotRequired[str]
	language: NotRequired[str]
	model: str
	prompt: NotRequired[str]
	provider: NotRequired[ProviderRoutingOptions]
	temperature: NotRequired[float]

class AudioTranslationResponse(TypedDict):
	text: NotRequired[str]

class BatchBillingSummary(TypedDict):
	billed: NotRequired[bool]
	charged: NotRequired[bool]
	cost_nanos: NotRequired[Optional[int]]
	cost_usd: NotRequired[Optional[float]]
	currency: NotRequired[str]
	estimated_nanos: NotRequired[Optional[int]]
	estimated_provider_cost: NotRequired[Optional[str]]
	estimated_user_cost: NotRequired[Optional[str]]
	estimation_sample_size: NotRequired[Optional[int]]
	estimation_total_rows: NotRequired[Optional[int]]
	estimation_truncated: NotRequired[Optional[bool]]
	finalized_at: NotRequired[Optional[str]]
	pricing_breakdown: NotRequired[Dict[str, Any]]
	reason: NotRequired[str]
	reservation_id: NotRequired[Optional[str]]
	reservation_status: NotRequired[Optional[str]]
	reserved_nanos: NotRequired[Optional[int]]
	settled_provider_cost: NotRequired[Optional[str]]
	settled_user_cost: NotRequired[Optional[str]]
	state: NotRequired[Literal["pending", "estimated", "settled", "void"]]
	total_nanos: NotRequired[Optional[int]]

class BatchListResponse(TypedDict):
	data: NotRequired[List[BatchResponse]]
	first_id: NotRequired[Optional[str]]
	has_more: NotRequired[bool]
	last_id: NotRequired[Optional[str]]
	object: NotRequired[str]

class BatchModelCapability(TypedDict):
	input_types: NotRequired[List[str]]
	model: NotRequired[str]
	name: NotRequired[str]
	output_types: NotRequired[List[str]]
	pricing: NotRequired[Dict[str, Any]]
	providers: NotRequired[List[BatchModelProviderCapability]]
	status: NotRequired[str]
	supported_parameters: NotRequired[List[str]]
	supported_parameters_detail: NotRequired[SupportedParameterDetails]
	supported_params: NotRequired[List[str]]
	supported_params_detail: NotRequired[SupportedParameterDetails]

class BatchModelProviderCapability(TypedDict):
	id: NotRequired[str]
	supported_parameters: NotRequired[List[str]]
	supported_parameters_detail: NotRequired[SupportedParameterDetails]
	supported_params: NotRequired[List[str]]
	supported_params_detail: NotRequired[SupportedParameterDetails]

class BatchModelsResponse(TypedDict):
	data: NotRequired[List[BatchModelCapability]]
	object: NotRequired[str]

class BatchProviderCapability(TypedDict):
	documentation_url: NotRequired[str]
	endpoints: NotRequired[List[Dict[str, Any]]]
	gateway_input_modes: NotRequired[List[Literal["file", "requests"]]]
	id: NotRequired[str]
	name: NotRequired[str]
	native_input_modes: NotRequired[List[Literal["file", "requests"]]]
	notes: NotRequired[Optional[str]]
	status: NotRequired[Literal["active", "planned"]]

class BatchRequest(TypedDict):
	completion_window: NotRequired[str]
	debug: NotRequired[DebugOptions]
	endpoint: NotRequired[Literal["/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1/embeddings", "/v1/generateContent"]]
	input_file_id: NotRequired[str]
	items: NotRequired[List[Dict[str, Any]]]
	max_tokens: NotRequired[int]
	metadata: NotRequired[Dict[str, Any]]
	model: NotRequired[str]
	prompts: NotRequired[List[str]]
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[SupportedParameterDetails]
	requests: NotRequired[List[BatchRequestItem]]
	session_id: NotRequired[str]
	system: NotRequired[str]
	temperature: NotRequired[float]
	webhook: NotRequired[Dict[str, Any]]
	webhook_endpoint_id: NotRequired[str]

class BatchRequestCounts(TypedDict):
	completed: NotRequired[int]
	failed: NotRequired[int]
	total: NotRequired[int]

class BatchRequestItem(TypedDict):
	body: Dict[str, Any]
	custom_id: NotRequired[str]
	method: NotRequired[Literal["POST"]]
	url: NotRequired[str]

class BatchRequestRow(TypedDict):
	completed_at: NotRequired[Optional[str]]
	cost_nanos: NotRequired[Optional[int]]
	cost_usd: NotRequired[Optional[float]]
	created_at: NotRequired[Optional[str]]
	custom_id: NotRequired[str]
	endpoint: NotRequired[Optional[str]]
	error_body: NotRequired[Optional[Dict[str, Any]]]
	id: NotRequired[str]
	meta: NotRequired[Dict[str, Any]]
	method: NotRequired[Optional[str]]
	model: NotRequired[Optional[str]]
	native_batch_id: NotRequired[Optional[str]]
	provider: NotRequired[str]
	request_body_hash: NotRequired[Optional[str]]
	request_index: NotRequired[int]
	response_body: NotRequired[Optional[Dict[str, Any]]]
	response_status: NotRequired[Optional[int]]
	status: NotRequired[str]
	updated_at: NotRequired[Optional[str]]
	usage: NotRequired[Optional[Dict[str, Any]]]

class BatchResponse(TypedDict):
	billing: NotRequired[BatchBillingSummary]
	cancel_url: NotRequired[Optional[str]]
	cancelled_at: NotRequired[int]
	cancelling_at: NotRequired[int]
	completed_at: NotRequired[int]
	completion_window: NotRequired[str]
	created_at: NotRequired[int]
	endpoint: NotRequired[str]
	error_file_id: NotRequired[str]
	errors: NotRequired[Dict[str, Any]]
	expired_at: NotRequired[int]
	expires_at: NotRequired[int]
	failed_at: NotRequired[int]
	finalized_at: NotRequired[Optional[str]]
	finalizing_at: NotRequired[int]
	id: NotRequired[str]
	in_progress_at: NotRequired[int]
	input_file_id: NotRequired[str]
	last_webhook_dispatched_at: NotRequired[Optional[str]]
	last_webhook_progress: NotRequired[Optional[float]]
	last_webhook_progress_at: NotRequired[Optional[str]]
	lifecycle_status: NotRequired[Literal["pending", "running", "completed", "failed", "cancelled", "expired"]]
	metadata: NotRequired[Dict[str, Any]]
	native_batch_id: NotRequired[Optional[str]]
	next_webhook_retry_at: NotRequired[Optional[str]]
	object: NotRequired[str]
	output_file_id: NotRequired[str]
	polling_url: NotRequired[str]
	pricing_lines: NotRequired[List[OcrResponse]]
	progress: NotRequired[int]
	provider: NotRequired[str]
	request_counts: NotRequired[BatchRequestCounts]
	request_id: NotRequired[str]
	results_url: NotRequired[Optional[str]]
	session_id: NotRequired[str]
	status: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]
	webhook: NotRequired[AsyncWebhookPublicState]
	websocket_url: NotRequired[str]

BenchmarkId = Literal["2-bench-retail", "2-bench-telecom", "aa-briefcase", "aa-index", "aa-intelligence-index-v4", "aa-lcr", "aa-omniscience", "aa-t2v-rank", "ace-bench", "activitynet", "aethercode", "agents-last-exam", "agieval", "ai2-reasoning-challenge-(arc)", "ai2-sciarena", "ai2d", "aidanbench", "aider", "aider-polyglot", "aider-polyglot-edit", "aime", "aime-2024", "aime-2025", "aime-2026", "ainstein-bench", "aitz-em", "alignbench", "all-angles", "alpacaeval-2.0", "amc", "amc-2022-23", "android-control-high-em", "android-control-low-em", "androidworld", "androidworld-sr", "apex", "apex-agents", "apex-shortlist", "arc", "arc-agi", "arc-agi-1", "arc-agi-2", "arc-agi-3", "arc-c", "arc-e", "arcagi1-image", "arcagi2-image", "arena-chat-rank", "arena-hard", "arena-hard-v2", "arena-search-rank", "arkitscenes", "artifactsbench", "artificial-analysis", "attaq", "autologi", "automationbench", "babe", "babyvision", "babyvision-python", "balrog-ai", "bbh", "bcflv4", "beam128k", "beyondaime", "bfcl", "bfcl-overall-fc-v4", "bfcl-v2", "bfcl-v3", "bfcl-v3-multiturn", "bfcl-v4", "big-bench", "big-bench-extra-hard", "big-bench-hard", "bigcodebench", "biobench", "biolp-bench", "biomysterybench", "bird-sql-(dev)", "bixbench", "blink", "blueprint-bench-2", "boolq", "browsecomp", "browsecomp-long-128k", "browsecomp-long-256k", "browsecomp-long-context-128k", "browsecomp-long-context-256k", "browsecomp-vl", "browsecomp-zh", "c-eval", "cc-bench-v2-backend", "cc-bench-v2-frontend", "cc-bench-v2-repo", "cc-ocr", "cfeval", "cgbench", "charadessta", "chartqa", "chartqapro", "charxiv-d", "charxiv-dq", "charxiv-r", "charxiv-reasoning", "charxiv-rq", "charxiv-rq-python", "chest-imagenome-anatomy-iou", "chexpert-cxr-top5-macro-f1", "chinese-simpleqa", "ci-memories-coverage", "ci-memories-violation-rate", "cl-bench", "claw-eval", "cloningscenarios", "cluewsc", "cmath", "cmmlu", "cnmo-2024", "codeforces", "codeforces-no-tool", "codesimpleqa", "collie", "common-voice-15", "commonsenseqa", "complexfuncbench", "confabulations", "contphy", "corpusqa-1m", "countbench", "covost2", "covost2-en-zh", "creative-story-writing", "creative-writing-v3", "critpt", "crossvid", "crperelation", "crux-o", "cruxeval-o", "csimpleqa", "ct-dataset-1-macro-accuracy", "ctf-challenge-tasks", "cursorbench-3.1", "cxr14-3cond-macro-f1", "cybench", "cybergym", "cybersecurity-ctfs", "da-2k", "dailyomni", "deck-bench", "deep-planning", "deepconsult", "deepplanning-v1.1-avg-acc", "deepplanning-v1.1-shopping-case-acc", "deepplanning-v1.1-shopping-match-score", "deepplanning-v1.1-travel-case-acc", "deepplanning-v1.1-travel-comp-score", "deepplanning-v1.1-travel-cs-score", "deepplanning-v1.1-travel-ps-score", "deepresearchbench", "deepsearchqa", "deepswe", "der-2-bench", "design2code", "disco-x", "docvqa", "docvqatest", "drop", "ds-arena-code", "ds-fim-eval", "dsbench-fullstack", "dsbench-hard", "dubesor-llm", "dude", "dynamath", "egoschema", "egotempo", "elimination-game", "embspatialbench", "emma", "encyclo-k", "eq-bench", "eqbench", "erqa", "evalplus", "expert-swe", "exploitbench-cap", "eyepacs-accuracy", "facts", "facts-benchmark-suite", "facts-grounding", "facts-parametric", "factscore", "factscore-halluciation-rate", "fiction-live-bench", "figqa", "financeagent-v1.1", "financeagent-v2", "finsearchcomp", "finsearchcomp-t2-t3", "finsearchcomp-t3", "flame-vlm-code", "flenqa", "fleurs", "flteval", "flteval-pass-16", "flteval-pass-2", "flteval-pass-4", "flteval-pass-8", "frames", "frontier-math", "frontierbench-v0.1", "frontiercode-1.1-main", "frontiercode-diamond", "frontiermath", "frontiersci-olympiad", "frontiersci-research", "frontierswe", "fsc-147-down", "fullstackbench-en", "fullstackbench-zh", "functionalmath", "gaia2", "galileo-agent", "gdp-pdf", "gdpval-aa", "gdpval-mm", "genebench", "giantsteps-tempo", "global-mmlu-lite", "global-pica", "global-piqa", "govreport", "gpqa", "gpqa-diamond", "graphwalks-bfs->128k", "graphwalks-bfs-1m-f1", "graphwalks-bfs-256k-f1", "graphwalks-bfs-lt-128k", "graphwalks-parents->128k", "graphwalks-parents-1m-f1", "graphwalks-parents-256k-f1", "graphwalks-parents-lt-128k", "gsm8k", "gsm8k-chat", "hallusion-bench", "hallusionbench", "healthbench", "healthbench-concensus", "healthbench-hard", "healthbench-professional", "hellaswag", "hiddenmath", "hipho", "hle-no-tool-text-only", "hle-text", "hle-verified", "hle-vl", "hmmt-2025", "hmmt-2026-feb", "hmmt-feb-2025", "hmmt-feb-2026", "hmmt-feb-26", "hmmt-nov-2025", "hpct", "hr-bench-4k", "humaneval", "humaneval-average", "humaneval-mul", "humaneval+", "humanevalfim-average", "humanitys-last-exam", "humanitys-last-exam-tools", "hypersim", "if", "if-bench", "if-eval", "ifbench", "imagemining", "imoanswerbench", "imoanswerbench-no-tool", "include", "infographicsqa", "infovqa", "infovqatest", "instruct-humaneval", "intergps", "internal-api-instruction-following-(hard)", "inverse-ifeval", "investment-banking-modeling", "iq-bench", "ivebench-consistency-vs-kling-o1", "ivebench-consistency-vs-runway-aleph", "ivebench-instruction-following-vs-kling-o1", "ivebench-instruction-following-vs-runway-aleph", "ivebench-overall-vs-kling-o1", "ivebench-overall-vs-runway-aleph", "jobbench", "kimi-code-bench-2", "korbench", "lbpp-(v2)", "legal-agent-benchmark", "lingoqa", "lisanbench", "livebench", "livebench-20241125", "livecodebench", "livecodebench-coding", "livecodebench-pro", "livecodebench-v5", "livecodebench-v5-24.12-25.2", "livecodebench-v6", "livecodebench(01-09)", "livesports-3k", "lmarena-text", "lmarena-webdev", "logicvista", "longbench-v2", "longbench-v2-128k", "longcodebench-1m", "longdocurl", "longfact-concepts", "longfact-concepts-hallucination-rate", "longfact-objects", "longfact-objects-hallucination-rate", "longvideobench", "lpfqa", "lsat", "lvbench", "mars-bench", "mask", "math", "math-500", "matharena", "matharena-apex", "matharenaapex", "matharenaapex-shortlist", "mathcanvas", "mathkangaroo", "mathverse-mini", "mathvision", "mathvision-python", "mathvista", "mathvista-mini", "maxife", "mbct", "mbpp", "mbpp-evalplus", "mbpp+", "mc-bench", "mcp-mark", "medxpertqa", "medxpertqa-accuracy", "mega-mlqa", "mega-tydi-qa", "mega-udpos", "mega-xcopa", "mega-xstorycloze", "meld", "metr", "mewc", "mgsm", "miabench", "mimic-cxr-top5-macro-f1", "mimo-coding-bench", "minedojo-verified", "minerva", "misguided-attention", "mle-bench", "mle-bench-lite", "mls-bench-lite", "mlvu", "mlvu-m", "mm-browsecomp", "mm-browsercomp", "mm-clawbench", "mm-if-eval", "mm-mt-bench", "mmau", "mmau-music", "mmau-sound", "mmau-speech", "mmbench", "mmbench-test", "mmbench-v1.1", "mmbench-video", "mme", "mme-cc", "mme-realworld", "mmlongbench", "mmlongbench-doc", "mmlu", "mmlu-chat", "mmlu-french", "mmlu-multilingual", "mmlu-pro", "mmlu-prox", "mmlu-redux", "mmlu-redux-2.0", "mmlu-stem", "mmmlu", "mmmu", "mmmu-(val)", "mmmu-(validation)", "mmmu-pro", "mmmu-pro-python", "mmmuval", "mmsearch", "mmsearch-plus", "mmsibench-circular", "mmstar", "mmt-bench", "mmvet", "mmvetgpt4turbo", "mmvu", "mobileminiwob++-sr", "morse-500", "motionbench", "mrcr", "mrcr-1m", "mrcr-1m-(pointwise)", "mrcr-v2", "mrcr-v2-(8-needle)", "mrcr-v2-8-needle", "mri-dataset-1-macro-accuracy", "ms-cxr-t-macro-accuracy", "mt-bench", "mtvqa", "muirbench", "multi-challenge", "multi-if", "multi-swe-bench", "multichallenge-(o3-mini-grader)", "multilf", "multilingual-mmlu", "multiloko", "multipl-e", "musiccaps", "mvbench", "natural-questions", "natural2code", "nl2repo", "nl2repo-bench", "nl2repo-pass-1", "nmos", "nova-63", "nuscene", "nyt-connections", "objectron", "ocrbench", "ocrbench-v2", "ocrbench-v2-(en)", "ocrbench-v2-(zh)", "ocrbenchv2", "octocodingbench", "odinw", "odvbench", "officeqa", "officeqa-pro", "ojbench", "ojbench-cpp", "olympiadbench", "omnibench", "omnibench-music", "omnidocbench", "omnidocbench-1-5-down", "omnidocbench-1.5", "omnigaia", "omnimath", "openai-mrcr-2-needle-128k", "openai-mrcr-2-needle-256k", "openai-mrcr-8-needle-128k", "openai-mrcr-8-needle-1m", "openai-mrcr-v2-8-needle", "openai-mrcr:-2-needle-128k", "openai-mrcr:-2-needle-1m", "openbookqa", "openrca", "os-world", "osworld-2.0", "osworld-g", "osworld-verified", "ovbench", "ovobench", "paperbench", "pathmcqa-accuracy", "perceptionbench", "perceptiontest", "phibench", "phybench", "physicsfinals", "phyx-openended", "pinchbench", "piqa", "pmc-vqa", "point-bench", "pointgrounding", "polymath", "polymath-en", "pope", "popqa", "posttrain-bench", "procbench", "program-bench", "protocolqa", "protocolqa-percentage", "qasper", "qmsum", "qvhighlights", "realkie", "realworldqa", "refcoco-avg", "refspatialbench", "repobench", "repoqa", "researchrubrics", "robospatialhome", "ruler", "sat-math", "scale-mcp-atlas", "scale-multichallenge", "scicode", "scienceqa", "scienceqa-visual", "screenspot", "screenspot-pro", "seal-0", "seal-multichallenege", "seccodebench", "sfe", "sifo", "sifo-multiturn", "simplebench", "simpleqa", "simpleqa-verified", "simplevqa", "siren-agentdojo-attack-success-rate", "siren-agentdojo-utility", "skillsbench", "slake-closed-accuracy", "slake-tokenized-f1", "slakevqa", "smolagents-llm", "snake-bench", "social-iqa", "solo-bench", "spider", "spreadsheetbench-2", "spreadsheetbench-verified", "squality", "summscreenfd", "sunrgbd", "superchem-text-only", "superglue", "supergpqa", "swe-bench", "swe-bench-live", "swe-bench-multilingual", "swe-bench-multimodal", "swe-bench-pro", "swe-evo", "swe-lancer", "swe-marathon", "swe-perf", "swe-review", "swt-bench", "symflower-coding", "tau-2-airline", "tau-2-bench", "tau-2-retail", "tau-2-telecom", "tau-bench", "tau-bench-airline", "tau-bench-retail", "tau2-airline", "tau3-bench", "tempcompass", "terminal-bench", "terminal-bench-2.0", "terminal-bench-2.1", "terminal-bench-hard", "textvqa", "thematic-generalisation", "theoremqa", "thinking-with-tracking", "tir-bench", "tomato", "tool-decathlon", "toolathlon", "treebench", "triviaqa", "truthfulqa", "tvbench", "tydiqa", "uniform-bar-exam", "us-dermmcqa-accuracy", "usamo-2025", "usamo-2026", "usamo25", "v-star", "vcr-en-easy", "vct", "vct-percentage", "vending-bench-2", "vibe", "vibe-android", "vibe-backend", "vibe-eval", "vibe-ios", "vibe-pro", "vibe-simulation", "vibe-web", "vibeeval", "video-mme", "video-mmmu", "videoeval-pro", "videoholmes", "videomme", "videomme-w-o-sub.", "videomme-w-sub.", "videoreasonbench", "videosimpleqa", "visfactor", "vision2web", "vispeak", "vistra-metricx", "visulogic", "vita-bench", "vitabench", "viverbench", "vlmsarebiased", "vlmsareblind", "vocalsound", "voicebench-avg", "vpct", "vqa-rad-closed-accuracy", "vqa-rad-tokenized-f1", "vqav2", "vqav2-(test)", "we-math", "webvoyager", "weirdml", "wide-search", "widesearch", "wildbench", "wildclawbench", "winogrande", "wmdp", "wmdp-bio", "wmdp-chem", "wmt23", "wmt24++", "wmt24pp-comet", "wmt24pp-metricx", "wmt25-mqm", "worldvqa", "writingbench", "wsi-path-rouge", "xlang-agent", "xlrs-bench-macro", "xlsum-english", "xstest", "zclawbench", "zebralogic", "zerobench", "zerobench-main", "zerobench-main-python", "zerobench-sub"]

class CacheControl(TypedDict):
	scope: NotRequired[str]
	ttl: NotRequired[str]
	type: NotRequired[str]

class ChatAudioOutputPart(TypedDict):
	audio_url: Dict[str, Any]
	format: NotRequired[Literal["wav", "mp3", "flac", "m4a", "ogg", "pcm16", "pcm24"]]
	mime_type: NotRequired[str]
	type: Literal["audio_url"]

class ChatChoice(TypedDict):
	finish_reason: NotRequired[Literal["stop", "length", "tool_calls", "content_filter"]]
	index: NotRequired[int]
	message: NotRequired[ChatMessage]

class ChatCompletionsRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	echo_upstream_request: NotRequired[bool]
	frequency_penalty: NotRequired[float]
	image_config: NotRequired[ImageConfig]
	logit_bias: NotRequired[Dict[str, Any]]
	logprobs: NotRequired[bool]
	max_completion_tokens: NotRequired[int]
	max_tokens: NotRequired[int]
	max_tool_calls: NotRequired[int]
	messages: List[ChatMessage]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	modalities: NotRequired[List[Literal["text", "image", "audio"]]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	presence_penalty: NotRequired[float]
	prompt_cache_key: NotRequired[Optional[str]]
	provider: NotRequired[Union[Literal["openai", "anthropic", "google-ai-studio", "gemini", "mistral", "x-ai", "xai", "groq", "together"], ProviderRoutingOptions]]
	provider_options: NotRequired[ProviderOptions]
	reasoning: NotRequired[ReasoningConfig]
	reasoning_effort: NotRequired[Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]]
	response_format: NotRequired[Union[str, Dict[str, Any]]]
	safety_identifier: NotRequired[Optional[str]]
	seed: NotRequired[int]
	service_tier: NotRequired[Literal["standard", "fast", "priority", "flex", "batch"]]
	session_id: NotRequired[str]
	stop: NotRequired[Union[str, List[str]]]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	stream_options: NotRequired[Dict[str, Any]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[Literal["auto", "none", "required", "phaseo:datetime", "phaseo:web_search", "phaseo:web_fetch", "phaseo:subagent", "phaseo:fusion", "phaseo:search_models", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]]
	tools: NotRequired[List[Union[FunctionToolDefinition, GatewayDatetimeToolDefinition, GatewayWebSearchToolDefinition, GatewayWebFetchToolDefinition, SubagentToolDefinition, FusionToolDefinition, SearchModelsToolDefinition]]]
	top_logprobs: NotRequired[int]
	top_p: NotRequired[float]
	usage: NotRequired[bool]
	user: NotRequired[str]
	user_id: NotRequired[str]

class ChatCompletionsResponse(TypedDict):
	choices: NotRequired[List[ChatChoice]]
	created: NotRequired[int]
	id: NotRequired[str]
	model: NotRequired[str]
	nativeResponseId: NotRequired[Optional[str]]
	object: NotRequired[str]
	provider: NotRequired[str]
	usage: NotRequired[Usage]

class ChatImageOutputPart(TypedDict):
	image_url: Dict[str, Any]
	mime_type: NotRequired[str]
	type: Literal["image_url"]

class ChatMessage(TypedDict):
	audios: NotRequired[List[ChatAudioOutputPart]]
	content: NotRequired[Union[str, List[Union[Dict[str, Any], Dict[str, Any], AudioContentPart, VideoContentPart, ToolCallContentPart]]]]
	images: NotRequired[List[ChatImageOutputPart]]
	name: NotRequired[str]
	role: Literal["system", "developer", "user", "assistant", "tool"]
	tool_call_id: NotRequired[str]
	tool_calls: NotRequired[List[ToolCall]]

class CreditsResponse(TypedDict):
	credits: Dict[str, Any]
	ok: Literal[true]

class DataContributionCategories(TypedDict):
	pass

class DataContributionClassifier(TypedDict):
	categories: DataContributionCategories
	created_at: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	enabled: bool
	id: str
	instructions: str
	kind: Literal["starter", "custom"]
	model: str
	name: str
	sample_rate_bps: int
	service_tier: Literal["standard", "flex"]
	slug: str
	updated_at: NotRequired[Optional[str]]

class DataContributionClassifierCreateRequest(TypedDict):
	categories: DataContributionCategories
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	instructions: str
	model: NotRequired[str]
	name: str
	sampleRateBps: NotRequired[int]
	serviceTier: NotRequired[Literal["standard", "flex"]]
	slug: NotRequired[str]

class DataContributionClassifierDeleteResponse(TypedDict):
	data: Dict[str, Any]

class DataContributionClassifierInput(TypedDict):
	categories: NotRequired[DataContributionCategories]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	instructions: NotRequired[str]
	model: NotRequired[str]
	name: NotRequired[str]
	sampleRateBps: NotRequired[int]
	serviceTier: NotRequired[Literal["standard", "flex"]]

class DataContributionClassifierResponse(TypedDict):
	data: DataContributionClassifier

class DataContributionClassifierUpdateRequest(TypedDict):
	categories: NotRequired[DataContributionCategories]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	instructions: NotRequired[str]
	model: NotRequired[str]
	name: NotRequired[str]
	sampleRateBps: NotRequired[int]
	serviceTier: NotRequired[Literal["standard", "flex"]]

class DataContributionConsentRequest(TypedDict):
	enabled: bool
	reason: NotRequired[str]

class DataContributionConsentResponse(TypedDict):
	data: Dict[str, Any]

class DataContributionOverviewResponse(TypedDict):
	data: Dict[str, Any]

class DataModel(TypedDict):
	deprecation_date: NotRequired[Optional[str]]
	hidden: NotRequired[bool]
	input_types: NotRequired[List[str]]
	lifecycle: NotRequired[ModelLifecycle]
	model_id: NotRequired[Optional[str]]
	name: NotRequired[Optional[str]]
	organisation: NotRequired[Optional[Dict[str, Any]]]
	output_types: NotRequired[List[str]]
	release_date: NotRequired[Optional[str]]
	retirement_date: NotRequired[Optional[str]]
	status: NotRequired[Optional[str]]

DataModelOrganisation = Optional[Dict[str, Any]]

class DebugOptions(TypedDict):
	enabled: NotRequired[bool]
	return_upstream_request: NotRequired[bool]
	return_upstream_response: NotRequired[bool]
	trace: NotRequired[bool]
	trace_level: NotRequired[Literal["summary", "full"]]

class DeletedResponse(TypedDict):
	deleted: Literal[true]

class DynamicRoute(TypedDict):
	config: DynamicRouteConfig
	created_at: NotRequired[Optional[str]]
	deployed_version: NotRequired[Optional[int]]
	description: NotRequired[Optional[str]]
	id: str
	key_ids: List[str]
	name: str
	slug: str
	status: Literal["active", "paused"]
	updated_at: NotRequired[Optional[str]]
	version: int
	versions: List[DynamicRouteVersion]
	workspace_id: str

class DynamicRouteAction(TypedDict):
	allowFallbacks: NotRequired[bool]
	model: NotRequired[str]
	modelFallbacks: NotRequired[List[str]]
	providerIgnore: NotRequired[List[str]]
	providerOnly: NotRequired[List[str]]
	providerOrder: NotRequired[List[str]]
	routingMode: NotRequired[Literal["balanced", "price", "latency", "throughput"]]

class DynamicRouteCondition(TypedDict):
	field: Literal["always", "endpoint", "model", "session_id", "metadata"]
	metadataKey: NotRequired[Optional[str]]
	operator: Literal["equals", "not_equals", "contains", "starts_with", "exists"]
	value: NotRequired[Optional[str]]

class DynamicRouteConfig(TypedDict):
	cacheAwareRouting: NotRequired[bool]
	defaultAction: NotRequired[DynamicRouteAction]
	edges: NotRequired[List[DynamicRouteEdge]]
	entryNodeId: NotRequired[Optional[str]]
	nodes: NotRequired[List[DynamicRouteNode]]
	rules: NotRequired[List[DynamicRouteRule]]
	schemaVersion: NotRequired[Literal[2]]
	sessionAffinity: NotRequired[bool]

class DynamicRouteCreateRequest(TypedDict):
	config: DynamicRouteConfig
	description: NotRequired[Optional[str]]
	name: str
	slug: NotRequired[str]
	status: NotRequired[Literal["active", "paused"]]

class DynamicRouteDeleteResponse(TypedDict):
	data: Dict[str, Any]

class DynamicRouteDeployResponse(TypedDict):
	data: Dict[str, Any]

class DynamicRouteEdge(TypedDict):
	id: str
	source: str
	sourceHandle: NotRequired[Optional[str]]
	target: str

class DynamicRouteKeysResponse(TypedDict):
	data: Dict[str, Any]

class DynamicRouteKeysUpdateRequest(TypedDict):
	key_ids: List[str]

class DynamicRouteListResponse(TypedDict):
	data: List[DynamicRoute]
	total_count: int

class DynamicRouteNode(TypedDict):
	data: Dict[str, Any]
	id: str
	position: NotRequired[Optional[Dict[str, Any]]]
	type: Literal["start", "condition", "percentage", "model", "rate_limit", "budget_limit", "end"]

class DynamicRouteResponse(TypedDict):
	data: DynamicRoute

class DynamicRouteRule(TypedDict):
	action: DynamicRouteAction
	condition: DynamicRouteCondition
	enabled: bool
	id: str
	name: str

class DynamicRouteUpdateRequest(TypedDict):
	config: NotRequired[DynamicRouteConfig]
	description: NotRequired[Optional[str]]
	name: NotRequired[str]
	status: NotRequired[Literal["active", "paused"]]

class DynamicRouteVersion(TypedDict):
	created_at: NotRequired[Optional[str]]
	created_by: NotRequired[Optional[str]]
	status: Literal["draft", "deployed", "superseded"]
	version: int

class Embedding(TypedDict):
	embedding: NotRequired[List[float]]
	index: NotRequired[int]
	object: NotRequired[str]

class EmbeddingsMultimodalInput(TypedDict):
	content: List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]

class EmbeddingsRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	dimensions: NotRequired[int]
	encoding_format: NotRequired[Literal["float", "base64"]]
	input: Union[str, List[int], EmbeddingsMultimodalInput, List[Union[str, List[int], EmbeddingsMultimodalInput]]]
	model: str
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[Dict[str, Any]]
	user: NotRequired[str]

class EmbeddingsResponse(TypedDict):
	data: NotRequired[List[Embedding]]
	model: NotRequired[str]
	object: NotRequired[str]
	usage: NotRequired[Usage]

class EndpointCatalogueEntry(TypedDict):
	capability_id: str
	collection: str
	id: str
	model_count: int
	provider_count: int
	public_path: str

class EndpointCatalogueResponse(TypedDict):
	data: List[EndpointCatalogueEntry]
	endpoints: List[str]
	ok: Literal[true]
	sample_models: List[str]

class ErrorFailureSampleItem(TypedDict):
	provider: NotRequired[Optional[str]]
	retryable: NotRequired[Optional[bool]]
	status: NotRequired[Optional[int]]
	type: NotRequired[Optional[str]]
	upstream_error_code: NotRequired[Optional[str]]
	upstream_error_description: NotRequired[Optional[str]]
	upstream_error_message: NotRequired[Optional[str]]
	upstream_error_param: NotRequired[Optional[str]]
	upstream_payload_preview: NotRequired[Optional[str]]

class ErrorProviderCandidateDiagnostics(TypedDict):
	candidateCount: NotRequired[int]
	droppedMissingAdapter: NotRequired[List[Dict[str, Any]]]
	droppedUnsupportedEndpoint: NotRequired[List[str]]
	supportsEndpointCount: NotRequired[int]
	totalProviders: NotRequired[int]

class ErrorProviderEnablementDiagnostics(TypedDict):
	capability: NotRequired[str]
	dropped: NotRequired[List[Dict[str, Any]]]
	providersAfter: NotRequired[List[str]]
	providersBefore: NotRequired[List[str]]

class ErrorProviderFailureDiagnostics(TypedDict):
	category: NotRequired[Literal["credentials_not_configured", "credentials_invalid_or_forbidden", "provider_access_missing", "region_or_project_restriction", "model_unavailable_for_endpoint", "rate_limited", "server_error"]]
	hint: NotRequired[str]
	provider: NotRequired[Optional[str]]

class ErrorResponse(TypedDict):
	attempt_count: NotRequired[int]
	description: NotRequired[str]
	details: NotRequired[List[OcrResponse]]
	error: Union[str, OcrResponse]
	error_origin: NotRequired[Literal["user", "gateway", "upstream"]]
	error_type: NotRequired[Literal["user", "system"]]
	failed_providers: NotRequired[List[str]]
	failed_statuses: NotRequired[List[int]]
	failure_sample: NotRequired[List[ErrorFailureSampleItem]]
	generation_id: NotRequired[str]
	message: NotRequired[str]
	missing_pricing_providers: NotRequired[List[str]]
	ok: NotRequired[bool]
	provider_candidate_diagnostics: NotRequired[ErrorProviderCandidateDiagnostics]
	provider_enablement: NotRequired[ErrorProviderEnablementDiagnostics]
	provider_failure_diagnostics: NotRequired[ErrorProviderFailureDiagnostics]
	provider_payment_required_provider: NotRequired[str]
	provider_payment_required_support_notice: NotRequired[str]
	reason: NotRequired[str]
	routing_diagnostics: NotRequired[ErrorRoutingDiagnostics]
	status_code: NotRequired[int]
	upstream_error: NotRequired[ErrorUpstreamError]

class ErrorRoutingDiagnostics(TypedDict):
	filterStages: NotRequired[List[Dict[str, Any]]]

class ErrorUpstreamError(TypedDict):
	code: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	message: NotRequired[Optional[str]]
	param: NotRequired[Optional[str]]

class FileResponse(TypedDict):
	bytes: NotRequired[int]
	created_at: NotRequired[int]
	filename: NotRequired[str]
	id: NotRequired[str]
	object: NotRequired[str]
	purpose: NotRequired[str]
	status: NotRequired[str]
	status_details: NotRequired[Dict[str, Any]]

class FileUploadRequest(TypedDict):
	file: Any
	purpose: str

FunctionToolDefinition = TypedDict("FunctionToolDefinition", {
	"async": NotRequired[bool],
	"function": Dict[str, Any],
	"type": Literal["function"],
})

class FusionToolDefinition(TypedDict):
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["phaseo:fusion"]

class GatewayCapabilities(TypedDict):
	endpoints: NotRequired[List[str]]
	parameter_details: SupportedParameterDetails
	parameters: List[str]

GatewayCapabilityStatus = Literal["active", "coming_soon", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled", "internal_testing"]

class GatewayDatetimeToolDefinition(TypedDict):
	parameters: NotRequired[Dict[str, Any]]
	timezone: NotRequired[str]
	type: Literal["phaseo:datetime", "gateway:datetime"]

class GatewayFeedback(TypedDict):
	comment: Optional[str]
	created_at: str
	created_by_user_id: Optional[str]
	end_user_id: Optional[str]
	id: str
	metadata: Dict[str, Any]
	metadata_dimensions: Dict[str, Any]
	preset_id: Optional[str]
	rating: Optional[str]
	reason: Optional[str]
	reason_tags: List[str]
	request_id: Optional[str]
	score: Optional[float]
	session_id: Optional[str]
	source: Literal["api", "user", "system", "import", "test"]
	test_run_id: Optional[str]
	workspace_id: str

class GatewayFeedbackCreateRequest(TypedDict):
	comment: NotRequired[str]
	end_user_id: NotRequired[str]
	metadata: NotRequired[Dict[str, Any]]
	metadata_dimensions: NotRequired[Dict[str, Any]]
	preset_id: NotRequired[str]
	rating: NotRequired[str]
	reason: NotRequired[str]
	reason_tags: NotRequired[List[str]]
	request_id: NotRequired[str]
	score: NotRequired[float]
	session_id: NotRequired[str]
	source: NotRequired[Literal["api", "user", "system", "import", "test"]]
	test_run_id: NotRequired[str]

class GatewayFeedbackListResponse(TypedDict):
	data: List[GatewayFeedback]

class GatewayFeedbackResponse(TypedDict):
	data: GatewayFeedback

class GatewayFeedbackSummaryResponse(TypedDict):
	data: List[GatewayFeedbackSummaryRow]
	group_by: Literal["preset_id", "test_run_id", "metadata"]

class GatewayFeedbackSummaryRow(TypedDict):
	average_score: Optional[float]
	count: int
	last_feedback_at: Optional[str]
	metadata_key: NotRequired[str]
	metadata_value: NotRequired[Optional[str]]
	negative: int
	partial: int
	positive: int
	preset_id: NotRequired[Optional[str]]
	ratings: Dict[str, Any]
	test_run_id: NotRequired[Optional[str]]

class GatewayModalities(TypedDict):
	input: List[str]
	output: List[str]

class GatewayModelLifecycle(TypedDict):
	deprecated_at: Optional[str]
	message: Optional[str]
	released_at: Optional[str]
	replacement_id: Optional[str]
	retires_at: Optional[str]
	status: Optional[Literal["active", "deprecated", "retired"]]

class GatewayModelLimits(TypedDict):
	input_tokens: Optional[int]
	output_tokens: Optional[int]

class GatewayModelOffer(TypedDict):
	capabilities: GatewayCapabilities
	effective: Dict[str, Any]
	endpoints: List[str]
	modalities: GatewayModalities
	model: Optional[str]
	pricing: GatewayPricing
	provider: Dict[str, Any]
	routable: bool
	routing: Dict[str, Any]
	status: Literal["active", "coming_soon", "inactive"]
	status_reason: Literal["active", "preview_only", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "internal_testing", "scheduled", "coming_soon", "provider_disabled", "model_disabled", "capability_disabled", "provider_not_ready", "provider_inactive", "inactive", "retired"]

GatewayModelOrganization = Optional[Dict[str, Any]]

class GatewayModelsResponse(TypedDict):
	availability_mode: Literal["active", "all"]
	limit: int
	models: List[Model]
	offset: int
	ok: bool
	total: int

class GatewayObservabilityEvent(TypedDict):
	category: Literal["feedback", "behavior", "outcome", "app", "test", "custom"]
	created_at: str
	created_by_user_id: Optional[str]
	end_user_id: Optional[str]
	event_name: str
	id: str
	metadata: Dict[str, Any]
	metadata_dimensions: Dict[str, Any]
	numeric_value: Optional[float]
	occurred_at: str
	preset_id: Optional[str]
	request_id: Optional[str]
	session_id: Optional[str]
	source: Literal["api", "user", "system", "import", "test"]
	test_run_id: Optional[str]
	value: Optional[Any]
	workspace_id: str

class GatewayObservabilityEventCreateRequest(TypedDict):
	category: NotRequired[Literal["feedback", "behavior", "outcome", "app", "test", "custom"]]
	end_user_id: NotRequired[str]
	event_name: str
	metadata: NotRequired[Dict[str, Any]]
	metadata_dimensions: NotRequired[Dict[str, Any]]
	numeric_value: NotRequired[float]
	occurred_at: NotRequired[str]
	preset_id: NotRequired[str]
	request_id: NotRequired[str]
	session_id: NotRequired[str]
	source: NotRequired[Literal["api", "user", "system", "import", "test"]]
	test_run_id: NotRequired[str]
	value: NotRequired[Any]

class GatewayObservabilityEventListResponse(TypedDict):
	data: List[GatewayObservabilityEvent]

class GatewayObservabilityEventResponse(TypedDict):
	data: GatewayObservabilityEvent

class GatewayPricing(TypedDict):
	meters: Dict[str, Any]
	pricing_plan: Literal["standard"]

GatewayPricingMeter = Optional[Dict[str, Any]]

GatewayProviderAvailabilityReason = Literal["active", "preview_only", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "internal_testing", "scheduled", "coming_soon", "provider_disabled", "model_disabled", "capability_disabled", "provider_not_ready", "provider_inactive", "inactive", "retired"]

class GatewayRequestLog(TypedDict):
	auth_method: NotRequired[Optional[str]]
	byok: NotRequired[Optional[bool]]
	canonical_model_id: NotRequired[Optional[str]]
	cost_nanos: NotRequired[Optional[int]]
	created_at: NotRequired[str]
	currency: NotRequired[Optional[str]]
	endpoint: NotRequired[Optional[str]]
	error_code: NotRequired[Optional[str]]
	finish_reason: NotRequired[Optional[str]]
	generation_ms: NotRequired[Optional[float]]
	key_id: NotRequired[Optional[str]]
	latency_ms: NotRequired[Optional[float]]
	location: NotRequired[Optional[str]]
	model_id: NotRequired[Optional[str]]
	native_response_id: NotRequired[Optional[str]]
	oauth_client_id: NotRequired[Optional[str]]
	pricing_lines: NotRequired[Optional[List[Dict[str, Any]]]]
	provider: NotRequired[Optional[str]]
	request_id: NotRequired[str]
	requested_model_id: NotRequired[Optional[str]]
	routed_model_id: NotRequired[Optional[str]]
	status_code: NotRequired[Optional[int]]
	stream: NotRequired[Optional[bool]]
	success: NotRequired[Optional[bool]]
	throughput: NotRequired[Optional[float]]
	usage: NotRequired[Optional[Dict[str, Any]]]

class GatewayRequestLogListResponse(TypedDict):
	data: List[GatewayRequestLog]
	from_time: str
	limit: int
	offset: int
	ok: Literal[true]
	to_time: Optional[str]
	total: int

class GatewayRequestLogResponse(TypedDict):
	data: GatewayRequestLog
	ok: Literal[true]

GatewayRoutingStatus = Literal["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled"]

class GatewayWebFetchToolDefinition(TypedDict):
	max_chars: NotRequired[int]
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["phaseo:web_fetch", "gateway:web_fetch"]

class GatewayWebSearchToolDefinition(TypedDict):
	engine: NotRequired[Literal["auto", "native", "exa", "firecrawl", "parallel", "perplexity", "tinyfish"]]
	include_highlights: NotRequired[bool]
	include_text: NotRequired[bool]
	language: NotRequired[str]
	max_results: NotRequired[int]
	page: NotRequired[int]
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["phaseo:web_search", "gateway:web_search"]

class GenerationResponse(TypedDict):
	app_id: NotRequired[Optional[str]]
	byok: NotRequired[bool]
	cost_nanos: NotRequired[float]
	created_at: NotRequired[str]
	currency: NotRequired[str]
	endpoint: NotRequired[str]
	error_code: NotRequired[Optional[str]]
	error_message: NotRequired[Optional[str]]
	generation_ms: NotRequired[float]
	key_id: NotRequired[str]
	latency_ms: NotRequired[float]
	model_id: NotRequired[str]
	native_response_id: NotRequired[Optional[str]]
	pricing_lines: NotRequired[List[Dict[str, Any]]]
	provider: NotRequired[str]
	replay_request: NotRequired[Optional[OcrResponse]]
	replay_supported: NotRequired[bool]
	request_id: NotRequired[str]
	status_code: NotRequired[float]
	stream: NotRequired[bool]
	success: NotRequired[bool]
	team_id: NotRequired[str]
	throughput: NotRequired[Optional[float]]
	usage: NotRequired[Optional[Dict[str, Any]]]

class Guardrail(TypedDict):
	allowed_api_model_ids: NotRequired[Optional[List[str]]]
	created_at: NotRequired[Optional[str]]
	daily_limit_cost_nanos: NotRequired[Optional[int]]
	daily_limit_requests: NotRequired[Optional[int]]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[Optional[bool]]
	id: str
	model_restriction_mode: NotRequired[Optional[Literal["none", "allowlist", "blocklist"]]]
	monthly_limit_cost_nanos: NotRequired[Optional[int]]
	monthly_limit_requests: NotRequired[Optional[int]]
	name: str
	privacy_enable_free_may_publish_prompts: NotRequired[Optional[bool]]
	privacy_enable_free_may_train: NotRequired[Optional[bool]]
	privacy_enable_input_output_logging: NotRequired[Optional[bool]]
	privacy_enable_paid_may_train: NotRequired[Optional[bool]]
	privacy_zdr_only: NotRequired[Optional[bool]]
	prompt_injection_action: NotRequired[Optional[Literal["flag", "block"]]]
	prompt_injection_enabled: NotRequired[Optional[bool]]
	provider_restriction_enforce_allowed: NotRequired[Optional[bool]]
	provider_restriction_mode: NotRequired[Optional[Literal["none", "allowlist", "blocklist"]]]
	provider_restriction_provider_ids: NotRequired[Optional[List[str]]]
	sensitive_info_default_action: NotRequired[Optional[Literal["flag", "redact", "block"]]]
	sensitive_info_enabled: NotRequired[Optional[bool]]
	sensitive_info_rules: NotRequired[Optional[List[Dict[str, Any]]]]
	updated_at: NotRequired[Optional[str]]
	weekly_limit_cost_nanos: NotRequired[Optional[int]]
	weekly_limit_requests: NotRequired[Optional[int]]
	workspace_id: str

class GuardrailBudgetInput(TypedDict):
	dailyCostNanos: NotRequired[Optional[int]]
	dailyRequests: NotRequired[Optional[int]]
	monthlyCostNanos: NotRequired[Optional[int]]
	monthlyRequests: NotRequired[Optional[int]]
	weeklyCostNanos: NotRequired[Optional[int]]
	weeklyRequests: NotRequired[Optional[int]]

class GuardrailCreateRequest(TypedDict):
	allowedApiModelIds: NotRequired[List[str]]
	budgets: NotRequired[GuardrailBudgetInput]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	modelRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	name: str
	privacyEnableFreeMayPublishPrompts: NotRequired[Optional[bool]]
	privacyEnableFreeMayTrain: NotRequired[Optional[bool]]
	privacyEnableInputOutputLogging: NotRequired[Optional[bool]]
	privacyEnablePaidMayTrain: NotRequired[Optional[bool]]
	privacyZdrOnly: NotRequired[Optional[bool]]
	promptInjectionAction: NotRequired[Literal["flag", "block"]]
	promptInjectionEnabled: NotRequired[bool]
	providerRestrictionEnforceAllowed: NotRequired[bool]
	providerRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	providerRestrictionProviderIds: NotRequired[List[str]]
	sensitiveInfoDefaultAction: NotRequired[Literal["flag", "redact", "block"]]
	sensitiveInfoEnabled: NotRequired[bool]
	sensitiveInfoRules: NotRequired[List[Dict[str, Any]]]

class GuardrailDeleteResponse(TypedDict):
	deleted: Literal[true]

class GuardrailDetailResponse(TypedDict):
	data: Dict[str, Any]

class GuardrailKeyAddResponse(TypedDict):
	added_count: int
	data: List[GuardrailKeyAssignment]

class GuardrailKeyAssignment(TypedDict):
	created_at: NotRequired[Optional[str]]
	key_id: str
	name: NotRequired[Optional[str]]
	prefix: NotRequired[Optional[str]]
	status: NotRequired[Optional[str]]

class GuardrailKeyIdsReplaceRequest(TypedDict):
	key_ids: List[str]

class GuardrailKeyIdsRequest(TypedDict):
	key_ids: List[str]

class GuardrailKeyListResponse(TypedDict):
	data: List[GuardrailKeyAssignment]
	total_count: int

class GuardrailKeySetResponse(TypedDict):
	data: Dict[str, Any]

class GuardrailListResponse(TypedDict):
	data: List[Guardrail]
	total_count: int

class GuardrailMemberAddResponse(TypedDict):
	added_count: int
	data: List[GuardrailMemberAssignment]

class GuardrailMemberAssignment(TypedDict):
	display_name: NotRequired[Optional[str]]
	joined_at: NotRequired[Optional[str]]
	role: NotRequired[Optional[str]]
	user_id: str

class GuardrailMemberListResponse(TypedDict):
	data: List[GuardrailMemberAssignment]
	total_count: int

class GuardrailPolicyInput(TypedDict):
	allowedApiModelIds: NotRequired[List[str]]
	budgets: NotRequired[GuardrailBudgetInput]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	modelRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	name: NotRequired[str]
	privacyEnableFreeMayPublishPrompts: NotRequired[Optional[bool]]
	privacyEnableFreeMayTrain: NotRequired[Optional[bool]]
	privacyEnableInputOutputLogging: NotRequired[Optional[bool]]
	privacyEnablePaidMayTrain: NotRequired[Optional[bool]]
	privacyZdrOnly: NotRequired[Optional[bool]]
	promptInjectionAction: NotRequired[Literal["flag", "block"]]
	promptInjectionEnabled: NotRequired[bool]
	providerRestrictionEnforceAllowed: NotRequired[bool]
	providerRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	providerRestrictionProviderIds: NotRequired[List[str]]
	sensitiveInfoDefaultAction: NotRequired[Literal["flag", "redact", "block"]]
	sensitiveInfoEnabled: NotRequired[bool]
	sensitiveInfoRules: NotRequired[List[Dict[str, Any]]]

class GuardrailRemoveResponse(TypedDict):
	removed_count: int

class GuardrailResponse(TypedDict):
	data: Guardrail

class GuardrailUpdateRequest(TypedDict):
	allowedApiModelIds: NotRequired[List[str]]
	budgets: NotRequired[GuardrailBudgetInput]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	modelRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	name: NotRequired[str]
	privacyEnableFreeMayPublishPrompts: NotRequired[Optional[bool]]
	privacyEnableFreeMayTrain: NotRequired[Optional[bool]]
	privacyEnableInputOutputLogging: NotRequired[Optional[bool]]
	privacyEnablePaidMayTrain: NotRequired[Optional[bool]]
	privacyZdrOnly: NotRequired[Optional[bool]]
	promptInjectionAction: NotRequired[Literal["flag", "block"]]
	promptInjectionEnabled: NotRequired[bool]
	providerRestrictionEnforceAllowed: NotRequired[bool]
	providerRestrictionMode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	providerRestrictionProviderIds: NotRequired[List[str]]
	sensitiveInfoDefaultAction: NotRequired[Literal["flag", "redact", "block"]]
	sensitiveInfoEnabled: NotRequired[bool]
	sensitiveInfoRules: NotRequired[List[Dict[str, Any]]]

class GuardrailUserIdsRequest(TypedDict):
	user_ids: List[str]

class Image(TypedDict):
	b64_json: NotRequired[str]
	revised_prompt: NotRequired[str]
	url: NotRequired[str]

class ImageConfig(TypedDict):
	aspect_ratio: NotRequired[str]
	font_inputs: NotRequired[List[Dict[str, Any]]]
	image_size: NotRequired[Literal["0.5K", "1K", "2K", "4K"]]
	include_rai_reason: NotRequired[bool]
	reference_images: NotRequired[List[PresetConfig]]
	super_resolution_references: NotRequired[List[str]]

class ImageContentPart(TypedDict):
	image_url: Dict[str, Any]
	type: Literal["image_url"]

class ImageModerationInput(TypedDict):
	image_url: Dict[str, Any]
	type: Literal["image_url"]

class ImagesEditRequest(TypedDict):
	image: str
	mask: NotRequired[str]
	meta: NotRequired[bool]
	model: str
	n: NotRequired[int]
	prompt: str
	provider: NotRequired[ProviderRoutingOptions]
	resolution: NotRequired[str]
	size: NotRequired[str]
	usage: NotRequired[bool]
	user: NotRequired[str]

class ImagesEditResponse(TypedDict):
	created: NotRequired[int]
	data: NotRequired[List[Image]]

class ImagesGenerationRequest(TypedDict):
	model: str
	n: NotRequired[int]
	prompt: str
	provider: NotRequired[ProviderRoutingOptions]
	quality: NotRequired[str]
	resolution: NotRequired[str]
	response_format: NotRequired[str]
	size: NotRequired[str]
	style: NotRequired[str]
	user: NotRequired[str]

class ImagesGenerationResponse(TypedDict):
	created: NotRequired[int]
	data: NotRequired[List[Image]]

class InvalidRequestResponse(TypedDict):
	error: str
	max_offset: NotRequired[int]
	message: str
	ok: Literal[false]

class KeyInvalidateResponse(TypedDict):
	key: Dict[str, Any]
	message: str
	ok: Literal[true]

KnownModelId = Literal["ai21/jamba-1.5-large", "ai21/jamba-1.5-mini", "aion-labs/aion-2.0", "aion-labs/aion-3.0", "aion-labs/aion-3.0-mini", "aion-labs/aion-rp-llama-3.1-8b", "allenai/molmo-2-8b", "amazon/nova-2-lite", "amazon/nova-lite-1.0", "amazon/nova-micro-1.0", "amazon/nova-premier", "amazon/nova-pro-1.0", "anthropic/claude-3-haiku", "anthropic/claude-3.5-haiku", "anthropic/claude-3.7-sonnet", "anthropic/claude-fable-5", "anthropic/claude-fable-5.1", "anthropic/claude-haiku-4.5", "anthropic/claude-opus-4", "anthropic/claude-opus-4.1", "anthropic/claude-opus-4.5", "anthropic/claude-opus-4.6", "anthropic/claude-opus-4.7", "anthropic/claude-opus-4.8", "anthropic/claude-opus-5", "anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4.5", "anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-5", "arcee-ai/trinity-large", "arcee-ai/trinity-large-thinking", "arcee-ai/trinity-mini", "baai/bge-m3", "baai/bge-reranker-v2-m3", "baidu/cobuddy", "baidu/ernie-4.5-300b-a47b", "baidu/ernie-4.5-vl-424b-a47b", "black-forest-labs/flux-1-dev", "black-forest-labs/flux-1-schnell", "bytedance/seed-1.6", "bytedance/seed-1.6-2025-10-15", "bytedance/seed-1.6-250915", "bytedance/seed-1.6-flash", "bytedance/seed-1.6-flash-2025-08-28", "bytedance/seed-1.6-flash-250715", "bytedance/seed-1.8", "bytedance/seed-1.8-2025-12-28", "bytedance/seed-2.0-code-preview-2026-02-15", "bytedance/seed-2.0-lite", "bytedance/seed-2.0-lite-2026-04-28", "bytedance/seed-2.0-lite-260428", "bytedance/seed-2.0-mini", "bytedance/seed-2.0-mini-2026-04-28", "bytedance/seed-2.0-mini-260428", "bytedance/seed-2.0-pro", "bytedance/seed-2.1-turbo", "bytedance/seed-oss-36b-instruct", "bytedance/seed-translation", "bytedance/seedance-2.0", "bytedance/seedance-2.0-fast", "bytedance/seedance-2.0-mini-260615", "bytedance/seedream-5.0-pro", "cohere/command-a", "cohere/command-r", "cohere/command-r-plus", "cohere/command-r7b", "cohere/embed-english-v3", "cohere/embed-multilingual-v3", "cohere/embed-v4", "cohere/parse-v5.0", "cohere/rerank-v3.5", "cohere/rerank-v4.0-fast", "cohere/rerank-v4.0-pro", "crofai/greg-1-mini", "crofai/greg-2-super", "crofai/greg-2-ultra", "crofai/greg-rp", "deepseek/deepseek-ocr", "deepseek/deepseek-ocr-2", "deepseek/deepseek-r1", "deepseek/deepseek-r1-0528", "deepseek/deepseek-r1-2025-05-28", "deepseek/deepseek-r1-distill-llama-70b", "deepseek/deepseek-r1-turbo", "deepseek/deepseek-v3", "deepseek/deepseek-v3-0324", "deepseek/deepseek-v3-turbo", "deepseek/deepseek-v3.1", "deepseek/deepseek-v3.1-terminus", "deepseek/deepseek-v3.2", "deepseek/deepseek-v3.2-exp", "deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-vision-exp", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-pro-0813", "eleven-labs/eleven-flash-v2", "eleven-labs/eleven-flash-v2.5", "eleven-labs/eleven-multilingual-v2", "eleven-labs/eleven-turbo-v2", "eleven-labs/eleven-turbo-v2.5", "eleven-labs/eleven-v3", "eleven-labs/music", "eleven-labs/scribe-v2", "essential-ai/rnj-1", "google/gemini-2.5-flash", "google/gemini-2.5-flash-image", "google/gemini-2.5-flash-lite", "google/gemini-2.5-pro", "google/gemini-3-flash-preview", "google/gemini-3-pro-image", "google/gemini-3.1-flash-image", "google/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite-image", "google/gemini-3.1-flash-live-preview", "google/gemini-3.1-flash-tts-preview", "google/gemini-3.1-pro-preview", "google/gemini-3.1-pro-preview-customtools", "google/gemini-3.5-flash", "google/gemini-3.5-flash-lite", "google/gemini-3.6-flash", "google/gemini-3.7-flash", "google/gemini-3.8-flash", "google/gemini-embedding-001", "google/gemini-embedding-2", "google/gemini-robotics-er-2-preview", "google/gemma-3-12b", "google/gemma-3-27b", "google/gemma-3-4b", "google/gemma-4-12b", "google/gemma-4-26b-a4b", "google/gemma-4-26b-a4b:free", "google/gemma-4-31b", "google/gemma-4-31b-it", "google/gemma-4-31b:free", "google/imagen-4.0-preview", "google/lyria-3-clip-preview", "google/lyria-3-pro-preview", "google/veo-3.1", "google/veo-3.1-fast", "google/veo-3.1-fast-preview", "google/veo-3.1-lite-preview", "google/veo-3.1-preview", "ibm/granite-4.1-8b", "ibm/granite-4.2-30b", "ibm/granite-4.2-3b", "ibm/granite-4.2-8b", "inception/mercury-2", "inception/mercury-edit-2", "inclusionai/ling-2.6-1t", "inclusionai/ling-2.6-flash", "inclusionai/ling-3.0-flash", "inclusionai/ling-3.0-flash-fin", "inclusionai/ling-3.0-flash-sante", "inclusionai/ling-3.0-flash-vl", "inclusionai/ling-flash-2.0", "inclusionai/ring-2.6-1t", "inclusionai/ring-flash-2.0", "inflection/inflection-3-pi", "inflection/inflection-3-productivity", "jetbrains/mellum2-12b-a2.5b", "kwaipilot/kat-coder-air-v2.5", "kwaipilot/kat-coder-pro", "kwaipilot/kat-coder-pro-v2", "kwaipilot/kat-coder-pro-v2.5", "liquid-ai/lfm-2-24b-a2b", "liquid-ai/lfm-2.5-8b-a1b", "ltx-2-3-fast", "ltx-2-3-pro", "ltx-2-5-fast", "ltx-2-5-pro", "meituan/longcat-2.0", "meta/llama-3.1-70b", "meta/llama-3.1-8b", "meta/llama-3.2-3b", "meta/llama-3.3-70b", "meta/llama-4-maverick", "meta/llama-4-scout", "meta/llama-guard-4-12b", "meta/llama-prompt-guard-2-22m", "meta/llama-prompt-guard-2-86m", "meta/muse-glimmer-30b", "meta/muse-image-1.0", "meta/muse-spark-1.2", "meta/muse-spark-1.2-contributor", "meta/muse-spark-1.3", "meta/muse-spark-1.3-contributor", "meta/muse-voice-transcribe-1.0", "microsoft/phi-4", "microsoft/wizardlm-2-8x22b", "mindai/macaron-v1-tall", "mindai/macaron-v1-venti", "minimax/h3", "minimax/hailuo-02", "minimax/hailuo-2.3", "minimax/hailuo-2.3-fast", "minimax/image-01", "minimax/m2-her", "minimax/minimax-m1-80k", "minimax/minimax-m2", "minimax/minimax-m2.1", "minimax/minimax-m2.5", "minimax/minimax-m2.5-highspeed", "minimax/minimax-m2.7", "minimax/minimax-m3", "minimax/music-2.6", "minimax/music-3.0", "minimax/speech-2.6-hd", "minimax/speech-2.6-turbo", "minimax/speech-2.8-hd", "minimax/speech-2.8-turbo", "mistral/codestral", "mistral/codestral-embed", "mistral/devstral-2", "mistral/devstral-2.0", "mistral/devstral-medium-1.0", "mistral/devstral-small-1.1", "mistral/leanstral-1.5:free", "mistral/magistral-medium-1.2", "mistral/magistral-small-1.2", "mistral/ministral-3-14b", "mistral/ministral-3-3b", "mistral/ministral-3-8b", "mistral/ministral-3.0-14b", "mistral/ministral-3.0-3b", "mistral/ministral-3.0-8b", "mistral/mistral-embed", "mistral/mistral-large-2.1", "mistral/mistral-large-3", "mistral/mistral-large-3.0", "mistral/mistral-medium-3.0", "mistral/mistral-medium-3.1", "mistral/mistral-medium-3.5", "mistral/mistral-moderation-2", "mistral/mistral-nemo", "mistral/mistral-nemo-12b", "mistral/mistral-nemo-2407", "mistral/mistral-small-24b-2501", "mistral/mistral-small-3.2", "mistral/mistral-small-4", "mistral/ocr-3", "mistral/ocr-4", "mistral/ocr-4.1", "mistral/pixtral-large", "mistral/voxtral-mini", "mistral/voxtral-mini-transcribe-2", "mistral/voxtral-small", "moonshotai/kimi-k2", "moonshotai/kimi-k2-0905", "moonshotai/kimi-k2-thinking", "moonshotai/kimi-k2.5", "moonshotai/kimi-k2.6", "moonshotai/kimi-k2.7-code", "moonshotai/kimi-k3", "moonshotai/kimi-k3-fast", "morph/morph-compactor", "morph/morph-v3-fast", "morph/morph-v3-large", "morph/morph-warp-grep-v2.1", "nex-agi/deepseek-v3.1-nex-n1", "nous/hermes-3-llama-3.1-405b", "nousresearch/hermes-3-llama-3.1-70b", "nousresearch/hermes-4-405b", "nvidia/nemotron-3-nano-30b-a3b", "nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-lightning", "nvidia/nemotron-nano-9b-v2", "nvidia/nvidia-nemotron-3-nano-30b-a3b", "nvidia/nvidia-nemotron-nano-12b-v2-vl", "openai/babbage-002", "openai/chat-latest", "openai/chatgpt-4o", "openai/davinci-002", "openai/gpt-3.5-turbo-16k", "openai/gpt-3.5-turbo-2023-03-21", "openai/gpt-4-2023-06-13", "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/gpt-4o", "openai/gpt-4o-2024-05-13", "openai/gpt-4o-2024-08-06", "openai/gpt-4o-2024-11-20", "openai/gpt-4o-mini", "openai/gpt-4o-mini-transcribe", "openai/gpt-4o-mini-tts", "openai/gpt-4o-transcribe", "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-5-pro", "openai/gpt-5.1", "openai/gpt-5.2", "openai/gpt-5.2-codex", "openai/gpt-5.2-pro", "openai/gpt-5.3-codex", "openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5.4-nano", "openai/gpt-5.4-pro", "openai/gpt-5.5", "openai/gpt-5.5-pro", "openai/gpt-5.6-luna", "openai/gpt-5.6-luna-pro", "openai/gpt-5.6-sol", "openai/gpt-5.6-sol-pro", "openai/gpt-5.6-terra", "openai/gpt-5.6-terra-pro", "openai/gpt-6-astra", "openai/gpt-6-astra-pro", "openai/gpt-image-1", "openai/gpt-image-1-mini", "openai/gpt-image-1.5", "openai/gpt-image-2", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-120b", "openai/gpt-oss-safeguard-20b", "openai/gpt-realtime", "openai/gpt-realtime-1.5", "openai/gpt-realtime-2", "openai/gpt-transcribe", "openai/o1", "openai/o1-mini", "openai/o1-pro", "openai/o3", "openai/o3-mini", "openai/o3-pro", "openai/o4-mini", "openai/omni-moderation", "openai/sora-2", "openai/sora-2-pro", "openai/text-embedding-3-large", "openai/text-embedding-3-small", "openai/text-embedding-ada-002", "openai/whisper-1", "openai/whisper-large-v3", "openai/whisper-large-v3-turbo", "perplexity/pplx-embed-v1-0.6b", "perplexity/pplx-embed-v1-4b", "phaseo/auto", "phaseo/free", "poolside/laguna-m.1:free", "poolside/laguna-s-2.1:free", "poolside/laguna-xs-2.1:free", "qwen/qvq-max", "qwen/qwen-flash", "qwen/qwen-flash-character", "qwen/qwen-image", "qwen/qwen-max", "qwen/qwen-mt-flash", "qwen/qwen-mt-lite", "qwen/qwen-mt-plus", "qwen/qwen-mt-turbo", "qwen/qwen-plus-2025-01-25", "qwen/qwen-plus-2025-04-28", "qwen/qwen-plus-2025-07-14", "qwen/qwen-plus-2025-07-28", "qwen/qwen-plus-2025-09-11", "qwen/qwen-plus-2025-12-01", "qwen/qwen-plus-character", "qwen/qwen-turbo-2024-11-01", "qwen/qwen-turbo-2025-04-28", "qwen/qwen-vl-max-2025-04-08", "qwen/qwen-vl-max-2025-08-13", "qwen/qwen-vl-plus-2025-01-25", "qwen/qwen-vl-plus-2025-05-07", "qwen/qwen-vl-plus-2025-08-15", "qwen/qwen2.5-14b", "qwen/qwen2.5-14b-1m", "qwen/qwen2.5-32b", "qwen/qwen2.5-72b", "qwen/qwen2.5-7b", "qwen/qwen2.5-7b-1m", "qwen/qwen2.5-coder-7b", "qwen/qwen2.5-vl-32b", "qwen/qwen2.5-vl-32b-instruct", "qwen/qwen2.5-vl-72b", "qwen/qwen2.5-vl-72b-instruct", "qwen/qwen2.5-vl-7b", "qwen/qwen3-0.6b", "qwen/qwen3-1.7b", "qwen/qwen3-14b", "qwen/qwen3-235b-a22b", "qwen/qwen3-235b-a22b-2507", "qwen/qwen3-235b-a22b-instruct-2507", "qwen/qwen3-235b-a22b-thinking-2507", "qwen/qwen3-30b-a3b", "qwen/qwen3-30b-a3b-2507", "qwen/qwen3-30b-a3b-instruct-2507", "qwen/qwen3-30b-a3b-thinking-2507", "qwen/qwen3-32b", "qwen/qwen3-4b", "qwen/qwen3-8b", "qwen/qwen3-coder-30b-a3b", "qwen/qwen3-coder-480b-a35b", "qwen/qwen3-coder-flash", "qwen/qwen3-coder-next", "qwen/qwen3-coder-plus-2025-07-22", "qwen/qwen3-coder-plus-2025-09-23", "qwen/qwen3-embedding-0.6b", "qwen/qwen3-embedding-8b", "qwen/qwen3-max", "qwen/qwen3-max-2025-09-23", "qwen/qwen3-max-2026-01-23", "qwen/qwen3-max-preview", "qwen/qwen3-max-thinking", "qwen/qwen3-next-80b", "qwen/qwen3-next-80b-a3b", "qwen/qwen3-next-80b-a3b-instruct", "qwen/qwen3-next-80b-a3b-thinking", "qwen/qwen3-omni-30b-a3b", "qwen/qwen3-omni-30b-a3b-thinking", "qwen/qwen3-reranker", "qwen/qwen3-vl-235b-a22b", "qwen/qwen3-vl-235b-a22b-instruct", "qwen/qwen3-vl-235b-a22b-thinking", "qwen/qwen3-vl-30b-a3b", "qwen/qwen3-vl-30b-a3b-instruct", "qwen/qwen3-vl-30b-a3b-thinking", "qwen/qwen3-vl-32b-instruct", "qwen/qwen3-vl-32b-thinking", "qwen/qwen3-vl-8b", "qwen/qwen3-vl-8b-instruct", "qwen/qwen3-vl-flash-2025-10-15", "qwen/qwen3-vl-flash-2026-01-22", "qwen/qwen3-vl-plus-2025-09-23", "qwen/qwen3-vl-plus-2025-12-19", "qwen/qwen3.5-122b-a10b", "qwen/qwen3.5-27b", "qwen/qwen3.5-35b-a3b", "qwen/qwen3.5-397b-a17b", "qwen/qwen3.5-9b", "qwen/qwen3.5-flash", "qwen/qwen3.5-livetranslate-flash-realtime-2026-05-19", "qwen/qwen3.5-plus", "qwen/qwen3.5-plus-2026-04-20", "qwen/qwen3.6-27b", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-flash", "qwen/qwen3.6-max-preview", "qwen/qwen3.6-plus", "qwen/qwen3.7-max", "qwen/qwen3.7-max-2026-05-17", "qwen/qwen3.7-plus", "qwen/qwen3.7-plus-2026-05-26", "qwen/qwen3.8-2.4t-a95b", "qwen/qwen3.8-27b", "qwen/qwen3.8-flash", "qwen/qwen3.8-max", "qwen/qwen3.8-max-0902", "qwen/qwq-32b", "qwen/qwq-plus", "qwen/text-embedding-v3", "qwen/text-embedding-v4", "qwen/wan2.7-t2v", "qwen/wan3.0-video", "qwen/wan3.0-video-prime", "reka-edge", "reka-edge-2603", "reka-flash", "reka-flash-research", "relace/relace-search", "sakana/fugu-ultra", "sakana/namazu", "spacex-ai/grok-4.20", "spacex-ai/grok-4.20-multi-agent-beta", "spacex-ai/grok-4.20-multi-agent-beta-0309", "spacex-ai/grok-4.3", "spacex-ai/grok-4.5", "spacex-ai/grok-4.6", "spacex-ai/grok-build-0.1", "spacex-ai/grok-imagine-image", "spacex-ai/grok-imagine-image-2.0", "spacex-ai/grok-transcribe", "spacex-ai/grok-tts", "stepfun/step-3.5-flash", "stepfun/step-3.7-flash", "tencent/hunyuan-a13b-instruct", "tencent/hy3", "tencent/hy3-preview", "tencent/hy3:free", "tencent/hy4-preview", "thinking-machines/inkling", "thinking-machines/inkling-small", "upstage/solar-embedding-1-large-passage", "upstage/solar-embedding-1-large-query", "upstage/solar-embedding-2-passage", "upstage/solar-embedding-2-query", "upstage/solar-mini", "upstage/solar-pro-2", "upstage/solar-pro-3", "upstage/solar-pro-4", "venice/gemma-4-uncensored", "venice/venice-role-play-uncensored", "venice/venice-uncensored-1.2", "voyage/rerank-1", "voyage/rerank-2", "voyage/rerank-2-lite", "voyage/rerank-2.5", "voyage/rerank-2.5-lite", "voyage/rerank-lite-1", "voyage/voyage-01", "voyage/voyage-02", "voyage/voyage-2", "voyage/voyage-3", "voyage/voyage-3-large", "voyage/voyage-3-lite", "voyage/voyage-3.5", "voyage/voyage-3.5-lite", "voyage/voyage-4", "voyage/voyage-4-large", "voyage/voyage-4-lite", "voyage/voyage-code-2", "voyage/voyage-code-3", "voyage/voyage-code-4", "voyage/voyage-context-3", "voyage/voyage-finance-2", "voyage/voyage-large-2", "voyage/voyage-large-2-instruct", "voyage/voyage-law-2", "voyage/voyage-lite-01", "voyage/voyage-lite-01-instruct", "voyage/voyage-lite-02-instruct", "voyage/voyage-multilingual-2", "voyage/voyage-multimodal-3", "voyage/voyage-multimodal-3.5", "xiaomi/mimo-v2.5", "xiaomi/mimo-v2.5-asr", "xiaomi/mimo-v2.5-pro", "xiaomi/mimo-v2.5-pro-ultraspeed", "xiaomi/mimo-v2.5-tts-voiceclone:free", "xiaomi/mimo-v2.5-tts-voicedesign:free", "xiaomi/mimo-v2.5-tts:free", "z-ai/autoglm-phone-9b-multilingual", "z-ai/glm-4-32b", "z-ai/glm-4.5", "z-ai/glm-4.5-air", "z-ai/glm-4.5-air-x", "z-ai/glm-4.5-x", "z-ai/glm-4.5v", "z-ai/glm-4.6", "z-ai/glm-4.6v", "z-ai/glm-4.6v-flash", "z-ai/glm-4.7", "z-ai/glm-4.7-flash", "z-ai/glm-4.7-flash-heretic", "z-ai/glm-5", "z-ai/glm-5-turbo", "z-ai/glm-5.1", "z-ai/glm-5.2", "z-ai/glm-5.3", "z-ai/glm-5.3-flash", "z-ai/glm-5v-turbo", "zai-org/glm-4.5-air", "zai/glm-5"]

class ListFilesResponse(TypedDict):
	data: NotRequired[List[FileResponse]]
	object: NotRequired[str]

class ManagementKeyCollectionResponse(TypedDict):
	data: List[ManagementKeyRuntime]

class ManagementKeyCreateRequest(TypedDict):
	created_by: NotRequired[str]
	name: str
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]
	status: NotRequired[Literal["active", "disabled", "revoked"]]
	team_id: NotRequired[str]

class ManagementKeyCreateResponse(TypedDict):
	key: ProvisioningKeyWithValue
	ok: Literal[true]

class ManagementKeyDeleteResponse(TypedDict):
	message: str
	ok: Literal[true]

class ManagementKeyDetailResponse(TypedDict):
	key: ProvisioningKeyDetail
	ok: Literal[true]

class ManagementKeyListResponse(TypedDict):
	keys: List[ProvisioningKey]
	limit: int
	offset: int
	ok: Literal[true]
	total: int

class ManagementKeyRuntime(TypedDict):
	created_at: str
	created_by: NotRequired[Optional[str]]
	daily_limit_cost_nanos: NotRequired[Optional[int]]
	daily_limit_requests: NotRequired[Optional[int]]
	expires_at: NotRequired[Optional[str]]
	id: str
	last_used_at: NotRequired[Optional[str]]
	monthly_limit_cost_nanos: NotRequired[Optional[int]]
	monthly_limit_requests: NotRequired[Optional[int]]
	name: str
	prefix: str
	scopes: List[str]
	soft_blocked: NotRequired[Optional[bool]]
	status: Literal["active", "paused"]
	updated_at: NotRequired[Optional[str]]
	weekly_limit_cost_nanos: NotRequired[Optional[int]]
	weekly_limit_requests: NotRequired[Optional[int]]
	workspace_id: str

class ManagementKeyRuntimeCreated(TypedDict):
	created_at: str
	created_by: NotRequired[Optional[str]]
	daily_limit_cost_nanos: NotRequired[Optional[int]]
	daily_limit_requests: NotRequired[Optional[int]]
	expires_at: NotRequired[Optional[str]]
	id: str
	key: str
	last_used_at: NotRequired[Optional[str]]
	monthly_limit_cost_nanos: NotRequired[Optional[int]]
	monthly_limit_requests: NotRequired[Optional[int]]
	name: str
	prefix: str
	scopes: List[str]
	soft_blocked: NotRequired[Optional[bool]]
	status: Literal["active", "paused"]
	updated_at: NotRequired[Optional[str]]
	weekly_limit_cost_nanos: NotRequired[Optional[int]]
	weekly_limit_requests: NotRequired[Optional[int]]
	workspace_id: str

class ManagementKeyRuntimeCreateRequest(TypedDict):
	expires_at: NotRequired[Optional[str]]
	name: str
	paused: NotRequired[bool]
	scopes: NotRequired[Union[str, List[str]]]
	template: NotRequired[Literal["read-only", "read-write", "full-control"]]

class ManagementKeyRuntimeCreateResponse(TypedDict):
	data: ManagementKeyRuntimeCreated

class ManagementKeyRuntimeDeleteResponse(TypedDict):
	deleted: Literal[true]

class ManagementKeyRuntimeResponse(TypedDict):
	data: ManagementKeyRuntime

class ManagementKeyRuntimeUpdateRequest(TypedDict):
	dailyCostNanos: NotRequired[Optional[int]]
	dailyRequests: NotRequired[Optional[int]]
	expires_at: NotRequired[Optional[str]]
	monthlyCostNanos: NotRequired[Optional[int]]
	monthlyRequests: NotRequired[Optional[int]]
	name: NotRequired[str]
	paused: NotRequired[bool]
	scopes: NotRequired[Union[str, List[str]]]
	softBlocked: NotRequired[bool]
	template: NotRequired[Literal["read-only", "read-write", "full-control"]]
	weeklyCostNanos: NotRequired[Optional[int]]
	weeklyRequests: NotRequired[Optional[int]]

class ManagementKeyUpdateRequest(TypedDict):
	name: NotRequired[str]
	soft_blocked: NotRequired[bool]
	status: NotRequired[Literal["active", "disabled", "revoked"]]

class ManagementKeyUpdateResponse(TypedDict):
	message: str
	ok: Literal[true]

MessageContentPart = Union["TextContentPart", "ImageContentPart", "AudioContentPart", "VideoContentPart", "ToolCallContentPart"]

class Model(TypedDict):
	aliases: List[str]
	availability: ModelAvailability
	base_model_id: str
	capabilities: GatewayCapabilities
	description: str
	id: str
	lifecycle: GatewayModelLifecycle
	limits: GatewayModelLimits
	modalities: GatewayModalities
	name: str
	offers: List[GatewayModelOffer]
	organization: Optional[Dict[str, Any]]
	pricing: GatewayPricing
	variant: str
	variants: Dict[str, Any]

class ModelAvailability(TypedDict):
	active_provider_count: int
	coming_soon_provider_count: int
	inactive_provider_count: int
	provider_count: int
	status: Literal["active", "coming_soon", "inactive", "not_listed"]

class ModelEndpointCapability(TypedDict):
	capabilities: GatewayCapabilities
	capability_id: str
	collection: Literal["text", "images", "video", "audio", "embeddings", "rerank", "moderation", "ocr", "music", "batch", "files"]
	effective: Dict[str, Any]
	endpoint: str
	id: str
	modalities: GatewayModalities
	model: Optional[str]
	pricing: GatewayPricing
	provider: Dict[str, Any]
	public_path: str
	routable: bool
	routing: Dict[str, Any]
	status: Literal["active", "coming_soon", "inactive"]
	status_reason: Literal["active", "preview_only", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "internal_testing", "scheduled", "coming_soon", "provider_disabled", "model_disabled", "capability_disabled", "provider_not_ready", "provider_inactive", "inactive", "retired"]

class ModelEndpointsResponse(TypedDict):
	availability_mode: Literal["active", "all"]
	description: str
	endpoints: List[ModelEndpointCapability]
	id: str
	modalities: GatewayModalities
	name: str
	ok: Literal[true]
	organization: Optional[Dict[str, Any]]

ModelId = str

class ModelLifecycle(TypedDict):
	deprecation_date: NotRequired[Optional[str]]
	message: NotRequired[Optional[str]]
	replacement_model_id: NotRequired[Optional[str]]
	retirement_date: NotRequired[Optional[str]]
	status: NotRequired[Optional[Literal["active", "deprecated", "retired"]]]

class ModelProviderAvailability(TypedDict):
	api_provider_id: str
	api_provider_name: NotRequired[Optional[str]]
	availability_reason: Literal["active", "preview_only", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "internal_testing", "scheduled", "coming_soon", "provider_disabled", "model_disabled", "capability_disabled", "provider_not_ready", "provider_inactive", "inactive", "retired"]
	availability_status: Literal["active", "coming_soon", "inactive"]
	capability_status: Literal["active", "coming_soon", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled", "internal_testing"]
	effective_from: NotRequired[Optional[str]]
	effective_to: NotRequired[Optional[str]]
	endpoints: List[str]
	input_modalities: NotRequired[List[str]]
	is_active_gateway: bool
	model_routing_status: Literal["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled"]
	output_modalities: NotRequired[List[str]]
	params: List[str]
	params_detail: NotRequired[SupportedParameterDetails]
	provider_model_slug: NotRequired[Optional[str]]
	provider_routing_status: Literal["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled"]
	provider_status: Literal["active", "beta", "alpha", "not_ready", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked"]
	supported_parameters: NotRequired[List[str]]
	supported_parameters_detail: NotRequired[SupportedParameterDetails]

ModerationCategories = TypedDict("ModerationCategories", {
	"harassment": NotRequired[bool],
	"harassment/threatening": NotRequired[bool],
	"hate": NotRequired[bool],
	"hate/threatening": NotRequired[bool],
	"self-harm": NotRequired[bool],
	"self-harm/instructions": NotRequired[bool],
	"self-harm/intent": NotRequired[bool],
	"sexual": NotRequired[bool],
	"sexual/minors": NotRequired[bool],
	"violence": NotRequired[bool],
	"violence/graphic": NotRequired[bool],
})

ModerationCategoryScores = TypedDict("ModerationCategoryScores", {
	"harassment": NotRequired[float],
	"harassment/threatening": NotRequired[float],
	"hate": NotRequired[float],
	"hate/threatening": NotRequired[float],
	"self-harm": NotRequired[float],
	"self-harm/instructions": NotRequired[float],
	"self-harm/intent": NotRequired[float],
	"sexual": NotRequired[float],
	"sexual/minors": NotRequired[float],
	"violence": NotRequired[float],
	"violence/graphic": NotRequired[float],
})

class ModerationResult(TypedDict):
	categories: NotRequired[ModerationCategories]
	category_scores: NotRequired[ModerationCategoryScores]
	flagged: NotRequired[bool]

class ModerationsRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	input: Union[str, List[Union[Dict[str, Any], Dict[str, Any]]]]
	meta: NotRequired[bool]
	model: str
	provider: NotRequired[ProviderRoutingOptions]

class ModerationsResponse(TypedDict):
	id: NotRequired[str]
	meta: NotRequired[Dict[str, Any]]
	model: NotRequired[str]
	results: NotRequired[List[ModerationResult]]

class MusicGenerateRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	duration: NotRequired[int]
	echo_upstream_request: NotRequired[bool]
	elevenlabs: NotRequired[Dict[str, Any]]
	format: NotRequired[Literal["mp3", "wav", "ogg", "aac"]]
	model: str
	prompt: NotRequired[str]
	provider: NotRequired[ProviderRoutingOptions]
	suno: NotRequired[Dict[str, Any]]

class MusicGenerateResponse(TypedDict):
	audio_base64: NotRequired[str]
	audio_url: NotRequired[str]
	id: str
	model: str
	nativeResponseId: NotRequired[Optional[str]]
	object: Literal["music"]
	output: NotRequired[List[OcrResponse]]
	provider: str
	result: NotRequired[Any]
	status: Literal["queued", "in_progress", "completed", "failed"]
	usage: NotRequired[OcrResponse]

class NotImplementedResponse(TypedDict):
	description: str
	error: str
	status_code: int

class OAuthClient(TypedDict):
	active_authorizations: NotRequired[int]
	allowed_scopes: NotRequired[List[str]]
	client_id: str
	client_type: Literal["public", "confidential"]
	created_at: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	homepage_url: NotRequired[Optional[str]]
	last_used_at: NotRequired[Optional[str]]
	logo_url: NotRequired[Optional[str]]
	name: str
	privacy_policy_url: NotRequired[Optional[str]]
	redirect_uris: List[str]
	requests_last_30d: NotRequired[int]
	status: str
	terms_of_service_url: NotRequired[Optional[str]]
	total_authorizations: NotRequired[int]
	updated_at: NotRequired[Optional[str]]
	workspace_id: str

class OAuthClientCreateRequest(TypedDict):
	allowed_scopes: NotRequired[List[str]]
	client_type: NotRequired[Literal["public", "confidential"]]
	description: NotRequired[str]
	homepage_url: NotRequired[str]
	logo_url: NotRequired[str]
	name: str
	privacy_policy_url: NotRequired[str]
	redirect_uris: List[str]
	terms_of_service_url: NotRequired[str]

class OAuthClientCreateResponse(TypedDict):
	active_authorizations: NotRequired[int]
	allowed_scopes: NotRequired[List[str]]
	client_id: str
	client_secret: NotRequired[Optional[str]]
	client_type: Literal["public", "confidential"]
	created_at: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	homepage_url: NotRequired[Optional[str]]
	last_used_at: NotRequired[Optional[str]]
	logo_url: NotRequired[Optional[str]]
	name: str
	privacy_policy_url: NotRequired[Optional[str]]
	redirect_uris: List[str]
	requests_last_30d: NotRequired[int]
	status: str
	terms_of_service_url: NotRequired[Optional[str]]
	total_authorizations: NotRequired[int]
	updated_at: NotRequired[Optional[str]]
	workspace_id: str

class OAuthClientDeleteResponse(TypedDict):
	client_id: str
	message: str

class OAuthClientInput(TypedDict):
	allowed_scopes: NotRequired[List[str]]
	description: NotRequired[str]
	homepage_url: NotRequired[str]
	logo_url: NotRequired[str]
	name: NotRequired[str]
	privacy_policy_url: NotRequired[str]
	redirect_uris: NotRequired[List[str]]
	terms_of_service_url: NotRequired[str]

class OAuthClientListResponse(TypedDict):
	data: List[OAuthClient]
	pagination: Dict[str, Any]

class OAuthClientSecretResponse(TypedDict):
	client_id: str
	client_secret: str
	message: str

class OAuthClientUpdateRequest(TypedDict):
	allowed_scopes: NotRequired[List[str]]
	description: NotRequired[str]
	homepage_url: NotRequired[str]
	logo_url: NotRequired[str]
	name: NotRequired[str]
	privacy_policy_url: NotRequired[str]
	redirect_uris: NotRequired[List[str]]
	terms_of_service_url: NotRequired[str]

class ObservabilityDestination(TypedDict):
	configured: bool
	created_at: NotRequired[Optional[str]]
	enabled: bool
	group_join: Literal["and", "or"]
	id: str
	include_cost_metadata: NotRequired[bool]
	include_generation_metadata: NotRequired[bool]
	include_identity_metadata: NotRequired[bool]
	include_request_context: NotRequired[bool]
	key_filters: List[ObservabilityKeyFilter]
	name: str
	privacy_mode: bool
	rule_groups: List[ObservabilityRuleGroup]
	sampling_rate: float
	type: Literal["otel_collector", "webhook"]
	updated_at: NotRequired[Optional[str]]
	workspace_id: str

class ObservabilityDestinationCreateRequest(TypedDict):
	config: Dict[str, Any]
	enabled: NotRequired[bool]
	group_join: NotRequired[Literal["and", "or"]]
	include_cost_metadata: NotRequired[bool]
	include_generation_metadata: NotRequired[bool]
	include_identity_metadata: NotRequired[bool]
	include_request_context: NotRequired[bool]
	key_filters: NotRequired[List[ObservabilityKeyFilter]]
	name: str
	privacy_mode: NotRequired[bool]
	rule_groups: NotRequired[List[ObservabilityRuleGroup]]
	sampling_rate: NotRequired[float]
	type: Literal["otel_collector", "webhook"]

class ObservabilityDestinationListResponse(TypedDict):
	data: List[ObservabilityDestination]
	total_count: int

class ObservabilityDestinationPolicyInput(TypedDict):
	enabled: NotRequired[bool]
	group_join: NotRequired[Literal["and", "or"]]
	include_cost_metadata: NotRequired[bool]
	include_generation_metadata: NotRequired[bool]
	include_identity_metadata: NotRequired[bool]
	include_request_context: NotRequired[bool]
	key_filters: NotRequired[List[ObservabilityKeyFilter]]
	name: NotRequired[str]
	privacy_mode: NotRequired[bool]
	rule_groups: NotRequired[List[ObservabilityRuleGroup]]
	sampling_rate: NotRequired[float]

class ObservabilityDestinationResponse(TypedDict):
	data: ObservabilityDestination

ObservabilityDestinationType = Literal["otel_collector", "webhook"]

class ObservabilityDestinationUpdateRequest(TypedDict):
	config: NotRequired[Dict[str, Any]]
	enabled: NotRequired[bool]
	group_join: NotRequired[Literal["and", "or"]]
	include_cost_metadata: NotRequired[bool]
	include_generation_metadata: NotRequired[bool]
	include_identity_metadata: NotRequired[bool]
	include_request_context: NotRequired[bool]
	key_filters: NotRequired[List[ObservabilityKeyFilter]]
	name: NotRequired[str]
	privacy_mode: NotRequired[bool]
	rule_groups: NotRequired[List[ObservabilityRuleGroup]]
	sampling_rate: NotRequired[float]

class ObservabilityKeyFilter(TypedDict):
	key_id: str
	mode: Literal["include", "exclude"]

class ObservabilityLoggingPolicy(TypedDict):
	billing_status: Literal["active", "grace", "suspended"]
	enabled: bool
	grace_until: NotRequired[Optional[str]]
	include_provider_payloads: bool
	price_per_million_units_nanos: int
	retention_days: int
	updated_at: NotRequired[Optional[str]]
	workspace_id: str

class ObservabilityLoggingPolicyResponse(TypedDict):
	data: ObservabilityLoggingPolicy

class ObservabilityLoggingPolicyUpdateRequest(TypedDict):
	enabled: NotRequired[bool]
	include_provider_payloads: NotRequired[bool]
	retention_days: NotRequired[int]

class ObservabilityRule(TypedDict):
	condition: Literal["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "exists", "not_exists", "matches_regex"]
	field: Literal["model", "provider", "session_id", "user_id", "api_key_name", "finish_reason", "input", "output", "token_cost", "total_cost", "total_tokens", "prompt_tokens", "completion_tokens"]
	value: NotRequired[Optional[str]]

class ObservabilityRuleGroup(TypedDict):
	match: Literal["and", "or"]
	rules: List[ObservabilityRule]

class OcrRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	echo_upstream_request: NotRequired[bool]
	image: str
	language: NotRequired[str]
	model: str
	provider: NotRequired[ProviderRoutingOptions]

class OcrResponse(TypedDict):
	pass

OrganisationId = Literal["ai21", "aion-labs", "alibaba", "allenai", "amazon", "anthropic", "arcee-ai", "baai", "baidu", "black-forest-labs", "bytedance", "cohere", "crofai", "cursor", "deepseek", "eleven-labs", "essential-ai", "github", "google", "hexgrad", "ibm", "inception", "inclusionai", "inflection", "jetbrains", "kwaipilot", "lg", "lightricks", "liquid-ai", "meituan", "meta", "microsoft", "mindai", "minimax", "mistral", "moonshotai", "morph", "naver-hyperclova", "nex-agi", "nous", "nvidia", "openai", "perplexity", "poe", "poolside", "prime-intellect", "qwen", "reka", "relace", "runway", "sakana", "sourceful", "spacex-ai", "stability-ai", "stealth", "stepfun", "suno", "tencent", "thinking-machines", "upstage", "venice", "vercel", "voyage", "windsurf", "xiaomi", "z-ai"]

OrganisationIdList = List[Literal["ai21", "aion-labs", "alibaba", "allenai", "amazon", "anthropic", "arcee-ai", "baai", "baidu", "black-forest-labs", "bytedance", "cohere", "crofai", "cursor", "deepseek", "eleven-labs", "essential-ai", "github", "google", "hexgrad", "ibm", "inception", "inclusionai", "inflection", "jetbrains", "kwaipilot", "lg", "lightricks", "liquid-ai", "meituan", "meta", "microsoft", "mindai", "minimax", "mistral", "moonshotai", "morph", "naver-hyperclova", "nex-agi", "nous", "nvidia", "openai", "perplexity", "poe", "poolside", "prime-intellect", "qwen", "reka", "relace", "runway", "sakana", "sourceful", "spacex-ai", "stability-ai", "stealth", "stepfun", "suno", "tencent", "thinking-machines", "upstage", "venice", "vercel", "voyage", "windsurf", "xiaomi", "z-ai"]]

ParseBlock = Union[Dict[str, Any], Dict[str, Any], Dict[str, Any]]

class ParseBoundingBox(TypedDict):
	bottom_right_x: float
	bottom_right_y: float
	top_left_x: float
	top_left_y: float

class ParseImage(TypedDict):
	bounding_box: ParseBoundingBox
	bounding_box_normalized: ParseBoundingBox
	category: Literal["other", "flowchart", "logo", "signature"]
	description: str
	id: str

ParsePage = Union[Dict[str, Any], Dict[str, Any]]

class ParseRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	document: Dict[str, Any]
	echo_upstream_request: NotRequired[bool]
	model: str
	output_format: NotRequired[Literal["markdown", "blocks"]]
	provider: NotRequired[ProviderRoutingOptions]
	routing: NotRequired[ProviderRoutingOptions]

class ParseResponse(TypedDict):
	id: str
	meta: NotRequired[OcrResponse]
	model: str
	object: Literal["parse"]
	pages: List[Union[Dict[str, Any], Dict[str, Any]]]
	provider: str
	usage: NotRequired[OcrResponse]

class Preset(TypedDict):
	active_version_id: NotRequired[Optional[str]]
	config: PresetConfig
	created_at: NotRequired[Optional[str]]
	created_by: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	id: str
	name: str
	slug: str
	source_preset_id: NotRequired[Optional[str]]
	source_preset_version_id: NotRequired[Optional[str]]
	updated_at: NotRequired[Optional[str]]
	upstream_version_id: NotRequired[Optional[str]]
	versioning_method: Literal["sequential", "semver", "date"]
	visibility: Literal["private", "team", "public"]
	workspace_id: str

class PresetConfig(TypedDict):
	pass

class PresetCreateRequest(TypedDict):
	config: NotRequired[PresetConfig]
	description: NotRequired[Optional[str]]
	name: str
	slug: NotRequired[str]
	versioning_method: NotRequired[Literal["sequential", "semver", "date"]]
	visibility: NotRequired[Literal["private", "team", "public"]]

class PresetCreateResponse(TypedDict):
	canonical_model: str
	data: Preset

class PresetForkRequest(TypedDict):
	source_version_id: NotRequired[str]

class PresetListResponse(TypedDict):
	data: List[Preset]
	total_count: int

class PresetPublisher(TypedDict):
	handle: Optional[str]
	workspace_id: str

class PresetPublisherResponse(TypedDict):
	data: PresetPublisher

class PresetPublisherUpdateRequest(TypedDict):
	handle: str

class PresetResponse(TypedDict):
	data: Preset

class PresetTestRun(TypedDict):
	baseline_preset_id: Optional[str]
	completed_at: Optional[str]
	config: PresetConfig
	created_at: str
	created_by_user_id: Optional[str]
	dataset_name: Optional[str]
	description: Optional[str]
	id: str
	name: Optional[str]
	preset_id: Optional[str]
	started_at: Optional[str]
	status: Literal["pending", "running", "completed", "failed", "cancelled"]
	summary: PresetConfig
	updated_at: str
	workspace_id: str

class PresetTestRunCreateRequest(TypedDict):
	baseline_preset_id: NotRequired[str]
	completed_at: NotRequired[str]
	config: NotRequired[PresetConfig]
	dataset_name: NotRequired[str]
	description: NotRequired[str]
	name: NotRequired[str]
	preset_id: NotRequired[str]
	started_at: NotRequired[str]
	status: NotRequired[Literal["pending", "running", "completed", "failed", "cancelled"]]
	summary: NotRequired[PresetConfig]

class PresetTestRunDetailResponse(TypedDict):
	data: PresetTestRun
	feedback_summary: Optional[GatewayFeedbackSummaryRow]

class PresetTestRunListResponse(TypedDict):
	data: List[PresetTestRun]

class PresetTestRunResponse(TypedDict):
	data: PresetTestRun

class PresetTestRunUpdateRequest(TypedDict):
	completed_at: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	name: NotRequired[Optional[str]]
	started_at: NotRequired[Optional[str]]
	status: NotRequired[Literal["pending", "running", "completed", "failed", "cancelled"]]
	summary: NotRequired[PresetConfig]

class PresetUpdateRequest(TypedDict):
	config: NotRequired[PresetConfig]
	description: NotRequired[Optional[str]]
	name: NotRequired[str]
	replace_config: NotRequired[bool]
	slug: NotRequired[str]
	versioning_method: NotRequired[Literal["sequential", "semver", "date"]]
	visibility: NotRequired[Literal["private", "team", "public"]]

class PresetUpstreamApplyRequest(TypedDict):
	version_id: str

class PresetUpstreamApplyResponse(TypedDict):
	data: Dict[str, Any]

class PresetVersion(TypedDict):
	config: PresetConfig
	created_at: str
	created_by: str
	description: NotRequired[Optional[str]]
	id: str
	name: str
	preset_id: str
	release_notes: NotRequired[Optional[str]]
	slug: str
	version_label: str
	version_number: int
	versioning_method: Literal["sequential", "semver", "date"]
	visibility: Literal["private", "team", "public"]

PresetVersioningMethod = Literal["sequential", "semver", "date"]

class PresetVersionListResponse(TypedDict):
	data: List[PresetVersion]

class PresetVersionPublishRequest(TypedDict):
	release_notes: NotRequired[str]
	version_label: NotRequired[str]

class PresetVersionResponse(TypedDict):
	data: PresetVersion

PresetVisibility = Literal["private", "team", "public"]

class PrivateModel(TypedDict):
	base_url: str
	catalog_model_id: NotRequired[Optional[str]]
	context_length: NotRequired[Optional[int]]
	created_at: NotRequired[Optional[str]]
	created_by: NotRequired[Optional[str]]
	credential_prefix: NotRequired[Optional[str]]
	credential_suffix: NotRequired[Optional[str]]
	custom_provider_name: NotRequired[Optional[str]]
	custom_provider_url: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	enabled: bool
	host_provider_id: NotRequired[Optional[str]]
	id: str
	input_modalities: NotRequired[List[str]]
	local_slug: NotRequired[str]
	max_output_tokens: NotRequired[Optional[int]]
	model_id: str
	name: str
	output_modalities: NotRequired[List[str]]
	routing_policy: NotRequired[Literal["preferred", "balanced", "fallback"]]
	supports_responses: bool
	updated_at: NotRequired[Optional[str]]
	upstream_model_id: str
	workspace_id: str

class PrivateModelCreateRequest(TypedDict):
	base_url: str
	context_length: NotRequired[Optional[int]]
	credential: str
	custom_provider_name: NotRequired[Optional[str]]
	custom_provider_url: NotRequired[Optional[str]]
	description: NotRequired[str]
	enabled: NotRequired[bool]
	host_provider_id: NotRequired[Optional[str]]
	max_output_tokens: NotRequired[Optional[int]]
	model_reference: str
	name: str
	routing_policy: NotRequired[Literal["preferred", "balanced", "fallback"]]
	supports_responses: NotRequired[bool]
	upstream_model_id: str

class PrivateModelDeleteResponse(TypedDict):
	deleted: bool

class PrivateModelListResponse(TypedDict):
	data: List[PrivateModel]

class PrivateModelResponse(TypedDict):
	data: PrivateModel

class PrivateModelUpdateRequest(TypedDict):
	base_url: NotRequired[str]
	context_length: NotRequired[Optional[int]]
	credential: NotRequired[str]
	custom_provider_name: NotRequired[Optional[str]]
	custom_provider_url: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	enabled: NotRequired[bool]
	host_provider_id: NotRequired[Optional[str]]
	max_output_tokens: NotRequired[Optional[int]]
	model_reference: NotRequired[str]
	name: NotRequired[str]
	routing_policy: NotRequired[Literal["preferred", "balanced", "fallback"]]
	supports_responses: NotRequired[bool]
	upstream_model_id: NotRequired[str]

class Provider(TypedDict):
	api_provider_id: NotRequired[str]
	api_provider_name: NotRequired[Optional[str]]
	country_code: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	link: NotRequired[Optional[str]]

class ProviderCredential(TypedDict):
	allowed_api_key_ids: NotRequired[List[str]]
	allowed_model_slugs: NotRequired[List[str]]
	always_use: NotRequired[bool]
	created_at: NotRequired[Optional[str]]
	created_by: NotRequired[Optional[str]]
	disabled: bool
	enabled: bool
	error_message: NotRequired[Optional[str]]
	id: str
	is_fallback: bool
	last_used_at: NotRequired[Optional[str]]
	last_verified_at: NotRequired[Optional[str]]
	name: str
	prefix: NotRequired[Optional[str]]
	provider_id: str
	routing_mode: Literal["priority", "fallback"]
	sort_order: int
	suffix: NotRequired[Optional[str]]
	verification_status: NotRequired[Optional[str]]
	workspace_id: str

class ProviderCredentialCreateRequest(TypedDict):
	allowed_api_key_ids: NotRequired[List[str]]
	allowed_models: NotRequired[List[str]]
	enabled: NotRequired[bool]
	key: str
	name: str
	provider: str
	routing_mode: NotRequired[Literal["priority", "fallback"]]

class ProviderCredentialDeleteResponse(TypedDict):
	deleted: bool

class ProviderCredentialListResponse(TypedDict):
	data: List[ProviderCredential]
	total_count: int

class ProviderCredentialReorderRequest(TypedDict):
	key_ids: List[str]
	provider: str
	routing_mode: Literal["priority", "fallback"]

class ProviderCredentialReorderResponse(TypedDict):
	reordered: bool

class ProviderCredentialResponse(TypedDict):
	data: ProviderCredential

ProviderCredentialRoutingMode = Literal["priority", "fallback"]

class ProviderCredentialUpdateRequest(TypedDict):
	allowed_api_key_ids: NotRequired[List[str]]
	allowed_models: NotRequired[List[str]]
	enabled: NotRequired[bool]
	key: NotRequired[str]
	name: NotRequired[str]
	routing_mode: NotRequired[Literal["priority", "fallback"]]

class ProviderOptions(TypedDict):
	anthropic: NotRequired[Dict[str, Any]]
	google: NotRequired[Dict[str, Any]]
	openai: NotRequired[Dict[str, Any]]

class ProviderRoutingOptions(TypedDict):
	allow_fallbacks: NotRequired[Optional[bool]]
	data_collection: NotRequired[Optional[Literal["allow", "deny"]]]
	enforce_distillable_text: NotRequired[Optional[bool]]
	ignore: NotRequired[List[str]]
	include_alpha: NotRequired[bool]
	max_price: NotRequired[Dict[str, Any]]
	only: NotRequired[List[str]]
	order: NotRequired[List[str]]
	preferred_max_latency: NotRequired[Union[float, Dict[str, Any]]]
	preferred_min_throughput: NotRequired[Union[float, Dict[str, Any]]]
	quantizations: NotRequired[Optional[List[str]]]
	require_parameters: NotRequired[Optional[bool]]
	require_zero_data_retention: NotRequired[Optional[bool]]
	required_data_region: NotRequired[Optional[str]]
	required_execution_region: NotRequired[Optional[str]]
	sort: NotRequired[Union[str, Dict[str, Any]]]
	zdr: NotRequired[Optional[bool]]

class ProvisioningKey(TypedDict):
	created_at: NotRequired[str]
	id: NotRequired[str]
	last_used_at: NotRequired[Optional[str]]
	name: NotRequired[str]
	prefix: NotRequired[str]
	scopes: NotRequired[str]
	status: NotRequired[Literal["active", "disabled", "revoked"]]

class ProvisioningKeyDetail(TypedDict):
	created_at: NotRequired[str]
	created_by: NotRequired[str]
	id: NotRequired[str]
	last_used_at: NotRequired[Optional[str]]
	name: NotRequired[str]
	prefix: NotRequired[str]
	scopes: NotRequired[str]
	soft_blocked: NotRequired[bool]
	status: NotRequired[Literal["active", "disabled", "revoked"]]
	team_id: NotRequired[str]

class ProvisioningKeyWithValue(TypedDict):
	created_at: NotRequired[str]
	id: NotRequired[str]
	key: NotRequired[str]
	name: NotRequired[str]
	prefix: NotRequired[str]
	scopes: NotRequired[str]
	status: NotRequired[Literal["active", "disabled", "revoked"]]

class ReasoningConfig(TypedDict):
	effort: NotRequired[Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]]
	enabled: NotRequired[bool]
	max_tokens: NotRequired[int]
	mode: NotRequired[Literal["standard", "pro"]]
	summary: NotRequired[Literal["auto", "concise", "detailed"]]

RerankDocument = Union[str, Dict[str, Any]]

class RerankRequest(TypedDict):
	debug: NotRequired[DebugOptions]
	documents: Union[List[str], List[Dict[str, Any]]]
	max_chunks_per_doc: NotRequired[int]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[Dict[str, Any]]
	query: str
	rank_fields: NotRequired[List[str]]
	return_documents: NotRequired[bool]
	top_k: NotRequired[int]
	top_n: NotRequired[int]
	user: NotRequired[str]

class RerankResponse(TypedDict):
	id: NotRequired[str]
	model: NotRequired[str]
	nativeResponseId: NotRequired[Optional[str]]
	object: NotRequired[str]
	results: NotRequired[List[RerankResult]]
	usage: NotRequired[Usage]

class RerankResult(TypedDict):
	document: NotRequired[Union[str, Dict[str, Any]]]
	index: NotRequired[int]
	relevance_score: NotRequired[float]

class ResponsesInputItem(TypedDict):
	content: NotRequired[Union[str, List[Dict[str, Any]], Dict[str, Any]]]
	role: NotRequired[Literal["user", "assistant", "system", "developer"]]
	type: NotRequired[str]

class ResponsesOutputAudioPart(TypedDict):
	audio_url: NotRequired[Dict[str, Any]]
	b64_json: NotRequired[str]
	format: NotRequired[Literal["wav", "mp3", "flac", "m4a", "ogg", "pcm16", "pcm24"]]
	mime_type: NotRequired[str]
	type: Literal["output_audio"]

ResponsesOutputContentPart = Union["ResponsesOutputTextPart", "ResponsesOutputImagePart", "ResponsesOutputAudioPart"]

class ResponsesOutputImagePart(TypedDict):
	b64_json: NotRequired[str]
	image_url: NotRequired[Dict[str, Any]]
	mime_type: NotRequired[str]
	type: Literal["output_image"]

class ResponsesOutputItem(TypedDict):
	arguments: NotRequired[str]
	call_id: NotRequired[str]
	content: NotRequired[List[Union[ResponsesOutputTextPart, ResponsesOutputImagePart, ResponsesOutputAudioPart]]]
	name: NotRequired[str]
	role: NotRequired[str]
	type: NotRequired[str]

class ResponsesOutputTextPart(TypedDict):
	annotations: NotRequired[List[Dict[str, Any]]]
	text: str
	type: Literal["output_text"]

class ResponsesRequest(TypedDict):
	background: NotRequired[bool]
	debug: NotRequired[DebugOptions]
	echo_upstream_request: NotRequired[bool]
	image_config: NotRequired[ImageConfig]
	include: NotRequired[List[str]]
	input: Union[str, List[ResponsesInputItem], Dict[str, Any]]
	instructions: NotRequired[str]
	max_output_tokens: NotRequired[int]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	modalities: NotRequired[List[Literal["text", "image", "audio"]]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	previous_response_id: NotRequired[str]
	prompt_cache_key: NotRequired[Optional[str]]
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[ProviderOptions]
	reasoning: NotRequired[ReasoningConfig]
	safety_identifier: NotRequired[Optional[str]]
	service_tier: NotRequired[Literal["standard", "fast", "priority", "flex", "batch"]]
	session_id: NotRequired[str]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	temperature: NotRequired[float]
	text: NotRequired[Dict[str, Any]]
	tool_choice: NotRequired[Union[Literal["auto", "none", "required", "phaseo:datetime", "phaseo:web_search", "phaseo:web_fetch", "phaseo:subagent", "phaseo:fusion", "phaseo:search_models", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]]
	tools: NotRequired[List[Union[FunctionToolDefinition, GatewayDatetimeToolDefinition, GatewayWebSearchToolDefinition, GatewayWebFetchToolDefinition, SubagentToolDefinition, FusionToolDefinition, SearchModelsToolDefinition]]]
	top_p: NotRequired[float]
	truncation: NotRequired[Literal["auto", "disabled"]]
	usage: NotRequired[bool]
	user: NotRequired[str]

class ResponsesResponse(TypedDict):
	content: NotRequired[List[Dict[str, Any]]]
	cost_cents: NotRequired[int]
	cost_nanos: NotRequired[float]
	created: NotRequired[int]
	currency: NotRequired[str]
	finish_reason: NotRequired[Optional[str]]
	id: NotRequired[str]
	meta: NotRequired[OcrResponse]
	model: NotRequired[str]
	nativeResponseId: NotRequired[Optional[str]]
	object: NotRequired[str]
	output: NotRequired[List[ResponsesOutputItem]]
	output_items: NotRequired[List[ResponsesOutputItem]]
	pricing_lines: NotRequired[List[OcrResponse]]
	provider: NotRequired[str]
	provider_id: NotRequired[str]
	role: NotRequired[str]
	status: NotRequired[Literal["completed", "failed", "incomplete"]]
	stop_reason: NotRequired[str]
	type: NotRequired[str]
	usage: NotRequired[Usage]

class SearchModelsToolDefinition(TypedDict):
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["phaseo:search_models"]

class ServerToolUsage(TypedDict):
	advisor_requests: NotRequired[int]
	apply_patch_requests: NotRequired[int]
	datetime_requests: NotRequired[int]
	fusion_requests: NotRequired[int]
	image_generation_requests: NotRequired[int]
	search_models_requests: NotRequired[int]
	subagent_requests: NotRequired[int]
	web_fetch_requests: NotRequired[int]
	web_search_requests: NotRequired[int]

class SubagentToolDefinition(TypedDict):
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["phaseo:subagent"]

class SupportedParameterDetails(TypedDict):
	pass

class TextContentPart(TypedDict):
	text: str
	type: Literal["text"]

TextGenerateTool = Union["FunctionToolDefinition", "GatewayDatetimeToolDefinition", "GatewayWebSearchToolDefinition", "GatewayWebFetchToolDefinition", "SubagentToolDefinition", "FusionToolDefinition", "SearchModelsToolDefinition"]

class TextModerationInput(TypedDict):
	text: str
	type: Literal["text"]

TextToolChoice = Union[Literal["auto", "none", "required", "phaseo:datetime", "phaseo:web_search", "phaseo:web_fetch", "phaseo:subagent", "phaseo:fusion", "phaseo:search_models", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]

class ToolCall(TypedDict):
	function: Dict[str, Any]
	id: str
	type: Literal["function"]

class ToolCallContentPart(TypedDict):
	function: Dict[str, Any]
	id: str
	type: Literal["tool_call"]

class UpdatedResponse(TypedDict):
	data: Dict[str, Any]

class Usage(TypedDict):
	completion_tokens: NotRequired[int]
	prompt_tokens: NotRequired[int]
	server_tool_use: NotRequired[ServerToolUsage]
	total_tokens: NotRequired[int]

class VideoBillingSummary(TypedDict):
	billable: NotRequired[bool]
	billed_at: NotRequired[str]
	charge_reason: NotRequired[Optional[str]]
	charged: NotRequired[Optional[bool]]
	currency: NotRequired[str]
	estimated_nanos: NotRequired[Optional[int]]
	estimated_provider_cost: NotRequired[Optional[str]]
	estimated_user_cost: NotRequired[Optional[str]]
	reservation_id: NotRequired[Optional[str]]
	reservation_status: NotRequired[Optional[str]]
	reserved_nanos: NotRequired[Optional[int]]
	settled_provider_cost: NotRequired[Optional[str]]
	settled_user_cost: NotRequired[Optional[str]]
	state: NotRequired[Literal["pending", "estimated", "settled", "void"]]
	total_nanos: NotRequired[Optional[int]]

class VideoContentPart(TypedDict):
	type: Literal["input_video"]
	video_url: str

class VideoDeleteResponse(TypedDict):
	deleted: NotRequired[bool]
	id: NotRequired[str]
	object: NotRequired[str]

class VideoGenerationRequest(TypedDict):
	aspect_ratio: NotRequired[str]
	compression_quality: NotRequired[int]
	duration: NotRequired[int]
	enhance_prompt: NotRequired[bool]
	frame_images: NotRequired[List[Dict[str, Any]]]
	generate_audio: NotRequired[bool]
	input_audio_duration: NotRequired[float]
	input_references: NotRequired[List[Union[Dict[str, Any], Dict[str, Any]]]]
	input_video_duration: NotRequired[float]
	model: str
	negative_prompt: NotRequired[str]
	output: NotRequired[VideoOutputConfig]
	person_generation: NotRequired[str]
	prompt: str
	provider: NotRequired[ProviderRoutingOptions]
	provider_options: NotRequired[SupportedParameterDetails]
	provider_params: NotRequired[Dict[str, Any]]
	resize_mode: NotRequired[str]
	resolution: NotRequired[str]
	sample_count: NotRequired[int]
	seed: NotRequired[int]
	size: NotRequired[str]
	webhook: NotRequired[Dict[str, Any]]

class VideoGenerationResponse(TypedDict):
	asset: NotRequired[Optional[Dict[str, Any]]]
	audio: NotRequired[bool]
	billing: NotRequired[VideoBillingSummary]
	cancel_url: NotRequired[Optional[str]]
	completed_at: NotRequired[Optional[Union[int, str]]]
	content_url: NotRequired[str]
	created_at: NotRequired[Union[int, str]]
	download_url: NotRequired[Optional[str]]
	error: NotRequired[Optional[Any]]
	expires_at: NotRequired[Optional[int]]
	generation_id: NotRequired[Optional[str]]
	id: NotRequired[str]
	last_webhook_dispatched_at: NotRequired[Optional[str]]
	last_webhook_progress: NotRequired[Optional[float]]
	last_webhook_progress_at: NotRequired[Optional[str]]
	lifecycle_status: NotRequired[Literal["pending", "running", "completed", "failed", "cancelled", "expired"]]
	model: NotRequired[str]
	native_video_id: NotRequired[Optional[str]]
	next_webhook_retry_at: NotRequired[Optional[str]]
	object: NotRequired[str]
	output_access: NotRequired[Literal["bytes", "signed_url", "both"]]
	outputs: NotRequired[List[VideoOutput]]
	poll_after_seconds: NotRequired[int]
	polling_url: NotRequired[str]
	progress: NotRequired[Optional[int]]
	progress_source: NotRequired[str]
	provider: NotRequired[str]
	request_id: NotRequired[str]
	seconds: NotRequired[float]
	session_id: NotRequired[str]
	size: NotRequired[str]
	started_at: NotRequired[Optional[Union[int, str]]]
	status: NotRequired[Literal["queued", "processing", "completed", "failed", "cancelled", "expired"]]
	usage: NotRequired[Dict[str, Any]]
	webhook: NotRequired[AsyncWebhookPublicState]
	websocket_url: NotRequired[str]

VideoInputReference = Union[Dict[str, Any], Dict[str, Any]]

class VideoListResponse(TypedDict):
	data: NotRequired[List[VideoGenerationResponse]]
	first_id: NotRequired[Optional[str]]
	has_more: NotRequired[bool]
	last_id: NotRequired[Optional[str]]
	object: NotRequired[str]

class VideoModelCapability(TypedDict):
	input_types: NotRequired[List[str]]
	model: NotRequired[str]
	name: NotRequired[str]
	output_types: NotRequired[List[str]]
	pricing: NotRequired[Dict[str, Any]]
	providers: NotRequired[List[VideoModelProviderCapability]]
	status: NotRequired[str]
	supported_parameters: NotRequired[List[str]]
	supported_parameters_detail: NotRequired[SupportedParameterDetails]
	supported_params: NotRequired[List[str]]
	supported_params_detail: NotRequired[SupportedParameterDetails]

class VideoModelProviderCapability(TypedDict):
	id: NotRequired[str]
	supported_parameters: NotRequired[List[str]]
	supported_parameters_detail: NotRequired[SupportedParameterDetails]
	supported_params: NotRequired[List[str]]
	supported_params_detail: NotRequired[SupportedParameterDetails]

class VideoModelsResponse(TypedDict):
	data: NotRequired[List[VideoModelCapability]]
	object: NotRequired[str]

class VideoOutput(TypedDict):
	bytes_available: NotRequired[bool]
	content_url: NotRequired[str]
	download_url: NotRequired[str]
	expires_at: NotRequired[int]
	index: NotRequired[int]
	mime_type: NotRequired[str]

class VideoOutputConfig(TypedDict):
	access: NotRequired[Literal["bytes", "signed_url", "both"]]

class WebhookEndpoint(TypedDict):
	createdAt: NotRequired[Optional[str]]
	createdBy: NotRequired[Optional[str]]
	deletedAt: NotRequired[Optional[str]]
	events: List[str]
	hasSecret: bool
	id: str
	name: str
	status: Literal["active", "disabled", "deleted"]
	updatedAt: NotRequired[Optional[str]]
	url: str
	workspaceId: str

class WebhookEndpointCreateRequest(TypedDict):
	events: NotRequired[List[str]]
	name: NotRequired[str]
	url: str

class WebhookEndpointDeleteResponse(TypedDict):
	deleted: Literal[true]
	id: str
	object: Literal["webhook_endpoint"]

class WebhookEndpointInput(TypedDict):
	events: NotRequired[List[str]]
	name: NotRequired[str]
	url: NotRequired[str]

class WebhookEndpointListResponse(TypedDict):
	data: List[WebhookEndpoint]
	object: Literal["list"]

class WebhookEndpointSecretResponse(TypedDict):
	createdAt: NotRequired[Optional[str]]
	createdBy: NotRequired[Optional[str]]
	deletedAt: NotRequired[Optional[str]]
	events: List[str]
	hasSecret: bool
	id: str
	name: str
	signing_secret: str
	status: Literal["active", "disabled", "deleted"]
	updatedAt: NotRequired[Optional[str]]
	url: str
	workspaceId: str

class WebhookEndpointUpdateRequest(TypedDict):
	events: NotRequired[List[str]]
	name: NotRequired[str]
	status: NotRequired[Literal["active", "disabled"]]
	url: NotRequired[str]

class Workspace(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	id: str
	name: Optional[str]
	slug: NotRequired[Optional[str]]
	updated_at: Optional[str]

class WorkspaceActivityEntry(TypedDict):
	cost_cents: float
	endpoint: Optional[str]
	latency_ms: Optional[int]
	model: Optional[str]
	provider: Optional[str]
	request_id: Optional[str]
	timestamp: Optional[str]
	usage: Optional[Dict[str, Any]]

class WorkspaceActivityResponse(TypedDict):
	activity: List[WorkspaceActivityEntry]
	limit: int
	offset: int
	ok: Literal[true]
	period_days: int
	total: int
	total_cost_cents: float

class WorkspaceApp(TypedDict):
	app_key: str
	category: Optional[str]
	created_at: Optional[str]
	docs_url: Optional[str]
	id: str
	image_url: Optional[str]
	is_active: bool
	is_managed: bool
	is_public: bool
	last_seen: Optional[str]
	title: str
	url: Optional[str]

class WorkspaceAppListResponse(TypedDict):
	data: List[WorkspaceApp]
	limit: int
	offset: int
	total_count: int

class WorkspaceAppMergeRequest(TypedDict):
	target_app_id: str

class WorkspaceAppMergeResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceAppResponse(TypedDict):
	data: WorkspaceApp

class WorkspaceAppUpdateRequest(TypedDict):
	category: NotRequired[Optional[str]]
	docs_url: NotRequired[Optional[str]]
	image_url: NotRequired[Optional[str]]
	is_active: NotRequired[bool]
	is_public: NotRequired[bool]
	title: NotRequired[str]
	url: NotRequired[Optional[str]]

WorkspaceAssignableRole = Literal["admin", "member"]

class WorkspaceAuditEvent(TypedDict):
	action: str
	actor: NotRequired[Optional[WorkspaceAuditEventActor]]
	actor_user_id: NotRequired[Optional[str]]
	created_at: str
	id: str
	metadata: WorkspaceAuditEventMetadata
	request_id: NotRequired[Optional[str]]
	target_id: str
	target_name: NotRequired[Optional[str]]
	target_type: str
	workspace_id: str

class WorkspaceAuditEventActor(TypedDict):
	display_name: NotRequired[Optional[str]]
	email: NotRequired[Optional[str]]

class WorkspaceAuditEventLimits(TypedDict):
	dailyCostNanos: NotRequired[int]
	dailyRequests: NotRequired[int]
	monthlyCostNanos: NotRequired[int]
	monthlyRequests: NotRequired[int]
	softBlocked: NotRequired[bool]
	weeklyCostNanos: NotRequired[int]
	weeklyRequests: NotRequired[int]

class WorkspaceAuditEventListResponse(TypedDict):
	data: List[WorkspaceAuditEvent]
	has_more: bool
	next_cursor: NotRequired[Optional[str]]

class WorkspaceAuditEventMetadata(TypedDict):
	accessTemplate: NotRequired[str]
	changedFields: NotRequired[List[str]]
	expiresAt: NotRequired[Optional[str]]
	limits: NotRequired[WorkspaceAuditEventLimits]
	prefix: NotRequired[Optional[str]]
	previousKeyExpiresAt: NotRequired[Optional[str]]
	replacementKeyId: NotRequired[str]
	replacementKeyName: NotRequired[str]
	status: NotRequired[str]

class WorkspaceAutoTopUpSettings(TypedDict):
	amount_nanos: int
	balance_threshold_nanos: int
	enabled: bool
	payment_method_id: Optional[str]

class WorkspaceAutoTopUpUpdate(TypedDict):
	amount_nanos: NotRequired[int]
	balance_threshold_nanos: NotRequired[int]
	enabled: bool
	payment_method_id: NotRequired[Optional[str]]

class WorkspaceBudget(TypedDict):
	created_at: str
	created_by: NotRequired[Optional[str]]
	exceeded: bool
	id: str
	interval: Literal["daily", "weekly", "monthly", "lifetime"]
	limit: float
	limit_nanos: int
	remaining: float
	remaining_nanos: int
	reset_at: NotRequired[Optional[str]]
	updated_at: str
	usage: float
	usage_nanos: int
	window_start: NotRequired[Optional[str]]
	workspace_id: str

class WorkspaceBudgetDeleteResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceBudgetInput(TypedDict):
	interval: Literal["daily", "weekly", "monthly", "lifetime"]
	limit: float

WorkspaceBudgetInterval = Literal["daily", "weekly", "monthly", "lifetime"]

class WorkspaceBudgetListResponse(TypedDict):
	data: List[WorkspaceBudget]

class WorkspaceBudgetResponse(TypedDict):
	data: WorkspaceBudget

class WorkspaceBudgetUpdateInput(TypedDict):
	interval: NotRequired[Literal["daily", "weekly", "monthly", "lifetime"]]
	limit: NotRequired[float]

class WorkspaceCreateRequest(TypedDict):
	name: str
	slug: NotRequired[str]

class WorkspaceDepartment(TypedDict):
	color: NotRequired[str]
	created_at: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	directory_name: NotRequired[Optional[str]]
	icon: NotRequired[str]
	id: str
	name: str
	name_overridden: NotRequired[bool]
	source_id: NotRequired[Optional[str]]
	source_type: NotRequired[Literal["manual", "scim_group"]]
	updated_at: NotRequired[Optional[str]]

class WorkspaceDepartmentCreateRequest(TypedDict):
	color: NotRequired[Literal["blue", "emerald", "amber", "rose", "violet", "slate", "cyan", "teal", "lime", "yellow", "orange", "red", "pink", "fuchsia", "indigo", "sky", "green", "purple"]]
	description: NotRequired[Optional[str]]
	icon: NotRequired[Literal["users", "briefcase", "megaphone", "code", "palette", "headphones", "landmark", "scale", "heart-pulse", "globe", "flask", "graduation-cap", "shield-check", "shopping-bag", "wrench", "truck", "handshake", "chart"]]
	name: str

class WorkspaceDepartmentInput(TypedDict):
	color: NotRequired[Literal["blue", "emerald", "amber", "rose", "violet", "slate", "cyan", "teal", "lime", "yellow", "orange", "red", "pink", "fuchsia", "indigo", "sky", "green", "purple"]]
	description: NotRequired[Optional[str]]
	icon: NotRequired[Literal["users", "briefcase", "megaphone", "code", "palette", "headphones", "landmark", "scale", "heart-pulse", "globe", "flask", "graduation-cap", "shield-check", "shopping-bag", "wrench", "truck", "handshake", "chart"]]
	name: NotRequired[str]

class WorkspaceDepartmentListResponse(TypedDict):
	data: List[WorkspaceDepartment]

class WorkspaceDepartmentMember(TypedDict):
	department_id: str
	is_primary: bool
	position: Literal["member", "lead"]
	user_id: str

class WorkspaceDepartmentMemberRequest(TypedDict):
	position: NotRequired[Literal["member", "lead"]]
	primary: NotRequired[bool]

class WorkspaceDepartmentMemberResponse(TypedDict):
	data: WorkspaceDepartmentMember

class WorkspaceDepartmentResponse(TypedDict):
	data: WorkspaceDepartment

class WorkspaceDepartmentUpdateRequest(TypedDict):
	color: NotRequired[Literal["blue", "emerald", "amber", "rose", "violet", "slate", "cyan", "teal", "lime", "yellow", "orange", "red", "pink", "fuchsia", "indigo", "sky", "green", "purple"]]
	description: NotRequired[Optional[str]]
	icon: NotRequired[Literal["users", "briefcase", "megaphone", "code", "palette", "headphones", "landmark", "scale", "heart-pulse", "globe", "flask", "graduation-cap", "shield-check", "shopping-bag", "wrench", "truck", "handshake", "chart"]]
	name: NotRequired[str]

class WorkspaceDirectoryMember(TypedDict):
	access_source: str
	department: Optional[WorkspaceDepartment]
	department_override_enabled: bool
	department_override_id: Optional[str]
	department_source: str
	directory_department: NotRequired[Optional[str]]
	display_name: str
	effective_role: Literal["owner", "admin", "member"]
	email: NotRequired[Optional[str]]
	joined_at: NotRequired[Optional[str]]
	role_override: Optional[Literal["admin", "member"]]
	status: Literal["active", "suspended"]
	user_id: str
	workspace_role: str

class WorkspaceDirectoryMemberUpdateRequest(TypedDict):
	access_role: NotRequired[Optional[Literal["directory", "admin", "member"]]]
	department_id: NotRequired[Optional[str]]
	department_mode: NotRequired[Literal["directory", "department", "none"]]
	department_position: NotRequired[Literal["member", "lead"]]

class WorkspaceDirectoryResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceGroupMapping(TypedDict):
	access_role: Literal["member", "admin"]
	created_at: NotRequired[Optional[str]]
	department_id: str
	department_position: Literal["member", "lead"]
	id: str
	scim_group_id: str
	updated_at: NotRequired[Optional[str]]

class WorkspaceGroupMappingCreateRequest(TypedDict):
	access_role: NotRequired[Literal["member", "admin"]]
	department_id: str
	department_position: NotRequired[Literal["member", "lead"]]
	scim_group_id: str

class WorkspaceGroupMappingListResponse(TypedDict):
	data: List[WorkspaceGroupMapping]

class WorkspaceGroupMappingResponse(TypedDict):
	data: WorkspaceGroupMapping

class WorkspaceGroupMappingUpdateRequest(TypedDict):
	access_role: NotRequired[Literal["member", "admin"]]
	department_position: NotRequired[Literal["member", "lead"]]

class WorkspaceInvite(TypedDict):
	created_at: NotRequired[str]
	creator_user_id: str
	expires_at: NotRequired[Optional[str]]
	id: str
	max_uses: NotRequired[Optional[int]]
	role: Literal["admin", "member"]
	token_preview: NotRequired[Optional[str]]
	uses_count: NotRequired[int]
	workspace_id: str

class WorkspaceInviteCreateRequest(TypedDict):
	expires_in_days: NotRequired[int]
	max_uses: NotRequired[Optional[int]]
	role: NotRequired[Literal["admin", "member"]]

class WorkspaceInviteCreateResponse(TypedDict):
	data: WorkspaceInvite
	token: str

class WorkspaceInviteListResponse(TypedDict):
	data: List[WorkspaceInvite]
	total_count: int

class WorkspaceJoinRequest(TypedDict):
	created_at: NotRequired[str]
	decided_at: NotRequired[Optional[str]]
	decided_by: NotRequired[Optional[str]]
	id: str
	invite_id: NotRequired[Optional[str]]
	requester_user_id: str
	status: Literal["pending", "approved", "denied"]
	workspace_id: str

class WorkspaceJoinRequestListResponse(TypedDict):
	data: List[WorkspaceJoinRequest]
	total_count: int

class WorkspaceJoinRequestResponse(TypedDict):
	data: WorkspaceJoinRequest

WorkspaceJoinRequestStatus = Literal["pending", "approved", "denied"]

class WorkspaceListResponse(TypedDict):
	data: List[Workspace]
	total_count: int

class WorkspaceLowBalanceEmailSettings(TypedDict):
	enabled: bool
	threshold_usd: float

class WorkspaceLowBalanceEmailUpdate(TypedDict):
	enabled: bool
	threshold_usd: NotRequired[float]

class WorkspaceMember(TypedDict):
	display_name: NotRequired[Optional[str]]
	joined_at: NotRequired[Optional[str]]
	role: Literal["owner", "admin", "member"]
	user_id: str
	workspace_id: str

class WorkspaceMemberAddResponse(TypedDict):
	added_count: int
	data: List[WorkspaceMember]

class WorkspaceMemberBulkRequest(TypedDict):
	role: NotRequired[Literal["admin", "member"]]
	user_ids: List[str]

class WorkspaceMemberListResponse(TypedDict):
	data: List[WorkspaceMember]
	total_count: int

class WorkspaceMemberRemoveRequest(TypedDict):
	user_ids: List[str]

class WorkspaceMemberRemoveResponse(TypedDict):
	removed_count: int

class WorkspaceMemberResponse(TypedDict):
	data: WorkspaceMember

class WorkspaceMemberRoleUpdateRequest(TypedDict):
	role: Literal["admin", "member"]

class WorkspaceNotificationDestination(TypedDict):
	created_at: NotRequired[Optional[str]]
	id: str
	name: str
	status: Literal["active", "disabled"]
	target_preview: str
	type: Literal["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"]
	updated_at: NotRequired[Optional[str]]

class WorkspaceNotificationDestinationCreateRequest(TypedDict):
	name: str
	target: str
	type: Literal["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"]

class WorkspaceNotificationDestinationListResponse(TypedDict):
	data: List[WorkspaceNotificationDestination]

class WorkspaceNotificationDestinationResponse(TypedDict):
	data: WorkspaceNotificationDestination

class WorkspaceNotificationDestinationTestRequest(TypedDict):
	target: str
	type: Literal["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"]

WorkspaceNotificationDestinationType = Literal["email", "discord", "discord_webhook", "slack", "microsoft_teams", "custom_webhook"]

class WorkspaceNotificationEmailPreferences(TypedDict):
	auto_top_up_failure: bool
	model_deprecation: bool
	payment_method_expiring: bool

class WorkspaceNotificationEmailPreferencesUpdate(TypedDict):
	auto_top_up_failure: NotRequired[bool]
	model_deprecation: NotRequired[bool]
	payment_method_expiring: NotRequired[bool]

WorkspaceNotificationEventKind = Literal["low_balance", "auto_top_up_failed", "payment_method_expiring", "model_deprecation"]

class WorkspaceNotificationRoute(TypedDict):
	destination_ids: List[str]
	event_kind: Literal["low_balance", "auto_top_up_failed", "payment_method_expiring", "model_deprecation"]

class WorkspaceNotificationRouteMap(TypedDict):
	auto_top_up_failed: List[str]
	low_balance: List[str]
	model_deprecation: List[str]
	payment_method_expiring: List[str]

class WorkspaceNotificationRouteResponse(TypedDict):
	data: WorkspaceNotificationRoute

class WorkspaceNotificationRoutesResponse(TypedDict):
	data: WorkspaceNotificationRouteMap

class WorkspaceNotificationRouteUpdateRequest(TypedDict):
	destination_ids: List[str]

class WorkspaceNotificationSettings(TypedDict):
	auto_top_up: WorkspaceAutoTopUpSettings
	email_preferences: WorkspaceNotificationEmailPreferences
	low_balance_email: WorkspaceLowBalanceEmailSettings

class WorkspaceNotificationSettingsResponse(TypedDict):
	data: WorkspaceNotificationSettings

class WorkspaceNotificationSettingsUpdateRequest(TypedDict):
	auto_top_up: NotRequired[WorkspaceAutoTopUpUpdate]
	email_preferences: NotRequired[WorkspaceNotificationEmailPreferencesUpdate]
	low_balance_email: NotRequired[WorkspaceLowBalanceEmailUpdate]

class WorkspaceNotificationTestResponse(TypedDict):
	data: Dict[str, Any]

WorkspaceProviderRestrictionMode = Literal["none", "allowlist", "blocklist"]

class WorkspaceResponse(TypedDict):
	data: Workspace

WorkspaceRole = Literal["owner", "admin", "member"]

WorkspaceRoutingMode = Literal["balanced", "price", "latency", "throughput"]

class WorkspaceScimAuditResponse(TypedDict):
	data: List[WorkspaceScimEvent]

class WorkspaceScimEndpoint(TypedDict):
	created_at: NotRequired[Optional[str]]
	enabled: bool
	id: str
	updated_at: NotRequired[Optional[str]]

class WorkspaceScimEndpointResponse(TypedDict):
	data: WorkspaceScimEndpoint

class WorkspaceScimEvent(TypedDict):
	action: NotRequired[str]
	correlation_id: NotRequired[Optional[str]]
	created_at: NotRequired[str]
	detail: NotRequired[Optional[Dict[str, Any]]]
	http_status: NotRequired[int]
	id: NotRequired[str]
	outcome: NotRequired[str]
	request_id: NotRequired[Optional[str]]
	resource_id: NotRequired[Optional[str]]
	resource_type: NotRequired[Optional[str]]
	scim_type: NotRequired[Optional[str]]

class WorkspaceScimResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceScimToken(TypedDict):
	created_at: NotRequired[Optional[str]]
	expires_at: NotRequired[Optional[str]]
	id: str
	label: str
	last_used_at: NotRequired[Optional[str]]
	revoked_at: NotRequired[Optional[str]]
	token_prefix: str

class WorkspaceScimTokenCreateRequest(TypedDict):
	expires_at: NotRequired[Optional[str]]
	label: NotRequired[str]

class WorkspaceScimTokenCreateResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceScimUpdateRequest(TypedDict):
	enabled: bool

class WorkspaceSettings(TypedDict):
	alpha_channel_enabled: NotRequired[Optional[bool]]
	beta_channel_enabled: NotRequired[Optional[bool]]
	byok_fallback_enabled: NotRequired[Optional[bool]]
	io_logging_enabled: NotRequired[Optional[bool]]
	io_logging_include_provider_payloads: NotRequired[Optional[bool]]
	privacy_enable_free_may_publish_prompts: NotRequired[Optional[bool]]
	privacy_enable_free_may_train: NotRequired[Optional[bool]]
	privacy_enable_input_output_logging: NotRequired[Optional[bool]]
	privacy_enable_paid_may_train: NotRequired[Optional[bool]]
	privacy_zdr_only: NotRequired[Optional[bool]]
	provider_restriction_enforce_allowed: NotRequired[Optional[bool]]
	provider_restriction_mode: NotRequired[Optional[Any]]
	provider_restriction_provider_ids: NotRequired[Optional[List[str]]]
	response_healing_enabled: NotRequired[Optional[bool]]
	response_healing_locked: NotRequired[Optional[bool]]
	response_healing_mode: NotRequired[Optional[Literal["safe", "strict"]]]
	routing_mode: NotRequired[Optional[Any]]
	updated_at: NotRequired[Optional[str]]
	workspace_id: str

class WorkspaceSettingsResponse(TypedDict):
	data: WorkspaceSettings

class WorkspaceSettingsUpdateRequest(TypedDict):
	alpha_channel_enabled: NotRequired[bool]
	beta_channel_enabled: NotRequired[bool]
	byok_fallback_enabled: NotRequired[bool]
	io_logging_enabled: NotRequired[bool]
	io_logging_include_provider_payloads: NotRequired[bool]
	privacy_enable_free_may_publish_prompts: NotRequired[bool]
	privacy_enable_free_may_train: NotRequired[bool]
	privacy_enable_input_output_logging: NotRequired[bool]
	privacy_enable_paid_may_train: NotRequired[bool]
	privacy_zdr_only: NotRequired[bool]
	provider_restriction_enforce_allowed: NotRequired[bool]
	provider_restriction_mode: NotRequired[Literal["none", "allowlist", "blocklist"]]
	provider_restriction_provider_ids: NotRequired[List[str]]
	response_healing_enabled: NotRequired[bool]
	response_healing_locked: NotRequired[bool]
	response_healing_mode: NotRequired[Literal["safe", "strict"]]
	routing_mode: NotRequired[Literal["balanced", "price", "latency", "throughput"]]

class WorkspaceSsoResponse(TypedDict):
	data: WorkspaceSsoSettings

class WorkspaceSsoSettings(TypedDict):
	domains: List[str]
	enabled: bool
	enforced: Literal[false]
	mode: Literal["none", "saml", "custom_oidc"]
	provider_identifier: Optional[str]

class WorkspaceSsoUpdateRequest(TypedDict):
	domains: NotRequired[List[str]]
	enabled: bool
	enforced: NotRequired[Literal[false]]
	mode: Literal["none", "saml", "custom_oidc"]
	provider_identifier: NotRequired[Optional[str]]

class WorkspaceUpdateRequest(TypedDict):
	name: NotRequired[str]
	slug: NotRequired[str]

models___all__ = ["ActivityEntry", "ActivityResponse", "AnalyticsAccessTokenRequiredResponse", "AnalyticsNotImplementedResponse", "AnalyticsResponse", "AnthropicContentBlock", "AnthropicMessage", "AnthropicMessagesRequest", "AnthropicMessagesResponse", "AnthropicTool", "AnthropicUsage", "ApiKey", "ApiKeyCreateRequest", "ApiKeyLimitBucket", "ApiKeyLimitInputBucket", "ApiKeyLimitInputWindows", "ApiKeyLimitWindows", "ApiKeyListResponse", "ApiKeyResponse", "ApiKeyRotateRequest", "ApiKeyRotateResponse", "ApiKeyScopeValue", "ApiKeyUpdateRequest", "ApiKeyUsageBucket", "ApiKeyUsageWindows", "ApiKeyWithValue", "ApiKeyWithValueResponse", "AsyncJobWebSocketClientEvent", "AsyncJobWebSocketServerEvent", "AsyncJobWebSocketUpgradeRequiredResponse", "AsyncWebhookDeliveryAttempt", "AsyncWebhookDeliverySummary", "AsyncWebhookPublicState", "AudioContentPart", "AudioSpeechRequest", "AudioTranscriptionRequest", "AudioTranscriptionResponse", "AudioTranslationRequest", "AudioTranslationResponse", "BatchBillingSummary", "BatchListResponse", "BatchModelCapability", "BatchModelProviderCapability", "BatchModelsResponse", "BatchProviderCapability", "BatchRequest", "BatchRequestCounts", "BatchRequestItem", "BatchRequestRow", "BatchResponse", "BenchmarkId", "CacheControl", "ChatAudioOutputPart", "ChatChoice", "ChatCompletionsRequest", "ChatCompletionsResponse", "ChatImageOutputPart", "ChatMessage", "CreditsResponse", "DataContributionCategories", "DataContributionClassifier", "DataContributionClassifierCreateRequest", "DataContributionClassifierDeleteResponse", "DataContributionClassifierInput", "DataContributionClassifierResponse", "DataContributionClassifierUpdateRequest", "DataContributionConsentRequest", "DataContributionConsentResponse", "DataContributionOverviewResponse", "DataModel", "DataModelOrganisation", "DebugOptions", "DeletedResponse", "DynamicRoute", "DynamicRouteAction", "DynamicRouteCondition", "DynamicRouteConfig", "DynamicRouteCreateRequest", "DynamicRouteDeleteResponse", "DynamicRouteDeployResponse", "DynamicRouteEdge", "DynamicRouteKeysResponse", "DynamicRouteKeysUpdateRequest", "DynamicRouteListResponse", "DynamicRouteNode", "DynamicRouteResponse", "DynamicRouteRule", "DynamicRouteUpdateRequest", "DynamicRouteVersion", "Embedding", "EmbeddingsMultimodalInput", "EmbeddingsRequest", "EmbeddingsResponse", "EndpointCatalogueEntry", "EndpointCatalogueResponse", "ErrorFailureSampleItem", "ErrorProviderCandidateDiagnostics", "ErrorProviderEnablementDiagnostics", "ErrorProviderFailureDiagnostics", "ErrorResponse", "ErrorRoutingDiagnostics", "ErrorUpstreamError", "FileResponse", "FileUploadRequest", "FunctionToolDefinition", "FusionToolDefinition", "GatewayCapabilities", "GatewayCapabilityStatus", "GatewayDatetimeToolDefinition", "GatewayFeedback", "GatewayFeedbackCreateRequest", "GatewayFeedbackListResponse", "GatewayFeedbackResponse", "GatewayFeedbackSummaryResponse", "GatewayFeedbackSummaryRow", "GatewayModalities", "GatewayModelLifecycle", "GatewayModelLimits", "GatewayModelOffer", "GatewayModelOrganization", "GatewayModelsResponse", "GatewayObservabilityEvent", "GatewayObservabilityEventCreateRequest", "GatewayObservabilityEventListResponse", "GatewayObservabilityEventResponse", "GatewayPricing", "GatewayPricingMeter", "GatewayProviderAvailabilityReason", "GatewayRequestLog", "GatewayRequestLogListResponse", "GatewayRequestLogResponse", "GatewayRoutingStatus", "GatewayWebFetchToolDefinition", "GatewayWebSearchToolDefinition", "GenerationResponse", "Guardrail", "GuardrailBudgetInput", "GuardrailCreateRequest", "GuardrailDeleteResponse", "GuardrailDetailResponse", "GuardrailKeyAddResponse", "GuardrailKeyAssignment", "GuardrailKeyIdsReplaceRequest", "GuardrailKeyIdsRequest", "GuardrailKeyListResponse", "GuardrailKeySetResponse", "GuardrailListResponse", "GuardrailMemberAddResponse", "GuardrailMemberAssignment", "GuardrailMemberListResponse", "GuardrailPolicyInput", "GuardrailRemoveResponse", "GuardrailResponse", "GuardrailUpdateRequest", "GuardrailUserIdsRequest", "Image", "ImageConfig", "ImageContentPart", "ImageModerationInput", "ImagesEditRequest", "ImagesEditResponse", "ImagesGenerationRequest", "ImagesGenerationResponse", "InvalidRequestResponse", "KeyInvalidateResponse", "KnownModelId", "ListFilesResponse", "ManagementKeyCollectionResponse", "ManagementKeyCreateRequest", "ManagementKeyCreateResponse", "ManagementKeyDeleteResponse", "ManagementKeyDetailResponse", "ManagementKeyListResponse", "ManagementKeyRuntime", "ManagementKeyRuntimeCreated", "ManagementKeyRuntimeCreateRequest", "ManagementKeyRuntimeCreateResponse", "ManagementKeyRuntimeDeleteResponse", "ManagementKeyRuntimeResponse", "ManagementKeyRuntimeUpdateRequest", "ManagementKeyUpdateRequest", "ManagementKeyUpdateResponse", "MessageContentPart", "Model", "ModelAvailability", "ModelEndpointCapability", "ModelEndpointsResponse", "ModelId", "ModelLifecycle", "ModelProviderAvailability", "ModerationCategories", "ModerationCategoryScores", "ModerationResult", "ModerationsRequest", "ModerationsResponse", "MusicGenerateRequest", "MusicGenerateResponse", "NotImplementedResponse", "OAuthClient", "OAuthClientCreateRequest", "OAuthClientCreateResponse", "OAuthClientDeleteResponse", "OAuthClientInput", "OAuthClientListResponse", "OAuthClientSecretResponse", "OAuthClientUpdateRequest", "ObservabilityDestination", "ObservabilityDestinationCreateRequest", "ObservabilityDestinationListResponse", "ObservabilityDestinationPolicyInput", "ObservabilityDestinationResponse", "ObservabilityDestinationType", "ObservabilityDestinationUpdateRequest", "ObservabilityKeyFilter", "ObservabilityLoggingPolicy", "ObservabilityLoggingPolicyResponse", "ObservabilityLoggingPolicyUpdateRequest", "ObservabilityRule", "ObservabilityRuleGroup", "OcrRequest", "OcrResponse", "OrganisationId", "OrganisationIdList", "ParseBlock", "ParseBoundingBox", "ParseImage", "ParsePage", "ParseRequest", "ParseResponse", "Preset", "PresetConfig", "PresetCreateRequest", "PresetCreateResponse", "PresetForkRequest", "PresetListResponse", "PresetPublisher", "PresetPublisherResponse", "PresetPublisherUpdateRequest", "PresetResponse", "PresetTestRun", "PresetTestRunCreateRequest", "PresetTestRunDetailResponse", "PresetTestRunListResponse", "PresetTestRunResponse", "PresetTestRunUpdateRequest", "PresetUpdateRequest", "PresetUpstreamApplyRequest", "PresetUpstreamApplyResponse", "PresetVersion", "PresetVersioningMethod", "PresetVersionListResponse", "PresetVersionPublishRequest", "PresetVersionResponse", "PresetVisibility", "PrivateModel", "PrivateModelCreateRequest", "PrivateModelDeleteResponse", "PrivateModelListResponse", "PrivateModelResponse", "PrivateModelUpdateRequest", "Provider", "ProviderCredential", "ProviderCredentialCreateRequest", "ProviderCredentialDeleteResponse", "ProviderCredentialListResponse", "ProviderCredentialReorderRequest", "ProviderCredentialReorderResponse", "ProviderCredentialResponse", "ProviderCredentialRoutingMode", "ProviderCredentialUpdateRequest", "ProviderOptions", "ProviderRoutingOptions", "ProvisioningKey", "ProvisioningKeyDetail", "ProvisioningKeyWithValue", "ReasoningConfig", "RerankDocument", "RerankRequest", "RerankResponse", "RerankResult", "ResponsesInputItem", "ResponsesOutputAudioPart", "ResponsesOutputContentPart", "ResponsesOutputImagePart", "ResponsesOutputItem", "ResponsesOutputTextPart", "ResponsesRequest", "ResponsesResponse", "SearchModelsToolDefinition", "ServerToolUsage", "SubagentToolDefinition", "SupportedParameterDetails", "TextContentPart", "TextGenerateTool", "TextModerationInput", "TextToolChoice", "ToolCall", "ToolCallContentPart", "UpdatedResponse", "Usage", "VideoBillingSummary", "VideoContentPart", "VideoDeleteResponse", "VideoGenerationRequest", "VideoGenerationResponse", "VideoInputReference", "VideoListResponse", "VideoModelCapability", "VideoModelProviderCapability", "VideoModelsResponse", "VideoOutput", "VideoOutputConfig", "WebhookEndpoint", "WebhookEndpointCreateRequest", "WebhookEndpointDeleteResponse", "WebhookEndpointInput", "WebhookEndpointListResponse", "WebhookEndpointSecretResponse", "WebhookEndpointUpdateRequest", "Workspace", "WorkspaceActivityEntry", "WorkspaceActivityResponse", "WorkspaceApp", "WorkspaceAppListResponse", "WorkspaceAppMergeRequest", "WorkspaceAppMergeResponse", "WorkspaceAppResponse", "WorkspaceAppUpdateRequest", "WorkspaceAssignableRole", "WorkspaceAuditEvent", "WorkspaceAuditEventActor", "WorkspaceAuditEventLimits", "WorkspaceAuditEventListResponse", "WorkspaceAuditEventMetadata", "WorkspaceAutoTopUpSettings", "WorkspaceAutoTopUpUpdate", "WorkspaceBudget", "WorkspaceBudgetDeleteResponse", "WorkspaceBudgetInput", "WorkspaceBudgetInterval", "WorkspaceBudgetListResponse", "WorkspaceBudgetResponse", "WorkspaceBudgetUpdateInput", "WorkspaceCreateRequest", "WorkspaceDepartment", "WorkspaceDepartmentCreateRequest", "WorkspaceDepartmentInput", "WorkspaceDepartmentListResponse", "WorkspaceDepartmentMember", "WorkspaceDepartmentMemberRequest", "WorkspaceDepartmentMemberResponse", "WorkspaceDepartmentResponse", "WorkspaceDepartmentUpdateRequest", "WorkspaceDirectoryMember", "WorkspaceDirectoryMemberUpdateRequest", "WorkspaceDirectoryResponse", "WorkspaceGroupMapping", "WorkspaceGroupMappingCreateRequest", "WorkspaceGroupMappingListResponse", "WorkspaceGroupMappingResponse", "WorkspaceGroupMappingUpdateRequest", "WorkspaceInvite", "WorkspaceInviteCreateRequest", "WorkspaceInviteCreateResponse", "WorkspaceInviteListResponse", "WorkspaceJoinRequest", "WorkspaceJoinRequestListResponse", "WorkspaceJoinRequestResponse", "WorkspaceJoinRequestStatus", "WorkspaceListResponse", "WorkspaceLowBalanceEmailSettings", "WorkspaceLowBalanceEmailUpdate", "WorkspaceMember", "WorkspaceMemberAddResponse", "WorkspaceMemberBulkRequest", "WorkspaceMemberListResponse", "WorkspaceMemberRemoveRequest", "WorkspaceMemberRemoveResponse", "WorkspaceMemberResponse", "WorkspaceMemberRoleUpdateRequest", "WorkspaceNotificationDestination", "WorkspaceNotificationDestinationCreateRequest", "WorkspaceNotificationDestinationListResponse", "WorkspaceNotificationDestinationResponse", "WorkspaceNotificationDestinationTestRequest", "WorkspaceNotificationDestinationType", "WorkspaceNotificationEmailPreferences", "WorkspaceNotificationEmailPreferencesUpdate", "WorkspaceNotificationEventKind", "WorkspaceNotificationRoute", "WorkspaceNotificationRouteMap", "WorkspaceNotificationRouteResponse", "WorkspaceNotificationRoutesResponse", "WorkspaceNotificationRouteUpdateRequest", "WorkspaceNotificationSettings", "WorkspaceNotificationSettingsResponse", "WorkspaceNotificationSettingsUpdateRequest", "WorkspaceNotificationTestResponse", "WorkspaceProviderRestrictionMode", "WorkspaceResponse", "WorkspaceRole", "WorkspaceRoutingMode", "WorkspaceScimAuditResponse", "WorkspaceScimEndpoint", "WorkspaceScimEndpointResponse", "WorkspaceScimEvent", "WorkspaceScimResponse", "WorkspaceScimToken", "WorkspaceScimTokenCreateRequest", "WorkspaceScimTokenCreateResponse", "WorkspaceScimUpdateRequest", "WorkspaceSettings", "WorkspaceSettingsResponse", "WorkspaceSettingsUpdateRequest", "WorkspaceSsoResponse", "WorkspaceSsoSettings", "WorkspaceSsoUpdateRequest", "WorkspaceUpdateRequest"]
