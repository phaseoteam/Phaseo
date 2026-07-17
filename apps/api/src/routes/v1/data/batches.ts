// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure, AuthSuccess } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { generatePublicId } from "@pipeline/before/genId";
import { guardContext } from "@pipeline/before/guards";
import { applyPromptInjectionGuardrails } from "@pipeline/before/promptInjection";
import { applySensitiveInfoGuardrails } from "@pipeline/before/sensitiveInfo";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import type { Endpoint } from "@core/types";
import { getBindings } from "@/runtime/env";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { emitGatewayOperationalFailure } from "@/observability/axiom";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import {
	buildPublicAsyncWebhook,
	dispatchAsyncWebhookEventInBackground,
	parseAsyncWebhookConfig,
	toAsyncLifecycleStatus,
} from "@core/async-notifications";
import {
	buildUnsupportedBatchModePayload,
	listBatchProviderCapabilities,
	providerSupportsMultipleModelsPerBatch,
	resolveBatchPreviewProviderIds,
	resolveBatchInputMode,
	resolveBatchProvidersForMode,
	resolveBatchProvidersFromModel,
	resolveRequestedBatchProviders,
	type BatchInputMode,
} from "@core/batch-capabilities";
import {
	getBatchFileMeta,
	getBatchJobMeta,
	listTeamBatchJobs,
	resolveBatchProviderNativeId,
	saveBatchFileMeta,
	saveBatchJobMeta,
	setBatchJobStatus,
	type BatchJobMeta,
} from "@core/batch-jobs";
import {
	hashBatchRequestBody,
	listBatchRequestRows,
	saveBatchRequestRows,
	type BatchRequestRowInput,
} from "@core/batch-requests";
import { toProviderNativeBatchModelId } from "@core/batch-model-aliases";
import { finalizeBatchJob, type FinalizeBatchJobResult } from "@core/batch-finalization";
import { reserveBatchCredits } from "@core/batch-reservations";
import { fetchProviderFileText, parseProviderBatchInputEntries } from "@core/batch-provider-adapters";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { getBatchApiFeatureGateName, isBatchApiAccessEnabled } from "@core/feature-flags";
import { getWebhookEndpointSigningConfig } from "@core/webhook-endpoints";
import { filesRoutes as batchFilesRoutes } from "./files";
import { fetchCatalogue } from "../control/models.catalogue";

const OPENAI_PROVIDER_ID = "openai";
const ANTHROPIC_PROVIDER_ID = "anthropic";
const GOOGLE_AI_STUDIO_PROVIDER_ID = "google-ai-studio";
const MISTRAL_PROVIDER_ID = "mistral";
const X_AI_PROVIDER_ID = "x-ai";
const FILE_BACKED_JSONL_BATCH_PROVIDERS = new Set(["openai", "groq", "together"]);
const JSON_BATCH_CONTENT_TYPE = "application/json";
const MAX_BATCH_CUSTOM_ID_BYTES = 512;
const GATEWAY_BATCH_ID_PREFIX = "batch_";
const MAX_BATCH_CREATE_BODY_BYTES = 20 * 1024 * 1024;
const DEFAULT_BATCH_MAX_OUTPUT_TOKENS = 16_384;

function toText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function generateGatewayBatchId(): string {
	return `${GATEWAY_BATCH_ID_PREFIX}${generatePublicId().replace(/^G-/, "")}`;
}

function toJsonResponse(upstream: Response): Response {
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: upstream.headers,
	});
}

function toDecoratedJsonResponse(upstream: Response, payload: unknown): Response {
	const headers = new Headers(upstream.headers);
	headers.set("Content-Type", "application/json");
	return new Response(JSON.stringify(payload), {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

async function parseUpstreamJson(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
}

function jsonPayload(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function batchAsyncPersistenceFailureResponse(args: {
	message: string;
	batchId: string;
	nativeBatchId?: string | null;
	status?: string | null;
	reservationId?: string | null;
	reservationStatus?: string | null;
}): Response {
	return jsonPayload({
		error: {
			type: "async_job_persistence_failed",
			message: args.message,
			batch_id: args.batchId,
			native_batch_id: args.nativeBatchId ?? null,
			status: args.status ?? null,
			reservation_id: args.reservationId ?? null,
			reservation_status: args.reservationStatus ?? null,
		},
	}, 502);
}

function resolveBatchProviderForCurrentAdapter(args: {
	mode: BatchInputMode;
	provider: unknown;
	model?: unknown;
	modelProviders?: string[];
	inputFileProvider?: string | null;
}): { ok: true; providerId: string } | { ok: false; response: Response } {
	const requestedProviders = resolveRequestedBatchProviders(args.provider);
	const hasExplicitProvider =
		typeof args.provider === "string" ||
		(Boolean(args.provider) && typeof args.provider === "object" && !Array.isArray(args.provider));
	const inferredModelProviders = [...new Set(args.modelProviders ?? [])];
	if (!hasExplicitProvider && inferredModelProviders.length > 1) {
		return {
			ok: false,
			response: jsonPayload({
				error: {
					type: "not_implemented",
					reason: "batch_multi_provider_requests_not_supported",
					message: "Batch requests currently need to resolve to one provider. Submit one batch per provider while multi-provider batch fan-out is being implemented.",
					input_mode: args.mode,
					requested_providers: inferredModelProviders,
				},
			}, 501),
		};
	}
	const inferredProviders = hasExplicitProvider
		? requestedProviders
		: args.inputFileProvider
			? resolveRequestedBatchProviders(args.inputFileProvider)
			: inferredModelProviders.length > 0
				? inferredModelProviders
				: resolveBatchProvidersFromModel(args.model);
	const effectiveRequestedProviders = inferredProviders.length > 0 ? inferredProviders : requestedProviders;
	const providersForMode = resolveBatchProvidersForMode({
		mode: args.mode,
		requestedProviders: effectiveRequestedProviders,
	});
	if (providersForMode.length === 0) {
		return {
			ok: false,
			response: jsonPayload(buildUnsupportedBatchModePayload({
				mode: args.mode,
				requestedProviders: effectiveRequestedProviders,
			}), 400),
		};
	}
	const activeProvidersForMode = resolveBatchProvidersForMode({
		mode: args.mode,
		requestedProviders: effectiveRequestedProviders,
		activeOnly: true,
	});
	const previewProviderIds = resolveBatchPreviewProviderIds(getBindings().BATCH_API_PREVIEW_PROVIDERS);
	const previewProvidersForMode = activeProvidersForMode.filter((provider) => previewProviderIds.includes(provider.providerId));
	if (previewProvidersForMode.length > 0) {
		const openAi = previewProvidersForMode.find((provider) => provider.providerId === OPENAI_PROVIDER_ID);
		if (!hasExplicitProvider && openAi) return { ok: true, providerId: OPENAI_PROVIDER_ID };
		return { ok: true, providerId: previewProvidersForMode[0]!.providerId };
	}
	if (activeProvidersForMode.length > 0) {
		return {
			ok: false,
			response: jsonPayload({
				error: {
					type: "forbidden",
					reason: "batch_provider_preview_disabled",
					message: "The selected provider is not enabled for the current Batch API preview.",
					requested_providers: effectiveRequestedProviders,
					enabled_providers: previewProviderIds,
				},
			}, 403),
		};
	}
	return {
		ok: false,
		response: jsonPayload({
			error: {
				type: "not_implemented",
				reason: "batch_provider_adapter_not_ready",
				message: "This batch input mode is recognised, but the selected provider adapter is not enabled yet.",
				input_mode: args.mode,
				requested_providers: effectiveRequestedProviders,
				providers: providersForMode.map((provider) => ({
					id: provider.providerId,
					name: provider.displayName,
					status: provider.status,
					gateway_input_modes: provider.gatewayInputModes,
					native_input_modes: provider.nativeInputModes,
					documentation_url: provider.documentationUrl,
				})),
			},
		}, 501),
	};
}

type NormalizedBatchRequest = {
	customId: string;
	method: string;
	url: string;
	body: unknown;
	gatewayModel: string | null;
	index: number;
	requestBodyHash: string;
};

function defaultBatchEndpointForProvider(providerId: string): string {
	if (providerId === ANTHROPIC_PROVIDER_ID) return "/v1/messages";
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) return "/v1/generateContent";
	if (providerId === OPENAI_PROVIDER_ID || providerId === X_AI_PROVIDER_ID) return "/v1/responses";
	return "/v1/chat/completions";
}

function resolveBatchEndpoint(providerId: string, payload: Record<string, unknown>): string {
	return toText(payload.endpoint) ?? defaultBatchEndpointForProvider(providerId);
}

function providerNativeModelId(providerId: string, model: string): string {
	return toProviderNativeBatchModelId(providerId, model);
}

function requestValue(record: Record<string, unknown>, key: string, fallback: unknown): unknown {
	return record[key] !== undefined ? record[key] : fallback;
}

function buildMessages(prompt: string, system: string | null): Array<Record<string, string>> {
	return [
		...(system ? [{ role: "system", content: system }] : []),
		{ role: "user", content: prompt },
	];
}

function promptTextFromItem(value: unknown): string | null {
	if (typeof value === "string") return value.trim().length > 0 ? value : null;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	return toText(record.prompt) ?? toText(record.input) ?? toText(record.text) ?? toText(record.content);
}

function promptItemRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function buildBodyFromPromptItem(providerId: string, payload: Record<string, unknown>, raw: unknown): Record<string, unknown> {
	const record = promptItemRecord(raw);
	const explicitBody = record.body && typeof record.body === "object" && !Array.isArray(record.body)
		? record.body as Record<string, unknown>
		: record.request && typeof record.request === "object" && !Array.isArray(record.request)
			? record.request as Record<string, unknown>
			: null;
	const model = toText(record.model) ?? toText(payload.model);
	if (!model) throw new Error("missing_model");
	const nativeModel = providerNativeModelId(providerId, model);
	if (explicitBody) {
		return {
			...explicitBody,
			model: toText(explicitBody.model) ?? nativeModel,
		};
	}
	const prompt = promptTextFromItem(raw);
	const messages = Array.isArray(record.messages) ? record.messages : null;
	if (!prompt && !messages) throw new Error("invalid_prompt_item");
	const system = toText(record.system) ?? toText(payload.system);
	const maxTokens = requestValue(record, "max_tokens", payload.max_tokens);
	const maxOutputTokens = requestValue(record, "max_output_tokens", payload.max_output_tokens);
	const temperature = requestValue(record, "temperature", payload.temperature);
	const common = {
		...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
		...(temperature !== undefined ? { temperature } : {}),
	};
	if (providerId === ANTHROPIC_PROVIDER_ID) {
		return {
			model: nativeModel,
			...(system ? { system } : {}),
			max_tokens: maxTokens ?? 1024,
			messages: messages ?? [{ role: "user", content: prompt }],
			...(temperature !== undefined ? { temperature } : {}),
		};
	}
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		return {
			model: nativeModel,
			generationConfig: {
				...(maxOutputTokens !== undefined || maxTokens !== undefined
					? { maxOutputTokens: maxOutputTokens ?? maxTokens }
					: { maxOutputTokens: DEFAULT_BATCH_MAX_OUTPUT_TOKENS }),
				...(temperature !== undefined ? { temperature } : {}),
			},
			contents: messages
				? messages
				: [{ role: "user", parts: [{ text: prompt }] }],
		};
	}
	if (providerId === OPENAI_PROVIDER_ID || providerId === X_AI_PROVIDER_ID) {
		return {
			model: nativeModel,
			...(providerId === OPENAI_PROVIDER_ID
				? {
					...(maxOutputTokens !== undefined
						? { max_output_tokens: maxOutputTokens }
						: maxTokens !== undefined
							? { max_output_tokens: maxTokens }
							: {}),
					...(temperature !== undefined ? { temperature } : {}),
				}
				: common),
			...(messages ? { input: messages } : { input: prompt }),
		};
	}
	return {
		model: nativeModel,
		...common,
		messages: messages ?? buildMessages(prompt ?? "", system),
	};
}

function normalizeRequestBodyForProvider(providerId: string, body: unknown): unknown {
	if (!body || typeof body !== "object" || Array.isArray(body)) return body;
	const record = body as Record<string, unknown>;
	const model = toText(record.model);
	if (!model) return body;
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const generationConfig = record.generationConfig && typeof record.generationConfig === "object" && !Array.isArray(record.generationConfig)
			? record.generationConfig as Record<string, unknown>
			: record.generation_config && typeof record.generation_config === "object" && !Array.isArray(record.generation_config)
				? record.generation_config as Record<string, unknown>
				: {};
		return {
			...record,
			model: providerNativeModelId(providerId, model),
			generationConfig: {
				...generationConfig,
				maxOutputTokens: generationConfig.maxOutputTokens ?? generationConfig.max_output_tokens ?? record.max_output_tokens ?? record.max_tokens ?? DEFAULT_BATCH_MAX_OUTPUT_TOKENS,
			},
		};
	}
	const usesResponsesLimit = providerId === OPENAI_PROVIDER_ID || providerId === X_AI_PROVIDER_ID;
	return {
		...record,
		model: providerNativeModelId(providerId, model),
		...(usesResponsesLimit
			? { max_output_tokens: record.max_output_tokens ?? record.max_tokens ?? DEFAULT_BATCH_MAX_OUTPUT_TOKENS }
			: { max_tokens: record.max_tokens ?? record.max_output_tokens ?? DEFAULT_BATCH_MAX_OUTPUT_TOKENS }),
	};
}

async function normalizeBatchRequests(providerId: string, payload: Record<string, unknown>): Promise<NormalizedBatchRequest[]> {
	const endpoint = resolveBatchEndpoint(providerId, payload);
	const requests = Array.isArray(payload.requests) ? payload.requests : [];
	const promptItems = requests.length === 0
		? Array.isArray(payload.prompts)
			? payload.prompts
			: Array.isArray(payload.items)
				? payload.items
				: []
		: [];
	const out: NormalizedBatchRequest[] = [];
	for (let index = 0; index < requests.length; index += 1) {
		const raw = requests[index];
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new Error("invalid_request");
		}
		const record = raw as Record<string, unknown>;
		const body = record.body && typeof record.body === "object" && !Array.isArray(record.body)
			? record.body
			: record.request && typeof record.request === "object" && !Array.isArray(record.request)
				? record.request
				: null;
		if (!body) throw new Error("invalid_request_body");
		const customId = toText(record.custom_id) ?? toText(record.customId) ?? `request-${index + 1}`;
		const normalizedBody = normalizeRequestBodyForProvider(providerId, body);
		out.push({
			customId,
			method: (toText(record.method) ?? "POST").toUpperCase(),
			url: toText(record.url) ?? endpoint,
			body: normalizedBody,
			gatewayModel: toText((body as Record<string, unknown>).model) ?? toText(payload.model),
			index,
			requestBodyHash: await hashBatchRequestBody(normalizedBody),
		});
	}
	for (let index = 0; index < promptItems.length; index += 1) {
		const raw = promptItems[index];
		const record = promptItemRecord(raw);
		const body = buildBodyFromPromptItem(providerId, payload, raw);
		const customId = toText(record.custom_id) ?? toText(record.customId) ?? toText(record.id) ?? `request-${index + 1}`;
		const normalizedBody = normalizeRequestBodyForProvider(providerId, body);
		out.push({
			customId,
			method: (toText(record.method) ?? "POST").toUpperCase(),
			url: toText(record.url) ?? endpoint,
			body: normalizedBody,
			gatewayModel: toText((body as Record<string, unknown>).model) ?? toText(payload.model),
			index,
			requestBodyHash: await hashBatchRequestBody(normalizedBody),
		});
	}
	const seen = new Set<string>();
	for (const row of out) {
		if (new TextEncoder().encode(row.customId).byteLength > MAX_BATCH_CUSTOM_ID_BYTES) {
			throw new Error("batch_custom_id_too_long");
		}
		if (providerId === ANTHROPIC_PROVIDER_ID && !/^[a-zA-Z0-9_-]{1,64}$/.test(row.customId)) {
			throw new Error("anthropic_batch_custom_id_invalid");
		}
		if (seen.has(row.customId)) throw new Error("duplicate_custom_id");
		seen.add(row.customId);
	}
	return out;
}

