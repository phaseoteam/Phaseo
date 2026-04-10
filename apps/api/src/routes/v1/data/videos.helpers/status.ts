import { getBindings } from "@/runtime/env";
import { finalizeVideoJob } from "@core/video-finalization";
import {
	getVideoJobRecord,
	type VideoJobMeta,
	type VideoJobRecord,
} from "@core/video-jobs";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { err } from "@pipeline/before/http";

import {
	DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS,
	OPENAI_PROVIDER_ID,
	normalizeText,
	type VideoRouteAuth,
} from "./shared";
export function logGoogleVideoTrace(event: string, payload: Record<string, unknown>) {
	console.info("google_video_trace", {
		event,
		...payload,
	});
}

type GoogleVideoAuth =
	| { kind: "api_key"; value: string }
	| { kind: "oauth_bearer"; value: string };

export function resolveGoogleVideoAuth(rawCredential: string): GoogleVideoAuth {
	const trimmed = rawCredential.trim();
	if (/^Bearer\s+/i.test(trimmed)) {
		return { kind: "oauth_bearer", value: trimmed.replace(/^Bearer\s+/i, "").trim() };
	}
	if (trimmed.startsWith("ya29.") || trimmed.startsWith("eyJ")) {
		return { kind: "oauth_bearer", value: trimmed };
	}
	return { kind: "api_key", value: trimmed };
}

export function redactSensitiveUrl(url: URL): string {
	const clone = new URL(url.toString());
	if (clone.searchParams.has("key")) clone.searchParams.set("key", "[redacted]");
	return clone.toString();
}

export function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

export function extractGoogleOperationError(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	return (payload as any).error;
}

export function isGoogleOperationsGetAuthFailure(status: number, payload: unknown): boolean {
	if (status !== 401) return false;
	if (!payload || typeof payload !== "object") return false;
	const error = (payload as any).error;
	const details = Array.isArray(error?.details) ? error.details : [];
	for (const detail of details) {
		const method = String(detail?.metadata?.method ?? "");
		const reason = String(detail?.reason ?? "");
		if (method === "google.longrunning.Operations.GetOperation" && reason === "CREDENTIALS_MISSING") {
			return true;
		}
	}
	return false;
}

export function resolveOpenAIVideoProxyTimeoutMs(bindings: Record<string, string | undefined>): number {
	const raw = bindings.OPENAI_VIDEO_PROXY_TIMEOUT_MS;
	if (typeof raw === "string" && raw.trim().length > 0) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 300000) {
			return parsed;
		}
	}
	return DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS;
}

export function mapOpenAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

export function mapBytedanceVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

export function mapRunwayVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "canceled" ||
		status === "cancelled"
	) {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	if (status === "throttled") return "queued";
	return "queued";
}

export function mapAtlasVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "canceled" ||
		status === "cancelled" ||
		status === "expired"
	) {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress" || status === "pending") {
		return "in_progress";
	}
	return "queued";
}

export function normalizeVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").trim().toLowerCase();
	if (!status) return "queued";
	if (status === "completed" || status === "complete" || status === "succeeded" || status === "success") {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "cancelled" ||
		status === "canceled" ||
		status === "expired"
	) {
		return "failed";
	}
	if (status === "in_progress" || status === "processing" || status === "running" || status === "pending") {
		return "in_progress";
	}
	return "queued";
}

