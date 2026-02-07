// Purpose: Executor for google / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to Google AI Studio embeddings and normalizes usage.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
import { getBindings } from "@/runtime/env";
import { normalizeGoogleUsage } from "@providers/google-ai-studio/usage";
import { resolveProviderKey } from "@providers/keys";
import type { ProviderExecutor } from "../../types";

const BASE_URL = "https://generativelanguage.googleapis.com";

function baseHeaders() {
	return {
		"Content-Type": "application/json",
	};
}

function normalizeEmbeddingInput(input: string) {
	return {
		role: "user" as const,
		parts: [{ text: input }],
	};
}

function coerceInput(value: string): string {
	return typeof value === "string" ? value : String(value);
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

	mergeUsage(normalizeGoogleUsage(json?.usageMetadata));
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

async function fetchTokenCount(key: string, modelForUrl: string, inputs: string[]) {
	const contents = inputs.map((input) => normalizeEmbeddingInput(coerceInput(input)));
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
	const inputTokens = usage?.input_text_tokens ?? usage?.input_tokens ?? usage?.embedding_tokens;
	const totalTokens = usage?.total_tokens ?? inputTokens;
	const embeddingTokens = usage?.embedding_tokens ?? inputTokens;

	return {
		object: "list",
		model,
		data,
		usage: usage
			? {
				inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
				totalTokens: typeof totalTokens === "number" ? totalTokens : undefined,
				embeddingTokens: typeof embeddingTokens === "number" ? embeddingTokens : undefined,
			}
			: undefined,
		rawResponse: json ?? null,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	const keyInfo = resolveProviderKey(args as any, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
	const key = keyInfo.key;

	const modelForUrl = args.providerModelSlug || ir.model;
	const inputs = Array.isArray(ir.input) ? ir.input : [ir.input];
	const isBatch = Array.isArray(ir.input);
	const googleOptions = ir.embeddingOptions?.google;
	const outputDimensionality = googleOptions?.outputDimensionality ?? ir.dimensions;
	const taskType = googleOptions?.taskType;
	const title = googleOptions?.title;
	const requestModel = `models/${modelForUrl}`;
	const payload = isBatch
		? {
			requests: inputs.map((input) => ({
				model: requestModel,
				content: normalizeEmbeddingInput(coerceInput(input)),
				...(taskType ? { taskType } : {}),
				...(title ? { title } : {}),
				...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
			})),
		}
		: {
			content: normalizeEmbeddingInput(coerceInput(inputs[0])),
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
		const totalTokens = await fetchTokenCount(key, modelForUrl, inputs);
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

	if (usage) {
		const priced = computeBill(usage, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

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
