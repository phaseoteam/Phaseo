export type ProviderKeyValidation = {
	ok: boolean;
	message: string;
	strict: boolean;
};

export type ProviderCredentialKind =
	| "api_key"
	| "json_credentials"
	| "api_key_or_json";

export type ProviderKeySpec = {
	hint: string;
	example?: string;
	docsUrl?: string;
	credentialKind?: ProviderCredentialKind;
	inputInstruction?: string;
	formKind?: "default" | "bedrock" | "azure_deployments" | "cloudflare";
	regex?: RegExp;
	validator?: (value: string) => boolean;
	minLength?: number;
};

const OPENAI_STYLE_REGEX = /^sk-[A-Za-z0-9_-]{16,}$/;

function isJsonObject(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function hasNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validateGoogleVertexCredentials(value: string): boolean {
	try {
		const parsed = JSON.parse(value);
		return (
			parsed &&
			typeof parsed === "object" &&
			parsed.type === "service_account" &&
			typeof parsed.client_email === "string" &&
			typeof parsed.private_key === "string"
		);
	} catch {
		return false;
	}
}

function validateBedrockCredentials(value: string): boolean {
	if (!isJsonObject(value)) {
		return value.trim().length >= 16 && !/\s/.test(value);
	}
	try {
		const parsed = JSON.parse(value);
		const region = parsed?.region ?? parsed?.awsRegion;
		return (
			parsed &&
			typeof parsed === "object" &&
			hasNonEmptyString(parsed.accessKeyId) &&
			hasNonEmptyString(parsed.secretAccessKey) &&
			hasNonEmptyString(region)
		);
	} catch {
		return false;
	}
}

function validateAzureCredentials(value: string): boolean {
	if (!isJsonObject(value)) return false;
	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== "object") return false;
		if (!Array.isArray(parsed.deployments) || parsed.deployments.length === 0) {
			return false;
		}

		for (const deployment of parsed.deployments) {
			if (!deployment || typeof deployment !== "object") return false;

			const modelSlug =
				deployment.modelSlug ?? deployment.aiStatsModelSlug;
			const endpointUrl =
				deployment.endpointUrl ??
				deployment.endpoint ??
				deployment.foundryEndpoint ??
				deployment.azureEndpoint;
			const apiKey = deployment.apiKey;
			const modelId =
				deployment.modelId ??
				deployment.providerModelId ??
				deployment.azureModelId;

			if (
				!hasNonEmptyString(modelSlug) ||
				!hasNonEmptyString(endpointUrl) ||
				!String(endpointUrl).startsWith("http") ||
				!hasNonEmptyString(apiKey) ||
				!hasNonEmptyString(modelId)
			) {
				return false;
			}
		}

		return true;
	} catch {
		return false;
	}
}

function validateCloudflareCredentials(value: string): boolean {
	if (!isJsonObject(value)) return false;
	try {
		const parsed = JSON.parse(value);
		return (
			parsed &&
			typeof parsed === "object" &&
			hasNonEmptyString(parsed.apiToken) &&
			hasNonEmptyString(parsed.accountId)
		);
	} catch {
		return false;
	}
}

