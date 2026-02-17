// Purpose: Executor for black-forest-labs / image-generate.
// Why: Maps OpenAI-style image generation requests onto Black Forest Labs async image APIs.
// How: Submits generation jobs, polls for completion, and normalizes results to IR.

import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";

const DEFAULT_BASE_URL = "https://api.us1.bfl.ai";
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const TERMINAL_FAILURE_STATUSES = new Set([
	"request moderated",
	"content moderated",
	"error",
	"failed",
	"task not found",
]);

function normalizeModelSlug(value?: string | null): string {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	let slug = raw;
	if (slug.includes(":")) slug = slug.split(":").pop() ?? slug;
	if (slug.includes("/")) slug = slug.split("/").pop() ?? slug;
	return slug.replace(/-\d{4}-\d{2}-\d{2}$/i, "");
}

function normalizeBaseUrl(baseUrl?: string): string {
	const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
	return base || DEFAULT_BASE_URL;
}

function buildSubmitUrl(baseUrl: string, modelSlug: string): string {
	const base = normalizeBaseUrl(baseUrl);
	const slug = modelSlug.replace(/^\/+/, "");
	try {
		const parsed = new URL(base);
		const basePath = parsed.pathname.replace(/\/+$/, "");
		if (basePath === "/v1" || basePath.endsWith("/v1")) {
			return `${base}/${slug}`;
		}
	} catch {
		// Fallback to best-effort string concatenation.
	}
	return `${base}/v1/${slug}`;
}

function parseSizeToWidthHeight(size?: string | null): { width: number; height: number } | null {
	const value = String(size ?? "").trim();
	if (!value) return null;
	const match = value.match(/^(\d{2,5})x(\d{2,5})$/i);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
	return { width, height };
}

function createGatewayErrorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>): Response {
	return new Response(
		JSON.stringify({
			error: code,
			message,
			...(extra ?? {}),
		}),
		{
			status,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function normalizeStatus(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}

function buildBflPayload(ir: IRImageGenerationRequest): Record<string, unknown> {
	const raw = (ir.rawRequest ?? {}) as Record<string, unknown>;
	const payload: Record<string, unknown> = {
		prompt: ir.prompt,
	};

	const fromSize = parseSizeToWidthHeight(ir.size);
	if (fromSize) {
		payload.width = fromSize.width;
		payload.height = fromSize.height;
	}

	// Keep room for BFL-native parameters when callers include them.
	const passthroughKeys = [
		"width",
		"height",
		"seed",
		"safety_tolerance",
		"prompt_upsampling",
		"output_format",
		"aspect_ratio",
	];
	for (const key of passthroughKeys) {
		if (raw[key] !== undefined && raw[key] !== null) payload[key] = raw[key];
	}

	const inputImages = Array.isArray(ir.image)
		? ir.image.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
		: (typeof ir.image === "string" && ir.image.trim().length > 0 ? [ir.image] : []);

	if (inputImages.length > 0) payload.input_image = inputImages[0];
	if (inputImages.length > 1) payload.input_image_2 = inputImages[1];
	if (inputImages.length > 2) payload.input_image_3 = inputImages[2];

	return payload;
}

async function submitBflJob(args: {
	submitUrl: string;
	payload: Record<string, unknown>;
	key: string;
}): Promise<{ response: Response; json: any | null }> {
	const response = await fetch(args.submitUrl, {
		method: "POST",
		headers: {
			accept: "application/json",
			"Content-Type": "application/json",
			"x-key": args.key,
		},
		body: JSON.stringify(args.payload),
	});
	const json = await response.clone().json().catch(() => null);
	return { response, json };
}

async function pollBflJob(args: {
	pollingUrl: string;
	key: string;
	timeoutMs: number;
	intervalMs: number;
}): Promise<{ response: Response; json: any | null } | { errorResponse: Response }> {
	const deadline = Date.now() + args.timeoutMs;
	let lastStatus = "unknown";

	while (Date.now() <= deadline) {
		const response = await fetch(args.pollingUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
				"x-key": args.key,
			},
		});
		const json = await response.clone().json().catch(() => null);
		if (!response.ok) {
			return { errorResponse: response };
		}

		const status = normalizeStatus(json?.status);
		lastStatus = status || lastStatus;
		if (status === "ready") {
			return { response, json };
		}
		if (TERMINAL_FAILURE_STATUSES.has(status)) {
			return {
				errorResponse: createGatewayErrorResponse(
					422,
					"bfl_generation_failed",
					`Black Forest Labs image request ended in terminal status: ${json?.status ?? "unknown"}`,
					{ status: json?.status ?? null, result: json?.result ?? null },
				),
			};
		}
		await sleep(args.intervalMs);
	}

	return {
		errorResponse: createGatewayErrorResponse(
			504,
			"bfl_generation_timeout",
			"Black Forest Labs image request did not complete before timeout.",
			{ status: lastStatus },
		),
	};
}

async function imageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string | null } | null> {
	if (!url || typeof url !== "string") return null;
	const response = await fetch(url);
	if (!response.ok) return null;
	const mimeType = response.headers.get("content-type");
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		base64: bytesToBase64(bytes),
		mimeType,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRImageGenerationRequest;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.BLACK_FOREST_LABS_API_KEY || bindings.BFL_API_KEY,
	);

	const requestedCount = Number.isFinite(ir.n) && (ir.n ?? 0) > 0 ? Math.min(Number(ir.n), 10) : 1;
	const isImageEdit = args.capability === "image.edit" || args.endpoint === "images.edits";
	const hasInputImage = Array.isArray(ir.image)
		? ir.image.some((entry) => typeof entry === "string" && entry.trim().length > 0)
		: (typeof ir.image === "string" && ir.image.trim().length > 0);

	if (isImageEdit && !hasInputImage) {
		return {
			kind: "completed",
			ir: undefined,
			upstream: createGatewayErrorResponse(
				400,
				"bfl_image_required",
				"Black Forest Labs images.edits requires at least one input image.",
			),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	if (isImageEdit && typeof ir.mask === "string" && ir.mask.trim().length > 0) {
		return {
			kind: "completed",
			ir: undefined,
			upstream: createGatewayErrorResponse(
				400,
				"bfl_mask_not_supported",
				"Black Forest Labs does not currently support OpenAI-style mask-based images.edits in this gateway.",
			),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	const modelSlug = normalizeModelSlug(args.providerModelSlug || ir.model);
	if (!modelSlug) {
		return {
			kind: "completed",
			ir: undefined,
			upstream: createGatewayErrorResponse(400, "invalid_model", "Black Forest Labs model slug is required."),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const baseUrl = normalizeBaseUrl(bindings.BLACK_FOREST_LABS_BASE_URL || bindings.BFL_BASE_URL);
	const submitUrl = buildSubmitUrl(baseUrl, modelSlug);
	const pollIntervalMs = Math.max(
		250,
		Number(bindings.BLACK_FOREST_LABS_POLL_INTERVAL_MS || bindings.BFL_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS),
	);
	const pollTimeoutMs = Math.max(
		5000,
		Number(bindings.BLACK_FOREST_LABS_POLL_TIMEOUT_MS || bindings.BFL_POLL_TIMEOUT_MS || DEFAULT_POLL_TIMEOUT_MS),
	);

	const payload = buildBflPayload(ir);
	const wantsB64 = String(ir.responseFormat ?? "url").toLowerCase() === "b64_json";
	const data: IRImageGenerationResponse["data"] = [];
	const taskIds: string[] = [];
	let lastUpstream: Response | null = null;
	const rawResponses: any[] = [];

	for (let index = 0; index < requestedCount; index++) {
		const submitted = await submitBflJob({ submitUrl, payload, key: keyInfo.key });
		lastUpstream = submitted.response;
		rawResponses.push({ submit: submitted.json });
		if (!submitted.response.ok) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: submitted.response,
				bill: { cost_cents: 0, currency: "USD" },
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest: args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest
					? JSON.stringify(payload)
					: undefined,
				rawResponse: submitted.json,
			};
		}

		const taskId = String(submitted.json?.id ?? "").trim();
		if (taskId) taskIds.push(taskId);
		const pollingUrl = String(submitted.json?.polling_url ?? "").trim();
		if (!pollingUrl) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: createGatewayErrorResponse(
					502,
					"bfl_invalid_response",
					"Black Forest Labs did not return a polling URL.",
					{ response: submitted.json ?? null },
				),
				bill: { cost_cents: 0, currency: "USD" },
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}

		const polled = await pollBflJob({
			pollingUrl,
			key: keyInfo.key,
			timeoutMs: pollTimeoutMs,
			intervalMs: pollIntervalMs,
		});
		if ("errorResponse" in polled) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: polled.errorResponse,
				bill: { cost_cents: 0, currency: "USD" },
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}

		lastUpstream = polled.response;
		rawResponses[rawResponses.length - 1].poll = polled.json;
		const sampleUrl = String(polled.json?.result?.sample ?? "").trim();
		if (!sampleUrl) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: createGatewayErrorResponse(
					502,
					"bfl_missing_sample",
					"Black Forest Labs did not return an output image URL.",
					{ response: polled.json ?? null },
				),
				bill: { cost_cents: 0, currency: "USD" },
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}

		if (wantsB64) {
			const asBase64 = await imageUrlToBase64(sampleUrl);
			if (asBase64?.base64) {
				data.push({
					url: null,
					b64Json: asBase64.base64,
					revisedPrompt: null,
				});
				continue;
			}
		}

		data.push({
			url: sampleUrl,
			b64Json: null,
			revisedPrompt: null,
		});
	}

	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		requests: data.length || 1,
	};

	const irResponse: IRImageGenerationResponse = {
		id: args.requestId,
		nativeId: taskIds.length > 0 ? taskIds.join(",") : undefined,
		created: Math.floor(Date.now() / 1000),
		model: args.providerModelSlug || ir.model,
		provider: args.providerId,
		data,
		usage,
		rawResponse: rawResponses,
	};

	return {
		kind: "completed",
		ir: irResponse,
		upstream: lastUpstream ?? new Response(null, { status: 200 }),
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage,
			upstream_id:
				lastUpstream?.headers.get("x-request-id") ??
				lastUpstream?.headers.get("request-id") ??
				undefined,
			finish_reason: "stop",
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest: args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest
			? JSON.stringify(payload)
			: undefined,
		rawResponse: rawResponses,
	};
}

export const executor: ProviderExecutor = execute;
