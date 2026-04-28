// Purpose: Executor for openai / rerank.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR rerank requests to OpenAI-compatible rerank and normalizes usage.

import type { IRRerankRequest, IRRerankResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { encodeOpenAIRerankRequest } from "@protocols/openai-rerank/encode";
import { decodeOpenAIRerankResponse } from "@protocols/openai-rerank/decode";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const trimmed = model.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) {
		const parts = trimmed.split("/");
		return parts[parts.length - 1] || trimmed;
	}
	return trimmed;
}

function resolveTargetModel(ir: IRRerankRequest, args: ExecutorExecuteArgs): string {
	const providerModelSlug = args.providerModelSlug?.trim();
	if (providerModelSlug) return providerModelSlug;
	return normalizeModelName(ir.model) || ir.model;
}

function isVoyageProvider(providerId: string): boolean {
	return providerId === "voyage" || providerId === "voyageai";
}

function serializeVoyageDocument(
	value: unknown,
	rankFields: string[] | undefined,
): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		if (Array.isArray(rankFields) && rankFields.length > 0) {
			const selected = rankFields
				.map((field) => record[field])
				.filter((entry) => entry != null)
				.map((entry) => String(entry).trim())
				.filter(Boolean);
			if (selected.length > 0) return selected.join("\n");
		}
		try {
			return JSON.stringify(record);
		} catch {
			return String(record);
		}
	}
	return String(value ?? "");
}

function buildRequestBody(
	ir: IRRerankRequest,
	args: ExecutorExecuteArgs,
): Record<string, any> {
	const encoded = encodeOpenAIRerankRequest({
		...ir,
		model: resolveTargetModel(ir, args),
	}) as Record<string, any>;

	// Most OpenAI-compatible providers reject unknown provider_options fields.
	delete encoded.provider_options;

	if (isVoyageProvider(args.providerId)) {
		// Voyage expects `top_k` and string documents.
		if (typeof encoded.top_n === "number") {
			encoded.top_k = encoded.top_n;
			delete encoded.top_n;
		}
		if (Array.isArray(encoded.documents)) {
			encoded.documents = encoded.documents.map((doc) =>
				serializeVoyageDocument(doc, ir.rankFields),
			);
		}

		// Voyage API does not accept OpenAI-style extras.
		delete encoded.max_chunks_per_doc;
		delete encoded.rank_fields;
		delete encoded.user;
		delete encoded.metadata;

		const providerOptions = (ir.vendor?.provider_options ?? {}) as Record<
			string,
			unknown
		>;
		const voyageOptionsRaw =
			(providerOptions.voyage as Record<string, unknown> | undefined) ??
			(providerOptions.voyageai as Record<string, unknown> | undefined) ??
			providerOptions;
		if (typeof voyageOptionsRaw?.truncation === "boolean") {
			encoded.truncation = voyageOptionsRaw.truncation;
		}
	}

	return encoded;
}

function usageToMeters(usage?: IRRerankResponse["usage"]): Record<string, number> {
	const meters: Record<string, number> = {
		requests: 1,
	};
	if (!usage) return meters;

	const inputTokens = usage.inputTokens ?? usage.totalTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
	meters.input_tokens = inputTokens;
	meters.input_text_tokens = inputTokens;
	meters.output_tokens = outputTokens;
	meters.output_text_tokens = outputTokens;
	meters.total_tokens = totalTokens;
	return meters;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRRerankRequest;
	const keyInfo = await resolveOpenAICompatKey(args as any);
	const key = keyInfo.key;
	const requestBody = buildRequestBody(ir, args);

	const captureRequest = Boolean(
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest,
	);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const res = await fetch(openAICompatUrl(args.providerId, "/rerank"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key, {
			"Idempotency-Key": args.requestId,
			...upstreamTestHeaders(args.meta),
		}),
		body: JSON.stringify(requestBody),
	});

	const json = await res.clone().json().catch(() => null);
	const responseIr = decodeOpenAIRerankResponse(json, ir.model);
	responseIr.rawResponse = json ?? null;
	ir.rawRequest = requestBody;

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: usageToMeters(responseIr.usage),
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
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

export const executor: ProviderExecutor = async (
	args: ExecutorExecuteArgs,
) => execute(args);
