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
	| "x_api_key"
	| "optional_bearer"
	| "none";

export type ProviderConfig = {
	providerId: string;
	providerName: string;
	modelsEndpoint?: string;
	modelsEndpointParams?: Record<string, string[]>;
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
	"openrouter",
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
	"amazon-bedrock": {
		providerName: "Amazon Bedrock",
		apiKeyEnv: ["AMAZON_BEDROCK_API_KEY", "AMAZON_BEDROCK_MANTLE_API_KEY"],
	},
	anthropic: { providerName: "Anthropic" },
	"anthropic-us": { providerName: "Anthropic US" },
	"arcee-ai": { providerName: "Arcee AI" },
	atlascloud: { providerName: "AtlasCloud" },
	baidu: { providerName: "Baidu Qianfan" },
	ambient: {
		providerName: "Ambient",
		modelsEndpoint: "https://api.ambient.xyz/v1/models",
		authStyle: "none",
	},
	baseten: { providerName: "Baseten", authStyle: "api_key_authorization" },
	byteplus: { providerName: "BytePlus", apiKeyEnv: ["BYTEPLUS_API_KEY", "BYTEDANCE_SEED_API_KEY", "ARK_API_KEY"] },
	cerebras: {
		providerName: "Cerebras",
		modelsEndpoint: "https://api.cerebras.ai/public/v1/models",
		authStyle: "none",
	},
	chutes: { providerName: "Chutes", authStyle: "none" },
	clarifai: { providerName: "Clarifai", authStyle: "clarifai_key" },
	cloudflare: {
		providerName: "Cloudflare Workers AI",
		modelsEndpoint:
			"https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/models/search?format=openrouter&per_page=1000",
		modelsEndpointParams: {
			accountId: ["CLOUDFLARE_WORKERS_AI_SYNC_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID"],
		},
		apiKeyEnv: ["CLOUDFLARE_WORKERS_AI_SYNC_API_TOKEN", "CLOUDFLARE_API_TOKEN"],
	},
	cohere: { providerName: "Cohere" },
	"canopy-wave": { providerName: "Canopy Wave", authStyle: "bearer" },
	deepinfra: { providerName: "DeepInfra", authStyle: "optional_bearer" },
	deepseek: { providerName: "DeepSeek" },
	darkbloom: { providerName: "Darkbloom" },
	elevenlabs: { providerName: "ElevenLabs" },
	featherless: { providerName: "Featherless" },
	fireworks: { providerName: "Fireworks" },
	friendli: { providerName: "Friendli" },
	gmicloud: { providerName: "GMICloud", apiKeyEnv: ["GMI_API_KEY", "GMI_CLOUD_API_KEY"] },
	"google-ai-studio": { disabled: true },
	"google-vertex": { providerName: "Google Vertex", disabled: true },
	"google-vertex-eu": { providerName: "Google Vertex EU", disabled: true },
	groq: { providerName: "Groq" },
	"inference-net": {
		providerName: "Inference.net",
		apiKeyEnv: ["INFERENCE_API_KEY", "INFERENCE_NET_API_KEY"],
	},
	doubleword: {
		providerName: "Doubleword",
		apiKeyEnv: ["DOUBLEWORD_API_KEY"],
	},
	ionrouter: { providerName: "IonRouter" },
	"liquid-ai": { providerName: "Liquid AI", disabled: true },
	moonshotai: { providerName: "Moonshot AI", apiKeyEnv: ["MOONSHOT_AI_API_KEY"] },
	mara: { providerName: "MARA" },
	"moonshotai-turbo": { providerName: "Moonshot AI Turbo", apiKeyEnv: ["MOONSHOT_AI_API_KEY"] },
	"nebius-token-factory": {
		providerName: "Nebius Token Factory",
		apiKeyEnv: ["NEBIUS_API_KEY", "NEBIUS_TOKEN_FACTORY_API_KEY"],
	},
	"nebius-token-factory-eu-north-1": {
		providerName: "Nebius Token Factory EU North 1",
		apiKeyEnv: ["NEBIUS_API_KEY", "NEBIUS_TOKEN_FACTORY_API_KEY"],
	},
	"nebius-token-factory-fast": {
		providerName: "Nebius Token Factory Fast",
		apiKeyEnv: ["NEBIUS_API_KEY", "NEBIUS_TOKEN_FACTORY_API_KEY"],
	},
	"nebius-token-factory-us-central-1": {
		providerName: "Nebius Token Factory US Central 1",
		apiKeyEnv: ["NEBIUS_API_KEY", "NEBIUS_TOKEN_FACTORY_API_KEY"],
	},
	novita: {
		providerName: "Novita",
		modelsEndpoint: "https://api.novita.ai/openai/v1/models",
		apiKeyEnv: ["NOVITA_API_KEY"],
		authStyle: "optional_bearer",
	},
	ovhcloud: {
		providerName: "OVHcloud AI Endpoints",
		modelsEndpoint: "https://catalog.endpoints.ai.ovh.net/rest/v2/openrouter",
		authStyle: "none",
	},
	openai: { providerName: "OpenAI", apiKeyEnv: ["OPENAI_API_KEY"] },
	"openai-eu": { providerName: "OpenAI EU", apiKeyEnv: ["OPENAI_API_KEY"] },
	"perceptron": { providerName: "Perceptron" },
	perplexity: { providerName: "Perplexity" },
	poolside: { providerName: "Poolside" },
	reka: { providerName: "Reka", authStyle: "x_api_key" },
	sambanova: { providerName: "SambaNova" },
	"sail-research": { providerName: "Sail Research", authStyle: "bearer" },
	stepfun: { providerName: "StepFun" },
	// StreamLake exposes endpoint-bound models and its public list API requires an undocumented Action parameter.
	streamlake: { providerName: "StreamLake", disabled: true },
	switchpoint: { providerName: "Switchpoint" },
	"thinking-machines": {
		providerName: "Thinking Machines",
		apiKeyEnv: ["TINKER_API_KEY"],
		baseUrlEnv: ["THINKING_MACHINES_BASE_URL", "TINKER_BASE_URL"],
	},
	together: {
		providerName: "Together",
		modelsEndpoint: "https://api.together.ai/v1/models",
	},
	upstage: { providerName: "Upstage", modelsEndpoint: "https://api.upstage.ai/v1/models" },
	wafer: { providerName: "Wafer" },
	venice: { providerName: "Venice" },
	"venice-e2ee": { providerName: "Venice E2EE" },
	voyage: { providerName: "Voyage", disabled: true },
	"weights-and-biases": {
		providerName: "Weights & Biases",
		modelsEndpoint: "https://trace.wandb.ai/inference/modelsdev/models",
		authStyle: "none",
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
		modelsEndpointParams: override.modelsEndpointParams,
		baseUrl: override.baseUrl ?? config.baseUrl,
		pathPrefix: override.pathPrefix ?? config.pathPrefix,
		modelsPath: override.modelsPath,
		baseUrlEnv: override.modelsEndpoint ? undefined : override.baseUrlEnv ?? toArray(config.baseUrlEnv),
		apiKeyEnv: override.apiKeyEnv ?? toArray(config.apiKeyEnv),
		authStyle: override.authStyle ?? "bearer",
	};
}

