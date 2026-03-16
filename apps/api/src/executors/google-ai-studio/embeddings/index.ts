// Purpose: Executor for google-ai-studio / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to Google AI Studio embeddings and normalizes usage.

import type {
	IREmbeddingsContentPart,
	IREmbeddingsInput,
	IREmbeddingsInputItem,
	IREmbeddingsRequest,
	IREmbeddingsResponse,
} from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { normalizeGoogleUsage } from "@providers/google-ai-studio/usage";
import { resolveProviderKey } from "@providers/keys";
import type { ProviderExecutor } from "../../types";
import { irPartToGeminiPart } from "../../google/shared/media";
import { resolveGoogleModelCandidates } from "../../google/shared/model";

const BASE_URL = "https://generativelanguage.googleapis.com";

type GeminiEmbeddingContent = {
	role: "user";
	parts: Array<Record<string, any>>;
};

function baseHeaders() {
	return {
		"Content-Type": "application/json",
	};
}

function isTokenArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isEmbeddingsContentParts(value: unknown): value is IREmbeddingsContentPart[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((entry) => entry && typeof entry === "object" && typeof (entry as any).type === "string")
	);
}

function normalizeEmbeddingsInputItems(input: IREmbeddingsInput): IREmbeddingsInputItem[] {
	if (isTokenArray(input)) return [input];
	if (!Array.isArray(input)) return [input];
	if (input.length === 0) return [""];
	if (isEmbeddingsContentParts(input)) return [input];
	return input as IREmbeddingsInputItem[];
}

function tokenArrayToText(tokens: number[]): string {
	return tokens.map((token) => Math.trunc(token)).join(" ");
}

async function normalizeEmbeddingInput(item: IREmbeddingsInputItem): Promise<GeminiEmbeddingContent> {
	if (typeof item === "string") {
		return {
			role: "user",
			parts: [{ text: item }],
		};
	}

	if (isTokenArray(item)) {
		return {
			role: "user",
			parts: [{ text: tokenArrayToText(item) }],
		};
	}

	const parts = await Promise.all(
		(item as IREmbeddingsContentPart[]).map((part) => irPartToGeminiPart(part)),
	);
	return {
		role: "user",
		parts: parts.length > 0 ? parts : [{ text: "" }],
	};
}

function extractEmbeddingUsage(json: any): Record<string, number> | undefined {
	const merged: Record<string, number> = {};
	const mergeUsage = (usage?: Record<string, number>) => {
		if (!usage) return;
		for (const [key, value] of Object.entries(usage)) {
			if (typeof value !== "number") continue;
			merged[key] = (merged[key] ?? 0) + value;
		}
	};

	const usageEntries: any[] = [];
	if (json?.usageMetadata) usageEntries.push(json.usageMetadata);
	if (Array.isArray(json?.embeddings)) {
		for (const entry of json.embeddings) {
			if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
			if (entry?.usage) usageEntries.push(entry.usage);
		}
	}
	if (Array.isArray(json?.requests)) {
		for (const entry of json.requests) {
			if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
			if (entry?.usage) usageEntries.push(entry.usage);
		}
	}
	for (const entry of usageEntries) {
		mergeUsage(normalizeGoogleUsage(entry?.usageMetadata ?? entry));
	}
	const readCount = (entry: any) =>
		entry?.totalTokenCount ??
		entry?.totalTokens ??
		entry?.promptTokenCount ??
		entry?.promptTokens ??
		entry?.inputTokenCount ??
		entry?.inputTokens ??
		entry?.tokenCount ??
		entry?.tokens ??
		entry?.usage?.totalTokenCount ??
		entry?.usage?.totalTokens ??
		entry?.usage?.promptTokenCount ??
		entry?.usage?.inputTokenCount ??
		0;
	let total = 0;
	for (const entry of usageEntries) {
		total += readCount(entry);
	}
	if (!total && Object.keys(merged).length) {
		return merged;
	}
	if (!total) return undefined;
	const usage = {
		embedding_tokens: total,
		total_tokens: total,
		input_text_tokens: total,
	};
	return Object.keys(merged).length
		? { ...merged, ...usage }
		: usage;
}

