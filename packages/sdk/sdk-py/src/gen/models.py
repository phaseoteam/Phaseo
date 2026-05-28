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
	data: List[Dict[str, Any]]

class AnalyticsAccessTokenRequiredResponse(TypedDict):
	error: Literal["access_token_required"]
	ok: Literal[false]

class AnalyticsNotImplementedResponse(TypedDict):
	message: str
	ok: Literal[true]
	status: Literal["not_implemented"]

class AnthropicContentBlock(TypedDict):
	cache_control: NotRequired[Dict[str, Any]]
	content: NotRequired[str]
	id: NotRequired[str]
	input: NotRequired[Dict[str, Any]]
	name: NotRequired[str]
	source: NotRequired[Dict[str, Any]]
	text: NotRequired[str]
	tool_use_id: NotRequired[str]
	type: NotRequired[Literal["text", "image", "tool_use", "tool_result"]]

class AnthropicMessage(TypedDict):
	content: Union[str, List[Dict[str, Any]]]
	role: Literal["user", "assistant"]

class AnthropicMessagesRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	max_tokens: int
	messages: List[Dict[str, Any]]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	provider: NotRequired[Dict[str, Any]]
	provider_options: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	session_id: NotRequired[str]
	stop_sequences: NotRequired[List[str]]
	stream: NotRequired[bool]
	system: NotRequired[Union[str, List[Dict[str, Any]]]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[Dict[str, Any], str]]
	tools: NotRequired[List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]
	top_k: NotRequired[int]
	top_p: NotRequired[float]
	usage: NotRequired[bool]

class AnthropicMessagesResponse(TypedDict):
	content: NotRequired[List[Dict[str, Any]]]
	id: NotRequired[str]
	model: NotRequired[str]
	role: NotRequired[Literal["assistant"]]
	stop_reason: NotRequired[str]
	stop_sequence: NotRequired[str]
	type: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

class AnthropicTool(TypedDict):
	description: NotRequired[str]
	input_schema: NotRequired[Dict[str, Any]]
	name: str

class AnthropicUsage(TypedDict):
	input_tokens: NotRequired[int]
	output_tokens: NotRequired[int]

class ApiKey(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	disabled: bool
	expires_at: Optional[str]
	hash: str
	id: str
	label: Optional[str]
	last_used_at: Optional[str]
	name: Optional[str]
	prefix: Optional[str]
	scopes: Union[str, List[str]]
	soft_blocked: bool
	status: Optional[str]
	updated_at: Optional[str]
	workspace_id: str

class ApiKeyCreateRequest(TypedDict):
	disabled: NotRequired[bool]
	expires_at: NotRequired[Optional[str]]
	include_byok_in_limit: NotRequired[bool]
	limit: NotRequired[Optional[float]]
	limit_reset: NotRequired[Literal["daily", "weekly", "monthly"]]
	name: str
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]
	workspace_id: NotRequired[str]

class ApiKeyListResponse(TypedDict):
	data: List[Dict[str, Any]]
	total_count: int

class ApiKeyResponse(TypedDict):
	data: Dict[str, Any]

ApiKeyScopeValue = Union[str, List[str]]

class ApiKeyUpdateRequest(TypedDict):
	disabled: NotRequired[bool]
	expires_at: NotRequired[Optional[str]]
	include_byok_in_limit: NotRequired[bool]
	limit: NotRequired[Optional[float]]
	limit_reset: NotRequired[Literal["daily", "weekly", "monthly"]]
	name: NotRequired[str]
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]