function gatewayModelForBatchPolicy(providerId: string, value: unknown): string | null {
	const model = toText(value);
	if (!model) return null;
	if (model.includes("/")) return model;
	return `${providerId}/${model.replace(/^models\//i, "")}`;
}

function batchPolicyEndpoint(value: unknown): Endpoint {
	const path = (toText(value) ?? "/v1/responses")
		.replace(/^https?:\/\/[^/]+/i, "")
		.replace(/^\/v1(?=\/|$)/i, "")
		.toLowerCase();
	if (path === "/chat/completions") return "chat.completions";
	if (path === "/messages") return "messages";
	if (path === "/embeddings") return "embeddings";
	if (path === "/moderations") return "moderations";
	if (path === "/images/generations") return "images.generations";
	if (path === "/images/edits") return "images.edits";
	if (path === "/audio/speech") return "audio.speech";
	if (path === "/audio/transcriptions") return "audio.transcription";
	if (path === "/audio/translations") return "audio.translations";
	if (path === "/rerank") return "rerank";
	if (path === "/videos" || path === "/video/generations") return "video.generation";
	return "responses";
}

async function validateBatchRequestPolicies(args: {
	auth: AuthSuccess;
	providerId: string;
	requestId: string;
	rows: NormalizedBatchRequest[];
	allowMutation: boolean;
}): Promise<Response | null> {
	let workspacePolicy: Awaited<ReturnType<typeof fetchWorkspacePolicy>>;
	try {
		workspacePolicy = await fetchWorkspacePolicy({
			workspaceId: args.auth.workspaceId,
			apiKeyId: args.auth.apiKeyId,
		});
	} catch (error) {
		console.error("batch_workspace_policy_fetch_failed", {
			error,
			workspaceId: args.auth.workspaceId,
			requestId: args.requestId,
		});
		return err("gateway_error", {
			reason: "workspace_policy_fetch_failed",
			request_id: args.requestId,
			workspace_id: args.auth.workspaceId,
		});
	}

	const contextByRoute = new Map<string, Extract<Awaited<ReturnType<typeof guardContext>>, { ok: true }>["value"]>();
	for (const row of args.rows) {
		if (!row.body || typeof row.body !== "object" || Array.isArray(row.body)) {
			return err("validation_error", {
				reason: "invalid_request_body",
				request_id: args.requestId,
				workspace_id: args.auth.workspaceId,
			});
		}
		const gatewayModel = gatewayModelForBatchPolicy(
			args.providerId,
			row.gatewayModel ?? (row.body as Record<string, unknown>).model,
		);
		if (!gatewayModel) {
			return err("validation_error", {
				reason: "batch_model_required_for_policy_enforcement",
				request_id: args.requestId,
				workspace_id: args.auth.workspaceId,
			});
		}
		const endpoint = batchPolicyEndpoint(row.url);
		const capability = resolveCapabilityFromEndpoint(endpoint);
		const routeKey = `${capability}:${gatewayModel}`;
		let guarded = contextByRoute.get(routeKey);
		if (!guarded) {
			const result = await guardContext({
				workspaceId: args.auth.workspaceId,
				apiKeyId: args.auth.apiKeyId,
				endpoint,
				capability,
				model: gatewayModel,
				requestId: args.requestId,
				internal: args.auth.internal,
				disableCache: true,
			});
			if (result.ok === false) return result.response;
			guarded = result.value;
			contextByRoute.set(routeKey, guarded);
		}

		const policyResult = applyWorkspacePolicy({
			providers: guarded.providers,
			resolvedModel: guarded.resolvedModel ?? gatewayModel,
			body: row.body,
			workspacePolicy,
			teamSettings: guarded.context.teamSettings ?? null,
		});
		let policyReason: string | null = null;
		if (policyResult.ok === false) {
			policyReason = `batch_${policyResult.reason}`;
		} else if (!policyResult.providers.some((provider) => provider.providerId === args.providerId)) {
			policyReason = "batch_provider_not_allowed";
		}
		if (policyReason) {
			return err("validation_error", {
				reason: policyReason,
				model: gatewayModel,
				provider: args.providerId,
				request_id: args.requestId,
				workspace_id: args.auth.workspaceId,
			});
		}

		const beforeBody = JSON.stringify(row.body);
		const promptResult = applyPromptInjectionGuardrails({
			body: row.body,
			rawBody: row.body,
			endpoint,
			workspacePolicy,
			requestId: args.requestId,
			workspaceId: args.auth.workspaceId,
		});
		if (promptResult.ok === false) return promptResult.response;
		const sensitiveResult = applySensitiveInfoGuardrails({
			body: promptResult.body,
			rawBody: promptResult.rawBody,
			endpoint,
			workspacePolicy,
			requestId: args.requestId,
			workspaceId: args.auth.workspaceId,
			existingEnforcement: promptResult.enforcement,
		});
		if (sensitiveResult.ok === false) return sensitiveResult.response;
		const afterBody = JSON.stringify(sensitiveResult.body);
		if (!args.allowMutation && beforeBody !== afterBody) {
			return err("validation_error", {
				reason: "batch_file_guardrail_redaction_not_supported",
				message: "This key requires request redaction. Submit requests inline so the gateway can safely transform them before upload.",
				request_id: args.requestId,
				workspace_id: args.auth.workspaceId,
			});
		}
		if (args.allowMutation && beforeBody !== afterBody) {
			row.body = sensitiveResult.body;
			row.requestBodyHash = await hashBatchRequestBody(row.body);
		}
	}
	return null;
}