async function fetchTokenCount(key: string, modelForUrl: string, contents: GeminiEmbeddingContent[]) {
	const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}:countTokens?key=${key}`, {
		method: "POST",
		headers: baseHeaders(),
		body: JSON.stringify({ contents }),
	});
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

function pickUsageNumber(usage: Record<string, number> | undefined, key: string): number | undefined {
	const value = usage?.[key];
	return typeof value === "number" ? value : undefined;
}

function mapGoogleToIr(json: any, model: string, usageOverride?: Record<string, number>): IREmbeddingsResponse {
	const entries = Array.isArray(json?.embeddings)
		? json.embeddings
		: json?.embedding
			? [json.embedding]
			: [];

	const data = entries.map((item: any, index: number) => ({
		index,
		embedding: item?.values ?? item?.embedding?.values ?? [],
	}));

	const usage = usageOverride ?? extractEmbeddingUsage(json);
	const derivedInputTokens = [
		pickUsageNumber(usage, "input_text_tokens"),
		pickUsageNumber(usage, "input_image_tokens"),
		pickUsageNumber(usage, "input_audio_tokens"),
		pickUsageNumber(usage, "input_video_tokens"),
	].reduce((total, value) => total + (value ?? 0), 0);

	const inputTokens =
		pickUsageNumber(usage, "input_tokens") ??
		(derivedInputTokens > 0 ? derivedInputTokens : undefined) ??
		pickUsageNumber(usage, "embedding_tokens");
	const totalTokens = pickUsageNumber(usage, "total_tokens") ?? inputTokens;
	const embeddingTokens = pickUsageNumber(usage, "embedding_tokens") ?? inputTokens;

	const ext = {
		inputImageTokens: pickUsageNumber(usage, "input_image_tokens"),
		inputAudioTokens: pickUsageNumber(usage, "input_audio_tokens"),
		inputVideoTokens: pickUsageNumber(usage, "input_video_tokens"),
	};

	return {
		object: "list",
		model,
		data,
		usage: usage
			? {
				inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
				totalTokens: typeof totalTokens === "number" ? totalTokens : undefined,
				embeddingTokens: typeof embeddingTokens === "number" ? embeddingTokens : undefined,
				_ext: Object.values(ext).some((value) => typeof value === "number")
					? ext
					: undefined,
			}
			: undefined,
		rawResponse: json ?? null,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	const keyInfo = resolveProviderKey(args as any, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
	const key = keyInfo.key;

	const requestedModel = args.providerModelSlug || ir.model;
	const modelForUrl = resolveGoogleModelCandidates(requestedModel)[0] || requestedModel;
	const inputItems = normalizeEmbeddingsInputItems(ir.input);
	const contents = await Promise.all(inputItems.map((item) => normalizeEmbeddingInput(item)));
	const isBatch = inputItems.length > 1;
	const googleOptions = ir.providerOptions?.google;
	const outputDimensionality = ir.dimensions;
	const taskType = googleOptions?.taskType;
	const title = googleOptions?.title;
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
				role: "user",
				parts: [{ text: "" }],
			},
			...(taskType ? { taskType } : {}),
			...(title ? { title } : {}),
			...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
		};
	const endpoint = isBatch ? ":batchEmbedContents" : ":embedContent";

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(payload) : undefined;

	const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}${endpoint}?key=${key}`, {
		method: "POST",
		headers: baseHeaders(),
		body: JSON.stringify(payload),
	});
	const json = await res.clone().json().catch(() => null);

	let usage = json ? extractEmbeddingUsage(json) : undefined;
	if (!usage) {
		const totalTokens = await fetchTokenCount(key, modelForUrl, contents);
		if (typeof totalTokens === "number" && totalTokens > 0) {
			usage = {
				embedding_tokens: totalTokens,
				total_tokens: totalTokens,
				input_text_tokens: totalTokens,
			};
		}
	}

	const responseIr = json ? mapGoogleToIr(json, ir.model, usage) : {
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
