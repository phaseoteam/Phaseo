// Purpose: Provider adapter module.
// Why: Encapsulates shared OpenAI-compatible URL/key/header helpers while keeping provider definitions provider-local.
// How: Reads the merged provider-local registry and applies a small set of shared routing/env alias utilities.

import { getBindings } from "@/runtime/env";
import type { ProviderExecuteArgs } from "../types";
import { resolveProviderKey, type ResolvedKey } from "../keys";
import type { OpenAICompatConfig } from "./types";
import { OPENAI_COMPAT_CONFIG } from "./registry";
import { CROFAI_API_KEY_ENVS, CROFAI_BASE_URL_ENVS } from "../crofai/config";
import { WEIGHTSANDBIASES_API_KEY_ENVS } from "../weights-and-biases/config";
import { ARCEE_API_KEY_ENVS } from "../arcee/config";
import { ALIBABA_CLOUD_API_KEY_ENVS } from "../alibaba/config";
import { GMI_CLOUD_API_KEY_ENVS } from "../gmicloud/config";
import {
	NEBIUS_TOKEN_FACTORY_API_KEY_ENVS,
	NEBIUS_EU_NORTH_1_BASE_URL_ENVS,
	NEBIUS_US_CENTRAL_1_BASE_URL_ENVS,
	nebiusModelSupportsResponses,
} from "../nebius-token-factory/config";
import { BYTEPLUS_API_KEY_ENVS, BYTEPLUS_BASE_URL_ENVS } from "../byteplus/config";
import { INFERENCE_NET_API_KEY_ENVS } from "../inference-net/config";
import { LIQUID_AI_API_KEY_ENVS } from "../liquid-ai/config";
import { MISTRAL_API_KEY_ENVS } from "../mistral/config";
import { MOONSHOT_API_KEY_ENVS } from "../moonshotai/config";
import { normalizeProviderId } from "@/lib/config/providerAliases";
import { deepInfraMediaUrl } from "../deepinfra/config";

function configError(code: string): Error & { code: string } {
	const error = new Error(code) as Error & { code: string };
	error.code = code;
	return error;
}

const OPENAI_CHAT_ONLY_MODELS = new Set<string>([
	"gpt-audio",
	"gpt-audio-mini",
	"openai/gpt-audio",
	"openai/gpt-audio-mini",
]);

const OPENAI_LEGACY_COMPLETIONS_MODELS = new Set<string>([
	"babbage-002",
	"davinci-002",
	"openai/babbage-002",
	"openai/davinci-002",
]);

const ALIBABA_RESPONSES_PATH_PREFIX = "/api/v2/apps/protocols/compatible-mode/v1";
const ALIBABA_COMPAT_PROVIDER_IDS = new Set<string>(["alibaba-cloud", "alibaba", "qwen"]);
const CLOUDFLARE_RESPONSES_MODELS = new Set<string>(["gpt-oss-120b", "gpt-oss-20b"]);