function toProviderJsonl(providerId: string, rows: NormalizedBatchRequest[]): string {
	return rows
		.map((row) => {
			if (providerId === "together" || providerId === MISTRAL_PROVIDER_ID) {
				return JSON.stringify({
					custom_id: row.customId,
					...(row.method !== "POST" ? { method: row.method } : {}),
					body: row.body,
				});
			}
			return JSON.stringify({
				custom_id: row.customId,
				method: row.method,
				url: row.url,
				body: row.body,
			});
		})
		.join("\n");
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function providerCount(value: unknown): number {
	return toFiniteNumber(value) ?? 0;
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
	const pending = toFiniteNumber((state as any).num_pending);
	if (pending != null && pending > 0) return "in_progress";
	const total = toFiniteNumber((state as any).num_requests);
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

function normalizeProviderStatus(providerId: string, raw: unknown, payload?: any): string | null {
	const status = toText(raw)?.toLowerCase();
	if (providerId === MISTRAL_PROVIDER_ID) {
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
	if (providerId === ANTHROPIC_PROVIDER_ID) {
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
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const state = status ?? toText(payload?.metadata?.state)?.toLowerCase() ?? toText(payload?.response?.state)?.toLowerCase();
		switch (state) {
			case "batch_state_pending":
			case "job_state_pending":
				return "pending";
			case "batch_state_running":
			case "job_state_running":
				return "in_progress";
			case "batch_state_succeeded":
			case "job_state_succeeded":
				return "completed";
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
	if (providerId === X_AI_PROVIDER_ID) {
		if (status) return status === "canceled" ? "cancelled" : status;
		return normalizeXAiStateStatus(payload);
	}
	if (status === "canceled") return "cancelled";
	return status;
}

function extractProviderBatchId(providerId: string, payload: any): { publicId: string | null; nativeId: string | null } {
	const native =
		toText(payload?.native_batch_id) ??
		toText(payload?.name) ??
		toText(payload?.batch?.name) ??
		toText(payload?.response?.name) ??
		toText(payload?.batch_id) ??
		toText(payload?.id);
	if (!native) return { publicId: null, nativeId: null };
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID && native.includes("/")) {
		return { publicId: native.split("/").filter(Boolean).pop() ?? native, nativeId: native };
	}
	return { publicId: native, nativeId: native };
}

function normalizeProviderBatchPayload(providerId: string, payload: any): any {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const ids = extractProviderBatchId(providerId, payload);
	const status = normalizeProviderStatus(
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
	if (providerId === MISTRAL_PROVIDER_ID) {
		const inputFile = Array.isArray(payload.input_files) ? toText(payload.input_files[0]) : null;
		out.input_file_id = inputFile ?? toText(payload.input_file_id) ?? null;
		out.output_file_id = toText(payload.output_file) ?? toText(payload.output_file_id) ?? null;
		out.error_file_id = toText(payload.error_file) ?? toText(payload.error_file_id) ?? null;
		out.request_counts = {
			total: toFiniteNumber(payload.total_requests),
			completed: toFiniteNumber(payload.succeeded_requests ?? payload.completed_requests),
			failed: toFiniteNumber(payload.failed_requests),
		};
	}
	if (providerId === ANTHROPIC_PROVIDER_ID) {
		const counts = payload.request_counts && typeof payload.request_counts === "object" ? payload.request_counts : {};
		const total =
			(toFiniteNumber((counts as any).processing) ?? 0) +
			(toFiniteNumber((counts as any).succeeded) ?? 0) +
			(toFiniteNumber((counts as any).errored) ?? 0) +
			(toFiniteNumber((counts as any).canceled) ?? 0) +
			(toFiniteNumber((counts as any).expired) ?? 0);
		out.request_counts = {
			total,
			completed: toFiniteNumber((counts as any).succeeded),
			failed:
				(toFiniteNumber((counts as any).errored) ?? 0) +
				(toFiniteNumber((counts as any).canceled) ?? 0) +
				(toFiniteNumber((counts as any).expired) ?? 0),
		};
	}
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const batch = payload.response && typeof payload.response === "object" ? payload.response : payload.metadata ?? payload;
		const stats = batch?.batchStats ?? payload.metadata?.batchStats;
		out.request_counts = {
			total: toFiniteNumber(stats?.requestCount),
			completed: toFiniteNumber(stats?.successfulRequestCount),
			failed: toFiniteNumber(stats?.failedRequestCount),
		};
	}
	if (providerId === X_AI_PROVIDER_ID) {
		out.request_counts = {
			total: toFiniteNumber(payload.state?.num_requests),
			completed: toFiniteNumber(payload.state?.num_success),
			failed: toFiniteNumber(payload.state?.num_error),
		};
	}
	return out;
}

function buildProviderBaseUrl(providerId: string, bindings: Record<string, string | undefined>): string {
	if (providerId === ANTHROPIC_PROVIDER_ID) return String(bindings.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "");
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) return String(bindings.GOOGLE_AI_STUDIO_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
	return "";
}

async function fetchProviderBatchApi(providerId: string, args: {
	endpointPath: string;
	method: string;
	body?: BodyInit | null;
	contentType?: string | null;
	idempotencyKey?: string | null;
}): Promise<Response> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	if (providerId === ANTHROPIC_PROVIDER_ID) {
		const keyInfo = resolveProviderKey(
			{ providerId, byokMeta: [] },
			() => bindings.ANTHROPIC_API_KEY,
		);
		const headers = new Headers({
			"x-api-key": keyInfo.key,
			"anthropic-version": "2023-06-01",
			"Content-Type": args.contentType ?? JSON_BATCH_CONTENT_TYPE,
		});
		if (args.idempotencyKey) headers.set("Idempotency-Key", args.idempotencyKey);
		return fetch(`${buildProviderBaseUrl(providerId, bindings)}${args.endpointPath}`, {
			method: args.method,
			headers,
			body: args.body ?? undefined,
		});
	}
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const key = bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GEMINI_API_KEY;
		if (!key) {
			return jsonPayload({ error: { type: "upstream_error", reason: "google_ai_studio_key_missing" } }, 502);
		}
		const headers = new Headers({
			"x-goog-api-key": key,
			"Content-Type": args.contentType ?? JSON_BATCH_CONTENT_TYPE,
		});
		if (args.idempotencyKey) headers.set("Idempotency-Key", args.idempotencyKey);
		return fetch(`${buildProviderBaseUrl(providerId, bindings)}${args.endpointPath}`, {
			method: args.method,
			headers,
			body: args.body ?? undefined,
		});
	}

	const keyInfo = resolveOpenAICompatKey({ providerId, byokMeta: [] } as any);
	const headers = new Headers(openAICompatHeaders(providerId, keyInfo.key));
	if (args.contentType) headers.set("Content-Type", args.contentType);
	if (!args.contentType) headers.delete("Content-Type");
	if (args.idempotencyKey) headers.set("Idempotency-Key", args.idempotencyKey);
	return fetch(openAICompatUrl(providerId, args.endpointPath), {
		method: args.method,
		headers,
		body: args.body ?? undefined,
	});
}

async function requireBatchApiAccess(auth: AuthSuccess, requestId: string): Promise<Response | null> {
	if (await isBatchApiAccessEnabled(auth)) return null;
	return jsonPayload({
		error: "forbidden",
		reason: "batch_api_feature_flag_disabled",
		message: "The Batch API is currently limited to the enabled Statsig admin segment.",
		feature_gate: getBatchApiFeatureGateName(),
		request_id: requestId,
		workspace_id: auth.workspaceId,
		status_code: 403,
		error_type: "user",
		error_origin: "gateway",
		generation_id: requestId,
	}, 403);
}

async function uploadProviderBatchInputFile(providerId: string, args: {
	requestId: string;
	rows: NormalizedBatchRequest[];
}): Promise<{ ok: true; fileId: string; payload: any } | { ok: false; response: Response }> {
	const form = new FormData();
	form.append("purpose", providerId === "together" ? "batch-api" : "batch");
	form.append(
		"file",
		new Blob([toProviderJsonl(providerId, args.rows)], { type: "application/jsonl" }),
		`aistats-batch-${args.requestId}.jsonl`,
	);
	const upstream = await fetchProviderBatchApi(providerId, {
		endpointPath: "/files",
		method: "POST",
		body: form,
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	if (!upstream.ok) return { ok: false, response: toJsonResponse(upstream) };
	const fileId = toText(upstreamJson?.id);
	if (!fileId) {
		return {
			ok: false,
			response: jsonPayload({
				error: {
					type: "upstream_error",
					reason: "batch_file_upload_missing_id",
				},
			}, 502),
		};
	}
	return { ok: true, fileId, payload: upstreamJson };
}

function normalizeGeminiModelName(value: unknown): string | null {
	const model = toText(value);
	if (!model) return null;
	return model.startsWith("models/") ? model : `models/${model.split("/").pop() ?? model}`;
}

function extractBatchModel(payload: Record<string, unknown>, rows: NormalizedBatchRequest[] | null): string | null {
	return toText(payload.model) ?? toText((rows?.[0]?.body as any)?.model);
}

function extractRawBatchModel(payload: Record<string, unknown>): string | null {
	const fromPayload = toText(payload.model);
	if (fromPayload) return fromPayload;
	const rows = [
		...(Array.isArray(payload.requests) ? payload.requests : []),
		...(Array.isArray(payload.prompts) ? payload.prompts : []),
		...(Array.isArray(payload.items) ? payload.items : []),
	];
	for (const request of rows) {
		if (!request || typeof request !== "object" || Array.isArray(request)) continue;
		const rowModel = toText((request as Record<string, unknown>).model);
		if (rowModel) return rowModel;
		const body = (request as Record<string, unknown>).body;
		if (!body || typeof body !== "object" || Array.isArray(body)) continue;
		const model = toText((body as Record<string, unknown>).model);
		if (model) return model;
	}
	return null;
}

function extractRawBatchModels(payload: Record<string, unknown>): string[] {
	const out: string[] = [];
	const fromPayload = toText(payload.model);
	if (fromPayload) out.push(fromPayload);
	const rows = [
		...(Array.isArray(payload.requests) ? payload.requests : []),
		...(Array.isArray(payload.prompts) ? payload.prompts : []),
		...(Array.isArray(payload.items) ? payload.items : []),
	];
	for (const request of rows) {
		if (!request || typeof request !== "object" || Array.isArray(request)) continue;
		const record = request as Record<string, unknown>;
		const rowModel = toText(record.model);
		if (rowModel) out.push(rowModel);
		const body =
			record.body && typeof record.body === "object" && !Array.isArray(record.body)
				? record.body as Record<string, unknown>
				: record.request && typeof record.request === "object" && !Array.isArray(record.request)
					? record.request as Record<string, unknown>
					: null;
		const bodyModel = toText(body?.model);
		if (bodyModel) out.push(bodyModel);
	}
	return [...new Set(out)];
}

function resolveBatchProvidersFromModels(models: string[]): string[] {
	return [...new Set(models.flatMap((model) => resolveBatchProvidersFromModel(model)))];
}

function validateProviderNativeBatchModelScope(args: {
	providerId: string;
	payload: Record<string, unknown>;
	inputMode: BatchInputMode;
	requestId: string;
	workspaceId: string;
}): Response | null {
	if (args.inputMode !== "requests") return null;
	if (providerSupportsMultipleModelsPerBatch(args.providerId)) return null;
	const rawModels = extractRawBatchModels(args.payload);
	const nativeModels = [...new Set(rawModels.map((model) => providerNativeModelId(args.providerId, model)))];
	if (nativeModels.length <= 1) return null;
	return err("validation_error", {
		reason: "batch_multiple_models_not_supported",
		message: "The selected provider does not support multiple models in one native batch. Submit one batch per model.",
		request_id: args.requestId,
		workspace_id: args.workspaceId,
		provider: args.providerId,
		models: rawModels,
		native_models: nativeModels,
	});
}

function completionWindowToHours(value: unknown): number | null {
	const text = toText(value);
	if (!text) return null;
	const match = text.match(/^(\d+)\s*h(?:ours?)?$/i);
	if (match) return Number(match[1]);
	const numeric = Number(text);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildProviderBatchCreate(providerId: string, args: {
	payload: Record<string, unknown>;
	upstreamPayload: Record<string, unknown>;
	inputMode: BatchInputMode;
	requestRows: NormalizedBatchRequest[] | null;
}): { endpointPath: string; body: Record<string, unknown>; followup?: { endpointPath: string; body: Record<string, unknown> } } {
	if (FILE_BACKED_JSONL_BATCH_PROVIDERS.has(providerId)) {
		return { endpointPath: "/batches", body: args.upstreamPayload };
	}
	if (providerId === MISTRAL_PROVIDER_ID) {
		const model = extractBatchModel(args.payload, args.requestRows);
		const body: Record<string, unknown> = {
			endpoint: toText(args.payload.endpoint) ?? "/v1/chat/completions",
			...(model ? { model: providerNativeModelId(providerId, model) } : {}),
			...(args.payload.metadata && typeof args.payload.metadata === "object" && !Array.isArray(args.payload.metadata)
				? { metadata: args.payload.metadata }
				: {}),
			...(completionWindowToHours(args.payload.completion_window)
				? { timeout_hours: completionWindowToHours(args.payload.completion_window) }
				: {}),
		};
		if (args.inputMode === "file") {
			body.input_files = [toText(args.payload.input_file_id)];
		} else {
			body.requests = (args.requestRows ?? []).map((row) => ({
				custom_id: row.customId,
				body: row.body,
			}));
		}
		return { endpointPath: "/batch/jobs", body };
	}
	if (providerId === ANTHROPIC_PROVIDER_ID) {
		return {
			endpointPath: "/messages/batches",
			body: {
				requests: (args.requestRows ?? []).map((row) => ({
					custom_id: row.customId,
					params: row.body,
				})),
			},
		};
	}
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const model = normalizeGeminiModelName(extractBatchModel(args.payload, args.requestRows));
		if (!model) throw new Error("missing_model");
		const modelPath = model.split("/").map(encodeURIComponent).join("/");
		return {
			endpointPath: `/${modelPath}:batchGenerateContent`,
			body: {
				batch: {
					model,
				displayName:
					toText(args.payload.metadata && (args.payload.metadata as any).display_name) ??
					`phaseo-${toText(args.payload.metadata && (args.payload.metadata as any).phaseo_batch_id) ?? Date.now()}`,
					inputConfig: {
						requests: {
							requests: (args.requestRows ?? []).map((row) => ({
								request: {
									...(row.body as Record<string, unknown>),
									model,
								},
								metadata: { custom_id: row.customId },
							})),
						},
					},
				},
			},
		};
	}
	if (providerId === X_AI_PROVIDER_ID) {
		return {
			endpointPath: "/batches",
			body: {
				name:
					toText(args.payload.metadata && (args.payload.metadata as any).name) ??
					`phaseo-${toText(args.payload.metadata && (args.payload.metadata as any).phaseo_batch_id) ?? Date.now()}`,
			},
			followup: {
				endpointPath: "",
				body: {
					batch_requests: (args.requestRows ?? []).map((row) => ({
						batch_request_id: row.customId,
						batch_request: {
							responses: row.body,
						},
					})),
				},
			},
		};
	}
	return { endpointPath: "/batches", body: args.upstreamPayload };
}

function buildProviderRetrievePath(providerId: string, nativeBatchId: string): string {
	if (providerId === MISTRAL_PROVIDER_ID) return `/batch/jobs/${encodeURIComponent(nativeBatchId)}`;
	if (providerId === ANTHROPIC_PROVIDER_ID) return `/messages/batches/${encodeURIComponent(nativeBatchId)}`;
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const name = nativeBatchId.includes("/") ? nativeBatchId : `batches/${nativeBatchId}`;
		return `/${name.split("/").map(encodeURIComponent).join("/")}`;
	}
	return `/batches/${encodeURIComponent(nativeBatchId)}`;
}

function buildProviderCancelPath(providerId: string, nativeBatchId: string): string {
	if (providerId === MISTRAL_PROVIDER_ID) return `/batch/jobs/${encodeURIComponent(nativeBatchId)}/cancel`;
	if (providerId === ANTHROPIC_PROVIDER_ID) return `/messages/batches/${encodeURIComponent(nativeBatchId)}/cancel`;
	if (providerId === X_AI_PROVIDER_ID) return `/batches/${encodeURIComponent(nativeBatchId)}:cancel`;
	if (providerId === GOOGLE_AI_STUDIO_PROVIDER_ID) {
		const name = nativeBatchId.includes("/") ? nativeBatchId : `batches/${nativeBatchId}`;
		return `/${name.split("/").map(encodeURIComponent).join("/")}:cancel`;
	}
	return `/batches/${encodeURIComponent(nativeBatchId)}/cancel`;
}

function batchMetaFromPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = toText(payload?.id);
	const nativeId = toText(payload?.native_batch_id) ?? id;
	return {
		...base,
		status: toText(payload?.status) ?? base.status ?? null,
		model: toText(payload?.model) ?? base.model ?? null,
		nativeBatchId: nativeId ?? base.nativeBatchId ?? null,
		endpoint: toText(payload?.endpoint) ?? base.endpoint ?? null,
		completionWindow: toText(payload?.completion_window) ?? base.completionWindow ?? null,
		inputFileId: toText(payload?.input_file_id) ?? base.inputFileId ?? null,
		outputFileId: toText(payload?.output_file_id) ?? base.outputFileId ?? null,
		errorFileId: toText(payload?.error_file_id) ?? base.errorFileId ?? null,
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

function buildBatchPricingLines(meta: BatchJobMeta | null | undefined): Record<string, unknown>[] {
	const lines = (meta?.pricedUsage as any)?.pricing?.lines;
	if (Array.isArray(lines)) {
		return lines.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object");
	}
	const totalNanos = typeof meta?.costNanos === "number" ? meta.costNanos : null;
	if (totalNanos == null) return [];
	return [
		{
			dimension: "batch_requests",
			pricing_plan: "batch",
			service_tier: "batch",
			endpoint: meta?.endpoint ?? null,
			units:
				typeof meta?.requestCounts?.completed === "number"
					? meta.requestCounts.completed
					: typeof meta?.requestCounts?.total === "number"
						? meta.requestCounts.total
						: null,
			total_nanos: totalNanos,
			total_usd_str:
				typeof meta?.costUsd === "number"
					? meta.costUsd.toFixed(9)
					: typeof (meta?.pricingBreakdown as any)?.total_usd_str === "string"
						? (meta?.pricingBreakdown as any).total_usd_str
						: null,
		},
	];
}

function buildBatchBilling(
	meta: BatchJobMeta | null | undefined,
	finalization?: FinalizeBatchJobResult | null,
): Record<string, unknown> | null {
	const hasStoredBilling =
		typeof meta?.charged === "boolean" ||
		typeof meta?.billingReason === "string" ||
		typeof meta?.costNanos === "number" ||
		typeof meta?.costUsd === "number" ||
		typeof meta?.finalizedAt === "string" ||
		Boolean(meta?.pricingBreakdown);
	if (!hasStoredBilling && !finalization) return null;
	return {
		billed:
			typeof finalization?.billed === "boolean"
				? finalization.billed
				: typeof meta?.finalizedAt === "string" || typeof meta?.billingReason === "string",
		charged: typeof finalization?.charged === "boolean" ? finalization.charged : Boolean(meta?.charged),
		reason: finalization?.reason ?? meta?.billingReason ?? null,
		cost_nanos: typeof meta?.costNanos === "number" ? meta.costNanos : null,
		cost_usd: typeof meta?.costUsd === "number" ? meta.costUsd : null,
		finalized_at: meta?.finalizedAt ?? null,
		pricing_breakdown:
			meta?.pricingBreakdown && typeof meta.pricingBreakdown === "object" && !Array.isArray(meta.pricingBreakdown)
				? meta.pricingBreakdown
				: null,
	};
}

function buildBatchPollingUrl(requestUrl: string, batchId: string): string {
	const url = new URL(requestUrl);
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments[segments.length - 1] === "cancel") {
		segments.pop();
	}
	if (segments[segments.length - 1] !== batchId) {
		segments.push(batchId);
	}
	url.pathname = `/${segments.join("/")}`;
	url.search = "";
	url.hash = "";
	return url.toString();
}

function buildBatchCancelUrl(requestUrl: string, batchId: string): string {
	return new URL(`${buildBatchPollingUrl(requestUrl, batchId).replace(/\/+$/, "")}/cancel`).toString();
}

function isCancellableBatchStatus(status: string): boolean {
	switch (status.toLowerCase()) {
		case "queued":
		case "pending":
		case "validating":
		case "in_progress":
		case "cancelling":
			return true;
		default:
			return false;
	}
}

function decorateBatchPayload(args: {
	requestUrl: string;
	payload: any;
	meta: BatchJobMeta | null | undefined;
	finalization?: FinalizeBatchJobResult | null;
	publicBatchId?: string | null;
}): Record<string, unknown> {
	const out: Record<string, unknown> =
		args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
			? { ...args.payload }
			: {};
	const publicBatchId = toText(args.publicBatchId);
	if (publicBatchId) out.id = publicBatchId;
	if (args.meta?.requestId) out.request_id = args.meta.requestId;
	if (args.meta?.provider) out.provider = args.meta.provider;
	if (args.meta?.sessionId) out.session_id = args.meta.sessionId;
	if (args.meta?.webhook && typeof args.meta.webhook === "object" && !Array.isArray(args.meta.webhook)) {
		const webhook = buildPublicAsyncWebhook("batch", args.meta);
		if (webhook) out.webhook = webhook;
	}
	const status = toText(out.status) ?? args.meta?.status ?? null;
	if (status) {
		out.lifecycle_status = toAsyncLifecycleStatus(status);
	}
	if (publicBatchId) {
		out.polling_url = buildBatchPollingUrl(args.requestUrl, publicBatchId);
		out.cancel_url = status && isCancellableBatchStatus(status) ? buildBatchCancelUrl(args.requestUrl, publicBatchId) : null;
	}
	out.pricing_lines = buildBatchPricingLines(args.meta);
	const billing = buildBatchBilling(args.meta, args.finalization);
	if (billing) {
		out.billing = billing;
	}
	return out;
}

export function splitGatewayBatchCreatePayload(payload: Record<string, unknown>): {
	upstreamPayload: Record<string, unknown>;
	webhook: Record<string, unknown> | null;
	invalidWebhook: boolean;
} {
	const upstreamPayload = { ...payload };
	const hasWebhook = Object.prototype.hasOwnProperty.call(upstreamPayload, "webhook");
	const rawWebhook = upstreamPayload.webhook;
	delete upstreamPayload.webhook;
	delete upstreamPayload.webhook_endpoint_id;
	delete upstreamPayload.requests;
	delete upstreamPayload.prompts;
	delete upstreamPayload.items;
	delete upstreamPayload.system;
	delete upstreamPayload.max_tokens;
	delete upstreamPayload.temperature;
	delete upstreamPayload.session_id;
	delete upstreamPayload.sessionId;
	delete upstreamPayload.provider;
	delete upstreamPayload.model;
	const webhook =
		rawWebhook && typeof rawWebhook === "object" && !Array.isArray(rawWebhook)
			? (rawWebhook as Record<string, unknown>)
			: typeof payload.webhook_endpoint_id === "string" && payload.webhook_endpoint_id.trim().length > 0
				? { endpoint_id: payload.webhook_endpoint_id }
				: null;
	return {
		upstreamPayload,
		webhook,
		invalidWebhook: hasWebhook && rawWebhook != null && !webhook,
	};
}

function validateBatchWebhookConfig(args: {
	webhook: Record<string, unknown> | null;
	requestId: string;
	workspaceId: string;
}): Response | null {
	if (!args.webhook) return null;
	const endpointId = toText(args.webhook.endpoint_id) ?? toText(args.webhook.endpointId);
	if (endpointId) return null;
	return err("validation_error", {
		reason: "batch_webhook_endpoint_required",
		message: "Batch webhooks must use a managed webhook_endpoint_id so the signing secret stays encrypted and rotatable.",
		request_id: args.requestId,
		workspace_id: args.workspaceId,
	});
}

async function validateBatchWebhookEndpointOwnership(args: {
	webhook: Record<string, unknown> | null;
	requestId: string;
	workspaceId: string;
}): Promise<Response | null> {
	if (!args.webhook) return null;
	const endpointId = toText(args.webhook.endpoint_id) ?? toText(args.webhook.endpointId);
	if (!endpointId) return null;
	const endpoint = await getWebhookEndpointSigningConfig({
		workspaceId: args.workspaceId,
		endpointId,
	});
	if (endpoint) return null;
	return err("validation_error", {
		reason: "batch_webhook_endpoint_not_found_or_inactive",
		message: "The webhook_endpoint_id must reference an active webhook endpoint in this workspace.",
		request_id: args.requestId,
		workspace_id: args.workspaceId,
		webhook_endpoint_id: endpointId,
	});
}

async function persistBatchFileOwnership(workspaceId: string, providerId: string, payload: any): Promise<void> {
	const outputFileId = toText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(workspaceId, outputFileId, {
			provider: providerId,
			status: "available",
		});
	}
	const errorFileId = toText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(workspaceId, errorFileId, {
			provider: providerId,
			status: "available",
		});
	}
}

function parseBatchListLimit(url: URL): number {
	const raw = Number(url.searchParams.get("limit") ?? "");
	if (!Number.isFinite(raw)) return 20;
	return Math.max(1, Math.min(100, Math.trunc(raw)));
}

function parseBatchListStatuses(url: URL): string[] {
	const values = [
		...url.searchParams.getAll("status"),
		...String(url.searchParams.get("statuses") ?? "").split(","),
	].map((value) => value.trim().toLowerCase()).filter(Boolean);
	const statuses = values.flatMap((value) => {
		switch (value) {
			case "queued":
			case "pending":
				return ["pending", "queued", "validating"];
			case "running":
			case "in_progress":
			case "processing":
				return ["in_progress", "finalizing", "cancelling"];
			case "cancelled":
			case "canceled":
				return ["cancelled", "canceled"];
			case "completed":
			case "failed":
			case "expired":
				return [value];
			default:
				return [];
		}
	});
	return [...new Set(statuses)];
}

function parseModelQueryValues(url: URL, name: string): string[] {
	return [...new Set(url.searchParams.getAll(name).flatMap((value) =>
		value.split(",").map((part) => part.trim()).filter(Boolean),
	))];
}

async function handleList(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		return err("unauthorised", { reason: (auth as AuthFailure).reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const url = new URL(req.url);
	const limit = parseBatchListLimit(url);
	const statuses = parseBatchListStatuses(url);
	const records = await listTeamBatchJobs({
		workspaceId: auth.workspaceId,
		limit,
		statuses: statuses.length > 0 ? statuses : undefined,
	});
	const data = records.map((record) => decorateBatchPayload({
		requestUrl: req.url,
		publicBatchId: record.batchId,
		meta: record.meta,
		payload: {
			id: record.batchId,
			object: "batch",
			status: record.status ?? record.meta?.status ?? "pending",
			endpoint: record.meta?.endpoint ?? null,
			completion_window: record.meta?.completionWindow ?? null,
			input_file_id: record.meta?.inputFileId ?? null,
			output_file_id: record.meta?.outputFileId ?? null,
			error_file_id: record.meta?.errorFileId ?? null,
			request_counts: record.meta?.requestCounts ?? null,
			created_at: record.createdAt,
			updated_at: record.updatedAt,
		},
	}));
	return jsonPayload({
		object: "list",
		data,
		first_id: typeof data[0]?.id === "string" ? data[0].id : null,
		last_id: typeof data[data.length - 1]?.id === "string" ? data[data.length - 1].id : null,
		has_more: false,
	});
}

async function handleModels(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		return err("unauthorised", { reason: (auth as AuthFailure).reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const url = new URL(req.url);
	const catalogue = await fetchCatalogue({
		endpoints: ["batch"],
		params: parseModelQueryValues(url, "params"),
		statuses: ["active"],
	});
	const previewProviderIds = resolveBatchPreviewProviderIds(getBindings().BATCH_API_PREVIEW_PROVIDERS);
	const previewCatalogue = catalogue
		.map((model) => ({
			...model,
			providers: model.providers.filter((provider) => previewProviderIds.includes(provider.api_provider_id)),
		}))
		.filter((model) => model.providers.length > 0);
	return jsonPayload({
		object: "list",
		data: previewCatalogue.map((model) => ({
			model: model.model_id,
			name: model.name,
			status: model.status,
			input_types: model.input_types,
			output_types: model.output_types,
			supported_params: model.supported_params,
			supported_parameters: model.supported_params,
			supported_params_detail: model.supported_params_detail,
			supported_parameters_detail: model.supported_params_detail,
			providers: model.providers.map((provider) => ({
				id: provider.api_provider_id,
				supported_params: provider.params,
				supported_parameters: provider.params,
				supported_params_detail: provider.params_detail,
				supported_parameters_detail: provider.params_detail,
			})),
			pricing: model.pricing,
		})),
	});
}

async function handleCreate(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;

	const declaredLength = Number(req.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BATCH_CREATE_BODY_BYTES) {
		return jsonPayload({ error: { type: "validation_error", reason: "batch_body_too_large" } }, 413);
	}
	const rawBody = await req.text();
	if (new TextEncoder().encode(rawBody).byteLength > MAX_BATCH_CREATE_BODY_BYTES) {
		return jsonPayload({ error: { type: "validation_error", reason: "batch_body_too_large" } }, 413);
	}
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return err("invalid_json", {
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const { upstreamPayload, webhook, invalidWebhook } = splitGatewayBatchCreatePayload(payload);
	if (invalidWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const webhookConfigError = validateBatchWebhookConfig({
		webhook,
		requestId,
		workspaceId: auth.workspaceId,
	});
	if (webhookConfigError) return webhookConfigError;
	const webhookEndpointError = await validateBatchWebhookEndpointOwnership({
		webhook,
		requestId,
		workspaceId: auth.workspaceId,
	});
	if (webhookEndpointError) return webhookEndpointError;
	const inputMode = resolveBatchInputMode(payload);
	if (inputMode.ok === false) {
		return err("validation_error", {
			reason: inputMode.reason,
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const normalizedWebhook = webhook ? parseAsyncWebhookConfig("batch", webhook) : null;
	if (webhook && !normalizedWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const directInputFileId = inputMode.mode === "file" ? toText(payload.input_file_id) : null;
	let ownedInputFile: Awaited<ReturnType<typeof getBatchFileMeta>> = null;
	if (directInputFileId) {
		try {
			ownedInputFile = await getBatchFileMeta(auth.workspaceId, directInputFileId);
		} catch (lookupErr) {
			console.error("batch_input_file_meta_lookup_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				fileId: directInputFileId,
			});
			return err("gateway_error", {
				reason: "batch_input_file_lookup_failed",
				request_id: requestId,
				workspace_id: auth.workspaceId,
				file_id: directInputFileId,
			});
		}
		if (!ownedInputFile) {
			return err("not_found", {
				reason: "batch_input_file_not_found_or_not_owned",
				request_id: requestId,
				workspace_id: auth.workspaceId,
				file_id: directInputFileId,
			});
		}
	}
	const providerResolution = resolveBatchProviderForCurrentAdapter({
		mode: inputMode.mode,
		provider: payload.provider,
		model: extractRawBatchModel(payload),
		modelProviders: resolveBatchProvidersFromModels(extractRawBatchModels(payload)),
		inputFileProvider: ownedInputFile?.provider ?? null,
	});
	if (providerResolution.ok === false) return providerResolution.response;
	const providerId = providerResolution.providerId;
	const modelScopeError = validateProviderNativeBatchModelScope({
		providerId,
		payload,
		inputMode: inputMode.mode,
		requestId,
		workspaceId: auth.workspaceId,
	});
	if (modelScopeError) return modelScopeError;
	if (ownedInputFile?.provider && ownedInputFile.provider !== providerId) {
		return err("validation_error", {
			reason: "batch_input_file_provider_mismatch",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			file_id: directInputFileId,
			provider: ownedInputFile.provider,
			requested_provider: providerId,
		});
	}
	let requestRows: NormalizedBatchRequest[] | null = null;
	if (inputMode.mode === "requests") {
		try {
			requestRows = await normalizeBatchRequests(providerId, payload);
		} catch (error) {
			return err("validation_error", {
				reason: error instanceof Error ? error.message : "invalid_requests",
				request_id: requestId,
				workspace_id: auth.workspaceId,
			});
		}
	}
	let reservationRequests: Array<{ body: unknown; endpoint?: string | null; method?: string | null }> = (requestRows ?? []).map((row) => ({ body: row.body, endpoint: row.url, method: row.method }));
	let policyRows: NormalizedBatchRequest[] = requestRows ?? [];
	if (inputMode.mode === "file" && directInputFileId) {
		try {
			const parsedEntries = parseProviderBatchInputEntries(await fetchProviderFileText(providerId, directInputFileId));
			reservationRequests = parsedEntries.map((entry) => ({
				...entry,
				endpoint: entry.endpoint ?? toText(payload.endpoint),
				body:
					entry.body && typeof entry.body === "object" && !Array.isArray(entry.body) && !toText((entry.body as any).model) && toText(payload.model)
						? { ...(entry.body as Record<string, unknown>), model: providerNativeModelId(providerId, toText(payload.model)!) }
						: entry.body,
			}));
			policyRows = await Promise.all(reservationRequests.map(async (entry, index) => ({
				customId: `request-${index + 1}`,
				method: (toText(entry.method) ?? "POST").toUpperCase(),
				url: toText(entry.endpoint) ?? resolveBatchEndpoint(providerId, payload),
				body: entry.body,
				gatewayModel: toText(payload.model) ?? toText((entry.body as any)?.model),
				index,
				requestBodyHash: await hashBatchRequestBody(entry.body),
			})));
		} catch (error) {
			return err("validation_error", {
				reason: "batch_input_file_not_priceable",
				message: "The input file could not be parsed and priced safely before provider submission.",
				request_id: requestId,
				workspace_id: auth.workspaceId,
				provider: providerId,
			});
		}
	}
	if (!providerSupportsMultipleModelsPerBatch(providerId)) {
		const nativeModels = [...new Set(policyRows
			.map((row) => toText((row.body as any)?.model) ?? row.gatewayModel)
			.filter((model): model is string => Boolean(model))
			.map((model) => providerNativeModelId(providerId, model)))];
		if (nativeModels.length > 1) {
			return err("validation_error", {
				reason: "batch_multiple_models_not_supported",
				message: "The selected provider does not support multiple models in one native batch. Submit one batch per model.",
				request_id: requestId,
				workspace_id: auth.workspaceId,
				provider: providerId,
				models: nativeModels,
			});
		}
	}
	const policyError = await validateBatchRequestPolicies({
		auth,
		providerId,
		requestId,
		rows: policyRows,
		allowMutation: inputMode.mode === "requests",
	});
	if (policyError) return policyError;
	if (inputMode.mode === "requests") {
		reservationRequests = (requestRows ?? []).map((row) => ({
			body: row.body,
			endpoint: row.url,
			method: row.method,
		}));
	}
	const batchId = generateGatewayBatchId();
	let reservation: Awaited<ReturnType<typeof reserveBatchCredits>>;
	try {
		reservation = await reserveBatchCredits({
			workspaceId: auth.workspaceId,
			apiKeyId: auth.apiKeyId,
			requestId,
			providerId,
			requests: reservationRequests,
		});
	} catch (error) {
		await releaseWalletReservation({
			workspaceId: auth.workspaceId,
			keyId: auth.apiKeyId,
			reservationId: `batch_hold:${requestId}`,
			releaseRefId: requestId,
		}).catch(() => null);
		return err("validation_error", {
			reason: error instanceof Error ? error.message : "batch_reservation_failed",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			provider: providerId,
		});
	}
	if (!reservation.held) {
		return jsonPayload({
			error: {
				type: "insufficient_funds",
				reason: reservation.status,
				message: "Unable to reserve the maximum quoted batch cost before provider submission.",
				reserved_nanos: reservation.reservedNanos,
			},
		}, 402);
	}
	if (inputMode.mode === "requests" && FILE_BACKED_JSONL_BATCH_PROVIDERS.has(providerId)) {
		const upload = await uploadProviderBatchInputFile(providerId, { requestId, rows: requestRows ?? [] });
		if (upload.ok === false) {
			await releaseWalletReservation({
				workspaceId: auth.workspaceId,
				keyId: auth.apiKeyId,
				reservationId: reservation.reservationId,
				releaseRefId: requestId,
			}).catch(() => null);
			return upload.response;
		}
		upstreamPayload.input_file_id = upload.fileId;
		try {
			await saveBatchFileMeta(auth.workspaceId, upload.fileId, {
				provider: providerId,
				status: "uploaded",
				purpose: providerId === "together" ? "batch-api" : "batch",
				filename: `aistats-batch-${requestId}.jsonl`,
				bytes: new TextEncoder().encode(toProviderJsonl(providerId, requestRows ?? [])).byteLength,
				keySource: "gateway",
				byokKeyId: null,
			});
		} catch (lookupErr) {
			await fetchProviderBatchApi(providerId, {
				endpointPath: `/files/${encodeURIComponent(upload.fileId)}`,
				method: "DELETE",
				contentType: JSON_BATCH_CONTENT_TYPE,
			}).catch(() => null);
			await releaseWalletReservation({
				workspaceId: auth.workspaceId,
				keyId: auth.apiKeyId,
				reservationId: reservation.reservationId,
				releaseRefId: requestId,
			}).catch(() => null);
			console.error("batch_requests_input_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				fileId: upload.fileId,
			});
			return err("gateway_error", {
				reason: "batch_input_file_persistence_failed",
				request_id: requestId,
				workspace_id: auth.workspaceId,
			});
		}
	}
	const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
		? payload.metadata as Record<string, unknown>
		: {};
	const submissionMetadata = {
		...metadata,
		phaseo_batch_id: batchId,
		phaseo_request_id: requestId,
	};
	payload.metadata = submissionMetadata;
	if (providerId === OPENAI_PROVIDER_ID || providerId === MISTRAL_PROVIDER_ID) {
		upstreamPayload.metadata = submissionMetadata;
	}
	if (!toText(upstreamPayload.endpoint)) {
		upstreamPayload.endpoint = resolveBatchEndpoint(providerId, payload);
	}
	let providerCreate: ReturnType<typeof buildProviderBatchCreate>;
	try {
		providerCreate = buildProviderBatchCreate(providerId, {
			payload,
			upstreamPayload,
			inputMode: inputMode.mode,
			requestRows,
		});
	} catch (error) {
		await releaseWalletReservation({
			workspaceId: auth.workspaceId,
			keyId: auth.apiKeyId,
			reservationId: reservation.reservationId,
			releaseRefId: requestId,
		}).catch(() => null);
		return err("validation_error", {
			reason: error instanceof Error ? error.message : "invalid_batch_provider_payload",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			provider: providerId,
		});
	}
	const submissionMeta = batchMetaFromPayload(null, {
		provider: providerId,
		requestId,
		apiKeyId: auth.apiKeyId,
		sessionId:
			typeof payload?.session_id === "string"
				? payload.session_id
				: typeof payload?.sessionId === "string"
					? payload.sessionId
					: null,
		model: toText(payload.model),
		status: "submitting",
		nativeBatchId: null,
		endpoint: toText(payload.endpoint) ?? resolveBatchEndpoint(providerId, payload),
		completionWindow: toText(payload.completion_window),
		inputFileId: toText(upstreamPayload.input_file_id) ?? toText(payload.input_file_id),
		inputMode: inputMode.mode,
		webhook: normalizedWebhook,
		keySource: "gateway",
		byokKeyId: null,
		reservationId: reservation.reservationId,
		reservedNanos: reservation.reservedNanos,
		reservationStatus: reservation.status,
		reservationEstimate: reservation.estimate,
		submissionOutcome: null,
	});
	try {
		await saveBatchJobMeta(auth.workspaceId, batchId, submissionMeta);
	} catch (lookupErr) {
		await releaseWalletReservation({
			workspaceId: auth.workspaceId,
			keyId: auth.apiKeyId,
			reservationId: reservation.reservationId,
			releaseRefId: requestId,
		}).catch(() => null);
		console.error("batch_submission_intent_store_failed", {
			error: lookupErr,
			workspaceId: auth.workspaceId,
			batchId,
			providerId,
		});
		return jsonPayload({ error: { type: "gateway_error", reason: "batch_submission_persistence_failed" } }, 503);
	}

	let upstream: Response;
	const providerDispatchedAtMs = Date.now();
	try {
		upstream = await fetchProviderBatchApi(providerId, {
			endpointPath: providerCreate.endpointPath,
			method: "POST",
			body: JSON.stringify(providerCreate.body),
			contentType: JSON_BATCH_CONTENT_TYPE,
			idempotencyKey: `phaseo:${batchId}`,
		});
	} catch (error) {
		return quarantineUnknownBatchSubmission({
			workspaceId: auth.workspaceId,
			batchId,
			providerId,
			requestId,
			reservationId: reservation.reservationId,
			reservationStatus: reservation.status,
			reason: "batch_provider_create_outcome_unknown",
			error,
		});
	}
	let upstreamJson = normalizeProviderBatchPayload(providerId, await parseUpstreamJson(upstream));
	if (!upstream.ok) {
		if (isDefinitiveProviderRejection(upstream.status)) {
			await finalizeRejectedBatchSubmission({
				workspaceId: auth.workspaceId,
				batchId,
				providerId,
				statusCode: upstream.status,
			});
		} else {
			return quarantineUnknownBatchSubmission({
				workspaceId: auth.workspaceId,
				batchId,
				providerId,
				requestId,
				reservationId: reservation.reservationId,
				reservationStatus: reservation.status,
				reason: `batch_provider_create_http_${upstream.status}_outcome_unknown`,
			});
		}
	}

	if (upstream.ok && providerId === X_AI_PROVIDER_ID && providerCreate.followup && upstreamJson) {
		const nativeId = extractProviderBatchId(providerId, upstreamJson).nativeId;
		if (nativeId) {
			const followup = await fetchProviderBatchApi(providerId, {
				endpointPath: `/batches/${encodeURIComponent(nativeId)}/requests`,
				method: "POST",
				body: JSON.stringify(providerCreate.followup.body),
				contentType: JSON_BATCH_CONTENT_TYPE,
			}).catch(() => null);
			if (!followup?.ok) {
				const cancellation = await fetchProviderBatchApi(providerId, {
					endpointPath: buildProviderCancelPath(providerId, nativeId),
					method: "POST",
					contentType: JSON_BATCH_CONTENT_TYPE,
					body: "{}",
				}).catch(() => null);
				await setBatchJobStatus(auth.workspaceId, batchId, "cancelling", {
					reservationStatus: reservation.status,
					nativeBatchId: nativeId,
					submissionOutcome: "accepted",
					submissionError: "x_ai_batch_requests_failed",
				}).catch(() => null);
				await emitGatewayOperationalFailure({
					workflow: "batch_submission",
					workspaceId: auth.workspaceId,
					resourceId: batchId,
					reason: "x_ai_batch_requests_failed",
					error: cancellation?.ok ? "provider_cancellation_requested" : "provider_cancellation_not_confirmed",
				});
				return jsonPayload({
					error: {
						type: "upstream_error",
						reason: "x_ai_batch_requests_failed",
						message: "xAI created the native batch but rejected its requests. Cancellation was requested and the wallet hold remains until reconciliation confirms the terminal state.",
						batch_id: batchId,
						native_batch_id: nativeId,
						reservation_status: reservation.status,
					},
				}, 502);
			}
			const refreshed = await fetchProviderBatchApi(providerId, {
				endpointPath: `/batches/${encodeURIComponent(nativeId)}`,
				method: "GET",
			}).catch(() => null);
			if (refreshed?.ok) upstreamJson = normalizeProviderBatchPayload(providerId, await parseUpstreamJson(refreshed)) ?? upstreamJson;
		}
	}

	if (upstream.ok) {
		const nativeBatchId = toText(upstreamJson?.native_batch_id) ?? toText(upstreamJson?.id);
		if (!nativeBatchId) {
			return quarantineUnknownBatchSubmission({
				workspaceId: auth.workspaceId,
				batchId,
				providerId,
				requestId,
				reservationId: reservation.reservationId,
				reservationStatus: reservation.status,
				reason: "batch_create_missing_native_id",
			});
		}
		const keySource = "gateway" as const;
		let persistedMeta: BatchJobMeta | null = null;
		if (batchId) {
			persistedMeta = batchMetaFromPayload(upstreamJson, {
				provider: providerId,
				requestId,
				sessionId:
					typeof payload?.session_id === "string"
						? payload.session_id
						: typeof payload?.sessionId === "string"
							? payload.sessionId
							: null,
				model: toText(payload.model),
				status: toText(upstreamJson?.status) ?? "validating",
				nativeBatchId: nativeBatchId,
				endpoint: toText(payload.endpoint),
				completionWindow: toText(payload.completion_window),
				inputFileId: toText(upstreamPayload.input_file_id) ?? toText(payload.input_file_id),
				inputMode: inputMode.mode,
				webhook: normalizedWebhook,
				keySource,
				byokKeyId: null,
				reservationId: reservation.reservationId,
				reservedNanos: reservation.reservedNanos,
				reservationStatus: reservation.status,
				providerDispatchedAtMs,
				reservationEstimate: reservation.estimate,
				submissionOutcome: "accepted",
			});
			try {
				await saveBatchJobMeta(auth.workspaceId, batchId, persistedMeta);
			} catch (lookupErr) {
				const cancelled = await fetchProviderBatchApi(providerId, {
					endpointPath: buildProviderCancelPath(providerId, nativeBatchId),
					method: "POST",
					contentType: JSON_BATCH_CONTENT_TYPE,
					body: "{}",
				}).then((response) => response.ok).catch(() => false);
				await setBatchJobStatus(auth.workspaceId, batchId, cancelled ? "cancelling" : "in_progress", {
					nativeBatchId,
					reservationStatus: reservation.status,
					submissionOutcome: "accepted",
					submissionError: "batch_job_meta_store_failed_after_provider_acceptance",
				}).catch(() => null);
				await emitGatewayOperationalFailure({
					workflow: "batch_submission",
					workspaceId: auth.workspaceId,
					resourceId: batchId,
					reason: "batch_job_meta_store_failed_after_provider_acceptance",
					error: lookupErr,
				});
				console.error("batch_job_meta_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					batchId,
					nativeBatchId,
					providerId,
					cancelled,
				});
				return batchAsyncPersistenceFailureResponse({
					message: `The provider accepted the batch, but Phaseo could not persist ownership metadata. Provider cancellation was ${cancelled ? "requested" : "not confirmed"}.`,
					batchId,
					nativeBatchId,
					status: toText(upstreamJson?.status),
					reservationId: reservation.reservationId,
					reservationStatus: reservation.status,
				});
			}
		}
		if (batchId && requestRows?.length) {
			const batchRequestRows: BatchRequestRowInput[] = requestRows.map((row) => ({
				provider: providerId,
				nativeBatchId: nativeBatchId ?? batchId,
				customId: row.customId,
				requestIndex: row.index,
				method: row.method,
				endpoint: row.url,
				model: toText((row.body as any)?.model) ?? toText(payload.model),
				status: "queued",
				requestBodyHash: row.requestBodyHash,
				meta: {
					input_mode: "requests",
				},
			}));
			await saveBatchRequestRows({
				workspaceId: auth.workspaceId,
				batchId,
				rows: batchRequestRows,
			}).catch((lookupErr) => {
				console.error("batch_request_rows_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					batchId,
				});
			});
		}

		const inputFileId = toText(payload.input_file_id);
		if (inputFileId) {
			await saveBatchFileMeta(auth.workspaceId, inputFileId, {
				provider: providerId,
				status: "uploaded",
				keySource,
				byokKeyId: null,
			}).catch((lookupErr) => {
				console.error("batch_input_file_meta_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					fileId: inputFileId,
				});
			});
		}
		await persistBatchFileOwnership(auth.workspaceId, providerId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
			});
		});
		if (batchId) {
			dispatchAsyncWebhookEventInBackground({
				workspaceId: auth.workspaceId,
				kind: "batch",
				internalId: batchId,
				phase: "created",
			});
		}
		if (upstreamJson) {
			return toDecoratedJsonResponse(upstream, decorateBatchPayload({
				requestUrl: req.url,
				payload: upstreamJson,
				meta: persistedMeta,
				publicBatchId: batchId,
			}));
		}
	}

	return toJsonResponse(upstream);
}

async function handleRetrieve(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const batchId = String(id ?? "").trim();
	if (!batchId) {
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, workspace_id: auth.workspaceId });
	}
	let meta = null;
	try {
		meta = await getBatchJobMeta(auth.workspaceId, batchId);
	} catch (lookupErr) {
		console.error("batch_job_meta_lookup_failed", {
			error: lookupErr,
			workspaceId: auth.workspaceId,
			batchId,
		});
	}
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			workspace_id: auth.workspaceId,
		});
	}

	const nativeBatchId = resolveBatchProviderNativeId({ batchId, meta });
	const providerId = meta.provider || OPENAI_PROVIDER_ID;
	const upstream = await fetchProviderBatchApi(providerId, {
		endpointPath: buildProviderRetrievePath(providerId, nativeBatchId),
		method: "GET",
	});
	const upstreamJson = normalizeProviderBatchPayload(providerId, await parseUpstreamJson(upstream));
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		const previousStatus = String(meta.status ?? "").toLowerCase();
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: providerId,
		});
		const persistenceFailure = await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta)
			.then(() => null)
			.catch((lookupErr) => {
			console.error("batch_job_meta_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
				status: toText(upstreamJson?.status),
			});
			return batchAsyncPersistenceFailureResponse({
				message: "Batch status was refreshed upstream, but Phaseo could not persist the refreshed gateway metadata.",
				batchId,
				nativeBatchId: meta.nativeBatchId ?? batchId,
				status: toText(upstreamJson?.status),
				reservationId: meta.reservationId ?? null,
				reservationStatus: meta.reservationStatus ?? null,
			});
		});
		if (persistenceFailure) return persistenceFailure;
		await persistBatchFileOwnership(auth.workspaceId, providerId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
			});
		});
		const nextStatus = String(upstreamJson?.status ?? meta.status ?? "").toLowerCase();
		if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "expired" || nextStatus === "cancelled" || nextStatus === "canceled") {
			finalization = await finalizeBatchJob({
				workspaceId: auth.workspaceId,
				batchId,
				status: nextStatus,
			}).catch((finalizeErr) => {
				console.error("batch_job_finalize_failed", {
					error: finalizeErr,
					workspaceId: auth.workspaceId,
					batchId,
					status: nextStatus,
				});
				return null;
			});
		}
		if (nextStatus !== previousStatus && finalization?.billed === true) {
			const phase = nextStatus === "completed"
				? "completed"
				: nextStatus === "failed" || nextStatus === "expired"
					? "failed"
					: nextStatus === "cancelled" || nextStatus === "canceled"
						? "cancelled"
						: null;
			if (phase) dispatchAsyncWebhookEventInBackground({
				workspaceId: auth.workspaceId,
				kind: "batch",
				internalId: batchId,
				phase,
			});
		}
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
			finalization,
			publicBatchId: batchId,
		}));
	}

	return toJsonResponse(upstream);
}

