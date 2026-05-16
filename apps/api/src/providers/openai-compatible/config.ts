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
} from "../nebius-token-factory/config";
import { BYTEPLUS_API_KEY_ENVS, BYTEPLUS_BASE_URL_ENVS } from "../byteplus/config";

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
	if (providerId === "nebius-token-factory-fast") {
		return readFirstBinding(["NEBIUS_BASE_URL"]);
	}
	return undefined;
}

function isNebiusTokenFactoryProvider(providerId: string): boolean {
	return (
		providerId === "nebius-token-factory" ||
		providerId === "nebius-token-factory-fast" ||
		providerId === "nebius-token-factory-eu-north-1" ||
		providerId === "nebius-token-factory-us-central-1"
	);
}

export function resolveOpenAICompatConfig(providerId: string): OpenAICompatConfig {
	const fallback: OpenAICompatConfig = { providerId };
	const config = OPENAI_COMPAT_CONFIG[providerId] ?? fallback;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;

	const baseUrl =
		((providerId === "byteplus" || providerId === "bytedance-seed")
			? readFirstBinding(BYTEPLUS_BASE_URL_ENVS)
			: (providerId === "crofai")
				? readFirstBinding(CROFAI_BASE_URL_ENVS)
				: undefined) ||
		resolveNebiusBaseUrl(providerId) ||
		(config.baseUrlEnv && bindings[config.baseUrlEnv]) ||
		config.baseUrl;

	if (!baseUrl) {
		throw configError(`${providerId}_base_url_missing`);
	}

	return {
		...config,
		baseUrl,
	};
}

export function isOpenAICompatProvider(providerId: string): boolean {
	return Object.prototype.hasOwnProperty.call(OPENAI_COMPAT_CONFIG, providerId);
}

export function openAICompatUrl(providerId: string, path: string): string {
	const config = resolveOpenAICompatConfig(providerId);
	const suffix = normalizePathSegment(path);
	const isAlibabaCompatProvider = ALIBABA_COMPAT_PROVIDER_IDS.has(providerId);
	const isAlibabaResponsesRoute = isAlibabaCompatProvider && suffix === "/responses";
	const isAlibabaChatRoute = isAlibabaCompatProvider && suffix === "/chat/completions";
	let base = config.baseUrl?.replace(/\/+$/, "") ?? "";
	const configuredPrefix = normalizePathSegment(
		isAlibabaResponsesRoute ? ALIBABA_RESPONSES_PATH_PREFIX : (config.pathPrefix ?? "/v1"),
	);
	let prefix = configuredPrefix;

	if (configuredPrefix) {
		try {
			const parsed = new URL(base);
			const basePath = parsed.pathname.replace(/\/+$/, "");
			if (providerId === "friendli") {
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
	const config = resolveOpenAICompatConfig(providerId);
	const headerName = config.apiKeyHeader ?? "Authorization";
	const prefix = config.apiKeyPrefix ?? "Bearer ";
	const headerValue = prefix ? `${prefix}${key}` : key;
	return {
		[headerName]: headerValue,
		"Content-Type": "application/json",
		...(extraHeaders
			? Object.fromEntries(
				Object.entries(extraHeaders).filter(([, value]) => typeof value === "string" && value.length > 0),
			)
			: {}),
	};
}

export function resolveOpenAICompatKey(args: ProviderExecuteArgs): ResolvedKey {
	if (args.providerId === "weights-and-biases") {
		return resolveProviderKey(args, () => readFirstBinding(WEIGHTSANDBIASES_API_KEY_ENVS));
	}
	if (args.providerId === "arcee" || args.providerId === "arcee-ai") {
		return resolveProviderKey(args, () => readFirstBinding(ARCEE_API_KEY_ENVS));
	}
	if (args.providerId === "alibaba-cloud") {
		return resolveProviderKey(args, () => readFirstBinding(ALIBABA_CLOUD_API_KEY_ENVS));
	}
	if (args.providerId === "gmicloud") {
		return resolveProviderKey(args, () => readFirstBinding(GMI_CLOUD_API_KEY_ENVS));
	}
	if (isNebiusTokenFactoryProvider(args.providerId)) {
		return resolveProviderKey(args, () => readFirstBinding(NEBIUS_TOKEN_FACTORY_API_KEY_ENVS));
	}
	if (args.providerId === "byteplus" || args.providerId === "bytedance-seed") {
		return resolveProviderKey(args, () => readFirstBinding(BYTEPLUS_API_KEY_ENVS));
	}
	if (args.providerId === "crofai") {
		return resolveProviderKey(args, () => readFirstBinding(CROFAI_API_KEY_ENVS));
	}

	const config = resolveOpenAICompatConfig(args.providerId);
	const envKey = config.apiKeyEnv;
	return resolveProviderKey(args, () => {
		if (!envKey) return undefined;
		const bindings = getBindings() as unknown as Record<string, string | undefined>;
		return bindings[envKey];
	});
}

export type OpenAICompatRoute = "responses" | "chat";

function normalizeOpenAIModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

export function resolveOpenAICompatRoute(providerId: string, model?: string | null): OpenAICompatRoute {
	const config = resolveOpenAICompatConfig(providerId);
	const normalized = normalizeOpenAIModelName(model);

	if (providerId === "openai") {
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
	const config = resolveOpenAICompatConfig(providerId);
	if (typeof config.supportsResponses === "boolean") return config.supportsResponses;
	return resolveOpenAICompatRoute(providerId, model) === "responses";
}

export { OPENAI_COMPAT_CONFIG };
export type { OpenAICompatConfig } from "./types";
