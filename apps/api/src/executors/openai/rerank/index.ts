// Purpose: Executor for openai / rerank.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR rerank requests to OpenAI-compatible rerank and normalizes usage.

import type { IRRerankRequest, IRRerankResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { encodeOpenAIRerankRequest } from "@protocols/openai-rerank/encode";
import { decodeOpenAIRerankResponse } from "@protocols/openai-rerank/decode";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatConfig,
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

function isCohereProvider(providerId: string): boolean {
	return providerId === "cohere";
}

function isNebiusProvider(providerId: string): boolean {
	return providerId.startsWith("nebius-token-factory");
}

function cohereRerankUrl(): string {
	const configured = resolveOpenAICompatConfig("cohere").baseUrl.replace(/\/+$/, "");
	return `${configured.replace(/\/compatibility\/v1$/i, "")}/v2/rerank`;
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

	if (args.providerId === "baidu") {
		return {
			model: encoded.model,
			query: ir.query,
			documents: ir.documents,
			...(ir.topN !== undefined ? { top_n: ir.topN } : {}),
			...(ir.userId !== undefined ? { user: ir.userId } : {}),
		};
	}

	if (isCohereProvider(args.providerId)) {
		// Cohere v2 accepts text documents only. Preserve structured gateway
		// inputs deterministically rather than sending an invalid JSON object.
		encoded.documents = ir.documents.map((document) =>
			typeof document === "string" ? document : JSON.stringify(document),
		);

		// These belong to older/vendor-neutral rerank dialects, not Cohere v2.
		delete encoded.return_documents;
		delete encoded.max_chunks_per_doc;
		delete encoded.rank_fields;
		delete encoded.user;
		delete encoded.metadata;
	}

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

	if (args.providerId === "fireworks") {
		encoded.documents = ir.documents.map((document) =>
			typeof document === "string" ? document : JSON.stringify(document),
		);
		const providerOptions = ir.vendor?.provider_options;
		const fireworksOptions = providerOptions?.fireworks;
		if (typeof fireworksOptions?.task === "string" && fireworksOptions.task.length > 0) {
			encoded.task = fireworksOptions.task;
		}
		delete encoded.max_chunks_per_doc;
		delete encoded.max_tokens_per_doc;
		delete encoded.priority;
		delete encoded.rank_fields;
		delete encoded.user;
		delete encoded.metadata;
	}

	if (isNebiusProvider(args.providerId)) {
		// Nebius' native contract accepts only string documents plus user and
		// service_tier. Vendor-neutral rerank controls are rejected with 422.
		encoded.documents = ir.documents.map((document) =>
			typeof document === "string" ? document : JSON.stringify(document),
		);
		delete encoded.top_n;
		delete encoded.return_documents;
		delete encoded.max_chunks_per_doc;
		delete encoded.max_tokens_per_doc;
		delete encoded.priority;
		delete encoded.rank_fields;
		delete encoded.metadata;
	}

	if (args.providerId === "novita" || args.providerId === "novitaai") {
		// Novita documents string documents plus top_n only.
		encoded.documents = ir.documents.map((document) =>
			typeof document === "string" ? document : JSON.stringify(document),
		);
		delete encoded.return_documents;
		delete encoded.max_chunks_per_doc;
		delete encoded.max_tokens_per_doc;
		delete encoded.priority;
		delete encoded.rank_fields;
		delete encoded.user;
		delete encoded.metadata;
	}

	if (args.providerId === "scaleway") {
		// Scaleway exposes the Jina/Cohere-shaped core only: string documents,
		// query, model, and top_n. Do not leak gateway/vendor extensions upstream.
		encoded.documents = ir.documents.map((document) =>
			typeof document === "string" ? document : JSON.stringify(document),
		);
		delete encoded.return_documents;
		delete encoded.max_chunks_per_doc;
		delete encoded.max_tokens_per_doc;
		delete encoded.priority;
		delete encoded.rank_fields;
		delete encoded.user;
		delete encoded.service_tier;
		delete encoded.metadata;
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
	if (usage.searchUnits !== undefined) meters.search_units = usage.searchUnits;
	return meters;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRRerankRequest;
	if (args.providerId === "baidu") {
		const unsupported = ["maxChunksPerDoc", "maxTokensPerDoc", "rankFields", "priority", "serviceTier"] as const;
		if (ir.documents.some(document => typeof document !== "string") || unsupported.some(name => ir[name] !== undefined)) {
			return { kind: "completed", upstream: Response.json({ error: { message: "Baidu rerank requires text documents and does not support chunking, rank fields, priority, or service tiers." } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
		}
	}
	const keyInfo = await resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const key = keyInfo.key;
	const requestBody = buildRequestBody(ir, args);

	const captureRequest = Boolean(
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest,
	);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const upstreamUrl = isCohereProvider(args.providerId)
		? cohereRerankUrl()
		: openAICompatUrl(args.providerId, "/rerank");
	const res = await fetchUpstream(args, upstreamUrl, {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key, {
			"Idempotency-Key": args.requestId,
			...upstreamTestHeaders(args.meta),
		}),
		body: JSON.stringify(requestBody),
	});

	const json = await res.clone().json().catch(() => null);
	if (!res.ok) {
		ir.rawRequest = requestBody;
		return {
			kind: "completed",
			upstream: res,
			ir: undefined,
			bill: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json ?? null,
		};
	}
	const responseIr = decodeOpenAIRerankResponse(json, ir.model);
	if (args.providerId === "baidu") {
		for (const result of responseIr.results) {
			if (ir.returnDocuments) result.document = ir.documents[result.index];
			else delete result.document;
		}
	}
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