async function handleCancel(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const batchId = String(id ?? "").trim();
	if (!batchId) {
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, workspace_id: auth.workspaceId });
	}

	const meta = await getBatchJobMeta(auth.workspaceId, batchId);
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			workspace_id: auth.workspaceId,
		});
	}

	const nativeBatchId = resolveBatchProviderNativeId({ batchId, meta });
	const providerId = meta.provider || OPENAI_PROVIDER_ID;
	const upstream = await fetchProviderBatchApi(providerId, {
		endpointPath: buildProviderCancelPath(providerId, nativeBatchId),
		method: "POST",
		contentType: JSON_BATCH_CONTENT_TYPE,
		body: "{}",
	});
	const upstreamJson = normalizeProviderBatchPayload(providerId, await parseUpstreamJson(upstream));
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: providerId,
			status: "cancelling",
		});
		const persistenceFailure = await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta)
			.then(() => null)
			.catch((lookupErr) => {
			console.error("batch_job_meta_cancel_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
				status: toText(upstreamJson?.status),
			});
			return batchAsyncPersistenceFailureResponse({
				message: "Batch cancellation was accepted upstream, but Phaseo could not persist the refreshed gateway metadata.",
				batchId,
				nativeBatchId: meta.nativeBatchId ?? batchId,
				status: toText(upstreamJson?.status),
				reservationId: meta.reservationId ?? null,
				reservationStatus: meta.reservationStatus ?? null,
			});
		});
		if (persistenceFailure) return persistenceFailure;
		const nextStatus = String(upstreamJson?.status ?? "").toLowerCase();
		if (nextStatus === "cancelled" || nextStatus === "canceled") {
			finalization = await finalizeBatchJob({
				workspaceId: auth.workspaceId,
				batchId,
				status: nextStatus,
			}).catch((finalizeErr) => {
				console.error("batch_job_finalize_failed", {
					error: finalizeErr,
					workspaceId: auth.workspaceId,
					batchId,
					status: nextStatus,
				});
				return null;
			});
		}
		if ((nextStatus === "cancelled" || nextStatus === "canceled") && finalization?.billed === true) {
			dispatchAsyncWebhookEventInBackground({
				workspaceId: auth.workspaceId,
				kind: "batch",
				internalId: batchId,
				phase: "cancelled",
			});
		}
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
			finalization,
			publicBatchId: batchId,
		}));
	}

	return toJsonResponse(upstream);
}