export const BYOK_PROVIDER_KEY_SPECS: Record<string, ProviderKeySpec> = {
	ai21: {
		hint: "AI21 key from AI21 Studio/API settings.",
		example: "ai21-xxxxxxxxxxxxxxxx",
		docsUrl: "https://docs.ai21.com/docs/quick-start",
		minLength: 16,
	},
	alibaba: {
		hint: "Alibaba keys are usually OpenAI-style (sk-...).",
		example: "sk-xxxxxxxx",
		docsUrl:
			"https://www.alibabacloud.com/help/en/model-studio/get-api-key",
		regex: OPENAI_STYLE_REGEX,
	},
	"amazon-bedrock": {
		hint: "Amazon Bedrock supports API key style credentials or IAM credentials JSON.",
		example:
			'{"accessKeyId":"AKIA...","secretAccessKey":"...","region":"us-east-1"}',
		docsUrl:
			"https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
		credentialKind: "api_key_or_json",
		formKind: "bedrock",
		inputInstruction:
			'Use either a single API key string, or JSON credentials with "accessKeyId", "secretAccessKey", and "region".',
		validator: validateBedrockCredentials,
	},
	anthropic: {
		hint: "Anthropic keys usually start with sk-ant-.",
		example: "sk-ant-xxxxxxxx",
		docsUrl: "https://console.anthropic.com/settings/keys",
		regex: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
	},
	"atlas-cloud": {
		hint: "Atlas Cloud API key from provider settings.",
		example: "atlas-xxxxxxxxxxxxxxxx",
		docsUrl: "/api-providers/atlas-cloud",
		minLength: 16,
	},
	azure: {
		hint: "Azure requires deployment mappings as JSON.",
		example:
			'{"deployments":[{"modelSlug":"openai/gpt-4o-mini","endpointUrl":"https://<resource>.services.ai.azure.com","apiKey":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","modelId":"gpt-4o-mini"}]}',
		docsUrl:
			"https://learn.microsoft.com/azure/ai-services/cognitive-services-apis-create-account#find-your-keys-and-endpoint",
		credentialKind: "json_credentials",
		formKind: "azure_deployments",
		inputInstruction:
			'Provide JSON with "deployments": an array of objects containing model slug, endpoint URL, API key, and model ID.',
		validator: validateAzureCredentials,
	},
	baseten: {
		hint: "Baseten API key from account settings.",
		example: "bstn-xxxxxxxxxxxxxxxx",
		docsUrl: "https://docs.baseten.co/development/model-apis/authentication",
		minLength: 16,
	},
	cerebras: {
		hint: "Cerebras inference API key from account settings.",
		example: "csk-xxxxxxxxxxxxxxxx",
		docsUrl: "https://inference-docs.cerebras.ai/introduction",
		minLength: 16,
	},
	chutes: {
		hint: "Chutes API key from provider dashboard.",
		example: "chutes-xxxxxxxxxxxxxxxx",
		docsUrl: "/api-providers/chutes",
		minLength: 16,
	},
	cloudflare: {
		hint: "Cloudflare requires Account ID and API Token as JSON.",
		example:
			'{"apiToken":"...","accountId":"..."}',
		docsUrl:
			"https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
		credentialKind: "json_credentials",
		formKind: "cloudflare",
		inputInstruction:
			'Provide JSON with "accountId" and "apiToken".',
		validator: validateCloudflareCredentials,
	},
	cohere: {
		hint: "Cohere API key from account settings.",
		example: "co-xxxxxxxxxxxxxxxx",
		docsUrl: "https://docs.cohere.com/docs/rate-limits-api-keys",
		minLength: 16,
	},
	deepinfra: {
		hint: "DeepInfra API key from account settings.",
		example: "di-xxxxxxxxxxxxxxxx",
		docsUrl: "https://deepinfra.com/docs/advanced/api_keys",
		minLength: 16,
	},
	deepseek: {
		hint: "DeepSeek keys are OpenAI-compatible and usually start with sk-.",
		example: "sk-xxxxxxxx",
		docsUrl: "https://api-docs.deepseek.com/quick_start/authentication",
		regex: OPENAI_STYLE_REGEX,
	},
	"google-ai-studio": {
		hint: "Google AI Studio API keys usually start with AIza.",
		example: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		docsUrl: "https://aistudio.google.com/apikey",
		regex: /^AIza[0-9A-Za-z_-]{20,}$/,
	},
	"google-vertex": {
		hint: "Paste your Google service account JSON. Region defaults to 'global' if not specified.",
		example:
			'{"type": "service_account", "project_id": "your-project", "private_key_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n", "client_email": "...", "client_id": "...", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "...", "universe_domain": "googleapis.com", "region": "us-central1"}',
		docsUrl:
			"https://cloud.google.com/vertex-ai/docs/general/authentication",
		credentialKind: "json_credentials",
		validator: validateGoogleVertexCredentials,
	},
	groq: {
		hint: "Groq keys usually start with gsk_.",
		example: "gsk_xxxxxxxxxxxxxxxx",
		docsUrl: "https://console.groq.com/keys",
		regex: /^gsk_[A-Za-z0-9_-]{16,}$/,
	},
	minimax: {
		hint: "MiniMax API key from account settings.",
		example: "minimax-xxxxxxxxxxxxxxxx",
		docsUrl: "/api-providers/minimax",
		minLength: 16,
	},
	mistral: {
		hint: "Mistral API keys are usually OpenAI-style (sk-...).",
		example: "sk-xxxxxxxx",
		docsUrl: "https://console.mistral.ai/api-keys",
		regex: OPENAI_STYLE_REGEX,
	},
	moonshotai: {
		hint: "MoonshotAI keys are usually OpenAI-style (sk-...).",
		example: "sk-xxxxxxxx",
		docsUrl: "/api-providers/moonshotai",
		regex: OPENAI_STYLE_REGEX,
	},
	novitaai: {
		hint: "NovitaAI keys are usually OpenAI-style (sk-...).",
		example: "sk-xxxxxxxx",
		docsUrl: "/api-providers/novitaai",
		regex: OPENAI_STYLE_REGEX,
	},
	openai: {
		hint: "OpenAI keys usually start with sk- (for example sk-proj-...).",
		example: "sk-proj-xxxxxxxx",
		docsUrl: "https://platform.openai.com/api-keys",
		regex: /^sk-[A-Za-z0-9_-]{16,}$/,
	},
	parasail: {
		hint: "Parasail API key from provider dashboard.",
		example: "ps-xxxxxxxxxxxxxxxx",
		docsUrl: "/api-providers/parasail",
		minLength: 16,
	},
	suno: {
		hint: "Suno API key from account settings.",
		example: "suno-xxxxxxxxxxxxxxxx",
		docsUrl: "/api-providers/suno",
		minLength: 16,
	},
	together: {
		hint: "Together API key from account settings.",
		example: "together-xxxxxxxxxxxxxxxx",
		docsUrl: "https://api.together.ai/settings/api-keys",
		minLength: 16,
	},
	"weights-and-biases": {
		hint: "Weights & Biases Inference API key from account settings.",
		example: "wandb_v1_xxxxxxxxxxxxxxxx",
		docsUrl: "https://docs.wandb.ai/inference/api-reference",
		minLength: 16,
	},
	"x-ai": {
		hint: "xAI keys are commonly xai-... or sk-... style keys.",
		example: "xai-xxxxxxxx",
		docsUrl: "https://console.x.ai/",
		regex: /^(xai-|sk-)[A-Za-z0-9_-]{16,}$/,
	},
};

