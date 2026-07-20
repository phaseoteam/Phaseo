import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { saveBatchFileMeta, type BatchJobMeta } from "@core/batch-jobs";

export const OPENAI_BATCH_PROVIDER_ID = "openai";
export const ANTHROPIC_BATCH_PROVIDER_ID = "anthropic";
export const GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID = "google-ai-studio";
export const MISTRAL_BATCH_PROVIDER_ID = "mistral";
export const X_AI_BATCH_PROVIDER_ID = "x-ai";
export const JSON_BATCH_CONTENT_TYPE = "application/json";
export const FILE_BACKED_JSONL_BATCH_PROVIDERS = new Set(["openai", "groq", "together"]);
const MAX_BATCH_RESULT_ENTRIES = 10_000;
const X_AI_BATCH_RESULTS_PAGE_SIZE = 1_000;

function providerKeyMissingResponse(providerId: string): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "upstream_error",
				reason: `${providerId.replace(/-/g, "_")}_key_missing`,
			},
		}),
		{ status: 502, headers: { "Content-Type": "application/json" } },
	);
}

export function batchText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function toBatchFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function providerCount(value: unknown): number {
	return toBatchFiniteNumber(value) ?? 0;
}

function normalizeAnthropicEndedStatus(payload: any): string {
	const counts = payload?.request_counts && typeof payload.request_counts === "object" ? payload.request_counts : {};
	const succeeded = providerCount((counts as any).succeeded);
	const errored = providerCount((counts as any).errored);
	const canceled = providerCount((counts as any).canceled ?? (counts as any).cancelled);
	const expired = providerCount((counts as any).expired);
	if (succeeded > 0) return "completed";
	if (errored > 0) return "failed";
	if (expired > 0) return "expired";
	if (canceled > 0) return "cancelled";
	return "completed";
}

function normalizeXAiStateStatus(payload: any): string | null {
	const state = payload?.state && typeof payload.state === "object" ? payload.state : {};
	const pending = toBatchFiniteNumber((state as any).num_pending);
	if (pending != null && pending > 0) return "in_progress";
	const total = toBatchFiniteNumber((state as any).num_requests);
	const success = providerCount((state as any).num_success);
	const error = providerCount((state as any).num_error);
	const cancelled = providerCount((state as any).num_cancelled ?? (state as any).num_canceled);
	if (pending != null && pending === 0) {
		if (success > 0) return "completed";
		if (error > 0) return "failed";
		if (cancelled > 0) return "cancelled";
		return total != null && total === 0 ? "pending" : "completed";
	}
	if (total != null) {
		const settled = success + error + cancelled;
		if (total > 0 && settled >= total) {
			if (success > 0) return "completed";
			if (error > 0) return "failed";
			if (cancelled > 0) return "cancelled";
		}
		if (total > settled) return "in_progress";
	}
	return null;
}

function googleBatchStats(payload: any): any {
	const response = payload?.response && typeof payload.response === "object" ? payload.response : null;
	return response?.batchStats ?? payload?.metadata?.batchStats ?? payload?.batchStats ?? null;
}

function normalizeGoogleSucceededStatus(payload: any): string {
	const stats = googleBatchStats(payload);
	const succeeded = providerCount(stats?.successfulRequestCount);
	const failed = providerCount(stats?.failedRequestCount);
	return succeeded === 0 && failed > 0 ? "failed" : "completed";
}

export function extractGoogleInlineResponses(payload: any): any[] | null {
	const candidates = [
		payload?.response?.inlinedResponses,
		payload?.metadata?.output?.inlinedResponses,
		payload?.inlinedResponses,
	];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) return candidate;
		if (Array.isArray(candidate?.inlinedResponses)) return candidate.inlinedResponses;
	}
	return null;
}

export async function parseUpstreamJson(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
}

function buildProviderBaseUrl(providerId: string, bindings: Record<string, string | undefined>): string {
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) return String(bindings.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "");
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) return String(bindings.GOOGLE_AI_STUDIO_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
	return "";
}

