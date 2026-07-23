// Purpose: Executor for minimax / music-generate.
// Why: Uses MiniMax native music APIs directly instead of relay providers.
// How: Submits jobs to /v1/music_generation and normalizes the async task response.

import type { IRMusicGenerateRequest, IRMusicGenerateResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveMusicJobMeta } from "@core/music-jobs";

const MINIMAX_MUSIC_PREFIX = "mmxmus_";
const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io";

type MiniMaxAudioPayload = {
	audioUrl?: string;
	audioBase64?: string;
};

function encodeMiniMaxMusicId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${MINIMAX_MUSIC_PREFIX}${b64}`;
}

function toMusicStatus(value: unknown): IRMusicGenerateResponse["status"] {
	if (typeof value === "number" && Number.isFinite(value)) {
		// MiniMax music status codes are numeric in some responses (for example 2 => success).
		if (value >= 2) return "completed";
		if (value === 1) return "in_progress";
		if (value <= -1) return "failed";
		return "queued";
	}
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded" || status === "success" || status === "finished") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function extractTaskId(json: any): string | undefined {
	const taskId = json?.task_id ?? json?.taskId ?? json?.id ?? json?.data?.task_id ?? json?.data?.taskId;
	if (taskId == null) return undefined;
	const value = String(taskId).trim();
	return value.length > 0 ? value : undefined;
}

function isLikelyBase64(value: string): boolean {
	if (!value || value.length < 32) return false;
	const compact = value.replace(/\s+/g, "");
	return compact.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(compact);
}

function isLikelyHex(value: string): boolean {
	if (!value || value.length < 64) return false;
	const compact = value.replace(/\s+/g, "");
	return compact.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(compact);
}

function hexToBase64(value: string): string | undefined {
	const compact = value.replace(/\s+/g, "");
	if (!isLikelyHex(compact)) return undefined;
	try {
		const bytes = new Uint8Array(compact.length / 2);
		for (let i = 0; i < compact.length; i += 2) {
			bytes[i / 2] = Number.parseInt(compact.slice(i, i + 2), 16);
		}
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary);
	} catch {
		return undefined;
	}
}

function extractAudioPayload(json: any): MiniMaxAudioPayload {
	const value =
		json?.audio_url ??
		json?.audioUrl ??
		json?.url ??
		json?.data?.audio ??
		json?.data?.audio_url ??
		json?.data?.audioUrl ??
		json?.output?.audio ??
		json?.output?.audio_url ??
		json?.output?.audioUrl;
	if (typeof value !== "string") return {};
	const trimmed = value.trim();
	if (!trimmed) return {};
	if (trimmed.startsWith("data:audio/")) return { audioUrl: trimmed };
	if (/^https?:\/\//i.test(trimmed)) return { audioUrl: trimmed };
	if (isLikelyHex(trimmed)) {
		const base64 = hexToBase64(trimmed);
		return base64 ? { audioBase64: base64 } : {};
	}
	if (isLikelyBase64(trimmed)) {
		return { audioBase64: trimmed.replace(/\s+/g, "") };
	}
	return {};
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRMusicGenerateRequest;
	const model = args.providerModelSlug || ir.model || "music-01";
	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const minimaxExtensions = (ir.vendor?.minimax ?? rawRequest.minimax ?? {}) as Record<string, any>;
	const passthroughRequest =
		minimaxExtensions.request &&
		typeof minimaxExtensions.request === "object" &&
		!Array.isArray(minimaxExtensions.request)
			? { ...(minimaxExtensions.request as Record<string, any>) }
			: {};

	if (passthroughRequest.model == null) passthroughRequest.model = model;
	if (passthroughRequest.prompt == null) {
		passthroughRequest.prompt = minimaxExtensions.prompt ?? ir.prompt ?? "";
	}
	if (passthroughRequest.lyrics == null) {
		const explicitLyrics =
			typeof minimaxExtensions.lyrics === "string" && minimaxExtensions.lyrics.trim()
				? minimaxExtensions.lyrics.trim()
				: typeof rawRequest.lyrics === "string" && rawRequest.lyrics.trim()
					? rawRequest.lyrics.trim()
					: null;
		if (explicitLyrics) {
			passthroughRequest.lyrics = explicitLyrics;
		}
	}
	if (passthroughRequest.is_instrumental == null) {
		const explicitInstrumental =
			typeof minimaxExtensions.is_instrumental === "boolean"
				? minimaxExtensions.is_instrumental
				: typeof rawRequest.is_instrumental === "boolean"
					? rawRequest.is_instrumental
					: null;
		if (explicitInstrumental != null) {
			passthroughRequest.is_instrumental = explicitInstrumental;
		} else if (passthroughRequest.lyrics == null) {
			// Prompt-only chat should steer musical style, not become literal sung lyrics.
			passthroughRequest.is_instrumental = true;
		}
	}
	if (passthroughRequest.is_instrumental === false && passthroughRequest.lyrics == null) {
		const validationBody = {
			error: "validation_error",
			reason: "lyrics_required_for_non_instrumental_minimax_music",
			message: "MiniMax Music requires `lyrics` when `is_instrumental` is false.",
		};
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined,
				upstream_id: undefined,
				finish_reason: null,
			},
			upstream: new Response(JSON.stringify(validationBody), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			keySource: "gateway",
			mappedRequest: undefined,
		};
	}
	if (passthroughRequest.duration == null) {
		const duration = toPositiveNumber(minimaxExtensions.duration ?? ir.duration);
		if (duration != null) passthroughRequest.duration = duration;
	}
	if (passthroughRequest.output_format == null) {
		passthroughRequest.output_format = "url";
	}
	if (passthroughRequest.format == null && typeof ir.format === "string") passthroughRequest.format = ir.format;
	if (passthroughRequest.callback_url == null && typeof minimaxExtensions.callback_url === "string") {
		passthroughRequest.callback_url = minimaxExtensions.callback_url;
	}

	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.MINIMAX_API_KEY;
		},
	);

	const requestBody = JSON.stringify(passthroughRequest);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
	const res = await fetchUpstream(args, `${baseUrl}/v1/music_generation`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
		},
		body: requestBody,
	});

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined,
		finish_reason: null as string | null,
	};

	if (!res.ok) {
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const json = await res.json().catch(() => ({}));
	const audioPayload = extractAudioPayload(json);
	const baseResp = json?.base_resp ?? json?.baseResp ?? null;
	const baseStatusCodeRaw = baseResp?.status_code ?? baseResp?.statusCode;
	const baseStatusCode =
		typeof baseStatusCodeRaw === "number"
			? baseStatusCodeRaw
			: typeof baseStatusCodeRaw === "string"
				? Number(baseStatusCodeRaw)
				: 0;
	const baseStatusMessage =
		typeof (baseResp?.status_msg ?? baseResp?.statusMsg) === "string"
			? String(baseResp.status_msg ?? baseResp.statusMsg).trim()
			: "";
	if (Number.isFinite(baseStatusCode) && baseStatusCode !== 0) {
		const upstreamErrorBody = {
			error: "upstream_error",
			reason: "minimax_music_generation_failed",
			provider: "minimax",
			status_code: baseStatusCode,
			message: baseStatusMessage || "MiniMax music generation failed.",
			result: json,
		};
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: new Response(JSON.stringify(upstreamErrorBody), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
		};
	}
	const taskId = extractTaskId(json);
	const encodedId = taskId ? encodeMiniMaxMusicId(taskId) : undefined;
	if (encodedId) {
		try {
			await saveMusicJobMeta(args.workspaceId, encodedId, {
				provider: args.providerId,
				model,
				duration: toPositiveNumber(passthroughRequest.duration) ?? null,
				format: typeof passthroughRequest.format === "string" ? passthroughRequest.format : null,
				createdAt: Date.now(),
			});
		} catch (error) {
			console.error("minimax_music_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				musicId: encodedId,
				requestId: args.requestId,
			});
		}
	}

	const usageMeters: Record<string, number> = {
		requests: 1,
		...(toPositiveNumber(passthroughRequest.duration) != null
			? { output_audio_seconds: toPositiveNumber(passthroughRequest.duration)! }
			: {}),
	};
	bill.usage = usageMeters;

	const irResponse: IRMusicGenerateResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status: toMusicStatus(json?.status ?? json?.task_status ?? json?.data?.status),
		audioUrl: audioPayload.audioUrl,
		audioBase64: audioPayload.audioBase64,
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(usageMeters.output_audio_seconds != null ? { output_audio_seconds: usageMeters.output_audio_seconds } : {}),
		} as any,
		rawResponse: json,
	};

	return {
		kind: "completed",
		ir: irResponse,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
	};
}

export const executor: ProviderExecutor = execute;
