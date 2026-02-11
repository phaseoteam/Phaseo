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
	max_tokens: NotRequired[int]
	messages: List[Dict[str, Any]]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	provider: NotRequired[Dict[str, Any]]
	stream: NotRequired[bool]
	system: NotRequired[Union[str, List[Dict[str, Any]]]]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
	top_k: NotRequired[int]
	top_p: NotRequired[float]

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

BenchmarkId = Literal["ace-bench", "ai2-sciarena", "ai2d", "aidanbench", "aider-polyglot", "aime-2024", "aime-2025", "amc", "arc-agi-1", "arc-agi-2", "arena-hard", "autologi", "balrog-ai", "bfcl-overall-fc-v4", "bigcodebench", "browsecomp", "browsecomp-long-context-128k", "browsecomp-long-context-256k", "c-eval", "chartqa", "charxiv-reasoning", "cnmo-2024", "codeforces", "collie", "confabulations", "creative-story-writing", "csimpleqa", "docvqa", "dubesor-llm", "elimination-game", "eqbench", "erqa", "evalplus", "facts", "facts-benchmark-suite", "factscore-halluciation-rate", "fiction-live-bench", "frontier-math", "galileo-agent", "global-pica", "gpqa", "gpqa-diamond", "graphwalks-bfs-lt-128k", "graphwalks-parents-lt-128k", "gsm8k", "healthbench", "healthbench-concensus", "healthbench-hard", "hmmt-2025", "humaneval", "humanitys-last-exam", "if-bench", "if-eval", "imoanswerbench", "iq-bench", "lisanbench", "livebench", "livecodebench", "livecodebench-coding", "livecodebench-pro", "livecodebench-v5", "livecodebench-v6", "lmarena-text", "lmarena-webdev", "longcodebench-1m", "longfact-concepts-hallucination-rate", "longfact-objects-hallucination-rate", "math", "math-500", "matharena", "matharena-apex", "mathvista", "mc-bench", "metr", "misguided-attention", "mle-bench", "mm-mt-bench", "mmlu", "mmlu-multilingual", "mmlu-pro", "mmlu-redux", "mmlu-redux-2.0", "mmmlu", "mmmu", "mmmu-pro", "multi-challenge", "multiPL-E", "nyt-connections", "ocrbench-v2", "ojbench", "omnidocbench-1.5", "openai-mrcr-2-needle-128k", "openai-mrcr-2-needle-256k", "openai-mrcr-8-needle-128k", "openai-mrcr-8-needle-1m", "os-world", "paperbench", "phybench", "polymath-en", "qvhighlights", "realkie", "scale-mcp-atlas", "screenspot", "screenspot-pro", "seal-multichallenege", "simplebench", "simpleqa", "smolagents-llm", "snake-bench", "solo-bench", "supergpqa", "swe-bench", "swe-bench-live", "swe-bench-multilingual", "swe-bench-pro", "swe-lancer", "symflower-coding", "tau-2-airline", "tau-2-bench", "tau-2-retail", "tau-2-telecom", "tau-bench", "tau-bench-airline", "tau-bench-retail", "terminal-bench", "terminal-bench-2.0", "thematic-generalisation", "triviaqa", "usamo-2025", "vending-bench-2", "video-mmmu", "videomme", "weirdml", "wildbench", "xlang-agent", "zebralogic"]

class ChatChoice(TypedDict):
	finish_reason: NotRequired[Literal["stop", "length", "tool_calls", "content_filter"]]
	index: NotRequired[int]
	message: NotRequired[Dict[str, Any]]

class ChatCompletionsRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	frequency_penalty: NotRequired[float]
	logit_bias: NotRequired[Dict[str, Any]]
	logprobs: NotRequired[bool]
	max_output_tokens: NotRequired[int]
	max_tool_calls: NotRequired[int]
	messages: List[Dict[str, Any]]
	meta: NotRequired[bool]
	model: str
	parallel_tool_calls: NotRequired[bool]
	presence_penalty: NotRequired[float]
	provider: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	response_format: NotRequired[Union[str, Dict[str, Any]]]
	seed: NotRequired[int]
	service_tier: NotRequired[Literal["flex", "standard", "priority"]]
	stream: NotRequired[bool]
	system: NotRequired[str]
	temperature: NotRequired[float]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
	top_k: NotRequired[int]
	top_logprobs: NotRequired[int]
	top_p: NotRequired[float]
	usage: NotRequired[bool]
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
	role: Literal["system", "user", "assistant", "tool"]
	tool_call_id: NotRequired[str]
	tool_calls: NotRequired[List[Dict[str, Any]]]

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
	endpoints: NotRequired[List[str]]
	input_types: NotRequired[List[str]]
	model_id: NotRequired[str]
	name: NotRequired[str]
	organisation_id: NotRequired[str]
	output_types: NotRequired[List[str]]
	providers: NotRequired[List[Dict[str, Any]]]
	release_date: NotRequired[str]
	status: NotRequired[str]

