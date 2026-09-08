import type { IREmbeddingsRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { resolveVertexAccessToken, resolveVertexApiBase } from "@providers/google-vertex/auth";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { resolveGoogleModelCandidates } from "../../google/shared/model";
import {
	embeddingRequestError,
	extractEmbeddingUsage,
	mapGoogleToIr,
	normalizeEmbeddingInput,
	normalizeEmbeddingsInputItems,
} from "../../google/shared/embeddings";

// Vertex Gemini Embedding 2 uses embedContentConfig and a single content,
// unlike the Developer API's batchEmbedContents wire format.
// Contract: googleapis/python-genai, _EmbedContentParametersPrivate_to_vertex.
export const executor: ProviderExecutor = async (args) => {
	const ir = args.ir as IREmbeddingsRequest;
	const requestedModel = args.providerModelSlug || ir.model;
	const model = resolveGoogleModelCandidates(requestedModel)[0] || requestedModel;
	if (!/^gemini-embedding-2(?:$|-)/.test(model)) {
		return embeddingRequestError("This Vertex embeddings adapter supports Gemini Embedding 2 models.", "model");
	}
	const items = normalizeEmbeddingsInputItems(ir.input);
	if (items.length !== 1) {
		return embeddingRequestError("Vertex Gemini Embedding 2 accepts one input per request. Combine related media into one content item or send separate requests.", "input");
	}
	if (ir.encodingFormat && !["float", "base64"].includes(ir.encodingFormat)) {
		return embeddingRequestError("Google embeddings support float or base64 encoding.", "encoding_format");
	}
	let content;
	try {
		content = await normalizeEmbeddingInput(items[0]);
	} catch (error) {
		return embeddingRequestError(error instanceof Error ? error.message : "Invalid embedding input.", "input");
	}
	const payload = {
		content,
		embedContentConfig: {
			...(ir.dimensions !== undefined ? { outputDimensionality: ir.dimensions } : {}),
			...(ir.providerOptions?.google?.taskType ? { taskType: ir.providerOptions.google.taskType } : {}),
			...(ir.providerOptions?.google?.title ? { title: ir.providerOptions.google.title } : {}),
		},
	};
	const bindings = getBindings();
	const keyInfo = resolveProviderKey(args, () => bindings.GOOGLE_VERTEX_ACCESS_TOKEN || bindings.GOOGLE_VERTEX_API_KEY);
	const token = await resolveVertexAccessToken(keyInfo.key, args.upstreamTiming);
	const url = `${resolveVertexApiBase(bindings)}/publishers/google/models/${encodeURIComponent(model)}:embedContent`;
	const body = JSON.stringify(payload);
	const upstream = await fetchUpstream(args, url, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...upstreamTestHeaders(args.meta) },
		body,
	});
	const rawResponse = await upstream.clone().json().catch(() => null);
	const usage = upstream.ok ? extractEmbeddingUsage(rawResponse) : undefined;
	return {
		kind: "completed",
		upstream,
		ir: upstream.ok ? mapGoogleToIr(rawResponse, ir.model, usage, ir.encodingFormat) : undefined,
		bill: { cost_cents: 0, currency: "USD", usage: upstream.ok ? { requests: 1, ...usage } : undefined, upstream_id: upstream.headers.get("x-request-id") },
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest: args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? body : undefined,
		rawResponse,
	};
};
