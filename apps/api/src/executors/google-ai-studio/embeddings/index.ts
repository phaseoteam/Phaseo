// Purpose: Executor for google-ai-studio / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to Google AI Studio embeddings and normalizes usage.

import type {
	IREmbeddingsRequest,
	IREmbeddingsResponse,
} from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ExecutorUpstreamTiming } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";
import { resolveGoogleModelCandidates } from "../../google/shared/model";

import { type GeminiEmbeddingContent, embeddingRequestError, normalizeEmbeddingsInputItems, normalizeEmbeddingInput, extractEmbeddingUsage, mapGoogleToIr } from "../../google/shared/embeddings";

const BASE_URL = "https://generativelanguage.googleapis.com";

function resolvedBaseUrl(): string {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseRoot = String(
		bindings.GOOGLE_AI_STUDIO_BASE_URL ||
		bindings.GOOGLE_BASE_URL ||
		BASE_URL,
	).replace(/\/+$/, "");
	return /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;
}

function baseHeaders(meta?: ExecutorExecuteArgs["meta"]) {
	return {
		"Content-Type": "application/json",
		...upstreamTestHeaders(meta),
	};
}

async function fetchTokenCount(
	key: string,
	modelForUrl: string,
	contents: GeminiEmbeddingContent[],
	meta?: ExecutorExecuteArgs["meta"],
	upstreamTiming?: ExecutorUpstreamTiming,
) {
	const url = `${resolvedBaseUrl()}/models/${modelForUrl}:countTokens?key=${key}`;
	const init: RequestInit = {
		method: "POST",
		headers: baseHeaders(meta),
		body: JSON.stringify({ contents }),
	};
	const res = await (upstreamTiming
		? upstreamTiming.fetch(url, init, "preflight")
		: fetch(url, init));
	const json = await res.clone().json().catch(() => null);
	const total =
		json?.totalTokens ??
		json?.totalTokenCount ??
		json?.tokenCount ??
		json?.tokens ??
		json?.usageMetadata?.totalTokenCount ??
		0;
	if (!total || typeof total !== "number") return undefined;
	return total;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	if (ir.encodingFormat && !["float", "base64"].includes(ir.encodingFormat)) {
		return embeddingRequestError("Google embeddings support float or base64 encoding.", "encoding_format");
	}
	const keyInfo = resolveProviderKey(args as any, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
	const key = keyInfo.key;

	const requestedModel = args.providerModelSlug || ir.model;
	const modelForUrl = resolveGoogleModelCandidates(requestedModel)[0] || requestedModel;
	const inputItems = normalizeEmbeddingsInputItems(ir.input);
	const contents = await Promise.all(inputItems.map((item) => normalizeEmbeddingInput(item)));
	const isBatch = inputItems.length > 1;
	const googleOptions = ir.providerOptions?.google;
	const outputDimensionality = ir.dimensions;
	const supportsTaskMetadata = modelForUrl === "gemini-embedding-001";
	if (!supportsTaskMetadata && (googleOptions?.taskType || googleOptions?.title)) {
		throw new Error(`${modelForUrl} does not support Google embedding taskType or title parameters.`);
	}
	const taskType = supportsTaskMetadata ? googleOptions?.taskType : undefined;
	const title = supportsTaskMetadata ? googleOptions?.title : undefined;
	const requestModel = `models/${modelForUrl}`;
	const payload = isBatch
		? {
			requests: contents.map((content) => ({
				model: requestModel,
				content,
				...(taskType ? { taskType } : {}),
				...(title ? { title } : {}),
				...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
			})),
		}
		: {
			content: contents[0] ?? {
				parts: [{ text: "" }],
			},
			...(taskType ? { taskType } : {}),
			...(title ? { title } : {}),
			...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
		};
	const endpoint = isBatch ? ":batchEmbedContents" : ":embedContent";

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(payload) : undefined;

	const res = await fetchUpstream(args, `${resolvedBaseUrl()}/models/${modelForUrl}${endpoint}?key=${key}`, {
		method: "POST",
		headers: baseHeaders(args.meta),
		body: JSON.stringify(payload),
	});
	const json = await res.clone().json().catch(() => null);
	if (!res.ok) {
		return {
			kind: "completed", upstream: res,
			bill: { cost_cents: 0, currency: "USD", upstream_id: res.headers.get("x-request-id") },
			keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest, rawResponse: json,
		};
	}

	let usage = json ? extractEmbeddingUsage(json) : undefined;
	if (!usage) {
		const totalTokens = await fetchTokenCount(key, modelForUrl, contents, args.meta, args.upstreamTiming);
		if (typeof totalTokens === "number" && totalTokens > 0) {
			usage = {
				embedding_tokens: totalTokens,
				total_tokens: totalTokens,
				input_text_tokens: totalTokens,
			};
		}
	}

	const responseIr = json ? mapGoogleToIr(json, ir.model, usage, ir.encodingFormat) : {
		object: "list",
		model: ir.model,
		data: [],
	} as IREmbeddingsResponse;

	ir.rawRequest = payload;

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};

	bill.usage = {
		requests: 1,
		...(usage ?? {}),
	};

	return {
		kind: "completed",
		upstream: res,
		ir: responseIr,
		bill,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json ?? null,
	};
}

export const executor: ProviderExecutor = async (args: ExecutorExecuteArgs) => execute(args);