export async function fetchProviderBatchApi(providerId: string, args: {
	endpointPath: string;
	method: string;
	body?: BodyInit | null;
	contentType?: string | null;
}): Promise<Response> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) {
		let keyInfo: { key: string };
		try {
			keyInfo = resolveProviderKey(
				{ providerId, byokMeta: [] },
				() => bindings.ANTHROPIC_API_KEY,
			);
		} catch {
			return providerKeyMissingResponse(providerId);
		}
		return fetch(`${buildProviderBaseUrl(providerId, bindings)}${args.endpointPath}`, {
			method: args.method,
			headers: {
				"x-api-key": keyInfo.key,
				"anthropic-version": "2023-06-01",
				"Content-Type": args.contentType ?? JSON_BATCH_CONTENT_TYPE,
			},
			body: args.body ?? undefined,
		});
	}
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const key = bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GEMINI_API_KEY;
		if (!key) return providerKeyMissingResponse(providerId);
		return fetch(`${buildProviderBaseUrl(providerId, bindings)}${args.endpointPath}`, {
			method: args.method,
			headers: {
				"x-goog-api-key": key,
				"Content-Type": args.contentType ?? JSON_BATCH_CONTENT_TYPE,
			},
			body: args.body ?? undefined,
		});
	}

	let keyInfo: { key: string };
	try {
		keyInfo = resolveOpenAICompatKey({ providerId, byokMeta: [] } as any);
	} catch {
		return providerKeyMissingResponse(providerId);
	}
	const headers = new Headers(openAICompatHeaders(providerId, keyInfo.key));
	if (args.contentType) headers.set("Content-Type", args.contentType);
	if (!args.contentType) headers.delete("Content-Type");
	return fetch(openAICompatUrl(providerId, args.endpointPath), {
		method: args.method,
		headers,
		body: args.body ?? undefined,
	});
}

export function normalizeProviderBatchStatus(providerId: string, raw: unknown, payload?: any): string | null {
	const status = batchText(raw)?.toLowerCase();
	if (providerId === MISTRAL_BATCH_PROVIDER_ID) {
		switch (status) {
			case "queued":
				return "validating";
			case "running":
				return "in_progress";
			case "success":
				return "completed";
			case "timeout_exceeded":
				return "expired";
			case "cancellation_requested":
				return "cancelling";
			case "cancelled":
				return "cancelled";
			case "failed":
				return "failed";
			default:
				return status;
		}
	}
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) {
		switch (status) {
			case "in_progress":
				return "in_progress";
			case "canceling":
				return "cancelling";
			case "canceled":
				return "cancelled";
			case "ended":
				return normalizeAnthropicEndedStatus(payload);
			default:
				return status;
		}
	}
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const state = status ?? batchText(payload?.metadata?.state)?.toLowerCase() ?? batchText(payload?.response?.state)?.toLowerCase();
		switch (state) {
			case "batch_state_pending":
			case "job_state_pending":
				return "pending";
			case "batch_state_running":
			case "job_state_running":
				return "in_progress";
			case "batch_state_succeeded":
			case "job_state_succeeded":
				return normalizeGoogleSucceededStatus(payload);
			case "batch_state_failed":
			case "job_state_failed":
				return "failed";
			case "batch_state_cancelled":
			case "job_state_cancelled":
				return "cancelled";
			case "batch_state_expired":
			case "job_state_expired":
				return "expired";
			default:
				if (payload?.done === false) return "in_progress";
				if (payload?.done === true && payload?.error) return "failed";
				if (payload?.done === true) return "completed";
				return state;
		}
	}
	if (providerId === X_AI_BATCH_PROVIDER_ID) {
		if (status) return status === "canceled" ? "cancelled" : status;
		return normalizeXAiStateStatus(payload);
	}
	if (status === "canceled") return "cancelled";
	return status;
}

export function extractProviderBatchId(providerId: string, payload: any): { publicId: string | null; nativeId: string | null } {
	const native =
		batchText(payload?.native_batch_id) ??
		batchText(payload?.name) ??
		batchText(payload?.batch?.name) ??
		batchText(payload?.response?.name) ??
		batchText(payload?.batch_id) ??
		batchText(payload?.id);
	if (!native) return { publicId: null, nativeId: null };
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID && native.includes("/")) {
		return { publicId: native.split("/").filter(Boolean).pop() ?? native, nativeId: native };
	}
	return { publicId: native, nativeId: native };
}