ModelId = Literal["ai21/jamba-large-1-5-2024-08-22", "ai21/jamba-large-1-6-2025-03-06", "ai21/jamba-large-1-7-2025-07-03", "ai21/jamba-mini-1-5-2024-08-22", "ai21/jamba-mini-1-6-2025-03-06", "ai21/jamba-mini-1-7-2025-07-03", "ai21/jamba-reasoning-3b-2025-10-08", "amazon/nova-2-lite-2025-12-02", "amazon/nova-2-omni-2025-12-02", "amazon/nova-2-pro-2025-12-02", "amazon/nova-2-sonic-2025-12-02", "amazon/nova-canvas", "amazon/nova-lite-1-0-2024-12-04", "amazon/nova-micro-1-0-2024-12-04", "amazon/nova-multimodal-embeddings-2025-12-02", "amazon/nova-premier-2025-04-30", "amazon/nova-pro-1-0-2024-12-04", "amazon/nova-reel", "amazon/nova-sonic", "anthropic/claude-1-0-2023-03-14", "anthropic/claude-1-1", "anthropic/claude-1-2", "anthropic/claude-1-3", "anthropic/claude-2-0-2023-07-12", "anthropic/claude-2-1-2023-11-22", "anthropic/claude-3-5-haiku-2024-11-04", "anthropic/claude-3-5-sonnet-2024-06-21", "anthropic/claude-3-5-sonnet-2024-10-22", "anthropic/claude-3-7-sonnet-2025-02-24", "anthropic/claude-3-haiku-2024-03-13", "anthropic/claude-3-opus-2024-03-04", "anthropic/claude-3-sonnet-2024-03-04", "anthropic/claude-haiku-4-5-2025-10-15", "anthropic/claude-instant-1-0-2023-03-14", "anthropic/claude-instant-1-1", "anthropic/claude-instant-1-2-2023-08-09", "anthropic/claude-opus-4-1-2025-08-05", "anthropic/claude-opus-4-2025-05-21", "anthropic/claude-opus-4-5-2025-11-24", "anthropic/claude-sonnet-4-2025-05-21", "anthropic/claude-sonnet-4-5-2025-09-29", "baidu/ernie-4-5-21b-a3b", "baidu/ernie-4-5-21b-a3b-thinking", "baidu/ernie-4-5-300b-a47b", "baidu/ernie-4-5-vl-28b-a3b", "baidu/ernie-4-5-vl-424b-a47b", "baidu/qianfan-vl-3b", "baidu/qianfan-vl-70b", "baidu/qianfan-vl-8b", "bytedance/seed-coder-8b-instruct", "bytedance/seed-coder-8b-reasoning", "bytedance/seed-oss-36b-instruct", "cohere/c4ai-aya-expanse-32b", "cohere/c4ai-aya-expanse-8b", "cohere/c4ai-aya-vision-32b", "cohere/c4ai-aya-vision-8b", "cohere/command", "cohere/command-a-2025-03-13", "cohere/command-a-reasoning-2025-08-21", "cohere/command-a-translate-2025-08-28", "cohere/command-a-vision-2025-07-31", "cohere/command-light", "cohere/command-r-2024-03-11", "cohere/command-r-2024-08-30", "cohere/command-r-7b-2024-12-13", "cohere/command-r+-2024-04-04", "cohere/command-r+-2024-08-30", "cohere/embed-english-light-v2-0", "cohere/embed-english-light-v3", "cohere/embed-english-v2-0", "cohere/embed-english-v3", "cohere/embed-multilingual-light-v3", "cohere/embed-multilingual-v2-0", "cohere/embed-multilingual-v3", "cohere/embed-v4", "cohere/rerank-multilingual-v3", "cohere/rerank-v3-5", "cohere/rerenk-english-v3", "deepseek/deepseek-coder-v2-2024-06-14", "deepseek/deepseek-coder-v2-2024-07-24", "deepseek/deepseek-ocr-2025-10-20", "deepseek/deepseek-r1-2025-01-20", "deepseek/deepseek-r1-2025-05-28", "deepseek/deepseek-r1-lite-preview", "deepseek/deepseek-v2-2024-05-17", "deepseek/deepseek-v2-2024-06-28", "deepseek/deepseek-v2-5", "deepseek/deepseek-v2-5-2024-05-08", "deepseek/deepseek-v3-1", "deepseek/deepseek-v3-1-terminus-2025-09-22", "deepseek/deepseek-v3-2-2025-12-01", "deepseek/deepseek-v3-2-exp-2025-09-29", "deepseek/deepseek-v3-2-speciale-2025-12-01", "deepseek/deepseek-v3-2024-12-25", "deepseek/deepseek-v3-2025-03-25", "deepseek/deepseek-vl2-2024-12-13", "deepseek/deepseek-vl2-small-2024-12-13", "deepseek/deepseek-vl2-tiny-2024-12-13", "essential-ai/rnj-1-2025-12-06", "google/chat-bison", "google/code-gecko", "google/embedding-001-2023-12-13", "google/gemini-1-0-nano-2023-12-06", "google/gemini-1-0-pro-2023-12-06", "google/gemini-1-0-pro-vision-001", "google/gemini-1-0-ultra-2023-12-06", "google/gemini-1-5-flash-001-2024-05-23", "google/gemini-1-5-flash-002-2024-09-24", "google/gemini-1-5-flash-8b-2024-03-15", "google/gemini-1-5-flash-8b-exp-2024-08-27", "google/gemini-1-5-flash-8b-exp-2024-09-24", "google/gemini-1-5-pro-001-2024-05-23", "google/gemini-1-5-pro-002-2024-09-24", "google/gemini-1-5-pro-exp-2024-08-01", "google/gemini-1-5-pro-exp-2024-08-27", "google/gemini-2-0-flash-2025-02-05", "google/gemini-2-0-flash-exp", "google/gemini-2-0-flash-exp-image-generation", "google/gemini-2-0-flash-lite-2025-02-05", "google/gemini-2-0-flash-live-001-2025-04-09", "google/gemini-2-0-flash-preview-image-generation-2025-05-07", "google/gemini-2-0-flash-thinking-exp-2024-12-19", "google/gemini-2-0-flash-thinking-exp-2025-01-21", "google/gemini-2-0-pro-exp-2025-02-05", "google/gemini-2-5-computer-use-preview-2025-10-07", "google/gemini-2-5-flash-exp-native-audio-thinking-dialog", "google/gemini-2-5-flash-image-preview", "google/gemini-2-5-flash-lite-preview-2025-06-17", "google/gemini-2-5-flash-lite-preview-2025-09-25", "google/gemini-2-5-flash-native-audio-preview", "google/gemini-2-5-flash-preview-2025-04-17", "google/gemini-2-5-flash-preview-2025-05-20", "google/gemini-2-5-flash-preview-2025-09-25", "google/gemini-2-5-flash-preview-native-audio-dialog", "google/gemini-2-5-flash-preview-tts", "google/gemini-2-5-flash-preview-tts-2025-12-10", "google/gemini-2-5-pro-experimental", "google/gemini-2-5-pro-preview-2025-05-06", "google/gemini-2-5-pro-preview-2025-06-05", "google/gemini-2-5-pro-preview-tts", "google/gemini-2-5-pro-preview-tts-2025-12-10", "google/gemini-3-0-flash", "google/gemini-3-0-flash-lite", "google/gemini-3-0-pro-preview-2025-11-18", "google/gemini-3-flash-image", "google/gemini-3-pro-image-preview-2025-11-20", "google/gemini-diffusion", "google/gemini-embedding-001-2025-05-20", "google/gemini-embedding-exp-0307-2025-03-07", "google/gemini-exp-1114-2024-11-14", "google/gemini-exp-1121-2024-11-21", "google/gemini-exp-1206", "google/gemini-live-2-5-flash-preview-2025-04-09", "google/gemini-robotics-er-1-5-preview", "google/gemma-1-2b-2024-02-21", "google/gemma-1-7b-2024-02-21", "google/gemma-2-27b-2024-06-27", "google/gemma-2-2b-2024-07-31", "google/gemma-2-9b-2024-06-27", "google/gemma-3-12b-2025-03-12", "google/gemma-3-1b-2025-03-12", "google/gemma-3-27b-2025-03-12", "google/gemma-3-4b-2025-03-12", "google/gemma-3n-e2b", "google/gemma-3n-e4b-2025-05-20", "google/image-generation-002", "google/image-generation-005", "google/image-generation-006", "google/image-text", "google/imagen-3-0-generate-001", "google/imagen-3-0-generate-002-2025-02-06", "google/imagen-4-0-fast-generate-001", "google/imagen-4-0-generate-001-2025-08-14", "google/imagen-4-0-ultra-generate-001-2025-08-14", "google/imagen-4-preview", "google/imagen-4-ultra-preview-2025-08-14", "google/learnlm-1-5-pro-experimental", "google/learnlm-2-0-flash-experimental", "google/multimodal-embedding-001", "google/text-bison", "google/text-embedding-004", "google/text-embedding-005", "google/text-embedding-gecko-001-2023-12-13", "google/text-embedding-gecko-002", "google/text-embedding-gecko-003", "google/text-embedding-gecko-multilingual-001", "google/text-multilingual-embedding-002", "google/veo-2-2025-04-09", "google/veo-3-0-fast-generate-preview-2025-07-17", "google/veo-3-0-generate-preview-2025-07-17", "google/veo-3-1-fast-preview-2025-10-15", "google/veo-3-1-preview-2025-10-15", "google/veo-3-2025-09-09", "google/veo-3-fast-2025-09-09", "google/veo-4", "ibm/granite-20b-code-instruct-8k", "ibm/granite-3-0-1b-a400m-instruct", "ibm/granite-3-0-2b-instruct", "ibm/granite-3-0-3b-a800m-instruct", "ibm/granite-3-0-8b-instruct", "ibm/granite-3-1-1b-a400m-instruct", "ibm/granite-3-1-2b-instruct", "ibm/granite-3-1-3b-a800m-instruct", "ibm/granite-3-1-8b-instruct", "ibm/granite-3-2-2b-instruct", "ibm/granite-3-2-8b-instruct", "ibm/granite-3-2-8b-instruct-preview", "ibm/granite-3-3-2b-instruct-2025-04-16", "ibm/granite-3-3-8b-instruct-2025-04-16", "ibm/granite-34b-code-instruct-8b", "ibm/granite-3b-code-instruct-128k", "ibm/granite-3b-code-instruct-2k", "ibm/granite-4-0-micro-2025-10-02", "ibm/granite-4-0-small-2025-10-02", "ibm/granite-4-0-tiny-2025-10-02", "ibm/granite-4-0-tiny-preview-2025-05-02", "ibm/granite-8b-code-instruct-128k", "ibm/granite-8b-code-instruct-4k", "ibm/granite-embedding-107m-multilingual", "ibm/granite-embedding-125m-english", "ibm/granite-embedding-278m-multilingual", "ibm/granite-embedding-30m-english", "ibm/granite-embedding-english-r2", "ibm/granite-embedding-reranker-english-r2", "ibm/granite-embedding-small-english-r2", "ibm/granite-guardian-3-0-2b", "ibm/granite-guardian-3-0-8b", "ibm/granite-guardian-3-1-2b", "ibm/granite-guardian-3-1-8b", "ibm/granite-guardian-3-2-5b", "ibm/granite-guardian-3-3-8b", "ibm/granite-speech-3-2-8b", "ibm/granite-speech-3-3-2b", "ibm/granite-speech-3-3-8b", "ibm/granite-vision-3-1-2b-preview", "ibm/granite-vision-3-2-2b", "ibm/granite-vision-3-3-2b", "ibm/granite-vision-3-3-2b-embedding", "lg/exaone-3-0-2024-08-07", "lg/exaone-3-5-2-4b-2024-12-09", "lg/exaone-3-5-32b-2024-12-09", "lg/exaone-3-5-7-8b-2024-12-09", "lg/exaone-4-0-1-2b-2025-07-15", "lg/exaone-4-0-32b-2025-07-15", "lg/exaone-deep-2-4b-2025-03-18", "lg/exaone-deep-32b-2025-03-18", "lg/exaone-deep-7-8b-2025-03-18", "meta/llama-2-13b-chat-2023-06-20", "meta/llama-2-70b-chat-2023-06-20", "meta/llama-2-7b-chat", "meta/llama-3-1-405b-instruct-2024-07-23", "meta/llama-3-1-70b-instruct-2024-07-23", "meta/llama-3-1-8b-instruct-2024-07-23", "meta/llama-3-2-11b-vision-instruct", "meta/llama-3-2-1b-instruct-2024-09-25", "meta/llama-3-2-3b-instruct-2024-09-25", "meta/llama-3-2-90b-vision-instruct", "meta/llama-3-3-70b-instruct-2024-12-06", "meta/llama-3-70b-instruct-2024-04-18", "meta/llama-3-8b-instruct-2024-04-18", "meta/llama-4-maverick-2025-04-05", "meta/llama-4-scout-2025-04-05", "microsoft/phi-1", "microsoft/phi-1-5", "microsoft/phi-2", "microsoft/phi-3-5-mini-instruct-2024-08-23", "microsoft/phi-3-5-moe-instruct-2024-08-23", "microsoft/phi-3-5-vision-instruct-2024-08-23", "microsoft/phi-3-medium-128k-instruct", "microsoft/phi-3-medium-4k-instruct", "microsoft/phi-3-mini-128k-instruct", "microsoft/phi-3-small-128k-instruct", "microsoft/phi-3-small-8k-instruct", "microsoft/phi-3-vision-128k-instruct", "microsoft/phi-4-2024-12-12", "microsoft/phi-4-mini-2025-02-01", "microsoft/phi-4-mini-flash-reasoning", "microsoft/phi-4-mini-reasoning-2025-04-30", "microsoft/phi-4-multimodal-instruct-2025-02-01", "microsoft/phi-4-reasoning-2025-04-30", "microsoft/phi-4-reasoning-plus-2025-04-30", "minimax/hailuo-02", "minimax/i2v-01-director", "minimax/i2v-01-live", "minimax/image-01", "minimax/minimax-m1-2025-06-16", "minimax/minimax-m1-40k", "minimax/minimax-m2-1", "minimax/minimax-m2-2025-10-27", "minimax/minimax-text-01", "minimax/minimax-vl-01", "minimax/music-1-5", "minimax/s2v-01", "minimax/speech-01-hd", "minimax/speech-01-turbo", "minimax/speech-02-hd", "minimax/speech-02-turbo", "minimax/speech-2-5-hd-preview", "minimax/speech-2-5-turbo-preview", "minimax/t2v-01-director", "mistral/codestral-22b-2024-05-29", "mistral/codestral-2405", "mistral/codestral-2501", "mistral/codestral-2508", "mistral/codestral-embed", "mistral/devstral-2-2025-12-09", "mistral/devstral-medium-1-1-2025-07-10", "mistral/devstral-small", "mistral/devstral-small-1-1-2025-07-10", "mistral/devstral-small-2-2025-12-09", "mistral/magistral-medium-2025-06-10", "mistral/magistral-medium-2507", "mistral/magistral-medium-2509", "mistral/magistral-small-2025-06-10", "mistral/magistral-small-2507", "mistral/magistral-small-2509", "mistral/mamba-codestral-7b", "mistral/mathstral-7b", "mistral/ministral-3-14b-2025-12-02", "mistral/ministral-3-3b-2025-12-02", "mistral/ministral-3-8b-2025-12-02", "mistral/ministral-3b-2410", "mistral/ministral-8b-2410", "mistral/ministral-8b-instruct-2024-10-16", "mistral/mistral-7b", "mistral/mistral-embed", "mistral/mistral-large-2-2024-07-24", "mistral/mistral-large-2402", "mistral/mistral-large-2407", "mistral/mistral-large-2411", "mistral/mistral-large-3-675b-2025-12-02", "mistral/mistral-medium-2312", "mistral/mistral-medium-2505", "mistral/mistral-medium-2508", "mistral/mistral-moderation-2411", "mistral/mistral-nemo-instruct-2024-07-18", "mistral/mistral-ocr-2503", "mistral/mistral-ocr-2505", "mistral/mistral-saba-2502", "mistral/mistral-small-2024-09-17", "mistral/mistral-small-2402", "mistral/mistral-small-2407", "mistral/mistral-small-2501", "mistral/mistral-small-2503", "mistral/mistral-small-2506", "mistral/mistral-small-3-1-24b-base-2025-03-17", "mistral/mistral-small-3-1-24b-instruct-2025-03-17", "mistral/mistral-small-3-2-2025-06-20", "mistral/mistral-small-3-24b-base-2025-01-30", "mistral/mistral-small-3-24b-instruct-2025-01-30", "mistral/mixtral-8x22b", "mistral/mixtral-8x7b", "mistral/open-codestral-mamba", "mistral/open-mistral-7b", "mistral/open-mistral-nemo", "mistral/open-mixtral-8x22b", "mistral/open-mixtral-8x7b", "mistral/pixtral-12b-base-2024-09-17", "mistral/pixtral-large-2024-11-18", "mistral/pixtral-large-2411", "mistral/voxtral-mini-2507", "mistral/voxtral-small-2507", "moonshotai/kimi-k1-5-2025-01-20", "moonshotai/kimi-k2-base-2025-07-11", "moonshotai/kimi-k2-instruct-0905", "moonshotai/kimi-k2-instruct-2025-07-11", "moonshotai/kimi-k2-thinking-2025-11-06", "moonshotai/kimi-vl-a3b-instruct", "moonshotai/kimi-vl-a3b-thinking", "moonshotai/kimi-vl-a3b-thinking-2506", "nous/hermes-2-pro-llama-3-70b", "nous/hermes-2-pro-llama-3-8b", "nous/hermes-2-pro-mistral-7b", "nous/hermes-2-theta-llama-3-70b", "nous/hermes-2-theta-llama-3-8b", "nous/hermes-3-llama-3-1-405b", "nous/hermes-3-llama-3-1-70b", "nous/hermes-3-llama-3-1-8b", "nous/hermes-3-llama-3-2-3b", "nous/hermes-4-14b", "nous/hermes-4-3-36b-2025-12-03", "nous/hermes-4-405b", "nous/hermes-4-70b", "nous/nomos-1-2025-12-09", "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01", "nvidia/llama-3-1-nemotron-nano-4b-v1-1", "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18", "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07", "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18", "nvidia/llama-3-3-nemotron-super-49b-v1-5", "nvidia/nemotron-nano-3-30b-a3b", "nvidia/nvidia-nemotron-nano-12b-v2", "nvidia/nvidia-nemotron-nano-9b-v2", "nvidia/openreasoning-nemotron-1-5b", "nvidia/openreasoning-nemotron-14b", "nvidia/openreasoning-nemotron-32b", "nvidia/openreasoning-nemotron-7b", "openai/ada-2020-06-11", "openai/babbage-002", "openai/babbage-2020-06-11", "openai/chatgpt-4o", "openai/code-cushman-001", "openai/code-cushman-002", "openai/code-davinci-001", "openai/code-davinci-002", "openai/code-davinci-edit-001", "openai/code-search-ada-code-001", "openai/code-search-babbage-code-001", "openai/code-search-babbage-text-001", "openai/codes-search-ada-text-001", "openai/codex-mini-2025-05-16", "openai/computer-use-preview", "openai/curie-2020-06-11", "openai/dall-e-2-2022-09-28", "openai/dall-e-3-2023-10-19", "openai/davinci-002", "openai/davinci-2020-06-11", "openai/gpt-1-2018-06-11", "openai/gpt-2-2019-11-05", "openai/gpt-3-2020-06-11", "openai/gpt-3-5-turbo-0613", "openai/gpt-3-5-turbo-16k-0613-2023-06-13", "openai/gpt-3-5-turbo-2023-03-21", "openai/gpt-3-5-turbo-2023-09-28", "openai/gpt-3-5-turbo-2023-11-06", "openai/gpt-4-1-2025-04-14", "openai/gpt-4-1-mini-2025-04-14", "openai/gpt-4-1-nano-2025-04-14", "openai/gpt-4-2023-03-14", "openai/gpt-4-2023-06-13", "openai/gpt-4-32k", "openai/gpt-4-32k-0314", "openai/gpt-4-32k-0613", "openai/gpt-4-5-2025-02-27", "openai/gpt-4-turbo-2023-03-14", "openai/gpt-4-turbo-2023-11-06", "openai/gpt-4-turbo-2024-01-25", "openai/gpt-4o-2024-05-13", "openai/gpt-4o-2024-08-06", "openai/gpt-4o-2024-11-20", "openai/gpt-4o-audio-2024-10-01", "openai/gpt-4o-audio-2024-12-17", "openai/gpt-4o-audio-2025-06-03", "openai/gpt-4o-mini-2024-07-18", "openai/gpt-4o-mini-audio-preview", "openai/gpt-4o-mini-realtime-preview", "openai/gpt-4o-mini-search-preview", "openai/gpt-4o-mini-transcribe", "openai/gpt-4o-mini-tts", "openai/gpt-4o-realtime-preview-2024-10-01", "openai/gpt-4o-realtime-preview-2024-12-17", "openai/gpt-4o-realtime-preview-2025-06-03", "openai/gpt-4o-search-preview", "openai/gpt-4o-transcribe", "openai/gpt-4o-transcribe-diarize-2025-10-15", "openai/gpt-5-1-2025-11-12", "openai/gpt-5-1-chat-2025-11-13", "openai/gpt-5-1-codex-2025-11-13", "openai/gpt-5-1-codex-max-2025-11-19", "openai/gpt-5-1-codex-mini-2025-11-13", "openai/gpt-5-1-pro", "openai/gpt-5-2-2025-12-11", "openai/gpt-5-2-chat-2025-12-11", "openai/gpt-5-2-pro-2025-12-11", "openai/gpt-5-2025-08-07", "openai/gpt-5-chat-2025-08-07", "openai/gpt-5-codex-2025-09-15", "openai/gpt-5-codex-mini-2025-11-07", "openai/gpt-5-mini-2025-08-07", "openai/gpt-5-nano-2025-08-07", "openai/gpt-5-pro-2025-08-07", "openai/gpt-5-search-api-2025-10-14", "openai/gpt-6", "openai/gpt-6-mini", "openai/gpt-6-nano", "openai/gpt-6-pro", "openai/gpt-audio", "openai/gpt-audio-mini-2025-10-06", "openai/gpt-image-1", "openai/gpt-image-1-mini-2025-10-06", "openai/gpt-oss-120b-2025-08-05", "openai/gpt-oss-20b-2025-08-05", "openai/gpt-oss-safeguard-120b-2025-10-29", "openai/gpt-oss-safeguard-20b-2025-10-29", "openai/gpt-realtime", "openai/gpt-realtime-mini-2025-10-06", "openai/o1-2024-12-17", "openai/o1-mini-2024-09-12", "openai/o1-preview-2024-09-12", "openai/o1-pro-2025-03-19", "openai/o3-2025-04-16", "openai/o3-deep-research-2025-06-26", "openai/o3-mini-2025-01-30", "openai/o3-preview", "openai/o3-pro-2025-06-10", "openai/o4-mini-2025-04-16", "openai/o4-mini-deep-research-2025-06-26", "openai/omni-moderation-2024-09-26", "openai/sora-1-2024-12-09", "openai/sora-2-2025-09-30", "openai/sora-2-pro-2025-10-03", "openai/text-ada-001", "openai/text-babbage-001", "openai/text-curie-001", "openai/text-davinci-001", "openai/text-davinci-002", "openai/text-davinci-003", "openai/text-davinci-edit-001", "openai/text-embedding-3-large", "openai/text-embedding-3-small", "openai/text-embedding-ada-002", "openai/text-moderation-007", "openai/text-search-ada-doc-001", "openai/text-search-ada-query-001", "openai/text-search-babbage-doc-001", "openai/text-search-babbage-query-001", "openai/text-search-curie-doc-001", "openai/text-search-curie-query-001", "openai/text-search-davinci-doc-001", "openai/text-search-davinci-query-001", "openai/text-similarity-ada-001", "openai/text-similarity-babbage-001", "openai/text-similarity-curie-001", "openai/text-similarity-davinci-001", "openai/tts-1", "openai/tts-1-hd", "openai/whisper-1", "qwen/qvq-72b-preview-2024-12-25", "qwen/qwen-3-omni-flash-2025-12-08", "qwen/qwen-3-tts-2025-12-05", "qwen/qwen2-5-14b-instruct-2024-09-19", "qwen/qwen2-5-32b-instruct-2024-09-19", "qwen/qwen2-5-72b-instruct-2024-09-19", "qwen/qwen2-5-7b-instruct-2024-09-19", "qwen/qwen2-5-coder-32b-instruct-2024-09-19", "qwen/qwen2-5-coder-7b-instruct-2024-09-19", "qwen/qwen2-5-omni-7b-2025-03-27", "qwen/qwen2-5-vl-32b-instruct-2025-02-28", "qwen/qwen2-5-vl-72b-instruct-2025-01-26", "qwen/qwen2-5-vl-7b-instruct-2025-01-26", "qwen/qwen2-72b-instruct-2024-07-23", "qwen/qwen2-7b-instruct-2024-07-23", "qwen/qwen2-vl-72b-instruct-2024-08-29", "qwen/qwen3-235b-a22b-2025-04-29", "qwen/qwen3-235b-a22b-thinking-2507-2025-07-25", "qwen/qwen3-30b-a3b-2025-04-29", "qwen/qwen3-32b-2025-04-29", "qwen/qwen3-a235-a22b-instruct-2507-2025-07-21", "qwen/qwen3-coder-480b-a35b-instruct-2025-07-22", "qwen/qwq-32b-2025-03-05", "qwen/qwq-32b-preview-2024-11-28", "suno/suno-v3-5", "suno/suno-v4", "suno/suno-v4-5", "suno/suno-v4-5+", "suno/suno-v5", "x-ai/grok-0", "x-ai/grok-1", "x-ai/grok-1-5-2024-03-28", "x-ai/grok-1-5v-2024-04-12", "x-ai/grok-2-2024-08-13", "x-ai/grok-2-image-1212", "x-ai/grok-2-mini-2024-08-13", "x-ai/grok-2-vision-1212", "x-ai/grok-3-2025-04-18", "x-ai/grok-3-beta-2025-02-19", "x-ai/grok-3-mini-2025-04-18", "x-ai/grok-3-mini-beta-2025-02-19", "x-ai/grok-4-1-non-thinking-2025-11-17", "x-ai/grok-4-1-thinking-2025-11-17", "x-ai/grok-4-2", "x-ai/grok-4-2025-07-10", "x-ai/grok-4-fast-non-reasoning-2025-09-20", "x-ai/grok-4-fast-reasoning-2025-09-20", "x-ai/grok-4-heavy-2025-07-10", "x-ai/grok-code-fast-1-2025-08-28", "z-ai/glm-4-1v-9b", "z-ai/glm-4-1v-thinking-9b", "z-ai/glm-4-32b-0414", "z-ai/glm-4-5", "z-ai/glm-4-5-air", "z-ai/glm-4-5v", "z-ai/glm-4-6-2025-09-30", "z-ai/glm-4-6v-2025-12-08", "z-ai/glm-4-6v-flash-2025-12-08", "z-ai/glm-4-9b", "z-ai/glm-4-9b-0414", "z-ai/glm-4-9b-chat", "z-ai/glm-4-9b-chat-1m", "z-ai/glm-4v-9b"]

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

