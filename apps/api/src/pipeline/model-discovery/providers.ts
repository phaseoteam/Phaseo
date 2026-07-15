import {
	OPENAI_COMPAT_CONFIG,
	type OpenAICompatConfig,
} from "@providers/openai-compatible/config";

export type ProviderAuthStyle =
	| "bearer"
	| "anthropic"
	| "google_api_key_query"
	| "google_vertex"
	| "clarifai_key"
	| "elevenlabs"
	| "api_key_authorization"
	| "none";

export type ProviderConfig = {
	providerId: string;
	providerName: string;
	modelsEndpoint?: string;
	baseUrl?: string;
	pathPrefix?: string;
	modelsPath?: string;
	baseUrlEnv?: string[];
	apiKeyEnv?: string[];
	authStyle?: ProviderAuthStyle;
};

type ProviderOverride = Partial<Omit<ProviderConfig, "providerId" | "providerName">> & {
	providerName?: string;
	disabled?: boolean;
};

const PROVIDER_ID_ALIASES_TO_SKIP = new Set<string>([
	"alibaba-cloud",
	"arcee",
	"atlas-cloud",
	"aionlabs",
	"bytedance-seed",
	"liquid",
	"moonshot-ai",
	"moonshot-ai-turbo",
	"novitaai",
	"qwen",
	"relace",
	"voyageai",
	"x-ai",
	"xai",
	"zai",
]);

const PROVIDER_OVERRIDES: Record<string, ProviderOverride> = {
	ai21: { providerName: "AI21" },
	"aion-labs": { providerName: "AionLabs" },
	alibaba: { providerName: "Alibaba Cloud" },
	"amazon-bedrock": { providerName: "Amazon Bedrock" },
	anthropic: { providerName: "Anthropic" },
	"anthropic-us": { providerName: "Anthropic US" },
	"arcee-ai": { providerName: "Arcee AI" },
	atlascloud: { providerName: "AtlasCloud" },
	baidu: { providerName: "Baidu Qianfan" },
	ambient: { providerName: "Ambient" },
	baseten: { providerName: "Baseten", authStyle: "api_key_authorization" },
	byteplus: { providerName: "BytePlus", apiKeyEnv: ["BYTEPLUS_API_KEY", "BYTEDANCE_SEED_API_KEY", "ARK_API_KEY"] },
	cerebras: { providerName: "Cerebras" },
	chutes: { providerName: "Chutes" },
	clarifai: { providerName: "Clarifai", authStyle: "clarifai_key" },
	cloudflare: { providerName: "Cloudflare" },
	cohere: { providerName: "Cohere" },
	crofai: { providerName: "CrofAI", authStyle: "none" },
	deepinfra: { providerName: "DeepInfra" },
	deepseek: { providerName: "DeepSeek" },
	darkbloom: { providerName: "Darkbloom" },
	elevenlabs: { providerName: "ElevenLabs" },
	featherless: { providerName: "Featherless" },
	fireworks: { providerName: "Fireworks" },
	friendli: { providerName: "Friendli" },
	gmicloud: { providerName: "GMICloud", apiKeyEnv: ["GMI_API_KEY"] },
	"google-ai-studio": { disabled: true },
	"google-vertex": { providerName: "Google Vertex", disabled: true },
	"google-vertex-eu": { providerName: "Google Vertex EU", disabled: true },
	groq: { providerName: "Groq" },
	"inference-net": { providerName: "Inference.net" },
	ionrouter: { providerName: "IonRouter" },
	moonshotai: { providerName: "Moonshot AI", apiKeyEnv: ["MOONSHOT_AI_API_KEY"] },
	mara: { providerName: "MARA" },
	"moonshotai-turbo": { providerName: "Moonshot AI Turbo", apiKeyEnv: ["MOONSHOT_AI_API_KEY"] },
	"nebius-token-factory": { providerName: "Nebius Token Factory", apiKeyEnv: ["NEBIUS_API_KEY"] },
	"nebius-token-factory-eu-north-1": {
		providerName: "Nebius Token Factory EU North 1",
		apiKeyEnv: ["NEBIUS_API_KEY"],
	},
	"nebius-token-factory-fast": {
		providerName: "Nebius Token Factory Fast",
		apiKeyEnv: ["NEBIUS_API_KEY"],
	},
	"nebius-token-factory-us-central-1": {
		providerName: "Nebius Token Factory US Central 1",
		apiKeyEnv: ["NEBIUS_API_KEY"],
	},
	novita: { providerName: "Novita", apiKeyEnv: ["NOVITA_API_KEY"] },
	openai: { providerName: "OpenAI", apiKeyEnv: ["OPENAI_API_KEY"] },
	"openai-eu": { providerName: "OpenAI EU", apiKeyEnv: ["OPENAI_API_KEY"] },
	"perceptron": { providerName: "Perceptron" },
	perplexity: { providerName: "Perplexity" },
	poolside: { providerName: "Poolside" },
	reka: { providerName: "Reka" },
	sambanova: { providerName: "SambaNova" },
	sourceful: { providerName: "Sourceful" },
	stepfun: { providerName: "StepFun" },
	// StreamLake exposes endpoint-bound models and its public list API requires an undocumented Action parameter.
	streamlake: { providerName: "StreamLake", disabled: true },
	switchpoint: { providerName: "Switchpoint" },
	"thinking-machines": {
		providerName: "Thinking Machines",
		apiKeyEnv: ["TINKER_API_KEY"],
		baseUrlEnv: ["THINKING_MACHINES_BASE_URL", "TINKER_BASE_URL"],
	},
	together: { providerName: "Together" },
	upstage: { providerName: "Upstage", modelsEndpoint: "https://api.upstage.ai/v1/models" },
	wafer: { providerName: "Wafer" },
	venice: { providerName: "Venice" },
	"venice-e2ee": { providerName: "Venice E2EE" },
	voyage: { providerName: "Voyage", disabled: true },
	"weights-and-biases": {
		providerName: "Weights & Biases",
		apiKeyEnv: ["WEIGHTSANDBIASES_API_KEY", "WANDB_API_KEY"],
	},
	"spacex-ai": { providerName: "SpaceXAI", apiKeyEnv: ["X_AI_API_KEY"] },
	xiaomi: { providerName: "Xiaomi", apiKeyEnv: ["XIAOMI_MIMO_API_KEY"] },
	"z-ai": { providerName: "z.AI", apiKeyEnv: ["ZAI_API_KEY"] },
};