class ApiKeyWithValue(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	disabled: bool
	expires_at: Optional[str]
	hash: str
	id: str
	key: str
	label: Optional[str]
	last_used_at: Optional[str]
	name: Optional[str]
	prefix: Optional[str]
	scopes: Union[str, List[str]]
	soft_blocked: bool
	status: Optional[str]
	updated_at: Optional[str]
	workspace_id: str

class ApiKeyWithValueResponse(TypedDict):
	data: Dict[str, Any]

class AudioContentPart(TypedDict):
	input_audio: Dict[str, Any]
	type: Literal["input_audio"]

class AudioSpeechRequest(TypedDict):
	format: NotRequired[Literal["mp3", "wav", "ogg", "aac"]]
	input: str
	model: str
	provider: NotRequired[Dict[str, Any]]
	voice: NotRequired[str]

class AudioTranscriptionRequest(TypedDict):
	audio_b64: NotRequired[str]
	audio_url: NotRequired[str]
	language: NotRequired[str]
	model: str
	provider: NotRequired[Dict[str, Any]]

class AudioTranscriptionResponse(TypedDict):
	text: NotRequired[str]

class AudioTranslationRequest(TypedDict):
	audio_b64: NotRequired[str]
	audio_url: NotRequired[str]
	language: NotRequired[str]
	model: str
	prompt: NotRequired[str]
	provider: NotRequired[Dict[str, Any]]
	temperature: NotRequired[float]

class AudioTranslationResponse(TypedDict):
	text: NotRequired[str]

class BatchBillingSummary(TypedDict):
	billed: NotRequired[bool]
	charged: NotRequired[bool]
	cost_nanos: NotRequired[int]
	cost_usd: NotRequired[float]
	finalized_at: NotRequired[str]
	pricing_breakdown: NotRequired[Dict[str, Any]]
	reason: NotRequired[str]

class BatchRequest(TypedDict):
	completion_window: NotRequired[str]
	debug: NotRequired[Dict[str, Any]]
	endpoint: str
	input_file_id: str
	metadata: NotRequired[Dict[str, Any]]
	provider: NotRequired[Dict[str, Any]]
	session_id: NotRequired[str]
	webhook: NotRequired[Dict[str, Any]]

class BatchRequestCounts(TypedDict):
	completed: NotRequired[int]
	failed: NotRequired[int]
	total: NotRequired[int]

class BatchResponse(TypedDict):
	billing: NotRequired[Dict[str, Any]]
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
	finalizing_at: NotRequired[int]
	id: NotRequired[str]
	in_progress_at: NotRequired[int]
	input_file_id: NotRequired[str]
	metadata: NotRequired[Dict[str, Any]]
	object: NotRequired[str]
	output_file_id: NotRequired[str]
	pricing_lines: NotRequired[List[Dict[str, Any]]]
	provider: NotRequired[str]
	request_counts: NotRequired[Dict[str, Any]]
	request_id: NotRequired[str]
	session_id: NotRequired[str]
	status: NotRequired[str]
	webhook: NotRequired[Dict[str, Any]]

BenchmarkId = Literal["2-bench-retail", "2-bench-telecom", "aa-index", "aa-intelligence-index-v4", "aa-lcr", "aa-omniscience", "aa-t2v-rank", "ace-bench", "activitynet", "aethercode", "agieval", "ai2-reasoning-challenge-(arc)", "ai2-sciarena", "ai2d", "aidanbench", "aider", "aider-polyglot", "aider-polyglot-edit", "aime", "aime-2024", "aime-2025", "aime-2026", "ainstein-bench", "aitz-em", "alignbench", "all-angles", "alpacaeval-2.0", "amc", "amc-2022-23", "android-control-high-em", "android-control-low-em", "androidworld", "androidworld-sr", "apex", "apex-agents", "apex-shortlist", "arc", "arc-agi", "arc-agi-1", "arc-agi-2", "arc-c", "arc-e", "arcagi1-image", "arcagi2-image", "arena-chat-rank", "arena-hard", "arena-hard-v2", "arena-search-rank", "arkitscenes", "artifactsbench", "artificial-analysis", "attaq", "autologi", "babe", "babyvision", "balrog-ai", "bbh", "bcflv4", "beyondaime", "bfcl", "bfcl-overall-fc-v4", "bfcl-v2", "bfcl-v3", "bfcl-v3-multiturn", "bfcl-v4", "big-bench", "big-bench-extra-hard", "big-bench-hard", "bigcodebench", "biobench", "biolp-bench", "bird-sql-(dev)", "bixbench", "blink", "boolq", "browsecomp", "browsecomp-long-128k", "browsecomp-long-256k", "browsecomp-long-context-128k", "browsecomp-long-context-256k", "browsecomp-vl", "browsecomp-zh", "c-eval", "cc-bench-v2-backend", "cc-bench-v2-frontend", "cc-bench-v2-repo", "cc-ocr", "cfeval", "cgbench", "charadessta", "chartqa", "chartqapro", "charxiv-d", "charxiv-dq", "charxiv-r", "charxiv-reasoning", "charxiv-rq", "chest-imagenome-anatomy-iou", "chexpert-cxr-top5-macro-f1", "chinese-simpleqa", "cl-bench", "claw-eval", "cloningscenarios", "cluewsc", "cmath", "cmmlu", "cnmo-2024", "codeforces", "codeforces-no-tool", "codesimpleqa", "collie", "common-voice-15", "commonsenseqa", "complexfuncbench", "confabulations", "contphy", "corpusqa-1m", "countbench", "covost2", "covost2-en-zh", "creative-story-writing", "creative-writing-v3", "critpt", "crossvid", "crperelation", "crux-o", "cruxeval-o", "csimpleqa", "ct-dataset-1-macro-accuracy", "ctf-challenge-tasks", "cxr14-3cond-macro-f1", "cybench", "cybergym", "cybersecurity-ctfs", "da-2k", "deep-planning", "deepconsult", "deepplanning-v1.1-avg-acc", "deepplanning-v1.1-shopping-case-acc", "deepplanning-v1.1-shopping-match-score", "deepplanning-v1.1-travel-case-acc", "deepplanning-v1.1-travel-comp-score", "deepplanning-v1.1-travel-cs-score", "deepplanning-v1.1-travel-ps-score", "deepresearchbench", "deepsearchqa", "der-2-bench", "design2code", "disco-x", "docvqa", "docvqatest", "drop", "ds-arena-code", "ds-fim-eval", "dubesor-llm", "dude", "dynamath", "egoschema", "egotempo", "elimination-game", "embspatialbench", "emma", "encyclo-k", "eq-bench", "eqbench", "erqa", "evalplus", "expert-swe", "eyepacs-accuracy", "facts", "facts-benchmark-suite", "facts-grounding", "facts-parametric", "factscore", "factscore-halluciation-rate", "fiction-live-bench", "figqa", "financeagent-v1.1", "finsearchcomp", "finsearchcomp-t2-t3", "finsearchcomp-t3", "flame-vlm-code", "flenqa", "fleurs", "flteval", "flteval-pass-16", "flteval-pass-2", "flteval-pass-4", "flteval-pass-8", "frames", "frontier-math", "frontiermath", "frontiersci-olympiad", "frontiersci-research", "fsc-147-down", "fullstackbench-en", "fullstackbench-zh", "functionalmath", "galileo-agent", "gdpval-aa", "gdpval-mm", "genebench", "giantsteps-tempo", "global-mmlu-lite", "global-pica", "global-piqa", "govreport", "gpqa", "gpqa-diamond", "graphwalks-bfs->128k", "graphwalks-bfs-1m-f1", "graphwalks-bfs-256k-f1", "graphwalks-bfs-lt-128k", "graphwalks-parents->128k", "graphwalks-parents-1m-f1", "graphwalks-parents-256k-f1", "graphwalks-parents-lt-128k", "gsm8k", "gsm8k-chat", "hallusion-bench", "hallusionbench", "healthbench", "healthbench-concensus", "healthbench-hard", "hellaswag", "hiddenmath", "hipho", "hle-no-tool-text-only", "hle-text", "hle-verified", "hle-vl", "hmmt-2025", "hmmt-2026-feb", "hmmt-feb-2025", "hmmt-feb-2026", "hmmt-feb-26", "hmmt-nov-2025", "humaneval", "humaneval-average", "humaneval-mul", "humaneval+", "humanevalfim-average", "humanitys-last-exam", "hypersim", "if", "if-bench", "if-eval", "ifbench", "imagemining", "imoanswerbench", "imoanswerbench-no-tool", "include", "infographicsqa", "infovqa", "infovqatest", "instruct-humaneval", "intergps", "internal-api-instruction-following-(hard)", "inverse-ifeval", "investment-banking-modeling", "iq-bench", "ivebench-consistency-vs-kling-o1", "ivebench-consistency-vs-runway-aleph", "ivebench-instruction-following-vs-kling-o1", "ivebench-instruction-following-vs-runway-aleph", "ivebench-overall-vs-kling-o1", "ivebench-overall-vs-runway-aleph", "korbench", "lbpp-(v2)", "lingoqa", "lisanbench", "livebench", "livebench-20241125", "livecodebench", "livecodebench-coding", "livecodebench-pro", "livecodebench-v5", "livecodebench-v5-24.12-25.2", "livecodebench-v6", "livecodebench(01-09)", "livesports-3k", "lmarena-text", "lmarena-webdev", "logicvista", "longbench-v2", "longbench-v2-128k", "longcodebench-1m", "longdocurl", "longfact-concepts", "longfact-concepts-hallucination-rate", "longfact-objects", "longfact-objects-hallucination-rate", "longvideobench", "lpfqa", "lsat", "lvbench", "mars-bench", "mask", "math", "math-500", "matharena", "matharena-apex", "matharenaapex", "matharenaapex-shortlist", "mathcanvas", "mathkangaroo", "mathverse-mini", "mathvision", "mathvista", "mathvista-mini", "maxife", "mbpp", "mbpp-evalplus", "mbpp+", "mc-bench", "mcp-mark", "medxpertqa", "medxpertqa-accuracy", "mega-mlqa", "mega-tydi-qa", "mega-udpos", "mega-xcopa", "mega-xstorycloze", "meld", "metr", "mewc", "mgsm", "miabench", "mimic-cxr-top5-macro-f1", "minedojo-verified", "minerva", "misguided-attention", "mle-bench", "mle-bench-lite", "mlvu", "mlvu-m", "mm-browsecomp", "mm-browsercomp", "mm-clawbench", "mm-if-eval", "mm-mt-bench", "mmau", "mmau-music", "mmau-sound", "mmau-speech", "mmbench", "mmbench-test", "mmbench-v1.1", "mmbench-video", "mme", "mme-cc", "mme-realworld", "mmlongbench", "mmlongbench-doc", "mmlu", "mmlu-chat", "mmlu-french", "mmlu-multilingual", "mmlu-pro", "mmlu-prox", "mmlu-redux", "mmlu-redux-2.0", "mmlu-stem", "mmmlu", "mmmu", "mmmu-(val)", "mmmu-(validation)", "mmmu-pro", "mmmuval", "mmsearch", "mmsearch-plus", "mmsibench-circular", "mmstar", "mmt-bench", "mmvet", "mmvetgpt4turbo", "mmvu", "mobileminiwob++-sr", "morse-500", "motionbench", "mrcr", "mrcr-1m", "mrcr-1m-(pointwise)", "mrcr-v2", "mrcr-v2-(8-needle)", "mrcr-v2-8-needle", "mri-dataset-1-macro-accuracy", "ms-cxr-t-macro-accuracy", "mt-bench", "mtvqa", "muirbench", "multi-challenge", "multi-if", "multi-swe-bench", "multichallenge-(o3-mini-grader)", "multilf", "multilingual-mmlu", "multiloko", "multipl-e", "musiccaps", "mvbench", "natural-questions", "natural2code", "nl2repo", "nl2repo-bench", "nl2repo-pass-1", "nmos", "nova-63", "nuscene", "nyt-connections", "objectron", "ocrbench", "ocrbench-v2", "ocrbench-v2-(en)", "ocrbench-v2-(zh)", "ocrbenchv2", "octocodingbench", "odinw", "odvbench", "officeqa", "officeqa-pro", "ojbench", "ojbench-cpp", "olympiadbench", "omnibench", "omnibench-music", "omnidocbench-1-5-down", "omnidocbench-1.5", "omnigaia", "omnimath", "openai-mrcr-2-needle-128k", "openai-mrcr-2-needle-256k", "openai-mrcr-8-needle-128k", "openai-mrcr-8-needle-1m", "openai-mrcr-v2-8-needle", "openai-mrcr:-2-needle-128k", "openai-mrcr:-2-needle-1m", "openbookqa", "openrca", "os-world", "osworld-g", "ovbench", "ovobench", "paperbench", "pathmcqa-accuracy", "perceptiontest", "phibench", "phybench", "physicsfinals", "phyx-openended", "pinchbench", "piqa", "pmc-vqa", "point-bench", "pointgrounding", "polymath", "polymath-en", "pope", "popqa", "procbench", "protocolqa", "qasper", "qmsum", "qvhighlights", "realkie", "realworldqa", "refcoco-avg", "refspatialbench", "repobench", "repoqa", "researchrubrics", "robospatialhome", "ruler", "sat-math", "scale-mcp-atlas", "scale-multichallenge", "scicode", "scienceqa", "scienceqa-visual", "screenspot", "screenspot-pro", "seal-0", "seal-multichallenege", "seccodebench", "sfe", "sifo", "sifo-multiturn", "simplebench", "simpleqa", "simpleqa-verified", "simplevqa", "skillsbench", "slake-closed-accuracy", "slake-tokenized-f1", "slakevqa", "smolagents-llm", "snake-bench", "social-iqa", "solo-bench", "spider", "spreadsheetbench-verified", "squality", "summscreenfd", "sunrgbd", "superchem-text-only", "superglue", "supergpqa", "swe-bench", "swe-bench-live", "swe-bench-multilingual", "swe-bench-multimodal", "swe-bench-pro", "swe-evo", "swe-lancer", "swe-perf", "swe-review", "swt-bench", "symflower-coding", "tau-2-airline", "tau-2-bench", "tau-2-retail", "tau-2-telecom", "tau-bench", "tau-bench-airline", "tau-bench-retail", "tau2-airline", "tau3-bench", "tempcompass", "terminal-bench", "terminal-bench-2.0", "terminal-bench-hard", "textvqa", "thematic-generalisation", "theoremqa", "thinking-with-tracking", "tir-bench", "tomato", "tool-decathlon", "toolathlon", "treebench", "triviaqa", "truthfulqa", "tvbench", "tydiqa", "uniform-bar-exam", "us-dermmcqa-accuracy", "usamo-2025", "usamo25", "v-star", "vcr-en-easy", "vct", "vending-bench-2", "vibe", "vibe-android", "vibe-backend", "vibe-eval", "vibe-ios", "vibe-pro", "vibe-simulation", "vibe-web", "vibeeval", "video-mme", "video-mmmu", "videoeval-pro", "videoholmes", "videomme", "videomme-w-o-sub.", "videomme-w-sub.", "videoreasonbench", "videosimpleqa", "visfactor", "vision2web", "vispeak", "vistra-metricx", "visulogic", "vita-bench", "vitabench", "viverbench", "vlmsarebiased", "vlmsareblind", "vocalsound", "voicebench-avg", "vpct", "vqa-rad-closed-accuracy", "vqa-rad-tokenized-f1", "vqav2", "vqav2-(test)", "we-math", "webvoyager", "weirdml", "wide-search", "widesearch", "wildbench", "winogrande", "wmdp", "wmt23", "wmt24++", "wmt24pp-comet", "wmt24pp-metricx", "wmt25-mqm", "worldvqa", "writingbench", "wsi-path-rouge", "xlang-agent", "xlrs-bench-macro", "xlsum-english", "xstest", "zclawbench", "zebralogic", "zerobench", "zerobench-main", "zerobench-sub"]

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
	message: NotRequired[Dict[str, Any]]

class ChatCompletionsRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	frequency_penalty: NotRequired[float]
	image_config: NotRequired[Dict[str, Any]]
	logit_bias: NotRequired[Dict[str, Any]]
	logprobs: NotRequired[bool]
	max_completion_tokens: NotRequired[int]
	max_tokens: NotRequired[int]
	max_tool_calls: NotRequired[int]
	messages: List[Dict[str, Any]]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	modalities: NotRequired[List[Literal["text", "image", "audio"]]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	presence_penalty: NotRequired[float]
	prompt_cache_key: NotRequired[Optional[str]]
	provider: NotRequired[Dict[str, Any]]
	provider_options: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	response_format: NotRequired[Union[str, Dict[str, Any]]]
	safety_identifier: NotRequired[Optional[str]]
	seed: NotRequired[int]
	service_tier: NotRequired[Literal["auto", "default", "flex", "standard", "priority"]]
	session_id: NotRequired[str]
	stop: NotRequired[Union[str, List[str]]]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	stream_options: NotRequired[Dict[str, Any]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[Literal["auto", "none", "required", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]]
	tools: NotRequired[List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]
	top_logprobs: NotRequired[int]
	top_p: NotRequired[float]
	usage: NotRequired[bool]
	user: NotRequired[str]
	user_id: NotRequired[str]

class ChatCompletionsResponse(TypedDict):
	choices: NotRequired[List[Dict[str, Any]]]
	created: NotRequired[int]
	id: NotRequired[str]
	model: NotRequired[str]
	nativeResponseId: NotRequired[Optional[str]]
	object: NotRequired[str]
	provider: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

class ChatImageOutputPart(TypedDict):
	image_url: Dict[str, Any]
	mime_type: NotRequired[str]
	type: Literal["image_url"]

class ChatMessage(TypedDict):
	audios: NotRequired[List[Dict[str, Any]]]
	content: NotRequired[Union[str, List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]]
	images: NotRequired[List[Dict[str, Any]]]
	name: NotRequired[str]
	role: Literal["system", "developer", "user", "assistant", "tool"]
	tool_call_id: NotRequired[str]
	tool_calls: NotRequired[List[Dict[str, Any]]]

class CreditsResponse(TypedDict):
	credits: Dict[str, Any]
	ok: Literal[true]

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

class Embedding(TypedDict):
	embedding: NotRequired[List[float]]
	index: NotRequired[int]
	object: NotRequired[str]

class EmbeddingsMultimodalInput(TypedDict):
	content: List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]

class EmbeddingsRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	dimensions: NotRequired[int]
	encoding_format: NotRequired[Literal["float", "base64"]]
	input: Union[str, List[int], Dict[str, Any], List[Union[str, List[int], Dict[str, Any]]]]
	model: str
	provider: NotRequired[Dict[str, Any]]
	provider_options: NotRequired[Dict[str, Any]]
	user: NotRequired[str]

class EmbeddingsResponse(TypedDict):
	data: NotRequired[List[Dict[str, Any]]]
	model: NotRequired[str]
	object: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

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
	details: NotRequired[List[Dict[str, Any]]]
	error: Union[str, Dict[str, Any]]
	error_origin: NotRequired[Literal["user", "gateway", "upstream"]]
	error_type: NotRequired[Literal["user", "system"]]
	failed_providers: NotRequired[List[str]]
	failed_statuses: NotRequired[List[int]]
	failure_sample: NotRequired[List[Dict[str, Any]]]
	generation_id: NotRequired[str]
	message: NotRequired[str]
	missing_pricing_providers: NotRequired[List[str]]
	ok: NotRequired[bool]
	provider_candidate_diagnostics: NotRequired[Dict[str, Any]]
	provider_enablement: NotRequired[Dict[str, Any]]
	provider_failure_diagnostics: NotRequired[Dict[str, Any]]
	provider_payment_required_provider: NotRequired[str]
	provider_payment_required_support_notice: NotRequired[str]
	reason: NotRequired[str]
	routing_diagnostics: NotRequired[Dict[str, Any]]
	status_code: NotRequired[int]
	upstream_error: NotRequired[Dict[str, Any]]

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

class FunctionToolDefinition(TypedDict):
	function: Dict[str, Any]
	type: Literal["function"]

class GatewayDatetimeToolDefinition(TypedDict):
	parameters: NotRequired[Dict[str, Any]]
	timezone: NotRequired[str]
	type: Literal["gateway:datetime"]

class GatewayModelsResponse(TypedDict):
	availability_mode: Literal["active", "all"]
	limit: int
	models: List[Dict[str, Any]]
	offset: int
	ok: bool
	privacy_scope: Literal["shared", "team"]
	total: int

class GatewayWebFetchToolDefinition(TypedDict):
	max_chars: NotRequired[int]
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["gateway:web_fetch"]

class GatewayWebSearchToolDefinition(TypedDict):
	include_highlights: NotRequired[bool]
	include_text: NotRequired[bool]
	max_results: NotRequired[int]
	parameters: NotRequired[Dict[str, Any]]
	type: Literal["gateway:web_search"]

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
	replay_request: NotRequired[Optional[Dict[str, Any]]]
	replay_supported: NotRequired[bool]
	request_id: NotRequired[str]
	status_code: NotRequired[float]
	stream: NotRequired[bool]
	success: NotRequired[bool]
	team_id: NotRequired[str]
	throughput: NotRequired[Optional[float]]
	usage: NotRequired[Optional[Dict[str, Any]]]

class Image(TypedDict):
	b64_json: NotRequired[str]
	revised_prompt: NotRequired[str]
	url: NotRequired[str]

class ImageConfig(TypedDict):
	aspect_ratio: NotRequired[str]
	font_inputs: NotRequired[List[Dict[str, Any]]]
	image_size: NotRequired[Literal["0.5K", "1K", "2K", "4K"]]
	include_rai_reason: NotRequired[bool]
	reference_images: NotRequired[List[Dict[str, Any]]]
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
	provider: NotRequired[Dict[str, Any]]
	size: NotRequired[str]
	usage: NotRequired[bool]
	user: NotRequired[str]

class ImagesEditResponse(TypedDict):
	created: NotRequired[int]
	data: NotRequired[List[Dict[str, Any]]]

class ImagesGenerationRequest(TypedDict):
	model: str
	n: NotRequired[int]
	prompt: str
	provider: NotRequired[Dict[str, Any]]
	quality: NotRequired[str]
	response_format: NotRequired[str]
	size: NotRequired[str]
	style: NotRequired[str]
	user: NotRequired[str]

class ImagesGenerationResponse(TypedDict):
	created: NotRequired[int]
	data: NotRequired[List[Dict[str, Any]]]

class InvalidRequestResponse(TypedDict):
	error: str
	max_offset: NotRequired[int]
	message: str
	ok: Literal[false]

class KeyInvalidateResponse(TypedDict):
	cache_version: Dict[str, Any]
	key: Dict[str, Any]
	message: str
	ok: Literal[true]

KnownModelId = Literal["ai21/jamba-large-1.7", "ai21/jamba-mini-2", "aion-labs/aion-1.0", "aion-labs/aion-1.0-mini", "aion-labs/aion-2.0", "aion-labs/aion-2.5", "aion-labs/aion-rp-llama-3.1-8b", "allenai/molmo-2-8b", "allenai/olmo-3.1-32b", "anthropic/claude-haiku-4.5", "anthropic/claude-opus-4", "anthropic/claude-opus-4.1", "anthropic/claude-opus-4.5", "anthropic/claude-opus-4.6", "anthropic/claude-opus-4.7", "anthropic/claude-opus-4.7-fast", "anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4.5", "anthropic/claude-sonnet-4.6", "arcee-ai/trinity-large", "arcee-ai/trinity-large-thinking", "arcee-ai/trinity-mini", "baidu/ernie-4.5-21b-a3b", "baidu/ernie-4.5-21b-a3b-thinking", "baidu/ernie-4.5-300b-a47b", "baidu/ernie-4.5-vl-28b-a3b", "baidu/ernie-4.5-vl-28b-a3b-thinking", "baidu/ernie-4.5-vl-424b-a47b", "black-forest-labs/flux-1-dev", "black-forest-labs/flux-1-kontext-max", "black-forest-labs/flux-1-kontext-pro", "black-forest-labs/flux-1-schnell", "bytedance/seed-1.6", "bytedance/seed-1.6-250915", "bytedance/seed-1.6-flash", "bytedance/seed-1.6-flash-250715", "bytedance/seed-1.8", "bytedance/seed-2.0-lite", "bytedance/seed-2.0-lite-260428", "bytedance/seed-2.0-mini", "bytedance/seed-2.0-mini-260428", "bytedance/seed-2.0-pro", "bytedance/seed-oss-36b-instruct", "bytedance/seed-translation", "bytedance/seedance-2.0", "bytedance/seedance-2.0-fast", "cogito/cogito-671b-v2.1", "crofai/greg", "deepseek/deepseek-ocr", "deepseek/deepseek-ocr-2", "deepseek/deepseek-prover-v2-671b", "deepseek/deepseek-r1", "deepseek/deepseek-r1-0528", "deepseek/deepseek-r1-2025-05-28", "deepseek/deepseek-r1-turbo", "deepseek/deepseek-v3", "deepseek/deepseek-v3-0324", "deepseek/deepseek-v3-turbo", "deepseek/deepseek-v3.1", "deepseek/deepseek-v3.1-terminus", "deepseek/deepseek-v3.2", "deepseek/deepseek-v3.2-exp", "deepseek/deepseek-v3.2-speciale", "deepseek/deepseek-v3.2-thinking", "deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-pro-precision", "essential-ai/rnj-1", "google/gemini-2.0-flash", "google/gemini-2.0-flash-lite", "google/gemini-2.5-flash-image", "google/gemini-2.5-flash-lite-preview-2025-06-17", "google/gemini-2.5-flash-lite-preview-2025-09-25", "google/gemini-3-flash-preview", "google/gemini-3-pro-image-preview", "google/gemini-3.1-flash-image-preview", "google/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite-preview", "google/gemini-3.1-flash-tts-preview", "google/gemini-3.1-pro-preview", "google/gemini-3.1-pro-preview-customtools", "google/gemini-3.5-flash", "google/gemini-embedding-001", "google/gemini-embedding-2", "google/gemini-embedding-2-preview", "google/gemini-robotics-er-1.6-preview", "google/gemma-3-12b:free", "google/gemma-3-1b:free", "google/gemma-3-27b", "google/gemma-3-27b:free", "google/gemma-3-4b:free", "google/gemma-3n-e2b:free", "google/gemma-3n-e4b", "google/gemma-3n-e4b:free", "google/gemma-4-26b-a4b", "google/gemma-4-26b-a4b:free", "google/gemma-4-31b", "google/gemma-4-31b-it", "google/gemma-4-31b:free", "google/lyria-3-clip-preview", "google/lyria-3-pro-preview", "google/veo-2", "google/veo-3.1-fast-preview", "google/veo-3.1-lite-generate-preview", "google/veo-3.1-preview", "ibm/granite-4.1-8b", "inception/mercury-2", "inception/mercury-edit-2", "inclusionai/ling-2.6-1t", "inclusionai/ling-flash-2.0", "inclusionai/ring-flash-2.0", "inflection/inflection-3-pi", "inflection/inflection-3-productivity", "kwaipilot/kat-coder-exp-72b-1010", "kwaipilot/kat-coder-pro", "kwaipilot/kat-coder-pro-v1", "kwaipilot/kat-coder-pro-v2", "liquid-ai/lfm-2-24b-a2b", "meituan/longcat-flash-cat", "meta/llama-3-70b", "meta/llama-3-8b", "meta/llama-3-8b-lite", "meta/llama-3.1-70b", "meta/llama-3.1-8b", "meta/llama-3.2-11b-vision", "meta/llama-3.2-1b-instruct", "meta/llama-3.2-3b", "meta/llama-3.3-70b", "meta/llama-4-maverick", "meta/llama-4-scout", "meta/llama-guard-4-12b", "meta/llama-prompt-guard-2-22m", "meta/llama-prompt-guard-2-86m", "microsoft/phi-4", "microsoft/phi-4-mini", "minimax/hailuo-02", "minimax/hailuo-2.3", "minimax/hailuo-2.3-fast", "minimax/m2-her", "minimax/minimax-m1-80k", "minimax/minimax-m2", "minimax/minimax-m2.1", "minimax/minimax-m2.5", "minimax/minimax-m2.5-highspeed", "minimax/minimax-m2.7", "minimax/music-2.6", "minimax/music-2.6-free", "mistral/codestral-embed", "mistral/devstral-2", "mistral/devstral-medium-1.0", "mistral/devstral-small-1.1", "mistral/devstral-small-2", "mistral/leanstral:free", "mistral/magistral-medium-1.2", "mistral/magistral-small-1.2", "mistral/ministral-3-14b", "mistral/ministral-3-3b", "mistral/ministral-3-8b", "mistral/mistral-embed", "mistral/mistral-large-2.1", "mistral/mistral-large-3", "mistral/mistral-medium-3.0", "mistral/mistral-medium-3.1", "mistral/mistral-medium-3.5", "mistral/mistral-moderation", "mistral/mistral-moderation-2", "mistral/mistral-nemo-12b", "mistral/mistral-nemo-2407", "mistral/mistral-small-24b-2501", "mistral/mistral-small-3.2", "mistral/mistral-small-4", "mistral/mistral-small-creative", "mistral/mixtral-8x7b", "mistral/pixtral-large", "mistralai/mistral-nemo", "moonshotai/kimi-k2", "moonshotai/kimi-k2-0905", "moonshotai/kimi-k2-instruct", "moonshotai/kimi-k2-instruct-0905", "moonshotai/kimi-k2-thinking", "moonshotai/kimi-k2.5", "moonshotai/kimi-k2.5-lightning", "moonshotai/kimi-k2.6", "moonshotai/kimi-k2.6-precision", "morph/morph-v3-fast", "morph/morph-v3-large", "nex-agi/deepseek-v3.1-nex-n1", "nous/hermes-3-llama-3.1-405b", "nousresearch/hermes-3-llama-3.1-405b", "nousresearch/hermes-3-llama-3.1-70b", "nousresearch/hermes-4-405b", "nousresearch/hermes-4-70b", "nvidia/llama-3.1-nemotron-70b-instruct", "nvidia/llama-3.1-nemotron-ultra-253b", "nvidia/llama-3.3-nemotron-super-49b-v1.5", "nvidia/nemotron-3-nano-30b-a3b", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "nvidia/nemotron-3-super-120b-a12b", "nvidia/nvidia-nemotron-3-nano-30b-a3b", "nvidia/nvidia-nemotron-nano-12b-v2-vl", "nvidia/nvidia-nemotron-nano-9b-v2", "openai/babbage-002", "openai/chat-latest", "openai/chatgpt-4o", "openai/computer-use-preview", "openai/davinci-002", "openai/gpt-3.5-turbo-16k", "openai/gpt-3.5-turbo-2023-03-21", "openai/gpt-4-2023-06-13", "openai/gpt-4-turbo-2023-03-14", "openai/gpt-4-turbo-2023-11-06", "openai/gpt-4-turbo-2024-01-25", "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/gpt-4o-2024-05-13", "openai/gpt-4o-2024-08-06", "openai/gpt-4o-2024-11-20", "openai/gpt-4o-mini", "openai/gpt-4o-mini-transcribe", "openai/gpt-4o-mini-tts", "openai/gpt-4o-transcribe", "openai/gpt-5", "openai/gpt-5-chat", "openai/gpt-5-codex", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-5-pro", "openai/gpt-5.1", "openai/gpt-5.1-chat", "openai/gpt-5.1-codex", "openai/gpt-5.1-codex-max", "openai/gpt-5.1-codex-mini", "openai/gpt-5.2", "openai/gpt-5.2-chat", "openai/gpt-5.2-codex", "openai/gpt-5.2-pro", "openai/gpt-5.3-chat", "openai/gpt-5.3-codex", "openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5.4-nano", "openai/gpt-5.4-pro", "openai/gpt-5.5", "openai/gpt-5.5-pro", "openai/gpt-image-1", "openai/gpt-image-1-mini", "openai/gpt-image-1.5", "openai/gpt-image-2", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b", "openai/o1", "openai/o1-mini", "openai/o1-pro", "openai/o3", "openai/o3-deep-research", "openai/o3-mini", "openai/o3-pro", "openai/o4-mini", "openai/o4-mini-deep-research", "openai/omni-moderation", "openai/sora-2", "openai/sora-2-pro", "openai/text-embedding-3-large", "openai/text-embedding-3-small", "openai/text-embedding-ada-002", "openai/whisper-1", "poolside/laguna-m.1", "poolside/laguna-m.1:free", "poolside/laguna-xs.2", "poolside/laguna-xs.2:free", "primeintellect/intellect-3", "qwen/qvq-max", "qwen/qwen-3.6-plus", "qwen/qwen-flash", "qwen/qwen-flash-character", "qwen/qwen-max", "qwen/qwen-mt-flash", "qwen/qwen-mt-lite", "qwen/qwen-mt-plus", "qwen/qwen-mt-turbo", "qwen/qwen-plus-2025-01-25", "qwen/qwen-plus-2025-04-28", "qwen/qwen-plus-2025-07-14", "qwen/qwen-plus-2025-07-28", "qwen/qwen-plus-2025-09-11", "qwen/qwen-plus-2025-12-01", "qwen/qwen-plus-character", "qwen/qwen-turbo-2024-11-01", "qwen/qwen-turbo-2025-04-28", "qwen/qwen-vl-max-2025-04-08", "qwen/qwen-vl-max-2025-08-13", "qwen/qwen-vl-plus-2025-01-25", "qwen/qwen-vl-plus-2025-05-07", "qwen/qwen-vl-plus-2025-08-15", "qwen/qwen2.5-14b", "qwen/qwen2.5-14b-1m", "qwen/qwen2.5-32b", "qwen/qwen2.5-72b", "qwen/qwen2.5-7b", "qwen/qwen2.5-7b-1m", "qwen/qwen2.5-coder-7b", "qwen/qwen2.5-vl-32b", "qwen/qwen2.5-vl-32b-instruct", "qwen/qwen2.5-vl-72b", "qwen/qwen2.5-vl-72b-instruct", "qwen/qwen2.5-vl-7b", "qwen/qwen3-0.6b", "qwen/qwen3-1.7b", "qwen/qwen3-14b", "qwen/qwen3-235b-a22b-2507", "qwen/qwen3-235b-a22b-instruct-2507", "qwen/qwen3-235b-a22b-thinking-2507", "qwen/qwen3-30b-a3b", "qwen/qwen3-30b-a3b-2507", "qwen/qwen3-30b-a3b-instruct-2507", "qwen/qwen3-30b-a3b-thinking-2507", "qwen/qwen3-32b", "qwen/qwen3-4b", "qwen/qwen3-8b", "qwen/qwen3-coder", "qwen/qwen3-coder-30b-a3b", "qwen/qwen3-coder-480b-a35b", "qwen/qwen3-coder-flash", "qwen/qwen3-coder-next", "qwen/qwen3-coder-plus-2025-07-22", "qwen/qwen3-coder-plus-2025-09-23", "qwen/qwen3-max", "qwen/qwen3-max-2025-09-23", "qwen/qwen3-max-2026-01-23", "qwen/qwen3-max-preview", "qwen/qwen3-max-thinking", "qwen/qwen3-next-80b", "qwen/qwen3-next-80b-a3b", "qwen/qwen3-next-80b-a3b-instruct", "qwen/qwen3-next-80b-a3b-thinking", "qwen/qwen3-omni-30b-a3b-thinking", "qwen/qwen3-reranker", "qwen/qwen3-vl-235b-a22b", "qwen/qwen3-vl-235b-a22b-instruct", "qwen/qwen3-vl-235b-a22b-thinking", "qwen/qwen3-vl-30b-a3b", "qwen/qwen3-vl-30b-a3b-instruct", "qwen/qwen3-vl-30b-a3b-thinking", "qwen/qwen3-vl-32b-instruct", "qwen/qwen3-vl-32b-thinking", "qwen/qwen3-vl-8b", "qwen/qwen3-vl-8b-instruct", "qwen/qwen3-vl-flash-2025-10-15", "qwen/qwen3-vl-flash-2026-01-22", "qwen/qwen3-vl-plus-2025-09-23", "qwen/qwen3-vl-plus-2025-12-19", "qwen/qwen3.5-0.8b", "qwen/qwen3.5-122b-a10b", "qwen/qwen3.5-27b", "qwen/qwen3.5-2b", "qwen/qwen3.5-35b-a3b", "qwen/qwen3.5-397b-a17b", "qwen/qwen3.5-4b", "qwen/qwen3.5-9b", "qwen/qwen3.5-9b-chat", "qwen/qwen3.5-flash", "qwen/qwen3.5-livetranslate-flash-realtime-2026-05-19", "qwen/qwen3.5-plus", "qwen/qwen3.5-plus-2026-04-20", "qwen/qwen3.6-27b", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-max-preview", "qwen/qwen3.6-plus", "qwen/qwen3.7-max", "qwen/qwen3.7-max-2026-05-17", "qwen/qwen3.7-max-2026-05-20", "qwen/qwq-32b", "qwen/qwq-plus", "qwen/text-embedding-v3", "qwen/text-embedding-v4", "qwen/wan2.7-t2v", "stepfun/step-3.5-flash", "tencent/hunyuan-a13b-instruct", "tencent/hy3-preview", "venice/venice-uncensored", "venice/venice-uncensored-1.1", "voyage/rerank-1", "voyage/rerank-2", "voyage/rerank-2-lite", "voyage/rerank-lite-1", "voyage/voyage-01", "voyage/voyage-02", "voyage/voyage-2", "voyage/voyage-3", "voyage/voyage-3-large", "voyage/voyage-3-lite", "voyage/voyage-3.5", "voyage/voyage-3.5-lite", "voyage/voyage-4", "voyage/voyage-4-large", "voyage/voyage-4-lite", "voyage/voyage-code-2", "voyage/voyage-code-3", "voyage/voyage-context-3", "voyage/voyage-finance-2", "voyage/voyage-large-2", "voyage/voyage-large-2-instruct", "voyage/voyage-law-2", "voyage/voyage-lite-01", "voyage/voyage-lite-01-instruct", "voyage/voyage-lite-02-instruct", "voyage/voyage-multilingual-2", "voyage/voyage-multimodal-3", "voyage/voyage-multimodal-3.5", "x-ai/grok-2-vision", "x-ai/grok-3-mini", "x-ai/grok-4.20-beta-0309", "x-ai/grok-4.20-multi-agent-beta-0309", "x-ai/grok-4.3", "x-ai/grok-build-0.1", "x-ai/grok-code-fast-1", "x-ai/grok-imagine-image", "x-ai/grok-imagine-image-quality", "x-ai/grok-imagine-video", "x-ai/grok-tts", "xiaomi/mimo-v2-flash", "xiaomi/mimo-v2-omni", "xiaomi/mimo-v2-pro", "xiaomi/mimo-v2-tts:free", "xiaomi/mimo-v2.5", "xiaomi/mimo-v2.5-pro", "xiaomi/mimo-v2.5-pro-precision", "xiaomi/mimo-v2.5-tts:free", "z-ai/glm-4-32b", "z-ai/glm-4-7-flash:free", "z-ai/glm-4.5", "z-ai/glm-4.5-air", "z-ai/glm-4.5-air-x", "z-ai/glm-4.5-x", "z-ai/glm-4.5v", "z-ai/glm-4.6", "z-ai/glm-4.6v", "z-ai/glm-4.6v-flash", "z-ai/glm-4.7", "z-ai/glm-4.7-flash", "z-ai/glm-5", "z-ai/glm-5-code", "z-ai/glm-5-turbo", "z-ai/glm-5.1", "z-ai/glm-5.1-precision", "z-ai/glm-5v-turbo", "zai-org/glm-4.5-air", "zai/glm-5"]

class ListFilesResponse(TypedDict):
	data: NotRequired[List[Dict[str, Any]]]
	object: NotRequired[str]

class ManagementKeyCreateRequest(TypedDict):
	created_by: NotRequired[str]
	name: str
	scopes: NotRequired[Union[str, List[str]]]
	soft_blocked: NotRequired[bool]
	status: NotRequired[Literal["active", "disabled", "revoked"]]
	team_id: NotRequired[str]

class ManagementKeyCreateResponse(TypedDict):
	key: Dict[str, Any]
	ok: Literal[true]

class ManagementKeyDeleteResponse(TypedDict):
	message: str
	ok: Literal[true]

class ManagementKeyDetailResponse(TypedDict):
	key: Dict[str, Any]
	ok: Literal[true]

class ManagementKeyListResponse(TypedDict):
	keys: List[Dict[str, Any]]
	limit: int
	offset: int
	ok: Literal[true]
	total: int

class ManagementKeyUpdateRequest(TypedDict):
	name: NotRequired[str]
	soft_blocked: NotRequired[bool]
	status: NotRequired[Literal["active", "disabled", "revoked"]]

class ManagementKeyUpdateResponse(TypedDict):
	message: str
	ok: Literal[true]

MessageContentPart = Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]

class Model(TypedDict):
	aliases: NotRequired[List[str]]
	architecture: NotRequired[Dict[str, Any]]
	availability: NotRequired[Dict[str, Any]]
	canonical_slug: NotRequired[str]
	created: NotRequired[Optional[int]]
	deprecation_date: NotRequired[Optional[str]]
	description: NotRequired[str]
	endpoints: NotRequired[List[str]]
	id: NotRequired[str]
	input_types: NotRequired[List[str]]
	lifecycle: NotRequired[ModelLifecycle]
	model_id: NotRequired[str]
	name: NotRequired[Optional[str]]
	organisation_colour: NotRequired[Optional[str]]
	organisation_id: NotRequired[Optional[str]]
	organisation_name: NotRequired[Optional[str]]
	output_types: NotRequired[List[str]]
	per_request_limits: NotRequired[Optional[Dict[str, Any]]]
	pricing: NotRequired[Dict[str, Any]]
	pricing_detail: NotRequired[Dict[str, Any]]
	providers: NotRequired[List[Dict[str, Any]]]
	release_date: NotRequired[Optional[str]]
	retirement_date: NotRequired[Optional[str]]
	status: NotRequired[Optional[str]]
	supported_parameters: NotRequired[List[str]]
	supported_params: NotRequired[List[str]]
	top_provider: NotRequired[Dict[str, Any]]
	top_provider_id: NotRequired[Optional[str]]

class ModelAvailability(TypedDict):
	active_provider_count: int
	inactive_provider_count: int
	provider_count: int
	status: Literal["active", "coming_soon", "inactive", "not_listed"]

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
	is_active_gateway: bool
	model_routing_status: Literal["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled"]
	params: List[str]
	provider_routing_status: Literal["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "disabled"]
	provider_status: Literal["active", "beta", "alpha", "not_ready", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked"]

class ModelsPrivacyScopeNotImplementedResponse(TypedDict):
	code: Literal["models_privacy_scope_not_implemented"]
	error: Literal["not_implemented"]
	message: str
	ok: Literal[false]
	privacy_scope: Literal["team"]

class ModerationCategories(TypedDict):
	harassment: NotRequired[bool]
	harassment_threatening: NotRequired[bool]
	hate: NotRequired[bool]
	hate_threatening: NotRequired[bool]
	self_harm: NotRequired[bool]
	self_harm_instructions: NotRequired[bool]
	self_harm_intent: NotRequired[bool]
	sexual: NotRequired[bool]
	sexual_minors: NotRequired[bool]
	violence: NotRequired[bool]
	violence_graphic: NotRequired[bool]

class ModerationCategoryScores(TypedDict):
	harassment: NotRequired[float]
	harassment_threatening: NotRequired[float]
	hate: NotRequired[float]
	hate_threatening: NotRequired[float]
	self_harm: NotRequired[float]
	self_harm_instructions: NotRequired[float]
	self_harm_intent: NotRequired[float]
	sexual: NotRequired[float]
	sexual_minors: NotRequired[float]
	violence: NotRequired[float]
	violence_graphic: NotRequired[float]

class ModerationResult(TypedDict):
	categories: NotRequired[Dict[str, Any]]
	category_scores: NotRequired[Dict[str, Any]]
	flagged: NotRequired[bool]

class ModerationsRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	input: Union[str, List[Union[Dict[str, Any], Dict[str, Any]]]]
	meta: NotRequired[bool]
	model: str
	provider: NotRequired[Dict[str, Any]]

class ModerationsResponse(TypedDict):
	id: NotRequired[str]
	model: NotRequired[str]
	results: NotRequired[List[Dict[str, Any]]]

class MusicGenerateRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	duration: NotRequired[int]
	echo_upstream_request: NotRequired[bool]
	elevenlabs: NotRequired[Dict[str, Any]]
	format: NotRequired[Literal["mp3", "wav", "ogg", "aac"]]
	model: str
	prompt: NotRequired[str]
	provider: NotRequired[Dict[str, Any]]
	suno: NotRequired[Dict[str, Any]]

class MusicGenerateResponse(TypedDict):
	pass

class NotImplementedResponse(TypedDict):
	description: str
	error: str
	status_code: int

class OcrRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	image: str
	language: NotRequired[str]
	model: str
	provider: NotRequired[Dict[str, Any]]

class OcrResponse(TypedDict):
	pass

OrganisationId = Literal["ai21", "aion-labs", "allenai", "amazon", "anthropic", "arcee-ai", "baidu", "black-forest-labs", "bytedance", "cohere", "cursor", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inception", "inclusionai", "kwaipilot", "lg", "liquid-ai", "meituan", "meta", "microsoft", "minimax", "mistral", "moonshotai", "naver-hyperclova", "nous", "nvidia", "openai", "perplexity", "prime-intellect", "qwen", "relace", "sourceful", "stepfun", "suno", "upstage", "vercel", "voyage", "x-ai", "xiaomi", "z-ai"]

OrganisationIdList = List[Literal["ai21", "aion-labs", "allenai", "amazon", "anthropic", "arcee-ai", "baidu", "black-forest-labs", "bytedance", "cohere", "cursor", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inception", "inclusionai", "kwaipilot", "lg", "liquid-ai", "meituan", "meta", "microsoft", "minimax", "mistral", "moonshotai", "naver-hyperclova", "nous", "nvidia", "openai", "perplexity", "prime-intellect", "qwen", "relace", "sourceful", "stepfun", "suno", "upstage", "vercel", "voyage", "x-ai", "xiaomi", "z-ai"]]

class Provider(TypedDict):
	api_provider_id: NotRequired[str]
	api_provider_name: NotRequired[Optional[str]]
	country_code: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	link: NotRequired[Optional[str]]

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

class RealtimeNotImplementedResponse(TypedDict):
	error: Dict[str, Any]

class ReasoningConfig(TypedDict):
	effort: NotRequired[Literal["none", "minimal", "low", "medium", "high", "xhigh"]]
	enabled: NotRequired[bool]
	max_tokens: NotRequired[int]
	summary: NotRequired[Literal["auto", "concise", "detailed"]]

RerankDocument = Union[str, Dict[str, Any]]

class RerankRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	documents: Union[List[str], List[Dict[str, Any]]]
	max_chunks_per_doc: NotRequired[int]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	provider: NotRequired[Dict[str, Any]]
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
	results: NotRequired[List[Dict[str, Any]]]
	usage: NotRequired[Dict[str, Any]]

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

ResponsesOutputContentPart = Union[Dict[str, Any], Dict[str, Any], Dict[str, Any]]

class ResponsesOutputImagePart(TypedDict):
	b64_json: NotRequired[str]
	image_url: NotRequired[Dict[str, Any]]
	mime_type: NotRequired[str]
	type: Literal["output_image"]

class ResponsesOutputItem(TypedDict):
	arguments: NotRequired[str]
	call_id: NotRequired[str]
	content: NotRequired[List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]
	name: NotRequired[str]
	role: NotRequired[str]
	type: NotRequired[str]

class ResponsesOutputTextPart(TypedDict):
	annotations: NotRequired[List[Dict[str, Any]]]
	text: str
	type: Literal["output_text"]

class ResponsesRequest(TypedDict):
	background: NotRequired[bool]
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	image_config: NotRequired[Dict[str, Any]]
	include: NotRequired[List[str]]
	input: Union[str, List[Dict[str, Any]], Dict[str, Any]]
	instructions: NotRequired[str]
	max_output_tokens: NotRequired[int]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	modalities: NotRequired[List[Literal["text", "image", "audio"]]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	previous_response_id: NotRequired[str]
	prompt_cache_key: NotRequired[Optional[str]]
	provider: NotRequired[Dict[str, Any]]
	provider_options: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	safety_identifier: NotRequired[Optional[str]]
	service_tier: NotRequired[Literal["auto", "default", "flex", "standard", "priority"]]
	session_id: NotRequired[str]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	temperature: NotRequired[float]
	text: NotRequired[Dict[str, Any]]
	tool_choice: NotRequired[Union[Literal["auto", "none", "required", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]]
	tools: NotRequired[List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]
	top_p: NotRequired[float]
	truncation: NotRequired[Literal["auto", "disabled"]]
	usage: NotRequired[bool]
	user: NotRequired[str]

class ResponsesResponse(TypedDict):
	content: NotRequired[List[Dict[str, Any]]]
	created: NotRequired[int]
	id: NotRequired[str]
	model: NotRequired[str]
	object: NotRequired[str]
	output: NotRequired[List[Dict[str, Any]]]
	output_items: NotRequired[List[Dict[str, Any]]]
	role: NotRequired[str]
	stop_reason: NotRequired[str]
	type: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

class ResponsesWebSocketCreateEvent(TypedDict):
	input: NotRequired[Union[str, List[Dict[str, Any]], Dict[str, Any]]]
	model: str
	previous_response_id: NotRequired[Optional[str]]
	store: NotRequired[bool]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
	type: Literal["response.create"]

class ResponsesWebSocketServerEvent(TypedDict):
	error: NotRequired[Dict[str, Any]]
	response: NotRequired[Dict[str, Any]]
	status: NotRequired[int]
	type: NotRequired[str]

class ResponsesWebSocketUpgradeRequiredResponse(TypedDict):
	error: NotRequired[Dict[str, Any]]

class ServerToolUsage(TypedDict):
	datetime_requests: NotRequired[int]
	web_fetch_requests: NotRequired[int]
	web_search_requests: NotRequired[int]

class TextContentPart(TypedDict):
	text: str
	type: Literal["text"]

TextGenerateTool = Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]

class TextModerationInput(TypedDict):
	text: str
	type: Literal["text"]

TextToolChoice = Union[Literal["auto", "none", "required", "gateway:datetime", "gateway:web_search", "gateway:web_fetch"], Dict[str, Any]]

class ToolCall(TypedDict):
	function: Dict[str, Any]
	id: str
	type: Literal["function"]

class ToolCallContentPart(TypedDict):
	function: Dict[str, Any]
	id: str
	type: Literal["tool_call"]

class Usage(TypedDict):
	completion_tokens: NotRequired[int]
	prompt_tokens: NotRequired[int]
	server_tool_use: NotRequired[Dict[str, Any]]
	total_tokens: NotRequired[int]

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
	generate_audio: NotRequired[bool]
	input_references: NotRequired[List[Dict[str, Any]]]
	model: str
	negative_prompt: NotRequired[str]
	output: NotRequired[Dict[str, Any]]
	person_generation: NotRequired[str]
	prompt: str
	provider: NotRequired[Dict[str, Any]]
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
	billing: NotRequired[Dict[str, Any]]
	completed_at: NotRequired[Optional[Union[int, str]]]
	content_url: NotRequired[str]
	created_at: NotRequired[Union[int, str]]
	download_url: NotRequired[Optional[str]]
	error: NotRequired[Optional[Any]]
	expires_at: NotRequired[Optional[int]]
	generation_id: NotRequired[Optional[str]]
	id: NotRequired[str]
	model: NotRequired[str]
	object: NotRequired[str]
	output_access: NotRequired[Literal["bytes", "signed_url", "both"]]
	outputs: NotRequired[List[Dict[str, Any]]]
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

class VideoInputReference(TypedDict):
	image_url: NotRequired[Dict[str, Any]]
	reference_type: NotRequired[str]
	role: NotRequired[Literal["first_frame", "last_frame", "reference", "source", "mask"]]
	type: Literal["image_url"]

class VideoOutput(TypedDict):
	bytes_available: NotRequired[bool]
	content_url: NotRequired[str]
	download_url: NotRequired[str]
	expires_at: NotRequired[int]
	index: NotRequired[int]
	mime_type: NotRequired[str]

class VideoOutputConfig(TypedDict):
	access: NotRequired[Literal["bytes", "signed_url", "both"]]

class Workspace(TypedDict):
	created_at: Optional[str]
	created_by: Optional[str]
	id: str
	name: Optional[str]
	slug: Optional[str]
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
	activity: List[Dict[str, Any]]
	limit: int
	offset: int
	ok: Literal[true]
	period_days: int
	total: int
	total_cost_cents: float

class WorkspaceCreateRequest(TypedDict):
	name: str
	slug: NotRequired[str]

class WorkspaceListResponse(TypedDict):
	data: List[Dict[str, Any]]
	total_count: int

class WorkspaceResponse(TypedDict):
	data: Dict[str, Any]

class WorkspaceUpdateRequest(TypedDict):
	name: NotRequired[str]
	slug: NotRequired[str]

models___all__ = ["ActivityEntry", "ActivityResponse", "AnalyticsAccessTokenRequiredResponse", "AnalyticsNotImplementedResponse", "AnthropicContentBlock", "AnthropicMessage", "AnthropicMessagesRequest", "AnthropicMessagesResponse", "AnthropicTool", "AnthropicUsage", "ApiKey", "ApiKeyCreateRequest", "ApiKeyListResponse", "ApiKeyResponse", "ApiKeyScopeValue", "ApiKeyUpdateRequest", "ApiKeyWithValue", "ApiKeyWithValueResponse", "AudioContentPart", "AudioSpeechRequest", "AudioTranscriptionRequest", "AudioTranscriptionResponse", "AudioTranslationRequest", "AudioTranslationResponse", "BatchBillingSummary", "BatchRequest", "BatchRequestCounts", "BatchResponse", "BenchmarkId", "CacheControl", "ChatAudioOutputPart", "ChatChoice", "ChatCompletionsRequest", "ChatCompletionsResponse", "ChatImageOutputPart", "ChatMessage", "CreditsResponse", "DataModel", "DataModelOrganisation", "DebugOptions", "DeletedResponse", "Embedding", "EmbeddingsMultimodalInput", "EmbeddingsRequest", "EmbeddingsResponse", "ErrorFailureSampleItem", "ErrorProviderCandidateDiagnostics", "ErrorProviderEnablementDiagnostics", "ErrorProviderFailureDiagnostics", "ErrorResponse", "ErrorRoutingDiagnostics", "ErrorUpstreamError", "FileResponse", "FileUploadRequest", "FunctionToolDefinition", "GatewayDatetimeToolDefinition", "GatewayModelsResponse", "GatewayWebFetchToolDefinition", "GatewayWebSearchToolDefinition", "GenerationResponse", "Image", "ImageConfig", "ImageContentPart", "ImageModerationInput", "ImagesEditRequest", "ImagesEditResponse", "ImagesGenerationRequest", "ImagesGenerationResponse", "InvalidRequestResponse", "KeyInvalidateResponse", "KnownModelId", "ListFilesResponse", "ManagementKeyCreateRequest", "ManagementKeyCreateResponse", "ManagementKeyDeleteResponse", "ManagementKeyDetailResponse", "ManagementKeyListResponse", "ManagementKeyUpdateRequest", "ManagementKeyUpdateResponse", "MessageContentPart", "Model", "ModelAvailability", "ModelId", "ModelLifecycle", "ModelProviderAvailability", "ModelsPrivacyScopeNotImplementedResponse", "ModerationCategories", "ModerationCategoryScores", "ModerationResult", "ModerationsRequest", "ModerationsResponse", "MusicGenerateRequest", "MusicGenerateResponse", "NotImplementedResponse", "OcrRequest", "OcrResponse", "OrganisationId", "OrganisationIdList", "Provider", "ProviderOptions", "ProviderRoutingOptions", "ProvisioningKey", "ProvisioningKeyDetail", "ProvisioningKeyWithValue", "RealtimeNotImplementedResponse", "ReasoningConfig", "RerankDocument", "RerankRequest", "RerankResponse", "RerankResult", "ResponsesInputItem", "ResponsesOutputAudioPart", "ResponsesOutputContentPart", "ResponsesOutputImagePart", "ResponsesOutputItem", "ResponsesOutputTextPart", "ResponsesRequest", "ResponsesResponse", "ResponsesWebSocketCreateEvent", "ResponsesWebSocketServerEvent", "ResponsesWebSocketUpgradeRequiredResponse", "ServerToolUsage", "TextContentPart", "TextGenerateTool", "TextModerationInput", "TextToolChoice", "ToolCall", "ToolCallContentPart", "Usage", "VideoContentPart", "VideoDeleteResponse", "VideoGenerationRequest", "VideoGenerationResponse", "VideoInputReference", "VideoOutput", "VideoOutputConfig", "Workspace", "WorkspaceActivityEntry", "WorkspaceActivityResponse", "WorkspaceCreateRequest", "WorkspaceListResponse", "WorkspaceResponse", "WorkspaceUpdateRequest"]
