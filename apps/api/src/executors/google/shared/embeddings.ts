import type { IREmbeddingsContentPart, IREmbeddingsInput, IREmbeddingsInputItem, IREmbeddingsResponse } from "@core/ir";
import { normalizeGoogleUsage } from "@providers/google-ai-studio/usage";
import { irPartToGeminiPart } from "./media";
import type { ExecutorResult } from "@executors/types";

export function embeddingRequestError(message: string, param: string): ExecutorResult {
	const rawResponse = { error: { type: "invalid_request_error", code: "unsupported_parameter", message, param } };
	return {
		kind: "completed",
		upstream: new Response(JSON.stringify(rawResponse), { status: 400, headers: { "Content-Type": "application/json" } }),
		bill: { cost_cents: 0, currency: "USD" },
		rawResponse,
	};
}

export function encodeEmbeddingValues(values: number[], encodingFormat?: string): number[] | string {
	if (encodingFormat !== "base64") return values;
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	for (let index = 0; index < values.length; index++) view.setFloat32(index * 4, values[index], true);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export type GeminiEmbeddingContent = {
	parts: Array<Record<string, any>>;
};

function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function isGoogleFilesUri(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.hostname === "generativelanguage.googleapis.com" ||
			url.hostname.endsWith(".googleapis.com")
		);
	} catch {
		return false;
	}
}

function expectedMimePrefix(part: IREmbeddingsContentPart): string | null {
	if (part.type === "image") return "image/";
	if (part.type === "audio") return "audio/";
	if (part.type === "video") return "video/";
	return null;
}

function sourceUrlForPart(part: IREmbeddingsContentPart): string | null {
	if (part.type === "video") return part.url;
	if (part.type === "image" || part.type === "audio") return part.data;
	return null;
}

function assertEmbeddingMediaPart(part: IREmbeddingsContentPart, geminiPart: Record<string, any>) {
	if (part.type === "text") return;

	const sourceUrl = sourceUrlForPart(part);
	const fallbackFileUri =
		typeof geminiPart?.file_data?.file_uri === "string"
			? geminiPart.file_data.file_uri
			: null;
	if (
		sourceUrl &&
		part.source === "url" &&
		isHttpUrl(sourceUrl) &&
		fallbackFileUri &&
		!isGoogleFilesUri(fallbackFileUri)
	) {
		throw new Error(
			`Google embeddings could not inline ${part.type} URL "${sourceUrl}". Use a direct public file URL, a data URL, or upload bytes from the client.`,
		);
	}

	const expectedPrefix = expectedMimePrefix(part);
	const actualMime =
		typeof geminiPart?.inline_data?.mime_type === "string"
			? geminiPart.inline_data.mime_type.trim().toLowerCase()
			: null;
	if (expectedPrefix && actualMime && !actualMime.startsWith(expectedPrefix)) {
		throw new Error(
			`Google embeddings expected ${expectedPrefix} input for ${part.type} but received "${actualMime}". Use a direct media file URL.`,
		);
	}
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

export function normalizeEmbeddingsInputItems(input: IREmbeddingsInput): IREmbeddingsInputItem[] {
	if (isTokenArray(input)) return [input];
	if (!Array.isArray(input)) return [input];
	if (input.length === 0) return [""];
	if (isEmbeddingsContentParts(input)) return [input];
	return input as IREmbeddingsInputItem[];
}

export async function normalizeEmbeddingInput(item: IREmbeddingsInputItem): Promise<GeminiEmbeddingContent> {
	if (typeof item === "string") {
		return {
			parts: [{ text: item }],
		};
	}

	if (isTokenArray(item)) {
		throw new Error("Google embeddings require text or media input; token ID arrays cannot be translated between tokenizers.");
	}

	const parts = await Promise.all((item as IREmbeddingsContentPart[]).map(async (part) => {
		const geminiPart = await irPartToGeminiPart(part);
		assertEmbeddingMediaPart(part, geminiPart);
		return geminiPart;
	}));
	return {
		parts: parts.length > 0 ? parts : [{ text: "" }],
	};
}

export function extractEmbeddingUsage(json: any): Record<string, number> | undefined {
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
	else if (Array.isArray(json?.embeddings)) {
		for (const entry of json.embeddings) {
			if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
			if (entry?.usage) usageEntries.push(entry.usage);
		}
	} else if (Array.isArray(json?.requests)) {
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
		input_tokens: total,
		total_tokens: total,
		input_text_tokens: merged.input_text_tokens ?? Math.max(0, total
			- (merged.input_image_tokens ?? 0)
			- (merged.input_audio_tokens ?? 0)
			- (merged.input_video_tokens ?? 0)),
	};
	return Object.keys(merged).length
		? { ...merged, ...usage }
		: usage;
}

function pickUsageNumber(usage: Record<string, number> | undefined, key: string): number | undefined {
	const value = usage?.[key];
	return typeof value === "number" ? value : undefined;
}

export function mapGoogleToIr(json: any, model: string, usageOverride?: Record<string, number>, encodingFormat?: string): IREmbeddingsResponse {
	const entries = Array.isArray(json?.embeddings)
		? json.embeddings
		: json?.embedding
			? [json.embedding]
			: [];

	const data = entries.map((item: any, index: number) => ({
		index,
		embedding: encodeEmbeddingValues(item?.values ?? item?.embedding?.values ?? [], encodingFormat),
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