async function handleCapabilities(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const previewProviderIds = resolveBatchPreviewProviderIds(getBindings().BATCH_API_PREVIEW_PROVIDERS);
	return jsonPayload({
		object: "list",
		data: listBatchProviderCapabilities()
			.filter((provider) => previewProviderIds.includes(provider.providerId))
			.map((provider) => ({
			id: provider.providerId,
			name: provider.displayName,
			status: provider.status,
			preview_readiness: provider.previewReadiness,
			reconciliation_mode: provider.reconciliationMode,
			submission_recovery: provider.submissionRecovery,
			gateway_input_modes: provider.gatewayInputModes,
			native_input_modes: provider.nativeInputModes,
			documentation_url: provider.documentationUrl,
			notes: provider.notes ?? null,
		})),
	});
}

function isDefinitiveProviderRejection(status: number): boolean {
	return status >= 400 && status < 500 && status !== 408;
}

async function quarantineUnknownBatchSubmission(args: {
	workspaceId: string;
	batchId: string;
	providerId: string;
	requestId: string;
	reservationId: string;
	reservationStatus: string;
	reason: string;
	error?: unknown;
	nativeBatchId?: string | null;
}): Promise<Response> {
	await setBatchJobStatus(args.workspaceId, args.batchId, "submission_unknown", {
		reservationStatus: args.reservationStatus,
		submissionOutcome: "unknown",
		submissionError: args.reason,
		...(args.nativeBatchId ? { nativeBatchId: args.nativeBatchId } : {}),
	}).catch((statusError) => {
		console.error("batch_submission_unknown_status_store_failed", {
			error: statusError,
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			providerId: args.providerId,
		});
	});
	await emitGatewayOperationalFailure({
		workflow: "batch_submission",
		workspaceId: args.workspaceId,
		resourceId: args.batchId,
		reason: args.reason,
		error: args.error,
	});
	return jsonPayload({
		error: {
			type: "upstream_outcome_unknown",
			reason: args.reason,
			message: "The provider submission outcome could not be confirmed. The wallet hold remains in place while the batch is investigated.",
			batch_id: args.batchId,
			native_batch_id: args.nativeBatchId ?? null,
			provider: args.providerId,
			request_id: args.requestId,
			reservation_id: args.reservationId,
			reservation_status: args.reservationStatus,
		},
	}, 502);
}

