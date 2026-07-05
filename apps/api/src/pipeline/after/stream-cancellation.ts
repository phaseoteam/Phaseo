// Purpose: Stream cancellation policy lookup by provider.
// Why: Different upstreams handle downstream aborts differently; billing needs deterministic behavior.
// How: Normalize provider IDs and resolve whether upstream cancellation is supported.

const SUPPORTED_STREAM_CANCELLATION = new Set<string>([
	"openai",
	"azure",
	"anthropic",
	"fireworks",
	"mancer",
	"recursal",
	"anyscale",
	"lepton",
	"octoai",
	"novita",
	"deepinfra",
	"together",
	"cohere",
	"hyperbolic",
	"infermatic",
	"avian",
	"x-ai",
	"cloudflare",
	"sfcompute",
	"nineteen",
	"liquid",
	"friendli",
	"chutes",
	"deepseek",
]);

const NOT_SUPPORTED_STREAM_CANCELLATION = new Set<string>([
	"amazon-bedrock",
	"amazon-bedrock-mantle",
	"groq",
	"modal",
	"google",
	"google-ai-studio",
	"google-vertex",
	"minimax",
	"huggingface",
	"replicate",
	"perplexity",
	"mistral",
	"ai21",
	"featherless",
	"lynn",
	"lambda",
	"reflection",
	"sambanova",
	"inflection",
	"zerooneai",
	"aion-labs",
	"alibaba",
	"alibaba-cloud",
	"nebius",
	"kluster",
	"targon",
	"inferencenet",
]);

function normalizeProviderId(providerId: string | null | undefined): string {
	const id = String(providerId ?? "").trim().toLowerCase();
	if (!id) return "";
	if (id === "xai") return "x-ai";
	if (id === "novitaai") return "novita";
	if (id === "liquid-ai") return "liquid";
	if (id === "aionlabs") return "aion-labs";
	if (id === "minimax-lightning") return "minimax";
	if (id === "nebius-token-factory") return "nebius";
	if (id === "sf-compute") return "sfcompute";
	if (id === "zero-one-ai") return "zerooneai";
	if (id === "inference-net") return "inferencenet";
	return id;
}

export function supportsProviderStreamCancellation(providerId: string | null | undefined): boolean {
	const normalized = normalizeProviderId(providerId);
	if (!normalized) return false;
	if (SUPPORTED_STREAM_CANCELLATION.has(normalized)) return true;
	if (NOT_SUPPORTED_STREAM_CANCELLATION.has(normalized)) return false;
	return false;
}