const NATIVE_DISCOVERY_PROVIDERS: ProviderConfig[] = [
	{
		providerId: "digitalocean",
		providerName: "DigitalOcean",
		modelsEndpoint: "https://api.digitalocean.com/v2/gen-ai/models/catalog?limit=200",
		authStyle: "none",
	},
	{
		providerId: "empiriolabs",
		providerName: "EmpirioLabs AI",
		modelsEndpoint: "https://api.empiriolabs.ai/v1/models",
		authStyle: "none",
	},
	{
		providerId: "crossmodel",
		providerName: "CrossModel",
		modelsEndpoint: "https://www.crossmodel.ai/api/models",
		apiKeyEnv: ["CROSSMODEL_API_KEY"],
		authStyle: "optional_bearer",
	},
	{
		providerId: "llmgateway",
		providerName: "LLM Gateway",
		modelsEndpoint: "https://api.llmgateway.io/v1/models",
		apiKeyEnv: ["LLMGATEWAY_API_KEY"],
		authStyle: "optional_bearer",
	},
	{
		providerId: "pioneer",
		providerName: "Pioneer",
		modelsEndpoint: "https://api.pioneer.ai/v1/models",
		authStyle: "none",
	},
	{
		providerId: "vercel",
		providerName: "Vercel AI Gateway",
		modelsEndpoint: "https://ai-gateway.vercel.sh/v1/models",
		authStyle: "none",
	},
	{
		providerId: "zenmux",
		providerName: "ZenMux",
		modelsEndpoint: "https://zenmux.ai/api/v1/models",
		apiKeyEnv: ["ZENMUX_API_KEY"],
		authStyle: "optional_bearer",
	},
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
	{
		providerId: "typesafe",
		providerName: "TypeSafe",
		modelsEndpoint: "https://api.typesafe.ai/v1/models",
		apiKeyEnv: ["TYPESAFE_API_KEY"],
		authStyle: "bearer",
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
