// Purpose: Evidence-backed stream cancellation policy lookup by provider.
// Why: Aborting an upstream can stop provider billing, but Phaseo must not abort
// until it can also settle the customer's exact usage.
// How: Normalize provider variants, record published support, and choose the
// conservative gateway action independently from upstream cancellation support.

export type StreamCancellationSupport = "supported" | "unsupported" | "unknown";
export type ProviderBillingOnCancel = "stops" | "unknown";
export type CanceledUsageRecovery = "authoritative" | "unknown";
export type GatewayDisconnectAction = "cancel_upstream" | "drain_upstream";

export type ProviderStreamCancellationPolicy = {
	providerId: string;
	support: StreamCancellationSupport;
	providerBillingOnCancel: ProviderBillingOnCancel;
	usageRecovery: CanceledUsageRecovery;
	gatewayAction: GatewayDisconnectAction;
	evidenceSource: string | null;
	evidenceKind: "provider" | "aggregator" | "none";
};

const OPENROUTER_STREAMING_DOCS = "https://openrouter.ai/docs/api/reference/streaming";

// OpenRouter reports that disconnect cancellation immediately stops processing
// and billing for these upstream provider families. Treat this as aggregator
// evidence until the direct provider contract is independently verified.
const REPORTED_SUPPORTED = new Set<string>([
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

const REPORTED_UNSUPPORTED = new Set<string>([
	"amazon-bedrock",
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
	if (id === "nebius-token-factory" || id === "nebius-token-factory-fast") return "nebius";
	if (id === "sf-compute") return "sfcompute";
	if (id === "zero-one-ai") return "zerooneai";
	if (id === "inference-net") return "inferencenet";
	if (id === "openai-eu") return "openai";
	if (id === "anthropic-us") return "anthropic";
	if (id === "anthropic-aws" || id === "anthropic-aws-us") return "amazon-bedrock";
	if (id === "google-vertex-eu") return "google-vertex";
	return id;
}

export function getProviderStreamCancellationPolicy(
	providerId: string | null | undefined,
): ProviderStreamCancellationPolicy {
	const normalized = normalizeProviderId(providerId);
	const support: StreamCancellationSupport = REPORTED_SUPPORTED.has(normalized)
		? "supported"
		: REPORTED_UNSUPPORTED.has(normalized)
			? "unsupported"
			: "unknown";

	// We deliberately keep usage recovery unknown for all providers today.
	// A disconnected SSE stream commonly omits its terminal usage frame, so
	// cancellation support does not prove that Phaseo can settle exact usage.
	const usageRecovery: CanceledUsageRecovery = "unknown";
	return {
		providerId: normalized,
		support,
		providerBillingOnCancel: support === "supported" ? "stops" : "unknown",
		usageRecovery,
		gatewayAction: "drain_upstream",
		evidenceSource: support === "unknown" ? null : OPENROUTER_STREAMING_DOCS,
		evidenceKind: support === "unknown" ? "none" : "aggregator",
	};
}

export function supportsProviderStreamCancellation(providerId: string | null | undefined): boolean {
	return getProviderStreamCancellationPolicy(providerId).support === "supported";
}