export function normalizeProviderBatchPayload(providerId: string, payload: any): any {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const ids = extractProviderBatchId(providerId, payload);
	const status = normalizeProviderBatchStatus(
		providerId,
		payload.status ?? payload.processing_status ?? payload.state ?? payload.metadata?.state,
		payload,
	);
	const out: Record<string, unknown> = {
		...payload,
		...(ids.publicId ? { id: ids.publicId } : {}),
		...(ids.nativeId ? { native_batch_id: ids.nativeId } : {}),
		...(status ? { status } : {}),
	};
	if (providerId === MISTRAL_BATCH_PROVIDER_ID) {
		const inputFile = Array.isArray(payload.input_files) ? batchText(payload.input_files[0]) : null;
		out.input_file_id = inputFile ?? batchText(payload.input_file_id) ?? null;
		out.output_file_id = batchText(payload.output_file) ?? batchText(payload.output_file_id) ?? null;
		out.error_file_id = batchText(payload.error_file) ?? batchText(payload.error_file_id) ?? null;
		out.request_counts = {
			total: toBatchFiniteNumber(payload.total_requests),
			completed: toBatchFiniteNumber(payload.succeeded_requests ?? payload.completed_requests),
			failed: toBatchFiniteNumber(payload.failed_requests),
		};
	}
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) {
		const counts = payload.request_counts && typeof payload.request_counts === "object" ? payload.request_counts : {};
		const total =
			(toBatchFiniteNumber((counts as any).processing) ?? 0) +
			(toBatchFiniteNumber((counts as any).succeeded) ?? 0) +
			(toBatchFiniteNumber((counts as any).errored) ?? 0) +
			(toBatchFiniteNumber((counts as any).canceled) ?? 0) +
			(toBatchFiniteNumber((counts as any).expired) ?? 0);
		out.request_counts = {
			total,
			completed: toBatchFiniteNumber((counts as any).succeeded),
			failed:
				(toBatchFiniteNumber((counts as any).errored) ?? 0) +
				(toBatchFiniteNumber((counts as any).canceled) ?? 0) +
				(toBatchFiniteNumber((counts as any).expired) ?? 0),
		};
	}
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const stats = googleBatchStats(payload);
		out.request_counts = {
			total: toBatchFiniteNumber(stats?.requestCount),
			completed: toBatchFiniteNumber(stats?.successfulRequestCount),
			failed: toBatchFiniteNumber(stats?.failedRequestCount),
		};
	}
	if (providerId === X_AI_BATCH_PROVIDER_ID) {
		out.request_counts = {
			total: toBatchFiniteNumber(payload.state?.num_requests),
			completed: toBatchFiniteNumber(payload.state?.num_success),
			failed: toBatchFiniteNumber(payload.state?.num_error),
		};
	}
	return out;
}

export function batchMetaFromProviderPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = batchText(payload?.id);
	const nativeId = batchText(payload?.native_batch_id) ?? id;
	return {
		...base,
		status: batchText(payload?.status) ?? base.status ?? null,
		model: batchText(payload?.model) ?? base.model ?? null,
		nativeBatchId: nativeId ?? base.nativeBatchId ?? null,
		endpoint: batchText(payload?.endpoint) ?? base.endpoint ?? null,
		completionWindow: batchText(payload?.completion_window) ?? base.completionWindow ?? null,
		inputFileId: batchText(payload?.input_file_id) ?? base.inputFileId ?? null,
		outputFileId: batchText(payload?.output_file_id) ?? base.outputFileId ?? null,
		errorFileId: batchText(payload?.error_file_id) ?? base.errorFileId ?? null,
		requestCounts:
			payload?.request_counts && typeof payload.request_counts === "object" && !Array.isArray(payload.request_counts)
				? {
					total: typeof payload.request_counts.total === "number" ? payload.request_counts.total : null,
					completed: typeof payload.request_counts.completed === "number" ? payload.request_counts.completed : null,
					failed: typeof payload.request_counts.failed === "number" ? payload.request_counts.failed : null,
				}
				: base.requestCounts ?? null,
	};
}

export async function persistProviderBatchFileOwnership(workspaceId: string, providerId: string, payload: any): Promise<void> {
	const outputFileId = batchText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(workspaceId, outputFileId, {
			provider: providerId,
			status: "available",
		});
	}
	const errorFileId = batchText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(workspaceId, errorFileId, {
			provider: providerId,
			status: "available",
		});
	}
}

