from __future__ import annotations

from typing import Any, Dict, List, Optional, Union, Literal
from typing_extensions import NotRequired, TypedDict

class ActivityEntry(TypedDict):
	cost_cents: NotRequired[float]
	endpoint: NotRequired[str]
	latency_ms: NotRequired[int]
	model: NotRequired[str]
	provider: NotRequired[str]
	request_id: NotRequired[str]
	timestamp: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

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
	stop_sequences: NotRequired[List[str]]
	stream: NotRequired[bool]
	system: NotRequired[Union[str, List[Dict[str, Any]]]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[Dict[str, Any], str]]
	tools: NotRequired[List[Dict[str, Any]]]
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

class BatchRequest(TypedDict):
	completion_window: NotRequired[str]
	debug: NotRequired[Dict[str, Any]]
	endpoint: str
	input_file_id: str
	metadata: NotRequired[Dict[str, Any]]
	provider: NotRequired[Dict[str, Any]]

class BatchRequestCounts(TypedDict):
	completed: NotRequired[int]
	failed: NotRequired[int]
	total: NotRequired[int]

class BatchResponse(TypedDict):
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
	request_counts: NotRequired[Dict[str, Any]]
	status: NotRequired[str]

BenchmarkId = Literal["ace-bench", "ai2-sciarena", "ai2d", "aidanbench", "aider-polyglot", "aime-2024", "aime-2025", "amc", "apex-agents", "arc-agi-1", "arc-agi-2", "arena-hard", "autologi", "balrog-ai", "bfcl-overall-fc-v4", "bigcodebench", "browsecomp", "browsecomp-long-context-128k", "browsecomp-long-context-256k", "c-eval", "chartqa", "charxiv-reasoning", "cnmo-2024", "codeforces", "collie", "confabulations", "creative-story-writing", "csimpleqa", "docvqa", "dubesor-llm", "elimination-game", "eqbench", "erqa", "evalplus", "facts", "facts-benchmark-suite", "factscore-halluciation-rate", "fiction-live-bench", "frontier-math", "galileo-agent", "gdpval-aa", "global-pica", "gpqa", "gpqa-diamond", "graphwalks-bfs-lt-128k", "graphwalks-parents-lt-128k", "gsm8k", "healthbench", "healthbench-concensus", "healthbench-hard", "hmmt-2025", "humaneval", "humanitys-last-exam", "if-bench", "if-eval", "imoanswerbench", "iq-bench", "lisanbench", "livebench", "livecodebench", "livecodebench-coding", "livecodebench-pro", "livecodebench-v5", "livecodebench-v6", "lmarena-text", "lmarena-webdev", "longcodebench-1m", "longfact-concepts-hallucination-rate", "longfact-objects-hallucination-rate", "math", "math-500", "matharena", "matharena-apex", "mathvista", "mc-bench", "metr", "misguided-attention", "mle-bench", "mm-mt-bench", "mmlu", "mmlu-multilingual", "mmlu-pro", "mmlu-redux", "mmlu-redux-2.0", "mmmlu", "mmmu", "mmmu-pro", "multi-challenge", "multiPL-E", "nyt-connections", "ocrbench-v2", "ojbench", "omnidocbench-1.5", "openai-mrcr-2-needle-128k", "openai-mrcr-2-needle-256k", "openai-mrcr-8-needle-128k", "openai-mrcr-8-needle-1m", "os-world", "paperbench", "phybench", "polymath-en", "qvhighlights", "realkie", "scale-mcp-atlas", "scicode", "screenspot", "screenspot-pro", "seal-multichallenege", "simplebench", "simpleqa", "smolagents-llm", "snake-bench", "solo-bench", "supergpqa", "swe-bench", "swe-bench-live", "swe-bench-multilingual", "swe-bench-pro", "swe-lancer", "symflower-coding", "tau-2-airline", "tau-2-bench", "tau-2-retail", "tau-2-telecom", "tau-bench", "tau-bench-airline", "tau-bench-retail", "terminal-bench", "terminal-bench-2.0", "thematic-generalisation", "triviaqa", "usamo-2025", "vending-bench-2", "video-mmmu", "videomme", "weirdml", "wildbench", "xlang-agent", "zebralogic"]

class CacheControl(TypedDict):
	scope: NotRequired[str]
	ttl: NotRequired[str]
	type: NotRequired[str]

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
	modalities: NotRequired[List[str]]
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
	stop: NotRequired[Union[str, List[str]]]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	stream_options: NotRequired[Dict[str, Any]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
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
	object: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

class ChatMessage(TypedDict):
	content: NotRequired[Union[str, List[Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]]]]
	name: NotRequired[str]
	role: Literal["system", "developer", "user", "assistant", "tool"]
	tool_call_id: NotRequired[str]
	tool_calls: NotRequired[List[Dict[str, Any]]]

class DataModel(TypedDict):
	deprecation_date: NotRequired[Optional[str]]
	hidden: NotRequired[bool]
	input_types: NotRequired[List[str]]
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

class Embedding(TypedDict):
	embedding: NotRequired[List[float]]
	index: NotRequired[int]
	object: NotRequired[str]

class EmbeddingsRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	dimensions: NotRequired[int]
	embedding_options: NotRequired[Dict[str, Any]]
	encoding_format: NotRequired[str]
	input: NotRequired[Union[str, List[str]]]
	inputs: NotRequired[Union[str, List[str]]]
	model: NotRequired[str]
	provider: NotRequired[Dict[str, Any]]
	user: NotRequired[str]

class EmbeddingsResponse(TypedDict):
	data: NotRequired[List[Dict[str, Any]]]
	model: NotRequired[str]
	object: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

class ErrorResponse(TypedDict):
	error: NotRequired[str]
	message: NotRequired[str]
	ok: NotRequired[bool]

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

class GenerationResponse(TypedDict):
	app_id: NotRequired[Optional[str]]
	byok: NotRequired[bool]
	cost_nanos: NotRequired[float]
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

class ListFilesResponse(TypedDict):
	data: NotRequired[List[Dict[str, Any]]]
	object: NotRequired[str]

MessageContentPart = Union[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]

class Model(TypedDict):
	aliases: NotRequired[List[str]]
	architecture: NotRequired[Dict[str, Any]]
	canonical_slug: NotRequired[str]
	created: NotRequired[Optional[int]]
	deprecation_date: NotRequired[Optional[str]]
	description: NotRequired[str]
	endpoints: NotRequired[List[str]]
	id: NotRequired[str]
	input_types: NotRequired[List[str]]
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