class OcrRequest(TypedDict):
	debug: NotRequired[Dict[str, Any]]
	echo_upstream_request: NotRequired[bool]
	image: str
	language: NotRequired[str]
	model: str
	provider: NotRequired[Dict[str, Any]]

class OcrResponse(TypedDict):
	pass

OrganisationId = Literal["ai21", "amazon", "anthropic", "baidu", "black-forest-labs", "bytedance", "cohere", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inclusionai", "lg", "meta", "microsoft", "minimax", "mistral", "moonshotai", "nous", "nvidia", "openai", "perplexity", "qwen", "suno", "x-ai", "z-ai"]

OrganisationIdList = List[Literal["ai21", "amazon", "anthropic", "baidu", "black-forest-labs", "bytedance", "cohere", "deepseek", "eleven-labs", "essential-ai", "google", "ibm", "inclusionai", "lg", "meta", "microsoft", "minimax", "mistral", "moonshotai", "nous", "nvidia", "openai", "perplexity", "qwen", "suno", "x-ai", "z-ai"]]

class Provider(TypedDict):
	api_provider_id: NotRequired[str]
	api_provider_name: NotRequired[Optional[str]]
	country_code: NotRequired[Optional[str]]
	description: NotRequired[Optional[str]]
	link: NotRequired[Optional[str]]

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

class ReasoningConfig(TypedDict):
	effort: NotRequired[Literal["none", "minimal", "low", "medium", "high", "xhigh"]]
	summary: NotRequired[Literal["auto", "concise", "detailed"]]

class ResponsesRequest(TypedDict):
	background: NotRequired[bool]
	conversation: NotRequired[Union[str, Dict[str, Any]]]
	debug: NotRequired[Dict[str, Any]]
	include: NotRequired[List[str]]
	input: NotRequired[Dict[str, Any]]
	input_items: NotRequired[List[Dict[str, Any]]]
	instructions: NotRequired[str]
	max_output_tokens: NotRequired[int]
	max_tool_calls: NotRequired[int]
	meta: NotRequired[bool]
	metadata: NotRequired[Dict[str, Any]]
	model: str
	parallel_tool_calls: NotRequired[bool]
	previous_response_id: NotRequired[str]
	prompt: NotRequired[Dict[str, Any]]
	prompt_cache_key: NotRequired[str]
	prompt_cache_retention: NotRequired[str]
	provider: NotRequired[Dict[str, Any]]
	reasoning: NotRequired[Dict[str, Any]]
	safety_identifier: NotRequired[str]
	service_tier: NotRequired[str]
	store: NotRequired[bool]
	stream: NotRequired[bool]
	stream_options: NotRequired[Dict[str, Any]]
	temperature: NotRequired[float]
	text: NotRequired[Dict[str, Any]]
	tool_choice: NotRequired[Union[str, Dict[str, Any]]]
	tools: NotRequired[List[Dict[str, Any]]]
	top_logprobs: NotRequired[int]
	top_p: NotRequired[float]
	truncation: NotRequired[str]
	usage: NotRequired[bool]
	user: NotRequired[str]

class ResponsesResponse(TypedDict):
	content: NotRequired[List[Dict[str, Any]]]
	created: NotRequired[int]
	id: NotRequired[str]
	model: NotRequired[str]
	object: NotRequired[str]
	role: NotRequired[str]
	stop_reason: NotRequired[str]
	type: NotRequired[str]
	usage: NotRequired[Dict[str, Any]]

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
	input_reference: NotRequired[str]
	input_reference_mime_type: NotRequired[str]
	model: str
	negative_prompt: NotRequired[str]
	output_storage_uri: NotRequired[str]
	person_generation: NotRequired[str]
	prompt: str
	provider: NotRequired[Dict[str, Any]]
	ratio: NotRequired[str]
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

models___all__ = ["ActivityEntry", "AnthropicContentBlock", "AnthropicMessage", "AnthropicMessagesRequest", "AnthropicMessagesResponse", "AnthropicTool", "AnthropicUsage", "AudioContentPart", "AudioSpeechRequest", "AudioTranscriptionRequest", "AudioTranscriptionResponse", "AudioTranslationRequest", "AudioTranslationResponse", "BatchRequest", "BatchRequestCounts", "BatchResponse", "BenchmarkId", "ChatChoice", "ChatCompletionsRequest", "ChatCompletionsResponse", "ChatMessage", "DebugOptions", "Embedding", "EmbeddingsRequest", "EmbeddingsResponse", "ErrorResponse", "FileResponse", "FileUploadRequest", "GenerationResponse", "Image", "ImageContentPart", "ImageModerationInput", "ImagesEditRequest", "ImagesEditResponse", "ImagesGenerationRequest", "ImagesGenerationResponse", "ListFilesResponse", "MessageContentPart", "Model", "ModelId", "ModerationCategories", "ModerationCategoryScores", "ModerationResult", "ModerationsRequest", "ModerationsResponse", "MusicGenerateRequest", "MusicGenerateResponse", "OcrRequest", "OcrResponse", "OrganisationId", "OrganisationIdList", "Provider", "ProviderRoutingOptions", "ProvisioningKey", "ProvisioningKeyDetail", "ProvisioningKeyWithValue", "ReasoningConfig", "ResponsesRequest", "ResponsesResponse", "TextContentPart", "TextModerationInput", "ToolCall", "ToolCallContentPart", "Usage", "VideoContentPart", "VideoDeleteResponse", "VideoGenerationRequest", "VideoGenerationResponse"]