export function buildProviderRetrievePath(providerId: string, nativeBatchId: string): string {
	if (providerId === MISTRAL_BATCH_PROVIDER_ID) return `/batch/jobs/${encodeURIComponent(nativeBatchId)}`;
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) return `/messages/batches/${encodeURIComponent(nativeBatchId)}`;
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const name = nativeBatchId.includes("/") ? nativeBatchId : `batches/${nativeBatchId}`;
		return `/${name.split("/").map(encodeURIComponent).join("/")}`;
	}
	return `/batches/${encodeURIComponent(nativeBatchId)}`;
}

export function buildProviderCancelPath(providerId: string, nativeBatchId: string): string {
	if (providerId === MISTRAL_BATCH_PROVIDER_ID) return `/batch/jobs/${encodeURIComponent(nativeBatchId)}/cancel`;
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) return `/messages/batches/${encodeURIComponent(nativeBatchId)}/cancel`;
	if (providerId === X_AI_BATCH_PROVIDER_ID) return `/batches/${encodeURIComponent(nativeBatchId)}:cancel`;
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const name = nativeBatchId.includes("/") ? nativeBatchId : `batches/${nativeBatchId}`;
		return `/${name.split("/").map(encodeURIComponent).join("/")}:cancel`;
	}
	return `/batches/${encodeURIComponent(nativeBatchId)}/cancel`;
}

function buildProviderResultsPath(providerId: string, nativeBatchId: string): string | null {
	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) return `/messages/batches/${encodeURIComponent(nativeBatchId)}/results`;
	if (providerId === X_AI_BATCH_PROVIDER_ID) return `/batches/${encodeURIComponent(nativeBatchId)}/results`;
	return null;
}

export class ProviderBatchFetchError extends Error {
	readonly providerId: string;
	readonly nativeBatchId: string;
	readonly status: number;
	readonly responsePreview: string;

	constructor(args: { providerId: string; nativeBatchId: string; status: number; responsePreview: string }) {
		super(`${args.providerId}_batch_fetch_failed_${args.status}:${args.responsePreview}`);
		this.name = "ProviderBatchFetchError";
		this.providerId = args.providerId;
		this.nativeBatchId = args.nativeBatchId;
		this.status = args.status;
		this.responsePreview = args.responsePreview;
	}
}

export async function fetchProviderBatchStatus(providerId: string, nativeBatchId: string): Promise<any | null> {
	const response = await fetchProviderBatchApi(providerId, {
		endpointPath: buildProviderRetrievePath(providerId, nativeBatchId),
		method: "GET",
	});
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new ProviderBatchFetchError({
			providerId,
			nativeBatchId,
			status: response.status,
			responsePreview: preview.slice(0, 200),
		});
	}
	return normalizeProviderBatchPayload(providerId, await parseUpstreamJson(response));
}

export function parseProviderBatchListPage(providerId: string, payload: any): {
	candidates: any[];
	nextCursor: string | null;
} {
	const candidates = providerId === X_AI_BATCH_PROVIDER_ID && Array.isArray(payload?.batches)
		? payload.batches
		: providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID && Array.isArray(payload?.operations)
			? payload.operations
			: Array.isArray(payload?.data)
				? payload.data
				: Array.isArray(payload?.jobs)
					? payload.jobs
					: Array.isArray(payload)
						? payload
						: [];
	if (providerId === OPENAI_BATCH_PROVIDER_ID) {
		return {
			candidates,
			nextCursor: payload?.has_more === true && candidates.length > 0
				? batchText(payload?.last_id) ?? batchText(candidates.at(-1)?.id)
				: null,
		};
	}
	if (providerId === X_AI_BATCH_PROVIDER_ID) {
		return { candidates, nextCursor: batchText(payload?.pagination_token) };
	}
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		return { candidates, nextCursor: batchText(payload?.nextPageToken) };
	}
	return { candidates, nextCursor: candidates.length >= 100 ? String(candidates.length) : null };
}