ModelId = Literal["ai21/jamba-2-3b-2026-01-08", "ai21/jamba-2-mini-2026-01-08", "ai21/jamba-large-1-5-2024-08-22", "ai21/jamba-large-1-6-2025-03-06", "ai21/jamba-large-1-7-2025-07-03", "ai21/jamba-mini-1-5-2024-08-22", "ai21/jamba-mini-1-6-2025-03-06", "ai21/jamba-mini-1-7-2025-07-03", "ai21/jamba-reasoning-3b-2025-10-08", "aion-labs/aion-1-0-2025-01-29", "aion-labs/aion-1-0-mini-2025-01-29", "aion-labs/aion-2-0-2025-12-21", "aion-labs/aion-rp-llama-3-1-8b-2024-11-30", "allenai/bolmo-1b-2025-12-15", "allenai/bolmo-7b-2025-12-15", "allenai/molmo-2-4b-2025-12-16", "allenai/molmo-2-8b-2025-12-16", "allenai/olmo-3-1-32b-instruct-2025-12-12", "allenai/olmo-3-1-32b-think-2025-12-12", "allenai/olmo-3-32b-think-2025-11-20", "allenai/olmo-3-7b-instruct-2025-11-20", "allenai/olmo-3-7b-think-2025-11-20", "amazon/nova-2-lite-2025-12-02", "amazon/nova-2-omni-2025-12-02", "amazon/nova-2-pro-2025-12-02", "amazon/nova-2-sonic-2025-12-02", "amazon/nova-canvas-2024-12-03", "amazon/nova-lite-1-0-2024-12-04", "amazon/nova-micro-1-0-2024-12-04", "amazon/nova-multimodal-embeddings-2025-12-02", "amazon/nova-premier-2025-04-30", "amazon/nova-pro-1-0-2024-12-04", "amazon/nova-reel-2024-12-03", "amazon/nova-sonic-2025-04-08", "anthropic/claude-1-0-2023-03-14", "anthropic/claude-1-1", "anthropic/claude-1-2", "anthropic/claude-1-3", "anthropic/claude-2-0-2023-07-12", "anthropic/claude-2-1-2023-11-22", "anthropic/claude-3-5-haiku-2024-11-04", "anthropic/claude-3-5-sonnet-2024-06-21", "anthropic/claude-3-5-sonnet-2024-10-22", "anthropic/claude-3-7-sonnet-2025-02-24", "anthropic/claude-3-haiku-2024-03-13", "anthropic/claude-3-opus-2024-03-04", "anthropic/claude-3-sonnet-2024-03-04", "anthropic/claude-haiku-4-5-2025-10-15", "anthropic/claude-instant-1-0-2023-03-14", "anthropic/claude-instant-1-1", "anthropic/claude-instant-1-2-2023-08-09", "anthropic/claude-opus-4-1-2025-08-05", "anthropic/claude-opus-4-2025-05-21", "anthropic/claude-opus-4-5-2025-11-24", "anthropic/claude-opus-4-6-2026-02-05", "anthropic/claude-sonnet-4-2025-05-21", "anthropic/claude-sonnet-4-5-2025-09-29", "anthropic/claude-sonnet-4-6-2026-02-17", "arcee-ai/trinity-large-2026-01-27", "arcee-ai/trinity-mini-2025-12-01", "arcee-ai/trinity-nano-preview-2025-12-01", "baidu/ernie-4-5-21b-a3b", "baidu/ernie-4-5-21b-a3b-thinking", "baidu/ernie-4-5-300b-a47b", "baidu/ernie-4-5-turbo", "baidu/ernie-4-5-vl-28b-a3b", "baidu/ernie-4-5-vl-424b-a47b", "baidu/ernie-5-0-0110", "baidu/ernie-5-0-2026-01-22", "baidu/ernie-5-0-preview-1203", "baidu/ernie-5-0-preview-1220", "baidu/ernie-x1-1", "baidu/qianfan-vl-3b", "baidu/qianfan-vl-70b", "baidu/qianfan-vl-8b", "black-forest-labs/flux-2-dev-2025-11-25", "black-forest-labs/flux-2-flex-2025-11-25", "black-forest-labs/flux-2-klein-4b-2026-01-15", "black-forest-labs/flux-2-klein-9b-2026-01-15", "black-forest-labs/flux-2-max-2025-12-16", "black-forest-labs/flux-2-pro-2025-11-25", "bytedance/seed-1-6-2025-06-25", "bytedance/seed-1-6-flash-2025-06-25", "bytedance/seed-1-8-2025-12-18", "bytedance/seed-2-0-lite-2026-02-14", "bytedance/seed-2-0-mini-2026-02-14", "bytedance/seed-2-0-pro-2026-02-14", "bytedance/seed-coder-8b-instruct", "bytedance/seed-coder-8b-reasoning", "bytedance/seed-oss-36b-instruct", "bytedance/seedream-4-5-2025-12-03", "cohere/c4ai-aya-expanse-32b", "cohere/c4ai-aya-expanse-8b", "cohere/c4ai-aya-vision-32b-2025-03-04", "cohere/c4ai-aya-vision-8b-2025-03-04", "cohere/command", "cohere/command-a-2025-03-13", "cohere/command-a-reasoning-2025-08-21", "cohere/command-a-translate-2025-08-28", "cohere/command-a-vision-2025-07-31", "cohere/command-light", "cohere/command-r-2024-03-11", "cohere/command-r-2024-08-30", "cohere/command-r-7b-2024-12-13", "cohere/command-r+-2024-04-04", "cohere/command-r+-2024-08-30", "cohere/embed-english-light-v2-0", "cohere/embed-english-light-v3", "cohere/embed-english-v2-0", "cohere/embed-english-v3", "cohere/embed-multilingual-light-v3", "cohere/embed-multilingual-v2-0", "cohere/embed-multilingual-v3", "cohere/embed-v4-2025-04-15", "cohere/rerank-multilingual-v3", "cohere/rerank-v3-5-2024-10-02", "cohere/rerank-v4-0-fast-2025-12-11", "cohere/rerank-v4-0-pro-2025-12-11", "cohere/rerenk-english-v3", "cursor/composer-1-2025-10-29", "cursor/composer-1-5-2026-02-09", "deepseek/deepseek-coder-v2-2024-06-14", "deepseek/deepseek-coder-v2-2024-07-24", "deepseek/deepseek-ocr-2", "deepseek/deepseek-ocr-2025-10-20", "deepseek/deepseek-r1-2025-01-20", "deepseek/deepseek-r1-2025-05-28", "deepseek/deepseek-r1-lite-preview-2024-11-20", "deepseek/deepseek-v2-2024-05-17", "deepseek/deepseek-v2-2024-06-28", "deepseek/deepseek-v2-5-2024-09-05", "deepseek/deepseek-v2-5-2024-12-10", "deepseek/deepseek-v3-1-2025-08-21", "deepseek/deepseek-v3-1-terminus-2025-09-22", "deepseek/deepseek-v3-2-2025-12-01", "deepseek/deepseek-v3-2-exp-2025-09-29", "deepseek/deepseek-v3-2-speciale-2025-12-01", "deepseek/deepseek-v3-2024-12-26", "deepseek/deepseek-v3-2025-03-25", "deepseek/deepseek-v4", "deepseek/deepseek-vl2-2024-12-13", "deepseek/deepseek-vl2-small-2024-12-13", "deepseek/deepseek-vl2-tiny-2024-12-13", "eleven-labs/eleven-english-sts-v2", "eleven-labs/eleven-flash-v2", "eleven-labs/eleven-flash-v2-5", "eleven-labs/eleven-monolingual-v1", "eleven-labs/eleven-multilingual-sts-v2", "eleven-labs/eleven-multilingual-ttv-v2", "eleven-labs/eleven-multilingual-v1", "eleven-labs/eleven-multilingual-v2", "eleven-labs/eleven-ttv-v3", "eleven-labs/eleven-turbo-v2", "eleven-labs/eleven-turbo-v2-5", "eleven-labs/eleven-v3", "eleven-labs/scribe-v1", "eleven-labs/scribe-v2-2026-01-09", "eleven-labs/scribe-v2-realtime-2025-11-11", "essential-ai/rnj-1-2025-12-06", "google/chat-bison-2023-05-01", "google/code-gecko-2023-05-01", "google/embedding-001-2023-12-13", "google/gemini-1-0-nano-2023-12-06", "google/gemini-1-0-pro-2023-12-06", "google/gemini-1-0-pro-vision-001-2024-02-15", "google/gemini-1-0-ultra-2023-12-06", "google/gemini-1-5-flash-001-2024-05-23", "google/gemini-1-5-flash-002-2024-09-24", "google/gemini-1-5-flash-8b-2024-03-15", "google/gemini-1-5-flash-8b-exp-2024-08-27", "google/gemini-1-5-flash-8b-exp-2024-09-24", "google/gemini-1-5-flash-preview-2024-05-14", "google/gemini-1-5-pro-001-2024-05-23", "google/gemini-1-5-pro-002-2024-09-24", "google/gemini-1-5-pro-exp-2024-08-01", "google/gemini-1-5-pro-exp-2024-08-27", "google/gemini-2-0-flash-2025-02-05", "google/gemini-2-0-flash-exp", "google/gemini-2-0-flash-exp-image-generation", "google/gemini-2-0-flash-lite-2025-02-05", "google/gemini-2-0-flash-live-001-2025-04-09", "google/gemini-2-0-flash-preview-image-generation-2025-05-07", "google/gemini-2-0-flash-thinking-exp-2024-12-19", "google/gemini-2-0-flash-thinking-exp-2025-01-21", "google/gemini-2-0-pro-exp-2025-02-05", "google/gemini-2-5-computer-use-preview-2025-10-07", "google/gemini-2-5-flash-exp-native-audio-thinking-dialog", "google/gemini-2-5-flash-image-2025-10-02", "google/gemini-2-5-flash-image-preview-2025-08-25", "google/gemini-2-5-flash-lite-preview-2025-06-17", "google/gemini-2-5-flash-lite-preview-2025-09-25", "google/gemini-2-5-flash-native-audio-preview", "google/gemini-2-5-flash-preview-2025-04-17", "google/gemini-2-5-flash-preview-2025-05-20", "google/gemini-2-5-flash-preview-2025-09-25", "google/gemini-2-5-flash-preview-native-audio-dialog", "google/gemini-2-5-flash-preview-tts", "google/gemini-2-5-flash-preview-tts-2025-12-10", "google/gemini-2-5-pro-experimental-2025-03-25", "google/gemini-2-5-pro-preview-2025-05-06", "google/gemini-2-5-pro-preview-2025-06-05", "google/gemini-2-5-pro-preview-tts", "google/gemini-2-5-pro-preview-tts-2025-12-10", "google/gemini-3-1-flash-image-preview-2026-02-26", "google/gemini-3-1-flash-lite-preview-2026-03-03", "google/gemini-3-1-pro-preview-2026-02-19", "google/gemini-3-flash-preview-2025-12-17", "google/gemini-3-pro-image-preview-2025-11-20", "google/gemini-3-pro-preview-2025-11-18", "google/gemini-diffusion", "google/gemini-embedding-001-2025-05-20", "google/gemini-embedding-exp-0307-2025-03-07", "google/gemini-exp-1114-2024-11-14", "google/gemini-exp-1121-2024-11-21", "google/gemini-exp-1206-2024-12-06", "google/gemini-live-2-5-flash-preview-2025-04-09", "google/gemini-robotics-er-1-5-preview-2025-09-25", "google/gemma-1-2b-2024-02-21", "google/gemma-1-7b-2024-02-21", "google/gemma-2-27b-2024-06-27", "google/gemma-2-2b-2024-07-31", "google/gemma-2-9b-2024-06-27", "google/gemma-3-12b-2025-03-12", "google/gemma-3-1b-2025-03-12", "google/gemma-3-27b-2025-03-12", "google/gemma-3-4b-2025-03-12", "google/gemma-3n-e2b-2025-06-25", "google/gemma-3n-e4b-2025-06-25", "google/image-generation-002-2023-08-17", "google/image-generation-005-2023-11-22", "google/image-generation-006-2024-03-27", "google/image-text-2023-06-07", "google/imagen-3-0-generate-001-2024-07-31", "google/imagen-3-0-generate-002-2025-01-29", "google/imagen-4-0-fast-generate-001-2025-08-14", "google/imagen-4-0-fast-generate-preview-2025-06-11", "google/imagen-4-0-generate-001-2025-08-14", "google/imagen-4-0-generate-preview-2025-06-11", "google/imagen-4-0-preview-2025-05-20", "google/imagen-4-0-ultra-generate-001-2025-08-14", "google/imagen-4-0-ultra-generate-preview-2025-06-11", "google/imagen-4-0-ultra-preview-2025-05-20", "google/learnlm-1-5-pro-experimental-2024-11-19", "google/learnlm-2-0-flash-experimental-2025-04-17", "google/lyria-1", "google/lyria-2", "google/lyria-3-2026-02-18", "google/medgemma-1-5-4b-2026-01-13", "google/multimodal-embedding-001-2024-02-12", "google/text-bison-2023-05-01", "google/text-embedding-004-2024-05-14", "google/text-embedding-005-2024-11-18", "google/text-embedding-gecko-001-2023-06-07", "google/text-embedding-gecko-002-2023-11-02", "google/text-embedding-gecko-003-2023-12-12", "google/text-embedding-gecko-multilingual-001-2023-11-02", "google/text-multilingual-embedding-002-2024-05-14", "google/translategemma-12b-2026-01-15", "google/translategemma-27b-2026-01-15", "google/translategemma-4b-2026-01-15", "google/veo-2-2025-04-09", "google/veo-3-0-fast-generate-preview-2025-07-17", "google/veo-3-0-generate-preview-2025-07-17", "google/veo-3-1-fast-preview-2025-10-15", "google/veo-3-1-preview-2025-10-15", "google/veo-3-2", "google/veo-3-2025-09-09", "google/veo-3-fast-2025-09-09", "google/veo-4", "ibm/granite-20b-code-instruct-8k", "ibm/granite-3-0-1b-a400m-instruct", "ibm/granite-3-0-2b-instruct", "ibm/granite-3-0-3b-a800m-instruct", "ibm/granite-3-0-8b-instruct", "ibm/granite-3-1-1b-a400m-instruct", "ibm/granite-3-1-2b-instruct", "ibm/granite-3-1-3b-a800m-instruct", "ibm/granite-3-1-8b-instruct", "ibm/granite-3-2-2b-instruct", "ibm/granite-3-2-8b-instruct", "ibm/granite-3-2-8b-instruct-preview", "ibm/granite-3-3-2b-instruct-2025-04-16", "ibm/granite-3-3-8b-instruct-2025-04-16", "ibm/granite-34b-code-instruct-8b", "ibm/granite-3b-code-instruct-128k", "ibm/granite-3b-code-instruct-2k", "ibm/granite-4-0-micro-2025-10-02", "ibm/granite-4-0-small-2025-10-02", "ibm/granite-4-0-tiny-2025-10-02", "ibm/granite-4-0-tiny-preview-2025-05-02", "ibm/granite-8b-code-instruct-128k", "ibm/granite-8b-code-instruct-4k", "ibm/granite-embedding-107m-multilingual", "ibm/granite-embedding-125m-english", "ibm/granite-embedding-278m-multilingual", "ibm/granite-embedding-30m-english", "ibm/granite-embedding-english-r2", "ibm/granite-embedding-reranker-english-r2", "ibm/granite-embedding-small-english-r2", "ibm/granite-guardian-3-0-2b", "ibm/granite-guardian-3-0-8b", "ibm/granite-guardian-3-1-2b", "ibm/granite-guardian-3-1-8b", "ibm/granite-guardian-3-2-5b", "ibm/granite-guardian-3-3-8b", "ibm/granite-speech-3-2-8b", "ibm/granite-speech-3-3-2b", "ibm/granite-speech-3-3-8b", "ibm/granite-vision-3-1-2b-preview", "ibm/granite-vision-3-2-2b", "ibm/granite-vision-3-3-2b", "ibm/granite-vision-3-3-2b-embedding", "inception/mercury-2-2026-02-24", "inclusionai/ring-1t-2-5-2026-02-12", "lg/exaone-3-0-2024-08-07", "lg/exaone-3-5-2-4b-2024-12-09", "lg/exaone-3-5-32b-2024-12-09", "lg/exaone-3-5-7-8b-2024-12-09", "lg/exaone-4-0-1-2b-2025-07-15", "lg/exaone-4-0-32b-2025-07-15", "lg/exaone-deep-2-4b-2025-03-18", "lg/exaone-deep-32b-2025-03-18", "lg/exaone-deep-7-8b-2025-03-18", "lg/k-exaone-2025-12-31", "liquid-ai/lfm-2-1-2b-2025-07-10", "liquid-ai/lfm-2-2-6b-2025-09-23", "liquid-ai/lfm-2-24b-a2b-2026-02-24", "liquid-ai/lfm-2-350m-2025-07-10", "liquid-ai/lfm-2-5-1-2b-2026-01-06", "liquid-ai/lfm-2-5-1-2b-jp-2026-01-06", "liquid-ai/lfm-2-5-1-2b-thinking-2026-01-20", "liquid-ai/lfm-2-5-audio-1-5b", "liquid-ai/lfm-2-5-vl-1-6b", "liquid-ai/lfm-2-700m-2025-07-10", "liquid-ai/lfm-2-8b-a1b-2025-10-07", "meta/llama-2-13b-chat-2023-06-20", "meta/llama-2-70b-chat-2023-06-20", "meta/llama-2-7b-chat", "meta/llama-3-1-405b-instruct-2024-07-23", "meta/llama-3-1-70b-instruct-2024-07-23", "meta/llama-3-1-8b-instruct-2024-07-23", "meta/llama-3-2-11b-vision-instruct", "meta/llama-3-2-1b-instruct-2024-09-25", "meta/llama-3-2-3b-instruct-2024-09-25", "meta/llama-3-2-90b-vision-instruct", "meta/llama-3-3-70b-instruct-2024-12-06", "meta/llama-3-70b-instruct-2024-04-18", "meta/llama-3-8b-instruct-2024-04-18", "meta/llama-4-maverick-2025-04-05", "meta/llama-4-scout-2025-04-05", "microsoft/phi-1", "microsoft/phi-1-5", "microsoft/phi-2", "microsoft/phi-3-5-mini-instruct-2024-08-23", "microsoft/phi-3-5-moe-instruct-2024-08-23", "microsoft/phi-3-5-vision-instruct-2024-08-23", "microsoft/phi-3-medium-128k-instruct", "microsoft/phi-3-medium-4k-instruct", "microsoft/phi-3-mini-128k-instruct", "microsoft/phi-3-small-128k-instruct", "microsoft/phi-3-small-8k-instruct", "microsoft/phi-3-vision-128k-instruct", "microsoft/phi-4-2024-12-12", "microsoft/phi-4-mini-2025-02-01", "microsoft/phi-4-mini-flash-reasoning", "microsoft/phi-4-mini-reasoning-2025-04-30", "microsoft/phi-4-multimodal-instruct-2025-02-01", "microsoft/phi-4-reasoning-2025-04-30", "microsoft/phi-4-reasoning-plus-2025-04-30", "minimax/hailuo-02-2025-06-18", "minimax/hailuo-2-3-2025-10-28", "minimax/hailuo-2-3-fast-2025-10-28", "minimax/i2v-01-director-2025-02-11", "minimax/i2v-01-live", "minimax/image-01-2025-02-15", "minimax/minimax-m1-40k-2025-06-16", "minimax/minimax-m1-80k-2025-06-16", "minimax/minimax-m2-1-2025-12-23", "minimax/minimax-m2-2025-10-27", "minimax/minimax-m2-5-2026-02-12", "minimax/minimax-m2-her-2026-01-24", "minimax/minimax-text-01-2025-01-15", "minimax/minimax-vl-01-2025-01-15", "minimax/music-1-5-2025-06-20", "minimax/music-2-0-2025-10-29", "minimax/music-2-5-2026-01-16", "minimax/s2v-01", "minimax/speech-01-hd", "minimax/speech-01-turbo", "minimax/speech-02-hd-2025-04-02", "minimax/speech-02-turbo-2025-04-02", "minimax/speech-2-5-hd-preview-2025-08-06", "minimax/speech-2-5-turbo-preview-2025-08-06", "minimax/speech-2-6-2025-10-29", "minimax/t2v-01-director-2025-02-11", "mistral/codestral-2024-05-29", "mistral/codestral-2025-01-13", "mistral/codestral-2025-07-30", "mistral/codestral-embed-2025-05-28", "mistral/codestral-mamba-7b-2024-07-16", "mistral/devstral-2-0-2025-12-09", "mistral/devstral-medium-1-0-2025-07-10", "mistral/devstral-small-1-0-2025-05-21", "mistral/devstral-small-1-1-2025-07-10", "mistral/devstral-small-2-0-2025-12-09", "mistral/magistral-medium-1-0-2025-06-10", "mistral/magistral-medium-1-1-2025-07-24", "mistral/magistral-medium-1-2-2025-09-17", "mistral/magistral-small-1-0-2025-06-10", "mistral/magistral-small-1-1-2025-07-24", "mistral/magistral-small-1-2-2025-09-17", "mistral/mathstral-7b-2024-07-16", "mistral/ministral-3-0-14b-2025-12-02", "mistral/ministral-3-0-3b-2025-12-02", "mistral/ministral-3-0-8b-2025-12-02", "mistral/ministral-3b-2024-10-09", "mistral/ministral-8b-2024-10-09", "mistral/mistral-7b-2023-09-27", "mistral/mistral-7b-2023-12-11", "mistral/mistral-7b-2024-05-22", "mistral/mistral-embed-2023-12-11", "mistral/mistral-large-1-0-2024-02-26", "mistral/mistral-large-2-0-2024-07-24", "mistral/mistral-large-2-1-2024-11-18", "mistral/mistral-large-3-0-2025-12-02", "mistral/mistral-medium-1-0-2023-12-11", "mistral/mistral-medium-3-0-2025-05-07", "mistral/mistral-medium-3-1-2025-08-12", "mistral/mistral-moderation-2024-11-06", "mistral/mistral-nemo-12b-2024-07-18", "mistral/mistral-ocr-2-2025-05-22", "mistral/mistral-ocr-2025-03-06", "mistral/mistral-saba-2025-02-17", "mistral/mistral-small-1-0-2024-02-26", "mistral/mistral-small-2-0-2024-09-17", "mistral/mistral-small-3-0-2025-01-30", "mistral/mistral-small-3-1-2025-03-17", "mistral/mistral-small-3-2-2025-06-20", "mistral/mistral-small-creative-2025-12-16", "mistral/mixtral-8x22b-2024-04-17", "mistral/mixtral-8x7b-2023-12-11", "mistral/ocr-3-2025-12-18", "mistral/pixtral-12b-2024-09-17", "mistral/pixtral-large-2024-11-18", "mistral/voxtral-mini-2025-07-15", "mistral/voxtral-mini-transcribe-2-2026-02-04", "mistral/voxtral-mini-transcribe-2025-07-15", "mistral/voxtral-small-2025-07-15", "moonshot-ai/kimi-k1-5-2025-01-20", "moonshot-ai/kimi-k2-2025-07-11", "moonshot-ai/kimi-k2-2025-09-05", "moonshot-ai/kimi-k2-5-2026-01-27", "moonshot-ai/kimi-k2-thinking-2025-11-06", "moonshot-ai/kimi-linear-48b-2025-10-30", "moonshot-ai/kimi-vl-a3b-2025-04-09", "moonshot-ai/kimi-vl-a3b-thinking-2025-04-09", "moonshot-ai/kimi-vl-a3b-thinking-2025-06-21", "naver-hyperclova/hyperclova-x-seed-omni-8b-2025-12-29", "naver-hyperclova/hyperclova-x-seed-think-14b-2025-07-22", "naver-hyperclova/hyperclova-x-seed-think-32b-2025-12-29", "nous/hermes-2-llama-2-70b-2024-02-12", "nous/hermes-2-pro-llama-3-70b-2024-06-27", "nous/hermes-2-pro-llama-3-8b-2024-05-01", "nous/hermes-2-pro-mistral-7b-2024-03-13", "nous/hermes-2-theta-llama-3-70b-2024-06-20", "nous/hermes-2-theta-llama-3-8b-2024-05-15", "nous/hermes-3-llama-3-1-405b-2024-08-15", "nous/hermes-3-llama-3-1-70b-2024-08-15", "nous/hermes-3-llama-3-1-8b-2024-08-15", "nous/hermes-3-llama-3-2-3b-2024-12-11", "nous/hermes-4-14b-2025-07-26", "nous/hermes-4-3-36b-2025-12-03", "nous/hermes-4-405b-2025-07-26", "nous/hermes-4-70b-2025-07-26", "nous/nomos-1-2025-12-09", "nous/nouscoder-14b-2026-01-06", "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01", "nvidia/llama-3-1-nemotron-nano-4b-v1-1", "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18", "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07", "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18", "nvidia/llama-3-3-nemotron-super-49b-v1-5", "nvidia/nemotron-nano-3-30b-a3b-2025-12-15", "nvidia/nvidia-nemotron-nano-12b-v2", "nvidia/nvidia-nemotron-nano-9b-v2", "nvidia/openreasoning-nemotron-1-5b", "nvidia/openreasoning-nemotron-14b", "nvidia/openreasoning-nemotron-32b", "nvidia/openreasoning-nemotron-7b", "openai/ada-2020-06-11", "openai/babbage-002-2023-08-22", "openai/babbage-2020-06-11", "openai/chatgpt-4o-2024-05-13", "openai/chatgpt-image-latest-2025-12-16", "openai/code-cushman-001", "openai/code-cushman-002", "openai/code-davinci-001", "openai/code-davinci-002", "openai/code-davinci-edit-001", "openai/code-search-ada-code-001", "openai/code-search-ada-text-001", "openai/code-search-babbage-code-001", "openai/code-search-babbage-text-001", "openai/codex-mini-2025-05-16", "openai/computer-use-preview-2025-03-11", "openai/curie-2020-06-11", "openai/dall-e-2-2022-09-28", "openai/dall-e-2021-01-05", "openai/dall-e-3-2023-10-19", "openai/davinci-002-2023-08-22", "openai/davinci-2020-06-11", "openai/gpt-1-2018-06-11", "openai/gpt-2-2019-11-05", "openai/gpt-3-2020-06-11", "openai/gpt-3-5-turbo-0613", "openai/gpt-3-5-turbo-16k-0613-2023-06-13", "openai/gpt-3-5-turbo-2023-03-21", "openai/gpt-3-5-turbo-2023-09-28", "openai/gpt-3-5-turbo-2023-11-06", "openai/gpt-4-1-2025-04-14", "openai/gpt-4-1-mini-2025-04-14", "openai/gpt-4-1-nano-2025-04-14", "openai/gpt-4-2023-03-14", "openai/gpt-4-2023-06-13", "openai/gpt-4-32k", "openai/gpt-4-32k-0314", "openai/gpt-4-32k-0613", "openai/gpt-4-5-2025-02-27", "openai/gpt-4-turbo-2023-03-14", "openai/gpt-4-turbo-2023-11-06", "openai/gpt-4-turbo-2024-01-25", "openai/gpt-4o-2024-05-13", "openai/gpt-4o-2024-08-06", "openai/gpt-4o-2024-11-20", "openai/gpt-4o-audio-2024-10-01", "openai/gpt-4o-audio-2024-12-17", "openai/gpt-4o-audio-2025-06-03", "openai/gpt-4o-mini-2024-07-18", "openai/gpt-4o-mini-audio-preview-2024-12-17", "openai/gpt-4o-mini-realtime-preview-2024-12-17", "openai/gpt-4o-mini-search-preview-2025-03-11", "openai/gpt-4o-mini-transcribe-2025-03-20", "openai/gpt-4o-mini-transcribe-2025-12-15", "openai/gpt-4o-mini-tts-2025-03-20", "openai/gpt-4o-mini-tts-2025-12-15", "openai/gpt-4o-realtime-preview-2024-10-01", "openai/gpt-4o-realtime-preview-2024-12-17", "openai/gpt-4o-realtime-preview-2025-06-03", "openai/gpt-4o-search-preview-2025-03-11", "openai/gpt-4o-transcribe-2025-03-20", "openai/gpt-4o-transcribe-diarize-2025-10-15", "openai/gpt-5-1-2025-11-12", "openai/gpt-5-1-chat-2025-11-13", "openai/gpt-5-1-codex-2025-11-13", "openai/gpt-5-1-codex-max-2025-11-19", "openai/gpt-5-1-codex-mini-2025-11-13", "openai/gpt-5-1-pro", "openai/gpt-5-2-2025-12-11", "openai/gpt-5-2-chat-2025-12-11", "openai/gpt-5-2-codex-2025-12-18", "openai/gpt-5-2-mini", "openai/gpt-5-2-pro-2025-12-11", "openai/gpt-5-2025-08-07", "openai/gpt-5-3-chat-2026-03-03", "openai/gpt-5-3-codex-2026-02-05", "openai/gpt-5-3-codex-spark-2026-02-12", "openai/gpt-5-4", "openai/gpt-5-chat-2025-08-07", "openai/gpt-5-codex-2025-09-15", "openai/gpt-5-codex-mini-2025-11-07", "openai/gpt-5-mini-2025-08-07", "openai/gpt-5-nano-2025-08-07", "openai/gpt-5-pro-2025-08-07", "openai/gpt-5-search-api-2025-10-14", "openai/gpt-audio-1-5-2026-02-23", "openai/gpt-audio-2025-08-28", "openai/gpt-audio-mini-2025-10-06", "openai/gpt-audio-mini-2025-12-15", "openai/gpt-image-1-2025-04-23", "openai/gpt-image-1-5-2025-12-16", "openai/gpt-image-1-mini-2025-10-06", "openai/gpt-oss-120b-2025-08-05", "openai/gpt-oss-20b-2025-08-05", "openai/gpt-oss-safeguard-120b-2025-10-29", "openai/gpt-oss-safeguard-20b-2025-10-29", "openai/gpt-realtime-1-5-2026-02-23", "openai/gpt-realtime-2025-08-28", "openai/gpt-realtime-mini-2025-10-06", "openai/gpt-realtime-mini-2025-12-15", "openai/o1-2024-12-17", "openai/o1-mini-2024-09-12", "openai/o1-preview-2024-09-12", "openai/o1-pro-2025-03-19", "openai/o3-2025-04-16", "openai/o3-deep-research-2025-06-26", "openai/o3-mini-2025-01-30", "openai/o3-preview", "openai/o3-pro-2025-06-10", "openai/o4-mini-2025-04-16", "openai/o4-mini-deep-research-2025-06-26", "openai/omni-moderation-2024-09-26", "openai/sora-1-2024-12-09", "openai/sora-2-2025-09-30", "openai/sora-2-2025-12-08", "openai/sora-2-pro-2025-10-03", "openai/text-ada-001", "openai/text-babbage-001", "openai/text-curie-001", "openai/text-davinci-001", "openai/text-davinci-002", "openai/text-davinci-003", "openai/text-davinci-edit-001", "openai/text-embedding-3-large-2024-01-25", "openai/text-embedding-3-small-2024-01-25", "openai/text-embedding-ada-002-2022-12-15", "openai/text-moderation-007", "openai/text-search-ada-doc-001", "openai/text-search-ada-query-001", "openai/text-search-babbage-doc-001", "openai/text-search-babbage-query-001", "openai/text-search-curie-doc-001", "openai/text-search-curie-query-001", "openai/text-search-davinci-doc-001", "openai/text-search-davinci-query-001", "openai/text-similarity-ada-001", "openai/text-similarity-babbage-001", "openai/text-similarity-curie-001", "openai/text-similarity-davinci-001", "openai/tts-1-2023-11-06", "openai/tts-1-hd-2023-11-06", "openai/whisper-1-2023-03-01", "prime-intellect/intellect-3-1-2026-02-18", "prime-intellect/intellect-3-2025-11-26", "qwen/code-qwen-1-5-7b", "qwen/qvq-72b-preview", "qwen/qwen-1-5-0-5b", "qwen/qwen-1-5-1-8b", "qwen/qwen-1-5-110b", "qwen/qwen-1-5-14b", "qwen/qwen-1-5-32b", "qwen/qwen-1-5-4b", "qwen/qwen-1-5-72b", "qwen/qwen-1-5-7b", "qwen/qwen-1-5-moe-a2-7b", "qwen/qwen-1-8b", "qwen/qwen-14b", "qwen/qwen-2-0-5b", "qwen/qwen-2-1-5b", "qwen/qwen-2-5-0-5b", "qwen/qwen-2-5-1-5b", "qwen/qwen-2-5-14b", "qwen/qwen-2-5-32b", "qwen/qwen-2-5-3b", "qwen/qwen-2-5-72b", "qwen/qwen-2-5-7b", "qwen/qwen-2-5-coder-0-5b", "qwen/qwen-2-5-coder-1-5b", "qwen/qwen-2-5-coder-14b", "qwen/qwen-2-5-coder-32b-instruct", "qwen/qwen-2-5-coder-3b", "qwen/qwen-2-5-coder-7b", "qwen/qwen-2-5-math-1-5b", "qwen/qwen-2-5-math-72b", "qwen/qwen-2-5-math-7b", "qwen/qwen-2-5-math-7b-prm800k", "qwen/qwen-2-5-math-prm-72b", "qwen/qwen-2-5-math-prm-7b", "qwen/qwen-2-5-math-rm-72b", "qwen/qwen-2-5-omni-3b", "qwen/qwen-2-5-omni-7b", "qwen/qwen-2-5-vl-32b-instruct", "qwen/qwen-2-5-vl-3b-instruct", "qwen/qwen-2-5-vl-72b-instruct", "qwen/qwen-2-5-vl-7b-instruct", "qwen/qwen-2-72b-instruct", "qwen/qwen-2-7b-instruct", "qwen/qwen-2-audio-7b", "qwen/qwen-2-math-1-5b", "qwen/qwen-2-math-72b", "qwen/qwen-2-math-7b", "qwen/qwen-2-math-rm-72b", "qwen/qwen-2-vl-2b", "qwen/qwen-2-vl-72b", "qwen/qwen-2-vl-7b", "qwen/qwen-3-0-6b", "qwen/qwen-3-1-7b", "qwen/qwen-3-14b", "qwen/qwen-3-235b-a22b", "qwen/qwen-3-235b-a22b-thinking-2507", "qwen/qwen-3-30b-a3b", "qwen/qwen-3-30b-a3b-instruct-2507", "qwen/qwen-3-30b-a3b-thinking-2507", "qwen/qwen-3-32b", "qwen/qwen-3-4b", "qwen/qwen-3-4b-instruct-2507", "qwen/qwen-3-4b-saferl", "qwen/qwen-3-4b-thinking-2507", "qwen/qwen-3-5-0-8b-2026-03-02", "qwen/qwen-3-5-122b-a10b-2026-02-24", "qwen/qwen-3-5-27b-2026-02-24", "qwen/qwen-3-5-2b-2026-03-02", "qwen/qwen-3-5-35b-a3b-2026-02-24", "qwen/qwen-3-5-397b-a17b-2026-02-16", "qwen/qwen-3-5-4b-2026-03-02", "qwen/qwen-3-5-9b-2026-03-02", "qwen/qwen-3-5-flash-2026-02-23", "qwen/qwen-3-5-plus-2026-02-16", "qwen/qwen-3-8b", "qwen/qwen-3-a235-a22b-instruct-2507", "qwen/qwen-3-asr-0-6b", "qwen/qwen-3-asr-1-7b", "qwen/qwen-3-coder-30b-a3b-instruct", "qwen/qwen-3-coder-480b-a35b-instruct", "qwen/qwen-3-coder-next", "qwen/qwen-3-embedding-0-6b", "qwen/qwen-3-embedding-4b", "qwen/qwen-3-embedding-8b", "qwen/qwen-3-forcedaligner-0-6b", "qwen/qwen-3-guard-gen-0-6b", "qwen/qwen-3-guard-gen-4b", "qwen/qwen-3-guard-gen-8b", "qwen/qwen-3-guard-stream-0-6b", "qwen/qwen-3-guard-stream-4b", "qwen/qwen-3-guard-stream-8b", "qwen/qwen-3-max-thinking-2026-01-26", "qwen/qwen-3-next-80b-a3b-instruct", "qwen/qwen-3-next-80b-a3b-thinking", "qwen/qwen-3-omni-30b-a3b-captioner", "qwen/qwen-3-omni-30b-a3b-instruct", "qwen/qwen-3-omni-30b-a3b-thinking", "qwen/qwen-3-omni-flash", "qwen/qwen-3-reranker-0-6b", "qwen/qwen-3-reranker-4b", "qwen/qwen-3-reranker-8b", "qwen/qwen-3-tts", "qwen/qwen-3-tts-12hz-0-6b-base", "qwen/qwen-3-tts-12hz-0-6b-customvoice", "qwen/qwen-3-tts-12hz-1-7b-base", "qwen/qwen-3-tts-12hz-1-7b-voicedesign", "qwen/qwen-3-tts-tokenizer-12hz", "qwen/qwen-3-vl-235b-a22b-instruct", "qwen/qwen-3-vl-235b-a22b-thinking", "qwen/qwen-3-vl-2b-instruct", "qwen/qwen-3-vl-2b-thinking", "qwen/qwen-3-vl-30b-a3b-instruct", "qwen/qwen-3-vl-30b-a3b-thinking", "qwen/qwen-3-vl-32b-instruct", "qwen/qwen-3-vl-32b-thinking", "qwen/qwen-3-vl-4b-instruct", "qwen/qwen-3-vl-4b-thinking", "qwen/qwen-3-vl-8b-instruct", "qwen/qwen-3-vl-8b-thinking", "qwen/qwen-3-vl-embedding-2b", "qwen/qwen-3-vl-embedding-8b", "qwen/qwen-3-vl-reranker-2b", "qwen/qwen-3-vl-reranker-8b", "qwen/qwen-72b", "qwen/qwen-7b", "qwen/qwen-audio", "qwen/qwen-audio-chat", "qwen/qwen-image", "qwen/qwen-image-2512", "qwen/qwen-image-edit", "qwen/qwen-image-edit-2509", "qwen/qwen-image-edit-2511", "qwen/qwen-image-layered", "qwen/qwen-vl", "qwen/qwq-32b", "qwen/qwq-32b-preview", "qwen/worldpm-72b", "qwen/worldpm-72b-helpsteer2", "qwen/worldpm-72b-rlhflow", "qwen/worldpm-72b-ultrafeedback", "relace/relace-search", "sourceful/riverflow-v2-fast-preview", "sourceful/riverflow-v2-max-preview", "sourceful/riverflow-v2-standard-preview", "suno/suno-v3-5-2024-05-25", "suno/suno-v4-2024-11-19", "suno/suno-v4-5-2025-05-01", "suno/suno-v4-5-all-2025-10-27", "suno/suno-v4-5+-2025-07-17", "suno/suno-v5-2025-09-23", "upstage/solar-pro", "upstage/solar-pro-2-2025-07-10", "upstage/solar-pro-2-2025-09-09", "upstage/solar-pro-2-2025-12-15", "upstage/solar-pro-2-preview-2025-05-20", "upstage/solar-pro-3-2026-01-26", "vercel/v0-1-0-md", "vercel/v0-1-5-lg", "vercel/v0-1-5-md", "vercel/v0-1-5-sm", "x-ai/grok-0", "x-ai/grok-1", "x-ai/grok-1-5-2024-03-28", "x-ai/grok-1-5v-2024-04-12", "x-ai/grok-2-2024-08-13", "x-ai/grok-2-image-1212", "x-ai/grok-2-mini-2024-08-13", "x-ai/grok-2-vision-1212", "x-ai/grok-3-2025-04-18", "x-ai/grok-3-beta-2025-02-19", "x-ai/grok-3-mini-2025-04-18", "x-ai/grok-3-mini-beta-2025-02-19", "x-ai/grok-4-1-non-thinking-2025-11-17", "x-ai/grok-4-1-thinking-2025-11-17", "x-ai/grok-4-2", "x-ai/grok-4-2025-07-10", "x-ai/grok-4-fast-non-reasoning-2025-09-20", "x-ai/grok-4-fast-reasoning-2025-09-20", "x-ai/grok-4-heavy-2025-07-10", "x-ai/grok-code-fast-1-2025-08-28", "x-ai/grok-imagine-image-2026-01-29", "x-ai/grok-imagine-image-pro-2026-01-29", "x-ai/grok-imagine-video-2026-01-29", "xiaomi/mimo-v2-flash-2025-12-16", "z-ai/glm-4-1v-9b-2025-07-02", "z-ai/glm-4-1v-thinking-9b-2025-07-02", "z-ai/glm-4-32b-2025-04-15", "z-ai/glm-4-5-2025-07-28", "z-ai/glm-4-5-air-2025-07-28", "z-ai/glm-4-5-air-x", "z-ai/glm-4-5-x", "z-ai/glm-4-5v-2025-08-11", "z-ai/glm-4-6-2025-09-30", "z-ai/glm-4-6v-2025-12-08", "z-ai/glm-4-6v-flash-2025-12-08", "z-ai/glm-4-7-2025-12-22", "z-ai/glm-4-7-flash-2026-01-19", "z-ai/glm-4-9b-2024-06-04", "z-ai/glm-4-9b-2025-04-14", "z-ai/glm-4-9b-chat-1m-2024-10-24", "z-ai/glm-4-9b-chat-2024-06-04", "z-ai/glm-4v-9b", "z-ai/glm-5-2026-02-11", "z-ai/glm-5-code", "z-ai/glm-image-2026-01-14"]

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
	description: NotRequired[str]
	error: NotRequired[str]
	status_code: NotRequired[int]

class OcrRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	image: str
	language: NotRequired[str]
	model: str
	provider: NotRequired[Dict[str, Any]]

class OcrResponse(TypedDict):
	pass

OrganisationId = Literal["ai21", "aion-labs", "allenai", "amazon", "anthropic", "arcee-ai", "baidu", "black-forest-labs", "bytedance", "cohere", "cursor", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inception", "inclusionai", "lg", "liquid-ai", "meta", "microsoft", "minimax", "mistral", "moonshot-ai", "naver-hyperclova", "nous", "nvidia", "openai", "perplexity", "prime-intellect", "qwen", "relace", "sourceful", "stepfun", "suno", "upstage", "vercel", "voyage", "x-ai", "xiaomi", "z-ai"]

OrganisationIdList = List[Literal["ai21", "aion-labs", "allenai", "amazon", "anthropic", "arcee-ai", "baidu", "black-forest-labs", "bytedance", "cohere", "cursor", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inception", "inclusionai", "lg", "liquid-ai", "meta", "microsoft", "minimax", "mistral", "moonshot-ai", "naver-hyperclova", "nous", "nvidia", "openai", "perplexity", "prime-intellect", "qwen", "relace", "sourceful", "stepfun", "suno", "upstage", "vercel", "voyage", "x-ai", "xiaomi", "z-ai"]]

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
	ignore: NotRequired[List[str]]
	include_alpha: NotRequired[bool]
	only: NotRequired[List[str]]
	order: NotRequired[List[str]]

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
	error: NotRequired[Dict[str, Any]]

class ReasoningConfig(TypedDict):
	effort: NotRequired[Literal["none", "minimal", "low", "medium", "high", "xhigh"]]
	enabled: NotRequired[bool]
	max_tokens: NotRequired[int]
	summary: NotRequired[Literal["auto", "concise", "detailed"]]

class ResponsesInputItem(TypedDict):
	content: NotRequired[Union[str, List[Dict[str, Any]], Dict[str, Any]]]
	role: NotRequired[Literal["user", "assistant", "system", "developer"]]
	type: NotRequired[str]

class ResponsesOutputItem(TypedDict):
	content: NotRequired[List[Dict[str, Any]]]
	role: NotRequired[str]
	type: NotRequired[str]

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
	modalities: NotRequired[List[str]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	previous_response_id: NotRequired[str]
	prompt_cache_key: NotRequired[Optional[str]]
	provider: NotRequired[Dict[str, Any]]
	provider_options: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	safety_identifier: NotRequired[Optional[str]]
	service_tier: NotRequired[Literal["auto", "default", "flex", "standard", "priority"]]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	temperature: NotRequired[float]
	text: NotRequired[Dict[str, Any]]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
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

class TextContentPart(TypedDict):
	text: str
	type: Literal["text"]

class TextModerationInput(TypedDict):
	text: str
	type: Literal["text"]

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
	duration: NotRequired[int]
	duration_seconds: NotRequired[int]
	enhance_prompt: NotRequired[bool]
	generate_audio: NotRequired[bool]
	input: NotRequired[Dict[str, Any]]
	input_image: NotRequired[Union[str, Dict[str, Any]]]
	input_last_frame: NotRequired[Union[str, Dict[str, Any]]]
	input_reference: NotRequired[str]
	input_reference_mime_type: NotRequired[str]
	input_video: NotRequired[Union[str, Dict[str, Any]]]
	last_frame: NotRequired[Union[str, Dict[str, Any]]]
	model: str
	negative_prompt: NotRequired[str]
	number_of_videos: NotRequired[int]
	output_storage_uri: NotRequired[str]
	person_generation: NotRequired[str]
	prompt: str
	provider: NotRequired[Dict[str, Any]]
	quality: NotRequired[str]
	ratio: NotRequired[str]
	reference_images: NotRequired[List[Dict[str, Any]]]
	resolution: NotRequired[str]
	sample_count: NotRequired[int]
	seconds: NotRequired[Union[int, str]]
	seed: NotRequired[int]
	size: NotRequired[str]

class VideoGenerationResponse(TypedDict):
	created: NotRequired[int]
	id: NotRequired[str]
	model: NotRequired[str]
	object: NotRequired[str]
	output: NotRequired[List[Dict[str, Any]]]
	status: NotRequired[str]

models___all__ = ["ActivityEntry", "AnthropicContentBlock", "AnthropicMessage", "AnthropicMessagesRequest", "AnthropicMessagesResponse", "AnthropicTool", "AnthropicUsage", "AudioContentPart", "AudioSpeechRequest", "AudioTranscriptionRequest", "AudioTranscriptionResponse", "AudioTranslationRequest", "AudioTranslationResponse", "BatchRequest", "BatchRequestCounts", "BatchResponse", "BenchmarkId", "CacheControl", "ChatChoice", "ChatCompletionsRequest", "ChatCompletionsResponse", "ChatMessage", "DataModel", "DataModelOrganisation", "DebugOptions", "Embedding", "EmbeddingsRequest", "EmbeddingsResponse", "ErrorResponse", "FileResponse", "FileUploadRequest", "GenerationResponse", "Image", "ImageConfig", "ImageContentPart", "ImageModerationInput", "ImagesEditRequest", "ImagesEditResponse", "ImagesGenerationRequest", "ImagesGenerationResponse", "ListFilesResponse", "MessageContentPart", "Model", "ModelId", "ModerationCategories", "ModerationCategoryScores", "ModerationResult", "ModerationsRequest", "ModerationsResponse", "MusicGenerateRequest", "MusicGenerateResponse", "NotImplementedResponse", "OcrRequest", "OcrResponse", "OrganisationId", "OrganisationIdList", "Provider", "ProviderOptions", "ProviderRoutingOptions", "ProvisioningKey", "ProvisioningKeyDetail", "ProvisioningKeyWithValue", "RealtimeNotImplementedResponse", "ReasoningConfig", "ResponsesInputItem", "ResponsesOutputItem", "ResponsesRequest", "ResponsesResponse", "ResponsesWebSocketCreateEvent", "ResponsesWebSocketServerEvent", "ResponsesWebSocketUpgradeRequiredResponse", "TextContentPart", "TextModerationInput", "ToolCall", "ToolCallContentPart", "Usage", "VideoContentPart", "VideoDeleteResponse", "VideoGenerationRequest", "VideoGenerationResponse"]
