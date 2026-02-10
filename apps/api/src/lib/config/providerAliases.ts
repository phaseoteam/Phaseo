// Purpose: Normalize provider identifiers from user-facing names/aliases.
// Why: Routing hints/presets may use display names like "Google AI Studio" or "xAI".
// How: Canonicalize input and map known aliases to gateway provider IDs.

function slugifyProvider(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const PROVIDER_ALIAS_MAP: Record<string, string> = {
	ai21: "ai21",
	aionlabs: "aion-labs",
	"aion-labs": "aion-labs",
	alibaba: "alibaba",
	"amazon-bedrock": "amazon-bedrock",
	anthropic: "anthropic",
	atlascloud: "atlascloud",
	"atlas-cloud": "atlascloud",
	azure: "azure",
	baseten: "baseten",
	"black-forest-labs": "black-forest-labs",
	"bytedance-seed": "bytedance-seed",
	cerebras: "cerebras",
	chutes: "chutes",
	clarifai: "clarifai",
	cloudflare: "cloudflare",
	cohere: "cohere",
	crusoe: "crusoe",
	deepinfra: "deepinfra",
	deepseek: "deepseek",
	elevenlabs: "elevenlabs",
	"eleven-labs": "elevenlabs",
	featherless: "featherless",
	fireworks: "fireworks",
	friendli: "friendli",
	gmicloud: "gmicloud",
	"gmi-cloud": "gmicloud",
	google: "google",
	"google-ai-studio": "google-ai-studio",
	"google-vertex": "google-vertex",
	groq: "groq",
	hyperbolic: "hyperbolic",
	inception: "inception",
	infermatic: "infermatic",
	inflection: "inflection",
	liquid: "liquid-ai",
	"liquid-ai": "liquid-ai",
	mancer: "mancer",
	minimax: "minimax",
	"minimax-lightning": "minimax-lightning",
	mistral: "mistral",
	"moonshot-ai": "moonshot-ai",
	"moonshot-ai-turbo": "moonshot-ai-turbo",
	morph: "morph",
	"nebius-token-factory": "nebius-token-factory",
	novitaai: "novitaai",
	"novita-ai": "novitaai",
	openai: "openai",
	parasail: "parasail",
	perplexity: "perplexity",
	phala: "phala",
	qwen: "qwen",
	relace: "relace",
	sambanova: "sambanova",
	siliconflow: "siliconflow",
	sourceful: "sourceful",
	suno: "suno",
	together: "together",
	wandb: "weights-and-biases",
	"weights-and-biases": "weights-and-biases",
	xai: "x-ai",
	"x-ai": "x-ai",
	xiaomi: "xiaomi",
	zai: "z-ai",
	"z-ai": "z-ai",
	"z-aii": "z-ai",
	"z-ai-platform": "z-ai",
	"z-ai-api": "z-ai",
	"z-ai-v4": "z-ai",
	arcee: "arcee-ai",
	"arcee-ai": "arcee-ai",
};

export function normalizeProviderId(value: string): string {
	const direct = value.trim().toLowerCase();
	if (PROVIDER_ALIAS_MAP[direct]) return PROVIDER_ALIAS_MAP[direct];

	const slug = slugifyProvider(value);
	if (!slug) return value;
	return PROVIDER_ALIAS_MAP[slug] ?? slug;
}

export function normalizeProviderList(values?: string[] | null): string[] {
	if (!Array.isArray(values)) return [];
	return values.map((value) => normalizeProviderId(String(value)));
}