export async function findProviderBatchByGatewayMetadata(args: {
	providerId: string;
	batchId: string;
	requestId?: string | null;
}): Promise<any | null> {
	if (
		args.providerId !== OPENAI_BATCH_PROVIDER_ID &&
		args.providerId !== MISTRAL_BATCH_PROVIDER_ID &&
		args.providerId !== GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID &&
		args.providerId !== X_AI_BATCH_PROVIDER_ID
	) return null;
	let cursor: string | null = null;
	for (let page = 0; page < 10; page += 1) {
		const endpointPath = args.providerId === MISTRAL_BATCH_PROVIDER_ID
			? `/batch/jobs?page=${page}&page_size=100`
			: args.providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID
				? `/batches?pageSize=100${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`
				: args.providerId === X_AI_BATCH_PROVIDER_ID
					? `/batches?limit=100${cursor ? `&pagination_token=${encodeURIComponent(cursor)}` : ""}`
					: `/batches?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`;
		const response = await fetchProviderBatchApi(args.providerId, {
			endpointPath,
			method: "GET",
		});
		if (!response.ok) {
			throw new Error(`${args.providerId}_batch_recovery_list_failed_${response.status}`);
		}
		const payload = await parseUpstreamJson(response);
		const { candidates, nextCursor } = parseProviderBatchListPage(args.providerId, payload);
		for (const candidate of candidates) {
			const metadata = candidate?.metadata && typeof candidate.metadata === "object"
				? candidate.metadata
				: {};
			if (
				batchText(metadata.phaseo_batch_id) === args.batchId ||
				(args.requestId && batchText(metadata.phaseo_request_id) === args.requestId) ||
				batchText(candidate?.name)?.startsWith(`phaseo-${args.batchId}`) === true ||
				batchText(
					candidate?.displayName ??
					candidate?.display_name ??
					candidate?.metadata?.displayName ??
					candidate?.metadata?.batch?.displayName,
				)?.startsWith(`phaseo-${args.batchId}`) === true
			) {
				return normalizeProviderBatchPayload(args.providerId, candidate);
			}
		}
		cursor = nextCursor;
		if (!cursor) break;
	}
	return null;
}

