// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { MusicGenerateSchema, type MusicGenerateRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { saveMusicJobMeta } from "@core/music-jobs";

function toSunoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").trim().toUpperCase();
	if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") return "completed";
	if (status === "PENDING" || status === "TEXT_SUCCESS" || status === "FIRST_SUCCESS" || status === "RUNNING") {
		return "in_progress";
	}
	if (status === "CREATE_TASK_FAILED" || status === "CALLBACK_EXCEPTION" || status === "FAILED") return "failed";
	return "queued";
}

function extractTaskId(payload: any): string | undefined {
	const id =
		payload?.data?.taskId ??
		payload?.taskId ??
		payload?.id;
	if (id == null) return undefined;
	const asString = String(id).trim();
	return asString.length > 0 ? asString : undefined;
}

function normalizeCreateResponse(payload: any, model: string): Record<string, any> {
	const taskId = extractTaskId(payload);
	const status = toSunoStatus(payload?.data?.status ?? payload?.status);
	return {
		id: taskId ?? null,
		object: "music",
		status,
		provider: "suno",
		model,
		nativeResponseId: taskId ?? null,
		result: payload,
	};
}

function validateSunoRequestShape(payload: MusicGenerateRequest): string | null {
	const suno = payload.suno ?? {};
	const customMode = suno.customMode ?? false;
	const instrumental = suno.instrumental ?? false;
	const prompt = suno.prompt ?? payload.prompt;
	const hasStyle = typeof suno.style === "string" && suno.style.trim().length > 0;
	const hasTitle = typeof suno.title === "string" && suno.title.trim().length > 0;

	if (!customMode && (!prompt || !String(prompt).trim())) {
		return "prompt_required_when_custom_mode_disabled";
	}

	if (customMode) {
		if (!hasStyle || !hasTitle) {
			return "style_and_title_required_when_custom_mode_enabled";
		}
		if (!instrumental && (!prompt || !String(prompt).trim())) {
			return "prompt_required_for_lyric_mode_when_custom_mode_enabled";
		}
	}

	return null;
}

/**
 * Suno Music Generation via compatible third-party API.
 *
 * Reference used: sunoapi.org docs for `/api/v1/generate`.
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = resolveProviderKey(args, () => {
		const bindings = getBindings() as any;
		return bindings.SUNO_API_KEY;
	});

	const { canonical, adapterPayload } = buildAdapterPayload(MusicGenerateSchema, args.body, []);
	const typedPayload = adapterPayload as MusicGenerateRequest;
	const sunoParams = (canonical as MusicGenerateRequest).suno ?? {};

	const validationError = validateSunoRequestShape(typedPayload);
	if (validationError) {
		const normalized = {
			error: "validation_error",
			reason: validationError,
		};
		return {
			kind: "completed",
			upstream: new Response(JSON.stringify(normalized), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined,
				upstream_id: null,
				finish_reason: "error",
			},
			normalized,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const bindings = getBindings() as any;
	const baseUrl = String(bindings.SUNO_BASE_URL || "https://api.sunoapi.org").replace(/\/+$/, "");
	const model = sunoParams.model ?? args.providerModelSlug ?? typedPayload.model;

	const requestBody: Record<string, unknown> = {
		customMode: sunoParams.customMode ?? false,
		instrumental: sunoParams.instrumental ?? false,
		callBackUrl: sunoParams.callBackUrl ?? undefined,
		model,
	};

	const prompt = sunoParams.prompt ?? typedPayload.prompt ?? undefined;
	if (prompt) requestBody.prompt = prompt;
	if (sunoParams.style) requestBody.style = sunoParams.style;
	if (sunoParams.title) requestBody.title = sunoParams.title;
	if (sunoParams.personaId) requestBody.personaId = sunoParams.personaId;
	if (sunoParams.negativeTags) requestBody.negativeTags = sunoParams.negativeTags;
	if (sunoParams.vocalGender) requestBody.vocalGender = sunoParams.vocalGender;
	if (typeof sunoParams.styleWeight === "number") requestBody.styleWeight = sunoParams.styleWeight;
	if (typeof sunoParams.weirdnessConstraint === "number") requestBody.weirdnessConstraint = sunoParams.weirdnessConstraint;
	if (typeof sunoParams.audioWeight === "number") requestBody.audioWeight = sunoParams.audioWeight;

	const res = await fetch(`${baseUrl}/api/v1/generate`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};

	const json = await res.clone().json().catch(() => null);
	const normalized = json ? normalizeCreateResponse(json, String(model ?? typedPayload.model ?? "")) : undefined;

	if (res.ok && normalized?.id) {
		try {
			await saveMusicJobMeta(args.teamId, String(normalized.id), {
				provider: "suno",
				model: String(model ?? typedPayload.model ?? ""),
				duration: typeof typedPayload.duration === "number" ? typedPayload.duration : null,
				format: typedPayload.format ?? null,
				createdAt: Date.now(),
			});
		} catch (err) {
			console.error("suno_music_job_meta_store_failed", {
				error: err,
				teamId: args.teamId,
				musicId: normalized.id,
			});
		}
	}

	return {
		kind: "completed",
		upstream: res,
		bill,
		normalized,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