function toTitleCaseWord(value: string): string {
	if (!value) return value;
	return value[0]!.toUpperCase() + value.slice(1);
}

function humanizeProviderName(providerId: string): string {
	return providerId
		.split("-")
		.filter(Boolean)
		.map((part) => toTitleCaseWord(part))
		.join(" ");
}

function toArray(value: string | undefined): string[] | undefined {
	return value ? [value] : undefined;
}

function buildProviderFromOpenAICompatConfig(config: OpenAICompatConfig): ProviderConfig | null {
	const override = PROVIDER_OVERRIDES[config.providerId] ?? {};
	if (override.disabled) return null;

	return {
		providerId: config.providerId,
		providerName: override.providerName ?? humanizeProviderName(config.providerId),
		modelsEndpoint: override.modelsEndpoint,
		baseUrl: override.baseUrl ?? config.baseUrl,
		pathPrefix: override.pathPrefix ?? config.pathPrefix,
		modelsPath: override.modelsPath,
		baseUrlEnv: override.baseUrlEnv ?? toArray(config.baseUrlEnv),
		apiKeyEnv: override.apiKeyEnv ?? toArray(config.apiKeyEnv),
		authStyle: override.authStyle ?? "bearer",
	};
}

const NATIVE_DISCOVERY_PROVIDERS: ProviderConfig[] = [
	{
		providerId: "anthropic",
		providerName: "Anthropic",
		modelsEndpoint: "https://api.anthropic.com/v1/models",
		apiKeyEnv: ["ANTHROPIC_API_KEY"],
		authStyle: "anthropic",
	},
	{
		providerId: "anthropic-us",
		providerName: "Anthropic US",
		modelsEndpoint: "https://api.anthropic.com/v1/models",
		apiKeyEnv: ["ANTHROPIC_API_KEY"],
		authStyle: "anthropic",
	},
	{
		providerId: "google-ai-studio",
		providerName: "Google AI Studio",
		modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
		apiKeyEnv: ["GOOGLE_AI_STUDIO_API_KEY"],
		authStyle: "google_api_key_query",
	},
	{
		providerId: "google-vertex",
		providerName: "Google Vertex",
		modelsEndpoint:
			"https://aiplatform.googleapis.com/v1beta1/publishers/google/models?listAllVersions=true&pageSize=1000",
		apiKeyEnv: ["GOOGLE_VERTEX_ACCESS_TOKEN", "GOOGLE_VERTEX_API_KEY"],
		authStyle: "google_vertex",
	},
	{
		providerId: "google-vertex-eu",
		providerName: "Google Vertex EU",
		modelsEndpoint:
			"https://aiplatform.googleapis.com/v1beta1/publishers/google/models?listAllVersions=true&pageSize=1000",
		apiKeyEnv: ["GOOGLE_VERTEX_ACCESS_TOKEN", "GOOGLE_VERTEX_API_KEY"],
		authStyle: "google_vertex",
	},
	{
		providerId: "elevenlabs",
		providerName: "ElevenLabs",
		modelsEndpoint: "https://api.elevenlabs.io/v1/models",
		apiKeyEnv: ["ELEVENLABS_API_KEY"],
		authStyle: "elevenlabs",
	},
];

const openAICompatProviders = new Map<string, ProviderConfig>();
for (const config of Object.values(OPENAI_COMPAT_CONFIG)) {
	if (PROVIDER_ID_ALIASES_TO_SKIP.has(config.providerId)) continue;
	const provider = buildProviderFromOpenAICompatConfig(config);
	if (!provider) continue;
	openAICompatProviders.set(provider.providerId, provider);
}

export const MODEL_DISCOVERY_PROVIDERS: ProviderConfig[] = [
	...NATIVE_DISCOVERY_PROVIDERS,
	...Array.from(openAICompatProviders.values()),
].sort((a, b) => a.providerId.localeCompare(b.providerId));