export async function fetchProviderFileText(providerId: string, fileIdRaw: string, maxBytes = 20 * 1024 * 1024): Promise<string> {
	const fileId = batchText(fileIdRaw);
	if (!fileId) throw new Error("missing_output_file_id");
	const response = await fetchProviderBatchApi(providerId, {
		endpointPath: `/files/${encodeURIComponent(fileId)}/content`,
		method: "GET",
	});
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new Error(`${providerId}_batch_output_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
	}
	const declaredLength = Number(response.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error("batch_file_too_large");
	}
	if (!response.body) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytesRead += value.byteLength;
		if (bytesRead > maxBytes) {
			await reader.cancel("batch_file_too_large").catch(() => undefined);
			throw new Error("batch_file_too_large");
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

export function parseProviderBatchInputEntries(text: string): Array<{ body: unknown; endpoint?: string | null }> {
	return parseJsonLines(text).map((entry) => ({
		body: entry?.body ?? entry?.request ?? entry?.params,
		endpoint: batchText(entry?.url ?? entry?.endpoint),
	}));
}

function parseJsonLines(text: string): any[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function withUsageAlias(body: any): any {
	if (!body || typeof body !== "object" || Array.isArray(body)) return body;
	return {
		...body,
		...(!body.usage && body.usageMetadata && typeof body.usageMetadata === "object" ? { usage: body.usageMetadata } : {}),
		...(!body.model && (batchText(body.modelVersion) || batchText(body.model_version))
			? { model: batchText(body.modelVersion) ?? batchText(body.model_version) }
			: {}),
	};
}

function normalizeOutputEntry(providerId: string, entry: any, index: number): any {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
	if (entry.response?.body) {
		return {
			...entry,
			response: {
				...entry.response,
				body: withUsageAlias(entry.response.body),
			},
		};
	}
	const customId =
		batchText(entry.custom_id) ??
		batchText(entry.customId) ??
		batchText(entry.batch_request_id) ??
		batchText(entry.metadata?.custom_id) ??
		`response-${index + 1}`;

	if (providerId === ANTHROPIC_BATCH_PROVIDER_ID) {
		const result = entry.result && typeof entry.result === "object" ? entry.result : entry;
		const body = result.message ?? result.response ?? (result.type === "succeeded" ? result : null);
		if (body && typeof body === "object") {
			return {
				custom_id: customId,
				response: {
					status_code: 200,
					body: withUsageAlias(body),
				},
			};
		}
		return {
			custom_id: customId,
			error: result.error ?? result,
		};
	}

	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const response = entry.response ?? entry.generateContentResponse ?? entry;
		const error = entry.error ?? response?.error;
		if (error) {
			return { custom_id: customId, error };
		}
		return {
			custom_id: customId,
			response: {
				status_code: 200,
				body: withUsageAlias(response.generateContentResponse ?? response),
			},
		};
	}

	if (providerId === X_AI_BATCH_PROVIDER_ID) {
		const providerResponse = entry.batch_result?.response ?? entry.response;
		const body =
			providerResponse?.chat_get_completion ??
			providerResponse?.responses ??
			providerResponse?.image_generation ??
			providerResponse?.video_generation ??
			entry.batch_request?.responses ??
			entry.responses ??
			entry.body ??
			entry.output;
		if (body && typeof body === "object") {
			return {
				custom_id: customId,
				response: {
					status_code: 200,
					body: withUsageAlias(body),
				},
			};
		}
		return {
			custom_id: customId,
			error: entry.error ?? entry,
		};
	}

	return entry;
}

function normalizeOutputEntries(providerId: string, entries: any[]): any[] {
	return entries.map((entry, index) => normalizeOutputEntry(providerId, entry, index));
}

export async function fetchProviderBatchOutputEntries(meta: BatchJobMeta): Promise<any[]> {
	const providerId = meta.provider || OPENAI_BATCH_PROVIDER_ID;
	const outputFileId = batchText(meta.outputFileId);
	if (outputFileId) {
		return normalizeOutputEntries(providerId, parseJsonLines(await fetchProviderFileText(providerId, outputFileId)));
	}

	const nativeBatchId = batchText(meta.nativeBatchId);
	if (!nativeBatchId) throw new Error("missing_output_file_id");
	if (providerId === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID) {
		const payload = await fetchProviderBatchStatus(providerId, nativeBatchId);
		const inlineResponses = extractGoogleInlineResponses(payload);
		if (!Array.isArray(inlineResponses)) throw new Error("missing_output_file_id");
		return normalizeOutputEntries(providerId, inlineResponses);
	}

	const resultsPath = buildProviderResultsPath(providerId, nativeBatchId);
	if (!resultsPath) throw new Error("missing_output_file_id");
	if (providerId === X_AI_BATCH_PROVIDER_ID) {
		const entries: any[] = [];
		let paginationToken: string | null = null;
		const maxPages = Math.ceil(MAX_BATCH_RESULT_ENTRIES / X_AI_BATCH_RESULTS_PAGE_SIZE);
		for (let page = 0; page < maxPages; page += 1) {
			const query = new URLSearchParams({ limit: String(X_AI_BATCH_RESULTS_PAGE_SIZE) });
			if (paginationToken) query.set("pagination_token", paginationToken);
			const response = await fetchProviderBatchApi(providerId, {
				endpointPath: `${resultsPath}?${query.toString()}`,
				method: "GET",
			});
			if (!response.ok) {
				const preview = await response.text().catch(() => "");
				throw new Error(`${providerId}_batch_results_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
			}
			const payload = await parseUpstreamJson(response);
			if (!payload || !Array.isArray(payload.results)) throw new Error("x-ai_batch_results_invalid");
			entries.push(...payload.results);
			if (entries.length > MAX_BATCH_RESULT_ENTRIES) {
				throw new Error("x-ai_batch_results_limit_exceeded");
			}
			paginationToken = batchText(payload.pagination_token);
			if (!paginationToken) return normalizeOutputEntries(providerId, entries);
		}
		throw new Error("x-ai_batch_results_pagination_limit_exceeded");
	}

	const response = await fetchProviderBatchApi(providerId, {
		endpointPath: resultsPath,
		method: "GET",
	});
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new Error(`${providerId}_batch_results_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
	}
	const text = await response.text();
	const parsed = (() => {
		try {
			return JSON.parse(text);
		} catch {
			return null;
		}
	})();
	if (Array.isArray(parsed)) return normalizeOutputEntries(providerId, parsed);
	if (parsed && typeof parsed === "object") {
		const rows = (parsed as any).data ?? (parsed as any).results ?? (parsed as any).items ?? (parsed as any).response;
		if (Array.isArray(rows)) return normalizeOutputEntries(providerId, rows);
	}
	return normalizeOutputEntries(providerId, parseJsonLines(text));
}
