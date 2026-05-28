import {
	Bot,
	Braces,
	Package,
	TerminalSquare,
	type LucideIcon,
} from "lucide-react";

export type LanguageGroupId =
	| "raw"
	| "ai-stats-client"
	| "ai-stats-agent"
	| "openai"
	| "anthropic";

export type LanguageOption = {
	value: string;
	label: string;
	group: LanguageGroupId;
	placement?: "direct" | "grouped";
	icon?: LucideIcon;
	disabled: boolean;
};

export const LANGUAGE_GROUP_META: Record<
	LanguageGroupId,
	{ label: string; icon: LucideIcon }
> = {
	raw: { label: "Raw HTTP", icon: TerminalSquare },
	"ai-stats-client": { label: "AI Stats Client SDKs", icon: Braces },
	"ai-stats-agent": { label: "AI Stats Agent SDK", icon: Bot },
	openai: { label: "OpenAI SDK", icon: Package },
	anthropic: { label: "Anthropic SDK", icon: Package },
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ value: "curl", label: "cURL", group: "raw", placement: "direct", icon: TerminalSquare, disabled: false },
	{ value: "ai-sdk", label: "AI SDK", group: "ai-stats-client", placement: "direct", icon: Bot, disabled: false },
	{ value: "node-fetch", label: "Node.js fetch", group: "raw", disabled: false },
	{ value: "python-requests", label: "Python requests", group: "raw", disabled: false },
	{ value: "typescript-sdk", label: "TypeScript SDK", group: "ai-stats-client", disabled: false },
	{ value: "python-sdk", label: "Python SDK", group: "ai-stats-client", disabled: false },
	{ value: "go-sdk", label: "Go SDK", group: "ai-stats-client", disabled: false },
	{ value: "csharp-sdk", label: "C# SDK", group: "ai-stats-client", disabled: false },
	{ value: "php-sdk", label: "PHP SDK", group: "ai-stats-client", disabled: false },
	{ value: "ruby-sdk", label: "Ruby SDK", group: "ai-stats-client", disabled: false },
	{ value: "agent-sdk-ts", label: "TypeScript Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "agent-sdk-python", label: "Python Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "agent-sdk-go", label: "Go Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "agent-sdk-csharp", label: "C# Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "agent-sdk-php", label: "PHP Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "agent-sdk-ruby", label: "Ruby Agent SDK", group: "ai-stats-agent", disabled: false },
	{ value: "openai-python", label: "OpenAI Python Client", group: "openai", disabled: false },
	{ value: "openai-node", label: "OpenAI Node.js Client", group: "openai", disabled: false },
	{ value: "anthropic-python", label: "Anthropic Python Client", group: "anthropic", disabled: false },
	{ value: "anthropic-node", label: "Anthropic TypeScript Client", group: "anthropic", disabled: false },
];

export const LANGUAGE_GROUP_ORDER: LanguageGroupId[] = [
	"raw",
	"ai-stats-client",
	"ai-stats-agent",
	"openai",
	"anthropic",
];

export const DIRECT_LANGUAGE_ORDER = ["curl", "ai-sdk"] as const;

export const STREAMING_PATHS = new Set(["/chat/completions", "/responses", "/messages"]);
export const AI_SDK_ENDPOINTS = new Set(["chat.completions", "messages", "responses"]);
export const INSTALLABLE_LANGUAGES = new Set([
	"ai-sdk",
	"agent-sdk-ts",
	"agent-sdk-python",
	"agent-sdk-go",
	"agent-sdk-csharp",
	"agent-sdk-php",
	"agent-sdk-ruby",
	"typescript-sdk",
	"python-sdk",
	"go-sdk",
	"csharp-sdk",
	"php-sdk",
	"ruby-sdk",
	"openai-python",
	"openai-node",
	"anthropic-python",
	"anthropic-node",
]);

export const AI_STATS_METHODS: Record<string, { ts: string; py: string }> = {
	"chat.completions": { ts: "generateText", py: "generate_text" },
	responses: { ts: "generateResponse", py: "generate_response" },
	embeddings: { ts: "generateEmbedding", py: "generate_embedding" },
	moderations: { ts: "generateModeration", py: "generate_moderation" },
	"moderations.create": { ts: "generateModeration", py: "generate_moderation" },
	"images.generations": { ts: "generateImage", py: "generate_image" },
	"images.edits": { ts: "generateImageEdit", py: "generate_image_edit" },
	"audio.speech": { ts: "generateSpeech", py: "generate_speech" },
	"audio.transcriptions": { ts: "generateTranscription", py: "generate_transcription" },
	"audio.translations": { ts: "generateTranslation", py: "generate_translation" },
	"video.generations": { ts: "generateVideo", py: "generate_video" },
	"batch.create": { ts: "createBatch", py: "create_batch" },
};

export const OPENAI_METHODS: Record<string, { ts: string; py: string }> = {
	"chat.completions": { ts: "chat.completions.create", py: "chat.completions.create" },
	responses: { ts: "responses.create", py: "responses.create" },
};

export function getInstallationCode(language: string): string {
	switch (language) {
		case "ai-sdk":
			return "npm install ai @ai-stats/ai-sdk-provider";
		case "agent-sdk-ts":
			return "pnpm add @ai-stats/sdk @ai-stats/agent-sdk";
		case "agent-sdk-python":
			return "pip install ai-stats-py-sdk ai-stats-agent-sdk";
		case "agent-sdk-go":
			return "go get github.com/AI-Stats/AI-Stats/packages/sdk/agent-sdk-go@latest";
		case "agent-sdk-csharp":
			return "dotnet add package AI.Stats.Sdk\ndotnet add package AI.Stats.AgentSdk";
		case "agent-sdk-php":
			return "composer require ai-stats/php-sdk ai-stats/agent-sdk-php";
		case "agent-sdk-ruby":
			return "gem install ai_stats_sdk ai_stats_agent_sdk";
		case "typescript-sdk":
			return "npm install @ai-stats/sdk";
		case "python-sdk":
			return "pip install ai-stats-py-sdk";
		case "go-sdk":
			return "go get github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go@latest";
		case "csharp-sdk":
			return "dotnet add package AI.Stats.Sdk";
		case "php-sdk":
			return "composer require ai-stats/php-sdk";
		case "ruby-sdk":
			return "gem install ai_stats_sdk";
		case "openai-python":
			return "pip install openai";
		case "openai-node":
			return "npm install openai";
		case "anthropic-python":
			return "pip install anthropic";
		case "anthropic-node":
			return "npm install @anthropic-ai/sdk";
		default:
			return "";
	}
}
