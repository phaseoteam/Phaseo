// Purpose: Shared GMI Cloud request-queue transport for native media executors.
// Why: GMI Cloud media uses a queue transport even when a model is documented as synchronous.

import type { ExecutorExecuteArgs } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { GMI_CLOUD_API_KEY_ENVS } from "@providers/gmicloud/config";

const DEFAULT_QUEUE_BASE_URL = "https://console.gmicloud.ai";
const QUEUE_PATH = "/api/v1/ie/requestqueue/apikey/requests";
const POLL_INTERVAL_MS = 250;
const MAX_POLLS = 240;

export type GmiQueueResult = {
	requestId: string;
	response: Response;
	json: any;
	accepted: boolean;
};

function readFirstBinding(names: readonly string[]): string | undefined {
	const bindings = getBindings() as unknown as Record<string, unknown>;
	for (const name of names) {
		const value = bindings[name];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function queueBaseUrl(): string {
	const bindings = getBindings() as unknown as Record<string, unknown>;
	return String(bindings.GMI_QUEUE_BASE_URL || DEFAULT_QUEUE_BASE_URL).replace(/\/+$/, "");
}

function requestIdFrom(json: any): string | undefined {
	const value = json?.request_id ?? json?.requestId ?? json?.id ?? json?.data?.request_id ?? json?.data?.id;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function queueStatus(json: any): string {
	return String(json?.status ?? json?.data?.status ?? json?.state ?? "").toLowerCase();
}

function isSuccess(status: string): boolean {
	return ["success", "succeeded", "completed", "finished"].includes(status);
}

function isFailure(status: string): boolean {
	return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export async function executeGmiQueueRequest(
	args: ExecutorExecuteArgs,
	model: string,
	payload: Record<string, unknown>,
): Promise<GmiQueueResult> {
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => readFirstBinding(GMI_CLOUD_API_KEY_ENVS),
	);
	const headers = {
		Authorization: `Bearer ${keyInfo.key}`,
		"Content-Type": "application/json",
		...(args.meta.testId ? { "x-test-id": args.meta.testId } : {}),
	};
	const body = JSON.stringify({ model, payload });
	const submitResponse = await fetchUpstream(args, `${queueBaseUrl()}${QUEUE_PATH}`, {
		method: "POST",
		headers,
		body,
	});
	const submitJson = await submitResponse.clone().json().catch(() => ({}));
	if (!submitResponse.ok) return { requestId: requestIdFrom(submitJson) ?? "", response: submitResponse, json: submitJson, accepted: false };

	const requestId = requestIdFrom(submitJson);
	if (!requestId) {
		return {
			requestId: "",
			response: jsonResponse({ error: "gmicloud_request_id_missing", upstream: submitJson }, 502),
			json: submitJson,
			accepted: true,
		};
	}

	let latestResponse = submitResponse;
	let latestJson = submitJson;
	for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
		const status = queueStatus(latestJson);
		if (isSuccess(status) || isFailure(status)) break;
		if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		latestResponse = await fetchUpstream(
			args,
			`${queueBaseUrl()}${QUEUE_PATH}/${encodeURIComponent(requestId)}`,
			{ headers: { Authorization: `Bearer ${keyInfo.key}` } },
			"poll",
		);
		latestJson = await latestResponse.clone().json().catch(() => ({}));
		if (!latestResponse.ok) {
			return { requestId, response: latestResponse, json: latestJson, accepted: true };
		}
	}

	const finalStatus = queueStatus(latestJson);
	if (isFailure(finalStatus)) {
		return {
			requestId,
			response: jsonResponse({ error: "gmicloud_request_queue_failed", request_id: requestId }, 502),
			json: latestJson,
			accepted: true,
		};
	}
	if (!isSuccess(finalStatus) && !isFailure(finalStatus)) {
		return {
			requestId,
			response: jsonResponse({ error: "gmicloud_request_queue_timeout", request_id: requestId, status: finalStatus || "processing" }, 504),
			json: latestJson,
			accepted: true,
		};
	}
	return { requestId, response: latestResponse, json: latestJson, accepted: true };
}

export function extractMediaUrl(json: any): string | undefined {
	const media = json?.outcome?.media_urls ?? json?.result?.media_urls ?? json?.data?.media_urls;
	const first = Array.isArray(media) ? media[0] : undefined;
	const candidate = first?.url ?? first ?? json?.outcome?.audio_url ?? json?.outcome?.audioUrl ?? json?.audio_url ?? json?.audioUrl;
	return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export function extractMediaBase64(json: any): string | undefined {
	const candidate =
		json?.outcome?.audio_base64 ??
		json?.outcome?.audioBase64 ??
		json?.result?.audio_base64 ??
		json?.data?.audio_base64;
	return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export function extractQueueOutcome(json: any): any {
	return json?.outcome ?? json?.result ?? json?.data ?? json;
}

export function queueKeyMeta(args: ExecutorExecuteArgs): { source: "gateway" | "byok"; byokId: string | null } {
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => readFirstBinding(GMI_CLOUD_API_KEY_ENVS),
	);
	return { source: keyInfo.source, byokId: keyInfo.byokId };
}

export function base64FromBuffer(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}
