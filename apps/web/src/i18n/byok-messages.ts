import { BYOK_PROVIDER_KEY_SPECS, getProviderKeyOnboarding, type ProviderKeyValidation } from "@/lib/byok/providerKeyValidation";

type Translator = {(key: never, values?: never): string};

function copy(t: Translator, key: string, values?: Record<string, string | number>) {
	return t(("byokCredentialCopy." + key) as never, values as never);
}

const providerHintKeys: Record<string, [string, Record<string, string>]> = {
	ai21: ["ai21Hint", {}],
	alibaba: ["openaiStyleHint", {provider: "Alibaba"}],
	"amazon-bedrock": ["bedrockHint", {}],
	anthropic: ["prefixHint", {provider: "Anthropic", prefix: "sk-ant-"}],
	"atlas-cloud": ["settingsHint", {provider: "Atlas Cloud"}],
	azure: ["azureHint", {}],
	baseten: ["accountHint", {provider: "Baseten"}],
	cerebras: ["inferenceHint", {provider: "Cerebras"}],
	chutes: ["dashboardHint", {provider: "Chutes"}],
	cloudflare: ["cloudflareHint", {}],
	cohere: ["accountHint", {provider: "Cohere"}],
	deepinfra: ["accountHint", {provider: "DeepInfra"}],
	deepseek: ["deepseekHint", {}],
	"google-ai-studio": ["prefixApiHint", {provider: "Google AI Studio", prefix: "AIza"}],
	"google-vertex": ["vertexHint", {}],
	groq: ["prefixHint", {provider: "Groq", prefix: "gsk_"}],
	minimax: ["accountHint", {provider: "MiniMax"}],
	"tencent-cloud": ["tencentHint", {}],
	mistral: ["openaiStyleApiHint", {provider: "Mistral"}],
	moonshotai: ["openaiStyleHint", {provider: "MoonshotAI"}],
	meta: ["metaHint", {}],
	novitaai: ["openaiStyleHint", {provider: "NovitaAI"}],
	openai: ["openaiHint", {}],
	parasail: ["dashboardHint", {provider: "Parasail"}],
	suno: ["accountHint", {provider: "Suno"}],
	together: ["accountHint", {provider: "Together"}],
	"weights-and-biases": ["accountHint", {provider: "Weights & Biases Inference"}],
	"spacex-ai": ["spacexHint", {}],
};

export function localizedProviderKeyHint(providerId: string | null | undefined, t: Translator) {
	const hint = providerId ? providerHintKeys[providerId] : undefined;
	return hint ? copy(t, hint[0], hint[1]) : copy(t, "genericHint");
}

export function localizedProviderCredentialLabel(providerId: string | null | undefined, t: Translator) {
	const key = providerId === "amazon-bedrock" ? "bedrockLabel"
		: providerId === "azure" ? "azureLabel"
		: providerId === "cloudflare" ? "cloudflareLabel"
		: providerId === "google-vertex" ? "vertexLabel"
		: providerId && BYOK_PROVIDER_KEY_SPECS[providerId]?.credentialKind === "json_credentials" ? "jsonLabel"
		: providerId && BYOK_PROVIDER_KEY_SPECS[providerId]?.credentialKind === "api_key_or_json" ? "mixedLabel" : "apiKeyLabel";
	return copy(t, key);
}

export function localizedProviderKeyInstruction(providerId: string | null | undefined, t: Translator) {
	const key = providerId === "amazon-bedrock" ? "bedrockInstruction" : providerId === "azure" ? "azureInstruction" : providerId === "cloudflare" ? "cloudflareInstruction" : null;
	return key ? copy(t, key) : null;
}

export function localizedProviderKeyOnboarding(providerId: string | null | undefined, providerName: string | null | undefined, t: Translator) {
	const canonical = getProviderKeyOnboarding(providerId, providerName);
	const provider = providerName?.trim() || (providerId ? providerId.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") : copy(t, "provider"));
	const credentials = providerId && BYOK_PROVIDER_KEY_SPECS[providerId]?.credentialKind === "json_credentials";
	return {...canonical, intro: copy(t, credentials ? "credentialsIntro" : "keyIntro", {provider}), docsLabel: copy(t, credentials ? "credentialsDocs" : "keyDocs", {provider})};
}

export function localizedProviderKeyValidation(result: ProviderKeyValidation, providerId: string | null | undefined, t: Translator) {
	if (result.message === "Key is required.") return copy(t, "required");
	if (result.message === "Key should not contain spaces or line breaks.") return copy(t, "noSpaces");
	if (result.message === "Key format looks valid.") return copy(t, "valid");
	if (result.message === "Key format looks plausible.") return copy(t, "plausible");
	const minimum = result.message.match(/^Key must be at least (\d+) characters\.$/);
	return minimum ? copy(t, "minLength", {count: Number(minimum[1])}) : localizedProviderKeyHint(providerId, t);
}

export function localizedProviderSubmissionError(message: string, t: Translator) {
	const keys: Record<string, string> = {
		"Bedrock IAM credentials require access key ID, secret access key, and region.": "bedrockRequired",
		"Cloudflare credentials require both account ID and API token.": "cloudflareRequired",
		"Each Azure deployment needs model slug, endpoint URL, API key, and model ID.": "azureRequired",
	};
	return copy(t, keys[message] ?? "required");
}