async function finalizeRejectedBatchSubmission(args: {
	workspaceId: string;
	batchId: string;
	providerId: string;
	statusCode: number;
}): Promise<void> {
	const reason = `batch_provider_create_rejected_${args.statusCode}`;
	await setBatchJobStatus(args.workspaceId, args.batchId, "failed", {
		submissionOutcome: "rejected",
		submissionError: reason,
		billingReason: reason,
	});
	const finalization = await finalizeBatchJob({
		workspaceId: args.workspaceId,
		batchId: args.batchId,
		status: "failed",
	});
	if (!finalization.billed) {
		console.error("batch_rejected_submission_finalization_failed", {
			workspaceId: args.workspaceId,
			batchId: args.batchId,
			providerId: args.providerId,
			reason: finalization.reason,
		});
	}
}

async function handleListRequests(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const batchId = String(id ?? "").trim();
	if (!batchId) {
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, workspace_id: auth.workspaceId });
	}
	const meta = await getBatchJobMeta(auth.workspaceId, batchId);
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			workspace_id: auth.workspaceId,
		});
	}
	const url = new URL(req.url);
	const rows = await listBatchRequestRows({
		workspaceId: auth.workspaceId,
		batchId,
		limit: Number(url.searchParams.get("limit") ?? 100),
		offset: Number(url.searchParams.get("offset") ?? 0),
		status: url.searchParams.get("status"),
	});
	return jsonPayload({
		object: "list",
		batch_id: batchId,
		data: rows.map((row) => ({
			id: row.id,
			custom_id: row.customId,
			request_index: row.requestIndex,
			provider: row.provider,
			native_batch_id: row.nativeBatchId,
			method: row.method,
			endpoint: row.endpoint,
			model: row.model,
			status: row.status,
			request_body_hash: row.requestBodyHash,
			response_status: row.responseStatus,
			response_body: null,
			error_body: row.errorBody,
			usage: row.usage,
			cost_nanos: row.costNanos,
			cost_usd: row.costUsd,
			meta: row.meta,
			created_at: row.createdAt,
			updated_at: row.updatedAt,
			completed_at: row.completedAt,
		})),
	});
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/", withRuntime(handleList));
batchRoutes.get("/models", withRuntime(handleModels));
batchRoutes.get("/capabilities", withRuntime(handleCapabilities));
batchRoutes.route("/files", batchFilesRoutes);
batchRoutes.get("/:id/requests", withRuntime((req) => handleListRequests(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
batchRoutes.post("/:id/cancel", withRuntime((req) => handleCancel(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));