export function normalizeVideoStatusFilter(value: string): "queued" | "in_progress" | "completed" | "failed" | null {
	const status = value.trim().toLowerCase();
	if (!status) return null;
	if (status === "queued" || status === "pending") return "queued";
	if (status === "in_progress" || status === "processing" || status === "running") return "in_progress";
	if (status === "completed" || status === "complete" || status === "success" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	return null;
}

export function parseVideoListStatuses(url: URL): Array<"queued" | "in_progress" | "completed" | "failed"> {
	const values = url.searchParams.getAll("status");
	const expanded = values.flatMap((value) =>
		value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	);
	const normalized = expanded
		.map((value) => normalizeVideoStatusFilter(value))
		.filter((value): value is "queued" | "in_progress" | "completed" | "failed" => value !== null);
	return [...new Set(normalized)];
}

export function parseVideoListLimit(url: URL): number {
	const parsed = Number(url.searchParams.get("limit") ?? "");
	if (!Number.isFinite(parsed)) return 50;
	return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

export async function requireOwnedVideoJob(
	auth: VideoRouteAuth,
	videoId: string,
): Promise<{ record: VideoJobRecord; meta: VideoJobMeta | null } | Response> {
	const record = await getVideoJobRecord(auth.teamId, videoId);
	if (record) return { record, meta: record.meta };
	return err("not_found", {
		reason: "video_not_found_or_not_owned",
		request_id: auth.requestId,
		team_id: auth.teamId,
		video_id: videoId,
	});
}

export async function refreshOwnedVideoJob(
	auth: VideoRouteAuth,
	videoId: string,
): Promise<{ record: VideoJobRecord; meta: VideoJobMeta | null } | null> {
	const record = await getVideoJobRecord(auth.teamId, videoId);
	if (!record) return null;
	return { record, meta: record.meta };
}

export function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export function normalizeProgressPercent(value: unknown): number | null {
	const parsed = toFiniteNumber(value);
	if (parsed == null) return null;
	return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function resolveStatusDetailsProgress(
	providerId: string | null | undefined,
	payload: Record<string, unknown>,
): number | null {
	const normalizedProvider = String(providerId ?? "").trim().toLowerCase();
	if (normalizedProvider !== OPENAI_PROVIDER_ID) return null;
	const statusDetails =
		payload.status_details &&
		typeof payload.status_details === "object" &&
		!Array.isArray(payload.status_details)
			? (payload.status_details as Record<string, unknown>)
			: null;
	const result =
		payload.result &&
		typeof payload.result === "object" &&
		!Array.isArray(payload.result)
			? (payload.result as Record<string, unknown>)
			: null;
	return (
		normalizeProgressPercent(payload.progress) ??
		normalizeProgressPercent(statusDetails?.progress) ??
		normalizeProgressPercent(result?.progress)
	);
}

export function resolveMetaCostNanos(meta: VideoJobMeta | null): number | null {
	if (!meta) return null;
	const direct = toFiniteNumber(meta.costNanos);
	if (direct != null) return Math.max(0, direct);
	const pricedUsage =
		meta.pricedUsage && typeof meta.pricedUsage === "object" ? (meta.pricedUsage as Record<string, unknown>) : null;
	const pricedNanos =
		toFiniteNumber((pricedUsage as any)?.pricing?.total_nanos) ??
		toFiniteNumber((pricedUsage as any)?.total_nanos) ??
		toFiniteNumber((meta.pricingBreakdown as any)?.total_nanos);
	if (pricedNanos != null) return Math.max(0, pricedNanos);
	const reserved = toFiniteNumber(meta.reservedNanos);
	return reserved != null ? Math.max(0, reserved) : null;
}

export function resolveMetaCostUsd(meta: VideoJobMeta | null): number | null {
	if (!meta) return null;
	const direct = toFiniteNumber(meta.costUsd);
	if (direct != null) return Math.max(0, direct);
	const pricedUsage =
		meta.pricedUsage && typeof meta.pricedUsage === "object" ? (meta.pricedUsage as Record<string, unknown>) : null;
	const pricedUsd =
		toFiniteNumber((pricedUsage as any)?.pricing?.cost_usd) ??
		toFiniteNumber((pricedUsage as any)?.cost_usd) ??
		toFiniteNumber((meta.pricingBreakdown as any)?.total_usd);
	if (pricedUsd != null) return Math.max(0, pricedUsd);
	const nanos = resolveMetaCostNanos(meta);
	return nanos != null ? Math.max(0, nanos / 1e9) : null;
}

export function resolveMetaDurationMs(record: VideoJobRecord | null, meta: VideoJobMeta | null): number | null {
	const direct = toFiniteNumber(meta?.durationMs);
	if (direct != null) return Math.max(0, Math.round(direct));
	const finalizedAtMs =
		typeof meta?.finalizedAt === "string" && meta.finalizedAt.trim().length > 0
			? Date.parse(meta.finalizedAt)
			: NaN;
	const createdAtMs =
		typeof record?.createdAt === "string" && record.createdAt.trim().length > 0
			? Date.parse(record.createdAt)
			: toFiniteNumber(meta?.createdAt) ?? NaN;
	if (Number.isFinite(finalizedAtMs) && Number.isFinite(createdAtMs)) {
		return Math.max(0, Math.round(finalizedAtMs - createdAtMs));
	}
	return null;
}

export function enrichVideoPayloadWithJobMetrics(
	payload: Record<string, unknown>,
	record: VideoJobRecord | null,
	meta: VideoJobMeta | null,
): Record<string, unknown> {
	const durationMs = resolveMetaDurationMs(record, meta);
	const costUsd = resolveMetaCostUsd(meta);
	const costNanos = resolveMetaCostNanos(meta);
	const out = { ...payload } as Record<string, unknown>;
	const usage =
		out.usage && typeof out.usage === "object" && !Array.isArray(out.usage)
			? { ...(out.usage as Record<string, unknown>) }
			: {};
	if (typeof meta?.seconds === "number" && usage.output_video_seconds == null) {
		usage.output_video_seconds = meta.seconds;
	}
	if (costUsd != null) {
		if (usage.cost_usd == null) usage.cost_usd = costUsd;
		if (usage.costUsd == null) usage.costUsd = costUsd;
		if (out.cost_usd == null) out.cost_usd = costUsd;
	}
	if (costNanos != null) {
		const breakdown =
			usage.pricing_breakdown &&
			typeof usage.pricing_breakdown === "object" &&
			!Array.isArray(usage.pricing_breakdown)
				? { ...(usage.pricing_breakdown as Record<string, unknown>) }
				: {};
		if (breakdown.total_nanos == null) breakdown.total_nanos = Math.max(0, Math.round(costNanos));
		if (costUsd != null && breakdown.total_usd_str == null) {
			breakdown.total_usd_str = Math.max(0, costUsd).toFixed(9);
		}
		if (Object.keys(breakdown).length > 0) usage.pricing_breakdown = breakdown;
		if (out.cost_nanos == null) out.cost_nanos = Math.max(0, Math.round(costNanos));
	}
	if (Object.keys(usage).length > 0) out.usage = usage;
	if (durationMs != null && out.duration_ms == null) out.duration_ms = durationMs;

	const metaOut =
		out.meta && typeof out.meta === "object" && !Array.isArray(out.meta)
			? { ...(out.meta as Record<string, unknown>) }
			: {};
	if (durationMs != null && metaOut.duration_ms == null) metaOut.duration_ms = durationMs;
	if (costUsd != null && metaOut.cost_usd == null) metaOut.cost_usd = costUsd;
	if (record?.billedAt && metaOut.billed_at == null) metaOut.billed_at = record.billedAt;
	if (meta?.finalizedAt && metaOut.finalized_at == null) metaOut.finalized_at = meta.finalizedAt;
	if (typeof meta?.charged === "boolean" && metaOut.charged == null) metaOut.charged = meta.charged;
	if (meta?.billingReason && metaOut.billing_reason == null) metaOut.billing_reason = meta.billingReason;
	if (Object.keys(metaOut).length > 0) out.meta = metaOut;

	const providerId =
		typeof out.provider === "string" && out.provider.trim().length > 0
			? out.provider.trim().toLowerCase()
			: typeof record?.provider === "string" && record.provider.trim().length > 0
				? record.provider.trim().toLowerCase()
				: typeof meta?.provider === "string" && meta.provider.trim().length > 0
					? meta.provider.trim().toLowerCase()
					: null;
	const existingStatusDetails =
		out.status_details &&
		typeof out.status_details === "object" &&
		!Array.isArray(out.status_details)
			? { ...(out.status_details as Record<string, unknown>) }
			: {};
	const progress = resolveStatusDetailsProgress(providerId, out);
	existingStatusDetails.progress = progress;
	out.status_details = existingStatusDetails;
	if (providerId !== OPENAI_PROVIDER_ID) {
		out.progress = null;
	} else if (progress != null) {
		out.progress = progress;
	}

	return out;
}

export async function finalizeVideoStatusIfTerminal(args: {
	auth: VideoRouteAuth;
	videoId: string;
	videoMeta: VideoJobMeta | null;
	providerId: string;
	status: "queued" | "in_progress" | "completed" | "failed";
	model?: string | null;
	seconds?: number | null;
	resolution?: string | null;
	quality?: string | null;
	metaPatch?: Record<string, unknown>;
	rawPayload?: unknown;
}): Promise<void> {
	if (args.status !== "completed" && args.status !== "failed") return;
	await finalizeVideoJob({
		teamId: args.auth.teamId,
		videoId: args.videoId,
		providerId: args.providerId,
		status: args.status,
		model: args.model ?? args.videoMeta?.model ?? null,
		seconds: args.seconds ?? args.videoMeta?.seconds ?? null,
		requestOptions: buildVideoPricingRequestOptions({
			resolution: args.resolution ?? args.videoMeta?.resolution ?? null,
			quality: args.quality ?? args.videoMeta?.quality ?? null,
		}),
		isByok: args.videoMeta?.keySource === "byok",
		metaPatch: {
			...(args.metaPatch ?? {}),
			lastPolledAt: new Date().toISOString(),
			polledStatus: args.status,
		},
	});
	dispatchVideoWebhookEventInBackground({
		teamId: args.auth.teamId,
		videoId: args.videoId,
		eventType: args.status === "completed" ? "video.completed" : "video.failed",
	});
}