const GENERIC_MIN_LENGTH = 16;

function toProviderDisplayName(providerId?: string | null, providerName?: string | null): string {
	if (providerName && providerName.trim().length > 0) return providerName.trim();
	if (!providerId) return "provider";
	return providerId
		.split("-")
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function withIndefiniteArticle(phrase: string): string {
	return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

export function getProviderCredentialLabel(providerId?: string | null): string {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	if (providerId === "amazon-bedrock") return "API Key / IAM Credentials";
	if (providerId === "azure") return "Azure Deployments (JSON)";
	if (providerId === "cloudflare") return "Cloudflare Credentials (JSON)";
	if (providerId === "google-vertex") return "Service Account JSON";
	if (spec?.credentialKind === "json_credentials") return "Credentials (JSON)";
	if (spec?.credentialKind === "api_key_or_json") return "API Key / Credentials";
	return "API Key";
}

export function getProviderKeyFormatHint(providerId?: string | null): string {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	if (!spec) return "Key should be a non-empty secret without spaces.";
	return spec.hint;
}

export function getProviderKeyFormatExample(providerId?: string | null): string | null {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	return spec?.example ?? null;
}

export function getProviderKeyInputInstruction(providerId?: string | null): string | null {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	return spec?.inputInstruction ?? null;
}

export function getProviderCredentialFormKind(
	providerId?: string | null,
): "default" | "bedrock" | "azure_deployments" | "cloudflare" {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	return spec?.formKind ?? "default";
}

export function getProviderKeyOnboarding(
	providerId?: string | null,
	providerName?: string | null,
): {
	intro: string;
	docsUrl: string | null;
	docsLabel: string;
} {
	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	const displayName = toProviderDisplayName(providerId, providerName);
	const noun = spec?.credentialKind === "json_credentials" ? "credentials" : "API key";
	const docsLabel = `How to create ${withIndefiniteArticle(`${displayName} ${noun}`)}`;
	return {
		intro: `You can create ${withIndefiniteArticle(noun)} from your ${displayName} dashboard or console.`,
		docsUrl: spec?.docsUrl ?? (providerId ? `/api-providers/${encodeURIComponent(providerId)}` : null),
		docsLabel,
	};
}

export function validateProviderKeyFormat(
	providerId: string | null | undefined,
	rawValue: string,
): ProviderKeyValidation {
	const value = String(rawValue ?? "").trim();
	if (!value) {
		return {
			ok: false,
			message: "Key is required.",
			strict: false,
		};
	}

	const spec = providerId ? BYOK_PROVIDER_KEY_SPECS[providerId] : undefined;
	if (spec?.validator) {
		const ok = spec.validator(value);
		return {
			ok,
			message: ok ? "Key format looks valid." : spec.hint,
			strict: true,
		};
	}

	if (/\s/.test(value)) {
		return {
			ok: false,
			message: "Key should not contain spaces or line breaks.",
			strict: false,
		};
	}

	if (spec?.regex) {
		const ok = spec.regex.test(value);
		return {
			ok,
			message: ok ? "Key format looks valid." : spec.hint,
			strict: true,
		};
	}

	if (spec?.minLength) {
		const ok = value.length >= spec.minLength;
		return {
			ok,
			message: ok ? "Key format looks valid." : `Key must be at least ${spec.minLength} characters.`,
			strict: false,
		};
	}

	const ok = value.length >= GENERIC_MIN_LENGTH;
	return {
		ok,
		message: ok
			? "Key format looks plausible."
			: `Key must be at least ${GENERIC_MIN_LENGTH} characters.`,
		strict: false,
	};
}