function normalizePathSegment(value: string | undefined) {
	if (!value) return "";
	return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function resolveFriendliPathPrefix(basePath: string, configuredPrefix: string): string {
	const normalizedBasePath = basePath.replace(/\/+$/, "");
	const serverlessPrefix = normalizePathSegment("/serverless");
	const dedicatedPrefix = normalizePathSegment("/dedicated");
	const serverlessV1Prefix = `${serverlessPrefix}/v1`;
	const dedicatedV1Prefix = `${dedicatedPrefix}/v1`;

	if (!normalizedBasePath || normalizedBasePath === "/") {
		return configuredPrefix;
	}
	if (
		normalizedBasePath === serverlessV1Prefix ||
		normalizedBasePath.endsWith(serverlessV1Prefix) ||
		normalizedBasePath === dedicatedV1Prefix ||
		normalizedBasePath.endsWith(dedicatedV1Prefix)
	) {
		return "";
	}
	if (
		normalizedBasePath === serverlessPrefix ||
		normalizedBasePath.endsWith(serverlessPrefix) ||
		normalizedBasePath === dedicatedPrefix ||
		normalizedBasePath.endsWith(dedicatedPrefix)
	) {
		return "/v1";
	}
	return configuredPrefix;
}

function readFirstBinding(names: readonly string[]): string | undefined {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	for (const name of names) {
		const value = bindings[name];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}
	return undefined;
}

function resolveNebiusBaseUrl(providerId: string): string | undefined {
	if (providerId === "nebius-token-factory-eu-north-1") {
		return readFirstBinding(NEBIUS_EU_NORTH_1_BASE_URL_ENVS);
	}
	if (providerId === "nebius-token-factory-us-central-1") {
		return readFirstBinding(NEBIUS_US_CENTRAL_1_BASE_URL_ENVS);
	}
	if (providerId === "nebius-token-factory") {
		return readFirstBinding(["NEBIUS_BASE_URL"]);
	}
	return undefined;
}

function resolveCloudflareWorkersAIBaseUrl(providerId: string): string | undefined {
	if (providerId !== "cloudflare") return undefined;
	const accountId = readFirstBinding(["CLOUDFLARE_ACCOUNT_ID"]);
	if (!accountId) return undefined;
	return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`;
}

function isNebiusTokenFactoryProvider(providerId: string): boolean {
	return (
		providerId === "nebius-token-factory" ||
		providerId === "nebius-token-factory-eu-north-1" ||
		providerId === "nebius-token-factory-us-central-1"
	);
}

export function resolveOpenAICompatConfig(providerId: string): OpenAICompatConfig {
	const canonicalProviderId = normalizeProviderId(providerId);
	const fallback: OpenAICompatConfig = { providerId: canonicalProviderId };
	const config = OPENAI_COMPAT_CONFIG[canonicalProviderId] ?? fallback;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;

	const baseUrl =
		((providerId === "byteplus" || providerId === "bytedance-seed")
			? readFirstBinding(BYTEPLUS_BASE_URL_ENVS)
			: (providerId === "crofai")
				? readFirstBinding(CROFAI_BASE_URL_ENVS)
				: undefined) ||
		resolveNebiusBaseUrl(canonicalProviderId) ||
		(config.baseUrlEnv && bindings[config.baseUrlEnv]) ||
		resolveCloudflareWorkersAIBaseUrl(canonicalProviderId) ||
		config.baseUrl;

	if (!baseUrl) {
		throw configError(`${canonicalProviderId}_base_url_missing`);
	}

	return {
		...config,
		baseUrl,
	};
}

export function isOpenAICompatProvider(providerId: string): boolean {
	return Object.prototype.hasOwnProperty.call(OPENAI_COMPAT_CONFIG, normalizeProviderId(providerId));
}

export function openAICompatUrl(providerId: string, path: string): string {
	const canonicalProviderId = normalizeProviderId(providerId);
	const config = resolveOpenAICompatConfig(canonicalProviderId);
	const requestedSuffix = normalizePathSegment(path);
	if (canonicalProviderId === "deepinfra") {
		const mediaUrl = deepInfraMediaUrl(config.baseUrl ?? "", requestedSuffix);
		if (mediaUrl) return mediaUrl;
	}
	// Perplexity's hosted Sonar surface is Chat-shaped, but its canonical
	// endpoint is /v1/sonar rather than OpenAI's /v1/chat/completions.
	const suffix = canonicalProviderId === "perplexity" && requestedSuffix === "/chat/completions"
		? "/sonar"
		: requestedSuffix;
	const isAlibabaCompatProvider = ALIBABA_COMPAT_PROVIDER_IDS.has(canonicalProviderId);
	const isAlibabaResponsesRoute = isAlibabaCompatProvider && suffix === "/responses";
	const isAlibabaChatRoute = isAlibabaCompatProvider && suffix === "/chat/completions";
	let base = config.baseUrl?.replace(/\/+$/, "") ?? "";
	const configuredPrefix = normalizePathSegment(
		isAlibabaResponsesRoute
				? ALIBABA_RESPONSES_PATH_PREFIX
				: (config.pathPrefix ?? "/v1"),
	);
	let prefix = configuredPrefix;

	if (configuredPrefix) {
		try {
			const parsed = new URL(base);
			const basePath = parsed.pathname.replace(/\/+$/, "");
			if (canonicalProviderId === "friendli") {
				prefix = resolveFriendliPathPrefix(basePath, configuredPrefix);
			}
			if (isAlibabaResponsesRoute) {
				const chatPrefix = normalizePathSegment(config.pathPrefix ?? "");
				if (chatPrefix && basePath === chatPrefix) {
					const trimmedBasePath = basePath.slice(0, basePath.length - chatPrefix.length).replace(/\/+$/, "");
					base = `${parsed.origin}${trimmedBasePath}`;
				}
			} else if (isAlibabaChatRoute) {
				const responsesPrefix = normalizePathSegment(ALIBABA_RESPONSES_PATH_PREFIX);
				if (responsesPrefix && basePath === responsesPrefix) {
					const trimmedBasePath = basePath.slice(0, basePath.length - responsesPrefix.length).replace(/\/+$/, "");
					base = `${parsed.origin}${trimmedBasePath}`;
				}
			}

			const resolvedBasePath = new URL(base).pathname.replace(/\/+$/, "");
			if (
				prefix &&
				(resolvedBasePath === prefix || (!isAlibabaCompatProvider && resolvedBasePath.endsWith(prefix)))
			) {
				prefix = "";
			}
		} catch {
			// ignore parse failures
		}
	}

	return `${base}${prefix}${suffix}`;
}

export function openAICompatHeaders(
	providerId: string,
	key: string,
	extraHeaders?: Record<string, string | undefined>,
): Record<string, string> {
	const canonicalProviderId = normalizeProviderId(providerId);
	const config = resolveOpenAICompatConfig(canonicalProviderId);
	const headerName = config.apiKeyHeader ?? "Authorization";
	const prefix = config.apiKeyPrefix ?? "Bearer ";
	const headerValue = prefix ? `${prefix}${key}` : key;
	return {
		...(key ? { [headerName]: headerValue } : {}),
		// Reka Chat documents X-Api-Key while Reka Research documents Bearer auth.
		// Both products share this provider and API host, so send both accepted forms.
		...(canonicalProviderId === "reka" && key ? { Authorization: `Bearer ${key}` } : {}),
		...(canonicalProviderId === "cloudflare"
			? { "cf-aig-gateway-id": readFirstBinding(["CLOUDFLARE_AI_GATEWAY_ID"])?.trim() || "default" }
			: {}),
		"Content-Type": "application/json",
		...(extraHeaders
			? Object.fromEntries(
				Object.entries(extraHeaders).filter(([, value]) => typeof value === "string" && value.length > 0),
			)
			: {}),
	};
}

export function resolveOpenAICompatKey(args: Pick<ProviderExecuteArgs, "providerId" | "byokMeta"> & { forceGatewayKey?: boolean }): ResolvedKey {
	const providerId = normalizeProviderId(args.providerId);
	const normalizedArgs = providerId === args.providerId ? args : { ...args, providerId };
	if (providerId === "weights-and-biases") {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(WEIGHTSANDBIASES_API_KEY_ENVS));
	}
	if (providerId === "arcee" || providerId === "arcee-ai") {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(ARCEE_API_KEY_ENVS));
	}
	if (providerId === "alibaba-cloud" || providerId === "alibaba" || providerId === "qwen") {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(ALIBABA_CLOUD_API_KEY_ENVS));
	}
	if (providerId === "gmicloud") {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(GMI_CLOUD_API_KEY_ENVS));
	}
	if (isNebiusTokenFactoryProvider(providerId)) {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(NEBIUS_TOKEN_FACTORY_API_KEY_ENVS));
	}
	if (args.providerId === "byteplus" || args.providerId === "bytedance-seed") {
		return resolveProviderKey(args, () => readFirstBinding(BYTEPLUS_API_KEY_ENVS));
	}
	if (args.providerId === "crofai") {
		return resolveProviderKey(args, () => readFirstBinding(CROFAI_API_KEY_ENVS));
	}
	if (args.providerId === "inference-net") {
		return resolveProviderKey(args, () => readFirstBinding(INFERENCE_NET_API_KEY_ENVS));
	}
	if (args.providerId === "liquid" || args.providerId === "liquid-ai") {
		return resolveProviderKey(args, () => readFirstBinding(LIQUID_AI_API_KEY_ENVS));
	}
	if (args.providerId === "mistral" || args.providerId === "mistral-eu") {
		return resolveProviderKey(args, () => readFirstBinding(MISTRAL_API_KEY_ENVS));
	}
	if (["moonshot-ai", "moonshotai", "moonshot-ai-turbo", "moonshotai-turbo"].includes(args.providerId)) {
		return resolveProviderKey(args, () => readFirstBinding(MOONSHOT_API_KEY_ENVS));
	}
	if (args.providerId === "nvidia") {
		const config = resolveOpenAICompatConfig(args.providerId);
		const hosted = (() => {
			try {
				return new URL(config.baseUrl ?? "").hostname.toLowerCase() === "integrate.api.nvidia.com";
			} catch {
				return true;
			}
		})();
		return resolveProviderKey(args, () => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.NVIDIA_API_KEY;
		}, { allowEmptyFallback: !hosted });
	}
	if (providerId === "meta") {
		return resolveProviderKey(normalizedArgs, () => readFirstBinding(["MODEL_API_KEY", "META_MODEL_API_KEY"]));
	}

	const config = resolveOpenAICompatConfig(providerId);
	const envKey = config.apiKeyEnv;
	return resolveProviderKey(normalizedArgs, () => {
		if (!envKey) return undefined;
		const bindings = getBindings() as unknown as Record<string, string | undefined>;
		return bindings[envKey];
	});
}

export type OpenAICompatRoute = "responses" | "chat";

export function resolveOpenAICompatModel(providerId: string, model?: string | null): string {
	const value = model?.trim() ?? "";
	if (normalizeProviderId(providerId) !== "poolside" || !value) return value;

	const upstreamModel = value.replace(/:free$/i, "");
	return upstreamModel.startsWith("poolside/") ? upstreamModel : `poolside/${upstreamModel}`;
}

function normalizeOpenAIModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

export function resolveOpenAICompatRoute(providerId: string, model?: string | null): OpenAICompatRoute {
	const canonicalProviderId = normalizeProviderId(providerId);
	const config = resolveOpenAICompatConfig(canonicalProviderId);
	const normalized = normalizeOpenAIModelName(model);
	// StepFun currently exposes Responses only for step-3.7-flash; its other
	// text and multimodal models remain on Chat Completions.
	if (canonicalProviderId === "stepfun") {
		return normalized === "step-3.7-flash" ? "responses" : "chat";
	}
	if (isNebiusTokenFactoryProvider(canonicalProviderId)) {
		return nebiusModelSupportsResponses(model) ? "responses" : "chat";
	}
	if (canonicalProviderId === "deepseek") {
		return (
			normalized === "deepseek-v4-flash" ||
			normalized === "deepseek-v4.1-flash-expires-on-0910" ||
			normalized === "deepseek-v4-pro" ||
			normalized === "deepseek-v4-flash-vision-exp"
		)
			? "responses"
			: "chat";
	}

	if (canonicalProviderId === "cloudflare") {
		return CLOUDFLARE_RESPONSES_MODELS.has(normalized) ? "responses" : "chat";
	}

	if (canonicalProviderId === "openai") {
		if (OPENAI_LEGACY_COMPLETIONS_MODELS.has(model ?? "") || OPENAI_LEGACY_COMPLETIONS_MODELS.has(normalized)) {
			return "chat";
		}
		if (OPENAI_CHAT_ONLY_MODELS.has(model ?? "") || OPENAI_CHAT_ONLY_MODELS.has(normalized)) {
			return "chat";
		}
		return "responses";
	}

	if (typeof config.supportsResponses === "boolean") {
		return config.supportsResponses ? "responses" : "chat";
	}
	return "chat";
}

export function supportsOpenAICompatResponses(providerId: string, model?: string | null): boolean {
	const canonicalProviderId = normalizeProviderId(providerId);
	if (canonicalProviderId === "deepseek") return resolveOpenAICompatRoute(canonicalProviderId, model) === "responses";
	const config = resolveOpenAICompatConfig(canonicalProviderId);
	if (typeof config.supportsResponses === "boolean") return config.supportsResponses;
	return resolveOpenAICompatRoute(canonicalProviderId, model) === "responses";
}

export { OPENAI_COMPAT_CONFIG };
export type { OpenAICompatConfig } from "./types";
